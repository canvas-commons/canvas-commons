import {Vector2, createRef, createSignal, waitFor} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {Layout} from '../Layout';
import {Rect} from '../Rect';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';

function expectVector(actual: Vector2, x: number, y: number) {
  expect(actual.x).toBeCloseTo(x);
  expect(actual.y).toBeCloseTo(y);
}

describe('Layout.editLayout', () => {
  mockScene2D();

  it(
    'keeps the position signals that the children have after the mutator',
    generatorTest(function* (view) {
      const group = createRef<Layout>();
      const moved = createRef<Rect>();
      const still = createRef<Rect>();
      const target = createSignal(300);
      const offset = createSignal(-50);
      view.add(
        <Layout ref={group}>
          <Rect ref={moved} size={90} />
          <Rect ref={still} size={90} y={offset} />
        </Layout>,
      );

      yield* group().editLayout(1, () => moved().x(target));
      expectVector(moved().position(), 300, 0);

      target(400);
      offset(50);
      expectVector(moved().position(), 400, 0);
      expectVector(still().position(), 0, 50);
    }),
  );

  it(
    'keeps the signal of an axis that overlapping edits do not change',
    generatorTest(function* (view) {
      const group = createRef<Layout>();
      const box = createRef<Rect>();
      const offset = createSignal(-50);
      view.add(
        <Layout ref={group}>
          <Rect ref={box} size={90} y={offset} />
        </Layout>,
      );

      const first = yield group().editLayout(1, () => box().x(100));
      yield* waitFor(0.5);
      yield* group().editLayout(1, () => box().x(300));
      yield* first;

      offset(50);
      expectVector(box().position(), 300, 50);
    }),
  );
});
