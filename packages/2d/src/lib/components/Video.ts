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
const LIVE_DRIFT_SECONDS: number = 0.4;
const STALE_SECONDS: number = 0.15;
const LOOKBACK_SECONDS: number = 1;

function sourceSize(source: CanvasImageSource): {x: number; y: number} {
  if (source instanceof HTMLVideoElement) {
    return {x: source.videoWidth, y: source.videoHeight};
  }

  const sized = source as {width?: number; height?: number};
  return {x: sized.width ?? 0, y: sized.height ?? 0};
}

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
  private lastFrame: CachedFrame | null = null;
  private snapshot: HTMLCanvasElement | null = null;

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
      // the element starts loading at the requested time, which avoids a seek
      // (and the blank frames it causes) once the node becomes visible
      const start = this.time();
      if (Number.isFinite(start) && start > 0) {
        video.currentTime = start;
      }
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

    // seeking stalls the element for hundreds of milliseconds, so live playback
    // only corrects a large drift and never interrupts a running seek
    if (
      !video.seeking &&
      !video.paused &&
      Math.abs(video.currentTime - time) > LIVE_DRIFT_SECONDS
    ) {
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
    const source = this.isLive()
      ? this.liveSource(video)
      : this.stillTarget(video);

    if (source !== this.snapshot && this.isDrawable(source, video)) {
      this.capture(source);
    }

    return source;
  }

  /**
   * Whether the source really paints pixels, so an empty element never becomes
   * the frame that is kept on screen.
   */
  protected isDrawable(
    source: CanvasImageSource,
    video: HTMLVideoElement,
  ): boolean {
    if (source === video) {
      return this.canPresent(video);
    }

    const sized = source as {width?: number; height?: number};
    return (sized.width ?? 0) > 1 && (sized.height ?? 0) > 1;
  }

  /**
   * The frame a playing element shows, or the last one it showed.
   */
  protected liveSource(video: HTMLVideoElement): CanvasImageSource {
    this.fastSeekedVideo();

    const time = this.clampTime(this.time());
    // an element that reports a ready state can still be one that only just
    // started and paints nothing, so a lagging element is not trusted either
    if (
      this.canPresent(video) &&
      Math.abs(video.currentTime - time) <= STALE_SECONDS
    ) {
      return video;
    }

    const still = this.stillSource(video, time);
    if (still === video) {
      // nothing has reached the screen yet, which only happens on a shot's
      // first frames: wait for that frame instead of presenting an empty video
      this.requestFrame(time);
    }

    return still;
  }

  /**
   * The frame for a timeline that stands still.
   */
  protected stillTarget(video: HTMLVideoElement): CanvasImageSource {
    const time = this.clampTime(this.time());
    this.syncElement(video, time);

    const frame = this.frame();
    if (frame) {
      this.lastFrame = frame;
      return frame.image;
    }

    // the render loop awaits collected promises and draws again, so the still
    // replaces the last presented frame as soon as the decoder is done
    this.requestFrame(time);
    if (this.canPresent(video)) {
      return video;
    }

    return this.stillSource(video, time);
  }

  /**
   * Whether the element currently has a frame to draw.
   *
   * @remarks
   * An element that finished loading but never presented a frame reports a ready
   * state and still draws nothing, so the presented frame count decides.
   */
  protected canPresent(video: HTMLVideoElement): boolean {
    if (video.readyState < 2 || video.seeking) {
      return false;
    }

    const presented = video.getVideoPlaybackQuality?.().totalVideoFrames ?? 1;
    return presented > 0;
  }

  /**
   * The best frame to show when the element cannot present one.
   *
   * @remarks
   * Playback never asks for a decode here: playback timestamps are arbitrary
   * and decoding them all would starve the element that does the real work.
   * The snapshot is the last frame that reached the screen, so the video never
   * blinks out while the element loads, seeks, or stalls.
   */
  protected stillSource(
    video: HTMLVideoElement,
    time: number,
  ): CanvasImageSource {
    const source = this.frameSource();
    const cached = this.frame();
    if (cached) {
      this.lastFrame = cached;
      return cached.image;
    }

    if (this.snapshot) {
      return this.snapshot;
    }

    const lookback = source.lookback(time);
    if (lookback && time - lookback.seconds <= LOOKBACK_SECONDS) {
      this.lastFrame = lookback;
      return lookback.image;
    }

    // evicted frames are closed, which shows up as a zero sized bitmap
    const held = this.lastFrame;
    if (held && held.image.width > 0) {
      return held.image;
    }

    return video;
  }

  /**
   * Remember the frame that is on screen, so a gap in the element does not blank
   * the video.
   */
  protected capture(source: CanvasImageSource): void {
    const size = sourceSize(source);
    if (size.x <= 1 || size.y <= 1) {
      return;
    }

    let snapshot = this.snapshot;
    if (!snapshot) {
      snapshot = document.createElement('canvas');
      this.snapshot = snapshot;
    }

    if (snapshot.width !== size.x || snapshot.height !== size.y) {
      snapshot.width = size.x;
      snapshot.height = size.y;
    }

    snapshot.getContext('2d')?.drawImage(source, 0, 0, size.x, size.y);
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

    const time = this.clampTime(this.time());
    if (this.isLive()) {
      this.syncElement(this.video(), time);
    }

    // a shot that is about to play gets its first frame decoded, so the video
    // has something to show before the element presents anything
    if (!this.frameSource().isCached(time)) {
      this.requestFrame(time);
    }
  }

  private static limitPool(keep: string): void {
    let excess = Object.keys(Video.pool).length - Video.maxPoolSize;
    for (const key of Object.keys(Video.pool)) {
      if (excess <= 0) return;
      if (key === keep) continue;
      const video = Video.pool[key];
      // an element that is playing is on screen somewhere, so releasing it
      // would blank that shot
      if (!video || !video.paused) continue;
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
