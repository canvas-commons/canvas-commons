import {Layout, Rect, makeScene2D} from '@canvas-commons/2d';
import {
  all,
  createRef,
  easeInExpo,
  easeInOutExpo,
  waitFor,
  waitUntil,
} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const rect = createRef<Rect>();
  const rect2 = createRef<Rect>();
  const rect3 = createRef<Rect>();
  const layout1 = createRef<Layout>();
  const layout2 = createRef<Layout>();

  view.add(
    <Rect ref={rect} size={320} radius={80} smoothCorners fill={'#f3303f'} />,
  );

  view.add(
    <Layout x={300} ref={layout1}>
      <Rect size={200} ref={rect2} radius={50} fill="#0066ff" />
      <Layout x={-100} ref={layout2}>
        <Rect size={200} ref={rect3} radius={50} fill="#00ff66" />
      </Layout>
    </Layout>,
  );

  yield* waitUntil('rect');
  yield* rect().scale(2, 1, easeInOutExpo).to(1, 0.6, easeInExpo);
  rect().fill('#ffa56d');
  yield* rect2().position.abs(150, 1);
  yield* rect3().top.view.x(0, 1);
  yield* all(rect().ripple(1));
  yield* waitFor(0.3);
});
