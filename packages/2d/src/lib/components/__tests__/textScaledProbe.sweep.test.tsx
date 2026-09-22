import {describe, expect, it} from 'vitest';
import type {ParagraphItems} from '../../text';
import {
  ADVANCE_SCALE_ERROR,
  advanceBoundHolds,
  scaledParagraphReader,
  searchFitSize,
} from '../../text';
import {walkPreparedLinePieces} from '../../text/pretext-derived/lineBreak';

const CAP = 20;
const BOX = 92;
/** Width of the fixed inline box the tab is measured from. */
const INLINE = 79.5;

/**
 * An inline box, a tab, and one glyph: the tab reaches the next stop from
 * wherever the box leaves the pen, so narrowing the glyph does not narrow the
 * line.
 */
function items(stopAdvance: number, glyph: number): ParagraphItems {
  const kinds = ['inline-box', 'tab', 'text'] as const;
  const advances = [INLINE, 0, glyph];
  return {
    kinds: [...kinds],
    joinsPrevious: [false, false, false],
    owners: [0, 0, 0],
    boxHeights: [20, 0, 0],
    sourceStarts: [0, 1, 2],
    sourceEnds: [1, 2, 3],
    handleRangeOf: index => ({
      start: {segmentIndex: index, graphemeIndex: 0},
      end: {segmentIndex: index, graphemeIndex: 1},
      startTrim: 0,
      endTrim: 0,
    }),
    widths: [...advances],
    lineEndFitAdvances: [...advances],
    lineEndPaintAdvances: [...advances],
    breakableFitAdvances: [null, null, null],
    paintAdvanceOf: index => advances[index],
    breakablePreferredBreaks: [null, null, null],
    spacingGraphemeCounts: [0, 0, 0],
    letterSpacings: [0, 0, 0],
    discretionaryHyphenWidths: [0, 0, 0],
    tabStopAdvances: [0, stopAdvance, 0],
    simpleLineWalkFastPath: false,
    chunks: [
      {startSegmentIndex: 0, endSegmentIndex: 3, consumedEndSegmentIndex: 3},
    ],
  };
}

/** Right edge the whole paragraph reaches on its one line. */
function extent(paragraph: ParagraphItems): number {
  const line = walkPreparedLinePieces(
    paragraph,
    {segmentIndex: 0, graphemeIndex: 0},
    {segmentIndex: 3, graphemeIndex: 0},
  );
  return (
    line.pieces.reduce(
      (right, piece) => right + piece.leading + piece.advance + piece.hyphen,
      0,
    ) + line.trailing
  );
}

describe('the scaled fit probe', () => {
  it('checks every rejection of a paragraph the bound cannot describe', () => {
    // The cap stop and glyph are a scale of the real ones at size 19, which
    // the arithmetic model cannot reach: narrowing the glyph moves the tab
    // over a stop instead of shortening the line.
    const cap = items(83.1578947368421, 10.526315789473685);
    const read = scaledParagraphReader({
      items: cap,
      metrics: [
        {
          font: `${CAP}px Test`,
          whiteSpace: 'pre-wrap',
          wordBreak: 'normal',
          letterSpacing: 0,
        },
      ],
      vertical: {
        lineHeight: 20,
        lineHeights: [20, 20, 20],
        ascents: [16, 16, 16],
        descents: [4, 4, 4],
      },
      lineHeight: 20,
      measurer: {measureAdvance: () => 0},
    });

    const bounded = advanceBoundHolds(cap);
    const verified: number[] = [];
    const picked = searchFitSize(
      CAP,
      size => ({
        fits: extent(read(size / CAP, 0).items) <= BOX,
        final:
          bounded && extent(read(size / CAP, ADVANCE_SCALE_ERROR).items) > BOX,
      }),
      size => {
        verified.push(size);
        // Only a real layout reads the stop the line really lands on.
        const real = size === 19 ? items(80, 10) : read(size / CAP, 0).items;
        return extent(real) <= BOX;
      },
    );

    expect(picked).toBe(19);
    expect(verified).toContain(19);
    expect(bounded).toBe(false);
  });
});
