import {linear, waitFor} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {OverflowWrap, TextAlign, TextWrap} from '../../partials/types';
import {useScene2D} from '../../scenes';
import {Layout} from '../Layout';
import {Node} from '../Node';
import {Txt, TxtProps, TxtWrapMode} from '../Txt';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';

// Every glyph is 10px wide under mockTextContext, so widths below are exact
// character counts and every invariant can be checked with plain arithmetic
// instead of re-measuring text.
const GLYPH_WIDTH = 10;

const SHORT_WORDS = 'pack my box with five dozen liquor jugs now';
const WIDE_WORD_SENTENCE = 'short words and supercalifragilistic after it';
const OVERWIDE_WORD = 'supercalifragilistic';
const NEWLINE_SENTENCE = 'first line here\nsecond line there';

type ContentKind = 'text-prop' | 'string-children' | 'two-runs' | 'three-runs';
const CONTENTS: ContentKind[] = [
  'text-prop',
  'string-children',
  'two-runs',
  'three-runs',
];

const ALIGNS: TextAlign[] = ['left', 'center', 'right', 'justify'];
const WRAP_MODES: TxtWrapMode[] = ['greedy', 'knuth-plass'];

type Placement = 'root' | 'row' | 'column';
type BoxVariant = {name: string; width?: number; placement: Placement};

// Box width and tree placement are two separate dimensions in principle, but
// a fixed width behaves the same regardless of placement (a row/column parent
// wider than the child does not reshape it), so only the width-less variants
// cross with placement. This prunes 12 (width x placement) tuples to 6
// without dropping either dimension's distinct behavior.
const BOX_VARIANTS: BoxVariant[] = [
  {name: 'w120', width: 120, placement: 'root'},
  {name: 'w200', width: 200, placement: 'root'},
  {name: 'w320', width: 320, placement: 'root'},
  {name: 'auto-root', placement: 'root'},
  {name: 'auto-row', placement: 'row'},
  {name: 'auto-column', placement: 'column'},
];

function add(node: Node): void {
  useScene2D().getView().add(node);
}

function place(node: Txt, box: BoxVariant): void {
  if (box.placement === 'root') {
    add(node);
  } else if (box.placement === 'row') {
    add(
      <Layout layout direction={'row'} width={400}>
        {node}
      </Layout>,
    );
  } else {
    add(
      <Layout layout direction={'column'} width={220}>
        {node}
      </Layout>,
    );
  }
}

/** Split near the middle at a space boundary, for a "clean" two-run case. */
function splitAtSpace(s: string): [string, string] {
  const mid = Math.floor(s.length / 2);
  const idx = s.indexOf(' ', mid);
  const cut = idx === -1 ? mid : idx + 1;
  return [s.slice(0, cut), s.slice(cut)];
}

/** Split at arbitrary character offsets so the middle run starts/ends mid-word. */
function splitMidWord(s: string): [string, string, string] {
  const a = Math.floor(s.length * 0.3);
  const b = Math.floor(s.length * 0.7);
  return [s.slice(0, a), s.slice(a, b), s.slice(b)];
}

function buildContent(
  kind: ContentKind,
  sentence: string,
  props: TxtProps,
): Txt {
  switch (kind) {
    case 'text-prop':
      return (<Txt {...props} text={sentence} />) as Txt;
    case 'string-children':
      return (<Txt {...props}>{sentence}</Txt>) as Txt;
    case 'two-runs': {
      const [first, second] = splitAtSpace(sentence);
      return (
        <Txt {...props}>
          <Txt fill={'red'}>{first}</Txt>
          <Txt>{second}</Txt>
        </Txt>
      ) as Txt;
    }
    case 'three-runs': {
      const [first, second, third] = splitMidWord(sentence);
      return (
        <Txt {...props}>
          <Txt>{first}</Txt>
          <Txt fill={'red'}>{second}</Txt>
          <Txt>{third}</Txt>
        </Txt>
      ) as Txt;
    }
  }
}

function lineTexts(txt: Txt): string[] {
  return txt.textLines().lines.map(l => l.fragments.map(f => f.text).join(''));
}

function naturalLineWidth(line: {fragments: {text: string}[]}): number {
  const joined = line.fragments.map(f => f.text).join('');
  return joined.replace(/\s+$/, '').length * GLYPH_WIDTH;
}

class DrawProbe extends Txt {
  public probeDraw(context: CanvasRenderingContext2D) {
    // `draw` is protected; this subclass exists only to reach it from tests.
    this.draw(context);
  }
}

function makeDrawSpy(): {
  calls: {text: string; x: number; y: number}[];
  context: CanvasRenderingContext2D;
} {
  const calls: {text: string; x: number; y: number}[] = [];
  const context = {
    font: '',
    letterSpacing: '0px',
    direction: 'inherit' as CanvasDirection,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    lineDashOffset: 0,
    filter: 'none',
    save() {},
    restore() {},
    setLineDash() {},
    translate() {},
    rotate() {},
    transform() {},
    fillText(text: string, x: number, y: number) {
      calls.push({text, x, y});
    },
    strokeText() {},
  } as unknown as CanvasRenderingContext2D;
  return {calls, context};
}

/** One failure message per broken invariant, tagged with the combo that hit it. */
const FAILURES: string[] = [];

function tag(fields: Record<string, string | number | boolean>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
}

describe('Txt feature crossings', () => {
  mockScene2D();
  mockTextContext(GLYPH_WIDTH);

  // All layout checks run inside `it`s (rather than directly in the describe
  // body) so the scene from `mockScene2D`'s `beforeAll` exists by the time
  // nodes are built; the classification `it`s below then read the `FAILURES`
  // these fill in. The sweep is split one `it` per alignment so no single
  // test approaches the default timeout.
  for (const align of ALIGNS) {
    it(`builds the crossing failure set: align=${align}`, () => {
      // --- Main sweep: content x wrap x wrapMode x box, one sentence. ---
      // Wide-word coverage and overflowWrap variation live in smaller
      // dedicated `it`s below instead of crossing every dimension.
      const WRAPS: TextWrap[] = [true, false];

      for (const wrap of WRAPS) {
        for (const wrapMode of WRAP_MODES) {
          for (const box of BOX_VARIANTS) {
            const settingTag = tag({
              sentence: 'short',
              align,
              wrap: String(wrap),
              wrapMode,
              box: box.name,
            });
            const byContent = new Map<ContentKind, Txt>();
            for (const content of CONTENTS) {
              const props: TxtProps = {
                fontSize: 16,
                lineHeight: 20,
                textAlign: align,
                textWrap: wrap,
                wrapMode,
                ...(box.width !== undefined ? {width: box.width} : {}),
              };
              const txt = buildContent(content, SHORT_WORDS, props);
              place(txt, box);
              byContent.set(content, txt);

              const layout = txt.textLines();
              const words = txt.textWords();
              const size = txt.size();

              // Invariant 1: no line overflows a fixed, wrapped width, except
              // a lone unbreakable word wider than the box, or a non-last
              // Knuth-Plass justified line (planned overfull on purpose, then
              // squeezed to fit by negative justify spacing at render time —
              // see `Txt knuth-plass justify` in knuthPlass.test.tsx).
              const fixedWidth = box.width;
              if (wrap === true && fixedWidth !== undefined) {
                layout.lines.forEach((line, lineIdx) => {
                  const natural = naturalLineWidth(line);
                  const joined = line.fragments
                    .map(f => f.text)
                    .join('')
                    .trim();
                  const isLoneWord = joined.length > 0 && !/\s/.test(joined);
                  const isCompressibleKpJustifyLine =
                    wrapMode === 'knuth-plass' &&
                    align === 'justify' &&
                    lineIdx < layout.lines.length - 1;
                  if (
                    natural > fixedWidth + 0.01 &&
                    !isLoneWord &&
                    !isCompressibleKpJustifyLine
                  ) {
                    FAILURES.push(
                      `inv1 overflow ${settingTag} content=${content}: "${joined}" natural=${natural} > box=${fixedWidth}`,
                    );
                  }
                });
              }

              // Invariant 2: words on the same line never overlap.
              const byLine = new Map<number, typeof words>();
              for (const w of words) {
                const arr = byLine.get(w.lineIndex) ?? [];
                arr.push(w);
                byLine.set(w.lineIndex, arr);
              }
              for (const [lineIdx, lineWords] of byLine) {
                const sorted = [...lineWords].sort((a, b) => a.x - b.x);
                for (let i = 1; i < sorted.length; i++) {
                  const prev = sorted[i - 1];
                  const next = sorted[i];
                  if (
                    prev.x + prev.width / 2 >
                    next.x - next.width / 2 + 0.01
                  ) {
                    FAILURES.push(
                      `inv2 overlap ${settingTag} content=${content} line=${lineIdx}: "${prev.text}"@${prev.x} vs "${next.text}"@${next.x}`,
                    );
                  }
                }
              }

              // Invariant 5: yoga size matches the laid-out text.
              if (box.width !== undefined && box.placement === 'root') {
                if (Math.abs(size.x - box.width) > 0.01) {
                  FAILURES.push(
                    `inv5 width ${settingTag} content=${content}: size.x=${size.x} expected=${box.width}`,
                  );
                }
              } else if (box.width === undefined && box.placement === 'root') {
                // Only a true root placement leaves the box free to size to
                // its content; a row/column parent may stretch or clip the
                // child to its own width regardless of the text's natural
                // width, which is that parent's behavior, not Txt's.
                const widest = Math.max(
                  0,
                  ...layout.lines.map(naturalLineWidth),
                );
                if (Math.abs(size.x - widest) > 0.5) {
                  FAILURES.push(
                    `inv5 auto-width ${settingTag} content=${content}: size.x=${size.x} widest=${widest}`,
                  );
                }
              }
              const expectedHeight = layout.lines.length * layout.lineHeight;
              if (Math.abs(size.y - expectedHeight) > 0.5) {
                FAILURES.push(
                  `inv5 height ${settingTag} content=${content}: size.y=${size.y} expected=${expectedHeight}`,
                );
              }
            }

            // Invariant 3: identical text and settings produce identical breaks
            // and word positions across every content form.
            const reference = byContent.get('text-prop');
            if (reference) {
              const refLines = lineTexts(reference);
              const refWordX = reference.textWords().map(w => w.x);
              for (const content of CONTENTS) {
                if (content === 'text-prop') continue;
                const other = byContent.get(content);
                if (!other) continue;
                const otherLines = lineTexts(other);
                if (JSON.stringify(otherLines) !== JSON.stringify(refLines)) {
                  FAILURES.push(
                    `inv3 lines ${settingTag} content=${content}: ${JSON.stringify(otherLines)} !== ${JSON.stringify(refLines)}`,
                  );
                  continue;
                }
                const otherWordX = other.textWords().map(w => w.x);
                if (otherWordX.length === refWordX.length) {
                  otherWordX.forEach((x, i) => {
                    if (Math.abs(x - refWordX[i]) > 0.01) {
                      FAILURES.push(
                        `inv3 wordx ${settingTag} content=${content} idx=${i}: ${x} !== ${refWordX[i]}`,
                      );
                    }
                  });
                }
              }
            }
          }
        }
      }
    });
  }

  // --- Dedicated loop: wide-word sentence x overflowWrap, fixed width only.
  it('builds the crossing failure set: wide word', () => {
    const overflowWraps: OverflowWrap[] = ['normal', 'anywhere'];
    for (const content of CONTENTS) {
      for (const align of ['left', 'justify'] as TextAlign[]) {
        for (const wrapMode of WRAP_MODES) {
          for (const overflowWrap of overflowWraps) {
            const settingTag = tag({
              sentence: 'wide-word',
              content,
              align,
              wrapMode,
              overflowWrap,
              box: 'w120',
            });
            const props: TxtProps = {
              fontSize: 16,
              lineHeight: 20,
              width: 120,
              textAlign: align,
              textWrap: true,
              wrapMode,
              overflowWrap,
            };
            const txt = buildContent(content, WIDE_WORD_SENTENCE, props);
            add(txt);
            const layout = txt.textLines();
            for (const line of layout.lines) {
              const natural = naturalLineWidth(line);
              const joined = line.fragments
                .map(f => f.text)
                .join('')
                .trim();
              const isLoneWord = joined.length > 0 && !/\s/.test(joined);
              const exempt = isLoneWord && overflowWrap === 'normal';
              if (natural > 120 + 0.01 && !exempt) {
                FAILURES.push(
                  `inv1 overflow ${settingTag}: "${joined}" natural=${natural} > 120`,
                );
              }
            }
            if (overflowWrap === 'anywhere') {
              const stillContainsWhole = layout.lines.some(line =>
                line.fragments.some(f => f.text.includes(OVERWIDE_WORD)),
              );
              if (stillContainsWhole) {
                FAILURES.push(
                  `inv1-anywhere ${settingTag}: over-wide word was not split`,
                );
              }
            }
          }
        }
      }
    }
  });

  // --- Dedicated case: rich (multi-run) text never runs Knuth-Plass, so it
  // can break at different words than single-run text laid out with the
  // same settings. The run boundary sits inside a word (not on a space) so
  // this isolates the break choice from the space-loss defect above.
  it('builds the crossing failure set: Knuth-Plass fallback', () => {
    const kpSentence = 'aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd';
    const cut = 15; // inside "bbbbbbbbbb", away from any space
    const settingTag = tag({sentence: 'kp-fallback', content: 'two-runs'});
    const plain = buildContent('text-prop', kpSentence, {
      fontSize: 16,
      lineHeight: 20,
      width: 150,
      textWrap: true,
      wrapMode: 'knuth-plass',
    });
    add(plain);
    const rich = (
      <Txt
        fontSize={16}
        lineHeight={20}
        width={150}
        textWrap
        wrapMode={'knuth-plass'}
      >
        <Txt>{kpSentence.slice(0, cut)}</Txt>
        <Txt fill={'red'}>{kpSentence.slice(cut)}</Txt>
      </Txt>
    ) as Txt;
    add(rich);
    const plainLines = lineTexts(plain);
    const richLines = lineTexts(rich);
    if (JSON.stringify(plainLines) !== JSON.stringify(richLines)) {
      FAILURES.push(
        `inv3 lines ${settingTag}: ${JSON.stringify(richLines)} !== ${JSON.stringify(plainLines)}`,
      );
    }
  });

  // --- Dedicated loop: textWrap='pre' with an embedded newline. ---
  it('builds the crossing failure set: explicit newlines', () => {
    for (const content of ['text-prop', 'two-runs'] as ContentKind[]) {
      const settingTag = tag({sentence: 'newline', content, wrap: 'pre'});
      const props: TxtProps = {
        fontSize: 16,
        lineHeight: 20,
        width: 200,
        textWrap: 'pre',
        textAlign: 'left',
      };
      const txt = buildContent(content, NEWLINE_SENTENCE, props);
      add(txt);
      const lines = lineTexts(txt);
      if (lines.length < 2) {
        FAILURES.push(`inv-pre ${settingTag}: newline was not preserved`);
      }
    }
  });

  // --- Dedicated loop: autoSize on/off. ---
  it('builds the crossing failure set: autoSize', () => {
    const autosizeSentence = 'pack my box with five dozen liquor jugs';
    for (const content of ['text-prop', 'two-runs'] as ContentKind[]) {
      for (const align of ['left', 'justify'] as TextAlign[]) {
        for (const wrapMode of WRAP_MODES) {
          for (const wrap of [true, false] as TextWrap[]) {
            const settingTag = tag({
              sentence: 'autosize',
              content,
              align,
              wrapMode,
              wrap: String(wrap),
            });
            const props: TxtProps = {
              autoSize: true,
              fontSize: 40,
              width: 200,
              height: 80,
              textAlign: align,
              textWrap: wrap,
              wrapMode,
            };
            const txt = buildContent(content, autosizeSentence, props);
            add(txt);
            const effective = txt.effectiveFontSize();
            const layout = txt.textLines();
            const widest = Math.max(0, ...layout.lines.map(naturalLineWidth));
            const scaledHeight =
              layout.lines.length * layout.lineHeight * (effective / 40);
            const fitsWidth = widest * (effective / 40) <= 200 + 0.5;
            const fitsHeight = scaledHeight <= 80 + 0.5;
            if (!(fitsWidth && fitsHeight) && effective > 1.01) {
              FAILURES.push(
                `inv6 autosize ${settingTag}: effective=${effective} widest=${widest} lines=${layout.lines.length}`,
              );
            }
          }
        }
      }
    }
  });

  // --- Dedicated subset: draw() paints exactly where textGlyphs() reports. ---
  // Restricted to single-fragment-per-line content: multi-run fragment
  // boundaries would need per-fragment grapheme bookkeeping this sweep does
  // not attempt.
  it('builds the crossing failure set: paint matches queries', () => {
    let calibratedOffsetY: number | null = null;
    for (const content of ['text-prop', 'string-children'] as ContentKind[]) {
      for (const wrapMode of WRAP_MODES) {
        const settingTag = tag({content, wrapMode, sentence: 'short'});
        const txt = new DrawProbe({
          fontSize: 16,
          lineHeight: 20,
          width: 200,
          textAlign: 'left',
          textWrap: true,
          wrapMode,
          ...(content === 'text-prop'
            ? {text: SHORT_WORDS}
            : {children: SHORT_WORDS}),
        });
        add(txt);
        const glyphs = txt.textGlyphs();
        const lineCount = txt.textLines().lines.length;
        const {calls, context} = makeDrawSpy();
        txt.probeDraw(context);

        if (calls.length !== lineCount) {
          FAILURES.push(
            `inv4 ${settingTag}: painted ${calls.length} fragments for ${lineCount} lines`,
          );
          continue;
        }
        calls.forEach((call, lineIdx) => {
          const glyph0 = glyphs.find(
            g => g.lineIndex === lineIdx && g.indexInLine === 0,
          );
          if (!glyph0) {
            FAILURES.push(`inv4 ${settingTag}: no glyph0 for line=${lineIdx}`);
            return;
          }
          const expectedX = glyph0.x - glyph0.width / 2;
          if (Math.abs(call.x - expectedX) > 0.01) {
            FAILURES.push(
              `inv4 x ${settingTag} line=${lineIdx}: drawn=${call.x} expected=${expectedX}`,
            );
          }
          if (calibratedOffsetY === null) {
            calibratedOffsetY = call.y - glyph0.y;
          } else {
            const expectedY = glyph0.y + calibratedOffsetY;
            if (Math.abs(call.y - expectedY) > 0.01) {
              FAILURES.push(
                `inv4 y ${settingTag} line=${lineIdx}: drawn=${call.y} expected=${expectedY}`,
              );
            }
          }
        });
      }
    }
  });

  // --- Dedicated subset: a settled tween matches a fresh node with the same
  // final text, across a handful of representative settings.
  const tweenFrom = 'quick fox runs';
  const tweenTo = SHORT_WORDS;
  for (const align of ['left', 'justify'] as TextAlign[]) {
    for (const wrapMode of WRAP_MODES) {
      for (const content of ['text-prop', 'two-runs'] as ContentKind[]) {
        const settingTag = tag({align, wrapMode, content});
        it(
          `settled tween matches a fresh node: ${settingTag}`,
          generatorTest(function* () {
            const props: TxtProps = {
              fontSize: 16,
              lineHeight: 20,
              width: 150,
              textAlign: align,
              textWrap: true,
              wrapMode,
              text: tweenFrom,
            };
            const tweened = (<Txt {...props} />) as Txt;
            add(tweened);

            yield tweened.text(tweenTo, 0.5, linear);
            yield* waitFor(0.6);

            const fresh = buildContent(content, tweenTo, {
              fontSize: 16,
              lineHeight: 20,
              width: 150,
              textAlign: align,
              textWrap: true,
              wrapMode,
            });
            add(fresh);

            const tweenedLines = lineTexts(tweened);
            const freshLines = lineTexts(fresh);
            if (JSON.stringify(tweenedLines) !== JSON.stringify(freshLines)) {
              FAILURES.push(
                `inv7 ${settingTag}: ${JSON.stringify(tweenedLines)} !== ${JSON.stringify(freshLines)}`,
              );
            }
          }),
        );
      }
    }
  }

  // --- Known-defect classification. ---
  // Each matcher's id is stable and its description is one line; when a fix
  // makes its count reach zero, the matching `it` below fails and names the
  // matcher to delete.
  /** Pull the two compared JSON line-arrays out of an `inv3`/`inv7` message. */
  function comparedArrays(m: string): [string[], string[]] | null {
    const match = m.match(/: (\[.*\]) !== (\[.*\])$/);
    if (!match) return null;
    try {
      return [JSON.parse(match[1]), JSON.parse(match[2])];
    } catch {
      return null;
    }
  }

  /** `inv5 auto-width ...: size.x=A widest=B` differing by exactly one glyph. */
  function isOneGlyphSizeGap(m: string): boolean {
    const match = m.match(/size\.x=(-?\d+(?:\.\d+)?) widest=(-?\d+(?:\.\d+)?)/);
    if (!match) return false;
    return Math.abs(Number(match[1]) - Number(match[2])) === GLYPH_WIDTH;
  }

  const knownDefects: {
    id: string;
    description: string;
    test: (m: string) => boolean;
  }[] = [
    {
      id: 'rich-run-boundary-space-loss',
      description:
        'a space that falls at the boundary between two runs is dropped from the reported line text, though its width stays reserved (size().x still counts it)',
      test: m => {
        if (!/content=(two|three)-runs/.test(m)) return false;
        if (m.startsWith('inv5 auto-width')) return isOneGlyphSizeGap(m);
        if (!m.startsWith('inv3 lines') && !m.startsWith('inv7 ')) {
          return false;
        }
        const arrays = comparedArrays(m);
        if (!arrays) return false;
        const [other, ref] = arrays;
        // A dropped space never moves a non-space character to a different
        // line, so stripping whitespace from each line (not the whole text —
        // that would also match a genuinely different word grouping) must
        // still line up index for index.
        if (other.length !== ref.length) return false;
        const noSpace = (lines: string[]) =>
          lines.map(l => l.replace(/\s+/g, ''));
        const otherNoSpace = noSpace(other);
        const refNoSpace = noSpace(ref);
        const sameShape = otherNoSpace.every((l, i) => l === refNoSpace[i]);
        return sameShape && JSON.stringify(other) !== JSON.stringify(ref);
      },
    },
    {
      id: 'justify-multi-run-overlap',
      description:
        'justify misplaces or overlaps words once a line has more than one run',
      test: m =>
        m.includes('align=justify') &&
        (m.includes('content=two-runs') || m.includes('content=three-runs')) &&
        (m.startsWith('inv2 ') ||
          m.startsWith('inv3 ') ||
          m.startsWith('inv4 ')),
    },
    {
      id: 'knuth-plass-ignores-overflow-anywhere',
      description:
        'Knuth-Plass never splits a word, so overflowWrap: anywhere has no effect under wrapMode: knuth-plass — an over-wide word stays whole and overflows',
      test: m =>
        (m.startsWith('inv1 overflow') || m.startsWith('inv1-anywhere')) &&
        m.includes('wrapMode=knuth-plass') &&
        m.includes('overflowWrap=anywhere'),
    },
    {
      id: 'rich-path-line-breaking',
      description:
        'multi-run text never uses Knuth-Plass, so it breaks lines differently from single-run text with the same content once Knuth-Plass would have chosen a different break',
      test: m =>
        m.startsWith('inv3 ') &&
        (m.includes('content=two-runs') || m.includes('content=three-runs')),
    },
    {
      id: 'autosize-ignores-nowrap',
      description: 'autoSize does not shrink text when textWrap is false',
      test: m => m.startsWith('inv6 autosize') && m.includes('wrap=false'),
    },
  ];

  // `FAILURES` is only populated once the sweep `it` above has run, so this
  // classifies fresh inside each assertion rather than once at collection
  // time (describe bodies run before any `it`).
  function classify(): {unexpected: string[]; byDefect: Map<string, string[]>} {
    const unexpected: string[] = [];
    const byDefect = new Map<string, string[]>();
    for (const failure of FAILURES) {
      const match = knownDefects.find(d => d.test(failure));
      if (match) {
        const arr = byDefect.get(match.id) ?? [];
        arr.push(failure);
        byDefect.set(match.id, arr);
      } else {
        unexpected.push(failure);
      }
    }
    return {unexpected, byDefect};
  }

  it('has no unclassified invariant failures', () => {
    expect(classify().unexpected).toEqual([]);
  });

  for (const defect of knownDefects) {
    it(`known defect: ${defect.id}`, () => {
      expect(classify().byDefect.get(defect.id)?.length ?? 0).toBeGreaterThan(
        0,
      );
    });
  }
});
