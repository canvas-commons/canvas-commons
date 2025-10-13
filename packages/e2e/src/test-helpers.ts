import * as fs from 'fs';
import {Page} from 'playwright';

export interface FrameRange {
  start: number;
  end: number;
}

export interface TestFrameSpec {
  frame: number;
  identifier: string;
}

export interface RenderSettings {
  fps?: number;
  scale?: number;
  width?: number;
  height?: number;
  exporter?: string;
  background?: string;
}

export interface TestConfig {
  projectName: string;
  settings?: RenderSettings;
}

export interface TimeEventMeta {
  name: string;
  targetTime: number;
}

export interface SceneMeta {
  version: number;
  timeEvents: TimeEventMeta[];
  seed?: number;
}

export async function switchToProject(
  page: Page,
  projectName: string,
): Promise<void> {
  const currentUrl = new URL(page.url());
  currentUrl.pathname = `/tests/projects/${projectName}`;
  if (currentUrl.toString() !== page.url()) {
    await page.goto(currentUrl.toString());
  }

  // Wait for the page to load and be ready
  await page.waitForSelector('main');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000); // Give extra time for React/Preact to hydrate
}

export async function setFrameRange(
  page: Page,
  start: number,
  end: number,
): Promise<void> {
  const startFrame = start;
  const endFrame = end;

  const startInput = page.locator('[data-testid="range-range-start"]');
  const endInput = page.locator('[data-testid="range-range-end"]');

  const startCount = await startInput.count();
  const endCount = await endInput.count();

  if (startCount > 0 && endCount > 0) {
    await startInput.first().waitFor({state: 'visible', timeout: 5000});
    await endInput.first().waitFor({state: 'visible', timeout: 5000});

    // Set end value first to avoid validation issues
    await endInput.first().click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(endFrame.toString());
    await page.keyboard.press('Tab'); // Trigger blur to commit the value
    await page.waitForTimeout(100);

    // Now set start value
    await startInput.first().click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(startFrame.toString());
    await page.keyboard.press('Tab'); // Trigger blur to commit the value
    await page.waitForTimeout(100);

    // Verify the values were set correctly
    const actualStart = await startInput.first().inputValue();
    const actualEnd = await endInput.first().inputValue();

    if (
      actualStart !== startFrame.toString() ||
      actualEnd !== endFrame.toString()
    ) {
      throw new Error(
        `Frame range not set correctly. Expected [${startFrame}, ${endFrame}], got [${actualStart}, ${actualEnd}]`,
      );
    }
  } else {
    throw new Error(
      `Could not find range controls. Start input count: ${startCount}, End input count: ${endCount}`,
    );
  }
}

export async function applyRenderSettings(
  page: Page,
  settings: RenderSettings,
): Promise<void> {
  if (settings.fps !== undefined) {
    try {
      const frameRateInput = page.locator('[data-testid="frame-rate"]');
      await frameRateInput.waitFor({state: 'visible', timeout: 5000});
      await frameRateInput.click({clickCount: 3});
      await frameRateInput.fill(settings.fps.toString());
    } catch {
      // Ignore if element not found or not visible
    }
  }

  if (settings.scale !== undefined) {
    try {
      const scaleSelect = page.locator('[data-testid="scale"]');
      await scaleSelect.waitFor({state: 'visible', timeout: 5000});
      await scaleSelect.selectOption(settings.scale.toString());
    } catch {
      // Ignore if element not found or not visible
    }
  }

  if (settings.width !== undefined) {
    try {
      const widthInput = page.locator('[data-testid="resolution-x"]');
      await widthInput.waitFor({state: 'visible', timeout: 5000});
      await widthInput.click({clickCount: 3});
      await widthInput.fill(settings.width.toString());
    } catch {
      // Ignore if element not found or not visible
    }
  }

  if (settings.height !== undefined) {
    try {
      const heightInput = page.locator('[data-testid="resolution-y"]');
      await heightInput.waitFor({state: 'visible', timeout: 5000});
      await heightInput.click({clickCount: 3});
      await heightInput.fill(settings.height.toString());
    } catch {
      // Ignore if element not found or not visible
    }
  }

  if (settings.exporter !== undefined) {
    try {
      const exporterSelect = page.locator('[data-testid="exporter"]');
      await exporterSelect.waitFor({state: 'visible', timeout: 5000});
      await exporterSelect.selectOption(settings.exporter);
    } catch {
      // Ignore if element not found or not visible
    }
  }

  if (settings.background !== undefined) {
    try {
      const backgroundInput = page.locator('[data-testid="background"]');
      await backgroundInput.waitFor({state: 'visible', timeout: 5000});
      await backgroundInput.fill(settings.background);
    } catch {
      // Ignore if element not found or not visible
    }
  }

  // Wait for settings to be applied
  await page.waitForTimeout(200);
}

export async function renderSingleFrame(
  page: Page,
  projectName: string | null,
  frame: number,
  settings?: RenderSettings,
): Promise<void> {
  if (projectName) {
    await switchToProject(page, projectName);
  }

  if (settings) {
    await applyRenderSettings(page, settings);
  }

  // Render a minimal range [N, N+1] to get frame N
  await setFrameRange(page, frame, frame + 1);

  const renderButton = page
    .locator('#render, button:has-text("Render")')
    .first();
  await renderButton.click();

  // Wait for rendering to complete
  await page.waitForSelector('#render:not([data-rendering="true"])', {
    timeout: 60000,
  });
}

export async function readFrameFromScene(
  sceneName: string,
  frameNumber: number,
): Promise<Buffer> {
  const framePath = `./output/${sceneName}/${frameNumber.toString().padStart(6, '0')}.png`;
  return fs.promises.readFile(framePath);
}

export interface ProjectMeta {
  version: number;
  shared?: {
    background?: string;
    range?: [number, number | null];
    size?: {x: number; y: number};
    audioOffset?: number;
  };
  preview?: {
    fps?: number;
    resolutionScale?: number;
  };
  rendering?: {
    fps?: number;
    resolutionScale?: number;
    colorSpace?: string;
    exporter?: {
      name: string;
      options?: Record<string, unknown>;
    };
  };
}

/**
 * Read the meta file for a scene to get time events
 */
export async function readSceneMeta(sceneName: string): Promise<SceneMeta> {
  const path = await import('path');
  const metaPath = path.join(
    process.cwd(),
    'tests',
    'scenes',
    `${sceneName}.meta`,
  );
  const metaContent = await fs.promises.readFile(metaPath, 'utf-8');
  return JSON.parse(metaContent) as SceneMeta;
}

/**
 * Read the project meta file to get default settings
 */
export async function readProjectMeta(): Promise<ProjectMeta> {
  const path = await import('path');
  const metaPath = path.join(process.cwd(), 'tests', 'project.meta');
  const metaContent = await fs.promises.readFile(metaPath, 'utf-8');
  return JSON.parse(metaContent) as ProjectMeta;
}

/**
 * Get the frame number for a specific time event
 * If fps is not provided, it will be read from the project meta file
 */
export async function getFrameFromTimeEvent(
  sceneName: string,
  eventName: string,
  fps?: number,
): Promise<number> {
  const meta = await readSceneMeta(sceneName);
  const event = meta.timeEvents.find(e => e.name === eventName);

  if (!event) {
    throw new Error(
      `Time event "${eventName}" not found in scene "${sceneName}"`,
    );
  }

  // If fps is not provided, read it from the project meta
  let actualFps = fps;
  if (actualFps === undefined) {
    const projectMeta = await readProjectMeta();
    actualFps = projectMeta.rendering?.fps ?? 30;
  }

  return Math.round(event.targetTime * actualFps) + 1;
}
