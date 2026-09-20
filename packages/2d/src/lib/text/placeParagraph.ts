import type {StyledFragment, TextLine, TxtWrapMode} from '../components/Txt';
import type {TextAlign, VerticalAlign} from '../partials/types';
import {segment} from './segmenter';

type FragmentStyle = StyledFragment['style'];

/** Smallest fragment gap that counts as a justifiable space. */
const MIN_JUSTIFY_GAP = 0.01;

/** One word of a justified fragment, with its share of the slack applied. */
export type PlacedWord = {
  text: string;
  /** Left edge in block space. */
  x: number;
  /** Natural advance, without slack. */
  advance: number;
  whitespace: boolean;
};

export type PlacedFragment = {
  fragment: StyledFragment;
  /** Left edge in block space, with alignment and justification applied. */
  x: number;
  /** Natural advance: the measured text width, or the inline slot width. */
  advance: number;
  /** Offset from the line-box top to the alphabetic baseline. */
  baselineOffset: number;
  /** Word slices when the line is justified, `null` otherwise. */
  words: PlacedWord[] | null;
};

/**
 * A line of text with every position resolved: `top` includes the
 * vertical-align offset and each fragment carries its final origin.
 */
export type PlacedLine = {
  fragments: PlacedFragment[];
  top: number;
  height: number;
  /** Slack given to each whitespace slot; `0` when the line is not justified. */
  extraPerSpace: number;
};

export type PlaceParagraphInput = {
  lines: readonly TextLine[];
  /** Natural height of the laid-out text, for vertical alignment. */
  layoutHeight: number;
  blockWidth: number;
  blockHeight: number;
  textAlign: TextAlign;
  rtl: boolean;
  verticalAlign: VerticalAlign;
  wrapMode: TxtWrapMode;
  /**
   * Final text of every line of a stabilized tween, or `null`. The still-typing
   * line borrows its target's justify spacing.
   */
  targetLines: readonly string[] | null;
  measure: (text: string, style: FragmentStyle) => number;
  fontMetrics: (style: FragmentStyle) => {ascent: number; descent: number};
};

function computeAlignOffset(
  align: TextAlign,
  rtl: boolean,
  containerWidth: number,
  lineWidth: number,
): number {
  switch (align) {
    case 'center':
      return (containerWidth - lineWidth) / 2;
    case 'right':
      return containerWidth - lineWidth;
    case 'end':
      return rtl ? 0 : containerWidth - lineWidth;
    case 'start':
      return rtl ? containerWidth - lineWidth : 0;
    case 'left':
      return 0;
    default:
      return rtl ? containerWidth - lineWidth : 0;
  }
}

function isWhitespaceSegment(text: string, isWordLike: boolean): boolean {
  return !isWordLike && /^\s+$/.test(text);
}

function countSpaces(text: string): number {
  let spaces = 0;
  for (const seg of segment(text, 'word')) {
    if (isWhitespaceSegment(seg.segment, seg.isWordLike === true)) spaces++;
  }
  return spaces;
}

/**
 * Resolve every fragment of a laid-out paragraph to its final origin.
 *
 * @remarks
 * Justification stretches whitespace, so every fragment after a stretched
 * space — including inline slots — moves by the slack added before it. Callers
 * paint and report these positions directly.
 */
export function placeParagraph(input: PlaceParagraphInput): PlacedLine[] {
  const {lines, blockWidth, blockHeight, layoutHeight, measure} = input;
  const verticalOffset =
    input.verticalAlign === 'middle'
      ? (blockHeight - layoutHeight) / 2
      : input.verticalAlign === 'bottom'
        ? blockHeight - layoutHeight
        : 0;

  const result: PlacedLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isLastLine = i === lines.length - 1;

    const advances = line.fragments.map(frag =>
      frag.inline ? (frag.inlineWidth ?? 0) : measure(frag.text, frag.style),
    );
    let lineWidth = 0;
    for (let f = 0; f < line.fragments.length; f++) {
      lineWidth = Math.max(lineWidth, line.fragments[f].x + advances[f]);
    }

    // During a stabilized tween every line's final content is known, so
    // the still-typing line can borrow its target's justify spacing —
    // words land at their settled positions, and an overfull Knuth-Plass
    // line never pokes past the block while incomplete.
    let finalText: string | null = null;
    if (
      input.textAlign === 'justify' &&
      isLastLine &&
      line.fragments.length === 1 &&
      input.targetLines !== null &&
      i < input.targetLines.length - 1
    ) {
      const target =
        input.wrapMode === 'knuth-plass'
          ? input.targetLines[i].replace(/\s+$/, '')
          : input.targetLines[i];
      if (target.startsWith(line.fragments[0].text)) {
        finalText = target;
      }
    }

    // Knuth-Plass plans lines whose spaces compress below their natural
    // width, so justify must also squeeze overfull lines there; greedy
    // never plans compression (an overfull greedy line is hyphen overhang
    // or an in-flight tween seam, both drawn at natural width).
    const justifyLine =
      input.textAlign === 'justify' &&
      (!isLastLine || finalText !== null) &&
      (finalText !== null ||
        lineWidth < blockWidth ||
        (lineWidth > blockWidth && input.wrapMode === 'knuth-plass'));

    // A gap between two fragments is the space pretext kept outside both of
    // them; it stretches like any other space on the line.
    const stretchedGap = line.fragments.map(
      (frag, f) =>
        f > 0 &&
        frag.x - (line.fragments[f - 1].x + advances[f - 1]) > MIN_JUSTIFY_GAP,
    );

    let extraPerSpace = 0;
    let wordsPerFragment: PlacedWord[][] | null = null;
    if (justifyLine) {
      let spaceCount = stretchedGap.filter(Boolean).length;
      wordsPerFragment = line.fragments.map(frag => {
        if (frag.inline) return [];
        const words: PlacedWord[] = [];
        for (const seg of segment(frag.text, 'word')) {
          // Slack rides only whitespace runs, not punctuation.
          const whitespace = isWhitespaceSegment(
            seg.segment,
            seg.isWordLike === true,
          );
          if (whitespace) spaceCount++;
          words.push({
            text: seg.segment,
            x: 0,
            advance: measure(seg.segment, frag.style),
            whitespace,
          });
        }
        return words;
      });
      if (finalText !== null) {
        const finalSpaceCount = countSpaces(finalText);
        if (finalSpaceCount > 0) {
          extraPerSpace =
            (blockWidth - measure(finalText, line.fragments[0].style)) /
            finalSpaceCount;
        } else {
          wordsPerFragment = null;
        }
      } else if (spaceCount > 0) {
        extraPerSpace = (blockWidth - lineWidth) / spaceCount;
      } else {
        wordsPerFragment = null;
      }
    }
    if (extraPerSpace === 0) wordsPerFragment = null;

    const alignOffset = justifyLine
      ? 0
      : computeAlignOffset(input.textAlign, input.rtl, blockWidth, lineWidth);

    const fragments: PlacedFragment[] = [];
    let shift = 0;
    for (let f = 0; f < line.fragments.length; f++) {
      const fragment = line.fragments[f];
      if (wordsPerFragment && stretchedGap[f]) shift += extraPerSpace;
      const x = fragment.x + alignOffset + shift;

      const words = wordsPerFragment?.[f] ?? null;
      if (words) {
        let cursor = x;
        for (const word of words) {
          word.x = cursor;
          cursor += word.advance;
          if (word.whitespace) {
            cursor += extraPerSpace;
            shift += extraPerSpace;
          }
        }
      }

      fragments.push({
        fragment,
        x,
        advance: advances[f],
        baselineOffset: fragment.inline
          ? 0
          : baselineOffsetFor(line.height, input.fontMetrics(fragment.style)),
        words,
      });
    }

    result.push({
      fragments,
      top: line.top + verticalOffset,
      height: line.height,
      extraPerSpace: wordsPerFragment ? extraPerSpace : 0,
    });
  }

  return result;
}

/**
 * Alphabetic baseline inside the line box, from real font metrics, so glyphs
 * land where CSS inline layout would put them.
 */
function baselineOffsetFor(
  lineHeight: number,
  metrics: {ascent: number; descent: number},
): number {
  return (lineHeight - (metrics.ascent + metrics.descent)) / 2 + metrics.ascent;
}
