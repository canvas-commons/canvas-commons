import {Rect, makeScene2D} from '@canvas-commons/2d';
import {all, createRef, waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const parentRect = createRef<Rect>();
  const childRect = createRef<Rect>();

  view.add(
    <>
      <Rect
        ref={parentRect}
        width={200}
        height={200}
        fill={'blue'}
        position={[100, 50]}
        scale={2}
        rotation={30}
      />
      <Rect
        ref={childRect}
        width={100}
        height={100}
        fill={'red'}
        position={[50, 25]}
        scale={1.5}
        rotation={15}
      />
    </>,
  );

  parentRect().add(childRect());

  yield* waitFor(1);

  yield* all(
    childRect().position.abs([300, 200], 2),
    parentRect().scale.abs([3, 3], 2),
    parentRect().rotation.abs(90, 2),
  );

  yield* waitFor(0.5);

  yield* childRect().position.abs.x(400, 1); // Animate only x to absolute 400
  yield* childRect().position.abs.y(100, 1); // Animate only y to absolute 100

  yield* waitFor(1);

  yield* all(
    childRect().position.relativeTo(parentRect())([100, 100], 2),
    childRect().scale.relativeTo(parentRect())([2, 2], 2),
    childRect().rotation.relativeTo(parentRect())(45, 2),
  );

  yield* all(
    childRect().position.relativeTo(parentRect()).x(150, 1),
    childRect().position.relativeTo(parentRect()).y(50, 1),
    childRect().scale.relativeTo(parentRect()).x(1.5, 1),
    childRect().scale.relativeTo(parentRect()).y(0.8, 1),
  );

  yield* waitFor(1);

  yield* all(
    childRect().position.view([400, 300], 2),
    childRect().scale.view([1, 1], 2),
    childRect().rotation.view(0, 2),
  );

  yield* waitFor(1);

  yield* all(
    childRect().position.local([0, 0], 2),
    childRect().scale.local([1, 1], 2),
    childRect().rotation.local(0, 2),
  );
});
