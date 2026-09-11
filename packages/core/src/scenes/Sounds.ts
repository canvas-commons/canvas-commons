import {ValueDispatcher} from '../events';
import {useScene} from '../utils';
import type {Scene} from './Scene';

/**
 * Where a registered sound came from.
 *
 * @remarks
 * - `media`: embedded audio of a visual media node (e.g. `Video`). Rendered on
 *   the auto-populated media-audio lane, always tied to its source node.
 * - `audio`: a project audio clip authored via the `Audio` node. Rendered on a
 *   user-managed project audio track, movable between tracks in the editor.
 */
export type SoundOrigin = 'media' | 'audio';

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
   * Set by `Video`/`Audio` when they register their audio as a `Sound`. Lets
   * the timeline group/link clips back to the node that produced them, and
   * gives the editor a stable id to persist per-clip track assignments
   * against. Sounds registered directly via `sound()` have no key.
   */
  sourceKey?: string;
  /**
   * Which timeline lane family this sound belongs to.
   *
   * @remarks
   * Distinguishes auto-populated media audio (`media`) from user-editable
   * project audio (`audio`). Sounds registered via `sound()` default to
   * `audio`. Absent on legacy clips, treated as `media` when a `sourceKey` is
   * present (old `Video` behaviour) and `audio` otherwise.
   */
  origin?: SoundOrigin;
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
      origin: settings.origin ?? (settings.sourceKey ? 'media' : 'audio'),
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
    }

    // Drop the sound from the broadcast list too, but by reference rather than
    // rebuilding it from `registeredSounds`. During live playback the scene
    // re-executes frame by frame, so `registeredSounds` is only partially
    // rebuilt at any given moment; rebuilding the broadcast from it would make
    // the timeline lose every clip past the playhead. Removing just this
    // sound keeps the rest of the (recalculated) list intact, which still
    // drops the box for a silent clip whose async audio check just resolved.
    const broadcastIndex = this.sounds.current.indexOf(sound);
    if (broadcastIndex !== -1) {
      const next = [...this.sounds.current];
      next.splice(broadcastIndex, 1);
      this.sounds.current = next;
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
