import { describe, it, expect } from 'vitest';
import { prepareBlueprintLoad } from '@/lib/blueprint';
import { assignNumberedImages, findPlaceholders, fitImage, imageFromPlaceholder, parseImageNumber, type NumberedImage } from '@/lib/imagePlaceholders';
import { sanitizeSlides } from '@/lib/sanitize';
import { courseReducer } from '@/context/CourseContext';
import { defaultCourseSettings, type CourseState, type ShapeElement } from '@/types/course';

function course(slides: unknown[]): CourseState {
  const res = prepareBlueprintLoad({ blueprintVersion: 1, course: { title: 'T' }, slides }, defaultCourseSettings);
  if (res.ok === false) throw new Error(res.errors.join());
  return courseReducer(undefined as unknown as CourseState, { type: 'LOAD_COURSE', ...res.payload });
}
const it2 = (title: string, imageDescription: string) => ({ layout: 'image-text', title, body: 'b', imageDescription });

describe('placeholders from blueprints', () => {
  const s = course([
    it2('Caliper', 'Brake caliper close-up [Image 2]'),
    it2('Collage', 'Devices that use current [Image 7] [Image 8] [Image 9] [Image 10]'),
    it2('No marker', 'Technician at a switchboard'),
    { layout: 'reveal', title: 'R', items: [{ label: 'A', body: 'x', imageDescription: 'Roof unit [Image 2]' }, { label: 'B', body: 'y' }] },
  ]);
  const ph = findPlaceholders(s.slides);

  it('makes real placeholders (no text) with the picture number, including in pop-ups', () => {
    expect(ph.map((p) => p.marker)).toEqual([2, 7, 8, 9, 10, undefined, 2]);
    expect(ph.every((p) => !p.element.text)).toBe(true);
    expect(ph[0].description).toBe('Brake caliper close-up [Image 2]');
  });

  it('tiles several pictures in one image area without overlap', () => {
    const tiles = ph.filter((p) => p.slideIndex === 1).map((p) => p.element);
    expect(tiles).toHaveLength(4);
    for (const a of tiles) for (const b of tiles) {
      if (a === b) continue;
      expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false);
    }
    expect(tiles[1].imagePlaceholder!.description).toBe('Devices that use current [Image 8]');
  });

  it('converts old-style text placeholders from earlier courses', () => {
    const [slide] = sanitizeSlides([{ id: 's', elements: [{ id: 'e', type: 'shape', shapeType: 'rectangle', x: 0, y: 0, width: 10, height: 10, text: 'IMAGE PLACEHOLDER\n\nBus door [Image 5]' }] }]);
    const el = slide.elements[0] as ShapeElement;
    expect(el.imagePlaceholder).toEqual({ description: 'Bus door [Image 5]', marker: 5 });
    expect(el.text).toBeUndefined();
  });
});

describe('numbered images folder', () => {
  it('reads picture numbers from file names', () => {
    expect(parseImageNumber('03.png')).toEqual({ n: 3 });
    expect(parseImageNumber('Image 12.jpg')).toEqual({ n: 12 });
    expect(parseImageNumber('14_2.png')).toEqual({ n: 14, use: 2 });
    expect(parseImageNumber('img-14-3.webp')).toEqual({ n: 14, use: 3 });
    expect(parseImageNumber('logo.png')).toBeNull();
  });

  it('fills every use of a picture, with per-use files taking priority', () => {
    const s = course([it2('A', 'x [Image 14]'), it2('B', 'y [Image 14]'), it2('C', 'z [Image 14]'), it2('D', 'w [Image 3]'), it2('E', 'v [Image 99]')]);
    const ph = findPlaceholders(s.slides);
    const img = (name: string): NumberedImage => ({ name, dataUrl: name, ...parseImageNumber(name)! });
    const m = assignNumberedImages(ph, [img('14.png'), img('14_2.png'), img('03.jpg')]);
    expect(ph.map((p) => m.get(p.element.id)?.name ?? '-')).toEqual(['14.png', '14_2.png', '14.png', '03.jpg', '-']);
  });

  it('swaps a placeholder for an image fitted to its area, keeping timing', () => {
    const s = course([it2('A', 'x [Image 1]')]);
    const p = findPlaceholders(s.slides)[0].element;
    const img = imageFromPlaceholder(p, 'data:image/png;base64,AA==', { width: 800, height: 400 });
    expect(img).toMatchObject({ type: 'image', id: p.id, alt: 'x', startTime: p.startTime, duration: p.duration });
    expect((img as unknown as ShapeElement).imagePlaceholder).toBeUndefined();
    expect(img.width / img.height).toBeCloseTo(2, 1);
    expect(fitImage({ x: 0, y: 0, width: 400, height: 400 }, { width: 800, height: 400 })).toEqual({ x: 0, y: 100, width: 400, height: 200 });
  });
});
