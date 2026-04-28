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
  SlideElement,
  PlayerSettings,
  CourseSettings,
  TextElement,
  ImageElement,
  ShapeElement,
  Trigger,
} from '@/types/course';

const ANIM_IN = ['none', 'fade', 'fly-in-left', 'fly-in-right'] as const;
const ANIM_OUT = ['none', 'fade', 'fly-out-left', 'fly-out-right'] as const;
const SHAPE_TYPES = ['rectangle', 'circle', 'triangle'] as const;
const NAV_MODES = ['free', 'restricted'] as const;
const BG_MODES = ['stretch', 'fit', 'tile'] as const;

function safeString(value: unknown, fallback = '', max = 10_000): string {
  if (typeof value !== 'string') return fallback;
  return value.slice(0, max);
}

function safeId(value: unknown): string {
  if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)) return value;
  return (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function sanitizeTrigger(t: any): Trigger {
  return {
    event: safeString(t?.event, '', 64),
    action: safeString(t?.action, '', 64),
    targetId: safeString(t?.targetId, '', 64),
  };
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
    };
    return el;
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
  };
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
  };
}

export function sanitizeCourseSettings(raw: unknown): Partial<CourseSettings> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as any;
  const dims = r.canvasDimensions;
  const themeColors = Array.isArray(r.themeColors) && r.themeColors.length === 6
    ? r.themeColors.map((c: unknown) => safeColor(c, '#000000'))
    : undefined;
  return {
    canvasDimensions: dims && typeof dims === 'object' ? {
      width: safeNumber(dims.width, 1920, 320, 7680),
      height: safeNumber(dims.height, 1080, 240, 4320),
    } : undefined,
    themeColors,
  };
}
