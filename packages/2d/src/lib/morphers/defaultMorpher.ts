import {Vector2} from '@canvas-commons/core';
import {createPolygonLerp} from '../curves/createCurveProfileLerp';
import {getPathProfile} from '../curves/getPathProfile';
import {PathMorpher} from './PathMorpher';

function polygonsToPath(polygons: Vector2[][]): string {
  return polygons
    .map(points =>
      points.map(({x, y}, i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(''),
    )
    .join('');
}

/**
 * Create a path morpher that uses the Kute.js-inspired polygon interpolation
 * algorithm. Paths are sampled into polygons, point counts are equalized, and
 * corresponding points are linearly interpolated.
 */
export function defaultMorpher(): PathMorpher {
  return {
    createInterpolator(fromPath: string, toPath: string) {
      const interpolator = createPolygonLerp(
        getPathProfile(fromPath),
        getPathProfile(toPath),
      );

      return (progress: number): string => {
        if (progress <= 0) return fromPath;
        if (progress >= 1) return toPath;
        return polygonsToPath(interpolator(progress));
      };
    },
  };
}
