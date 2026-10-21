import {
  BBox,
  DEFAULT,
  Direction,
  InterpolationFunction,
  Origin,
  PossibleSpacing,
  PossibleVector2,
  SerializedVector2,
  Signal,
  SignalValue,
  SimpleSignal,
  Spacing,
  SpacingSignal,
  ThreadGenerator,
  TimingFunction,
  Vector2,
  Vector2Signal,
  all,
  boolLerp,
  createSignal,
  deepLerp,
  easeInOutCubic,
  modify,
  originToOffset,
  threadable,
  tween,
  unwrap,
} from '@canvas-commons/core';
import {
  Vector2LengthSignal,
  addInitializer,
  cloneable,
  computed,
  defaultStyle,
  initial,
  interpolation,
  nodeName,
  signal,
  vector2Signal,
  wrapper,
} from '../decorators';
import {spacingSignal} from '../decorators/spacingSignal';
import {
  LayoutPositionSignal,
  LayoutPositionSignalContext,
} from '../decorators/transformSignals';
import {
  DesiredLength,
  FlexBasis,
  FlexContent,
  FlexDirection,
  FlexItems,
  FlexWrap,
  LayoutMode,
  Length,
  LengthLimit,
  TextAlign,
  TextWrap,
  VerticalAlign,
  WordBreak,
} from '../partials';
import {buildCanvasFontString, resolveLineHeight} from '../text';
import {drawLine, drawPivot, is} from '../utils';
import {
  Edge,
  PositionType,
  createYogaNode,
  setYogaDimension,
  setYogaFlexBasis,
  setYogaGap,
  setYogaSpacing,
  toYogaAlignContent,
  toYogaAlignItems,
  toYogaFlexDirection,
  toYogaFlexWrap,
  toYogaJustifyContent,
  type YogaNode,
} from '../utils/yoga';
import {ContentFloors} from './contentFloors';
import {
  BoxDelta,
  BoxOffset,
  LayoutPin,
  NoDelta,
  boxDelta,
  offsetBy,
  turnDelta,
} from './layoutMotion';
import {Node, NodeProps} from './Node';
import type {LayoutSettler, SettledBox} from './settledLayout';
import {LayoutSettlers, SettledBoxes} from './settledLayout';
import {ComponentChildren} from './types';

/**
 * Override the per-node entrance or exit animation used by
 * {@link Layout.add}, {@link Layout.insert}, and {@link Layout.remove}.
 */
export type LayoutAnimateCallback = (
  node: Layout,
  duration: number,
  timing: TimingFunction,
) => ThreadGenerator;

export interface LayoutProps extends NodeProps {
  layout?: LayoutMode;
  /**
   * Whether this node participates in its parent's flex layout. When
   * `null` (the default), falls back to {@link layout}.
   */
  layoutSelf?: LayoutMode;
  /**
   * Whether this node lays out its own children with flex. When `null`
   * (the default), falls back to {@link layout}.
   */
  layoutChildren?: LayoutMode;

  width?: SignalValue<Length>;
  height?: SignalValue<Length>;
  maxWidth?: SignalValue<LengthLimit>;
  maxHeight?: SignalValue<LengthLimit>;
  minWidth?: SignalValue<LengthLimit>;
  minHeight?: SignalValue<LengthLimit>;
  ratio?: SignalValue<number>;

  marginTop?: SignalValue<number>;
  marginBottom?: SignalValue<number>;
  marginLeft?: SignalValue<number>;
  marginRight?: SignalValue<number>;
  margin?: SignalValue<PossibleSpacing>;

  paddingTop?: SignalValue<number>;
  paddingBottom?: SignalValue<number>;
  paddingLeft?: SignalValue<number>;
  paddingRight?: SignalValue<number>;
  padding?: SignalValue<PossibleSpacing>;

  direction?: SignalValue<FlexDirection>;
  basis?: SignalValue<FlexBasis>;
  grow?: SignalValue<number>;
  shrink?: SignalValue<number>;
  wrap?: SignalValue<FlexWrap>;

  justifyContent?: SignalValue<FlexContent>;
  alignContent?: SignalValue<FlexContent>;
  alignItems?: SignalValue<FlexItems>;
  alignSelf?: SignalValue<FlexItems>;
  rowGap?: SignalValue<Length>;
  columnGap?: SignalValue<Length>;
  gap?: SignalValue<PossibleVector2<Length>>;

  fontFamily?: SignalValue<string>;
  fontSize?: SignalValue<number>;
  fontStyle?: SignalValue<string>;
  fontWeight?: SignalValue<number>;
  lineHeight?: SignalValue<Length>;
  letterSpacing?: SignalValue<number>;
  textWrap?: SignalValue<TextWrap>;
  textDirection?: SignalValue<CanvasDirection>;
  textAlign?: SignalValue<TextAlign>;
  verticalAlign?: SignalValue<VerticalAlign>;
  wordBreak?: SignalValue<WordBreak>;

  size?: SignalValue<PossibleVector2<Length>>;
  anchorX?: SignalValue<number>;
  anchorY?: SignalValue<number>;
  anchor?: SignalValue<PossibleVector2>;
  translateX?: SignalValue<number>;
  translateY?: SignalValue<number>;
  translate?: SignalValue<PossibleVector2>;
  /**
   * The position of the center of this node.
   *
   * @remarks
   * This shortcut property will set the node's position so that the center ends
   * up in the given place.
   * If present, overrides the {@link NodeProps.position} property.
   * When {@link anchor} is not set, this will be the same as the
   * {@link NodeProps.position}.
   */
  middle?: SignalValue<PossibleVector2>;
  /**
   * The position of the top edge of this node.
   *
   * @remarks
   * This shortcut property will set the node's position so that the top edge
   * ends up in the given place.
   * If present, overrides the {@link NodeProps.position} property.
   */
  top?: SignalValue<PossibleVector2>;
  /**
   * The position of the bottom edge of this node.
   *
   * @remarks
   * This shortcut property will set the node's position so that the bottom edge
   * ends up in the given place.
   * If present, overrides the {@link NodeProps.position} property.
   */
  bottom?: SignalValue<PossibleVector2>;
  /**
   * The position of the left edge of this node.
   *
   * @remarks
   * This shortcut property will set the node's position so that the left edge
   * ends up in the given place.
   * If present, overrides the {@link NodeProps.position} property.
   */
  left?: SignalValue<PossibleVector2>;
  /**
   * The position of the right edge of this node.
   *
   * @remarks
   * This shortcut property will set the node's position so that the right edge
   * ends up in the given place.
   * If present, overrides the {@link NodeProps.position} property.
   */
  right?: SignalValue<PossibleVector2>;
  /**
   * The position of the top left corner of this node.
   *
   * @remarks
   * This shortcut property will set the node's position so that the top left
   * corner ends up in the given place.
   * If present, overrides the {@link NodeProps.position} property.
   */
  topLeft?: SignalValue<PossibleVector2>;
  /**
   * The position of the top right corner of this node.
   *
   * @remarks
   * This shortcut property will set the node's position so that the top right
   * corner ends up in the given place.
   * If present, overrides the {@link NodeProps.position} property.
   */
  topRight?: SignalValue<PossibleVector2>;
  /**
   * The position of the bottom left corner of this node.
   *
   * @remarks
   * This shortcut property will set the node's position so that the bottom left
   * corner ends up in the given place.
   * If present, overrides the {@link NodeProps.position} property.
   */
  bottomLeft?: SignalValue<PossibleVector2>;
  /**
   * The position of the bottom right corner of this node.
   *
   * @remarks
   * This shortcut property will set the node's position so that the bottom
   * right corner ends up in the given place.
   * If present, overrides the {@link NodeProps.position} property.
   */
  bottomRight?: SignalValue<PossibleVector2>;
  clip?: SignalValue<boolean>;
}

/**
 * Passes a layout root takes, after the first, to find boxes a text that
 * reads them agrees with.
 */
const SETTLE_PASSES = 6;

/** The nodes of a layout root and those of them that read its settled boxes. */
type SettlingTree = {
  nodes: Layout[];
  settlers: {node: number; settler: LayoutSettler}[];
};

function computedBoxes(nodes: readonly Layout[]): SettledBox[] {
  return nodes.map(node => {
    const {left, top, width, height} = node.yogaNode.getComputedLayout();
    return {left, top, width, height};
  });
}

function sameBoxes(a: readonly SettledBox[], b: readonly SettledBox[]) {
  return a.every(
    (box, i) =>
      box.left === b[i].left &&
      box.top === b[i].top &&
      box.width === b[i].width &&
      box.height === b[i].height,
  );
}

interface FlexBox {
  readonly box: BBox;
  readonly size: Vector2;
  readonly offsets: readonly BoxOffset[] | undefined;
  readonly presence: SimpleSignal<number> | undefined;
  readonly pin: LayoutPin | undefined;
}

interface FreeMotion {
  readonly offsets: readonly BoxOffset[] | undefined;
  readonly presence: SimpleSignal<number> | undefined;
}

/** How a node is drawn before the mutation of a layout transition. */
interface MotionStart {
  readonly parent: Node | null;
  readonly flex: boolean;
  readonly box: BBox;
  readonly parentToWorld: DOMMatrix | undefined;
  readonly localToParent: DOMMatrix;
}

function depth(node: Node): number {
  let count = 0;
  for (let parent = node.parent(); parent; parent = parent.parent()) {
    count++;
  }
  return count;
}

function isPercent(value: DesiredLength): value is `${number}%` {
  return typeof value === 'string' && value.endsWith('%');
}

function isRowDirection(direction: FlexDirection): boolean {
  return direction === 'row' || direction === 'row-reverse';
}

/** Where a child entering between `before` and `after` starts on the main axis. */
function openingEdge(
  before: BBox | undefined,
  after: BBox | undefined,
  center: number,
  axis: 'x' | 'y',
): number | null {
  const span = (box: BBox): [number, number] =>
    axis === 'x' ? [box.left, box.right] : [box.top, box.bottom];
  if (before && after) {
    const [beforeLow, beforeHigh] = span(before);
    const [afterLow, afterHigh] = span(after);
    return beforeLow <= afterLow
      ? (beforeHigh + afterLow) / 2
      : (afterHigh + beforeLow) / 2;
  }
  const neighbor = before ?? after;
  if (!neighbor) {
    return null;
  }
  const [low, high] = span(neighbor);
  return center >= neighbor.center[axis] ? high : low;
}

@nodeName('Layout')
export class Layout extends Node {
  @initial(null)
  @interpolation(boolLerp)
  @signal()
  declare public readonly layout: SimpleSignal<LayoutMode, this>;

  /**
   * Whether this node participates in its parent's flex layout. Use
   * {@link layoutEnabled} to read the resolved mode.
   */
  @initial(null)
  @interpolation(boolLerp)
  @signal()
  declare public readonly layoutSelf: SimpleSignal<LayoutMode, this>;

  /**
   * Whether this node lays out its own children with flex. Use
   * {@link canLayoutChildren} to read the resolved mode.
   */
  @initial(null)
  @interpolation(boolLerp)
  @signal()
  declare public readonly layoutChildren: SimpleSignal<LayoutMode, this>;

  @initial(null)
  @signal()
  declare public readonly maxWidth: SimpleSignal<LengthLimit, this>;
  @initial(null)
  @signal()
  declare public readonly maxHeight: SimpleSignal<LengthLimit, this>;
  /**
   * The smallest width flex may shrink this node to. Left unset, a flex item
   * of a row keeps room for its narrowest content, capped by its own `width`
   * and `maxWidth`; `0` lets it shrink past that, as CSS `min-width: 0` does.
   *
   * @example
   * ```tsx
   * <Layout layout width={420}>
   *   <Layout minWidth={0}>
   *     <Txt text={'Content'} />
   *   </Layout>
   * </Layout>
   * ```
   */
  @initial(null)
  @signal()
  declare public readonly minWidth: SimpleSignal<LengthLimit, this>;
  @initial(null)
  @signal()
  declare public readonly minHeight: SimpleSignal<LengthLimit, this>;
  @initial(null)
  @signal()
  declare public readonly ratio: SimpleSignal<number | null, this>;

  @spacingSignal('margin')
  declare public readonly margin: SpacingSignal<this>;

  @spacingSignal('padding')
  declare public readonly padding: SpacingSignal<this>;

  @initial('row')
  @signal()
  declare public readonly direction: SimpleSignal<FlexDirection, this>;
  @initial(null)
  @signal()
  declare public readonly basis: SimpleSignal<FlexBasis, this>;
  @initial(0)
  @signal()
  declare public readonly grow: SimpleSignal<number, this>;
  @initial(1)
  @signal()
  declare public readonly shrink: SimpleSignal<number, this>;
  @initial('nowrap')
  @signal()
  declare public readonly wrap: SimpleSignal<FlexWrap, this>;

  @initial('start')
  @signal()
  declare public readonly justifyContent: SimpleSignal<FlexContent, this>;
  @initial('normal')
  @signal()
  declare public readonly alignContent: SimpleSignal<FlexContent, this>;
  @initial('stretch')
  @signal()
  declare public readonly alignItems: SimpleSignal<FlexItems, this>;
  @initial('auto')
  @signal()
  declare public readonly alignSelf: SimpleSignal<FlexItems, this>;
  @initial(0)
  @vector2Signal({x: 'columnGap', y: 'rowGap'})
  declare public readonly gap: Vector2LengthSignal<this>;
  public get columnGap(): Signal<Length, number, this> {
    return this.gap.x;
  }
  public get rowGap(): Signal<Length, number, this> {
    return this.gap.y;
  }

  @defaultStyle('Roboto')
  @signal()
  declare public readonly fontFamily: SimpleSignal<string, this>;
  @defaultStyle(48)
  @signal()
  declare public readonly fontSize: SimpleSignal<number, this>;
  @defaultStyle('normal')
  @signal()
  declare public readonly fontStyle: SimpleSignal<string, this>;
  @defaultStyle(500)
  @signal()
  declare public readonly fontWeight: SimpleSignal<number, this>;
  @defaultStyle('120%')
  @signal()
  declare public readonly lineHeight: SimpleSignal<Length, this>;
  @defaultStyle(0)
  @signal()
  declare public readonly letterSpacing: SimpleSignal<number, this>;

  @defaultStyle(true)
  @signal()
  declare public readonly textWrap: SimpleSignal<TextWrap, this>;
  @initial('ltr')
  @signal()
  declare public readonly textDirection: SimpleSignal<CanvasDirection, this>;
  @defaultStyle('start')
  @signal()
  declare public readonly textAlign: SimpleSignal<TextAlign, this>;
  @defaultStyle('top')
  @signal()
  declare public readonly verticalAlign: SimpleSignal<VerticalAlign, this>;
  @defaultStyle('normal')
  @signal()
  declare public readonly wordBreak: SimpleSignal<WordBreak, this>;

  protected getX(): number {
    if (this.isLayoutRoot()) {
      return this.x.context.getter();
    }

    return this.computedPosition().x;
  }
  protected setX(value: SignalValue<number>) {
    this.x.context.setter(value);
  }

  protected getY(): number {
    if (this.isLayoutRoot()) {
      return this.y.context.getter();
    }

    return this.computedPosition().y;
  }
  protected setY(value: SignalValue<number>) {
    this.y.context.setter(value);
  }

  /**
   * Represents the size of this node.
   *
   * @remarks
   * A size is a two-dimensional vector, where `x` represents the `width`, and `y`
   * represents the `height`.
   *
   * The value of both x and y is of type {@link partials.Length} which is
   * either:
   * - `number` - the desired length in pixels
   * - `${number}%` - a string with the desired length in percents, for example
   *                  `'50%'`
   * - `null` - an automatic length
   *
   * When retrieving the size, all units are converted to pixels, using the
   * current state of the layout. For example, retrieving the width set to
   * `'50%'`, while the parent has a width of `200px` will result in the number
   * `100` being returned.
   *
   * When the node is not part of the layout, setting its size using percents
   * refers to the size of the nearest ancestor that has a size or a layout,
   * which is the entire scene when no other ancestor does.
   *
   * @example
   * Initializing the size:
   * ```tsx
   * // with a possible vector:
   * <Node size={['50%', 200]} />
   * // with individual components:
   * <Node width={'50%'} height={200} />
   * ```
   *
   * Accessing the size:
   * ```tsx
   * // retrieving the vector:
   * const size = node.size();
   * // retrieving an individual component:
   * const width = node.size.x();
   * ```
   *
   * Setting the size:
   * ```tsx
   * // with a possible vector:
   * node.size(['50%', 200]);
   * node.size(() => ['50%', 200]);
   * // with individual components:
   * node.size.x('50%');
   * node.size.x(() => '50%');
   * ```
   */
  @initial({x: null, y: null})
  @vector2Signal({x: 'width', y: 'height'})
  declare public readonly size: Vector2LengthSignal<this>;
  public get width(): Signal<Length, number, this> {
    return this.size.x;
  }
  public get height(): Signal<Length, number, this> {
    return this.size.y;
  }

  protected getWidth(): number {
    return this.computedSize().width;
  }
  protected setWidth(value: SignalValue<Length>) {
    this.width.context.setter(value);
  }

  @threadable()
  protected *tweenWidth(
    value: SignalValue<Length>,
    time: number,
    timingFunction: TimingFunction,
    interpolationFunction: InterpolationFunction<Length>,
  ): ThreadGenerator {
    const width = this.desiredSize().x;
    const lock = typeof width !== 'number' || typeof value !== 'number';
    let from: number;
    if (lock) {
      from = this.layoutSize().x;
    } else {
      from = width;
    }

    let to: number;
    if (lock) {
      this.size.x(value);
      to = this.layoutSize().x;
    } else {
      to = value;
    }

    this.size.x(from);
    lock && this.lockLayout();
    yield* tween(time, value =>
      this.size.x(interpolationFunction(from, to, timingFunction(value))),
    );
    this.size.x(value);
    lock && this.releaseLayout();
  }

  protected getHeight(): number {
    return this.computedSize().height;
  }
  protected setHeight(value: SignalValue<Length>) {
    this.height.context.setter(value);
  }

  @threadable()
  protected *tweenHeight(
    value: SignalValue<Length>,
    time: number,
    timingFunction: TimingFunction,
    interpolationFunction: InterpolationFunction<Length>,
  ): ThreadGenerator {
    const height = this.desiredSize().y;
    const lock = typeof height !== 'number' || typeof value !== 'number';

    let from: number;
    if (lock) {
      from = this.layoutSize().y;
    } else {
      from = height;
    }

    let to: number;
    if (lock) {
      this.size.y(value);
      to = this.layoutSize().y;
    } else {
      to = value;
    }

    this.size.y(from);
    lock && this.lockLayout();
    yield* tween(time, value =>
      this.size.y(interpolationFunction(from, to, timingFunction(value))),
    );
    this.size.y(value);
    lock && this.releaseLayout();
  }

  /**
   * Get the desired size of this node.
   *
   * @remarks
   * This method can be used to control the size using external factors.
   * By default, the returned size is the same as the one declared by the user.
   */
  @computed()
  protected desiredSize(): SerializedVector2<DesiredLength> {
    return {
      x: this.width.context.getter(),
      y: this.height.context.getter(),
    };
  }

  @threadable()
  protected *tweenSize(
    value: SignalValue<SerializedVector2<Length>>,
    time: number,
    timingFunction: TimingFunction,
    interpolationFunction: InterpolationFunction<Vector2>,
  ): ThreadGenerator {
    const size = this.desiredSize();
    let from: Vector2;
    if (typeof size.x !== 'number' || typeof size.y !== 'number') {
      from = this.layoutSize();
    } else {
      from = new Vector2(<Vector2>size);
    }

    let to: Vector2;
    if (
      typeof value === 'object' &&
      typeof value.x === 'number' &&
      typeof value.y === 'number'
    ) {
      to = new Vector2(<Vector2>value);
    } else {
      this.size(value);
      to = this.layoutSize();
    }

    this.size(from);
    this.lockLayout();
    yield* tween(time, value =>
      this.size(interpolationFunction(from, to, timingFunction(value))),
    );
    this.releaseLayout();
    this.size(value);
  }

  @threadable()
  protected *tweenPadding(
    value: SignalValue<PossibleSpacing>,
    time: number,
    timingFunction: TimingFunction,
    interpolationFunction: InterpolationFunction<Spacing>,
  ): ThreadGenerator {
    const from = this.padding();
    this.lockLayout();
    yield* tween(time, t => {
      const target = this.padding.context.parse(unwrap(value));
      this.padding(interpolationFunction(from, target, timingFunction(t)));
    });
    this.releaseLayout();
  }

  @threadable()
  protected *tweenMargin(
    value: SignalValue<PossibleSpacing>,
    time: number,
    timingFunction: TimingFunction,
    interpolationFunction: InterpolationFunction<Spacing>,
  ): ThreadGenerator {
    const from = this.margin();
    this.lockLayout();
    yield* tween(time, t => {
      const target = this.margin.context.parse(unwrap(value));
      this.margin(interpolationFunction(from, target, timingFunction(t)));
    });
    this.releaseLayout();
  }

  @threadable()
  protected *tweenGap(
    value: SignalValue<PossibleVector2<Length>>,
    time: number,
    timingFunction: TimingFunction,
    interpolationFunction: InterpolationFunction<Vector2>,
  ): ThreadGenerator {
    const from = this.gap();
    this.lockLayout();
    yield* tween(time, t => {
      const target = this.gap.context.parse(unwrap(value));
      this.gap(
        interpolationFunction(from, target as Vector2, timingFunction(t)),
      );
    });
    this.releaseLayout();
  }

  /**
   * Represents the offset of this node's origin.
   *
   * @remarks
   * By default, the origin of a node is located at its center. The origin
   * serves as the pivot point when rotating and scaling a node, but it doesn't
   * affect the placement of its children.
   *
   * The value is relative to the size of this node. A value of `1` means as far
   * to the right/bottom as possible. Here are a few examples of anchors:
   * - `[-1, -1]` or `Vector2.topLeft` - top left corner
   * - `[1, -1]` or `Vector2.topRight` - top right corner
   * - `[0, 1]` or `Vector2.bottom` - bottom edge
   * - `[-1, 1]` or `Vector2.bottomLeft` - bottom left corner
   */
  @vector2Signal('anchor')
  declare public readonly anchor: Vector2Signal<this>;

  /**
   * A visual offset applied to this node's rendering, analogous to CSS
   * `transform: translate()`. Does not affect layout.
   */
  @initial(Vector2.zero)
  @vector2Signal('translate')
  declare public readonly translate: Vector2Signal<this>;

  /**
   * The position of the center of this node.
   *
   * @remarks
   * When set, this shortcut property will modify the node's position so that
   * the center ends up in the given place.
   *
   * If the {@link anchor} has not been changed, this will be the same as the
   * {@link position}.
   *
   * When retrieved, it will return the position of the center in the parent
   * space.
   */
  @originSignal(Origin.Middle)
  declare public readonly middle: LayoutPositionSignal<this>;

  /**
   * The position of the top edge of this node.
   *
   * @remarks
   * When set, this shortcut property will modify the node's position so that
   * the top edge ends up in the given place.
   *
   * When retrieved, it will return the position of the top edge in the parent
   * space.
   */
  @originSignal(Origin.Top)
  declare public readonly top: LayoutPositionSignal<this>;
  /**
   * The position of the bottom edge of this node.
   *
   * @remarks
   * When set, this shortcut property will modify the node's position so that
   * the bottom edge ends up in the given place.
   *
   * When retrieved, it will return the position of the bottom edge in the
   * parent space.
   */
  @originSignal(Origin.Bottom)
  declare public readonly bottom: LayoutPositionSignal<this>;
  /**
   * The position of the left edge of this node.
   *
   * @remarks
   * When set, this shortcut property will modify the node's position so that
   * the left edge ends up in the given place.
   *
   * When retrieved, it will return the position of the left edge in the parent
   * space.
   */
  @originSignal(Origin.Left)
  declare public readonly left: LayoutPositionSignal<this>;
  /**
   * The position of the right edge of this node.
   *
   * @remarks
   * When set, this shortcut property will modify the node's position so that
   * the right edge ends up in the given place.
   *
   * When retrieved, it will return the position of the right edge in the parent
   * space.
   */
  @originSignal(Origin.Right)
  declare public readonly right: LayoutPositionSignal<this>;
  /**
   * The position of the top left corner of this node.
   *
   * @remarks
   * When set, this shortcut property will modify the node's position so that
   * the top left corner ends up in the given place.
   *
   * When retrieved, it will return the position of the top left corner in the
   * parent space.
   */
  @originSignal(Origin.TopLeft)
  declare public readonly topLeft: LayoutPositionSignal<this>;
  /**
   * The position of the top right corner of this node.
   *
   * @remarks
   * When set, this shortcut property will modify the node's position so that
   * the top right corner ends up in the given place.
   *
   * When retrieved, it will return the position of the top right corner in the
   * parent space.
   */
  @originSignal(Origin.TopRight)
  declare public readonly topRight: LayoutPositionSignal<this>;
  /**
   * The position of the bottom left corner of this node.
   *
   * @remarks
   * When set, this shortcut property will modify the node's position so that
   * the bottom left corner ends up in the given place.
   *
   * When retrieved, it will return the position of the bottom left corner in
   * the parent space.
   */
  @originSignal(Origin.BottomLeft)
  declare public readonly bottomLeft: LayoutPositionSignal<this>;
  /**
   * The position of the bottom right corner of this node.
   *
   * @remarks
   * When set, this shortcut property will modify the node's position so that
   * the bottom right corner ends up in the given place.
   *
   * When retrieved, it will return the position of the bottom right corner in
   * the parent space.
   */
  @originSignal(Origin.BottomRight)
  declare public readonly bottomRight: LayoutPositionSignal<this>;

  /**
   * Get the cardinal point corresponding to the given origin.
   *
   * @param origin - The origin or direction of the point.
   */
  public cardinalPoint(origin: Origin | Direction): LayoutPositionSignal<this> {
    switch (origin) {
      case Origin.TopLeft:
        return this.topLeft;
      case Origin.TopRight:
        return this.topRight;
      case Origin.BottomLeft:
        return this.bottomLeft;
      case Origin.BottomRight:
        return this.bottomRight;
      case Origin.Top:
      case Direction.Top:
        return this.top;
      case Origin.Bottom:
      case Direction.Bottom:
        return this.bottom;
      case Origin.Left:
      case Direction.Left:
        return this.left;
      case Origin.Right:
      case Direction.Right:
        return this.right;
      default:
        return this.middle;
    }
  }

  @initial(false)
  @signal()
  declare public readonly clip: SimpleSignal<boolean, this>;

  declare public yogaNode: YogaNode;
  private yogaConstraint: {width?: number; height?: number} | null = null;

  @initial(0)
  @signal()
  declare protected readonly layoutLockCounter: SimpleSignal<number, this>;

  public constructor(props: LayoutProps) {
    super(props);
  }

  /**
   * Increment the layout lock counter. While positive, this node's
   * `flexGrow` / `flexShrink` are forced to `0`, holding its slot in the
   * parent's flex layout. Pair every call with {@link releaseLayout}.
   */
  public lockLayout() {
    this.layoutLockCounter(this.layoutLockCounter() + 1);
  }

  /**
   * Decrement the layout lock counter.
   */
  public releaseLayout() {
    this.layoutLockCounter(this.layoutLockCounter() - 1);
  }

  @computed()
  protected parentTransform(): Layout | null {
    return this.findAncestor(is(Layout));
  }

  @computed()
  public anchorPosition() {
    const size = this.computedSize();
    const offset = this.anchor();

    return size.scale(0.5).mul(offset);
  }

  /**
   * Whether this node participates in its parent's flex layout. Resolves
   * {@link layoutSelf}, then {@link layout}, then the parent's
   * {@link canLayoutChildren}.
   */
  @computed()
  public layoutEnabled(): boolean {
    return (
      this.layoutSelf() ??
      this.layout() ??
      this.parentTransform()?.canLayoutChildren() ??
      false
    );
  }

  /**
   * Whether this node lays out its own children with flex. Resolves
   * {@link layoutChildren}, then {@link layout}, then the parent's
   * {@link canLayoutChildren}.
   *
   * @remarks
   * Overridden by `Txt` (and similar leaves) that must not host yoga children.
   */
  @computed()
  public canLayoutChildren(): boolean {
    return (
      this.layoutChildren() ??
      this.layout() ??
      this.parentTransform()?.canLayoutChildren() ??
      false
    );
  }

  @computed()
  public isLayoutRoot(): boolean {
    // A parent that doesn't host yoga children (e.g. Txt) leaves this node
    // detached from any yoga tree, so it must lay itself out as a root.
    return (
      !this.layoutEnabled() || !this.parentTransform()?.canLayoutChildren()
    );
  }

  public override localToParent(): DOMMatrix {
    const {offsets, presence} = this.freeMotion() ?? this.flexBox();
    const matrix = this.poseMatrix(offsets);

    const translate = this.translate();
    if (!translate.exactlyEquals(Vector2.zero)) {
      matrix.translateSelf(translate.x, translate.y);
    }

    const offset = this.anchor();
    if (!offset.exactlyEquals(Vector2.zero)) {
      const anchorTranslate = this.size().mul(offset).scale(-0.5);
      matrix.translateSelf(anchorTranslate.x, anchorTranslate.y);
    }

    if (presence) {
      matrix.scaleSelf(presence());
    }

    return matrix;
  }

  /**
   * A simplified version of {@link localToParent} matrix used for transforming
   * direction vectors.
   *
   * @internal
   */
  @computed()
  protected scalingRotationMatrix(): DOMMatrix {
    const matrix = new DOMMatrix();

    matrix.rotateSelf(0, 0, this.rotation());
    matrix.scaleSelf(this.scale.x(), this.scale.y());

    const translate = this.translate();
    if (!translate.exactlyEquals(Vector2.zero)) {
      matrix.translateSelf(translate.x, translate.y);
    }

    const offset = this.anchor();
    if (!offset.exactlyEquals(Vector2.zero)) {
      const anchorTranslate = this.size().mul(offset).scale(-0.5);
      matrix.translateSelf(anchorTranslate.x, anchorTranslate.y);
    }

    return matrix;
  }

  protected getComputedLayout(): BBox {
    const layout = this.yogaNode.getComputedLayout();
    return this.offsetComputedLayout(
      new BBox(layout.left, layout.top, layout.width, layout.height),
    );
  }

  /** Move the Yoga box to where the content of this node is. */
  protected offsetComputedLayout(box: BBox): BBox {
    return box;
  }

  /** The box flex gives this node, and its offsets in a layout transition. */
  @computed()
  private flexBox(): FlexBox {
    const view = this.requestLayoutUpdate() ? this.view() : undefined;
    const box = this.getComputedLayout();
    const parent = view && this.parentTransform();
    return {
      box,
      size: box.size,
      offsets: view?.boxOffsets.get(this),
      presence: view?.presences.get(this),
      pin: parent ? view.pins.get(parent) : undefined,
    };
  }

  private drawnSize(): Vector2 {
    const {size, offsets} = this.flexBox();
    return offsets && !this.heldSize() ? offsetBy(size, offsets, 'size') : size;
  }

  private drawnBox(): BBox {
    const {box, offsets} = this.flexBox();
    return offsets
      ? new BBox(offsetBy(box.position, offsets, 'position'), this.drawnSize())
      : box;
  }

  /** The size a frozen layout keeps, or `null` when flex sizes it. */
  private heldSize(): Vector2 | null {
    return this.view()?.pins.get(this)?.size ?? null;
  }

  /** The size `child` had when this layout froze, or `null` when flex sizes it. */
  private frozenChildSize(child: Layout): Vector2 | null {
    return this.view()?.pins.get(this)?.children?.get(child) ?? null;
  }

  /** The box of `node` that a layout transition offsets. */
  private static motionBox(node: Node): BBox {
    if (Layout.isFlexPlaced(node)) {
      return node.drawnBox();
    }
    return new BBox(
      offsetBy(node.position(), node.view().boxOffsets.get(node) ?? [], 'move'),
      node instanceof Layout ? node.drawnSize() : Vector2.zero,
    );
  }

  private static isFlexPlaced(node: Node): node is Layout {
    return node instanceof Layout && !node.isLayoutRoot();
  }

  /** The transition of a node that flex does not place, or `null` when flex places it. */
  @computed()
  private freeMotion(): FreeMotion | null {
    if (!this.isLayoutRoot()) {
      return null;
    }
    const view = this.view();
    return {
      offsets: view?.boxOffsets.get(this),
      presence: view?.presences.get(this),
    };
  }

  /** The size flex gives this node, which a layout transition does not change. */
  protected layoutSize(): Vector2 {
    return this.flexBox().size;
  }

  /** The position of this node for its `box` in a parent of `parentSize`. */
  private boxPosition(box: BBox, parentSize?: Vector2): Vector2 {
    const position = new Vector2(
      box.x + box.width / 2 + (box.width / 2) * this.anchor.x(),
      box.y + box.height / 2 + (box.height / 2) * this.anchor.y(),
    );

    if (parentSize) {
      const shift = this.parentTransform()?.offsetComputedLayout(new BBox());
      position.x -= (shift?.x ?? 0) + parentSize.width / 2;
      position.y -= (shift?.y ?? 0) + parentSize.height / 2;
    }

    return position;
  }

  protected override settledPosition(): Vector2 {
    return this.isLayoutRoot()
      ? this.position()
      : this.boxPosition(
          this.flexBox().box,
          this.parentTransform()?.layoutSize(),
        );
  }

  @computed()
  public computedPosition(): Vector2 {
    const position = this.boxPosition(
      this.drawnBox(),
      this.parentTransform()?.drawnSize(),
    );

    const {pin} = this.flexBox();
    if (pin) {
      const manual = new Vector2(
        this.x.context.getter(),
        this.y.context.getter(),
      );
      return pin.interpolation(manual, position, 1 - pin.weight());
    }

    return position;
  }

  protected computedSize(): Vector2 {
    return this.drawnSize();
  }

  /**
   * Find the closest layout root and apply any new layout changes.
   *
   * @returns Whether a layout transition runs in the view.
   */
  @computed()
  protected requestLayoutUpdate(): boolean {
    const parent = this.parentTransform();
    if (this.isLayoutRoot()) {
      parent?.requestFontUpdate();
      const {width, height} = this.resolveLayoutConstraint();
      this.calculateRootLayout(width, height);
      return this.view().layoutTransition();
    }
    return parent?.requestLayoutUpdate() ?? false;
  }

  /**
   * Apply the tree's layout inputs and run yoga for this root, resolving a
   * missing dimension from its aspect ratio and percent-sized children of
   * auto-sized containers when needed.
   */
  protected calculateRootLayout(
    width: number | undefined,
    height: number | undefined,
  ) {
    const settling = this.settlingTree();
    if (settling) this.unsettle(settling);
    this.updateLayout();
    this.calculateYoga(width, height);
    const aspectRatioConstraint = this.resolveAspectRatioConstraint(
      width,
      height,
    );
    if (aspectRatioConstraint) {
      width = aspectRatioConstraint.width;
      height = aspectRatioConstraint.height;
      this.calculateYoga(width, height);
    }
    if (this.resolvePercentageDimensions()) {
      this.calculateYoga(width, height);
    }
    if (settling) this.settle(settling, width, height);
  }

  private calculateYoga(width: number | undefined, height: number | undefined) {
    const last = this.yogaConstraint;
    if (
      last &&
      !this.yogaNode.isDirty() &&
      last.width === width &&
      last.height === height
    ) {
      return;
    }
    this.yogaConstraint = {width, height};
    this.yogaNode.calculateLayout(width, height);
  }

  private settlingTree(): SettlingTree | null {
    const nodes: Layout[] = [this];
    const settlers: SettlingTree['settlers'] = [];
    this.walkFlexTree(child => {
      const settler = LayoutSettlers.get(child);
      if (settler?.reads()) settlers.push({node: nodes.length, settler});
      nodes.push(child);
    });
    return settlers.length > 0 ? {nodes, settlers} : null;
  }

  /**
   * Forget the boxes of the last pass before the tree reads its inputs, so the
   * first pass reads none and the result never depends on an earlier one.
   */
  private unsettle({nodes, settlers}: SettlingTree): void {
    for (const node of nodes) SettledBoxes.delete(node);
    for (const {settler} of settlers) settler.settle();
  }

  /**
   * Repeat the pass, each one reading the boxes of the pass before, until
   * the boxes every settler reads stop moving. When they cycle instead, or
   * the passes run out, keep the boxes seen whose pass gave the settlers the
   * least total height, and of those the greatest total width; the first
   * such boxes win a tie.
   */
  private settle(
    {nodes, settlers}: SettlingTree,
    width: number | undefined,
    height: number | undefined,
  ): void {
    const seen: SettledBox[][] = [];
    for (;;) {
      const boxes = computedBoxes(nodes);
      const repeat = seen.findIndex(earlier => sameBoxes(earlier, boxes));
      if (repeat !== -1 || seen.length === SETTLE_PASSES) {
        const cycle = seen.slice(Math.max(repeat, 0));
        const after = (index: number, axis: 'width' | 'height') => {
          const next = cycle[index + 1] ?? boxes;
          return settlers.reduce((sum, {node}) => sum + next[node][axis], 0);
        };
        const better = (a: number, b: number) =>
          after(a, 'height') < after(b, 'height') ||
          (after(a, 'height') === after(b, 'height') &&
            after(a, 'width') > after(b, 'width'));
        let chosen = 0;
        for (let i = 1; i < cycle.length; i++) {
          if (better(i, chosen)) chosen = i;
        }
        if (this.readBoxes(nodes, settlers, cycle[chosen])) {
          this.calculateYoga(width, height);
        }
        return;
      }
      seen.push(boxes);
      if (!this.readBoxes(nodes, settlers, boxes)) return;
      this.calculateYoga(width, height);
    }
  }

  /**
   * Settle the tree on `boxes` and answer whether a settler read boxes that
   * have moved, so the next pass measures it again.
   */
  private readBoxes(
    nodes: readonly Layout[],
    settlers: SettlingTree['settlers'],
    boxes: readonly SettledBox[],
  ): boolean {
    nodes.forEach((node, i) => SettledBoxes.set(node, boxes[i]));
    let moved = false;
    for (const {settler} of settlers) {
      if (settler.settle()) moved = true;
    }
    return moved;
  }

  private resolveAspectRatioConstraint(
    width: number | undefined,
    height: number | undefined,
  ): {width: number | undefined; height: number | undefined} | undefined {
    const size = this.desiredSize();
    if ((size.x === null) === (size.y === null)) return undefined;

    const ratio = this.yogaNode.getAspectRatio();
    if (!isFinite(ratio) || ratio <= 0) return undefined;

    const layout = this.yogaNode.getComputedLayout();
    if (size.x === null && isFinite(layout.height)) {
      return {width: layout.height * ratio, height};
    }
    if (size.y === null && isFinite(layout.width)) {
      return {width, height: layout.width / ratio};
    }

    return undefined;
  }

  /**
   * Resolve the `calculateLayout` constraint for this layout root.
   *
   * @remarks
   * Definite dimensions pass straight through. Percent dimensions resolve to
   * the computed size of the nearest ancestor that sizes percent children —
   * yoga then applies the node's own percent
   * against that available space, so the percent is applied exactly once
   * (a Rect with `width='50%'` under View2D gets half the view width), and
   * stacked percent roots compose recursively through `computedSize`.
   */
  private resolveLayoutConstraint(): {
    width: number | undefined;
    height: number | undefined;
  } {
    const size = this.desiredSize();
    return {
      width: this.resolveDimensionConstraint(size.x, 'width'),
      height: this.resolveDimensionConstraint(size.y, 'height'),
    };
  }

  private resolveDimensionConstraint(
    value: DesiredLength,
    axis: 'width' | 'height',
  ): number | undefined {
    if (typeof value === 'number') return value;
    if (!isPercent(value)) return undefined;

    let basis = this.parentTransform();
    while (basis && !basis.sizesPercentChildren(axis)) {
      basis = basis.parentTransform();
    }
    if (!basis) return undefined;
    const basisSize = basis.computedSize();
    const available = axis === 'width' ? basisSize.x : basisSize.y;
    return isFinite(available) ? available : undefined;
  }

  private sizesPercentChildren(axis: 'width' | 'height'): boolean {
    const desired = this.desiredSize();
    return (
      (axis === 'width' ? desired.x : desired.y) !== null ||
      !this.isLayoutRoot() ||
      this.canLayoutChildren()
    );
  }

  private resolvePercentageDimensions(): boolean {
    let resolved = false;
    this.walkFlexTree((child, parent) => {
      const size = child.desiredSize();
      const parentLayout = parent.yogaNode.getComputedLayout();

      if (isPercent(size.x)) {
        const parentDesired = parent.desiredSize();
        if (parentDesired.x === null) {
          const percent = parseFloat(size.x);
          child.yogaNode.setWidth((parentLayout.width * percent) / 100);
          resolved = true;
        }
      }

      if (isPercent(size.y)) {
        const parentDesired = parent.desiredSize();
        if (parentDesired.y === null) {
          const percent = parseFloat(size.y);
          child.yogaNode.setHeight((parentLayout.height * percent) / 100);
          resolved = true;
        }
      }
    });
    return resolved;
  }

  private walkFlexTree(visitor: (child: Layout, parent: Layout) => void): void {
    const walk = (parent: Layout) => {
      if (!parent.canLayoutChildren()) return;
      for (const child of parent.applyLayout()) {
        visitor(child, parent);
        walk(child);
      }
    };
    walk(this);
  }

  /**
   * Apply any new layout changes to this node and its children.
   */
  @computed()
  protected updateLayout() {
    this.applyFont();
    this.applyFlex();
    if (this.canLayoutChildren()) {
      const children = this.applyLayout();
      for (const child of children) {
        child.updateLayout();
      }
    }
  }

  @computed()
  private participatingChildren(): Layout[] {
    const queue = [...this.children()];
    const result: Layout[] = [];
    while (queue.length) {
      const child = queue.shift();
      if (child instanceof Layout) {
        if (child.layoutEnabled()) {
          result.push(child);
        }
      } else if (child) {
        queue.unshift(...child.children());
      }
    }
    return result;
  }

  @computed()
  protected applyLayout(): Layout[] {
    const result = this.participatingChildren();

    for (let i = this.yogaNode.getChildCount() - 1; i >= 0; i--) {
      this.yogaNode.removeChild(this.yogaNode.getChild(i));
    }
    for (let i = 0; i < result.length; i++) {
      const childNode = result[i].yogaNode;
      // A reparented child still belongs to its previous owner's yoga node;
      // yoga aborts on insert unless it is detached first.
      childNode.getParent()?.removeChild(childNode);
      this.yogaNode.insertChild(childNode, i);
    }

    return result;
  }

  /**
   * Apply any new font changes to this node and all of its ancestors.
   */
  @computed()
  protected requestFontUpdate() {
    this.parentTransform()?.requestFontUpdate();
    this.applyFont();
  }

  @computed()
  public canvasFont(): string {
    return buildCanvasFontString(
      this.fontStyle(),
      this.fontWeight(),
      this.fontSize(),
      this.fontFamily(),
    );
  }

  @computed()
  public resolvedLineHeight(): number {
    return resolveLineHeight(this.lineHeight(), this.fontSize());
  }

  protected override getCacheBBox(): BBox {
    return BBox.fromSizeCentered(this.computedSize());
  }

  protected override draw(context: CanvasRenderingContext2D) {
    if (this.clip()) {
      const size = this.computedSize();
      if (size.width === 0 || size.height === 0) {
        return;
      }

      context.beginPath();
      context.rect(size.width / -2, size.height / -2, size.width, size.height);
      context.closePath();
      context.clip();
    }

    this.drawChildren(context);
  }

  public override drawOverlay(
    context: CanvasRenderingContext2D,
    matrix: DOMMatrix,
  ) {
    const size = this.computedSize();
    const offset = size.mul(this.anchor()).scale(0.5).transformAsPoint(matrix);
    const box = BBox.fromSizeCentered(size);
    const layout = box.transformCorners(matrix);
    const padding = box
      .addSpacing(this.padding().scale(-1))
      .transformCorners(matrix);
    const margin = box.addSpacing(this.margin()).transformCorners(matrix);

    context.beginPath();
    drawLine(context, margin);
    drawLine(context, layout);
    context.closePath();
    context.fillStyle = 'rgba(255,193,125,0.6)';
    context.fill('evenodd');

    context.beginPath();
    drawLine(context, layout);
    drawLine(context, padding);
    context.closePath();
    context.fillStyle = 'rgba(180,255,147,0.6)';
    context.fill('evenodd');

    context.beginPath();
    drawLine(context, layout);
    context.closePath();
    context.lineWidth = 1;
    context.strokeStyle = 'white';
    context.stroke();

    context.beginPath();
    drawPivot(context, offset);
    context.stroke();
  }

  public getOriginDelta(origin: Origin) {
    const size = this.computedSize().scale(0.5);
    const offset = this.anchor().mul(size);
    if (origin === Origin.Middle) {
      return offset.flipped;
    }

    const newOffset = originToOffset(origin).mul(size);
    return newOffset.sub(offset);
  }

  /**
   * Update the offset of this node and adjust the position to keep it in the
   * same place.
   *
   * @param offset - The new offset.
   */
  public moveOffset(offset: Vector2) {
    const size = this.computedSize().scale(0.5);
    const oldOffset = this.anchor().mul(size);
    const newOffset = offset.mul(size);
    this.anchor(offset);
    this.position(this.position().add(newOffset).sub(oldOffset));
  }

  /**
   * Whether this node lays out text, directly or through its children. Only
   * text gets an automatic minimum size; other content keeps flex defaults.
   */
  @computed()
  private containsText(): boolean {
    return (
      ContentFloors.has(this) ||
      (this.canLayoutChildren() &&
        this.participatingChildren().some(child => child.containsText()))
    );
  }

  /** Narrowest width this node's own content fits in, padding included. */
  @computed()
  private minContentWidth(): number {
    const padding = this.padding.left() + this.padding.right();
    const floor = ContentFloors.get(this);
    if (floor !== undefined) {
      return floor() + padding;
    }
    const children = this.canLayoutChildren()
      ? this.participatingChildren()
      : [];
    if (children.length === 0) {
      return padding;
    }

    let content = 0;
    if (isRowDirection(this.direction()) && this.wrap() === 'nowrap') {
      for (const child of children) {
        content += child.minContentContribution();
      }
      const gap = this.gap.x();
      if (typeof gap === 'number') {
        content += gap * (children.length - 1);
      }
    } else {
      for (const child of children) {
        content = Math.max(content, child.minContentContribution());
      }
    }

    return content + padding;
  }

  /** What this node adds to the content floor of the parent that lays it out. */
  @computed()
  private minContentContribution(): number {
    const width = this.desiredSize().x;
    let content = 0;
    if (typeof width === 'number') {
      content = width;
    } else if (width === null) {
      content = this.minContentWidth();
    }

    const max = this.maxWidth();
    if (typeof max === 'number') {
      content = Math.min(content, max);
    }
    const min = this.minWidth();
    if (typeof min === 'number') {
      content = Math.max(content, min);
    }

    return content + this.margin.left() + this.margin.right();
  }

  @computed()
  private parentDirection(): FlexDirection | null {
    if (this.isLayoutRoot()) {
      return null;
    }
    return this.parentTransform()?.direction() ?? null;
  }

  /** The declared minimum width, or the content floor of a row item. */
  private resolvedMinWidth(): LengthLimit {
    const declared = this.minWidth();
    if (declared !== null) {
      return declared;
    }

    const direction = this.parentDirection();
    if (direction === null || !isRowDirection(direction)) {
      return null;
    }
    if (!this.containsText()) {
      return null;
    }

    const width = this.desiredSize().x;
    if (width !== null && typeof width !== 'number') {
      return null;
    }

    let floor = this.minContentWidth();
    if (typeof width === 'number') {
      floor = Math.min(floor, width);
    }
    const max = this.maxWidth();
    if (typeof max === 'number') {
      floor = Math.min(floor, max);
    }

    return floor > 0 ? floor : null;
  }

  /** Flex shrink, which an unconstrained column item holding text opts out of. */
  private resolvedShrink(): number {
    const shrink = this.shrink();
    if (!this.containsText()) {
      return shrink;
    }
    if (
      this.minHeight() !== null ||
      this.desiredSize().y !== null ||
      this.basis() !== null
    ) {
      return shrink;
    }

    const direction = this.parentDirection();
    return direction === null || isRowDirection(direction) ? shrink : 0;
  }

  @computed()
  protected applyFlex() {
    const node = this.yogaNode;

    const view = this.view();
    const exit = view?.exits.get(this);
    const held = exit?.size ?? view?.pins.get(this)?.size;
    const frozen = this.parentTransform()?.frozenChildSize(this) ?? null;
    node.setPositionType(
      exit || this.isLayoutRoot()
        ? PositionType.Absolute
        : PositionType.Relative,
    );
    node.setPosition(Edge.Left, exit ? '50%' : undefined);
    node.setPosition(Edge.Top, exit ? '50%' : undefined);

    const size = this.desiredSize();
    if (isPercent(size.x) || isPercent(size.y)) {
      // resolvePercentageDimensions writes pixels over a percent while the
      // parent is auto-sized, so this must re-run when the parent's size changes.
      this.parentTransform()?.desiredSize();
    }
    setYogaDimension(
      node,
      'setWidth',
      held ? held.x : frozen && size.x === null ? frozen.x : size.x,
    );
    setYogaDimension(
      node,
      'setHeight',
      held ? held.y : frozen && size.y === null ? frozen.y : size.y,
    );
    setYogaDimension(node, 'setMaxWidth', this.maxWidth());
    setYogaDimension(node, 'setMinWidth', this.resolvedMinWidth());
    setYogaDimension(node, 'setMaxHeight', this.maxHeight());
    setYogaDimension(node, 'setMinHeight', this.minHeight());

    const ratio = this.ratio();
    node.setAspectRatio(ratio ?? undefined);

    setYogaSpacing(
      node,
      'Margin',
      exit ? exit.y : this.margin.top(),
      this.margin.right(),
      this.margin.bottom(),
      exit ? exit.x : this.margin.left(),
    );
    setYogaSpacing(
      node,
      'Padding',
      this.padding.top(),
      this.padding.right(),
      this.padding.bottom(),
      this.padding.left(),
    );

    node.setFlexDirection(toYogaFlexDirection(this.direction()));
    setYogaFlexBasis(node, this.basis());
    node.setFlexWrap(toYogaFlexWrap(this.wrap()));

    const direction = this.direction();
    const wrap = this.wrap();
    node.setJustifyContent(
      toYogaJustifyContent(this.justifyContent(), direction),
    );
    node.setAlignContent(toYogaAlignContent(this.alignContent(), wrap));
    node.setAlignItems(toYogaAlignItems(this.alignItems(), wrap));
    node.setAlignSelf(toYogaAlignItems(this.alignSelf(), wrap));

    setYogaGap(node, this.gap.x(), this.gap.y());

    if (this.layoutLockCounter() > 0 || frozen) {
      node.setFlexGrow(0);
      node.setFlexShrink(0);
    } else {
      node.setFlexGrow(this.grow());
      node.setFlexShrink(this.resolvedShrink());
    }
  }

  @computed()
  protected applyFont() {
    // Dependency checkpoint: touching every font signal invalidates downstream
    // measurement caches when any font property changes.
    this.fontFamily();
    this.fontSize();
    this.fontStyle();
    this.fontWeight();
    this.lineHeight();
    this.letterSpacing();
    this.textWrap();
    this.textAlign();
    this.wordBreak();
  }

  /**
   * Append a child. With a `duration`, the call returns a
   * `ThreadGenerator` that scales the child into its slot while the
   * surrounding flex layout reflows; without one, it behaves like
   * {@link Node.add} and returns `this`.
   */
  public override add(node: ComponentChildren): this;
  public override add(
    node: ComponentChildren,
    duration: number,
    timing?: TimingFunction,
    animate?: LayoutAnimateCallback,
  ): ThreadGenerator;
  public override add(
    node: ComponentChildren,
    duration?: number,
    timing: TimingFunction = easeInOutCubic,
    animate?: LayoutAnimateCallback,
  ): this | ThreadGenerator {
    if (duration === undefined) {
      return super.add(node);
    }
    return this.animateInsert(node, Infinity, duration, timing, animate);
  }

  /**
   * Insert a child at a specific index. With a `duration`, the call
   * returns a `ThreadGenerator` that scales the child into its slot
   * while the surrounding flex layout reflows; without one, it behaves
   * like {@link Node.insert} and returns `this`.
   */
  public override insert(node: ComponentChildren, index?: number): this;
  public override insert(
    node: ComponentChildren,
    index: number,
    duration: number,
    timing?: TimingFunction,
    animate?: LayoutAnimateCallback,
  ): ThreadGenerator;
  public override insert(
    node: ComponentChildren,
    index = 0,
    duration?: number,
    timing: TimingFunction = easeInOutCubic,
    animate?: LayoutAnimateCallback,
  ): this | ThreadGenerator {
    if (duration === undefined) {
      return super.insert(node, index);
    }
    return this.animateInsert(node, index, duration, timing, animate);
  }

  /**
   * Remove this node from its parent. With a `duration` and a `Layout`
   * parent, the call returns a `ThreadGenerator` that scales the node
   * out as its slot collapses; without one (or with a non-Layout
   * parent), it behaves like {@link Node.remove} and returns `this`.
   */
  public override remove(): this;
  public override remove(
    duration: number,
    timing?: TimingFunction,
    animate?: LayoutAnimateCallback,
  ): ThreadGenerator;
  public override remove(
    duration?: number,
    timing: TimingFunction = easeInOutCubic,
    animate?: LayoutAnimateCallback,
  ): this | ThreadGenerator {
    if (duration === undefined) {
      return super.remove();
    }
    const parent = this.parent();
    if (parent instanceof Layout) {
      return parent.animateRemove(this, duration, timing, animate);
    }
    super.remove();
    return (function* (): ThreadGenerator {})();
  }

  @threadable()
  protected *animateInsert(
    node: ComponentChildren,
    index: number,
    duration: number,
    timing: TimingFunction = easeInOutCubic,
    animate?: LayoutAnimateCallback,
  ): ThreadGenerator {
    const nodes = this.withoutCircular(Array.isArray(node) ? node : [node]);
    if (nodes.length === 0) {
      return;
    }
    const entering = nodes.filter(is(Layout));
    if (entering.length !== nodes.length) {
      super.insert(nodes, index);
      return;
    }

    const {presences, exits} = this.view();
    const records = entering.map(child => ({
      child,
      presence: createSignal(animate ? 1 : child.presence()),
    }));

    const motion = this.offsetLayout(this.motionScope(), () => {
      super.insert(entering, index);
      for (const {child, presence} of records) {
        presences.set(child, presence);
        exits.delete(child);
      }
    });

    try {
      yield* all(
        motion.progress(1, duration, timing),
        ...records.map(({child, presence}) =>
          animate
            ? animate(child, duration, timing)
            : presence(1, duration, timing),
        ),
      );
    } finally {
      motion.release();
      for (const {child, presence} of records) {
        if (presences.get(child) === presence) {
          presences.delete(child);
        }
      }
    }
  }

  @threadable()
  protected *animateRemove(
    node: Layout,
    duration: number,
    timing: TimingFunction = easeInOutCubic,
    animate?: LayoutAnimateCallback,
  ): ThreadGenerator {
    const {presences, exits} = this.view();
    const presence = createSignal(node.presence());
    const exit = node.flowBox();

    const motion = this.offsetLayout(this.motionScope(), () => {
      presences.set(node, presence);
      if (exit) {
        exits.set(node, exit);
      }
    });

    try {
      yield* all(
        motion.progress(1, duration, timing),
        animate
          ? animate(node, duration, timing)
          : presence(0, duration, timing),
      );
    } finally {
      motion.release();
      if (presences.get(node) === presence) {
        presences.delete(node);
        exits.delete(node);
        node.remove();
      }
    }
  }

  /** The scale this node is drawn with as a child that enters or leaves. */
  private presence(): number {
    return this.view().presences.get(this)?.() ?? (this.parent() ? 1 : 0);
  }

  /** The Yoga box of this node from the center of the parent that places it. */
  private flowBox(): BBox | null {
    this.requestLayoutUpdate();
    const parent = this.isLayoutRoot() ? null : this.yogaNode.getParent();
    if (!parent) {
      return null;
    }
    const box = this.yogaNode.getComputedLayout();
    return new BBox(
      box.left - parent.getComputedWidth() / 2,
      box.top - parent.getComputedHeight() / 2,
      box.width,
      box.height,
    );
  }

  /**
   * Animate a batch of layout-property changes. Children tween from their
   * pre-mutation positions to wherever the post-mutation layout puts them.
   *
   * @example
   * ```tsx
   * yield* rect().editLayout(0.3, n => {
   *   n.direction('column');
   *   n.alignItems('end');
   * });
   * ```
   */
  @threadable()
  public *editLayout<TLayout extends Layout>(
    this: TLayout,
    duration: number,
    mutator: (node: TLayout) => void,
    timing: TimingFunction = easeInOutCubic,
    interpolation: InterpolationFunction<Vector2> = Vector2.lerp,
  ): ThreadGenerator {
    const motion = this.offsetLayout(
      this.motionScope(),
      () => mutator(this),
      interpolation,
    );
    try {
      yield* motion.progress(1, duration, timing);
    } finally {
      motion.release();
    }
  }

  /** Offset each of `nodes` that `mutator` moves back to where it was drawn. @internal */
  public offsetLayout(
    nodes: Iterable<Node>,
    mutator: () => void,
    interpolation: InterpolationFunction<Vector2> = Vector2.lerp,
  ): {progress: SimpleSignal<number>; release: () => void} {
    const starts = new Map<Node, MotionStart>();
    for (const node of nodes) {
      const parent = node.parent();
      starts.set(node, {
        parent,
        flex: Layout.isFlexPlaced(node),
        box: Layout.motionBox(node),
        parentToWorld: parent?.localToWorld(),
        localToParent: node.localToParent(),
      });
    }
    mutator();

    const deltas = new Map<Node, BoxDelta>();
    const moved: Node[] = [];
    for (const [node, start] of starts) {
      const flex = Layout.isFlexPlaced(node);
      if (node.parent() !== start.parent || flex !== start.flex) {
        moved.push(node);
        continue;
      }
      const delta = boxDelta(start.box, Layout.motionBox(node));
      if (delta) {
        deltas.set(
          node,
          flex
            ? {...NoDelta, ...delta}
            : {...NoDelta, move: delta.position, size: delta.size},
        );
      }
    }
    for (const node of new Set([this, ...starts.keys()])) {
      if (!(node instanceof Layout) || !node.canLayoutChildren()) {
        continue;
      }
      const children = node.applyLayout();
      const axis = isRowDirection(node.direction()) ? 'x' : 'y';
      const drawn = (siblings: Layout[]) => {
        const sibling = siblings.find(sibling => starts.has(sibling));
        return sibling ? starts.get(sibling)?.box : undefined;
      };
      children.forEach((child, index) => {
        if (starts.has(child)) {
          return;
        }
        const box = Layout.motionBox(child);
        const edge = openingEdge(
          drawn(children.slice(0, index).reverse()),
          drawn(children.slice(index + 1)),
          box.center[axis],
          axis,
        );
        if (edge !== null) {
          const position = new Vector2();
          position[axis] = edge - box.center[axis];
          deltas.set(child, {...NoDelta, position});
        }
      });
    }

    const view = this.view();
    const progress = createSignal(0);
    const offset = (node: Node, delta: BoxDelta) =>
      view.boxOffsets.push(node, {...delta, progress, interpolation});
    for (const [node, delta] of deltas) {
      offset(node, delta);
    }

    // A node with a new parent starts at its world pose. Its parent is offset
    // first, because the node is measured in the drawn space of its parent.
    for (const node of moved.sort((a, b) => depth(a) - depth(b))) {
      const start = starts.get(node);
      if (!start || !node.parent()) {
        continue;
      }
      const from = node
        .worldToParent()
        .multiply(
          start.parentToWorld?.multiply(start.localToParent) ??
            start.localToParent,
        );
      offset(node, {
        ...NoDelta,
        ...turnDelta(from, node.localToParent()),
        size:
          node instanceof Layout
            ? start.box.size.sub(node.drawnSize())
            : Vector2.zero,
      });
      const to = node.localToParent();
      offset(node, {
        ...NoDelta,
        move: new Vector2(from.e - to.e, from.f - to.f),
      });
    }

    return {progress, release: () => view.boxOffsets.release(progress)};
  }

  /** The flex tree this layout is in. @internal */
  public flexTree(): Layout[] {
    const root = this.layoutRoot();
    const nodes: Layout[] = [root];
    root.walkFlexTree(child => nodes.push(child));
    return nodes;
  }

  /** The nodes a transition of this layout can move: its flex tree and all nodes below it. */
  private motionScope(): Node[] {
    return [...this.flexTree(), ...this.findAll(() => true)];
  }

  private layoutRoot(): Layout {
    return this.isLayoutRoot()
      ? this
      : (this.parentTransform()?.layoutRoot() ?? this);
  }

  /**
   * Draw each laid-out child at its own position, which starts where the
   * child is drawn now, and keep the size this node has now. Flex keeps the
   * size of the children. Pair with {@link thawLayout} to move the children
   * back to their slots.
   *
   * @example
   * ```tsx
   * row().freezeLayout();
   * yield* child().position([0, -200], 1);
   * yield* row().thawLayout(1);
   * ```
   */
  public freezeLayout(): void {
    if (!this.canLayoutChildren()) {
      return;
    }
    const size = this.drawnSize();
    const children = new Map<Layout, Vector2>();
    for (const child of this.applyLayout()) {
      child.position(child.position());
      children.set(child, child.size());
    }
    this.view().pins.set(this, {
      weight: createSignal(1),
      interpolation: Vector2.lerp,
      size,
      children,
    });
  }

  /**
   * Move each child from its own position to the slot flex gives it, and this
   * node from its frozen size to the size flex gives it.
   */
  @threadable()
  public *thawLayout(
    duration: number,
    timing: TimingFunction = easeInOutCubic,
    interpolation: InterpolationFunction<Vector2> = Vector2.lerp,
  ): ThreadGenerator {
    const {pins} = this.view();
    const frozen = pins.get(this);
    if (!frozen) {
      return;
    }
    const pin = {
      weight: frozen.weight,
      interpolation,
      size: null,
      children: null,
    };
    const motion = this.offsetLayout(
      this.motionScope(),
      () => pins.set(this, pin),
      interpolation,
    );
    try {
      yield* all(
        motion.progress(1, duration, timing),
        pin.weight(0, duration, timing),
      );
    } finally {
      motion.release();
      if (pins.get(this) === pin) {
        pins.delete(this);
      }
    }
  }

  /**
   * Cross-fade this Layout into another node. The Layout leaves the flex
   * layout of its parent at once: its siblings move to their new slots while
   * it moves to the other node.
   */
  @threadable()
  public override *morphTo(
    other: Node,
    duration: number,
    timing: TimingFunction = easeInOutCubic,
    interpolation: InterpolationFunction<Vector2> = Vector2.lerp,
  ): ThreadGenerator {
    const {exits} = this.view();
    const exit = this.flowBox();
    const motion = this.offsetLayout(
      this.flexTree(),
      () => exit && exits.set(this, exit),
      interpolation,
    );

    try {
      yield* all(
        motion.progress(1, duration, timing),
        super.morphTo(other, duration, timing, interpolation),
      );
    } finally {
      motion.release();
      exits.delete(this);
    }
  }

  public override dispose() {
    if (this.isDisposed) {
      return;
    }
    super.dispose();
    this.view()?.presences.delete(this);
    this.view()?.exits.delete(this);
    this.view()?.pins.delete(this);
    this.layoutLockCounter?.context.dispose();
    if (this.yogaNode) {
      this.yogaNode.free();
    }
  }

  public override hit(position: Vector2): Node | null {
    const local = position.transformAsPoint(this.localToParent().inverse());
    if (this.cacheBBox().includes(local)) {
      return super.hit(position) ?? this;
    }

    return null;
  }
}

function originSignal(origin: Origin): PropertyDecorator {
  return (target, key) => {
    signal<PossibleVector2>()(target, key);
    cloneable(false)(target, key);
    wrapper(Vector2)(target, key);

    addInitializer(target, (instance: Layout) => {
      const parser = (value: PossibleVector2) => new Vector2(value);

      const signalContext = new LayoutPositionSignalContext(
        undefined,
        deepLerp,
        instance,
        parser,
        {
          getter: function (this: Layout) {
            return this.computedSize()
              .getOriginOffset(origin)
              .transformAsPoint(this.localToParent());
          }.bind(instance),
          setter: function (
            this: Layout,
            value: SignalValue<PossibleVector2> | typeof DEFAULT,
          ) {
            if (value === DEFAULT) {
              return;
            }
            this.position(
              modify(value, unwrapped =>
                this.getOriginDelta(origin)
                  .transform(this.scalingRotationMatrix())
                  .flipped.add(unwrapped),
              ),
            );
          }.bind(instance),
        },
      );

      Object.defineProperty(instance, key, {
        value: signalContext.toSignal(),
        writable: false,
        enumerable: true,
        configurable: false,
      });
    });
  };
}

addInitializer<Layout>(Layout.prototype, instance => {
  instance.yogaNode = createYogaNode();
});
