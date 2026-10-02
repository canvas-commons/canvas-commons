import {Page} from 'playwright';
import {PNG} from 'pngjs';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {
  Pixel,
  Region,
  countForeground,
  crop,
  diffRatio,
  pixelAt,
  readPng,
} from './helpers/pixels';
import {openScene, renderFrame} from './helpers/render';

const WHITE: Pixel = {r: 255, g: 255, b: 255, a: 255};
const MAX_DIFF = 0.001;
const CENTER_X = 960;
const CENTER_Y = 540;

function around(x: number, y: number, width: number, height: number): Region {
  return {x: x - width / 2, y: y - height / 2, width, height};
}

function foregroundSpan(image: PNG, row: number): number {
  let first = -1;
  let last = -1;
  for (let x = 0; x < image.width; x++) {
    const {r, g, b} = pixelAt(image, x, row);
    if (r < 240 || g < 240 || b < 240) {
      if (first < 0) first = x;
      last = x;
    }
  }
  return first < 0 ? 0 : last - first + 1;
}

function runLength(image: PNG, row: number, matches: (p: Pixel) => boolean) {
  let count = 0;
  for (let x = 0; x < image.width; x++) {
    if (matches(pixelAt(image, x, row))) count++;
  }
  return count;
}

describe('tree-edits', () => {
  const SCENE = 'tree-edits';
  const GROUP = {width: 260, height: 260};
  let page: Page;

  beforeAll(async () => {
    page = await openScene(SCENE);
  });

  afterAll(async () => {
    await page?.close();
  });

  describe('adding a child that is already in the parent', () => {
    let moved: PNG;
    let expected: PNG;

    beforeAll(async () => {
      const frame = readPng(await renderFrame(page, SCENE, 0, 1));
      moved = crop(
        frame,
        around(CENTER_X - 600 - 20, CENTER_Y, GROUP.width, GROUP.height),
      );
      expected = crop(
        frame,
        around(CENTER_X - 200 - 20, CENTER_Y, GROUP.width, GROUP.height),
      );
    });

    test('control: the expected group draws the red box over the blue box', () => {
      const overlap = pixelAt(expected, GROUP.width / 2 - 5, GROUP.height / 2);
      expect(overlap.r).toBeGreaterThan(170);
      expect(overlap.r).toBeLessThan(210);
      expect(overlap.b).toBeGreaterThan(100);
      expect(overlap.b).toBeLessThan(150);
      expect(countForeground(expected, WHITE)).toBeGreaterThan(20000);
    });

    test('moves the child to the top and draws it once', () => {
      expect(diffRatio(moved, expected)).toBeLessThan(MAX_DIFF);
    });
  });

  describe('adding an ancestor below its own descendant', () => {
    const CELL = {width: 260, height: 260};
    const SENTINEL = {width: 120, height: 120};
    let before: PNG;
    let after: PNG;
    let sentinelAfter: PNG;

    beforeAll(async () => {
      before = readPng(await renderFrame(page, SCENE, 0, 1));
      after = readPng(await renderFrame(page, SCENE, -1, 1));
      sentinelAfter = crop(
        after,
        around(CENTER_X + 750, CENTER_Y, SENTINEL.width, SENTINEL.height),
      );
    });

    test('control: the first frame shows the nodes and the last frame renders', () => {
      const cell = crop(
        before,
        around(CENTER_X + 400, CENTER_Y, CELL.width, CELL.height),
      );
      expect(countForeground(cell, WHITE)).toBeGreaterThan(30000);
      expect(countForeground(sentinelAfter, WHITE)).toBeGreaterThan(9000);
    });

    test('leaves the tree intact', () => {
      const region = around(CENTER_X + 400, CENTER_Y, CELL.width, CELL.height);
      expect(diffRatio(crop(before, region), crop(after, region))).toBeLessThan(
        MAX_DIFF,
      );
    });
  });
});

describe('layout-overlap', () => {
  const SCENE = 'layout-overlap';
  let page: Page;
  let last: PNG;

  beforeAll(async () => {
    page = await openScene(SCENE);
    last = readPng(await renderFrame(page, SCENE, -1, 1));
  });

  afterAll(async () => {
    await page?.close();
  });

  describe('overlapping insert animations', () => {
    const ROW = {width: 800, height: 120};
    const rowRegion = (y: number) =>
      around(CENTER_X, CENTER_Y + y, ROW.width, ROW.height);

    test('control: the sequential row reflows to the widened child', () => {
      const row = crop(last, rowRegion(-250));
      expect(foregroundSpan(row, ROW.height / 2)).toBeGreaterThan(520);
    });

    test('reflows after the animations end', () => {
      const overlapping = crop(last, rowRegion(-400));
      const sequential = crop(last, rowRegion(-250));
      expect(diffRatio(overlapping, sequential)).toBeLessThan(MAX_DIFF);
    });
  });

  describe('percent child of a parent that becomes sized', () => {
    const ROW = {width: 600, height: 100};
    const isPurple = (p: Pixel) => p.r > 150 && p.g < 40 && p.b > 150;
    const rowRegion = (y: number) =>
      around(CENTER_X, CENTER_Y + y, ROW.width, ROW.height);

    test('control: in a fresh sized parent the percent box is half the width', () => {
      const row = crop(last, rowRegion(150));
      const width = runLength(row, ROW.height / 2, isPurple);
      expect(width).toBeGreaterThanOrEqual(198);
      expect(width).toBeLessThanOrEqual(202);
    });

    test('percent box follows the new parent width', () => {
      const tweened = crop(last, rowRegion(0));
      const fresh = crop(last, rowRegion(150));
      expect(diffRatio(tweened, fresh)).toBeLessThan(MAX_DIFF);
    });
  });
});

describe('layout-tweens', () => {
  const SCENE = 'layout-tweens';
  const HALFWAY = 30;
  const isRed = (p: Pixel) => p.r > 200 && p.g < 40 && p.b < 40;
  const isBlue = (p: Pixel) => p.r < 40 && p.g < 40 && p.b > 200;
  const isGreen = (p: Pixel) => p.r < 40 && p.g > 130 && p.b < 40;
  const isOrange = (p: Pixel) =>
    p.r > 200 && p.g > 100 && p.g < 170 && p.b < 40;
  const isGray = (p: Pixel) => p.r === p.g && p.g === p.b && p.r < 200;
  const at = (image: PNG, x: number, y: number) =>
    pixelAt(image, CENTER_X + x, CENTER_Y + y);
  let page: Page;
  let halfway: PNG;
  let last: PNG;

  beforeAll(async () => {
    page = await openScene(SCENE);
    halfway = readPng(await renderFrame(page, SCENE, HALFWAY, 1));
    last = readPng(await renderFrame(page, SCENE, -1, 1));
  });

  afterAll(async () => {
    await page?.close();
  });

  describe('editLayout that moves a child of a parent without flex', () => {
    test('control: the child ends where the mutator put it', () => {
      expect(isRed(at(last, -550, -300))).toBe(true);
    });

    test('the child is halfway there at half the duration', () => {
      expect(isRed(at(halfway, -700, -300))).toBe(true);
    });
  });

  describe('thawLayout with children that inherit their layout', () => {
    test('control: the moved child ends in its slot', () => {
      expect(isBlue(at(last, -200, -300))).toBe(true);
    });

    test('the moved child is halfway there at half the duration', () => {
      expect(isBlue(at(halfway, -200, -180))).toBe(true);
    });
  });

  describe('changing the direction of a frozen layout in a padded parent', () => {
    test('control: the children stay where they were frozen', () => {
      expect(isGray(at(last, 480, -300))).toBe(true);
    });

    test('the parent keeps its size', () => {
      expect(isOrange(at(last, 265, -300))).toBe(true);
    });
  });

  describe('morphTo next to a sibling with its own translate', () => {
    const greenRows = (region: Region) => {
      const image = crop(last, region);
      let rows = 0;
      for (let y = 0; y < image.height; y++) {
        if (runLength(image, y, isGreen) > 0) rows++;
      }
      return rows;
    };

    test('control: the sibling is drawn', () => {
      expect(
        greenRows(around(CENTER_X - 600, CENTER_Y + 225, 400, 300)),
      ).toBeGreaterThan(50);
    });

    test.fails('the sibling keeps its translate after the tween', () => {
      expect(
        greenRows(around(CENTER_X - 600, CENTER_Y + 300, 400, 60)),
      ).toBeGreaterThan(50);
    });
  });

  describe('transitionTo into a parent with its own transform', () => {
    const LANDING = {width: 220, height: 220};
    const landing = (y: number) =>
      crop(
        last,
        around(CENTER_X + 512, CENTER_Y + y, LANDING.width, LANDING.height),
      );

    test('control: a plain insert draws the node in the parent', () => {
      expect(countForeground(landing(349), WHITE)).toBeGreaterThan(10000);
    });

    test.fails('lands where a plain insert puts the node', () => {
      expect(diffRatio(landing(99), landing(349))).toBeLessThan(MAX_DIFF);
    });
  });
});
