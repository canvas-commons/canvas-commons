import {createRef} from '@canvas-commons/core';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {TextExclusion} from '../../partials/types';
import {
  carveTextLineSlots,
  getPolygonIntervalForBand,
  getRectIntervalsForBand,
} from '../../text/wrapGeometry';
import {Layout} from '../Layout';
import {Rect} from '../Rect';
import {Txt} from '../Txt';
import {mockScene2D} from './mockScene2D';

describe('getPolygonIntervalForBand', () => {
  // Apex at (50, 0), base from (0, 100) to (100, 100).
  const triangle = [
    {x: 50, y: 0},
    {x: 100, y: 100},
    {x: 0, y: 100},
  ];

  it('returns the exact interval for a band straddling a triangle', () => {
    const interval = getPolygonIntervalForBand(triangle, 40, 60, 0, 0);
    expect(interval).not.toBeNull();
    expect(interval?.left).toBeCloseTo(20, 5);
    expect(interval?.right).toBeCloseTo(80, 5);
  });

  it('returns null for a band fully above the polygon', () => {
    expect(getPolygonIntervalForBand(triangle, -50, -20, 0, 0)).toBeNull();
  });

  it('returns null for a band fully below the polygon', () => {
    expect(getPolygonIntervalForBand(triangle, 150, 170, 0, 0)).toBeNull();
  });

  it('includes the apex vertex when the band contains it', () => {
    const interval = getPolygonIntervalForBand(triangle, 0, 20, 0, 0);
    expect(interval).not.toBeNull();
    // The widest extent comes from the edge crossings at y = 20.
    expect(interval?.left).toBeCloseTo(40, 5);
    expect(interval?.right).toBeCloseTo(60, 5);
  });

  it('catches thin features that integer-y sampling would miss', () => {
    // A sliver less than 1px tall, positioned between integer scanlines.
    // The previous scanline implementation sampled at y + 0.5 and returned
    // null for this polygon; the analytic version is exact.
    const sliver = [
      {x: 0, y: 50},
      {x: 100, y: 49.8},
      {x: 100, y: 50.2},
    ];
    const interval = getPolygonIntervalForBand(sliver, 49, 51, 0, 0);
    expect(interval).not.toBeNull();
    expect(interval?.left).toBeCloseTo(0, 5);
    expect(interval?.right).toBeCloseTo(100, 5);
  });

  it('treats a horizontal edge on the band boundary as overlapping', () => {
    const square = [
      {x: 0, y: 10},
      {x: 100, y: 10},
      {x: 100, y: 50},
      {x: 0, y: 50},
    ];
    const interval = getPolygonIntervalForBand(square, 0, 10, 0, 0);
    expect(interval).not.toBeNull();
    expect(interval?.left).toBeCloseTo(0, 5);
    expect(interval?.right).toBeCloseTo(100, 5);
  });

  it('applies horizontal padding and expands the band vertically', () => {
    // Band [0, 20] with 30px of vertical padding reaches y = 50.
    const interval = getPolygonIntervalForBand(triangle, 0, 20, 5, 30);
    expect(interval).not.toBeNull();
    expect(interval?.left).toBeCloseTo(25 - 5, 5);
    expect(interval?.right).toBeCloseTo(75 + 5, 5);
  });

  it('returns null for an empty point list', () => {
    expect(getPolygonIntervalForBand([], 0, 20, 0, 0)).toBeNull();
  });
});

describe('getRectIntervalsForBand', () => {
  const rect = {x: 10, y: 30, width: 100, height: 40};

  it('returns the padded interval when the band overlaps the rect', () => {
    expect(getRectIntervalsForBand([rect], 40, 60, 5, 0)).toEqual([
      {left: 5, right: 115},
    ]);
  });

  it('skips rects outside the band', () => {
    expect(getRectIntervalsForBand([rect], 0, 30, 0, 0)).toEqual([]);
    expect(getRectIntervalsForBand([rect], 70, 90, 0, 0)).toEqual([]);
  });

  it('pulls in rects within vertical padding of the band', () => {
    expect(getRectIntervalsForBand([rect], 0, 25, 0, 10)).toEqual([
      {left: 10, right: 110},
    ]);
  });
});

describe('carveTextLineSlots', () => {
  it('returns the base interval when nothing is blocked', () => {
    expect(carveTextLineSlots({left: 0, right: 400}, [])).toEqual([
      {left: 0, right: 400},
    ]);
  });

  it('splits the band around a centered obstacle', () => {
    const slots = carveTextLineSlots({left: 0, right: 400}, [
      {left: 150, right: 250},
    ]);
    expect(slots).toHaveLength(2);
    expect(slots[0]).toEqual({left: 0, right: 150});
    expect(slots[1]).toEqual({left: 250, right: 400});
  });

  it('drops slivers narrower than the minimum slot width', () => {
    const slots = carveTextLineSlots({left: 0, right: 400}, [
      {left: 10, right: 390},
    ]);
    // Remaining slivers are 0..10 and 390..400, both < 24.
    expect(slots).toEqual([]);
  });

  it('respects multiple blocked intervals', () => {
    const slots = carveTextLineSlots({left: 0, right: 600}, [
      {left: 100, right: 200},
      {left: 400, right: 500},
    ]);
    expect(slots).toHaveLength(3);
    expect(slots.map(s => `${s.left}-${s.right}`)).toEqual([
      '0-100',
      '200-400',
      '500-600',
    ]);
  });

  it('returns an empty list when the band is fully covered', () => {
    const slots = carveTextLineSlots({left: 0, right: 200}, [
      {left: -10, right: 210},
    ]);
    expect(slots).toEqual([]);
  });
});

describe('Txt.exclusions', () => {
  mockScene2D();

  it('accepts an exclusions signal', () => {
    const txt = (
      <Txt
        width={400}
        exclusions={[{kind: 'rect', x: 0, y: 0, width: 80, height: 80}]}
      >
        body copy
      </Txt>
    ) as Txt;

    const value = txt.exclusions();
    expect(value).toHaveLength(1);
    expect(value[0].kind).toBe('rect');
  });

  it('defaults to an empty exclusions list', () => {
    const txt = (<Txt>hello</Txt>) as Txt;
    expect(txt.exclusions()).toEqual([]);
  });
});

// Line geometry needs real width measurements, so getContext is shimmed with
// a deterministic context that reports 10px per character — the same pattern
// used by the text unit geometry tests.
describe('Txt exclusion line geometry', () => {
  mockScene2D();

  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

  beforeAll(() => {
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    const fakeContext = {
      font: '',
      letterSpacing: '0px',
      textBaseline: 'alphabetic' as CanvasTextBaseline,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      save() {},
      restore() {},
      measureText(text: string) {
        return {width: text.length * 10} as TextMetrics;
      },
      fillText() {},
      strokeText() {},
    } as unknown as CanvasRenderingContext2D;
    HTMLCanvasElement.prototype.getContext = function (kind: string) {
      return kind === '2d' ? fakeContext : null;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });

  afterAll(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it('pushes lines below a fully blocked band and reports real tops', () => {
    const txt = (
      <Txt
        width={400}
        height={100}
        fontSize={10}
        lineHeight={20}
        exclusions={[{kind: 'rect', x: 0, y: -40, width: 400, height: 16}]}
      >
        alpha beta gamma delta epsilon zeta eta theta iota kappa
      </Txt>
    ) as Txt;

    const layout = txt.textLines();
    expect(layout.lines.length).toBeGreaterThanOrEqual(2);

    // The first band is fully covered, so the first laid-out line lands
    // below it rather than collapsing back to top 0.
    expect(layout.lines[0].top).toBeGreaterThanOrEqual(layout.lineHeight);

    for (let i = 1; i < layout.lines.length; i++) {
      expect(layout.lines[i].top).toBeCloseTo(
        layout.lines[i - 1].top + layout.lines[i - 1].height,
        5,
      );
    }

    const last = layout.lines[layout.lines.length - 1];
    expect(layout.height).toBeCloseTo(last.top + last.height, 5);
  });

  /** Text and geometry only, for comparing layouts across two `Txt`s. */
  const shapeOf = (txt: Txt) =>
    txt.textLines().lines.map(line => ({
      top: line.top,
      fragments: line.fragments.map(f => ({text: f.text, x: f.x})),
    }));

  it('a rect given by its center blocks the expected band', () => {
    const txt = (
      <Txt
        width={400}
        height={100}
        fontSize={10}
        lineHeight={20}
        exclusions={[{kind: 'rect', x: -150, y: -40, width: 100, height: 20}]}
      >
        cccccc
      </Txt>
    ) as Txt;

    const layout = txt.textLines();
    expect(layout.lines).toHaveLength(1);
    // The exclusion covers block x [0, 100]; the line starts past it.
    expect(layout.lines[0].fragments[0].x).toBe(100);
  });

  it('a node exclusion resolves to the same layout as the equivalent numeric rect', () => {
    const numeric = (
      <Txt
        width={400}
        height={100}
        fontSize={10}
        lineHeight={20}
        exclusions={[{kind: 'rect', x: -150, y: -40, width: 100, height: 20}]}
      >
        cccccc
      </Txt>
    ) as Txt;

    const blocker = new Rect({size: [100, 20], position: [-150, -40]});
    const viaNode = (
      <Txt
        width={400}
        height={100}
        fontSize={10}
        lineHeight={20}
        exclusions={[{kind: 'node', node: blocker}]}
      >
        cccccc
      </Txt>
    ) as Txt;

    expect(shapeOf(viaNode)).toEqual(shapeOf(numeric));
  });

  it('accepts a bare reference as the node', () => {
    const blocker = createRef<Rect>();
    void (<Rect ref={blocker} size={[100, 20]} position={[-150, -40]} />);
    const txt = (
      <Txt
        width={400}
        height={100}
        fontSize={10}
        lineHeight={20}
        exclusions={[{kind: 'node', node: blocker}]}
      >
        cccccc
      </Txt>
    ) as Txt;
    expect(txt.textLines().lines[0].fragments[0].x).toBe(100);
  });

  it('a rotated node exclusion pokes a corner into a band its axis-aligned box misses', () => {
    // Long enough text to fill every 20px band across the 200px block.
    const longText = Array.from({length: 200}, () => 'c').join(' ');
    const xAtTop = (txt: Txt, top: number) =>
      txt.textLines().lines.find(l => l.top === top)?.fragments[0]?.x;

    const axisAligned = new Rect({size: [100, 100], position: [-150, 0]});
    const straight = (
      <Txt
        width={400}
        height={200}
        fontSize={10}
        lineHeight={20}
        exclusions={[{kind: 'node', node: axisAligned}]}
      >
        {longText}
      </Txt>
    ) as Txt;

    const rotated = new Rect({
      size: [100, 100],
      position: [-150, 0],
      rotation: 45,
    });
    const turned = (
      <Txt
        width={400}
        height={200}
        fontSize={10}
        lineHeight={20}
        exclusions={[{kind: 'node', node: rotated}]}
      >
        {longText}
      </Txt>
    ) as Txt;

    // The square's edge sits at block y = 50, so the band at top 20 is
    // outside its reach; the diamond's corner reaches past y = 29.3 into it.
    expect(xAtTop(straight, 20)).toBe(0);
    expect(xAtTop(turned, 20)).toBeGreaterThan(1);

    // Neither shape reaches all the way up to the very first band.
    expect(xAtTop(straight, 0)).toBe(0);
    expect(xAtTop(turned, 0)).toBe(0);
  });

  it('a bbox-fallback node exclusion resolves to the same layout as the equivalent numeric rect', () => {
    const numeric = (
      <Txt
        width={400}
        height={100}
        fontSize={10}
        lineHeight={20}
        exclusions={[{kind: 'rect', x: -150, y: -40, width: 100, height: 20}]}
      >
        cccccc
      </Txt>
    ) as Txt;

    const blocker = new Layout({size: [100, 20], position: [-150, -40]});
    const viaNode = (
      <Txt
        width={400}
        height={100}
        fontSize={10}
        lineHeight={20}
        exclusions={[{kind: 'node', node: blocker}]}
      >
        cccccc
      </Txt>
    ) as Txt;

    expect(shapeOf(viaNode)).toEqual(shapeOf(numeric));
  });

  it('an auto-height Txt with a non-zero anchor converges on a stable height', () => {
    const exclusions: TextExclusion[] = [
      {kind: 'rect', x: -150, y: 0, width: 100, height: 20},
    ];

    const auto = (
      <Txt
        width={400}
        anchor={[0, 1]}
        fontSize={10}
        lineHeight={20}
        exclusions={exclusions}
      >
        cccccc
      </Txt>
    ) as Txt;

    const firstHeight = auto.textLines().height;
    const secondHeight = auto.textLines().height;
    expect(secondHeight).toBe(firstHeight);

    const fixed = (
      <Txt
        width={400}
        height={firstHeight}
        anchor={[0, 1]}
        fontSize={10}
        lineHeight={20}
        exclusions={exclusions}
      >
        cccccc
      </Txt>
    ) as Txt;

    // The exclusion sits squarely in the single line's band either way, so a
    // Txt that settles on this height should reproduce it exactly when fixed.
    expect(fixed.textLines().height).toBeCloseTo(firstHeight, 5);
    expect(shapeOf(fixed)).toEqual(shapeOf(auto));
    expect(auto.textLines().lines[0].fragments[0].x).toBe(100);
  });

  it('a sibling under a transformed shared parent matches the standalone case', () => {
    // The shared parent's own position and rotation must cancel out of the
    // relative transform, same as when Txt and the node share no parent.
    const parent = new Layout({
      size: [800, 400],
      position: [100, 50],
      rotation: 10,
    });
    const blocker = new Rect({size: [100, 20], position: [-150, -40]});
    const txt = new Txt({
      width: 400,
      height: 100,
      fontSize: 10,
      lineHeight: 20,
      exclusions: [{kind: 'node', node: blocker}],
      text: 'cccccc',
    });
    parent.add([txt, blocker]);

    expect(txt.textLines().lines[0].fragments[0].x).toBe(100);
  });

  it('an excluded node that is itself a flex child of a fixed-size layout works', () => {
    const blockerParent = new Layout({layout: true, width: 400, height: 100});
    const blocker = new Rect({size: [100, 20]});
    blockerParent.add([blocker]);

    const txt = new Txt({
      width: 400,
      height: 100,
      fontSize: 10,
      lineHeight: 20,
      exclusions: [{kind: 'node', node: blocker}],
      text: 'cccccc',
    });

    expect(() => txt.textLines()).not.toThrow();
    expect(txt.textLines().lines).toHaveLength(1);
  });

  it("resizing an excluded node's rect changes the layout", () => {
    const blocker = new Rect({size: [300, 200], position: [-100, 0]});
    const txt = (
      <Txt
        width={400}
        height={200}
        fontSize={10}
        lineHeight={20}
        exclusions={[{kind: 'node', node: blocker}]}
      >
        cccccc cccccc cccccc cccccc cccccc cccccc cccccc cccccc
      </Txt>
    ) as Txt;

    const before = shapeOf(txt);
    blocker.size([200, 300]);
    const after = shapeOf(txt);

    expect(after).not.toEqual(before);
  });

  it('a non-converging guess sequence still lays out past the band it blocked', () => {
    // This exclusion's guesses cycle 20 -> 40 -> 60 -> 20 without settling
    // (a full-width band exactly one line tall, centered on the block).
    const exclusions: TextExclusion[] = [
      {kind: 'rect', x: 0, y: 0, width: 400, height: 20},
    ];
    const txt = (
      <Txt width={400} fontSize={10} lineHeight={20} exclusions={exclusions}>
        cccccc
      </Txt>
    ) as Txt;

    const layout = txt.textLines();
    expect(layout.lines).toHaveLength(1);
    // The chosen guess (20) fully blocked band [0, 20], so the line lands
    // past it rather than inside it.
    expect(layout.lines[0].top).toBe(20);
    expect(layout.lines[0].fragments[0].x).toBe(0);
  });

  it('minHeight bounds the height guess to match an equivalent fixed height', () => {
    const text = Array.from({length: 14}, () => 'cccccccccc').join(' ');
    const exclusions: TextExclusion[] = [
      {kind: 'rect', x: -150, y: 0, width: 10, height: 20},
    ];

    const withMinHeight = (
      <Txt
        width={400}
        minHeight={100}
        fontSize={10}
        lineHeight={20}
        exclusions={exclusions}
      >
        {text}
      </Txt>
    ) as Txt;

    const fixed = (
      <Txt
        width={400}
        height={100}
        fontSize={10}
        lineHeight={20}
        exclusions={exclusions}
      >
        {text}
      </Txt>
    ) as Txt;

    expect(withMinHeight.textLines().height).toBeCloseTo(100, 5);
    expect(shapeOf(withMinHeight)).toEqual(shapeOf(fixed));
  });
});
