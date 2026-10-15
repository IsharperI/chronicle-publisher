import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyNavButtonTrigger, navButtonLabel, navButtonOf, NAV_BUTTONS_ON } from '@/lib/navButtons';
import { sanitizeSlides } from '@/lib/sanitize';
import { buildPlayerHtml } from '@/lib/publish/runtime/player';
import { buildScorm12Runtime } from '@/lib/publish/runtime/scorm12';
import type { PublishOptions } from '@/lib/publish/types';
import type { ShapeElement, Trigger } from '@/types/course';

const btn = (targetId: string, state: string): Trigger => ({ event: 'onClick', action: 'setPlayerButton', targetId, state });

describe('lib/navButtons', () => {
  it('reads which button a trigger targets', () => {
    expect(navButtonOf(btn('next', 'Disabled'))).toBe('next');
    expect(navButtonOf(btn('prev', 'Normal'))).toBe('prev');
    expect(navButtonOf(btn('menu', 'Disabled'))).toBeNull();
    expect(navButtonOf({ action: 'changeState', targetId: 'next' })).toBeNull();
  });

  it('turns buttons off and back on, leaving the other one alone', () => {
    const a = applyNavButtonTrigger(NAV_BUTTONS_ON, btn('next', 'Disabled'));
    expect(a).toEqual({ next: true, prev: false });
    expect(applyNavButtonTrigger(a, btn('prev', 'Hidden'))).toEqual({ next: true, prev: true });
    expect(applyNavButtonTrigger(a, btn('next', 'Normal'))).toEqual({ next: false, prev: false });
    expect(applyNavButtonTrigger(a, btn('next', 'Disabled'))).toBe(a); // no change, same object
    expect(applyNavButtonTrigger({ ...a, visit: 3 }, btn('prev', 'Disabled'))).toEqual({ next: true, prev: true, visit: 3 });
  });

  it('labels triggers in plain words', () => {
    expect(navButtonLabel(btn('next', 'Disabled'))).toBe("Disable the player's Next button");
    expect(navButtonLabel(btn('prev', 'Normal'))).toBe("Enable the player's Prev button");
  });

  it('survives saving and loading a course', () => {
    const el = shape('x', { triggers: [btn('next', 'Disabled'), { event: 'onClick', action: 'jumpToPrevious', targetId: '' }] });
    const [s] = sanitizeSlides([{ id: 's', title: 'S', duration: 5000, elements: [el], layers: [{ id: 'base', name: 'Base', visible: true, locked: false, elements: [el] }] }]);
    expect(s.elements[0].triggers).toEqual([
      { event: 'onClick', action: 'setPlayerButton', targetId: 'next', state: 'Disabled' },
      { event: 'onClick', action: 'jumpToPrevious', targetId: '' },
    ]);
  });
});

function shape(id: string, extra: Partial<ShapeElement> = {}): ShapeElement {
  return {
    id, type: 'shape', shapeType: 'rectangle', x: 0, y: 0, width: 100, height: 40, startTime: 0, duration: 10000,
    triggers: [], animationIn: 'none', animationOut: 'none', entranceDuration: 500, exitDuration: 500,
    fillColor: '#0000ff', borderColor: '#0000ff', borderWidth: 0, ...extra,
  };
}

describe('exported player Next/Prev control', () => {
  const OPTS: PublishOptions = {
    format: 'scorm12', courseTitle: 'T', description: '', filename: 'x.zip', identifier: 'i', version: '1', duration: '',
    keywords: '', lessonTitle: 'L', lessonIdentifier: 'l', reportStatus: 'passed-failed', completion: { mode: 'percent', percent: 100 },
  };
  const slide = (id: string, els: ShapeElement[]) => ({
    id, title: id, duration: 10000, elements: els, layers: [{ id: `${id}-base`, name: 'Base', visible: true, locked: false, elements: els }],
  });
  const COURSE = {
    slides: [
      slide('one', [shape('first')]),
      slide('two', [
        // Storyline pattern: Next is off when the slide starts, back on once the learner has done something.
        shape('start', { triggers: [{ event: 'timelineStart', action: 'setPlayerButton', targetId: 'next', state: 'Disabled' }] }),
        shape('done', { triggers: [btn('next', 'Normal')] }),
        shape('noPrev', { triggers: [btn('prev', 'Disabled')] }),
        shape('back', { triggers: [{ event: 'onClick', action: 'jumpToPrevious', targetId: '' }] }),
      ]),
      slide('three', [shape('last')]),
    ],
    masterSlides: [], variables: [],
    playerSettings: { courseTitle: 'Nav', navigationMode: 'free', backgroundColor: '#000', buttonColor: '#3b82f6' },
    courseSettings: { canvasDimensions: { width: 1024, height: 768 }, themeColors: ['#1e3a5f', '#3b6ea5', '#2a9d8f', '#f4a261', '#1f2937', '#f9fafb'], transition: { type: 'none', duration: 0 } },
  };
  const node = (id: string) => document.querySelector(`[data-el-id="${id}"]`) as HTMLElement | null;
  const click = (el: HTMLElement | null) => el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const next = () => document.getElementById('next') as HTMLButtonElement;
  const prev = () => document.getElementById('prev') as HTMLButtonElement;
  const press = (b: HTMLButtonElement) => { b.click(); vi.advanceTimersByTime(50); };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    (window as unknown as { API: unknown }).API = {
      LMSInitialize: () => 'true', LMSFinish: () => 'true', LMSCommit: () => 'true', LMSGetValue: () => '', LMSSetValue: () => 'true',
      LMSGetLastError: () => '0', LMSGetErrorString: () => '', LMSGetDiagnostic: () => '',
    };
    const doc = new DOMParser().parseFromString(buildPlayerHtml(COURSE as never, OPTS, buildScorm12Runtime()), 'text/html');
    document.body.innerHTML = doc.body.innerHTML;
    for (const s of Array.from(doc.querySelectorAll('script'))) new Function(s.textContent ?? '')();
    vi.advanceTimersByTime(100);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('disables Next when the slide starts and enables it from a trigger', () => {
    expect(node('first')).not.toBeNull();
    expect(next().disabled).toBe(false);
    press(next());
    expect(node('start')).not.toBeNull();
    expect(next().disabled).toBe(true);
    press(next()); // ignored while off
    expect(node('start')).not.toBeNull();
    click(node('done'));
    expect(next().disabled).toBe(false);
    press(next());
    expect(node('last')).not.toBeNull();
  });

  it('disables Prev, and "jump to previous slide" still goes back', () => {
    press(next());
    expect(prev().disabled).toBe(false);
    click(node('noPrev'));
    expect(prev().disabled).toBe(true);
    press(prev());
    expect(node('start')).not.toBeNull();
    click(node('back'));
    vi.advanceTimersByTime(50);
    expect(node('first')).not.toBeNull();
    // Buttons come back on for each slide; the slide's own trigger turns Next off again.
    expect(next().disabled).toBe(false);
    press(next());
    expect(next().disabled).toBe(true);
    expect(prev().disabled).toBe(false);
  });
});
