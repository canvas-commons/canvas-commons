import {Circle, Line, Txt, makeScene2D} from '@canvas-commons/2d';
import {all, createRef, waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  view.fill('#0d1117');

  const ring = createRef<Circle>();
  const wave = createRef<Line>();
  const ringText = createRef<Txt>();
  const waveText = createRef<Txt>();
  const ligature = createRef<Txt>();
  const arabic = createRef<Txt>();

  view.add(
    <>
      <Txt
        ref={arabic}
        y={-380}
        textPath={'M -360 0 Q 0 -120 360 0'}
        pathSplit={'word'}
        textDirection={'rtl'}
        textAlign={'center'}
        fontFamily={'FreeSerif'}
        fontSize={80}
        fill={'#ffa657'}
      >
        السلام
      </Txt>

      <Circle ref={ring} x={-480} size={360} stroke={'#30363d'} lineWidth={2} />
      <Txt
        ref={ringText}
        x={-480}
        textPath={ring}
        textAlign={'center'}
        fontFamily={'sans-serif'}
        fontWeight={700}
        fontSize={52}
        fill={'#f5f5f5'}
      >
        CANVAS · COMMONS
      </Txt>

      <Line
        ref={wave}
        x={440}
        points={[
          [-320, 0],
          [-110, -130],
          [110, 130],
          [320, 0],
        ]}
        stroke={'#30363d'}
        lineWidth={2}
      />
      <Txt
        ref={waveText}
        x={440}
        textPath={wave}
        fontFamily={'sans-serif'}
        pathAlign={'smooth'}
        fontSize={48}
        fill={'#7ee787'}
      >
        riding the curve riding the curve riding the curve
      </Txt>

      <Txt
        ref={ligature}
        y={400}
        textPath={'M -640 0 Q 0 -150 640 0'}
        pathSplit={'word'}
        textAlign={'center'}
        fontFamily={'serif'}
        fontSize={56}
        fill={'#d2a8ff'}
      >
        office waffle affluent
      </Txt>
    </>,
  );

  yield* waitFor(0.3);
  yield* all(
    ring().rotation(360, 2),
    waveText().pathOffset(-300, 2),
    wave().points(
      [
        [-320, 0],
        [-110, 130],
        [110, -130],
        [320, 0],
      ],
      2,
    ),
  );
  yield* waitFor(0.3);
});
