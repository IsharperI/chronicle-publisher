/**
 * Image placeholders, like PowerPoint's: a shape marked `imagePlaceholder`
 * that reserves an area for a picture and says what it should show.
 *
 * - In the editor it's a dashed box with its description; double-click it to
 *   choose an image, which replaces it, fitted inside the area.
 * - Empty placeholders are hidden from learners (preview, published course,
 *   video) unless the Publish dialog's "Show empty image placeholders" is on,
 *   which is handy for review builds.
 * - Blueprints create one placeholder per storyboard picture marker
 *   ([Image 3]), tiled when a slide uses several.
 *
 * Images folder (Blueprint dialog): files are numbered by picture order in
 * the storyboard. "3.png" / "03.jpg" / "image 3.png" is picture 3 and fills
 * every placeholder for [Image 3]. When a picture is used on several slides,
 * "3_1.png", "3_2.png", … give each use (in course order) its own file.
 */
import type { ImageElement, ShapeElement, Slide, SlideElement } from '@/types/course';

export interface PlaceholderInfo {
  slideId: string;
  slideIndex: number;
  element: ShapeElement;
  description: string;
  marker?: number;
}

export function isImagePlaceholder(el: SlideElement | undefined): el is ShapeElement {
  return !!el && el.type === 'shape' && !!(el as ShapeElement).imagePlaceholder;
}

/** The first [Image N] marker in a text, if any. */
export function markerIn(text: string): number | undefined {
  const m = text.match(/\[\s*image\s+(\d+)\s*\]/i);
  return m ? Number(m[1]) : undefined;
}
/** All [Image N] markers in a text, in order, without repeats. */
export function markersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\[\s*image\s+(\d+)\s*\]/gi)) {
    const n = Number(m[1]);
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/** Every image placeholder in the course, in slide order (all layers). */
export function findPlaceholders(slides: Slide[]): PlaceholderInfo[] {
  const out: PlaceholderInfo[] = [];
  slides.forEach((s, slideIndex) => {
    const els = s.layers && s.layers.length ? s.layers.flatMap((l) => l.elements) : s.elements;
    for (const el of els) {
      if (!isImagePlaceholder(el)) continue;
      out.push({ slideId: s.id, slideIndex, element: el, description: el.imagePlaceholder!.description, marker: el.imagePlaceholder!.marker });
    }
  });
  return out;
}

/** A new placeholder shape (theme-neutral grey, dashed in the editor). */
export function makePlaceholder(base: Omit<ShapeElement, 'type' | 'shapeType' | 'fillColor' | 'borderColor' | 'borderWidth'>, description: string): ShapeElement {
  const marker = markerIn(description);
  return {
    ...base,
    type: 'shape', shapeType: 'rectangle',
    fillColor: '#f1f5f9', borderColor: '#94a3b8', borderWidth: 2, borderRadius: 6,
    imagePlaceholder: { description: description.trim(), ...(marker !== undefined ? { marker } : {}) },
  };
}

/**
 * Split an area into a tidy grid of `n` boxes (for several pictures on one
 * slide), choosing the grid whose boxes are closest to photo proportions (4:3).
 */
export function tile(box: { x: number; y: number; width: number; height: number }, n: number, gap = 12) {
  if (n <= 1) return [box];
  let cols = 1, best = Infinity;
  for (let c = 1; c <= n; c++) {
    const r = Math.ceil(n / c);
    const aspect = ((box.width - gap * (c - 1)) / c) / ((box.height - gap * (r - 1)) / r);
    const score = Math.abs(Math.log(aspect / (4 / 3)));
    if (score < best) { best = score; cols = c; }
  }
  const rows = Math.ceil(n / cols);
  const w = (box.width - gap * (cols - 1)) / cols, h = (box.height - gap * (rows - 1)) / rows;
  return Array.from({ length: n }, (_, i) => ({
    x: Math.round(box.x + (i % cols) * (w + gap)), y: Math.round(box.y + Math.floor(i / cols) * (h + gap)),
    width: Math.round(w), height: Math.round(h),
  }));
}

// ---- images folder --------------------------------------------------------------

export interface NumberedImage { name: string; dataUrl: string; n: number; use?: number }

/**
 * The picture number (and optional use number) in a file name:
 * "03.png" → 3, "Image 3.jpg" → 3, "img_12_2.png" → 12 (use 2). Returns null
 * for names without a number.
 */
export function parseImageNumber(fileName: string): { n: number; use?: number } | null {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[a-z0-9]+$/i, '');
  const m = base.match(/(\d+)(?:\s*[_-]\s*(\d+))?\s*$/) ?? base.match(/(\d+)/);
  if (!m) return null;
  return { n: Number(m[1]), ...(m[2] ? { use: Number(m[2]) } : {}) };
}

/**
 * Which image fills which placeholder (placeholder element id → image).
 * For each picture number, its placeholders are counted in course order:
 * use k takes "N_k" if present, otherwise the plain "N" file.
 */
export function assignNumberedImages(placeholders: PlaceholderInfo[], images: NumberedImage[]): Map<string, NumberedImage> {
  const plain = new Map<number, NumberedImage>();
  const uses = new Map<string, NumberedImage>();
  for (const img of images) {
    if (img.use === undefined) { if (!plain.has(img.n)) plain.set(img.n, img); }
    else uses.set(`${img.n}_${img.use}`, img);
  }
  const seen = new Map<number, number>();
  const out = new Map<string, NumberedImage>();
  for (const p of placeholders) {
    if (p.marker === undefined) continue;
    const k = (seen.get(p.marker) ?? 0) + 1;
    seen.set(p.marker, k);
    const img = uses.get(`${p.marker}_${k}`) ?? plain.get(p.marker);
    if (img) out.set(p.element.id, img);
  }
  return out;
}

// ---- replacing a placeholder with an image -----------------------------------------

/** Largest box with the image's proportions that fits inside the area, centered. */
export function fitImage(box: { x: number; y: number; width: number; height: number }, natural: { width: number; height: number }) {
  if (!natural.width || !natural.height) return { x: box.x, y: box.y, width: box.width, height: box.height };
  const scale = Math.min(box.width / natural.width, box.height / natural.height);
  const width = Math.round(natural.width * scale), height = Math.round(natural.height * scale);
  return { x: Math.round(box.x + (box.width - width) / 2), y: Math.round(box.y + (box.height - height) / 2), width, height };
}

/** The image element that replaces a placeholder: same timing, animations and triggers, fitted to its area. */
export function imageFromPlaceholder(ph: ShapeElement, src: string, natural: { width: number; height: number }): ImageElement {
  const {
    shapeType: _a, fillColor: _b, borderColor: _c, borderWidth: _d, text: _e, textColor: _f, fontSize: _g,
    hoverFillColor: _h, hoverBorderColor: _i, borderRadius: _j, boxShadow: _k, imagePlaceholder, autoBranchTarget: _l, ...rest
  } = ph;
  void _a; void _b; void _c; void _d; void _e; void _f; void _g; void _h; void _i; void _j; void _k; void _l;
  return {
    ...rest,
    ...fitImage(ph, natural),
    type: 'image',
    src,
    alt: (imagePlaceholder?.description ?? '').replace(/\[\s*image\s+\d+\s*\]/gi, '').trim().slice(0, 300),
  };
}

/** Read an image file as a data URL, scaling big photos down to at most `maxSide` pixels. */
export async function readImageFile(file: File, maxSide = 1920): Promise<{ dataUrl: string; width: number; height: number }> {
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const img = await loadImage(url);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale >= 1 || file.type === 'image/svg+xml' || file.type === 'image/gif') return { dataUrl: url, width: img.naturalWidth, height: img.naturalHeight };
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return { dataUrl: file.type === 'image/png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88), width: c.width, height: c.height };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = src;
  });
}

/**
 * Put numbered images into a course's placeholders (used right after a
 * blueprint is built). Returns the new slides and how many were placed.
 */
export async function placeNumberedImages(slides: Slide[], images: NumberedImage[]): Promise<{ slides: Slide[]; placed: number; empty: number }> {
  const placeholders = findPlaceholders(slides);
  const assignment = assignNumberedImages(placeholders, images);
  const sizes = new Map<string, { width: number; height: number }>();
  for (const img of new Set(assignment.values())) {
    const el = await loadImage(img.dataUrl).catch(() => null);
    sizes.set(img.dataUrl, { width: el?.naturalWidth ?? 0, height: el?.naturalHeight ?? 0 });
  }
  const swap = (el: SlideElement): SlideElement => {
    const img = assignment.get(el.id);
    return img && isImagePlaceholder(el) ? imageFromPlaceholder(el, img.dataUrl, sizes.get(img.dataUrl)!) : el;
  };
  const out = slides.map((s) => {
    if (!placeholders.some((p) => p.slideId === s.id && assignment.has(p.element.id))) return s;
    const layers = s.layers?.map((l) => ({ ...l, elements: l.elements.map(swap) }));
    return { ...s, layers, elements: layers ? layers.flatMap((l) => l.elements) : s.elements.map(swap) };
  });
  return { slides: out, placed: assignment.size, empty: placeholders.length - assignment.size };
}
