import { z } from 'zod';
import { jsonrepair } from 'jsonrepair';
import {
  defaultCourseSettings,
  type BaseElement,
  type CanvasDimensions,
  type CourseSettings,
  type PlayerSettings,
  type ShapeElement,
  type ShapeType,
  type Slide,
  type SlideElement,
  type SlideLayer,
  type Trigger,
  type TextElement,
} from '@/types/course';
import { sanitizeSlides, sanitizePlayerSettings, sanitizeCourseSettings, sanitizeVariables } from '@/lib/sanitize';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a 6-digit hex color');
const common = { narration: z.string().optional(), sourceRef: z.string().optional() };
const bulletList = z.array(z.string()).min(1, 'bullets must have 1–8 items').max(8, 'bullets must have 1–8 items');

const titleSlide = z.object({ layout: z.literal('title'), title: z.string(), subtitle: z.string().optional(), ...common });
const sectionSlide = z.object({ layout: z.literal('section'), title: z.string(), subtitle: z.string().optional(), ...common });
const bulletsSlide = z.object({ layout: z.literal('bullets'), title: z.string(), bullets: bulletList, ...common });
const imageTextSlide = z.object({
  layout: z.literal('image-text'), title: z.string(), body: z.string(), imageDescription: z.string(),
  imageSide: z.enum(['left', 'right']).optional(), ...common,
});
const column = z.object({ heading: z.string(), bullets: bulletList });
const twoColumnSlide = z.object({ layout: z.literal('two-column'), title: z.string(), left: column, right: column, ...common });
const revealItem = z.object({
  label: z.string().min(1, 'label is required'),
  heading: z.string().optional(),
  body: z.string().min(1, 'body is required'),
  imageDescription: z.string().optional(),
});
const revealSlide = z.object({
  layout: z.literal('reveal'), title: z.string(), intro: z.string().optional(),
  items: z.array(revealItem).min(2, 'items must have 2–6 entries').max(6, 'items must have 2–6 entries'),
  ...common,
});
const calloutSlide = z.object({ layout: z.literal('callout'), title: z.string(), message: z.string(), tone: z.enum(['warning', 'info']), ...common });
const quizSlide = z.object({
  layout: z.literal('quiz'), question: z.string(),
  choices: z.array(z.object({ text: z.string(), correct: z.boolean() }))
    .min(2, 'choices must have 2–6 items').max(6, 'choices must have 2–6 items')
    .refine((c) => c.some((x) => x.correct), 'must have at least one correct choice'),
  correctFeedback: z.string().optional(), incorrectFeedback: z.string().optional(), ...common,
});
const resultsSlide = z.object({
  layout: z.literal('results'), passThreshold: z.number().min(0).max(100).optional(),
  passMessage: z.string().optional(), failMessage: z.string().optional(), ...common,
});

export const blueprintSlideSchema = z.discriminatedUnion('layout', [
  titleSlide, sectionSlide, bulletsSlide, imageTextSlide, twoColumnSlide, revealSlide, calloutSlide, quizSlide, resultsSlide,
]);

export const courseBlueprintSchema = z.object({
  blueprintVersion: z.literal(1),
  course: z.object({
    title: z.string(),
    audience: z.string().optional(),
    themeColors: z.array(hex).length(6, 'themeColors must have exactly 6 colors').optional(),
  }),
  slides: z.array(blueprintSlideSchema).min(1, 'must contain at least one slide'),
});

export type BlueprintSlide = z.infer<typeof blueprintSlideSchema>;
export type CourseBlueprint = z.infer<typeof courseBlueprintSchema>;

export function isBlueprint(data: unknown): boolean {
  return !!data && typeof data === 'object' && (data as { blueprintVersion?: unknown }).blueprintVersion === 1;
}

export function validateBlueprint(data: unknown): { ok: true; blueprint: CourseBlueprint } | { ok: false; errors: string[] } {
  const res = courseBlueprintSchema.safeParse(data);
  if (res.success) return { ok: true, blueprint: res.data };
  const raw = data as { slides?: { layout?: string }[] };
  const errors = res.error.issues.map((iss) => {
    const p = iss.path;
    if (p[0] === 'slides' && typeof p[1] === 'number') {
      const layout = raw?.slides?.[p[1]]?.layout ?? 'unknown';
      const field = p.slice(2).filter((x) => typeof x === 'string').join('.');
      return `Slide ${p[1] + 1} (${layout}): ${field ? field + ' ' : ''}${iss.message}`.replace(/(\w+) \1 /, '$1 ');
    }
    return `${p.join('.') || 'blueprint'}: ${iss.message}`;
  });
  return { ok: false, errors };
}

export interface BlueprintCourse {
  slides: Slide[];
  masterSlides: Slide[];
  playerSettings: Partial<PlayerSettings>;
  courseSettings: Partial<CourseSettings>;
}

/** Fit a title into the 30-character slide-title limit, cutting at a word boundary with an ellipsis. */
export function shortTitle(title: string, max = 30): string {
  const t = title.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  const base = space >= max / 2 ? cut.slice(0, space) : cut;
  return base.replace(/[\s,;:.\-–—(]+$/, '') + '…';
}

export function blueprintToCourse(bp: CourseBlueprint, canvas: CanvasDimensions = { width: 1024, height: 768 }): BlueprintCourse {
  const colors = bp.course.themeColors ?? [...defaultCourseSettings.themeColors];
  const PRIMARY = colors[0], ACCENT2 = colors[3], DARK = colors[4], LIGHT = colors[5];
  const sx = canvas.width / 1024, sy = canvas.height / 768;

  const base = (x: number, y: number, w: number, h: number): Omit<BaseElement, 'type'> => ({
    id: crypto.randomUUID(),
    x: Math.round(x * sx), y: Math.round(y * sy), width: Math.round(w * sx), height: Math.round(h * sy),
    startTime: 0, duration: 5000, triggers: [],
    animationIn: 'none', animationOut: 'none',
    entranceDuration: 500, exitDuration: 500,
    isLocked: false, isHidden: false,
  });
  const text = (x: number, y: number, w: number, h: number, content: string, fontSize: number, textColor: string, fontWeight = '400'): TextElement => ({
    ...base(x, y, w, h), type: 'text', content, fontSize, fontWeight, textColor, backgroundColor: 'transparent',
  });
  const shape = (x: number, y: number, w: number, h: number, fillColor: string, extra: Partial<ShapeElement> = {}, shapeType: ShapeType = 'rectangle'): ShapeElement => ({
    ...base(x, y, w, h), type: 'shape', shapeType, fillColor, borderColor: fillColor, borderWidth: 0, ...extra,
  });
  const bulletText = (items: string[]) => items.map((b) => `• ${b}`).join('\n');
  const bulletSize = (n: number) => Math.max(18, 28 - Math.max(0, n - 4) * 2);
  const titleBar = (title: string): SlideElement[] => [
    shape(0, 0, 1024, 110, PRIMARY),
    text(60, 25, 904, 70, title, 36, LIGHT, '700'),
  ];
  const notesFor = (s: BlueprintSlide) => {
    let n = s.narration ? `Narration:\n${s.narration}` : '';
    if (s.sourceRef) n += `${n ? '\n\n' : ''}Source: ${s.sourceRef}`;
    return n || undefined;
  };
  const content = (title: string, elements: SlideElement[], s: BlueprintSlide): Slide => ({
    id: crypto.randomUUID(), title: shortTitle(title), elements, duration: 5000,
    advanceMode: 'manual', slideType: 'content', notes: notesFor(s),
  });

  const slides: Slide[] = bp.slides.map((s): Slide => {
    switch (s.layout) {
      case 'section': {
        // Section divider: light background, primary accent bar, large title.
        const size = s.title.length <= 34 ? 44 : 36;
        const els: SlideElement[] = [
          shape(0, 0, 1024, 768, LIGHT),
          shape(0, 0, 28, 768, PRIMARY),
          shape(80, 262, 120, 8, ACCENT2),
          text(80, 290, 864, 140, s.title, size, PRIMARY, '700'),
        ];
        if (s.subtitle) els.push(text(80, 440, 864, 120, s.subtitle, 24, DARK));
        return content(s.title, els, s);
      }
      case 'title': {
        const titleSize = s.title.length <= 28 ? 48 : s.title.length <= 50 ? 40 : 34;
        const els: SlideElement[] = [shape(0, 0, 1024, 768, PRIMARY), text(80, 220, 864, 180, s.title, titleSize, LIGHT, '700')];
        if (s.subtitle) els.push(text(80, 410, 864, 100, s.subtitle, 24, LIGHT));
        return content(s.title, els, s);
      }
      case 'bullets':
        return content(s.title, [...titleBar(s.title), text(60, 150, 904, 560, bulletText(s.bullets), bulletSize(s.bullets.length), DARK)], s);
      case 'image-text': {
        const imgRight = s.imageSide !== 'left';
        const imgX = imgRight ? 532 : 60, bodyX = imgRight ? 60 : 532;
        return content(s.title, [
          ...titleBar(s.title),
          shape(imgX, 150, 432, 420, LIGHT, { borderColor: DARK, borderWidth: 2, text: 'IMAGE PLACEHOLDER\n\n' + s.imageDescription, textColor: DARK, fontSize: 16 }),
          text(bodyX, 150, 432, 420, s.body, 24, DARK),
        ], s);
      }
      case 'two-column': {
        const col = (x: number, c: { heading?: string; bullets?: string[] }) => [
          text(x, 150, 432, 60, c.heading ?? "", 26, PRIMARY, '700'),
          text(x, 220, 432, 490, bulletText(c.bullets ?? []), bulletSize((c.bullets ?? []).length), DARK),
        ];
        return content(s.title, [...titleBar(s.title), ...col(60, s.left), ...col(532, s.right)], s);
      }
      case 'reveal': {
        // Storyline-style lightboxes: a button per item on the base layer; each
        // opens its own hidden layer (dimmed backdrop + card + close button).
        const SECONDARY = colors[1];
        const n = s.items.length;
        const cols = n <= 3 ? n : n === 4 ? 2 : 3;
        const rows = Math.ceil(n / cols);
        const gap = 24;
        const areaX = 60, areaY = 240, areaW = 904, areaH = 440;
        const bw = (areaW - gap * (cols - 1)) / cols;
        const bh = Math.min(110, (areaH - gap * (rows - 1)) / rows);
        const layerIds = s.items.map(() => crypto.randomUUID());
        const onClick = (action: 'showLayer' | 'hideLayer', targetId: string): Trigger[] => [
          { event: 'onClick', action, targetId },
        ];

        const baseEls: SlideElement[] = [
          ...titleBar(s.title),
          text(60, 140, 904, 80, s.intro ?? 'Select each button to learn more.', 22, DARK),
          ...s.items.map((it, i) => {
            const r = Math.floor(i / cols), c = i % cols;
            // Center a short last row.
            const inRow = r === rows - 1 ? n - r * cols : cols;
            const rowW = inRow * bw + (inRow - 1) * gap;
            const x = areaX + (areaW - rowW) / 2 + c * (bw + gap);
            return shape(x, areaY + r * (bh + gap), bw, bh, PRIMARY, {
              text: it.label, textColor: LIGHT, fontSize: it.label.length > 24 ? 18 : 22,
              hoverFillColor: SECONDARY, borderRadius: 12, triggers: onClick('showLayer', layerIds[i]),
            });
          }),
        ];

        const itemLayers: SlideLayer[] = s.items.map((it, i) => {
          const close = onClick('hideLayer', layerIds[i]);
          const heading = it.heading ?? it.label;
          const bodySize = it.body.length > 450 ? 18 : it.body.length > 280 ? 20 : 22;
          const els: SlideElement[] = [
            shape(0, 0, 1024, 768, 'rgba(0,0,0,0.55)', { triggers: close }),
            shape(112, 84, 800, 600, '#ffffff', { borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }),
            shape(112, 84, 800, 12, PRIMARY),
            text(152, 116, 660, 70, heading, 30, PRIMARY, '700'),
            shape(848, 112, 44, 44, PRIMARY, {
              text: '✕', textColor: LIGHT, fontSize: 20, hoverFillColor: SECONDARY, triggers: close,
            }, 'circle'),
          ];
          if (it.imageDescription) {
            els.push(
              shape(152, 200, 300, 440, LIGHT, { borderColor: DARK, borderWidth: 2, text: 'IMAGE PLACEHOLDER\n\n' + it.imageDescription, textColor: DARK, fontSize: 14 }),
              text(480, 200, 392, 440, it.body, bodySize, DARK),
            );
          } else {
            els.push(text(152, 200, 720, 440, it.body, bodySize, DARK));
          }
          return { id: layerIds[i], name: shortTitle(it.label, 40), visible: false, locked: false, elements: els };
        });

        const baseLayer: SlideLayer = { id: crypto.randomUUID(), name: 'Base Layer', visible: true, locked: false, elements: baseEls };
        const layers = [baseLayer, ...itemLayers];
        return { ...content(s.title, layers.flatMap((l) => l.elements), s), layers };
      }
      case 'callout': {
        const warn = s.tone === 'warning';
        return content(s.title, [
          ...titleBar(s.title),
          shape(100, 200, 824, 360, warn ? ACCENT2 : PRIMARY, {
            text: (warn ? '⚠ ' : '') + s.message, textColor: warn ? DARK : LIGHT, fontSize: 30,
          }, 'rounded-rectangle'),
        ], s);
      }
      case 'quiz':
        return {
          id: crypto.randomUUID(), elements: [], duration: 5000, slideType: 'quiz',
          title: shortTitle('Quiz: ' + s.question), notes: notesFor(s),
          quiz: {
            questionType: 'multiple-choice',
            question: s.question,
            choices: s.choices.map((c) => ({ id: crypto.randomUUID(), text: c.text, correct: c.correct })),
            singleSelect: s.choices.filter((c) => c.correct).length === 1,
            correctFeedback: { mode: 'inline', message: s.correctFeedback ?? 'Correct!' },
            incorrectFeedback: { mode: 'inline', message: s.incorrectFeedback ?? 'Not quite. Try again.' },
            attempts: 1,
            attemptsExhaustedBehavior: 'reveal',
            quizRevisitMode: 'reset',
          },
        };
      case 'results':
        return {
          id: crypto.randomUUID(), elements: [], duration: 5000, slideType: 'results', title: 'Results', notes: notesFor(s),
          results: {
            passThreshold: s.passThreshold ?? 80,
            passMessage: s.passMessage ?? 'Congratulations, you passed!',
            failMessage: s.failMessage ?? 'You did not pass. Please review and try again.',
          },
        };
    }
  });

  return {
    slides,
    masterSlides: [],
    playerSettings: { courseTitle: bp.course.title },
    courseSettings: { themeColors: [...colors] },
  };
}

/** A slide's voice-over script, for generating narration audio after a blueprint loads. */
export interface BlueprintNarration {
  slideId: string;
  title: string;
  script: string;
}

/** Payload for the LOAD_COURSE action produced from a blueprint (already sanitized). */
export interface BlueprintLoadPayload {
  slides: Slide[];
  masterSlides: Slide[];
  playerSettings: Partial<PlayerSettings> | undefined;
  courseSettings: Partial<CourseSettings> | undefined;
  variables: ReturnType<typeof sanitizeVariables>;
}

/**
 * Shared path used by Load Project and the Paste Blueprint dialog:
 * validate → convert → sanitize. Returns a ready-to-dispatch payload or errors.
 */
export function prepareBlueprintLoad(
  data: unknown,
  currentSettings: CourseSettings,
): { ok: true; payload: BlueprintLoadPayload; narration: BlueprintNarration[] } | { ok: false; errors: string[] } {
  if (!isBlueprint(data)) {
    return { ok: false, errors: ['This is not a course blueprint (it needs "blueprintVersion": 1 at the top level).'] };
  }
  const res = validateBlueprint(data);
  if (res.ok === false) return { ok: false, errors: res.errors };
  const course = blueprintToCourse(res.blueprint, currentSettings.canvasDimensions);
  // Voice-over scripts to turn into audio after loading (slide ids survive sanitizing).
  const narration: BlueprintNarration[] = res.blueprint.slides
    .map((bs, i) => ({ slideId: course.slides[i].id, title: course.slides[i].title ?? `Slide ${i + 1}`, script: bs.narration?.trim() ?? '' }))
    .filter((n) => n.script);
  return {
    ok: true,
    narration,
    payload: {
      slides: sanitizeSlides(course.slides),
      masterSlides: sanitizeSlides(course.masterSlides),
      playerSettings: sanitizePlayerSettings(course.playerSettings),
      courseSettings: sanitizeCourseSettings({ ...currentSettings, ...course.courseSettings }),
      variables: sanitizeVariables([]),
    },
  };
}

/**
 * Parse pasted text as JSON. Tolerates the ```json code fences that AI chats
 * usually wrap their output in, and text before/after the JSON object.
 *
 * If strict parsing fails, common AI formatting slips are repaired
 * automatically (unescaped "quotes" inside text, trailing commas, missing
 * commas, comments, single quotes); `repaired` is then true.
 */
export function parseBlueprintText(
  text: string,
): { ok: true; data: unknown; repaired: boolean } | { ok: false; error: string } {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  if (!t.startsWith('{')) {
    const first = t.indexOf('{');
    const last = t.lastIndexOf('}');
    if (first !== -1 && last > first) t = t.slice(first, last + 1);
  }
  if (!t) return { ok: false, error: 'Paste a blueprint first.' };
  try {
    return { ok: true, data: JSON.parse(t), repaired: false };
  } catch (strictError) {
    try {
      return { ok: true, data: JSON.parse(jsonrepair(t)), repaired: true };
    } catch {
      return { ok: false, error: describeJsonError(t, strictError as Error) };
    }
  }
}

/** Explain a JSON syntax error, quoting the text around the problem. */
function describeJsonError(text: string, err: Error): string {
  const msg = err.message;
  let pos = -1;
  const lc = msg.match(/line (\d+) column (\d+)/);
  if (lc) {
    const lines = text.split('\n');
    const line = Math.min(Number(lc[1]), lines.length) - 1;
    pos = lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0) + Number(lc[2]) - 1;
  } else {
    const p = msg.match(/position (\d+)/);
    if (p) pos = Number(p[1]);
  }
  if (pos < 0) return `This is not valid JSON: ${msg}`;
  const from = Math.max(0, pos - 50);
  const snippet = text.slice(from, pos + 20).replace(/\s+/g, ' ');
  return `This is not valid JSON near: …${snippet}… (${msg}). Check that text doesn't contain straight double quotes (").`;
}

/** Instructions to paste into any AI chat so it produces a valid blueprint. */
export const BLUEPRINT_GUIDE = `You are writing an eLearning course as a "Chronicle course blueprint": a JSON file that an authoring tool converts into slides.

RULES
- Write content ONLY from the source material I provide. Do not add facts, numbers, part names, values or procedures that are not in the source. If the source does not cover something, leave it out.
- Put the source location (document name + section/page) in "sourceRef" on every content slide, so a subject-matter expert can check it.
- Write for the audience I name. Short, plain sentences. One idea per slide.
- Output ONLY the JSON object. No explanation before or after it.
- Inside text values, never use straight double quotes ("). For quoted words, button names or terms, use single quotes ('EXIT') or curly quotes (“EXIT”). A straight double quote inside text breaks the JSON.

FORMAT
{
  "blueprintVersion": 1,
  "course": {
    "title": "Course title",
    "audience": "Who it is for (optional)",
    "themeColors": ["#1e3a5f", "#3b6ea5", "#2a9d8f", "#f4a261", "#1f2937", "#f9fafb"]
  },
  "slides": [ ...slides... ]
}
themeColors is optional: exactly 6 hex colors in this order: Primary, Secondary, Accent 1, Accent 2 (used for warnings), Dark (text), Light (backgrounds).

Every slide may also have:
  "narration": "What the narrator says on this slide (optional). Read aloud by text-to-speech.",
  "sourceRef": "Manual name, section 4.2"

SLIDE LAYOUTS (choose one per slide with "layout")

1. Title slide (use first)
{ "layout": "title", "title": "Brake Pad Inspection", "subtitle": "Level 1 maintenance" }

2. Section divider: use at the start of each section or chapter. Subtitle is optional
{ "layout": "section", "title": "Generating Electricity", "subtitle": "Section 2" }

3. Bullet list: 1 to 8 bullets, ideally 3 to 5, each under 70 characters
{ "layout": "bullets", "title": "What You Will Learn", "bullets": ["First point", "Second point", "Third point"] }

4. Text beside an image: body under 300 characters. imageDescription says what photo or drawing is needed. imageSide is "left" or "right" (optional)
{ "layout": "image-text", "title": "Personal Protective Equipment", "body": "Wear gloves and safety glasses for all tasks.", "imageDescription": "Technician wearing gloves and safety glasses", "imageSide": "right" }

5. Two columns: comparisons such as Do / Don't or Before / After; 1 to 8 bullets per column
{ "layout": "two-column", "title": "Approved vs. Prohibited", "left": { "heading": "Approved", "bullets": ["Item A", "Item B"] }, "right": { "heading": "Prohibited", "bullets": ["Item C", "Item D"] } }

6. Click-to-reveal (lightboxes): 2 to 6 buttons; each opens a pop-up with more detail. Use it where the source has lightboxes, tabs, hotspots or "click to learn more" content, or for a set of related items the learner can explore in any order. label is the button text (under 30 characters); heading is optional (defaults to the label); body under 500 characters; imageDescription is optional
{ "layout": "reveal", "title": "Types of Electrical Injuries", "intro": "Select each injury type to learn more.", "items": [ { "label": "Electric Shock", "body": "Current passing through the body. Effects range from tingling to cardiac arrest.", "imageDescription": "Electric shock warning icon" }, { "label": "Burns", "heading": "Electrical Burns", "body": "Heat at the contact point damages skin and tissue." } ] }

7. Callout: one key message under 150 characters. tone "warning" for safety-critical rules, "info" for tips and reminders
{ "layout": "callout", "title": "Before You Start", "tone": "warning", "message": "Never begin work until the vehicle is locked out." }

8. Quiz question: multiple choice, 2 to 6 choices, at least one correct. If more than one is correct the learner selects all that apply. Feedback is optional
{ "layout": "quiz", "question": "When can you begin work?", "choices": [ { "text": "Right away", "correct": false }, { "text": "After lockout is confirmed", "correct": true } ], "correctFeedback": "Correct.", "incorrectFeedback": "Not quite. Lockout must be confirmed first." }

9. Results slide: put last when the course has quiz questions. passThreshold is 0 to 100
{ "layout": "results", "passThreshold": 80 }

GUIDANCE
- If the source has a voice-over (VO) script, copy it into "narration" word for word; don't summarize it. It is turned into audio automatically.
- In "narration" only, write numbers, symbols and formulas the way they should be spoken (for example "six point two four times ten to the eighteenth" rather than "6.24 × 10¹⁸", "P equals V times I" rather than "P = V × I"). Slide text keeps the normal notation.
- Keep slide titles under 50 characters.
- If the source is divided into sections, start each one with a section slide.
- A typical module: 1 title slide, 6 to 15 content slides, 3 to 5 quiz questions, 1 results slide.
- Quiz questions must test content that appears on earlier slides.
- Use "warning" callouts only for genuine safety-critical rules.`;
