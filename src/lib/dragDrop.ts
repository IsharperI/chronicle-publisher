/**
 * Drag and drop (as in Storyline's freeform drag-and-drop).
 *
 * An object with `drag` can be dragged by the learner during playback. An
 * object with `dropTarget` accepts it: an object counts as dropped on a target
 * when its centre is let go over that target. Then:
 *   - it lands on the target (centred, tiled, or where it was let go)
 *   - it takes its Drop Correct / Drop Incorrect state when it has one and the
 *     author picked its correct target(s) (and isn't holding the result until
 *     submit), otherwise its Dropped state if it has one
 *   - its "when dropped on" triggers run
 * Let go anywhere else (or on a full "only one" target), it goes back to where
 * it started (unless `returnIfMissed` is false), clears any drop state, and its
 * "when dropped anywhere else" triggers run.
 * A target shows its Drag Over state while an object is held over it, and the
 * object's "when dragged over" triggers run on entering it.
 *
 * The exported player (lib/publish/runtime/player.ts) has a plain-JS copy of
 * targetUnder/landing/dropOutcome; keep them in step (tests cover both).
 */
import type { SlideElement, Trigger } from '@/types/course';
import { hasState, NORMAL } from './states';

export const DRAG_OVER = 'Drag Over';
export const DROP_CORRECT = 'Drop Correct';
export const DROP_INCORRECT = 'Drop Incorrect';
export const DROPPED = 'Dropped';
/** States set by dropping (cleared when the object goes back to its start). */
export const DROP_STATES = [DROPPED, DROP_CORRECT, DROP_INCORRECT];
/** Built-in drag-and-drop states the States panel offers. */
export const DRAG_STATE_NAMES = [DRAG_OVER, DROPPED, DROP_CORRECT, DROP_INCORRECT] as const;

export const DRAG_EVENTS = ['onDrop', 'onDropOutside', 'onDragOver'] as const;

type Box = Pick<SlideElement, 'id' | 'x' | 'y' | 'width' | 'height'>;
type Item = Box & Pick<SlideElement, 'drag' | 'states' | 'triggers'>;
type Target = Box & Pick<SlideElement, 'dropTarget'>;
export interface Point { x: number; y: number }

export const isDraggable = (el: Pick<SlideElement, 'drag'>) => !!el.drag;
export const isDropTarget = (el: Pick<SlideElement, 'dropTarget'>) => !!el.dropTarget;

/**
 * The drop target under a dragged object's centre (the topmost one; `targets`
 * are in stacking order, bottom first). `at` is the object's current top-left.
 */
export function targetUnder(item: Box, at: Point, targets: Target[]): string | null {
  const cx = at.x + item.width / 2, cy = at.y + item.height / 2;
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i];
    if (t.id === item.id || !t.dropTarget) continue;
    if (cx >= t.x && cx <= t.x + t.width && cy >= t.y && cy <= t.y + t.height) return t.id;
  }
  return null;
}

/** Where an object lands on a target: `index` is how many objects were already on it. */
export function landing(item: Box, target: Target, index: number, at: Point): Point {
  const snap = target.dropTarget?.snap ?? 'center';
  if (snap === 'free') return { x: Math.round(at.x), y: Math.round(at.y) };
  if (snap === 'tile') {
    const cols = Math.max(1, Math.floor(target.width / Math.max(1, item.width)));
    const col = index % cols, row = Math.floor(index / cols);
    const left = target.x + Math.max(0, (target.width - cols * item.width) / 2);
    return { x: Math.round(left + col * item.width), y: Math.round(target.y + row * item.height) };
  }
  return { x: Math.round(target.x + (target.width - item.width) / 2), y: Math.round(target.y + (target.height - item.height) / 2) };
}

/** Does a drag trigger's target list include this target? (Empty means any target.) */
export function triggerMatchesTarget(t: Pick<Trigger, 'dropTargets'>, targetId: string): boolean {
  return !t.dropTargets?.length || t.dropTargets.includes(targetId);
}

export interface DropOutcome {
  /** The target it was dropped on (null when it missed). */
  target: string | null;
  /** Its new top-left. */
  pos: Point;
  /** State changes to apply (element id → state). */
  states: Record<string, string>;
  /** Its triggers to run. */
  triggers: Trigger[];
}

/**
 * What happens when `item` is let go with its top-left at `at`.
 * `on` maps each dragged object to the target it's sitting on (null or missing: none);
 * `current` gives every element's state.
 */
export function dropOutcome(
  item: Item, at: Point, targets: Target[], on: Record<string, string | null>, current: Record<string, string>,
): DropOutcome {
  let target = targetUnder(item, at, targets);
  const t = target ? targets.find((x) => x.id === target) : undefined;
  const others = target ? Object.keys(on).filter((id) => id !== item.id && on[id] === target).length : 0;
  if (t?.dropTarget?.onlyOne && others > 0) target = null;
  const states: Record<string, string> = {};
  const now = current[item.id] ?? NORMAL;
  if (target && t) {
    const correct = item.drag?.correctTargets;
    let next: string | null = null;
    if (correct?.length && !item.drag?.holdResult && hasState(item, correct.includes(target) ? DROP_CORRECT : DROP_INCORRECT)) {
      next = correct.includes(target) ? DROP_CORRECT : DROP_INCORRECT;
    } else if (hasState(item, DROPPED)) next = DROPPED;
    if (next && next !== now && now !== 'Disabled' && now !== 'Hidden') states[item.id] = next;
    return {
      target, pos: landing(item, t, others, at), states,
      triggers: (item.triggers ?? []).filter((x) => x.event === 'onDrop' && triggerMatchesTarget(x, target!)),
    };
  }
  const back = item.drag?.returnIfMissed !== false;
  if (back && DROP_STATES.includes(now)) states[item.id] = NORMAL;
  return {
    target: null,
    pos: back ? { x: item.x, y: item.y } : { x: Math.round(at.x), y: Math.round(at.y) },
    states,
    triggers: (item.triggers ?? []).filter((x) => x.event === 'onDropOutside'),
  };
}

/** The item's "when dragged over" triggers to run when it moves from one target (or none) to another. */
export function dragOverTriggers(item: Pick<SlideElement, 'triggers'>, from: string | null, to: string | null): Trigger[] {
  if (!to || to === from) return [];
  return (item.triggers ?? []).filter((x) => x.event === 'onDragOver' && triggerMatchesTarget(x, to));
}

/** The state to draw a target in while an object is held over it (null: no change). */
export function dragOverState(el: Pick<SlideElement, 'states'>, current: string): string | null {
  if (current === 'Hidden' || current === 'Disabled') return null;
  return hasState(el, DRAG_OVER) ? DRAG_OVER : null;
}

/** Plain-language description of a drag trigger's event, for the trigger list. */
export function dragEventLabel(t: Pick<Trigger, 'event' | 'dropTargets'>, nameOf: (id: string) => string): string {
  const list = t.dropTargets?.length ? t.dropTargets.map(nameOf).join(' or ') : 'any drop target';
  if (t.event === 'onDrop') return `When dropped on ${list}`;
  if (t.event === 'onDragOver') return `When dragged over ${list}`;
  if (t.event === 'onDropOutside') return 'When dropped anywhere else';
  return '';
}

/**
 * Makes the objects that drag triggers mention draggable and drop targets
 * (Storyline marks them this way). Returns the elements, changed where needed.
 */
export function inferDragRoles<T extends SlideElement>(els: T[]): T[] {
  const targets = new Set<string>();
  const items = new Set<string>();
  for (const el of els) {
    for (const t of el.triggers ?? []) {
      if (!(DRAG_EVENTS as readonly string[]).includes(t.event)) continue;
      items.add(el.id);
      t.dropTargets?.forEach((id) => targets.add(id));
    }
  }
  return els.map((el) => {
    const drag = items.has(el.id) && !el.drag ? { drag: {} } : {};
    const drop = targets.has(el.id) && !el.dropTarget ? { dropTarget: {} } : {};
    return Object.keys(drag).length || Object.keys(drop).length ? { ...el, ...drag, ...drop } : el;
  });
}
