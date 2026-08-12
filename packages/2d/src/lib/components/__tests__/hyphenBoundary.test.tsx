import {waitFor} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {Txt} from '../Txt';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';

function charWidth(ch: string): number {
  if (ch === '­') return 0;
  return 6 + ((ch.codePointAt(0) ?? 0) % 7);
}

function measure(text: string): number {
  let width = 0;
  for (const ch of text) width += charWidth(ch);
  return width;
}

function hyphenateWord(word: string): string[] {
  if (word.length <= 6) return [word];
  const parts: string[] = [];
  for (let i = 0; i < word.length; i += 4) {
    parts.push(word.slice(i, i + 4));
  }
  return parts;
}

function lineTexts(txt: Txt): string[] {
  return txt
    .textLines()
    .lines.map(line => line.fragments.map(f => f.text).join(''));
}

describe('hyphenated tween completion boundary', () => {
  mockScene2D();
  mockTextContext(measure);

  it(
    'settles to the same lines the final tween frame showed',
    generatorTest(function* () {
      const txt = (
        <Txt
          width={300}
          textWrap
          text={'The old druid grins at you.\n"Storms have passed," she says.'}
        />
      ) as Txt;

      txt.hyphenate(() => hyphenateWord);
      yield* txt.width(180, 0.8);

      const frames: string[][] = [];
      yield txt.text(
        'Her uncharacteristically overcomplicated topographical switchback.',
        2,
      );
      yield* waitFor(1.9);
      for (let i = 0; i < 12; i++) {
        frames.push(lineTexts(txt));
        yield;
      }

      // 'Her uncharacteristic' measures exactly the wrap width, so this break
      // only fits via hyphen overhang — it must hold across the boundary.
      const settled = frames[frames.length - 1];
      expect(settled[0]).toBe('Her uncharacteristic-');
      for (const lines of frames) {
        expect(lines).toEqual(settled);
      }
    }),
  );
});
