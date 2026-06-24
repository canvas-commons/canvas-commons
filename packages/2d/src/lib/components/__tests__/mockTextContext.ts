import {afterAll, beforeAll} from 'vitest';

/**
 * Install a deterministic fake 2D context for the suite so text geometry is
 * reproducible without a real canvas: every glyph measures `charWidth` pixels,
 * and the paint calls are no-ops. Restores the original `getContext` afterwards.
 *
 * @param charWidth - Width reported per character by `measureText`.
 */
export function mockTextContext(charWidth = 10): void {
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
        return {width: text.length * charWidth} as TextMetrics;
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
