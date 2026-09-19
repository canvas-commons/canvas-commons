import {makeScene2D} from '@canvas-commons/2d';
import {createRef, waitFor} from '@canvas-commons/core';

import {Logo} from '../components/Logo';

export default makeScene2D(function* (view) {
  const logo = createRef<Logo>();

  view.add(<Logo ref={logo} size={640} />);

  yield logo().animate();
  yield* waitFor(4);
});
