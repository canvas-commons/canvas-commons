import {Rect, makeScene2D} from '@canvas-commons/2d';
import {
  Color,
  ThreadGenerator,
  createRef,
  tween,
  usePlayback,
} from '@canvas-commons/core';

const FRAMES = 41;

export default makeScene2D(function* (view) {
  const playback = usePlayback();
  const {height} = view.size();
  const tweened = createRef<Rect>();
  const elapsed = createRef<Rect>();
  view.add(
    <>
      <Rect ref={tweened} width={'100%'} height={height / 2} y={-height / 4} />
      <Rect ref={elapsed} width={'100%'} height={height / 2} y={height / 4} />
    </>,
  );

  function shade(rect: Rect, progress: number) {
    rect.fill(Color.lerp('#000000', '#ffffff', Math.min(progress, 1)));
  }
  shade(tweened(), 0);
  shade(elapsed(), 0);

  let frames = 0;
  yield (function* (): ThreadGenerator {
    while (true) {
      yield;
      frames += playback.deltaTime * playback.fps;
      shade(elapsed(), frames / FRAMES);
    }
  })();

  yield* tween(playback.framesToSeconds(FRAMES), value =>
    shade(tweened(), value),
  );
});
