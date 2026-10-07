import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildPlayerHtml } from '@/lib/publish/runtime/player';
import { buildScorm12Runtime } from '@/lib/publish/runtime/scorm12';
import type { PublishOptions } from '@/lib/publish/types';

/**
 * Resuming a published course: the exported player is run in jsdom against a
 * fake SCORM 1.2 LMS whose data survives "relaunching" (running it again).
 */

const text = (id: string, content: string) => ({
  id, type: 'text', x: 0, y: 0, width: 400, height: 80, startTime: 0, duration: 5000, triggers: [],
  animationIn: 'none', animationOut: 'none', entranceDuration: 500, exitDuration: 500,
  content, fontSize: 24, fontWeight: '400', textColor: '#000', backgroundColor: 'transparent',
});
const slide = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: id, duration: 5000, elements: [text(id + '-t', id)], ...extra });

const COURSE = {
  slides: [
    slide('aaaaaaaa-1'),
    slide('bbbbbbbb-2'),
    {
      id: 'cccccccc-3', title: 'Quiz', duration: 5000, elements: [], slideType: 'quiz',
      quiz: { questionType: 'multiple-choice', question: 'Pick B', choices: [{ id: 'ch-a', text: 'A', correct: false }, { id: 'ch-b', text: 'B', correct: true }] },
    },
    slide('dddddddd-4'),
  ],
  masterSlides: [],
  variables: [],
  playerSettings: { courseTitle: 'Resume test', navigationMode: 'free', backgroundColor: '#000', buttonColor: '#3b82f6' },
  courseSettings: { canvasDimensions: { width: 1024, height: 768 }, themeColors: ['#1e3a5f', '#3b6ea5', '#2a9d8f', '#f4a261', '#1f2937', '#f9fafb'], transition: { type: 'none', duration: 0 } },
};

const OPTS: PublishOptions = {
  format: 'scorm12', courseTitle: 'T', description: '', filename: 'x.zip', identifier: 'i', version: '1', duration: '',
  keywords: '', lessonTitle: 'L', lessonIdentifier: 'l', reportStatus: 'passed-failed', completion: { mode: 'percent', percent: 100 },
};

let lms: Record<string, string>;

function launch(opts: Partial<PublishOptions> = {}) {
  const html = buildPlayerHtml(COURSE as never, { ...OPTS, ...opts }, buildScorm12Runtime());
  const doc = new DOMParser().parseFromString(html, 'text/html');
  document.body.innerHTML = doc.body.innerHTML;
  (window as unknown as { API: unknown }).API = {
    LMSInitialize: () => 'true', LMSFinish: () => 'true', LMSCommit: () => 'true',
    LMSGetValue: (k: string) => lms[k] ?? '', LMSSetValue: (k: string, v: string) => { lms[k] = v; return 'true'; },
    LMSGetLastError: () => '0', LMSGetErrorString: () => '', LMSGetDiagnostic: () => '',
  };
  for (const s of Array.from(doc.querySelectorAll('script'))) new Function(s.textContent ?? '')();
}
const meta = () => document.getElementById('meta')!.textContent;
const next = () => (document.getElementById('next') as HTMLButtonElement).click();
const option = (label: string) => Array.from(document.querySelectorAll('#stage div')).find((d) => d.textContent === label && d.children.length === 0) as HTMLElement;
const button = (label: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent === label)!;
/** Leave the course, as closing the LMS window does. */
const leave = () => window.dispatchEvent(new Event('pagehide'));

describe('resuming a published course (SCORM 1.2)', () => {
  beforeEach(() => { lms = { 'cmi.core.lesson_status': 'not attempted' }; });
  afterEach(() => leave());

  it('starts at slide 1 with no prompt the first time', () => {
    launch();
    expect(document.getElementById('resume-prompt')).toBeNull();
    expect(meta()).toBe('Slide 1 / 4');
  });

  it('asks to resume, and puts the learner back on their slide with their quiz answer', () => {
    launch();
    next(); next();
    option('B').click();
    button('Submit').click();
    button('Continue').click();
    expect(meta()).toBe('Slide 4 / 4');
    leave();
    expect(lms['cmi.core.exit']).toBe(''); // every slide seen, so the course is complete

    launch();
    expect(document.getElementById('resume-prompt')).not.toBeNull();
    button('Resume').click();
    expect(meta()).toBe('Slide 4 / 4');
    (document.getElementById('prev') as HTMLButtonElement).click();
    expect(meta()).toBe('Slide 3 / 4');
    expect(document.body.textContent).toContain('Correct!');
  });

  it('Start over goes back to slide 1 and forgets the old progress', () => {
    launch();
    next(); next();
    leave();
    expect(lms['cmi.core.exit']).toBe('suspend'); // left part-way: the LMS keeps the bookmark
    launch();
    button('Start over').click();
    expect(meta()).toBe('Slide 1 / 4');
    expect(JSON.parse(lms['cmi.suspend_data']).s).toBe('aaaaaa');
    leave();
    launch();
    expect(document.getElementById('resume-prompt')).toBeNull();
  });

  it('"Always resume" skips the prompt and "Always start at slide 1" ignores the bookmark', () => {
    launch();
    next();
    leave();
    launch({ resume: 'always' });
    expect(document.getElementById('resume-prompt')).toBeNull();
    expect(meta()).toBe('Slide 2 / 4');
    leave();
    launch({ resume: 'never' });
    expect(meta()).toBe('Slide 1 / 4');
  });

  it('still resumes from a course published before saved progress existed', () => {
    lms['cmi.core.lesson_location'] = '1';
    lms['cmi.suspend_data'] = JSON.stringify({ b: {} });
    launch();
    button('Resume').click();
    expect(meta()).toBe('Slide 2 / 4');
  });

  it('ignores damaged saved data', () => {
    lms['cmi.suspend_data'] = '{oops';
    lms['cmi.core.lesson_location'] = 'x';
    launch();
    expect(document.getElementById('resume-prompt')).toBeNull();
    expect(meta()).toBe('Slide 1 / 4');
  });
});
