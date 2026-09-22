import {expect} from 'vitest';
import {
  TextAlign,
  TextExclusion,
  TextShapeExclusion,
  TextWrap,
  WordBreak,
} from '../../partials/types';
import type {PlacedLine} from '../../text';
import {SOFT_HYPHEN, segment} from '../../text';
import {Node} from '../Node';
import {Rect} from '../Rect';
import {Txt, TxtProps, TxtWrapMode} from '../Txt';
import {TextState, mockTextContext} from './mockTextContext';
import {PaintCall, recordingTextContext} from './recordingTextContext';
import {fontSizeOf} from './sceneFixtures';

const REGULAR_RATIO = 0.5;
const BOLD_RATIO = 0.6;
const MONO_RATIO = 0.55;
const KERN_RATIO = 0.1;
const ASCENT_RATIO = 0.8;
const DESCENT_RATIO = 0.25;
/** Characters the fake font draws nothing for and spaces nothing after. */
const INVISIBLE = /[\u00ad\u200b\u2060]/g;

function faceRatio(font: string): number {
  if (font.includes('monospace')) return MONO_RATIO;
  return font.includes('700') ? BOLD_RATIO : REGULAR_RATIO;
}

/**
 * A fake font that scales with its size, gives bold a wider face than regular,
 * kerns an `AV` pair no mark stands between, gives a soft hyphen and the
 * zero-width marks no width of their own, and follows every glyph with the
 * letter spacing the context carries, as a canvas does.
 */
export function mockFontWidth(text: string, state: TextState): number {
  const size = fontSizeOf(state.font);
  const kerns = text.split('AV').length - 1;
  const glyphs = text.replace(INVISIBLE, '');
  const spacing = parseFloat(state.letterSpacing) || 0;
  return (
    glyphs.length * size * faceRatio(state.font) -
    kerns * size * KERN_RATIO +
    glyphs.length * spacing
  );
}

/** Font box metrics of the fake font, so a line has real vertical ink. */
export function mockFontBounds(state: TextState): {
  ascent: number;
  descent: number;
} {
  const size = fontSizeOf(state.font);
  return {ascent: size * ASCENT_RATIO, descent: size * DESCENT_RATIO};
}

const HINTING_STEP = 0.02;

/**
 * Share of its proportional advance the face paints at `size`. A hinted face
 * snaps its stems to whole pixels, so it steps with the size instead of
 * scaling with it, and a size between two pixels paints narrower still. The
 * steps go both ways, so a probe reading one size off another is sometimes
 * too wide and sometimes too narrow.
 */
export function hintingFactor(size: number): number {
  const whole = Math.floor(size);
  return 1 + ((whole % 3) - 1) * HINTING_STEP - (size - whole) * HINTING_STEP;
}

/** Install the fake font for a suite. */
export function fakeFont(): void {
  mockTextContext(mockFontWidth, mockFontBounds);
}

/** Glyphs a fake face draws for `text`, which the invisible marks are not. */
export function glyphCount(text: string): number {
  return text.replace(INVISIBLE, '').length;
}

function bareWidth(call: PaintCall, text: string): number {
  return mockFontWidth(text, {font: call.font, letterSpacing: '0px'});
}

/**
 * Advance a run occupies when it is painted: canvas letter spacing follows
 * every glyph, the last one included.
 */
export function paintedAdvance(call: PaintCall, text: string): number {
  return bareWidth(call, text) + glyphCount(text) * call.letterSpacing;
}

/** Ink of `text` in a call's font: letter spacing only between its glyphs. */
export function runWidth(call: PaintCall, text: string): number {
  const between = Math.max(0, glyphCount(text) - 1) * call.letterSpacing;
  return bareWidth(call, text) + between;
}

/**
 * Left edge of a painted run, resolved from the anchor the call was made
 * under. Canvas takes `textAlign` against the run's whole advance, and `start`
 * and `end` swap sides with the direction.
 */
export function anchoredLeft(call: PaintCall): number {
  const advance = paintedAdvance(call, call.text);
  const rtl = call.direction === 'rtl';
  switch (call.textAlign) {
    case 'center':
      return call.x - advance / 2;
    case 'right':
      return call.x - advance;
    case 'end':
      return rtl ? call.x : call.x - advance;
    case 'start':
      return rtl ? call.x - advance : call.x;
    default:
      return call.x;
  }
}

export type PaintedGlyph = {
  text: string;
  left: number;
  right: number;
  y: number;
};

/**
 * Every glyph a call paints, in reading order. Both edges come from the
 * cumulative advance of the prefix that ends there, so a pair the font kerns
 * keeps its kern.
 */
export function paintedGlyphs(call: PaintCall): PaintedGlyph[] {
  const origin = anchoredLeft(call);
  const glyphs: PaintedGlyph[] = [];
  for (const seg of segment(call.text, 'grapheme')) {
    if (seg.segment.length === 0) continue;
    const upTo = seg.index + seg.segment.length;
    glyphs.push({
      text: seg.segment,
      left: origin + paintedAdvance(call, call.text.slice(0, seg.index)),
      right: origin + paintedAdvance(call, call.text.slice(0, upTo)),
      y: call.y,
    });
  }
  return glyphs;
}

/** Where the glyphs of a painted run land; whitespace carries no ink. */
export function inkSpan(call: PaintCall): {left: number; right: number} | null {
  const core = call.text.trim();
  if (core.length === 0) return null;
  const lead = call.text.length - call.text.trimStart().length;
  const left =
    anchoredLeft(call) + paintedAdvance(call, call.text.slice(0, lead));
  return {left, right: left + runWidth(call, core)};
}

/**
 * Distance from a painted baseline to the centre of the line box a query
 * reports the same glyph in, which the font box alone decides.
 */
export function baselineOffset(fontSize: number): number {
  return (fontSize * ASCENT_RATIO - fontSize * DESCENT_RATIO) / 2;
}

export class DrawProbe extends Txt {
  public probeDraw(context: CanvasRenderingContext2D) {
    this.draw(context);
  }

  /** The placed lines, so a sweep can read the free segment of each one. */
  public probeLines(): readonly PlacedLine[] {
    return this.positionedLines();
  }
}

/** Every text fill a node paints, in draw order. */
export function fillCalls(txt: DrawProbe): PaintCall[] {
  const {calls, context} = recordingTextContext();
  txt.probeDraw(context);
  return calls.filter(call => call.kind === 'fill');
}

/**
 * Every run a node paints and where its ink starts, in draw order, rounded to
 * a thousandth of a pixel so an example can state it exactly.
 */
export function paintedRuns(txt: DrawProbe): [string, number][] {
  return fillCalls(txt).map(call => [
    call.text,
    Math.round(anchoredLeft(call) * 1000) / 1000 + 0,
  ]);
}

export type ContentForm =
  | 'plain'
  | 'span-at-space'
  | 'span-mid-word'
  | 'span-in-kern'
  | 'span-paint-only'
  | 'span-bold'
  | 'span-italic'
  | 'span-family'
  | 'span-spaced'
  | 'inline-child'
  | 'inline-tall'
  | 'crlf-across-leaves'
  | 'combining-split'
  | 'rich-kern-boundary';

/** Forms whose runs share metrics, so a split changes paint only. */
export const PAINT_ONLY_FORMS: ContentForm[] = [
  'span-at-space',
  'span-mid-word',
  'span-in-kern',
  'span-paint-only',
];

export const TEXTS: {name: string; text: string}[] = [
  {name: 'short-words', text: 'pack my box AV five dozen jugs now'},
  {
    name: 'long-word',
    text: 'short and supercalifragilisticexpialidocious after',
  },
  {
    name: 'soft-hyphens',
    text: 'un\u00adbreak\u00adable ex\u00adtra\u00adordi\u00adnary words',
  },
  {name: 'crlf', text: 'first here\r\nsecond there\rthird\u000cfourth'},
  {name: 'tabs', text: 'one\ttwo\tthree four AV five'},
  {name: 'space-runs', text: 'one  two   three AV  four'},
  {name: 'edge-space', text: '  leading and trailing AV  '},
  {name: 'punctuation', text: 'one, two; three. AV! four?'},
  {name: 'empty', text: ''},
];

export const ALIGNS: TextAlign[] = ['left', 'center', 'right', 'justify'];
export const DIRECTIONS: CanvasDirection[] = ['ltr', 'rtl'];
export const WRAP_MODES: TxtWrapMode[] = ['greedy', 'knuth-plass'];
export const WRAPS: TextWrap[] = [true, false, 'pre'];
export const WORD_BREAKS: WordBreak[] = ['normal', 'keep-all'];
export const LETTER_SPACINGS = [-1, 0, 2];

/**
 * The bands a sweep blocks, in block space, so the checkers can compare a
 * line against the segment it was broken in. Pass them through
 * {@link declaredIn} to reach `Txt.exclusions`.
 */
export const EXCLUSION_SETS: {
  name: string;
  at: (width: number) => TextShapeExclusion[];
}[] = [
  {name: 'none', at: () => []},
  {
    name: 'left',
    at: width => [{kind: 'rect', x: 0, y: 0, width: width * 0.3, height: 400}],
  },
  {
    name: 'right',
    at: width => [
      {kind: 'rect', x: width * 0.7, y: 0, width: width * 0.3, height: 400},
    ],
  },
  {
    name: 'middle',
    at: width => [
      {kind: 'rect', x: width * 0.35, y: 20, width: width * 0.3, height: 60},
    ],
  },
];

/**
 * The same bands as `Txt.exclusions` takes them: Txt-local and center-origin
 * inside a box of `size`.
 */
export function declaredIn(
  size: {width: number; height: number},
  blocked: readonly TextShapeExclusion[],
): TextExclusion[] {
  const half = {x: size.width / 2, y: size.height / 2};
  return blocked.map(exclusion =>
    exclusion.kind === 'rect'
      ? {
          ...exclusion,
          x: exclusion.x + exclusion.width / 2 - half.x,
          y: exclusion.y + exclusion.height / 2 - half.y,
        }
      : {
          ...exclusion,
          points: exclusion.points.map(point => ({
            x: point.x - half.x,
            y: point.y - half.y,
          })),
        },
  );
}

/** Splits every word into three-letter parts, so a hyphen can be chosen. */
export function everyThirdHyphenator(word: string): string[] {
  const parts: string[] = [];
  for (let at = 0; at < word.length; at += 3) {
    parts.push(word.slice(at, at + 3));
  }
  return parts.length > 1 ? parts : [word];
}

function splitAt(text: string, at: number): [string, string] {
  return [text.slice(0, at), text.slice(at)];
}

/** Offset of the gap inside the first kerned pair, or the middle. */
function kernOffset(text: string): number {
  const at = text.indexOf('AV');
  return at === -1 ? Math.floor(text.length / 2) : at + 1;
}

function spaceOffset(text: string): number {
  const at = text.indexOf(' ', Math.floor(text.length / 3));
  return at === -1 ? Math.floor(text.length / 2) : at + 1;
}

/**
 * The same string in one of the forms a `Txt` can hold it. The last three
 * forms ignore `text`: they are fixed structures that put a run boundary
 * where one measurement has to span it.
 */
export function buildForm(
  form: ContentForm,
  text: string,
  props: TxtProps,
): Txt {
  switch (form) {
    case 'plain':
      return new Txt({...props, text});
    case 'span-at-space': {
      const [first, second] = splitAt(text, spaceOffset(text));
      return new Txt({
        ...props,
        children: [new Txt({children: first}), new Txt({children: second})],
      });
    }
    case 'span-mid-word': {
      const [first, second] = splitAt(text, Math.floor(text.length * 0.4));
      return new Txt({
        ...props,
        children: [new Txt({children: first}), new Txt({children: second})],
      });
    }
    case 'span-in-kern': {
      const [first, second] = splitAt(text, kernOffset(text));
      return new Txt({
        ...props,
        children: [new Txt({children: first}), new Txt({children: second})],
      });
    }
    case 'span-paint-only': {
      const [first, second] = splitAt(text, spaceOffset(text));
      return new Txt({
        ...props,
        children: [
          new Txt({fill: 'red', opacity: 0.5, children: first}),
          new Txt({stroke: 'blue', lineWidth: 2, children: second}),
        ],
      });
    }
    case 'span-bold': {
      const [first, second] = splitAt(text, spaceOffset(text));
      return new Txt({
        ...props,
        children: [
          new Txt({children: first}),
          new Txt({fontWeight: 700, children: second}),
        ],
      });
    }
    case 'span-italic': {
      const [first, second] = splitAt(text, spaceOffset(text));
      return new Txt({
        ...props,
        children: [
          new Txt({children: first}),
          new Txt({fontStyle: 'italic', children: second}),
        ],
      });
    }
    case 'span-family': {
      const [first, second] = splitAt(text, spaceOffset(text));
      return new Txt({
        ...props,
        children: [
          new Txt({children: first}),
          new Txt({fontFamily: 'monospace', children: second}),
        ],
      });
    }
    case 'span-spaced': {
      const [first, second] = splitAt(text, spaceOffset(text));
      return new Txt({
        ...props,
        children: [
          new Txt({letterSpacing: 3, children: first}),
          new Txt({letterSpacing: -1, children: second}),
        ],
      });
    }
    case 'inline-child': {
      const [first, second] = splitAt(text, spaceOffset(text));
      return new Txt({
        ...props,
        children: [first, new Rect({width: 24, height: 12}), second],
      });
    }
    case 'inline-tall': {
      const [first, second] = splitAt(text, spaceOffset(text));
      return new Txt({
        ...props,
        children: [first, new Rect({width: 24, height: 60}), second],
      });
    }
    case 'crlf-across-leaves':
      return new Txt({
        ...props,
        children: [new Txt({children: 'a\r'}), new Txt({children: '\nb'})],
      });
    case 'combining-split':
      return new Txt({
        ...props,
        children: [
          new Txt({children: 'e'}),
          new Txt({fill: 'red', children: '\u0301B'}),
        ],
      });
    case 'rich-kern-boundary':
      return new Txt({
        ...props,
        children: [
          new Txt({fill: 'red', children: 'A'}),
          new Txt({children: 'VB\n'}),
          new Txt({fontSize: 24, children: 'X'}),
        ],
      });
  }
}

/** The plain string each fixed structure form stands for. */
export function fixedFormText(form: ContentForm): string | null {
  switch (form) {
    case 'crlf-across-leaves':
      return 'a\r\nb';
    case 'combining-split':
      return 'e\u0301B';
    case 'rich-kern-boundary':
      return 'AVB\nX';
    default:
      return null;
  }
}

/** A deterministic stream, so a failing case is the same on every run. */
export function seededPicker(seed: number): <T>(from: readonly T[]) => T {
  let state = seed >>> 0 || 1;
  return <T>(from: readonly T[]): T => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return from[Math.floor((state / 0x100000000) * from.length)];
  };
}

/** Every line's text, fragment by fragment. */
export function lineStrings(txt: Txt): string[] {
  return txt
    .textLines()
    .lines.map(line => line.fragments.map(fragment => fragment.text).join(''));
}

export type WordRecord = {
  text: string;
  /** Where the word starts in the source text, or `-1` when it is not in it. */
  from: number;
  lineIndex: number;
  left: number;
  right: number;
};

/**
 * Words as the public queries report them, each tied to its source range. A
 * hyphenator's optional breaks are invisible and are not painted, so they are
 * dropped on both sides before a word is looked up.
 */
export function wordRecords(txt: Txt, source: string): WordRecord[] {
  const plain = source.replaceAll(SOFT_HYPHEN, '');
  let cursor = 0;
  return txt.textWords().map(word => {
    const bare = word.text.replaceAll(SOFT_HYPHEN, '');
    const from = plain.indexOf(bare, cursor);
    if (from >= 0) cursor = from + bare.length;
    return {
      text: word.text,
      from,
      lineIndex: word.lineIndex,
      left: word.x - word.width / 2,
      right: word.x + word.width / 2,
    };
  });
}

export function describeWord(word: WordRecord): string {
  return (
    `${JSON.stringify(word.text)}@${word.from}` +
    `[${round(word.left)},${round(word.right)}]`
  );
}

/** Whether two word records name the same word in the same place. */
export function sameWord(one: WordRecord, other: WordRecord): boolean {
  return (
    one.text === other.text &&
    Math.abs(one.left - other.left) <= 0.05 &&
    Math.abs(one.right - other.right) <= 0.05
  );
}

export function round(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

/**
 * One difference a sweep measured, with everything it takes to name it: what
 * was compared, the case it was compared in, and the expected and actual
 * values.
 */
export type Finding = {
  kind: string;
  key: string;
  evidence: readonly string[];
};

function serializeFinding(finding: Finding): string {
  return [finding.kind, finding.key, ...finding.evidence].join(' ');
}

/**
 * Whether a line overruns its space by no more than the negative letter
 * spacing of the hyphen it ends on, under an alignment that places the line by
 * its width. That width counts the hyphen's spacing, which its ink does not
 * give back: an open defect, pinned by an `it.fails` example in `textDefects`.
 * Its fix deletes this excuse and that `fails`.
 */
export function aHyphenLineIsAlignedShortOfItsInk(
  align: TextAlign,
  line: {fragments: {style: {letterSpacing: number}}[]},
  text: string,
  pastRight: number,
): boolean {
  const last = line.fragments[line.fragments.length - 1];
  const spacing = last ? last.style.letterSpacing : 0;
  return (
    text.endsWith('-') &&
    align !== 'left' &&
    spacing < 0 &&
    pastRight <= 0.05 - spacing
  );
}

/**
 * Whether a line overruns its space by no more than the negative letter
 * spacing of its last glyph. The break pass fits a line by its advance, which
 * counts that spacing, and the ink does not give it back: an open defect,
 * pinned by `it.fails` examples in `textDefects`. Its fix deletes this excuse
 * and those `fails`.
 */
export function aLineIsFitShortOfItsInk(
  line: {fragments: {style: {letterSpacing: number}}[]},
  pastRight: number,
): boolean {
  const last = line.fragments[line.fragments.length - 1];
  const spacing = last ? last.style.letterSpacing : 0;
  return spacing < 0 && pastRight <= 0.05 - spacing;
}

/** A sweep passes when it measured no difference at all. */
export function expectNoFindings(findings: readonly Finding[]): void {
  expect(findings.map(serializeFinding)).toEqual([]);
}

/**
 * Index pairs of the longest common subsequence of two unit lists, so units
 * that survive a difference are still compared against their own counterpart.
 */
export function matchedUnits(
  expected: readonly string[],
  actual: readonly string[],
): [number, number][] {
  const table: number[][] = Array.from({length: expected.length + 1}, () =>
    new Array<number>(actual.length + 1).fill(0),
  );
  for (let i = expected.length - 1; i >= 0; i--) {
    for (let j = actual.length - 1; j >= 0; j--) {
      table[i][j] =
        expected[i] === actual[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < expected.length && j < actual.length) {
    if (expected[i] === actual[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

const TOLERANCE = 1e-6;

/** A box autoSize fits to, the cap it searches under, and the spacing. */
export type FitCase = {
  width: number;
  height: number;
  cap: number;
  letterSpacing: number;
};

/**
 * Whether the size a probe carries fits its box: the line boxes fit the
 * height, and every run painted stands, from its own pen position over its own
 * advance, inside the free segment of the line it was broken in. The numbers
 * come from the drawn layout, not from the fit.
 */
function fitsBox(probe: DrawProbe, one: FitCase): boolean {
  if (probe.textLines().height > one.height + TOLERANCE) return false;
  const half = one.width / 2;
  const lines = probe.probeLines();
  for (const call of fillCalls(probe)) {
    const line = lines.find(
      each => Math.abs(each.baseline - one.height / 2 - call.y) <= TOLERANCE,
    );
    const free = line?.segment ?? {left: 0, right: one.width};
    const right = Math.min(free.right, one.width);
    const left = anchoredLeft(call);
    if (left < free.left - half - TOLERANCE) return false;
    if (left + paintedAdvance(call, call.text) > right - half + TOLERANCE) {
      return false;
    }
  }
  return true;
}

/** Every span under a node, so each one's letter spacing can ride the size. */
function spansOf(node: Node): Txt[] {
  const found: Txt[] = [];
  for (const child of node.children()) {
    if (child instanceof Txt) found.push(child, ...spansOf(child));
  }
  return found;
}

/**
 * The largest whole size that really fits, or `0` when none does. Letter
 * spacing rides the size, as it does when autoSize picks one.
 */
export function largestFittingSize(probe: DrawProbe, one: FitCase): number {
  const spans = spansOf(probe);
  const declared = spans.map(span => span.letterSpacing());
  for (let size = one.cap; size >= 1; size--) {
    const ratio = size / one.cap;
    probe.fontSize(size);
    probe.letterSpacing(one.letterSpacing * ratio);
    spans.forEach((span, at) => span.letterSpacing(declared[at] * ratio));
    if (fitsBox(probe, one)) return size;
  }
  return 0;
}
