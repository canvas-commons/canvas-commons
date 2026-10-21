import {Layout, Rect, makeScene2D} from '@canvas-commons/2d';
import {all, createRef, waitFor} from '@canvas-commons/core';
import {
  Pill,
  Tile,
  createPillRow,
  moveOffset,
} from 'motion-canvas-fixture-library';

export default makeScene2D(function* (view) {
  const pill = createRef<Pill>();
  const tile = createRef<Tile>();
  const row = createPillRow();

  view.add(
    <>
      <Rect width={1920} height={2} fill="#555" />
      <Rect width={2} height={1080} fill="#555" />
      <Pill ref={pill} fill="#e13238" position={[-400, -250]} />
      <Tile ref={tile} position={[400, -250]}>
        <Rect size={60} fill="#68abdf" />
      </Tile>
      <Layout position={[0, 250]}>{row}</Layout>
    </>,
  );
  for (const child of row.children()) {
    if (child instanceof Rect) {
      child.fill('#99c47a');
    }
  }

  yield* waitFor(0.5);
  yield* all(moveOffset(pill()), tile().offset([1, 1], 1));
  yield* waitFor(0.5);
});
