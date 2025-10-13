import * as fs from 'fs';
import {toMatchImageSnapshot} from 'jest-image-snapshot';
import * as path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {App, start} from './app';
import {readFrameFromScene, renderSingleFrame} from './test-helpers';

expect.extend({toMatchImageSnapshot});

describe('Layout', () => {
  let app: App;
  const sceneName = 'layout';
  const projectMetaPath = path.join(
    process.cwd(),
    'tests',
    'projects',
    'layout.meta',
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
    const initialFrame = 0; // initial layout state
    const firstChangeFrame = 24; // after first layout change (colB and colA grow)
    const secondChangeFrame = 48; // after rowA grow
    const finalFrame = 96; // final state (back to original proportions)

    // Render initial frame (switch to project)
    await renderSingleFrame(app.page, sceneName, initialFrame);
    const initialImage = await readFrameFromScene(sceneName, initialFrame);
    expect(initialImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'layout-initial',
    });

    // Render first change frame (stay on same project, no reload)
    await renderSingleFrame(app.page, null, firstChangeFrame);
    const firstChangeImage = await readFrameFromScene(
      sceneName,
      firstChangeFrame,
    );
    expect(firstChangeImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'layout-first-change',
    });

    // Render second change frame (stay on same project, no reload)
    await renderSingleFrame(app.page, null, secondChangeFrame);
    const secondChangeImage = await readFrameFromScene(
      sceneName,
      secondChangeFrame,
    );
    expect(secondChangeImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'layout-second-change',
    });

    // Render final frame (stay on same project, no reload)
    await renderSingleFrame(app.page, null, finalFrame);
    const finalImage = await readFrameFromScene(sceneName, finalFrame);
    expect(finalImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'layout-final',
    });
  }, 30000);
});
