import {Vector2} from '@canvas-commons/core';
import {CurvePoint} from './CurvePoint';

export abstract class Segment {
  public abstract readonly points: Vector2[];

  public abstract draw(
    context: CanvasRenderingContext2D | Path2D,
    start: number,
    end: number,
    move: boolean,
  ): [CurvePoint, CurvePoint];

  public abstract getPoint(distance: number): CurvePoint;

  public abstract get arcLength(): number;

  /**
   * Convert this segment to SVG path commands.
   *
   * @param start - Start distance along the segment (0 to arcLength)
   * @param end - End distance along the segment (0 to arcLength)
   * @param move - Whether to include a moveTo command at the start
   * @returns SVG path data string for this segment
   */
  public abstract toSVGCommands(
    start: number,
    end: number,
    move: boolean,
  ): string;
}
