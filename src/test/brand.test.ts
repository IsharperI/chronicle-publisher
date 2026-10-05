import { describe, it, expect } from 'vitest';
import { prepareBlueprintLoad } from '@/lib/blueprint';
import { courseReducer } from '@/context/CourseContext';
import { newBrand } from '@/lib/brand';
import { sanitizeBrand } from '@/lib/sanitize';
import { sanitizeProject } from '@/lib/project';
import { defaultCourseSettings, type Brand, type CourseState, type Slide } from '@/types/course';

const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const xpan: Brand = newBrand({
  id: 'xpan', name: 'Xpan', colors: ['#163a63', '#2a6fb0', '#2a9d8f', '#f28c28', '#1f2937', '#f9fafb'],
  bodyFont: 'Verdana, sans-serif', headingFont: 'Georgia, serif', logo: LOGO, logoAspect: 2, logoPosition: 'top-right', titleStyle: 'solid',
});
const bp = { blueprintVersion: 1, course: { title: 'T', themeColors: ['#000000', '#111111', '#222222', '#333333', '#444444', '#555555'] }, slides: [
  { layout: 'title', title: 'Welcome' },
  { layout: 'bullets', title: 'Points', bullets: ['a'] },
  { layout: 'quiz', question: 'Q?', choices: [{ text: 'y', correct: true }, { text: 'n', correct: false }] },
] };
function load(brand?: Brand): CourseState {
  const res = prepareBlueprintLoad(bp, defaultCourseSettings, brand);
  if (res.ok === false) throw new Error(res.errors.join());
  return courseReducer(undefined as unknown as CourseState, { type: 'LOAD_COURSE', ...res.payload });
}
const els = (s: Slide) => s.layers!.flatMap((l) => l.elements);

describe('brands on blueprints', () => {
  it('uses the brand instead of the AI’s colours, with fonts, logo and player colour', () => {
    const s = load(xpan);
    expect(s.courseSettings.themeColors).toEqual(xpan.colors);
    expect(s.courseSettings).toMatchObject({ bodyFont: 'Verdana, sans-serif', headingFont: 'Georgia, serif' });
    expect(s.courseSettings.brand?.name).toBe('Xpan');
    expect(s.playerSettings.buttonColor).toBe('#163a63');
    const [title, bullets, quiz] = s.slides;
    expect(els(title).filter((e) => e.brandRole === 'logo')).toHaveLength(1);
    expect(els(bullets).filter((e) => e.brandRole === 'logo')).toHaveLength(1);
    expect(els(quiz).filter((e) => e.brandRole === 'logo')).toHaveLength(0);
    // Logo sits in the title bar, at the right.
    const logo = els(bullets).find((e) => e.brandRole === 'logo')!;
    expect(logo.y).toBeGreaterThanOrEqual(0);
    expect(logo.y + logo.height).toBeLessThanOrEqual(110);
    expect(logo.x + logo.width).toBeGreaterThan(900);
  });

  it('keeps theme colour references and font roles through save and load', () => {
    const s = load();
    const bar = els(s.slides[1]).find((e) => e.brandRole === 'titleBar')!;
    expect((bar as { fillColor: string }).fillColor).toBe('var(--theme-primary)');
    const heading = els(s.slides[1]).find((e) => e.brandRole === 'titleText')!;
    expect((heading as { fontRole?: string }).fontRole).toBe('heading');
    expect(s.courseSettings.themeColors[0]).toBe('#000000'); // no brand: the blueprint's colours
  });
});

describe('applying a brand to a course', () => {
  it('restyles title bars, swaps the logo and is undoable as one change', () => {
    let s = load(xpan);
    const light = { ...xpan, id: 'light', name: 'Light', titleStyle: 'light' as const, logoPosition: 'top-left' as const };
    s = courseReducer(s, { type: 'APPLY_BRAND', brand: light });
    const slide = s.slides[1];
    const bar = els(slide).find((e) => e.brandRole === 'titleBar') as { fillColor: string };
    const title = els(slide).find((e) => e.brandRole === 'titleText') as { textColor: string };
    expect(bar.fillColor).toBe('var(--theme-light)');
    expect(title.textColor).toBe('var(--theme-primary)');
    expect(els(slide).filter((e) => e.brandRole === 'titleAccent')).toHaveLength(1);
    const logos = els(slide).filter((e) => e.brandRole === 'logo');
    expect(logos).toHaveLength(1);
    expect(logos[0].x).toBeLessThan(100);
    // Back to solid: accent line goes away; applying twice never duplicates logos.
    s = courseReducer(s, { type: 'APPLY_BRAND', brand: xpan });
    s = courseReducer(s, { type: 'APPLY_BRAND', brand: xpan });
    expect(els(s.slides[1]).filter((e) => e.brandRole === 'titleAccent')).toHaveLength(0);
    expect(els(s.slides[1]).filter((e) => e.brandRole === 'logo')).toHaveLength(1);
  });

  it('a brand without a logo removes the old logo', () => {
    let s = load(xpan);
    s = courseReducer(s, { type: 'APPLY_BRAND', brand: { ...xpan, logo: undefined } });
    expect(s.slides.flatMap(els).filter((e) => e.brandRole === 'logo')).toHaveLength(0);
  });

  it('brands survive course files and brand files, and bad values are cleaned', () => {
    const s = load(xpan);
    const back = sanitizeProject(JSON.parse(JSON.stringify({ slides: s.slides, courseSettings: s.courseSettings })))!;
    expect(back.courseSettings?.brand?.logo).toBe(LOGO);
    expect(back.courseSettings?.headingFont).toBe('Georgia, serif');
    expect(sanitizeBrand({ ...xpan, bodyFont: 'Evil; font', colors: ['red;', ...xpan.colors.slice(1)] })).toMatchObject({ bodyFont: 'Arial, sans-serif' });
    expect(sanitizeBrand({ name: 'no colours' })).toBeUndefined();
  });
});
