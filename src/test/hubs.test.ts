import { describe, it, expect } from 'vitest';
import { branchesReturn, hubLocked, nextSlideIndex } from '@/lib/navigation';
import { buildEdges } from '@/lib/courseTree';
import { courseReducer } from '@/context/CourseContext';
import { sanitizeProject } from '@/lib/project';
import type { CourseState, Slide } from '@/types/course';

const sl = (id: string, extra: Partial<Slide> = {}): Slide => ({ id, title: id, elements: [], duration: 5000, ...extra });
const load = (slides: Slide[]): CourseState => courseReducer(undefined as unknown as CourseState, { type: 'LOAD_COURSE', slides });
const idx = (s: CourseState, id: string) => s.slides.findIndex((x) => x.id === id);
const go = (s: CourseState, id: string) => courseReducer(s, { type: 'SET_ACTIVE_SLIDE', index: idx(s, id) });

/** intro → hub; branch A = a1 → a2 → hub; branch B = b1 → hub; hub continues to end. */
function hubCourse(mode: 'explore' | 'required' | undefined) {
  return load([
    sl('intro'),
    sl('hub', { next: ['a1', 'b1'], branchMode: mode, continueTo: 'end' }),
    sl('a1'), sl('a2', { next: ['hub'] }),
    sl('b1', { next: ['hub'] }),
    sl('end'),
  ]);
}

describe('hub rules', () => {
  it('a choice slide has no Next; a hub’s Next goes to its Continue target', () => {
    expect(nextSlideIndex(hubCourse(undefined).slides, 1)).toBe(-1);
    const s = hubCourse('explore');
    expect(nextSlideIndex(s.slides, 1)).toBe(idx(s, 'end'));
  });

  it('warns about branches that never lead back to the hub', () => {
    const s = load([sl('hub', { next: ['a', 'b'], branchMode: 'required' }), sl('a', { next: ['hub'] }), sl('b', { next: [] })]);
    expect(branchesReturn(s.slides, 'hub')).toEqual({ a: true, b: false });
  });

  it('draws the Continue arrow in the course tree', () => {
    const e = buildEdges(hubCourse('required').slides).find((x) => x.continue)!;
    expect([e.from, e.to, e.label]).toEqual(['hub', 'end', 'Continue (after all branches)']);
  });
});

describe('required hub in preview', () => {
  it('unlocks Continue only after the last slide of every branch is reached', () => {
    let s = courseReducer(hubCourse('required'), { type: 'SET_PREVIEW_MODE', enabled: true });
    s = go(s, 'hub');
    const hub = s.slides[1];
    expect(hubLocked(hub, s.branchDone?.hub)).toBe(true);
    expect(courseReducer(s, { type: 'PREVIEW_NEXT' }).activeSlideIndex).toBe(1); // locked

    s = go(s, 'a1'); // first slide of branch A: not complete yet
    expect(s.branchDone?.hub ?? []).toEqual([]);
    s = go(s, 'a2'); // its last slide (Next leads back to the hub)
    expect(s.branchDone?.hub).toEqual(['a1']);
    s = go(s, 'hub');
    expect(hubLocked(hub, s.branchDone?.hub)).toBe(true);

    s = go(s, 'b1'); // single-slide branch: complete on arrival
    s = go(s, 'hub');
    expect(s.branchDone?.hub?.sort()).toEqual(['a1', 'b1']);
    expect(hubLocked(hub, s.branchDone?.hub)).toBe(false);
    expect(courseReducer(s, { type: 'PREVIEW_NEXT' }).activeSlideIndex).toBe(idx(s, 'end'));
  });

  it('an exploration hub never locks', () => {
    const s = hubCourse('explore');
    expect(hubLocked(s.slides[1], [])).toBe(false);
  });

  it('progress resets when preview starts again', () => {
    let s = courseReducer(hubCourse('required'), { type: 'SET_PREVIEW_MODE', enabled: true });
    s = go(go(go(s, 'hub'), 'b1'), 'hub');
    expect(s.branchDone?.hub).toEqual(['b1']);
    s = courseReducer(s, { type: 'SET_PREVIEW_MODE', enabled: true });
    expect(s.branchDone).toEqual({});
  });
});

describe('hub data', () => {
  it('drops the Continue target when that slide is deleted', () => {
    const s = courseReducer(hubCourse('explore'), { type: 'DELETE_SLIDE', index: 5 });
    expect(s.slides[1].continueTo).toBeUndefined();
  });
  it('survives save and load', () => {
    const s = hubCourse('required');
    const back = sanitizeProject(JSON.parse(JSON.stringify({ slides: s.slides })))!;
    expect(back.slides[1]).toMatchObject({ branchMode: 'required', continueTo: 'end' });
  });
});

describe('slide groups', () => {
  it('groups, renames and ungroups slides, and saves the group', () => {
    let s = load([sl('a'), sl('b'), sl('c')]);
    s = courseReducer(s, { type: 'SET_SLIDE_GROUP', slideIds: ['a', 'b'], group: '  Brakes  ' });
    expect(s.slides.map((x) => x.group)).toEqual(['Brakes', 'Brakes', undefined]);
    s = courseReducer(s, { type: 'RENAME_SLIDE_GROUP', from: 'Brakes', to: 'Braking systems' });
    expect(s.slides[1].group).toBe('Braking systems');
    expect(sanitizeProject(JSON.parse(JSON.stringify({ slides: s.slides })))!.slides[0].group).toBe('Braking systems');
    s = courseReducer(s, { type: 'SET_SLIDE_GROUP', slideIds: ['a'], group: undefined });
    expect('group' in s.slides[0]).toBe(false);
  });
});

describe('re-opening a course', () => {
  it('keeps branches when the same course is loaded over itself (reported while testing)', () => {
    const s = hubCourse('required');
    const file = sanitizeProject(JSON.parse(JSON.stringify({ slides: s.slides })))!;
    const fileWithoutButtons = { ...file, slides: file.slides.map((x) => ({ ...x, elements: [], layers: undefined })) };
    const again = courseReducer(s, { type: 'LOAD_COURSE', ...fileWithoutButtons });
    expect(again.slides[1].next).toEqual(['a1', 'b1']);
    const twice = courseReducer(again, { type: 'LOAD_COURSE', ...file });
    expect(twice.slides[1].next).toEqual(['a1', 'b1']);
  });
});
