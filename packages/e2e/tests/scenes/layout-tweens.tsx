import {Layout, Node, Rect, makeScene2D} from '@canvas-commons/2d';
import {all, createRef, linear, waitFor} from '@canvas-commons/core';

const BOX = {width: 60, height: 60};

export default makeScene2D(function* (view) {
  view.add(<Rect size={[1920, 1080]} fill="#ffffff" />);

  const freeGroup = createRef<Layout>();
  const free = createRef<Rect>();
  view.add(
    <Layout ref={freeGroup} x={-700} y={-300}>
      <Rect ref={free} {...BOX} x={-150} fill="#ff0000" />
    </Layout>,
  );

  const thawed = createRef<Layout>();
  const lifted = createRef<Rect>();
  view.add(
    <Layout ref={thawed} layout direction="row" gap={20} x={-200} y={-300}>
      <Rect {...BOX} fill="#888888" />
      <Rect ref={lifted} {...BOX} fill="#0000ff" />
      <Rect {...BOX} fill="#888888" />
    </Layout>,
  );

  const held = createRef<Layout>();
  view.add(
    <Rect layout padding={40} fill="#ff8800" x={400} y={-300}>
      <Layout ref={held} layout direction="row" gap={20}>
        <Rect {...BOX} fill="#888888" />
        <Rect {...BOX} fill="#888888" />
        <Rect {...BOX} fill="#888888" />
      </Layout>
    </Rect>,
  );

  const morphed = createRef<Rect>();
  const morphTarget = createRef<Rect>();
  view.add(
    <Layout layout direction="row" gap={20} x={-600} y={150}>
      <Rect ref={morphed} {...BOX} fill="#888888" />
      <Rect {...BOX} fill="#00aa00" translate={[0, 150]} />
    </Layout>,
  );
  view.add(<Rect ref={morphTarget} {...BOX} x={-300} y={150} fill="#888888" />);

  const moved = createRef<Rect>();
  const destination = createRef<Node>();
  const inserted = createRef<Node>();
  view.add(
    <Layout layout direction="row" gap={20} x={100} y={150}>
      <Rect {...BOX} fill="#888888" />
      <Rect ref={moved} {...BOX} position={[30, 40]} fill="#aa00aa" />
    </Layout>,
  );
  view.add(<Node ref={destination} x={500} y={0} rotation={30} scale={2} />);
  view.add(<Node ref={inserted} x={500} y={250} rotation={30} scale={2} />);
  inserted().insert(<Rect {...BOX} position={[30, 40]} fill="#aa00aa" />);

  thawed().freezeLayout();
  lifted().y(240);
  held().freezeLayout();
  held().direction('column');

  yield* all(
    freeGroup().editLayout(1, () => free().x(150), linear),
    thawed().thawLayout(1, linear),
    morphed().morphTo(morphTarget(), 1, linear),
    moved().transitionTo(destination(), 1, linear),
  );
  yield* waitFor(0.5);
});
