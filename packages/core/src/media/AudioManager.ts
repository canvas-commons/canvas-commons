import type {Sound} from '../scenes';
import type {AudioEngine} from './AudioEngine';
import {decibelsToAmplitude} from './decibelsToAmplitude';
import {planLane} from './planLane';

// short ramps keep gain changes and lane boundaries click free
const FADE_SECONDS = 0.004;

// preservesPitch is not in the DOM types for AudioBufferSourceNode, but every engine implements it
type PitchPreservingSource = AudioBufferSourceNode & {preservesPitch?: boolean};

// a playback lane for one decoded source; it is started once and never seeked during playback
export class AudioManager {
  private readonly engine: AudioEngine;
  private readonly gainNode: GainNode;
  private sound: Sound;
  private sourceNode: PitchPreservingSource | null = null;
  private pitchShift = false;
  private error = false;

  public constructor(engine: AudioEngine, sound?: Sound) {
    this.engine = engine;
    this.sound = sound ?? {audio: '', offset: 0, realPlaybackRate: 1};
    this.gainNode = engine.context.createGain();
    this.gainNode.connect(engine.masterGain);
  }

  public setSound(sound: Sound): void {
    this.sound = {...sound};
  }

  public getSound(): Sound {
    return this.sound;
  }

  public getSource(): string | null {
    return this.sound.audio || null;
  }

  public setSource(src: string): void {
    this.sound = {...this.sound, audio: src};
  }

  public setTrim(start?: number, end?: number): void {
    this.sound = {...this.sound, start, end};
  }

  public setOffset(value: number): void {
    this.sound = {...this.sound, offset: value};
  }

  public setGain(db: number): void {
    this.sound = {...this.sound, gain: db};
  }

  public setPlaybackRate(value: number, pitchShift: boolean = false): void {
    this.pitchShift = pitchShift;
    this.sound = {
      ...this.sound,
      playbackRate: value,
      realPlaybackRate: value * Math.pow(2, (this.sound.detune ?? 0) / 1200),
    };
  }

  public setMuted(isMuted: boolean): void {
    this.engine.applyGain(this.engine.volume, isMuted);
  }

  public setVolume(volume: number): void {
    this.engine.applyGain(volume, this.engine.muted);
  }

  public getBuffer(): AudioBuffer | null {
    if (!this.sound.audio) {
      return null;
    }
    return this.engine.resources.get(this.sound.audio).onData.current.buffer;
  }

  public isReady(): boolean {
    return !!this.sound.audio && !this.error;
  }

  public isInRange(time: number): boolean {
    const duration = this.engine.resources.peekDuration(this.sound.audio);
    return time >= this.sound.offset && time < this.sound.offset + duration;
  }

  public getTime(): number {
    return this.engine.clock.getTime();
  }

  // moving to a timeline time is a real seek, which belongs to user actions only
  public setTime(value: number): void {
    this.stop();
    this.engine.clock.anchor(value);
  }

  public schedule(time: number): boolean {
    const buffer = this.getBuffer();
    if (!buffer || this.sourceNode) {
      return false;
    }

    const context = this.engine.context;
    if (context.state !== 'running') {
      return false;
    }

    const plan = planLane(
      this.sound,
      time,
      this.engine.clock.speed,
      buffer.duration,
    );
    if (plan.begin >= plan.end) {
      return false;
    }

    const now = context.currentTime;
    const scheduledAt = this.engine.clock.sourceTimeAt(plan.begin);
    const startAt = Math.max(now, scheduledAt);
    const offset = plan.bufferOffset + (startAt - scheduledAt) * plan.rate;
    const duration = (plan.endOffset - offset) / plan.rate;
    if (duration <= 0) {
      return false;
    }

    const node = context.createBufferSource() as PitchPreservingSource;
    node.buffer = buffer;
    node.playbackRate.value = plan.rate;
    node.preservesPitch = !this.pitchShift;
    node.connect(this.gainNode);

    const gain = this.gainNode.gain;
    const amplitude = decibelsToAmplitude(this.sound.gain ?? 0);
    const fade = Math.min(FADE_SECONDS, duration / 2);
    gain.cancelScheduledValues(startAt);
    gain.setValueAtTime(0, startAt);
    gain.linearRampToValueAtTime(amplitude, startAt + fade);
    gain.setValueAtTime(amplitude, startAt + duration - fade);
    gain.linearRampToValueAtTime(0, startAt + duration);

    node.onended = () => {
      node.disconnect();
    };
    node.start(startAt, offset);
    node.stop(startAt + duration);
    this.sourceNode = node;

    return true;
  }

  public stop(): void {
    if (!this.sourceNode) {
      return;
    }

    const context = this.engine.context;
    const now = context.currentTime;
    const gain = this.gainNode.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + FADE_SECONDS);

    const node = this.sourceNode;
    node.stop(now + FADE_SECONDS);
    node.onended = () => {
      node.disconnect();
    };
    this.sourceNode = null;
  }

  public dispose(): void {
    this.stop();
    this.gainNode.disconnect();
    this.sourceNode = null;
    this.error = true;
  }
}
