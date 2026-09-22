/**
 * Per-band geometry helpers for wrapping text around obstacles.
 * Ported from https://github.com/chenglou/pretext-demos/blob/main/wrap-geometry.ts
 *
 * Pure geometry — no pretext dependency. Drives the band loop in
 * {@link Txt}'s `exclusions` path.
 */
import {BBox} from '@canvas-commons/core';

export type ExclusionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ExclusionPoint = {
  x: number;
  y: number;
};

export type Interval = {
  left: number;
  right: number;
};

const MIN_SLOT_WIDTH = 24;

/**
 * Horizontal extent of a polygon inside one band, or `null` when it misses
 * the band. A strip never has negative height: negative padding shrinks it to
 * a line at its top, so a taller band always meets at least the same shapes.
 */
export function getPolygonIntervalForBand(
  points: ExclusionPoint[],
  bandTop: number,
  bandBottom: number,
  horizontalPadding: number,
  verticalPadding: number,
): Interval | null {
  const stripTop = bandTop - verticalPadding;
  const stripBottom = Math.max(bandBottom + verticalPadding, stripTop);

  let left = Infinity;
  let right = -Infinity;
  const include = (x: number) => {
    if (x < left) left = x;
    if (x > right) right = x;
  };

  // The extreme x values of a polygon clipped to a horizontal strip occur
  // either at vertices inside the strip or where edges cross the strip's
  // boundaries, so checking those points is exact.
  let a = points[points.length - 1];
  if (!a) return null;
  for (const b of points) {
    if (a.y >= stripTop && a.y <= stripBottom) {
      include(a.x);
    }
    for (const y of [stripTop, stripBottom]) {
      if ((a.y < y && y < b.y) || (b.y < y && y < a.y)) {
        include(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
      }
    }
    a = b;
  }

  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  const padded = left - horizontalPadding;
  return {left: padded, right: Math.max(right + horizontalPadding, padded)};
}

export function getRectIntervalsForBand(
  rects: ExclusionRect[],
  bandTop: number,
  bandBottom: number,
  horizontalPadding: number,
  verticalPadding: number,
): Interval[] {
  const intervals: Interval[] = [];
  for (const rect of rects) {
    const padded = new BBox(rect.x, rect.y, rect.width, rect.height).expand([
      verticalPadding,
      horizontalPadding,
    ]);
    if (padded.width < 0 || padded.height < 0) continue;
    if (bandBottom <= padded.top || bandTop >= padded.bottom) {
      continue;
    }
    intervals.push({left: padded.left, right: padded.right});
  }
  return intervals;
}

/**
 * Given one allowed horizontal `base` interval and a set of `blocked`
 * intervals, return the remaining text slots for one line band. Slivers
 * narrower than {@link MIN_SLOT_WIDTH} pixels are dropped, unless `base` is
 * narrower still: a box that small has no wider slot to offer.
 */
export function carveTextLineSlots(
  base: Interval,
  blocked: Interval[],
): Interval[] {
  let slots: Interval[] = [base];

  for (const interval of blocked) {
    if (interval.right <= interval.left) continue;
    const next: Interval[] = [];
    for (const slot of slots) {
      if (interval.right <= slot.left || interval.left >= slot.right) {
        next.push(slot);
        continue;
      }
      if (interval.left > slot.left) {
        next.push({left: slot.left, right: interval.left});
      }
      if (interval.right < slot.right) {
        next.push({left: interval.right, right: slot.right});
      }
    }
    slots = next;
  }

  const minimum = Math.min(MIN_SLOT_WIDTH, base.right - base.left);
  return slots.filter(slot => slot.right - slot.left >= minimum);
}
