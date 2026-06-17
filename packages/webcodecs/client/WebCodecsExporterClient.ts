import type {
  Exporter,
  Logger,
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
  getFirstEncodableAudioCodec,
  Mp4OutputFormat,
  Output,
} from 'mediabunny';
import {mixProjectAudio} from './mixAudio';

interface WebCodecsExporterOptions {
  bitrate: number;
  keyframeInterval: number;
  fastStart: boolean;
  includeAudio: boolean;
  audioSampleRate: number;
  realtime: boolean;
}

const AUDIO_BITRATE = 192_000;
const AUDIO_CHANNELS = 2;
const ROUTE = '/__canvas-commons-webcodecs';

const DEFAULTS: WebCodecsExporterOptions = {
  bitrate: 12,
  keyframeInterval: 2,
  fastStart: true,
  includeAudio: true,
  audioSampleRate: 48000,
  realtime: true,
};

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
      bitrate: new NumberMetaField('bitrate (Mbps)', DEFAULTS.bitrate).describe(
        'Target video bitrate in megabits per second.',
      ),
      keyframeInterval: new NumberMetaField(
        'keyframe interval (s)',
        DEFAULTS.keyframeInterval,
      ).describe('Distance between forced keyframes, in seconds.'),
      realtime: new BoolMetaField(
        'realtime encode (faster)',
        DEFAULTS.realtime,
      ).describe(
        'Roughly doubles encode speed for a small compression cost (no ' +
          'B-frames/lookahead). Turn off for a more compressed final master.',
      ),
      fastStart: new BoolMetaField('fast start', DEFAULTS.fastStart).describe(
        'Place the moov atom at the start of the file.',
      ),
      includeAudio: new BoolMetaField('include audio', DEFAULTS.includeAudio)
        .disable(!project.audio)
        .describe("Mix the project's master audio track into the output."),
      audioSampleRate: new NumberMetaField(
        'audio sample rate',
        DEFAULTS.audioSampleRate,
      ).describe('Sample rate for the mixed audio.'),
    });
  }

  public static async create(project: Project, settings: RendererSettings) {
    return new WebCodecsExporterClient(project, settings);
  }

  private readonly options: WebCodecsExporterOptions;
  private readonly fps: number;
  private readonly logger: Logger;

  private output: Output<Mp4OutputFormat, BufferTarget> | null = null;
  private videoSource: CanvasSource | null = null;
  private audioSource: AudioBufferSource | null = null;
  private mixedAudio: AudioBuffer | null = null;
  private frame = 0;
  private duration = Infinity;

  public constructor(
    private readonly project: Project,
    private readonly settings: RendererSettings,
  ) {
    const opts = (this.settings.exporter.options ??
      {}) as Partial<WebCodecsExporterOptions>;
    this.options = {
      bitrate: opts.bitrate ?? DEFAULTS.bitrate,
      keyframeInterval: opts.keyframeInterval ?? DEFAULTS.keyframeInterval,
      fastStart: opts.fastStart ?? DEFAULTS.fastStart,
      includeAudio: opts.includeAudio ?? DEFAULTS.includeAudio,
      audioSampleRate: opts.audioSampleRate ?? DEFAULTS.audioSampleRate,
      realtime: opts.realtime ?? DEFAULTS.realtime,
    };
    this.fps = settings.fps;
    this.logger = project.logger;
  }

  public async start(sounds: Sound[], duration: number): Promise<void> {
    if (typeof VideoEncoder === 'undefined') {
      throw new Error(
        'WebCodecs (VideoEncoder) is not available in this browser. ' +
          'Render in a recent Chromium or Firefox browser ' +
          '(see https://caniuse.com/webcodecs).',
      );
    }

    // H.264 requires even dimensions; reject odd renders rather than cropping.
    const width = Math.floor(
      this.settings.size.x * this.settings.resolutionScale,
    );
    const height = Math.floor(
      this.settings.size.y * this.settings.resolutionScale,
    );
    if (width % 2 !== 0 || height % 2 !== 0) {
      throw new Error(
        `WebCodecs export needs even dimensions, but the render is ${width}×${height}. ` +
          'Adjust the resolution or scale so both width and height are even.',
      );
    }

    this.frame = 0;
    this.duration = duration;

    // Mixed up front so the audio track exists before the first frame; a failure
    // degrades to a video-only file.
    const master =
      this.options.includeAudio && this.project.audio
        ? this.project.audio
        : null;
    this.mixedAudio = await mixProjectAudio({
      master,
      masterOffset: this.project.meta.shared.audioOffset.get(),
      rangeStart: this.settings.range[0],
      sounds,
      durationFrames: duration,
      fps: this.fps,
      sampleRate: this.options.audioSampleRate,
      channels: AUDIO_CHANNELS,
      logger: this.logger,
    }).catch(error => {
      this.logger.warn({
        message: 'WebCodecs: audio mix failed; writing video without audio.',
        remarks: String(error),
      });
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
    // Awaiting respects Mediabunny's encoder/writer backpressure.
    await video.add(this.frame / this.fps, 1 / this.fps);
    this.frame++;
  }

  /**
   * Wire up the tracks and start the output. Deferred to the first frame because
   * {@link CanvasSource} needs the render canvas, which only arrives with it.
   */
  private async begin(canvas: HTMLCanvasElement): Promise<CanvasSource> {
    const output = new Output({
      format: new Mp4OutputFormat({
        fastStart: this.options.fastStart ? 'in-memory' : false,
      }),
      target: new BufferTarget(),
    });

    const videoSource = new CanvasSource(canvas, {
      codec: 'avc', // H.264
      bitrate: Math.round(this.options.bitrate * 1_000_000),
      keyFrameInterval: this.options.keyframeInterval,
      latencyMode: this.options.realtime ? 'realtime' : 'quality',
    });
    output.addVideoTrack(videoSource, {frameRate: this.fps});

    if (this.mixedAudio) {
      // AAC where the browser can encode it, else Opus; both mux into mp4.
      const codec = await getFirstEncodableAudioCodec(['aac', 'opus'], {
        numberOfChannels: AUDIO_CHANNELS,
        sampleRate: this.options.audioSampleRate,
        bitrate: AUDIO_BITRATE,
      });
      if (codec) {
        if (codec !== 'aac') {
          this.logger.warn(
            `WebCodecs: AAC unavailable in this browser; encoding audio as ` +
              `${codec} (narrower player support).`,
          );
        }
        this.audioSource = new AudioBufferSource({
          codec,
          bitrate: AUDIO_BITRATE,
        });
        output.addAudioTrack(this.audioSource);
      } else {
        this.logger.warn(
          'WebCodecs: no supported audio encoder (aac/opus); ' +
            'writing video without audio.',
        );
        this.mixedAudio = null;
      }
    }

    await output.start();
    this.output = output;
    this.videoSource = videoSource;
    return videoSource;
  }

  public async stop(result: RendererResult): Promise<void> {
    // Only set once output.start() succeeded, so a null output means the encode
    // never began and there is nothing to finalize.
    const output = this.output;
    if (!output) {
      return;
    }
    if (result !== RendererResult.Success) {
      // A cancel error would only mask the real failure that aborted the render.
      await output.cancel().catch(() => {});
      return;
    }

    if (this.audioSource && this.mixedAudio) {
      await this.audioSource.add(this.mixedAudio);
    }
    await output.finalize();

    const buffer = output.target.buffer;
    if (!buffer) {
      throw new Error('WebCodecs export produced no output.');
    }
    await this.write(buffer);
  }

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
