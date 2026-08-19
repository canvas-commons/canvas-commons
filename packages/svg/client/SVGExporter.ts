import {Scene2D} from '@canvas-commons/2d';
import {
  BoolMetaField,
  EventDispatcher,
  Exporter,
  Logger,
  ObjectMetaField,
  Project,
  RendererSettings,
  Scene,
  ValueOf,
} from '@canvas-commons/core';

import {collectFontFaceCss} from './collectFonts';
import {serializeScene} from './serializeSvg';

// Backpressure: pause emitting once this many frames are awaiting a server ack,
// then re-check on this interval (also the drain interval in `stop`). The common
// single-frame export never reaches the cap.
const MAX_IN_FLIGHT_FRAMES = 32;
const DRAIN_POLL_INTERVAL = 250;

type SVGExporterOptions = ValueOf<ReturnType<typeof SVGExporter.meta>>;

interface ServerResponse {
  frame: number;
}

/**
 * Vector (SVG) exporter.
 *
 * @remarks
 * Uses the {@link Exporter.handleSceneFrame} hook to read the scene tree instead
 * of a rasterized canvas, serializing each frame into a standalone `.svg` file.
 * Intended for vector-friendly scenes (logos, diagrams). Animated scenes export
 * one SVG per frame; typically you render a single frame.
 */
export class SVGExporter implements Exporter {
  public static readonly id = '@canvas-commons/svg';
  public static readonly displayName = 'SVG (vector)';

  public static meta() {
    return new ObjectMetaField(this.name, {
      groupByScene: new BoolMetaField('group by scene', true).describe(
        'Write each scene into its own subdirectory.',
      ),
      embedFonts: new BoolMetaField('embed fonts', true).describe(
        'Inline web fonts into each SVG so text renders without them installed.',
      ),
    });
  }

  public static async create(
    project: Project,
    settings: RendererSettings,
  ): Promise<SVGExporter> {
    return new SVGExporter(project.logger, settings);
  }

  private static readonly response = new EventDispatcher<ServerResponse>();

  static {
    if (import.meta.hot) {
      import.meta.hot.on('canvas-commons:export-ack', response => {
        this.response.dispatch(response);
      });
    }
  }

  private readonly frameLookup = new Set<number>();
  private readonly projectName: string;
  private readonly groupByScene: boolean;
  private readonly embedFonts: boolean;
  private fontCss?: Promise<string>;

  public constructor(
    private readonly logger: Logger,
    private readonly settings: RendererSettings,
  ) {
    const options = settings.exporter.options as SVGExporterOptions;
    this.projectName = settings.name;
    this.groupByScene = options.groupByScene;
    this.embedFonts = options.embedFonts;
  }

  /** Collects the embedded-font CSS once and reuses it across frames. */
  private getFontCss(): Promise<string> {
    if (!this.embedFonts) {
      return Promise.resolve('');
    }
    this.fontCss ??= collectFontFaceCss(this.logger).catch(() => '');
    return this.fontCss;
  }

  public async start() {
    SVGExporter.response.subscribe(this.handleResponse);
  }

  // Required by the Exporter interface; the raster is ignored because vector
  // output is produced in handleSceneFrame.
  public async handleFrame() {}

  public async handleSceneFrame(
    scene: Scene,
    frame: number,
    sceneFrame: number,
    signal: AbortSignal,
  ) {
    if (!import.meta.hot) {
      return;
    }
    if (!(scene instanceof Scene2D)) {
      this.logger.warn(
        `SVG export: scene "${scene.name}" is not a 2D scene — skipped.`,
      );
      return;
    }
    if (this.frameLookup.has(frame)) {
      this.logger.warn(`Frame no. ${frame} is already being exported.`);
      return;
    }

    // Throttle so an animated export can't outrun the server writing the files.
    while (this.frameLookup.size > MAX_IN_FLIGHT_FRAMES) {
      await new Promise(resolve => setTimeout(resolve, DRAIN_POLL_INTERVAL));
      if (signal.aborted) {
        return;
      }
    }
    if (signal.aborted) {
      return;
    }

    const fontCss = await this.getFontCss();
    if (signal.aborted) {
      return;
    }
    const svg = serializeScene(
      scene.getView(),
      this.settings.background,
      fontCss,
    );

    this.frameLookup.add(frame);
    import.meta.hot.send('canvas-commons:export', {
      frame,
      data: `data:image/svg+xml;base64,${encodeBase64(svg)}`,
      mimeType: 'image/svg+xml',
      subDirectories: this.groupByScene
        ? [this.projectName, scene.name]
        : [this.projectName],
      name: (this.groupByScene ? sceneFrame : frame)
        .toString()
        .padStart(6, '0'),
    });
  }

  public async stop() {
    while (this.frameLookup.size > 0) {
      await new Promise(resolve => setTimeout(resolve, DRAIN_POLL_INTERVAL));
    }
    SVGExporter.response.unsubscribe(this.handleResponse);
  }

  private handleResponse = ({frame}: ServerResponse) => {
    this.frameLookup.delete(frame);
  };
}

function encodeBase64(text: string): string {
  // btoa requires latin1; round-trip through UTF-8 so non-ASCII survives.
  return btoa(unescape(encodeURIComponent(text)));
}
