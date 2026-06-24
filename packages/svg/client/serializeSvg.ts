import {
  createSVGElement,
  filterPrimitiveSVG,
  Gradient,
  Layout,
  matrixToTransform,
  Node,
  SVGContext,
  svgNumber,
  toHexAlpha,
  View2D,
} from '@canvas-commons/2d';
import {Color, unwrap, useLogger} from '@canvas-commons/core';

/**
 * Serializes a Canvas Commons 2D scene graph into a standalone SVG string.
 *
 * @remarks
 * Rather than emulating a canvas, this walks the node tree and mirrors it as
 * nested `<g transform="matrix(...)">` groups, reading the exact same
 * `localToParent` matrices and `zIndex` ordering Canvas Commons uses when it
 * rasterizes. Each node builds its own geometry through {@link Node.toSVG}; this
 * module only handles the generic concerns — traversal, transforms, opacity,
 * gradient `<defs>`, and document assembly — then serializes the element tree
 * with {@link XMLSerializer}.
 *
 * @param view - The root view of the scene to serialize (`scene.getView()`).
 * @param background - The project background the stage composites behind the
 *   scene (see `Stage.render`); emitted as a full-viewport backdrop rect.
 * @param fontFaceCss - Optional `@font-face` CSS to inline in a `<style>` block
 *   so text renders without the fonts installed.
 */
export function serializeScene(
  view: View2D,
  background?: Color | string | null,
  fontFaceCss = '',
): string {
  const ctx = new DocumentContext();
  // The view carries the centering translate + resolution scale in its own
  // localToParent (see Scene2D.recreateView), so the buffer size is the view's
  // size scaled by its scale.
  const width = view.size().x * view.scale().x;
  const height = view.size().y * view.scale().y;

  const body = serializeNode(view, ctx);

  const svg = createSVGElement('svg', {
    width,
    height,
    viewBox: `0 0 ${svgNumber(width)} ${svgNumber(height)}`,
  });

  if (fontFaceCss) {
    const style = createSVGElement('style');
    style.textContent = fontFaceCss;
    svg.appendChild(style);
  }

  if (ctx.defs.length > 0) {
    const defs = createSVGElement('defs');
    ctx.defs.forEach(def => defs.appendChild(def));
    svg.appendChild(defs);
  }

  const backdrop = resolveBackground(background);
  if (backdrop) {
    svg.appendChild(
      createSVGElement('rect', {x: 0, y: 0, width, height, fill: backdrop}),
    );
  }

  if (body) {
    svg.appendChild(body);
  }

  const markup = new XMLSerializer().serializeToString(svg);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${markup}\n`;
}

/** Resolves the stage background to a CSS colour string, or '' when unset. */
function resolveBackground(background?: Color | string | null): string {
  if (background === null || background === undefined) {
    return '';
  }
  return typeof background === 'string' ? background : background.serialize();
}

/**
 * Concrete {@link SVGContext}: collects `<defs>` definitions and hands out
 * unique ids while the scene graph serializes itself.
 */
class DocumentContext implements SVGContext {
  public readonly defs: SVGElement[] = [];
  private counter = 0;

  public defineGradient(gradient: Gradient): string {
    const id = `gradient-${this.counter++}`;
    const from = gradient.from();
    const to = gradient.to();

    const element =
      gradient.type() === 'radial'
        ? createSVGElement('radialGradient', {
            id,
            gradientUnits: 'userSpaceOnUse',
            cx: to.x,
            cy: to.y,
            r: gradient.toRadius(),
            fx: from.x,
            fy: from.y,
            fr: gradient.fromRadius(),
          })
        : createSVGElement('linearGradient', {
            id,
            gradientUnits: 'userSpaceOnUse',
            x1: from.x,
            y1: from.y,
            x2: to.x,
            y2: to.y,
          });

    for (const {offset, color} of gradient.stops()) {
      const {hex, alpha} = toHexAlpha(unwrap(color));
      const stop = createSVGElement('stop', {offset: unwrap(offset)});
      stop.setAttribute('stop-color', hex);
      if (alpha < 1) {
        stop.setAttribute('stop-opacity', svgNumber(alpha));
      }
      element.appendChild(stop);
    }

    this.defs.push(element);
    return id;
  }

  /**
   * Registers an alpha `<mask>` built from already-serialized elements (the
   * preceding siblings that act as the destination of a `source-in` composite)
   * and returns its element id.
   */
  public defineMask(content: SVGElement[]): string {
    const id = `mask-${this.counter++}`;
    // An explicit, effectively unbounded region in the referencing element's
    // user space: the default mask region is the object's bounding box, which
    // clips content that a parent transform (scale/rotation) pushes outside it.
    const mask = createSVGElement('mask', {
      id,
      maskUnits: 'userSpaceOnUse',
      x: -100000,
      y: -100000,
      width: 200000,
      height: 200000,
      style: 'mask-type: alpha',
    });
    content.forEach(node => mask.appendChild(node));
    this.defs.push(mask);
    return id;
  }

  public defineClipPath(content: SVGElement[]): string {
    const id = `clip-${this.counter++}`;
    const clip = createSVGElement('clipPath', {
      id,
      clipPathUnits: 'userSpaceOnUse',
    });
    content.forEach(node => clip.appendChild(node));
    this.defs.push(clip);
    return id;
  }

  /**
   * Registers a `<filter>` from primitive elements and returns its element id.
   * `color-interpolation-filters="sRGB"` matches the canvas (which filters in
   * sRGB, not the SVG-default linearRGB); the region is enlarged so blurs and
   * drop shadows are not clipped by the default object bounding box.
   */
  public defineFilter(content: SVGElement[]): string {
    const id = `filter-${this.counter++}`;
    const filter = createSVGElement('filter', {
      id,
      x: '-50%',
      y: '-50%',
      width: '200%',
      height: '200%',
    });
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    content.forEach(node => filter.appendChild(node));
    this.defs.push(filter);
    return id;
  }
}

/**
 * Builds a node's filter primitives — its active filters chained, then its drop
 * shadow — or `[]` when it has neither. The chaining, sRGB working space, and
 * region are handled by {@link DocumentContext.defineFilter}.
 */
function nodeFilter(node: Node): SVGElement[] {
  const parts: SVGElement[] = [];
  let last = 'SourceGraphic';

  let index = 0;
  for (const filter of node.filters()) {
    if (!filter.isActive()) {
      continue;
    }
    const result = `filter${index++}`;
    const primitive = filterPrimitiveSVG(
      filter.name,
      filter.value(),
      last,
      result,
    );
    if (primitive) {
      parts.push(primitive);
      last = result;
    }
  }

  const color = node.shadowColor();
  const offset = node.shadowOffset();
  const hasShadow =
    !!color && (node.shadowBlur() > 0 || offset.x !== 0 || offset.y !== 0);
  if (hasShadow) {
    // Drop-shadow as primitives over the filtered result: blur it, offset it,
    // recolour it, and merge the original back on top. CSS drop-shadow's blur
    // radius is twice the Gaussian standard deviation.
    const flood = createSVGElement('feFlood', {result: 'shadowColor'});
    flood.setAttribute('flood-color', color.hex('rgb'));
    flood.setAttribute('flood-opacity', svgNumber(color.alpha()));
    parts.push(
      createSVGElement('feGaussianBlur', {
        in: last,
        stdDeviation: node.shadowBlur() / 2,
        result: 'shadowBlur',
      }),
      createSVGElement('feOffset', {
        in: 'shadowBlur',
        dx: offset.x,
        dy: offset.y,
        result: 'shadowOffset',
      }),
      flood,
      createSVGElement('feComposite', {
        in: 'shadowColor',
        in2: 'shadowOffset',
        operator: 'in',
        result: 'shadow',
      }),
    );
    const merge = createSVGElement('feMerge');
    merge.appendChild(createSVGElement('feMergeNode', {in: 'shadow'}));
    merge.appendChild(createSVGElement('feMergeNode', {in: last}));
    parts.push(merge);
  }

  return parts;
}

/**
 * A node's {@link Node.compositeOperation} as a `mix-blend-mode` value, or `''`
 * when it has no blend-mode equivalent. The separable and non-separable blend
 * modes map one-to-one; `lighter` maps to `plus-lighter`. Porter-Duff operators
 * (`source-in`, …) have no blend-mode form and are handled by masking/draw order.
 */
function nodeBlendMode(node: Node): string {
  const operation = node.compositeOperation();
  switch (operation) {
    case 'multiply':
    case 'screen':
    case 'overlay':
    case 'darken':
    case 'lighten':
    case 'color-dodge':
    case 'color-burn':
    case 'hard-light':
    case 'soft-light':
    case 'difference':
    case 'exclusion':
    case 'hue':
    case 'saturation':
    case 'color':
    case 'luminosity':
      return operation;
    case 'lighter':
      return 'plus-lighter';
    default:
      return '';
  }
}

function serializeNode(node: Node, ctx: DocumentContext): SVGElement | null {
  // Mirror Canvas Commons: a node with no effective opacity is not drawn.
  if (node.absoluteOpacity() <= 0) {
    return null;
  }

  const group = createSVGElement('g');
  const transform = matrixToTransform(node.localToParent());
  if (transform) {
    group.setAttribute('transform', transform);
  }
  const opacity = node.opacity();
  if (opacity < 1) {
    group.setAttribute('opacity', svgNumber(opacity));
  }
  const filter = nodeFilter(node);
  if (filter.length > 0) {
    group.setAttribute('filter', `url(#${ctx.defineFilter(filter)})`);
  }
  const blendMode = nodeBlendMode(node);
  if (blendMode) {
    group.setAttribute('style', `mix-blend-mode: ${blendMode}`);
  }

  const shape = node.toSVG(ctx);
  let children = serializeChildren(node, ctx);

  // A clipping node confines its children to its own geometry (see Layout/Shape
  // `draw`, which call `context.clip()`); reuse that geometry as the clip path.
  const clipData =
    node instanceof Layout && node.clip() ? node.getPathData() : '';
  if (clipData && children.length > 0) {
    const clipPath = createSVGElement('path', {d: clipData});
    const clipId = ctx.defineClipPath([clipPath]);
    const clipGroup = createSVGElement('g');
    clipGroup.setAttribute('clip-path', `url(#${clipId})`);
    children.forEach(child => clipGroup.appendChild(child));
    children = [clipGroup];
  }

  if (shape.length === 0 && children.length === 0) {
    return null;
  }

  shape.forEach(element => group.appendChild(element));
  children.forEach(child => group.appendChild(child));
  return group;
}

/**
 * Serializes a node's children in `zIndex` order, handling the `source-in`
 * composite operation by masking the operand with everything drawn before it
 * (its destination), mirroring how the canvas keeps the new content only where
 * the existing content was opaque. Other composite operations are emitted
 * normally (blend modes are applied per-node via `mix-blend-mode`).
 */
function serializeChildren(node: Node, ctx: DocumentContext): SVGElement[] {
  const children = [...node.children()].sort((a, b) =>
    Math.sign(a.zIndex() - b.zIndex()),
  );

  let backdrop: SVGElement[] = [];
  for (const child of children) {
    const markup = serializeNode(child, ctx);
    if (!markup) {
      continue;
    }

    const operation = child.compositeOperation();
    if (operation === 'source-in') {
      // `source-in` keeps the source only where the destination is opaque. With
      // a destination, that destination becomes an alpha mask (and is consumed);
      // with nothing drawn before it, the result is empty, so drop the child.
      if (backdrop.length > 0) {
        const maskId = ctx.defineMask(backdrop);
        const masked = createSVGElement('g', {mask: `url(#${maskId})`});
        masked.appendChild(markup);
        backdrop = [masked];
      }
      continue;
    }

    // Blend modes are applied per-node via `mix-blend-mode`; `source-over` is
    // the default. Any other Porter-Duff operator has no SVG element-level
    // equivalent and is drawn as a plain `source-over` — warn so the
    // discrepancy isn't silent.
    if (operation !== 'source-over' && nodeBlendMode(child) === '') {
      useLogger().warn({
        message: `SVG export does not support the "${operation}" composite operation; drawing it normally instead.`,
        inspect: child.key,
      });
    }
    backdrop.push(markup);
  }

  return backdrop;
}
