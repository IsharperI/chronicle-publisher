/**
 * Storyboard → AI prompt (Home → Blueprint → "Start from a storyboard").
 *
 * Reads a Word storyboard (.docx) in the browser, or a plain text / Markdown
 * file, and turns it into text an AI chat can read:
 * - paragraphs become lines; tables become one line per row, cells separated
 *   by " | ", so a storyboard's columns (slide, on-screen text, VO, notes)
 *   stay together;
 * - each picture becomes a marker like [Image 3]. The pictures themselves are
 *   kept (storyboardImages) so the Image Placeholders dialog can put them on
 *   the slides whose imageDescription mentions the marker.
 *
 * buildStoryboardPrompt() puts the blueprint instructions (BLUEPRINT_GUIDE)
 * and the storyboard text together, ready to paste into Gemini or any AI chat.
 */
import JSZip from 'jszip';
import { BLUEPRINT_GUIDE } from './blueprint';

export interface StoryboardImage {
  /** The number used in the [Image N] marker. */
  n: number;
  name: string;
  dataUrl: string;
}

export interface ExtractedStoryboard {
  fileName: string;
  text: string;
  images: StoryboardImage[];
  /** Pictures in formats browsers can't show (EMF/WMF drawings), skipped. */
  skippedImages: number;
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' };

/** Images from the most recently read storyboard (this browser session only). */
let lastImages: StoryboardImage[] = [];
export const storyboardImages = (): StoryboardImage[] => lastImages;

export async function extractStoryboard(file: File): Promise<ExtractedStoryboard> {
  const name = file.name;
  if (/\.(txt|md|markdown)$/i.test(name)) {
    lastImages = [];
    return { fileName: name, text: (await file.text()).trim(), images: [], skippedImages: 0 };
  }
  if (!/\.docx$/i.test(name)) {
    throw new Error('Choose a Word storyboard (.docx) or a text file (.txt, .md). For a PDF or older .doc file, save it as .docx first.');
  }
  const result = await extractDocx(await file.arrayBuffer(), name);
  lastImages = result.images;
  return result;
}

export async function extractDocx(data: ArrayBuffer, fileName = 'storyboard.docx'): Promise<ExtractedStoryboard> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error('This file could not be opened as a Word document.');
  }
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) throw new Error('This file could not be opened as a Word document.');
  const relsXml = (await zip.file('word/_rels/document.xml.rels')?.async('string')) ?? '';

  // Relationship id → media path (word/media/image1.png).
  const rels = new Map<string, string>();
  const relDoc = new DOMParser().parseFromString(relsXml || '<Relationships/>', 'application/xml');
  for (const r of Array.from(relDoc.getElementsByTagName('Relationship'))) {
    const target = r.getAttribute('Target') ?? '';
    rels.set(r.getAttribute('Id') ?? '', target.startsWith('/') ? target.slice(1) : 'word/' + target.replace(/^\.\//, ''));
  }

  const doc = new DOMParser().parseFromString(docXml, 'application/xml');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  const markerFor = new Map<string, number>(); // media path → image number
  const order: string[] = [];

  const imageMarker = (el: Element): string => {
    const out: string[] = [];
    for (const blip of Array.from(el.getElementsByTagNameNS('*', 'blip'))) {
      const id = blip.getAttributeNS(R, 'embed') ?? blip.getAttribute('r:embed') ?? '';
      const path = rels.get(id);
      if (!path) continue;
      if (!markerFor.has(path)) {
        order.push(path);
        markerFor.set(path, order.length);
      }
      out.push(`[Image ${markerFor.get(path)}]`);
    }
    return out.join(' ');
  };

  const runText = (node: Element): string => {
    let s = '';
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      const tag = el.localName;
      if (tag === 't') s += el.textContent ?? '';
      else if (tag === 'tab') s += '\t';
      else if (tag === 'br' || tag === 'cr') s += '\n';
      else if (tag === 'drawing' || tag === 'pict' || tag === 'object') s += ' ' + imageMarker(el) + ' ';
      else if (tag !== 'rPr' && tag !== 'pPr') s += runText(el);
    }
    return s;
  };
  const paraText = (p: Element) => runText(p).replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ').trim();

  const block = (el: Element): string[] => {
    if (el.localName === 'p') {
      const t = paraText(el);
      return t ? [t] : [];
    }
    if (el.localName === 'tbl') {
      const lines: string[] = [];
      for (const tr of Array.from(el.children).filter((c) => c.localName === 'tr')) {
        const cells = Array.from(tr.children)
          .filter((c) => c.localName === 'tc')
          .map((tc) => Array.from(tc.children).flatMap(block).join(' / ').replace(/\n+/g, ' / ').trim());
        if (cells.some(Boolean)) lines.push(cells.join(' | '));
      }
      return lines.length ? ['', ...lines, ''] : [];
    }
    if (el.localName === 'sdt' || el.localName === 'sdtContent' || el.localName === 'customXml') {
      return Array.from(el.children).flatMap(block);
    }
    return [];
  };

  const lines = body ? Array.from(body.children).flatMap(block) : [];
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  const images: StoryboardImage[] = [];
  let skippedImages = 0;
  for (const path of order) {
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    const mime = MIME[ext];
    const f = zip.file(path);
    if (!mime || !f) {
      skippedImages++;
      continue;
    }
    images.push({ n: markerFor.get(path)!, name: path.split('/').pop() ?? path, dataUrl: `data:${mime};base64,${await f.async('base64')}` });
  }
  return { fileName, text, images, skippedImages };
}

/** The full prompt to paste into an AI chat: the blueprint instructions plus the storyboard. */
export function buildStoryboardPrompt(sb: Pick<ExtractedStoryboard, 'fileName' | 'text'>, extra?: string): string {
  const parts = [
    BLUEPRINT_GUIDE,
    '',
    '---',
    extra?.trim() ? `NOTES FROM THE COURSE DEVELOPER\n${extra.trim()}\n\n---` : '',
    `SOURCE MATERIAL: the storyboard "${sb.fileName}". Table rows are shown as cells separated by " | ". Pictures are shown as markers like [Image 3].`,
    '',
    sb.text,
    '',
    '---',
    'Now write the course blueprint JSON for this storyboard, following the rules above.',
  ];
  return parts.filter((p, i) => p !== '' || parts[i - 1] !== '').join('\n');
}
