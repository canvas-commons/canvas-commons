import {
  BBox,
  DependencyContext,
  PlaybackState,
  Scene,
  SerializedVector2,
  SignalValue,
  SimpleSignal,
  Sound,
  clamp,
  gainToDb,
  isReactive,
  trackPendingAudioAdjustment,
  useLogger,
  useMediaAudioAnalyzer,
  useScene,
  useThread,
} from '@canvas-commons/core';
import {computed, initial, nodeName, signal} from '../decorators';
import {DesiredLength} from '../partials';
import {drawImage} from '../utils';
import {Rect, RectProps} from './Rect';
import reactivePlaybackRate from './__logs__/reactive-playback-rate';

export interface VideoProps extends RectProps {
  /**
   * {@inheritDoc Video.src}
   */
  src?: SignalValue<string>;
  /**
   * {@inheritDoc Video.alpha}
   */
  alpha?: SignalValue<number>;
  /**
   * {@inheritDoc Video.smoothing}
   */
  smoothing?: SignalValue<boolean>;
  /**
   * {@inheritDoc Video.loop}
   */
  loop?: SignalValue<boolean>;
  /**
   * {@inheritDoc Video.playbackRate}
   */
  playbackRate?: number;
  /**
   * The starting time for this video in seconds.
   */
  time?: SignalValue<number>;
  play?: boolean;
  /**
   * {@inheritDoc Video.volume}
   */
  volume?: SignalValue<number>;
  /**
   * {@inheritDoc Video.normalize}
   */
  normalize?: SignalValue<number | false>;
  /**
   * {@inheritDoc Video.levelTo}
   */
  levelTo?: SignalValue<number | false>;
}

@nodeName('Video')
export class Video extends Rect {
  private static readonly pool: Record<string, HTMLVideoElement> = {};

  /**
   * The source of this video.
   *
   * @example
   * Using a local video:
   * ```tsx
   * import video from './example.mp4';
   * // ...
   * view.add(<Video src={video} />)
   * ```
   * Loading an image from the internet:
   * ```tsx
   * view.add(<Video src="https://example.com/video.mp4" />)
   * ```
   */
  @signal()
  declare public readonly src: SimpleSignal<string, this>;

  /**
   * The alpha value of this video.
   *
   * @remarks
   * Unlike opacity, the alpha value affects only the video itself, leaving the
   * fill, stroke, and children intact.
   */
  @initial(1)
  @signal()
  declare public readonly alpha: SimpleSignal<number, this>;

  /**
   * Whether the video should be smoothed.
   *
   * @remarks
   * When disabled, the video will be scaled using the nearest neighbor
   * interpolation with no smoothing. The resulting video will appear pixelated.
   *
   * @defaultValue true
   */
  @initial(true)
  @signal()
  declare public readonly smoothing: SimpleSignal<boolean, this>;

  /**
   * Whether this video should loop upon reaching the end.
   */
  @initial(false)
  @signal()
  declare public readonly loop: SimpleSignal<boolean, this>;

  /**
   * The rate at which the video plays, as multiples of the normal speed.
   *
   * @defaultValue 1
   */
  @initial(1)
  @signal()
  declare public readonly playbackRate: SimpleSignal<number, this>;

  /**
   * The volume of this video's own embedded audio.
   *
   * @remarks
   * `1` plays the source audio unmodified. Applies during both live preview
   * and export.
   *
   * @defaultValue 1
   */
  @initial(1)
  @signal()
  declare public readonly volume: SimpleSignal<number, this>;

  /**
   * Normalize this video's audio to a target LUFS, flattening the whole
   * clip's average loudness to that target.
   *
   * @remarks
   * Overrides {@link volume}. Set to `false` to disable. Measured once per
   * source and cached; see {@link levelTo} to preserve loud/quiet dynamics
   * instead of flattening them.
   *
   * @defaultValue false
   */
  @initial(false)
  @signal()
  declare public readonly normalize: SimpleSignal<number | false, this>;

  /**
   * Level this video's audio to a target LUFS using a "loud part" reference
   * instead of the whole clip's average, preserving relative dynamics
   * between quiet and loud sections.
   *
   * @remarks
   * Overrides {@link volume} and {@link normalize}. Set to `false` to
   * disable. Measured once per source and cached.
   *
   * @defaultValue false
   */
  @initial(false)
  @signal()
  declare public readonly levelTo: SimpleSignal<number | false, this>;

  @initial(0)
  @signal()
  declare protected readonly time: SimpleSignal<number, this>;

  @initial(false)
  @signal()
  declare protected readonly playing: SimpleSignal<boolean, this>;

  private lastTime = -1;
  private audioClip: Sound | null = null;
  private audioScene: Scene | null = null;
  private audioMeasurementToken = 0;

  public constructor({play, ...props}: VideoProps) {
    super(props);
    if (play) {
      this.play();
    }
  }

  /**
   * {@inheritDoc Curve.completion}
   */
  public curveCompletion(): number {
    return super.completion();
  }

  public isPlaying(): boolean {
    return this.playing();
  }

  public getCurrentTime(): number {
    return this.clampTime(this.time());
  }

  public getDuration(): number {
    return this.video().duration;
  }

  protected override desiredSize(): SerializedVector2<DesiredLength> {
    const custom = super.desiredSize();
    if (custom.x === null && custom.y === null) {
      const image = this.video();
      return {
        x: image.videoWidth,
        y: image.videoHeight,
      };
    }

    return custom;
  }

  /**
   * The completion of this video in the range from 0 to 1.
   *
   * @remarks
   * To get the percentage of the stroke that's currently visible, use
   * {@link Video.curveCompletion} instead.
   */
  @computed()
  public override completion(): number {
    return this.clampTime(this.time()) / this.video().duration;
  }

  @computed()
  protected video(): HTMLVideoElement {
    const src = this.src();
    const key = `${this.key}/${src}`;
    let video = Video.pool[key];
    if (!video) {
      video = document.createElement('video');
      video.src = src;
      video.volume = 0;
      Video.pool[key] = video;
    }

    if (video.readyState < 2) {
      DependencyContext.collectPromise(
        new Promise<void>(resolve => {
          const listener = () => {
            resolve();
            video.removeEventListener('canplay', listener);
          };
          video.addEventListener('canplay', listener);
        }),
      );
    }

    return video;
  }

  @computed()
  protected seekedVideo(): HTMLVideoElement {
    const video = this.video();
    const time = this.clampTime(this.time());

    video.playbackRate = this.playbackRate();

    if (!video.paused) {
      video.pause();
    }

    if (this.lastTime === time) {
      return video;
    }

    this.setCurrentTime(time);

    return video;
  }

  @computed()
  protected fastSeekedVideo(): HTMLVideoElement {
    const video = this.video();
    const time = this.clampTime(this.time());

    video.playbackRate = this.playbackRate();

    if (this.lastTime === time) {
      return video;
    }

    const playing =
      this.playing() && time < video.duration && video.playbackRate > 0;
    if (playing) {
      if (video.paused) {
        DependencyContext.collectPromise(video.play());
      }
    } else {
      if (!video.paused) {
        video.pause();
      }
    }

    if (Math.abs(video.currentTime - time) > 0.2) {
      this.setCurrentTime(time);
    } else if (!playing) {
      video.currentTime = time;
    }

    return video;
  }

  protected override draw(context: CanvasRenderingContext2D) {
    this.drawShape(context);
    const alpha = this.alpha();
    if (alpha > 0) {
      const playbackState = this.view().playbackState();
      const video =
        playbackState === PlaybackState.Playing ||
        playbackState === PlaybackState.Presenting
          ? this.fastSeekedVideo()
          : this.seekedVideo();

      const box = BBox.fromSizeCentered(this.computedSize());
      context.save();
      context.clip(this.getPath());
      if (alpha < 1) {
        context.globalAlpha *= alpha;
      }
      context.imageSmoothingEnabled = this.smoothing();
      drawImage(context, video, box);
      context.restore();
    }

    if (this.clip()) {
      context.clip(this.getPath());
    }

    this.drawChildren(context);
  }

  protected override applyFlex() {
    super.applyFlex();
    const video = this.video();
    const ratio = this.ratio() ?? video.videoWidth / video.videoHeight;
    this.yogaNode.setAspectRatio(ratio);
  }

  protected setCurrentTime(value: number) {
    const video = this.video();
    if (video.readyState < 2) return;

    video.currentTime = value;
    this.lastTime = value;
    if (video.seeking) {
      DependencyContext.collectPromise(
        new Promise<void>(resolve => {
          const listener = () => {
            resolve();
            video.removeEventListener('seeked', listener);
          };
          video.addEventListener('seeked', listener);
        }),
      );
    }
  }

  protected setPlaybackRate(playbackRate: number) {
    let value: number;
    if (isReactive(playbackRate)) {
      value = playbackRate();
      useLogger().warn({
        message: 'Invalid value set as the playback rate',
        remarks: reactivePlaybackRate,
        inspect: this.key,
        stack: new Error().stack,
      });
    } else {
      value = playbackRate;
    }
    this.playbackRate.context.setter(value);

    if (this.playing()) {
      if (value === 0) {
        this.pause();
      } else {
        const time = useThread().time;
        const start = time();
        const offset = this.time();
        this.time(() => this.clampTime(offset + (time() - start) * value));
      }
    }
  }

  public play() {
    const time = useThread().time;
    const start = time();
    const offset = this.time();
    const playbackRate = this.playbackRate();
    this.playing(true);
    this.time(() => this.clampTime(offset + (time() - start) * playbackRate));
    this.registerAudioClip(offset);
  }

  public pause() {
    this.playing(false);
    this.time.save();
    this.video().pause();
    this.finalizeAudioClip();
  }

  public seek(time: number) {
    const playing = this.playing();
    this.finalizeAudioClip();
    this.time(this.clampTime(time));
    if (playing) {
      this.play();
    } else {
      this.pause();
    }
  }

  public clampTime(time: number): number {
    const duration = this.video().duration;
    if (this.loop()) {
      time %= duration;
    }
    return clamp(0, duration, time);
  }

  /**
   * Resolve the current playback time from teardown paths without reporting
   * unresolved async properties.
   *
   * @remarks
   * After {@link play}, the `time` signal holds a reactive function that calls
   * {@link clampTime} - and therefore {@link video} - when read. During
   * disposal the node is no longer ready, so evaluating it would register a
   * pending promise and log "accessed an asynchronous property before the node
   * was ready". Suppressing promise collection lets us read the last resolved
   * time and clamp it against the pooled element's duration instead.
   */
  private currentTimeSafely(): number {
    const time = DependencyContext.collectingPromisesSuppressed(() =>
      this.time(),
    );
    const duration = Video.pool[`${this.key}/${this.src()}`]?.duration;
    if (!duration || !isFinite(duration)) {
      return Math.max(0, time);
    }
    return clamp(0, duration, this.loop() ? time % duration : time);
  }

  private registerAudioClip(startTime: number) {
    this.finalizeAudioClip();

    const src = this.src();
    const playbackRate = this.playbackRate();
    const scene = useScene();
    const clip = scene.sounds.add(
      {
        audio: src,
        start: startTime,
        gain: gainToDb(this.volume()),
        playbackRate,
        sourceKey: this.key,
      },
      0,
    );
    this.audioClip = clip;
    this.audioScene = scene;

    const analyzer = useMediaAudioAnalyzer();
    const token = ++this.audioMeasurementToken;

    const normalize = this.normalize();
    const levelTo = this.levelTo();
    const target = levelTo !== false ? levelTo : normalize;
    const mode = levelTo !== false ? 'loudPart' : 'integrated';

    const adjustment = analyzer
      .hasAudio(src)
      .then(async hasAudio => {
        // A video without an audible audio track should not register a
        // media-audio clip - doing so leaves an empty waveform in the
        // timeline's media-audio lane. Removing by clip reference is safe
        // even after the clip was finalized (e.g. the video paused before
        // this resolved), and never touches a newer clip. The scene is
        // captured synchronously since `useScene()` is unavailable here.
        if (!hasAudio) {
          scene.sounds.remove(clip);
          if (this.audioClip === clip) {
            this.audioClip = null;
            this.audioScene = null;
          }
          return;
        }

        if (target === false) {
          return;
        }

        const gainDb = await analyzer.computeNormalizeGain(src, target, mode);
        if (this.audioClip === clip && this.audioMeasurementToken === token) {
          clip.gain = gainDb;
        }
      })
      .catch(e => {
        useLogger().warn({
          message: `Could not analyze audio for "${src}".`,
          remarks: String(e),
          inspect: this.key,
        });
      });
    trackPendingAudioAdjustment(adjustment);
  }

  /**
   * Close off the in-progress audio clip (if any) at the video's current
   * time, or discard it if it ended up covering no duration.
   */
  private finalizeAudioClip() {
    this.audioMeasurementToken++;
    const clip = this.audioClip;
    const scene = this.audioScene;
    if (!clip || !scene) {
      return;
    }
    this.audioClip = null;
    this.audioScene = null;

    const endTime = this.currentTimeSafely();
    if (endTime <= (clip.start ?? 0)) {
      scene.sounds.remove(clip);
      return;
    }
    clip.end = endTime;
  }

  protected override collectAsyncResources() {
    super.collectAsyncResources();
    this.seekedVideo();
  }

  public override dispose() {
    this.finalizeAudioClip();
    super.dispose();
  }
}
