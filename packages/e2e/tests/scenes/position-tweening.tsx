import {Circle, Layout, Rect, makeScene2D} from '@canvas-commons/2d';
import {all, createRef} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const layout = createRef<Layout>();
  const rect = createRef<Rect>();
  const circle = createRef<Circle>();

  view.add(
    <>
      <Layout
        ref={layout}
        layout
        gap={20}
        padding={20}
        width={600}
        height={300}
      >
        <Rect ref={rect} grow={1} fill={'#ff6470'} radius={8} />
        <Circle ref={circle} size={100} fill={'#4299e1'} />
      </Layout>
    </>,
  );

  // Test layout tweening
  yield* layout().gap(100, 1.5);
  yield* layout().direction('column', 1.5);

  // Test rotation with position
  yield* all(rect().rotation(360, 2), circle().scale(1.5, 2));

  // Test complex transform
  yield* all(
    layout().rotation(45, 1.5),
    layout().scale(0.8, 1.5),
    layout().position([100, 100], 1.5),
  );

  yield;
});
