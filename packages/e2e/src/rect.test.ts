import * as fs from 'fs';
import {toMatchImageSnapshot} from 'jest-image-snapshot';
import * as path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {App, start} from './app';
import {
  applyRenderSettings,
  readFrameFromScene,
  renderSingleFrame,
} from './test-helpers';

expect.extend({toMatchImageSnapshot});

describe('Rect', () => {
  let app: App;
  const sceneName = 'rect';
  const projectMetaPath = path.join(
    process.cwd(),
    'tests',
    'projects',
    'rect.meta',
  );
  let originalProjectMeta: string;

  beforeAll(async () => {
    originalProjectMeta = await fs.promises.readFile(projectMetaPath, 'utf-8');

    app = await start(sceneName);
  });

  afterAll(async () => {
    await app.stop();

    await fs.promises.writeFile(projectMetaPath, originalProjectMeta, 'utf-8');
  });

  test('renders correctly', async () => {
    await applyRenderSettings(app.page, {height: 320, width: 320});
    await renderSingleFrame(app.page, sceneName, 0, {height: 320, width: 320});

    const frame = await readFrameFromScene(sceneName, 0);
    expect(frame).toMatchImageSnapshot({
      customSnapshotIdentifier: 'rect',
    });
  });
});
