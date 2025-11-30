import {Rect, makeScene2D} from '@canvas-commons/2d';
import {
  all,
  createRef,
  Direction,
  easeInExpo,
  easeInOutCubic,
  easeInOutExpo,
  waitFor,
  waitUntil,
} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const rect = createRef<Rect>();

  view.add(
    <Rect ref={rect} size={320} radius={80} smoothCorners fill={'#f3303f'} />,
  );

  yield* waitUntil('rect');
  
  // Test fadeIn
  yield* rect().fadeIn(1);
  yield* waitFor(0.5);
  
  // Test fadeOut
  yield* rect().fadeOut(1);
  yield* waitFor(0.5);
  
  // Test pushIn
  yield* rect().pushIn(1, Direction.Left, 200, easeInOutCubic);
  yield* waitFor(0.5);
  
  // Test pushOut
  yield* rect().pushOut(1, Direction.Right, 200, easeInOutCubic);
  yield* waitFor(0.5);
  
  // Test popIn
  rect().opacity(0);
  yield* rect().popIn(1, 0.8, easeInOutCubic);
  yield* waitFor(0.5);

  // Test popOut
  yield* rect().popOut(1, 0.8, easeInOutCubic);
  yield* waitFor(0.5);

  // Test squashIn (from left)
  rect().opacity(1);
  yield* rect().squashIn(1, Direction.Left, easeInOutCubic);
  yield* waitFor(0.5);

  // Test squashOut (to right)
  yield* rect().squashOut(1, Direction.Right, easeInOutCubic);
  yield* waitFor(0.5);

  // Test squashInOut (from top, out to bottom)
  rect().opacity(1);
  yield* rect().squashInOut(1.5, Direction.Top, Direction.Bottom, easeInOutCubic);
  yield* waitFor(0.5);
  
  // Original ripple test
  rect().opacity(1);
  yield* rect().scale(2, 1, easeInOutExpo).to(1, 0.6, easeInExpo);
  rect().fill('#ffa56d');
  yield* all(rect().ripple(1));
  yield* waitFor(0.3);
});
