import {toMatchImageSnapshot} from 'jest-image-snapshot';
import {Page} from 'playwright';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {openScene, renderFrame} from './helpers/render';
import {testFrames} from './testFrames';

expect.extend({toMatchImageSnapshot});

for (const [sceneName, frames] of Object.entries(testFrames)) {
  describe(sceneName, () => {
    let page: Page;

    beforeAll(async () => {
      page = await openScene(sceneName);
    });

    afterAll(async () => {
      await page?.close();
    });

    test.each(frames)('frame $label', async ({frame, label}) => {
      const buffer = await renderFrame(page, sceneName, frame);
      expect(buffer).toMatchImageSnapshot({
        customSnapshotIdentifier: `${sceneName}-${label}`,
      });
    });
  });
}
