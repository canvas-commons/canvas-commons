import {walkLineRanges} from '@chenglou/pretext';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {TextAlign, TextShapeExclusion} from '../../partials/types';
import {clearPretextCache} from '../../text';
import type {BrokenParagraph} from '../../text/breakParagraph';
import {breakParagraph} from '../../text/breakParagraph';
import {breakParagraphOptimally} from '../../text/knuthPlassParagraph';
import {readVerticalMetrics} from '../../text/lineMetrics';
import {prepareMixedParagraph} from '../../text/mixedParagraph';
import type {RunMetrics} from '../../text/paragraphContent';
import {buildParagraphContent} from '../../text/paragraphContent';
import type {TextDirection} from '../../text/placeParagraph';
import {paintAnchorOf, placeParagraph} from '../../text/placeParagraph';
import type {WhiteSpaceMode} from '../../text/preparedParagraph';
import {
  canvasParagraphMeasurer,
  prepareParagraph,
} from '../../text/preparedParagraph';
import {walkPreparedLinesRaw} from '../../text/pretext-derived/lineBreak';
import {Layout} from '../Layout';
import {Rect} from '../Rect';
import {Txt, TxtProps} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import {TextState, mockTextContext} from './mockTextContext';
import {add, fontSizeOf, lineTexts} from './sceneFixtures';
import {
  DrawProbe,
  fillCalls,
  glyphCount,
  hintingFactor,
  mockFontBounds,
  mockFontWidth,
} from './textInvariants';

/** True while the face snaps to whole pixels, so its advance steps with its size. */
let Hinted = false;

/**
 * The fake font: at 20px 10px a glyph, bold at 41px 24.6px a glyph. Hinted,
 * it paints {@link hintingFactor} of that.
 */
function faceWidth(text: string, state: TextState): number {
  if (!Hinted) return mockFontWidth(text, state);
  const size = fontSizeOf(state.font);
  const spacing = parseFloat(state.letterSpacing) || 0;
  return glyphCount(text) * (size * hintingFactor(size) * 0.5 + spacing);
}

mockTextContext(faceWidth, mockFontBounds);

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
  exclusions: readonly TextShapeExclusion[] = [],
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

/** Every run a placement paints and its pen, read from the placed data. */
function placedRuns(
  paragraph: Paragraph,
  width: number,
  textAlign: TextAlign,
  direction: TextDirection,
): [string, number][] {
  const placed = placeParagraph(paragraph.items, greedy(paragraph, width), {
    text: paragraph.text,
    metrics: paragraph.metrics,
    vertical: paragraph.vertical,
    textAlign,
    direction,
    verticalAlign: 'top',
    blockWidth: width,
    blockHeight: 1000,
    measurer: canvasParagraphMeasurer,
  });
  const runs: [string, number][] = [];
  for (const line of placed.lines) {
    for (const piece of line.pieces) {
      const text = paragraph.text.slice(piece.sourceStart, piece.sourceEnd);
      if (text.trim() === '' || piece.advance <= 0) continue;
      const anchor = paintAnchorOf(piece, piece.sourceStart, piece.sourceEnd);
      runs.push([anchor.text, anchor.penX]);
    }
  }
  return runs;
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

  it('gives the justification slack to the spaces of every line but the last', () => {
    const paragraph = paragraphOf([[REGULAR, 'aa bb cc dd']]);

    expect(placedRuns(paragraph, 100, 'justify', 'ltr')).toEqual([
      ['aa', 0],
      ['bb', 40],
      ['cc', 80],
      ['dd', 0],
    ]);
  });

  it('puts an rtl run of an rtl block left of the Latin in front of it', () => {
    const paragraph = paragraphOf([
      [REGULAR, 'Hello world \u05e9\u05dc\u05d5\u05dd'],
    ]);

    expect(placedRuns(paragraph, 400, 'right', 'rtl')).toEqual([
      ['Hello', 290],
      ['world', 350],
      ['\u05e9\u05dc\u05d5\u05dd', 240],
    ]);
  });
});

describe('Txt autoSize contract', () => {
  mockScene2D();
  failOnSceneErrors();
  beforeAll(() => {
    Hinted = true;
    clearPretextCache();
  });
  afterAll(() => {
    Hinted = false;
    clearPretextCache();
  });

  it('picks the size an exhaustive scan of a stepping face picks', () => {
    // The face is 2% wide at the 41px cap and 2% narrow at 24px, so advances
    // scaled from the cap reject 24px although its first line inks 188.16.
    const box = {width: 190, height: 60};
    const props: TxtProps = {
      ...box,
      text: 'pack my box with five dozen jugs',
      lineHeight: '100%',
    };
    const fitted = new Txt({...props, fontSize: 41, autoSize: true});
    add(fitted);
    const probe = new DrawProbe({...props, fontSize: 41});
    add(probe);
    const fits = () =>
      probe.textLines().height <= box.height &&
      fillCalls(probe).every(
        call =>
          call.x >= -box.width / 2 &&
          call.x +
            faceWidth(call.text, {font: call.font, letterSpacing: '0px'}) <=
            box.width / 2,
      );
    let largest = 0;
    for (let size = 41; size >= 1 && largest === 0; size--) {
      probe.fontSize(size);
      if (fits()) largest = size;
    }

    expect(largest).toBe(24);
    expect(fitted.effectiveFontSize()).toBe(largest);
  });
});

describe('Txt minimum content contract', () => {
  mockScene2D();
  failOnSceneErrors();

  it('stops a squeezed row item at its widest word', () => {
    const txt = new Txt({text: 'one two three', fontSize: 20, lineHeight: 20});
    add(
      new Layout({
        layout: true,
        width: 300,
        children: [txt, new Rect({width: 1000, height: 20})],
      }),
    );

    expect(txt.size().x).toBe(50);
    expect(lineTexts(txt)).toEqual(['one', 'two', 'three']);
  });

  it('keeps three lines of a column item that the column cannot fit', () => {
    const txt = new Txt({
      text: 'one two three',
      fontSize: 20,
      lineHeight: 20,
      width: 50,
    });
    const next = new Rect({width: 50, height: 20, shrink: 0});
    add(
      new Layout({
        layout: true,
        direction: 'column',
        width: 200,
        height: 40,
        children: [txt, next],
      }),
    );

    expect(txt.size().y).toBe(60);
    expect(next.top().y).toBe(40);
  });
});
