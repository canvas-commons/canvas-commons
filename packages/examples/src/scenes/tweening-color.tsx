import {Circle, makeScene2D} from '@canvas-commons/2d';
import {Color, createRef, easeInOutCubic, tween} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const circle = createRef<Circle>();

  view.add(<Circle ref={circle} width={240} height={240} fill="#e13238" />);

  yield* tween(2, value => {
    circle().fill(
      Color.lerp(
        new Color('#e13238'),
        new Color('#e6a700'),
        easeInOutCubic(value),
      ),
    );
  });
});
