/**
 * Theme color CSS variable system. Theme colors are exposed as CSS custom
 * properties on the canvas / preview / SCORM player roots so that any element
 * referencing var(--theme-*) updates instantly when the global palette changes.
 */

export const THEME_VAR_NAMES = [
  '--theme-primary',
  '--theme-secondary',
  '--theme-accent-1',
  '--theme-accent-2',
  '--theme-dark',
  '--theme-light',
] as const;

export type ThemeVarName = typeof THEME_VAR_NAMES[number];

/** Build an inline style object exposing the 6 theme colors as CSS variables. */
export function themeVarStyle(themeColors: string[]): React.CSSProperties {
  const style: Record<string, string> = {};
  THEME_VAR_NAMES.forEach((name, i) => {
    if (themeColors[i]) style[name] = themeColors[i];
  });
  return style as React.CSSProperties;
}

/** Build the CSS text (for injection into a <style> block) that defines the theme variables on :root. */
export function themeVarCssText(themeColors: string[]): string {
  return THEME_VAR_NAMES
    .map((name, i) => (themeColors[i] ? `${name}:${themeColors[i]};` : ''))
    .join('');
}

/**
 * If the value is a `var(--theme-*)` reference, return the index in the theme
 * palette. Otherwise return -1.
 */
export function themeVarIndex(value: string | undefined | null): number {
  if (!value) return -1;
  const m = value.trim().match(/^var\(\s*(--theme-[a-z0-9-]+)\s*\)$/i);
  if (!m) return -1;
  const idx = (THEME_VAR_NAMES as readonly string[]).indexOf(m[1].toLowerCase());
  return idx;
}

/**
 * Resolve a color value to a concrete hex/rgb string. If the value is a
 * `var(--theme-*)` reference, look up the corresponding entry in the palette.
 */
export function resolveColor(value: string | undefined | null, themeColors: string[], fallback = '#000000'): string {
  if (!value) return fallback;
  const idx = themeVarIndex(value);
  if (idx >= 0) return themeColors[idx] ?? fallback;
  return value;
}

/** Build a `var(--theme-X)` reference for the given palette index. */
export function themeVarRef(index: number): string {
  const name = THEME_VAR_NAMES[index];
  return name ? `var(${name})` : '';
}
