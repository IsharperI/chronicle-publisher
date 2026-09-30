/**
 * Pure helpers for text-to-speech narration: pulling the voice-over script out
 * of slide notes, stitching per-sentence audio into one track with caption
 * timings, and compressing it to MP3. No browser APIs here, so it's unit-testable.
 */
import { Mp3Encoder } from '@breezystack/lamejs';
import type { Caption } from '@/types/course';

/** One synthesized sentence from the TTS engine. */
export interface SpeechSegment {
  text: string;
  samples: Float32Array;
  sampleRate: number;
}

export interface BuiltNarration {
  samples: Float32Array;
  sampleRate: number;
  /** Seconds. */
  duration: number;
  captions: Caption[];
}

/** Silence inserted between sentences, in seconds. */
export const SENTENCE_GAP = 0.25;

/** Name given to generated narration audio, so it can be found and replaced later. */
export const TTS_AUDIO_NAME = 'Narration (text-to-speech)';

/**
 * Extract the voice-over script from slide notes. Blueprint slides store it as
 * "Narration:\n<script>\n\nSource: ...". Returns '' when there is none.
 */
export function extractNarration(notes: string | undefined): string {
  if (!notes) return '';
  const m = notes.match(/(?:^|\n)Narration:\s*\n([\s\S]*?)(?:\n\s*\nSource:|$)/);
  return m ? m[1].trim() : '';
}

/** Join sentence audio into one track (with short gaps) and time a caption to each sentence. */
export function buildNarration(segments: SpeechSegment[], gap = SENTENCE_GAP): BuiltNarration {
  const sampleRate = segments[0]?.sampleRate ?? 24000;
  const gapSamples = Math.round(gap * sampleRate);
  const total = segments.reduce((n, s, i) => n + s.samples.length + (i > 0 ? gapSamples : 0), 0);
  const samples = new Float32Array(total);
  const captions: Caption[] = [];
  let offset = 0;
  segments.forEach((seg, i) => {
    if (i > 0) offset += gapSamples;
    samples.set(seg.samples, offset);
    const start = offset / sampleRate;
    offset += seg.samples.length;
    const text = seg.text.trim();
    if (text) captions.push({ startTime: round(start), endTime: round(offset / sampleRate), text });
  });
  return { samples, sampleRate, duration: round(total / sampleRate), captions };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Float PCM (-1..1) → 16-bit PCM. */
export function floatToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Encode mono PCM to MP3 (~6 KB per second at 48 kbps, versus ~48 KB for WAV). */
export function encodeMp3(samples: Float32Array, sampleRate: number, kbps = 48): Uint8Array {
  const encoder = new Mp3Encoder(1, sampleRate, kbps);
  const pcm = floatToInt16(samples);
  const chunks: Uint8Array[] = [];
  const BLOCK = 1152;
  for (let i = 0; i < pcm.length; i += BLOCK) {
    const out = encoder.encodeBuffer(pcm.subarray(i, i + BLOCK));
    if (out.length) chunks.push(new Uint8Array(out));
  }
  const end = encoder.flush();
  if (end.length) chunks.push(new Uint8Array(end));
  const size = chunks.reduce((n, c) => n + c.length, 0);
  const mp3 = new Uint8Array(size);
  let pos = 0;
  for (const c of chunks) {
    mp3.set(c, pos);
    pos += c.length;
  }
  return mp3;
}

/** Bytes → data URI, the format Chronicle stores slide audio in. */
export function toDataUrl(bytes: Uint8Array, mime = 'audio/mpeg'): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
