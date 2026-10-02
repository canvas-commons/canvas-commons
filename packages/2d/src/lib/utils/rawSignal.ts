import {Signal, SignalValue} from '@canvas-commons/core';

/**
 * Put back a value read with `signal.context.raw()`, keeping reactive bindings.
 */
export function restoreRaw<TSetterValue, TValue extends TSetterValue, TOwner>(
  signal: Signal<TSetterValue, TValue, TOwner>,
  raw: SignalValue<TSetterValue> | undefined,
) {
  if (raw === undefined) {
    signal.context.reset();
  } else {
    signal.context.setter(raw);
  }
}

/**
 * Read the raw value of a signal now and return a function that restores it.
 */
export function captureRaw<TSetterValue, TValue extends TSetterValue, TOwner>(
  signal: Signal<TSetterValue, TValue, TOwner>,
): () => void {
  const raw = signal.context.raw();
  return () => restoreRaw(signal, raw);
}
