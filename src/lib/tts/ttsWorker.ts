/**
 * Web Worker running the Kokoro text-to-speech model entirely in the browser.
 * The model (~90 MB, quantized) downloads once from Hugging Face on first use
 * and is then cached by the browser. Runs off the main thread so the editor
 * stays responsive while speech is generated.
 *
 * Always runs on the CPU (WebAssembly), the same way MyCanary does. Kokoro's
 * WebGPU path produces garbled speech on many laptop GPUs (Intel Iris Xe,
 * AMD Radeon integrated graphics; see microsoft/onnxruntime#29807), while the
 * WebAssembly path is clean everywhere.
 */
import { KokoroTTS } from 'kokoro-js';

type Incoming = { type: 'generate'; id: number; chunks: string[]; voice: string; speed: number };
type Outgoing =
  | { type: 'status'; id: number; stage: 'loading'; progress: number | null }
  | { type: 'status'; id: number; stage: 'speaking'; done: number }
  | { type: 'done'; id: number; segments: { text: string; samples: Float32Array; sampleRate: number }[] }
  | { type: 'error'; id: number; message: string };

const ctx = self as unknown as {
  postMessage: (msg: Outgoing, transfer?: Transferable[]) => void;
  onmessage: ((e: MessageEvent<Incoming>) => void) | null;
};

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let ttsPromise: Promise<KokoroTTS> | null = null;
let loadingFor = 0;

function load(): Promise<KokoroTTS> {
  if (ttsPromise) return ttsPromise;
  const progress_callback = (p: { status?: string; progress?: number; file?: string }) => {
    // Report the model weights' download progress (the only large file).
    if (p.status === 'progress' && typeof p.progress === 'number' && p.file?.endsWith('.onnx')) {
      ctx.postMessage({ type: 'status', id: loadingFor, stage: 'loading', progress: Math.round(p.progress) });
    }
  };
  ttsPromise = (async () => {
    try {
      return await KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'wasm', progress_callback });
    } catch {
      // Some browsers can't create a session for the quantized model; retry at
      // full precision (larger download, same voice).
      return KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'fp32', device: 'wasm', progress_callback });
    }
  })();
  ttsPromise.catch(() => {
    ttsPromise = null; // allow a retry after e.g. a network failure
  });
  return ttsPromise;
}

// Requests are handled one at a time, in order.
let queue: Promise<void> = Promise.resolve();

ctx.onmessage = (e) => {
  const msg = e.data;
  if (msg.type !== 'generate') return;
  queue = queue.then(() => handle(msg));
};

async function handle(msg: Incoming) {
  const { id } = msg;
  try {
    loadingFor = id;
    ctx.postMessage({ type: 'status', id, stage: 'loading', progress: null });
    const tts = await load();
    const segments: { text: string; samples: Float32Array; sampleRate: number }[] = [];
    ctx.postMessage({ type: 'status', id, stage: 'speaking', done: 0 });
    // One generate() call per sentence-level chunk (split on the main thread),
    // which also gives per-chunk caption timing.
    for (const text of msg.chunks) {
      const audio = await tts.generate(text, { voice: msg.voice as never, speed: msg.speed });
      segments.push({ text, samples: audio.audio as Float32Array, sampleRate: audio.sampling_rate });
      ctx.postMessage({ type: 'status', id, stage: 'speaking', done: segments.length });
    }
    ctx.postMessage({ type: 'done', id, segments }, segments.map((s) => s.samples.buffer));
  } catch (err) {
    ctx.postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
}
