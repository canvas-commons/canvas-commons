import {Rect, makeScene2D} from '@canvas-commons/2d';
import {finishScene, waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  view.add(<Rect width={'100%'} height={'100%'} fill={'red'} />);

  finishScene();
  yield* waitFor(1);
});
