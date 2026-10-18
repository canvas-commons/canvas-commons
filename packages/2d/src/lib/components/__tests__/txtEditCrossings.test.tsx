import {ThreadGenerator} from '@canvas-commons/core';
import {describe, it} from 'vitest';
import {Txt, TxtProps} from '../Txt';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {
  Source,
  expectContinuous,
  glyphWidth,
  paragraph,
} from './txtEditFixtures';

type EditStep = (txt: Txt) => ThreadGenerator;

const ReplaceWord: EditStep = txt => txt.text.replace([4, 9], 'slow', 1);
const ReplaceAgain: EditStep = txt => txt.text.replace([10, 19], 'red cat', 1);
const InsertWord: EditStep = txt => txt.text.insert(20, ' big', 1);
const InsertAgain: EditStep = txt => txt.text.insert(0, 'Look! ', 1);

function build(props: TxtProps, text = Source) {
  return () => (<Txt fill={'white'} {...props} children={text} />) as Txt;
}

const SoftHyphens = 'The quick brown fox jumps over the lazy dog.'.replace(
  'jumps',
  'jum­ps',
);
const Hyphenate = () => (word: string) => [word];

type Row = [
  crossing: string,
  first: EditStep,
  second: EditStep,
  build: () => Txt,
];

const ROWS: Row[] = [
  ['wrapped', ReplaceWord, ReplaceAgain, paragraph],
  ['wrapped insert', InsertWord, InsertAgain, paragraph],
  ['unwrapped', ReplaceWord, InsertAgain, build({})],
  [
    'newline',
    ReplaceWord,
    ReplaceAgain,
    build({width: 160, textWrap: true}, Source.replace('jumps', '\njumps')),
  ],
  [
    'hyphenate',
    ReplaceWord,
    InsertAgain,
    build({width: 160, textWrap: true, hyphenate: Hyphenate}, SoftHyphens),
  ],
  [
    'letterSpacing',
    ReplaceWord,
    ReplaceAgain,
    build({width: 160, textWrap: true, letterSpacing: 2}),
  ],
  [
    'textAlign right',
    ReplaceWord,
    InsertAgain,
    build({width: 160, textWrap: true, textAlign: 'right'}),
  ],
  [
    'textAlign justify',
    InsertWord,
    ReplaceAgain,
    build({width: 160, textWrap: true, textAlign: 'justify'}),
  ],
  [
    'textDirection rtl',
    ReplaceWord,
    InsertAgain,
    build({width: 160, textWrap: true, textDirection: 'rtl'}),
  ],
];

/** Crossings where the picture still moves in the frame a second edit starts. */
const DEFECTS: Row[] = [
  [
    'overflowWrap anywhere, where the wrap splits a unit that moves rigidly from its start',
    ReplaceWord,
    InsertWord,
    build({width: 60, textWrap: true, overflowWrap: 'anywhere'}),
  ],
];

describe('Txt edit crossings', () => {
  mockScene2D();
  mockTextContext((text, state) => glyphWidth(text, state.font));

  it.each(ROWS)(
    'continues a second edit across %s',
    (_crossing, first, second, make) => expectContinuous(first, second, make)(),
  );

  it.fails.each(DEFECTS)(
    'continues a second edit across %s',
    (_crossing, first, second, make) => expectContinuous(first, second, make)(),
  );
});
