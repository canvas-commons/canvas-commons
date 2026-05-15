import {Color, Signal} from '@canvas-commons/core';
import type {CanvasStyle, PossibleCanvasStyle} from '../partials/index.js';
import {canvasStyleParser} from '../utils/index.js';
import {initial, interpolation, parser, signal} from './signal.js';

export type CanvasStyleSignal<T> = Signal<PossibleCanvasStyle, CanvasStyle, T>;

export function canvasStyleSignal(): PropertyDecorator {
  return (target, key) => {
    signal()(target, key);
    parser(canvasStyleParser)(target, key);
    interpolation(Color.lerp)(target, key);
    initial(null)(target, key);
  };
}
