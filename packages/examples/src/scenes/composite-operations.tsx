import {Grid, Node, Txt, makeScene2D} from '@canvas-commons/2d';
import {createRef, linear} from '@canvas-commons/core';

// Composite-operation ordering: the mask layer is drawn first, then the
// value layer uses `source-in` so it shows up only where the mask exists.
// A striped Grid as the value layer makes the clip-to-shape obvious — a
// solid fill would just look like colored text.
// Adapted from packages/docs/docs/advanced/code/filters-and-effects/source-in-example.tsx
// and masking-visualized-source-in.tsx.
export default makeScene2D(function* (view) {
  view.fill('#141414');

  const mask = createRef<Txt>();
  const value = createRef<Grid>();

  view.add(
    <Node cache>
      <Txt
        ref={mask}
        fontSize={320}
        fontWeight={700}
        fontFamily={'"JetBrains Mono", monospace'}
        fill={'white'}
      >
        MASK
      </Txt>
      <Grid
        ref={value}
        width={1600}
        height={600}
        spacing={20}
        lineWidth={4}
        stroke={'#e13238'}
        compositeOperation={'source-in'}
      />
    </Node>,
  );

  yield mask().rotation(360, 4, linear);
  yield* value().x(-200, 1.5).to(200, 1.5);
});
