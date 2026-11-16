import {ValueDispatcher} from '../events';
import {SILENCE_DB, type GainKeyframe} from '../media/gain_envelope';
import {useScene} from '../utils';
import type {Scene} from './Scene';

export interface SoundSettings {
  audio: string;
  start?: number;
  end?: number;
  gain?: number;
  detune?: number;
  playbackRate?: number;
  /**
   * Whether the sound is played by a node's media element.
   *
   * @remarks
   * Element sounds are skipped by the audio pool, so the node that owns the
   * media element stays the live source, while the export decodes the file and
   * mixes the registered window.
   */
  element?: boolean;
  /**
   * Level changes applied over the window.
   */
  envelope: GainKeyframe[];
}

export interface Sound extends SoundSettings {
  offset: number;
  realPlaybackRate: number;
}

export class SoundBuilder {
  private settings: SoundSettings;

  /**
   * {@inheritDoc sound}
   */
  public constructor(audio: string | SoundBuilder) {
    if (audio instanceof SoundBuilder) {
      this.settings = {...audio.settings};
    } else {
      this.settings = {audio, envelope: []};
    }
  }

  /**
   * Trim the audio file to a specific portion of it.
   *
   * @param start - The offset in seconds to play from.
   * @param end - The offset in seconds to play to.
   */
  public trim(start?: number, end?: number): this {
    this.settings.start = start;
    this.settings.end = end;
    return this;
  }

  /**
   * Set the amplification of the played sound, or ramp to it from the frame the
   * call happens on.
   *
   * @param db - The gain in dB.
   * @param seconds - The length of the transition. Without it the level applies
   * for the whole window.
   */
  public gain(db: number, seconds?: number): this {
    this.settings.gain = db;
    if (seconds !== undefined) {
      this.keyframe(db, seconds, false);
    }
    return this;
  }

  /**
   * Switch to a level at the frame the call happens on.
   *
   * @param db - The gain in dB.
   */
  public hold(db: number): this {
    this.keyframe(db, 0, false);
    return this;
  }

  /**
   * Ramp from silence to the level over the seconds that follow the call.
   *
   * @param seconds - The length of the transition.
   */
  public fadeIn(seconds: number): this {
    this.keyframe(this.settings.gain ?? 0, seconds, false, SILENCE_DB);
    return this;
  }

  /**
   * Ramp to silence over the seconds that lead up to the call, so the level is
   * already zero at the frame the call happens on.
   *
   * @param seconds - The length of the transition.
   */
  public fadeOut(seconds: number): this {
    this.keyframe(SILENCE_DB, seconds, true);
    return this;
  }

  /**
   * Pitch shift the played sound.
   *
   * @remarks
   * This also affects the duration of the sound.
   *
   * @param cents - The pitch shift in cents.
   */
  public detune(cents: number): this {
    this.settings.detune = cents;
    return this;
  }

  /**
   * Change the playback rate of the sound.
   *
   * @remarks
   * This also affects the perceived pitch of the sound.
   *
   * @param rate - The new playback rate. Must be greater than 0.
   */
  public playbackRate(rate: number): this {
    this.settings.playbackRate = rate > 0 ? rate : 1;
    return this;
  }

  private keyframe(
    gain: number,
    seconds: number,
    backwards: boolean,
    from?: number,
  ): void {
    this.settings.envelope.push({
      at: useScene().playback.time,
      gain,
      seconds,
      backwards,
      from,
    });
  }

  /**
   * Play the configured sound at the current frame.
   *
   * @param offset - An offset in seconds from the current frame. Defaults to 0.
   */
  public play(offset?: number): Sound {
    return useScene().sounds.add(this.settings, offset);
  }
}

/**
 * Begin configuring a sound to be played back.
 */
export function sound(audio: string | SoundBuilder) {
  return new SoundBuilder(audio);
}

export class Sounds {
  public get onChanged() {
    return this.sounds.subscribable;
  }
  private readonly sounds = new ValueDispatcher<Sound[]>([]);
  private registeredSounds: Sound[] = [];

  public constructor(private readonly scene: Scene) {
    this.scene.onReset.subscribe(this.reset);
    this.scene.onReloaded.subscribe(this.reset);
    this.scene.onRecalculated.subscribe(this.handleRecalculated);
  }

  /**
   * Register a sound at the given offset from the current playback time.
   *
   * @returns The registered sound, so the owner can keep adjusting it, such as
   * closing its window when the owning node is disposed.
   */
  public add(settings: SoundSettings, offset?: number): Sound {
    const playbackTime = this.scene.playback.time + (offset ?? 0);

    const sound: Sound = {
      offset: playbackTime,
      realPlaybackRate:
        Math.pow(2, (settings.detune ?? 0) / 1200) *
        (settings.playbackRate ?? 1),
      ...settings,
      envelope: [...settings.envelope],
    };

    this.registeredSounds.push(sound);
    return sound;
  }

  public getSounds(): readonly Sound[] {
    return this.registeredSounds;
  }

  private handleRecalculated = () => {
    this.sounds.current = [...this.registeredSounds];
  };

  private reset = () => {
    this.registeredSounds = [];
  };
}
