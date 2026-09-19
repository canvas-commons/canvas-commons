import {fade, Latex, makeScene2D} from '@canvas-commons/2d';
import {createRef, useScene, waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const v = useScene().variables;
  const tex = createRef<Latex>();
  view.add(
    <Latex
      ref={tex}
      fontSize={52}
      fill={v.get('--cc-text', '#cdd6f4')}
      tex="1 + 2 + \cdots + n"
    />,
  );

  yield* waitFor(0.4);
  yield* tex().edit(0.9)`1 + 2 + \cdots + n${fade('', ' = \\frac{n(n+1)}{2}')}`;
  yield* waitFor(0.3);
  yield* tex().replace(
    0.9,
    fade('n', '100'),
    fade('n', '100'),
    fade('n', '100'),
  );
  yield* waitFor(0.5);
  yield* tex().replace(
    0.9,
    fade('100', 'n'),
    fade('100', 'n'),
    fade('100', 'n'),
  );
  yield* waitFor(0.4);
});
