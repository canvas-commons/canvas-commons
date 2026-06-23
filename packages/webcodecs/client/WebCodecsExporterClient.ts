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
  EnumMetaField,
  NumberMetaField,
  ObjectMetaField,
  RendererResult,
} from '@canvas-commons/core';
import type {AudioCodec, Quality, VideoCodec} from 'mediabunny';
import {
  AudioBufferSource,
  BufferTarget,
  canEncodeVideo,
  CanvasSource,
  getFirstEncodableAudioCodec,
  Mp4OutputFormat,
  NON_PCM_AUDIO_CODECS,
  Output,
  QUALITY_HIGH,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  QUALITY_VERY_HIGH,
  QUALITY_VERY_LOW,
} from 'mediabunny';
import {mixProjectAudio} from './mixAudio';

const AUDIO_BITRATE = 192_000;
const AUDIO_CHANNELS = 2;
const ROUTE = '/__canvas-commons-webcodecs';

type QualityName = 'veryLow' | 'low' | 'medium' | 'high' | 'veryHigh';

/**
 * mediabunny quality presets (resolution-aware bitrate), worst to best. The one
 * array is both the dropdown and the encode-time name → {@link Quality} lookup.
 */
const QUALITY_PRESETS: {value: QualityName; text: string; quality: Quality}[] =
  [
    {value: 'veryLow', text: 'very low', quality: QUALITY_VERY_LOW},
    {value: 'low', text: 'low', quality: QUALITY_LOW},
    {value: 'medium', text: 'medium', quality: QUALITY_MEDIUM},
    {value: 'high', text: 'high', quality: QUALITY_HIGH},
    {value: 'veryHigh', text: 'very high', quality: QUALITY_VERY_HIGH},
  ];

// Codecs the mp4 container can mux, straight from mediabunny; audio drops the
// PCM variants. The browser may not encode all of them — the chosen one is
// checked per render in `start` via `canEncodeVideo`.
const MP4 = new Mp4OutputFormat();
const NON_PCM = new Set<AudioCodec>(NON_PCM_AUDIO_CODECS);
const VIDEO_CODEC_OPTIONS = MP4.getSupportedVideoCodecs().map(value => ({
  value,
  text: value,
}));
const AUDIO_CODEC_OPTIONS = MP4.getSupportedAudioCodecs()
  .filter(codec => NON_PCM.has(codec))
  .map(value => ({value, text: value}));

interface WebCodecsExporterOptions {
  videoCodec: VideoCodec;
  videoQuality: QualityName;
  keyframeInterval: number;
  realtime: boolean;
  audioCodec: AudioCodec;
  fastStart: boolean;
  includeAudio: boolean;
  audioSampleRate: number;
}

const DEFAULTS: WebCodecsExporterOptions = {
  videoCodec: 'avc',
  videoQuality: 'high',
  keyframeInterval: 2,
  realtime: false,
  audioCodec: 'aac',
  fastStart: true,
  includeAudio: true,
  audioSampleRate: 48000,
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
      videoCodec: new EnumMetaField(
        'video codec',
        VIDEO_CODEC_OPTIONS,
        DEFAULTS.videoCodec,
      ).describe(
        'Video codec. H.264/H.265 require even dimensions; VP8/VP9/AV1 allow odd.',
      ),
      videoQuality: new EnumMetaField(
        'video quality',
        QUALITY_PRESETS,
        DEFAULTS.videoQuality,
      ).describe(
        'Quality preset; mediabunny picks a bitrate from the render resolution.',
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
          'B-frames/lookahead). Leave off for a more compressed final master.',
      ),
      audioCodec: new EnumMetaField(
        'audio codec',
        AUDIO_CODEC_OPTIONS,
        DEFAULTS.audioCodec,
      )
        .disable(!project.audio)
        .describe(
          'Audio codec; falls back to another encodable codec if the browser ' +
            'cannot encode this one.',
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
  private readonly quality: Quality;
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
      videoCodec: opts.videoCodec ?? DEFAULTS.videoCodec,
      videoQuality: opts.videoQuality ?? DEFAULTS.videoQuality,
      keyframeInterval: opts.keyframeInterval ?? DEFAULTS.keyframeInterval,
      realtime: opts.realtime ?? DEFAULTS.realtime,
      audioCodec: opts.audioCodec ?? DEFAULTS.audioCodec,
      fastStart: opts.fastStart ?? DEFAULTS.fastStart,
      includeAudio: opts.includeAudio ?? DEFAULTS.includeAudio,
      audioSampleRate: opts.audioSampleRate ?? DEFAULTS.audioSampleRate,
    };
    this.quality =
      QUALITY_PRESETS.find(p => p.value === this.options.videoQuality)
        ?.quality ?? QUALITY_HIGH;
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

    // Let mediabunny validate the codec against these dimensions up front; it
    // rejects e.g. odd width/height for H.264/H.265 rather than cropping.
    const width = Math.floor(
      this.settings.size.x * this.settings.resolutionScale,
    );
    const height = Math.floor(
      this.settings.size.y * this.settings.resolutionScale,
    );
    if (
      !(await canEncodeVideo(this.options.videoCodec, {
        width,
        height,
        bitrate: this.quality,
      }))
    ) {
      throw new Error(
        `This browser cannot encode ${this.options.videoCodec} video at ` +
          `${width}×${height}. Pick a different video codec, or adjust the ` +
          'resolution or scale (H.264 and H.265 require even dimensions).',
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
      codec: this.options.videoCodec,
      bitrate: this.quality,
      keyFrameInterval: this.options.keyframeInterval,
      latencyMode: this.options.realtime ? 'realtime' : 'quality',
    });
    output.addVideoTrack(videoSource, {frameRate: this.fps});

    if (this.mixedAudio) {
      // Prefer the chosen codec, falling back to widely-supported ones (e.g.
      // Linux Chrome/Firefox can't encode AAC); all mux into mp4.
      const preferred = this.options.audioCodec;
      const codec = await getFirstEncodableAudioCodec(
        [...new Set<AudioCodec>([preferred, 'aac', 'opus'])],
        {
          numberOfChannels: AUDIO_CHANNELS,
          sampleRate: this.options.audioSampleRate,
          bitrate: AUDIO_BITRATE,
        },
      );
      if (codec) {
        if (codec !== preferred) {
          this.logger.warn(
            `WebCodecs: ${preferred} audio unavailable in this browser; ` +
              `encoding as ${codec}.`,
          );
        }
        this.audioSource = new AudioBufferSource({
          codec,
          bitrate: AUDIO_BITRATE,
        });
        output.addAudioTrack(this.audioSource);
      } else {
        this.logger.warn(
          'WebCodecs: no supported audio encoder; writing video without audio.',
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
