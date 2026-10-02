/**
 * The course tree (View → Course Tree): graph, layout and editing rules.
 * Pure functions, used by StoryViewOverlay.tsx and unit-tested.
 *
 * - Arrows ("next" edges) are the slides' Next connections (lib/navigation.ts):
 *   one per branch on a branching slide, labelled with its button's text.
 *   These can be drawn, re-pointed and deleted in the tree.
 * - Dashed arrows ("jump" edges) come from other Jump to Slide triggers and
 *   quiz feedback; they're edited on the slide itself, not in the tree.
 * - Box positions are saved per slide (`slide.treePos`). Slides without one
 *   get a position from autoLayout(), or next to their predecessor once the
 *   author has arranged the tree.
 */
import type { ShapeElement, Slide, SlideElement } from '@/types/course';
import { autoButtons, isBranchingSlide, isHub, resolveNext } from './navigation';

export const NODE_W = 180;
export const NODE_H = 90;
export const COL_GAP = 60;
export const ROW_GAP = 90;
const ORIGIN = 80;

export type NodeShape = 'rect' | 'diamond' | 'circle' | 'results';
export interface Pos { x: number; y: number }

export interface TreeEdge {
  from: string;
  to: string;
  kind: 'next' | 'jump';
  label?: string;
  /** For branch edges: the auto button that carries this connection. */
  buttonId?: string;
  /** A hub's Continue arrow (where its Next button goes). */
  continue?: boolean;
}

const elementsOf = (s: Slide): SlideElement[] =>
  s.layers && s.layers.length ? s.layers.flatMap((l) => l.elements) : s.elements;

function elementLabel(el: SlideElement, idx: number): string {
  const clip = (t: string) => (t.length > 24 ? t.slice(0, 24) + '…' : t);
  if (el.type === 'text') {
    const t = String((el as { content?: string }).content ?? '').replace(/<[^>]+>/g, '').trim();
    if (t) return clip(t);
  }
  if (el.type === 'shape') {
    const t = String((el as ShapeElement).text ?? '').trim();
    if (t) return clip(t);
    return `Shape ${idx + 1}`;
  }
  if (el.type === 'checkbox') return (el as { label?: string }).label || `Checkbox ${idx + 1}`;
  const name = el.type.charAt(0).toUpperCase() + el.type.slice(1);
  return `${name} ${idx + 1}`;
}

export function nodeShape(s: Slide): NodeShape {
  if (s.slideType === 'results') return 'results';
  if (s.slideType === 'quiz') return 'circle';
  if (isBranchingSlide(s)) return 'diamond';
  const jumps = elementsOf(s).some((el) => !(el as ShapeElement).autoBranchTarget && el.triggers?.some((t) => t.action === 'jumpToSlide'));
  return jumps ? 'diamond' : 'rect';
}

/** All arrows in the tree. */
export function buildEdges(slides: Slide[]): TreeEdge[] {
  const ids = new Set(slides.map((s) => s.id));
  const edges: TreeEdge[] = [];
  slides.forEach((s, i) => {
    if (isBranchingSlide(s)) {
      const buttons = new Map(autoButtons(s).map((b) => [b.autoBranchTarget!, b]));
      for (const t of resolveNext(slides, i)) {
        const b = buttons.get(t);
        edges.push({ from: s.id, to: t, kind: 'next', label: b?.text?.trim() || undefined, buttonId: b?.id });
      }
      if (isHub(s) && s.continueTo && ids.has(s.continueTo)) {
        edges.push({ from: s.id, to: s.continueTo, kind: 'next', continue: true, label: s.branchMode === 'required' ? 'Continue (after all branches)' : 'Continue' });
      }
    } else {
      for (const t of resolveNext(slides, i)) edges.push({ from: s.id, to: t, kind: 'next' });
    }
    elementsOf(s).forEach((el, ei) => {
      if ((el as ShapeElement).autoBranchTarget) return;
      for (const t of el.triggers ?? []) {
        if (t.action === 'jumpToSlide' && ids.has(t.targetId) && t.targetId !== s.id) {
          edges.push({ from: s.id, to: t.targetId, kind: 'jump', label: elementLabel(el, ei) });
        }
      }
    });
    const q = s.quiz as { correctFeedback?: { mode?: string; targetSlideId?: string }; incorrectFeedback?: { mode?: string; targetSlideId?: string }; skipTargetSlideId?: string } | undefined;
    for (const fb of [q?.correctFeedback, q?.incorrectFeedback]) {
      if (fb?.mode === 'jumpToSlide' && fb.targetSlideId && ids.has(fb.targetSlideId)) {
        edges.push({ from: s.id, to: fb.targetSlideId, kind: 'jump', label: 'Quiz feedback' });
      }
    }
    if (q?.skipTargetSlideId && ids.has(q.skipTargetSlideId)) edges.push({ from: s.id, to: q.skipTargetSlideId, kind: 'jump', label: 'Skip' });
  });
  return edges;
}

/**
 * Tidy layout: each slide goes one row below the first slide that leads to it
 * (top to bottom from slide 1), and slides sharing a row are spread out, each
 * as close as possible to the slides that lead to it. Branches therefore fan
 * out side by side under their branching slide, like Storyline's story view.
 */
export function autoLayout(slides: Slide[], edges: TreeEdge[] = buildEdges(slides)): Record<string, Pos> {
  const out: Record<string, Pos> = {};
  if (!slides.length) return out;
  const index = new Map(slides.map((s, i) => [s.id, i]));
  const children = new Map<string, string[]>();
  for (const e of edges) {
    const list = children.get(e.from) ?? [];
    if (!list.includes(e.to)) list.push(e.to);
    children.set(e.from, list);
  }
  // Depth by breadth-first search; branch order follows the arrows.
  const depth = new Map<string, number>();
  const parents = new Map<string, string[]>();
  const order: string[] = [];
  const visit = (start: string, d: number) => {
    const queue: string[] = [start];
    depth.set(start, d);
    while (queue.length) {
      const id = queue.shift()!;
      order.push(id);
      for (const c of children.get(id) ?? []) {
        if (!depth.has(c)) {
          depth.set(c, depth.get(id)! + 1);
          queue.push(c);
        }
        if (depth.get(c)! === depth.get(id)! + 1) parents.set(c, [...(parents.get(c) ?? []), id]);
      }
    }
  };
  visit(slides[0].id, 0);
  // Slides nothing leads to: start a new column of their own below the rest.
  for (const s of slides) {
    if (depth.has(s.id)) continue;
    const prev = slides[index.get(s.id)! - 1];
    visit(s.id, prev ? (depth.get(prev.id) ?? 0) + 1 : 0);
  }

  const rows = new Map<number, string[]>();
  for (const id of order) {
    const d = depth.get(id)!;
    rows.set(d, [...(rows.get(d) ?? []), id]);
  }
  const step = NODE_W + COL_GAP;
  const sortedDepths = [...rows.keys()].sort((a, b) => a - b);
  for (const d of sortedDepths) {
    const row = rows.get(d)!;
    // Preferred x: under the parents, siblings spread around that point.
    const want = new Map<string, number>();
    const byParent = new Map<string, string[]>();
    for (const id of row) {
      const p = (parents.get(id) ?? []).find((pid) => out[pid]);
      const key = p ?? '';
      byParent.set(key, [...(byParent.get(key) ?? []), id]);
    }
    for (const [p, kids] of byParent) {
      const center = p ? out[p].x : ORIGIN;
      kids.forEach((id, k) => want.set(id, center + (k - (kids.length - 1) / 2) * step));
    }
    const placed = [...row].sort((a, b) => want.get(a)! - want.get(b)! || index.get(a)! - index.get(b)!);
    // Resolve overlaps left to right, then shift the group to stay centered.
    const xs: number[] = [];
    placed.forEach((id, k) => {
      const x = want.get(id)!;
      xs.push(k === 0 ? x : Math.max(x, xs[k - 1] + step));
    });
    const drift = xs.reduce((a, x, k) => a + (x - want.get(placed[k])!), 0) / xs.length;
    placed.forEach((id, k) => {
      out[id] = { x: Math.round(xs[k] - drift), y: ORIGIN + d * (NODE_H + ROW_GAP) };
    });
  }
  // Keep everything on-canvas: shift so the left-most box sits at ORIGIN.
  const minX = Math.min(...Object.values(out).map((p) => p.x));
  for (const id of Object.keys(out)) out[id] = { x: out[id].x - minX + ORIGIN, y: out[id].y };
  return out;
}

const overlaps = (a: Pos, b: Pos) => Math.abs(a.x - b.x) < NODE_W + 20 && Math.abs(a.y - b.y) < NODE_H + 20;

/** First free spot at or to the right of `want`. */
export function freeSpot(want: Pos, taken: Pos[]): Pos {
  const p = { ...want };
  for (let i = 0; i < 200 && taken.some((t) => overlaps(t, p)); i++) p.x += NODE_W + COL_GAP;
  return p;
}

/**
 * Where each box is drawn. Uses saved positions; if none are saved the whole
 * tree is auto-laid out; slides added after the author arranged the tree are
 * placed below the slide before them in the slide list.
 */
export function treePositions(slides: Slide[], edges: TreeEdge[] = buildEdges(slides)): Record<string, Pos> {
  if (!slides.some((s) => s.treePos)) return autoLayout(slides, edges);
  const out: Record<string, Pos> = {};
  for (const s of slides) if (s.treePos) out[s.id] = { ...s.treePos };
  slides.forEach((s, i) => {
    if (out[s.id]) return;
    const from = edges.find((e) => e.to === s.id && out[e.from]);
    const anchor = from ? out[from.from] : i > 0 ? out[slides[i - 1].id] : { x: ORIGIN, y: ORIGIN - NODE_H - ROW_GAP };
    out[s.id] = freeSpot({ x: anchor.x, y: anchor.y + NODE_H + ROW_GAP }, Object.values(out));
  });
  return out;
}

// ---- editing connections ----------------------------------------------------

/** The `next` value after adding a connection from slide `from` to `to` (null = no change). */
export function connectNext(slides: Slide[], from: string, to: string): string[] | undefined | null {
  const i = slides.findIndex((s) => s.id === from);
  if (i < 0 || from === to) return null;
  const targets = resolveNext(slides, i);
  if (targets.includes(to)) return null;
  return normalizeNext(slides, i, [...targets, to]);
}

/** The `next` value after removing the connection `from` → `to` (null = no change). */
export function disconnectNext(slides: Slide[], from: string, to: string): string[] | undefined | null {
  const i = slides.findIndex((s) => s.id === from);
  if (i < 0) return null;
  const targets = resolveNext(slides, i);
  if (!targets.includes(to)) return null;
  return normalizeNext(slides, i, targets.filter((t) => t !== to));
}

/** The `next` value after re-pointing the connection `from` → `oldTo` at `newTo` (null = no change). */
export function retargetNext(slides: Slide[], from: string, oldTo: string, newTo: string): string[] | undefined | null {
  const i = slides.findIndex((s) => s.id === from);
  if (i < 0 || oldTo === newTo || from === newTo) return null;
  const targets = resolveNext(slides, i);
  if (!targets.includes(oldTo)) return null;
  const next = targets.includes(newTo) ? targets.filter((t) => t !== oldTo) : targets.map((t) => (t === oldTo ? newTo : t));
  return normalizeNext(slides, i, next);
}

/** A single connection to the following slide is stored as the default (omitted), so it follows reordering. */
function normalizeNext(slides: Slide[], i: number, next: string[]): string[] | undefined {
  if (next.length === 1 && slides[i + 1]?.id === next[0]) return undefined;
  return next;
}

// ---- arrow geometry -----------------------------------------------------------

export interface EdgeGeometry { d: string; mid: Pos; end: Pos }

/** Smooth arrow between two boxes (top-left corners), choosing sensible sides. */
export function edgeGeometry(a: Pos, b: Pos, bend = 0): EdgeGeometry {
  const w = NODE_W, h = NODE_H;
  const acx = a.x + w / 2, bcx = b.x + w / 2;
  let p0: Pos, c1: Pos, c2: Pos, p3: Pos;
  if (b.y >= a.y + h + 10) {
    // Target below: bottom → top.
    p0 = { x: acx + bend, y: a.y + h };
    p3 = { x: bcx + bend, y: b.y };
    const k = Math.max(40, (p3.y - p0.y) / 2);
    c1 = { x: p0.x, y: p0.y + k };
    c2 = { x: p3.x, y: p3.y - k };
  } else if (b.y + h <= a.y - 10) {
    // Target above (e.g. back to a hub): leave from the side facing it, enter its side.
    const right = bcx >= acx;
    const sideIn = Math.abs(bcx - acx) < w ? 'right' : right ? 'left' : 'right';
    p0 = { x: right ? a.x + w : a.x, y: a.y + h / 2 + bend };
    p3 = { x: sideIn === 'right' ? b.x + w : b.x, y: b.y + h / 2 + bend };
    const out = right ? 1 : -1;
    const inn = sideIn === 'right' ? 1 : -1;
    const k = Math.max(60, Math.abs(p3.x - p0.x) / 2);
    c1 = { x: p0.x + out * k, y: p0.y };
    c2 = { x: p3.x + inn * k, y: p3.y };
  } else {
    // Side by side.
    const right = bcx >= acx;
    p0 = { x: right ? a.x + w : a.x, y: a.y + h / 2 + bend };
    p3 = { x: right ? b.x : b.x + w, y: b.y + h / 2 + bend };
    const k = Math.max(30, Math.abs(p3.x - p0.x) / 2);
    c1 = { x: p0.x + (right ? k : -k), y: p0.y };
    c2 = { x: p3.x + (right ? -k : k), y: p3.y };
  }
  const at = (t: number) => {
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
    };
  };
  return { d: `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p3.x} ${p3.y}`, mid: at(0.5), end: p3 };
}
