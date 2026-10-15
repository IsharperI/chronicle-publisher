/**
 * Player Next/Prev button control (Storyline's "Change state of the player's
 * Next button" trigger).
 *
 * A trigger with action 'setPlayerButton' targets the button named in
 * `targetId` ('next' or 'prev') and puts it in `state`: 'Disabled' turns it
 * off for the rest of the slide, 'Normal' turns it back on. Every slide starts
 * with both buttons on. Course navigation rules (restricted mode, required hubs,
 * first/last slide) still apply on top: this can only turn a button off.
 *
 * 'jumpToPrevious' goes back along the path taken, like the Prev button,
 * whether or not the button is disabled.
 *
 * The published player has a plain-JS copy of these rules (player.ts,
 * `navButtonsOff`); keep the two in step.
 */
import type { Trigger } from '@/types/course';

export type NavButton = 'next' | 'prev';
export type NavButtonsOff = Record<NavButton, boolean>;

export const NAV_BUTTONS_ON: NavButtonsOff = { next: false, prev: false };
export const PLAYER_BUTTON_STATES = ['Normal', 'Disabled'] as const;

/** The button a 'setPlayerButton' trigger targets, or null if it isn't one. */
export function navButtonOf(t: Pick<Trigger, 'action' | 'targetId'>): NavButton | null {
  if (t.action !== 'setPlayerButton') return null;
  return t.targetId === 'prev' ? 'prev' : t.targetId === 'next' ? 'next' : null;
}

/** Whether a state name means the button is off ('Disabled' or 'Hidden'). */
export function isOffState(state: string | undefined): boolean {
  const s = (state ?? '').toLowerCase();
  return s === 'disabled' || s === 'hidden';
}

/** The buttons' new on/off state after a trigger runs (unchanged for other actions). */
export function applyNavButtonTrigger<T extends NavButtonsOff>(off: T, t: Pick<Trigger, 'action' | 'targetId' | 'state'>): T {
  const b = navButtonOf(t);
  if (!b) return off;
  const now = isOffState(t.state);
  return off[b] === now ? off : { ...off, [b]: now };
}

/** Plain-language label used in the trigger list. */
export function navButtonLabel(t: Pick<Trigger, 'action' | 'targetId' | 'state'>): string {
  const b = navButtonOf(t);
  if (!b) return '';
  return `${isOffState(t.state) ? 'Disable' : 'Enable'} the player's ${b === 'next' ? 'Next' : 'Prev'} button`;
}
