import {
  Code,
  LezerHighlighter,
  lines,
  makeScene2D,
  word,
} from '@canvas-commons/2d';
import {createRef, waitFor} from '@canvas-commons/core';
import {parser} from '@lezer/javascript';

export default makeScene2D(function* (view) {
  const codeRef = createRef<Code>();

  view.add(
    <Code
      highlighter={new LezerHighlighter(parser)}
      ref={codeRef}
      fontSize={32}
      code={`function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}`}
    />,
  );

  // Test highlighting a full line
  yield* codeRef().selection(lines(1), 1);
  yield* waitFor(0.5);

  // Test highlighting a word
  yield* codeRef().selection(word(0, 9, 9), 1);
  yield* waitFor(0.5);

  // Test highlighting multiple ranges
  yield* codeRef().selection([word(2, 9, 9), word(2, 23, 9)], 1);
  yield* waitFor(0.5);

  // Clear selection
  yield* codeRef().selection([], 1);
  yield;
});
