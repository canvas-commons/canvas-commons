import {linear, waitFor} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {TextAlign} from '../../partials/types';
import {segment} from '../../text';
import {Layout} from '../Layout';
import {Rect} from '../Rect';
import {Txt, TxtProps} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';
import {PaintCall} from './recordingTextContext';
import {add, lineTexts} from './sceneFixtures';
import {
  ContentForm,
  DrawProbe,
  Finding,
  buildForm,
  describeWord,
  expectNoFindings,
  fakeFont,
  fillCalls,
  inkSpan,
  matchedUnits,
  mockFontWidth,
  round,
  sameWord,
  wordRecords,
} from './textInvariants';

const TOLERANCE = 0.05;
const FONT_SIZE = 16;
const LINE_HEIGHT = 20;
const ROW_WIDTH = 400;
const FAKE_FONT = `500 ${FONT_SIZE}px Roboto`;

/**
 * Sentences the surveyed scenes reveal, wrap and tween. Every crossing below
 * stands for a fixture site, not for a generated combination.
 */
const SENTENCE = 'pack my box with five dozen liquor jugs now';

/** Words of a node, measured from the left edge of its own box. */
function wordsFromLeftEdge(txt: Txt, source: string) {
  const half = txt.size().x / 2;
  return wordRecords(txt, source).map(word => ({
    ...word,
    left: word.left + half,
    right: word.right + half,
  }));
}

/** Words of `txt` that do not sit where `reference` puts the same word. */
function movedWords(
  kind: string,
  key: string,
  txt: Txt,
  reference: Txt,
  source: string,
): Finding[] {
  const actual = wordsFromLeftEdge(txt, source);
  const expected = wordsFromLeftEdge(reference, source);
  const findings: Finding[] = [];
  const pairs = matchedUnits(
    expected.map(word => `${word.text}@${word.from}`),
    actual.map(word => `${word.text}@${word.from}`),
  );
  for (const [left, right] of pairs) {
    if (sameWord(expected[left], actual[right])) continue;
    findings.push({
      kind,
      key,
      evidence: [
        describeWord(expected[left]),
        describeWord(actual[right]),
        round(actual[right].left - expected[left].left),
      ],
    });
  }
  return findings;
}

/* 1. A paint-only span inside wrapped text, driven by `.text(value, duration)`.
      `official-examples/examples/anniversary/src/scenes/intro.tsx`. */

const SPAN_TWEEN_PROPS: TxtProps = {
  fontSize: FONT_SIZE,
  lineHeight: LINE_HEIGHT,
  width: 150,
  textWrap: true,
  textAlign: 'center',
};

function spanTweenNode(tail: string): {node: Txt; span: Txt} {
  const span = new Txt({fill: 'red', children: tail});
  const node = new Txt({
    ...SPAN_TWEEN_PROPS,
    children: [new Txt({children: 'pack my '}), span],
  });
  return {node, span};
}

/* 2. A typewriter reveal on centred, `maxWidth`-bounded, wrapped text.
      `bufferhead-written-in-code/src/components/TypewriterText.tsx`. */

const TYPEWRITER_PROPS: TxtProps = {
  fontSize: FONT_SIZE,
  lineHeight: LINE_HEIGHT,
  maxWidth: 200,
  textWrap: true,
  textAlign: 'center',
};

function collectTypewriter(): Finding[] {
  const words = SENTENCE.split(' ');
  const grown = new Txt({...TYPEWRITER_PROPS, text: ''});
  add(grown);
  const findings: Finding[] = [];
  for (let count = 1; count <= words.length; count++) {
    const prefix = words.slice(0, count).join(' ');
    grown.text(prefix);
    const fresh = new Txt({...TYPEWRITER_PROPS, text: prefix});
    add(fresh);
    const key = `reveal-${count}`;

    const grownLines = JSON.stringify(lineTexts(grown));
    const freshLines = JSON.stringify(lineTexts(fresh));
    if (grownLines !== freshLines) {
      findings.push({
        kind: 'reveal-lines',
        key,
        evidence: [freshLines, grownLines],
      });
    }
    const grownSize = grown.size();
    const freshSize = fresh.size();
    if (Math.abs(grownSize.x - freshSize.x) > TOLERANCE) {
      findings.push({
        kind: 'reveal-width',
        key,
        evidence: [round(freshSize.x), round(grownSize.x)],
      });
    }
    findings.push(...movedWords('reveal-word', key, grown, fresh, prefix));
  }
  return findings;
}

/* 3. A `Txt` as a flex child with a percentage width and `textWrap`.
      `mattgrogan-mc/old/scenes/all_day_678/intro.tsx`. */

const PERCENT_WIDTHS = ['40%', '60%'] as const;

/** Ink of a line in the fake font, letter spacing between its glyphs only. */
function lineInk(line: {
  fragments: {text: string; style: {font: string; letterSpacing: number}}[];
}): number {
  let width = 0;
  for (const fragment of line.fragments) {
    const text = fragment.text.replace(/\s+$/, '');
    width += mockFontWidth(text, {
      font: fragment.style.font,
      letterSpacing: `${fragment.style.letterSpacing}px`,
    });
  }
  return width;
}

function collectFlexPercent(): Finding[] {
  const findings: Finding[] = [];
  for (const width of PERCENT_WIDTHS) {
    for (const align of ['start', 'stretch'] as const) {
      const txt = new Txt({
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        width,
        alignSelf: align,
        textWrap: true,
        text: SENTENCE,
      });
      add(
        new Layout({
          layout: true,
          direction: 'row',
          width: ROW_WIDTH,
          height: 200,
          children: txt,
        }),
      );
      const key = `${width}|${align}`;
      const expected = (parseFloat(width) / 100) * ROW_WIDTH;
      if (Math.abs(txt.size().x - expected) > TOLERANCE) {
        findings.push({
          kind: 'flex-width',
          key,
          evidence: [round(expected), round(txt.size().x)],
        });
      }
      for (const line of txt.textLines().lines) {
        const text = line.fragments.map(fragment => fragment.text).join('');
        if (lineInk(line) > expected + TOLERANCE && /\s/.test(text.trim())) {
          findings.push({
            kind: 'flex-overflow',
            key,
            evidence: [round(lineInk(line) - expected), text.trim()],
          });
        }
      }
    }
  }
  return findings;
}

/* 4. A `Txt` squeezed in a row beside a sibling that will not shrink.
      `mattgrogan-mc/old/scenes/boxcars/reportCard.tsx` puts a label column
      beside a wide block. */

const SQUEEZED_ROW = 300;

type FloorCase = {
  name: string;
  props: TxtProps;
  /** Narrowest width the text can be laid out in. */
  floor: number;
  /** False where the case opts out of the floor and means to overflow. */
  contained?: boolean;
};

function widestWord(text: string): number {
  return Math.max(
    ...text
      .split(/\s+/)
      .map(word =>
        mockFontWidth(word, {font: FAKE_FONT, letterSpacing: '0px'}),
      ),
  );
}

const FLOOR_CASES: FloorCase[] = [
  {name: 'plain', props: {}, floor: widestWord(SENTENCE)},
  {
    name: 'anywhere',
    props: {overflowWrap: 'anywhere'},
    floor: mockFontWidth('w', {font: FAKE_FONT, letterSpacing: '0px'}),
  },
  {
    name: 'no-wrap',
    props: {textWrap: false},
    floor: mockFontWidth(SENTENCE, {font: FAKE_FONT, letterSpacing: '0px'}),
  },
  {name: 'min-width-zero', props: {minWidth: 0}, floor: 0, contained: false},
];

function collectFlexFloor(): Finding[] {
  const findings: Finding[] = [];
  for (const one of FLOOR_CASES) {
    const probe = new DrawProbe({
      fontSize: FONT_SIZE,
      lineHeight: LINE_HEIGHT,
      textWrap: true,
      text: SENTENCE,
      ...one.props,
    });
    add(
      new Layout({
        layout: true,
        direction: 'row',
        width: SQUEEZED_ROW,
        height: 200,
        children: [probe, new Rect({width: 1000, height: 20, shrink: 0})],
      }),
    );
    const width = probe.size().x;
    if (Math.abs(width - one.floor) > TOLERANCE) {
      findings.push({
        kind: 'squeezed-width',
        key: one.name,
        evidence: [round(one.floor), round(width)],
      });
    }
    if (one.contained === false) continue;
    for (const [index, ink] of paintedLineInk(probe).entries()) {
      const past = ink.right - width / 2;
      if (past > TOLERANCE) {
        findings.push({
          kind: 'squeezed-overflow',
          key: one.name,
          evidence: [`${index}`, round(past)],
        });
      }
    }
  }
  return findings;
}

/* 5. A literal newline inside wrapped text aligned to the end edge.
      `mattgrogan-mc/old/scenes/boxcars/reportCard.tsx`. */

const HARD_BREAK_TEXT = 'first line here\nsecond line there and more words';
const HARD_BREAK_WIDTH = 200;

function collectHardBreakEnd(): Finding[] {
  const findings: Finding[] = [];
  for (const direction of ['ltr', 'rtl'] as const) {
    const probe = new DrawProbe({
      fontSize: FONT_SIZE,
      lineHeight: LINE_HEIGHT,
      width: HARD_BREAK_WIDTH,
      textWrap: true,
      textAlign: 'end',
      textDirection: direction,
      text: HARD_BREAK_TEXT,
    });
    add(probe);
    const key = `end|${direction}`;
    const lines = lineTexts(probe);
    if (lines.length < 2 || lines[0] !== 'first line here') {
      findings.push({
        kind: 'hard-break-lines',
        key,
        evidence: [JSON.stringify(lines)],
      });
      continue;
    }
    const edge =
      direction === 'rtl' ? -HARD_BREAK_WIDTH / 2 : HARD_BREAK_WIDTH / 2;
    for (const [index, span] of paintedLineInk(probe).entries()) {
      const at = direction === 'rtl' ? span.left : span.right;
      if (Math.abs(at - edge) > TOLERANCE) {
        findings.push({
          kind: 'hard-break-edge',
          key,
          evidence: [`${index}`, round(edge), round(at)],
        });
      }
    }
  }
  return findings;
}

/** Ink each painted line covers, in draw order. */
function paintedLineInk(probe: DrawProbe): {left: number; right: number}[] {
  const lines: {left: number; right: number}[] = [];
  let previous: number | null = null;
  for (const call of fillCalls(probe)) {
    const ink = inkSpan(call);
    if (!ink) continue;
    if (previous === null || Math.abs(call.y - previous) > TOLERANCE) {
      lines.push(ink);
      previous = call.y;
      continue;
    }
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = {
      left: Math.min(last.left, ink.left),
      right: Math.max(last.right, ink.right),
    };
  }
  return lines;
}

/* Path text: one straight path, both directions, with spans. */

const PATH = 'M -250 0 L 250 0';
const PATH_LEFT = -250;
const PATH_ARC = 500;

const PATH_TEXTS = [{name: 'plain', text: 'pack my box'}];
const PATH_ALIGNS: TextAlign[] = ['start', 'center', 'end'];
const PATH_FORMS: ContentForm[] = ['plain', 'span-paint-only', 'span-family'];

type PathCase = {
  textName: string;
  text: string;
  align: TextAlign;
  direction: CanvasDirection;
  split: 'grapheme' | 'word';
  form: ContentForm;
  sized: boolean;
};

function pathKey(one: PathCase): string {
  return [
    one.textName,
    one.align,
    one.direction,
    one.split,
    one.form,
    one.sized ? 'text-sized-box' : 'path-sized-box',
  ].join('|');
}

/** Where the whole run has to begin along the arc, from its width alone. */
function pathBase(one: PathCase, textWidth: number): number {
  const toEnd = PATH_ARC - textWidth;
  const rtl = one.direction === 'rtl';
  switch (one.align) {
    case 'center':
      return toEnd / 2;
    case 'right':
      return toEnd;
    case 'end':
      return rtl ? 0 : toEnd;
    case 'start':
      return rtl ? toEnd : 0;
    default:
      return 0;
  }
}

/** Advance of a painted call's own text, in its own font. */
function callAdvance(call: PaintCall): number {
  return mockFontWidth(call.text, {
    font: call.font,
    letterSpacing: `${call.letterSpacing}px`,
  });
}

function inkGraphemes(text: string): number {
  return segment(text, 'grapheme').filter(
    unit => unit.segment.trim().length > 0,
  ).length;
}

/**
 * Where each painted unit sits from the start of the run, and how wide the
 * whole run is. The source text supplies the gaps a split into words leaves
 * out, and a gap belongs to the unit before it, whose font measures it.
 */
function expectedOffsets(
  calls: readonly PaintCall[],
  source: string,
): {offsets: number[]; width: number} {
  const offsets: number[] = [];
  let pen = 0;
  let at = 0;
  for (const [index, call] of calls.entries()) {
    const from = source.indexOf(call.text, at);
    if (from >= 0) {
      const before = calls[index - 1] ?? call;
      pen += mockFontWidth(source.slice(at, from), {
        font: before.font,
        letterSpacing: `${before.letterSpacing}px`,
      });
      at = from + call.text.length;
    }
    offsets.push(pen);
    pen += callAdvance(call);
  }
  return {offsets, width: pen};
}

function pathFindings(one: PathCase): Finding[] {
  const key = pathKey(one);
  const sizer = buildForm(one.form, one.text, {fontSize: FONT_SIZE});
  add(sizer);
  const probe = new DrawProbe({
    fontSize: FONT_SIZE,
    textPath: PATH,
    pathSplit: one.split,
    textAlign: one.align,
    textDirection: one.direction,
    ...(one.sized ? {width: sizer.size().x} : {}),
    children: buildForm(one.form, one.text, {}).children(),
  });
  add(probe);

  const calls = fillCalls(probe);
  const findings: Finding[] = [];
  const {offsets, width} = expectedOffsets(calls, one.text);

  const painted = calls.reduce(
    (total, call) => total + inkGraphemes(call.text),
    0,
  );
  const expectedInk = inkGraphemes(one.text);
  if (painted !== expectedInk) {
    findings.push({
      kind: 'path-ink-count',
      key,
      evidence: [`${expectedInk}`, `${painted}`],
    });
  }
  if (calls.length === 0) return findings;

  const base = PATH_LEFT + pathBase(one, width);
  const start = Math.min(...calls.map(call => call.penX));
  const end = Math.max(...calls.map(call => call.penX + callAdvance(call)));
  if (Math.abs(start - base) > TOLERANCE) {
    findings.push({
      kind: 'path-run-start',
      key,
      evidence: [round(base), round(start)],
    });
  }
  if (Math.abs(end - (base + width)) > TOLERANCE) {
    findings.push({
      kind: 'path-run-end',
      key,
      evidence: [round(base + width), round(end)],
    });
  }

  if (one.direction === 'rtl') return findings;
  for (const [index, call] of calls.entries()) {
    const expected = base + offsets[index];
    if (Math.abs(call.penX - expected) > TOLERANCE) {
      findings.push({
        kind: 'path-pen-x',
        key,
        evidence: [
          JSON.stringify(call.text),
          `${index}`,
          round(expected),
          round(call.penX),
        ],
      });
    }
  }
  return findings;
}

function collectPathSweep(): Finding[] {
  const findings: Finding[] = [];
  for (const text of PATH_TEXTS) {
    for (const align of PATH_ALIGNS) {
      for (const direction of ['ltr', 'rtl'] as const) {
        for (const split of ['grapheme', 'word'] as const) {
          for (const form of PATH_FORMS) {
            for (const sized of [true, false]) {
              findings.push(
                ...pathFindings({
                  textName: text.name,
                  text: text.text,
                  align,
                  direction,
                  split,
                  form,
                  sized,
                }),
              );
            }
          }
        }
      }
    }
  }
  return findings;
}

describe('Txt crossings real scenes hit', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  it(
    'settles a tweened paint-only span inside wrapped text',
    generatorTest(function* () {
      const tail = 'box with five dozen liquor jugs';
      const {node, span} = spanTweenNode('box');
      add(node);

      yield span.text(tail, 0.5, linear);
      yield* waitFor(0.6);

      const whole = `pack my ${tail}`;
      const fresh = spanTweenNode(tail);
      add(fresh.node);
      const plain = new Txt({...SPAN_TWEEN_PROPS, text: whole});
      add(plain);
      expect(lineTexts(node)).toEqual(lineTexts(fresh.node));
      expect(lineTexts(node)).toEqual(lineTexts(plain));
      expectNoFindings([
        ...movedWords('span-tween-word', 'settled', node, fresh.node, whole),
        ...movedWords('span-tween-word', 'plain', node, plain, whole),
      ]);
    }),
  );

  it('reveals a centred wrapped text one word at a time', () => {
    expectNoFindings(collectTypewriter());
  });

  it(
    'keeps a centred typewriter tween wrapped inside its maxWidth',
    generatorTest(function* (view) {
      const txt = new Txt({...TYPEWRITER_PROPS, text: ''});
      view.add(txt);
      yield txt.text(SENTENCE, 1, linear);
      let wrapped = 0;
      for (let frame = 0; frame < 59; frame++) {
        yield;
        expect(txt.textWrap()).toBe(true);
        expect(txt.size().x).toBeLessThanOrEqual(200 + TOLERANCE);
        if (lineTexts(txt).length > 1) wrapped++;
      }
      expect(wrapped).toBeGreaterThan(0);
    }),
  );

  it('wraps a flex child to its percentage width', () => {
    expectNoFindings(collectFlexPercent());
  });

  it(
    'shrink-wraps a flex child to every size a tween passes through',
    generatorTest(function* () {
      const txt = new Txt({
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        textWrap: false,
        text: 'liquor jugs',
      });
      add(
        new Layout({
          layout: true,
          direction: 'row',
          width: ROW_WIDTH,
          height: 200,
          children: txt,
        }),
      );

      const seen: string[] = [];
      yield txt.fontSize(40, 0.4, linear);
      for (let frame = 0; frame < 4; frame++) {
        yield* waitFor(0.1);
        const expected = mockFontWidth('liquor jugs', {
          font: `500 ${txt.fontSize()}px Roboto`,
          letterSpacing: '0px',
        });
        if (Math.abs(txt.size().x - expected) > TOLERANCE) {
          seen.push(
            `${round(txt.fontSize())} ${round(expected)} ${round(txt.size().x)}`,
          );
        }
      }
      expect(seen).toEqual([]);
    }),
  );

  it('keeps a squeezed flex child as wide as its widest unit', () => {
    expectNoFindings(collectFlexFloor());
  });

  it('aligns both sides of a hard break to the end edge', () => {
    expectNoFindings(collectHardBreakEnd());
  });

  it('lays an unknown truthy textWrap value out as a wrap', () => {
    const props: TxtProps = {
      fontSize: FONT_SIZE,
      lineHeight: LINE_HEIGHT,
      width: 200,
      text: SENTENCE,
    };
    // The door 57 surveyed call sites pass `'wrap'` through: an untyped props
    // object spread over the typed ones.
    const fromTheWild = (record: Record<string, unknown>): TxtProps => ({
      ...props,
      ...record,
    });
    const unknown = new Txt(fromTheWild({textWrap: 'wrap'}));
    const wrapped = new Txt({...props, textWrap: true});
    const off = new Txt({...props, textWrap: false});
    add(unknown);
    add(wrapped);
    add(off);
    expect(lineTexts(unknown)).toEqual(lineTexts(wrapped));
    expect(lineTexts(wrapped)).not.toEqual(lineTexts(off));
  });
});

describe('Txt along a path', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  it('paints every unit at the advance its own font demands', () => {
    expectNoFindings(collectPathSweep());
  }, 60000);
});
