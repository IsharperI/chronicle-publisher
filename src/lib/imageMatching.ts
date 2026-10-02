/**
 * Image placeholders (Insert → Image Placeholders).
 *
 * Blueprint slides that need a picture get a grey "IMAGE PLACEHOLDER" box
 * describing it. findPlaceholders() lists them; matchImages() pairs them with
 * images the author adds or images taken from the storyboard:
 * 1. the storyboard marker in the description ([Image 3] → storyboard image 3);
 * 2. a stock or file number of 5+ digits that also appears in the file name
 *    ("stock SS 1493869991" ↔ shutterstock_1493869991.jpg);
 * 3. words from the file name found in the description
 *    ("brake-caliper.jpg" ↔ "Close-up of a brake caliper").
 * Each image is used at most once. fitImage() sizes an image inside the
 * placeholder's box without stretching it.
 */
import type { ShapeElement, Slide, SlideElement } from '@/types/course';

export const PLACEHOLDER_PREFIX = 'IMAGE PLACEHOLDER';

export interface Placeholder {
  slideId: string;
  slideIndex: number;
  slideTitle: string;
  elementId: string;
  /** Layer the placeholder is on (for lightbox pop-ups: the item's name). */
  layerName?: string;
  description: string;
  x: number; y: number; width: number; height: number;
}

export interface CandidateImage {
  id: string;
  name: string;
  dataUrl: string;
  /** Storyboard images: the number in their [Image N] marker. */
  marker?: number;
}

export type MatchReason = 'storyboard' | 'number' | 'name' | 'manual';
export interface Match { imageId: string; reason: MatchReason }

export function isPlaceholder(el: SlideElement): el is ShapeElement {
  return el.type === 'shape' && typeof (el as ShapeElement).text === 'string' && (el as ShapeElement).text!.trim().startsWith(PLACEHOLDER_PREFIX);
}

export function findPlaceholders(slides: Slide[]): Placeholder[] {
  const out: Placeholder[] = [];
  slides.forEach((s, slideIndex) => {
    const layers = s.layers && s.layers.length ? s.layers : [{ name: undefined as string | undefined, elements: s.elements }];
    layers.forEach((l, li) => {
      for (const el of l.elements) {
        if (!isPlaceholder(el)) continue;
        out.push({
          slideId: s.id, slideIndex, slideTitle: s.title?.trim() || `Slide ${slideIndex + 1}`,
          elementId: el.id, layerName: li > 0 ? l.name : undefined,
          description: el.text!.trim().slice(PLACEHOLDER_PREFIX.length).trim(),
          x: el.x, y: el.y, width: el.width, height: el.height,
        });
      }
    });
  });
  return out;
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'image', 'photo', 'picture', 'stock', 'img', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'copy', 'final', 'shutterstock', 'istock', 'adobe', 'adobestock', 'getty']);
const words = (s: string) => (s.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !STOP.has(w));
const stem = (w: string) => w.replace(/(ing|es|s)$/, '');
const numbers = (s: string) => s.match(/\d{5,}/g) ?? [];
const markerOf = (s: string) => {
  const m = s.match(/\[\s*image\s+(\d+)\s*\]/i);
  return m ? Number(m[1]) : undefined;
};

/** Score how well an image's file name fits a description (0 = no match). */
function nameScore(desc: string, fileName: string): number {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '');
  const fw = [...new Set(words(base).map(stem))];
  if (!fw.length) return 0;
  const dw = new Set(words(desc).map(stem));
  const hits = fw.filter((w) => dw.has(w)).length;
  return hits / fw.length;
}

/**
 * Pair placeholders with images. `keep` holds matches to leave alone (for
 * example ones the author picked by hand). Returns placeholder id → match.
 */
export function matchImages(placeholders: Placeholder[], images: CandidateImage[], keep: Record<string, Match> = {}): Record<string, Match> {
  const out: Record<string, Match> = { ...keep };
  const used = new Set(Object.values(keep).map((m) => m.imageId));
  const open = () => placeholders.filter((p) => !out[p.elementId]);
  const take = (p: Placeholder, img: CandidateImage, reason: MatchReason) => {
    out[p.elementId] = { imageId: img.id, reason };
    used.add(img.id);
  };

  for (const p of open()) {
    const n = markerOf(p.description);
    const img = n !== undefined ? images.find((i) => i.marker === n && !used.has(i.id)) : undefined;
    if (img) take(p, img, 'storyboard');
  }
  for (const p of open()) {
    const nums = numbers(p.description);
    const img = nums.length ? images.find((i) => !used.has(i.id) && nums.some((n) => i.name.includes(n))) : undefined;
    if (img) take(p, img, 'number');
  }
  // Best word matches first, so a strong pair isn't taken by a weaker one.
  const pairs: { p: Placeholder; img: CandidateImage; score: number }[] = [];
  for (const p of open()) for (const img of images) {
    if (used.has(img.id) || img.marker !== undefined) continue;
    const score = nameScore(p.description, img.name);
    if (score >= 0.5) pairs.push({ p, img, score });
  }
  pairs.sort((a, b) => b.score - a.score);
  for (const { p, img } of pairs) if (!out[p.elementId] && !used.has(img.id)) take(p, img, 'name');
  return out;
}

/** Largest box with the image's proportions that fits inside the placeholder, centered. */
export function fitImage(box: { x: number; y: number; width: number; height: number }, natural: { width: number; height: number }) {
  if (!natural.width || !natural.height) return { x: box.x, y: box.y, width: box.width, height: box.height };
  const scale = Math.min(box.width / natural.width, box.height / natural.height);
  const width = Math.round(natural.width * scale), height = Math.round(natural.height * scale);
  return { x: Math.round(box.x + (box.width - width) / 2), y: Math.round(box.y + (box.height - height) / 2), width, height };
}
