import {MetaOption} from '../meta';
import {CanvasColorSpace, CanvasOutputMimeType} from '../types';

/**
 * Resolution scales offered for rendering.
 */
export const Scales: MetaOption<number>[] = [
  {value: 0.25, text: '0.25x (Quarter)'},
  {value: 0.5, text: `0.5x (Half)`},
  {value: 1, text: `1.0x (Full)`},
  {value: 2, text: `2.0x (Double)`},
];

/**
 * Color spaces offered for rendering.
 */
export const ColorSpaces: MetaOption<CanvasColorSpace>[] = [
  {value: 'srgb', text: 'sRGB'},
  {value: 'display-p3', text: 'DCI-P3'},
];

/**
 * Image file types offered for rendering.
 */
export const FileTypes: MetaOption<CanvasOutputMimeType>[] = [
  {value: 'image/png', text: 'png'},
  {value: 'image/jpeg', text: 'jpeg'},
  {value: 'image/webp', text: 'webp'},
];

/**
 * Frame rates offered for rendering.
 */
export const FrameRates: MetaOption<number>[] = [
  {value: 30, text: '30 FPS'},
  {value: 60, text: '60 FPS'},
];
