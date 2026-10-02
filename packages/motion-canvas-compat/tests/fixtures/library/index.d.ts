import {Layout, LayoutProps, Rect, RectProps} from '@motion-canvas/2d';
import {Color, SignalGenerator, Vector2} from '@motion-canvas/core';

export declare class Pill extends Rect {
  constructor(props?: RectProps);
}

export declare class Tile extends Layout {
  constructor(props?: LayoutProps);
}

export declare function createPillRow(): Layout;
export declare function readOffset(node: Layout): Vector2;
export declare function moveOffset(
  node: Layout,
): SignalGenerator<Vector2, Vector2>;
export declare const insertedByDiff: number;
export declare const defaultPluginName: string;
export declare function makeColor(): Color;
export declare const engineClasses: {
  Layout: typeof Layout;
  Vector2: typeof Vector2;
  Color: typeof Color;
};
