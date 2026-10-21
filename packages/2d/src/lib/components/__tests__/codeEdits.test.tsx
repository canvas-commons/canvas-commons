import {
  Color,
  ThreadGenerator,
  all,
  cancel,
  easeInOutCubic,
  waitFor,
} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {insert, remove, replace} from '../../code/CodeFragment';
import {CodeHighlighter} from '../../code/CodeHighlighter';
import {CodeRange, lines, word} from '../../code/CodeRange';
import {CODE} from '../../code/CodeScope';
import {defaultTokenize} from '../../code/CodeTokenizer';
import type {CodeTransitions} from '../../code/codeTransitions';
import {TypedTransitions} from '../../content/transitions';
import {Code} from '../Code';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {recordingTextContext} from './recordingTextContext';
import {CHAR_WIDTH, add, penX, timeAt} from './sceneFixtures';

/** Every visible glyph as `char@x,y:alpha`, in drawing order. */
function glyphs(node: Code): string[] {
  const {calls, context} = recordingTextContext();
  node.render(context);
  const glyphs: string[] = [];
  for (const call of calls) {
    if (call.globalAlpha <= 0) continue;
    [...call.text].forEach((char, i) => {
      const x = (call.penX + i * CHAR_WIDTH).toFixed(3);
      const y = call.penY.toFixed(3);
      const alpha = call.globalAlpha.toFixed(4);
      const fill = new Color(call.fillStyle).serialize();
      glyphs.push(`${char}@${x},${y}:${alpha}:${fill}`);
    });
  }
  return glyphs.sort();
}

function alphaOf(node: Code, char: string): number[] {
  const {calls, context} = recordingTextContext();
  node.render(context);
  return calls
    .filter(call => call.text.includes(char))
    .map(call => call.globalAlpha);
}

const Source = `\
const alpha = 1;
const beta = 2;
const gamma = 3;`;

/**
 * Start `second` 30% into `first` and expect the picture not to change in the
 * frame the second edit starts.
 */
function expectContinuous(
  first: (code: Code) => ThreadGenerator,
  second: (code: Code) => ThreadGenerator,
  at = 0.3,
  highlighter: CodeHighlighter<string> | null = null,
) {
  return generatorTest(function* () {
    const code = new Code({code: Source, highlighter});
    add(code);
    yield first(code);
    yield* waitFor(at);
    const target = code.parsed();
    const before = glyphs(code);
    yield second(code);
    expect(code.parsed()).not.toBe(target);
    expect(glyphs(code)).toEqual(before);
    yield* waitFor(2);
    expect(code.code.context.motion.entries.size()).toBe(0);
    expect(glyphs(code)).toEqual(glyphs(atRest(code.parsed(), highlighter)));
  });
}

/** The text of `range` in `lines`. */
function slice(lines: readonly string[], [from, to]: CodeRange): string {
  return lines
    .join('\n')
    .split('\n')
    .map((line, row) =>
      row < from[0] || row > to[0]
        ? ''
        : line.slice(
            row === from[0] ? from[1] : 0,
            row === to[0] ? to[1] : undefined,
          ) + (row < to[0] ? '\n' : ''),
    )
    .join('');
}

/** Colors code inside double quotes, so a quote recolors the code after it. */
const QuoteHighlighter: CodeHighlighter<string> = {
  initialize: () => true,
  prepare: code => code,
  highlight(index, code) {
    const quotes = code.slice(0, index).split('"').length - 1;
    return {color: quotes % 2 ? '#ff0000' : '#00ff00', skipAhead: 1};
  },
  tokenize: defaultTokenize,
};

/** A node that shows `source` without having been edited. */
function atRest(
  source: string,
  highlighter: CodeHighlighter<string> | null = null,
): Code {
  const code = new Code({code: source, highlighter});
  add(code);
  return code;
}

describe('Code edits', () => {
  mockScene2D();
  mockTextContext(CHAR_WIDTH, () => ({ascent: 8, descent: 2}));

  it(
    'starts a second edit on a disjoint range where the code is drawn',
    expectContinuous(
      code => code.code.replace(word(0, 6, 5), 'longerName', 1),
      code => code.code.insert([2, 0], '// third\n', 1),
    ),
  );

  it(
    'starts a second edit on an overlapping range where the code is drawn',
    expectContinuous(
      code => code.code.replace(word(1, 6, 4), 'delta', 1),
      code =>
        code.code.replace(
          [
            [0, 10],
            [1, 9],
          ],
          'x',
          1,
        ),
    ),
  );

  it(
    'starts a diffed tween during an edit where the code is drawn',
    expectContinuous(
      code => code.code.append('\nconst delta = 4;', 1),
      code => code.code('const alpha = 7;\nconst gamma = 3;', 1),
    ),
  );

  it(
    'starts a second template edit during the first where the code is drawn',
    expectContinuous(
      code => code.code.prepend('// one\n', 1),
      code => code.code.edit(1)`${insert('// two\n')}// one\n${Source}`,
    ),
  );

  it(
    'blends code that a second edit recolors from its drawn color',
    expectContinuous(
      code => code.code.replace(word(1, 6, 4), 'delta', 1),
      code => code.code.insert([0, 6], '"', 1),
      0.3,
      QuoteHighlighter,
    ),
  );

  it(
    'removes still incoming code from its current opacity',
    expectContinuous(
      code => code.code.append(' // note', 1),
      code => code.code.remove(word(2, 16), 1),
      0.75,
    ),
  );

  it(
    'animates nested code signals and ends where their target is drawn',
    generatorTest(function* () {
      const message = Code.createSignal('Hello, world!');
      const body = Code.createSignal(CODE`console.log('${message}');`);
      const code = new Code({
        highlighter: null,
        code: CODE`function hello() {
  ${body}
}`,
      });
      add(code);
      yield* all(
        message('Goodbye, world!', 0.6),
        body.append(0.6)`
  return 7;`,
      );
      expect(code.parsed()).toBe(`function hello() {
  console.log('Goodbye, world!');
  return 7;
}`);
      expect(message.context.motion.entries.size()).toBe(0);
      expect(body.context.motion.entries.size()).toBe(0);
      expect(glyphs(code)).toEqual(glyphs(atRest(code.parsed())));
    }),
  );

  it(
    'joins the units that edits split once the edits end',
    generatorTest(function* () {
      const code = new Code({code: Source, highlighter: null});
      add(code);
      const start = code.code.context.units().length;
      for (let i = 0; i < 200; i++) {
        const name = i % 2 ? 'beta' : 'BETA';
        if (i % 4 < 2) {
          yield* code.code.replace(word(1, 6, 4), name, 0.1);
        } else {
          code.code.replace(word(1, 6, 4), name);
        }
      }
      expect(code.code.context.units().length).toBe(start);
    }),
  );

  it(
    'keys a value set from outside',
    generatorTest(function* () {
      const code = new Code({code: Source, highlighter: null});
      add(code);
      yield code.code.append(' // note', 1);
      yield* waitFor(0.3);
      code.code('const delta = 4;');
      expect(code.code.context.units().map(unit => unit.piece)).toEqual([
        'const delta = 4;',
      ]);
      expect(code.code()).toEqual({
        progress: 0,
        fragments: ['const delta = 4;'],
      });
      yield* waitFor(1);
      expect(code.code.context.motion.entries.size()).toBe(0);
      expect(glyphs(code)).toEqual(glyphs(atRest('const delta = 4;')));
    }),
  );

  it(
    'leaves the target and no motion when an edit is cancelled',
    generatorTest(function* () {
      const code = new Code({code: Source, highlighter: null});
      add(code);
      const task = yield code.code.replace(lines(1), '', 1);
      yield* waitFor(0.3);
      cancel(task);
      yield;

      expect(code.parsed()).toBe('const alpha = 1;\nconst gamma = 3;');
      expect(code.code.context.motion.entries.size()).toBe(0);
      expect(code.code.context.isTweening()).toBe(false);
      expect(glyphs(code).join('')).not.toContain('b@');
    }),
  );

  it(
    'fades code in with the transitions of the node',
    generatorTest(function* () {
      const code = new Code({
        code: Source,
        highlighter: null,
        transitions: {
          incoming: (pose, progress) => ({
            ...pose,
            opacity: pose.opacity * progress,
          }),
        },
      });
      add(code);
      yield code.code.append(' // note', 1);
      yield* waitFor(0.3);
      const [alpha] = alphaOf(code, 'note');
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThan(easeInOutCubic(0.3));
    }),
  );

  it(
    'prefers the transitions of an edit over those of the node',
    generatorTest(function* () {
      const fade: Partial<CodeTransitions> = {
        incoming: (pose, progress) => ({
          ...pose,
          opacity: pose.opacity * progress,
        }),
      };
      const code = new Code({
        code: Source,
        highlighter: null,
        transitions: fade,
      });
      add(code);
      yield code.code.append(' // note', 1, {
        incoming: pose => ({...pose, opacity: pose.opacity * 0.5}),
      });
      yield* waitFor(0.3);
      expect(alphaOf(code, 'note')).toEqual([0.5]);
    }),
  );

  it(
    'reports the ranges an edit template removes and inserts',
    generatorTest(function* () {
      const code = new Code({code: Source, highlighter: null});
      add(code);
      const edit = code.code.edit(
        1,
      )`${insert('// top\n')}const alpha = ${replace('1', '10')};
const beta = 2;
${remove('const gamma = 3;')}`;
      yield edit;
      const before = Source.split('\n');
      const after = code.parsed().split('\n');
      expect(edit.leaving.map(range => slice(before, range))).toEqual([
        '1',
        'const gamma = 3;',
      ]);
      expect(edit.arriving.map(range => slice(after, range))).toEqual([
        '// top\n',
        '10',
      ]);
    }),
  );

  it(
    'reports one range for replace, insert and remove',
    generatorTest(function* () {
      const code = new Code({code: Source, highlighter: null});
      add(code);
      const replaced = code.code.replace(word(0, 6, 5), 'longerName', 1);
      expect(replaced.leaving).toEqual([word(0, 6, 5)]);
      expect(replaced.arriving).toEqual([word(0, 6, 10)]);
      yield replaced;
      const inserted = code.code.insert([2, 0], '// third\n', 1);
      expect(inserted.leaving).toEqual([]);
      expect(inserted.arriving).toEqual([
        [
          [2, 0],
          [3, 0],
        ],
      ]);
      yield inserted;
      const removed = code.code.remove(lines(3), 1);
      expect(removed.leaving).toEqual([
        [
          [3, 0],
          [3, 16],
        ],
      ]);
      expect(removed.arriving).toEqual([]);
    }),
  );

  it(
    'reports the progress of an edit from the call to its end',
    generatorTest(function* () {
      const code = new Code({code: Source, highlighter: null});
      add(code);
      const edit = code.code.append(' // note', 1);
      expect(edit.progress()).toBe(0);
      yield edit;
      yield* waitFor(0.3);
      expect(edit.progress()).toBeGreaterThan(0);
      expect(edit.progress()).toBeLessThan(1);
      yield* waitFor(1);
      expect(edit.progress()).toBe(1);
    }),
  );

  it(
    'applies two edits created before either runs in order',
    generatorTest(function* () {
      const code = new Code({code: Source, highlighter: null});
      add(code);
      const first = code.code.insert([0, 0], 'x', 1);
      const second = code.code.replace(word(1, 0, 5), 'let', 1);
      yield* all(first, second);
      const target = Source.replace(/^/, 'x').replace('const beta', 'let beta');
      expect(code.parsed()).toBe(target);
      expect(second.arriving).toEqual([word(1, 0, 3)]);
      expect(second.leaving).toEqual([word(1, 0, 5)]);
    }),
  );

  it(
    'types an edit in three phases with the typed transitions',
    generatorTest(function* () {
      const code = new Code({
        code: Source,
        highlighter: null,
        transitions: TypedTransitions,
      });
      add(code);
      const from = penX(glyphs(code), '2');
      const to = penX(glyphs(atRest(Source.replace('beta', 'epsilon'))), '2');
      const paints = () => {
        const {calls, context} = recordingTextContext();
        code.render(context);
        return calls;
      };
      yield code.code.replace(word(1, 6, 4), 'epsilon', 1);

      yield* waitFor(timeAt(1 / 6));
      const [old] = paints().filter(call => call.text.includes('beta'));
      expect(old.scale).toBeLessThan(1);
      expect(old.scale).toBeGreaterThan(0);
      expect(penX(glyphs(code), '2')).toBeCloseTo(from);

      yield* waitFor(timeAt(1 / 2) - timeAt(1 / 6));
      expect(penX(glyphs(code), '2')).toBeCloseTo((from + to) / 2);
      expect(paints().filter(call => call.text.startsWith('e'))).toEqual([]);

      yield* waitFor(timeAt(5 / 6) - timeAt(1 / 2));
      const [typed] = paints().filter(call => call.text.startsWith('e'));
      expect('epsilon'.startsWith(typed.text)).toBe(true);
      expect(typed.text.length).toBeLessThan('epsilon'.length);

      yield* waitFor(2);
      expect(glyphs(code)).toEqual(
        glyphs(atRest(Source.replace('beta', 'epsilon'))),
      );
    }),
  );

  it(
    'draws every character of incoming code with the default transitions',
    generatorTest(function* () {
      const code = new Code({code: Source, highlighter: null});
      add(code);
      yield code.code.replace(word(1, 6, 4), 'epsilon', 1);
      yield* waitFor(timeAt(3 / 4));
      const {calls, context} = recordingTextContext();
      code.render(context);
      expect(
        calls.filter(call => call.text.startsWith('e')).map(call => call.text),
      ).toEqual(['epsilon']);
    }),
  );
});
