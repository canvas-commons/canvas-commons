import {Circle, makeScene2D} from '@canvas-commons/2d';
import {createRef, easeInOutCubic, map, tween} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const circle = createRef<Circle>();

  view.add(
    <Circle ref={circle} x={-300} width={240} height={240} fill="#e13238" />,
  );

  yield* tween(2, value => {
    circle().position.x(map(-300, 300, easeInOutCubic(value)));
  });
});
