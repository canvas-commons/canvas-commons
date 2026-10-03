import {Page} from 'playwright';
import {PNG} from 'pngjs';
import {afterAll, describe, expect, test} from 'vitest';
import {baseUrl, getSharedBrowser} from './app';
import {
  Pixel,
  Region,
  countForeground,
  crop,
  diffRatio,
  readPng,
} from './helpers/pixels';
import {renderFrame} from './helpers/render';

const BLACK: Pixel = {r: 0, g: 0, b: 0, a: 255};
const TEST_TIMEOUT_MS = 60000;
const MID_TWEEN_FRAME = 30;
const MAX_DIFF = 0.001;
const MIN_CHANGE = 0.005;

const SUBJECT_REGION: Region = {x: 360, y: 190, width: 1200, height: 300};
const REFERENCE_REGION: Region = {...SUBJECT_REGION, y: 590};

async function capture(page: Page, scene: string, frame: number) {
  return readPng(await renderFrame(page, scene, frame, 1));
}

function expectGrowthToTarget(start: PNG, mid: PNG, end: PNG) {
  const reference = crop(end, REFERENCE_REGION);
  expect(countForeground(reference, BLACK)).toBeGreaterThan(500);
  expect(diffRatio(crop(end, SUBJECT_REGION), reference)).toBeLessThan(
    MAX_DIFF,
  );
  const midSubject = crop(mid, SUBJECT_REGION);
  expect(diffRatio(midSubject, crop(start, SUBJECT_REGION))).toBeGreaterThan(
    MIN_CHANGE,
  );
  expect(diffRatio(midSubject, crop(end, SUBJECT_REGION))).toBeGreaterThan(
    MIN_CHANGE,
  );
}

describe('line point tween', () => {
  const pages: Page[] = [];

  async function openGrowthScene(scene: string): Promise<Page> {
    const page = await (await getSharedBrowser()).newPage();
    pages.push(page);
    await page.goto(`${baseUrl()}/tests/projects/${scene}`);
    await page.waitForFunction(
      () => !!window.commons && window.commons.player.playback.duration > 0,
    );
    return page;
  }

  afterAll(async () => {
    await Promise.all(pages.map(page => page.close()));
  });

  async function growthFrames(scene: string) {
    const page = await openGrowthScene(scene);
    return {
      start: await capture(page, scene, 0),
      mid: await capture(page, scene, MID_TWEEN_FRAME),
      end: await capture(page, scene, -1),
    };
  }

  test(
    'control: growing a line by several points ends on the target shape',
    async () => {
      const {start, mid, end} = await growthFrames('line-grow-control');
      expectGrowthToTarget(start, mid, end);
    },
    TEST_TIMEOUT_MS,
  );

  test.fails(
    'growing a line by one point ends on the target shape',
    async () => {
      const {start, mid, end} = await growthFrames('line-grow');
      expectGrowthToTarget(start, mid, end);
    },
    TEST_TIMEOUT_MS,
  );
});
