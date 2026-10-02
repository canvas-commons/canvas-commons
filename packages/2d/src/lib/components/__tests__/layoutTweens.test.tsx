import {
  Vector2,
  createRef,
  createSignal,
  linear,
  waitFor,
} from '@canvas-commons/core';
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

describe('Layout.freezeLayout', () => {
  mockScene2D();

  it(
    'holds the size of a node with a flex basis until the thaw ends',
    generatorTest(function* (view) {
      const frozen = createRef<Layout>();
      const other = createRef<Layout>();
      view.add(
        <Layout layout direction="row" width={400}>
          <Layout ref={frozen} basis={100} height={100} grow={1} />
          <Layout ref={other} basis={100} height={100} grow={1} />
        </Layout>,
      );

      frozen().freezeLayout();
      expectVector(frozen().size(), 200, 100);
      expectVector(other().size(), 200, 100);

      const thaw = yield frozen().thawLayout(1, linear);
      yield* waitFor(0.5);
      expectVector(frozen().size(), 200, 100);

      yield* thaw;
      expectVector(frozen().size(), 200, 100);
      expectVector(other().size(), 200, 100);
    }),
  );

  it(
    'applies after a layout animation that is in progress',
    generatorTest(function* (view) {
      const row = createRef<Layout>();
      const first = createRef<Rect>();
      view.add(
        <Layout ref={row} layout direction="row">
          <Rect ref={first} width={100} height={100} />
          <Rect width={100} height={100} />
        </Layout>,
      );

      const edit = yield row().editLayout(1, node => node.gap(100), linear);
      yield* waitFor(0.5);
      row().freezeLayout();
      expectVector(row().size(), 250, 100);

      yield* edit;
      first().width(300);
      expectVector(row().size(), 300, 100);

      yield* row().thawLayout(1, linear);
      expectVector(row().size(), 500, 100);
    }),
  );
});

describe('Layout.thawLayout', () => {
  mockScene2D();

  it(
    'keeps a nested layout laying out its children during the tween',
    generatorTest(function* (view) {
      const row = createRef<Layout>();
      const second = createRef<Rect>();
      view.add(
        <Layout ref={row} layout direction="row">
          <Layout direction="row">
            <Rect width={100} height={100} />
            <Rect ref={second} width={100} height={100} />
          </Layout>
        </Layout>,
      );

      row().freezeLayout();
      const thaw = yield row().thawLayout(1, linear);
      yield* waitFor(0.5);
      expectVector(second().middle.view(), 50, 0);

      yield* thaw;
      expectVector(second().middle.view(), 50, 0);
    }),
  );
});
