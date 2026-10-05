/**
 * Undo / redo for the course store (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z, and the
 * buttons in the ribbon's title bar).
 *
 * withHistory() wraps courseReducer. After each action it compares the saved
 * part of the course (slides, masters, player/course settings, variables;
 * see lib/project.ts) with before: if any of it changed, the previous version
 * is pushed onto the undo stack. Because the store is immutable these
 * snapshots are just references, so 100 steps cost very little memory.
 *
 * - Selection, playhead, preview and other UI actions never create steps.
 * - Nothing is recorded in preview mode (triggers there change element
 *   visibility as the learner clicks).
 * - Rapid changes to the same thing (typing in a text box, nudging a value)
 *   merge into one step, and so do several changes made by one click.
 * - Loading a course starts a fresh history.
 * - Background narration (SET_SLIDE_NARRATION) isn't a step: it's applied to
 *   every saved version too, so undoing an edit never removes voice-over.
 * - Undo/redo restores the course and keeps the UI usable: the active slide
 *   is kept if it still exists and selections that point at deleted elements
 *   are cleared.
 */
import type { CourseState } from '@/types/course';

export const HISTORY_LIMIT = 100;
/** Changes to the same target closer together than this merge into one step. */
export const MERGE_MS = 800;
/** Changes this close together come from one click (e.g. the course tree's "Add slide after") and form one step. */
export const GESTURE_MS = 40;

type Doc = Pick<CourseState, 'slides' | 'masterSlides' | 'playerSettings' | 'courseSettings' | 'variables'>;
interface Step { doc: Doc; label: string; activeSlideIndex: number; viewMode: CourseState['viewMode'] }

export interface HistoryState {
  present: CourseState;
  past: Step[];
  future: Step[];
  /** Merge key and time of the last recorded change. */
  lastKey: string | null;
  lastAt: number;
}

export type HistoryAction = { type: 'UNDO' } | { type: 'REDO' };

const docOf = (s: CourseState): Doc => ({
  slides: s.slides, masterSlides: s.masterSlides, playerSettings: s.playerSettings, courseSettings: s.courseSettings, variables: s.variables,
});
const docChanged = (a: CourseState, b: CourseState) =>
  a.slides !== b.slides || a.masterSlides !== b.masterSlides || a.playerSettings !== b.playerSettings ||
  a.courseSettings !== b.courseSettings || a.variables !== b.variables;

/** Friendly names for the undo/redo tooltips ("Undo Delete slide"). */
const LABELS: Record<string, string> = {
  ADD_SLIDE: 'Add slide', DELETE_SLIDE: 'Delete slide', MOVE_SLIDE: 'Move slide', INSERT_SLIDE: 'Add slide', DUPLICATE_SLIDE: 'Duplicate slide',
  UPDATE_SLIDE: 'Slide change', UPDATE_SLIDE_BY_ID: 'Slide change',
  ADD_ELEMENT: 'Add object', UPDATE_ELEMENT: 'Edit object', DELETE_ELEMENT: 'Delete object', UPDATE_SLIDE_ELEMENT: 'Edit object',
  REPLACE_SLIDE_ELEMENT: 'Place image',
  SET_SLIDE_NEXT: 'Change connection', SET_TREE_POSITIONS: 'Move in course tree',
  SET_SLIDE_GROUP: 'Slide group', RENAME_SLIDE_GROUP: 'Rename slide group',
  ADD_LAYER: 'Add layer', DELETE_LAYER: 'Delete layer', RENAME_LAYER: 'Rename layer', REORDER_LAYERS: 'Reorder layers',
  TOGGLE_LAYER_VISIBILITY: 'Layer visibility', TOGGLE_LAYER_LOCK: 'Lock layer',
  ADD_AUDIO: 'Add audio', DELETE_AUDIO: 'Delete audio',
  ADD_VARIABLE: 'Add variable', UPDATE_VARIABLE: 'Edit variable', DELETE_VARIABLE: 'Delete variable',
};
const labelFor = (type: string) =>
  LABELS[type] ?? type.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** What a change is about, so repeated edits to the same thing merge. */
function mergeKey(action: { type: string } & Record<string, unknown>): string {
  const target = action.id ?? action.slideId ?? action.elementId ?? action.layerId ?? action.index ?? '';
  const fields = action.updates && typeof action.updates === 'object' ? Object.keys(action.updates as object).sort().join(',') : '';
  return `${action.type}:${String(target)}:${fields}`;
}

/** Actions that never create a step of their own. */
const BACKGROUND = new Set(['SET_SLIDE_NARRATION']);

/** Keep the editor pointing at things that still exist after a jump in history. */
function restore(present: CourseState, step: Step): CourseState {
  const next: CourseState = { ...present, ...step.doc, viewMode: step.viewMode };
  const list = next.viewMode === 'master' ? next.masterSlides : next.slides;
  const activeSlideIndex = Math.max(0, Math.min(step.activeSlideIndex, list.length - 1));
  const slide = list[activeSlideIndex];
  const ids = new Set((slide?.layers?.flatMap((l) => l.elements) ?? slide?.elements ?? []).map((e) => e.id));
  const layerIds = new Set(slide?.layers?.map((l) => l.id) ?? []);
  return {
    ...next,
    activeSlideIndex,
    selectedElementIds: present.selectedElementIds.filter((id) => ids.has(id)),
    activeElementId: present.activeElementId && ids.has(present.activeElementId) ? present.activeElementId : null,
    activeLayerId: present.activeLayerId && layerIds.has(present.activeLayerId) ? present.activeLayerId : slide?.layers?.[0]?.id ?? null,
    activeAudioId: null,
  };
}

const stepOf = (s: CourseState, label: string): Step => ({ doc: docOf(s), label, activeSlideIndex: s.activeSlideIndex, viewMode: s.viewMode });

export function withHistory<A extends { type: string }>(reducer: (s: CourseState, a: A) => CourseState) {
  return function historyReducer(h: HistoryState, action: A | HistoryAction): HistoryState {
    if (action.type === 'UNDO') {
      const step = h.past[h.past.length - 1];
      if (!step || h.present.previewMode) return h;
      return {
        present: restore(h.present, step),
        past: h.past.slice(0, -1),
        future: [...h.future, stepOf(h.present, step.label)],
        lastKey: null, lastAt: 0,
      };
    }
    if (action.type === 'REDO') {
      const step = h.future[h.future.length - 1];
      if (!step || h.present.previewMode) return h;
      return {
        present: restore(h.present, step),
        past: [...h.past, stepOf(h.present, step.label)],
        future: h.future.slice(0, -1),
        lastKey: null, lastAt: 0,
      };
    }

    const a = action as A;
    const next = reducer(h.present, a);
    if (next === h.present) return h;
    if (!docChanged(h.present, next) || h.present.previewMode || next.previewMode) return { ...h, present: next };

    if (a.type === 'LOAD_COURSE') return { present: next, past: [], future: [], lastKey: null, lastAt: 0 };

    if (BACKGROUND.has(a.type)) {
      // Apply the same change to every saved version, so undo/redo keep it.
      const rebase = (st: Step): Step => {
        const s = reducer({ ...h.present, ...st.doc }, a);
        return { ...st, doc: docOf(s) };
      };
      return { ...h, present: next, past: h.past.map(rebase), future: h.future.map(rebase) };
    }

    const now = Date.now();
    const key = mergeKey(a as unknown as { type: string } & Record<string, unknown>);
    const sameGesture = now - h.lastAt < GESTURE_MS; // several dispatches from one click
    if (h.past.length && (sameGesture || (key === h.lastKey && now - h.lastAt < MERGE_MS))) {
      // Same thing again moments later (typing), or part of the same click: extend the current step.
      return { ...h, present: next, future: [], lastKey: sameGesture ? h.lastKey : key, lastAt: now };
    }
    const past = [...h.past, stepOf(h.present, labelFor(a.type))].slice(-HISTORY_LIMIT);
    return { present: next, past, future: [], lastKey: key, lastAt: now };
  };
}

export const initialHistory = (present: CourseState): HistoryState => ({ present, past: [], future: [], lastKey: null, lastAt: 0 });
