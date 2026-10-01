/**
 * Pure helpers for text-to-speech narration: pulling the voice-over script out
 * of slide notes, stitching per-sentence audio into one track with caption
 * timings, and compressing it to MP3. No browser APIs here, so it's unit-testable.
 */
import { Mp3Encoder } from '@breezystack/lamejs';
import type { Caption } from '@/types/course';

/** One synthesized chunk (usually a sentence) from the TTS engine. */
export interface SpeechSegment {
  text: string;
  samples: Float32Array;
  sampleRate: number;
  /** True when a paragraph break follows this chunk (longer pause). */
  endsParagraph?: boolean;
}

/** A piece of script to synthesize on its own. */
export interface Chunk {
  text: string;
  /** True when this chunk ends a paragraph (a blank line follows). */
  endsParagraph: boolean;
}

export interface BuiltNarration {
  samples: Float32Array;
  sampleRate: number;
  /** Seconds. */
  duration: number;
  captions: Caption[];
}

/** Pause after a sentence, in seconds (matches MyCanary). */
export const SENTENCE_PAUSE = 0.42;
/** Pause after a paragraph (blank line in the script), in seconds. */
export const PARAGRAPH_PAUSE = 0.7;
/** Captions are split so none is longer than this many words or seconds. */
export const CAPTION_MAX_WORDS = 10;
export const CAPTION_MAX_SECONDS = 7;
/** MP3 bitrate for narration (matches MyCanary's quality). */
export const MP3_KBPS = 128;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Split a script into sentence-level chunks to synthesize one at a time.
 * Splits only at . ! ? and paragraph breaks, never at , ; : (short
 * fragments synthesized on their own sound slurred). Fragments under four
 * words are merged into the previous sentence.
 */
export function segmentScript(script: string): Chunk[] {
  const paragraphs = script
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: Chunk[] = [];
  paragraphs.forEach((paragraph, pIndex) => {
    const flat = paragraph.replace(/\s+/g, ' ').trim();
    const sentences = (flat.match(/[^.!?]+[.!?]+["')\]”’]*|[^.!?]+$/g) ?? [flat]).map((s) => s.trim()).filter(Boolean);
    const merged: string[] = [];
    for (const sentence of sentences) {
      if (countWords(sentence) < 4 && merged.length > 0) merged[merged.length - 1] += ` ${sentence}`;
      else merged.push(sentence);
    }
    merged.forEach((text, i) =>
      chunks.push({ text, endsParagraph: i === merged.length - 1 && pIndex < paragraphs.length - 1 }),
    );
  });
  return chunks;
}

/**
 * Captions for one synthesized chunk. Long chunks are split into several
 * captions, sharing the chunk's time in proportion to their word counts.
 */
export function cuesForChunk(text: string, start: number, end: number): Caption[] {
  const duration = Math.max(0.001, end - start);
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= CAPTION_MAX_WORDS && duration <= CAPTION_MAX_SECONDS) {
    return [{ startTime: round(start), endTime: round(end), text: text.trim() }];
  }
  const parts = Math.max(Math.ceil(words.length / CAPTION_MAX_WORDS), Math.ceil(duration / CAPTION_MAX_SECONDS));
  const perPart = Math.ceil(words.length / parts);
  const cues: Caption[] = [];
  let cursor = start;
  for (let i = 0; i < words.length; i += perPart) {
    const group = words.slice(i, i + perPart);
    const last = i + perPart >= words.length;
    const cueEnd = last ? end : cursor + (group.length / words.length) * duration;
    cues.push({ startTime: round(cursor), endTime: round(cueEnd), text: group.join(' ') });
    cursor = cueEnd;
  }
  return cues;
}

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

/**
 * Join chunk audio into one track with natural pauses (longer after a
 * paragraph) and caption each chunk, splitting long ones.
 */
export function buildNarration(segments: SpeechSegment[]): BuiltNarration {
  const sampleRate = segments[0]?.sampleRate ?? 24000;
  const pauses = segments.map((seg, i) =>
    i === segments.length - 1 ? 0 : Math.round((seg.endsParagraph ? PARAGRAPH_PAUSE : SENTENCE_PAUSE) * sampleRate),
  );
  const total = segments.reduce((n, seg, i) => n + seg.samples.length + pauses[i], 0);
  const samples = new Float32Array(total);
  const captions: Caption[] = [];
  let offset = 0;
  segments.forEach((seg, i) => {
    samples.set(seg.samples, offset);
    const start = offset / sampleRate;
    offset += seg.samples.length;
    if (seg.text.trim()) captions.push(...cuesForChunk(seg.text, start, offset / sampleRate));
    offset += pauses[i];
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
    out[i] = Math.round(s * 32767);
  }
  return out;
}

/** Encode mono PCM to MP3 (~16 KB per second at 128 kbps). */
export function encodeMp3(samples: Float32Array, sampleRate: number, kbps = MP3_KBPS): Uint8Array {
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
