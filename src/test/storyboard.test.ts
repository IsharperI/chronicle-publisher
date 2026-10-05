import { describe, it, expect } from 'vitest';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, ImageRun } from 'docx';
import { extractDocx, buildStoryboardPrompt } from '@/lib/storyboard';
import { BLUEPRINT_GUIDE } from '@/lib/blueprint';

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

  it('builds one prompt: the instructions, then the storyboard', async () => {
    const p = buildStoryboardPrompt({ fileName: 'm3.docx', text: 'ROW TEXT' });
    expect(p.startsWith(BLUEPRINT_GUIDE)).toBe(true);
    expect(p).not.toContain('NOTES FROM');
    expect(p.indexOf('ROW TEXT')).toBeGreaterThan(p.indexOf('SOURCE MATERIAL'));
  });

  it('rejects files that are not Word documents', async () => {
    await expect(extractDocx(new TextEncoder().encode('hello').buffer as ArrayBuffer)).rejects.toThrow(/Word document/);
  });
});

