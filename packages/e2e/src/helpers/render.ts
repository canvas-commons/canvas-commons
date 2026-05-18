import * as fs from 'fs';
import * as path from 'path';
import {Page} from 'playwright';
import {baseUrl, getSharedBrowser} from '../app';

const OutputRoot = path.resolve(process.cwd(), 'output');

const IMAGE_SEQUENCE_EXPORTER_ID = '@canvas-commons/core/image-sequence';

const TEST_RENDER_IMAGE_EXPORTER_OPTIONS = {
  fileType: 'image/png' as const,
  quality: 100,
  groupByScene: true,
};

const TEST_RENDER_RESOLUTION_SCALE = 0.5;

/**
 * Open the editor at the wrapper project for `sceneName` and wait for
 * `window.commons` and a positive playback duration.
 */
export async function openScene(sceneName: string): Promise<Page> {
  const browser = await getSharedBrowser();
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    const page = await browser.newPage();
    try {
      await page.goto(`${baseUrl()}/tests/projects/${sceneName}`);
      await page.waitForSelector('main');
      await page.waitForFunction(
        () => !!window.commons && window.commons.player.playback.duration > 0,
        undefined,
        {timeout: 30000},
      );
      return page;
    } catch (error: unknown) {
      lastError = error;
      await page.close();
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(`Failed to open ${sceneName}.`);
}

/**
 * Render a frame from the project currently loaded in `page` and return the
 * resulting PNG bytes.
 *
 * @param frame - Scene-local export frame index (matches image-sequence filenames
 * with `groupByScene: true`). Negative values count back from the last frame
 * (`-1` is the final frame).
 */
export async function renderFrame(
  page: Page,
  sceneName: string,
  frame: number,
): Promise<Buffer> {
  if (frame < 0) {
    return await renderRelativeFrame(page, sceneName, frame);
  }

  const target = await resolveExportFrame(page, sceneName, frame);

  const outputDir = path.join(OutputRoot, sceneName, sceneName);
  const outputFile = path.join(
    outputDir,
    `${String(target.sceneFrame).padStart(6, '0')}.png`,
  );

  await fs.promises.rm(outputFile, {force: true});

  await page.evaluate(
    async ({globalFrame, exporterId, exporterOptions, resolutionScale}) => {
      // Snapshot determinism: measure and paint with loaded faces, never a
      // race against in-flight web font fetches.
      await document.fonts.ready;
      const settings = window.commons.meta.getFullRenderingSettings();
      const fps = settings.fps;
      await window.commons.renderer.render({
        ...settings,
        name: window.commons.project.name,
        resolutionScale,
        range: [globalFrame / fps, (globalFrame + 1) / fps],
        exporter: {name: exporterId, options: exporterOptions},
      });
    },
    {
      globalFrame: target.globalFrame,
      exporterId: IMAGE_SEQUENCE_EXPORTER_ID,
      exporterOptions: {...TEST_RENDER_IMAGE_EXPORTER_OPTIONS},
      resolutionScale: TEST_RENDER_RESOLUTION_SCALE,
    },
  );

  await waitForFile(outputFile);
  return fs.promises.readFile(outputFile);
}

async function renderRelativeFrame(
  page: Page,
  sceneName: string,
  frame: number,
): Promise<Buffer> {
  const outputDir = path.join(OutputRoot, sceneName, sceneName);
  await fs.promises.rm(outputDir, {recursive: true, force: true});

  await page.evaluate(
    async ({exporterId, exporterOptions, resolutionScale}) => {
      await document.fonts.ready;
      const playback = window.commons.player.playback;
      const sceneSeconds = playback.duration / playback.fps;
      const settings = window.commons.meta.getFullRenderingSettings();
      const startSeconds = Math.max(0, sceneSeconds - 0.5);
      await window.commons.renderer.render({
        ...settings,
        name: window.commons.project.name,
        resolutionScale,
        range: [startSeconds, sceneSeconds + 1],
        exporter: {name: exporterId, options: exporterOptions},
      });
    },
    {
      exporterId: IMAGE_SEQUENCE_EXPORTER_ID,
      exporterOptions: {...TEST_RENDER_IMAGE_EXPORTER_OPTIONS},
      resolutionScale: TEST_RENDER_RESOLUTION_SCALE,
    },
  );

  await waitForDirectory(outputDir);
  const files = (await fs.promises.readdir(outputDir))
    .filter(file => file.endsWith('.png'))
    .map(file => Number.parseInt(path.basename(file, '.png'), 10))
    .filter(frame => !Number.isNaN(frame))
    .sort((a, b) => a - b);

  if (files.length === 0) {
    throw new Error(`No frames rendered to ${outputDir} for ${sceneName}.`);
  }

  const targetIndex = files.length + frame;
  if (targetIndex < 0) {
    throw new Error(
      `Requested frame ${frame} for ${sceneName} but only ${files.length} frames rendered.`,
    );
  }

  return fs.promises.readFile(
    path.join(outputDir, `${String(files[targetIndex]).padStart(6, '0')}.png`),
  );
}

interface ExportFrame {
  globalFrame: number;
  sceneFrame: number;
}

async function resolveExportFrame(
  page: Page,
  sceneName: string,
  frame: number,
): Promise<ExportFrame> {
  return await page.evaluate(
    ([rel, scene]) => {
      const playback = window.commons.player.playback;
      const sceneNode = playback.currentScene;

      const preview = window.commons.meta.getFullPreviewSettings();
      const renderSettings = window.commons.meta.getFullRenderingSettings();

      const previewFps = preview.fps;
      const renderFps = renderSettings.fps;
      const scale = renderFps / previewFps;

      const sceneFirstRenderFrames = Math.round(sceneNode.firstFrame * scale);
      const sceneLastRenderFrames = Math.round(sceneNode.lastFrame * scale);

      const lastInclusive = sceneLastRenderFrames - 1 - sceneFirstRenderFrames;
      const available = sceneLastRenderFrames - sceneFirstRenderFrames;
      const sceneFrame = rel >= 0 ? rel : lastInclusive + rel + 1;
      const globalFrame = sceneFirstRenderFrames + sceneFrame;

      if (sceneFrame < 0 || sceneFrame >= available || globalFrame < 0) {
        const lastLabel = lastInclusive < 0 ? 'none' : String(lastInclusive);
        throw new Error(
          `Requested frame ${rel} for ${scene} but only ${Math.max(
            0,
            available,
          )} exported scene-local frames exist at rendering fps (${renderFps}) (` +
            `preview first=${sceneNode.firstFrame} @ ${previewFps}fps, last=${lastLabel}).`,
        );
      }

      return {globalFrame, sceneFrame};
    },
    [frame, sceneName] as const,
  );
}

async function waitForFile(filePath: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fs.promises.access(filePath);
      // Give the writer a moment to flush.
      await new Promise(resolve => setTimeout(resolve, 50));
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

async function waitForDirectory(
  dirPath: string,
  timeoutMs = 15000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const stat = await fs.promises.stat(dirPath);
      if (stat.isDirectory()) {
        await new Promise(resolve => setTimeout(resolve, 50));
        return;
      }
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Timed out waiting for ${dirPath}`);
}
