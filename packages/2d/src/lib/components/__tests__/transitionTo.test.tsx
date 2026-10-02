import {Vector2, createRef, linear, waitFor} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {Layout} from '../Layout';
import {Node} from '../Node';
import {Rect} from '../Rect';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';

function expectVector(actual: Vector2, expected: Vector2) {
  expect(actual.x).toBeCloseTo(expected.x, 3);
  expect(actual.y).toBeCloseTo(expected.y, 3);
}

function pose(node: Layout) {
  return {
    topLeft: node.topLeft.view(),
    rotation: node.rotation.abs(),
    scale: node.scale.abs(),
    rawPosition: node.position(),
    rawRotation: node.rotation(),
    rawScale: node.scale(),
  };
}

function expectPose(actual: ReturnType<typeof pose>, expected: typeof actual) {
  expectVector(actual.topLeft, expected.topLeft);
  expect(actual.rotation).toBeCloseTo(expected.rotation, 3);
  expectVector(actual.scale, expected.scale);
  expectVector(actual.rawPosition, expected.rawPosition);
  expect(actual.rawRotation).toBeCloseTo(expected.rawRotation, 3);
  expectVector(actual.rawScale, expected.rawScale);
}

describe('Layout.transitionTo', () => {
  mockScene2D();

  it(
    'lands in a transformed non-flex parent exactly like a plain insert',
    generatorTest(function* (view) {
      const source = createRef<Rect>();
      const twin = createRef<Rect>();
      const destination = createRef<Node>();
      const twinDestination = createRef<Node>();
      view.add(
        <>
          <Layout layout direction="row" gap={20}>
            <Rect width={100} height={100} />
            <Rect ref={source} width={100} height={100} position={[30, 40]} />
            <Rect width={100} height={100} />
          </Layout>
          <Node ref={destination} x={300} y={-200} rotation={30} scale={2} />
          <Layout layout direction="row" gap={20} x={-600}>
            <Rect width={100} height={100} />
            <Rect ref={twin} width={100} height={100} position={[30, 40]} />
            <Rect width={100} height={100} />
          </Layout>
          <Node
            ref={twinDestination}
            x={300}
            y={-200}
            rotation={30}
            scale={2}
          />
        </>,
      );

      const duration = 1;
      const frame = 1 / 60;
      const start = pose(source());
      const task = yield source().transitionTo(destination(), duration, linear);
      yield* waitFor(duration - frame);
      const lastFrame = pose(source());
      yield* task;
      const end = pose(source());

      expect(source().parent()).toBe(destination());
      const travel = end.topLeft.sub(start.topLeft).magnitude;
      expect(lastFrame.topLeft.sub(end.topLeft).magnitude).toBeLessThan(
        travel / 10,
      );
      expect(Math.abs(lastFrame.rotation - end.rotation)).toBeLessThan(2);
      expect(Math.abs(lastFrame.scale.x - end.scale.x)).toBeLessThan(0.1);

      twin().remove();
      twinDestination().insert(twin());
      expectPose(end, pose(twin()));
    }),
  );

  it(
    'scales continuously between the old and new world scale',
    generatorTest(function* (view) {
      const source = createRef<Rect>();
      const destination = createRef<Node>();
      view.add(
        <>
          <Layout layout direction="row">
            <Rect ref={source} width={100} height={100} />
          </Layout>
          <Node ref={destination} x={300} scale={2} />
        </>,
      );

      const task = yield source().transitionTo(destination(), 1, linear);
      yield* waitFor(0.5);
      expect(source().scale.abs().x).toBeCloseTo(1.5, 3);
      yield* task;
      expect(source().scale.abs().x).toBeCloseTo(2, 3);
    }),
  );

  it(
    'keeps a mirrored scale through the tween',
    generatorTest(function* (view) {
      const source = createRef<Rect>();
      const destination = createRef<Node>();
      view.add(
        <>
          <Layout layout direction="row">
            <Rect ref={source} width={100} height={100} scale={[1, -1]} />
          </Layout>
          <Node ref={destination} x={300} />
        </>,
      );

      const task = yield source().transitionTo(destination(), 1, linear);
      yield* waitFor(0.5);
      expect(source().localToWorld().d).toBeCloseTo(-1, 3);
      yield* task;
      expectVector(source().scale(), new Vector2(1, -1));
    }),
  );

  it(
    'keeps the local scale of a skewed node through the tween',
    generatorTest(function* (view) {
      const source = createRef<Rect>();
      const destination = createRef<Node>();
      view.add(
        <>
          <Layout layout direction="row">
            <Rect ref={source} width={100} height={100} skewX={45} />
          </Layout>
          <Node ref={destination} x={300} />
        </>,
      );

      const task = yield source().transitionTo(destination(), 1, linear);
      yield* waitFor(0.5);
      expectVector(source().scale(), new Vector2(1, 1));
      yield* task;
      expectVector(source().scale(), new Vector2(1, 1));
    }),
  );

  it(
    'lands in its slot of a flex destination',
    generatorTest(function* (view) {
      const source = createRef<Rect>();
      const destination = createRef<Layout>();
      view.add(
        <>
          <Layout layout direction="row" gap={20}>
            <Rect ref={source} width={100} height={100} />
          </Layout>
          <Layout
            ref={destination}
            layout
            direction="row"
            gap={20}
            x={400}
            y={300}
          >
            <Rect width={100} height={100} />
            <Rect width={100} height={100} />
          </Layout>
        </>,
      );

      yield* source().transitionTo(destination(), 2, 0.5, linear);

      expect(source().parent()).toBe(destination());
      expect(destination().children().indexOf(source())).toBe(2);
      const previous = destination().children()[1];
      if (!(previous instanceof Layout)) {
        throw new Error('Expected a layout sibling.');
      }
      expect(source().topLeft.view().x).toBeCloseTo(
        previous.topRight.view().x + 20,
        3,
      );
      expect(source().topLeft.view().y).toBeCloseTo(
        previous.topLeft.view().y,
        3,
      );
    }),
  );

  it(
    'leaves the node in the destination with its own values when cancelled',
    generatorTest(function* (view) {
      const source = createRef<Rect>();
      const twin = createRef<Rect>();
      const destination = createRef<Node>();
      const twinDestination = createRef<Node>();
      view.add(
        <>
          <Layout layout direction="row" gap={20}>
            <Rect width={100} height={100} />
            <Rect ref={source} width={100} height={100} position={[30, 40]} />
          </Layout>
          <Node ref={destination} x={300} y={-200} rotation={30} scale={2} />
          <Layout layout direction="row" gap={20} x={-600}>
            <Rect width={100} height={100} />
            <Rect ref={twin} width={100} height={100} position={[30, 40]} />
          </Layout>
          <Node
            ref={twinDestination}
            x={300}
            y={-200}
            rotation={30}
            scale={2}
          />
        </>,
      );

      const task = yield source().transitionTo(destination(), 1, linear);
      yield* waitFor(0.4);
      task.return();

      twin().remove();
      twinDestination().insert(twin());
      expect(source().parent()).toBe(destination());
      expectPose(pose(source()), pose(twin()));
    }),
  );
});
