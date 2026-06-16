import type {
  Exporter,
  MetaField,
  Project,
  RendererSettings,
  Sound,
} from '@canvas-commons/core';
import {
  BoolMetaField,
  NumberMetaField,
  ObjectMetaField,
  RendererResult,
} from '@canvas-commons/core';
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
} from 'mediabunny';
import {mixProjectAudio} from './mixAudio';

interface WebCodecsExporterOptions {
  /** Target video bitrate in megabits per second. */
  bitrate: number;
  /** Distance between forced keyframes, in seconds. */
  keyframeInterval: number;
  /** Place the moov atom at the start of the file. */
  fastStart: boolean;
  /** Mix the project's master audio track into the output. */
  includeAudio: boolean;
  /** Sample rate for the mixed audio. */
  audioSampleRate: number;
  /**
   * Faster encode at a small compression cost (`realtime` latency mode: no
   * B-frames/lookahead). Off = `quality` mode for a final master.
   */
  realtime: boolean;
}

const AUDIO_BITRATE = 192_000;
const AUDIO_CHANNELS = 2;
/** Preferred first (broadest player support); both are valid in mp4. */
const AUDIO_CODECS: {codec: 'aac' | 'opus'; web: string}[] = [
  {codec: 'aac', web: 'mp4a.40.2'},
  {codec: 'opus', web: 'opus'},
];
/** Endpoint the server plugin exposes to receive the finished mp4. */
const ROUTE = '/__canvas-commons-webcodecs';

/**
 * Webcodecs video exporter.
 *
 * @remarks
 * Uses {@link https://mediabunny.dev | Mediabunny} (WebCodecs) and the Web Audio
 * API to produce an mp4, then uploads that to the server to be written to the
 * filesystem.
 */
export class WebCodecsExporterClient implements Exporter {
  public static readonly id = '@canvas-commons/webcodecs';
  public static readonly displayName = 'Video (WebCodecs)';

  public static meta(project: Project): MetaField<any> {
    return new ObjectMetaField(this.displayName, {
      bitrate: new NumberMetaField('bitrate (Mbps)', 12),
      keyframeInterval: new NumberMetaField('keyframe interval (s)', 2),
      realtime: new BoolMetaField('realtime encode (faster)', true),
      fastStart: new BoolMetaField('fast start', true),
      includeAudio: new BoolMetaField('include audio', true).disable(
        !project.audio,
      ),
      audioSampleRate: new NumberMetaField('audio sample rate', 48000),
    });
  }

  public static async create(project: Project, settings: RendererSettings) {
    return new WebCodecsExporterClient(project, settings);
  }

  private readonly options: WebCodecsExporterOptions;
  private readonly fps: number;

  private output!: Output<Mp4OutputFormat, BufferTarget>;
  private videoSource: CanvasSource | null = null;
  private audioSource: AudioBufferSource | null = null;
  private mixedAudio: AudioBuffer | null = null;
  /** Set when the render canvas has odd dimensions and must be blitted even. */
  private blit: ((source: HTMLCanvasElement) => void) | null = null;
  private started = false;
  private frame = 0;
  private duration = Infinity;

  public constructor(
    private readonly project: Project,
    private readonly settings: RendererSettings,
  ) {
    const opts = (this.settings.exporter.options ??
      {}) as Partial<WebCodecsExporterOptions>;
    this.options = {
      bitrate: opts.bitrate ?? 12,
      keyframeInterval: opts.keyframeInterval ?? 2,
      fastStart: opts.fastStart ?? true,
      includeAudio: opts.includeAudio ?? true,
      audioSampleRate: opts.audioSampleRate ?? 48000,
      realtime: opts.realtime ?? true,
    };
    this.fps = settings.fps;
  }

  public async start(sounds: Sound[], duration: number): Promise<void> {
    if (typeof VideoEncoder === 'undefined') {
      throw new Error(
        'WebCodecs (VideoEncoder) is not available in this browser. ' +
          'Render in a recent Chromium or Firefox browser.',
      );
    }

    this.frame = 0;
    this.duration = duration;
    this.started = false;

    this.output = new Output({
      format: new Mp4OutputFormat({
        fastStart: this.options.fastStart ? 'in-memory' : false,
      }),
      target: new BufferTarget(),
    });

    // Mix audio up front, before the first frame, so we know whether to add an
    // audio track; a failure degrades to a video-only file rather than aborting
    // the render.
    const master =
      this.options.includeAudio && this.project.audio
        ? this.project.audio
        : null;
    this.mixedAudio = await mixProjectAudio({
      master,
      masterOffset:
        this.project.meta.shared.audioOffset.get() - this.settings.range[0],
      sounds,
      durationFrames: duration,
      fps: this.fps,
      sampleRate: this.options.audioSampleRate,
      channels: AUDIO_CHANNELS,
    }).catch(error => {
      console.warn('[canvas-commons/webcodecs] audio mix failed:', error);
      return null;
    });
  }

  public async handleFrame(canvas: HTMLCanvasElement): Promise<void> {
    // Drop the renderer's inclusive trailing frame.
    if (this.frame >= this.duration) {
      this.frame++;
      return;
    }

    const video = this.videoSource ?? (await this.begin(canvas));
    // Copy odd-sized frames into the even encode canvas (no-op otherwise).
    this.blit?.(canvas);
    // Awaiting respects Mediabunny's encoder/writer backpressure.
    await video.add(this.frame / this.fps, 1 / this.fps);
    this.frame++;
  }

  /**
   * Wire up the tracks and start the output. Deferred to the first frame because
   * {@link CanvasSource} needs the (stable) render canvas, which only arrives
   * with the frame.
   */
  private async begin(canvas: HTMLCanvasElement): Promise<CanvasSource> {
    // H.264 requires even dimensions; if the render canvas is odd, encode
    // through an even-sized canvas (dropping the last row/column).
    let encodeCanvas: HTMLCanvasElement | OffscreenCanvas = canvas;
    const evenWidth = canvas.width & ~1;
    const evenHeight = canvas.height & ~1;
    if (evenWidth !== canvas.width || evenHeight !== canvas.height) {
      const offscreen = new OffscreenCanvas(evenWidth, evenHeight);
      const context = offscreen.getContext('2d');
      if (context) {
        this.blit = source => context.drawImage(source, 0, 0);
        encodeCanvas = offscreen;
      }
    }

    const videoSource = new CanvasSource(encodeCanvas, {
      codec: 'avc', // H.264
      bitrate: Math.round(this.options.bitrate * 1_000_000),
      keyFrameInterval: this.options.keyframeInterval,
      // `realtime` ~doubles encode throughput at high resolution (no B-frames /
      // lookahead) for a small compression cost.
      latencyMode: this.options.realtime ? 'realtime' : 'quality',
    });
    this.output.addVideoTrack(videoSource, {frameRate: this.fps});

    if (this.mixedAudio) {
      const codec = await this.pickAudioCodec();
      if (codec) {
        this.audioSource = new AudioBufferSource({
          codec,
          bitrate: AUDIO_BITRATE,
        });
        this.output.addAudioTrack(this.audioSource);
      } else {
        // No browser AAC/Opus encoder (AAC is unavailable on Linux Chrome and
        // Firefox); emit a video-only file rather than aborting the whole render.
        console.warn(
          '[canvas-commons/webcodecs] no supported audio encoder (aac/opus); ' +
            'writing video without audio.',
        );
        this.mixedAudio = null;
      }
    }

    await this.output.start();
    this.videoSource = videoSource;
    this.started = true;
    return videoSource;
  }

  /**
   * Pick the first audio codec the browser can actually encode. AAC has the
   * broadest player support but its WebCodecs encoder is missing on some
   * platforms (notably Linux Chrome and Firefox), so Opus is the fallback; both
   * mux into mp4.
   */
  private async pickAudioCodec(): Promise<'aac' | 'opus' | null> {
    for (const {codec, web} of AUDIO_CODECS) {
      try {
        const support = await AudioEncoder.isConfigSupported({
          codec: web,
          sampleRate: this.options.audioSampleRate,
          numberOfChannels: AUDIO_CHANNELS,
          bitrate: AUDIO_BITRATE,
        });
        if (support.supported) {
          return codec;
        }
      } catch {
        // Unknown/unconstructable codec string — try the next candidate.
      }
    }
    return null;
  }

  public async stop(result: RendererResult): Promise<void> {
    // `started` is only set once output.start() succeeded, so this also covers
    // an aborted/failed start (no output to finalize or cancel).
    if (!this.started) {
      return;
    }
    if (result !== RendererResult.Success) {
      await this.output.cancel().catch(() => {});
      return;
    }

    if (this.audioSource && this.mixedAudio) {
      await this.audioSource.add(this.mixedAudio);
    }
    await this.output.finalize();

    const buffer = this.output.target.buffer;
    if (!buffer) {
      throw new Error('WebCodecs export produced no output.');
    }
    await this.write(buffer);
  }

  /**
   * Send the finished mp4 to the dev server, which writes it to the project's
   * output directory.
   */
  private async write(buffer: ArrayBuffer): Promise<void> {
    const response = await fetch(
      `${ROUTE}/write?name=${encodeURIComponent(this.project.name)}`,
      {
        method: 'POST',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        headers: {'Content-Type': 'application/octet-stream'},
        body: buffer,
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to write the output (${response.status}).`);
    }
  }
}
