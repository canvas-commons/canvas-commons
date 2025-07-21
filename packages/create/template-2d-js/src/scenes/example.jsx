import {Circle, makeScene2D} from '@canvas-commons/2d';
import {createRef} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  // Create your animations here

  const circle = createRef();

  view.add(<Circle ref={circle} size={320} fill={'lightseagreen'} />);

  yield* circle().scale(2, 2).to(1, 2);
});
