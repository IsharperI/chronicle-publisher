import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { atSlideStart, childShown, clickState, initialStateOf, routeStateEdit, shownState, watchHolds, withState } from '@/lib/states';
import { sanitizeSlides } from '@/lib/sanitize';
import { courseReducer } from '@/context/CourseContext';
import { buildPlayerHtml } from '@/lib/publish/runtime/player';
import { buildScorm12Runtime } from '@/lib/publish/runtime/scorm12';
import type { PublishOptions } from '@/lib/publish/types';
import type { CourseState, ShapeElement, SlideElement } from '@/types/course';

const shape = (id: string, extra: Partial<ShapeElement> = {}): ShapeElement => ({
  id, type: 'shape', shapeType: 'rectangle', x: 0, y: 0, width: 100, height: 40, startTime: 0, duration: 10000,
  triggers: [], animationIn: 'none', animationOut: 'none', entranceDuration: 500, exitDuration: 500,
  fillColor: '#0000ff', borderColor: '#0000ff', borderWidth: 0, ...extra,
});
const st = (name: string, look: ShapeElement['states'] extends (infer S)[] | undefined ? S extends { look: infer L } ? L : never : never = {}) => ({ name, look });

describe('lib/states', () => {
  const btn = shape('b', { states: [st('Hover', { fillColor: '#ff0000' }), st('Selected', { fillColor: '#00ff00' }), st('Hover Selected', { fillColor: '#0f0f0f' })] });

  it('draws a state with its changes on top of the Normal look', () => {
    expect(withState(btn, 'Hover').fillColor).toBe('#ff0000');
    expect(withState(btn, 'Normal')).toBe(btn);
    expect(withState(btn, 'Missing')).toBe(btn);
  });

  it('shows Hover/Down while the pointer is on it, and combined states when selected', () => {
    expect(shownState(btn, 'Normal', { hover: true })).toBe('Hover');
    expect(shownState(btn, 'Normal', { hover: true, down: true })).toBe('Hover'); // no Down state: stays Hover
    expect(shownState(btn, 'Selected', { hover: true })).toBe('Hover Selected');
    expect(shownState(btn, 'Disabled', { hover: true })).toBe('Disabled');
    expect(shownState(shape('x'), 'Normal', { hover: true })).toBe('Normal');
  });

  it('toggles Selected on click, with button sets acting like radio buttons', () => {
    const a = shape('a', { states: [st('Selected')], buttonSet: 'g' });
    const b = shape('b', { states: [st('Selected')], buttonSet: 'g' });
    const c = shape('c', { states: [st('Selected'), st('Visited')] });
    expect(clickState(a, {}, [a, b])).toEqual({ a: 'Selected' });
    expect(clickState(b, { a: 'Selected' }, [a, b])).toEqual({ b: 'Selected', a: 'Normal' });
    expect(clickState(a, { a: 'Selected' }, [a, b])).toEqual({}); // radio buttons stay on
    expect(clickState(c, { c: 'Selected' }, [c])).toEqual({ c: 'Visited' });
    expect(clickState(shape('v', { states: [st('Visited')] }), {}, [])).toEqual({ v: 'Visited' });
    expect(clickState(a, { a: 'Disabled' }, [a])).toEqual({});
  });

  it('tests "when state changes" watches (all / any / not)', () => {
    expect(watchHolds({ ids: ['a', 'b'], state: 'Visited' }, { a: 'Visited' })).toBe(false);
    expect(watchHolds({ ids: ['a', 'b'], state: 'Visited', any: true }, { a: 'Visited' })).toBe(true);
    expect(watchHolds({ ids: ['a'], state: 'Selected', not: true }, {})).toBe(true);
  });

  it('routes look edits into the state being edited, and the rest onto the element', () => {
    const out = routeStateEdit(btn, 'Hover', { fillColor: '#123456', x: 50, text: 'Hi' });
    expect(out.x).toBe(50);
    expect(out.fillColor).toBe('#0000ff');
    expect(out.states!.find((s) => s.name === 'Hover')!.look).toEqual({ fillColor: '#123456', text: 'Hi' });
    const added = routeStateEdit(shape('n'), 'Visited', { borderColor: '#000000' });
    expect(added.states).toEqual([{ name: 'Visited', look: { borderColor: '#000000' } }]);
  });

  it('shows objects inside states only in those states', () => {
    const tick = shape('t', { stateParent: { id: 'b', states: ['Selected'] } });
    expect(childShown(tick, 'Selected')).toBe(true);
    expect(childShown(tick, 'Normal')).toBe(false);
    expect(childShown(tick, undefined)).toBe(false);
    const parent = shape('b', { initialState: 'Selected', states: [st('Selected', { fillColor: '#00ff00' })] });
    const gone = shape('g', { initialState: 'Hidden', states: [st('Hidden')] });
    expect(atSlideStart([parent, tick, gone]).map((e) => [e.id, (e as ShapeElement).fillColor])).toEqual([['b', '#00ff00'], ['t', '#0000ff']]);
  });

  it('uses the initial state only when the element has it', () => {
    expect(initialStateOf(shape('h', { initialState: 'Hidden', states: [st('Hidden')] }))).toBe('Hidden');
    expect(initialStateOf(shape('h', { initialState: 'Gone' }))).toBe('Normal');
  });
});

describe('saved courses', () => {
  it('turns old hover colours into a Hover state', () => {
    const [slide] = sanitizeSlides([{ id: 's', elements: [
      { ...shape('a'), hoverFillColor: '#ff0000', hoverBorderColor: '#00ff00' },
      { id: 't', type: 'text', x: 0, y: 0, width: 10, height: 10, content: 'Hi', hoverTextColor: '#111111' },
    ] }]);
    const [a, t] = slide.elements as (SlideElement & Record<string, unknown>)[];
    expect(a.states).toEqual([{ name: 'Hover', look: { fillColor: '#ff0000', borderColor: '#00ff00' } }]);
    expect(a.hoverFillColor).toBeUndefined();
    expect(t.states).toEqual([{ name: 'Hover', look: { textColor: '#111111' } }]);
  });

  it('keeps states, initial state, button set and state triggers; drops unsafe values', () => {
    const [slide] = sanitizeSlides([{ id: 's', elements: [{
      ...shape('a'), initialState: 'Hidden', buttonSet: 'quiz',
      states: [{ name: 'Hidden', look: {} }, { name: 'Done', look: { fillColor: 'url(x)', text: 'ok', src: 'javascript:1' } }, { name: '<b>', look: {} }],
      triggers: [
        { event: 'stateChange', action: 'changeState', targetId: 'b', state: 'Done', stateWatch: { ids: ['a', 'bad id!'], state: 'Selected', any: true } },
        { event: 'onClick', action: 'jumpToSlide', targetId: 's2', conditions: [{ elementId: 'a', operator: 'notEquals', state: 'Done' }, { elementId: 'a', operator: 'greaterThan', state: 'Done' }] },
      ],
    }] }]);
    const a = slide.elements[0];
    expect(a.states).toEqual([{ name: 'Hidden', look: {} }, { name: 'Done', look: { fillColor: 'transparent', text: 'ok' } }]);
    expect([a.initialState, a.buttonSet]).toEqual(['Hidden', 'quiz']);
    expect(a.triggers[0]).toMatchObject({ state: 'Done', stateWatch: { ids: ['a'], state: 'Selected', any: true } });
    expect(a.triggers[1].conditions).toEqual([{ variableId: '', elementId: 'a', operator: 'notEquals', state: 'Done', value: '' }]);
  });
});

describe('editing a state', () => {
  const load = (): CourseState => {
    let s = courseReducer(undefined as unknown as CourseState, { type: 'LOAD_COURSE', slides: [{ id: 's', duration: 5000, elements: [shape('a', { states: [st('Hover')] })] }] });
    s = courseReducer(s, { type: 'SET_ACTIVE_ELEMENT', id: 'a' });
    return courseReducer(s, { type: 'SET_EDITING_STATE', editing: { elementId: 'a', state: 'Hover' } });
  };
  const el = (s: CourseState) => s.slides[0].elements[0] as ShapeElement;

  it('stores colour changes in the state and position changes on the element', () => {
    const s = courseReducer(load(), { type: 'UPDATE_ELEMENT', id: 'a', updates: { fillColor: '#ff0000', x: 30 } as Partial<ShapeElement> });
    expect(el(s).fillColor).toBe('#0000ff');
    expect(el(s).x).toBe(30);
    expect(el(s).states![0].look).toEqual({ fillColor: '#ff0000' });
    expect(s.slides[0].layers![0].elements[0]).toEqual(el(s)); // the layer copy too
  });

  it('ends when another object is selected or Preview starts', () => {
    expect(courseReducer(load(), { type: 'SET_ACTIVE_ELEMENT', id: null }).editingState).toBeNull();
    expect(courseReducer(load(), { type: 'SET_PREVIEW_MODE', enabled: true }).editingState).toBeNull();
  });

  it('renames a state everywhere it is used', () => {
    let s = load();
    s = courseReducer(s, { type: 'UPDATE_ELEMENT', id: 'a', updates: { triggers: [{ event: 'onClick', action: 'changeState', targetId: 'a', state: 'Hover' }] } });
    s = courseReducer(s, { type: 'RENAME_STATE', elementId: 'a', from: 'Hover', to: 'Lit' });
    expect(el(s).states!.map((x) => x.name)).toEqual(['Lit']);
    expect(el(s).triggers[0].state).toBe('Lit');
    expect(s.editingState).toEqual({ elementId: 'a', state: 'Lit' });
  });
});

describe('exported player states', () => {
  const OPTS: PublishOptions = {
    format: 'scorm12', courseTitle: 'T', description: '', filename: 'x.zip', identifier: 'i', version: '1', duration: '',
    keywords: '', lessonTitle: 'L', lessonIdentifier: 'l', reportStatus: 'passed-failed', completion: { mode: 'percent', percent: 100 },
  };
  const els = [
    shape('a', { states: [st('Selected', { fillColor: '#00ff00' }), st('Visited')], buttonSet: 'g' }),
    shape('b', { states: [st('Selected', { fillColor: '#00ff00' })], buttonSet: 'g' }),
    shape('msg', { initialState: 'Hidden', states: [st('Hidden'), st('Done', { text: 'Well done' })] }),
    shape('off', { initialState: 'Disabled', states: [st('Disabled')], triggers: [{ event: 'onClick', action: 'changeState', targetId: 'msg', state: 'Normal' }] }),
    shape('go', { triggers: [{ event: 'onClick', action: 'changeState', targetId: 'msg', state: 'Normal', conditions: [{ variableId: '', elementId: 'a', operator: 'equals', state: 'Selected', value: '' }] }] }),
    shape('watch', { triggers: [{ event: 'stateChange', action: 'changeState', targetId: 'msg', state: 'Done', stateWatch: { ids: ['b'], state: 'Selected' } }] }),
    shape('tick', { stateParent: { id: 'a', states: ['Selected'] } }),
  ];
  const COURSE = {
    slides: [{ id: 'slide-1', title: 'One', duration: 10000, elements: els, layers: [{ id: 'base', name: 'Base', visible: true, locked: false, elements: els }] }],
    masterSlides: [], variables: [],
    playerSettings: { courseTitle: 'States', navigationMode: 'free', backgroundColor: '#000', buttonColor: '#3b82f6' },
    courseSettings: { canvasDimensions: { width: 1024, height: 768 }, themeColors: ['#1e3a5f', '#3b6ea5', '#2a9d8f', '#f4a261', '#1f2937', '#f9fafb'], transition: { type: 'none', duration: 0 } },
  };
  const node = (id: string) => document.querySelector(`[data-el-id="${id}"]`) as HTMLElement;
  const click = (id: string) => node(id).dispatchEvent(new MouseEvent('click', { bubbles: true }));

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

  it('starts objects in their initial state', () => {
    expect(node('msg').classList.contains('st-hidden')).toBe(true);
    expect(node('off').getAttribute('data-state')).toBe('Disabled');
  });

  it('selects on click, one per button set, and repaints the look', () => {
    expect(node('tick').classList.contains('st-off')).toBe(true);
    click('a');
    expect(node('a').getAttribute('data-state')).toBe('Selected');
    expect(node('a').style.backgroundColor).toBe('rgb(0, 255, 0)');
    expect(node('tick').classList.contains('st-off')).toBe(false);
    click('b');
    expect(node('a').getAttribute('data-state')).toBe('Normal');
    expect(node('a').style.backgroundColor).toBe('rgb(0, 0, 255)');
    expect(node('b').getAttribute('data-state')).toBe('Selected');
  });

  it('checks state conditions and ignores clicks on disabled objects', () => {
    click('off');
    expect(node('msg').classList.contains('st-hidden')).toBe(true); // disabled: its trigger didn't run
    click('go');
    expect(node('msg').classList.contains('st-hidden')).toBe(true); // a isn't selected yet
    click('a');
    click('go');
    expect(node('msg').classList.contains('st-hidden')).toBe(false);
  });

  it('runs "when state changes" triggers when their test becomes true', () => {
    click('b');
    expect(node('msg').getAttribute('data-state')).toBe('Done');
    expect(node('msg').textContent).toBe('Well done');
  });
});

describe("exported player: a layer's start triggers", () => {
  const OPTS: PublishOptions = {
    format: 'scorm12', courseTitle: 'T', description: '', filename: 'x.zip', identifier: 'i', version: '1', duration: '',
    keywords: '', lessonTitle: 'L', lessonIdentifier: 'l', reportStatus: 'passed-failed', completion: { mode: 'percent', percent: 100 },
  };
  const tab = shape('tab', { states: [st('Seen', { fillColor: '#00ff00' })], triggers: [{ event: 'onClick', action: 'showLayer', targetId: 'pop' }] });
  const inLayer = shape('inside', { triggers: [{ event: 'timelineStart', action: 'changeState', targetId: 'tab', state: 'Seen' }] });
  const close = shape('close', { triggers: [{ event: 'onClick', action: 'hideLayer', targetId: 'pop' }] });
  const COURSE = {
    slides: [{
      id: 's', title: 'One', duration: 10000, elements: [tab, close, inLayer],
      layers: [
        { id: 'base', name: 'Base', visible: true, locked: false, elements: [tab, close] },
        { id: 'pop', name: 'Pop', visible: false, locked: false, elements: [inLayer] },
      ],
    }],
    masterSlides: [], variables: [],
    playerSettings: { courseTitle: 'Layers', navigationMode: 'free', backgroundColor: '#000', buttonColor: '#3b82f6' },
    courseSettings: { canvasDimensions: { width: 1024, height: 768 }, themeColors: ['#1e3a5f', '#3b6ea5', '#2a9d8f', '#f4a261', '#1f2937', '#f9fafb'], transition: { type: 'none', duration: 0 } },
  };
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

  it('runs them when the layer is shown, not when the slide starts', () => {
    const tabNode = () => document.querySelector('[data-el-id="tab"]') as HTMLElement;
    vi.advanceTimersByTime(2000);
    expect(tabNode().getAttribute('data-state')).toBe('Normal');
    tabNode().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(tabNode().getAttribute('data-state')).toBe('Seen');
  });
});
