export interface FrameSample {
  construct: 'waitFor' | 'tween' | 'chained waitFor';
  seconds: number;
  frames: number;
}

export interface FlowProbe {
  fps: number;
  ticks: number;
  wholeFrameTicks: number;
  retimedTicksAfterChange: number;
  canceledSpawnProgress: number;
  controlProgress: number;
  finalizedByCancel: string[];
  anyWithoutTasksDoneAt: number;
  joinFinishedDoneAt: number;
  allDoneAt: number;
  frames: FrameSample[];
}

declare global {
  interface Window {
    flowProbe?: Promise<FlowProbe>;
  }
}
