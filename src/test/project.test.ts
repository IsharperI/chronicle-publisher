import { describe, it, expect } from 'vitest';
import { hasCourseContent, projectFileName, projectSnapshot, sanitizeProject } from '@/lib/project';
import { courseReducer } from '@/context/CourseContext';
import { defaultCourseSettings, defaultPlayerSettings, type CourseState } from '@/types/course';

const blank = (): CourseState => courseReducer(undefined as unknown as CourseState, { type: 'LOAD_COURSE', slides: [{ id: 's', elements: [], duration: 5000 }] });

describe('project files', () => {
  it('round-trips a course through save and load', () => {
    const state = courseReducer(blank(), {
      type: 'LOAD_COURSE',
      slides: [{ id: 'a', title: 'One', elements: [], duration: 5000 }, { id: 'b', title: 'Two', elements: [], duration: 7000 }],
      playerSettings: { courseTitle: 'Brake Systems' },
    });
    const json = JSON.parse(JSON.stringify(projectSnapshot(state)));
    const payload = sanitizeProject(json)!;
    const again = courseReducer(blank(), { type: 'LOAD_COURSE', ...payload });
    expect(again.slides.map((s) => [s.id, s.duration])).toEqual([['a', 5000], ['b', 7000]]);
    expect(again.playerSettings.courseTitle).toBe('Brake Systems');
  });

  it('rejects data that is not a course', () => {
    expect(sanitizeProject(null)).toBeNull();
    expect(sanitizeProject({ hello: 1 })).toBeNull();
  });

  it('keeps default settings when a file leaves them out (used to crash the editor)', () => {
    const payload = sanitizeProject({ slides: [{ id: 'a', elements: [], duration: 5000 }], courseSettings: {}, playerSettings: { courseTitle: 'T' } })!;
    const s = courseReducer(blank(), { type: 'LOAD_COURSE', ...payload });
    expect(s.courseSettings.canvasDimensions).toEqual(defaultCourseSettings.canvasDimensions);
    expect(s.playerSettings.courseTitle).toBe('T');
    expect(s.playerSettings.showMenu).toBe(defaultPlayerSettings.showMenu);
  });

  it('knows when a course has something worth keeping', () => {
    expect(hasCourseContent([{ elements: [] }])).toBe(false);
    expect(hasCourseContent([{ elements: [{}] }])).toBe(true);
    expect(hasCourseContent([{ elements: [] }, { elements: [] }])).toBe(true);
    expect(hasCourseContent([{ elements: [], slideType: 'quiz' }])).toBe(true);
  });

  it('names saved files after the course title', () => {
    expect(projectFileName('Basic Electrical Theory!')).toBe('basic-electrical-theory.json');
    expect(projectFileName('')).toBe('course-project.json');
  });
});
