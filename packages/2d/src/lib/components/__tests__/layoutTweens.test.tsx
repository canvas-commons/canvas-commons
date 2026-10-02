import {
  Vector2,
  createRef,
  createSignal,
  linear,
  waitFor,
} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {Layout} from '../Layout';
import {Node} from '../Node';
import {Rect} from '../Rect';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';

function expectVector(actual: Vector2, x: number, y: number) {
  expect(actual.x).toBeCloseTo(x);
  expect(actual.y).toBeCloseTo(y);
}

function visualPosition(node: Node) {
  return Vector2.zero.transformAsPoint(node.localToWorld());
}

describe('Layout.editLayout', () => {
  mockScene2D();

  it(
    'glides flex children to the slots of the new layout',
    generatorTest(function* (view) {
      const row = createRef<Layout>();
      const last = createRef<Rect>();
      view.add(
        <Layout ref={row} layout direction="row">
          <Rect width={100} height={100} />
          <Rect ref={last} width={100} height={100} />
        </Layout>,
      );
      expectVector(last().position.view(), 50, 0);

      const task = yield row().editLayout(
        1,
        node => node.direction('column'),
        linear,
      );
      yield* waitFor(0.5);
      expectVector(last().position.view(), 25, 25);
      expectVector(row().size(), 150, 150);

      yield* task;
      expectVector(last().position.view(), 0, 50);
      expectVector(row().size(), 100, 200);
    }),
  );

  it(
    'glides a child that the mutator moves out of a parent with no flex layout',
    generatorTest(function* (view) {
      const group = createRef<Layout>();
      const box = createRef<Rect>();
      view.add(
        <Layout ref={group} x={-200} y={-100} rotation={20}>
          <Rect ref={box} size={90} />
        </Layout>,
      );

      const task = yield group().editLayout(
        1,
        () => {
          box().reparent(view);
          box().topLeft.view([100, 300]);
        },
        linear,
      );
      expect(box().parent()).toBe(view);
      expectVector(box().position.view(), -200, -100);

      yield* waitFor(0.5);
      const end = box().size().scale(0.5).rotate(20).add([100, 300]);
      expectVector(box().position.view(), (end.x - 200) / 2, (end.y - 100) / 2);

      yield* task;
      expectVector(box().topLeft.view(), 100, 300);
      expect(box().rotation.abs()).toBeCloseTo(20);
    }),
  );

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
    'glides a child reparented under another child that also moves',
    generatorTest(function* (view) {
      const group = createRef<Layout>();
      const parentBox = createRef<Rect>();
      const child = createRef<Rect>();
      view.add(
        <Layout ref={group}>
          <Rect ref={child} size={50} x={200} />
          <Rect ref={parentBox} size={100} x={-200} />
        </Layout>,
      );

      const task = yield group().editLayout(
        1,
        () => {
          child().reparent(parentBox());
          parentBox().position.view([200, 100]);
          child().position([30, 0]);
        },
        linear,
      );
      expectVector(child().middle.view(), 200, 0);

      yield* waitFor(0.5);
      expectVector(child().middle.view(), 215, 50);

      yield* task;
      expectVector(child().middle.view(), 230, 100);
    }),
  );

  it(
    'keeps a reparented child in place when its world position does not change',
    generatorTest(function* (view) {
      const group = createRef<Layout>();
      const parentBox = createRef<Rect>();
      const child = createRef<Rect>();
      view.add(
        <Layout ref={group}>
          <Rect ref={child} size={50} x={200} />
          <Rect ref={parentBox} size={100} x={-200} />
        </Layout>,
      );

      const task = yield group().editLayout(
        1,
        () => {
          child().reparent(parentBox());
          parentBox().position.view([100, 0]);
          child().position([100, 0]);
        },
        linear,
      );
      yield* waitFor(0.5);
      expectVector(parentBox().middle.view(), -50, 0);
      expectVector(child().middle.view(), 200, 0);

      yield* task;
      expectVector(child().middle.view(), 200, 0);
    }),
  );

  it(
    'glides a child that the mutator moves into the flex layout of another node',
    generatorTest(function* (view) {
      const group = createRef<Layout>();
      const row = createRef<Layout>();
      const child = createRef<Rect>();
      view.add(
        <Layout ref={group}>
          <Rect ref={child} size={100} x={-300} scale={2} />
          <Layout ref={row} layout x={350}>
            <Rect size={0} />
          </Layout>
        </Layout>,
      );

      const start = visualPosition(child());
      const task = yield group().editLayout(
        1,
        () => child().reparent(row()),
        linear,
      );

      yield* waitFor(0.5);
      const slot = row().position.abs();
      expectVector(visualPosition(child()), (start.x + slot.x) / 2, slot.y);

      yield* task;
      expectVector(visualPosition(child()), slot.x, slot.y);
    }),
  );
});

describe('Layout.thawLayout', () => {
  mockScene2D();

  it(
    'glides a moved child back to its slot',
    generatorTest(function* (view) {
      const row = createRef<Layout>();
      const middle = createRef<Rect>();
      view.add(
        <Layout ref={row} layout direction="row" gap={20}>
          <Rect width={100} height={100} />
          <Rect ref={middle} width={100} height={100} />
          <Rect width={100} height={100} />
        </Layout>,
      );

      row().freezeLayout();
      middle().position.view([0, -300]);

      const task = yield row().thawLayout(1, linear);
      yield* waitFor(0.5);
      const halfway = middle().middle.view();
      expect(halfway.x).toBeCloseTo(0);
      expect(halfway.y).toBeGreaterThan(-200);
      expect(halfway.y).toBeLessThan(-100);

      yield* task;
      expectVector(middle().middle.view(), 0, 0);
    }),
  );
});
