import type {
  LayoutCursor,
  LayoutLineRange,
  PreparedTextWithSegments,
} from '@chenglou/pretext';
import {layoutNextLineRange} from '@chenglou/pretext';
import {measureRunWidthAt} from './minContentWidth';

/**
 * Lay out one greedy line. A run with no break opportunity stays whole and
 * overflows `maxWidth`, as in CSS `overflow-wrap: normal`.
 *
 * @param isolateOverflow - Pass `false` to let pretext split the run.
 */
export function layoutNextLineIsolatingOverflow(
  prepared: PreparedTextWithSegments,
  cursor: LayoutCursor,
  maxWidth: number,
  isolateOverflow: boolean,
): LayoutLineRange | null {
  const range = layoutNextLineRange(prepared, cursor, maxWidth);
  // Pretext splits a run that does not fit; a line that ends inside a segment
  // shows that it did.
  if (!isolateOverflow || range === null || range.end.graphemeIndex === 0) {
    return range;
  }
  return layoutNextLineRange(
    prepared,
    cursor,
    measureRunWidthAt(prepared, range.start.segmentIndex),
  );
}
