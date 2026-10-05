import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { courseReducer } from '@/context/CourseContext';
import { initialHistory, withHistory, HISTORY_LIMIT, type HistoryState } from '@/context/history';
import type { CourseState, Slide } from '@/types/course';
import { TTS_AUDIO_NAME } from '@/lib/tts/narration';

const reducer = withHistory(courseReducer);
const sl = (id: string): Slide => ({ id, title: id, elements: [], duration: 5000 });
let clock = 1_000_000;
/** Each dispatch happens "later" unless told otherwise, so steps don't merge by accident. */
function run(h: HistoryState, action: Parameters<typeof reducer>[1], gapMs = 5000): HistoryState {
  clock += gapMs;
  return reducer(h, action);
}
beforeEach(() => { vi.spyOn(Date, 'now').mockImplementation(() => clock); });
afterEach(() => vi.restoreAllMocks());

function start(): HistoryState {
  const base = courseReducer(undefined as unknown as CourseState, { type: 'LOAD_COURSE', slides: [sl('a'), sl('b'), sl('c')] });
  return reducer(initialHistory(base), { type: 'LOAD_COURSE', slides: base.slides });
}
const titles = (h: HistoryState) => h.present.slides.map((s) => s.title);

describe('undo / redo', () => {
  it('undoes and redoes a deleted slide', () => {
    let h = run(start(), { type: 'DELETE_SLIDE', index: 1 });
    expect(titles(h)).toEqual(['a', 'c']);
    expect(h.past.at(-1)!.label).toBe('Delete slide');
    h = run(h, { type: 'UNDO' });
    expect(titles(h)).toEqual(['a', 'b', 'c']);
    h = run(h, { type: 'REDO' });
    expect(titles(h)).toEqual(['a', 'c']);
  });

  it('ignores selection and other UI-only actions', () => {
    let h = start();
    h = run(h, { type: 'SET_ACTIVE_SLIDE', index: 2 });
    h = run(h, { type: 'SET_PLAYHEAD', time: 1200 });
    expect(h.past).toHaveLength(0);
  });

  it('a new edit clears the redo list', () => {
    let h = run(start(), { type: 'DELETE_SLIDE', index: 2 });
    h = run(h, { type: 'UNDO' });
    expect(h.future).toHaveLength(1);
    h = run(h, { type: 'UPDATE_SLIDE', index: 0, updates: { title: 'x' } });
    expect(h.future).toHaveLength(0);
  });

  it('merges rapid edits to the same thing (typing) into one step', () => {
    let h = start();
    for (const t of ['B', 'Br', 'Bra', 'Brakes']) h = run(h, { type: 'UPDATE_SLIDE', index: 1, updates: { title: t } }, 150);
    expect(h.past).toHaveLength(1);
    h = run(h, { type: 'UNDO' });
    expect(titles(h)[1]).toBe('b');
  });

  it('merges several changes made by one click', () => {
    let h = start();
    h = run(h, { type: 'INSERT_SLIDE', index: 1, slide: sl('new') });
    h = run(h, { type: 'SET_SLIDE_NEXT', slideId: 'a', next: ['new'] }, 1);
    h = run(h, { type: 'SET_TREE_POSITIONS', positions: { new: { x: 1, y: 2 } } }, 1);
    expect(h.past).toHaveLength(1);
    h = run(h, { type: 'UNDO' });
    expect(titles(h)).toEqual(['a', 'b', 'c']);
    expect(h.present.slides[0].next).toBeUndefined();
  });

  it('records nothing in preview mode, and undo is off there', () => {
    let h = run(start(), { type: 'DELETE_SLIDE', index: 2 });
    h = run(h, { type: 'SET_PREVIEW_MODE', enabled: true });
    const before = h.past.length;
    h = run(h, { type: 'UPDATE_SLIDE', index: 0, updates: { title: 'during preview' } });
    expect(h.past.length).toBe(before);
    expect(run(h, { type: 'UNDO' })).toBe(h);
  });

  it('loading a course starts a fresh history', () => {
    let h = run(start(), { type: 'DELETE_SLIDE', index: 0 });
    h = run(h, { type: 'LOAD_COURSE', slides: [sl('z')] });
    expect(h.past).toHaveLength(0);
  });

  it('keeps background narration when undoing an earlier edit', () => {
    let h = run(start(), { type: 'UPDATE_SLIDE', index: 0, updates: { title: 'Intro' } });
    const audio = { id: 'au', name: TTS_AUDIO_NAME, src: 'data:audio/mpeg;base64,AA==', duration: 8, captions: [] };
    h = run(h, { type: 'SET_SLIDE_NARRATION', slideId: 'b', audio });
    expect(h.past).toHaveLength(1); // narration isn't a step
    h = run(h, { type: 'UNDO' });
    expect(titles(h)[0]).toBe('a');
    expect(h.present.slides[1].audio?.[0]?.id).toBe('au');
  });

  it('keeps the editor pointing at slides and objects that exist', () => {
    let h = run(start(), { type: 'ADD_SLIDE' });
    h = run(h, { type: 'SET_ACTIVE_SLIDE', index: 3 });
    h = run(h, { type: 'UNDO' });
    expect(h.present.slides).toHaveLength(3);
    expect(h.present.activeSlideIndex).toBeLessThan(3);
  });

  it('keeps at most the last steps', () => {
    let h = start();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) h = run(h, { type: 'UPDATE_SLIDE', index: 0, updates: { title: `t${i}` } });
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});
