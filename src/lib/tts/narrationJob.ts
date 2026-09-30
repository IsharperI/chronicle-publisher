/**
 * Background job that narrates a whole course (used after loading a blueprint).
 * Slides are voiced one at a time; each finished slide gets its audio right
 * away, so the author can keep working while the rest are generated.
 */
import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import type { SlideAudio } from '@/types/course';
import { generateNarrationAudio, type TtsProgress } from './index';

export interface NarrationItem {
  slideId: string;
  title: string;
  script: string;
}

export interface NarrationJobState {
  running: boolean;
  total: number;
  /** Slides finished (successfully or not). */
  done: number;
  failed: number;
  currentTitle: string;
  progress: TtsProgress | null;
}

type Dispatch = (action: { type: 'SET_SLIDE_NARRATION'; slideId: string; audio: SlideAudio }) => void;

const IDLE: NarrationJobState = { running: false, total: 0, done: 0, failed: 0, currentTitle: '', progress: null };
let state: NarrationJobState = IDLE;
const listeners = new Set<() => void>();
let jobId = 0;

function set(patch: Partial<NarrationJobState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useNarrationJob(): NarrationJobState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Stop the current job (slides already narrated keep their audio). */
export function cancelNarration(): void {
  if (!state.running) return;
  jobId++;
  set(IDLE);
}

/** Narrate every item in order. Starting a new job cancels any running one. */
export async function startCourseNarration(items: NarrationItem[], dispatch: Dispatch, voice: string): Promise<void> {
  const work = items.filter((i) => i.script.trim());
  const id = ++jobId;
  if (!work.length) {
    set(IDLE);
    return;
  }
  set({ ...IDLE, running: true, total: work.length });
  let failed = 0;
  let consecutiveFailures = 0;
  let lastError = '';

  for (let i = 0; i < work.length; i++) {
    if (id !== jobId) return; // cancelled or replaced
    const item = work[i];
    set({ currentTitle: item.title, progress: null });
    try {
      const audio = await generateNarrationAudio(item.script, {
        voice,
        onProgress: (p) => id === jobId && set({ progress: p }),
      });
      if (id !== jobId) return;
      dispatch({ type: 'SET_SLIDE_NARRATION', slideId: item.slideId, audio });
      consecutiveFailures = 0;
    } catch (e) {
      if (id !== jobId) return;
      failed++;
      consecutiveFailures++;
      lastError = e instanceof Error ? e.message : String(e);
      // If the first slides all fail (e.g. the voice model can't download), stop
      // rather than failing every remaining slide the same way.
      if (consecutiveFailures >= 2 && i + 1 === consecutiveFailures) {
        set(IDLE);
        toast.error('Narration stopped', { description: `The voice couldn't be generated: ${lastError}` });
        return;
      }
    }
    set({ done: i + 1, failed });
  }

  if (id !== jobId) return;
  set(IDLE);
  if (failed) {
    toast.warning(`Narration added to ${work.length - failed} of ${work.length} slides`, {
      description: `${failed} slide(s) failed: ${lastError}. Use Insert → Text to Speech to retry them.`,
    });
  } else {
    toast.success(`Narration added to ${work.length} slides`, { description: 'Each slide was lengthened to fit its voice-over.' });
  }
}
