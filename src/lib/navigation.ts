/**
 * Slide-to-slide navigation ("where does Next go?") and branching.
 *
 * Each slide has outgoing connections, `slide.next`:
 * - undefined: the default, Next goes to the following slide in the slide list.
 * - []:        no Next (an end point).
 * - [id]:      Next goes to that slide.
 * - [a, b, …]: a branching slide. Next is disabled and the slide gets one
 *              button per connection (auto-generated, `autoBranchTarget`).
 *              Removing connections removes their buttons; dropping back to one
 *              connection removes all of them and Next works again.
 *
 * reconcileBranching() keeps the buttons in step with the connections after
 * every change (it runs inside the course reducer). If the author deletes an
 * auto-generated button on the canvas, that connection is removed too.
 *
 * The exported player (lib/publish/runtime/player.ts) has an ES5 copy of
 * resolveNext() — keep the two in sync.
 */
import type { ShapeElement, Slide, SlideElement } from '@/types/course';
import { themeVarRef } from './themeVars';

/** Where Next goes from slide `index`: the resolved list of target slide ids. */
export function resolveNext(slides: Slide[], index: number): string[] {
  const s = slides[index];
  if (!s) return [];
  if (s.next === undefined) return index + 1 < slides.length ? [slides[index + 1].id] : [];
  const ids = new Set(slides.map((x) => x.id));
  return s.next.filter((id) => ids.has(id));
}

/** Index Next goes to, or -1 when Next is unavailable (end point or branching slide). */
export function nextSlideIndex(slides: Slide[], index: number): number {
  const targets = resolveNext(slides, index);
  if (targets.length !== 1) return -1;
  return slides.findIndex((s) => s.id === targets[0]);
}

export function isBranchingSlide(slide: Slide | undefined): boolean {
  return !!slide && Array.isArray(slide.next) && slide.next.length >= 2;
}

/** Label for a target slide: its title, or "Slide N". */
export function slideLabel(slides: Slide[], id: string): string {
  const i = slides.findIndex((s) => s.id === id);
  if (i < 0) return 'Missing slide';
  return slides[i].title?.trim() || `Slide ${i + 1}`;
}

// ---- auto-generated branch buttons ----------------------------------------

export const BRANCH_BUTTON = { w: 240, h: 60, gap: 24 };

const allElements = (s: Slide): SlideElement[] =>
  s.layers && s.layers.length ? s.layers.flatMap((l) => l.elements) : s.elements;

export function autoButtons(s: Slide): ShapeElement[] {
  return allElements(s).filter((e): e is ShapeElement => e.type === 'shape' && !!(e as ShapeElement).autoBranchTarget);
}

function makeButton(target: string, label: string, x: number, y: number, slideDuration: number): ShapeElement {
  return {
    id: crypto.randomUUID(),
    type: 'shape',
    shapeType: 'rectangle',
    x, y, width: BRANCH_BUTTON.w, height: BRANCH_BUTTON.h,
    startTime: 0, duration: slideDuration,
    triggers: [{ event: 'onClick', action: 'jumpToSlide', targetId: target }],
    animationIn: 'none', animationOut: 'none', entranceDuration: 500, exitDuration: 500,
    fillColor: themeVarRef(0), borderColor: themeVarRef(0), borderWidth: 0,
    hoverFillColor: themeVarRef(1), borderRadius: 12,
    text: label, textColor: '#ffffff', fontSize: 20,
    autoBranchTarget: target,
  };
}

/**
 * Positions for `count` new buttons. With no existing buttons they form a
 * centered row (wrapping if needed) in the middle of the slide; otherwise they
 * continue after the right-most existing button, so moved buttons stay put.
 */
function placeButtons(count: number, existing: ShapeElement[], canvas: { width: number; height: number }) {
  const { w, h, gap } = BRANCH_BUTTON;
  const out: { x: number; y: number }[] = [];
  if (count === 0) return out;
  if (existing.length === 0) {
    const perRow = Math.max(1, Math.floor((canvas.width - 80 + gap) / (w + gap)));
    const rows = Math.ceil(count / perRow);
    const top = Math.round(canvas.height / 2 - (rows * h + (rows - 1) * gap) / 2);
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, count - row * perRow);
      const left = Math.round(canvas.width / 2 - (inRow * w + (inRow - 1) * gap) / 2);
      out.push({ x: left + (i % perRow) * (w + gap), y: top + row * (h + gap) });
    }
    return out;
  }
  const last = existing.reduce((a, b) => (b.x > a.x ? b : a));
  let x = last.x + last.width + gap;
  let y = last.y;
  for (let i = 0; i < count; i++) {
    if (x + w > canvas.width - 20) {
      x = Math.max(20, Math.round(canvas.width / 2 - w / 2));
      y += h + gap;
    }
    out.push({ x, y: Math.min(y, canvas.height - h) });
    x += w + gap;
  }
  return out;
}

/** Remove the auto buttons for which `drop` is true, from every layer. */
function withoutButtons(s: Slide, drop: (b: ShapeElement) => boolean): Slide {
  const keep = (e: SlideElement) => !(e.type === 'shape' && (e as ShapeElement).autoBranchTarget && drop(e as ShapeElement));
  if (s.layers && s.layers.length) {
    const layers = s.layers.map((l) => ({ ...l, elements: l.elements.filter(keep) }));
    return { ...s, layers, elements: layers.flatMap((l) => l.elements) };
  }
  return { ...s, elements: s.elements.filter(keep) };
}

function withButtonsAdded(s: Slide, buttons: ShapeElement[]): Slide {
  if (buttons.length === 0) return s;
  if (s.layers && s.layers.length) {
    // Base layer = the first layer.
    const layers = s.layers.map((l, i) => (i === 0 ? { ...l, elements: [...l.elements, ...buttons] } : l));
    return { ...s, layers, elements: layers.flatMap((l) => l.elements) };
  }
  return { ...s, elements: [...s.elements, ...buttons] };
}

/** Make one slide's auto buttons match its connections. Returns the same object when nothing changes. */
export function syncBranchButtons(s: Slide, slides: Slide[], canvas: { width: number; height: number }): Slide {
  const targets = isBranchingSlide(s) ? s.next! : [];
  const existing = autoButtons(s);
  if (targets.length === 0 && existing.length === 0) return s;

  const wanted = new Set(targets);
  const seen = new Set<string>();
  // Drop buttons whose connection is gone (and duplicates).
  let out = withoutButtons(s, (b) => {
    const dup = seen.has(b.autoBranchTarget!);
    seen.add(b.autoBranchTarget!);
    return !wanted.has(b.autoBranchTarget!) || dup;
  });
  const kept = autoButtons(out);
  const have = new Set(kept.map((b) => b.autoBranchTarget));
  const missing = targets.filter((t) => !have.has(t));
  const spots = placeButtons(missing.length, kept, canvas);
  out = withButtonsAdded(out, missing.map((t, i) => makeButton(t, slideLabel(slides, t), spots[i].x, spots[i].y, s.duration ?? 5000)));
  if (missing.length === 0 && kept.length === existing.length) return s;
  return out;
}

/**
 * Run after every change to the slide list:
 * - connections to deleted slides are removed;
 * - an auto button the author deleted removes its connection;
 * - auto buttons are added or removed to match the connections.
 * Returns `next` itself when nothing needed fixing.
 */
export function reconcileBranching(prev: Slide[], next: Slide[], canvas: { width: number; height: number }): Slide[] {
  const ids = new Set(next.map((s) => s.id));
  const prevById = new Map(prev.map((s) => [s.id, s]));
  let changed = false;
  const out = next.map((s) => {
    const before = prevById.get(s.id);
    if (s.next === undefined && (!before || before === s) && !autoButtons(s).length) return s;
    let slide = s;
    if (slide.next) {
      let targets = slide.next.filter((id) => ids.has(id) && id !== slide.id);
      if (before && before !== s) {
        const nowIds = new Set(allElements(s).map((e) => e.id));
        const deleted = autoButtons(before).filter((b) => !nowIds.has(b.id)).map((b) => b.autoBranchTarget!);
        if (deleted.length) targets = targets.filter((t) => !deleted.includes(t));
      }
      if (targets.length !== slide.next.length) slide = { ...slide, next: targets };
    }
    const synced = syncBranchButtons(slide, next, canvas);
    if (synced !== s) changed = true;
    return synced;
  });
  return changed ? out : next;
}
