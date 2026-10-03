import {Page} from 'playwright';
import {PNG} from 'pngjs';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {
  Pixel,
  countForeground,
  crop,
  diffRatio,
  readPng,
} from './helpers/pixels';
import {openScene, renderFrame} from './helpers/render';

const SCENE = 'shader-fills';
const WHITE: Pixel = {r: 255, g: 255, b: 255, a: 255};
const CELL_WIDTH = 560;
const CELL_HEIGHT = 340;
const MAX_DIFF_RATIO = 0.002;
const MIN_FOREGROUND = 2000;
// Tight enough to see an effect applied twice.
const DIFF_THRESHOLD = 0.05;

const TRANSFORM_CASES: [string, number][] = [
  ['a scaled and rotated shape', 0],
  ['a transformed parent', 1],
];
const EFFECT_CASES: [string, number][] = [['opacity', 2]];

function cell(frame: PNG, centerX: number, row: number) {
  return crop(frame, {
    x: centerX - CELL_WIDTH / 2,
    y: 540 + (row - 1) * CELL_HEIGHT - CELL_HEIGHT / 2,
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
  });
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

  test('control: the references draw their shapes', () => {
    for (const [, row] of [...TRANSFORM_CASES, ...EFFECT_CASES]) {
      expect(countForeground(cell(frame, 1440, row), WHITE)).toBeGreaterThan(
        MIN_FOREGROUND,
      );
    }
  });

  function expectMatchesReference(row: number) {
    expect(
      diffRatio(cell(frame, 480, row), cell(frame, 1440, row), DIFF_THRESHOLD),
    ).toBeLessThan(MAX_DIFF_RATIO);
  }

  test.fails.each(TRANSFORM_CASES)(
    'pass-through fill and stroke shaders match no shader with %s',
    (_, row) => expectMatchesReference(row),
  );

  test.fails.each(EFFECT_CASES)(
    'pass-through fill and stroke shaders match no shader with %s',
    (_, row) => expectMatchesReference(row),
  );
});
