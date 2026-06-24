import {clamp} from '@canvas-commons/core';
import {CurvePoint} from './CurvePoint';
import {Segment} from './Segment';

export interface CurveProfile {
  arcLength: number;
  segments: Segment[];
  minSin: number;
}

/**
 * Create a forward-only arc-length sampler over a profile. Successive calls must
 * pass non-decreasing distances, giving amortized O(1) lookups instead of
 * rescanning every segment per call.
 *
 * @param profile - The profile to sample.
 */
export function createCurveSampler(
  profile: CurveProfile,
): (distance: number) => CurvePoint {
  const segments = profile.segments;
  let index = 0;
  let base = 0;
  return distance => {
    while (
      index < segments.length - 1 &&
      distance > base + segments[index].arcLength
    ) {
      base += segments[index].arcLength;
      index++;
    }
    const segment = segments[index];
    const relative =
      segment.arcLength > 0 ? (distance - base) / segment.arcLength : 0;
    return segment.getPoint(clamp(0, 1, relative));
  };
}

/**
 * Convert a curve profile to SVG path data.
 *
 * @param profile - The curve profile to convert
 * @returns SVG path data string
 */
export function profileToSVGPathData(profile: CurveProfile): string {
  if (profile.segments.length === 0) {
    return '';
  }

  const commands: string[] = [];
  for (let i = 0; i < profile.segments.length; i++) {
    const segment = profile.segments[i];
    const move = i === 0;
    commands.push(segment.toSVGCommands(0, 1, move));
  }

  return commands.join(' ');
}
