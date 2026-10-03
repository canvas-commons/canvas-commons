import {Rect, makeScene2D} from '@canvas-commons/2d';
import {useScene, waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const color = useScene().variables.get('color', 'red');
  view.add(<Rect width={'100%'} height={'100%'} fill={color} />);

  yield* waitFor(1);
});
