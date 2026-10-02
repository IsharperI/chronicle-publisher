import { describe, it, expect } from 'vitest';
import { autoButtons, nextSlideIndex, resolveNext } from '@/lib/navigation';
import { courseReducer } from '@/context/CourseContext';
import { sanitizeProject } from '@/lib/project';
import type { CourseState, Slide } from '@/types/course';

const slide = (id: string, title = id): Slide => ({ id, title, elements: [], duration: 5000 });

function course(...ids: string[]): CourseState {
  return courseReducer(undefined as unknown as CourseState, { type: 'LOAD_COURSE', slides: ids.map((i) => slide(i)) });
}
const get = (s: CourseState, id: string) => s.slides.find((x) => x.id === id)!;
const setNext = (s: CourseState, id: string, next: string[] | undefined) => courseReducer(s, { type: 'SET_SLIDE_NEXT', slideId: id, next });

describe('where Next goes', () => {
  it('defaults to the following slide, and the last slide has no Next', () => {
    const s = course('a', 'b', 'c');
    expect(resolveNext(s.slides, 0)).toEqual(['b']);
    expect(nextSlideIndex(s.slides, 2)).toBe(-1);
  });

  it('follows a connection to any slide, or none', () => {
    let s = setNext(course('a', 'b', 'c'), 'a', ['c']);
    expect(nextSlideIndex(s.slides, 0)).toBe(2);
    s = setNext(s, 'a', []);
    expect(nextSlideIndex(s.slides, 0)).toBe(-1);
    s = setNext(s, 'a', undefined);
    expect(nextSlideIndex(s.slides, 0)).toBe(1);
  });

  it('follows the slide, not its position, when slides are reordered', () => {
    let s = setNext(course('a', 'b', 'c'), 'a', ['c']);
    s = courseReducer(s, { type: 'MOVE_SLIDE', from: 2, to: 1 });
    expect(resolveNext(s.slides, 0)).toEqual(['c']);
  });
});

describe('branching slides', () => {
  it('get one button per branch, centered on the slide, and Next is off', () => {
    const s = setNext(course('hub', 'A', 'B', 'C'), 'hub', ['A', 'B', 'C']);
    const btns = autoButtons(get(s, 'hub'));
    expect(btns.map((b) => [b.autoBranchTarget, b.text])).toEqual([['A', 'A'], ['B', 'B'], ['C', 'C']]);
    expect(btns.every((b) => b.triggers[0].action === 'jumpToSlide' && b.triggers[0].targetId === b.autoBranchTarget)).toBe(true);
    expect(btns.every((b) => b.fillColor === 'var(--theme-primary)')).toBe(true);
    const { width, height } = s.courseSettings.canvasDimensions;
    const left = Math.min(...btns.map((b) => b.x));
    const right = Math.max(...btns.map((b) => b.x + b.width));
    expect(Math.abs((left + right) / 2 - width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(btns[0].y + btns[0].height / 2 - height / 2)).toBeLessThanOrEqual(1);
    expect(nextSlideIndex(s.slides, 0)).toBe(-1);
  });

  it('keeps moved or restyled buttons when a branch is added', () => {
    let s = setNext(course('hub', 'A', 'B', 'C'), 'hub', ['A', 'B']);
    const a = autoButtons(get(s, 'hub'))[0];
    s = courseReducer(s, { type: 'UPDATE_ELEMENT', id: a.id, updates: { x: 50, y: 60, text: 'Brakes', fillColor: '#ff8800' } });
    s = setNext(s, 'hub', ['A', 'B', 'C']);
    const btns = autoButtons(get(s, 'hub'));
    expect(btns).toHaveLength(3);
    expect(btns.find((b) => b.autoBranchTarget === 'A')).toMatchObject({ x: 50, y: 60, text: 'Brakes', fillColor: '#ff8800' });
  });

  it('removes the button with its branch, and all buttons when back to one connection', () => {
    let s = setNext(course('hub', 'A', 'B', 'C'), 'hub', ['A', 'B', 'C']);
    s = setNext(s, 'hub', ['A', 'C']);
    expect(autoButtons(get(s, 'hub')).map((b) => b.autoBranchTarget)).toEqual(['A', 'C']);
    s = setNext(s, 'hub', ['C']);
    expect(autoButtons(get(s, 'hub'))).toHaveLength(0);
    expect(nextSlideIndex(s.slides, 0)).toBe(3);
  });

  it('deleting a button on the canvas removes its branch', () => {
    let s = setNext(course('hub', 'A', 'B', 'C'), 'hub', ['A', 'B', 'C']);
    const b = autoButtons(get(s, 'hub')).find((x) => x.autoBranchTarget === 'B')!;
    s = courseReducer(s, { type: 'DELETE_ELEMENT', id: b.id });
    expect(get(s, 'hub').next).toEqual(['A', 'C']);
    expect(autoButtons(get(s, 'hub'))).toHaveLength(2);
  });

  it('deleting a target slide removes its branch and button', () => {
    let s = setNext(course('hub', 'A', 'B'), 'hub', ['A', 'B']);
    s = courseReducer(s, { type: 'DELETE_SLIDE', index: 2 });
    expect(get(s, 'hub').next).toEqual(['A']);
    expect(autoButtons(get(s, 'hub'))).toHaveLength(0);
  });

  it('survives save and load', () => {
    const s = setNext(course('hub', 'A', 'B'), 'hub', ['A', 'B']);
    const payload = sanitizeProject(JSON.parse(JSON.stringify({ slides: s.slides })))!;
    const loaded = courseReducer(s, { type: 'LOAD_COURSE', ...payload });
    expect(get(loaded, 'hub').next).toEqual(['A', 'B']);
    expect(autoButtons(get(loaded, 'hub')).map((b) => b.autoBranchTarget)).toEqual(['A', 'B']);
  });
});

describe('preview Prev retraces the path', () => {
  it('goes back along branches, not by slide number', () => {
    let s = setNext(course('hub', 'A', 'B', 'C'), 'hub', ['A', 'C']);
    s = courseReducer(s, { type: 'SET_PREVIEW_MODE', enabled: true });
    s = courseReducer(s, { type: 'SET_ACTIVE_SLIDE', index: 3 }); // clicked the C button
    expect(s.activeSlideIndex).toBe(3);
    s = courseReducer(s, { type: 'PREVIEW_BACK' });
    expect(s.activeSlideIndex).toBe(0); // back to the hub, not to B
    expect(courseReducer(s, { type: 'PREVIEW_BACK' })).toBe(s); // nothing further back
  });
});
