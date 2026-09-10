import {
  Scene,
  Sound,
  SoundOrigin,
  useLogger,
  useMediaAudioAnalyzer,
  useScene,
} from '@canvas-commons/core';

export interface MediaAudioClipConfig {
  audio: string;
  start: number;
  gain: number;
  playbackRate: number;
  sourceKey: string;
  origin: SoundOrigin;
}

export interface MediaAudioClipHandle {
  clip: Sound;
  scene: Scene;
  token: number;
}

export class MediaAudioClip {
  private handle: MediaAudioClipHandle | null = null;
  private registrationToken = 0;

  public register(config: MediaAudioClipConfig): void {
    const scene = useScene();
    const clip = scene.sounds.add(
      {
        audio: config.audio,
        start: config.start,
        gain: config.gain,
        playbackRate: config.playbackRate,
        sourceKey: config.sourceKey,
        origin: config.origin,
      },
      0,
    );
    const token = ++this.registrationToken;
    this.handle = {clip, scene, token};

    const analyzer = useMediaAudioAnalyzer();
    analyzer
      .hasAudio(config.audio)
      .then(hasAudio => {
        if (!hasAudio) {
          scene.sounds.remove(clip);
          if (this.handle?.clip === clip) {
            this.handle = null;
          }
        }
      })
      .catch(e => {
        useLogger().warn({
          message: `Could not analyze audio for "${config.audio}".`,
          remarks: String(e),
          inspect: config.sourceKey,
        });
      });
  }

  // Timeline placement of the registered clip, or null before it registers.
  public placement(): {
    offset: number;
    start: number;
    playbackRate: number;
  } | null {
    const clip = this.handle?.clip;
    if (!clip) {
      return null;
    }
    return {
      offset: clip.offset,
      start: clip.start ?? 0,
      playbackRate: clip.realPlaybackRate,
    };
  }

  /**
   * Close off the in-progress clip.
   *
   * @param resolveEndTime - Resolves the timeline position to stop the clip at.
   * A clip covering no duration is discarded.
   */
  public finalize(resolveEndTime: () => number): void {
    const handle = this.handle;
    if (!handle) {
      return;
    }
    this.handle = null;
    const endTime = resolveEndTime();
    if (endTime <= (handle.clip.start ?? 0)) {
      handle.scene.sounds.remove(handle.clip);
      return;
    }
    handle.clip.end = endTime;
  }

  /**
   * Drop the reference to the in-progress clip without truncating it, leaving
   * its `end` untouched so it plays/draws to the source's natural end.
   */
  public release(): void {
    this.handle = null;
  }
}
