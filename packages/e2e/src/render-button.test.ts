import * as fs from 'fs';
import * as path from 'path';
import {Page} from 'playwright';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {openScene} from './helpers/render';

// Catches regressions in the wiring between the editor's #render button and
// the renderer. Frame-content correctness is in scenes.test.ts.
describe('Render button', () => {
  let page: Page;

  beforeAll(async () => {
    page = await openScene('quickstart');
  });

  afterAll(async () => {
    await page.close();
  });

  test('clicking #render renders the scene to disk', async () => {
    const outputDir = path.resolve(process.cwd(), 'output/quickstart');
    await fs.promises.rm(outputDir, {recursive: true, force: true});

    await page.waitForSelector('#render:not([data-rendering="true"])');
    await page.click('#render');
    await page.waitForSelector('#render[data-rendering="true"]', {
      timeout: 10000,
    });
    await page.waitForSelector('#render:not([data-rendering="true"])', {
      timeout: 90000,
    });

    const frames = await collectPngs(outputDir);
    expect(frames.length).toBeGreaterThan(0);
  }, 120000);
});

async function collectPngs(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.promises.readdir(dir, {withFileTypes: true});
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectPngs(full)));
    } else if (entry.name.endsWith('.png')) {
      out.push(full);
    }
  }
  return out;
}
