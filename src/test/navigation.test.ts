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

describe('re-pointing a branch (reported bug: third button vanished)', () => {
  it('reuses the same button in place, relabelled, instead of stacking a new one', () => {
    let s = setNext(course('s1', 's2', 'hub', 's4', 's5', 's6'), 'hub', ['s4', 's5', 's6']);
    const before = autoButtons(get(s, 'hub'));
    const b5 = before.find((b) => b.autoBranchTarget === 's5')!;
    s = setNext(s, 'hub', ['s4', 's2', 's6']); // the arrow to s5 dragged onto s2
    const after = autoButtons(get(s, 'hub'));
    expect(after).toHaveLength(3);
    const moved = after.find((b) => b.autoBranchTarget === 's2')!;
    expect(moved.id).toBe(b5.id);
    expect([moved.x, moved.y]).toEqual([b5.x, b5.y]);
    expect(moved.text).toBe('s2');
    expect(moved.triggers[0].targetId).toBe('s2');
    // no two buttons share a spot
    expect(new Set(after.map((b) => `${b.x},${b.y}`)).size).toBe(3);
  });

  it('keeps a renamed label when re-pointed', () => {
    let s = setNext(course('hub', 'a', 'b', 'c'), 'hub', ['a', 'b']);
    const a = autoButtons(get(s, 'hub'))[0];
    s = courseReducer(s, { type: 'UPDATE_ELEMENT', id: a.id, updates: { text: 'Brakes' } });
    s = setNext(s, 'hub', ['c', 'b']);
    expect(autoButtons(get(s, 'hub')).find((b) => b.id === a.id)).toMatchObject({ text: 'Brakes', autoBranchTarget: 'c' });
  });

  it('places a new button clear of buttons the author moved', () => {
    let s = setNext(course('hub', 'a', 'b', 'c', 'd'), 'hub', ['a', 'b']);
    const [a, b] = autoButtons(get(s, 'hub'));
    // Author drags button b to where the next new button would wrap to.
    s = courseReducer(s, { type: 'UPDATE_ELEMENT', id: a.id, updates: { x: 524, y: 354 } });
    s = courseReducer(s, { type: 'UPDATE_ELEMENT', id: b.id, updates: { x: 20, y: 438 } });
    s = setNext(s, 'hub', ['a', 'b', 'c', 'd']);
    const all = autoButtons(get(s, 'hub'));
    expect(all).toHaveLength(4);
    for (const p of all) for (const q of all) {
      if (p === q) continue;
      const overlap = p.x < q.x + q.width && p.x + p.width > q.x && p.y < q.y + q.height && p.y + p.height > q.y;
      expect(overlap).toBe(false);
    }
  });
});

describe('repairing files saved by the earlier version', () => {
  it('separates branch buttons stacked on the same spot when the course is opened', () => {
    let s = setNext(course('hub', 'a', 'b', 'c'), 'hub', ['a', 'b', 'c']);
    const [, b, c] = autoButtons(get(s, 'hub'));
    s = courseReducer(s, { type: 'UPDATE_ELEMENT', id: c.id, updates: { x: b.x, y: b.y } });
    const saved = JSON.parse(JSON.stringify({ slides: s.slides }));
    const loaded = courseReducer(s, { type: 'LOAD_COURSE', ...sanitizeProject(saved)! });
    const all = autoButtons(get(loaded, 'hub'));
    expect(new Set(all.map((x) => `${x.x},${x.y}`)).size).toBe(3);
  });
});
