import {clamp} from '@canvas-commons/core';
import {CurvePoint} from './CurvePoint';
import {Segment} from './Segment';

export interface CurveProfile {
  arcLength: number;
  segments: Segment[];
  minSin: number;
}

/**
 * Create an arc-length sampler over a profile. Calls with non-decreasing
 * distances are amortized O(1). A smaller distance rescans from the start.
 *
 * @param profile - The profile to sample.
 */
export function createCurveSampler(
  profile: CurveProfile,
): (distance: number) => CurvePoint {
  const segments = profile.segments;
  let index = 0;
  let base = 0;
  let last = -Infinity;
  return distance => {
    if (distance < last) {
      index = 0;
      base = 0;
    }
    last = distance;
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
 * Whether a profile's path loops back to its own start, within a tolerance
 * relative to its arc length.
 *
 * @param profile - The profile to check.
 */
export function isClosedProfile(profile: CurveProfile): boolean {
  const {segments, arcLength} = profile;
  if (segments.length === 0 || arcLength <= 0) {
    return false;
  }
  const start = segments[0].getPoint(0).position;
  const end = segments[segments.length - 1].getPoint(1).position;
  return start.equals(end, arcLength * 1e-6);
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
