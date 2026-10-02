import {
  InterpolationFunction,
  SignalValue,
  SimpleSignal,
  ThreadGenerator,
  TimingFunction,
  Vector2,
  all,
  createSignal,
  easeInOutCubic,
  tween,
  unwrap,
} from '@canvas-commons/core';
import {Layout} from '../components/Layout';
import {Node} from '../components/Node';
import {restoreRaw} from './rawSignal';

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
 * The offset that moves a node from its post position back to its pre
 * position, in the local frame of `frame`.
 */
export function invertedOffset(
  preWorld: Vector2,
  postWorld: Vector2,
  frame: Node,
): Vector2 {
  const matrix = frame.worldToLocal();
  return preWorld
    .transformAsPoint(matrix)
    .sub(postWorld.transformAsPoint(matrix));
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

    if (node instanceof Layout) {
      inverted.push({
        node,
        channel: 'translate',
        from: invertedOffset(preData.world, postData.world, node),
        to: Vector2.zero,
      });
    } else {
      const delta = invertedOffset(preData.world, postData.world, parent);
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

interface OffsetLayer {
  rawX: SignalValue<number> | undefined;
  rawY: SignalValue<number> | undefined;
  layeredX: () => number;
  layeredY: () => number;
  offsets: SimpleSignal<(() => Vector2)[]>;
}

const OFFSET_LAYERS = new WeakMap<object, OffsetLayer>();

/** Add `offset` to the node's own translate or position; returns its remover. */
function applyOffset(item: InvertedNode, offset: () => Vector2): () => void {
  const {node} = item;
  const [x, y] =
    item.channel === 'translate' && node instanceof Layout
      ? [node.translate.x, node.translate.y]
      : [node.x, node.y];

  let layer = OFFSET_LAYERS.get(x);
  if (!layer) {
    const rawX = x.context.raw();
    const rawY = y.context.raw();
    const offsets = createSignal<(() => Vector2)[]>([]);
    const total = () =>
      offsets().reduce((sum, active) => sum.add(active()), Vector2.zero);
    const layeredX = () => unwrap(rawX ?? 0) + total().x;
    const layeredY = () => unwrap(rawY ?? 0) + total().y;
    x.context.setter(layeredX);
    y.context.setter(layeredY);
    layer = {rawX, rawY, layeredX, layeredY, offsets};
    OFFSET_LAYERS.set(x, layer);
  }

  const {rawX, rawY, layeredX, layeredY, offsets} = layer;
  offsets([...offsets(), offset]);
  return () => {
    offsets(offsets().filter(active => active !== offset));
    if (offsets().length === 0) {
      if (x.context.raw() === layeredX) restoreRaw(x, rawX);
      if (y.context.raw() === layeredY) restoreRaw(y, rawY);
      OFFSET_LAYERS.delete(x);
    }
  };
}

/**
 * Apply the inverted offsets and animate them away. The node's own translate
 * or position comes back when the tween ends or is cancelled.
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

  const animated = inverted.map(item => {
    const offset = createSignal(item.from.sub(item.to));
    return {item, offset, restore: applyOffset(item, offset)};
  });

  try {
    yield* all(
      ...animated.map(({item, offset}) =>
        tween(duration, t => {
          const value = interpolation(item.from, item.to, timing(t));
          offset(value.sub(item.to));
        }),
      ),
    );
  } finally {
    for (const {restore} of animated) {
      restore();
    }
  }
}
