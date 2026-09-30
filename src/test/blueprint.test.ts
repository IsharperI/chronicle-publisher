import { describe, it, expect } from 'vitest';
import { shortTitle, validateBlueprint, blueprintToCourse, parseBlueprintText } from '@/lib/blueprint';

describe('shortTitle', () => {
  it('keeps titles within the limit unchanged', () => {
    expect(shortTitle('What You Will Learn')).toBe('What You Will Learn');
  });
  it('cuts long titles at a word boundary with an ellipsis', () => {
    const t = shortTitle('Conductors, Insulators, Semiconductors');
    expect(t).toBe('Conductors, Insulators…');
    expect(t.length).toBeLessThanOrEqual(30);
  });
  it('shortens quiz titles cleanly', () => {
    const t = shortTitle('Quiz: What are the negatively charged particles called?');
    expect(t.endsWith('…')).toBe(true);
    expect(t.length).toBeLessThanOrEqual(30);
  });
  it('hard-cuts a single very long word', () => {
    expect(shortTitle('Supercalifragilisticexpialidocious-ness')).toHaveLength(30);
  });
});

describe('section layout', () => {
  const bp = {
    blueprintVersion: 1,
    course: { title: 'Test' },
    slides: [{ layout: 'section', title: 'Generating Electricity', subtitle: 'Section 2' }],
  };
  it('validates', () => {
    expect(validateBlueprint(bp).ok).toBe(true);
  });
  it('converts to a content slide with title and subtitle text', () => {
    const res = validateBlueprint(bp);
    if (!res.ok) throw new Error('invalid');
    const slide = blueprintToCourse(res.blueprint).slides[0];
    expect(slide.slideType).toBe('content');
    const texts = slide.elements.filter((e) => e.type === 'text').map((e) => (e as { content: string }).content);
    expect(texts).toEqual(['Generating Electricity', 'Section 2']);
  });
});

describe('parseBlueprintText', () => {
  it('strips AI chat text and code fences', () => {
    const r = parseBlueprintText('Here you go:\n```json\n{"blueprintVersion":1}\n```\nEnjoy');
    expect(r.ok && (r.data as { blueprintVersion: number }).blueprintVersion).toBe(1);
  });
});
