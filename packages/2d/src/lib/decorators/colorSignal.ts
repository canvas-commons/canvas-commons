import {Color} from '@canvas-commons/core';
import {signal, wrapper} from './signal.js';

export function colorSignal(): PropertyDecorator {
  return (target, key) => {
    signal()(target, key);
    wrapper(Color)(target, key);
  };
}
