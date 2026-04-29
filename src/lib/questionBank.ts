import type { QuizQuestionType, QuizChoice, QuizMatchPair, QuizSortItem } from '@/types/course';

export interface BankQuestion {
  id: string;
  questionType: QuizQuestionType;
  question: string;
  /** For multiple-choice */
  choices?: QuizChoice[];
  singleSelect?: boolean;
  /** For dnd-matching */
  pairs?: QuizMatchPair[];
  /** For dnd-sorting (ordering) */
  sortItems?: QuizSortItem[];
  tags: string[];
  createdAt: number;
}

const KEY = 'chronicle.questionBank.v1';

export function loadBank(): BankQuestion[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (q) => q && typeof q.id === 'string' && typeof q.question === 'string' && typeof q.questionType === 'string',
    );
  } catch {
    return [];
  }
}

export function saveBank(list: BankQuestion[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
