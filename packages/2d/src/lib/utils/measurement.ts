let MeasurementCanvas: HTMLCanvasElement | null = null;

/** Sharing a measurement canvas avoids per-node canvas allocation. */
export function sharedMeasurementContext(): CanvasRenderingContext2D | null {
  MeasurementCanvas ??= document.createElement('canvas');
  return MeasurementCanvas.getContext('2d');
}
