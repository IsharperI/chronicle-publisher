import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildPlayerHtml } from '@/lib/publish/runtime/player';
import { buildScorm12Runtime } from '@/lib/publish/runtime/scorm12';
import type { PublishOptions } from '@/lib/publish/types';

/**
 * Audio timing in the exported player: clips start at their start time, and a
 * layer's audio starts when the layer is shown and stops when it's hidden.
 */

class FakeAudio {
  static all: FakeAudio[] = [];
  src = ''; preload = ''; paused = true; currentTime = 0;
  constructor() { FakeAudio.all.push(this); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}

const button = (id: string, layer: string) => ({
  id, type: 'shape', shapeType: 'rectangle', x: 0, y: 0, width: 100, height: 40, startTime: 0, duration: 10000,
  triggers: [{ event: 'onClick', action: 'showLayer', targetId: layer }],
  animationIn: 'none', animationOut: 'none', entranceDuration: 500, exitDuration: 500, fillColor: '#00f', borderColor: '#00f', borderWidth: 0,
});
const closer = (id: string, layer: string) => ({ ...button(id, layer), triggers: [{ event: 'onClick', action: 'hideLayer', targetId: layer }] });
const clip = (id: string, startTime?: number) => ({ id, name: id, src: `data:audio/mpeg;base64,${btoa(id)}`, duration: 2, captions: [], ...(startTime ? { startTime } : {}) });

const COURSE = {
  slides: [{
    id: 'slide-1', title: 'One', duration: 10000,
    audio: [clip('intro'), clip('later', 3)],
    // The published data has every layer's elements flattened into `elements`, as the editor keeps it.
    elements: [button('open', 'pop'), closer('close', 'pop')],
    layers: [
      { id: 'base', name: 'Base Layer', visible: true, locked: false, elements: [button('open', 'pop')] },
      { id: 'pop', name: 'Pop', visible: false, locked: false, elements: [closer('close', 'pop')], audio: [clip('pop-sound', 0.5)] },
    ],
  }],
  masterSlides: [],
  variables: [],
  playerSettings: { courseTitle: 'Audio test', navigationMode: 'free', backgroundColor: '#000', buttonColor: '#3b82f6' },
  courseSettings: { canvasDimensions: { width: 1024, height: 768 }, themeColors: ['#1e3a5f', '#3b6ea5', '#2a9d8f', '#f4a261', '#1f2937', '#f9fafb'], transition: { type: 'none', duration: 0 } },
};
const OPTS: PublishOptions = {
  format: 'scorm12', courseTitle: 'T', description: '', filename: 'x.zip', identifier: 'i', version: '1', duration: '',
  keywords: '', lessonTitle: 'L', lessonIdentifier: 'l', reportStatus: 'passed-failed', completion: { mode: 'percent', percent: 100 },
};

const byName = (name: string) => FakeAudio.all.filter((a) => a.src.includes(btoa(name)));
const playing = (name: string) => byName(name).some((a) => !a.paused);

describe('exported player audio timing', () => {
  beforeEach(() => {
    FakeAudio.all = [];
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    (window as unknown as { Audio: unknown }).Audio = FakeAudio;
    (window as unknown as { API: unknown }).API = {
      LMSInitialize: () => 'true', LMSFinish: () => 'true', LMSCommit: () => 'true', LMSGetValue: () => '', LMSSetValue: () => 'true',
      LMSGetLastError: () => '0', LMSGetErrorString: () => '', LMSGetDiagnostic: () => '',
    };
    const html = buildPlayerHtml(COURSE as never, OPTS, buildScorm12Runtime());
    const doc = new DOMParser().parseFromString(html, 'text/html');
    document.body.innerHTML = doc.body.innerHTML;
    for (const s of Array.from(doc.querySelectorAll('script'))) new Function(s.textContent ?? '')();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('starts each clip at its start time', () => {
    vi.advanceTimersByTime(500);
    expect(playing('intro')).toBe(true);
    expect(playing('later')).toBe(false);
    vi.advanceTimersByTime(3000); // 3.5 s
    expect(playing('later')).toBe(true);
    expect(playing('intro')).toBe(false); // its 2 seconds are over
  });

  it("plays a layer's audio from when the layer is shown, and stops it when hidden", () => {
    vi.advanceTimersByTime(4000);
    expect(byName('pop-sound')).toHaveLength(0);
    (document.querySelector('[data-el-id="open"]') as HTMLElement).click();
    vi.advanceTimersByTime(200);
    expect(playing('pop-sound')).toBe(false); // starts 0.5 s after the layer is shown
    vi.advanceTimersByTime(500);
    expect(playing('pop-sound')).toBe(true);
    (document.querySelector('[data-el-id="close"]') as HTMLElement).click();
    vi.advanceTimersByTime(50);
    expect(playing('pop-sound')).toBe(false);
  });
});
