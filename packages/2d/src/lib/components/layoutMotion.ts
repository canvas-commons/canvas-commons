import {
  BBox,
  InterpolationFunction,
  SimpleSignal,
  Vector2,
  map,
} from '@canvas-commons/core';
import type {Layout} from './Layout';

/** A difference from where a node is placed, in its box and its matrix. */
export interface BoxDelta {
  readonly position: Vector2;
  readonly size: Vector2;
  readonly move: Vector2;
  readonly rotation: number;
  readonly scale: Vector2;
}

/** A difference that decays as `progress` reaches 1. */
export interface BoxOffset extends BoxDelta {
  readonly progress: SimpleSignal<number>;
  readonly interpolation: InterpolationFunction<Vector2>;
}

/**
 * How far a layout draws its children at their own positions. While `size` is
 * set, flex measures the layout at that size and its children at `children`.
 */
export interface LayoutPin {
  readonly weight: SimpleSignal<number>;
  readonly interpolation: InterpolationFunction<Vector2>;
  readonly size: Vector2 | null;
  readonly children: ReadonlyMap<Layout, Vector2> | null;
}

/** A node the view draws above the scene, outside the clip and opacity of its parents. */
export interface LayoutFlight {
  /** The opacity of the parents the node left. */
  readonly opacity: number;
  readonly progress: SimpleSignal<number>;
}

export const NoDelta: BoxDelta = {
  position: Vector2.zero,
  size: Vector2.zero,
  move: Vector2.zero,
  rotation: 0,
  scale: Vector2.one,
};

/** Add what is left of each offset. An offset of zero is not read. */
export function offsetBy(
  value: Vector2,
  offsets: readonly BoxOffset[],
  part: 'position' | 'size' | 'move',
): Vector2 {
  for (const offset of offsets) {
    const delta = offset[part];
    if (delta.x !== 0 || delta.y !== 0) {
      value = value.add(
        offset.interpolation(delta, Vector2.zero, offset.progress()),
      );
    }
  }
  return value;
}

/** What is left of the rotation and of the scale factor of each offset. */
export function offsetTurn(offsets: readonly BoxOffset[]): {
  rotation: number;
  scale: Vector2;
} {
  let rotation = 0;
  let scale = Vector2.one;
  for (const offset of offsets) {
    if (offset.rotation !== 0) {
      rotation += map(offset.rotation, 0, offset.progress());
    }
    if (!offset.scale.exactlyEquals(Vector2.one)) {
      scale = scale.mul(
        Vector2.lerp(offset.scale, Vector2.one, offset.progress()),
      );
    }
  }
  return {rotation, scale};
}

export function boxDelta(
  from: BBox,
  to: BBox,
): Pick<BoxDelta, 'position' | 'size'> | null {
  const position = new Vector2(from.x - to.x, from.y - to.y);
  const size = new Vector2(from.width - to.width, from.height - to.height);
  return position.exactlyEquals(Vector2.zero) &&
    size.exactlyEquals(Vector2.zero)
    ? null
    : {position, size};
}

function turnOf(matrix: DOMMatrix): {rotation: number; scale: Vector2} {
  const x = Math.hypot(matrix.a, matrix.b);
  const y = x === 0 ? 0 : (matrix.a * matrix.d - matrix.b * matrix.c) / x;
  return {
    rotation: Vector2.degrees(matrix.a, matrix.b),
    scale: new Vector2(x, y),
  };
}

/** The rotation and the scale factor that turn the matrix `to` into `from`. */
export function turnDelta(
  from: DOMMatrix,
  to: DOMMatrix,
): Pick<BoxDelta, 'rotation' | 'scale'> {
  const start = turnOf(from);
  const end = turnOf(to);
  const rotation = start.rotation - end.rotation;
  return {
    rotation: rotation - 360 * Math.round(rotation / 360),
    scale: new Vector2(
      end.scale.x === 0 ? 1 : start.scale.x / end.scale.x,
      end.scale.y === 0 ? 1 : start.scale.y / end.scale.y,
    ),
  };
}
