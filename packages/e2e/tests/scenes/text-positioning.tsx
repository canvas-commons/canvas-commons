import {Layout, Txt, makeScene2D} from '@canvas-commons/2d';
import {createRef, waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const txt = createRef<Txt>();
  const layout = createRef<Layout>();

  view.add(
    <>
      <Layout
        ref={layout}
        layout
        direction="column"
        gap={30}
        padding={40}
        width={800}
      >
        <Txt
          ref={txt}
          text="Left Aligned"
          fontSize={48}
          fill="white"
          textAlign="left"
          textWrap={true}
        />
        <Txt
          text="Center Aligned"
          fontSize={48}
          fill="white"
          textAlign="center"
          textWrap={true}
        />
        <Txt
          text="Right Aligned"
          fontSize={48}
          fill="white"
          textAlign="right"
          textWrap={true}
        />
      </Layout>
    </>,
  );

  yield* waitFor(0.5);

  // Test text alignment changes
  yield* txt().textAlign('center', 1);
  yield* waitFor(0.5);
  yield* txt().textAlign('right', 1);
  yield* waitFor(0.5);

  // Test text wrapping and positioning
  yield* txt().text(
    'This is a much longer text that should wrap within the container',
    1.5,
  );
  yield* waitFor(0.5);

  // Test layout changes affecting text position
  yield* layout().gap(100, 1.5);
  yield* waitFor(0.5);

  yield;
});
