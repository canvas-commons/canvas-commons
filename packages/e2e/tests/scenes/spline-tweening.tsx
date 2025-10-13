import {Circle, Spline, makeScene2D} from '@canvas-commons/2d';
import {
  createRef,
  createSignal,
  easeInOutCubic,
  waitFor,
} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const spline = createRef<Spline>();
  const circle = createRef<Circle>();
  const progress = createSignal(0);

  // Create a spline path
  view.add(
    <>
      <Spline
        ref={spline}
        lineWidth={4}
        stroke="white"
        smoothness={0.4}
        points={[
          [-400, 0],
          [-200, -300],
          [0, 0],
          [200, -300],
          [400, 0],
        ]}
      />
      <Circle
        ref={circle}
        size={40}
        fill="#4299e1"
        position={() => {
          const point = spline().getPointAtPercentage(progress());
          return point.position;
        }}
      />
    </>,
  );

  yield* waitFor(0.5);

  // Animate circle along spline
  yield* progress(1, 3, easeInOutCubic);

  yield* waitFor(0.5);

  // Modify spline points while circle follows
  yield* spline().points(
    [
      [-400, 200],
      [-200, -100],
      [0, 200],
      [200, -100],
      [400, 200],
    ],
    2,
  );

  yield* waitFor(0.5);

  // Reset and animate again
  progress(0);
  yield* progress(1, 2, easeInOutCubic);

  yield;
});
