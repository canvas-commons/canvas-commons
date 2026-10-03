import {Rect, makeScene2D} from '@canvas-commons/2d';
import {fadeTransition} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  view.add(<Rect width={'100%'} height={'100%'} fill={'blue'} />);

  yield* fadeTransition(0.3);
  for (let frame = 0; frame < 5; frame++) {
    yield;
  }
});
