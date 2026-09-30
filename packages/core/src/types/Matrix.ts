import {Vector2} from './Vector';

export function transformAngle(angle: number, matrix: DOMMatrix) {
  return Vector2.fromDegrees(angle).transform(matrix).degrees;
}

export function transformScalar(scalar: number, matrix: DOMMatrix) {
  return Vector2.magnitude(matrix.m11, matrix.m12) * scalar;
}

/**
 * Scale a scalar by the extent of the matrix along each output axis.
 *
 * @remarks
 * A distance that is isotropic in the source space becomes an ellipse under a
 * non-uniform scale. The result is the half-size of the box that bounds it.
 */
export function transformScalarPerAxis(
  scalar: number,
  matrix: DOMMatrix,
): Vector2 {
  return new Vector2(
    Vector2.magnitude(matrix.m11, matrix.m21) * scalar,
    Vector2.magnitude(matrix.m12, matrix.m22) * scalar,
  );
}
