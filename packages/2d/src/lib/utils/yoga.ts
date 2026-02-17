import type {MeasureFunction, Node as YogaNode} from 'yoga-layout';
import Yoga, {
  Align,
  Edge,
  Gutter,
  Justify,
  MeasureMode,
  PositionType,
  Wrap,
  FlexDirection as YogaFlexDirection,
} from 'yoga-layout';
import type {
  FlexBasis,
  FlexContent,
  FlexDirection,
  FlexItems,
  FlexWrap,
  Length,
  LengthLimit,
} from '../partials';

export {Edge, Gutter, MeasureMode, PositionType, Yoga};
export type {MeasureFunction, YogaNode};

export function createYogaNode(): YogaNode {
  return Yoga.Node.create();
}

export function toYogaFlexDirection(
  direction: FlexDirection,
): YogaFlexDirection {
  switch (direction) {
    case 'row':
      return YogaFlexDirection.Row;
    case 'row-reverse':
      return YogaFlexDirection.RowReverse;
    case 'column':
      return YogaFlexDirection.Column;
    case 'column-reverse':
      return YogaFlexDirection.ColumnReverse;
  }
}

export function toYogaFlexWrap(wrap: FlexWrap): Wrap {
  switch (wrap) {
    case 'nowrap':
      return Wrap.NoWrap;
    case 'wrap':
      return Wrap.Wrap;
    case 'wrap-reverse':
      return Wrap.WrapReverse;
  }
}

export function toYogaJustifyContent(
  value: FlexContent,
  direction: FlexDirection,
): Justify {
  const isReversed =
    direction === 'column-reverse' || direction === 'row-reverse';
  switch (value) {
    case 'start':
      return isReversed ? Justify.FlexEnd : Justify.FlexStart;
    case 'center':
      return Justify.Center;
    case 'end':
      return isReversed ? Justify.FlexStart : Justify.FlexEnd;
    case 'space-between':
      return Justify.SpaceBetween;
    case 'space-around':
      return Justify.SpaceAround;
    case 'space-evenly':
      return Justify.SpaceEvenly;
    case 'stretch':
    case 'normal':
      return Justify.FlexStart;
  }
}

export function toYogaAlignContent(value: FlexContent, wrap: FlexWrap): Align {
  const isReversed = wrap === 'wrap-reverse';
  switch (value) {
    case 'start':
      return isReversed ? Align.FlexEnd : Align.FlexStart;
    case 'center':
      return Align.Center;
    case 'end':
      return isReversed ? Align.FlexStart : Align.FlexEnd;
    case 'stretch':
      return Align.Stretch;
    case 'space-between':
      return Align.SpaceBetween;
    case 'space-around':
      return Align.SpaceAround;
    case 'space-evenly':
      return Align.SpaceEvenly;
    case 'normal':
      return Align.Stretch;
  }
}

export function toYogaAlignItems(value: FlexItems, wrap: FlexWrap): Align {
  const isReversed = wrap === 'wrap-reverse';
  switch (value) {
    case 'start':
      return isReversed ? Align.FlexEnd : Align.FlexStart;
    case 'center':
      return Align.Center;
    case 'end':
      return isReversed ? Align.FlexStart : Align.FlexEnd;
    case 'stretch':
      return Align.Stretch;
    case 'baseline':
      return Align.Baseline;
    case 'auto':
      return Align.Auto;
  }
}

type DimensionSetter =
  | 'setWidth'
  | 'setHeight'
  | 'setMaxWidth'
  | 'setMaxHeight'
  | 'setMinWidth'
  | 'setMinHeight';

function isValidYogaLength(value: unknown): value is number | `${number}%` {
  if (typeof value === 'number') {
    return isFinite(value);
  }
  if (typeof value === 'string') {
    return value.endsWith('%') && isFinite(parseFloat(value));
  }
  return false;
}

export function setYogaDimension(
  node: YogaNode,
  setter: DimensionSetter,
  value: Length | LengthLimit | null,
): void {
  if (isValidYogaLength(value)) {
    node[setter](value);
  } else if (setter === 'setWidth' || setter === 'setHeight') {
    node[setter]('auto');
  } else {
    node[setter](undefined);
  }
}

export function setYogaSpacing(
  node: YogaNode,
  type: 'Margin' | 'Padding',
  top: number,
  right: number,
  bottom: number,
  left: number,
): void {
  if (type === 'Margin') {
    node.setMargin(Edge.Top, top);
    node.setMargin(Edge.Right, right);
    node.setMargin(Edge.Bottom, bottom);
    node.setMargin(Edge.Left, left);
  } else {
    node.setPadding(Edge.Top, top);
    node.setPadding(Edge.Right, right);
    node.setPadding(Edge.Bottom, bottom);
    node.setPadding(Edge.Left, left);
  }
}

export function setYogaGap(
  node: YogaNode,
  columnGap: Length,
  rowGap: Length,
): void {
  node.setGap(Gutter.Column, columnGap);
  node.setGap(Gutter.Row, rowGap);
}

export function setYogaFlexBasis(node: YogaNode, value: FlexBasis): void {
  if (value === null) {
    node.setFlexBasis('auto');
  } else {
    node.setFlexBasis(value);
  }
}
