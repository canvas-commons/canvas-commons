import {Vector2, clampRemap} from '@canvas-commons/core';
import {ContentTransitions} from './motion';

const THIRD = 1 / 3;

/**
 * Old units shrink away, the rest moves, then new units are typed in from the
 * left. Each takes a third of the edit. Works for every change type.
 */
export const TypedTransitions: ContentTransitions<unknown> = {
  outgoing: (pose, progress) => ({
    ...pose,
    scale: pose.scale * clampRemap(0, THIRD, 1, 0, progress),
    opacity: progress < THIRD ? pose.opacity : 0,
  }),
  move: (pose, progress, delta) => ({
    ...pose,
    position: pose.position.add(
      Vector2.lerp(
        delta,
        Vector2.zero,
        clampRemap(THIRD, 2 * THIRD, 0, 1, progress),
      ),
    ),
  }),
  incoming: (pose, progress) => ({
    ...pose,
    reveal: pose.reveal * clampRemap(2 * THIRD, 1, 0, 1, progress),
  }),
  morph: progress => (progress < THIRD ? 1 : 0),
};
