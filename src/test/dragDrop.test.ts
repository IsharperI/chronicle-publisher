import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import JSZip from 'jszip';
import { dragOverTriggers, dropOutcome, inferDragRoles, landing, targetUnder } from '@/lib/dragDrop';
import { sanitizeSlides } from '@/lib/sanitize';
import { importStory } from '@/lib/storyImport';
import { sanitizeProject } from '@/lib/project';
import { buildPlayerHtml } from '@/lib/publish/runtime/player';
import { buildScorm12Runtime } from '@/lib/publish/runtime/scorm12';
import type { PublishOptions } from '@/lib/publish/types';
import type { ShapeElement, SlideElement } from '@/types/course';

const shape = (id: string, x: number, y: number, w: number, h: number, extra: Partial<ShapeElement> = {}): ShapeElement => ({
  id, type: 'shape', shapeType: 'rectangle', x, y, width: w, height: h, startTime: 0, duration: 10000,
  triggers: [], animationIn: 'none', animationOut: 'none', entranceDuration: 500, exitDuration: 500,
  fillColor: '#0000ff', borderColor: '#0000ff', borderWidth: 0, ...extra,
});
const st = (name: string, look: Partial<ShapeElement> = {}) => ({ name, look });
const DROP_STATES = [st('Dropped'), st('Drop Correct', { fillColor: '#00ff00' }), st('Drop Incorrect', { fillColor: '#ff0000' })];

// Two targets side by side, an item below them.
const left = shape('left', 0, 0, 200, 200, { dropTarget: {} });
const right = shape('right', 300, 0, 200, 200, { dropTarget: { onlyOne: true } });
const item = shape('item', 0, 400, 50, 50, {
  drag: { correctTargets: ['left'] }, states: DROP_STATES,
  triggers: [
    { event: 'onDrop', action: 'changeState', targetId: 'msg', state: 'Normal', dropTargets: ['left'] },
    { event: 'onDrop', action: 'changeState', targetId: 'any', state: 'Normal' },
    { event: 'onDropOutside', action: 'changeState', targetId: 'out', state: 'Normal' },
    { event: 'onDragOver', action: 'changeState', targetId: 'over', state: 'Normal', dropTargets: ['right'] },
  ],
});
const targets = [left, right];

describe('lib/dragDrop', () => {
  it('finds the topmost target under the object centre', () => {
    expect(targetUnder(item, { x: 80, y: 80 }, targets)).toBe('left');
    expect(targetUnder(item, { x: 170, y: 80 }, targets)).toBe('left'); // centre at x 195
    expect(targetUnder(item, { x: 190, y: 80 }, targets)).toBeNull(); // centre at 215: between targets
    expect(targetUnder(item, { x: 300, y: 0 }, [left, right, shape('top', 300, 0, 100, 100, { dropTarget: {} })])).toBe('top');
  });

  it('lands centred, tiled, or where let go', () => {
    expect(landing(item, left, 0, { x: 10, y: 10 })).toEqual({ x: 75, y: 75 });
    const tile = { ...left, dropTarget: { snap: 'tile' as const } };
    expect(landing(item, tile, 0, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(landing(item, tile, 5, { x: 0, y: 0 })).toEqual({ x: 50, y: 50 }); // 4 per row
    expect(landing(item, { ...left, dropTarget: { snap: 'free' as const } }, 0, { x: 12.4, y: 30 })).toEqual({ x: 12, y: 30 });
  });

  it('gives Drop Correct on the right target and runs matching triggers', () => {
    const out = dropOutcome(item, { x: 80, y: 80 }, targets, {}, {});
    expect(out.target).toBe('left');
    expect(out.pos).toEqual({ x: 75, y: 75 });
    expect(out.states).toEqual({ item: 'Drop Correct' });
    expect(out.triggers.map((t) => t.targetId)).toEqual(['msg', 'any']);
  });

  it('gives Drop Incorrect elsewhere, and Dropped while holding the result', () => {
    expect(dropOutcome(item, { x: 380, y: 80 }, targets, {}, {}).states).toEqual({ item: 'Drop Incorrect' });
    const held = { ...item, drag: { ...item.drag, holdResult: true } };
    expect(dropOutcome(held, { x: 380, y: 80 }, targets, {}, {}).states).toEqual({ item: 'Dropped' });
    const plain = { ...item, drag: {} };
    expect(dropOutcome(plain, { x: 380, y: 80 }, targets, {}, {}).states).toEqual({ item: 'Dropped' });
  });

  it('sends a missed object back and clears its drop state', () => {
    const out = dropOutcome(item, { x: 900, y: 600 }, targets, { item: 'left' }, { item: 'Drop Correct' });
    expect(out).toMatchObject({ target: null, pos: { x: 0, y: 400 }, states: { item: 'Normal' } });
    expect(out.triggers.map((t) => t.targetId)).toEqual(['out']);
    const stay = dropOutcome({ ...item, drag: { returnIfMissed: false } }, { x: 900, y: 600 }, targets, {}, { item: 'Dropped' });
    expect(stay).toMatchObject({ pos: { x: 900, y: 600 }, states: {} });
  });

  it('treats a full "only one" target as a miss', () => {
    const out = dropOutcome(item, { x: 380, y: 80 }, targets, { other: 'right' }, {});
    expect(out.target).toBeNull();
    // An object already on it can be moved within it.
    expect(dropOutcome(item, { x: 380, y: 80 }, targets, { item: 'right' }, {}).target).toBe('right');
  });

  it('runs "dragged over" triggers on entering a target', () => {
    expect(dragOverTriggers(item, null, 'right').map((t) => t.targetId)).toEqual(['over']);
    expect(dragOverTriggers(item, 'right', 'right')).toEqual([]);
    expect(dragOverTriggers(item, null, 'left')).toEqual([]);
  });

  it('makes objects named by drag triggers draggable and drop targets', () => {
    const els = inferDragRoles([
      shape('a', 0, 0, 10, 10, { triggers: [{ event: 'onDrop', action: 'changeState', targetId: 'x', dropTargets: ['b'] }] }),
      shape('b', 0, 0, 10, 10),
    ] as SlideElement[]);
    expect(els[0].drag).toEqual({});
    expect(els[1].dropTarget).toEqual({});
  });

  it('keeps drag settings when a course is loaded', () => {
    const slides = sanitizeSlides([{
      id: 's', title: 'S', duration: 5000, elements: [
        { ...item, drag: { returnIfMissed: false, correctTargets: ['left', 'bad id!'], holdResult: true, junk: 1 } },
        { ...right, dropTarget: { snap: 'tile', onlyOne: true, junk: 1 } },
      ],
    }]);
    const [a, b] = slides[0].elements;
    expect(a.drag).toEqual({ returnIfMissed: false, correctTargets: ['left'], holdResult: true });
    expect(a.triggers[0].dropTargets).toEqual(['left']);
    expect(b.dropTarget).toEqual({ snap: 'tile', onlyOne: true });
  });
});

describe('importing drag and drop', () => {
  const tm = '<tmCtxLst><tmCtx start="0" dur="5000" /></tmCtxLst>';
  const loc = (l: number, t: number, r: number, b: number) => `<loc l="${l}" t="${t}" r="${r}" b="${b}" />`;
  const states = '<stateLst><state name="Drop Correct"><shapeLst><rect g="d1c" /></shapeLst></state><state name="Dropped"><shapeLst><rect g="d1d" /></shapeLst></state></stateLst>';
  async function makeStory() {
    const zip = new JSZip();
    zip.file('story/_rels/story.xml.rels', '<Relationships><Relationship Type="slide" Target="/story/slides/slide.xml" Id="R1" /></Relationships>');
    zip.file('story/story.xml', '<story><sceneLst><scene g="sc1" name="S"><sldIdLst><sldId>R1</sldId></sldIdLst></scene></sceneLst></story>');
    zip.file('story/slides/slide.xml', `<sld g="s1" name="Drag"><shapeLst>
      <rect g="t1" zOrder="0">${tm}${loc(0, 0, 200, 200)}</rect>
      <rect g="t2" zOrder="1">${tm}${loc(300, 0, 500, 200)}</rect>
      <rect g="d1" zOrder="2">${tm}${loc(0, 400, 50, 450)}${states}
        <trigLst><trig><data event="OnDrop" action="changeShapeState"><shape setStateG="msg" setStateName="Normal"><dropLst><g>t2</g></dropLst><hoverLst /></shape></data><condLst /></trig></trigLst></rect>
      <rect g="d2" zOrder="3">${tm}${loc(100, 400, 150, 450)}</rect>
      <rect g="d3" zOrder="4">${tm}${loc(200, 400, 250, 450)}
        <trigLst><trig><data event="OnDrop" action="changeShapeState"><shape setStateG="msg" setStateName="Normal"><dropLst><g>box</g></dropLst></shape></data><condLst /></trig></trigLst></rect>
      <rect g="box" zOrder="5">${tm}${loc(600, 0, 700, 100)}</rect>
      <rect g="msg" zOrder="6" initState="Hidden">${tm}${loc(0, 600, 100, 650)}<stateLst><state name="Hidden"><shapeLst><rect g="msgH" /></shapeLst></state></stateLst></rect>
      <dragDropIntr g="q1" zOrder="7">${tm}${loc(0, 0, 10, 10)}
        <choices>
          <intrFreeChoice shpG="d1" matchShpG="t1" /><intrFreeChoice shpG="d2" matchShpG="t2" />
          <intrFreeChoice shpG="00000000-0000-0000-0000-000000000000" matchShpG="t2" />
        </choices>
        <dragDrop snapTarget="true" returnStart="true" snapLoc="tile" onlyOne="true" delay="true"><order /></dragDrop>
      </dragDropIntr>
    </shapeLst></sld>`);
    return zip.generateAsync({ type: 'uint8array' });
  }

  it('brings across drop triggers, question items, targets and settings', async () => {
    const { payload, report } = await importStory(await makeStory());
    const course = sanitizeProject(payload)!;
    const els = Object.fromEntries(course.slides[0].elements.map((e) => [e.id, e]));
    expect(els.d1.drag).toEqual({ correctTargets: ['t1'], holdResult: true });
    expect(els.d1.triggers).toEqual([{ event: 'onDrop', action: 'changeState', targetId: 'msg', state: 'Normal', dropTargets: ['t2'] }]);
    expect(els.d1.states?.map((s) => s.name)).toEqual(expect.arrayContaining(['Drop Correct', 'Dropped']));
    expect(els.d2.drag).toEqual({ correctTargets: ['t2'], holdResult: true });
    expect(els.t1.dropTarget).toEqual({ snap: 'tile', onlyOne: true });
    expect(els.t2.dropTarget).toEqual({ snap: 'tile', onlyOne: true });
    // Draggable only through its trigger, onto a target only that trigger names.
    expect(els.d3.drag).toEqual({});
    expect(els.box.dropTarget).toEqual({});
    expect(els.msg.drag).toBeUndefined();
    const msgs = report.issues.map((i) => i.message);
    expect(msgs.some((m) => /when dropped/i.test(m))).toBe(false);
    expect(msgs.some((m) => /drag-and-drop questions/.test(m))).toBe(true);
  });
});

describe('exported player drag and drop', () => {
  const OPTS: PublishOptions = {
    format: 'scorm12', courseTitle: 'T', description: '', filename: 'x.zip', identifier: 'i', version: '1', duration: '',
    keywords: '', lessonTitle: 'L', lessonIdentifier: 'l', reportStatus: 'passed-failed', completion: { mode: 'percent', percent: 100 },
  };
  const els = [
    shape('left', 0, 0, 200, 200, { dropTarget: {}, states: [st('Drag Over', { fillColor: '#ffff00' })] }),
    right,
    item,
    shape('msg', 0, 600, 100, 50, { initialState: 'Hidden', states: [st('Hidden')] }),
    shape('any', 0, 650, 100, 50, { initialState: 'Hidden', states: [st('Hidden')] }),
    shape('out', 0, 700, 100, 50, { initialState: 'Hidden', states: [st('Hidden')] }),
  ];
  const COURSE = {
    slides: [{ id: 'slide-1', title: 'One', duration: 10000, elements: els, layers: [{ id: 'base', name: 'Base', visible: true, locked: false, elements: els }] }],
    masterSlides: [], variables: [],
    playerSettings: { courseTitle: 'Drag', navigationMode: 'free', backgroundColor: '#000', buttonColor: '#3b82f6' },
    courseSettings: { canvasDimensions: { width: 1024, height: 768 }, themeColors: ['#1e3a5f', '#3b6ea5', '#2a9d8f', '#f4a261', '#1f2937', '#f9fafb'], transition: { type: 'none', duration: 0 } },
  };
  const node = (id: string) => document.querySelector(`[data-el-id="${id}"]`) as HTMLElement;
  // jsdom has no layout: the stage reports its real size (scale 1) and pointer events carry client coordinates.
  const ptr = (id: string, type: string, x: number, y: number) => {
    const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(e, 'pointerId', { value: 1 });
    node(id).dispatchEvent(e);
  };
  const drag = (id: string, from: [number, number], to: [number, number]) => {
    ptr(id, 'pointerdown', ...from);
    ptr(id, 'pointermove', (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
    ptr(id, 'pointermove', ...to);
    ptr(id, 'pointerup', ...to);
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    (window as unknown as { API: unknown }).API = {
      LMSInitialize: () => 'true', LMSFinish: () => 'true', LMSCommit: () => 'true', LMSGetValue: () => '', LMSSetValue: () => 'true',
      LMSGetLastError: () => '0', LMSGetErrorString: () => '', LMSGetDiagnostic: () => '',
    };
    const doc = new DOMParser().parseFromString(buildPlayerHtml(COURSE as never, OPTS, buildScorm12Runtime()), 'text/html');
    document.body.innerHTML = doc.body.innerHTML;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1024, height: 768, right: 1024, bottom: 768, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    for (const s of Array.from(doc.querySelectorAll('script'))) new Function(s.textContent ?? '')();
    vi.advanceTimersByTime(100);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('drops on the correct target: lands centred, takes Drop Correct, runs its triggers', () => {
    drag('item', [10, 410], [90, 90]);
    expect(node('item').style.left).toBe('75px');
    expect(node('item').style.top).toBe('75px');
    expect(node('item').getAttribute('data-state')).toBe('Drop Correct');
    expect(node('msg').classList.contains('st-hidden')).toBe(false);
    expect(node('any').classList.contains('st-hidden')).toBe(false);
    expect(node('out').classList.contains('st-hidden')).toBe(true);
  });

  it('shows Drag Over on the target while held over it', () => {
    ptr('item', 'pointerdown', 10, 410);
    ptr('item', 'pointermove', 90, 90);
    expect(node('left').style.backgroundColor).toBe('rgb(255, 255, 0)');
    ptr('item', 'pointerup', 90, 90);
    expect(node('left').style.backgroundColor).toBe('rgb(0, 0, 255)');
  });

  it('sends a missed object back and runs "dropped anywhere else"', () => {
    drag('item', [10, 410], [900, 700]);
    expect(node('item').style.left).toBe('0px');
    expect(node('item').style.top).toBe('400px');
    expect(node('out').classList.contains('st-hidden')).toBe(false);
  });
});
