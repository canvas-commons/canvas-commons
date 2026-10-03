import {Page} from 'playwright';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {baseUrl, getSharedBrowser} from './app';

const MinimumColoredPixels = 100;
const RenderTimeoutMs = 10000;

type Color = 'red' | 'lime';
type ColoredPixels = Record<Color, number>;

async function openWithoutRetry(project: string): Promise<Page> {
  const browser = await getSharedBrowser();
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl()}/tests/projects/${project}`);
    await page.waitForFunction(
      () => (window.commons?.player.playback.duration ?? 0) > 0,
    );
    return page;
  } catch (error) {
    await page.close();
    throw error;
  }
}

/** Counts the colored pixels of the first frame rendered after `start`. */
function renderFrame(
  page: Page,
  start: 'seek' | 'play',
): Promise<ColoredPixels> {
  return page.evaluate(
    action =>
      new Promise<ColoredPixels>(resolve => {
        const {player, meta} = window.commons;
        const countPixels = (): ColoredPixels => {
          const {size, resolutionScale} = meta.getFullPreviewSettings();
          const stage = Array.from(document.querySelectorAll('canvas')).find(
            canvas =>
              Math.abs(canvas.width - size.width * resolutionScale) < 1 &&
              Math.abs(canvas.height - size.height * resolutionScale) < 1,
          );
          const context = stage?.getContext('2d');
          if (!stage || !context) {
            throw new Error('The preview canvas was not found.');
          }
          const {data} = context.getImageData(0, 0, stage.width, stage.height);
          const counts: ColoredPixels = {red: 0, lime: 0};
          for (let i = 0; i < data.length; i += 4) {
            const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
            if (r > 180 && g < 90 && b < 90) counts.red++;
            if (g > 200 && r < 80 && b < 80) counts.lime++;
          }
          return counts;
        };
        const unsubscribe = player.onFrameChanged.subscribe(() => {
          unsubscribe();
          const counts = countPixels();
          player.togglePlayback(false);
          resolve(counts);
        }, false);
        if (action === 'seek') {
          player.requestSeek(1);
        } else {
          player.togglePlayback(true);
        }
      }),
    start,
  );
}

/** Resolves when the project has logged an error with the given message. */
function loggedError(page: Page, message: string): Promise<void> {
  return page.evaluate(
    expected =>
      new Promise<void>(resolve => {
        const {logger} = window.commons.project;
        const isExpected = (entry: {level?: unknown; message?: string}) =>
          String(entry.level) === 'error' && entry.message === expected;
        if (logger.history.some(isExpected)) {
          resolve();
          return;
        }
        const unsubscribe = logger.onLogged.subscribe(entry => {
          if (!isExpected(entry)) return;
          unsubscribe();
          resolve();
        });
      }),
    message,
  );
}

describe('valid video', () => {
  let page: Page;

  beforeAll(async () => {
    page = await openWithoutRetry('media-video');
  });

  afterAll(async () => {
    await page?.close();
  });

  test('a requested frame draws the video picture', async () => {
    const pixels = await renderFrame(page, 'seek');
    expect(pixels.red).toBeGreaterThan(MinimumColoredPixels);
  });
});

describe('video and image that fail to load', () => {
  let page: Page;

  beforeAll(async () => {
    page = await openWithoutRetry('video-missing');
  });

  afterAll(async () => {
    await page?.close();
  });

  test('the image error is logged', async () => {
    await loggedError(page, 'Failed to load an image');
  });

  test.fails(
    'the video error is logged',
    {timeout: RenderTimeoutMs},
    async () => {
      await loggedError(page, 'Failed to load a video');
    },
  );

  test.fails(
    'the rest of a seeked frame is drawn',
    {timeout: RenderTimeoutMs},
    async () => {
      const pixels = await renderFrame(page, 'seek');
      expect(pixels.lime).toBeGreaterThan(MinimumColoredPixels);
    },
  );

  test.fails(
    'the rest of a played frame is drawn',
    {timeout: RenderTimeoutMs},
    async () => {
      const pixels = await renderFrame(page, 'play');
      expect(pixels.lime).toBeGreaterThan(MinimumColoredPixels);
    },
  );
});
