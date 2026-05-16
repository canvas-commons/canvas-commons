import {BBox, Spacing, Vector2} from '@canvas-commons/core';
import rough from 'roughjs';
import type {RoughCanvas} from 'roughjs/bin/canvas';
import type {Drawable, Options} from 'roughjs/bin/core';
import {RoughConfig, RoughFillStyle} from '../partials';
import {PossibleCanvasStyle} from '../partials/types';
import {
  adjustRectRadius,
  canvasStyleParser,
  resolveCanvasStyle,
} from './CanvasUtils';

// Export Drawable type for use in other modules
export type {Drawable};

/**
 * Cache for RoughCanvas instances per canvas element.
 *
 * @remarks
 * We cache RoughCanvas instances to avoid recreating them for each draw call.
 */
const RoughCanvasCache = new WeakMap<HTMLCanvasElement, RoughCanvas>();

/**
 * Get or create a RoughCanvas instance for the given canvas context.
 *
 * @param context - The 2D rendering context
 * @returns A RoughCanvas instance for drawing rough shapes
 */
function getRoughCanvas(context: CanvasRenderingContext2D): RoughCanvas {
  const canvas = context.canvas;
  let rc = RoughCanvasCache.get(canvas);

  if (!rc) {
    rc = rough.canvas(canvas);
    RoughCanvasCache.set(canvas, rc);
  }

  return rc;
}

/**
 * Convert Canvas Commons fill style to a color string for Rough.js.
 *
 * @param style - The fill style (color, gradient, or pattern)
 * @param context - The rendering context
 * @returns A color string or undefined
 */
function styleToColor(
  style: PossibleCanvasStyle | null,
  context: CanvasRenderingContext2D,
): string | undefined {
  if (style === null) {
    return undefined;
  }

  // Parse the style to CanvasStyle
  const parsedStyle = canvasStyleParser(style);

  if (parsedStyle === null) {
    return undefined;
  }

  // Resolve to canvas-compatible format
  const resolvedStyle = resolveCanvasStyle(parsedStyle, context);

  // Rough.js only accepts string colors, not gradients or patterns
  // For gradients and patterns, return undefined (rough.js will use default)
  if (typeof resolvedStyle === 'string') {
    return resolvedStyle;
  }

  return undefined;
}

/**
 * Convert Canvas Commons rough config to Rough.js options.
 *
 * @param config - Canvas Commons rough configuration
 * @param fill - Fill style from shape
 * @param stroke - Stroke style from shape
 * @param strokeWidth - Line width from shape
 * @param context - The rendering context
 * @returns Rough.js options object
 */
function configToRoughOptions(
  config: Partial<RoughConfig>,
  fill: PossibleCanvasStyle | null,
  stroke: PossibleCanvasStyle | null,
  strokeWidth: number,
  context: CanvasRenderingContext2D,
): Options {
  const options: Options = {
    roughness: config.roughness ?? 1,
    bowing: config.bowing ?? 1,
    seed: config.seed,
    stroke: styleToColor(stroke, context),
    strokeWidth: strokeWidth,
    fill: styleToColor(fill, context),
    fillStyle: config.fillStyle ?? 'hachure',
    fillWeight: config.fillWeight,
    hachureAngle: config.hachureAngle ?? -41,
    hachureGap: config.hachureGap ?? strokeWidth * 4,
    curveStepCount: config.curveStepCount,
    simplification: config.simplification,
    disableMultiStroke: config.disableMultiStroke,
    disableMultiStrokeFill: config.disableMultiStrokeFill,
  };

  return options;
}

/**
 * Convert a rounded rectangle to SVG path data.
 *
 * @param box - The bounding box of the rectangle
 * @param radius - Corner radius values
 * @param smoothCorners - Whether to use smooth corners (bezier curves)
 * @param cornerSharpness - Sharpness of smooth corners
 * @returns SVG path data string
 */
export function roundedRectToSVGPath(
  box: BBox,
  radius: Spacing,
  smoothCorners: boolean,
  cornerSharpness: number,
): string {
  const topLeft = adjustRectRadius(radius.top, radius.right, radius.left, box);
  const topRight = adjustRectRadius(
    radius.right,
    radius.top,
    radius.bottom,
    box,
  );
  const bottomRight = adjustRectRadius(
    radius.bottom,
    radius.left,
    radius.right,
    box,
  );
  const bottomLeft = adjustRectRadius(
    radius.left,
    radius.bottom,
    radius.top,
    box,
  );

  if (smoothCorners) {
    const sharpness = (r: number): number => {
      const val = r * cornerSharpness;
      return r - val;
    };

    // Build SVG path with bezier curves for smooth corners
    return [
      `M ${box.left + topLeft} ${box.top}`,
      `L ${box.right - topRight} ${box.top}`,
      `C ${box.right - sharpness(topRight)} ${box.top} ${box.right} ${box.top + sharpness(topRight)} ${box.right} ${box.top + topRight}`,
      `L ${box.right} ${box.bottom - bottomRight}`,
      `C ${box.right} ${box.bottom - sharpness(bottomRight)} ${box.right - sharpness(bottomRight)} ${box.bottom} ${box.right - bottomRight} ${box.bottom}`,
      `L ${box.left + bottomLeft} ${box.bottom}`,
      `C ${box.left + sharpness(bottomLeft)} ${box.bottom} ${box.left} ${box.bottom - sharpness(bottomLeft)} ${box.left} ${box.bottom - bottomLeft}`,
      `L ${box.left} ${box.top + topLeft}`,
      `C ${box.left} ${box.top + sharpness(topLeft)} ${box.left + sharpness(topLeft)} ${box.top} ${box.left + topLeft} ${box.top}`,
      'Z',
    ].join(' ');
  }

  // For regular rounded corners, we need to use arcs
  // SVG arc command: A rx ry x-axis-rotation large-arc-flag sweep-flag x y
  // Canvas arcTo draws a 90-degree arc, so we use: A r r 0 0 1 x y
  const pathParts: string[] = [];

  // Start at top-left corner (after the radius)
  pathParts.push(`M ${box.left + topLeft} ${box.top}`);

  // Top edge to top-right corner
  pathParts.push(`L ${box.right - topRight} ${box.top}`);
  if (topRight > 0) {
    pathParts.push(
      `A ${topRight} ${topRight} 0 0 1 ${box.right} ${box.top + topRight}`,
    );
  }

  // Right edge to bottom-right corner
  pathParts.push(`L ${box.right} ${box.bottom - bottomRight}`);
  if (bottomRight > 0) {
    pathParts.push(
      `A ${bottomRight} ${bottomRight} 0 0 1 ${box.right - bottomRight} ${box.bottom}`,
    );
  }

  // Bottom edge to bottom-left corner
  pathParts.push(`L ${box.left + bottomLeft} ${box.bottom}`);
  if (bottomLeft > 0) {
    pathParts.push(
      `A ${bottomLeft} ${bottomLeft} 0 0 1 ${box.left} ${box.bottom - bottomLeft}`,
    );
  }

  // Left edge to top-left corner
  pathParts.push(`L ${box.left} ${box.top + topLeft}`);
  if (topLeft > 0) {
    pathParts.push(
      `A ${topLeft} ${topLeft} 0 0 1 ${box.left + topLeft} ${box.top}`,
    );
  }

  // Close the path
  pathParts.push('Z');

  return pathParts.join(' ');
}

/**
 * Generate a rough rectangle drawable.
 *
 * @param context - The 2D rendering context
 * @param box - The bounding box of the rectangle
 * @param config - Rough configuration
 * @param fill - Fill style
 * @param stroke - Stroke style
 * @param strokeWidth - Line width
 * @returns A Drawable object that can be cached and drawn
 */
export function generateRoughRect(
  context: CanvasRenderingContext2D,
  box: BBox,
  config: Partial<RoughConfig>,
  fill: PossibleCanvasStyle | null,
  stroke: PossibleCanvasStyle | null,
  strokeWidth: number,
): Drawable {
  const rc = getRoughCanvas(context);
  const options = configToRoughOptions(
    config,
    fill,
    stroke,
    strokeWidth,
    context,
  );

  // Rough.js draws from top-left, canvas-commons uses center origin
  const x = box.x;
  const y = box.y;
  const width = box.width;
  const height = box.height;

  return rc.generator.rectangle(x, y, width, height, options);
}

/**
 * Draw a rough rectangle.
 *
 * @param context - The 2D rendering context
 * @param box - The bounding box of the rectangle
 * @param config - Rough configuration
 * @param fill - Fill style
 * @param stroke - Stroke style
 * @param strokeWidth - Line width
 */
export function drawRoughRect(
  context: CanvasRenderingContext2D,
  box: BBox,
  config: Partial<RoughConfig>,
  fill: PossibleCanvasStyle | null,
  stroke: PossibleCanvasStyle | null,
  strokeWidth: number,
): void {
  const drawable = generateRoughRect(
    context,
    box,
    config,
    fill,
    stroke,
    strokeWidth,
  );
  const rc = getRoughCanvas(context);
  rc.draw(drawable);
}

/**
 * Draw a cached rough drawable.
 *
 * @param context - The 2D rendering context
 * @param drawable - The cached drawable to render
 */
export function drawRoughDrawable(
  context: CanvasRenderingContext2D,
  drawable: Drawable,
): void {
  const rc = getRoughCanvas(context);
  rc.draw(drawable);
}

/**
 * Generate a rough rounded rectangle drawable.
 *
 * @param context - The 2D rendering context
 * @param box - The bounding box of the rectangle
 * @param radius - Corner radius values
 * @param smoothCorners - Whether to use smooth corners
 * @param cornerSharpness - Sharpness of smooth corners
 * @param config - Rough configuration
 * @param fill - Fill style
 * @param stroke - Stroke style
 * @param strokeWidth - Line width
 * @returns A Drawable object that can be cached and drawn
 */
export function generateRoughRoundedRect(
  context: CanvasRenderingContext2D,
  box: BBox,
  radius: Spacing,
  smoothCorners: boolean,
  cornerSharpness: number,
  config: Partial<RoughConfig>,
  fill: PossibleCanvasStyle | null,
  stroke: PossibleCanvasStyle | null,
  strokeWidth: number,
): Drawable {
  // Convert the rounded rectangle to SVG path data
  const pathData = roundedRectToSVGPath(
    box,
    radius,
    smoothCorners,
    cornerSharpness,
  );

  // Generate using rough path
  return generateRoughPath(
    context,
    pathData,
    config,
    fill,
    stroke,
    strokeWidth,
  );
}

/**
 * Draw a rough rounded rectangle.
 *
 * @param context - The 2D rendering context
 * @param box - The bounding box of the rectangle
 * @param radius - Corner radius values
 * @param smoothCorners - Whether to use smooth corners
 * @param cornerSharpness - Sharpness of smooth corners
 * @param config - Rough configuration
 * @param fill - Fill style
 * @param stroke - Stroke style
 * @param strokeWidth - Line width
 */
export function drawRoughRoundedRect(
  context: CanvasRenderingContext2D,
  box: BBox,
  radius: Spacing,
  smoothCorners: boolean,
  cornerSharpness: number,
  config: Partial<RoughConfig>,
  fill: PossibleCanvasStyle | null,
  stroke: PossibleCanvasStyle | null,
  strokeWidth: number,
): void {
  const drawable = generateRoughRoundedRect(
    context,
    box,
    radius,
    smoothCorners,
    cornerSharpness,
    config,
    fill,
    stroke,
    strokeWidth,
  );
  drawRoughDrawable(context, drawable);
}

/**
 * Draw a rough circle/ellipse.
 *
 * @param context - The 2D rendering context
 * @param center - Center point of the circle
 * @param size - Size (width and height) of the ellipse
 * @param config - Rough configuration
 * @param fill - Fill style
 * @param stroke - Stroke style
 * @param strokeWidth - Line width
 */
export function drawRoughCircle(
  context: CanvasRenderingContext2D,
  center: Vector2,
  size: Vector2,
  config: Partial<RoughConfig>,
  fill: PossibleCanvasStyle | null,
  stroke: PossibleCanvasStyle | null,
  strokeWidth: number,
): void {
  const rc = getRoughCanvas(context);
  const options = configToRoughOptions(
    config,
    fill,
    stroke,
    strokeWidth,
    context,
  );

  const drawable = rc.generator.ellipse(
    center.x,
    center.y,
    size.x * 2,
    size.y * 2,
    options,
  );
  rc.draw(drawable);
}

/**
 * Generate a rough path drawable from SVG path data.
 *
 * @param context - The 2D rendering context
 * @param pathData - SVG path string
 * @param config - Rough configuration
 * @param fill - Fill style
 * @param stroke - Stroke style
 * @param strokeWidth - Line width
 * @returns A Drawable object that can be cached and drawn
 */
export function generateRoughPath(
  context: CanvasRenderingContext2D,
  pathData: string,
  config: Partial<RoughConfig>,
  fill: PossibleCanvasStyle | null,
  stroke: PossibleCanvasStyle | null,
  strokeWidth: number,
): Drawable {
  const rc = getRoughCanvas(context);
  const options = configToRoughOptions(
    config,
    fill,
    stroke,
    strokeWidth,
    context,
  );

  return rc.generator.path(pathData, options);
}

/**
 * Draw a rough path from SVG path data.
 *
 * @param context - The 2D rendering context
 * @param pathData - SVG path string
 * @param config - Rough configuration
 * @param fill - Fill style
 * @param stroke - Stroke style
 * @param strokeWidth - Line width
 */
export function drawRoughPath(
  context: CanvasRenderingContext2D,
  pathData: string,
  config: Partial<RoughConfig>,
  fill: PossibleCanvasStyle | null,
  stroke: PossibleCanvasStyle | null,
  strokeWidth: number,
): void {
  const drawable = generateRoughPath(
    context,
    pathData,
    config,
    fill,
    stroke,
    strokeWidth,
  );
  drawRoughDrawable(context, drawable);
}

/**
 * Helper to create rough config from individual signals.
 *
 * @param roughness - Roughness value
 * @param bowing - Bowing value
 * @param fillStyle - Fill style
 * @param fillWeight - Fill weight
 * @param hachureAngle - Hachure angle
 * @param hachureGap - Hachure gap
 * @param seed - Random seed (always defined, generated from useRandom if not specified)
 * @param disableMultiStroke - Disable multiple strokes for stroke
 * @param disableMultiStrokeFill - Disable multiple strokes for fill
 * @returns Partial rough configuration
 */
export function createRoughConfig(
  roughness: number,
  bowing: number,
  fillStyle: RoughFillStyle,
  fillWeight: number | undefined,
  hachureAngle: number,
  hachureGap: number,
  seed: number,
  disableMultiStroke: boolean,
  disableMultiStrokeFill: boolean,
): Partial<RoughConfig> {
  return {
    roughness,
    bowing,
    fillStyle,
    fillWeight,
    hachureAngle,
    hachureGap,
    seed,
    disableMultiStroke,
    disableMultiStrokeFill,
  };
}
