/**
 * In-browser audio transcription using @xenova/transformers (Whisper tiny).
 * The model + tokenizer are downloaded from the Xenova HF mirror on first use
 * and cached by the browser.
 */
import type { Caption } from '@/types/course';

let pipelinePromise: Promise<any> | null = null;

async function getPipeline() {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const transformers = await import('@xenova/transformers');
      // Use only remote models (don't try local /models path that breaks in Vite dev).
      transformers.env.allowLocalModels = false;
      transformers.env.allowRemoteModels = true;
      return transformers.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny');
    })();
  }
  return pipelinePromise;
}

/**
 * Decode a base64 / data-URI audio source to a mono Float32Array at 16kHz,
 * which is what Whisper expects.
 */
async function decodeAudio(src: string): Promise<Float32Array> {
  const res = await fetch(src);
  const arrayBuffer = await res.arrayBuffer();
  const AC: typeof AudioContext =
    (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
  // 16kHz target sample rate (Whisper input spec)
  const ctx = new AC({ sampleRate: 16000 });
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    // Mix down to mono
    if (decoded.numberOfChannels === 1) return decoded.getChannelData(0);
    const ch0 = decoded.getChannelData(0);
    const ch1 = decoded.getChannelData(1);
    const mono = new Float32Array(ch0.length);
    for (let i = 0; i < ch0.length; i++) mono[i] = (ch0[i] + ch1[i]) * 0.5;
    return mono;
  } finally {
    try { await ctx.close(); } catch { /* noop */ }
  }
}

export interface TranscribeOptions {
  onProgress?: (msg: string) => void;
}

/**
 * Run automatic speech recognition on the given base64 audio source. Returns
 * a list of Caption objects with start/end times in seconds and the
 * transcribed text.
 */
export async function transcribeAudio(src: string, opts: TranscribeOptions = {}): Promise<Caption[]> {
  opts.onProgress?.('Loading model…');
  const asr = await getPipeline();
  opts.onProgress?.('Decoding audio…');
  const audio = await decodeAudio(src);
  opts.onProgress?.('Transcribing…');
  const result = await asr(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
  });
  // The pipeline returns either `{ chunks: [...] }` (with timestamps) or
  // `{ text }`. Map chunks into Caption objects.
  const chunks: Array<{ timestamp: [number | null, number | null]; text: string }> =
    Array.isArray(result?.chunks) ? result.chunks : [];
  const captions: Caption[] = chunks
    .map((c) => ({
      startTime: typeof c.timestamp?.[0] === 'number' ? c.timestamp[0] : 0,
      endTime: typeof c.timestamp?.[1] === 'number' ? c.timestamp[1] : 0,
      text: (c.text ?? '').trim(),
    }))
    .filter((c) => c.text.length > 0);

  if (captions.length === 0 && typeof result?.text === 'string' && result.text.trim().length > 0) {
    captions.push({ startTime: 0, endTime: 0, text: result.text.trim() });
  }
  return captions;
}
