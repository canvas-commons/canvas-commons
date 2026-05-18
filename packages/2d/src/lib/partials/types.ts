import {Color, PossibleColor} from '@canvas-commons/core';
import type {Gradient} from './Gradient';
import type {Pattern} from './Pattern';

export type FlexDirection = 'row' | 'row-reverse' | 'column' | 'column-reverse';

export type FlexWrap = 'nowrap' | 'wrap' | 'wrap-reverse';

export type FlexBasis = Length | null;

export type FlexContent =
  | 'normal'
  | 'center'
  | 'start'
  | 'end'
  | 'space-between'
  | 'space-around'
  | 'space-evenly'
  | 'stretch';

export type FlexItems =
  | 'auto'
  | 'center'
  | 'start'
  | 'end'
  | 'stretch'
  | 'baseline';

export type TextWrap = boolean | 'pre';

export type WordBreak = 'normal' | 'keep-all';

/**
 * Line-level text alignment. Extends `CanvasTextAlign` with `'justify'`,
 * which distributes line-end slack across word gaps. Justification only
 * affects non-last lines of a paragraph; the last line falls back to the
 * `start` orientation.
 */
export type TextAlign = CanvasTextAlign | 'justify';

/**
 * Vertical placement of text when the rendered text block is shorter than
 * the configured height. `'top'` (default) aligns to the top edge,
 * `'middle'` centers, `'bottom'` aligns to the bottom edge.
 */
export type VerticalAlign = 'top' | 'middle' | 'bottom';

/**
 * A region of a `<Txt>` block that text wraps around. Coordinates are in the
 * `Txt`'s local pretext layout space, where `(0, 0)` is the top-left of the
 * text content area.
 */
export type TextExclusion =
  | {
      kind: 'rect';
      x: number;
      y: number;
      width: number;
      height: number;
      horizontalPadding?: number;
      verticalPadding?: number;
    }
  | {
      kind: 'polygon';
      points: {x: number; y: number}[];
      horizontalPadding?: number;
      verticalPadding?: number;
    };

export type LayoutMode = boolean | null;

/**
 * Represents a length used by most layout properties.
 *
 * @remarks
 * The value can be either:
 * - `number` - the desired length in pixels
 * - `${number}%` - a string with the desired length in percents, for example
 *                  `'50%'`
 */
export type Length = number | `${number}%`;

/**
 * Represents a desired length used internally by layout Nodes.
 *
 * @remarks
 * When the desired length is set to `null` it represents a default value for
 * whatever property it describes.
 */
export type DesiredLength = Length | null;

/**
 * Represents a length limit used by layout properties such as `max-width`.
 */
export type LengthLimit = Length | null;

export type PossibleCanvasStyle = null | PossibleColor | Gradient | Pattern;
export type CanvasStyle = null | Color | Gradient | Pattern;
