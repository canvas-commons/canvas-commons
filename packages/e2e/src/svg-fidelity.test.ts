import * as fs from 'fs';
import {toMatchImageSnapshot} from 'jest-image-snapshot';
import {Page} from 'playwright';
import {fileURLToPath} from 'url';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {rasterizeSvg} from './helpers/rasterize';
import {openScene, renderFrameSVG} from './helpers/render';
import {svgFidelityFrames} from './testFrames';

expect.extend({toMatchImageSnapshot});

/**
 * Renders each scene to SVG, rasterizes it, and compares it against the canvas
 * PNG baseline — the canvas render is authoritative, so this reuses its
 * snapshots rather than committing its own. Because of that, never run this file
 * with `-u`: it would overwrite the canvas baselines with the SVG raster.
 */
// Allowed whole-frame divergence (0.15%) and per-pixel colour tolerance, the
// latter absorbing anti-aliasing between the canvas and SVG render paths. The
// frame budget is set by the worst faithful case: glyph-dense scenes like `tex`,
// where edge anti-aliasing adds up over hundreds of MathJax contours.
const FAILURE_THRESHOLD = 0.0015;
const DIFF_PIXEL_THRESHOLD = 0.1;

for (const [sceneName, frames] of Object.entries(svgFidelityFrames)) {
  describe(`svg-fidelity: ${sceneName}`, () => {
    let page: Page;

    beforeAll(async () => {
      page = await openScene(sceneName);
    });

    afterAll(async () => {
      await page?.close();
    });

    test.each(frames)('frame $label', async ({frame, label}) => {
      const identifier = `${sceneName}-${label}`;
      const baselinePath = fileURLToPath(
        new URL(`./__image_snapshots__/${identifier}.png`, import.meta.url),
      );
      if (!fs.existsSync(baselinePath)) {
        throw new Error(
          `Missing canvas baseline ${identifier}.png — render it via scenes.test.ts first.`,
        );
      }

      const svg = await renderFrameSVG(page, sceneName, frame);
      const raster = await rasterizeSvg(page, svg);

      expect(raster).toMatchImageSnapshot({
        customSnapshotIdentifier: identifier,
        failureThreshold: FAILURE_THRESHOLD,
        failureThresholdType: 'percent',
        customDiffConfig: {threshold: DIFF_PIXEL_THRESHOLD},
      });
    });
  });
}
