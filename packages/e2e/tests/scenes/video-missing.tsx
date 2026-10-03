import {Img, Rect, Video, makeScene2D} from '@canvas-commons/2d';
import {waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  view.add(<Rect width={400} height={400} x={-400} fill={'lime'} />);
  view.add(<Video src={'/missing.mp4'} />);
  view.add(<Video src={'/missing-loop.mp4'} loop />);
  view.add(<Img src={'/missing.png'} x={400} />);

  yield* waitFor(0.2);
});
