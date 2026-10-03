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

const SCENE = 'render-crossings';
const WHITE: Pixel = {r: 255, g: 255, b: 255, a: 255};
const CELL_WIDTH = 380;
const CELL_HEIGHT = 380;
const COLUMN_CENTERS = [192, 576, 960, 1344, 1728];
const SUBJECT_CENTER_Y = 270;
const REFERENCE_CENTER_Y = 810;
const MAX_DIFF = 0.001;

interface Cell {
  subject: PNG;
  reference: PNG;
}

function cellRegion(column: number, centerY: number): Region {
  return {
    x: COLUMN_CENTERS[column] - CELL_WIDTH / 2,
    y: centerY - CELL_HEIGHT / 2,
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
  };
}

function cellAt(frame: PNG, column: number): Cell {
  return {
    subject: crop(frame, cellRegion(column, SUBJECT_CENTER_Y)),
    reference: crop(frame, cellRegion(column, REFERENCE_CENTER_Y)),
  };
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

  describe('cached parent with a scaled blurred child', () => {
    test('control: the reference has a soft edge', () => {
      const {reference} = cellAt(frame, 0);
      const row = crop(reference, {
        x: 0,
        y: CELL_HEIGHT / 2 - 1,
        width: CELL_WIDTH,
        height: 3,
      });
      let soft = 0;
      for (let y = 0; y < row.height; y++) {
        for (let x = 0; x < row.width; x++) {
          const {r} = pixelAt(row, x, y);
          if (r > 10 && r < 245) soft++;
        }
      }
      expect(soft).toBeGreaterThan(100);
    });

    test.fails('cached parent does not clip the blur of a scaled child', () => {
      const {subject, reference} = cellAt(frame, 0);
      expect(diffRatio(subject, reference)).toBeLessThan(MAX_DIFF);
    });
  });

  describe('cached text with a tight line height', () => {
    const lineBoxTop = CELL_HEIGHT / 2 - 36;

    test('control: glyphs overshoot the line box in the reference', () => {
      const {reference} = cellAt(frame, 1);
      const above = crop(reference, {
        x: 0,
        y: 0,
        width: CELL_WIDTH,
        height: lineBoxTop,
      });
      expect(countForeground(above, WHITE)).toBeGreaterThan(50);
    });

    test.fails('cached text does not clip overshooting glyphs', () => {
      const {subject, reference} = cellAt(frame, 1);
      expect(diffRatio(subject, reference)).toBeLessThan(MAX_DIFF);
    });
  });

  describe('cached composite parent with a rotated, scaled blurred child', () => {
    test('control: the reference draws the blurred child', () => {
      const {reference} = cellAt(frame, 2);
      expect(countForeground(reference, WHITE)).toBeGreaterThan(5000);
    });

    test.fails('cached parent does not clip the blur of the child', () => {
      const {subject, reference} = cellAt(frame, 2);
      expect(diffRatio(subject, reference)).toBeLessThan(MAX_DIFF);
    });
  });

  describe('cached italic text', () => {
    test('control: the reference draws the italic text', () => {
      const {reference} = cellAt(frame, 3);
      expect(countForeground(reference, WHITE)).toBeGreaterThan(1000);
    });

    test('cached text does not clip italic glyph overhang', () => {
      const {subject, reference} = cellAt(frame, 3);
      expect(diffRatio(subject, reference)).toBeLessThan(MAX_DIFF);
    });
  });

  describe('cached composite parent with a non-uniform scale', () => {
    test('control: the reference draws the blurred child', () => {
      const {reference} = cellAt(frame, 4);
      expect(countForeground(reference, WHITE)).toBeGreaterThan(5000);
    });

    test.fails('cached parent does not clip the isotropic blur', () => {
      const {subject, reference} = cellAt(frame, 4);
      expect(diffRatio(subject, reference)).toBeLessThan(MAX_DIFF);
    });
  });
});
