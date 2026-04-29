import React, { createContext, useContext, useReducer, type Dispatch } from 'react';
import type { CourseState, Slide, SlideElement, ViewMode, PlayerSettings, CourseSettings, SlideAudio, QuizConfig, ResultsConfig, SlideKind } from '@/types/course';
import { defaultPlayerSettings, defaultCourseSettings } from '@/types/course';

const createSlide = (): Slide => ({
  id: crypto.randomUUID(),
  elements: [],
  duration: 5000,
});

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

const initialState: CourseState = {
  slides: [createSlide()],
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
  | { type: 'LOAD_COURSE'; slides: Slide[]; masterSlides?: Slide[]; playerSettings?: Partial<PlayerSettings>; courseSettings?: Partial<CourseSettings> }
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
  | { type: 'RESET_QUIZ_SLIDE_PROGRESS'; slideId: string };

function getActiveSlides(state: CourseState): Slide[] {
  return state.viewMode === 'master' ? state.masterSlides : state.slides;
}

function updateActiveSlides(state: CourseState, slides: Slide[]): Partial<CourseState> {
  return state.viewMode === 'master' ? { masterSlides: slides } : { slides };
}

function courseReducer(state: CourseState, action: Action): CourseState {
  switch (action.type) {
    case 'ADD_SLIDE': {
      if (state.viewMode === 'master') {
        const newMasters = [...state.masterSlides, createSlide()];
        return { ...state, masterSlides: newMasters, activeSlideIndex: newMasters.length - 1, activeElementId: null, selectedElementIds: [] };
      }
      const newSlides = [...state.slides, createSlide()];
      return { ...state, slides: newSlides, activeSlideIndex: newSlides.length - 1, activeElementId: null, selectedElementIds: [] };
    }
    case 'DELETE_SLIDE': {
      const slides = getActiveSlides(state);
      if (slides.length <= 1) return state;
      const newSlides = slides.filter((_, i) => i !== action.index);
      const newIndex = Math.min(state.activeSlideIndex, newSlides.length - 1);
      return { ...state, ...updateActiveSlides(state, newSlides), activeSlideIndex: newIndex, activeElementId: null, selectedElementIds: [] };
    }
    case 'SET_ACTIVE_SLIDE':
      return { ...state, activeSlideIndex: action.index, activeElementId: null, selectedElementIds: [], activeAudioId: null, playheadTime: 0, isPlaying: false };
    case 'ADD_ELEMENT': {
      const slides = getActiveSlides(state).map((slide, i) =>
        i === state.activeSlideIndex
          ? { ...slide, elements: [...slide.elements, action.element] }
          : slide
      );
      return { ...state, ...updateActiveSlides(state, slides), activeElementId: action.element.id, selectedElementIds: [action.element.id], activeAudioId: null };
    }
    case 'UPDATE_ELEMENT': {
      const slides = getActiveSlides(state).map((slide, i) =>
        i === state.activeSlideIndex
          ? {
              ...slide,
              elements: slide.elements.map((el) =>
                el.id === action.id ? { ...el, ...action.updates } as SlideElement : el
              ),
            }
          : slide
      );
      return { ...state, ...updateActiveSlides(state, slides) };
    }
    case 'DELETE_ELEMENT': {
      const slides = getActiveSlides(state).map((slide, i) =>
        i === state.activeSlideIndex
          ? { ...slide, elements: slide.elements.filter((el) => el.id !== action.id) }
          : slide
      );
      const nextSelected = state.selectedElementIds.filter((id) => id !== action.id);
      return {
        ...state,
        ...updateActiveSlides(state, slides),
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

      const updatedElements = slide.elements.map((el) => {
        if (!ids.includes(el.id)) return el;
        return { ...el, ...computeXY(el) } as SlideElement;
      });
      const updatedSlides = slides.map((s, i) => i === state.activeSlideIndex ? { ...s, elements: updatedElements } : s);
      return { ...state, ...updateActiveSlides(state, updatedSlides) };
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
      const updatedElements = slide.elements.map((el) => {
        const c = newCoords.get(el.id);
        return c ? ({ ...el, ...c } as SlideElement) : el;
      });
      const updatedSlides = slides.map((s, i) => i === state.activeSlideIndex ? { ...s, elements: updatedElements } : s);
      return { ...state, ...updateActiveSlides(state, updatedSlides) };
    }
    case 'LOAD_COURSE': {
      const backfillEl = (e: SlideElement): SlideElement => ({
        entranceDuration: 500,
        exitDuration: 500,
        ...e,
      } as SlideElement);
      const backfillSlide = (s: Slide): Slide => ({
        ...s,
        duration: s.duration ?? 5000,
        elements: (s.elements ?? []).map(backfillEl),
      });
      const loadedThemeColors = action.courseSettings?.themeColors;
      return {
        ...initialState,
        slides: action.slides.map(backfillSlide),
        masterSlides: (action.masterSlides ?? []).map(backfillSlide),
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
      const newMasters = [...state.masterSlides, createSlide()];
      return { ...state, masterSlides: newMasters, viewMode: 'master', activeSlideIndex: newMasters.length - 1, activeElementId: null, selectedElementIds: [] };
    }
    case 'DELETE_MASTER_SLIDE': {
      if (state.masterSlides.length <= 0) return state;
      const newMasters = state.masterSlides.filter((_, i) => i !== action.index);
      // Remove masterId references from slides pointing to deleted master
      const deletedId = state.masterSlides[action.index]?.id;
      const updatedSlides = deletedId
        ? state.slides.map(s => s.masterId === deletedId ? { ...s, masterId: undefined } : s)
        : state.slides;
      const newIndex = Math.min(state.activeSlideIndex, Math.max(0, newMasters.length - 1));
      return { ...state, masterSlides: newMasters, slides: updatedSlides, activeSlideIndex: newIndex, activeElementId: null, selectedElementIds: [] };
    }
    case 'SET_ACTIVE_MASTER_SLIDE':
      return { ...state, viewMode: 'master', activeSlideIndex: action.index, activeElementId: null, selectedElementIds: [], activeAudioId: null, playheadTime: 0, isPlaying: false };
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
      // Quiz slides only exist in main timeline.
      if (state.viewMode === 'master') return state;
      const newSlides = [...state.slides, createQuizSlide()];
      return { ...state, slides: newSlides, activeSlideIndex: newSlides.length - 1, activeElementId: null, selectedElementIds: [] };
    }
    case 'ADD_RESULTS_SLIDE': {
      if (state.viewMode === 'master') return state;
      const newSlides = [...state.slides, createResultsSlide()];
      return { ...state, slides: newSlides, activeSlideIndex: newSlides.length - 1, activeElementId: null, selectedElementIds: [] };
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
      return { ...state, quizAnswers: {}, quizResults: {}, quizFeedbackOpen: null };
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
