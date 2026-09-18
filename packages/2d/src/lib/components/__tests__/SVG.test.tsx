import {
  ThreadGenerator,
  TimingFunction,
  all,
  linear,
  waitFor,
} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {Path} from '../Path';
import {SVG} from '../SVG';
import {ShapeProps} from '../Shape';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';

// jsdom builds SVG children as plain SVGElement, so the parser cannot run here.
class TestSVG extends SVG {
  public static transformProps(transform: DOMMatrix): ShapeProps {
    return SVG.getMatrixTransformation(transform);
  }

  public transformer(
    from: Path,
    to: Path,
    duration: number,
    timing: TimingFunction,
  ): ThreadGenerator[] {
    return [...this.generateTransformer(from, to, duration, timing)];
  }
}

const LINE = 'M0,0L1,1';
const SHEAR = new DOMMatrix([
  0.78614, -0.841244, 1.09524, 0.355194, 41.93412, 519.419,
]);

function values(matrix: DOMMatrix) {
  return [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
}

function expectMatrix(actual: DOMMatrix, expected: DOMMatrix) {
  values(actual).forEach((value, index) => {
    expect(value).toBeCloseTo(values(expected)[index], 3);
  });
}

function shape(transform: DOMMatrix) {
  return new Path({data: LINE, ...TestSVG.transformProps(transform)});
}

describe('SVG', () => {
  mockScene2D();

  describe('matrix transformations', () => {
    it('keeps the shear of a sheared matrix', () => {
      const props = TestSVG.transformProps(SHEAR);

      expect(props.skew).not.toEqual({x: 0, y: 0});
      expectMatrix(shape(SHEAR).localToParent(), SHEAR);
    });

    it('composes nested group transforms', () => {
      const outer = new DOMMatrix([0.873786, 0, 0, 0.873786, 18.4951, 18.2427]);
      const composed = outer.multiply(SHEAR);

      expectMatrix(shape(composed).localToParent(), composed);
    });

    it('keeps the reflection of a mirrored matrix', () => {
      const mirror = new DOMMatrix([-1, 0, 0, 1, 12, 34]);

      expectMatrix(shape(mirror).localToParent(), mirror);
    });
  });

  describe('morphing', () => {
    it(
      'interpolates the skew of a sheared child',
      generatorTest(function* () {
        const svg = new TestSVG({svg: '<svg viewBox="0 0 1 1"></svg>'});
        const from = shape(SHEAR);
        const start = from.skew.x();

        expect(start).not.toBe(0);

        yield all(...svg.transformer(from, new Path({data: LINE}), 1, linear));
        yield* waitFor(0.5);

        expect(from.skew.x()).toBeCloseTo(start / 2, 3);
      }),
    );
  });
});
