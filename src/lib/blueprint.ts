import { z } from 'zod';
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
  type TextElement,
} from '@/types/course';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a 6-digit hex color');
const common = { narration: z.string().optional(), sourceRef: z.string().optional() };
const bulletList = z.array(z.string()).min(1, 'bullets must have 1–8 items').max(8, 'bullets must have 1–8 items');

const titleSlide = z.object({ layout: z.literal('title'), title: z.string(), subtitle: z.string().optional(), ...common });
const bulletsSlide = z.object({ layout: z.literal('bullets'), title: z.string(), bullets: bulletList, ...common });
const imageTextSlide = z.object({
  layout: z.literal('image-text'), title: z.string(), body: z.string(), imageDescription: z.string(),
  imageSide: z.enum(['left', 'right']).optional(), ...common,
});
const column = z.object({ heading: z.string(), bullets: bulletList });
const twoColumnSlide = z.object({ layout: z.literal('two-column'), title: z.string(), left: column, right: column, ...common });
const calloutSlide = z.object({ layout: z.literal('callout'), title: z.string(), message: z.string(), tone: z.enum(['warning', 'info']), ...common });
const quizSlide = z.object({
  layout: z.literal('quiz'), question: z.string(),
  choices: z.array(z.object({ text: z.string(), correct: z.boolean() }))
    .min(2, 'choices must have 2–6 items').max(6, 'choices must have 2–6 items')
    .refine((c) => c.some((x) => x.correct), 'at least one choice must be correct'),
  correctFeedback: z.string().optional(), incorrectFeedback: z.string().optional(), ...common,
});
const resultsSlide = z.object({
  layout: z.literal('results'), passThreshold: z.number().min(0).max(100).optional(),
  passMessage: z.string().optional(), failMessage: z.string().optional(), ...common,
});

export const blueprintSlideSchema = z.discriminatedUnion('layout', [
  titleSlide, bulletsSlide, imageTextSlide, twoColumnSlide, calloutSlide, quizSlide, resultsSlide,
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
    id: crypto.randomUUID(), title: title.slice(0, 30), elements, duration: 5000,
    advanceMode: 'manual', slideType: 'content', notes: notesFor(s),
  });

  const slides: Slide[] = bp.slides.map((s): Slide => {
    switch (s.layout) {
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
          text(x, 150, 432, 50, c.heading ?? "", 26, PRIMARY, '700'),
          text(x, 210, 432, 500, bulletText(c.bullets ?? []), bulletSize((c.bullets ?? []).length), DARK),
        ];
        return content(s.title, [...titleBar(s.title), ...col(60, s.left), ...col(532, s.right)], s);
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
          title: ('Quiz: ' + s.question).slice(0, 30), notes: notesFor(s),
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
