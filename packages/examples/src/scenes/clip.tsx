import {Circle, makeScene2D, Rect} from '@canvas-commons/2d';
import {waitFor} from '@canvas-commons/core';

// Curved (Circle) and rectangular (Rect) clips, so the exporter has to emit a
// clipPath for each shape kind.
export default makeScene2D(function* (view) {
  view.fill('#141414');

  view.add(
    <Circle size={300} x={-220} clip fill={'#222'}>
      <Rect width={600} height={90} fill={'#e13238'} rotation={28} />
      <Rect width={600} height={90} fill={'#68abdf'} rotation={-28} y={90} />
    </Circle>,
  );

  view.add(
    <Rect size={300} x={220} radius={48} clip fill={'#222'}>
      <Circle size={520} stroke={'#e6a700'} lineWidth={40} />
      <Rect width={600} height={60} fill={'#83a598'} y={-40} />
    </Rect>,
  );

  yield* waitFor(0.1);
});
