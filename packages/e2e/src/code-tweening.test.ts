import * as fs from 'fs';
import {toMatchImageSnapshot} from 'jest-image-snapshot';
import * as path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {App, start} from './app';
import {readFrameFromScene, renderSingleFrame} from './test-helpers';

expect.extend({toMatchImageSnapshot});

describe('Code Tweening', () => {
  let app: App;
  const sceneName = 'code-tweening';
  const projectMetaPath = path.join(
    process.cwd(),
    'tests',
    'projects',
    'code-tweening.meta',
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

  test('renders key frames correctly', async () => {
    const initialFrame = 0; // value = 5
    const midFrame = 30; // value = 12.5 (midpoint of tween)
    const finalFrame = 75; // value = 20

    await renderSingleFrame(app.page, sceneName, initialFrame);
    const initialImage = await readFrameFromScene(sceneName, initialFrame);
    expect(initialImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-tweening-initial',
    });

    await renderSingleFrame(app.page, null, midFrame);
    const midImage = await readFrameFromScene(sceneName, midFrame);
    expect(midImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-tweening-mid',
    });

    await renderSingleFrame(app.page, null, finalFrame);
    const finalImage = await readFrameFromScene(sceneName, finalFrame);
    expect(finalImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-tweening-final',
    });
  }, 30000);
});
