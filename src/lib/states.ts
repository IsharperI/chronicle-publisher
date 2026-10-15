/**
 * Object states (as in Storyline): an element can have extra looks — Hover,
 * Down, Selected, Visited, Disabled, Hidden or any custom name — each stored as
 * the properties that differ from the element's own (Normal) look.
 *
 * Built-in states behave automatically during playback:
 *   Hover / Down  shown while the pointer is over / pressing the element
 *   Selected      toggled by clicking (one per button set)
 *   Visited       set once the element has been clicked
 *   Disabled      the element ignores clicks and hover
 *   Hidden        the element isn't shown
 * Any state can also be set by a "Change state" trigger.
 *
 * The exported player (lib/publish/runtime/player.ts) has a plain-JS copy of
 * shownState/clickState; keep them in step (tests cover both).
 */
import type { ElementState, SlideElement, StateLook } from '@/types/course';

export const NORMAL = 'Normal';
export const BUILT_IN_STATES = ['Normal', 'Hover', 'Down', 'Selected', 'Visited', 'Disabled', 'Hidden'] as const;

/** Element properties a state can change. Position, size and timing stay with the element. */
export const LOOK_KEYS = [
  'content', 'textColor', 'backgroundColor', 'fontSize', 'fontWeight',
  'fillColor', 'borderColor', 'borderWidth', 'text', 'boxShadow', 'borderRadius',
  'src', 'fit',
] as const;
export type LookKey = (typeof LOOK_KEYS)[number];

export function isLookKey(key: string): key is LookKey {
  return (LOOK_KEYS as readonly string[]).includes(key);
}

export function stateNames(el: Pick<SlideElement, 'states'>): string[] {
  return [NORMAL, ...(el.states ?? []).map((s) => s.name)];
}

export function hasState(el: Pick<SlideElement, 'states'>, name: string): boolean {
  return name === NORMAL || !!el.states?.some((s) => s.name === name);
}

export function findState(el: Pick<SlideElement, 'states'>, name: string): ElementState | undefined {
  return el.states?.find((s) => s.name === name);
}

/** The state an element is in when its slide starts. */
export function initialStateOf(el: Pick<SlideElement, 'states' | 'initialState'>): string {
  return el.initialState && hasState(el, el.initialState) ? el.initialState : NORMAL;
}

/** The element drawn in the given state (its own properties with the state's changes on top). */
export function withState<T extends SlideElement>(el: T, name: string | undefined): T {
  if (!name || name === NORMAL) return el;
  const look = findState(el, name)?.look;
  return look && Object.keys(look).length ? ({ ...el, ...look } as T) : el;
}

/**
 * Which state to draw: the element's current state, or Hover/Down while the
 * pointer is on it. A selected element uses "Hover Selected"/"Down Selected"
 * when it has them (Storyline's combined states) and otherwise stays Selected.
 */
export function shownState(el: Pick<SlideElement, 'states'>, current: string, pointer: { hover?: boolean; down?: boolean }): string {
  if (current === 'Hidden' || current === 'Disabled') return current;
  const transient = pointer.down ? 'Down' : pointer.hover ? 'Hover' : null;
  if (!transient) return current;
  const combined = `${transient} ${current}`;
  if (current !== NORMAL && hasState(el, combined)) return combined;
  if (current === NORMAL || current === 'Visited') {
    if (hasState(el, transient)) return transient;
    if (transient === 'Down' && hasState(el, 'Hover')) return 'Hover';
  }
  return current;
}

/** True when clicking the element changes its state (so it should look clickable). */
export function reactsToClick(el: Pick<SlideElement, 'states'>): boolean {
  return hasState(el, 'Selected') || hasState(el, 'Visited');
}

/**
 * State changes caused by clicking `el` (built-in Selected/Visited behaviour).
 * Returns element id → new state. `current` gives every element's state and
 * `slideEls` the elements on the slide (for button sets).
 */
export function clickState(
  el: Pick<SlideElement, 'id' | 'states' | 'buttonSet'>,
  current: Record<string, string>,
  slideEls: Pick<SlideElement, 'id' | 'states' | 'buttonSet'>[],
): Record<string, string> {
  const now = current[el.id] ?? NORMAL;
  if (now === 'Disabled' || now === 'Hidden') return {};
  const out: Record<string, string> = {};
  if (hasState(el, 'Selected')) {
    if (now === 'Selected') {
      // Clicking a selected element clears it, unless it's in a button set (radio buttons stay on).
      if (!el.buttonSet) out[el.id] = hasState(el, 'Visited') ? 'Visited' : NORMAL;
    } else {
      out[el.id] = 'Selected';
      if (el.buttonSet) {
        for (const other of slideEls) {
          if (other.id !== el.id && other.buttonSet === el.buttonSet && current[other.id] === 'Selected') {
            out[other.id] = NORMAL;
          }
        }
      }
    }
  } else if (hasState(el, 'Visited') && now === NORMAL) {
    out[el.id] = 'Visited';
  }
  return out;
}

/** "When the state of … changes" trigger test: are the watched elements in (or not in) the state? */
export function watchHolds(
  watch: { ids: string[]; state: string; not?: boolean; any?: boolean },
  current: Record<string, string>,
): boolean {
  if (!watch.ids.length) return false;
  const test = (id: string) => ((current[id] ?? NORMAL) === watch.state) !== !!watch.not;
  return watch.any ? watch.ids.some(test) : watch.ids.every(test);
}

/**
 * Hover colours from courses made before states existed become a Hover
 * state. Returns that state's look (null when the element had none).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hoverToState(raw: any): { look: StateLook | null } {
  const look: StateLook = {};
  if (typeof raw?.hoverFillColor === 'string') look.fillColor = raw.hoverFillColor;
  if (typeof raw?.hoverBorderColor === 'string') look.borderColor = raw.hoverBorderColor;
  if (typeof raw?.hoverTextColor === 'string') look.textColor = raw.hoverTextColor;
  if (typeof raw?.hoverBackgroundColor === 'string') look.backgroundColor = raw.hoverBackgroundColor;
  return { look: Object.keys(look).length ? look : null };
}

/** Adds (or updates) a state's look on an element, returning the new states list. */
export function setStateLook(el: Pick<SlideElement, 'states'>, name: string, look: StateLook): ElementState[] {
  const list = [...(el.states ?? [])];
  const i = list.findIndex((s) => s.name === name);
  if (i >= 0) list[i] = { ...list[i], look: { ...list[i].look, ...look } };
  else list.push({ name, look });
  return list;
}

/**
 * Splits an element update made while editing a state: properties a state can
 * hold go into that state's look, everything else (position, size…) onto the element.
 */
export function routeStateEdit<T extends SlideElement>(el: T, stateName: string, updates: Partial<SlideElement>): T {
  const look: StateLook = {};
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (isLookKey(k)) (look as Record<string, unknown>)[k] = v;
    else rest[k] = v;
  }
  const next = { ...el, ...rest } as T;
  if (Object.keys(look).length) next.states = setStateLook(el, stateName, look);
  return next;
}

/**
 * Objects placed inside another object's states show only while that object
 * is drawn in one of their states. `parentShown` is the parent's drawn state
 * (undefined when the parent isn't on the slide).
 */
export function childShown(el: Pick<SlideElement, 'stateParent'>, parentShown: string | undefined): boolean {
  if (!el.stateParent) return true;
  return parentShown != null && parentShown !== 'Hidden' && el.stateParent.states.includes(parentShown);
}

/** Elements as a learner first sees them: in their initial states, without Hidden ones (or objects inside states not shown). */
export function atSlideStart<T extends SlideElement>(els: T[]): T[] {
  const start = new Map(els.map((e) => [e.id, initialStateOf(e)]));
  return els
    .filter((e) => start.get(e.id) !== 'Hidden' && childShown(e, e.stateParent ? start.get(e.stateParent.id) : undefined))
    .map((e) => withState(e, start.get(e.id)));
}
