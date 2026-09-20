type PaintCall = {
  kind: 'fill' | 'stroke';
  text: string;
  x: number;
  y: number;
  globalAlpha: number;
  fillStyle: string;
  font: string;
};

const TRACKED = [
  'font',
  'letterSpacing',
  'globalAlpha',
  'fillStyle',
  'strokeStyle',
  'lineWidth',
] as const;

type Fixture = Partial<CanvasRenderingContext2D>;

/** Preserve paint state across nested draws so opacity is observable. */
export function recordingTextContext(): {
  calls: PaintCall[];
  context: CanvasRenderingContext2D;
} {
  const calls: PaintCall[] = [];
  const stack: Fixture[] = [];
  const record = (
    kind: 'fill' | 'stroke',
    text: string,
    x: number,
    y: number,
  ) => {
    calls.push({
      kind,
      text,
      x,
      y,
      globalAlpha: fixture.globalAlpha ?? 1,
      fillStyle: String(fixture.fillStyle ?? ''),
      font: fixture.font ?? '',
    });
  };

  const fixture: Fixture = {
    font: '',
    letterSpacing: '0px',
    direction: 'inherit',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    lineDashOffset: 0,
    filter: 'none',
    globalCompositeOperation: 'source-over',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    save() {
      const state: Fixture = {};
      for (const key of TRACKED) Object.assign(state, {[key]: fixture[key]});
      stack.push(state);
    },
    restore() {
      Object.assign(fixture, stack.pop() ?? {});
    },
    setLineDash() {},
    setTransform() {},
    translate() {},
    rotate() {},
    transform() {},
    drawImage() {},
    fillText(text: string, x: number, y: number) {
      record('fill', text, x, y);
    },
    strokeText(text: string, x: number, y: number) {
      record('stroke', text, x, y);
    },
  };

  // A fixture of the members `Txt` paints through; the rest stay undefined.
  return {calls, context: fixture as CanvasRenderingContext2D};
}
