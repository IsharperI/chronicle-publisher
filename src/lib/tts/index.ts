/**
 * Text-to-speech for slide narration, using the free Kokoro voice model in the
 * browser (see ttsWorker.ts). Produces a SlideAudio with MP3 audio and
 * sentence-level captions, ready to add to a slide.
 */
import type { SlideAudio } from '@/types/course';
import { buildNarration, encodeMp3, toDataUrl, TTS_AUDIO_NAME, type SpeechSegment } from './narration';

export { extractNarration, TTS_AUDIO_NAME } from './narration';

/** Best-rated Kokoro English voices (Kokoro's own quality grades, best first per group). */
export const VOICES = [
  { id: 'af_heart', label: 'Heart (US English, female)' },
  { id: 'af_bella', label: 'Bella (US English, female)' },
  { id: 'af_nicole', label: 'Nicole (US English, female, soft)' },
  { id: 'am_michael', label: 'Michael (US English, male)' },
  { id: 'am_fenrir', label: 'Fenrir (US English, male)' },
  { id: 'am_puck', label: 'Puck (US English, male)' },
  { id: 'bf_emma', label: 'Emma (UK English, female)' },
  { id: 'bm_george', label: 'George (UK English, male)' },
  { id: 'bm_fable', label: 'Fable (UK English, male)' },
] as const;

export const DEFAULT_VOICE = 'af_heart';
const VOICE_KEY = 'chronicle.tts.voice';

export function getVoicePref(): string {
  try {
    const v = localStorage.getItem(VOICE_KEY);
    if (v && VOICES.some((x) => x.id === v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_VOICE;
}

export function setVoicePref(voice: string): void {
  try {
    localStorage.setItem(VOICE_KEY, voice);
  } catch {
    /* ignore */
  }
}

export type TtsProgress =
  | { stage: 'loading'; progress: number | null }
  | { stage: 'speaking'; done: number; total: number }
  | { stage: 'encoding' };

export interface TtsOptions {
  voice?: string;
  speed?: number;
  onProgress?: (p: TtsProgress) => void;
}

/** Rough sentence count, only used to show "sentence 2 of 5". */
export function countSentences(text: string): number {
  return Math.max(1, text.split(/(?<=[.!?…])\s+|\n+/).filter((s) => s.trim()).length);
}

type Synthesizer = (text: string, opts: TtsOptions) => Promise<SpeechSegment[]>;

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (s: SpeechSegment[]) => void; reject: (e: Error) => void; opts: TtsOptions; total: number }>();

/**
 * Safety net: if the engine reports no progress for this long, give up and
 * restart it rather than showing a spinner forever. Every progress message
 * (download %, each finished sentence) resets the clock.
 */
export const STALL_TIMEOUT_MS = 3 * 60_000;
let stallTimer: ReturnType<typeof setTimeout> | null = null;

function resetStallTimer() {
  if (stallTimer) clearTimeout(stallTimer);
  stallTimer = pending.size
    ? setTimeout(() => failAll(new Error('the voice engine stopped responding (no progress for 3 minutes). Please try again.')), STALL_TIMEOUT_MS)
    : null;
}

function failAll(err: Error) {
  pending.forEach((j) => j.reject(err));
  pending.clear();
  worker?.terminate();
  worker = null;
  resetStallTimer();
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./ttsWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data;
    const job = pending.get(msg.id);
    if (!job) return;
    resetStallTimer();
    if (msg.type === 'status') {
      if (msg.stage === 'loading') job.opts.onProgress?.({ stage: 'loading', progress: msg.progress });
      else job.opts.onProgress?.({ stage: 'speaking', done: msg.done, total: Math.max(job.total, msg.done) });
    } else if (msg.type === 'done') {
      pending.delete(msg.id);
      resetStallTimer();
      job.resolve(msg.segments);
    } else if (msg.type === 'error') {
      pending.delete(msg.id);
      resetStallTimer();
      job.reject(new Error(friendlyError(msg.message)));
    }
  };
  worker.onerror = (e) => failAll(new Error(e.message || 'The text-to-speech engine failed to start.'));
  return worker;
}

/** Turn low-level failures into something an author can act on. */
export function friendlyError(message: string): string {
  if (/failed to fetch|networkerror|network error|load failed|err_|403|404/i.test(message)) {
    return "the voice model couldn't be downloaded. Check your internet connection and try again (it downloads once, then works offline).";
  }
  return message;
}

const workerSynthesizer: Synthesizer = (text, opts) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, opts, total: countSentences(text) });
    resetStallTimer();
    getWorker().postMessage({ type: 'generate', id, text, voice: opts.voice ?? DEFAULT_VOICE, speed: opts.speed ?? 1 });
  });

let synthesizer: Synthesizer = workerSynthesizer;

/** Swap the speech engine (used by tests; the app always uses Kokoro). */
export function setSynthesizer(fn: Synthesizer | null): void {
  synthesizer = fn ?? workerSynthesizer;
}

/** Generate narration for a script and return it as slide audio with captions. */
export async function generateNarrationAudio(script: string, opts: TtsOptions = {}): Promise<SlideAudio> {
  const text = script.trim();
  if (!text) throw new Error('There is no voice-over script to read.');
  const segments = await synthesizer(text, opts);
  if (!segments.length) throw new Error('No speech was generated.');
  opts.onProgress?.({ stage: 'encoding' });
  // Let the "encoding" status paint before the (brief) synchronous encode.
  await new Promise((r) => setTimeout(r, 0));
  const built = buildNarration(segments);
  const mp3 = encodeMp3(built.samples, built.sampleRate);
  return {
    id: crypto.randomUUID(),
    name: TTS_AUDIO_NAME,
    src: toDataUrl(mp3),
    duration: built.duration,
    captions: built.captions,
  };
}

/** Human-readable status line for a progress update. */
export function describeProgress(p: TtsProgress | null): string {
  if (!p) return 'Starting…';
  if (p.stage === 'loading') {
    return p.progress == null
      ? 'Loading the voice…'
      : `Downloading the voice model (first time only): ${p.progress}%`;
  }
  if (p.stage === 'speaking') {
    return p.done === 0 ? 'Generating speech…' : `Generating speech: sentence ${Math.min(p.done, p.total)} of ${p.total}`;
  }
  return 'Finishing audio…';
}
