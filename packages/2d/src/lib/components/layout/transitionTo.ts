import {
  InterpolationFunction,
  ThreadGenerator,
  TimingFunction,
  Vector2,
  all,
  easeInOutCubic,
} from '@canvas-commons/core';
import {Layout, LayoutProps} from '../Layout';
import {Node} from '../Node';

type WrapperSide = 'left' | 'right' | 'top' | 'bottom';

interface SlotInfo {
  wrapper: Layout;
  side: WrapperSide | null;
  gap: number;
}

/**
 * Move a {@link Layout} into a new parent. The old slot shrinks, the new
 * slot grows, and the source itself parks in the view for the duration of
 * the tween so its world position, rotation, and opacity can be driven
 * directly without inheriting either parent's chain.
 */
export function* transitionTo(
  source: Layout,
  newParent: Node,
  indexOrDuration: number,
  durationOrTiming?: number | TimingFunction,
  timing: TimingFunction = easeInOutCubic,
  interpolation: InterpolationFunction<Vector2> = Vector2.lerp,
): ThreadGenerator {
  let index: number;
  let duration: number;
  let actualTiming: TimingFunction;
  if (typeof durationOrTiming === 'number') {
    index = indexOrDuration;
    duration = durationOrTiming;
    actualTiming = timing;
  } else {
    index = Infinity;
    duration = indexOrDuration;
    actualTiming = durationOrTiming ?? timing;
  }

  const oldParent = source.parent();
  const oldIndex = oldParent ? oldParent.children().indexOf(source) : -1;
  const view = (oldParent ?? newParent).view();

  const startWorld = source.position.abs();
  const startWorldRotation = source.rotation.abs();
  const startWorldOpacity = source.opacity() * ancestorOpacity(source);

  source.remove();
  newParent.insert(source, index);
  const naturalSize = new Vector2(source.size());
  const targetWorld = source.position.abs();
  const targetWorldRotation = source.rotation.abs();
  const targetWorldOpacity = source.opacity() * ancestorOpacity(source);
  const targetIndex = newParent.children().indexOf(source);
  source.remove();

  const oldParentLayout = oldParent instanceof Layout ? oldParent : null;
  const newParentLayout = newParent instanceof Layout ? newParent : null;

  const shrinkInfo =
    oldParentLayout && oldIndex >= 0
      ? buildShrinkWrapper(oldParentLayout, oldIndex, naturalSize)
      : null;
  const growInfo = newParentLayout
    ? buildGrowWrapper(newParentLayout, targetIndex)
    : null;

  const savedLayoutSelf = source.layoutSelf.context.raw();
  const savedOpacity = source.opacity.context.raw();
  const savedRotation = source.rotation.context.raw();
  view.add(source);
  source.layoutSelf(false);
  source.position.abs(startWorld);
  source.rotation.abs(startWorldRotation);
  source.opacity(startWorldOpacity);

  const tasks: ThreadGenerator[] = [
    source.position.abs(targetWorld, duration, actualTiming, interpolation),
    source.rotation.abs(targetWorldRotation, duration, actualTiming),
    source.opacity(targetWorldOpacity, duration, actualTiming),
  ];

  if (shrinkInfo) {
    tasks.push(playShrink(shrinkInfo, duration, actualTiming));
  }
  if (growInfo) {
    tasks.push(playGrow(growInfo, naturalSize, duration, actualTiming));
  }

  try {
    yield* all(...tasks);
  } finally {
    if (savedOpacity === undefined) {
      source.opacity.context.reset();
    } else {
      source.opacity.context.setter(savedOpacity);
    }
    if (savedRotation === undefined) {
      source.rotation.context.reset();
    } else {
      source.rotation.context.setter(savedRotation);
    }

    // The grow wrapper has reached the source's natural size, so swapping
    // the source into its slot is visually invisible.
    if (growInfo) {
      const wrapperIndex = newParent.children().indexOf(growInfo.wrapper);
      if (wrapperIndex >= 0) {
        newParent.insert(source, wrapperIndex);
        growInfo.wrapper.remove();
      }
    } else {
      newParent.insert(source, targetIndex);
    }

    if (shrinkInfo) {
      shrinkInfo.wrapper.remove();
    }

    if (savedLayoutSelf === undefined) {
      source.layoutSelf.context.reset();
    } else {
      source.layoutSelf.context.setter(savedLayoutSelf);
    }
  }
}

function ancestorOpacity(node: Node): number {
  let opacity = 1;
  let parent = node.parent();
  while (parent) {
    opacity *= parent.opacity();
    parent = parent.parent();
  }
  return opacity;
}

function buildShrinkWrapper(
  oldParent: Layout,
  oldIndex: number,
  naturalSize: Vector2,
): SlotInfo {
  const wrapper = new Layout({
    layout: true,
    shrink: 0,
    width: naturalSize.x,
    height: naturalSize.y,
  });
  oldParent.insert(wrapper, oldIndex);

  const otherFlexCount = oldParent.children().length - 1;
  let side: WrapperSide | null = null;
  let gap = 0;
  if (otherFlexCount > 0) {
    const isHorizontal =
      oldParent.direction() === 'row' ||
      oldParent.direction() === 'row-reverse';
    gap = isHorizontal ? oldParent.gap.x() : oldParent.gap.y();
    const isLast = oldIndex >= oldParent.children().length - 1;
    side = isHorizontal
      ? isLast
        ? 'left'
        : 'right'
      : isLast
        ? 'top'
        : 'bottom';
  }
  return {wrapper, side, gap};
}

function buildGrowWrapper(newParent: Layout, targetIndex: number): SlotInfo {
  const otherFlexCount = newParent.children().length;
  let side: WrapperSide | null = null;
  let gap = 0;
  if (otherFlexCount > 0) {
    const isHorizontal =
      newParent.direction() === 'row' ||
      newParent.direction() === 'row-reverse';
    gap = isHorizontal ? newParent.gap.x() : newParent.gap.y();
    const totalAfter = otherFlexCount + 1;
    const isLast = targetIndex >= totalAfter - 1;
    side = isHorizontal
      ? isLast
        ? 'left'
        : 'right'
      : isLast
        ? 'top'
        : 'bottom';
  }

  const wrapperProps: LayoutProps = {
    layout: true,
    shrink: 0,
    width: 0,
    height: 0,
  };
  if (side === 'left') wrapperProps.marginLeft = -gap;
  else if (side === 'right') wrapperProps.marginRight = -gap;
  else if (side === 'top') wrapperProps.marginTop = -gap;
  else if (side === 'bottom') wrapperProps.marginBottom = -gap;

  const wrapper = new Layout(wrapperProps);
  newParent.insert(wrapper, targetIndex);
  return {wrapper, side, gap};
}

function* playShrink(
  info: SlotInfo,
  duration: number,
  timing: TimingFunction,
): ThreadGenerator {
  const {wrapper, side, gap} = info;
  const sub: ThreadGenerator[] = [
    wrapper.size.x(0, duration, timing),
    wrapper.size.y(0, duration, timing),
  ];
  if (side) {
    sub.push(wrapper.margin[side](-gap, duration, timing));
  }
  yield* all(...sub);
}

function* playGrow(
  info: SlotInfo,
  naturalSize: Vector2,
  duration: number,
  timing: TimingFunction,
): ThreadGenerator {
  const {wrapper, side} = info;
  const sub: ThreadGenerator[] = [
    wrapper.size.x(naturalSize.x, duration, timing),
    wrapper.size.y(naturalSize.y, duration, timing),
  ];
  if (side) {
    sub.push(wrapper.margin[side](0, duration, timing));
  }
  yield* all(...sub);
}
