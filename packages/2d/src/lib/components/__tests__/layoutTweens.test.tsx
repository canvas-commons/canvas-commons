import {
  Vector2,
  all,
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

  it(
    'holds the parent size through the freeze and the thaw',
    generatorTest(function* (view) {
      const frame = createRef<Rect>();
      const row = createRef<Layout>();
      const middle = createRef<Rect>();
      view.add(
        <Rect ref={frame} layout padding={20}>
          <Layout ref={row} layout direction="row" gap={20}>
            <Rect width={100} height={100} />
            <Rect ref={middle} width={100} height={100} />
            <Rect width={100} height={100} />
          </Layout>
        </Rect>,
      );
      row().freezeLayout();
      middle().topLeft.view();
      middle().position.view([0, -300]);
      expectVector(frame().size(), 380, 140);
      expectVector(row().size(), 340, 100);

      const task = yield row().thawLayout(1, linear);
      yield* waitFor(0.5);
      expectVector(frame().size(), 380, 140);
      expect(middle().middle.view().y).toBeGreaterThan(-200);
      expect(middle().middle.view().y).toBeLessThan(-100);

      yield* task;
      expectVector(frame().size(), 380, 140);
      expectVector(middle().middle.view(), 0, 0);
    }),
  );

  it(
    'tweens the size of the parent to the new layout',
    generatorTest(function* (view) {
      const row = createRef<Layout>();
      const last = createRef<Rect>();
      view.add(
        <Layout ref={row} layout direction="row">
          <Rect width={100} height={100} />
          <Rect ref={last} width={100} height={100} />
        </Layout>,
      );

      row().freezeLayout();
      row().direction('column');
      expectVector(row().size(), 200, 100);

      const task = yield row().thawLayout(1, linear);
      yield* waitFor(0.5);
      expectVector(row().size(), 150, 150);

      yield* task;
      expectVector(row().size(), 100, 200);
      expectVector(last().position.view(), 0, 50);
      expect(row().width.context.raw()).toBeNull();
    }),
  );

  it(
    'keeps a width that the user sets during the freeze',
    generatorTest(function* (view) {
      const row = createRef<Layout>();
      view.add(
        <Layout ref={row} layout direction="row">
          <Rect width={100} height={100} />
          <Rect width={100} height={100} />
        </Layout>,
      );

      row().freezeLayout();
      row().width(500);
      yield* row().thawLayout(0.5, linear);
      expect(row().width()).toBe(500);
      expectVector(row().size(), 500, 100);
    }),
  );

  it(
    'keeps a width that the user sets to the frozen value',
    generatorTest(function* (view) {
      const row = createRef<Layout>();
      const removed = createRef<Rect>();
      view.add(
        <Layout ref={row} layout direction="row">
          <Rect width={100} height={100} />
          <Rect ref={removed} width={100} height={100} />
        </Layout>,
      );

      row().freezeLayout();
      row().width(200);
      removed().remove();
      yield* row().thawLayout(0.5, linear);
      expectVector(row().size(), 200, 100);
    }),
  );

  it(
    'holds the slot of a growing node while it is frozen',
    generatorTest(function* (view) {
      const frozen = createRef<Layout>();
      const other = createRef<Layout>();
      view.add(
        <Layout layout direction="row" width={400}>
          <Layout ref={frozen} width={100} height={100} grow={1} />
          <Layout ref={other} width={100} height={100} grow={1} />
        </Layout>,
      );
      expectVector(frozen().size(), 200, 100);

      frozen().freezeLayout();
      expectVector(frozen().size(), 200, 100);
      expectVector(other().size(), 200, 100);

      yield* frozen().thawLayout(0.5, linear);
      expectVector(frozen().size(), 200, 100);
      expect(frozen().width()).toBe(200);
      expect(frozen().width.context.raw()).toBe(100);
    }),
  );

  it(
    'thaws a clone of a frozen layout',
    generatorTest(function* (view) {
      const row = createRef<Layout>();
      view.add(
        <Layout ref={row} layout direction="row">
          <Rect width={100} height={100} />
          <Rect width={100} height={100} />
        </Layout>,
      );

      row().freezeLayout();
      row().children()[1].remove();
      const clone = row().clone();
      view.add(clone);
      expectVector(clone.size(), 200, 100);

      yield* all(row().thawLayout(0.5, linear), clone.thawLayout(0.5, linear));
      expectVector(row().size(), 100, 100);
      expectVector(clone.size(), 100, 100);
    }),
  );

  it(
    'keeps the flex basis size of a frozen node and its siblings',
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

      yield* frozen().thawLayout(0.5, linear);
      expectVector(frozen().size(), 200, 100);
      expectVector(other().size(), 200, 100);
    }),
  );

  it(
    'keeps nested layouts laying out their children during the thaw',
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
      expectVector(second().middle.view(), 50, 0);

      row().freezeLayout();
      const task = yield row().thawLayout(1, linear);
      yield* waitFor(0.5);
      expectVector(second().middle.view(), 50, 0);

      yield* task;
      expectVector(second().middle.view(), 50, 0);
    }),
  );

  it(
    'holds the size of a frozen node with a percent width',
    generatorTest(function* (view) {
      const frozen = createRef<Layout>();
      const other = createRef<Rect>();
      view.add(
        <Layout layout direction="row">
          <Layout ref={frozen} width="50%" height={100} />
          <Rect ref={other} width={100} height={100} />
        </Layout>,
      );
      const size = frozen().size();

      frozen().freezeLayout();
      other().width(500);
      expectVector(frozen().size(), size.x, size.y);

      yield* frozen().thawLayout(0.5, linear);
      expect(frozen().size().x).toBeGreaterThan(size.x);
    }),
  );
});
