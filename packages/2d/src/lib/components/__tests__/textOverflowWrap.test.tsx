import {all, createRef} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Layout} from '../Layout';
import {Node} from '../Node';
import {Txt, TxtProps, TxtWrapMode} from '../Txt';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';

function add(node: Node): void {
  useScene2D().getView().add(node);
}

function lineTexts(txt: Txt): string[] {
  return txt
    .textLines()
    .lines.map(line => line.fragments.map(f => f.text).join(''))
    .map(line => line.trimEnd());
}

// Every glyph is 10 units wide (see `mockTextContext`), so `extraordinarily`
// (15 characters) is 150 wide — wider than the 120-wide box used below, and
// every other word fits comfortably.
const SENTENCE = 'Short words and extraordinarily long compound words coexist.';
const OVERWIDE_WORD = 'extraordinarily';
const WIDTH = 120;

function rootTxt(props: TxtProps): Txt {
  const txt = createRef<Txt>();
  add(
    <Txt
      ref={txt}
      fontSize={10}
      lineHeight={20}
      width={WIDTH}
      textWrap
      text={SENTENCE}
      {...props}
    />,
  );
  return txt();
}

function rowItemTxt(props: TxtProps): Txt {
  const txt = createRef<Txt>();
  add(
    <Layout layout direction={'row'} width={500}>
      <Txt
        ref={txt}
        fontSize={10}
        lineHeight={20}
        width={WIDTH}
        textWrap
        text={SENTENCE}
        {...props}
      />
    </Layout>,
  );
  return txt();
}

const Placements = [
  {name: 'as a root node', build: rootTxt},
  {name: 'as a flex-row item with a fixed width', build: rowItemTxt},
];

describe('Txt overflow-wrap crossing text layout', () => {
  mockScene2D();
  mockTextContext(10);

  for (const wrapMode of ['greedy', 'knuth-plass'] as TxtWrapMode[]) {
    for (const textAlign of ['left', 'justify'] as const) {
      for (const placement of Placements) {
        const label = `${wrapMode} / ${textAlign} / ${placement.name}`;

        it(`${label}: isolates the over-wide word and fits every other line`, () => {
          const txt = placement.build({wrapMode, textAlign});
          const lines = lineTexts(txt);

          expect(lines.filter(line => line === OVERWIDE_WORD)).toHaveLength(1);
          for (const line of lines) {
            if (line === OVERWIDE_WORD) continue;
            expect(line.length * 10).toBeLessThanOrEqual(WIDTH);
          }
          expect(txt.size.x()).toBeCloseTo(WIDTH);
        });
      }
    }
  }

  // Knuth-Plass never splits a word (its break candidates only fall at
  // spaces and soft hyphens), so `overflowWrap: 'anywhere'` has no word to
  // apply to there; only the greedy path's pretext fallback can honor it.
  for (const textAlign of ['left', 'justify'] as const) {
    for (const placement of Placements) {
      it(`greedy / ${textAlign} / ${placement.name}: overflowWrap anywhere breaks the word`, () => {
        const txt = placement.build({
          wrapMode: 'greedy',
          textAlign,
          overflowWrap: 'anywhere',
        });
        const lines = lineTexts(txt);

        for (const line of lines) {
          expect(line.length * 10).toBeLessThanOrEqual(WIDTH);
        }
        expect(txt.size.x()).toBeCloseTo(WIDTH);
      });
    }
  }

  it(
    'settles to the lines it approached while tweening into an over-wide word',
    generatorTest(function* () {
      const txt = createRef<Txt>();
      add(
        <Txt
          ref={txt}
          fontSize={10}
          lineHeight={20}
          width={WIDTH}
          textWrap
          text={'Short words here'}
        />,
      );

      let lastFrameLines: string[] = [];
      const sample = function* () {
        for (let frame = 0; frame < 60; frame++) {
          lastFrameLines = lineTexts(txt());
          yield;
        }
      };

      yield* all(txt().text(SENTENCE, 1), sample());

      const settled = createRef<Txt>();
      add(
        <Txt
          ref={settled}
          fontSize={10}
          lineHeight={20}
          width={WIDTH}
          textWrap
          text={SENTENCE}
        />,
      );

      expect(lastFrameLines).toEqual(lineTexts(settled()));
    }),
  );
});
