import { describe, it, expect } from 'vitest';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, ImageRun, HeadingLevel, LevelFormat } from 'docx';
import {
  extractDocx, extractPlainText, buildStoryboardPrompt, buildStoryboardPrompts, checkStoryboardCoverage,
  mergeBlueprintParts, buildFixRequest, STORYBOARD_RULES, type StoryboardSlide,
} from '@/lib/storyboard';
import { BLUEPRINT_GUIDE, parseBlueprintParts, prepareBlueprintLoad } from '@/lib/blueprint';
import { defaultCourseSettings } from '@/types/course';

// 1×1 PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

async function storyboardDocx(): Promise<ArrayBuffer> {
  const cell = (children: Paragraph[]) => new TableCell({ children });
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun('Module 3: Bus Systems')] }),
        new Table({
          rows: [
            new TableRow({ children: [cell([new Paragraph('Slide')]), cell([new Paragraph('On-screen text')]), cell([new Paragraph('VO')])] }),
            new TableRow({ children: [
              cell([new Paragraph('2.4')]),
              cell([new Paragraph('Select each system'), new Paragraph({ children: [new ImageRun({ type: 'png', data: PNG, transformation: { width: 10, height: 10 } })] })]),
              cell([new Paragraph('Select each system to learn more.')]),
            ] }),
          ],
        }),
      ],
    }],
  });
  const buf = await Packer.toBuffer(doc);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('reading a Word storyboard', () => {
  it('keeps table rows together and marks pictures', async () => {
    const sb = await extractDocx(await storyboardDocx(), 'm3.docx');
    expect(sb.text).toContain('Module 3: Bus Systems');
    expect(sb.text).toContain('Slide | On-screen text | VO');
    expect(sb.text).toMatch(/2\.4 \| Select each system \/ \[Image 1\] \| Select each system to learn more\./);
    expect(sb.images).toHaveLength(1);
    expect(sb.images[0]).toMatchObject({ n: 1 });
    expect(sb.images[0].dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    // The Slide and VO columns give the storyboard's slides and scripts.
    expect(sb.slides).toEqual([expect.objectContaining({ id: '2.4', script: 'Select each system to learn more.' })]);
  });

  it('builds one prompt: the instructions, then the storyboard', async () => {
    const p = buildStoryboardPrompt({ fileName: 'm3.docx', text: 'ROW TEXT' });
    expect(p.startsWith(BLUEPRINT_GUIDE)).toBe(true);
    expect(p).toContain(STORYBOARD_RULES);
    expect(p).not.toContain('NOTES FROM');
    expect(p.indexOf('ROW TEXT')).toBeGreaterThan(p.indexOf('SOURCE MATERIAL'));
  });

  it('rejects files that are not Word documents', async () => {
    await expect(extractDocx(new TextEncoder().encode('hello').buffer as ArrayBuffer)).rejects.toThrow(/Word document/);
  });
});


/** A storyboard like Xpan's template: Word-numbered headings ("Section 1", "Slide 1.1") and a SCRIPT column. */
async function numberedStoryboard(): Promise<ArrayBuffer> {
  const cell = (t: string) => new TableCell({ children: [new Paragraph(t)] });
  const slide = (title: string, script: string[]) => [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_2, numbering: { reference: 'sb', level: 1 } }),
    new Table({ rows: [
      new TableRow({ children: [cell('#'), cell('SCRIPT'), cell('GRAPHICS')] }),
      ...script.map((line) => new TableRow({ children: [cell(''), cell(line), cell('Title: ' + title)] })),
    ] }),
  ];
  const doc = new Document({
    numbering: { config: [{ reference: 'sb', levels: [
      { level: 0, format: LevelFormat.DECIMAL, text: 'Section %1' },
      { level: 1, format: LevelFormat.DECIMAL, text: 'Slide %1.%2' },
    ] }] },
    sections: [{ children: [
      new Paragraph('Storyboard cover page'),
      new Paragraph({ text: 'Introduction', heading: HeadingLevel.HEADING_1, numbering: { reference: 'sb', level: 0 } }),
      ...slide('Welcome', ['Welcome to the course.', 'It takes ten minutes.']),
      new Paragraph({ text: 'Brakes', heading: HeadingLevel.HEADING_1, numbering: { reference: 'sb', level: 0 } }),
      ...slide('Brake Pads', ['Brake pads wear with use and must be checked at every service interval.']),
      ...slide('Knowledge Check', ['Let us check what you learned.']),
    ] }],
  });
  const buf = await Packer.toBuffer(doc);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('storyboard slides and sections', () => {
  it("keeps Word's automatic heading numbers and finds the slides and their scripts", async () => {
    const sb = await extractDocx(await numberedStoryboard(), 'sb.docx');
    expect(sb.text).toContain('# Section 1 Introduction');
    expect(sb.text).toContain('## Slide 1.1 Welcome');
    expect(sb.text).toContain('## Slide 2.2 Knowledge Check');
    expect(sb.text).toContain('| # | SCRIPT | GRAPHICS |');
    expect(sb.slides.map((s) => [s.id, s.title, s.quiz])).toEqual([
      ['1.1', 'Welcome', false], ['2.1', 'Brake Pads', false], ['2.2', 'Knowledge Check', true],
    ]);
    expect(sb.slides[0].script).toBe('Welcome to the course. It takes ten minutes.');
    expect(sb.sections.map((s) => [s.title, s.slideIds])).toEqual([
      ['Section 1 Introduction', ['1.1']], ['Section 2 Brakes', ['2.1', '2.2']],
    ]);
    expect(sb.preamble).toBe('Storyboard cover page');
  });

  it('lists every storyboard slide in the prompt', async () => {
    const sb = await extractDocx(await numberedStoryboard(), 'sb.docx');
    const [part] = buildStoryboardPrompts(sb);
    expect(part.total).toBe(1);
    expect(part.prompt).toContain('STORYBOARD SLIDES (3). Your blueprint must cover every one:\n1.1 Welcome\n2.1 Brake Pads\n2.2 Knowledge Check');
  });

  it('splits a long storyboard into parts by section', async () => {
    const sb = await extractDocx(await numberedStoryboard(), 'sb.docx');
    const parts = buildStoryboardPrompts(sb, 60);
    expect(parts.map((p) => [p.n, p.total, p.label])).toEqual([[1, 2, 'Section 1 Introduction'], [2, 2, 'Section 2 Brakes']]);
    expect(parts[0].prompt).toContain('THIS IS PART 1 OF 2');
    expect(parts[0].prompt).toContain('Storyboard cover page');
    expect(parts[0].prompt).toContain('Welcome to the course.');
    expect(parts[0].prompt).not.toContain('Brake pads wear');
    expect(parts[1].prompt).toContain('Do not add a title slide');
    expect(parts[1].prompt).toContain('2.1 Brake Pads\n2.2 Knowledge Check');
    expect(parts[1].prompt).not.toContain('Storyboard cover page');
  });

  it('reads slides from a text storyboard too', () => {
    const sb = extractPlainText('# Section 1 Intro\n## Slide 1.1 Hello\nVO: hi\nSlide 1.2 Goodbye\nPage 3 of the manual says so.');
    expect(sb.slides.map((s) => s.id)).toEqual(['1.1', '1.2']);
    expect(sb.sections.map((s) => s.title)).toEqual(['Section 1 Intro']);
  });
});

describe('checking the blueprint against the storyboard', () => {
  const sbSlides: StoryboardSlide[] = [
    { id: '1.1', title: 'Welcome', script: 'Welcome to the course.', quiz: false },
    { id: '2.1', title: 'Brake Pads', script: 'word '.repeat(50).trim(), quiz: false },
    { id: '2.2', title: 'Brake Discs', script: '', quiz: false },
    { id: '2.3', title: 'Knowledge Check', script: '', quiz: true },
  ];

  it('lists missing slides and shortened narration', () => {
    const cov = checkStoryboardCoverage(sbSlides, { slides: [
      { layout: 'title', title: 'Brakes' },
      { layout: 'bullets', storyboardSlide: 'Slide 1.1', narration: 'Welcome to the course.' },
      { layout: 'hub', storyboardSlide: 2.1, branches: [{ slides: [{ layout: 'bullets', storyboardSlide: '2.1', narration: 'word '.repeat(20) }] }] },
      { layout: 'quiz', storyboardSlide: '2.3' },
    ] });
    expect(cov.missing.map((s) => s.id)).toEqual(['2.2']);
    expect(cov.shortened).toEqual([expect.objectContaining({ scriptWords: 50, narrationWords: 20 })]);
    expect(cov.untagged).toBe(false);
    const ask = buildFixRequest(cov);
    expect(ask).toContain('2.2 Brake Discs');
    expect(ask).toContain('2.1 Brake Pads (the storyboard script has 50 words; yours has 20)');
  });

  it('falls back to counting when the AI did not number its slides', () => {
    const cov = checkStoryboardCoverage(sbSlides, { slides: [{ layout: 'title' }, { layout: 'bullets' }] });
    expect(cov).toMatchObject({ untagged: true, storyboardSlides: 4, blueprintSlides: 2, missing: [] });
  });
});

describe('joining blueprints written in parts', () => {
  const part = (slides: object[]) => ({ blueprintVersion: 1, course: { title: 'Brakes' }, slides });
  const ORDER = ['1.1', '2.1', '2.2'];

  it('joins the parts, keeping one title slide first and one results slide last', () => {
    const m = mergeBlueprintParts([
      part([{ layout: 'title', title: 'Brakes' }, { layout: 'bullets', storyboardSlide: '1.1' }, { layout: 'results' }]),
      part([{ layout: 'title', title: 'Again' }, { layout: 'section', title: 'Brakes' }, { layout: 'bullets', storyboardSlide: '2.1' }, { layout: 'results', passThreshold: 70 }]),
    ], ORDER) as { slides: { layout: string; title?: string; storyboardSlide?: string; passThreshold?: number }[] };
    expect(m.slides.map((s) => s.storyboardSlide ?? s.layout)).toEqual(['title', '1.1', 'section', '2.1', 'results']);
    expect(m.slides[0].title).toBe('Brakes');
    expect(m.slides[4].passThreshold).toBe(70);
  });

  it('slots a redo into storyboard order and replaces the earlier version', () => {
    const m = mergeBlueprintParts([
      part([{ layout: 'title' }, { layout: 'bullets', storyboardSlide: '1.1' }, { layout: 'bullets', storyboardSlide: '2.2', title: 'old' }, { layout: 'results' }]),
      part([{ layout: 'bullets', storyboardSlide: '2.1' }, { layout: 'bullets', storyboardSlide: '2.2', title: 'new' }]),
    ], ORDER) as { slides: { layout: string; title?: string; storyboardSlide?: string }[] };
    expect(m.slides.map((s) => s.storyboardSlide ?? s.layout)).toEqual(['title', '1.1', '2.1', '2.2', 'results']);
    expect(m.slides[3].title).toBe('new');
  });

  it('reads several pasted replies, with the chat text around them', () => {
    const a = JSON.stringify(part([{ layout: 'title', title: 'Brakes' }, { layout: 'bullets', title: 'Pads', bullets: ['Check them'], storyboardSlide: '1.1' }]));
    const b = JSON.stringify(part([{ layout: 'bullets', title: 'Discs', bullets: ['Measure them'], storyboardSlide: 2.1 }]));
    const pasted = 'Here is part 1:\n```json\n' + a + '\n```\nAnd part 2:\n```json\n' + b + '\n```\nLet me know!';
    const r = parseBlueprintParts(pasted);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parts).toHaveLength(2);
    const loaded = prepareBlueprintLoad(mergeBlueprintParts(r.parts, ORDER), defaultCourseSettings);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.payload.slides.map((s) => s.title)).toEqual(['Brakes', 'Pads', 'Discs']);
      expect(loaded.payload.slides[2].notes).toContain('Storyboard slide: 2.1');
    }
  });
});
