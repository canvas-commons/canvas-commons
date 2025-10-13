import * as fs from 'fs';
import {toMatchImageSnapshot} from 'jest-image-snapshot';
import * as path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {App, start} from './app';
import {readFrameFromScene, renderSingleFrame} from './test-helpers';

expect.extend({toMatchImageSnapshot});

describe('Node Signal', () => {
  let app: App;
  const sceneName = 'node-signal';
  const projectMetaPath = path.join(
    process.cwd(),
    'tests',
    'projects',
    'node-signal.meta',
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
    const initialFrame = 0; // radius = 3
    const midFrame = 60; // radius = 4 (after first tween)
    const finalFrame = 120; // radius = 3 (after second tween)

    // Render initial frame (switch to project)
    await renderSingleFrame(app.page, sceneName, initialFrame);
    const initialImage = await readFrameFromScene(sceneName, initialFrame);
    expect(initialImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'node-signal-initial',
    });

    // Render mid frame (stay on same project, no reload)
    await renderSingleFrame(app.page, null, midFrame);
    const midImage = await readFrameFromScene(sceneName, midFrame);
    expect(midImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'node-signal-mid',
    });

    // Render final frame (stay on same project, no reload)
    await renderSingleFrame(app.page, null, finalFrame);
    const finalImage = await readFrameFromScene(sceneName, finalFrame);
    expect(finalImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'node-signal-final',
    });
  }, 30000);
});
