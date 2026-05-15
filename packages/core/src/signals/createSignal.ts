import {SignalContext, SignalValue, SimpleSignal} from '../signals/index.js';
import {InterpolationFunction, deepLerp} from '../tweening/index.js';

export function createSignal<TValue, TOwner = void>(
  initial?: SignalValue<TValue>,
  interpolation: InterpolationFunction<TValue> = deepLerp,
  owner?: TOwner,
): SimpleSignal<TValue, TOwner> {
  return new SignalContext<TValue, TValue, TOwner>(
    initial,
    interpolation,
    owner,
  ).toSignal();
}
