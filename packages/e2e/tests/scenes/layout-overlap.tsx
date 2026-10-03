import {Layout, Rect, makeScene2D} from '@canvas-commons/2d';
import {createRef, waitFor} from '@canvas-commons/core';

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
