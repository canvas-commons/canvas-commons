import {cancel, createSignal, linear, waitFor} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {Layout} from '../Layout';
import {HyphenateFn, Txt} from '../Txt';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';

function lineTexts(txt: Txt): string[] {
  return txt
    .textLines()
    .lines.map(line => line.fragments.map(f => f.text).join(''));
}

function wordPositions(txt: Txt): number[] {
  return txt.textWords().map(word => word.x);
}

const AVATAR_A =
  'when the Avatar kept balance between the Water Tribes, Earth Kingdom, Fire Nation, and Air Nomads.';
const AVATAR_B =
  'Water. Earth. Fire. Air. My grandmother used to tell me stories about the old days, a time of peace';
const SHORT = 'Only the Avatar can stop them.';

const SEAM_CASES: [string, string, string][] = [
  ['grow, near-equal length', AVATAR_A, AVATAR_B],
  ['shrink, near-equal length', AVATAR_B, AVATAR_A],
  ['grow, short to long', SHORT, AVATAR_B],
  ['shrink, long to short', AVATAR_B, SHORT],
  ['grow, medium to long', AVATAR_A.slice(0, 60), AVATAR_B],
  ['shrink, long to medium', AVATAR_B, AVATAR_A.slice(0, 60)],
];

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
      expect(lineTexts(txt)).toEqual(['xx a bbbb', 'ccccv']);
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
      expect(lineTexts(txt)).toEqual(['aaaaaa bb', 'c ee ff', 'gg hh']);
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

      expect(lineTexts(txt)).toEqual(['aaaa', 'ff cc dd', 'ee']);
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
          height={60}
          textWrap
          fontSize={20}
          lineHeight={20}
          exclusions={[{kind: 'rect', x: -50, y: -15, width: 50, height: 30}]}
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
      expect(texts).toEqual(['aaaaaa bb', 'c ee ff', 'gg hh']);
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
      expect(lineTexts(txt)).toEqual(['aaaaaa bb', 'c ee ff', 'gg hh']);
    }),
  );

  it(
    'keeps wrapping a percent-width Txt resolved to a width of zero',
    generatorTest(function* (view) {
      const txt = (
        <Txt textWrap overflowWrap={'anywhere'} width={'100%'} text={'abc'} />
      ) as Txt;
      view.add(
        <Layout layout width={0} height={400}>
          {txt}
        </Layout>,
      );

      yield txt.text('xyz', 2, linear);
      yield* waitFor(1);

      expect(txt.width()).toBe(0);
      expect(txt.textWrap()).toBe(true);
      expect(lineTexts(txt)).toHaveLength(3);
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
      expect(frozen).toEqual(['aaaaaa bb', 'c ee ff', 'gg hh']);

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
    're-wraps when a reactive tween target changes mid-tween',
    generatorTest(function* () {
      const target = createSignal('aaaaaa bb cc dd ee ff g');
      const txt = (
        <Txt width={100} textWrap text={'aa bb cc dd ee ff gg hh'} />
      ) as Txt;

      yield txt.text(target, 2, linear);
      yield* waitFor(1);

      target('zzzz yyyy xxxx wwww vvvv');
      yield;

      // The captured breaks describe the old target, so the rest of the tween
      // wraps at the box width; only a soft break's trailing space overhangs.
      expect(lineTexts(txt)).toEqual(['zzzz yyyy', 'xxee ff gg', 'hhv']);

      yield* waitFor(1);
      expect(txt.text()).toBe('zzzz yyyy xxxx wwww vvvv');
      expect(lineTexts(txt)).toEqual(['zzzz yyyy', 'xxxx wwww', 'vvvv']);
    }),
  );

  it(
    'keeps wrapping when the tween target changes twice',
    generatorTest(function* () {
      const target = createSignal('aaaaaa bb cc dd ee ff g');
      const txt = (
        <Txt width={100} textWrap text={'aa bb cc dd ee ff gg hh'} />
      ) as Txt;

      yield txt.text(target, 2, linear);
      yield* waitFor(0.5);
      target('zzzz yyyy xxxx wwww vvvv');
      yield* waitFor(0.5);
      target('mmmm nnnn oooo pppp');
      yield;

      expect(txt.textLines().lines.length).toBeGreaterThan(1);

      yield* waitFor(1);
      expect(txt.text()).toBe('mmmm nnnn oooo pppp');
      expect(lineTexts(txt)).toEqual(['mmmm nnnn', 'oooo pppp']);
    }),
  );

  it(
    'stays re-wrapped when the target returns to its first value',
    generatorTest(function* () {
      const target = createSignal('aaaaaa bb cc dd ee ff g');
      const txt = (
        <Txt width={100} textWrap text={'aa bb cc dd ee ff gg hh'} />
      ) as Txt;

      yield txt.text(target, 2, linear);
      yield* waitFor(0.5);
      target('zzzz yyyy xxxx wwww vvvv');
      yield* waitFor(0.5);
      target('aaaaaa bb cc dd ee ff g');
      yield;

      // A dropped plan is never picked back up, so no captured break is
      // injected and the text soft-wraps at the box width instead.
      expect(txt.text()).toBe('aaaaaa bb c ee ff gg hh');
      expect(lineTexts(txt)).toEqual(['aaaaaa bb', 'c ee ff gg', 'hh']);

      yield* waitFor(1);
      expect(txt.text()).toBe('aaaaaa bb cc dd ee ff g');
      expect(lineTexts(txt)).toEqual(['aaaaaa bb', 'cc dd ee', 'ff g']);
    }),
  );

  it(
    'restores the box when a cancel follows a target change',
    generatorTest(function* () {
      const target = createSignal('aaaaaa bb cc dd ee ff g');
      const txt = (
        <Txt width={100} textWrap text={'aa bb cc dd ee ff gg hh'} />
      ) as Txt;

      const task = yield txt.text(target, 2, linear);
      yield* waitFor(1);
      target('zzzz yyyy xxxx wwww vvvv');
      yield;

      const lines = lineTexts(txt);
      expect(lines.length).toBeGreaterThan(1);
      // Only a soft break's trailing space may overhang the box.
      const widest = Math.max(...lines.map(line => line.trimEnd().length * 10));
      expect(widest).toBeLessThanOrEqual(100);

      cancel(task);

      expect(txt.textWrap()).toBe(true);
      expect(txt.width()).toBe(100);
      expect(txt.textLines().lines.length).toBeGreaterThan(1);
    }),
  );

  it(
    'drops justify targets when a reactive target changes',
    generatorTest(function* () {
      // The abandoned target plans three lines; the new one settles into two,
      // so its last line would borrow line two's justify spacing if the plan
      // survived the change.
      const target = createSignal('aaaa bbbb cc dd ee ffff');
      const txt = (
        <Txt
          width={100}
          textWrap
          textAlign={'justify'}
          text={'aa bb cc dd ee ff gg hh'}
        />
      ) as Txt;

      yield txt.text(target, 2, linear);
      yield* waitFor(1);

      target('xxxx yyyy cc dd');
      yield;

      const inflight = (
        <Txt width={100} textWrap textAlign={'justify'} text={txt.text()} />
      ) as Txt;
      expect(lineTexts(txt)).toEqual(lineTexts(inflight));
      expect(wordPositions(txt)).toEqual(wordPositions(inflight));

      yield* waitFor(1);
      const settled = (
        <Txt
          width={100}
          textWrap
          textAlign={'justify'}
          text={'xxxx yyyy cc dd'}
        />
      ) as Txt;
      expect(txt.text()).toBe('xxxx yyyy cc dd');
      expect(lineTexts(txt)).toEqual(['xxxx yyyy', 'cc dd']);
      expect(wordPositions(txt)).toEqual(wordPositions(settled));
    }),
  );

  it(
    'keeps wrapping a Txt bounded by maxWidth mid-tween',
    generatorTest(function* (view) {
      const txt = (
        <Txt maxWidth={100} textWrap textAlign={'center'}>
          aaaa
        </Txt>
      ) as Txt;
      view.add(txt);

      yield txt.text('aaaa bbbb cccc dddd eeee ffff', 2, linear);
      yield* waitFor(1);

      expect(txt.textWrap()).toBe(true);
      expect(lineTexts(txt).length).toBeGreaterThan(1);
      for (const line of lineTexts(txt)) {
        expect(line.trimEnd().length).toBeLessThanOrEqual(10);
      }
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

  it.each(SEAM_CASES)(
    'never draws a line wider than the box: %s',
    (_name, from, to) =>
      generatorTest(function* (view) {
        const txt = (<Txt width={250} textWrap text={from} />) as Txt;
        view.add(txt);
        yield txt.text(to, 4, linear);
        for (let i = 0; i < 60 * 4 - 1; i++) {
          yield;
          const widest = Math.max(
            ...lineTexts(txt).map(line => line.trimEnd().length),
          );
          expect(widest).toBeLessThanOrEqual(25);
        }
      })(),
  );

  it(
    'breaks where the old and the new text meet when the joined line is too wide',
    generatorTest(function* (view) {
      const txt = (<Txt width={250} textWrap text={AVATAR_A} />) as Txt;
      view.add(txt);
      yield txt.text(AVATAR_B, 4, linear);

      let flat = txt.text().replace(/-?\n/g, '');
      while (!flat.startsWith('Water. Earth. Fire. Ab')) {
        yield;
        flat = txt.text().replace(/-?\n/g, '');
      }

      expect(lineTexts(txt)).toEqual([
        'Water. Earth. Fire. A',
        'balance between the Water',
        'Tribes, Earth Kingdom,',
        'Fire Nation, and Air',
        'Nomads.',
      ]);
    }),
  );

  it(
    'keeps a seam joined when the joined line still fits',
    generatorTest(function* (view) {
      const txt = (<Txt width={100} textWrap text={'cccc bbb aa'} />) as Txt;
      view.add(txt);
      yield txt.text('cccc cccc aa', 2, linear);

      let flat = txt.text().replace(/-?\n/g, '');
      while (flat !== 'cccc cbb aaa') {
        yield;
        flat = txt.text().replace(/-?\n/g, '');
      }

      expect(lineTexts(txt)).toEqual(['cccc cbb', 'aaa']);
    }),
  );

  it(
    'breaks at a seam instead of drawing a hyphen past the box',
    generatorTest(function* (view) {
      const hyphenate: HyphenateFn = word => {
        if (word.length <= 4) return [word];
        const half = Math.ceil(word.length / 2);
        return [word.slice(0, half), word.slice(half)];
      };
      const txt = (
        <Txt
          width={60}
          textWrap
          hyphenate={() => hyphenate}
          text={'bbbababbb\nabbaba abbabb'}
        />
      ) as Txt;
      view.add(txt);
      yield txt.text('abbaaa\naaabbbb', 23 / 30, linear);

      let flat = txt.text().replace(/-?\n/g, '');
      while (flat !== 'bbbababbbabbbbba ') {
        yield;
        flat = txt.text().replace(/-?\n/g, '');
      }

      // The candidate line at the seam ('abbbab') fits the 60px box, but is
      // drawn with a trailing hyphen ('abbbab-') that would not — the break
      // must land at the seam instead of overhanging the box.
      expect(lineTexts(txt)).toEqual(['bbbab-', 'abbb', 'ab-', 'bbbba']);
    }),
  );
});
