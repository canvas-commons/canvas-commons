import {all, createRef} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Layout} from '../Layout';
import {Node} from '../Node';
import {Rect} from '../Rect';
import {Txt, TxtProps} from '../Txt';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';

const Syllables = (word: string) => word.match(/.{1,4}/g) ?? [word];

function lineTexts(txt: Txt): string[] {
  return txt
    .textLines()
    .lines.map(line => line.fragments.map(f => f.text).join(''));
}

function add(node: Node): void {
  useScene2D().getView().add(node);
}

/**
 * A `Txt` in a 300-wide row beside a sibling that overflows it, so flex shrink
 * pushes the text well below its natural width.
 */
function squeezed(props: TxtProps, sibling = 1000): Txt {
  const txt = createRef<Txt>();
  add(
    <Layout layout width={300}>
      <Txt ref={txt} fontSize={10} lineHeight={20} {...props} />
      <Rect width={sibling} height={20} />
    </Layout>,
  );
  return txt();
}

function inRow(props: TxtProps): Txt {
  const txt = createRef<Txt>();
  add(
    <Layout layout width={300}>
      <Txt ref={txt} fontSize={10} lineHeight={20} {...props} />
    </Layout>,
  );
  return txt();
}

/**
 * Put `node` in a 300-wide row beside a rigid sibling that overflows it, so
 * every row below settles exactly on its automatic minimum.
 */
function squeezedIn<TNode extends Layout>(node: TNode): TNode {
  add(
    <Layout layout width={300}>
      {node}
      <Rect width={1000} height={20} shrink={0} />
    </Layout>,
  );
  return node;
}

const T = (text: string, props: TxtProps = {}) =>
  (<Txt fontSize={10} lineHeight={20} text={text} {...props} />) as Txt;

type Row = {
  name: string;
  build: () => Txt;
  width: number;
  lines: string[];
};

type WidthRow = {
  name: string;
  build: () => Layout;
  width: number;
};

// Every glyph measures ten units, so each width below reads as a character
// count times ten.
const Rows: Row[] = [
  {
    name: 'a squeezed short word keeps its whole width',
    build: () => squeezed({text: 'hi'}),
    width: 20,
    lines: ['hi'],
  },
  {
    name: 'a squeezed sentence stops at its widest word',
    build: () => squeezed({text: 'one two three'}),
    width: 50,
    lines: ['one ', 'two ', 'three'],
  },
  {
    name: 'a squeezed overlong word overflows instead of splitting',
    build: () => squeezed({text: 'supercalifragilistic'}),
    width: 200,
    lines: ['supercalifragilistic'],
  },
  {
    name: 'overflowWrap anywhere splits the overlong word',
    build: () =>
      squeezed({text: 'supercalifragilistic', overflowWrap: 'anywhere'}),
    width: 50,
    lines: ['super', 'calif', 'ragil', 'istic'],
  },
  {
    name: 'a newline makes the longest line the floor',
    build: () => squeezed({text: 'aa\nbbbb'}),
    width: 40,
    lines: ['aa', 'bbbb'],
  },
  {
    name: 'textWrap false keeps the whole line',
    build: () => squeezed({text: 'one two three', textWrap: false}),
    width: 130,
    lines: ['one two three'],
  },
  {
    name: 'textWrap pre keeps its widest word and its spaces',
    build: () => squeezed({text: '  ab  ', textWrap: 'pre'}),
    width: 20,
    lines: ['  ', 'ab  '],
  },
  {
    name: 'a declared minWidth wins over the content floor',
    build: () => squeezed({text: 'one two three', minWidth: 100}),
    width: 100,
    lines: ['one two ', 'three'],
  },
  {
    name: 'a declared width caps the floor and no word splits',
    build: () => squeezed({text: 'one two three', width: 45}),
    width: 45,
    lines: ['one ', 'two ', 'three'],
  },
  {
    name: 'a percentage width resolves against the row',
    build: () => inRow({text: 'one two three', width: '20%'}),
    width: 60,
    lines: ['one ', 'two ', 'three'],
  },
  {
    name: 'maxWidth caps an unsqueezed text',
    build: () => inRow({text: 'one two three', maxWidth: 80}),
    width: 80,
    lines: ['one two ', 'three'],
  },
  {
    name: 'shrink 0 keeps the natural width',
    build: () => squeezed({text: 'one two three', shrink: 0}),
    width: 130,
    lines: ['one two three'],
  },
  {
    name: 'grow fills the row',
    build: () => squeezed({text: 'hi', grow: 1}, 100),
    width: 200,
    lines: ['hi'],
  },
  {
    name: 'a narrow column parent keeps its width and overflows',
    build: () => {
      const txt = createRef<Txt>();
      add(
        <Layout layout direction={'column'} width={40}>
          <Txt ref={txt} fontSize={10} lineHeight={20}>
            one two three
          </Txt>
        </Layout>,
      );
      return txt();
    },
    width: 40,
    lines: ['one ', 'two ', 'three'],
  },
  {
    name: 'a layout root keeps its natural width',
    build: () => {
      const txt = createRef<Txt>();
      add(
        <Txt ref={txt} fontSize={10} lineHeight={20} text={'one two three'} />,
      );
      return txt();
    },
    width: 130,
    lines: ['one two three'],
  },
  {
    name: 'hyphenation makes a syllable the floor',
    build: () => squeezed({text: 'abcdefghij', hyphenate: () => Syllables}),
    width: 40,
    lines: ['abcd-', 'efgh-', 'ij'],
  },
  {
    name: 'letterSpacing widens the floor',
    build: () => squeezed({text: 'one two three', letterSpacing: 2}),
    width: 60,
    lines: ['one ', 'two ', 'three'],
  },
  {
    name: 'wordBreak keep-all holds a CJK run together',
    build: () => squeezed({text: '中文文字 排版', wordBreak: 'keep-all'}),
    width: 40,
    lines: ['中文文字 ', '排版'],
  },
  {
    name: 'a nested styled Txt contributes its own widest word',
    build: () => {
      const txt = createRef<Txt>();
      add(
        <Layout layout width={300}>
          <Txt ref={txt} fontSize={10} lineHeight={20}>
            <Txt fontWeight={700}>bold</Txt> tail
          </Txt>
          <Rect width={1000} height={20} />
        </Layout>,
      );
      return txt();
    },
    width: 40,
    lines: ['bold', 'tail'],
  },
  {
    name: 'an inline Layout child is an unbreakable run',
    build: () => {
      const txt = createRef<Txt>();
      add(
        <Layout layout width={300}>
          <Txt ref={txt} fontSize={10} lineHeight={20}>
            hi
            <Rect width={60} height={10} />
          </Txt>
          <Rect width={1000} height={20} />
        </Layout>,
      );
      return txt();
    },
    width: 60,
    lines: ['hi', '￼'],
  },
];

// A container in a squeezed row gets the same automatic minimum as CSS gives
// a flex item, so the widths below read as its content plus its own spacing.
const ContainerRows: WidthRow[] = [
  {
    name: 'a nested container keeps the width of its deepest row',
    build: () =>
      squeezedIn(
        (
          <Layout direction={'column'}>
            <Layout>
              {T('ab')}
              {T('cde')}
            </Layout>
          </Layout>
        ) as Layout,
      ),
    width: 50,
  },
  {
    name: 'a row container counts its gaps and padding',
    build: () =>
      squeezedIn(
        (
          <Layout gap={8} paddingLeft={5} paddingRight={5}>
            {T('ab')}
            {T('cde')}
          </Layout>
        ) as Layout,
      ),
    width: 68,
  },
  {
    name: 'a wrapping row container takes its widest child',
    build: () =>
      squeezedIn(
        (
          <Layout wrap={'wrap'}>
            {T('ab')}
            {T('cde')}
          </Layout>
        ) as Layout,
      ),
    width: 30,
  },
  {
    name: 'a declared child width replaces its content',
    build: () =>
      squeezedIn(
        (
          <Layout direction={'column'}>{T('ab', {width: 70})}</Layout>
        ) as Layout,
      ),
    width: 70,
  },
  {
    name: 'a percentage child width contributes nothing',
    build: () =>
      squeezedIn(
        (
          <Layout direction={'column'}>
            {T('ab', {width: '50%'})}
            {T('cde')}
          </Layout>
        ) as Layout,
      ),
    width: 30,
  },
  {
    name: 'a child minWidth raises its share',
    build: () =>
      squeezedIn(
        (
          <Layout direction={'column'}>{T('ab', {minWidth: 70})}</Layout>
        ) as Layout,
      ),
    width: 70,
  },
  {
    name: 'a child outside the layout contributes nothing',
    build: () =>
      squeezedIn(
        (
          <Layout direction={'column'}>
            {T('ab')}
            <Rect layout={false} width={500} height={10} />
          </Layout>
        ) as Layout,
      ),
    width: 20,
  },
  {
    name: 'a row-reverse parent gives the same floor',
    build: () => {
      const column = (
        <Layout direction={'column'}>
          {T('ab')}
          {T('cde')}
        </Layout>
      ) as Layout;
      add(
        <Layout layout direction={'row-reverse'} width={300}>
          {column}
          <Rect width={1000} height={20} shrink={0} />
        </Layout>,
      );
      return column;
    },
    width: 30,
  },
  {
    name: 'a column parent gives its child no floor',
    build: () => {
      const inner = (<Layout>{T('cde')}</Layout>) as Layout;
      add(
        <Layout layout direction={'column'} width={20}>
          {inner}
        </Layout>,
      );
      return inner;
    },
    width: 20,
  },
  {
    name: 'maxWidth caps the floor',
    build: () =>
      squeezedIn(
        (
          <Layout direction={'column'} maxWidth={25}>
            {T('cde')}
          </Layout>
        ) as Layout,
      ),
    width: 25,
  },
  {
    name: 'a row of fixed-width children keeps room for all of them',
    build: () =>
      squeezedIn(
        (
          <Layout>
            <Rect width={30} height={10} />
            <Rect width={30} height={10} />
            <Rect width={30} height={10} />
          </Layout>
        ) as Layout,
      ),
    width: 90,
  },
  {
    name: 'a minWidth of zero lets a container squeeze again',
    build: () =>
      squeezedIn(
        (
          <Layout minWidth={0}>
            <Rect width={30} height={10} />
            <Rect width={30} height={10} />
            <Rect width={30} height={10} />
          </Layout>
        ) as Layout,
      ),
    width: 0,
  },
  {
    name: 'overflowWrap anywhere drops that text from the floor',
    build: () =>
      squeezedIn(
        (
          <Layout direction={'column'}>
            {T('abcdefgh', {overflowWrap: 'anywhere'})}
            {T('ab')}
          </Layout>
        ) as Layout,
      ),
    width: 20,
  },
];

describe('Txt minimum content width', () => {
  mockScene2D();
  mockTextContext(10);

  it('keeps a line-number column beside an overflowing block', () => {
    const column = createRef<Layout>();
    const nine = createRef<Txt>();
    const ten = createRef<Txt>();
    const block = createRef<Rect>();
    add(
      <Layout layout width={420} gap={16}>
        <Layout ref={column} direction={'column'}>
          <Txt ref={nine} fontSize={10} lineHeight={20} text={'9'} />
          <Txt ref={ten} fontSize={10} lineHeight={20} text={'10'} />
        </Layout>
        <Rect ref={block} width={600} height={20} />
      </Layout>,
    );

    expect(column().size.x()).toBeCloseTo(20);
    expect(nine().size.x()).toBeCloseTo(20);
    expect(ten().size.x()).toBeCloseTo(20);
    expect(block().left().x - column().right().x).toBeCloseTo(16);
  });

  for (const row of Rows) {
    it(row.name, () => {
      const txt = row.build();
      expect(txt.size.x()).toBeCloseTo(row.width);
      expect(lineTexts(txt)).toEqual(row.lines);
    });
  }

  for (const row of ContainerRows) {
    it(row.name, () => {
      expect(row.build().size.x()).toBeCloseTo(row.width);
    });
  }

  it(
    'never splits a word while the text tweens in a squeezed row',
    generatorTest(function* () {
      const txt = squeezed({text: 'one two three', width: 45});

      // A break inside a word turns one word of the text into two lines, so
      // the words read off the lines stop matching the words of the text.
      const words = (source: string) => source.split(/\s+/).filter(Boolean);
      const split: string[][] = [];
      let wrapped = 0;
      const sample = function* () {
        for (let frame = 0; frame < 60; frame++) {
          const lines = lineTexts(txt);
          if (lines.length > 1) wrapped++;
          const laid = lines.flatMap(words);
          if (laid.join(' ') !== words(txt.text()).join(' ')) split.push(laid);
          yield;
        }
      };

      yield* all(txt.text('longer words here', 1), sample());

      expect(wrapped).toBeGreaterThan(0);
      expect(split).toEqual([]);
    }),
  );
});
