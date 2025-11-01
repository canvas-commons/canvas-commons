import {Vector2} from '@canvas-commons/core';

/**
 * A builder for constructing SVG path data strings.
 *
 * @remarks
 * This class provides a fluent API for building SVG path data, which can be
 * used to create Path2D objects or passed to other renderers like Rough.js.
 *
 * @example
 * ```ts
 * const builder = new PathDataBuilder();
 * builder.moveTo(0, 0).lineTo(100, 100).closePath();
 * const pathData = builder.toString(); // "M 0 0 L 100 100 Z"
 * const path = new Path2D(pathData);
 * ```
 */
export class PathDataBuilder {
  private commands: string[] = [];

  /**
   * Move to a point without drawing.
   *
   * @param x - The x coordinate
   * @param y - The y coordinate
   */
  public moveTo(x: number, y: number): this {
    this.commands.push(`M ${x} ${y}`);
    return this;
  }

  /**
   * Draw a line to a point.
   *
   * @param x - The x coordinate
   * @param y - The y coordinate
   */
  public lineTo(x: number, y: number): this {
    this.commands.push(`L ${x} ${y}`);
    return this;
  }

  /**
   * Draw a cubic Bezier curve.
   *
   * @param cp1x - First control point x
   * @param cp1y - First control point y
   * @param cp2x - Second control point x
   * @param cp2y - Second control point y
   * @param x - End point x
   * @param y - End point y
   */
  public bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number,
  ): this {
    this.commands.push(`C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${x} ${y}`);
    return this;
  }

  /**
   * Draw a quadratic Bezier curve.
   *
   * @param cpx - Control point x
   * @param cpy - Control point y
   * @param x - End point x
   * @param y - End point y
   */
  public quadraticCurveTo(
    cpx: number,
    cpy: number,
    x: number,
    y: number,
  ): this {
    this.commands.push(`Q ${cpx} ${cpy} ${x} ${y}`);
    return this;
  }

  /**
   * Draw an elliptical arc.
   *
   * @remarks
   * Converts canvas ellipse parameters to SVG arc commands. For full ellipses,
   * this generates two arc commands to work around SVG's limitation of 180-degree
   * maximum arc sweeps.
   *
   * @param x - Center x coordinate
   * @param y - Center y coordinate
   * @param radiusX - Horizontal radius
   * @param radiusY - Vertical radius
   * @param rotation - Rotation angle in radians
   * @param startAngle - Start angle in radians
   * @param endAngle - End angle in radians
   * @param counterclockwise - Whether to draw counterclockwise
   */
  public ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    counterclockwise = false,
  ): this {
    const start = startAngle;
    const end = endAngle;

    let angleDiff = end - start;
    if (counterclockwise && angleDiff > 0) {
      angleDiff -= 2 * Math.PI;
    } else if (!counterclockwise && angleDiff < 0) {
      angleDiff += 2 * Math.PI;
    }

    const startPoint = Vector2.fromRadians(start).mul(
      new Vector2(radiusX, radiusY),
    );
    const rotatedStart = startPoint.rotate(rotation);
    const startX = x + rotatedStart.x;
    const startY = y + rotatedStart.y;

    const endPoint = Vector2.fromRadians(end).mul(
      new Vector2(radiusX, radiusY),
    );
    const rotatedEnd = endPoint.rotate(rotation);
    const endX = x + rotatedEnd.x;
    const endY = y + rotatedEnd.y;

    if (this.commands.length === 0) {
      this.moveTo(startX, startY);
    } else {
      this.lineTo(startX, startY);
    }

    // Determine if this is a large arc (> 180 degrees)
    const largeArc = Math.abs(angleDiff) > Math.PI ? 1 : 0;
    const sweep = counterclockwise ? 0 : 1;

    // Convert rotation from radians to degrees
    const rotationDeg = (rotation * 180) / Math.PI;

    if (Math.abs(Math.abs(angleDiff) - 2 * Math.PI) < 0.001) {
      const midAngle = start + angleDiff / 2;
      const midPoint = Vector2.fromRadians(midAngle).mul(
        new Vector2(radiusX, radiusY),
      );
      const rotatedMid = midPoint.rotate(rotation);
      const midX = x + rotatedMid.x;
      const midY = y + rotatedMid.y;

      this.commands.push(
        `A ${radiusX} ${radiusY} ${rotationDeg} 0 ${sweep} ${midX} ${midY}`,
      );
      this.commands.push(
        `A ${radiusX} ${radiusY} ${rotationDeg} 0 ${sweep} ${endX} ${endY}`,
      );
    } else {
      // Partial arc
      this.commands.push(
        `A ${radiusX} ${radiusY} ${rotationDeg} ${largeArc} ${sweep} ${endX} ${endY}`,
      );
    }

    return this;
  }

  /**
   * Draw a circular arc using the arc command.
   *
   * @remarks
   * This is a convenience method that calls {@link ellipse} with equal radii.
   *
   * @param x - Center x coordinate
   * @param y - Center y coordinate
   * @param radius - Arc radius
   * @param startAngle - Start angle in radians
   * @param endAngle - End angle in radians
   * @param counterclockwise - Whether to draw counterclockwise
   */
  public arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise = false,
  ): this {
    return this.ellipse(
      x,
      y,
      radius,
      radius,
      0,
      startAngle,
      endAngle,
      counterclockwise,
    );
  }

  /**
   * Draw an arc to a point with a given radius.
   *
   * @remarks
   * This matches the Canvas API's arcTo method. It draws a straight line from
   * the current point to the start of an arc, then draws an arc with the given
   * radius that is tangent to the line from the current point to (x1, y1) and
   * the line from (x1, y1) to (x2, y2).
   *
   * @param x1 - First control point x
   * @param y1 - First control point y
   * @param x2 - Second control point x
   * @param y2 - Second control point y
   * @param radius - Arc radius
   */
  public arcTo(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    radius: number,
  ): this {
    if (this.commands.length === 0) {
      this.moveTo(x1, y1);
      return this;
    }

    const lastCommand = this.commands[this.commands.length - 1];
    const coords = lastCommand.split(' ').slice(1).map(Number);
    const p0 = new Vector2(
      coords[coords.length - 2],
      coords[coords.length - 1],
    );
    const p1 = new Vector2(x1, y1);
    const p2 = new Vector2(x2, y2);

    const v1 = p0.sub(p1);
    const v2 = p2.sub(p1);

    const v1Length = v1.magnitude;
    const v2Length = v2.magnitude;

    if (v1Length === 0 || v2Length === 0) {
      this.lineTo(x1, y1);
      return this;
    }

    const v1n = v1.normalized;
    const v2n = v2.normalized;

    const angle = Math.acos(v1n.dot(v2n));

    if (Math.abs(angle) < 0.0001 || Math.abs(angle - Math.PI) < 0.0001) {
      this.lineTo(x1, y1);
      return this;
    }

    const tangentLength = radius / Math.tan(angle / 2);

    const t1 = p1.add(v1n.scale(tangentLength));
    const t2 = p1.add(v2n.scale(tangentLength));

    this.lineTo(t1.x, t1.y);

    const bisector = v1n.add(v2n).normalized;
    const centerDistance = radius / Math.sin(angle / 2);
    const center = p1.add(bisector.scale(centerDistance));

    const startAngle = Math.atan2(t1.y - center.y, t1.x - center.x);
    const endAngle = Math.atan2(t2.y - center.y, t2.x - center.x);

    let angleDiff = endAngle - startAngle;
    const cross = v1n.x * v2n.y - v1n.y * v2n.x;
    const counterclockwise = cross > 0;

    if (counterclockwise && angleDiff > 0) {
      angleDiff -= 2 * Math.PI;
    } else if (!counterclockwise && angleDiff < 0) {
      angleDiff += 2 * Math.PI;
    }

    const largeArc = Math.abs(angleDiff) > Math.PI ? 1 : 0;
    const sweep = counterclockwise ? 0 : 1;

    this.commands.push(
      `A ${radius} ${radius} 0 ${largeArc} ${sweep} ${t2.x} ${t2.y}`,
    );

    return this;
  }

  /**
   * Close the current path.
   */
  public closePath(): this {
    this.commands.push('Z');
    return this;
  }

  /**
   * Get the SVG path data string.
   *
   * @returns The complete SVG path data
   */
  public toString(): string {
    return this.commands.join(' ');
  }

  /**
   * Reset the builder to empty state.
   */
  public clear(): this {
    this.commands = [];
    return this;
  }
}
