import {
  Circle,
  Grid,
  Layout,
  Rect,
  Txt,
  contrast,
  makeScene2D,
  saturate,
} from '@canvas-commons/2d';
import {createSignal, map, waitFor} from '@canvas-commons/core';

// Filter chain ordering: applying saturate before contrast produces a
// different result than applying contrast before saturate. Same input,
// reversed chain, divergent output.
// Adapted from packages/docs/docs/advanced/code/filters-and-effects/filters-order.tsx.
export default makeScene2D(function* (view) {
  view.fontFamily('monospace').fontSize(20).fill('#141414');
  view.add(<Rect size={5000} fill={'#111'} />);

  const saturateValue = createSignal(1);
  const contrastValue = createSignal(1);

  view.add(
    <Layout x={-300} direction={'column'} alignItems={'center'} gap={20} layout>
      <Circle
        size={150}
        fill={'#99c47a'}
        filters={[saturate(saturateValue), contrast(contrastValue)]}
      />
      <Layout direction={'row'} gap={20}>
        <Txt fill={'#ffa'}>saturate</Txt>
        <Txt fill={'#aff'}>contrast</Txt>
      </Layout>
    </Layout>,
  );

  view.add(
    <Layout x={300} direction={'column'} alignItems={'center'} gap={20} layout>
      <Circle
        size={150}
        fill={'#99c47a'}
        filters={[contrast(contrastValue), saturate(saturateValue)]}
      />
      <Layout direction={'row'} gap={20}>
        <Txt fill={'#aff'}>contrast</Txt>
        <Txt fill={'#ffa'}>saturate</Txt>
      </Layout>
    </Layout>,
  );

  view.add(
    <Layout y={-10}>
      <Grid size={200} stroke={'gray'} lineWidth={1} spacing={40} />
      <Rect size={200} stroke={'gray'} lineWidth={2} />
      <Txt fill={'#ffa'} text={'saturate'} rotation={-90} x={-130} />
      <Txt fill={'#aff'} text={'contrast'} y={130} />
      <Circle
        x={() => map(-100, 100, (contrastValue() - 1) / 4)}
        y={() => map(100, -100, (saturateValue() - 1) / 4)}
        fill={'white'}
        size={20}
      />
    </Layout>,
  );

  yield* saturateValue(5, 2);
  yield* contrastValue(5, 2);
  yield* waitFor(1);
  yield* saturateValue(1, 2);
  yield* contrastValue(1, 2);
});
