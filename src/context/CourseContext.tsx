/**
 * The course store: one React context + useReducer holding the entire
 * CourseState (types/course.ts).
 *
 * - Every change goes through `courseReducer` via dispatch({ type, ... }).
 * - Slides store elements in `layers`, the source of truth. `slide.elements` is
 *   a flattened copy rebuilt by the helpers below (ensureLayers,
 *   rebuildElements, mapElementsInSlide, addElementToLayer). Use them when
 *   editing elements so the two stay consistent.
 * - The state also holds runtime-only data (preview playhead, quiz answers,
 *   variable values), which is never saved.
 * - LOAD_COURSE fills defaults and migrates older files. Data must already have
 *   been through lib/sanitize.ts.
 */
import React, { createContext, useContext, useReducer, type Dispatch } from 'react';
import type { CourseState, Slide, SlideElement, SlideLayer, ViewMode, PlayerSettings, CourseSettings, SlideAudio, QuizConfig, ResultsConfig, SlideKind, CourseVariable } from '@/types/course';
import { defaultPlayerSettings, defaultCourseSettings } from '@/types/course';
import { TTS_AUDIO_NAME } from '@/lib/tts/narration';

const createBaseLayer = (elements: SlideElement[] = []): SlideLayer => ({
  id: crypto.randomUUID(),
  name: 'Base Layer',
  visible: true,
  locked: false,
  elements,
});

const createSlide = (): Slide => {
  const baseLayer = createBaseLayer([]);
  return {
    id: crypto.randomUUID(),
    elements: [],
    duration: 5000,
    layers: [baseLayer],
  };
};

/** Ensure the slide has a layers array; migrate slide.elements into a Base Layer if not. */
function ensureLayers(slide: Slide): Slide {
  if (slide.layers && slide.layers.length > 0) return slide;
  const baseLayer = createBaseLayer(slide.elements ?? []);
  return { ...slide, layers: [baseLayer] };
}

/** Rebuild flat slide.elements from layer stack (bottom→top). */
function rebuildElements(slide: Slide): Slide {
  const layers = slide.layers ?? [];
  if (layers.length === 0) return slide;
  return { ...slide, elements: layers.flatMap((l) => l.elements) };
}

/** Apply a mapper to every element across all layers and rebuild flat elements. */
function mapElementsInSlide(slide: Slide, mapper: (el: SlideElement) => SlideElement): Slide {
  const s = ensureLayers(slide);
  const layers = (s.layers ?? []).map((l) => ({ ...l, elements: l.elements.map(mapper) }));
  return rebuildElements({ ...s, layers });
}

/** Filter out elements across all layers matching the predicate. */
function filterElementsInSlide(slide: Slide, keep: (el: SlideElement) => boolean): Slide {
  const s = ensureLayers(slide);
  const layers = (s.layers ?? []).map((l) => ({ ...l, elements: l.elements.filter(keep) }));
  return rebuildElements({ ...s, layers });
}

/** Append an element to the given layer (or topmost if not found) and rebuild. */
function addElementToLayer(slide: Slide, layerId: string | null, element: SlideElement): Slide {
  const s = ensureLayers(slide);
  const layers = s.layers ?? [];
  const targetIdx = layerId ? layers.findIndex((l) => l.id === layerId) : -1;
  const idx = targetIdx >= 0 ? targetIdx : layers.length - 1;
  const next = layers.map((l, i) => (i === idx ? { ...l, elements: [...l.elements, element] } : l));
  return rebuildElements({ ...s, layers: next });
}


/**
 * Lengthen a slide's timeline. Elements that ran to the old end of the slide
 * are stretched to the new end, so they don't disappear partway through.
 */
export function extendSlideDuration(slide: Slide, newDuration: number): Slide {
  const oldEnd = slide.duration;
  if (newDuration <= oldEnd) return slide;
  const stretched = mapElementsInSlide(slide, (el) =>
    el.startTime + el.duration >= oldEnd ? { ...el, duration: newDuration - el.startTime } : el,
  );
  return { ...stretched, duration: newDuration };
}

const defaultQuizConfig = (): QuizConfig => ({
  questionType: 'multiple-choice',
  question: 'New question?',
  choices: [
    { id: crypto.randomUUID(), text: 'Option 1', correct: true },
    { id: crypto.randomUUID(), text: 'Option 2', correct: false },
  ],
  singleSelect: true,
  pairs: [
    { id: crypto.randomUUID(), left: 'Term A', right: 'Definition A' },
    { id: crypto.randomUUID(), left: 'Term B', right: 'Definition B' },
  ],
  sortItems: [
    { id: crypto.randomUUID(), text: 'First' },
    { id: crypto.randomUUID(), text: 'Second' },
    { id: crypto.randomUUID(), text: 'Third' },
  ],
  correctFeedback: { mode: 'inline', message: 'Correct!' },
  incorrectFeedback: { mode: 'inline', message: 'Not quite. Try again.' },
  attempts: 1,
  attemptsExhaustedBehavior: 'reveal',
  quizRevisitMode: 'reset',
});

const defaultResultsConfig = (): ResultsConfig => ({
  passThreshold: 80,
  passMessage: 'Congratulations, you passed!',
  failMessage: 'You did not pass. Please review and try again.',
});

const createQuizSlide = (): Slide => ({
  ...createSlide(),
  slideType: 'quiz',
  title: 'Quiz',
  quiz: defaultQuizConfig(),
});

const createResultsSlide = (): Slide => ({
  ...createSlide(),
  slideType: 'results',
  title: 'Results',
  results: defaultResultsConfig(),
});

const firstSlide = createSlide();
const initialState: CourseState = {
  slides: [firstSlide],
  masterSlides: [],
  activeSlideIndex: 0,
  activeElementId: null,
  selectedElementIds: [],
  activeAudioId: null,
  previewMode: false,
  playheadTime: 0,
  isPlaying: false,
  viewMode: 'main',
  playerSettings: { ...defaultPlayerSettings },
  courseSettings: {
    ...defaultCourseSettings,
    themeColors: [...defaultCourseSettings.themeColors],
    transition: { ...defaultCourseSettings.transition },
  },
  showGrid: false,
  snapToGrid: false,
  ccEnabled: true,
  quizResults: {},
  quizAnswers: {},
  quizFeedbackOpen: null,
  quizAttemptsRemaining: {},
  courseQuizTimerRemaining: null,
  perQuestionTimerRemaining: {},
  motionPathEditor: null,
  variables: [],
  variableValues: {},
  activeLayerId: firstSlide.layers?.[0]?.id ?? null,
};

type Action =
  | { type: 'ADD_SLIDE' }
  | { type: 'DELETE_SLIDE'; index: number }
  | { type: 'SET_ACTIVE_SLIDE'; index: number }
  | { type: 'ADD_ELEMENT'; element: SlideElement }
  | { type: 'UPDATE_ELEMENT'; id: string; updates: Partial<SlideElement> }
  | { type: 'DELETE_ELEMENT'; id: string }
  | { type: 'SET_ACTIVE_ELEMENT'; id: string | null }
  | { type: 'TOGGLE_SELECT_ELEMENT'; id: string }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'ALIGN_ELEMENTS'; mode: 'canvas' | 'selection'; alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' }
  | { type: 'DISTRIBUTE_ELEMENTS'; axis: 'horizontal' | 'vertical' }
  | { type: 'LOAD_COURSE'; slides: Slide[]; masterSlides?: Slide[]; playerSettings?: Partial<PlayerSettings>; courseSettings?: Partial<CourseSettings>; variables?: CourseVariable[] }
  | { type: 'SET_PREVIEW_MODE'; enabled: boolean }
  | { type: 'PREVIEW_NEXT' }
  | { type: 'PREVIEW_PREV' }
  | { type: 'UPDATE_SLIDE'; index: number; updates: Partial<Slide> }
  | { type: 'SET_PLAYHEAD'; time: number }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'SET_VIEW_MODE'; mode: ViewMode }
  | { type: 'ADD_MASTER_SLIDE' }
  | { type: 'DELETE_MASTER_SLIDE'; index: number }
  | { type: 'SET_ACTIVE_MASTER_SLIDE'; index: number }
  | { type: 'UPDATE_PLAYER_SETTINGS'; updates: Partial<PlayerSettings> }
  | { type: 'UPDATE_COURSE_SETTINGS'; updates: Partial<CourseSettings> }
  | { type: 'UPDATE_THEME_COLOR'; index: number; color: string }
  | { type: 'ADD_AUDIO'; audio: SlideAudio }
  /** Add text-to-speech narration to a slide (by id), replacing any earlier TTS narration and lengthening the slide to fit. */
  | { type: 'SET_SLIDE_NARRATION'; slideId: string; audio: SlideAudio }
  | { type: 'DELETE_AUDIO'; id: string }
  | { type: 'UPDATE_AUDIO'; id: string; updates: Partial<SlideAudio> }
  | { type: 'SET_ACTIVE_AUDIO'; id: string | null }
  | { type: 'SET_SHOW_GRID'; value: boolean }
  | { type: 'SET_SNAP_TO_GRID'; value: boolean }
  | { type: 'SET_CC_ENABLED'; value: boolean }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'APPLY_TRANSITION_TO_ALL'; transitionType: NonNullable<Slide['transitionType']>; transitionDuration: number }
  | { type: 'ADD_QUIZ_SLIDE' }
  | { type: 'ADD_RESULTS_SLIDE' }
  | { type: 'UPDATE_QUIZ'; index: number; updates: Partial<QuizConfig> }
  | { type: 'UPDATE_RESULTS'; index: number; updates: Partial<ResultsConfig> }
  | { type: 'SET_QUIZ_ANSWER'; slideId: string; answer: unknown }
  | { type: 'SUBMIT_QUIZ'; slideId: string; correct: boolean }
  | { type: 'OPEN_QUIZ_FEEDBACK'; slideId: string; correct: boolean }
  | { type: 'CLOSE_QUIZ_FEEDBACK' }
  | { type: 'RESET_QUIZ_PROGRESS' }
  | { type: 'INIT_QUIZ_ATTEMPTS'; slideId: string; attempts: number }
  | { type: 'CONSUME_QUIZ_ATTEMPT'; slideId: string }
  | { type: 'RESET_QUIZ_SLIDE_PROGRESS'; slideId: string }
  | { type: 'SET_COURSE_QUIZ_TIMER'; seconds: number | null }
  | { type: 'SET_PER_QUESTION_TIMER'; slideId: string; seconds: number }
  | { type: 'MOVE_SLIDE'; from: number; to: number }
  | { type: 'OPEN_MOTION_PATH_EDITOR'; elementId: string }
  | { type: 'CLOSE_MOTION_PATH_EDITOR' }
  | { type: 'ADD_VARIABLE'; variable: CourseVariable }
  | { type: 'UPDATE_VARIABLE'; id: string; updates: Partial<CourseVariable> }
  | { type: 'DELETE_VARIABLE'; id: string }
  | { type: 'SET_VARIABLE_VALUE'; id: string; value: boolean | number | string }
  | { type: 'RESET_VARIABLE_VALUES' }
  | { type: 'ADD_LAYER'; name?: string }
  | { type: 'DELETE_LAYER'; layerId: string }
  | { type: 'RENAME_LAYER'; layerId: string; name: string }
  | { type: 'TOGGLE_LAYER_VISIBILITY'; layerId: string }
  | { type: 'TOGGLE_LAYER_LOCK'; layerId: string }
  | { type: 'SET_ACTIVE_LAYER'; layerId: string }
  | { type: 'REORDER_LAYERS'; layerId: string; direction: 'up' | 'down' };

function getActiveSlides(state: CourseState): Slide[] {
  return state.viewMode === 'master' ? state.masterSlides : state.slides;
}

function updateActiveSlides(state: CourseState, slides: Slide[]): Partial<CourseState> {
  return state.viewMode === 'master' ? { masterSlides: slides } : { slides };
}

function computeVariableValues(vars: CourseVariable[]): Record<string, boolean | number | string> {
  const out: Record<string, boolean | number | string> = {};
  for (const v of vars) out[v.id] = v.defaultValue;
  return out;
}

function slideFirstLayerId(slide: Slide | undefined): string | null {
  return slide?.layers?.[0]?.id ?? null;
}

function withUpdatedActiveSlide(
  state: CourseState,
  updater: (slide: Slide) => Slide
): Partial<CourseState> {
  const slides = getActiveSlides(state);
  const next = slides.map((s, i) => (i === state.activeSlideIndex ? updater(ensureLayers(s)) : s));
  return updateActiveSlides(state, next);
}

export function courseReducer(state: CourseState, action: Action): CourseState {
  switch (action.type) {
    case 'ADD_SLIDE': {
      if (state.viewMode === 'master') {
        const s = createSlide();
        const newMasters = [...state.masterSlides, s];
        return { ...state, masterSlides: newMasters, activeSlideIndex: newMasters.length - 1, activeElementId: null, selectedElementIds: [], activeLayerId: slideFirstLayerId(s) };
      }
      const s = createSlide();
      const newSlides = [...state.slides, s];
      return { ...state, slides: newSlides, activeSlideIndex: newSlides.length - 1, activeElementId: null, selectedElementIds: [], activeLayerId: slideFirstLayerId(s) };
    }
    case 'DELETE_SLIDE': {
      const slides = getActiveSlides(state);
      if (slides.length <= 1) return state;
      const newSlides = slides.filter((_, i) => i !== action.index);
      const newIndex = Math.min(state.activeSlideIndex, newSlides.length - 1);
      return { ...state, ...updateActiveSlides(state, newSlides), activeSlideIndex: newIndex, activeElementId: null, selectedElementIds: [], activeLayerId: slideFirstLayerId(newSlides[newIndex]) };
    }
    case 'SET_ACTIVE_SLIDE': {
      const slides = getActiveSlides(state);
      const target = slides[action.index];
      return { ...state, activeSlideIndex: action.index, activeElementId: null, selectedElementIds: [], activeAudioId: null, playheadTime: 0, isPlaying: false, activeLayerId: slideFirstLayerId(target) };
    }
    case 'MOVE_SLIDE': {
      const slides = getActiveSlides(state);
      const { from, to } = action;
      if (from < 0 || from >= slides.length || to < 0 || to >= slides.length || from === to) return state;
      const next = [...slides];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      const newActive = state.activeSlideIndex === from ? to : state.activeSlideIndex;
      return { ...state, ...updateActiveSlides(state, next), activeSlideIndex: newActive };
    }
    case 'ADD_ELEMENT': {
      const updated = withUpdatedActiveSlide(state, (slide) =>
        addElementToLayer(slide, state.activeLayerId, action.element)
      );
      return { ...state, ...updated, activeElementId: action.element.id, selectedElementIds: [action.element.id], activeAudioId: null };
    }
    case 'UPDATE_ELEMENT': {
      const updated = withUpdatedActiveSlide(state, (slide) =>
        mapElementsInSlide(slide, (el) =>
          el.id === action.id ? ({ ...el, ...action.updates } as SlideElement) : el
        )
      );
      return { ...state, ...updated };
    }
    case 'DELETE_ELEMENT': {
      const updated = withUpdatedActiveSlide(state, (slide) =>
        filterElementsInSlide(slide, (el) => el.id !== action.id)
      );
      const nextSelected = state.selectedElementIds.filter((id) => id !== action.id);
      return {
        ...state,
        ...updated,
        activeElementId: state.activeElementId === action.id ? (nextSelected[nextSelected.length - 1] ?? null) : state.activeElementId,
        selectedElementIds: nextSelected,
      };
    }
    case 'SET_ACTIVE_ELEMENT':
      return {
        ...state,
        activeElementId: action.id,
        selectedElementIds: action.id ? [action.id] : [],
        activeAudioId: action.id ? null : state.activeAudioId,
      };
    case 'TOGGLE_SELECT_ELEMENT': {
      const exists = state.selectedElementIds.includes(action.id);
      const nextSelected = exists
        ? state.selectedElementIds.filter((id) => id !== action.id)
        : [...state.selectedElementIds, action.id];
      const nextActive = exists
        ? (state.activeElementId === action.id ? (nextSelected[nextSelected.length - 1] ?? null) : state.activeElementId)
        : action.id;
      return { ...state, selectedElementIds: nextSelected, activeElementId: nextActive, activeAudioId: null };
    }
    case 'CLEAR_SELECTION':
      return { ...state, activeElementId: null, selectedElementIds: [] };
    case 'ALIGN_ELEMENTS': {
      const ids = state.selectedElementIds;
      if (ids.length === 0) return state;
      const slides = getActiveSlides(state);
      const slide = slides[state.activeSlideIndex];
      if (!slide) return state;
      const targets = slide.elements.filter((el) => ids.includes(el.id));
      if (targets.length === 0) return state;
      if (action.mode === 'selection' && targets.length < 2) return state;

      const { width: CW, height: CH } = state.courseSettings.canvasDimensions;
      // Bounding box of selection
      const minX = Math.min(...targets.map((e) => e.x));
      const maxX = Math.max(...targets.map((e) => e.x + e.width));
      const minY = Math.min(...targets.map((e) => e.y));
      const maxY = Math.max(...targets.map((e) => e.y + e.height));
      const cxSel = (minX + maxX) / 2;
      const cySel = (minY + maxY) / 2;

      const computeXY = (el: SlideElement): { x?: number; y?: number } => {
        if (action.mode === 'canvas') {
          switch (action.alignment) {
            case 'left':   return { x: 0 };
            case 'center': return { x: Math.round((CW - el.width) / 2) };
            case 'right':  return { x: CW - el.width };
            case 'top':    return { y: 0 };
            case 'middle': return { y: Math.round((CH - el.height) / 2) };
            case 'bottom': return { y: CH - el.height };
          }
        } else {
          switch (action.alignment) {
            case 'left':   return { x: minX };
            case 'center': return { x: Math.round(cxSel - el.width / 2) };
            case 'right':  return { x: maxX - el.width };
            case 'top':    return { y: minY };
            case 'middle': return { y: Math.round(cySel - el.height / 2) };
            case 'bottom': return { y: maxY - el.height };
          }
        }
        return {};
      };

      const updated = withUpdatedActiveSlide(state, (s) =>
        mapElementsInSlide(s, (el) =>
          ids.includes(el.id) ? ({ ...el, ...computeXY(el) } as SlideElement) : el
        )
      );
      return { ...state, ...updated };
    }
    case 'DISTRIBUTE_ELEMENTS': {
      const ids = state.selectedElementIds;
      if (ids.length < 3) return state;
      const slides = getActiveSlides(state);
      const slide = slides[state.activeSlideIndex];
      if (!slide) return state;
      const targets = slide.elements.filter((el) => ids.includes(el.id));
      if (targets.length < 3) return state;

      const horizontal = action.axis === 'horizontal';
      const sorted = [...targets].sort((a, b) =>
        horizontal
          ? (a.x + a.width / 2) - (b.x + b.width / 2)
          : (a.y + a.height / 2) - (b.y + b.height / 2)
      );
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const firstCenter = horizontal ? first.x + first.width / 2 : first.y + first.height / 2;
      const lastCenter = horizontal ? last.x + last.width / 2 : last.y + last.height / 2;
      const step = (lastCenter - firstCenter) / (sorted.length - 1);

      const newCoords = new Map<string, { x?: number; y?: number }>();
      for (let i = 1; i < sorted.length - 1; i++) {
        const el = sorted[i];
        const targetCenter = firstCenter + step * i;
        if (horizontal) {
          newCoords.set(el.id, { x: Math.round(targetCenter - el.width / 2) });
        } else {
          newCoords.set(el.id, { y: Math.round(targetCenter - el.height / 2) });
        }
      }
      const updated = withUpdatedActiveSlide(state, (s) =>
        mapElementsInSlide(s, (el) => {
          const c = newCoords.get(el.id);
          return c ? ({ ...el, ...c } as SlideElement) : el;
        })
      );
      return { ...state, ...updated };
    }
    case 'LOAD_COURSE': {
      const backfillEl = (e: SlideElement): SlideElement => ({
        entranceDuration: 500,
        exitDuration: 500,
        ...e,
      } as SlideElement);
      const backfillSlide = (s: Slide): Slide => {
        const elements = (s.elements ?? []).map(backfillEl);
        // Migrate: if no layers exist, create a Base Layer containing all elements.
        // Otherwise, backfill elements inside existing layers (keeping ids).
        let layers: SlideLayer[];
        if (s.layers && s.layers.length > 0) {
          layers = s.layers.map((l) => ({
            ...l,
            visible: l.visible !== false,
            locked: l.locked === true,
            elements: (l.elements ?? []).map(backfillEl),
          }));
        } else {
          layers = [createBaseLayer(elements)];
        }
        return rebuildElements({
          ...s,
          duration: s.duration ?? 5000,
          elements,
          layers,
        });
      };
      const loadedThemeColors = action.courseSettings?.themeColors;
      const loadedSlides = action.slides.map(backfillSlide);
      const loadedMasters = (action.masterSlides ?? []).map(backfillSlide);
      return {
        ...initialState,
        slides: loadedSlides,
        masterSlides: loadedMasters,
        playerSettings: action.playerSettings ? { ...defaultPlayerSettings, ...action.playerSettings } : { ...defaultPlayerSettings },
        courseSettings: {
          ...defaultCourseSettings,
          ...action.courseSettings,
          themeColors: Array.isArray(loadedThemeColors) && loadedThemeColors.length === 6
            ? [...loadedThemeColors]
            : [...defaultCourseSettings.themeColors],
          transition: action.courseSettings?.transition
            ? { ...defaultCourseSettings.transition, ...action.courseSettings.transition }
            : { ...defaultCourseSettings.transition },
        },
        activeSlideIndex: 0,
        activeElementId: null,
        selectedElementIds: [],
        previewMode: false,
        variables: Array.isArray(action.variables) ? action.variables : [],
        variableValues: computeVariableValues(Array.isArray(action.variables) ? action.variables : []),
        activeLayerId: slideFirstLayerId(loadedSlides[0]),
      };
    }
    case 'SET_PREVIEW_MODE':
      return {
        ...state,
        previewMode: action.enabled,
        activeElementId: null,
        selectedElementIds: [],
        activeSlideIndex: action.enabled ? 0 : state.activeSlideIndex,
        playheadTime: 0,
        isPlaying: action.enabled ? true : false,
        viewMode: action.enabled ? 'main' : state.viewMode,
        quizResults: {},
        quizAnswers: {},
        quizFeedbackOpen: null,
        quizAttemptsRemaining: {},
        // Reset live variable values to their defaults at the start of every preview session.
        variableValues: computeVariableValues(state.variables),
      };
    case 'PREVIEW_NEXT':
      return { ...state, activeSlideIndex: Math.min(state.activeSlideIndex + 1, state.slides.length - 1) };
    case 'PREVIEW_PREV':
      return { ...state, activeSlideIndex: Math.max(state.activeSlideIndex - 1, 0) };
    case 'UPDATE_SLIDE': {
      const slides = getActiveSlides(state).map((slide, i) =>
        i === action.index ? { ...slide, ...action.updates } : slide
      );
      return { ...state, ...updateActiveSlides(state, slides) };
    }
    case 'SET_PLAYHEAD':
      return { ...state, playheadTime: action.time };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.playing };
    case 'SET_VIEW_MODE':
      return {
        ...state,
        viewMode: action.mode,
        activeSlideIndex: 0,
        activeElementId: null,
        selectedElementIds: [],
        playheadTime: 0,
        isPlaying: false,
      };
    case 'ADD_MASTER_SLIDE': {
      const s = createSlide();
      const newMasters = [...state.masterSlides, s];
      return { ...state, masterSlides: newMasters, viewMode: 'master', activeSlideIndex: newMasters.length - 1, activeElementId: null, selectedElementIds: [], activeLayerId: slideFirstLayerId(s) };
    }
    case 'DELETE_MASTER_SLIDE': {
      if (state.masterSlides.length <= 0) return state;
      const newMasters = state.masterSlides.filter((_, i) => i !== action.index);
      const deletedId = state.masterSlides[action.index]?.id;
      const updatedSlides = deletedId
        ? state.slides.map(s => s.masterId === deletedId ? { ...s, masterId: undefined } : s)
        : state.slides;
      const newIndex = Math.min(state.activeSlideIndex, Math.max(0, newMasters.length - 1));
      return { ...state, masterSlides: newMasters, slides: updatedSlides, activeSlideIndex: newIndex, activeElementId: null, selectedElementIds: [], activeLayerId: slideFirstLayerId(state.viewMode === 'master' ? newMasters[newIndex] : updatedSlides[newIndex]) };
    }
    case 'SET_ACTIVE_MASTER_SLIDE': {
      const target = state.masterSlides[action.index];
      return { ...state, viewMode: 'master', activeSlideIndex: action.index, activeElementId: null, selectedElementIds: [], activeAudioId: null, playheadTime: 0, isPlaying: false, activeLayerId: slideFirstLayerId(target) };
    }
    case 'UPDATE_PLAYER_SETTINGS':
      return { ...state, playerSettings: { ...state.playerSettings, ...action.updates } };
    case 'UPDATE_COURSE_SETTINGS':
      return { ...state, courseSettings: { ...state.courseSettings, ...action.updates } };
    case 'UPDATE_THEME_COLOR': {
      const next = [...state.courseSettings.themeColors];
      next[action.index] = action.color;
      return { ...state, courseSettings: { ...state.courseSettings, themeColors: next } };
    }
    case 'ADD_AUDIO': {
      const slides = getActiveSlides(state).map((slide, i) =>
        i === state.activeSlideIndex
          ? { ...slide, audio: [...(slide.audio ?? []), action.audio] }
          : slide
      );
      return { ...state, ...updateActiveSlides(state, slides) };
    }
    case 'SET_SLIDE_NARRATION': {
      const idx = state.slides.findIndex((s) => s.id === action.slideId);
      if (idx < 0) return state; // slide was deleted or a different course was loaded
      const slide = state.slides[idx];
      const audio = [...(slide.audio ?? []).filter((a) => a.name !== TTS_AUDIO_NAME), action.audio];
      // Half a second of breathing room after the voice ends.
      const needed = Math.ceil(action.audio.duration * 1000) + 500;
      const updated = extendSlideDuration({ ...slide, audio }, needed);
      const slides = state.slides.slice();
      slides[idx] = updated;
      return { ...state, slides };
    }
    case 'DELETE_AUDIO': {
      const slides = getActiveSlides(state).map((slide, i) =>
        i === state.activeSlideIndex
          ? { ...slide, audio: (slide.audio ?? []).filter((a) => a.id !== action.id) }
          : slide
      );
      return {
        ...state,
        ...updateActiveSlides(state, slides),
        activeAudioId: state.activeAudioId === action.id ? null : state.activeAudioId,
      };
    }
    case 'UPDATE_AUDIO': {
      const slides = getActiveSlides(state).map((slide, i) =>
        i === state.activeSlideIndex
          ? {
              ...slide,
              audio: (slide.audio ?? []).map((a) =>
                a.id === action.id ? { ...a, ...action.updates } : a
              ),
            }
          : slide
      );
      return { ...state, ...updateActiveSlides(state, slides) };
    }
    case 'SET_ACTIVE_AUDIO':
      return { ...state, activeAudioId: action.id, activeElementId: action.id ? null : state.activeElementId };
    case 'SET_SHOW_GRID':
      return { ...state, showGrid: action.value };
    case 'SET_SNAP_TO_GRID':
      return { ...state, snapToGrid: action.value };
    case 'SET_CC_ENABLED':
      return { ...state, ccEnabled: action.value };
    case 'TOGGLE_PLAY':
      return { ...state, isPlaying: !state.isPlaying };
    case 'APPLY_TRANSITION_TO_ALL': {
      const slides = getActiveSlides(state).map((s) => ({
        ...s,
        transitionType: action.transitionType,
        transitionDuration: action.transitionDuration,
      }));
      return { ...state, ...updateActiveSlides(state, slides) };
    }
    case 'ADD_QUIZ_SLIDE': {
      if (state.viewMode === 'master') return state;
      const s = createQuizSlide();
      const newSlides = [...state.slides, s];
      return { ...state, slides: newSlides, activeSlideIndex: newSlides.length - 1, activeElementId: null, selectedElementIds: [], activeLayerId: slideFirstLayerId(s) };
    }
    case 'ADD_RESULTS_SLIDE': {
      if (state.viewMode === 'master') return state;
      const s = createResultsSlide();
      const newSlides = [...state.slides, s];
      return { ...state, slides: newSlides, activeSlideIndex: newSlides.length - 1, activeElementId: null, selectedElementIds: [], activeLayerId: slideFirstLayerId(s) };
    }
    case 'UPDATE_QUIZ': {
      const slides = state.slides.map((s, i) =>
        i === action.index && s.slideType === 'quiz'
          ? { ...s, quiz: { ...(s.quiz ?? defaultQuizConfig()), ...action.updates } }
          : s
      );
      return { ...state, slides };
    }
    case 'UPDATE_RESULTS': {
      const slides = state.slides.map((s, i) =>
        i === action.index && s.slideType === 'results'
          ? { ...s, results: { ...(s.results ?? defaultResultsConfig()), ...action.updates } }
          : s
      );
      return { ...state, slides };
    }
    case 'SET_QUIZ_ANSWER':
      return { ...state, quizAnswers: { ...state.quizAnswers, [action.slideId]: action.answer } };
    case 'SUBMIT_QUIZ':
      return {
        ...state,
        quizResults: { ...state.quizResults, [action.slideId]: { correct: action.correct, submitted: true } },
      };
    case 'OPEN_QUIZ_FEEDBACK':
      return { ...state, quizFeedbackOpen: { slideId: action.slideId, correct: action.correct } };
    case 'CLOSE_QUIZ_FEEDBACK':
      return { ...state, quizFeedbackOpen: null };
    case 'RESET_QUIZ_PROGRESS':
      return { ...state, quizAnswers: {}, quizResults: {}, quizFeedbackOpen: null, quizAttemptsRemaining: {}, courseQuizTimerRemaining: null, perQuestionTimerRemaining: {} };
    case 'SET_COURSE_QUIZ_TIMER':
      return { ...state, courseQuizTimerRemaining: action.seconds };
    case 'SET_PER_QUESTION_TIMER':
      return { ...state, perQuestionTimerRemaining: { ...state.perQuestionTimerRemaining, [action.slideId]: action.seconds } };
    case 'INIT_QUIZ_ATTEMPTS':
      // Only set if not already initialized for this slide.
      if (state.quizAttemptsRemaining[action.slideId] != null) return state;
      return {
        ...state,
        quizAttemptsRemaining: { ...state.quizAttemptsRemaining, [action.slideId]: action.attempts },
      };
    case 'CONSUME_QUIZ_ATTEMPT': {
      const cur = state.quizAttemptsRemaining[action.slideId];
      if (cur == null) return state;
      // Unlimited (Infinity) stays unlimited.
      if (!Number.isFinite(cur)) return state;
      return {
        ...state,
        quizAttemptsRemaining: { ...state.quizAttemptsRemaining, [action.slideId]: Math.max(0, cur - 1) },
      };
    }
    case 'RESET_QUIZ_SLIDE_PROGRESS': {
      const { [action.slideId]: _a, ...restAns } = state.quizAnswers;
      const { [action.slideId]: _r, ...restRes } = state.quizResults;
      const { [action.slideId]: _at, ...restAtt } = state.quizAttemptsRemaining;
      return {
        ...state,
        quizAnswers: restAns,
        quizResults: restRes,
        quizAttemptsRemaining: restAtt,
        quizFeedbackOpen: state.quizFeedbackOpen?.slideId === action.slideId ? null : state.quizFeedbackOpen,
      };
    }
    case 'OPEN_MOTION_PATH_EDITOR':
      return { ...state, motionPathEditor: { elementId: action.elementId } };
    case 'CLOSE_MOTION_PATH_EDITOR':
      return { ...state, motionPathEditor: null };
    case 'ADD_VARIABLE': {
      const variables = [...state.variables, action.variable];
      return {
        ...state,
        variables,
        variableValues: { ...state.variableValues, [action.variable.id]: action.variable.defaultValue },
      };
    }
    case 'UPDATE_VARIABLE': {
      const variables = state.variables.map((v) => (v.id === action.id ? { ...v, ...action.updates } : v));
      const updated = variables.find((v) => v.id === action.id);
      // If type or defaultValue changed, refresh stored value to match new default to avoid type mismatches.
      const nextValues = { ...state.variableValues };
      if (updated && (action.updates.type != null || action.updates.defaultValue != null)) {
        nextValues[action.id] = updated.defaultValue;
      }
      return { ...state, variables, variableValues: nextValues };
    }
    case 'DELETE_VARIABLE': {
      const variables = state.variables.filter((v) => v.id !== action.id);
      const { [action.id]: _, ...rest } = state.variableValues;
      return { ...state, variables, variableValues: rest };
    }
    case 'SET_VARIABLE_VALUE':
      return { ...state, variableValues: { ...state.variableValues, [action.id]: action.value } };
    case 'RESET_VARIABLE_VALUES':
      return { ...state, variableValues: computeVariableValues(state.variables) };
    case 'ADD_LAYER': {
      const slides = getActiveSlides(state);
      const slide = ensureLayers(slides[state.activeSlideIndex]);
      const layers = slide.layers ?? [];
      // Default name "Layer N" where N counts non-base layers (+1).
      const existingNumbers = layers
        .map((l) => /^Layer (\d+)$/.exec(l.name))
        .map((m) => (m ? parseInt(m[1], 10) : 0));
      const nextNum = Math.max(0, ...existingNumbers) + 1;
      const newLayer: SlideLayer = {
        id: crypto.randomUUID(),
        name: action.name ?? `Layer ${nextNum}`,
        visible: true,
        locked: false,
        elements: [],
      };
      // Append to top of stack (end of array).
      const nextLayers = [...layers, newLayer];
      const nextSlides = slides.map((s, i) =>
        i === state.activeSlideIndex ? rebuildElements({ ...slide, layers: nextLayers }) : s
      );
      return {
        ...state,
        ...updateActiveSlides(state, nextSlides),
        activeLayerId: newLayer.id,
        activeElementId: null,
        selectedElementIds: [],
      };
    }
    case 'DELETE_LAYER': {
      const slides = getActiveSlides(state);
      const slide = ensureLayers(slides[state.activeSlideIndex]);
      const layers = slide.layers ?? [];
      if (layers.length <= 1) return state;
      // Base Layer (index 0) cannot be deleted.
      const idx = layers.findIndex((l) => l.id === action.layerId);
      if (idx <= 0) return state;
      const nextLayers = layers.filter((_, i) => i !== idx);
      const nextSlide = rebuildElements({ ...slide, layers: nextLayers });
      const nextSlides = slides.map((s, i) => (i === state.activeSlideIndex ? nextSlide : s));
      const nextActiveLayer = state.activeLayerId === action.layerId
        ? nextLayers[nextLayers.length - 1]?.id ?? null
        : state.activeLayerId;
      // Drop selection of any element that lived on the removed layer.
      const remainingIds = new Set(nextSlide.elements.map((e) => e.id));
      const nextSelected = state.selectedElementIds.filter((id) => remainingIds.has(id));
      return {
        ...state,
        ...updateActiveSlides(state, nextSlides),
        activeLayerId: nextActiveLayer,
        selectedElementIds: nextSelected,
        activeElementId: nextSelected.includes(state.activeElementId ?? '') ? state.activeElementId : null,
      };
    }
    case 'RENAME_LAYER': {
      const updated = withUpdatedActiveSlide(state, (slide) => {
        const layers = (slide.layers ?? []).map((l) =>
          l.id === action.layerId ? { ...l, name: action.name.slice(0, 40) } : l
        );
        return { ...slide, layers };
      });
      return { ...state, ...updated };
    }
    case 'TOGGLE_LAYER_VISIBILITY': {
      const updated = withUpdatedActiveSlide(state, (slide) => {
        const layers = (slide.layers ?? []).map((l) =>
          l.id === action.layerId ? { ...l, visible: !l.visible } : l
        );
        return { ...slide, layers };
      });
      return { ...state, ...updated };
    }
    case 'TOGGLE_LAYER_LOCK': {
      const updated = withUpdatedActiveSlide(state, (slide) => {
        const layers = (slide.layers ?? []).map((l) =>
          l.id === action.layerId ? { ...l, locked: !l.locked } : l
        );
        return { ...slide, layers };
      });
      return { ...state, ...updated };
    }
    case 'SET_ACTIVE_LAYER': {
      return { ...state, activeLayerId: action.layerId, activeElementId: null, selectedElementIds: [] };
    }
    case 'REORDER_LAYERS': {
      const slides = getActiveSlides(state);
      const slide = ensureLayers(slides[state.activeSlideIndex]);
      const layers = slide.layers ?? [];
      const idx = layers.findIndex((l) => l.id === action.layerId);
      if (idx < 0) return state;
      // Base Layer (index 0) cannot be moved.
      if (idx === 0) return state;
      const target = action.direction === 'up' ? idx + 1 : idx - 1;
      // Cannot move below Base Layer position (0).
      if (target <= 0 || target >= layers.length) return state;
      const next = [...layers];
      const [moved] = next.splice(idx, 1);
      next.splice(target, 0, moved);
      const nextSlide = rebuildElements({ ...slide, layers: next });
      const nextSlides = slides.map((s, i) => (i === state.activeSlideIndex ? nextSlide : s));
      return { ...state, ...updateActiveSlides(state, nextSlides) };
    }
    default:
      return state;
  }
}

const CourseContext = createContext<{ state: CourseState; dispatch: Dispatch<Action> } | null>(null);

export function CourseProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(courseReducer, initialState);
  return <CourseContext.Provider value={{ state, dispatch }}>{children}</CourseContext.Provider>;
}

export function useCourse() {
  const ctx = useContext(CourseContext);
  if (!ctx) throw new Error('useCourse must be used within CourseProvider');
  return ctx;
}
