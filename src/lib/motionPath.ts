/**
 * Motion-path math: cubic-bezier evaluation and default paths for elements.
 * Used by the editor (MotionPathLayer, Canvas). The exported player has its
 * own copy (bezierPt in lib/publish/runtime/player.ts).
 */
import type { BaseElement, MotionPath } from '@/types/course';

/** Cubic bezier point at parameter t (0..1). */
export function bezierPoint(p0: { x: number; y: number }, c1: { x: number; y: number }, c2: { x: number; y: number }, p1: { x: number; y: number }, t: number): { x: number; y: number } {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * c1.x + 3 * u * tt * c2.x + ttt * p1.x,
    y: uuu * p0.y + 3 * uu * t * c1.y + 3 * u * tt * c2.y + ttt * p1.y,
  };
}

/** Build an SVG path "d" string for a motion path. */
export function motionPathToSvgD(mp: MotionPath): string {
  return `M ${mp.startX} ${mp.startY} C ${mp.c1x} ${mp.c1y}, ${mp.c2x} ${mp.c2y}, ${mp.endX} ${mp.endY}`;
}

/**
 * Default motion path for a freshly-activated element. Starts at the element's
 * top-left and ends 200px to the right with a slight curve.
 */
export function defaultMotionPath(el: BaseElement): MotionPath {
  const sx = el.x;
  const sy = el.y;
  const ex = el.x + 200;
  const ey = el.y;
  return {
    startX: sx,
    startY: sy,
    endX: ex,
    endY: ey,
    c1x: sx + 60,
    c1y: sy - 80,
    c2x: ex - 60,
    c2y: ey - 80,
  };
}

/**
 * Compute the (x, y) offset to apply to an element at the given playhead time
 * relative to the slide. Returns null if motion path should not be applied
 * (e.g. before startTime, or no path).
 */
export function motionPathOffset(el: BaseElement, playheadTime: number): { dx: number; dy: number } | null {
  if (!el.motionPath) return null;
  const mp = el.motionPath;
  const dur = (el.motionPathDuration && el.motionPathDuration > 0) ? el.motionPathDuration : (el.duration || 1);
  const t = Math.max(0, Math.min(1, (playheadTime - el.startTime) / dur));
  const p = bezierPoint(
    { x: mp.startX, y: mp.startY },
    { x: mp.c1x, y: mp.c1y },
    { x: mp.c2x, y: mp.c2y },
    { x: mp.endX, y: mp.endY },
    t,
  );
  return { dx: p.x - el.x, dy: p.y - el.y };
}
