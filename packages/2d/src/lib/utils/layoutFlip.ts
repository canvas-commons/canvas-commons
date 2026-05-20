import {
  InterpolationFunction,
  ThreadGenerator,
  TimingFunction,
  Vector2,
  all,
  easeInOutCubic,
  tween,
} from '@canvas-commons/core';
import {Layout} from '../components/Layout';
import {Node} from '../components/Node';

/**
 * A FLIP (First, Last, Invert, Play) snapshot of node positions.
 */
export interface PositionSnapshot {
  positions: Map<Node, {world: Vector2; parent: Node | null}>;
}

/**
 * The inverted offset to apply to a node so it appears at its pre-mutation
 * position while the play-forward tween runs.
 */
export interface InvertedNode {
  node: Node;
  channel: 'translate' | 'position';
  from: Vector2;
  to: Vector2;
}

/**
 * Collect every node whose layout could shift when the given subjects mutate.
 * Walks up each subject's ancestor chain and includes the ancestor plus all
 * of its children at every level, so cascading reflows are tracked.
 */
export function affectedLayouts(...subjects: Node[]): Node[] {
  const set = new Set<Node>();
  for (const subject of subjects) {
    if (!subject) continue;
    set.add(subject);
    let current: Node | null = subject.parent();
    while (current) {
      set.add(current);
      for (const sibling of current.children()) {
        set.add(sibling);
      }
      current = current.parent();
    }
  }
  return [...set];
}

/**
 * Capture each node's current world position and parent.
 */
export function snapshotPositions(nodes: Node[]): PositionSnapshot {
  const positions = new Map<Node, {world: Vector2; parent: Node | null}>();
  for (const node of nodes) {
    positions.set(node, {
      world: node.position.abs(),
      parent: node.parent(),
    });
  }
  return {positions};
}

/**
 * Diff two snapshots and produce the inverted offsets needed to make each
 * moved node appear to stay put. Skips nodes whose parent changed — the
 * caller is responsible for handling those via `position.abs` (the local
 * channels can't carry a meaningful delta across parent frames).
 */
export function invertPositions(
  pre: PositionSnapshot,
  post: PositionSnapshot,
): InvertedNode[] {
  const inverted: InvertedNode[] = [];
  for (const [node, preData] of pre.positions) {
    const postData = post.positions.get(node);
    if (!postData) continue;
    if (preData.world.exactlyEquals(postData.world)) continue;

    const parent = preData.parent;
    if (parent === null || parent !== postData.parent) continue;

    // World-space delta projected into the parent's local frame so it lines
    // up with translate / position, which operate in the same frame.
    const matrix = parent.worldToLocal();
    const preLocal = preData.world.transformAsPoint(matrix);
    const postLocal = postData.world.transformAsPoint(matrix);
    const delta = preLocal.sub(postLocal);
    if (delta.exactlyEquals(Vector2.zero)) continue;

    if (node instanceof Layout) {
      inverted.push({
        node,
        channel: 'translate',
        from: delta,
        to: Vector2.zero,
      });
    } else {
      const postPos = node.position();
      inverted.push({
        node,
        channel: 'position',
        from: new Vector2(postPos.x + delta.x, postPos.y + delta.y),
        to: postPos,
      });
    }
  }
  return inverted;
}

/**
 * Apply the inverted offsets immediately and then animate them back to zero.
 *
 * @param inverted - The set returned from {@link invertPositions}.
 * @param duration - How long the play-forward tween runs, in seconds.
 * @param timing - Easing function (defaults to `easeInOutCubic`).
 * @param interpolation - Vector lerp (defaults to `Vector2.lerp`).
 */
export function* playInverted(
  inverted: InvertedNode[],
  duration: number,
  timing: TimingFunction = easeInOutCubic,
  interpolation: InterpolationFunction<Vector2> = Vector2.lerp,
): ThreadGenerator {
  if (inverted.length === 0) return;

  for (const item of inverted) {
    if (item.channel === 'translate' && item.node instanceof Layout) {
      item.node.translate(item.from);
    } else if (item.channel === 'position') {
      item.node.position(item.from);
    }
  }

  try {
    yield* all(
      ...inverted.map(item =>
        tween(duration, t => {
          const progress = timing(t);
          const value = interpolation(item.from, item.to, progress);
          if (item.channel === 'translate' && item.node instanceof Layout) {
            item.node.translate(value);
          } else if (item.channel === 'position') {
            item.node.position(value);
          }
        }),
      ),
    );
  } finally {
    for (const item of inverted) {
      if (item.channel === 'translate' && item.node instanceof Layout) {
        item.node.translate(item.to);
      } else if (item.channel === 'position') {
        item.node.position(item.to);
      }
    }
  }
}
