import {Layout, Rect, makeScene2D} from '@canvas-commons/2d';
import {createRef, waitFor} from '@canvas-commons/core';

const COLORS = [
  '#ff6470',
  '#ffc66d',
  '#99c47a',
  '#68abdf',
  '#b58fc2',
  '#ff9966',
];

const FRAME_FILL = '#1c1c22';
const FRAME_STROKE = '#ffffff22';

export default makeScene2D(function* (view) {
  const row = createRef<Layout>();
  const wrapping = createRef<Layout>();
  const rotated = createRef<Rect>();
  const dest = createRef<Layout>();

  view.add(
    <Layout layout direction="column" gap={30} alignItems="center">
      <Rect
        layout
        direction="row"
        padding={24}
        radius={16}
        fill={FRAME_FILL}
        stroke={FRAME_STROKE}
        lineWidth={2}
      >
        <Layout ref={row} layout direction="row" gap={20}>
          {COLORS.slice(0, 3).map(color => (
            <Rect width={100} height={100} fill={color} radius={12} />
          ))}
        </Layout>
      </Rect>

      <Rect
        layout
        direction="row"
        padding={20}
        radius={16}
        fill={FRAME_FILL}
        stroke={FRAME_STROKE}
        lineWidth={2}
      >
        <Layout
          ref={wrapping}
          layout
          direction="row"
          wrap="wrap"
          gap={16}
          width={520}
          alignItems="start"
          justifyContent="start"
        >
          {COLORS.slice(0, 4).map(color => (
            <Rect width={80} height={80} fill={color} radius={8} />
          ))}
        </Layout>
      </Rect>

      <Rect
        ref={rotated}
        rotation={-15}
        layout
        direction="row"
        gap={12}
        padding={20}
        radius={12}
        fill={FRAME_FILL}
        stroke={FRAME_STROKE}
        lineWidth={2}
      >
        {COLORS.slice(0, 3).map(color => (
          <Rect width={70} height={70} fill={color} radius={8} />
        ))}
      </Rect>

      <Rect
        layout
        direction="row"
        padding={20}
        radius={16}
        fill={FRAME_FILL}
        stroke={FRAME_STROKE}
        lineWidth={2}
        opacity={0.5}
      >
        <Layout ref={dest} layout direction="row" gap={20} height={100} />
      </Rect>
    </Layout>,
  );

  const fourth = createRef<Rect>();
  yield* row().insert(
    <Rect ref={fourth} width={100} height={100} fill={COLORS[3]} radius={12} />,
    1,
    0.6,
  );

  yield* row().add(
    <Rect width={100} height={100} fill={COLORS[4]} radius={12} />,
    0.6,
  );

  yield* waitFor(0.2);
  yield* fourth().remove(0.6);

  yield* waitFor(0.3);

  yield* wrapping().add(
    <Rect width={80} height={80} fill={COLORS[4]} radius={8} />,
    0.6,
  );
  yield* wrapping().add(
    <Rect width={80} height={80} fill={COLORS[5]} radius={8} />,
    0.6,
  );
  yield* wrapping().add(
    <Rect width={80} height={80} fill={COLORS[0]} radius={8} />,
    0.6,
  );

  yield* waitFor(0.3);

  yield* rotated().add(
    <Rect width={70} height={70} fill={COLORS[3]} radius={8} />,
    0.6,
  );
  yield* rotated().add(
    <Rect width={70} height={70} fill={COLORS[4]} radius={8} />,
    0.6,
  );

  yield* waitFor(0.3);

  const fromRotated = rotated().children()[0];
  yield* fromRotated.transitionTo(dest(), 0.6);

  yield* waitFor(0.3);

  yield* row().editLayout(0.6, n => {
    n.direction('column');
    n.alignItems('end');
  });
  yield* waitFor(0.2);
  yield* row().editLayout(0.6, n => {
    n.direction('row');
    n.alignItems('center');
  });

  yield* waitFor(0.3);

  const movable = row().children()[0];
  yield* movable.transitionTo(dest(), 0.6);
});
