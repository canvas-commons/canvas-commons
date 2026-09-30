import {Page} from 'playwright';
import {PNG} from 'pngjs';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {
  Pixel,
  Region,
  countForeground,
  crop,
  pixelAt,
  readPng,
} from './helpers/pixels';
import {openScene, renderFrame} from './helpers/render';

const SCENE = 'curve-degenerate';
const BLACK: Pixel = {r: 0, g: 0, b: 0, a: 255};
const CENTER_X = 960;
const CENTER_Y = 540;

function splineRegion(y: number): Region {
  return {
    x: CENTER_X - 300 - 50,
    y: CENTER_Y + y - 50,
    width: 300,
    height: 100,
  };
}

function horizontalSpan(image: PNG): number {
  let first = -1;
  let last = -1;
  for (let x = 0; x < image.width; x++) {
    for (let y = 0; y < image.height; y++) {
      if (pixelAt(image, x, y).r > 128) {
        if (first < 0) first = x;
        last = x;
        break;
      }
    }
  }
  return first < 0 ? 0 : last - first + 1;
}

describe(SCENE, () => {
  let page: Page;
  let frame: PNG;

  beforeAll(async () => {
    page = await openScene(SCENE);
    frame = readPng(await renderFrame(page, SCENE, 0, 1));
  });

  afterAll(async () => {
    await page?.close();
  });

  test('control: a spline with two coincident knots draws its full length', () => {
    const spline = crop(frame, splineRegion(200));
    expect(countForeground(spline, BLACK)).toBeGreaterThan(500);
    expect(Math.abs(horizontalSpan(spline) - 200)).toBeLessThan(20);
  });

  test('a spline with three coincident knots draws its full length', () => {
    const spline = crop(frame, splineRegion(-200));
    expect(countForeground(spline, BLACK)).toBeGreaterThan(500);
    expect(Math.abs(horizontalSpan(spline) - 200)).toBeLessThan(20);
  });
});
