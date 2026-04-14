import React, { createContext, useContext, useReducer, type Dispatch } from 'react';
import type { CourseState, Slide, SlideElement, ViewMode } from '@/types/course';

const createSlide = (): Slide => ({
  id: crypto.randomUUID(),
  elements: [],
  duration: 5000,
});

const initialState: CourseState = {
  slides: [createSlide()],
  masterSlides: [],
  activeSlideIndex: 0,
  activeElementId: null,
  previewMode: false,
  playheadTime: 0,
  isPlaying: false,
  viewMode: 'main',
};

type Action =
  | { type: 'ADD_SLIDE' }
  | { type: 'DELETE_SLIDE'; index: number }
  | { type: 'SET_ACTIVE_SLIDE'; index: number }
  | { type: 'ADD_ELEMENT'; element: SlideElement }
  | { type: 'UPDATE_ELEMENT'; id: string; updates: Partial<SlideElement> }
  | { type: 'DELETE_ELEMENT'; id: string }
  | { type: 'SET_ACTIVE_ELEMENT'; id: string | null }
  | { type: 'LOAD_COURSE'; slides: Slide[]; masterSlides?: Slide[] }
  | { type: 'SET_PREVIEW_MODE'; enabled: boolean }
  | { type: 'PREVIEW_NEXT' }
  | { type: 'PREVIEW_PREV' }
  | { type: 'UPDATE_SLIDE'; index: number; updates: Partial<Slide> }
  | { type: 'SET_PLAYHEAD'; time: number }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'SET_VIEW_MODE'; mode: ViewMode }
  | { type: 'ADD_MASTER_SLIDE' }
  | { type: 'DELETE_MASTER_SLIDE'; index: number }
  | { type: 'SET_ACTIVE_MASTER_SLIDE'; index: number };

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
        return { ...state, masterSlides: newMasters, activeSlideIndex: newMasters.length - 1, activeElementId: null };
      }
      const newSlides = [...state.slides, createSlide()];
      return { ...state, slides: newSlides, activeSlideIndex: newSlides.length - 1, activeElementId: null };
    }
    case 'DELETE_SLIDE': {
      const slides = getActiveSlides(state);
      if (slides.length <= 1) return state;
      const newSlides = slides.filter((_, i) => i !== action.index);
      const newIndex = Math.min(state.activeSlideIndex, newSlides.length - 1);
      return { ...state, ...updateActiveSlides(state, newSlides), activeSlideIndex: newIndex, activeElementId: null };
    }
    case 'SET_ACTIVE_SLIDE':
      return { ...state, activeSlideIndex: action.index, activeElementId: null, playheadTime: 0, isPlaying: false };
    case 'ADD_ELEMENT': {
      const slides = getActiveSlides(state).map((slide, i) =>
        i === state.activeSlideIndex
          ? { ...slide, elements: [...slide.elements, action.element] }
          : slide
      );
      return { ...state, ...updateActiveSlides(state, slides), activeElementId: action.element.id };
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
      return { ...state, ...updateActiveSlides(state, slides), activeElementId: state.activeElementId === action.id ? null : state.activeElementId };
    }
    case 'SET_ACTIVE_ELEMENT':
      return { ...state, activeElementId: action.id };
    case 'LOAD_COURSE':
      return {
        ...initialState,
        slides: action.slides.map(s => ({ ...s, duration: s.duration ?? 5000 })),
        masterSlides: (action.masterSlides ?? []).map(s => ({ ...s, duration: s.duration ?? 5000 })),
        activeSlideIndex: 0,
        activeElementId: null,
        previewMode: false,
      };
    case 'SET_PREVIEW_MODE':
      return { ...state, previewMode: action.enabled, activeElementId: null, activeSlideIndex: action.enabled ? 0 : state.activeSlideIndex, playheadTime: 0, isPlaying: action.enabled, viewMode: action.enabled ? 'main' : state.viewMode };
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
        playheadTime: 0,
        isPlaying: false,
      };
    case 'ADD_MASTER_SLIDE': {
      const newMasters = [...state.masterSlides, createSlide()];
      return { ...state, masterSlides: newMasters, viewMode: 'master', activeSlideIndex: newMasters.length - 1, activeElementId: null };
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
      return { ...state, masterSlides: newMasters, slides: updatedSlides, activeSlideIndex: newIndex, activeElementId: null };
    }
    case 'SET_ACTIVE_MASTER_SLIDE':
      return { ...state, viewMode: 'master', activeSlideIndex: action.index, activeElementId: null, playheadTime: 0, isPlaying: false };
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
