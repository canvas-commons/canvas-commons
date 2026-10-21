import {Page} from 'playwright';
import {PNG} from 'pngjs';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {
  Pixel,
  Region,
  countForeground,
  crop,
  diffRatio,
  readPng,
} from './helpers/pixels';
import {openScene, renderFrame} from './helpers/render';

const SCENE = 'code-edits';
const WHITE: Pixel = {r: 255, g: 255, b: 255, a: 255};
const MAX_DIFF = 0.001;
const HALFWAY = 30;
const AFTER_CANCEL = 40;
const ROW_TOP = 140;
const ROW_HEIGHT = 200;
const BOX = {width: 600, height: 60};
const EDITED_CENTER_X = 360;
const CONTROL_CENTER_X = 1560;
const BASE_FONT_SIZE = 36;
const GLYPH_ADVANCE = 20 / BASE_FONT_SIZE;
const MIN_INK = 30;

const Row = {mixed: 0, disjoint: 1, overlapping: 2, cancelled: 3, resized: 4};

function boxAt(row: number, centerX: number): Region {
  return {
    x: centerX - BOX.width / 2,
    y: ROW_TOP + row * ROW_HEIGHT,
    ...BOX,
  };
}

/** Columns `from` to `to` (inclusive) of a centered row of `length` glyphs. */
function columns(
  row: number,
  length: number,
  from: number,
  to: number,
  fontSize = BASE_FONT_SIZE,
): Region {
  const advance = fontSize * GLYPH_ADVANCE;
  const left = EDITED_CENTER_X - (length * advance) / 2;
  return {
    x: Math.round(left + from * advance),
    y: ROW_TOP + row * ROW_HEIGHT,
    width: Math.round((to - from + 1) * advance),
    height: BOX.height,
  };
}

function inkRows(image: PNG, region: Region): number {
  const part = crop(image, region);
  let rows = 0;
  for (let y = 0; y < part.height; y++) {
    const row = crop(part, {x: 0, y, width: part.width, height: 1});
    if (countForeground(row, WHITE) > 0) rows++;
  }
  return rows;
}

describe('code-edits', () => {
  let page: Page;
  let first: PNG;
  let halfway: PNG;
  let afterCancel: PNG;
  let last: PNG;

  const hasInk = (image: PNG, region: Region) =>
    countForeground(crop(image, region), WHITE) > MIN_INK;
  const matchesControl = (image: PNG, row: number) =>
    diffRatio(
      crop(image, boxAt(row, EDITED_CENTER_X)),
      crop(image, boxAt(row, CONTROL_CENTER_X)),
    );
  const unchangedAtHalfway = (region: Region) =>
    diffRatio(crop(first, region), crop(halfway, region));

  beforeAll(async () => {
    page = await openScene(SCENE);
    first = readPng(await renderFrame(page, SCENE, 0, 1));
    halfway = readPng(await renderFrame(page, SCENE, HALFWAY, 1));
    afterCancel = readPng(await renderFrame(page, SCENE, AFTER_CANCEL, 1));
    last = readPng(await renderFrame(page, SCENE, -1, 1));
  });

  afterAll(async () => {
    await page?.close();
  });

  describe('an edit with insert, replace and remove fragments', () => {
    test('control: the first frame draws the source', () => {
      expect(hasInk(first, columns(Row.mixed, 13, 11, 12))).toBe(true);
    });

    test('draws the replaced and inserted tokens', () => {
      expect(hasInk(last, columns(Row.mixed, 11, 2, 4))).toBe(true);
      expect(hasInk(last, columns(Row.mixed, 11, 10, 10))).toBe(true);
    });

    test('removes the removed token', () => {
      expect(hasInk(last, columns(Row.mixed, 11, 11, 15))).toBe(false);
    });

    test('ends as the code written out', () => {
      expect(matchesControl(last, Row.mixed)).toBeLessThan(MAX_DIFF);
    });
  });

  describe('a second edit that starts at 30% on a disjoint range', () => {
    test('control: the first frame draws the untouched word', () => {
      expect(hasInk(first, columns(Row.disjoint, 14, 5, 8))).toBe(true);
    });

    test('keeps the untouched word in place', () => {
      expect(unchangedAtHalfway(columns(Row.disjoint, 14, 5, 8))).toBeLessThan(
        MAX_DIFF,
      );
    });

    test('ends as the code written out', () => {
      expect(matchesControl(last, Row.disjoint)).toBeLessThan(MAX_DIFF);
    });
  });

  describe('a second edit that starts at 30% on an overlapping range', () => {
    test('keeps the untouched word in place', () => {
      expect(
        unchangedAtHalfway(columns(Row.overlapping, 14, 5, 8)),
      ).toBeLessThan(MAX_DIFF);
    });

    test('ends as the second edit target', () => {
      expect(matchesControl(last, Row.overlapping)).toBeLessThan(MAX_DIFF);
    });
  });

  describe('an edit cancelled at 50%', () => {
    test('control: the first frame draws the source', () => {
      expect(hasInk(first, columns(Row.cancelled, 14, 0, 3))).toBe(true);
    });

    test('keeps the state it was cancelled in', () => {
      const region = boxAt(Row.cancelled, EDITED_CENTER_X);
      expect(
        diffRatio(crop(afterCancel, region), crop(last, region)),
      ).toBeLessThan(MAX_DIFF);
    });

    test('ends as the target of the edit', () => {
      expect(matchesControl(last, Row.cancelled)).toBeLessThan(MAX_DIFF);
    });
  });

  describe('an edit while the font size tweens', () => {
    const resizedFontSize = 54;
    const glyphHeight = (image: PNG) =>
      inkRows(image, boxAt(Row.resized, EDITED_CENTER_X));

    test('control: the font grows over the animation', () => {
      expect(glyphHeight(last)).toBeGreaterThan(glyphHeight(first) * 1.5);
    });

    test('ends as the code written out at the final font size', () => {
      expect(matchesControl(last, Row.resized)).toBeLessThan(MAX_DIFF);
      expect(
        hasInk(last, columns(Row.resized, 12, 5, 6, resizedFontSize)),
      ).toBe(true);
    });
  });
});
