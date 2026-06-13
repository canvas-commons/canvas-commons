import pixelmatch from 'pixelmatch';
import {Page} from 'playwright';
import {PNG} from 'pngjs';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {openScene, renderFrame} from './helpers/render';

function diffPixels(a: PNG, b: PNG): number {
  return pixelmatch(a.data, b.data, null, a.width, a.height, {threshold: 0.1});
}

describe('text-split', () => {
  let page: Page;

  beforeAll(async () => {
    page = await openScene('text-split');
  });

  afterAll(async () => {
    await page?.close();
  });

  // The scene shows the source until 0.2s, swaps to the per-unit exploded copy
  // (held static until 0.4s), then to a whole-string clone for the last frame.
  // Identical draw calls in the same browser produce identical pixels, so the
  // whole-clone diff pins the pipeline as deterministic and the exploded diff
  // measures the per-unit positioning math.
  test('exploded text matches the original render', async () => {
    const fps: number = await page.evaluate(
      () => window.commons.meta.getFullRenderingSettings().fps,
    );
    // Mid of the 0.2s–0.4s window where the exploded copy is shown and static.
    const explodedFrame = Math.round(0.3 * fps);

    const source = PNG.sync.read(await renderFrame(page, 'text-split', 0));
    const exploded = PNG.sync.read(
      await renderFrame(page, 'text-split', explodedFrame),
    );
    const whole = PNG.sync.read(await renderFrame(page, 'text-split', -1));
    const total = source.width * source.height;

    // A whole-string clone reproduces the source exactly, so the exploded diff
    // is attributable to per-unit positioning, not render noise.
    expect(diffPixels(source, whole)).toBeLessThan(total * 0.0005);
    // Both blocks explode to graphemes; the kerning-invariant pen plus
    // own-box-derived center positioning reproduces the source pixel-for-pixel
    // (0px in CI; the small tolerance only absorbs cross-environment AA).
    expect(diffPixels(source, exploded)).toBeLessThan(total * 0.001);
  });
});
