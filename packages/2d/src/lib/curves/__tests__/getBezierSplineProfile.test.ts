import {Vector2} from '@canvas-commons/core';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {CubicBezierSegment} from '../CubicBezierSegment';
import {KnotInfo} from '../KnotInfo';
import {getBezierSplineProfile} from '../getBezierSplineProfile';

function coincidentKnot(): KnotInfo {
  return {
    position: Vector2.zero,
    startHandle: Vector2.zero,
    endHandle: Vector2.zero,
    auto: {start: 1, end: 1},
  };
}

describe('getBezierSplineProfile', () => {
  // jsdom cannot measure paths; the handles do not depend on the measurement.
  beforeEach(() => {
    Object.defineProperty(SVGElement.prototype, 'getTotalLength', {
      configurable: true,
      value: () => 0,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(SVGElement.prototype, 'getTotalLength');
  });

  it('keeps the handles of coincident knots finite', () => {
    const knots = [coincidentKnot(), coincidentKnot(), coincidentKnot()];

    const {segments} = getBezierSplineProfile(knots, true, 0.4);

    for (const segment of segments) {
      expect(segment).toBeInstanceOf(CubicBezierSegment);
      if (!(segment instanceof CubicBezierSegment)) continue;
      for (const point of [segment.p1, segment.p2]) {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
      }
    }
  });
});
