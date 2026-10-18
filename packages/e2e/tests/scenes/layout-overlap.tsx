import {Layout, Rect, makeScene2D} from '@canvas-commons/2d';
import {
  ThreadGenerator,
  createRef,
  createSignal,
  linear,
  waitFor,
} from '@canvas-commons/core';

const BOX = {width: 100, height: 100};

function box(fill: string) {
  return <Rect {...BOX} fill={fill} />;
}

export default makeScene2D(function* (view) {
  view.add(<Rect size={[1920, 1080]} fill="#ffffff" />);

  const overlapping = createRef<Layout>();
  const overlappingFirst = createRef<Rect>();
  const sequential = createRef<Layout>();
  const sequentialFirst = createRef<Rect>();
  view.add(
    <Layout ref={overlapping} layout direction="row" gap={20} y={-400}>
      <Rect ref={overlappingFirst} {...BOX} fill="#ff0000" />
    </Layout>,
  );
  view.add(
    <Layout ref={sequential} layout direction="row" gap={20} y={-250}>
      <Rect ref={sequentialFirst} {...BOX} fill="#ff0000" />
    </Layout>,
  );

  const percentParent = createRef<Rect>();
  view.add(
    <Rect
      ref={percentParent}
      layout
      direction="row"
      stroke="#000000"
      lineWidth={4}
      y={0}
    >
      <Rect width={200} height={60} fill="#ff8800" />
      <Rect width="50%" height={60} fill="#aa00aa" />
    </Rect>,
  );
  view.add(
    <Rect
      layout
      direction="row"
      stroke="#000000"
      lineWidth={4}
      width={400}
      y={150}
    >
      <Rect width={200} height={60} fill="#ff8800" />
      <Rect width="50%" height={60} fill="#aa00aa" />
    </Rect>,
  );

  const anchored = createRef<Layout>();
  view.add(
    <Layout
      ref={anchored}
      layout
      direction="row"
      gap={20}
      width={400}
      x={-500}
      y={-100}
    >
      <Rect {...BOX} fill="#ff0000" />
      <Rect {...BOX} fill="#0000ff" />
    </Layout>,
  );

  const bound = createRef<Layout>();
  const follower = createRef<Rect>();
  const offset = createSignal(-50);
  view.add(
    <Layout ref={bound} x={-700} y={300}>
      <Rect ref={follower} size={60} y={offset} fill="#00aaaa" />
    </Layout>,
  );

  const busy = createRef<Layout>();
  const widened = createRef<Rect>();
  view.add(
    <Layout ref={busy} layout direction="row" x={500} y={300}>
      <Rect ref={widened} {...BOX} fill="#888888" />
      <Rect {...BOX} fill="#0000ff" />
    </Layout>,
  );

  const morphedFirst = createRef<Rect>();
  const morphedSecond = createRef<Rect>();
  const firstTarget = createRef<Rect>();
  const secondTarget = createRef<Rect>();
  view.add(
    <Layout layout direction="row" gap={20} y={420}>
      <Rect ref={morphedFirst} size={60} fill="#888888" />
      <Rect ref={morphedSecond} size={60} fill="#888888" />
      <Rect size={60} fill="#00aa00" />
    </Layout>,
  );
  view.add(
    <Rect ref={firstTarget} size={60} x={-300} y={440} fill="#888888" />,
  );
  view.add(
    <Rect ref={secondTarget} size={60} x={-300} y={510} fill="#888888" />,
  );

  yield (function* (): ThreadGenerator {
    const first = yield bound().editLayout(1, () => follower().x(100));
    yield* waitFor(0.5);
    yield* bound().editLayout(1, () => follower().x(300));
    yield* first;
    offset(50);
  })();
  yield (function* (): ThreadGenerator {
    const edit = yield busy().editLayout(1, node => node.gap(100), linear);
    yield* waitFor(0.5);
    busy().freezeLayout();
    yield* edit;
    widened().width(300);
  })();
  yield morphedFirst().morphTo(firstTarget(), 1, linear);
  yield morphedSecond().morphTo(secondTarget(), 2, linear);

  yield anchored().insert(box('#00aa00'), 1, 2, linear);
  yield overlapping().insert(box('#00aa00'), 1, 0.6);
  yield* waitFor(0.3);
  yield* overlapping().insert(box('#0000ff'), 1, 0.6);

  yield* sequential().insert(box('#00aa00'), 1, 0.6);
  yield* sequential().insert(box('#0000ff'), 1, 0.6);

  yield* waitFor(1);
  overlappingFirst().width(300);
  sequentialFirst().width(300);
  yield* waitFor(0.5);

  yield* percentParent().width(400, 1);
  yield* waitFor(0.5);
});
