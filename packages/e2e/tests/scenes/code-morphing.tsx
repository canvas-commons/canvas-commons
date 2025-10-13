import {CODE, Code, LezerHighlighter, makeScene2D} from '@canvas-commons/2d';
import {createRef, waitFor} from '@canvas-commons/core';
import {parser} from '@lezer/javascript';

export default makeScene2D(function* (view) {
  const codeRef = createRef<Code>();

  view.add(
    <Code
      ref={codeRef}
      highlighter={new LezerHighlighter(parser)}
      fontSize={36}
      code={CODE`const x = 10;
const y = 20;`}
    />,
  );

  yield* waitFor(0.5);

  // Test modify operation
  yield* codeRef().code(
    CODE`const x = 100;
const y = 20;`,
    1.5,
  );

  yield* waitFor(0.5);

  // Test add operation
  yield* codeRef().code(
    CODE`const x = 100;
const y = 20;
const sum = x + y;
console.log(sum);`,
    1.5,
  );

  yield* waitFor(0.5);

  // Test remove operation
  yield* codeRef().code(
    CODE`const x = 100;
console.log(sum);`,
    1.5,
  );

  yield* waitFor(0.5);
  yield;
});
