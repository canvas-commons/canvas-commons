import {
  Vector2,
  all,
  cancel,
  createRef,
  createSignal,
  linear,
  waitFor,
} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {generatorTest} from '../components/__tests__/generatorTest';
import {mockScene2D} from '../components/__tests__/mockScene2D';
import {Layout} from '../components/Layout';
import {Rect} from '../components/Rect';
import {invertPositions, playInverted, snapshotPositions} from './layoutFlip';

function expectVector(actual: Vector2, x: number, y: number) {
  expect(actual.x).toBeCloseTo(x);
  expect(actual.y).toBeCloseTo(y);
}

describe('FLIP offset', () => {
  mockScene2D();

  it(
    'composes with the own translate of a child that the layout moves',
    generatorTest(function* (view) {
      const row = createRef<Layout>();
      const first = createRef<Rect>();
      const other = createRef<Rect>();
      const last = createRef<Rect>();
      view.add(
        <Layout ref={row} layout direction="row">
          <Rect ref={first} width={100} height={100} />
          <Rect ref={last} width={100} height={100} translate={[0, 20]} />
        </Layout>,
      );
      view.add(<Rect ref={other} size={50} x={400} />);

      const task = yield first().morphTo(other(), 1, linear);
      yield* waitFor(0.5);
      expectVector(last().translate(), 25, 20);

      yield* task;
      expectVector(last().translate(), 0, 20);
    }),
  );

  it(
    'keeps a reactive translate reacting after the tween',
    generatorTest(function* (view) {
      const dy = createSignal(30);
      const row = createRef<Layout>();
      const first = createRef<Rect>();
      const other = createRef<Rect>();
      const last = createRef<Rect>();
      view.add(
        <Layout ref={row} layout direction="row">
          <Rect ref={first} width={100} height={100} />
          <Rect
            ref={last}
            width={100}
            height={100}
            translate={() => [0, dy()]}
          />
        </Layout>,
      );
      view.add(<Rect ref={other} size={50} x={400} />);

      yield* first().morphTo(other(), 1, linear);
      expectVector(last().translate(), 0, 30);

      dy(80);
      expectVector(last().translate(), 0, 80);
    }),
  );

  it(
    'follows a reactive translate while the tween runs',
    generatorTest(function* (view) {
      const dy = createSignal(30);
      const row = createRef<Layout>();
      const first = createRef<Rect>();
      const other = createRef<Rect>();
      const last = createRef<Rect>();
      view.add(
        <Layout ref={row} layout direction="row">
          <Rect ref={first} width={100} height={100} />
          <Rect
            ref={last}
            width={100}
            height={100}
            translate={() => [0, dy()]}
          />
        </Layout>,
      );
      view.add(<Rect ref={other} size={50} x={400} />);

      const task = yield first().morphTo(other(), 1, linear);
      yield* waitFor(0.5);
      dy(80);
      expectVector(last().translate(), 25, 80);
      yield* task;
    }),
  );

  it(
    'restores the own translate when the tween is cancelled',
    generatorTest(function* (view) {
      const first = createRef<Rect>();
      const last = createRef<Rect>();
      view.add(
        <Layout layout direction="row">
          <Rect ref={first} width={100} height={100} />
          <Rect ref={last} width={100} height={100} translate={[0, 20]} />
        </Layout>,
      );

      const pre = snapshotPositions([last()]);
      first().layoutSelf(false);
      const inverted = invertPositions(pre, snapshotPositions([last()]));

      const task = yield playInverted(inverted, 1, linear);
      yield* waitFor(0.5);
      expectVector(last().translate(), 25, 20);

      cancel(task);
      expectVector(last().translate(), 0, 20);
    }),
  );

  it(
    'glides one sibling smoothly while two tweens end at different times',
    generatorTest(function* (view) {
      const first = createRef<Rect>();
      const second = createRef<Rect>();
      const last = createRef<Rect>();
      const otherFirst = createRef<Rect>();
      const otherSecond = createRef<Rect>();
      view.add(
        <Layout layout direction="row">
          <Rect ref={first} width={100} height={100} />
          <Rect ref={second} width={100} height={100} />
          <Rect ref={last} width={100} height={100} />
        </Layout>,
      );
      view.add(<Rect ref={otherFirst} size={50} x={400} />);
      view.add(<Rect ref={otherSecond} size={50} x={500} />);

      const shortTask = yield first().morphTo(otherFirst(), 1, linear);
      const longTask = yield second().morphTo(otherSecond(), 2, linear);

      const samples: number[] = [];
      for (let i = 0; i < 8; i++) {
        yield* waitFor(0.25);
        samples.push(last().translate().x);
      }
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i]).toBeLessThan(samples[i - 1]);
      }

      yield* all(shortTask, longTask);
      expect(last().translate.x.context.raw()).not.toBeInstanceOf(Function);
      expectVector(last().translate(), 0, 0);
    }),
  );

  it(
    'keeps a translate that is set while the tween runs',
    generatorTest(function* (view) {
      const first = createRef<Rect>();
      const other = createRef<Rect>();
      const last = createRef<Rect>();
      view.add(
        <Layout layout direction="row">
          <Rect ref={first} width={100} height={100} />
          <Rect ref={last} width={100} height={100} translate={[0, 20]} />
        </Layout>,
      );
      view.add(<Rect ref={other} size={50} x={400} />);

      const task = yield first().morphTo(other(), 1, linear);
      yield* waitFor(0.5);
      last().translate([0, 80]);
      yield* task;
      expectVector(last().translate(), 0, 80);
    }),
  );
});
