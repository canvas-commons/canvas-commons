export type PaintCall = {
  kind: 'fill' | 'stroke';
  text: string;
  x: number;
  y: number;
  globalAlpha: number;
  fillStyle: string;
  font: string;
  /** Spacing the context adds between the glyphs of this run. */
  letterSpacing: number;
  textAlign: CanvasTextAlign;
  direction: CanvasDirection;
  /** Where the pen lands once the transform in place is applied. */
  penX: number;
  penY: number;
  /** The uniform scale of the transform in place. */
  scale: number;
};

const TRACKED = [
  'font',
  'letterSpacing',
  'globalAlpha',
  'fillStyle',
  'strokeStyle',
  'lineWidth',
  'textAlign',
  'direction',
] as const;

type Fixture = Partial<CanvasRenderingContext2D>;

/** Translation, rotation and uniform scale the fixture's transform calls have applied. */
type Transform = {x: number; y: number; angle: number; scale: number};

/** Preserve paint state across nested draws so opacity is observable. */
export function recordingTextContext(): {
  calls: PaintCall[];
  context: CanvasRenderingContext2D;
} {
  const calls: PaintCall[] = [];
  const stack: {state: Fixture; transform: Transform}[] = [];
  let transform: Transform = {x: 0, y: 0, angle: 0, scale: 1};
  const record = (
    kind: 'fill' | 'stroke',
    text: string,
    x: number,
    y: number,
  ) => {
    const cos = Math.cos(transform.angle);
    const sin = Math.sin(transform.angle);
    calls.push({
      kind,
      text,
      x,
      y,
      globalAlpha: fixture.globalAlpha ?? 1,
      fillStyle: String(fixture.fillStyle ?? ''),
      font: fixture.font ?? '',
      letterSpacing: parseFloat(fixture.letterSpacing ?? '0') || 0,
      textAlign: fixture.textAlign ?? 'start',
      direction: fixture.direction ?? 'inherit',
      penX: transform.x + (x * cos - y * sin) * transform.scale,
      penY: transform.y + (x * sin + y * cos) * transform.scale,
      scale: transform.scale,
    });
  };

  const fixture: Fixture = {
    font: '',
    letterSpacing: '0px',
    direction: 'inherit',
    textAlign: 'start',
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
      stack.push({state, transform: {...transform}});
    },
    restore() {
      const saved = stack.pop();
      if (!saved) return;
      Object.assign(fixture, saved.state);
      transform = saved.transform;
    },
    setLineDash() {},
    setTransform() {
      transform = {x: 0, y: 0, angle: 0, scale: 1};
    },
    translate(x: number, y: number) {
      const cos = Math.cos(transform.angle);
      const sin = Math.sin(transform.angle);
      transform = {
        x: transform.x + (x * cos - y * sin) * transform.scale,
        y: transform.y + (x * sin + y * cos) * transform.scale,
        angle: transform.angle,
        scale: transform.scale,
      };
    },
    rotate(angle: number) {
      transform = {...transform, angle: transform.angle + angle};
    },
    scale(x: number) {
      transform = {...transform, scale: transform.scale * x};
    },
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
