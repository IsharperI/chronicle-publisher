import React, { createContext, useContext, useReducer, type Dispatch } from 'react';
import type { CourseState, Slide, SlideElement } from '@/types/course';

const createSlide = (): Slide => ({
  id: crypto.randomUUID(),
  elements: [],
});

const initialState: CourseState = {
  slides: [createSlide()],
  activeSlideIndex: 0,
  activeElementId: null,
  previewMode: false,
};

type Action =
  | { type: 'ADD_SLIDE' }
  | { type: 'DELETE_SLIDE'; index: number }
  | { type: 'SET_ACTIVE_SLIDE'; index: number }
  | { type: 'ADD_ELEMENT'; element: SlideElement }
  | { type: 'UPDATE_ELEMENT'; id: string; updates: Partial<SlideElement> }
  | { type: 'DELETE_ELEMENT'; id: string }
  | { type: 'SET_ACTIVE_ELEMENT'; id: string | null }
  | { type: 'LOAD_COURSE'; slides: Slide[] }
  | { type: 'SET_PREVIEW_MODE'; enabled: boolean }
  | { type: 'PREVIEW_NEXT' }
  | { type: 'PREVIEW_PREV' };

function courseReducer(state: CourseState, action: Action): CourseState {
  switch (action.type) {
    case 'ADD_SLIDE': {
      const newSlides = [...state.slides, createSlide()];
      return { ...state, slides: newSlides, activeSlideIndex: newSlides.length - 1, activeElementId: null };
    }
    case 'DELETE_SLIDE': {
      if (state.slides.length <= 1) return state;
      const newSlides = state.slides.filter((_, i) => i !== action.index);
      const newIndex = Math.min(state.activeSlideIndex, newSlides.length - 1);
      return { ...state, slides: newSlides, activeSlideIndex: newIndex, activeElementId: null };
    }
    case 'SET_ACTIVE_SLIDE':
      return { ...state, activeSlideIndex: action.index, activeElementId: null };
    case 'ADD_ELEMENT': {
      const slides = state.slides.map((slide, i) =>
        i === state.activeSlideIndex
          ? { ...slide, elements: [...slide.elements, action.element] }
          : slide
      );
      return { ...state, slides, activeElementId: action.element.id };
    }
    case 'UPDATE_ELEMENT': {
      const slides = state.slides.map((slide, i) =>
        i === state.activeSlideIndex
          ? {
              ...slide,
              elements: slide.elements.map((el) =>
                el.id === action.id ? { ...el, ...action.updates } as SlideElement : el
              ),
            }
          : slide
      );
      return { ...state, slides };
    }
    case 'DELETE_ELEMENT': {
      const slides = state.slides.map((slide, i) =>
        i === state.activeSlideIndex
          ? { ...slide, elements: slide.elements.filter((el) => el.id !== action.id) }
          : slide
      );
      return { ...state, slides, activeElementId: state.activeElementId === action.id ? null : state.activeElementId };
    }
    case 'SET_ACTIVE_ELEMENT':
      return { ...state, activeElementId: action.id };
    case 'LOAD_COURSE':
      return { ...initialState, slides: action.slides, activeSlideIndex: 0, activeElementId: null, previewMode: false };
    case 'SET_PREVIEW_MODE':
      return { ...state, previewMode: action.enabled, activeElementId: null, activeSlideIndex: action.enabled ? 0 : state.activeSlideIndex };
    case 'PREVIEW_NEXT':
      return { ...state, activeSlideIndex: Math.min(state.activeSlideIndex + 1, state.slides.length - 1) };
    case 'PREVIEW_PREV':
      return { ...state, activeSlideIndex: Math.max(state.activeSlideIndex - 1, 0) };
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
