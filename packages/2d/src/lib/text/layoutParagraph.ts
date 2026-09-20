import type {LayoutCursor, PreparedTextWithSegments} from '@chenglou/pretext';
import {materializeLineRange} from '@chenglou/pretext';
import {
  materializeRichInlineLineRange,
  walkRichInlineLineRanges,
} from '@chenglou/pretext/rich-inline';
import type {
  StyledFragment,
  TextLayoutResult,
  TextLine,
  TxtWrapMode,
} from '../components/Txt';
import type {OverflowWrap, TextExclusion} from '../partials/types';
import {knuthPlass} from './knuthPlass';
import {layoutNextLineIsolatingOverflow} from './overflowLineBreak';
import type {
  FragmentStyle,
  PreparedLayout,
  RichGroup,
  Run,
} from './paragraphTypes';
import {
  Interval,
  carveTextLineSlots,
  getPolygonIntervalForBand,
  getRectIntervalsForBand,
} from './wrapGeometry';

const MAX_BAND_ITERATIONS = 2048;

/** Everything line breaking needs besides the prepared paragraph. */
export type LayoutConstraints = {
  /** Width a line must fit, or `Infinity` when nothing forces a break. */
  maxWidth: number;
  lineHeight: number;
  wrapMode: TxtWrapMode;
  overflowWrap: OverflowWrap;
  exclusions: readonly TextExclusion[];
  justified: boolean;
};

/** What line breaking cannot read off the prepared paragraph. */
export type ParagraphMeasures = {
  fontConstants(font: string): {normalSpaceWidth: number; hyphenWidth: number};
  styleFor(run: Run): FragmentStyle;
};

/**
 * A laid-out paragraph, with the cursor every line ended at. The cursors are
 * empty for a rich paragraph, which pretext walks without them.
 */
export type ParagraphLayout = TextLayoutResult & {ends: LayoutCursor[]};

export const emptyParagraphLayout: ParagraphLayout = {
  lines: [],
  width: 0,
  height: 0,
  lineHeight: 0,
  ends: [],
};

/** The one operation that breaks a prepared paragraph into lines. */
export function layoutParagraph(
  prepared: PreparedLayout,
  constraints: LayoutConstraints,
  measures: ParagraphMeasures,
): ParagraphLayout {
  return prepared.kind === 'simple'
    ? layoutSimple(prepared.prepared, prepared.style, constraints, measures)
    : layoutRich(prepared.groups, prepared.runs, constraints, measures);
}

/** Lay out one measured paragraph: exclusions, Knuth-Plass, or greedy. */
function layoutSimple(
  prepared: PreparedTextWithSegments,
  style: FragmentStyle,
  constraints: LayoutConstraints,
  measures: ParagraphMeasures,
): ParagraphLayout {
  const {maxWidth, lineHeight} = constraints;
  const lines: TextLine[] = [];
  const ends: LayoutCursor[] = [];
  let width = 0;

  if (constraints.exclusions.length > 0 && Number.isFinite(maxWidth)) {
    for (const line of layoutWithExclusions(prepared, constraints)) {
      lines.push({
        fragments: [{text: line.text, x: line.x, gapBefore: 0, style}],
        top: line.lineTop,
        height: lineHeight,
      });
      ends.push(line.end);
      const fullRight = line.x + line.width;
      if (fullRight > width) width = fullRight;
    }
  } else if (constraints.wrapMode === 'knuth-plass') {
    const {normalSpaceWidth, hyphenWidth} = measures.fontConstants(style.font);
    const kpLines = knuthPlass(prepared, maxWidth, {
      normalSpaceWidth,
      hyphenWidth,
      justified: constraints.justified,
    });
    for (const line of kpLines) {
      lines.push({
        fragments: [{text: line.text, x: 0, gapBefore: 0, style}],
        top: lines.length * lineHeight,
        height: lineHeight,
      });
      ends.push({segmentIndex: line.endSegmentIndex, graphemeIndex: 0});
      if (line.width > width) width = line.width;
    }
  } else {
    const isolateOverflow = constraints.overflowWrap !== 'anywhere';
    let cursor: LayoutCursor = {segmentIndex: 0, graphemeIndex: 0};
    let range = layoutNextLineIsolatingOverflow(
      prepared,
      cursor,
      maxWidth,
      isolateOverflow,
    );
    while (range !== null) {
      const line = materializeLineRange(prepared, range);
      lines.push({
        fragments: [{text: line.text, x: 0, gapBefore: 0, style}],
        top: lines.length * lineHeight,
        height: lineHeight,
      });
      ends.push(range.end);
      if (line.width > width) width = line.width;
      cursor = range.end;
      range = layoutNextLineIsolatingOverflow(
        prepared,
        cursor,
        maxWidth,
        isolateOverflow,
      );
    }
  }

  const lastLine = lines[lines.length - 1];
  return {
    lines,
    width,
    height: lastLine ? lastLine.top + lastLine.height : 0,
    lineHeight,
    ends,
  };
}

/** Band-by-band greedy layout that wraps around `exclusions`. */
function layoutWithExclusions(
  prepared: PreparedTextWithSegments,
  constraints: LayoutConstraints,
): {
  text: string;
  x: number;
  width: number;
  lineTop: number;
  end: LayoutCursor;
}[] {
  const lh = constraints.lineHeight;
  const lines: {
    text: string;
    x: number;
    width: number;
    lineTop: number;
    end: LayoutCursor;
  }[] = [];
  let cursor = {segmentIndex: 0, graphemeIndex: 0};
  let lineTop = 0;
  const blocked: Interval[] = [];

  for (let i = 0; i < MAX_BAND_ITERATIONS; i++) {
    const bandTop = lineTop;
    const bandBottom = lineTop + lh;
    blocked.length = 0;
    for (const ex of constraints.exclusions) {
      const hp = ex.horizontalPadding ?? 0;
      const vp = ex.verticalPadding ?? 0;
      if (ex.kind === 'rect') {
        for (const interval of getRectIntervalsForBand(
          [
            {
              x: ex.x,
              y: ex.y,
              width: ex.width,
              height: ex.height,
            },
          ],
          bandTop,
          bandBottom,
          hp,
          vp,
        )) {
          blocked.push(interval);
        }
      } else {
        const interval = getPolygonIntervalForBand(
          ex.points,
          bandTop,
          bandBottom,
          hp,
          vp,
        );
        if (interval) blocked.push(interval);
      }
    }

    const slots = carveTextLineSlots(
      {left: 0, right: constraints.maxWidth},
      blocked,
    );
    if (slots.length === 0) {
      lineTop += lh;
      continue;
    }

    let slot = slots[0];
    for (const candidate of slots) {
      if (candidate.right - candidate.left > slot.right - slot.left) {
        slot = candidate;
      }
    }

    const range = layoutNextLineIsolatingOverflow(
      prepared,
      cursor,
      slot.right - slot.left,
      constraints.overflowWrap !== 'anywhere',
    );
    if (range === null) break;
    const line = materializeLineRange(prepared, range);
    lines.push({
      text: line.text,
      x: slot.left,
      width: line.width,
      lineTop,
      end: range.end,
    });
    cursor = range.end;
    lineTop += lh;
  }

  return lines;
}

/** Lay out a multi-style paragraph through pretext's rich-inline walker. */
function layoutRich(
  groups: RichGroup[],
  runs: Run[],
  constraints: LayoutConstraints,
  measures: ParagraphMeasures,
): ParagraphLayout {
  const baseLineHeight = constraints.lineHeight;
  const fragmentLines: {fragments: StyledFragment[]; height: number}[] = [];
  // Pretext splits an over-wide run here: `PreparedRichInline` has no
  // segment widths to measure one run.
  let totalWidth = 0;
  for (const group of groups) {
    if (group.prepared === null) {
      fragmentLines.push({fragments: [], height: baseLineHeight});
      continue;
    }
    const groupPrepared = group.prepared;
    walkRichInlineLineRanges(groupPrepared, constraints.maxWidth, range => {
      const line = materializeRichInlineLineRange(groupPrepared, range);
      const styledFragments: StyledFragment[] = [];
      let x = 0;
      // A tall inline element grows only its own line's box, CSS-style.
      let height = baseLineHeight;
      for (const fragment of line.fragments) {
        x += fragment.gapBefore;
        const run = runs[group.itemMap[fragment.itemIndex]];
        if (run) {
          const inline = run.kind === 'inline' ? run.node : undefined;
          styledFragments.push({
            text: fragment.text,
            x,
            gapBefore: styledFragments.length === 0 ? 0 : fragment.gapBefore,
            style: measures.styleFor(run),
            inline,
            inlineWidth: inline ? fragment.occupiedWidth : undefined,
          });
          if (run.kind === 'inline' && run.height > height) {
            height = run.height;
          }
        }
        x += fragment.occupiedWidth;
      }
      fragmentLines.push({fragments: styledFragments, height});
      if (line.width > totalWidth) {
        totalWidth = line.width;
      }
    });
  }

  const lines: TextLine[] = [];
  let top = 0;
  for (const {fragments, height} of fragmentLines) {
    lines.push({fragments, top, height});
    top += height;
  }
  return {
    lines,
    width: totalWidth,
    height: top,
    lineHeight: baseLineHeight,
    ends: [],
  };
}
