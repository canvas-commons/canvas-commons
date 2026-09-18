import {
  Color,
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

  public static styleProps(
    element: SVGGraphicsElement,
    inherited: ShapeProps = {},
  ): ShapeProps {
    return SVG.getElementStyle(element, inherited);
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

function painted(markup: string, inherited?: ShapeProps) {
  const container = window.document.createElement('div');
  container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`;
  const element = container.querySelector('g');
  if (element === null) throw new Error('missing element');
  return new Path({data: LINE, ...TestSVG.styleProps(element, inherited)});
}

function hex(style: unknown) {
  return style instanceof Color ? style.hex() : style;
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

  describe('presentation properties', () => {
    it('reads paint from the style attribute', () => {
      const path = painted(
        `<g style="fill:rgb(166,227,161);stroke:rgb(30,30,46);stroke-width:4;stroke-linejoin:round;opacity:0.5"/>`,
      );

      expect(hex(path.fill())).toBe('#a6e3a1');
      expect(hex(path.stroke())).toBe('#1e1e2e');
      expect(path.lineWidth()).toBe(4);
      expect(path.lineJoin()).toBe('round');
      expect(path.opacity()).toBe(0.5);
    });

    it('prefers the style over the presentation attribute', () => {
      const path = painted(
        `<g fill="rgb(243,139,168)" style="fill:rgb(137,180,250)"/>`,
      );

      expect(hex(path.fill())).toBe('#89b4fa');
    });

    it('still reads a presentation attribute with no style', () => {
      const path = painted(`<g fill="rgb(243,139,168)" stroke-width="2"/>`);

      expect(hex(path.fill())).toBe('#f38ba8');
      expect(path.lineWidth()).toBe(2);
    });

    it('inherits a property the element does not set', () => {
      const path = painted(`<g/>`, {
        fill: 'rgb(249,226,175)',
        lineJoin: 'round',
      });

      expect(hex(path.fill())).toBe('#f9e2af');
      expect(path.lineJoin()).toBe('round');
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
