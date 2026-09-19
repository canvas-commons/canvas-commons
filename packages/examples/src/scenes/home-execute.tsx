import {Code, Layout, lines, makeScene2D, Rect} from '@canvas-commons/2d';
import {all, createRef, useScene, waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const v = useScene().variables;
  const code = createRef<Code>();
  const box = createRef<Rect>();

  view.add(
    <Layout>
      <Rect
        ref={box}
        fill={v.get('--cc-blue', '#89b4fa')}
        opacity={0.3}
        radius={8}
      />
      <Code
        ref={code}
        fontSize={30}
        code={
          'function bubble(a) {\n  for (let i = 0; i < a.length; i++)\n    for (let j = 0; j < a.length - 1; j++)\n      if (a[j] > a[j + 1])\n        [a[j], a[j + 1]] = [a[j + 1], a[j]];\n  return a;\n}'
        }
      />
    </Layout>,
  );

  function* highlight(i: number, duration = 0.18) {
    const bbox = code().getSelectionBBox(lines(i, i))[0];
    yield* all(
      box().size([bbox.width + 16, bbox.height + 8], duration),
      box().position(
        [bbox.x + bbox.width / 2, bbox.y + bbox.height / 2],
        duration,
      ),
    );
  }

  const a = [5, 3, 2, 4, 1];
  yield* highlight(0);
  for (let i = 0; i < a.length; i++) {
    yield* highlight(1);
    for (let j = 0; j < a.length - 1; j++) {
      yield* highlight(2);
      yield* highlight(3);
      if (a[j] > a[j + 1]) {
        [a[j], a[j + 1]] = [a[j + 1], a[j]];
        yield* highlight(4);
      }
    }
  }
  yield* highlight(5);
  yield* waitFor(0.6);
});
