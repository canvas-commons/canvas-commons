import {Page} from 'playwright';
import {PNG} from 'pngjs';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {SvgWidth, casePosition, svgCases} from '../tests/scenes/svg-cases';
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

const Black: Pixel = {r: 0, g: 0, b: 0, a: 255};
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

function isMagenta({r, g, b}: Pixel): boolean {
  return r > 200 && g < 60 && b > 200;
}

function magentaCentroid(image: PNG): {x: number; y: number; count: number} {
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (isMagenta(pixelAt(image, x, y))) {
        count++;
        sumX += x;
        sumY += y;
      }
    }
  }
  return {x: sumX / Math.max(count, 1), y: sumY / Math.max(count, 1), count};
}

function rowRun(image: PNG, y: number, matches: (pixel: Pixel) => boolean) {
  let count = 0;
  for (let x = 0; x < image.width; x++) {
    if (matches(pixelAt(image, x, y))) {
      count++;
    }
  }
  return count;
}

describe('camera-follow', () => {
  const stages = {
    follow: around(-400, 0, 600, 400),
    center: around(400, 0, 600, 400),
  };
  let page: Page;
  let final: PNG;

  beforeAll(async () => {
    page = await openScene('camera-follow');
    final = readPng(await renderFrame(page, 'camera-follow', -1, 1));
  });

  afterAll(async () => {
    await page?.close();
  });

  test('control: centerOn puts the marker at the stage center', () => {
    const {x, y, count} = magentaCentroid(crop(final, stages.center));
    expect(count).toBeGreaterThan(200);
    expect(Math.abs(x - 300)).toBeLessThan(5);
    expect(Math.abs(y - 200)).toBeLessThan(5);
  });

  test.fails('followCurve ends centered on the curve end', () => {
    expect(
      diffRatio(crop(final, stages.follow), crop(final, stages.center)),
    ).toBeLessThan(0.001);
  });
});

describe('camera-clone', () => {
  const stages = {
    original: around(-600, 0, 500, 360),
    independent: around(0, 0, 500, 360),
    clone: around(600, 0, 500, 360),
  };
  let page: Page;
  let frame: PNG;

  beforeAll(async () => {
    page = await openScene('camera-clone');
    frame = readPng(await renderFrame(page, 'camera-clone', 0, 1));
  });

  afterAll(async () => {
    await page?.close();
  });

  test('control: zoom 2 draws a 50 px shape 100 px wide', () => {
    const view = crop(frame, stages.independent);
    const red = (pixel: Pixel) => pixel.r > 200 && pixel.g < 60 && pixel.b < 60;
    expect(rowRun(view, view.height / 2, red)).toBeGreaterThanOrEqual(98);
    expect(rowRun(view, view.height / 2, red)).toBeLessThanOrEqual(102);
  });

  test('a cloned camera renders its own zoomed view', () => {
    const independent = crop(frame, stages.independent);
    expect(diffRatio(crop(frame, stages.original), independent)).toBeLessThan(
      0.001,
    );
    expect(diffRatio(crop(frame, stages.clone), independent)).toBeLessThan(
      0.001,
    );
  });
});

describe('svg-import', () => {
  let page: Page;
  let frame: PNG;

  beforeAll(async () => {
    page = await openScene('svg-import');
    frame = readPng(await renderFrame(page, 'svg-import', 0, 1));
  });

  afterAll(async () => {
    await page?.close();
  });

  function cropCase(index: number, side: 'subject' | 'reference') {
    const svgCase = svgCases[index];
    const cell = casePosition(index)[side];
    const region = svgCase.region ?? {
      x: -SvgWidth / 2,
      y: -SvgWidth / 2,
      width: SvgWidth,
      height: SvgWidth,
    };
    return crop(
      frame,
      around(
        cell.x + region.x + region.width / 2,
        cell.y + region.y + region.height / 2,
        region.width,
        region.height,
      ),
    );
  }

  svgCases.forEach((svgCase, index) => {
    const isOverBackdrop = svgCase.backdrop !== undefined;

    test(`control: the reference draws (${svgCase.name})`, () => {
      const reference = cropCase(index, 'reference');
      if (isOverBackdrop) {
        const center = pixelAt(
          reference,
          reference.width / 2,
          reference.height / 2,
        );
        expect(Math.abs(center.r - 191)).toBeLessThanOrEqual(4);
      } else {
        expect(countForeground(reference, Black)).toBeGreaterThan(1000);
      }
    });

    test.fails(`${svgCase.name}`, () => {
      expect(
        diffRatio(cropCase(index, 'subject'), cropCase(index, 'reference')),
      ).toBeLessThan(0.001);
    });
  });
});
