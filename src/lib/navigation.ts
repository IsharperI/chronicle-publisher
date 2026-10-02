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
  // Continue after the right-most button, wrapping to new rows, and never on
  // top of another button (the author may have moved them anywhere).
  const taken: { x: number; y: number; w: number; h: number }[] = existing.map((e) => ({ x: e.x, y: e.y, w: e.width, h: e.height }));
  const free = (x: number, y: number) => !taken.some((r) => x < r.x + r.w + 8 && x + w + 8 > r.x && y < r.y + r.h + 8 && y + h + 8 > r.y);
  const last = existing.reduce((a, b) => (b.x > a.x ? b : a));
  let x = last.x + last.width + gap;
  let y = last.y;
  for (let i = 0; i < count; i++) {
    for (let guard = 0; guard < 2000; guard++) {
      if (x + w > canvas.width - 20) {
        x = 20;
        y += h + gap;
        if (y + h > canvas.height) y = 20;
      }
      if (free(x, y)) break;
      x += 20;
    }
    out.push({ x, y });
    taken.push({ x, y, w, h });
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

/**
 * Make one slide's auto buttons match its connections. Returns the same object
 * when nothing changes.
 *
 * When a connection is re-pointed (one target swapped for another in the same
 * change), the existing button is reused: same position and style, new
 * target, and a new label unless the author renamed it.
 */
export function syncBranchButtons(s: Slide, slides: Slide[], canvas: { width: number; height: number }): Slide {
  const targets = isBranchingSlide(s) ? s.next! : [];
  const existing = autoButtons(s);
  if (targets.length === 0 && existing.length === 0) return s;

  const wanted = new Set(targets);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const b of existing) {
    if (seen.has(b.autoBranchTarget!)) duplicates.add(b.id);
    seen.add(b.autoBranchTarget!);
  }
  const covered = new Set(existing.filter((b) => !duplicates.has(b.id) && wanted.has(b.autoBranchTarget!)).map((b) => b.autoBranchTarget!));
  const missing = targets.filter((t) => !covered.has(t));
  const orphans = existing.filter((b) => !duplicates.has(b.id) && !wanted.has(b.autoBranchTarget!));
  if (missing.length === 0 && orphans.length === 0 && duplicates.size === 0) return unstackButtons(s, canvas);

  // Re-point orphaned buttons at the new targets, in order.
  const reuse = new Map<string, string>(); // button id → new target
  orphans.slice(0, missing.length).forEach((b, i) => reuse.set(b.id, missing[i]));
  const stillMissing = missing.slice(reuse.size);

  const update = (e: SlideElement): SlideElement => {
    const nt = reuse.get(e.id);
    if (!nt) return e;
    const b = e as ShapeElement;
    const old = b.autoBranchTarget!;
    const renamed = (b.text ?? '').trim() !== slideLabel(slides, old);
    return {
      ...b,
      autoBranchTarget: nt,
      text: renamed ? b.text : slideLabel(slides, nt),
      triggers: b.triggers.map((t) => (t.action === 'jumpToSlide' && t.targetId === old ? { ...t, targetId: nt } : t)),
    };
  };
  let out: Slide = s.layers && s.layers.length
    ? (() => {
        const layers = s.layers!.map((l) => ({ ...l, elements: l.elements.map(update) }));
        return { ...s, layers, elements: layers.flatMap((l) => l.elements) };
      })()
    : { ...s, elements: s.elements.map(update) };

  // Drop duplicates and buttons whose connection is gone.
  out = withoutButtons(out, (b) => duplicates.has(b.id) || (!reuse.has(b.id) && !wanted.has(b.autoBranchTarget!)));
  const kept = autoButtons(out);
  const spots = placeButtons(stillMissing.length, kept, canvas);
  return unstackButtons(withButtonsAdded(out, stillMissing.map((t, i) => makeButton(t, slideLabel(slides, t), spots[i].x, spots[i].y, s.duration ?? 5000))), canvas);
}

/**
 * Branch buttons sitting exactly on top of each other hide one another (an
 * older version could stack them). Move all but the first to a free spot.
 */
function unstackButtons(s: Slide, canvas: { width: number; height: number }): Slide {
  const buttons = autoButtons(s);
  const seen = new Set<string>();
  const stacked: ShapeElement[] = [];
  for (const b of buttons) {
    const key = `${Math.round(b.x)},${Math.round(b.y)}`;
    if (seen.has(key)) stacked.push(b);
    seen.add(key);
  }
  if (!stacked.length) return s;
  const fixedIds = new Set(stacked.map((b) => b.id));
  const spots = placeButtons(stacked.length, buttons.filter((b) => !fixedIds.has(b.id)), canvas);
  const moveTo = new Map(stacked.map((b, i) => [b.id, spots[i]]));
  const move = (e: SlideElement): SlideElement => (moveTo.has(e.id) ? ({ ...e, ...moveTo.get(e.id)! } as SlideElement) : e);
  if (s.layers && s.layers.length) {
    const layers = s.layers.map((l) => ({ ...l, elements: l.elements.map(move) }));
    return { ...s, layers, elements: layers.flatMap((l) => l.elements) };
  }
  return { ...s, elements: s.elements.map(move) };
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
