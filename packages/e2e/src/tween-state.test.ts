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

const Scene = 'tween-state';
const Black: Pixel = {r: 0, g: 0, b: 0, a: 255};
const Red: Pixel = {r: 255, g: 0, b: 0, a: 255};
const Green: Pixel = {r: 0, g: 255, b: 0, a: 255};
const CenterX = 960;
const CenterY = 540;

function around(x: number, y: number, width: number, height: number): Region {
  return {
    x: CenterX + x - width / 2,
    y: CenterY + y - height / 2,
    width,
    height,
  };
}

const ScaleCells = {
  subject: around(-400, -330, 240, 240),
  reference: around(400, -330, 240, 240),
};
const CodeCells = {
  subject: around(-400, 0, 300, 200),
  reference: around(400, 0, 300, 200),
};
const MixedCell = around(0, 0, 120, 120);
const TexCells = {
  subject: around(-400, 330, 600, 240),
  reference: around(400, 330, 600, 240),
};

function brightness(image: PNG, region: Region): number {
  const part = crop(image, region);
  let total = 0;
  for (let i = 0; i < part.data.length; i += 4) {
    total += part.data[i] + part.data[i + 1] + part.data[i + 2];
  }
  return total / (part.width * part.height * 3);
}

function upperHalf(region: Region): Region {
  return {...region, height: region.height / 2};
}

function lowerHalf(region: Region): Region {
  return {
    ...region,
    y: region.y + region.height / 2,
    height: region.height / 2,
  };
}

describe(Scene, () => {
  let page: Page;
  let first: PNG;
  let selectionStart: PNG;
  let selectionMid: PNG;
  let texBeforeSet: PNG;
  let texAfterSet: PNG;
  let texCancelMid: PNG;
  let final: PNG;

  beforeAll(async () => {
    page = await openScene(Scene);
    const fps: number = await page.evaluate(
      () => window.commons.meta.getFullRenderingSettings().fps,
    );
    const at = async (seconds: number) =>
      readPng(await renderFrame(page, Scene, Math.round(seconds * fps), 1));
    first = await at(0);
    selectionStart = await at(1);
    selectionMid = await at(1.25);
    // The scene holds the tweened formula between 2.4 s and 2.9 s.
    texBeforeSet = await at(2.7);
    texAfterSet = await at(3.1);
    texCancelMid = await at(3.7);
    final = readPng(await renderFrame(page, Scene, -1, 1));
  });

  afterAll(async () => {
    await page?.close();
  });

  test('control: the subject starts at scale 3 and the reference is natural size', () => {
    const band = around(-400, -400, 700, 200);
    expect(countForeground(crop(first, band), Black)).toBeGreaterThan(110000);
    expect(
      countForeground(crop(final, ScaleCells.reference), Black),
    ).toBeGreaterThan(30000);
  });

  test.fails('tweening scale to DEFAULT restores the initial scale', () => {
    expect(
      diffRatio(
        crop(final, ScaleCells.subject),
        crop(final, ScaleCells.reference),
      ),
    ).toBeLessThan(0.001);
  });

  test('control: the selection tween blends the first line before it is cancelled', () => {
    const start = brightness(selectionStart, upperHalf(CodeCells.subject));
    const mid = brightness(selectionMid, upperHalf(CodeCells.subject));
    const resting = brightness(final, upperHalf(CodeCells.reference));
    const lower = brightness(final, lowerHalf(CodeCells.reference));
    expect(lower).toBeGreaterThan(resting * 2);
    expect(start).toBeGreaterThan(resting * 2);
    expect(mid).toBeLessThan(start * 0.98);
    expect(mid).toBeGreaterThan(resting * 1.02);
  });

  test.fails('a cancelled selection tween leaves no blend', () => {
    expect(
      diffRatio(
        crop(final, CodeCells.subject),
        crop(final, CodeCells.reference),
      ),
    ).toBeLessThan(0.001);
  });

  test('control: the held formula is y^3 and differs from z^4', () => {
    const held = crop(texBeforeSet, TexCells.subject);
    const heldReference = crop(texBeforeSet, TexCells.reference);
    expect(countForeground(held, Black)).toBeGreaterThan(1000);
    expect(diffRatio(held, heldReference)).toBeLessThan(0.0015);
    expect(
      diffRatio(heldReference, crop(final, TexCells.reference)),
    ).toBeGreaterThan(0.005);
  });

  test.fails('Latex follows tex set after a tween', () => {
    expect(
      diffRatio(
        crop(texAfterSet, TexCells.subject),
        crop(texAfterSet, TexCells.reference),
      ),
    ).toBeLessThan(0.0015);
  });

  test('control: a tex tween in flight differs from the resting formula', () => {
    expect(
      diffRatio(
        crop(texCancelMid, TexCells.subject),
        crop(texCancelMid, TexCells.reference),
      ),
    ).toBeGreaterThan(0.005);
  });

  test.fails('a cancelled tex tween restores the formula', () => {
    expect(
      diffRatio(crop(final, TexCells.subject), crop(final, TexCells.reference)),
    ).toBeLessThan(0.0015);
  });

  test('control: the mixed-type signal starts as a number', () => {
    expect(countForeground(crop(first, MixedCell), Green)).toBeGreaterThan(
      10000,
    );
  });

  test.fails('tweening a signal to a different type ends at the target', () => {
    expect(countForeground(crop(final, MixedCell), Red)).toBeGreaterThan(10000);
  });
});
