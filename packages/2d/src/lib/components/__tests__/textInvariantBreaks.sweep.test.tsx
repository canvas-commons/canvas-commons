import {describe, expect, it} from 'vitest';
import {TextAlign, TextShapeExclusion} from '../../partials/types';
import {TxtProps, TxtWrapMode} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import {add} from './sceneFixtures';
import {
  ALIGNS,
  ContentForm,
  DIRECTIONS,
  DrawProbe,
  EXCLUSION_SETS,
  Finding,
  LETTER_SPACINGS,
  TEXTS,
  WRAP_MODES,
  aHyphenLineIsAlignedShortOfItsInk,
  buildForm,
  declaredIn,
  everyThirdHyphenator,
  expectNoFindings,
  fakeFont,
  fillCalls,
  inkSpan,
  mockFontWidth,
  round,
  seededPicker,
} from './textInvariants';

const TOLERANCE = 0.05;
const BOX_WIDTH = 200;
const BOX_HEIGHT = 400;
const FONT_SIZE = 16;
const LINE_HEIGHT = 20;
const INLINE_SLOT = '\ufffc';
const EXPLICIT_BREAKS = ['\r', '\n', '\f', '\u00ad'];

function hasExplicitBreak(text: string): boolean {
  return EXPLICIT_BREAKS.some(mark => text.includes(mark));
}

const WRAPS = ['true', 'pre'];

/**
 * Forms the sweep generates over. An inline child is a REQUIRED case only: no
 * surveyed project puts a non-`Txt` child inside a `Txt`.
 */
const FORMS: ContentForm[] = [
  'plain',
  'span-at-space',
  'span-bold',
  'span-italic',
  'span-family',
  'span-spaced',
];

/** Forms whose runs measure in two different fonts, so no kern spans them. */
const METRIC_SEAM_FORMS: ContentForm[] = ['span-bold', 'span-family'];

type Case = {
  text: string;
  textName: string;
  align: TextAlign;
  direction: CanvasDirection;
  wrapMode: TxtWrapMode;
  wrap: string;
  exclusions: string;
  letterSpacing: number;
  hyphenated: boolean;
  form: ContentForm;
};

type Span = {left: number; right: number};

function key(one: Case): string {
  return [
    one.textName,
    one.align,
    one.direction,
    one.wrapMode,
    one.wrap,
    one.exclusions,
    `ls${one.letterSpacing}`,
    one.hyphenated ? 'hyphen' : 'plain-break',
    one.form,
  ].join('|');
}

function exclusionsOf(one: Case): TextShapeExclusion[] {
  const set = EXCLUSION_SETS.find(each => each.name === one.exclusions);
  return set ? set.at(BOX_WIDTH) : [];
}

function propsFor(one: Case): TxtProps {
  return {
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    width: BOX_WIDTH,
    height: BOX_HEIGHT,
    textAlign: one.align,
    textDirection: one.direction,
    wrapMode: one.wrapMode,
    textWrap: one.wrap === 'pre' ? 'pre' : true,
    letterSpacing: one.letterSpacing,
    exclusions: declaredIn(
      {width: BOX_WIDTH, height: BOX_HEIGHT},
      exclusionsOf(one),
    ),
    ...(one.hyphenated ? {hyphenate: () => everyThirdHyphenator} : {}),
  };
}

function required(partial: Partial<Case>): Case {
  return {
    text: TEXTS[0].text,
    textName: TEXTS[0].name,
    align: 'left',
    direction: 'ltr',
    wrapMode: 'greedy',
    wrap: 'true',
    exclusions: 'none',
    letterSpacing: 0,
    hyphenated: false,
    form: 'plain',
    ...partial,
  };
}

const REQUIRED: Case[] = [
  required({direction: 'rtl', align: 'center'}),
  required({direction: 'rtl', align: 'justify'}),
  required({wrapMode: 'knuth-plass', exclusions: 'middle', align: 'justify'}),
  required({
    exclusions: 'left',
    hyphenated: true,
    textName: 'long-word',
    text: TEXTS[1].text,
  }),
  required({form: 'span-bold', exclusions: 'right'}),
  required({form: 'span-bold', exclusions: 'middle', wrapMode: 'knuth-plass'}),
  required({form: 'inline-child', exclusions: 'left'}),
  required({form: 'inline-child', align: 'justify'}),
  required({form: 'inline-child', wrapMode: 'knuth-plass'}),
  required({
    form: 'inline-child',
    direction: 'rtl',
    align: 'justify',
    letterSpacing: 2,
    textName: 'long-word',
    text: TEXTS[1].text,
  }),
  required({
    form: 'inline-child',
    direction: 'rtl',
    align: 'right',
    wrapMode: 'knuth-plass',
    exclusions: 'middle',
    letterSpacing: -1,
    textName: 'long-word',
    text: TEXTS[1].text,
  }),
  required({
    form: 'span-italic',
    exclusions: 'middle',
    wrapMode: 'knuth-plass',
  }),
  required({form: 'span-italic', direction: 'rtl', align: 'justify'}),
  required({
    form: 'span-family',
    exclusions: 'right',
    hyphenated: true,
    textName: 'long-word',
    text: TEXTS[1].text,
  }),
  required({form: 'span-family', direction: 'rtl', align: 'justify'}),
  required({form: 'span-family', wrapMode: 'knuth-plass'}),
  required({
    wrap: 'pre',
    align: 'right',
    textName: 'space-runs',
    text: TEXTS[5].text,
  }),
  required({letterSpacing: 2}),
  required({letterSpacing: -1}),
  required({letterSpacing: 2, align: 'right'}),
  required({letterSpacing: 2, align: 'center'}),
  required({letterSpacing: 2, align: 'justify'}),
  required({letterSpacing: -1, align: 'right'}),
  required({letterSpacing: 2, direction: 'rtl'}),
  required({letterSpacing: 2, wrapMode: 'knuth-plass'}),
  required({letterSpacing: -1, wrapMode: 'knuth-plass'}),
  required({letterSpacing: 2, exclusions: 'middle'}),
  required({form: 'span-spaced'}),
  required({form: 'span-spaced', wrapMode: 'knuth-plass'}),
  required({textName: 'long-word', text: TEXTS[1].text}),
  required({
    wrapMode: 'knuth-plass',
    textName: 'long-word',
    text: TEXTS[1].text,
  }),
  required({direction: 'rtl', textName: 'long-word', text: TEXTS[1].text}),
];

function generate(seed: number, count: number): Case[] {
  const pick = seededPicker(seed);
  const cases: Case[] = [];
  for (let index = 0; index < count; index++) {
    const text = pick(TEXTS);
    cases.push({
      text: text.text,
      textName: text.name,
      align: pick(ALIGNS),
      direction: pick(DIRECTIONS),
      wrapMode: pick(WRAP_MODES),
      wrap: pick(WRAPS),
      exclusions: pick(EXCLUSION_SETS).name,
      letterSpacing: pick(LETTER_SPACINGS),
      hyphenated: pick([true, false]),
      form: pick(FORMS),
    });
  }
  return cases;
}

/** The free parts of a line's band, once the exclusions carve it up. */
function freeSegments(
  exclusions: TextShapeExclusion[],
  top: number,
  bottom: number,
): Span[] {
  const blocked: Span[] = [];
  for (const exclusion of exclusions) {
    if (exclusion.kind !== 'rect') continue;
    const pad = exclusion.horizontalPadding ?? 0;
    const vertical = exclusion.verticalPadding ?? 0;
    if (
      exclusion.y + exclusion.height + vertical <= top ||
      exclusion.y - vertical >= bottom
    ) {
      continue;
    }
    blocked.push({
      left: exclusion.x - pad,
      right: exclusion.x + exclusion.width + pad,
    });
  }
  blocked.sort((a, b) => a.left - b.left);

  const free: Span[] = [];
  let at = 0;
  for (const span of blocked) {
    if (span.left > at) {
      free.push({left: at, right: Math.min(span.left, BOX_WIDTH)});
    }
    at = Math.max(at, span.right);
  }
  if (at < BOX_WIDTH) free.push({left: at, right: BOX_WIDTH});
  return free.length > 0 ? free : [{left: 0, right: BOX_WIDTH}];
}

function segmentFor(segments: Span[], left: number): Span {
  let best = segments[0];
  for (const span of segments) {
    if (left >= span.left - TOLERANCE) best = span;
  }
  return best;
}

/** The known cause a line's overflow is attributed to. */
function causeOf(one: Case, line: string, raw: string): string {
  if (line.endsWith('-')) return 'hyphen';
  if (one.wrap === 'pre' && /\s$/.test(raw)) return 'pre-space';
  if (one.form === 'inline-child') return 'rich';
  if (METRIC_SEAM_FORMS.includes(one.form)) return 'metric-seam';
  if (one.letterSpacing < 0 || one.form === 'span-spaced') {
    return 'tight-spacing';
  }
  return 'unnamed';
}

function rawText(line: {fragments: {text: string}[]}): string {
  return line.fragments.map(fragment => fragment.text).join('');
}

function inkText(line: {fragments: {text: string}[]}): string {
  return line.fragments
    .map(fragment => fragment.text)
    .join('')
    .split(INLINE_SLOT)
    .join('')
    .trim();
}

/** Painted ink of each line, in draw order, grouped by the baseline it uses. */
function paintedLines(probe: DrawProbe): Span[][] {
  const groups: Span[][] = [];
  let previous: number | null = null;
  for (const call of fillCalls(probe)) {
    const ink = inkSpan(call);
    if (!ink) continue;
    if (previous === null || Math.abs(call.y - previous) > TOLERANCE) {
      groups.push([]);
      previous = call.y;
    }
    groups[groups.length - 1].push(ink);
  }
  return groups;
}

function fontOfLine(line: {fragments: {style: {font: string}}[]}): string {
  const first = line.fragments[0];
  return first ? first.style.font : `500 ${FONT_SIZE}px Roboto`;
}

/**
 * Whether the greedy walker could have taken the first word of the next line
 * as well. The advance comes from the fake font, not from the layout.
 */
function nextWordFits(
  used: number,
  space: number,
  next: string,
  font: string,
  letterSpacing: number,
): boolean {
  const advance = mockFontWidth(next, {
    font,
    letterSpacing: `${letterSpacing}px`,
  });
  return used + space + advance <= 0;
}

type Overflow = {
  kind: string;
  index: number;
  fromLeft: number;
  pastRight: number;
  text: string;
};

/** Where a line of the case has to start its ink: its segment's start edge. */
function startsAtItsEdge(one: Case): boolean {
  return (
    one.wrap === 'true' &&
    one.form !== 'inline-child' &&
    !hasExplicitBreak(one.text) &&
    (one.direction === 'rtl'
      ? one.align === 'right'
      : one.align === 'left' || one.align === 'justify')
  );
}

/**
 * Every line of a node that reaches outside the space it was broken in, that
 * does not start at the edge it is aligned to, and every line a greedy walker
 * could have taken one more word onto.
 */
function overflowsOf(
  one: Case,
  probe: DrawProbe,
): {overflows: Overflow[]; missingPaint: number | null; lines: number} {
  const lines = probe.textLines().lines;
  const inked = lines.filter(line => inkText(line).length > 0);
  const painted = paintedLines(probe);
  if (painted.length !== inked.length) {
    return {overflows: [], missingPaint: painted.length, lines: inked.length};
  }

  const maximal =
    one.wrapMode === 'greedy' &&
    one.wrap === 'true' &&
    !one.hyphenated &&
    !hasExplicitBreak(one.text);

  const overflows: Overflow[] = [];
  inked.forEach((line, index) => {
    const spans = painted[index];
    const left = Math.min(...spans.map(span => span.left)) + BOX_WIDTH / 2;
    const right = Math.max(...spans.map(span => span.right)) + BOX_WIDTH / 2;
    const segment = segmentFor(
      freeSegments(exclusionsOf(one), line.top, line.top + line.height),
      left,
    );
    const width = segment.right - segment.left;
    const text = inkText(line);
    // A unit no break can divide keeps its whole width and hangs off the
    // segment's trailing edge, which rtl reads from the other end.
    const indivisible =
      !/\s/.test(text) &&
      !text.endsWith('-') &&
      right - left > width + TOLERANCE &&
      (Math.abs(left - segment.left) <= TOLERANCE ||
        Math.abs(right - segment.right) <= TOLERANCE);

    if (
      !indivisible &&
      !aHyphenLineIsAlignedShortOfItsInk(
        one.align,
        line,
        text,
        right - segment.right,
      ) &&
      (left < segment.left - TOLERANCE || right > segment.right + TOLERANCE)
    ) {
      overflows.push({
        kind: `overflow-${causeOf(one, text, rawText(line))}`,
        index,
        fromLeft: left - segment.left,
        pastRight: right - segment.right,
        text,
      });
    }

    // A soft wrap takes the spaces in front of it with the line it ends.
    if (
      one.wrap === 'true' &&
      !hasExplicitBreak(one.text) &&
      index > 0 &&
      /^\s/.test(rawText(line))
    ) {
      overflows.push({
        kind: 'opens-with-space',
        index,
        fromLeft: left - segment.left,
        pastRight: right - segment.right,
        text: rawText(line),
      });
    }

    const edgeMiss =
      one.direction === 'rtl' ? right - segment.right : left - segment.left;
    if (
      startsAtItsEdge(one) &&
      index > 0 &&
      !indivisible &&
      Math.abs(edgeMiss) > TOLERANCE
    ) {
      overflows.push({
        kind: 'off-its-edge',
        index,
        fromLeft: left - segment.left,
        pastRight: right - segment.right,
        text,
      });
    }

    if (!maximal || index >= inked.length - 1) return;
    const next = inkText(inked[index + 1]).split(/\s/)[0];
    const font = fontOfLine(inked[index + 1]);
    const space = mockFontWidth(' ', {
      font,
      letterSpacing: `${one.letterSpacing}px`,
    });
    if (
      next.length > 0 &&
      nextWordFits(right - segment.right, space, next, font, one.letterSpacing)
    ) {
      overflows.push({
        kind: 'premature',
        index,
        fromLeft: left - segment.left,
        pastRight: right - segment.right,
        text: next,
      });
    }
  });
  return {overflows, missingPaint: null, lines: inked.length};
}

function collectBreakSweep(): Finding[] {
  const cases = [...REQUIRED, ...generate(86420, 56)];
  const seen = new Set(cases.map(key));
  expect(REQUIRED.map(key).filter(each => !seen.has(each))).toEqual([]);

  const findings: Finding[] = [];
  for (const one of cases) {
    const props = propsFor(one);
    const probe = new DrawProbe({
      ...props,
      children: buildForm(one.form, one.text, {}).children(),
    });
    add(probe);

    const painted = overflowsOf(one, probe);
    if (painted.missingPaint !== null) {
      findings.push({
        kind: 'missing-paint',
        key: key(one),
        evidence: [`${painted.missingPaint}`, `${painted.lines}`],
      });
      continue;
    }
    for (const overflow of painted.overflows) {
      findings.push({
        kind: overflow.kind,
        key: key(one),
        evidence: [
          `${overflow.index}`,
          round(overflow.fromLeft),
          round(overflow.pastRight),
          overflow.text,
        ],
      });
    }
  }
  return findings;
}

describe('Txt breaks against the space they were chosen in', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  it('paints every line inside the space it was broken in', () => {
    expectNoFindings(collectBreakSweep());
  }, 60000);
});
