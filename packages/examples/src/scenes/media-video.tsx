import {Video, makeScene2D} from '@canvas-commons/2d';
import {createRef} from '@canvas-commons/core';

import exampleMp4 from '@canvas-commons/examples/assets/example.mp4';

export default makeScene2D(function* (view) {
  const videoRef = createRef<Video>();

  view.add(<Video ref={videoRef} src={exampleMp4} />);

  videoRef().play();
  yield* videoRef().scale(1.25, 2).to(1, 2);
});
