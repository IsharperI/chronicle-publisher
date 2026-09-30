import { describe, it, expect, vi, afterEach } from 'vitest';
import { sentenceStream } from '@/lib/tts/sentences';

// The sentence splitter is pure JS; stub Kokoro's heavy engines (the espeak
// phonemizer installs process-wide handlers that crash the test runner).
vi.mock('phonemizer', () => ({ phonemize: async () => [] }));
vi.mock('@huggingface/transformers', () => ({
  StyleTextToSpeech2Model: {}, AutoTokenizer: {}, Tensor: class {}, RawAudio: class {}, env: { backends: { onnx: { wasm: {} } } },
}));

async function collect(stream: AsyncIterable<string>, ms = 2000): Promise<string[] | 'TIMEOUT'> {
  const out: string[] = [];
  const run = (async () => { for await (const s of stream) out.push(s); return out; })();
  return Promise.race([run, new Promise<'TIMEOUT'>((r) => setTimeout(() => r('TIMEOUT'), ms))]);
}

describe('sentenceStream (real Kokoro splitter)', () => {
  it('finishes for a one-sentence script (this used to hang forever)', async () => {
    expect(await collect(sentenceStream('Welcome to the Basic Electrical Theory course.'))).toEqual([
      'Welcome to the Basic Electrical Theory course.',
    ]);
  });
  it('yields every sentence, including the last', async () => {
    expect(await collect(sentenceStream('One way to stay safe is PPE. This includes gloves and boots.'))).toEqual([
      'One way to stay safe is PPE.',
      'This includes gloves and boots.',
    ]);
  });
  it('handles a script with no final punctuation', async () => {
    expect(await collect(sentenceStream('Answer the following question'))).toEqual(['Answer the following question']);
  });
});

describe('stall timeout', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('gives up and restarts the engine if it stops responding', async () => {
    const terminated: boolean[] = [];
    vi.stubGlobal('Worker', class {
      onmessage: unknown = null;
      onerror: unknown = null;
      postMessage() { /* never answers */ }
      terminate() { terminated.push(true); }
    });
    vi.useFakeTimers();
    const tts = await import('@/lib/tts');
    const result = tts.generateNarrationAudio('Hello there.');
    const assertion = expect(result).rejects.toThrow(/stopped responding/);
    await vi.advanceTimersByTimeAsync(tts.STALL_TIMEOUT_MS + 10);
    await assertion;
    expect(terminated).toHaveLength(1);
  });
});
