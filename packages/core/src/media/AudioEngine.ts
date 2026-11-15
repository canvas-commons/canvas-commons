import {AudioClock} from './AudioClock';
import type {AudioResourceManager} from './AudioResourceManager';

export interface AudioEngine {
  readonly context: AudioContext;
  readonly clock: AudioClock;
  readonly resources: AudioResourceManager;
  readonly masterGain: GainNode;
  readonly volume: number;
  readonly muted: boolean;
  applyGain(volume: number, muted: boolean): void;
}
