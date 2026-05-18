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
