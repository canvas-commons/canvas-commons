import {Circle, Layout, makeScene2D, Rect} from '@canvas-commons/2d';
import {createRef, useScene, waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const v = useScene().variables;
  const group = createRef<Layout>();
  const box = createRef<Rect>();
  const anchor = createRef<Circle>();

  view.add(
    <Layout ref={group} x={-220} y={-80} rotation={20}>
      <Rect
        ref={box}
        size={90}
        radius={12}
        fill={v.get('--cc-blue', '#89b4fa')}
      />
    </Layout>,
  );
  view.add(
    <Circle
      ref={anchor}
      x={300}
      y={140}
      size={40}
      fill={v.get('--cc-peach', '#fab387')}
    />,
  );

  yield* waitFor(0.3);
  yield* box().position.local([120, 0], 1); // within the rotated parent
  yield* box().position.view([0, 0], 1); // screen center, ignoring the parent
  yield* box().position.abs([-220, 160], 1); // world space
  yield* box().position.relativeTo(anchor())([-120, 0], 1); // beside the dot
  yield* waitFor(0.4);
});
