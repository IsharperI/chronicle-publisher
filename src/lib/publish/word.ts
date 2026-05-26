import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
  PageBreak,
  LevelFormat,
  HeightRule,
} from 'docx';
import { saveAs } from 'file-saver';
import html2canvas from 'html2canvas';
import type { CourseState, Slide, SlideElement } from '@/types/course';

const FONT = 'Calibri';

function slugify(s: string): string {
  return (s || 'course').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'course';
}

/** Flat list of elements across base + layers, in z-order (bottom-to-top). */
function getAllElements(slide: Slide): SlideElement[] {
  if (slide.layers && slide.layers.length > 0) {
    return slide.layers.flatMap((l) => l.elements);
  }
  return slide.elements;
}

/** Extract human-readable text from an element. */
function extractText(el: SlideElement): string[] {
  if (el.type === 'text') return [el.content || ''];
  if (el.type === 'shape' && el.text) return [el.text];
  if (el.type === 'checkbox' && el.label) return [`☐ ${el.label}`];
  if (el.type === 'table') {
    return el.cellData.map((row) => row.join(' | '));
  }
  if (el.type === 'image' && el.alt) return [`[Image: ${el.alt}]`];
  if (el.type === 'video') return ['[Video]'];
  return [];
}

/** Sort elements by visual order (top-to-bottom, left-to-right). */
function sortByPosition(els: SlideElement[]): SlideElement[] {
  return [...els].sort((a, b) => {
    const dy = a.y - b.y;
    if (Math.abs(dy) > 20) return dy;
    return a.x - b.x;
  });
}

/** Try to capture a screenshot of a DOM element. Returns PNG bytes or null. */
async function tryCaptureCurrentCanvas(scale = 0.4): Promise<Uint8Array | null> {
  try {
    const el = document.querySelector('[data-slide-canvas]') as HTMLElement | null
      ?? document.querySelector('.slide-canvas') as HTMLElement | null;
    if (!el) return null;
    const canvas = await html2canvas(el, { scale, logging: false, useCORS: true, backgroundColor: '#ffffff' });
    const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
    if (!blob) return null;
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  }
}

/** Generate a grey placeholder PNG with the slide number centered. */
function placeholderThumb(slideNumber: number, w = 480, h = 270): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#d1d5db';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#9ca3af';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.fillStyle = '#374151';
  ctx.font = 'bold 64px Calibri, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Slide ${slideNumber}`, w / 2, h / 2);
  const dataUrl = canvas.toDataURL('image/png');
  const b64 = dataUrl.split(',')[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function p(text: string, opts: { bold?: boolean; italic?: boolean; size?: number; bullet?: boolean } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    ...(opts.bullet ? { numbering: { reference: 'bullets', level: 0 } } : {}),
    children: [
      new TextRun({ text, bold: opts.bold, italics: opts.italic, font: FONT, size: opts.size ?? 22 }),
    ],
  });
}

function buildRightColumn(slide: Slide, slideNumber: number): Paragraph[] {
  const out: Paragraph[] = [];

  if (slide.slideType === 'quiz' && slide.quiz) {
    out.push(p(slide.quiz.question || 'Quiz question', { bold: true, size: 24 }));
    if (slide.quiz.questionType === 'multiple-choice' && slide.quiz.choices) {
      for (const c of slide.quiz.choices) {
        out.push(p(`${c.text}${c.correct ? '  ✓' : ''}`, { bullet: true, bold: c.correct }));
      }
    } else if (slide.quiz.questionType === 'dnd-matching' && slide.quiz.pairs) {
      for (const pair of slide.quiz.pairs) {
        out.push(p(`${pair.left} → ${pair.right}  ✓`, { bullet: true }));
      }
    } else if (slide.quiz.questionType === 'dnd-sorting' && slide.quiz.sortItems) {
      slide.quiz.sortItems.forEach((it, i) => {
        out.push(p(`${i + 1}. ${it.text}  ✓`, { bullet: true }));
      });
    }
  } else {
    const els = sortByPosition(getAllElements(slide));
    for (const el of els) {
      for (const line of extractText(el)) {
        if (line.trim()) out.push(p(line));
      }
    }
    if (out.length === 0) out.push(p('(No text content)', { italic: true }));
  }

  if (slide.notes && slide.notes.trim()) {
    out.push(p('Speaker Notes', { bold: true, italic: true, size: 22 }));
    out.push(p(slide.notes));
  }

  const captionLines: string[] = [];
  for (const audio of slide.audio ?? []) {
    const caps = [...(audio.captions ?? [])].sort((a, b) => a.startTime - b.startTime);
    for (const c of caps) {
      const t = formatTime(c.startTime);
      captionLines.push(`[${t}] ${c.text}`);
    }
  }
  if (captionLines.length > 0) {
    out.push(p('Audio Transcription', { bold: true, italic: true, size: 22 }));
    for (const line of captionLines) out.push(p(line));
  }

  return out;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

// Page width: A4 portrait with 0.5" margins → 11906 - 1440 = 10466 DXA content
const CONTENT_WIDTH = 10466;
const LEFT_COL = Math.round(CONTENT_WIDTH * 0.35);
const RIGHT_COL = CONTENT_WIDTH - LEFT_COL;

export async function exportToWord(state: CourseState, courseTitle: string, filename: string): Promise<void> {
  const slides = state.slides;

  // Pre-generate thumbnails for each slide.
  const thumbs: Uint8Array[] = [];
  for (let i = 0; i < slides.length; i++) {
    // Only the currently visible slide can realistically be captured; rest fall back.
    const captured = i === 0 ? await tryCaptureCurrentCanvas() : null;
    thumbs.push(captured ?? placeholderThumb(i + 1));
  }

  const rows: TableRow[] = [];

  // Header row
  rows.push(new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        borders: CELL_BORDERS,
        width: { size: LEFT_COL, type: WidthType.DXA },
        shading: { fill: '1F4E79', type: ShadingType.CLEAR, color: 'auto' },
        margins: { top: 120, bottom: 120, left: 160, right: 160 },
        children: [new Paragraph({ children: [new TextRun({ text: 'Slide', bold: true, color: 'FFFFFF', font: FONT, size: 24 })] })],
      }),
      new TableCell({
        borders: CELL_BORDERS,
        width: { size: RIGHT_COL, type: WidthType.DXA },
        shading: { fill: '1F4E79', type: ShadingType.CLEAR, color: 'auto' },
        margins: { top: 120, bottom: 120, left: 160, right: 160 },
        children: [new Paragraph({ children: [new TextRun({ text: 'Content', bold: true, color: 'FFFFFF', font: FONT, size: 24 })] })],
      }),
    ],
  }));

  slides.forEach((slide, idx) => {
    const slideNumber = idx + 1;
    const title = slide.title || `Slide ${slideNumber}`;
    const shade = idx % 2 === 0 ? 'FFFFFF' : 'F2F2F2';

    const leftChildren: Paragraph[] = [
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: `${slideNumber}. ${title}`, bold: true, font: FONT, size: 24 })],
      }),
      new Paragraph({
        children: [
          new ImageRun({
            type: 'png',
            data: thumbs[idx],
            transformation: { width: 220, height: 124 },
          } as ConstructorParameters<typeof ImageRun>[0]),
        ],
      }),
    ];

    rows.push(new TableRow({
      cantSplit: false,
      height: { value: 2200, rule: HeightRule.ATLEAST },
      children: [
        new TableCell({
          borders: CELL_BORDERS,
          width: { size: LEFT_COL, type: WidthType.DXA },
          shading: { fill: shade, type: ShadingType.CLEAR, color: 'auto' },
          margins: { top: 200, bottom: 200, left: 200, right: 200 },
          children: leftChildren,
        }),
        new TableCell({
          borders: CELL_BORDERS,
          width: { size: RIGHT_COL, type: WidthType.DXA },
          shading: { fill: shade, type: ShadingType.CLEAR, color: 'auto' },
          margins: { top: 200, bottom: 200, left: 200, right: 200 },
          children: buildRightColumn(slide, slideNumber),
        }),
      ],
    }));
  });

  const table = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [LEFT_COL, RIGHT_COL],
    rows,
  });

  const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  const doc = new Document({
    styles: {
      default: { document: { run: { font: FONT, size: 22 } } },
    },
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: '•',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 240 } } },
        }],
      }],
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 2400, after: 240 },
          children: [new TextRun({ text: courseTitle || 'Untitled Course', bold: true, font: FONT, size: 56 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [new TextRun({ text: `Exported ${dateStr}`, italics: true, font: FONT, size: 24, color: '595959' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [new TextRun({ text: `${slides.length} slide${slides.length === 1 ? '' : 's'}`, font: FONT, size: 22, color: '595959' })],
        }),
        new Paragraph({ children: [new PageBreak()] }),
        table,
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const finalName = filename.endsWith('.docx') ? filename : `${slugify(courseTitle)}-word-export.docx`;
  saveAs(blob, finalName);
}
