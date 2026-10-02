/**
 * Sanitization helpers used to defend against CSS/HTML/JS injection,
 * particularly for values embedded into exported SCORM HTML and for
 * untrusted JSON imported via the Load Project flow.
 */

const SAFE_FONT_FAMILIES = new Set([
  'system-ui, sans-serif',
  'Arial, sans-serif',
  'Helvetica, sans-serif',
  'Georgia, serif',
  'Times New Roman, serif',
  'Courier New, monospace',
  'Verdana, sans-serif',
  'Tahoma, sans-serif',
  'Trebuchet MS, sans-serif',
  'Inter, sans-serif',
  'Roboto, sans-serif',
]);

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_COLOR_RE =
  /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/;
const NAMED_COLOR_RE = /^[a-zA-Z]{3,20}$/;
// Allow CSS variable references to our well-known theme tokens (e.g. var(--theme-primary)).
const THEME_VAR_RE = /^var\(\s*--theme-[a-z0-9-]{1,32}\s*\)$/i;

/**
 * Returns a CSS color value if it is in a safe form, otherwise the fallback.
 * Accepts: #rgb / #rgba / #rrggbb / #rrggbbaa, rgb()/rgba(), or simple
 * lowercase identifier names (e.g. "transparent", "red").
 */
export function safeColor(value: unknown, fallback = '#000000'): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (v.length === 0 || v.length > 64) return fallback;
  if (HEX_COLOR_RE.test(v)) return v;
  if (RGB_COLOR_RE.test(v)) return v;
  if (THEME_VAR_RE.test(v)) return v;
  if (NAMED_COLOR_RE.test(v)) return v;
  return fallback;
}

/**
 * Allowlists font-family strings. Falls back to a safe system font if the
 * provided value is not one of the known options.
 */
export function safeFontFamily(value: unknown, fallback = 'system-ui, sans-serif'): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (SAFE_FONT_FAMILIES.has(v)) return v;
  return fallback;
}

/** Clamp a numeric value to a safe range. */
export function safeNumber(value: unknown, fallback: number, min = -100000, max = 100000): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function safeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Allow a string only if it matches a fixed set of allowed literals. */
export function safeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Sanitize an arbitrary string for safe insertion as plain text inside an
 * HTML <style> or <script> context by stripping the characters that could
 * break out of those contexts. Used as a defense-in-depth layer.
 */
export function stripDangerousChars(value: string): string {
  return value.replace(/[<>"'`\\]/g, '');
}

/**
 * Validate background image source. Accepts only http(s) URLs and data: URIs
 * for common image types. Returns null if invalid.
 */
export function safeImageSrc(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v.length === 0 || v.length > 5_000_000) return null;
  if (/^https?:\/\//i.test(v) && !/["'<>\\]/.test(v)) return v;
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(v)) return v;
  return null;
}

/**
 * Validate audio source. Accepts http(s) URLs and data: URIs for common audio
 * formats (mp3/wav/ogg/m4a/aac/webm). Allows much larger payloads than image
 * to accommodate voiceover tracks. Returns null if invalid.
 */
export function safeAudioSrc(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v.length === 0 || v.length > 100_000_000) return null;
  if (/^https?:\/\//i.test(v) && !/["'<>\\]/.test(v)) return v;
  if (/^data:audio\/(mpeg|mp3|wav|wave|x-wav|ogg|webm|mp4|aac|x-m4a);base64,[A-Za-z0-9+/=]+$/i.test(v)) return v;
  return null;
}

import type {
  Slide,
  SlideLayer,
  SlideElement,
  PlayerSettings,
  CourseSettings,
  TextElement,
  ImageElement,
  ShapeElement,
  Trigger,
  CourseVariable,
} from '@/types/course';

const ANIM_IN = ['none', 'fade', 'fly-in-left', 'fly-in-right'] as const;
const ANIM_OUT = ['none', 'fade', 'fly-out-left', 'fly-out-right'] as const;
const SHAPE_TYPES = [
  'rectangle', 'circle', 'triangle',
  'rounded-rectangle', 'right-triangle', 'diamond', 'pentagon', 'hexagon',
  'octagon', 'parallelogram', 'trapezoid', 'cross', 'l-shape',
  'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down',
  'arrow-left-right', 'arrow-up-down', 'chevron-right', 'chevron-left',
  'bent-arrow-right', 'bent-arrow-left', 'circular-arrow',
  'callout-rectangle', 'callout-rounded', 'callout-oval', 'thought-bubble',
  'star-4point', 'star-5point', 'star-6point', 'star-8point', 'burst-4', 'burst-8',
] as const;
const NAV_MODES = ['free', 'restricted'] as const;
const BG_MODES = ['stretch', 'fit', 'tile'] as const;

function safeString(value: unknown, fallback = '', max = 10_000): string {
  if (typeof value !== 'string') return fallback;
  return value.slice(0, max);
}

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

function safeId(value: unknown): string {
  if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)) return value;
  return (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function sanitizeTrigger(t: any): Trigger {
  const out: Trigger = {
    event: safeString(t?.event, '', 64),
    action: safeString(t?.action, '', 64),
    targetId: safeString(t?.targetId, '', 64),
  };
  if (typeof t?.time === 'number' && isFinite(t.time)) {
    out.time = Math.max(0, Math.min(3600, t.time));
  }
  if (typeof t?.mediaId === 'string' && /^(audio|video):[A-Za-z0-9_-]{1,64}$/.test(t.mediaId)) {
    out.mediaId = t.mediaId;
  }
  if (t?.emphasis === 'pulse' || t?.emphasis === 'shake' || t?.emphasis === 'bounce' || t?.emphasis === 'flash') {
    out.emphasis = t.emphasis;
  }
  if (typeof t?.url === 'string') {
    const u = t.url.slice(0, 2048);
    if (/^https?:\/\//i.test(u) || /^mailto:/i.test(u)) out.url = u;
  }
  if (typeof t?.variableId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(t.variableId)) {
    out.variableId = t.variableId;
  }
  if (typeof t?.variableOperator === 'string' && t.variableOperator.length <= 32) {
    out.variableOperator = t.variableOperator;
  }
  if (typeof t?.variableValue === 'string') {
    out.variableValue = t.variableValue.slice(0, 5_000);
  } else if (typeof t?.variableValue === 'number' && Number.isFinite(t.variableValue)) {
    out.variableValue = t.variableValue;
  } else if (typeof t?.variableValue === 'boolean') {
    out.variableValue = t.variableValue;
  }
  if (Array.isArray(t?.conditions)) {
    const condOps = ['equals', 'notEquals', 'greaterThan', 'lessThan', 'greaterThanOrEqual', 'lessThanOrEqual'];
    const conds = t.conditions.slice(0, 20).map((c: any) => {
      if (!c || typeof c !== 'object') return null;
      if (typeof c.variableId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(c.variableId)) return null;
      if (typeof c.operator !== 'string' || condOps.indexOf(c.operator) < 0) return null;
      let value: string | number | boolean;
      if (typeof c.value === 'string') value = c.value.slice(0, 5_000);
      else if (typeof c.value === 'number' && Number.isFinite(c.value)) value = c.value;
      else if (typeof c.value === 'boolean') value = c.value;
      else value = '';
      return { variableId: c.variableId, operator: c.operator, value };
    }).filter(Boolean);
    if (conds.length) out.conditions = conds as any;
  }
  return out;
}

function sanitizeElement(raw: any): SlideElement | null {
  if (!raw || typeof raw !== 'object') return null;
  const base = {
    id: safeId(raw.id),
    x: safeNumber(raw.x, 0, -100000, 100000),
    y: safeNumber(raw.y, 0, -100000, 100000),
    width: safeNumber(raw.width, 100, 1, 100000),
    height: safeNumber(raw.height, 100, 1, 100000),
    startTime: safeNumber(raw.startTime, 0, 0, 3_600_000),
    duration: safeNumber(raw.duration, 5000, 0, 3_600_000),
    triggers: Array.isArray(raw.triggers) ? raw.triggers.slice(0, 50).map(sanitizeTrigger) : [],
    animationIn: safeEnum(raw.animationIn, ANIM_IN, 'none'),
    animationOut: safeEnum(raw.animationOut, ANIM_OUT, 'none'),
    entranceDuration: safeNumber(raw.entranceDuration, 500, 0, 60_000),
    exitDuration: safeNumber(raw.exitDuration, 500, 0, 60_000),
    ...(raw.isLocked === true ? { isLocked: true } : {}),
    ...(raw.isHidden === true ? { isHidden: true } : {}),
  };
  if (raw.type === 'text') {
    const el: TextElement = {
      ...base,
      type: 'text',
      content: safeString(raw.content, '', 10_000),
      fontSize: safeNumber(raw.fontSize, 24, 1, 1000),
      fontWeight: safeEnum(
        raw.fontWeight,
        ['100', '200', '300', '400', '500', '600', '700', '800', '900', 'normal', 'bold'] as const,
        '400',
      ),
      textColor: safeColor(raw.textColor, '#000000'),
      backgroundColor: safeColor(raw.backgroundColor, 'transparent'),
      hoverTextColor: raw.hoverTextColor != null ? safeColor(raw.hoverTextColor, '#000000') : undefined,
      hoverBackgroundColor:
        raw.hoverBackgroundColor != null ? safeColor(raw.hoverBackgroundColor, 'transparent') : undefined,
    };
    return el;
  }
  if (raw.type === 'image') {
    const el: ImageElement = {
      ...base,
      type: 'image',
      src: safeImageSrc(raw.src) ?? '',
      alt: safeString(raw.alt, '', 500),
    };
    return el;
  }
  if (raw.type === 'shape') {
    const el: ShapeElement = {
      ...base,
      type: 'shape',
      shapeType: safeEnum(raw.shapeType, SHAPE_TYPES, 'rectangle'),
      fillColor: safeColor(raw.fillColor, '#3b82f6'),
      borderColor: safeColor(raw.borderColor, '#1e40af'),
      borderWidth: safeNumber(raw.borderWidth, 0, 0, 1000),
      hoverFillColor: raw.hoverFillColor != null ? safeColor(raw.hoverFillColor, '#3b82f6') : undefined,
      hoverBorderColor: raw.hoverBorderColor != null ? safeColor(raw.hoverBorderColor, '#1e40af') : undefined,
      text: raw.text != null ? safeString(raw.text, '', 5_000) : undefined,
      textColor: raw.textColor != null ? safeColor(raw.textColor, '#000000') : undefined,
      fontSize: raw.fontSize != null ? safeNumber(raw.fontSize, 16, 1, 1000) : undefined,
      borderRadius: raw.borderRadius != null ? safeNumber(raw.borderRadius, 0, 0, 1000) : undefined,
      // box-shadow restricted to a small allowlist pattern to defend against
      // CSS injection via imported JSON.
      boxShadow:
        typeof raw.boxShadow === 'string' &&
        raw.boxShadow.length < 200 &&
        /^[\d\s.,()a-zA-Z#%/-]+$/.test(raw.boxShadow) &&
        !/[<>"'`\\]/.test(raw.boxShadow)
          ? raw.boxShadow
          : undefined,
      autoBranchTarget: isSafeId(raw.autoBranchTarget) ? raw.autoBranchTarget : undefined,
    };
    return el;
  }
  if (raw.type === 'hotspot') {
    return { ...base, type: 'hotspot' } as SlideElement;
  }
  if (raw.type === 'checkbox') {
    return {
      ...base,
      type: 'checkbox',
      label: safeString(raw.label, 'Checkbox', 500),
      defaultChecked: safeBoolean(raw.defaultChecked, false),
      textColor: raw.textColor != null ? safeColor(raw.textColor, '#ffffff') : undefined,
      fontSize: raw.fontSize != null ? safeNumber(raw.fontSize, 16, 1, 1000) : undefined,
    } as SlideElement;
  }
  if (raw.type === 'video') {
    const src = typeof raw.src === 'string' && raw.src.length < 50_000_000 &&
      (/^https?:\/\//i.test(raw.src.trim()) || /^data:video\/(mp4|webm|ogg);base64,[A-Za-z0-9+/=]+$/i.test(raw.src.trim()))
      ? raw.src.trim()
      : '';
    const el: any = {
      ...base,
      type: 'video',
      src,
      controls: safeBoolean(raw.controls, true),
      autoplay: safeBoolean(raw.autoplay, false),
    };
    return el as SlideElement;
  }
  if (raw.type === 'table') {
    const rowCount = safeNumber(raw.rowCount, 3, 1, 50);
    const colCount = safeNumber(raw.colCount, 3, 1, 20);
    const rawCells = Array.isArray(raw.cellData) ? raw.cellData : [];
    const cellData: string[][] = [];
    for (let i = 0; i < rowCount; i++) {
      const row: string[] = [];
      const rawRow = Array.isArray(rawCells[i]) ? rawCells[i] : [];
      for (let j = 0; j < colCount; j++) {
        row.push(safeString(rawRow[j], '', 2_000));
      }
      cellData.push(row);
    }
    return {
      ...base,
      type: 'table',
      rowCount,
      colCount,
      cellData,
      borderColor: raw.borderColor != null ? safeColor(raw.borderColor, '#94a3b8') : undefined,
      textColor: raw.textColor != null ? safeColor(raw.textColor, '#0f172a') : undefined,
      fontSize: raw.fontSize != null ? safeNumber(raw.fontSize, 14, 1, 1000) : undefined,
    } as SlideElement;
  }
  return null;
}

function sanitizeCaption(c: any) {
  return {
    startTime: safeNumber(c?.startTime, 0, 0, 86_400),
    endTime: safeNumber(c?.endTime, 0, 0, 86_400),
    text: safeString(c?.text, '', 1_000),
  };
}

function sanitizeAudio(raw: any) {
  if (!raw || typeof raw !== 'object') return null;
  const src = safeAudioSrc(raw.src);
  if (!src) return null;
  return {
    id: safeId(raw.id),
    name: safeString(raw.name, 'audio', 200),
    src,
    duration: safeNumber(raw.duration, 0, 0, 86_400),
    captions: Array.isArray(raw.captions)
      ? raw.captions.slice(0, 500).map(sanitizeCaption)
      : [],
  };
}

function sanitizeSlide(raw: any): Slide {
  const transitionType = safeEnum(
    raw?.transitionType,
    ['none', 'fade', 'push-up', 'push-left', 'zoom-in'] as const,
    'none',
  );
  return {
    id: safeId(raw?.id),
    title: typeof raw?.title === 'string' ? raw.title.slice(0, 30) : undefined,
    duration: safeNumber(raw?.duration, 5000, 0, 3_600_000),
    masterId: typeof raw?.masterId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(raw.masterId)
      ? raw.masterId
      : undefined,
    elements: Array.isArray(raw?.elements)
      ? raw.elements.slice(0, 1000).map(sanitizeElement).filter((e): e is SlideElement => e !== null)
      : [],
    audio: Array.isArray(raw?.audio)
      ? raw.audio.slice(0, 20).map(sanitizeAudio).filter((a: any): a is NonNullable<typeof a> => a !== null)
      : [],
    notes: typeof raw?.notes === 'string' ? raw.notes.slice(0, 10_000) : undefined,
    transitionType,
    transitionDuration: safeNumber(raw?.transitionDuration, 0.5, 0, 10),
    advanceMode: safeEnum(raw?.advanceMode, ['manual', 'auto'] as const, 'manual'),
    revisitMode: safeEnum(raw?.revisitMode, ['reset', 'resume'] as const, 'reset'),
    next: Array.isArray(raw?.next) ? raw.next.filter(isSafeId).slice(0, 50) : undefined,
    treePos: raw?.treePos && typeof raw.treePos === 'object'
      ? { x: safeNumber(raw.treePos.x, 0, -100_000, 100_000), y: safeNumber(raw.treePos.y, 0, -100_000, 100_000) }
      : undefined,
    layers: sanitizeLayers(raw?.layers),
    ...sanitizeSlideKind(raw),
  };
}

/** Preserves slide layers (previously dropped on load, which merged every layer into one). */
function sanitizeLayers(raw: unknown): SlideLayer[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  type RawLayer = { id?: unknown; name?: unknown; visible?: unknown; locked?: unknown; elements?: unknown };
  return (raw.slice(0, 50).filter((l) => l && typeof l === 'object') as RawLayer[]).map((l) => ({
    id: safeId(l.id),
    name: safeString(l.name, 'Layer', 100) || 'Layer',
    visible: l.visible !== false,
    locked: l.locked === true,
    elements: Array.isArray(l.elements)
      ? l.elements.slice(0, 1000).map(sanitizeElement).filter((e): e is SlideElement => e !== null)
      : [],
  }));
}

function sanitizeFeedback(raw: any) {
  return {
    mode: safeEnum(raw?.mode, ['inline', 'jumpToSlide', 'overlay'] as const, 'inline'),
    message: typeof raw?.message === 'string' ? safeString(raw.message, '', 2_000) : undefined,
    targetSlideId: typeof raw?.targetSlideId === 'string' ? safeId(raw.targetSlideId) : undefined,
  };
}

/** Preserves quiz/results slide configuration (previously dropped on load). */
function sanitizeSlideKind(raw: any): Partial<Slide> {
  const slideType = safeEnum(raw?.slideType, ['content', 'quiz', 'results'] as const, 'content');
  const out: Partial<Slide> = { slideType };
  if (slideType === 'quiz' && raw?.quiz && typeof raw.quiz === 'object') {
    const q = raw.quiz;
    const arr = (v: any) => (Array.isArray(v) ? v.slice(0, 50) : []);
    out.quiz = {
      questionType: safeEnum(q.questionType, ['multiple-choice', 'dnd-matching', 'dnd-sorting'] as const, 'multiple-choice'),
      question: safeString(q.question, '', 2_000),
      choices: arr(q.choices).map((c: any) => ({ id: safeId(c?.id), text: safeString(c?.text, '', 1_000), correct: safeBoolean(c?.correct) })),
      singleSelect: safeBoolean(q.singleSelect, true),
      pairs: arr(q.pairs).map((p: any) => ({ id: safeId(p?.id), left: safeString(p?.left, '', 1_000), right: safeString(p?.right, '', 1_000) })),
      sortItems: arr(q.sortItems).map((i: any) => ({ id: safeId(i?.id), text: safeString(i?.text, '', 1_000) })),
      correctFeedback: sanitizeFeedback(q.correctFeedback),
      incorrectFeedback: sanitizeFeedback(q.incorrectFeedback),
      attempts: safeNumber(q.attempts, 1, 0, 10),
      attemptsExhaustedBehavior: safeEnum(q.attemptsExhaustedBehavior, ['reveal', 'lock'] as const, 'reveal'),
      quizRevisitMode: safeEnum(q.quizRevisitMode, ['reset', 'resume'] as const, 'reset'),
      allowSkip: safeBoolean(q.allowSkip),
      skipTargetSlideId: typeof q.skipTargetSlideId === 'string' ? safeId(q.skipTargetSlideId) : undefined,
      timer: q.timer && typeof q.timer === 'object' ? {
        enabled: safeBoolean(q.timer.enabled),
        mode: safeEnum(q.timer.mode, ['per-question', 'course'] as const, 'per-question'),
        minutes: safeNumber(q.timer.minutes, 1, 0, 600),
        seconds: safeNumber(q.timer.seconds, 0, 0, 59),
        showToLearner: safeBoolean(q.timer.showToLearner, true),
      } : undefined,
    };
  }
  if (slideType === 'results' && raw?.results && typeof raw.results === 'object') {
    out.results = {
      passThreshold: safeNumber(raw.results.passThreshold, 80, 0, 100),
      passMessage: safeString(raw.results.passMessage, '', 2_000),
      failMessage: safeString(raw.results.failMessage, '', 2_000),
    };
  }
  return out;
}

export function sanitizeSlides(raw: unknown): Slide[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 1000).map(sanitizeSlide);
}

export function sanitizePlayerSettings(raw: unknown): Partial<PlayerSettings> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as any;
  return {
    backgroundColor: safeColor(r.backgroundColor, '#1a1a2e'),
    buttonColor: safeColor(r.buttonColor, '#3b82f6'),
    buttonBorderRadius: safeNumber(r.buttonBorderRadius, 6, 0, 200),
    fontFamily: safeFontFamily(r.fontFamily),
    showMenu: safeBoolean(r.showMenu, false),
    navigationMode: safeEnum(r.navigationMode, NAV_MODES, 'free'),
    backgroundImage: safeImageSrc(r.backgroundImage),
    backgroundMode: safeEnum(r.backgroundMode, BG_MODES, 'stretch'),
    courseTitle: stripDangerousChars(safeString(r.courseTitle, 'Untitled Course', 200)) || 'Untitled Course',
    sidebarPosition: safeEnum(r.sidebarPosition, ['left', 'right', 'none'] as const, 'left'),
    playerTabs: {
      showMenu: safeBoolean(r.playerTabs?.showMenu, true),
      showNotes: safeBoolean(r.playerTabs?.showNotes, true),
    },
    playerControls: {
      showPlayPause: safeBoolean(r.playerControls?.showPlayPause, true),
      showCaptions: safeBoolean(r.playerControls?.showCaptions, true),
    },
    courseTimer: r.courseTimer && typeof r.courseTimer === 'object' ? {
      enabled: safeBoolean(r.courseTimer.enabled),
      minutes: safeNumber(r.courseTimer.minutes, 10, 0, 600),
      seconds: safeNumber(r.courseTimer.seconds, 0, 0, 59),
      showToLearner: safeBoolean(r.courseTimer.showToLearner, true),
    } : undefined,
  };
}

export function sanitizeCourseSettings(raw: unknown): Partial<CourseSettings> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as any;
  const dims = r.canvasDimensions;
  const themeColors = Array.isArray(r.themeColors) && r.themeColors.length === 6
    ? r.themeColors.map((c: unknown) => safeColor(c, '#000000'))
    : undefined;
  const tr = r.transition;
  const transition = tr && typeof tr === 'object'
    ? {
        type: safeEnum(tr.type, ['none', 'fade', 'push-up', 'push-left', 'zoom-in'] as const, 'none'),
        duration: safeNumber(tr.duration, 1, 1, 5),
        color: safeColor(tr.color, '#000000'),
      }
    : undefined;
  return {
    canvasDimensions: dims && typeof dims === 'object' ? {
      width: safeNumber(dims.width, 1920, 320, 7680),
      height: safeNumber(dims.height, 1080, 240, 4320),
    } : undefined,
    themeColors,
    transition,
  };
}

/**
 * Sanitize the course-level variables list. Validates name (no spaces),
 * type, and coerces defaultValue to match the declared type.
 */
export function sanitizeVariables(raw: unknown): CourseVariable[] {
  if (!Array.isArray(raw)) return [];
  const out: CourseVariable[] = [];
  for (const r of raw.slice(0, 500)) {
    if (!r || typeof r !== 'object') continue;
    const rr = r as any;
    const id = safeId(rr.id);
    const rawName = typeof rr.name === 'string' ? rr.name.trim() : '';
    if (!rawName) continue;
    // No spaces; alphanumerics + underscore only; max 64 chars.
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(rawName)) continue;
    const type = safeEnum(rr.type, ['boolean', 'number', 'text'] as const, 'text');
    let defaultValue: boolean | number | string;
    if (type === 'boolean') {
      defaultValue = safeBoolean(rr.defaultValue, false);
    } else if (type === 'number') {
      defaultValue = safeNumber(rr.defaultValue, 0, -1e12, 1e12);
    } else {
      defaultValue = typeof rr.defaultValue === 'string' ? rr.defaultValue.slice(0, 5000) : '';
    }
    out.push({ id, name: rawName, type, defaultValue });
  }
  return out;
}
