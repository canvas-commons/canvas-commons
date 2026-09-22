import {walkLineRanges} from '@chenglou/pretext';
import {describe, expect, it} from 'vitest';
import type {TextExclusion} from '../../partials/types';
import type {BrokenParagraph} from '../../text/breakParagraph';
import {breakParagraph} from '../../text/breakParagraph';
import {breakParagraphOptimally} from '../../text/knuthPlassParagraph';
import {readVerticalMetrics} from '../../text/lineMetrics';
import {prepareMixedParagraph} from '../../text/mixedParagraph';
import type {RunMetrics} from '../../text/paragraphContent';
import {buildParagraphContent} from '../../text/paragraphContent';
import type {WhiteSpaceMode} from '../../text/preparedParagraph';
import {
  canvasParagraphMeasurer,
  prepareParagraph,
} from '../../text/preparedParagraph';
import {walkPreparedLinesRaw} from '../../text/pretext-derived/lineBreak';
import {mockTextContext} from './mockTextContext';
import {mockFontBounds, mockFontWidth} from './textInvariants';

mockTextContext(mockFontWidth, mockFontBounds);

const REGULAR: RunMetrics = {font: '400 20px sans-serif', letterSpacing: 0};
const WIDE: RunMetrics = {font: '700 41px sans-serif', letterSpacing: 0};
const TALL: RunMetrics = {font: '400 50px sans-serif', letterSpacing: 0};

/** A paragraph of text runs, each in its own metrics, with 100% lines. */
function paragraphOf(
  runs: [RunMetrics, string][],
  whiteSpace: WhiteSpaceMode = 'normal',
) {
  const content = buildParagraphContent(
    runs.map(([metrics, text], owner) => ({
      kind: 'text' as const,
      owner,
      paint: owner,
      metrics,
      text,
    })),
    whiteSpace,
  );
  const mixed = prepareMixedParagraph(
    content,
    {whiteSpace, wordBreak: 'normal', metrics: REGULAR},
    canvasParagraphMeasurer,
  );
  const metrics = mixed.preparations.map(one => one.metrics);
  const vertical = readVerticalMetrics(
    mixed.items,
    metrics,
    '100%',
    canvasParagraphMeasurer,
  );
  return {text: content.text, items: mixed.items, metrics, vertical};
}

type Paragraph = ReturnType<typeof paragraphOf>;

function greedy(
  paragraph: Paragraph,
  maxWidth: number,
  exclusions: readonly TextExclusion[] = [],
): BrokenParagraph {
  return breakParagraph(paragraph.items, {
    maxWidth,
    textWrap: true,
    overflowWrap: 'normal',
    exclusions,
    vertical: paragraph.vertical,
  });
}

/** The text of every line, for lines that end between items. */
function linesOf(paragraph: Paragraph, broken: BrokenParagraph): string[] {
  const {items, text} = paragraph;
  const offset = (segment: number) =>
    segment < items.sourceStarts.length
      ? items.sourceStarts[segment]
      : text.length;
  return broken.lines.map(line =>
    text
      .slice(offset(line.start.segmentIndex), offset(line.end.segmentIndex))
      .trim(),
  );
}

describe('text module contracts', () => {
  it('walks lines as pretext does at the fit epsilon', () => {
    // At 24px a glyph is 12px, so `pack my` ends at 84; the engine fits a
    // line up to 0.005px past its width.
    const prepared = prepareParagraph('pack my box', {
      font: '400 24px sans-serif',
      whiteSpace: 'normal',
      wordBreak: 'normal',
      letterSpacing: 0,
    });
    const width = 84 - 0.005;
    const mine: number[][] = [];
    walkPreparedLinesRaw(prepared.items, width, (lineWidth, from, _, to) =>
      mine.push([lineWidth, from, to]),
    );
    const theirs: number[][] = [];
    walkLineRanges(prepared.handle, width, line =>
      theirs.push([line.width, line.start.segmentIndex, line.end.segmentIndex]),
    );

    expect(mine).toEqual([
      [84, 0, 4],
      [36, 4, 5],
    ]);
    expect(mine).toEqual(theirs);
  });

  it('measures a word a font change cuts in two fonts, and never breaks it there', () => {
    const paragraph = paragraphOf([
      [REGULAR, 'alpha'],
      [WIDE, 'beta gamma'],
    ]);

    expect(
      paragraph.items.widths.map(width => Math.round(width * 10) / 10),
    ).toEqual([50, 98.4, 24.6, 123]);
    expect(paragraph.items.joinsPrevious).toEqual([false, true, false, false]);
    expect(linesOf(paragraph, greedy(paragraph, 100))).toEqual([
      'alphabeta',
      'gamma',
    ]);
  });

  it('reads the line box of a chunk that does not open the paragraph', () => {
    const paragraph = paragraphOf(
      [
        [REGULAR, 'aa bb\ncc '],
        [TALL, 'dd'],
        [REGULAR, ' ee ff gg hh'],
      ],
      'pre-wrap',
    );
    const broken = greedy(paragraph, 120, [
      {kind: 'rect', x: 60, y: 40, width: 60, height: 300},
    ]);

    // The 50px word only meets the shape once its line is that tall, so the
    // line in front of it keeps the whole box and the tall one takes 60.
    expect(
      broken.lines.map(line => [
        line.width,
        line.height,
        line.top,
        line.segment.left,
        line.segment.right,
      ]),
    ).toEqual([
      [50, 20, 0, 0, 120],
      [30, 20, 20, 0, 120],
      [60, 50, 40, 0, 60],
      [60, 20, 90, 0, 60],
      [50, 20, 110, 0, 60],
    ]);
  });

  it('plans the cheapest lines an exhaustive search finds', () => {
    const paragraph = paragraphOf([[REGULAR, 'aa bb cc dddd eeee']]);
    const width = 80;
    // A ragged line costs ten times its slack squared; the last line is free.
    const words = paragraph.text.split(' ');
    const widthOf = (line: string[]) => line.join(' ').length * 10;
    let best: {cost: number; lines: string[][]} = {cost: Infinity, lines: []};
    for (let cuts = 0; cuts < 2 ** (words.length - 1); cuts++) {
      const lines: string[][] = [[words[0]]];
      for (let at = 1; at < words.length; at++) {
        if (cuts & (1 << (at - 1))) lines.push([words[at]]);
        else lines[lines.length - 1].push(words[at]);
      }
      if (lines.some(line => widthOf(line) > width)) continue;
      const cost = lines
        .slice(0, -1)
        .reduce((sum, line) => sum + 10 * (width - widthOf(line)) ** 2, 0);
      if (cost < best.cost) best = {cost, lines};
    }
    const optimal = breakParagraphOptimally(paragraph.items, {
      maxWidth: width,
      textWrap: true,
      overflowWrap: 'normal',
      justify: false,
      vertical: paragraph.vertical,
    });

    expect(best.lines.map(line => line.join(' '))).toEqual([
      'aa bb',
      'cc dddd',
      'eeee',
    ]);
    expect(linesOf(paragraph, optimal)).toEqual(['aa bb', 'cc dddd', 'eeee']);
    expect(linesOf(paragraph, greedy(paragraph, width))).toEqual([
      'aa bb cc',
      'dddd',
      'eeee',
    ]);
  });
});
