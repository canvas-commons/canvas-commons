/** One text paint call made against a {@link recordingTextContext}. */
export type PaintCall = {
  kind: 'fill' | 'stroke';
  text: string;
  x: number;
  y: number;
  globalAlpha: number;
  fillStyle: string;
  font: string;
};

/**
 * A fake 2D context that records every `fillText` / `strokeText` with the
 * paint state it was made under. Unlike the measurement mock, `save()` and
 * `restore()` really stack, so `globalAlpha` can be verified.
 */
export function recordingTextContext(): {
  calls: PaintCall[];
  context: CanvasRenderingContext2D;
} {
  const calls: PaintCall[] = [];
  const stack: Record<string, unknown>[] = [];
  const context = {
    font: '',
    letterSpacing: '0px',
    direction: 'inherit' as CanvasDirection,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    lineDashOffset: 0,
    filter: 'none',
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    canvas: {width: 0, height: 0},
    save() {
      stack.push({
        font: context.font,
        letterSpacing: context.letterSpacing,
        globalAlpha: context.globalAlpha,
        fillStyle: context.fillStyle,
        strokeStyle: context.strokeStyle,
        lineWidth: context.lineWidth,
      });
    },
    restore() {
      Object.assign(context, stack.pop() ?? {});
    },
    setLineDash() {},
    setTransform() {},
    translate() {},
    rotate() {},
    transform() {},
    drawImage() {},
    record(kind: 'fill' | 'stroke', text: string, x: number, y: number) {
      calls.push({
        kind,
        text,
        x,
        y,
        globalAlpha: context.globalAlpha,
        fillStyle: context.fillStyle,
        font: context.font,
      });
    },
    fillText(text: string, x: number, y: number) {
      context.record('fill', text, x, y);
    },
    strokeText(text: string, x: number, y: number) {
      context.record('stroke', text, x, y);
    },
  };
  return {
    calls,
    context: context as unknown as CanvasRenderingContext2D,
  };
}
