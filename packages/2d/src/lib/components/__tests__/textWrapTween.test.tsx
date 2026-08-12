import {cancel, linear, waitFor} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {Layout} from '../Layout';
import {Txt} from '../Txt';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';

function lineTexts(txt: Txt): string[] {
  return txt
    .textLines()
    .lines.map(line => line.fragments.map(f => f.text).join(''));
}

// Width 100 at 10px per mocked glyph gives 10 characters per line, so the
// expected line sets below are exact.
describe('Txt textWrap during text tweens', () => {
  mockScene2D();
  mockTextContext();

  it(
    'keeps wrapping a fixed-width Txt mid-tween',
    generatorTest(function* () {
      const txt = (
        <Txt width={100} textWrap>
          aaaa bbbb cccc dddd eeee ffff
        </Txt>
      ) as Txt;

      yield txt.text('gggg hhhh iiii jjjj kkkk llll', 2, linear);
      yield* waitFor(1);

      expect(txt.textWrap()).toBe(true);
      expect(txt.textLines().lines.length).toBeGreaterThan(1);
    }),
  );

  it(
    'restores textWrap when the tween is cancelled',
    generatorTest(function* () {
      const txt = (
        <Txt width={100} textWrap>
          aaaa bbbb cccc dddd eeee ffff
        </Txt>
      ) as Txt;

      const task = yield txt.text('gggg hhhh iiii jjjj kkkk llll', 2, linear);
      yield* waitFor(1);
      cancel(task);

      expect(txt.textWrap()).toBe(true);
      // Cancellation restores the plain interpolated value — endpoint
      // characters only, no injected breaks — and the configured width.
      expect(txt.text()).toBe('gggg hhhh iiii dddd eeee ffff');
      expect(txt.width()).toBe(100);
    }),
  );

  it(
    'uses the target breaks while a shrinking tween types over the source',
    generatorTest(function* () {
      const txt = (
        <Txt width={100} textWrap text={'xx yy zz www vvv uuu'} />
      ) as Txt;

      yield txt.text('aaaa bbbb cccc', 2, linear);
      yield* waitFor(1.7);

      // textLerp's shrinking branch keeps the source head and writes target
      // characters behind it; the typed region must break at the target's
      // offset (10), not the source's (9).
      expect(lineTexts(txt)).toEqual(['xx a bbbb ', 'ccccv']);
    }),
  );

  it(
    'holds settled lines steady while the tail still shows old text',
    generatorTest(function* () {
      const txt = (
        <Txt width={100} textWrap text={'aa bb cc dd ee ff gg hh'} />
      ) as Txt;

      yield txt.text('aaaaaa bb cc dd ee ff g', 2, linear);
      yield* waitFor(1);

      // The typed head wraps like the new text, the remaining tail keeps the
      // old text's breaks — 'gg hh' must not hop up a line mid-tween.
      expect(lineTexts(txt)).toEqual(['aaaaaa bb ', 'c ee ff ', 'gg hh']);
    }),
  );

  it(
    'reveals typewriter text along the final line breaks',
    generatorTest(function* () {
      const txt = (<Txt width={100} textWrap text={''} />) as Txt;

      yield txt.text('aaaa bbbb cccc dddd', 2, linear);
      yield* waitFor(1);

      expect(lineTexts(txt)).toEqual(['aaaa bbbb']);
    }),
  );

  it(
    'respects manual newlines mid-tween',
    generatorTest(function* () {
      const txt = (
        <Txt width={100} textWrap text={'aaaa\nbb cc dd ee'} />
      ) as Txt;

      yield txt.text('aaaa\nff gg hh ii', 2, linear);
      yield* waitFor(1);

      expect(lineTexts(txt)).toEqual(['aaaa', 'ff cc dd ', 'ee']);
    }),
  );

  it(
    'keeps the visible hyphen at a soft-hyphen break mid-tween',
    generatorTest(function* () {
      const hyphenator = (word: string): string[] =>
        word.length > 3 ? [word.slice(0, 3), word.slice(3)] : [word];
      const txt = (
        <Txt width={40} textWrap hyphenate={() => hyphenator} text={'abcdef'} />
      ) as Txt;

      yield txt.text('abcxyz', 2, linear);
      yield* waitFor(1);

      expect(txt.text()).toBe('abc-\ndef');
      expect(lineTexts(txt)).toEqual(['abc-', 'def']);
    }),
  );

  it(
    'keeps lines stable around exclusions mid-tween',
    generatorTest(function* () {
      const txt = (
        <Txt
          width={150}
          textWrap
          fontSize={20}
          lineHeight={20}
          exclusions={[{kind: 'rect', x: 0, y: 0, width: 50, height: 30}]}
          text={'aa bb cc dd ee ff gg hh'}
        />
      ) as Txt;

      yield txt.text('aaaaaa bb cc dd ee ff g', 2, linear);
      yield* waitFor(1);

      const layout = txt.textLines();
      const texts = layout.lines.map(l =>
        l.fragments.map(f => f.text).join(''),
      );
      // Lines 1-2 sit beside the exclusion (x = 50, 10 chars wide), line 3
      // clears it — 'gg hh' must stay on its own line instead of refilling.
      expect(texts).toEqual(['aaaaaa bb ', 'c ee ff ', 'gg hh']);
      expect(layout.lines.map(l => l.fragments[0].x)).toEqual([50, 50, 0]);
    }),
  );

  it(
    'holds Knuth-Plass lines steady mid-tween',
    generatorTest(function* () {
      const txt = (
        <Txt
          width={100}
          textWrap
          wrapMode={'knuth-plass'}
          text={'aaaa bbbb cccc'}
        />
      ) as Txt;

      yield txt.text('dddd eeee ffff', 2, linear);
      yield* waitFor(1);

      expect(txt.text()).toBe('dddd ebbb \ncccc');
      expect(lineTexts(txt)).toEqual(['dddd ebbb', 'cccc']);
    }),
  );

  it(
    'keeps wrapping a percent-width Txt mid-tween',
    generatorTest(function* (view) {
      const txt = (<Txt textWrap width={'80%'} text={''} />) as Txt;
      view.add(txt);

      yield txt.text('word '.repeat(64).trimEnd(), 2, linear);
      yield* waitFor(1);

      // 80% of the 1920 view resolves to 1536px — 153 mocked glyphs per line.
      expect(txt.textWrap()).toBe(true);
      expect(txt.textLines().lines.length).toBeGreaterThan(1);
    }),
  );

  it(
    'holds lines steady for a percent-width Txt inside a layout',
    generatorTest(function* (view) {
      const txt = (
        <Txt textWrap width={'100%'} text={'aa bb cc dd ee ff gg hh'} />
      ) as Txt;
      view.add(
        <Layout layout width={100} height={400}>
          {txt}
        </Layout>,
      );

      yield txt.text('aaaaaa bb cc dd ee ff g', 2, linear);
      yield* waitFor(1);

      // Resolved width 100 matches the fixed-width morph case exactly.
      expect(lineTexts(txt)).toEqual(['aaaaaa bb ', 'c ee ff ', 'gg hh']);
    }),
  );

  it(
    'rewraps a percent-width Txt when its container resizes',
    generatorTest(function* (view) {
      const parent = (<Layout layout width={200} height={400} />) as Layout;
      const txt = (
        <Txt textWrap width={'100%'} text={'aaaa bbbb cccc dddd'} />
      ) as Txt;
      parent.add(txt);
      view.add(parent);
      yield;

      expect(txt.textLines().lines.length).toBe(1);
      parent.width(100);
      yield;
      expect(txt.textLines().lines.length).toBeGreaterThan(1);
    }),
  );

  it(
    'freezes tween breaks across a container resize, then reflows on settle',
    generatorTest(function* (view) {
      const parent = (<Layout layout width={100} height={400} />) as Layout;
      const txt = (
        <Txt textWrap width={'100%'} text={'aa bb cc dd ee ff gg hh'} />
      ) as Txt;
      parent.add(txt);
      view.add(parent);
      yield;

      yield txt.text('aaaaaa bb cc dd ee ff g', 2, linear);
      yield* waitFor(1);
      const frozen = lineTexts(txt);
      expect(frozen).toEqual(['aaaaaa bb ', 'c ee ff ', 'gg hh']);

      // A concurrent container resize does not re-break the running tween...
      parent.width(300);
      yield;
      expect(lineTexts(txt)).toEqual(frozen);

      // ...but the settled text reflows against the new width.
      yield* waitFor(1.5);
      expect(lineTexts(txt)).toEqual(['aaaaaa bb cc dd ee ff g']);
    }),
  );

  it(
    'still suppresses wrapping for auto-width Txt mid-tween',
    generatorTest(function* () {
      const txt = (<Txt textWrap>aaaa bbbb cccc dddd eeee ffff</Txt>) as Txt;

      yield txt.text('gggg hhhh iiii jjjj kkkk llll', 2, linear);
      yield* waitFor(1);

      expect(txt.textWrap()).toBe(false);
    }),
  );
});
