import { describe, it, expect } from 'vitest';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, ImageRun } from 'docx';
import { extractDocx, buildStoryboardPrompt } from '@/lib/storyboard';
import { findPlaceholders, fitImage, matchImages, type CandidateImage } from '@/lib/imageMatching';
import { prepareBlueprintLoad, BLUEPRINT_GUIDE } from '@/lib/blueprint';
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
  });

  it('builds one prompt: instructions, notes, then the storyboard', async () => {
    const p = buildStoryboardPrompt({ fileName: 'm3.docx', text: 'ROW TEXT' }, 'Audience: bus cleaners');
    expect(p.startsWith(BLUEPRINT_GUIDE)).toBe(true);
    expect(p).toContain('NOTES FROM THE COURSE DEVELOPER\nAudience: bus cleaners');
    expect(p.indexOf('ROW TEXT')).toBeGreaterThan(p.indexOf('SOURCE MATERIAL'));
  });

  it('rejects files that are not Word documents', async () => {
    await expect(extractDocx(new TextEncoder().encode('hello').buffer as ArrayBuffer)).rejects.toThrow(/Word document/);
  });
});

describe('image placeholders', () => {
  const res = prepareBlueprintLoad({ blueprintVersion: 1, course: { title: 'T' }, slides: [
    { layout: 'image-text', title: 'Caliper', body: 'b', imageDescription: 'Close-up of a brake caliper [Image 2]' },
    { layout: 'image-text', title: 'Door', body: 'b', imageDescription: 'Door actuator, stock SS 1493869991' },
    { layout: 'image-text', title: 'Seats', body: 'b', imageDescription: 'Passenger seating area with grab rails' },
    { layout: 'reveal', title: 'R', items: [{ label: 'A', body: 'x', imageDescription: 'Roof HVAC unit' }, { label: 'B', body: 'y' }] },
  ] }, defaultCourseSettings);
  if (res.ok === false) throw new Error(res.errors.join());
  const holes = findPlaceholders(res.payload.slides);

  it('finds placeholders on slides and inside pop-up layers', () => {
    expect(holes.map((h) => h.description)).toEqual([
      'Close-up of a brake caliper [Image 2]', 'Door actuator, stock SS 1493869991', 'Passenger seating area with grab rails', 'Roof HVAC unit',
    ]);
    expect(holes[3].layerName).toBe('A');
  });

  it('matches by storyboard marker, stock number and file-name words', () => {
    const imgs: CandidateImage[] = [
      { id: 'sb1', name: 'Storyboard image 1', dataUrl: 'x', marker: 1 },
      { id: 'sb2', name: 'Storyboard image 2', dataUrl: 'x', marker: 2 },
      { id: 'f1', name: 'shutterstock_1493869991.jpg', dataUrl: 'x' },
      { id: 'f2', name: 'roof-hvac.png', dataUrl: 'x' },
      { id: 'f3', name: 'engine_bay.jpg', dataUrl: 'x' },
    ];
    const m = matchImages(holes, imgs);
    expect(m[holes[0].elementId]).toEqual({ imageId: 'sb2', reason: 'storyboard' });
    expect(m[holes[1].elementId]).toEqual({ imageId: 'f1', reason: 'number' });
    expect(m[holes[2].elementId]).toBeUndefined(); // nothing fits: stays a placeholder
    expect(m[holes[3].elementId]).toEqual({ imageId: 'f2', reason: 'name' });
  });

  it('keeps hand-picked matches and never uses an image twice', () => {
    const imgs: CandidateImage[] = [{ id: 'f2', name: 'roof-hvac.png', dataUrl: 'x' }];
    const m = matchImages(holes, imgs, { [holes[0].elementId]: { imageId: 'f2', reason: 'manual' } });
    expect(m[holes[0].elementId].reason).toBe('manual');
    expect(m[holes[3].elementId]).toBeUndefined();
  });

  it('fits an image inside the box without stretching', () => {
    expect(fitImage({ x: 0, y: 0, width: 400, height: 400 }, { width: 800, height: 400 })).toEqual({ x: 0, y: 100, width: 400, height: 200 });
  });
});
