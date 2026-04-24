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

/**
 * Returns a CSS color value if it is in a safe form, otherwise the fallback.
 * Accepts: #rgb / #rgba / #rrggbb / #rrggbbaa, rgb()/rgba(), or simple
 * lowercase identifier names (e.g. "transparent", "red").
 */
export function safeColor(value: unknown, fallback = '#000000'): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (v.length === 0 || v.length > 32) return fallback;
  if (HEX_COLOR_RE.test(v)) return v;
  if (RGB_COLOR_RE.test(v)) return v;
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
