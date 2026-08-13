import {ValueDispatcher} from '../events';
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
   * The key of the scene node this sound originated from, if any.
   *
   * @remarks
   * Set by e.g. `Video` when it registers its own embedded audio as a
   * `Sound`. Lets UI (the timeline's media-audio track) group/link clips
   * back to the node that produced them, distinguishing them from sounds
   * registered directly via `sound()`.
   */
  sourceKey?: string;
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
      this.settings = {audio};
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
   * Set the amplification of the played sound.
   *
   * @param db - The gain in dB.
   */
  public gain(db: number): this {
    this.settings.gain = db;
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
   * Register a sound to be played back.
   *
   * @remarks
   * Returns the registered {@link Sound} by reference, which callers may
   * mutate afterwards (e.g. to set `end` once a media clip stops playing, or
   * to apply a loudness-normalization gain once it has been measured
   * asynchronously).
   */
  public add(settings: SoundSettings, offset?: number): Sound {
    const playbackTime = this.scene.playback.time + (offset ?? 0);

    const registered: Sound = {
      offset: playbackTime,
      realPlaybackRate:
        Math.pow(2, (settings.detune ?? 0) / 1200) *
        (settings.playbackRate ?? 1),
      ...settings,
    };
    this.registeredSounds.push(registered);
    return registered;
  }

  /**
   * Unregister a previously added sound.
   *
   * @remarks
   * Used to discard a sound that turned out not to be playable (e.g. a media
   * clip whose source has no audio track).
   */
  public remove(sound: Sound) {
    const index = this.registeredSounds.indexOf(sound);
    if (index !== -1) {
      this.registeredSounds.splice(index, 1);
      this.sounds.current = [...this.registeredSounds];
    }
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
