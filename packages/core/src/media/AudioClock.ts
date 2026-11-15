export interface ClockSource {
  kind(): string;
  now(): number;
}

// the clock is the audio render clock when an output is live, so a stalled main thread can never slow it down
export class AudioClock {
  private anchorTime = 0;
  private anchorNow = 0;
  private anchorKind: string;
  private lastTime = 0;
  private rate = 1;
  private running = false;

  public constructor(private readonly source: ClockSource) {
    this.anchorKind = this.source.kind();
  }

  public get speed(): number {
    return this.rate;
  }

  public isRunning(): boolean {
    return this.running;
  }

  public now(): number {
    return this.source.now();
  }

  public getTime(): number {
    const kind = this.source.kind();
    const now = this.source.now();

    if (!this.running) {
      this.anchorKind = kind;
      this.anchorNow = now;
      this.lastTime = this.anchorTime;
      return this.anchorTime;
    }

    // two clock sources are unrelated counters, so the time must be carried across the switch
    if (kind !== this.anchorKind) {
      this.anchorTime = this.lastTime;
      this.anchorKind = kind;
      this.anchorNow = now;
    }

    const time = this.anchorTime + (now - this.anchorNow) * this.rate;
    this.lastTime = time;
    return time;
  }

  // render clock time at which a timeline time is heard
  public sourceTimeAt(time: number): number {
    if (!this.running) {
      return this.now();
    }
    return this.anchorNow + (time - this.anchorTime) / this.rate;
  }

  public anchor(time: number): void {
    this.anchorTime = time;
    this.anchorKind = this.source.kind();
    this.anchorNow = this.source.now();
    this.lastTime = time;
  }

  public reanchor(): void {
    this.anchor(this.getTime());
  }

  public setSpeed(value: number): void {
    const rate = value > 0 ? value : 1;
    if (rate === this.rate) {
      return;
    }
    // the time already elapsed must be measured with the old rate
    const time = this.getTime();
    this.rate = rate;
    this.anchor(time);
  }

  public pause(): void {
    this.reanchor();
    this.running = false;
  }

  public resume(): void {
    this.reanchor();
    this.running = true;
  }
}
