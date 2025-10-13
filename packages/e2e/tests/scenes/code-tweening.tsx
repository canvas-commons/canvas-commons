import {CODE, Code, LezerHighlighter, makeScene2D} from '@canvas-commons/2d';
import {
  createRef,
  createSignal,
  waitFor,
  waitUntil,
} from '@canvas-commons/core';
import {parser} from '@lezer/javascript';

export default makeScene2D(function* (view) {
  const codeRef = createRef<Code>();
  const value = createSignal(5);

  view.add(
    <Code
      ref={codeRef}
      highlighter={new LezerHighlighter(parser)}
      fontSize={36}
      code={CODE`\
const x = ${() => value().toString()};
const y = x * 2; // ${() => (value() * 2).toString()}
console.log(y);`}
    />,
  );

  yield* waitUntil('initial');
  yield value(20, 2);

  yield* waitFor(1);
  yield* waitUntil('mid');
  yield* waitFor(2);
  yield* waitUntil('final');
  yield;
});
