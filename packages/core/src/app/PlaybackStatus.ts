import {PlaybackManager, PlaybackState} from './PlaybackManager';

/**
 * A read-only representation of the playback.
 */
export class PlaybackStatus {
  public constructor(private readonly playback: PlaybackManager) {}

  /**
   * Convert seconds to frames using the current framerate.
   *
   * @param seconds - The seconds to convert.
   */
  public secondsToFrames(seconds: number) {
    return Math.ceil(seconds * this.playback.fps);
  }

  /**
   * Convert frames to seconds using the current framerate.
   *
   * @param frames - The frames to convert.
   */
  public framesToSeconds(frames: number) {
    return frames / this.playback.fps;
  }

  public get time(): number {
    return this.framesToSeconds(this.playback.frame);
  }

  public get frame(): number {
    return this.playback.frame;
  }

  public get speed(): number {
    return this.playback.speed;
  }

  public get fps(): number {
    return this.playback.fps;
  }

  public get state(): PlaybackState {
    return this.playback.state;
  }

  /**
   * Whether the audio played by the scenes is audible.
   */
  public get muted(): boolean {
    return this.playback.muted;
  }

  /**
   * The audio level, in the range from 0 to 1.
   */
  public get volume(): number {
    return this.playback.volume;
  }

  /**
   * The time passed since the last frame in seconds.
   */
  public get deltaTime(): number {
    return this.framesToSeconds(1) * this.speed;
  }
}
