import {
  InterpolationFunction,
  ThreadGenerator,
  TimingFunction,
  Vector2,
  easeInOutCubic,
} from '@canvas-commons/core';
import {is} from '../../utils';
import {Layout} from '../Layout';
import {Node} from '../Node';

function flexTree(node: Node | null): Layout[] {
  const layout = node instanceof Layout ? node : node?.findAncestor(is(Layout));
  return layout?.flexTree() ?? [];
}

/**
 * Insert `node` into `newParent` and offset it, and the nodes of the flex
 * trees it leaves and enters, back to where they were drawn. The view draws
 * the node above the scene until the offsets are gone.
 */
export function* transitionTo(
  node: Node,
  newParent: Node,
  indexOrDuration: number,
  durationOrTiming?: number | TimingFunction,
  timing: TimingFunction = easeInOutCubic,
  interpolation: InterpolationFunction<Vector2> = Vector2.lerp,
): ThreadGenerator {
  const [index, duration, actualTiming] =
    typeof durationOrTiming === 'number'
      ? [indexOrDuration, durationOrTiming, timing]
      : [Infinity, indexOrDuration, durationOrTiming ?? timing];

  const view = newParent.view();
  const opacity = node.parent()?.absoluteOpacity() ?? 1;
  const motion = view.offsetLayout(
    [node, ...flexTree(node.parent()), ...flexTree(newParent)],
    () => newParent.insert(node, index),
    interpolation,
  );
  const flight = {opacity, progress: motion.progress};
  view.flights.set(node, flight);

  try {
    yield* motion.progress(1, duration, actualTiming);
  } finally {
    motion.release();
    if (view.flights.get(node) === flight) {
      view.flights.delete(node);
    }
  }
}
