/**
 * Entrance and exit animations: their names in the Animations tab, and the
 * CSS that plays them. The editor (Canvas.tsx) and the exported player
 * (publish/runtime/player.ts) both use ANIMATION_CSS and the class names
 * here. Fade and fly left/right are older and also defined in index.css and
 * the player's own CSS; everything else lives only here.
 */
import type { AnimationIn, AnimationOut } from '@/types/course';

interface Anim { label: string; from: string; to: string }

/** Entrances (keyframes go from hidden to shown). */
export const ENTRANCES: Record<Exclude<AnimationIn, 'none' | 'fade' | 'fly-in-left' | 'fly-in-right'>, Anim> = {
  // Like Storyline's Fly In: slides in from beyond the edge of the slide, without fading.
  'fly-in-top': { label: 'Fly In From Top', from: 'transform:translateY(-720px)', to: 'transform:translateY(0)' },
  'fly-in-bottom': { label: 'Fly In From Bottom', from: 'transform:translateY(720px)', to: 'transform:translateY(0)' },
  'wipe-from-left': { label: 'Wipe From Left', from: 'clip-path:inset(0 100% 0 0)', to: 'clip-path:inset(0 0 0 0)' },
  'wipe-from-right': { label: 'Wipe From Right', from: 'clip-path:inset(0 0 0 100%)', to: 'clip-path:inset(0 0 0 0)' },
  'wipe-from-top': { label: 'Wipe From Top', from: 'clip-path:inset(0 0 100% 0)', to: 'clip-path:inset(0 0 0 0)' },
  'wipe-from-bottom': { label: 'Wipe From Bottom', from: 'clip-path:inset(100% 0 0 0)', to: 'clip-path:inset(0 0 0 0)' },
  split: { label: 'Split', from: 'clip-path:inset(0 50% 0 50%)', to: 'clip-path:inset(0 0 0 0)' },
  zoom: { label: 'Zoom In', from: 'opacity:0;transform:scale(0.3)', to: 'opacity:1;transform:scale(1)' },
};

/** Exits (keyframes go from shown to hidden). */
export const EXITS: Record<Exclude<AnimationOut, 'none' | 'fade' | 'fly-out-left' | 'fly-out-right'>, Anim> = {
  'fly-out-top': { label: 'Fly Out To Top', from: 'transform:translateY(0)', to: 'transform:translateY(-720px)' },
  'fly-out-bottom': { label: 'Fly Out To Bottom', from: 'transform:translateY(0)', to: 'transform:translateY(720px)' },
  'wipe-to-left': { label: 'Wipe To Left', from: 'clip-path:inset(0 0 0 0)', to: 'clip-path:inset(0 100% 0 0)' },
  'wipe-to-right': { label: 'Wipe To Right', from: 'clip-path:inset(0 0 0 0)', to: 'clip-path:inset(0 0 0 100%)' },
  'wipe-to-top': { label: 'Wipe To Top', from: 'clip-path:inset(0 0 0 0)', to: 'clip-path:inset(0 0 100% 0)' },
  'wipe-to-bottom': { label: 'Wipe To Bottom', from: 'clip-path:inset(0 0 0 0)', to: 'clip-path:inset(100% 0 0 0)' },
  split: { label: 'Split', from: 'clip-path:inset(0 0 0 0)', to: 'clip-path:inset(0 50% 0 50%)' },
  zoom: { label: 'Zoom Out', from: 'opacity:1;transform:scale(1)', to: 'opacity:0;transform:scale(0.3)' },
};

export const entranceClass = (a: AnimationIn) => (a in ENTRANCES ? `anim-in-${a}` : '');
export const exitClass = (a: AnimationOut) => (a in EXITS ? `anim-out-${a}` : '');

/** Keyframes and classes for the animations above (durations are set per element). */
export const ANIMATION_CSS = [
  ...Object.entries(ENTRANCES).map(([k, a]) => `@keyframes anim-in-${k}{from{${a.from}}to{${a.to}}}.anim-in-${k}{animation:anim-in-${k} .5s ease-out forwards}`),
  ...Object.entries(EXITS).map(([k, a]) => `@keyframes anim-out-${k}{from{${a.from}}to{${a.to}}}.anim-out-${k}{animation:anim-out-${k} .5s ease-in forwards}`),
].join('\n');
