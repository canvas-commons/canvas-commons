import {
  CODE,
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
      ref={codeRef}
      highlighter={new LezerHighlighter(parser)}
      fontSize={36}
      code={CODE`const name = "World";
console.log("Hello!");`}
    />,
  );

  yield* waitFor(0.5);

  // Replace first line with expanded version
  yield* codeRef().code.replace(
    lines(0),
    CODE`const firstName = "John";\nconst lastName = "Doe";\n`,
    1.5,
  );

  yield* waitFor(0.5);

  // Remove part of a line (word removal)
  yield* codeRef().code.remove(word(0, 6, 9), 1.5);

  yield* waitFor(0.5);

  // Replace a word
  yield* codeRef().code.replace(word(2, 16, 7), CODE`"Greetings"`, 1.5);

  yield* waitFor(0.5);

  // Remove entire line
  yield* codeRef().code.remove(lines(1), 1.5);

  yield* waitFor(0.5);
  yield;
});
