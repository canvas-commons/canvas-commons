import {ThreadGenerator, waitFor} from '@canvas-commons/core';
import {expect} from 'vitest';
import {Txt} from '../Txt';
import {generatorTest} from './generatorTest';
import {recordingTextContext} from './recordingTextContext';
import {CHAR_WIDTH, add, fontSizeOf} from './sceneFixtures';

/** Every visible glyph as `char@x,y:alpha:fill`, sorted. */
export function glyphs(node: Txt): string[] {
  const {calls, context} = recordingTextContext();
  node.render(context);
  const glyphs: string[] = [];
  for (const call of calls) {
    if (call.kind !== 'fill' || call.globalAlpha <= 0) continue;
    [...call.text].forEach((char, i) => {
      if (char.trim() === '') return;
      const x = (call.penX + i * (CHAR_WIDTH + call.letterSpacing)).toFixed(3);
      const y = call.penY.toFixed(3);
      const alpha = call.globalAlpha.toFixed(4);
      glyphs.push(`${char}@${x},${y}:${alpha}:${call.fillStyle}`);
    });
  }
  return glyphs.sort();
}

export const Source = 'The quick brown fox jumps over the lazy dog.';

export function paragraph(): Txt {
  return (
    <Txt width={160} textWrap fill={'white'}>
      {Source}
    </Txt>
  ) as Txt;
}

/** A node that shows `text` without having been edited. */
export function atRest(text: string, build: () => Txt = paragraph): Txt {
  const txt = build();
  txt.text(text);
  add(txt);
  return txt;
}

/**
 * Start `second` 30% into `first` and expect the picture and the size not to
 * change in the frame the second edit starts.
 */
export function expectContinuous(
  first: (txt: Txt) => ThreadGenerator,
  second: (txt: Txt) => ThreadGenerator,
  build: () => Txt = paragraph,
) {
  return generatorTest(function* () {
    const txt = build();
    add(txt);
    yield first(txt);
    yield* waitFor(0.3);
    const target = txt.text();
    const before = glyphs(txt);
    const size = txt.size();
    yield second(txt);
    expect(txt.text()).not.toBe(target);
    expect(glyphs(txt)).toEqual(before);
    expect(txt.size()).toEqual(size);
    yield* waitFor(2);
    expect(txt.text.context.motion.entries.size()).toBe(0);
    expect(glyphs(txt)).toEqual(glyphs(atRest(txt.text(), build)));
  });
}

export function expectNoDoubledGlyphs(txt: Txt) {
  const slots = glyphs(txt).map(glyph => glyph.slice(0, glyph.indexOf(':')));
  expect(slots).toEqual([...new Set(slots)]);
}

export const Whole = 'A slow green turtle naps under the warm sun.';

/** Glyphs of the `Fit` family are half as wide as the font is tall. */
export function glyphWidth(text: string, font: string): number {
  return (
    text.length * (font.includes('Fit') ? fontSizeOf(font) * 0.5 : CHAR_WIDTH)
  );
}
