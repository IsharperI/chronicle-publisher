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

describe('reveal layout', () => {
  const bp = {
    blueprintVersion: 1,
    course: { title: 'Test' },
    slides: [{
      layout: 'reveal', title: 'Types of Injuries',
      items: [
        { label: 'Electric Shock', body: 'Current passes through the body.', imageDescription: 'Shock icon' },
        { label: 'Burns', heading: 'Electrical Burns', body: 'Heat damages tissue.' },
        { label: 'Cardiac Effects', body: 'Disrupts heart rhythm.' },
      ],
    }],
  };

  it('rejects fewer than 2 items', () => {
    const bad = { ...bp, slides: [{ ...bp.slides[0], items: [bp.slides[0].items[0]] }] };
    const res = validateBlueprint(bad);
    expect(res.ok).toBe(false);
    if (res.ok === false) expect(res.errors[0]).toContain('items must have 2–6 entries');
  });

  it('builds a base layer plus one hidden layer per item, wired with show/hide triggers', () => {
    const res = validateBlueprint(bp);
    if (res.ok === false) throw new Error(res.errors.join('; '));
    const slide = blueprintToCourse(res.blueprint).slides[0];
    const layers = slide.layers!;
    expect(layers).toHaveLength(4);
    expect(layers[0].visible).toBe(true);
    expect(layers.slice(1).every((l) => l.visible === false)).toBe(true);

    const buttons = layers[0].elements.filter((e) => e.triggers.some((t) => t.action === 'showLayer'));
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.triggers[0].targetId)).toEqual(layers.slice(1).map((l) => l.id));

    for (const l of layers.slice(1)) {
      const closers = l.elements.filter((e) => e.triggers.some((t) => t.action === 'hideLayer' && t.targetId === l.id));
      expect(closers.length).toBe(2); // backdrop + close button
    }
    // Heading defaults to the label; explicit heading wins.
    const headings = layers.slice(1).map((l) => (l.elements.find((e) => e.type === 'text') as { content: string }).content);
    expect(headings).toEqual(['Electric Shock', 'Electrical Burns', 'Cardiac Effects']);
  });
});

describe('sanitizeSlides keeps layers', () => {
  it('round-trips layers, visibility and triggers', async () => {
    const { sanitizeSlides } = await import('@/lib/sanitize');
    const res = validateBlueprint({
      blueprintVersion: 1, course: { title: 'T' },
      slides: [{ layout: 'reveal', title: 'R', items: [{ label: 'A', body: 'a' }, { label: 'B', body: 'b' }] }],
    });
    if (!res.ok) throw new Error('invalid');
    const original = blueprintToCourse(res.blueprint).slides;
    const [slide] = sanitizeSlides(JSON.parse(JSON.stringify(original)));
    expect(slide.layers).toHaveLength(3);
    expect(slide.layers!.map((l) => l.visible)).toEqual([true, false, false]);
    expect(slide.layers!.map((l) => l.id)).toEqual(original[0].layers!.map((l) => l.id));
    const btn = slide.layers![0].elements.find((e) => e.triggers.length > 0)!;
    expect(btn.triggers[0]).toMatchObject({ event: 'onClick', action: 'showLayer', targetId: slide.layers![1].id });
  });
});

describe('parseBlueprintText repairs common AI slips', () => {
  const geminiStyle = `Here is the blueprint:
\`\`\`json
{
"blueprintVersion": 1,
"course": { "title": "Basic Electrical Theory" },
"slides": [
{
"layout": "image-text",
"title": "Congratulations",
"body": "You have completed the course. Select EXIT to mark your progress.",
"imageDescription": "High voltage power lines illuminated at night.",
"narration": "Congratulations! If you'd like to review the content, select the topic from the "Menu" tab. To mark your progress and close this module, select the "EXIT" button.",
"sourceRef": "EFP_BasicElectricalTheorySB_2.docx, Section 5"
},
{ "layout": "results", "passThreshold": 80, },
]
}
\`\`\``;

  it('fails strict JSON but is repaired, keeping the quoted words', () => {
    const r = parseBlueprintText(geminiStyle);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.repaired).toBe(true);
    const res = validateBlueprint(r.data);
    expect(res.ok).toBe(true);
    const narration = (r.data as { slides: { narration?: string }[] }).slides[0].narration!;
    expect(narration).toContain('select the "EXIT" button.');
    expect(narration).toContain('the "Menu" tab');
  });

  it('does not flag valid JSON as repaired', () => {
    const r = parseBlueprintText('{"blueprintVersion":1,"course":{"title":"T"},"slides":[]}');
    expect(r.ok && r.repaired).toBe(false);
  });

  it('keeps curly quotes and apostrophes as they are', () => {
    const r = parseBlueprintText('{"blueprintVersion":1,"course":{"title":"Select “EXIT” – you’re done"},"slides":[]}');
    expect(r.ok && (r.data as { course: { title: string } }).course.title).toBe('Select “EXIT” – you’re done');
  });

  it('explains unrepairable text by quoting where it broke', () => {
    const r = parseBlueprintText('{"blueprintVersion": 1, "slides": [ {"layout": "title", "title": "A"} ');
    if (r.ok === false) {
      expect(r.error).toMatch(/not valid JSON/);
    } else {
      // jsonrepair can close truncated JSON; that is fine too.
      expect(r.repaired).toBe(true);
    }
  });

  it('tells the AI not to use straight double quotes inside text', async () => {
    const { BLUEPRINT_GUIDE } = await import('@/lib/blueprint');
    expect(BLUEPRINT_GUIDE).toMatch(/never use straight double quotes/);
  });
});
