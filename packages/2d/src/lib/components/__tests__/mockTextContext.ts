import {afterAll, beforeAll} from 'vitest';

/** The context state a measurement depends on. */
export type TextState = {font: string; letterSpacing: string};

/**
 * Install a deterministic fake 2D context for the suite so text geometry is
 * reproducible without a real canvas: glyph widths come from `charWidth`,
 * and the paint calls are no-ops. Restores the original `getContext` afterwards.
 *
 * @param charWidth - Width reported per character by `measureText`, or a
 *   function measuring a whole string, which also receives the context state
 *   for font-sensitive fixtures.
 */
export function mockTextContext(
  charWidth: number | ((text: string, state: TextState) => number) = 10,
): void {
  const measure =
    typeof charWidth === 'number'
      ? (text: string) => text.length * charWidth
      : charWidth;
  let original: typeof HTMLCanvasElement.prototype.getContext;
  beforeAll(() => {
    original = HTMLCanvasElement.prototype.getContext;
    const context = {
      font: '',
      letterSpacing: '0px',
      direction: 'inherit' as CanvasDirection,
      textBaseline: 'alphabetic' as CanvasTextBaseline,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'butt' as CanvasLineCap,
      lineJoin: 'miter' as CanvasLineJoin,
      lineDashOffset: 0,
      save() {},
      restore() {},
      setLineDash() {},
      measureText(text: string) {
        return {
          width: measure(text, {
            font: context.font,
            letterSpacing: context.letterSpacing,
          }),
        } as TextMetrics;
      },
      fillText() {},
      strokeText() {},
    } as unknown as CanvasRenderingContext2D;
    HTMLCanvasElement.prototype.getContext = function (kind: string) {
      return kind === '2d' ? context : null;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  afterAll(() => {
    HTMLCanvasElement.prototype.getContext = original;
  });
}
