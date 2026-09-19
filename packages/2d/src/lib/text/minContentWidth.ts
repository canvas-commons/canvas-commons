import type {PreparedTextWithSegments} from '@chenglou/pretext';

type SegmentBreakKind = PreparedTextWithSegments['kinds'][number];

function endsRun(kind: SegmentBreakKind): boolean {
  return kind !== 'text' && kind !== 'glue';
}

/**
 * Width of the widest run of prepared text that holds no break opportunity:
 * the CSS `min-content` width of that text.
 *
 * @example
 * ```ts
 * const prepared = prepareWithSegments('a longword', '16px sans-serif');
 * const floor = measureMinContentWidth(prepared);
 * ```
 *
 * @param prepared - Text prepared by pretext's `prepareWithSegments`.
 */
export function measureMinContentWidth(
  prepared: PreparedTextWithSegments,
): number {
  const {kinds, widths, lineEndFitAdvances, letterSpacing} = prepared;
  const spacingCounts = prepared.spacingGraphemeCounts;
  let widest = 0;
  let run = 0;
  let hasContent = false;

  for (let i = 0; i < kinds.length; i++) {
    if (endsRun(kinds[i])) {
      run = 0;
      hasContent = false;
      continue;
    }
    const leading =
      letterSpacing !== 0 && hasContent && spacingCounts[i] > 0
        ? letterSpacing
        : 0;
    // A run that ends the line pays the line-end advance, not the full width.
    const atLineEnd = run + leading + lineEndFitAdvances[i];
    if (atLineEnd > widest) widest = atLineEnd;
    run += leading + widths[i];
    hasContent = true;
  }

  return widest;
}
