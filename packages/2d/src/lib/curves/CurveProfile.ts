import {Segment} from './Segment';

export interface CurveProfile {
  arcLength: number;
  segments: Segment[];
  minSin: number;
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
