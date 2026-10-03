import {Code, makeScene2D} from '@canvas-commons/2d';
import {createRef, useScene} from '@canvas-commons/core';

const WordsPerLine = 25;

function buildSource(lineCount: number, editedLine: number): string {
  return Array.from({length: lineCount}, (_, line) =>
    Array.from(
      {length: WordsPerLine},
      (_, word) => `w${word}${line === editedLine ? 'x' : ''}`,
    ).join(' '),
  ).join('\n');
}

export default makeScene2D(function* (view) {
  const lineCount = useScene().variables.get('lines', 200)();
  const code = createRef<Code>();

  view.add(
    <Code
      ref={code}
      fontFamily={'monospace'}
      fontSize={12}
      code={buildSource(lineCount, -1)}
    />,
  );

  yield* code().code(buildSource(lineCount, Math.floor(lineCount / 2)), 1);
});
