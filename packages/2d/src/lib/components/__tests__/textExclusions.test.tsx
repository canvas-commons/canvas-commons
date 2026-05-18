import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  carveTextLineSlots,
  getPolygonIntervalForBand,
  getRectIntervalsForBand,
} from '../../text/wrapGeometry';
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
        fontSize={10}
        lineHeight={20}
        exclusions={[{kind: 'rect', x: 0, y: 2, width: 400, height: 16}]}
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
});
