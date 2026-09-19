import {Circle, Line, Txt, makeScene2D} from '@canvas-commons/2d';
import {Vector2, createSignal, waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const radius = createSignal(3);
  const area = createSignal(() => Math.PI * radius() * radius());

  const scale = 100;
  const textStyle = {
    fontWeight: 700,
    fontSize: 56,
    anchorY: -1,
    padding: 20,
    cache: true,
  };

  view.add(
    <>
      <Circle
        width={() => radius() * scale * 2}
        height={() => radius() * scale * 2}
        fill={'#e13238'}
      />
      <Line
        points={[Vector2.zero, () => Vector2.right.scale(radius() * scale)]}
        lineDash={[20, 20]}
        startArrow
        endArrow
        endOffset={8}
        lineWidth={8}
        stroke={'#242424'}
      />
      <Txt
        text={() => `r = ${radius().toFixed(2)}`}
        x={() => (radius() * scale) / 2}
        fill={'#242424'}
        {...textStyle}
      />
      <Txt
        text={() => `A = ${area().toFixed(2)}`}
        y={() => radius() * scale}
        fill={'#e13238'}
        {...textStyle}
      />
    </>,
  );

  yield* radius(4, 2).to(3, 2);
  yield* waitFor(1);
});
