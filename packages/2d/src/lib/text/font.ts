/**
 * Build a CSS font shorthand string for use with canvas `ctx.font` and
 * Pretext's `prepare()` / `prepareWithSegments()`.
 *
 * Format: `[style] [weight] size family`
 * Example: `"italic 700 16px Inter"`
 */
export function buildCanvasFontString(
  style: string,
  weight: number,
  size: number,
  family: string,
): string {
  const parts: string[] = [];
  if (style !== 'normal') {
    parts.push(style);
  }
  if (weight !== 400) {
    parts.push(weight.toString());
  }
  parts.push(`${size}px`);
  parts.push(family);
  return parts.join(' ');
}

const FONT_SIZE = /(^|\D)(\d+(?:\.\d+)?)\s*px/;

/** Pixel size of a canvas font shorthand; 16 when it names none. */
export function canvasFontSize(font: string): number {
  const match = font.match(FONT_SIZE);
  return match === null ? 16 : parseFloat(match[2]);
}

/**
 * The same font shorthand at a multiple of its size. A shorthand that names no
 * size comes back unchanged.
 *
 * @example
 * ```ts
 * scaleCanvasFont('700 32px Inter', 0.5); // '700 16px Inter'
 * ```
 */
export function scaleCanvasFont(font: string, scale: number): string {
  return font.replace(
    FONT_SIZE,
    (_match, lead: string, size: string) =>
      `${lead}${parseFloat(size) * scale}px`,
  );
}

/**
 * Resolve a `lineHeight` signal value to pixels.
 *
 * - Number: already in pixels (e.g. `24` → `24`)
 * - String: percentage of fontSize, with or without the `%` suffix
 *   (e.g. `'120%'` or `'120'` → `fontSize * 1.2`)
 */
export function resolveLineHeight(
  lineHeight: number | string,
  fontSize: number,
): number {
  if (typeof lineHeight === 'number') {
    return lineHeight;
  }
  return (parseFloat(lineHeight) / 100) * fontSize;
}
