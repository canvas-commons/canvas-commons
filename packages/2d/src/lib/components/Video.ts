import {
  BBox,
  DependencyContext,
  PlaybackState,
  SerializedVector2,
  SignalValue,
  SimpleSignal,
  clamp,
  gainToDb,
  isReactive,
  useLogger,
  useThread,
  viaProxy,
} from '@canvas-commons/core';
import {computed, initial, nodeName, signal} from '../decorators';
import {DesiredLength} from '../partials';
import {drawImage} from '../utils';
import reactivePlaybackRate from './__logs__/reactive-playback-rate';
import {MediaAudioClip} from './mediaAudioClip';
import {Rect, RectProps} from './Rect';

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
}

@nodeName('Video')
export class Video extends Rect {
  private static readonly pool: Record<string, HTMLVideoElement> = {};
  // Resolved durations keyed by source. Once a source's metadata has loaded,
  // its duration is remembered so later recalculations (which recreate the
  // element or race against not-yet-ready metadata) never collapse back to 0.
  private static readonly durationCache: Map<string, number> = new Map();

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

  @initial(0)
  @signal()
  declare protected readonly time: SimpleSignal<number, this>;

  @initial(false)
  @signal()
  declare protected readonly playing: SimpleSignal<boolean, this>;

  private lastTime = -1;
  private readonly audio = new MediaAudioClip();

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
    const src = this.src();
    // Reading the duration only needs metadata, not full playback readiness.
    // Access the pooled element directly instead of through `video()`, which
    // would register a `canplay` dependency and make the recalculation wait for
    // the whole clip to buffer before the duration could ever settle.
    const video = this.metadataElement();
    // `duration` is only known once the element has loaded its metadata
    // (readyState >= HAVE_METADATA). Reading it earlier yields NaN, which -
    // passed on to e.g. `waitFor` - would corrupt the scene's computed
    // duration. Register a metadata-ready promise so the recalculation retries
    // once the value is known, and report 0 in the meantime rather than NaN.
    if (video.readyState < 1 || !isFinite(video.duration)) {
      // A previously resolved duration for the same source survives element
      // recreation and readiness races: reuse it so a scene with several
      // sequential videos doesn't collapse the ones whose element happens not
      // to be ready on a given recalculation pass.
      const cached = Video.durationCache.get(src);
      if (cached !== undefined) {
        return cached;
      }
      DependencyContext.collectPromise(
        new Promise<void>(resolve => {
          const listener = () => {
            // Record the resolved duration as soon as metadata arrives. Large
            // offscreen videos may have their readiness reset by the browser
            // between recalculation passes; caching here ensures the value
            // survives so the scene duration doesn't collapse to the clips that
            // happen to still be ready on the final pass.
            if (isFinite(video.duration)) {
              Video.durationCache.set(src, video.duration);
            }
            resolve();
            video.removeEventListener('loadedmetadata', listener);
            video.removeEventListener('durationchange', listener);
          };
          video.addEventListener('loadedmetadata', listener);
          video.addEventListener('durationchange', listener);
        }),
      );
      return 0;
    }
    Video.durationCache.set(src, video.duration);
    return video.duration;
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

  // Resolve the raw src into a same-origin, cache-busted url and a pool key.
  // Remote sources are routed through the cors proxy so the canvas is not
  // CORS-tainted, which would make `getImageData` throw ("operation is
  // insecure") when the renderer reads frames for export.
  private resolveSource(): {src: string; poolKey: string} {
    const rawSrc = this.src();
    if (!rawSrc) {
      return {src: '', poolKey: `${this.key}/`};
    }
    const proxied = viaProxy(rawSrc);
    const url = new URL(proxied, window.location.origin);
    if (url.origin === window.location.origin) {
      url.searchParams.set('asset-hash', this.view().assetHash());
    }
    return {src: url.toString(), poolKey: `${this.key}/${proxied}`};
  }

  private metadataElement(): HTMLVideoElement {
    const {src, poolKey} = this.resolveSource();
    let video = Video.pool[poolKey];
    if (!video) {
      video = document.createElement('video');
      // Ensure the browser fetches metadata eagerly instead of deferring it,
      // so a duration read during recalculation settles promptly.
      video.preload = 'auto';
      video.volume = 0;
      video.muted = true;
      video.crossOrigin = 'anonymous';
      video.src = src;
      Video.pool[poolKey] = video;
    }
    return video;
  }

  @computed()
  protected video(): HTMLVideoElement {
    const video = this.metadataElement();

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

    // While playing, let the native element free-run so it keeps delivering
    // fully decoded frames. Seeking it every frame would leave it perpetually
    // in a `seeking` state, so `drawImage` would sample blank frames and the
    // video would blink. Only correct when it drifts far from the animation
    // clock.
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
    // The duration is NaN until the element reports metadata (and after the
    // pooled element is torn down). Looping would then take the modulo against
    // NaN, poisoning `time` - and anything derived from it, such as a media
    // clip's `end` - with NaN. Skip clamping until a real duration is known.
    if (!isFinite(duration)) {
      return Math.max(0, time);
    }
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
    const rawTime = DependencyContext.collectingPromisesSuppressed(() =>
      this.time(),
    );
    // A looping video's `time` signal resolves through `clampTime`, which takes
    // the modulo against the element's duration. When that duration is not yet
    // known (e.g. the pooled element was torn down or never became ready) the
    // modulo yields NaN, which would otherwise be stored as the clip's `end`
    // and break its waveform. Fall back to the last resolved time in that case.
    const time = isFinite(rawTime) ? rawTime : Math.max(0, this.lastTime);
    const duration = Video.pool[this.resolveSource().poolKey]?.duration;
    if (!duration || !isFinite(duration)) {
      return Math.max(0, time);
    }
    return clamp(0, duration, this.loop() ? time % duration : time);
  }

  // A muted clip (volume 0) produces no audio, so skip registering it
  // entirely. This also avoids a -Infinity dB gain, which JSON-serializes to
  // null on its way to the export server.
  private isAudible(): boolean {
    return this.volume() > 0;
  }

  private registerAudioClip(startTime: number) {
    this.finalizeAudioClip();
    if (!this.isAudible()) {
      return;
    }
    this.audio.register({
      audio: this.src(),
      start: startTime,
      gain: gainToDb(this.volume()),
      playbackRate: this.playbackRate(),
      sourceKey: this.key,
      origin: 'media',
    });
  }

  /**
   * Close off the in-progress audio clip (if any) at the video's current
   * time, or discard it if it ended up covering no duration.
   */
  private finalizeAudioClip() {
    this.audio.finalize(() => this.currentTimeSafely());
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
