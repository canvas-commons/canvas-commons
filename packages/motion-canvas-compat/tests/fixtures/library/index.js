import {Layout, Rect} from '@motion-canvas/2d';
import {jsx} from '@motion-canvas/2d/lib/jsx-runtime';
import {getTransformDiff} from '@motion-canvas/2d/lib/utils/diff';
import {Color, Vector2} from '@motion-canvas/core';
import DefaultPlugin from '@motion-canvas/core/lib/plugin/DefaultPlugin';

export class Pill extends Rect {
  constructor(props) {
    super({width: 120, height: 40, offset: [-1, 0], ...props});
  }
}

export class Tile extends Layout {
  constructor(props) {
    super({size: 60, offsetX: 1, offsetY: -1, ...props});
  }
}

export function createPillRow() {
  return jsx(Layout, {
    layout: true,
    children: [
      jsx(Pill, {offset: [0, 1]}),
      jsx(Tile, {offsetY: 1}),
      jsx(Rect, {width: 10, height: 10, offset: [1, 1]}),
    ],
  });
}

export function readOffset(node) {
  return node.offset();
}

export function moveOffset(node) {
  return node.offset(Vector2.down, 1);
}

export const insertedByDiff = getTransformDiff(
  [{id: 'a'}],
  [{id: 'a'}, {id: 'b'}],
).inserted.length;
export const defaultPluginName = DefaultPlugin().name;
export const makeColor = () => new Color('#ff0000');
export const engineClasses = {Layout, Vector2, Color};
