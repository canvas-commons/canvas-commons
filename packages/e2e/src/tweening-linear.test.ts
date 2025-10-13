import * as fs from 'fs';
import {toMatchImageSnapshot} from 'jest-image-snapshot';
import * as path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {App, start} from './app';
import {readFrameFromScene, renderSingleFrame} from './test-helpers';

expect.extend({toMatchImageSnapshot});

describe('Tweening Linear', () => {
  let app: App;
  const sceneName = 'tweening-linear';
  const projectMetaPath = path.join(
    process.cwd(),
    'tests',
    'projects',
    'tweening-linear.meta',
  );
  let originalProjectMeta: string;

  beforeAll(async () => {
    // Backup the project meta file to avoid range pollution between tests
    originalProjectMeta = await fs.promises.readFile(projectMetaPath, 'utf-8');

    app = await start(sceneName);
  });

  afterAll(async () => {
    await app.stop();

    // Restore the original project meta file
    await fs.promises.writeFile(projectMetaPath, originalProjectMeta, 'utf-8');
  });

  test('renders key frames correctly', async () => {
    // Frame numbers for key points in the animation at 30fps
    const initialFrame = 0; // circle at left (-300)
    const midFrame = 30; // circle at center (0)
    const finalFrame = 60; // circle at right (300)

    // Render initial frame (switch to project)
    await renderSingleFrame(app.page, sceneName, initialFrame);
    const initialImage = await readFrameFromScene(sceneName, initialFrame);
    expect(initialImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'tweening-linear-initial',
    });

    // Render mid frame (stay on same project, no reload)
    await renderSingleFrame(app.page, null, midFrame);
    const midImage = await readFrameFromScene(sceneName, midFrame);
    expect(midImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'tweening-linear-mid',
    });

    // Render final frame (stay on same project, no reload)
    await renderSingleFrame(app.page, null, finalFrame);
    const finalImage = await readFrameFromScene(sceneName, finalFrame);
    expect(finalImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'tweening-linear-final',
    });
  }, 30000);
});
