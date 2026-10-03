import {Rect, makeScene2D} from '@canvas-commons/2d';

export default makeScene2D(function* (view) {
  view.add(<Rect width={'100%'} height={'100%'} fill={'blue'} />);

  for (let frame = 0; frame < 10; frame++) {
    yield;
  }
});
