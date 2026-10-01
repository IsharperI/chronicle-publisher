import { describe, it, expect, vi, afterEach } from 'vitest';

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
    const result = tts.generateNarrationAudio('Hello there, this is a test.');
    const assertion = expect(result).rejects.toThrow(/stopped responding/);
    await vi.advanceTimersByTimeAsync(tts.STALL_TIMEOUT_MS + 10);
    await assertion;
    expect(terminated).toHaveLength(1);
  });

  it('sends the script to the engine as sentence chunks', async () => {
    const posted: { chunks: string[] }[] = [];
    vi.stubGlobal('Worker', class {
      onmessage: unknown = null;
      onerror: unknown = null;
      postMessage(m: { chunks: string[] }) { posted.push(m); }
      terminate() {}
    });
    const tts = await import('@/lib/tts');
    void tts.generateNarrationAudio('Welcome to the course. It covers electrical safety basics.\n\nLet us begin now.').catch(() => {});
    expect(posted[0].chunks).toEqual(['Welcome to the course.', 'It covers electrical safety basics.', 'Let us begin now.']);
  });
});
