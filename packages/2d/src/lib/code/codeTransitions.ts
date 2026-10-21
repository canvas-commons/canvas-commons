import {Vector2, clampRemap, map} from '@canvas-commons/core';
import {ContentTransitions, UnitPose} from '../content';
import {CodeChange} from './CodeLayout';

export type CodeTransitions = ContentTransitions<CodeChange>;

/** Show a changed unit on its side of the middle of the edit. */
function swap(
  pose: UnitPose,
  progress: number,
  {removedRows, insertedRows}: CodeChange,
  incoming: boolean,
): UnitPose {
  const mirrored = Math.abs(progress - 0.5) * 2;
  const shown = incoming ? progress >= 0.5 : progress < 0.5;
  const bigger = insertedRows > removedRows ? 1 : -1;
  const scale = bigger * (incoming ? -1 : 1) * 4;
  const nudge = map(Math.abs(insertedRows - removedRows) / scale, 0, mirrored);
  return {
    ...pose,
    position: pose.position.addY(nudge),
    opacity: pose.opacity * (shown ? clampRemap(1, 0.2, 1, 0, mirrored) : 0),
  };
}

/** Swap changed code at the middle of the edit while the rest glides. */
export const DefaultCodeTransitions: CodeTransitions = {
  incoming: (pose, progress, change) => swap(pose, progress, change, true),
  outgoing: (pose, progress, change) => swap(pose, progress, change, false),
  move: (pose, progress, delta) => ({
    ...pose,
    position: pose.position.add(Vector2.lerp(delta, Vector2.zero, progress)),
  }),
  morph: progress => 1 - progress,
};
