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

const SCENE = 'latex-edits';
const QUARTER = 15;
const HALFWAY = 30;
const FIRST_TWEEN_ENDED = 61;
const WHITE: Pixel = {r: 255, g: 255, b: 255, a: 255};
const MAX_DIFF = 0.001;
const MOVED = 0.004;
const CELL = {width: 480, height: 216};

/** The animated formula of a case; its static target is `CELL.width` to the right. */
function animated(index: number): Region {
  const column = (index % 2) * 2;
  return {
    x: 960 - 720 + column * 480 - CELL.width / 2,
    y: 540 - 432 + Math.floor(index / 2) * 216 - CELL.height / 2,
    ...CELL,
  };
}

function target(index: number): Region {
  const region = animated(index);
  return {...region, x: region.x + CELL.width};
}

/** The box around every dark pixel, or null when there is none. */
function inkBox(image: PNG): Region | null {
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (pixelAt(image, x, y).r < 247) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return right < 0
    ? null
    : {x: left, y: top, width: right - left + 1, height: bottom - top + 1};
}

describe('latex-edits', () => {
  let page: Page;
  let first: PNG;
  let quarter: PNG;
  let halfway: PNG;
  let afterFirstTween: PNG;
  let last: PNG;

  beforeAll(async () => {
    page = await openScene(SCENE);
    first = readPng(await renderFrame(page, SCENE, 0, 1));
    quarter = readPng(await renderFrame(page, SCENE, QUARTER, 1));
    halfway = readPng(await renderFrame(page, SCENE, HALFWAY, 1));
    afterFirstTween = readPng(
      await renderFrame(page, SCENE, FIRST_TWEEN_ENDED, 1),
    );
    last = readPng(await renderFrame(page, SCENE, -1, 1));
  });

  afterAll(async () => {
    await page?.close();
  });

  function endsAsTarget(index: number) {
    test('control: the target formula is drawn', () => {
      expect(countForeground(crop(last, target(index)), WHITE)).toBeGreaterThan(
        1000,
      );
    });

    test('ends as the target formula, with nothing of the old one', () => {
      expect(
        diffRatio(crop(last, animated(index)), crop(last, target(index))),
      ).toBeLessThan(MAX_DIFF);
    });
  }

  function inMotionAtHalfway(index: number) {
    test('is between its start and its end at half the duration', () => {
      const region = animated(index);
      expect(
        diffRatio(crop(halfway, region), crop(first, region)),
      ).toBeGreaterThan(MOVED);
      expect(
        diffRatio(crop(halfway, region), crop(last, region)),
      ).toBeGreaterThan(MOVED);
    });
  }

  function cancelledAtHalfway(index: number) {
    test('shows the target once the tween is cancelled', () => {
      const region = animated(index);
      expect(diffRatio(crop(halfway, region), crop(last, region))).toBeLessThan(
        MAX_DIFF,
      );
      expect(
        diffRatio(crop(halfway, region), crop(first, region)),
      ).toBeGreaterThan(MOVED);
    });
  }

  describe('edit with insert, morph and remove', () => {
    endsAsTarget(0);
    inMotionAtHalfway(0);
  });

  describe('replace started during an edit', () => {
    endsAsTarget(1);
    inMotionAtHalfway(1);
  });

  describe('edit cancelled at half the duration', () => {
    endsAsTarget(2);
    cancelledAtHalfway(2);
  });

  describe('map cancelled at half the duration', () => {
    endsAsTarget(3);
    cancelledAtHalfway(3);
  });

  describe('edit while the node scales and moves', () => {
    endsAsTarget(4);
    inMotionAtHalfway(4);
  });

  describe('template tween interrupted by a second one', () => {
    endsAsTarget(5);
    inMotionAtHalfway(5);

    test('keeps the second tween when the first one ends', () => {
      const region = animated(5);
      const firstTarget = animated(7);
      const frame = crop(afterFirstTween, region);
      expect(
        diffRatio(frame, crop(afterFirstTween, firstTarget)),
      ).toBeGreaterThan(MOVED);
      expect(diffRatio(frame, crop(last, region))).toBeGreaterThan(MOVED);
    });
  });

  describe('map that runs to the end', () => {
    endsAsTarget(6);
    inMotionAtHalfway(6);

    test('moves from the start of the tween, like the cancelled map', () => {
      const region = animated(6);
      expect(
        diffRatio(crop(quarter, region), crop(first, region)),
      ).toBeGreaterThan(MOVED);
      expect(
        diffRatio(crop(quarter, region), crop(quarter, animated(3))),
      ).toBeLessThan(MAX_DIFF);
    });
  });

  describe('incoming glyph that grows without fading', () => {
    endsAsTarget(8);

    test('is drawn in full ink but smaller than at the end', () => {
      const halfwayBox = inkBox(crop(halfway, animated(8)));
      const lastBox = inkBox(crop(last, animated(8)));
      if (!halfwayBox || !lastBox) throw new Error('no ink');
      expect(halfwayBox.width * halfwayBox.height).toBeLessThan(
        lastBox.width * lastBox.height * 0.85,
      );
    });
  });
});
