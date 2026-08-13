let MeasurementCanvas: HTMLCanvasElement | null = null;

/**
 * Measurement only inspects text metrics, so one detached canvas serves every
 * measuring node (`Txt`, `Code`). Text-heavy scenes churn through thousands of
 * nodes per playthrough and each node stays registered until the next scene
 * reset — a per-node measurement canvas turns that churn into unbounded canvas
 * allocation.
 *
 * Returns `null` in headless environments without 2D canvas support
 * (e.g. jsdom) where measurement is unavailable.
 */
export function sharedMeasurementContext(): CanvasRenderingContext2D | null {
  MeasurementCanvas ??= document.createElement('canvas');
  return MeasurementCanvas.getContext('2d');
}
