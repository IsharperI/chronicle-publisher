/**
 * Storyboard → AI prompt (Home → Blueprint → "Start from a storyboard").
 *
 * Reads a Word storyboard (.docx) in the browser, or a plain text / Markdown
 * file, and turns it into text an AI chat can read:
 * - paragraphs become lines; headings are marked with #, ## … and keep
 *   Word's automatic numbering ("Section 2", "Slide 2.1"), which matters
 *   because many storyboard templates number their slides that way;
 * - the table of contents is left out (it only repeats the headings);
 * - tables become one line per row, | cell | cell |, so a
 *   storyboard's columns (slide, on-screen text, VO, notes) stay together;
 * - each picture becomes a marker like [Image 3]. The pictures themselves are
 *   kept (storyboardImages) for the Blueprint dialog's images option.
 *
 * It also lists the storyboard's slides (number, title, VO script) so the
 * Blueprint dialog can check the AI didn't skip or shorten any. Slides are
 * found from headings like "Slide 2.1 Title", or from a table column named
 * Slide / Screen; the script comes from a column named Script / VO /
 * Narration / Voice-over / Audio.
 *
 * buildStoryboardPrompts() puts the blueprint instructions (BLUEPRINT_GUIDE),
 * the storyboard rules (convert it, don't condense it) and the storyboard
 * text together, ready to paste into Gemini or any AI chat. A long
 * storyboard is split into parts by section, because AI chats cut long
 * replies short; each part is a complete prompt and Chronicle joins the
 * replies. There are deliberately no free-text "notes for the AI", so the
 * course sticks to the source material.
 */
import JSZip from 'jszip';
import { BLUEPRINT_GUIDE } from './blueprint';

export interface StoryboardImage {
  /** The number used in the [Image N] marker. */
  n: number;
  name: string;
  dataUrl: string;
}

export interface StoryboardSlide {
  /** The storyboard's own number, e.g. "2.1". */
  id: string;
  title: string;
  /** The voice-over script, when the storyboard has a script column. */
  script: string;
  /** Knowledge check / quiz slides (by title). */
  quiz: boolean;
}

export interface StoryboardSection {
  title: string;
  text: string;
  /** Storyboard slide numbers in this section. */
  slideIds: string[];
}

export interface ExtractedStoryboard {
  fileName: string;
  text: string;
  images: StoryboardImage[];
  /** Pictures in formats browsers can't show (EMF/WMF drawings), skipped. */
  skippedImages: number;
  /** The storyboard's slides, in order (empty if none could be found). */
  slides: StoryboardSlide[];
  /** Text before the first section (cover, revision table, references). */
  preamble: string;
  /** Sections, in order (empty if the storyboard has no section headings). */
  sections: StoryboardSection[];
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' };

/** "Slide 2.1 Title", "Screen 4: Title", "Page 3 - Title" → number + title. */
const SLIDE_HEADING = /^(?:slide|screen|page)\s+(\d+(?:\.\d+)*[a-z]?)\b[\s:.\-–—]*(.*)$/i;
const SECTION_HEADING = /^(?:section|module|lesson|chapter|unit|topic)\s+\d+\b/i;
const SLIDE_COLUMN = /^(?:slide|screen|page)\s*(?:#|no\.?|number|id|ref)?$/i;
const SCRIPT_COLUMN = /^(?:script|vo|v\/o|voice[\s-]?over(?:\s+script)?|narration(?:\s+script)?|audio(?:\s+script)?|narrator)$/i;
const QUIZ_TITLE = /knowledge check|quiz|question|assessment|test your/i;

/** Images from the most recently read storyboard (this browser session only). */
let lastImages: StoryboardImage[] = [];
export const storyboardImages = (): StoryboardImage[] => lastImages;

export async function extractStoryboard(file: File): Promise<ExtractedStoryboard> {
  const name = file.name;
  if (/\.(txt|md|markdown)$/i.test(name)) {
    lastImages = [];
    return extractPlainText(await file.text(), name);
  }
  if (!/\.docx$/i.test(name)) {
    throw new Error('Choose a Word storyboard (.docx) or a text file (.txt, .md). For a PDF or older .doc file, save it as .docx first.');
  }
  const result = await extractDocx(await file.arrayBuffer(), name);
  lastImages = result.images;
  return result;
}

/** A text storyboard: slides and sections from lines like "Slide 2.1 Title" / "Section 2". */
export function extractPlainText(raw: string, fileName = 'storyboard.txt'): ExtractedStoryboard {
  const text = raw.trim();
  const b = new Builder();
  for (const line of text.split(/\r?\n/)) {
    const t = line.replace(/^#+\s*/, '').trim();
    const level = (line.match(/^(#+)\s/)?.[1].length) ?? 0;
    b.paragraph(line, t, level);
  }
  return { fileName, text, images: [], skippedImages: 0, ...b.result() };
}

// ---- Word numbering ("Section %1", "Slide %1.%2") -------------------------------------

interface Level { start: number; fmt: string; text: string }
interface StyleInfo { numId?: string; ilvl?: number; basedOn?: string; name: string; outline?: number }

function attr(el: Element | null | undefined, name: string): string | null {
  if (!el) return null;
  return el.getAttributeNS(W, name) ?? el.getAttribute('w:' + name);
}
const child = (el: Element | null | undefined, name: string): Element | null =>
  el ? (Array.from(el.children).find((c) => c.localName === name) ?? null) : null;

function toRoman(n: number): string {
  const map: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}
function formatNumber(n: number, fmt: string): string {
  if (fmt === 'lowerLetter' || fmt === 'upperLetter') {
    let s = '', k = n;
    while (k > 0) { k--; s = String.fromCharCode(97 + (k % 26)) + s; k = Math.floor(k / 26); }
    return fmt === 'upperLetter' ? s.toUpperCase() : s;
  }
  if (fmt === 'lowerRoman') return toRoman(n);
  if (fmt === 'upperRoman') return toRoman(n).toUpperCase();
  if (fmt === 'decimalZero') return (n < 10 ? '0' : '') + n;
  return String(n);
}

class Numbering {
  private styles = new Map<string, StyleInfo>();
  private nums = new Map<string, { abs: string; starts: Map<number, number> }>();
  private abstracts = new Map<string, Map<number, Level>>();
  private counters = new Map<string, number[]>();

  constructor(stylesXml: string, numberingXml: string) {
    const p = (xml: string) => new DOMParser().parseFromString(xml || '<x/>', 'application/xml');
    for (const s of Array.from(p(stylesXml).getElementsByTagNameNS(W, 'style'))) {
      const id = attr(s, 'styleId');
      if (!id) continue;
      const pPr = child(s, 'pPr');
      const numPr = child(pPr, 'numPr');
      const ilvl = attr(child(numPr, 'ilvl'), 'val');
      const outline = attr(child(pPr, 'outlineLvl'), 'val');
      this.styles.set(id, {
        numId: attr(child(numPr, 'numId'), 'val') ?? undefined,
        ilvl: ilvl !== null ? Number(ilvl) : undefined,
        basedOn: attr(child(s, 'basedOn'), 'val') ?? undefined,
        name: attr(child(s, 'name'), 'val') ?? id,
        outline: outline !== null ? Number(outline) : undefined,
      });
    }
    const doc = p(numberingXml);
    for (const a of Array.from(doc.getElementsByTagNameNS(W, 'abstractNum'))) {
      const levels = new Map<number, Level>();
      for (const l of Array.from(a.children).filter((c) => c.localName === 'lvl')) {
        levels.set(Number(attr(l, 'ilvl') ?? 0), {
          start: Number(attr(child(l, 'start'), 'val') ?? 1),
          fmt: attr(child(l, 'numFmt'), 'val') ?? 'decimal',
          text: attr(child(l, 'lvlText'), 'val') ?? '',
        });
      }
      this.abstracts.set(attr(a, 'abstractNumId') ?? '', levels);
    }
    for (const n of Array.from(doc.getElementsByTagNameNS(W, 'num'))) {
      const starts = new Map<number, number>();
      for (const o of Array.from(n.children).filter((c) => c.localName === 'lvlOverride')) {
        const so = attr(child(o, 'startOverride'), 'val');
        if (so !== null) starts.set(Number(attr(o, 'ilvl') ?? 0), Number(so));
      }
      this.nums.set(attr(n, 'numId') ?? '', { abs: attr(child(n, 'abstractNumId'), 'val') ?? '', starts });
    }
  }

  /** Style chain lookups (a style inherits numbering and heading level from basedOn). */
  private resolve(styleId: string | null): { numId?: string; ilvl?: number; heading: number; toc: boolean } {
    let numId: string | undefined, ilvl: number | undefined, heading = 0, toc = false;
    const seen = new Set<string>();
    let id = styleId;
    while (id && !seen.has(id)) {
      seen.add(id);
      const s = this.styles.get(id);
      const name = s?.name ?? id;
      if (/^toc\s*\d|^toc\b|table of (?:contents|figures)/i.test(name) || /^TOC\d/.test(id)) toc = true;
      if (!heading) {
        const m = name.match(/^heading\s*(\d)$/i) ?? id.match(/^Heading(\d)$/);
        if (m) heading = Number(m[1]);
        else if (s?.outline !== undefined && s.outline < 9) heading = s.outline + 1;
      }
      if (!s) break;
      if (numId === undefined && s.numId !== undefined) numId = s.numId;
      if (ilvl === undefined && s.ilvl !== undefined) ilvl = s.ilvl;
      id = s.basedOn ?? null;
    }
    return { numId, ilvl, heading, toc };
  }

  /** The paragraph's style info and its automatic number ("Slide 2.1", "•", "3."), advancing the list. */
  paragraph(p: Element): { label: string; bullet: boolean; heading: number; toc: boolean } {
    const pPr = child(p, 'pPr');
    const style = this.resolve(attr(child(pPr, 'pStyle'), 'val'));
    const numPr = child(pPr, 'numPr');
    const numId = attr(child(numPr, 'numId'), 'val') ?? style.numId;
    const ilvlAttr = attr(child(numPr, 'ilvl'), 'val');
    const ilvl = ilvlAttr !== null ? Number(ilvlAttr) : (style.ilvl ?? 0);
    const out = { label: '', bullet: false, heading: style.heading, toc: style.toc };
    if (!numId || numId === '0' || style.toc) return out;
    const num = this.nums.get(numId);
    const levels = num && this.abstracts.get(num.abs);
    const lvl = levels?.get(ilvl);
    if (!num || !levels || !lvl) return out;
    if (lvl.fmt === 'bullet') return { ...out, bullet: true };
    if (lvl.fmt === 'none') return out;
    const start = (k: number) => num.starts.get(k) ?? levels.get(k)?.start ?? 1;
    const c = this.counters.get(numId) ?? [];
    c[ilvl] = c[ilvl] === undefined ? start(ilvl) : c[ilvl] + 1;
    c.length = ilvl + 1;
    this.counters.set(numId, c);
    const label = lvl.text.replace(/%(\d)/g, (_, d: string) => {
      const k = Number(d) - 1;
      const v = c[k] ?? start(k);
      return formatNumber(v, levels.get(k)?.fmt ?? 'decimal');
    });
    return { ...out, label: label.trim() };
  }
}

// ---- collecting slides and sections ------------------------------------------------

class Builder {
  lines: string[] = [];
  private sections: { title: string; start: number; slideIds: string[] }[] = [];
  slides: StoryboardSlide[] = [];
  current: StoryboardSlide | null = null;
  private sawHeadingSections = false;

  /** A body paragraph: `line` is what goes in the text, `text` is its plain words, `heading` its level (0 = none). */
  paragraph(line: string, text: string, heading: number) {
    // Headings can be "Slide/Screen/Page N"; plain paragraphs only "Slide/Screen N" (not "Page 3 of the manual…").
    const slideMatch = heading > 0 ? (text.length < 160 ? text.match(SLIDE_HEADING) : null)
      : (text.length < 100 && /^(?:slide|screen)\s+\d/i.test(text) ? text.match(SLIDE_HEADING) : null);
    const isSection = (heading === 1 && !slideMatch) || (!this.sawHeadingSections && SECTION_HEADING.test(text) && text.length < 120 && !slideMatch);
    if (isSection) {
      if (heading === 1) this.sawHeadingSections = true;
      this.sections.push({ title: text, start: this.lines.length, slideIds: [] });
    }
    if (slideMatch) this.addSlide(slideMatch[1], slideMatch[2]);
    this.lines.push(line);
  }

  addSlide(id: string, title: string) {
    if (this.slides.some((s) => s.id === id)) {
      this.current = this.slides.find((s) => s.id === id)!;
      return;
    }
    const s: StoryboardSlide = { id, title: title.trim(), script: '', quiz: QUIZ_TITLE.test(title) };
    this.slides.push(s);
    this.current = s;
    this.sections[this.sections.length - 1]?.slideIds.push(id);
  }

  addScript(text: string) {
    if (!this.current || !text.trim()) return;
    this.current.script = (this.current.script ? this.current.script + ' ' : '') + text.trim();
  }

  push(...lines: string[]) { this.lines.push(...lines); }

  result(): Pick<ExtractedStoryboard, 'slides' | 'preamble' | 'sections'> {
    const tidy = (ls: string[]) => ls.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const preambleEnd = this.sections[0]?.start ?? this.lines.length;
    const sections = this.sections.map((s, i) => ({
      title: s.title,
      text: tidy(this.lines.slice(s.start, this.sections[i + 1]?.start ?? this.lines.length)),
      slideIds: s.slideIds,
    }));
    return { slides: this.slides, preamble: tidy(this.lines.slice(0, preambleEnd)), sections };
  }
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
  const numbering = new Numbering(
    (await zip.file('word/styles.xml')?.async('string')) ?? '',
    (await zip.file('word/numbering.xml')?.async('string')) ?? '',
  );

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
  const b = new Builder();

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
    for (const c of Array.from(node.childNodes)) {
      if (c.nodeType !== 1) continue;
      const el = c as Element;
      const tag = el.localName;
      if (tag === 't') s += el.textContent ?? '';
      else if (tag === 'tab') s += '\t';
      else if (tag === 'br' || tag === 'cr') s += '\n';
      else if (tag === 'drawing' || tag === 'pict' || tag === 'object') s += ' ' + imageMarker(el) + ' ';
      else if (tag !== 'rPr' && tag !== 'pPr' && tag !== 'instrText' && tag !== 'delText') s += runText(el);
    }
    return s;
  };
  const clean = (s: string) => s.replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ').trim();

  /** A paragraph's text with its automatic number, or null for table-of-contents lines. */
  const para = (p: Element, inTable: boolean): { text: string; line: string; heading: number } | null => {
    const n = numbering.paragraph(p);
    if (n.toc) return null;
    const words = clean(runText(p));
    if (!words) return null;
    const text = n.label ? `${n.label} ${words}` : words;
    const heading = inTable ? 0 : n.heading;
    const line = heading ? `${'#'.repeat(Math.min(heading, 6))} ${text}` : n.bullet ? `• ${words}` : text;
    return { text, line, heading };
  };

  const cellText = (tc: Element): string =>
    Array.from(tc.children).flatMap((c) => inner(c)).join(' / ').replace(/\n+/g, ' / ').trim();

  /** Content inside a table cell (paragraphs and nested tables), as text. */
  const inner = (el: Element): string[] => {
    if (el.localName === 'p') { const r = para(el, true); return r ? [r.line] : []; }
    if (el.localName === 'tbl') return table(el, true);
    if (el.localName === 'sdt' || el.localName === 'sdtContent' || el.localName === 'customXml') return Array.from(el.children).flatMap(inner);
    return [];
  };

  /** A table: one line per row. Finds Slide and Script columns from a header row. */
  const table = (el: Element, nested: boolean): string[] => {
    const lines: string[] = [];
    let slideCol = -1, scriptCol = -1;
    for (const tr of Array.from(el.children).filter((c) => c.localName === 'tr')) {
      const cells = Array.from(tr.children).filter((c) => c.localName === 'tc').map(cellText);
      if (!cells.some(Boolean)) continue;
      lines.push(nested ? cells.join(' | ') : `| ${cells.join(' | ')} |`);
      if (nested) continue;
      const sc = cells.findIndex((c) => SCRIPT_COLUMN.test(c.trim()));
      const sl = cells.findIndex((c) => SLIDE_COLUMN.test(c.trim()));
      if (sc >= 0 || sl >= 0) {
        // A header row.
        if (sc >= 0) scriptCol = sc;
        if (sl >= 0) slideCol = sl;
        continue;
      }
      if (slideCol >= 0) {
        const id = cells[slideCol]?.trim().match(/^(?:slide|screen|page)?\s*(\d+(?:\.\d+)*[a-z]?)\b/i)?.[1];
        if (id) b.addSlide(id, cells.find((c, i) => i !== slideCol && i !== scriptCol && c) ?? '');
      }
      if (scriptCol >= 0) b.addScript(cells[scriptCol] ?? '');
    }
    return lines.length ? ['', ...lines, ''] : [];
  };

  const block = (el: Element) => {
    if (el.localName === 'p') {
      const r = para(el, false);
      if (r) b.paragraph(r.line, r.text, r.heading);
    } else if (el.localName === 'tbl') {
      b.push(...table(el, false));
    } else if (el.localName === 'sdt' || el.localName === 'sdtContent' || el.localName === 'customXml') {
      Array.from(el.children).forEach(block);
    }
  };
  if (body) Array.from(body.children).forEach(block);
  const text = b.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

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
  return { fileName, text, images, skippedImages, ...b.result() };
}

// ---- the prompt -----------------------------------------------------------------------

/**
 * Rules for converting a finished storyboard. They come after BLUEPRINT_GUIDE
 * and override its sizing guidance: a storyboard is converted, not condensed.
 */
export const STORYBOARD_RULES = `CONVERTING A STORYBOARD
The source below is a finished, approved storyboard. Convert it into blueprint slides; do not edit, shorten, condense or summarize it. These rules override the size guidance above.
- Make at least one course slide for EVERY storyboard slide, in the storyboard's order. Never skip, merge or reorder storyboard slides.
- Put the storyboard's slide number in "storyboardSlide" on every slide you make (for example "storyboardSlide": "2.1"), including slides inside hub branches. If one storyboard slide needs several course slides, give them all the same number.
- Copy the whole voice-over script (Script / VO / Narration column) into "narration", word for word. Do not shorten it. If a storyboard slide has several script rows, join them in order.
- Copy on-screen text as written. If it doesn't fit a layout's limits, split it across more slides with the same storyboardSlide number instead of shortening it.
- Every knowledge check, quiz question or question-pool question becomes its own quiz slide, with its choices and feedback exactly as written.
- Ignore "A typical module" sizes: the course has as many slides as the storyboard needs.
- Use the graphics column for imageDescription and to choose a layout. Production notes, SME questions, creative direction and reviewer comments are not slide content; leave them out.
- Lightboxes, tabs or "click to learn more" content become "reveal" slides; a menu slide whose choices lead to their own slides becomes a "hub".`;

export interface StoryboardPart {
  /** 1-based. */
  n: number;
  total: number;
  /** What it covers, e.g. "Sections 3–4". */
  label: string;
  prompt: string;
}

/** Storyboard text per prompt part (about this many characters). AI chats cut long replies short. */
export const PART_BUDGET = 26000;

/** Group sections into parts of at most `budget` characters (a section is never split). */
export function planParts(sb: Pick<ExtractedStoryboard, 'sections' | 'preamble' | 'text'>, budget = PART_BUDGET): StoryboardSection[][] {
  if (!sb.sections.length || sb.text.length <= budget * 1.25) return [];
  const parts: StoryboardSection[][] = [];
  let cur: StoryboardSection[] = [], size = 0;
  for (const s of sb.sections) {
    if (cur.length && size + s.text.length > budget) { parts.push(cur); cur = []; size = 0; }
    cur.push(s);
    size += s.text.length;
  }
  if (cur.length) parts.push(cur);
  return parts.length > 1 ? parts : [];
}

function slideList(slides: StoryboardSlide[]): string {
  return slides.map((s) => `${s.id}${s.title ? ' ' + s.title : ''}`).join('\n');
}

const sourceHeader = (fileName: string) =>
  `SOURCE MATERIAL: the storyboard "${fileName}". Headings are marked with #, ## and so on. Table rows are shown as | cell | cell |. Pictures are shown as markers like [Image 3].`;

const tidyPrompt = (parts: string[]) => parts.filter((p, i) => p !== '' || parts[i - 1] !== '').join('\n');

/**
 * The prompt(s) to paste into an AI chat: one for a normal storyboard, or one
 * per part for a long one. Each is complete (instructions + storyboard text).
 */
export function buildStoryboardPrompts(sb: ExtractedStoryboard, budget = PART_BUDGET): StoryboardPart[] {
  const plan = planParts(sb, budget);
  if (!plan.length) return [{ n: 1, total: 1, label: 'Whole storyboard', prompt: buildStoryboardPrompt(sb) }];
  const total = plan.length;
  return plan.map((sections, i) => {
    const n = i + 1;
    const ids = sections.flatMap((s) => s.slideIds);
    const covered = sb.slides.filter((s) => ids.includes(s.id));
    const label = sections.length === 1 ? sections[0].title : `${sections[0].title} – ${sections[sections.length - 1].title}`;
    const prompt = tidyPrompt([
      BLUEPRINT_GUIDE,
      '',
      STORYBOARD_RULES,
      '',
      `THIS IS PART ${n} OF ${total}`,
      `The storyboard is long, so it is sent in ${total} parts and the authoring tool joins your replies. This part covers: ${sections.map((s) => s.title).join('; ')}.`,
      '- Write slides for this part only, but still reply with one complete blueprint JSON object (blueprintVersion, course, slides).',
      n === 1 ? '- Start with the title slide.' : '- Do not add a title slide; part 1 has it.',
      n === total ? '- End with the results slide if the course has quiz questions.' : '- Do not add a results slide; the last part has it.',
      '',
      ...(covered.length ? [`STORYBOARD SLIDES IN THIS PART (${covered.length}). Your blueprint must cover every one:`, slideList(covered), ''] : []),
      '---',
      sourceHeader(sb.fileName),
      '',
      ...(n === 1 && sb.preamble ? [sb.preamble, ''] : []),
      sections.map((s) => s.text).join('\n\n'),
      '',
      '---',
      `Now write the course blueprint JSON for part ${n} of ${total}, following the rules above.`,
    ]);
    return { n, total, label, prompt };
  });
}

/** The full prompt for a whole storyboard: the blueprint instructions, the storyboard rules and the storyboard. */
export function buildStoryboardPrompt(sb: Pick<ExtractedStoryboard, 'fileName' | 'text'> & { slides?: StoryboardSlide[] }): string {
  const slides = sb.slides ?? [];
  return tidyPrompt([
    BLUEPRINT_GUIDE,
    '',
    STORYBOARD_RULES,
    '',
    ...(slides.length ? [`STORYBOARD SLIDES (${slides.length}). Your blueprint must cover every one:`, slideList(slides), ''] : []),
    '---',
    sourceHeader(sb.fileName),
    '',
    sb.text,
    '',
    '---',
    'Now write the course blueprint JSON for this storyboard, following the rules above.',
  ]);
}

// ---- checking the AI's blueprint against the storyboard ------------------------------------

export interface StoryboardCoverage {
  /** Storyboard slides with no course slide. */
  missing: StoryboardSlide[];
  /** Slides whose narration is much shorter than the storyboard's script. */
  shortened: { slide: StoryboardSlide; scriptWords: number; narrationWords: number }[];
  /** True when the blueprint has no storyboardSlide numbers, so only counts could be compared. */
  untagged: boolean;
  storyboardSlides: number;
  blueprintSlides: number;
}

const words = (s: string) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? []).length;

/** Normalize slide numbers the AI may write differently: "Slide 2.1", "2.1", 2.1. */
const normId = (v: unknown) => String(v ?? '').trim().replace(/^(?:slide|screen|page)\s*/i, '').toLowerCase();

/**
 * Compare a pasted blueprint with the storyboard it came from. `blueprint` is
 * the raw parsed JSON (validated or not).
 */
export function checkStoryboardCoverage(slides: StoryboardSlide[], blueprint: unknown): StoryboardCoverage {
  type Raw = { storyboardSlide?: unknown; narration?: unknown; layout?: unknown; branches?: { slides?: Raw[] }[] };
  const all: Raw[] = [];
  const walk = (list: Raw[] | undefined) => {
    for (const s of list ?? []) {
      if (!s || typeof s !== 'object') continue;
      all.push(s);
      for (const br of s.branches ?? []) walk(br?.slides);
    }
  };
  walk((blueprint as { slides?: Raw[] })?.slides);
  const tagged = all.filter((s) => normId(s.storyboardSlide));
  const out: StoryboardCoverage = {
    missing: [], shortened: [], untagged: tagged.length === 0,
    storyboardSlides: slides.length, blueprintSlides: all.filter((s) => s.layout !== 'hub').length,
  };
  if (!slides.length || out.untagged) return out;
  const byId = new Map<string, Raw[]>();
  for (const s of tagged) {
    const id = normId(s.storyboardSlide);
    byId.set(id, [...(byId.get(id) ?? []), s]);
  }
  for (const sl of slides) {
    const made = byId.get(normId(sl.id));
    if (!made) { out.missing.push(sl); continue; }
    const scriptWords = words(sl.script);
    if (scriptWords < 20) continue;
    const narrationWords = made.reduce((n, s) => n + words(typeof s.narration === 'string' ? s.narration : ''), 0);
    if (narrationWords < scriptWords * 0.8) out.shortened.push({ slide: sl, scriptWords, narrationWords });
  }
  return out;
}

/**
 * Join blueprints the AI wrote in parts: the first part's course details,
 * every part's slides.
 *
 * With `order` (the storyboard's slide numbers), slides are put in storyboard
 * order by their storyboardSlide number, and a storyboard slide written again
 * in a later reply (a redo) replaces the earlier version. Slides without a
 * number stay just before the next numbered slide; the title slide stays
 * first and the results slide last. Only one title and one results slide are
 * kept.
 */
export function mergeBlueprintParts(parts: unknown[], order?: string[]): unknown {
  type S = { layout?: string; storyboardSlide?: unknown };
  type BP = { blueprintVersion?: unknown; course?: unknown; slides?: S[] };
  const list = (parts as BP[]).filter((p) => p && typeof p === 'object');
  if (!list.length) return parts[0];
  const slidesOf = (p: BP) => (Array.isArray(p.slides) ? p.slides : []);
  const rank = new Map((order ?? []).map((id, i) => [normId(id), i]));
  const useOrder = rank.size > 0 && list.flatMap(slidesOf).some((s) => rank.has(normId(s?.storyboardSlide)));
  if (list.length === 1 && !useOrder) return list[0];

  let slides: S[] = [];
  if (useOrder) {
    // A later part's version of a storyboard slide replaces an earlier one.
    const lastPart = new Map<string, number>();
    list.forEach((p, pi) => slidesOf(p).forEach((s) => { const id = normId(s?.storyboardSlide); if (rank.has(id)) lastPart.set(id, pi); }));
    list.forEach((p, pi) => slidesOf(p).forEach((s) => {
      const id = normId(s?.storyboardSlide);
      if (!rank.has(id) || lastPart.get(id) === pi) slides.push(s);
    }));
  } else {
    slides = list.flatMap(slidesOf);
  }
  const title = slides.find((s) => s?.layout === 'title');
  const results = [...slides].reverse().find((s) => s?.layout === 'results');
  slides = slides.filter((s) => s?.layout !== 'title' && s?.layout !== 'results');
  if (useOrder) {
    // Sort key: the storyboard position; unnumbered slides take the next numbered slide's key.
    const keys = new Array<number>(slides.length);
    let next = Number.POSITIVE_INFINITY;
    for (let i = slides.length - 1; i >= 0; i--) {
      const r = rank.get(normId(slides[i]?.storyboardSlide));
      if (r !== undefined) next = r;
      keys[i] = r ?? next;
    }
    slides = slides.map((s, i) => ({ s, k: keys[i], i })).sort((a, b) => a.k - b.k || a.i - b.i).map((x) => x.s);
  }
  if (title) slides.unshift(title);
  if (results) slides.push(results);
  return { ...list[0], blueprintVersion: list[0].blueprintVersion ?? 1, slides };
}

/** A message to send the AI asking it to redo the slides a coverage check flagged. */
export function buildFixRequest(cov: StoryboardCoverage): string {
  const lines = ['Some storyboard slides are missing or shortened in your blueprint.'];
  if (cov.missing.length) lines.push('', 'Missing storyboard slides:', ...cov.missing.map((s) => `${s.id}${s.title ? ' ' + s.title : ''}`));
  if (cov.shortened.length) {
    lines.push('', 'Narration shortened (copy the whole script, word for word):',
      ...cov.shortened.map((x) => `${x.slide.id}${x.slide.title ? ' ' + x.slide.title : ''} (the storyboard script has ${x.scriptWords} words; yours has ${x.narrationWords})`));
  }
  lines.push('', 'Reply with one blueprint JSON object (same format and rules as before) containing ONLY the slides for the storyboard slides listed above, each with its "storyboardSlide" number. Do not add a title or results slide.');
  return lines.join('\n');
}
