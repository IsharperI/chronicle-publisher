/**
 * Client brands (Design → Brands): a client's colours, fonts, logo and
 * title-bar style, saved once and applied to any course.
 *
 * - The brand library is kept in this browser (localStorage). Brands can be
 *   exported to / imported from a .json file to share them with the team, and
 *   the brand a course uses is also saved inside the course
 *   (courseSettings.brand), so anyone opening the course can add it to
 *   their own library.
 * - applyBrandToCourse() restyles an existing course:
 *   - Theme colours drive every element that uses a theme colour (all
 *     blueprint-made slides do).
 *   - Body and heading fonts are course-wide (courseSettings.bodyFont /
 *     headingFont); text marked fontRole 'heading' uses the heading font.
 *   - Title bars made by blueprints (brandRole 'titleBar' / 'titleText') are
 *     restyled to the brand's title style.
 *   - The logo is placed on every content slide (brandRole 'logo'),
 *     replacing the previous brand's logo; it's larger on title slides
 *     (whose background is marked brandRole 'cover').
 * - Player buttons take the brand's primary colour.
 * Blueprints use the same functions, so new courses come out branded.
 */
import type { Brand, CanvasDimensions, CourseSettings, ImageElement, PlayerSettings, ShapeElement, Slide, SlideElement, TextElement } from '@/types/course';
import { themeVarRef } from './themeVars';

export const BRAND_FONTS: { value: string; label: string }[] = [
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Helvetica, sans-serif', label: 'Helvetica' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: 'Tahoma, sans-serif', label: 'Tahoma' },
  { value: 'Trebuchet MS, sans-serif', label: 'Trebuchet MS' },
  { value: 'Segoe UI, sans-serif', label: 'Segoe UI' },
  { value: 'Calibri, sans-serif', label: 'Calibri' },
  { value: 'Roboto, sans-serif', label: 'Roboto' },
  { value: 'Inter, sans-serif', label: 'Inter' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Times New Roman, serif', label: 'Times New Roman' },
  { value: 'system-ui, sans-serif', label: 'System default' },
];

export const TITLE_STYLES: { value: Brand['titleStyle']; label: string }[] = [
  { value: 'solid', label: 'Solid bar (primary colour)' },
  { value: 'light', label: 'Light bar with accent line' },
  { value: 'minimal', label: 'No bar, coloured title' },
];

export function newBrand(from?: Partial<Brand>): Brand {
  return {
    id: crypto.randomUUID(),
    name: 'New brand',
    colors: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#1f2937', '#f9fafb'],
    bodyFont: 'Arial, sans-serif',
    headingFont: 'Arial, sans-serif',
    logoPosition: 'top-right',
    titleStyle: 'solid',
    ...from,
  };
}

// ---- library (this browser) ---------------------------------------------------

const KEY = 'chronicle.brands';
const LAST = 'chronicle.lastBrand';

export function loadBrands(): Brand[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((b) => b && typeof b.id === 'string') : [];
  } catch {
    return [];
  }
}
export function saveBrands(list: Brand[]): string | null {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return null;
  } catch {
    return 'Browser storage is full. Try a smaller logo image.';
  }
}
export function lastBrandId(): string | null {
  try { return localStorage.getItem(LAST); } catch { return null; }
}
export function setLastBrandId(id: string | null) {
  try { if (id) localStorage.setItem(LAST, id); else localStorage.removeItem(LAST); } catch { /* ignore */ }
}

// ---- applying a brand ---------------------------------------------------------

export const TITLE_BAR = { y: 0, h: 110 };

/** Colours of a blueprint title bar for a title style (theme references, so later colour changes follow). */
export function titleBarColors(style: Brand['titleStyle']) {
  if (style === 'light') return { bar: themeVarRef(5), text: themeVarRef(0), accent: themeVarRef(3) };
  if (style === 'minimal') return { bar: 'transparent', text: themeVarRef(0), accent: themeVarRef(0) };
  return { bar: themeVarRef(0), text: themeVarRef(5), accent: null };
}

const elementsOf = (s: Slide) => (s.layers && s.layers.length ? s.layers.flatMap((l) => l.elements) : s.elements);

function mapSlide(s: Slide, f: (els: SlideElement[], layerIndex: number) => SlideElement[]): Slide {
  if (s.layers && s.layers.length) {
    const layers = s.layers.map((l, i) => ({ ...l, elements: f(l.elements, i) }));
    return { ...s, layers, elements: layers.flatMap((l) => l.elements) };
  }
  return { ...s, elements: f(s.elements, 0) };
}

function base(id: string, x: number, y: number, width: number, height: number, duration: number) {
  return {
    id, x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height),
    startTime: 0, duration, triggers: [], animationIn: 'none' as const, animationOut: 'none' as const, entranceDuration: 500, exitDuration: 500,
  };
}

/** Where the logo goes on a slide, scaled to the canvas. */
export function logoBox(brand: Brand, slide: Slide, canvas: CanvasDimensions) {
  const sx = canvas.width / 1024, sy = canvas.height / 768;
  const aspect = brand.logoAspect && brand.logoAspect > 0 ? brand.logoAspect : 3;
  const hasBar = elementsOf(slide).some((e) => e.brandRole === 'titleBar');
  const isTitle = elementsOf(slide).some((e) => e.brandRole === 'cover');
  const h = (isTitle ? 90 : hasBar ? 60 : 50) * sy;
  const w = Math.min(h * aspect, (isTitle ? 360 : 240) * sx);
  const hh = w / aspect;
  const left = brand.logoPosition.endsWith('left');
  const top = brand.logoPosition.startsWith('top');
  const margin = 24 * sx;
  const x = left ? margin : canvas.width - margin - w;
  let y: number;
  if (hasBar && top) y = (TITLE_BAR.y + (TITLE_BAR.h * sy - hh) / 2);
  else y = top ? 20 * sy : canvas.height - 20 * sy - hh;
  return { x, y, width: w, height: hh };
}

/** Restyle one slide for a brand: title bar style, logo. */
export function brandSlide(slide: Slide, brand: Brand, canvas: CanvasDimensions): Slide {
  const colors = titleBarColors(brand.titleStyle);
  const sy = canvas.height / 768, sx = canvas.width / 1024;
  const duration = slide.duration ?? 5000;
  const bar = elementsOf(slide).find((e) => e.brandRole === 'titleBar');
  let out = mapSlide(slide, (els, li) => {
    let list = els
      .filter((e) => e.brandRole !== 'logo' && e.brandRole !== 'titleAccent')
      .map((e): SlideElement => {
        if (e.brandRole === 'titleBar') return { ...(e as ShapeElement), fillColor: colors.bar, borderColor: colors.bar };
        if (e.brandRole === 'titleText') return { ...(e as TextElement), textColor: colors.text };
        return e;
      });
    if (li !== 0) return list;
    // Accent line under the title bar for the light and minimal styles.
    if (bar && colors.accent) {
      const accent: ShapeElement = {
        ...base(crypto.randomUUID(), 0, bar.y + bar.height - (brand.titleStyle === 'light' ? 6 : 3) * sy, canvas.width, (brand.titleStyle === 'light' ? 6 : 3) * sy, duration),
        type: 'shape', shapeType: 'rectangle', fillColor: colors.accent, borderColor: colors.accent, borderWidth: 0, brandRole: 'titleAccent',
      };
      if (brand.titleStyle === 'minimal') { accent.x = Math.round(60 * sx); accent.width = Math.round(160 * sx); }
      const at = list.findIndex((e) => e.id === bar.id);
      list = [...list.slice(0, at + 1), accent, ...list.slice(at + 1)];
    }
    if (brand.logo && slide.slideType !== 'quiz' && slide.slideType !== 'results') {
      const logo: ImageElement = {
        ...base(crypto.randomUUID(), 0, 0, 1, 1, duration), ...logoBox(brand, slide, canvas),
        type: 'image', src: brand.logo, alt: `${brand.name} logo`, brandRole: 'logo', isLocked: true,
      };
      list = [...list, logo];
    }
    return list;
  });
  if (out === slide) out = { ...slide };
  return out;
}

export interface BrandedCourse {
  slides: Slide[];
  courseSettings: Partial<CourseSettings>;
  playerSettings: Partial<PlayerSettings>;
}

/** Apply a brand to a whole course (see the file comment). */
export function applyBrandToCourse(slides: Slide[], settings: CourseSettings, player: PlayerSettings, brand: Brand): BrandedCourse {
  return {
    slides: slides.map((s) => brandSlide(s, brand, settings.canvasDimensions)),
    courseSettings: { themeColors: [...brand.colors], bodyFont: brand.bodyFont, headingFont: brand.headingFont, brand: { ...brand } },
    playerSettings: { ...player, buttonColor: brand.colors[0] },
  };
}

/** CSS variables (and the body font) for a slide stage: --course-font / --course-heading-font. */
export function fontStyle(settings: Pick<CourseSettings, 'bodyFont' | 'headingFont'>): React.CSSProperties {
  const style: Record<string, string> = {};
  if (settings.bodyFont) { style['--course-font'] = settings.bodyFont; style.fontFamily = settings.bodyFont; }
  if (settings.headingFont) style['--course-heading-font'] = settings.headingFont;
  return style as React.CSSProperties;
}

/** Font for a text element: headings use the heading font. */
export const HEADING_FONT = 'var(--course-heading-font, inherit)';

/** Read a logo file, scaled down to a sensible size; returns data URL and aspect ratio. */
export async function readLogo(file: File): Promise<{ dataUrl: string; aspect: number }> {
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Could not read the logo image'));
    i.src = url;
  });
  const aspect = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 3;
  if (file.type === 'image/svg+xml' || img.naturalHeight <= 300) return { dataUrl: url, aspect };
  const c = document.createElement('canvas');
  c.height = 300;
  c.width = Math.round(300 * aspect);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return { dataUrl: c.toDataURL('image/png'), aspect };
}
