/**
 * Rough.js integration types for Canvas Commons
 *
 * @remarks
 * These types define the configuration options for rendering shapes with
 * a hand-drawn, sketchy appearance using Rough.js.
 */

/**
 * Fill style options for rough shapes.
 *
 * @remarks
 * - `hachure`: Parallel lines filling the shape (default)
 * - `solid`: Solid fill with slight irregularity
 * - `zigzag`: Zigzag pattern filling
 * - `cross-hatch`: Crossed parallel lines
 * - `dots`: Dotted pattern filling
 * - `dashed`: Dashed lines filling
 * - `zigzag-line`: Zigzag lines filling
 */
export type RoughFillStyle =
  | 'hachure'
  | 'solid'
  | 'zigzag'
  | 'cross-hatch'
  | 'dots'
  | 'dashed'
  | 'zigzag-line';

/**
 * Configuration options for rough rendering.
 *
 * @remarks
 * These options control the appearance of the hand-drawn style.
 * All numeric values can be animated using signals.
 */
export interface RoughConfig {
  /**
   * Numerical value indicating how rough the drawing is.
   *
   * @remarks
   * A value of 0 will produce a smooth shape, while higher values
   * introduce more irregularity. Typical range is 0-10.
   *
   * @defaultValue 1
   */
  roughness: number;

  /**
   * Controls the curve deviation from a straight line.
   *
   * @remarks
   * A value of 0 will cause lines to be perfectly straight.
   * Higher values introduce more curvature.
   *
   * @defaultValue 1
   */
  bowing: number;

  /**
   * Seed for the random number generator.
   *
   * @remarks
   * Using the same seed produces consistent results, which is useful
   * for reproducible animations.
   */
  seed?: number;

  /**
   * Fill style for the shape.
   *
   * @defaultValue 'hachure'
   */
  fillStyle: RoughFillStyle;

  /**
   * Thickness of the lines used for filling.
   *
   * @remarks
   * Only applicable for hachure, cross-hatch, and similar fill styles.
   *
   * @defaultValue Half of strokeWidth, or 1
   */
  fillWeight?: number;

  /**
   * Angle of the hachure lines in degrees.
   *
   * @remarks
   * Only applicable for hachure and cross-hatch fill styles.
   *
   * @defaultValue -41
   */
  hachureAngle: number;

  /**
   * Gap between hachure lines in pixels.
   *
   * @remarks
   * Only applicable for hachure, cross-hatch, and similar fill styles.
   *
   * @defaultValue 4 times strokeWidth
   */
  hachureGap: number;

  /**
   * Curve tightness for hachure lines.
   *
   * @remarks
   * Lower values create more curved hachure lines.
   *
   * @defaultValue 0.95
   */
  curveStepCount?: number;

  /**
   * Simplification tolerance for paths.
   *
   * @remarks
   * Higher values simplify the path more aggressively.
   *
   * @defaultValue 0
   */
  simplification?: number;

  /**
   * Whether to disable multi-stroke rendering.
   *
   * @remarks
   * By default, Rough.js renders strokes with multiple lines for a
   * more sketchy appearance. Set to true to use a single stroke.
   *
   * @defaultValue false
   */
  disableMultiStroke?: boolean;

  /**
   * Whether to disable multi-stroke fill.
   *
   * @remarks
   * By default, Rough.js renders fills with multiple passes.
   * Set to true to use a single fill pass.
   *
   * @defaultValue false
   */
  disableMultiStrokeFill?: boolean;
}

/**
 * Partial rough configuration with defaults applied.
 */
export type PartialRoughConfig = Partial<RoughConfig>;

/**
 * Get default rough configuration.
 *
 * @returns Default configuration values
 */
export function getDefaultRoughConfig(): RoughConfig {
  return {
    roughness: 1,
    bowing: 1,
    fillStyle: 'hachure',
    hachureAngle: -41,
    hachureGap: 4,
  };
}

/**
 * Merge partial rough configuration with defaults.
 *
 * @param config - Partial configuration to merge
 * @returns Complete configuration with defaults applied
 */
export function mergeRoughConfig(config: PartialRoughConfig): RoughConfig {
  return {
    ...getDefaultRoughConfig(),
    ...config,
  };
}
