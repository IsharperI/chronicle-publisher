import type { QuizQuestionType, QuizStyleOverrides } from '@/types/course';

/**
 * Quiz template — a saved appearance preset for a particular question type.
 * Templates contain only visual styling; never any question or answer text.
 */
export interface QuizTemplate {
  id: string;
  name: string;
  questionType: QuizQuestionType;
  style: QuizStyleOverrides;
  /** ms timestamp for stable sort. */
  createdAt: number;
}

const STORAGE_KEY = 'chronicle.quizTemplates.v1';

/** Built-in default appearance for a quiz slide. */
export const DEFAULT_QUIZ_STYLE = {
  pageBackgroundColor: 'transparent',
  cardBackgroundColor: '#ffffff',
  textColor: '#0f172a',
  fontFamily: 'inherit',
  questionFontSize: 28,
  optionFontSize: 16,
  optionBackgroundColor: '#ffffff',
  optionBorderColor: '#e2e8f0',
  optionSelectedBorderColor: '#3b82f6',
  optionSelectedBackgroundColor: '#eff6ff',
  buttonColor: '#3b82f6',
  buttonTextColor: '#ffffff',
  cardRadius: 12,
  optionRadius: 8,
} as const;

export type ResolvedQuizStyle = typeof DEFAULT_QUIZ_STYLE;

export function resolveQuizStyle(overrides?: QuizStyleOverrides): ResolvedQuizStyle {
  if (!overrides) return DEFAULT_QUIZ_STYLE;
  return { ...DEFAULT_QUIZ_STYLE, ...overrides } as ResolvedQuizStyle;
}

export function loadTemplates(): QuizTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string' && t.style && typeof t.questionType === 'string');
  } catch {
    return [];
  }
}

export function saveTemplates(list: QuizTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota errors */
  }
}

export function questionTypeLabel(t: QuizQuestionType): string {
  if (t === 'multiple-choice') return 'Multiple Choice';
  if (t === 'dnd-matching') return 'Drag & Drop — Matching';
  return 'Ordering';
}
