import pixelmatch from 'pixelmatch';
import {PNG} from 'pngjs';

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Pixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function readPng(buffer: Buffer): PNG {
  return PNG.sync.read(buffer);
}

export function crop(image: PNG, region: Region): PNG {
  const result = new PNG({width: region.width, height: region.height});
  PNG.bitblt(
    image,
    result,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
  );
  return result;
}

export function pixelAt(image: PNG, x: number, y: number): Pixel {
  const index = (image.width * y + x) * 4;
  return {
    r: image.data[index],
    g: image.data[index + 1],
    b: image.data[index + 2],
    a: image.data[index + 3],
  };
}

/** Fraction of pixels that differ, from 0 to 1. Both images must be the same size. */
export function diffRatio(a: PNG, b: PNG, threshold = 0.1): number {
  const changed = pixelmatch(a.data, b.data, null, a.width, a.height, {
    threshold,
  });
  return changed / (a.width * a.height);
}

/** Pixels whose color differs from `background` by more than `tolerance` in any channel. */
export function countForeground(
  image: PNG,
  background: Pixel,
  tolerance = 8,
): number {
  let count = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const pixel = pixelAt(image, x, y);
      if (
        Math.abs(pixel.r - background.r) > tolerance ||
        Math.abs(pixel.g - background.g) > tolerance ||
        Math.abs(pixel.b - background.b) > tolerance ||
        Math.abs(pixel.a - background.a) > tolerance
      ) {
        count++;
      }
    }
  }
  return count;
}
