import {cancel, waitFor} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {lines} from '../../code/CodeRange';
import {Code} from '../Code';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {recordingTextContext} from './recordingTextContext';
import {CHAR_WIDTH, add} from './sceneFixtures';

const Source = `\
const alpha = 1;
const beta = 2;
const gamma = 3;`;

/** The alpha of each drawn glyph as `char@x,y:alpha`, in drawing order. */
function glyphAlphas(node: Code): string[] {
  const {calls, context} = recordingTextContext();
  node.render(context);
  const glyphs: string[] = [];
  for (const call of calls) {
    [...call.text].forEach((char, i) => {
      const x = (call.penX + i * CHAR_WIDTH).toFixed(3);
      glyphs.push(
        `${char}@${x},${call.penY.toFixed(3)}:${call.globalAlpha.toFixed(4)}`,
      );
    });
  }
  return glyphs.sort();
}

function node(selection = lines(0, Infinity)) {
  const code = new Code({code: Source, selection});
  add(code);
  return code;
}

describe('Code selection tween', () => {
  mockScene2D();
  mockTextContext(CHAR_WIDTH);

  it(
    'draws a cancelled tween like a node that was never tweened',
    generatorTest(function* () {
      const code = node();
      const task = yield code.selection(lines(1), 1);
      yield* waitFor(0.5);
      expect(glyphAlphas(code)).not.toEqual(glyphAlphas(node(lines(1))));
      cancel(task);
      yield* waitFor(0.1);
      expect(glyphAlphas(code)).toEqual(glyphAlphas(node(lines(1))));
    }),
  );

  it(
    'starts a second tween where the first is drawn',
    generatorTest(function* () {
      const code = node();
      yield code.selection(lines(1), 1);
      yield* waitFor(0.3);
      const before = glyphAlphas(code);
      yield code.selection(lines(2), 1);
      expect(glyphAlphas(code)).toEqual(before);
      yield* waitFor(2);
      expect(glyphAlphas(code)).toEqual(glyphAlphas(node(lines(2))));
    }),
  );
});
