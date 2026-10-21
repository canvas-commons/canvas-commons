/**
 * Decides which `requestAnimationFrame` callbacks should draw a frame so that
 * drawing keeps to a target frame rate.
 */
export class FramePacer {
  private nextFrameTime = 0;

  public isDue(time: number, fps: number): boolean {
    const period = 1000 / fps;
    // Callbacks arrive on display refresh boundaries, rarely on the exact
    // target time. Without slack, being early by a fraction of a millisecond
    // costs a whole refresh.
    const slack = period / 4;
    // A deadline further out than this was set at a lower frame rate.
    this.nextFrameTime = Math.min(this.nextFrameTime, time + period + slack);
    if (time < this.nextFrameTime - slack) {
      return false;
    }

    const isBehind = time - this.nextFrameTime > period;
    this.nextFrameTime = (isBehind ? time : this.nextFrameTime) + period;
    return true;
  }
}
