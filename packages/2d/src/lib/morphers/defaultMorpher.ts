import {CurveProfile} from '../curves/CurveProfile';
import {createCurveProfileLerp} from '../curves/createCurveProfileLerp';
import {getPathProfile} from '../curves/getPathProfile';
import {PathMorpher} from './PathMorpher';

function curveProfileToPath(profile: CurveProfile): string {
  const parts: string[] = [];
  let lastEnd: {x: number; y: number} | null = null;

  for (const segment of profile.segments) {
    const start = segment.getPoint(0).position;
    const end = segment.getPoint(1).position;

    if (!lastEnd || start.x !== lastEnd.x || start.y !== lastEnd.y) {
      parts.push(`M${start.x},${start.y}`);
    }
    parts.push(`L${end.x},${end.y}`);
    lastEnd = end;
  }

  return parts.join('');
}

/**
 * Create a path morpher that uses the Kute.js-inspired polygon interpolation
 * algorithm. Paths are sampled into polygons, point counts are equalized, and
 * corresponding points are linearly interpolated.
 */
export function defaultMorpher(): PathMorpher {
  return {
    createInterpolator(fromPath: string, toPath: string) {
      const fromProfile = getPathProfile(fromPath);
      const toProfile = getPathProfile(toPath);
      const interpolator = createCurveProfileLerp(fromProfile, toProfile);

      return (progress: number): string => {
        if (progress <= 0) return fromPath;
        if (progress >= 1) return toPath;
        return curveProfileToPath(interpolator(progress));
      };
    },
  };
}
