const Pending = new Set<Promise<unknown>>();

/**
 * Register an in-flight async mutation of a {@link Sound}'s properties (e.g.
 * a loudness-normalization gain being computed and applied once measured).
 *
 * @remarks
 * Paired with {@link waitForPendingAudioAdjustments}, used so the renderer
 * and live player can wait for such mutations to land before finalizing
 * which sounds get exported/played, instead of racing an in-flight
 * measurement.
 */
export function trackPendingAudioAdjustment(promise: Promise<unknown>): void {
  Pending.add(promise);
  promise.finally(() => Pending.delete(promise));
}

/**
 * Wait for all currently tracked audio adjustments to settle.
 *
 * @remarks
 * Repeats until no new adjustments were tracked during the wait, so
 * adjustments queued while waiting are also covered.
 */
export async function waitForPendingAudioAdjustments(): Promise<void> {
  let snapshot = [...Pending];
  while (snapshot.length > 0) {
    await Promise.allSettled(snapshot);
    snapshot = [...Pending];
  }
}
