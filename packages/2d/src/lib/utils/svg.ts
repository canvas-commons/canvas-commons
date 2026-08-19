import {Color, PossibleColor} from '@canvas-commons/core';
import {Gradient} from '../partials/Gradient';
import {Pattern} from '../partials/Pattern';

export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Creates an SVG element, setting the given attributes. Numeric values are
 * formatted with {@link svgNumber}; string values (and text content, set via
 * `textContent`) are escaped by the DOM, so callers never assemble markup by
 * hand.
 */
export function createSVGElement(
  tag: string,
  attributes: Record<string, string | number> = {},
): SVGElement {
  const element = document.createElementNS(SVG_NAMESPACE, tag) as SVGElement;
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(
      name,
      typeof value === 'number' ? svgNumber(value) : value,
    );
  }
  return element;
}

/**
 * Shared document state threaded through a scene graph while it serializes
 * itself to SVG.
 *
 * @remarks
 * Each node builds its own geometry as elements (see {@link Node.toSVG}); the
 * only state that has to be shared across nodes is the `<defs>` section, so the
 * context exposes only `<defs>` registration (gradients, clip paths, filters).
 * The exporter package provides the concrete implementation.
 */
export interface SVGContext {
  /** Registers a gradient as a `<defs>` entry and returns its element id. */
  defineGradient(gradient: Gradient): string;
  /**
   * Registers a `<clipPath>` built from the given elements as a `<defs>` entry
   * and returns its id, for a node that clips its own content.
   */
  defineClipPath(content: SVGElement[]): string;
  /**
   * Registers a `<filter>` built from the given primitive elements as a `<defs>`
   * entry and returns its id, for a node that filters its own content.
   */
  defineFilter(content: SVGElement[]): string;
  /**
   * Registers a `<pattern>` for a tiled image paint as a `<defs>` entry and
   * returns its element id.
   */
  definePattern(pattern: Pattern): string;
}

/**
 * Maps one CSS filter function to its equivalent SVG filter primitive, chained
 * via `in`/`result`. The CSS Filter Effects spec defines each function in terms
 * of these primitives, so the conversion is exact — and unlike the CSS `filter`
 * shorthand, primitives render in any SVG consumer (Inkscape, librsvg, …), not
 * just browsers. Returns `null` for an unrecognised filter.
 */
export function filterPrimitiveSVG(
  name: string,
  value: number,
  inName: string,
  resultName: string,
): SVGElement | null {
  const io = {in: inName, result: resultName};
  const colorMatrix = (type: string, values: string | number) =>
    createSVGElement('feColorMatrix', {...io, type, values});
  const transfer = (
    type: string,
    attributes: Record<string, string | number>,
  ) => {
    const element = createSVGElement('feComponentTransfer', io);
    for (const channel of ['R', 'G', 'B']) {
      element.appendChild(
        createSVGElement(`feFunc${channel}`, {type, ...attributes}),
      );
    }
    return element;
  };

  switch (name) {
    case 'saturate':
      return colorMatrix('saturate', value);
    case 'hue-rotate':
      return colorMatrix('hueRotate', value);
    // grayscale(a) is a desaturation toward luminance — identical to saturate(1-a).
    case 'grayscale':
      return colorMatrix('saturate', Math.max(0, 1 - value));
    case 'sepia':
      return colorMatrix('matrix', sepiaMatrix(value));
    case 'invert':
      return transfer('table', {
        tableValues: `${svgNumber(value)} ${svgNumber(1 - value)}`,
      });
    case 'brightness':
      return transfer('linear', {slope: value});
    case 'contrast':
      return transfer('linear', {slope: value, intercept: 0.5 - 0.5 * value});
    case 'blur':
      return createSVGElement('feGaussianBlur', {...io, stdDeviation: value});
    default:
      return null;
  }
}

/** sRGB sepia colour matrix for the given amount (CSS Filter Effects spec). */
function sepiaMatrix(amount: number): string {
  const g = Math.max(0, 1 - amount);
  const m = [
    0.393 + 0.607 * g,
    0.769 - 0.769 * g,
    0.189 - 0.189 * g,
    0,
    0,
    0.349 - 0.349 * g,
    0.686 + 0.314 * g,
    0.168 - 0.168 * g,
    0,
    0,
    0.272 - 0.272 * g,
    0.534 - 0.534 * g,
    0.131 + 0.869 * g,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ];
  return m.map(svgNumber).join(' ');
}

/** Formats a number for SVG output, trimmed to four decimal places. */
export function svgNumber(value: number): string {
  return Number.parseFloat(value.toFixed(4)).toString();
}

/** Splits a colour into an SVG-ready hex string and its separate alpha. */
export function toHexAlpha(value: PossibleColor): {hex: string; alpha: number} {
  const color = value instanceof Color ? value : new Color(value);
  return {hex: color.hex('rgb'), alpha: color.alpha()};
}

/** Serializes a matrix as an SVG `transform`, or `''` when it's the identity. */
export function matrixToTransform(m: DOMMatrix): string {
  if (
    m.a === 1 &&
    m.b === 0 &&
    m.c === 0 &&
    m.d === 1 &&
    m.e === 0 &&
    m.f === 0
  ) {
    return '';
  }
  return `matrix(${svgNumber(m.a)},${svgNumber(m.b)},${svgNumber(m.c)},${svgNumber(
    m.d,
  )},${svgNumber(m.e)},${svgNumber(m.f)})`;
}

/**
 * Sets a canvas paint value (color, gradient, or CSS string) as an element's
 * `fill`/`stroke` attribute (plus a matching `-opacity` when translucent).
 */
export function applySVGPaint(
  element: SVGElement,
  value: unknown,
  kind: 'fill' | 'stroke',
  ctx: SVGContext,
): void {
  if (value === null || value === undefined) {
    element.setAttribute(kind, 'none');
    return;
  }
  if (value instanceof Gradient) {
    element.setAttribute(kind, `url(#${ctx.defineGradient(value)})`);
    return;
  }
  if (value instanceof Pattern) {
    element.setAttribute(kind, `url(#${ctx.definePattern(value)})`);
    return;
  }
  // Only plain colours map to an SVG paint; anything else has no element-level
  // equivalent, so leave it unpainted rather than guessing.
  if (typeof value !== 'string' && !(value instanceof Color)) {
    element.setAttribute(kind, 'none');
    return;
  }
  const {hex, alpha} = toHexAlpha(value);
  element.setAttribute(kind, hex);
  if (alpha < 1) {
    element.setAttribute(`${kind}-opacity`, svgNumber(alpha));
  }
}
