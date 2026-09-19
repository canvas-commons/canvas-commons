import {Code, makeScene2D, replace} from '@canvas-commons/2d';
import {createRef, waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const code = createRef<Code>();
  view.add(<Code ref={code} fontSize={40} code={'const radius = 10;'} />);

  yield* waitFor(0.4);
  yield* code().code.edit(1.2)`const radius = ${replace('10', '40')};`;
  yield* waitFor(0.4);
  yield* code().code.append(1)`
const area = 3.14 * radius * radius;`;
  yield* waitFor(0.6);
});
