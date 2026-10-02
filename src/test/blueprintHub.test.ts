import { describe, it, expect } from 'vitest';
import { prepareBlueprintLoad, validateBlueprint } from '@/lib/blueprint';
import { courseReducer } from '@/context/CourseContext';
import { autoButtons, branchesReturn, nextSlideIndex } from '@/lib/navigation';
import { defaultCourseSettings, type CourseState } from '@/types/course';

const bullets = (title: string, narration?: string) => ({ layout: 'bullets', title, bullets: ['a', 'b'], ...(narration ? { narration } : {}) });

function load(slides: unknown[]) {
  const res = prepareBlueprintLoad({ blueprintVersion: 1, course: { title: 'T' }, slides }, defaultCourseSettings);
  if (res.ok === false) throw new Error(res.errors.join('; '));
  const state = courseReducer(undefined as unknown as CourseState, { type: 'LOAD_COURSE', ...res.payload });
  return { state, narration: res.narration };
}
const byTitle = (s: CourseState, t: string) => s.slides.find((x) => x.title === t)!;

describe('blueprint hub layout', () => {
  const hub = (mode?: string) => ({
    layout: 'hub', title: 'Bus Systems', intro: 'Pick one.', ...(mode ? { mode } : {}),
    branches: [
      { label: 'Brakes', slides: [bullets('Brakes 1', 'Brakes narration.'), bullets('Brakes 2')] },
      { label: 'Doors', slides: [bullets('Doors 1')] },
    ],
  });

  it('places branch slides after the hub and wires a required hub', () => {
    const { state, narration } = load([{ layout: 'title', title: 'Intro' }, hub(), bullets('Summary')]);
    expect(state.slides.map((s) => s.title)).toEqual(['Intro', 'Bus Systems', 'Brakes 1', 'Brakes 2', 'Doors 1', 'Summary']);
    const h = byTitle(state, 'Bus Systems');
    expect(h.branchMode).toBe('required');
    expect(h.next).toEqual([byTitle(state, 'Brakes 1').id, byTitle(state, 'Doors 1').id]);
    expect(h.continueTo).toBe(byTitle(state, 'Summary').id);
    // Buttons are the hub's branch buttons, labelled from the blueprint, not duplicated.
    expect(autoButtons(h).map((b) => b.text)).toEqual(['Brakes', 'Doors']);
    // Inside a branch Next goes on; the last slide returns to the hub.
    expect(nextSlideIndex(state.slides, 2)).toBe(3);
    expect(byTitle(state, 'Brakes 2').next).toEqual([h.id]);
    expect(byTitle(state, 'Doors 1').next).toEqual([h.id]);
    expect(Object.values(branchesReturn(state.slides, h.id))).toEqual([true, true]);
    // Narration from branch slides is voiced too.
    expect(narration.map((n) => n.title)).toEqual(['Brakes 1']);
  });

  it('explore hubs work the same way but unlocked', () => {
    const { state } = load([hub('explore'), bullets('After')]);
    expect(state.slides[0].branchMode).toBe('explore');
    expect(state.slides[0].continueTo).toBe(byTitle(state, 'After').id);
  });

  it('choice paths rejoin at the slide after the hub', () => {
    const { state } = load([hub('choice'), bullets('After')]);
    const h = state.slides[0];
    expect(h.branchMode).toBeUndefined();
    expect(h.continueTo).toBeUndefined();
    const after = byTitle(state, 'After').id;
    expect(byTitle(state, 'Brakes 2').next).toEqual([after]);
    expect(byTitle(state, 'Doors 1').next).toEqual([after]);
  });

  it('a hub at the very end has no Continue, and choice paths end the course', () => {
    expect(load([hub()]).state.slides[0].continueTo).toBeUndefined();
    expect(byTitle(load([hub('choice')]).state, 'Doors 1').next).toEqual([]);
  });

  it('explains mistakes inside a branch', () => {
    const res = validateBlueprint({ blueprintVersion: 1, course: { title: 'T' }, slides: [
      { layout: 'hub', title: 'H', branches: [{ label: 'A', slides: [{ layout: 'bullets', title: 'x' }] }, { label: 'B', slides: [] }] },
    ] });
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.errors.some((e) => e.startsWith('Slide 1 (hub), branch 1, slide 1 (bullets): bullets'))).toBe(true);
      expect(res.errors.some((e) => e.startsWith('Slide 1 (hub), branch 2: slides') || e.includes('at least 1 slide'))).toBe(true);
    }
  });
});

describe('sections become slide groups', () => {
  it('groups each section slide with the slides after it, including hub branches', () => {
    const { state } = load([
      { layout: 'title', title: 'Course' },
      { layout: 'section', title: 'Module 1' }, bullets('M1 a'),
      { layout: 'section', title: 'Module 2' },
      { layout: 'hub', title: 'Hub', branches: [{ label: 'A', slides: [bullets('A1')] }, { label: 'B', slides: [bullets('B1')] }] },
    ]);
    expect(state.slides.map((s) => [s.title, s.group ?? '-'])).toEqual([
      ['Course', '-'], ['Module 1', 'Module 1'], ['M1 a', 'Module 1'], ['Module 2', 'Module 2'], ['Hub', 'Module 2'], ['A1', 'Module 2'], ['B1', 'Module 2'],
    ]);
  });
});
