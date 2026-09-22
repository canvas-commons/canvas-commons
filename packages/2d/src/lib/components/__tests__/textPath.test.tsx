import {BBox, Spacing} from '@canvas-commons/core';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {isClosedProfile} from '../../curves/CurveProfile';
import {getPathProfile} from '../../curves/getPathProfile';
import {getRectProfile} from '../../curves/getRectProfile';
import {Line} from '../Line';
import {Txt} from '../Txt';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';

function createSpyContext(charWidth = 10) {
  return {
    font: '',
    letterSpacing: '0px',
    direction: 'inherit' as CanvasDirection,
    textAlign: 'left' as CanvasTextAlign,
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
    rotate: vi.fn(),
    translate: vi.fn(),
    setLineDash() {},
    measureText(text: string) {
      return {width: text.length * charWidth} as TextMetrics;
    },
    fillText: vi.fn(),
    strokeText: vi.fn(),
  } as unknown as CanvasRenderingContext2D & {
    fillText: ReturnType<typeof vi.fn>;
    translate: ReturnType<typeof vi.fn>;
    rotate: ReturnType<typeof vi.fn>;
  };
}

describe('Txt path (headless)', () => {
  mockScene2D();

  it('resolves a string path to its arc length', () => {
    const txt = (<Txt textPath={'M 0 0 L 100 0'}>hi</Txt>) as Txt;
    expect(txt.pathArcLength()).toBeCloseTo(100, 5);
  });

  it('resolves a CurveProfile path', () => {
    const txt = (
      <Txt textPath={getPathProfile('M 0 0 L 0 50')}>hi</Txt>
    ) as Txt;
    expect(txt.pathArcLength()).toBeCloseTo(50, 5);
  });

  it('resolves a live Curve node sharing this transform', () => {
    const line = (
      <Line
        points={[
          [0, 0],
          [80, 0],
        ]}
      />
    ) as Line;
    const txt = (<Txt textPath={line}>hi</Txt>) as Txt;
    expect(txt.pathArcLength()).toBeCloseTo(line.arcLength(), 5);
  });

  it('sizes the node to the path bounding box', () => {
    const txt = (<Txt textPath={'M 0 0 L 100 0'}>hi</Txt>) as Txt;
    expect(txt.size().x).toBeCloseTo(100, 0);
    expect(txt.size().y).toBeCloseTo(0, 0);
  });

  it('defaults pathAlign to baseline and accepts edge anchors', () => {
    const txt = (<Txt textPath={'M 0 0 L 100 0'}>hi</Txt>) as Txt;
    expect(txt.pathAlign()).toBe('baseline');
    txt.pathAlign('top');
    expect(txt.pathAlign()).toBe('top');
  });

  it('defaults pathSplit to grapheme and accepts word', () => {
    const txt = (<Txt textPath={'M 0 0 L 100 0'}>hi</Txt>) as Txt;
    expect(txt.pathSplit()).toBe('grapheme');
    txt.pathSplit('word');
    expect(txt.pathSplit()).toBe('word');
  });

  it('disables split and unit queries under a path', () => {
    const txt = (<Txt textPath={'M 0 0 L 100 0'}>hello world</Txt>) as Txt;
    expect(txt.split('grapheme')).toEqual([]);
    expect(txt.textGlyphs()).toEqual([]);
    expect(txt.textWords()).toEqual([]);
    expect(txt.textSentences()).toEqual([]);
  });
});

describe('Txt path (geometry)', () => {
  mockScene2D();
  mockTextContext();

  it('forces a single line, collapsing embedded newlines', () => {
    const txt = (
      <Txt textPath={'M 0 0 L 1000 0'} width={50}>
        {'a\nb\nc'}
      </Txt>
    ) as Txt;
    expect(txt.lineCount()).toBe(1);
  });

  it('preserves glyph order and count along the path', () => {
    const txt = (<Txt textPath={'M 0 0 L 1000 0'}>abcde</Txt>) as Txt;
    expect(txt.text()).toBe('abcde');
    // The path forces one line wide enough to hold every glyph.
    expect(txt.lineCount()).toBe(1);
    expect(txt.textLines().lines[0].fragments[0].text).toBe('abcde');
  });
});

describe('isClosedProfile', () => {
  it('is true for a string path closed with Z', () => {
    const profile = getPathProfile('M 0 0 L 100 0 L 100 100 L 0 100 Z');
    expect(isClosedProfile(profile)).toBe(true);
  });

  it('is true for a closed rect profile', () => {
    const profile = getRectProfile(
      new BBox(-50, -50, 100, 100),
      new Spacing(),
      false,
      0,
    );
    expect(isClosedProfile(profile)).toBe(true);
  });

  it('is false for an open line', () => {
    const profile = getPathProfile('M 0 0 L 100 0');
    expect(isClosedProfile(profile)).toBe(false);
  });

  it('is false for an empty profile', () => {
    expect(isClosedProfile({segments: [], arcLength: 0, minSin: 1})).toBe(
      false,
    );
  });
});

describe('Txt path wrapping (rendering)', () => {
  mockScene2D();

  // Perimeter 400. The seam at distance 0 is a 90° corner like the others.
  const closedSquare = 'M 0 0 L 100 0 L 100 100 L 0 100 Z';
  const openLine = 'M 0 0 L 100 0';

  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
  let context: ReturnType<typeof createSpyContext>;

  function freshContext(): ReturnType<typeof createSpyContext> {
    const ctx = createSpyContext();
    HTMLCanvasElement.prototype.getContext = function (kind: string) {
      return kind === '2d' ? ctx : null;
    } as typeof HTMLCanvasElement.prototype.getContext;
    return ctx;
  }

  beforeEach(() => {
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    context = freshContext();
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it('renders every glyph on a closed path past one lap', () => {
    const txt = (<Txt textPath={closedSquare}>abcde</Txt>) as Txt;
    txt.pathOffset(400 * 3.5);
    txt.render(context);
    expect(context.fillText).toHaveBeenCalledTimes(5);
  });

  it('renders every glyph with a negative multi-lap offset', () => {
    const txt = (<Txt textPath={closedSquare}>abcde</Txt>) as Txt;
    txt.pathOffset(-400 - 5);
    txt.render(context);
    expect(context.fillText).toHaveBeenCalledTimes(5);
  });

  it('clips overflowing glyphs on an open path', () => {
    const txt = (<Txt textPath={openLine}>abcde</Txt>) as Txt;
    txt.pathOffset(1000);
    txt.render(context);
    expect(context.fillText).not.toHaveBeenCalled();
  });

  it('keeps glyph position and chord angle continuous across the seam', () => {
    // A single 10px glyph centers on the seam (distance 0) at pathOffset 40.
    const seamTxt = (<Txt textPath={closedSquare}>a</Txt>) as Txt;
    const seamContext = freshContext();

    seamTxt.pathOffset(40 - 0.001);
    seamTxt.render(seamContext);
    const beforeSeam = seamContext.translate.mock.calls.at(-1) as [
      number,
      number,
    ];
    const beforeSeamAngle = seamContext.rotate.mock.calls.at(-1)?.[0];

    seamContext.translate.mockClear();
    seamContext.rotate.mockClear();
    seamTxt.pathOffset(40 + 0.001);
    seamTxt.render(seamContext);
    const afterSeam = seamContext.translate.mock.calls.at(-1) as [
      number,
      number,
    ];
    const afterSeamAngle = seamContext.rotate.mock.calls.at(-1)?.[0];

    const dx = beforeSeam[0] - afterSeam[0];
    const dy = beforeSeam[1] - afterSeam[1];
    expect(Math.hypot(dx, dy)).toBeLessThan(0.01);

    // The interior corner at distance 100 (pathOffset 140) is the same 90°
    // turn, so the angle step across each corner must match.
    const cornerTxt = (<Txt textPath={closedSquare}>a</Txt>) as Txt;
    const cornerContext = freshContext();

    cornerTxt.pathOffset(140 - 0.001);
    cornerTxt.render(cornerContext);
    const beforeCornerAngle = cornerContext.rotate.mock.calls.at(-1)?.[0];

    cornerContext.rotate.mockClear();
    cornerTxt.pathOffset(140 + 0.001);
    cornerTxt.render(cornerContext);
    const afterCornerAngle = cornerContext.rotate.mock.calls.at(-1)?.[0];

    const seamDelta = (afterSeamAngle as number) - (beforeSeamAngle as number);
    const cornerDelta =
      (afterCornerAngle as number) - (beforeCornerAngle as number);
    expect(Math.abs(seamDelta - cornerDelta)).toBeLessThan(1e-3);
  });

  it('keeps glyph position continuous across the seam with pathAlign smooth', () => {
    const txt = (
      <Txt textPath={closedSquare} pathAlign={'smooth'}>
        a
      </Txt>
    ) as Txt;

    txt.pathOffset(40 - 0.001);
    txt.render(context);
    const beforeSeam = context.translate.mock.calls.at(-1) as [number, number];

    context.translate.mockClear();
    txt.pathOffset(40 + 0.001);
    txt.render(context);
    const afterSeam = context.translate.mock.calls.at(-1) as [number, number];

    const dx = beforeSeam[0] - afterSeam[0];
    const dy = beforeSeam[1] - afterSeam[1];
    expect(Math.hypot(dx, dy)).toBeLessThan(0.01);
  });
});
