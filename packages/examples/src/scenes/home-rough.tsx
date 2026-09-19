import {Circle, makeScene2D, Rect} from '@canvas-commons/2d';
import {all, createRef, useScene, waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const v = useScene().variables;
  const rect = createRef<Rect>();
  const circle = createRef<Circle>();

  view.add(
    <>
      <Rect
        ref={rect}
        x={-180}
        size={200}
        radius={16}
        fill={v.get('--cc-peach', '#fab387')}
        stroke={v.get('--cc-text', '#cdd6f4')}
        lineWidth={4}
        rough
        roughness={2}
        roughFillStyle={'cross-hatch'}
        roughHachureGap={8}
      />
      <Circle
        ref={circle}
        x={180}
        size={200}
        fill={v.get('--cc-mauve', '#cba6f7')}
        stroke={v.get('--cc-text', '#cdd6f4')}
        lineWidth={4}
        rough
        roughness={1.5}
        roughFillStyle={'zigzag'}
      />
    </>,
  );

  yield* waitFor(0.3);
  yield* all(
    rect().roughness(5, 1).to(2, 1),
    circle().roughness(4, 1).to(1.5, 1),
  );
  yield* rect().rotation(8, 0.5).to(-8, 0.6).to(0, 0.4);
  yield* waitFor(0.4);
});
