/* eslint-disable @typescript-eslint/naming-convention --
 * Keys are scene names; they must match the wrapper basenames in
 * `tests/projects/` (which mirror kebab-case scene files in
 * `@canvas-commons/examples`).
 */
export interface TestFrame {
  /** Frame index at the render fps. `-1` resolves to the scene's last frame. */
  frame: number;
  /** Identifier suffix used for the snapshot filename. */
  label: string;
}

export const testFrames: Record<string, TestFrame[]> = {
  quickstart: [
    {frame: 0, label: 'initial'},
    {frame: 30, label: 'mid'},
    {frame: 60, label: 'peak'},
    {frame: -1, label: 'final'},
  ],
  tex: [
    {frame: 0, label: 'initial'},
    {frame: 60, label: 'morph-add'},
    {frame: 240, label: 'morph-rearrange'},
    {frame: 420, label: 'morph-return'},
    {frame: -1, label: 'final'},
  ],
  'tweening-linear': [
    {frame: 0, label: 'initial'},
    {frame: 60, label: 'mid'},
    {frame: -1, label: 'final'},
  ],
  'tweening-cubic': [
    {frame: 0, label: 'initial'},
    {frame: 60, label: 'mid'},
    {frame: -1, label: 'final'},
  ],
  'tweening-color': [
    {frame: 0, label: 'initial'},
    {frame: 60, label: 'mid'},
    {frame: -1, label: 'final'},
  ],
  'tweening-vector': [
    {frame: 0, label: 'initial'},
    {frame: 60, label: 'mid'},
    {frame: -1, label: 'final'},
  ],
  'tweening-visualiser': [
    {frame: 0, label: 'initial'},
    {frame: -1, label: 'final'},
  ],
  'tweening-spring': [
    {frame: 0, label: 'initial'},
    {frame: 30, label: 'mid'},
    {frame: -1, label: 'final'},
  ],
  'tweening-save-restore': [
    {frame: 0, label: 'initial'},
    {frame: 60, label: 'save-1'},
    {frame: 120, label: 'save-2'},
    {frame: 180, label: 'save-3'},
    {frame: -1, label: 'final'},
  ],
  'node-signal': [
    {frame: 0, label: 'initial'},
    {frame: 120, label: 'peak'},
    {frame: -1, label: 'final'},
  ],
  code: [
    {frame: 0, label: 'initial'},
    {frame: 144, label: 'highlight'},
    {frame: 312, label: 'rename'},
    {frame: 540, label: 'radius'},
    {frame: 780, label: 'replace'},
    {frame: -1, label: 'final'},
  ],
  random: [
    {frame: 0, label: 'initial'},
    {frame: 60, label: 'wave'},
    {frame: -1, label: 'final'},
  ],
  layout: [
    {frame: 0, label: 'initial'},
    {frame: 24, label: 'cols-grow'},
    {frame: 72, label: 'rows-shrink'},
    {frame: 120, label: 'cols-reverse'},
    {frame: 168, label: 'rows-grow'},
    {frame: -1, label: 'final'},
  ],
  'layout-group': [
    {frame: 0, label: 'initial'},
    {frame: 30, label: 'mid'},
    {frame: -1, label: 'final'},
  ],
  'layout-animations': [
    {frame: 0, label: 'initial'},
    {frame: 18, label: 'insert'},
    {frame: 132, label: 'after-remove'},
    {frame: 252, label: 'wrap-row'},
    {frame: 372, label: 'rotated-grow'},
    {frame: 420, label: 'transition-out'},
    {frame: 480, label: 'edit-layout-col'},
    {frame: -1, label: 'final'},
  ],
  positioning: [
    {frame: 0, label: 'initial'},
    {frame: 30, label: 'mid'},
    {frame: -1, label: 'final'},
  ],
  'media-image': [
    {frame: 0, label: 'initial'},
    {frame: 90, label: 'peak'},
    {frame: -1, label: 'final'},
  ],
  'media-video': [
    {frame: 0, label: 'initial'},
    {frame: 120, label: 'peak'},
    {frame: -1, label: 'final'},
  ],
  components: [
    {frame: 0, label: 'initial'},
    {frame: -1, label: 'final'},
  ],
  'transitions-first': [
    {frame: 0, label: 'initial'},
    {frame: -1, label: 'final'},
  ],
  'transitions-second': [
    {frame: 50, label: 'initial'},
    {frame: 79, label: 'mid'},
    {frame: -1, label: 'final'},
  ],
  presentation: [
    {frame: 0, label: 'initial'},
    {frame: -1, label: 'final'},
  ],
  'text-rendering': [
    {frame: 0, label: 'initial'},
    {frame: 60, label: 'centered'},
    {frame: -1, label: 'final'},
  ],
  primitives: [{frame: 0, label: 'initial'}],
  paths: [{frame: 0, label: 'initial'}],
  img: [{frame: -1, label: 'final'}],
  svg: [{frame: -1, label: 'final'}],
  shadow: [{frame: -1, label: 'final'}],
  clip: [{frame: -1, label: 'final'}],
  pattern: [{frame: 0, label: 'initial'}],
  'composite-operations': [
    {frame: 0, label: 'initial'},
    {frame: 45, label: 'sliding'},
    {frame: 90, label: 'peak'},
    {frame: -1, label: 'final'},
  ],
  'filters-order': [
    {frame: 0, label: 'initial'},
    {frame: 120, label: 'saturated'},
    {frame: 240, label: 'contrasted'},
    {frame: -1, label: 'final'},
  ],
  text: [
    {frame: 0, label: 'initial'},
    {frame: -1, label: 'final'},
  ],
  'text-path': [
    {frame: 0, label: 'initial'},
    {frame: 60, label: 'mid'},
    {frame: -1, label: 'final'},
  ],
};

/**
 * Scenes the SVG-fidelity suite cannot pixel-compare against the canvas baseline,
 * each mapped to why. The SVG of these renders through a different mechanism than
 * the canvas, so a pixel diff would be meaningless; the PNG×SVG gallery judges
 * their fidelity visually instead. Every other scene in {@link testFrames} is
 * checked.
 */
const svgFidelityIgnore: Record<string, string> = {
  // Code has no toSVG yet, so its text exports nothing.
  code: 'Code node is not serialized',
  // Glyphs the rasterizer can't reproduce even with font embedding.
  'text-rendering': 'Segoe Print, a Windows-only font',
  // Scene transitions composite multiple scenes at the stage level; the exporter
  // only serializes one scene's view.
  'transitions-first': 'scene transition is not serialized',
  'transitions-second': 'scene transition is not serialized',
  // Compositing the canvas does but SVG has no element-level equivalent for.
  'composite-operations': 'Porter-Duff compositing',
  presentation: 'destination-out compositing',
  // Bitmap/video sources the vector path can't reproduce pixel-for-pixel.
  'media-image': 'bitmap upscaling',
  'media-video': 'video frames are not serialized',
};

/**
 * Scenes (and frames) checked by the SVG-fidelity suite: every scene in
 * {@link testFrames} except those in {@link svgFidelityIgnore}, rendered to SVG,
 * rasterized, and compared against the canvas PNG baseline.
 */
export const svgFidelityFrames: Record<string, TestFrame[]> =
  Object.fromEntries(
    Object.entries(testFrames).filter(
      ([scene]) => !(scene in svgFidelityIgnore),
    ),
  );
