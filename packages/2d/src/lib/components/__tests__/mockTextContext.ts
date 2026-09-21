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
 * @param fontBounds - Font box metrics for the state. Left out, `measureText`
 *   reports none and the caller falls back to em-square metrics.
 *
 * @remarks
 * Each canvas keeps its own state, so one caller's letter spacing cannot reach
 * another canvas' measurements.
 */
export function mockTextContext(
  charWidth: number | ((text: string, state: TextState) => number) = 10,
  fontBounds?: (state: TextState) => {ascent: number; descent: number},
): void {
  const measure =
    typeof charWidth === 'number'
      ? (text: string) => text.length * charWidth
      : charWidth;
  let original: typeof HTMLCanvasElement.prototype.getContext;
  beforeAll(() => {
    original = HTMLCanvasElement.prototype.getContext;
    const build = () => {
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
        // Cached nodes require a canvas on the mock context.
        canvas: {width: 0, height: 0},
        save() {},
        restore() {},
        setLineDash() {},
        setTransform() {},
        transform() {},
        translate() {},
        rotate() {},
        drawImage() {},
        measureText(text: string) {
          const state = {
            font: context.font,
            letterSpacing: context.letterSpacing,
          };
          const bounds = fontBounds?.(state);
          return {
            width: measure(text, state),
            fontBoundingBoxAscent: bounds?.ascent,
            fontBoundingBoxDescent: bounds?.descent,
          } as TextMetrics;
        },
        fillText() {},
        strokeText() {},
      };
      return context;
    };
    const contexts = new WeakMap<HTMLCanvasElement, ReturnType<typeof build>>();
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
    ) {
      if (kind !== '2d') return null;
      let context = contexts.get(this);
      if (!context) {
        context = build();
        contexts.set(this, context);
      }
      return context;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  afterAll(() => {
    HTMLCanvasElement.prototype.getContext = original;
  });
}
