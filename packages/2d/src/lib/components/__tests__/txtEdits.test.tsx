import {all, cancel, waitFor} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {insert, remove, replace} from '../../code/CodeFragment';
import {TypedTransitions} from '../../content/transitions';
import {Txt} from '../Txt';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {recordingTextContext} from './recordingTextContext';
import {add, lineTexts, penX, timeAt} from './sceneFixtures';
import {
  Source,
  Whole,
  atRest,
  expectContinuous,
  expectNoDoubledGlyphs,
  glyphWidth,
  glyphs,
  paragraph,
} from './txtEditFixtures';

function fillCalls(node: Txt): number {
  const {calls, context} = recordingTextContext();
  node.render(context);
  return calls.filter(call => call.kind === 'fill').length;
}

describe('Txt edits', () => {
  mockScene2D();
  mockTextContext((text, state) => glyphWidth(text, state.font));

  it(
    'starts a second edit on a separate range where the text is drawn',
    expectContinuous(
      txt => txt.text.replace([4, 9], 'slow', 1),
      txt => txt.text.insert(40, ' and the cat', 1),
    ),
  );

  it(
    'starts a second edit on an overlapping range where the text is drawn',
    expectContinuous(
      txt => txt.text.replace([10, 19], 'red cat', 1),
      txt => txt.text.replace([4, 14], 'big', 1),
    ),
  );

  it(
    'starts a second edit that changes the line count where it is drawn',
    expectContinuous(
      txt => txt.text.remove([20, 35], 1),
      txt => txt.text.prepend('Once upon a time, ', 1),
    ),
  );

  it(
    'starts a template edit during another where the text is drawn',
    expectContinuous(
      txt => txt.text.append(' Again.', 1),
      txt =>
        txt.text.edit(1)`${insert('Look! ')}The quick ${replace(
          'brown',
          'grey',
        )} fox jumps over the lazy dog. Again.`,
    ),
  );

  it(
    'starts a second edit where an unwrapped text and its box are drawn',
    expectContinuous(
      txt => txt.text.replace([4, 9], 'very slow', 1),
      txt => txt.text.remove([0, 4], 1),
      () => (<Txt fill={'white'}>{Source}</Txt>) as Txt,
    ),
  );

  it(
    'slides a word that wraps to the next line from where it was drawn',
    generatorTest(function* () {
      const txt = paragraph();
      add(txt);
      const lines = lineTexts(txt);
      yield txt.text.insert(0, 'Big ', 1);
      expect(lineTexts(txt)).not.toEqual(lines);
      yield* waitFor(0.5);
      const moving = glyphs(txt);
      yield* waitFor(1);
      expect(moving).not.toEqual(glyphs(txt));
      expect(glyphs(txt)).toEqual(glyphs(atRest(`Big ${Source}`)));
    }),
  );

  it(
    'starts a second edit where right-to-left text is drawn',
    expectContinuous(
      txt => txt.text.replace([0, 4], 'שלום ', 1),
      txt => txt.text.insert(20, ' עולם', 1),
      () =>
        (
          <Txt width={160} textWrap textDirection={'rtl'} fill={'white'}>
            {Source}
          </Txt>
        ) as Txt,
    ),
  );

  it(
    'edits a span inside the text of its root',
    generatorTest(function* () {
      const span = (<Txt fill={'red'}>brown</Txt>) as Txt;
      const txt = (
        <Txt width={160} textWrap fill={'white'}>
          The quick {span} fox jumps over the lazy dog.
        </Txt>
      ) as Txt;
      add(txt);
      yield span.text.replace([0, 5], 'grey', 1);
      yield* waitFor(0.3);
      const before = glyphs(txt);
      yield txt.text.insert(0, 'Look! ', 1);
      expect(glyphs(txt)).toEqual(before);
      yield* waitFor(2);
      expect(span.text()).toBe('grey');
      expect(txt.text()).toBe(
        'Look! The quick grey fox jumps over the lazy dog.',
      );
      expect(txt.text.context.motion.entries.size()).toBe(0);
      expect(
        glyphs(txt).filter(glyph => glyph.endsWith('rgb(255 0 0)')),
      ).toEqual(expect.arrayContaining([expect.stringMatching(/^g@/)]));
    }),
  );

  it(
    'grows the box of an unwrapped text from its drawn size',
    generatorTest(function* () {
      const txt = (<Txt fill={'white'}>{Source}</Txt>) as Txt;
      add(txt);
      const from = txt.size();
      yield txt.text.replace([4, 9], 'very slow', 1);
      const sizes = [txt.size()];
      for (let i = 0; i < 70; i++) {
        yield;
        sizes.push(txt.size());
      }
      const to = txt.size();
      expect(sizes[0]).toEqual(from);
      expect(to.x).toBeGreaterThan(from.x);
      for (const size of sizes) {
        expect(size.y).toBe(from.y);
        expect(size.x).toBeGreaterThanOrEqual(from.x);
        expect(size.x).toBeLessThanOrEqual(to.x);
      }
    }),
  );

  it(
    'leaves the target and no motion when an edit is cancelled',
    generatorTest(function* () {
      const txt = paragraph();
      add(txt);
      const task = yield txt.text.replace([4, 9], 'slow', 1);
      yield* waitFor(0.3);
      cancel(task);
      yield;
      expect(txt.text()).toBe(Source.replace('quick', 'slow'));
      expect(txt.text.context.motion.entries.size()).toBe(0);
      expect(txt.text.context.isTweening()).toBe(false);
      expect(glyphs(txt)).toEqual(glyphs(atRest(txt.text())));
    }),
  );

  it(
    'paints the text at rest in one call for each line',
    generatorTest(function* () {
      const txt = paragraph();
      add(txt);
      yield* txt.text.replace([4, 9], 'slow', 0.5);
      expect(fillCalls(txt)).toBe(txt.lineCount());
    }),
  );

  it(
    'prefers the transitions of an edit over those of the node',
    generatorTest(function* () {
      const txt = paragraph();
      txt.transitions({
        incoming: (pose, progress) => ({...pose, opacity: progress}),
      });
      add(txt);
      yield txt.text.append(' Zzz', 1, {
        incoming: pose => ({...pose, opacity: 0.5}),
      });
      yield* waitFor(0.3);
      expect(
        glyphs(txt)
          .filter(glyph => glyph.startsWith('Z@'))
          .map(glyph => glyph.split(':')[1]),
      ).toEqual(['0.5000']);
    }),
  );

  it(
    'draws the words an edit appends inside the box it fits',
    generatorTest(function* () {
      const build = () =>
        (
          <Txt
            autoSize
            width={300}
            height={120}
            fontSize={40}
            fontFamily={'Fit'}
            textWrap
            fill={'white'}
          >
            {Source}
          </Txt>
        ) as Txt;
      const txt = build();
      add(txt);
      const size = txt.effectiveFontSize();
      yield txt.text.append(' And the owl, too.', 1);
      expect(txt.effectiveFontSize()).toBeLessThan(size);
      yield* waitFor(0.4);
      const half = txt.size().scale(0.5);
      const {calls, context} = recordingTextContext();
      txt.render(context);
      for (const call of calls) {
        const width = glyphWidth(call.text, call.font);
        expect(call.penX).toBeGreaterThanOrEqual(-half.x);
        expect(call.penX + width).toBeLessThanOrEqual(half.x);
        expect(Math.abs(call.penY)).toBeLessThanOrEqual(half.y);
      }
      yield* waitFor(2);
      expect(glyphs(txt)).toEqual(glyphs(atRest(txt.text(), build)));
    }),
  );

  it(
    'ends an edit started during a whole-text tween with the text of the edit',
    generatorTest(function* () {
      const txt = paragraph();
      add(txt);
      yield txt.text(Whole, 1);
      yield* waitFor(0.3);
      yield txt.text.replace([2, 6], 'quick', 1);
      expectNoDoubledGlyphs(txt);
      const target = Whole.replace('slow', 'quick');
      expect(txt.text()).toBe(target);
      yield* waitFor(0.3);
      expectNoDoubledGlyphs(txt);
      yield* waitFor(2);
      expect(txt.text()).toBe(target);
      expect(txt.text.context.isTweening()).toBe(false);
      expect(glyphs(txt)).toEqual(glyphs(atRest(target)));
    }),
  );

  it(
    'ends a whole-text tween started during an edit with the target of the tween',
    generatorTest(function* () {
      const txt = paragraph();
      add(txt);
      yield txt.text.replace([4, 9], 'slow', 1);
      yield* waitFor(0.3);
      yield txt.text(Whole, 1);
      expectNoDoubledGlyphs(txt);
      expect(txt.text.context.motion.entries.size()).toBe(0);
      yield* waitFor(0.3);
      expectNoDoubledGlyphs(txt);
      yield* waitFor(2);
      expect(txt.text()).toBe(Whole);
      expect(txt.text.context.isTweening()).toBe(false);
      expect(glyphs(txt)).toEqual(glyphs(atRest(Whole)));
    }),
  );

  it(
    'leaves the text of the edit when a whole-text tween started during it is cancelled',
    generatorTest(function* () {
      const txt = paragraph();
      add(txt);
      yield txt.text.replace([4, 9], 'slow', 1);
      yield* waitFor(0.3);
      const task = yield txt.text(Whole, 1);
      cancel(task);
      yield;
      const target = Source.replace('quick', 'slow');
      expect(txt.text()).toBe(target);
      expect(txt.text.context.motion.entries.size()).toBe(0);
      expect(glyphs(txt)).toEqual(glyphs(atRest(target)));
    }),
  );

  it(
    'reports the ranges an edit template removes and inserts',
    generatorTest(function* () {
      const txt = paragraph();
      add(txt);
      const edit = txt.text.edit(1)`${insert('Look! ')}The ${replace(
        'quick',
        'slow',
      )} brown ${remove('fox ')}jumps over the lazy dog.`;
      yield edit;
      const target = txt.text();
      expect(
        edit.leaving.map(([from, to]) => Source.substring(from, to)),
      ).toEqual(['quick', 'fox ']);
      expect(
        edit.arriving.map(([from, to]) => target.substring(from, to)),
      ).toEqual(['Look! ', 'slow']);
    }),
  );

  it(
    'reports one range for replace, insert and remove',
    generatorTest(function* () {
      const txt = paragraph();
      add(txt);
      const replaced = txt.text.replace([4, 9], 'slow', 1);
      expect(replaced.leaving).toEqual([[4, 9]]);
      expect(replaced.arriving).toEqual([[4, 8]]);
      yield replaced;
      const inserted = txt.text.insert(0, 'Big ', 1);
      expect(inserted.leaving).toEqual([]);
      expect(inserted.arriving).toEqual([[0, 4]]);
      yield inserted;
      const removed = txt.text.remove([0, 4], 1);
      expect(removed.leaving).toEqual([[0, 4]]);
      expect(removed.arriving).toEqual([]);
    }),
  );

  it(
    'reports the offsets of an edit on a span in the text of the span',
    generatorTest(function* () {
      const span = (<Txt fill={'red'}>brown</Txt>) as Txt;
      const txt = (
        <Txt width={160} textWrap fill={'white'}>
          The quick {span} fox jumps over the lazy dog.
        </Txt>
      ) as Txt;
      add(txt);
      const edit = span.text.replace([0, 5], 'grey', 1);
      expect(edit.leaving).toEqual([[0, 5]]);
      expect(edit.arriving).toEqual([[0, 4]]);
      yield edit;
    }),
  );

  it(
    'reports the progress of an edit from the call to its end',
    generatorTest(function* () {
      const txt = paragraph();
      add(txt);
      const edit = txt.text.replace([4, 9], 'slow', 1);
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
      const txt = paragraph();
      add(txt);
      const first = txt.text.insert(0, 'Big ', 1);
      const second = txt.text.replace([8, 13], 'slow', 1);
      yield* all(first, second);
      const target = txt.text();
      expect(target).toBe(`Big ${Source.replace('quick', 'slow')}`);
      const [[from, to]] = second.arriving;
      expect(target.substring(from, to)).toBe('slow');
    }),
  );

  it(
    'types an edit in three phases with the typed transitions',
    generatorTest(function* () {
      const build = () =>
        (
          <Txt fill={'white'} transitions={TypedTransitions}>
            {Source}
          </Txt>
        ) as Txt;
      const txt = build();
      add(txt);
      const target = Source.replace('brown', 'crimson');
      const from = penX(glyphs(txt), 'x');
      const to = penX(glyphs(atRest(target, build)), 'x');
      const paints = () => {
        const {calls, context} = recordingTextContext();
        txt.render(context);
        return calls;
      };
      yield txt.text.replace([10, 15], 'crimson', 1);

      yield* waitFor(timeAt(1 / 6));
      const [old] = paints().filter(call => call.text.startsWith('br'));
      expect(old.scale).toBeLessThan(1);
      expect(old.scale).toBeGreaterThan(0);
      expect(penX(glyphs(txt), 'x')).toBeCloseTo(from);

      yield* waitFor(timeAt(1 / 2) - timeAt(1 / 6));
      expect(penX(glyphs(txt), 'x')).toBeCloseTo((from + to) / 2);
      expect(paints().filter(call => call.text.startsWith('cr'))).toEqual([]);

      yield* waitFor(timeAt(5 / 6) - timeAt(1 / 2));
      const [typed] = paints().filter(call => call.text.startsWith('cr'));
      expect('crimson'.startsWith(typed.text)).toBe(true);
      expect(typed.text.length).toBeLessThan('crimson'.length);

      yield* waitFor(2);
      expect(glyphs(txt)).toEqual(glyphs(atRest(target, build)));
    }),
  );

  it(
    'draws every character of incoming text with the default transitions',
    generatorTest(function* () {
      const txt = (<Txt fill={'white'}>{Source}</Txt>) as Txt;
      add(txt);
      yield txt.text.replace([10, 15], 'crimson', 1);
      yield* waitFor(timeAt(3 / 4));
      const {calls, context} = recordingTextContext();
      txt.render(context);
      expect(
        calls.filter(call => call.text.startsWith('cr')).map(call => call.text),
      ).toEqual(['crimson']);
    }),
  );
});
