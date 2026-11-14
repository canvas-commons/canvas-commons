import type {Logger} from '../app';
import type {Sound} from '../scenes';
import {AudioClock} from './AudioClock';
import type {AudioEngine} from './AudioEngine';
import {AudioManager} from './AudioManager';
import {AudioResourceManager} from './AudioResourceManager';
import {planLane} from './planLane';

// a lane scheduled ahead of the playhead keeps its start time during main thread stalls
const LOOKAHEAD_SECONDS = 1;
const FADE_SECONDS = 0.004;

export class AudioManagerPool implements AudioEngine {
  public readonly context: AudioContext;
  public readonly clock: AudioClock;
  public readonly resources: AudioResourceManager;
  public readonly masterGain: GainNode;
  public readonly voiceover: AudioManager;
  public volume: number = 1;
  public muted: boolean = true;
  public paused: boolean = true;

  private readonly logger: Logger;
  private readonly owners = new Map<Sound, AudioManager>();
  private spare: AudioManager[] = [];
  private sounds: Sound[] = [];

  public constructor(logger: Logger, resources?: AudioResourceManager) {
    this.logger = logger;
    this.context = resources?.context ?? new AudioContext();
    this.resources =
      resources ?? new AudioResourceManager(logger, this.context);
    this.clock = new AudioClock({
      kind: () => (this.context.state === 'running' ? 'device' : 'wall'),
      now: () =>
        this.context.state === 'running'
          ? this.context.currentTime
          : performance.now() / 1000,
    });
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
    this.voiceover = this.spawn();
  }

  public setupPool(sounds: Sound[]): void {
    for (const manager of this.spare) {
      manager.dispose();
    }
    this.spare = [];
    for (const manager of this.owners.values()) {
      manager.dispose();
    }
    this.owners.clear();
    this.sounds = sounds;
  }

  public spawn(sound?: Sound): AudioManager {
    return new AudioManager(this, sound);
  }

  public prepare(time: number, paused = false): void {
    if (paused) {
      return;
    }

    for (const sound of this.sounds) {
      let manager = this.owners.get(sound);
      if (!manager) {
        manager = this.spare.pop() ?? this.spawn(sound);
        manager.setSound(sound);
        this.owners.set(sound, manager);
      }
      if (!this.plan(manager, time)) {
        this.owners.delete(sound);
        this.spare.push(manager);
      }
    }

    this.plan(this.voiceover, time);
  }

  // the only place a seek belongs, so it is a user action and never drift correction
  public setTime(time: number): void {
    this.anchor(time);
  }

  public anchor(time: number): void {
    for (const manager of [...this.owners.values(), this.voiceover]) {
      manager.stop();
    }
    this.clock.anchor(time);
  }

  public setSpeed(speed: number): void {
    this.clock.setSpeed(speed);
  }

  public setMuted(muted: boolean): void {
    if (muted === this.muted) {
      return;
    }
    this.muted = muted;
    this.applyGain(this.volume, this.muted);
  }

  public setVolume(volume: number): void {
    if (volume === this.volume) {
      return;
    }
    this.volume = volume;
    this.applyGain(this.volume, this.muted);
  }

  public setPaused(paused: boolean): void {
    if (paused === this.paused) {
      return;
    }
    this.paused = paused;
    if (paused) {
      for (const manager of [...this.owners.values(), this.voiceover]) {
        manager.stop();
      }
      this.clock.pause();
    } else {
      this.clock.resume();
    }
  }

  public applyGain(volume: number, muted: boolean): void {
    const gain = this.masterGain.gain;
    const now = this.context.currentTime;
    const value = muted ? 0 : volume;
    if (gain.value === value) {
      return;
    }
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(value, now + FADE_SECONDS);
  }

  public resume(): void {
    if (this.context.state !== 'suspended') {
      return;
    }
    this.context.resume().catch((e: Error) => this.logger.error(e));
  }

  public dispose(): void {
    for (const manager of [
      ...this.owners.values(),
      this.voiceover,
      ...this.spare,
    ]) {
      manager.dispose();
    }
    this.owners.clear();
    this.spare = [];
    this.masterGain.disconnect();
  }

  // whether the lane should stay open at the given clock time
  private plan(manager: AudioManager, time: number): boolean {
    if (!manager.isReady()) {
      return false;
    }

    const buffer = manager.getBuffer();
    if (!buffer) {
      return false;
    }

    const plan = planLane(
      manager.getSound(),
      time,
      this.clock.speed,
      buffer.duration,
    );
    // the lookahead is wall time, so at higher speed it covers more timeline seconds
    if (
      time < plan.begin - LOOKAHEAD_SECONDS * this.clock.speed ||
      time >= plan.end
    ) {
      manager.stop();
      return false;
    }

    manager.schedule(time);
    return true;
  }
}
