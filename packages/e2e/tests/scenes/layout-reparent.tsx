import {Layout, Rect, makeScene2D} from '@canvas-commons/2d';
import {all, createRef, linear, waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  view.add(<Rect size={[1920, 1080]} fill="#ffffff" />);

  const outGroup = createRef<Layout>();
  const out = createRef<Rect>();
  view.add(
    <Layout ref={outGroup} x={-700} y={-350} rotation={20}>
      <Rect ref={out} size={90} fill="#ff0000" />
    </Layout>,
  );

  const nestGroup = createRef<Layout>();
  const nestParent = createRef<Rect>();
  const nested = createRef<Rect>();
  view.add(
    <Layout ref={nestGroup} x={100} y={-400}>
      <Rect ref={nested} size={50} x={200} fill="#0000ff" />
      <Rect ref={nestParent} size={100} x={-200} fill="#888888" />
    </Layout>,
  );

  const stillGroup = createRef<Layout>();
  const stillParent = createRef<Rect>();
  const still = createRef<Rect>();
  view.add(
    <Layout ref={stillGroup} x={-500}>
      <Rect ref={still} size={50} x={200} fill="#00aaaa" />
      <Rect ref={stillParent} size={100} x={-200} fill="#888888" />
    </Layout>,
  );

  const flexGroup = createRef<Layout>();
  const row = createRef<Layout>();
  const intoFlex = createRef<Rect>();
  view.add(
    <Layout ref={flexGroup} y={350}>
      <Rect ref={intoFlex} size={100} x={-300} scale={2} fill="#aa00aa" />
      <Layout ref={row} layout x={350}>
        <Rect size={0} />
      </Layout>
    </Layout>,
  );

  yield* all(
    outGroup().editLayout(
      1,
      () => {
        out().reparent(view);
        out().position.view([-400, -350]);
      },
      linear,
    ),
    nestGroup().editLayout(
      1,
      () => {
        nested().reparent(nestParent());
        nestParent().position.view([300, -300]);
        nested().position([30, 0]);
      },
      linear,
    ),
    stillGroup().editLayout(
      1,
      () => {
        still().reparent(stillParent());
        stillParent().position.view([-400, 0]);
        still().position([100, 0]);
      },
      linear,
    ),
    flexGroup().editLayout(1, () => intoFlex().reparent(row()), linear),
  );
  yield* waitFor(0.5);
});
