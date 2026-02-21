import {Vector2} from '@canvas-commons/core';

/**
 * Information passed to an {@link ArrowDrawer} when drawing an arrow.
 */
export interface ArrowDrawInfo {
  context: CanvasRenderingContext2D;
  center: Vector2;
  tangent: Vector2;
  arrowSize: number;
  stroke: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
}

/**
 * Defines how an arrow is drawn at the end of a curve.
 */
export interface ArrowDrawer {
  draw(info: ArrowDrawInfo): void;
  /**
   * Returns the distance by which the curve path should be truncated at this
   * arrow's end.
   *
   * @param arrowSize - The resolved arrow size for this curve.
   * @returns The truncation distance in pixels. Defaults to `arrowSize / 2`
   *   when not provided.
   */
  offset?(arrowSize: number): number;
}

/**
 * The default arrow drawer, which draws a filled equilateral triangle.
 */
export const defaultArrowDrawer: ArrowDrawer = {
  draw({context, center, tangent, arrowSize}: ArrowDrawInfo) {
    const normal = tangent.perpendicular;
    const origin = center.add(tangent.scale(-arrowSize / 2));

    context.moveTo(origin.x, origin.y);

    const p1 = origin.add(tangent.add(normal).scale(arrowSize));
    context.lineTo(p1.x, p1.y);

    const p2 = origin.add(tangent.sub(normal).scale(arrowSize));
    context.lineTo(p2.x, p2.y);

    context.lineTo(origin.x, origin.y);
    context.closePath();
  },
};
