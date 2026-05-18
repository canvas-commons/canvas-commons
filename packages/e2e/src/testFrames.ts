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
};
