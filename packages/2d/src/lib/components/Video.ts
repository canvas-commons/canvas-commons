import {
  BBox,
  DependencyContext,
  PlaybackState,
  SerializedVector2,
  SignalValue,
  SimpleSignal,
  clamp,
  isReactive,
  useFrameSourceRegistry,
  useLogger,
  useThread,
  type CachedFrame,
  type FrameSource,
} from '@canvas-commons/core';
import {computed, initial, nodeName, signal} from '../decorators';
import {DesiredLength} from '../partials';
import {drawImage} from '../utils';
import {resolveAssetUrl} from '../utils/assetUrl';
import {Rect, RectProps} from './Rect';
import reactivePlaybackRate from './__logs__/reactive-playback-rate';

const DRIFT_SECONDS: number = 0.2;

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
}

/**
 * Draws a video.
 *
 * @remarks
 * Live playback draws the media element, which the browser decodes on the GPU
 * for free. Still frames, scrubbing and export draw frames decoded through the
 * shared frame cache, because seeking a media element costs hundreds of
 * milliseconds per frame.
 */
@nodeName('Video')
export class Video extends Rect {
  private static readonly pool: Record<string, HTMLVideoElement> = {};
  private static readonly maxPoolSize = 4;

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

  @initial(0)
  @signal()
  declare protected readonly time: SimpleSignal<number, this>;

  @initial(false)
  @signal()
  declare protected readonly playing: SimpleSignal<boolean, this>;

  private lastTime = -1;
  private missTime = -1;

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

  /**
   * Whether the timeline is moving, so the media element plays by itself.
   */
  protected isLive(): boolean {
    const state = this.view().playbackState();
    return (
      state === PlaybackState.Playing || state === PlaybackState.Presenting
    );
  }

  /**
   * The source that decodes stills for this video.
   *
   * @remarks
   * Not cached: the registry bounds the number of live sources, so a node has
   * to adopt a new source after its previous one was evicted.
   */
  protected frameSource(): FrameSource {
    const {src} = resolveAssetUrl(this.src(), this.view().assetHash);
    return useFrameSourceRegistry().get(src);
  }

  /**
   * The decoded frame at the current time, or null when it is not cached yet.
   *
   * @remarks
   * Not cached: the cache changes behind the scenes as decodes complete.
   */
  protected frame(): CachedFrame | null {
    return this.frameSource().peek(this.clampTime(this.time()));
  }

  /**
   * The media element that plays this video.
   *
   * @remarks
   * Not cached: pooling can release the element of a node that is far from the
   * playhead, and the node then needs a new one.
   */
  protected video(): HTMLVideoElement {
    const {key, src} = resolveAssetUrl(this.src(), this.view().assetHash);

    const poolKey = `${this.key}/${key}`;
    let video = Video.pool[poolKey];
    if (!video) {
      video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.src = src;
      Video.pool[poolKey] = video;
      Video.limitPool(poolKey);
    }

    return video;
  }

  /**
   * Wait until the media element can present a frame.
   */
  protected awaitVideo(): HTMLVideoElement {
    const video = this.video();
    if (video.readyState >= 2) {
      return video;
    }

    DependencyContext.collectPromise(
      new Promise<void>(resolve => {
        const listener = () => {
          resolve();
          video.removeEventListener('canplay', listener);
        };
        video.addEventListener('canplay', listener);
      }),
    );

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
    } else if (!video.paused) {
      video.pause();
    }

    // an element that is still seeking cannot take another seek without
    // stalling every frame that follows
    if (!video.seeking && Math.abs(video.currentTime - time) > DRIFT_SECONDS) {
      this.setCurrentTime(time);
    } else if (!playing) {
      video.currentTime = time;
    }

    return video;
  }

  /**
   * Move the element to the timestamp without waiting for it, so that playback
   * continues from the right place.
   */
  protected syncElement(video: HTMLVideoElement, time: number): void {
    if (video.readyState < 1 || video.seeking) {
      return;
    }

    if (Math.abs(video.currentTime - time) <= DRIFT_SECONDS) {
      return;
    }

    video.currentTime = time;
    this.lastTime = time;
  }

  /**
   * The image to draw for the current time.
   *
   * @remarks
   * Live playback draws the element, which the browser keeps decoding anyway
   * and must never wait on. A still is decoded from the frame cache because a
   * media element seek takes hundreds of milliseconds.
   */
  protected drawSource(): CanvasImageSource {
    const video = this.video();

    if (this.isLive()) {
      return this.fastSeekedVideo();
    }

    const time = this.clampTime(this.time());
    const frame = this.frame();
    if (frame) {
      this.syncElement(video, time);
      return frame.image;
    }

    // the render loop awaits collected promises and draws again, so the still
    // replaces the last presented frame as soon as the decoder is done
    this.requestFrame(time);
    this.syncElement(video, time);
    return video;
  }

  /**
   * Ask the frame cache for the frame at the timestamp, unless that timestamp
   * already proved to be undecodable.
   */
  protected requestFrame(time: number): void {
    if (this.missTime === time) {
      return;
    }

    DependencyContext.collectPromise(
      this.frameSource()
        .request(time)
        .then(frame => {
          this.missTime = frame ? -1 : time;
          return frame;
        }),
    );
  }

  protected override draw(context: CanvasRenderingContext2D) {
    this.drawShape(context);
    const alpha = this.alpha();
    if (alpha > 0) {
      const source = this.drawSource();

      const box = BBox.fromSizeCentered(this.computedSize());
      context.save();
      context.clip(this.getPath());
      if (alpha < 1) {
        context.globalAlpha *= alpha;
      }
      context.imageSmoothingEnabled = this.smoothing();
      drawImage(context, source, box);
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
    if (video.seeking && !this.playing()) {
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
  }

  public pause() {
    this.playing(false);
    this.time.save();
    this.video().pause();
  }

  public seek(time: number) {
    const playing = this.playing();
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

  protected override collectAsyncResources() {
    super.collectAsyncResources();
    this.awaitVideo();

    if (this.isLive()) {
      return;
    }

    const time = this.clampTime(this.time());
    // waiting on a frame that is already cached would keep the collection loop
    // spinning without ever producing new work
    if (!this.frameSource().isCached(time)) {
      this.requestFrame(time);
    }
  }

  private static limitPool(keep: string): void {
    let excess = Object.keys(Video.pool).length - Video.maxPoolSize;
    for (const key of Object.keys(Video.pool)) {
      if (excess <= 0) return;
      if (key === keep) continue;
      Video.releasePoolEntry(key);
      excess -= 1;
    }
  }

  private static releasePoolEntry(key: string): void {
    const video = Video.pool[key];
    if (!video) return;
    delete Video.pool[key];
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}
