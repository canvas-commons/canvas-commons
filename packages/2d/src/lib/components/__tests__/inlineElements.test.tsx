import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {useScene2D} from '../../scenes';
import {Layout} from '../Layout';
import {Rect} from '../Rect';
import {Txt} from '../Txt';
import {mockScene2D} from './mockScene2D';

function createFakeContext() {
  return {
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
    transform() {},
    setLineDash() {},
    measureText(text: string) {
      return {width: text.length * 10} as TextMetrics;
    },
    fillText() {},
    strokeText() {},
  } as unknown as CanvasRenderingContext2D;
}

describe('Txt with inline elements', () => {
  mockScene2D();

  it('accepts a non-text Layout child as inline', () => {
    const inline = (<Rect width={24} height={24} fill={'red'} />) as Rect;
    const txt = (
      <Txt>
        Hello
        {inline}
        World
      </Txt>
    ) as Txt;

    // Inline child is parented to Txt and kept addressable.
    expect(inline.parent()).toBe(txt);
    expect(txt.children()).toContain(inline);
  });

  it('does not register inline children as flex children of the Txt yoga node', () => {
    const inline = (<Rect width={20} height={20} />) as Rect;
    const txt = (<Txt>before {inline} after</Txt>) as Txt;

    // Txt is always a yoga leaf — see Txt.layoutChildrenEnabled override.
    expect(txt.layoutChildrenEnabled()).toBe(false);
  });
});

// Painting goes through a fake 2d context (jsdom's getContext returns null),
// following the shim used by the text unit geometry tests.
describe('Txt nested inline rendering', () => {
  mockScene2D();

  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

  beforeAll(() => {
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    const fakeContext = createFakeContext();
    HTMLCanvasElement.prototype.getContext = function (kind: string) {
      return kind === '2d' ? fakeContext : null;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });

  afterAll(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it('renders inline children nested inside a child Txt', () => {
    const inline = (<Layout width={24} height={24} />) as Layout;
    const txt = (
      <Txt fontSize={10} width={300}>
        outer <Txt>nested {inline} run</Txt>
      </Txt>
    ) as Txt;

    const render = vi
      .spyOn(inline, 'render')
      .mockImplementation(() => undefined);
    txt.render(createFakeContext());

    expect(render).toHaveBeenCalled();
  });
});

// Geometry checks use the same fake context: every glyph measures 10px, so
// the U+FFFC placeholder is 10px wide and the slot math is deterministic.
describe('Txt inline slot geometry', () => {
  mockScene2D();

  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

  beforeAll(() => {
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    const fakeContext = createFakeContext();
    HTMLCanvasElement.prototype.getContext = function (kind: string) {
      return kind === '2d' ? fakeContext : null;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });

  afterAll(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it('reserves a slot matching the inline child width', () => {
    const inline = (<Rect width={32} height={32} />) as Rect;
    const txt = (
      <Txt fontSize={10} lineHeight={20} width={300} textAlign={'left'}>
        {'ab '}
        {inline}
        {' cd'}
      </Txt>
    ) as Txt;

    // Inline children self-calculate layout, so the declared size resolves.
    expect(inline.size().x).toBeCloseTo(32, 5);
    expect(inline.size().y).toBeCloseTo(32, 5);

    const layout = txt.textLines();
    const fragment = layout.lines
      .flatMap(line => line.fragments)
      .find(f => f.inline === inline);
    expect(fragment).toBeDefined();
    expect(fragment?.inlineWidth).toBeGreaterThan(31.5);
    expect(fragment?.inlineWidth).toBeLessThan(32.5);
  });

  it('grows only the line containing a tall inline child', () => {
    const inline = (<Rect width={30} height={50} />) as Rect;
    const txt = (
      <Txt fontSize={10} lineHeight={20} width={400} textAlign={'left'}>
        {'first line\n'}
        {'tall '}
        {inline}
        {' here'}
      </Txt>
    ) as Txt;

    const layout = txt.textLines();
    expect(layout.lines.length).toBe(2);

    const [first, second] = layout.lines;
    expect(first.top).toBe(0);
    expect(first.height).toBeCloseTo(20, 5);
    // Lines stack with cumulative tops; only the inline's line grows.
    expect(second.top).toBeCloseTo(first.height, 5);
    expect(second.height).toBeCloseTo(50, 5);

    const summed = layout.lines.reduce((sum, line) => sum + line.height, 0);
    expect(layout.height).toBeCloseTo(summed, 5);
    expect(layout.height).toBeLessThan(layout.lines.length * second.height);
  });

  it('positions an inline child at its slot center before any draw', () => {
    const inline = (<Rect width={30} height={50} />) as Rect;
    const txt = (
      <Txt fontSize={10} lineHeight={20} width={400} textAlign={'left'}>
        {'first line\n'}
        {'tall '}
        {inline}
        {' here'}
      </Txt>
    ) as Txt;
    useScene2D().getView().add(txt);

    const layout = txt.textLines();
    const line = layout.lines.find(l =>
      l.fragments.some(f => f.inline === inline),
    );
    expect(line).toBeDefined();
    if (!line) return;
    const fragment = line.fragments.find(f => f.inline === inline);
    expect(fragment).toBeDefined();
    if (!fragment) return;

    // No render/draw has happened; the binding alone must resolve the slot
    // center. With textAlign left the align offset is zero.
    const size = txt.size();
    const position = inline.position();
    expect(position.x).toBeCloseTo(
      -size.x / 2 + fragment.x + (fragment.inlineWidth ?? 0) / 2,
      3,
    );
    expect(position.y).toBeCloseTo(-size.y / 2 + line.top + line.height / 2, 3);
    expect(position.x === 0 && position.y === 0).toBe(false);
  });
});
