import {Circle, makeScene2D} from '@canvas-commons/2d';
import {all, createRef, useScene, waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const v = useScene().variables;
  const ball = createRef<Circle>();
  view.add(
    <Circle ref={ball} size={160} fill={v.get('--cc-red', '#f38ba8')} />,
  );

  yield* ball().scale(2, 1);
  yield* waitFor(0.3);
  yield* all(ball().scale(1, 1), ball().position.y(140, 1));
  yield* ball().fill(v.get('--cc-green', '#a6e3a1'), 1);
  yield* waitFor(0.5);
});
