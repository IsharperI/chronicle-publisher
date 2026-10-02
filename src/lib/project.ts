/**
 * Course project files: what gets saved, and how saved data is turned back
 * into a LOAD_COURSE payload. Shared by Home → Save/Load (Ribbon.tsx) and
 * autosave (lib/autosave.ts, AutosaveManager.tsx) so both always agree.
 */
import type { CourseState, CourseSettings, CourseVariable, PlayerSettings, Slide } from '@/types/course';
import { sanitizeSlides, sanitizePlayerSettings, sanitizeCourseSettings, sanitizeVariables } from './sanitize';

/** The saved part of a course (runtime fields like the playhead are left out). */
export interface ProjectData {
  slides: Slide[];
  masterSlides: Slide[];
  playerSettings: PlayerSettings;
  courseSettings: CourseSettings;
  variables: CourseVariable[];
}

/** Payload for the LOAD_COURSE action. */
export interface ProjectLoadPayload {
  slides: Slide[];
  masterSlides?: Slide[];
  playerSettings?: Partial<PlayerSettings>;
  courseSettings?: Partial<CourseSettings>;
  variables?: CourseVariable[];
}

export function projectSnapshot(state: Pick<CourseState, keyof ProjectData>): ProjectData {
  return {
    slides: state.slides,
    masterSlides: state.masterSlides,
    playerSettings: state.playerSettings,
    courseSettings: state.courseSettings,
    variables: state.variables,
  };
}

/**
 * Validates saved project data through the sanitizer (an allow-list that
 * protects the SCORM export from injected CSS/HTML/JS). Returns null when the
 * data isn't a project (no slides array).
 */
export function sanitizeProject(data: unknown): ProjectLoadPayload | null {
  if (!data || typeof data !== 'object') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  if (!Array.isArray(d.slides)) return null;
  return {
    slides: sanitizeSlides(d.slides),
    masterSlides: sanitizeSlides(d.masterSlides),
    playerSettings: sanitizePlayerSettings(d.playerSettings),
    courseSettings: sanitizeCourseSettings(d.courseSettings),
    variables: sanitizeVariables(d.variables),
  };
}

/** True when a course has anything worth keeping (more than one blank slide). */
export function hasCourseContent(slides: { elements: unknown[]; slideType?: string; audio?: unknown[] }[]): boolean {
  if (slides.length > 1) return true;
  return slides.some((s) => s.elements.length > 0 || (s.slideType && s.slideType !== 'content') || (s.audio?.length ?? 0) > 0);
}

/** File name for Home → Save, from the course title. */
export function projectFileName(title: string | undefined): string {
  const slug = (title || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${slug || 'course-project'}.json`;
}
