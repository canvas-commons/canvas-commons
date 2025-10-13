import * as fs from 'fs';
import {toMatchImageSnapshot} from 'jest-image-snapshot';
import * as path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {App, start} from './app';
import {readFrameFromScene, renderSingleFrame} from './test-helpers';

expect.extend({toMatchImageSnapshot});

describe('Position Tweening', () => {
  let app: App;
  const sceneName = 'position-tweening';
  const projectMetaPath = path.join(
    process.cwd(),
    'tests',
    'projects',
    'position-tweening.meta',
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
    const initialFrame = 0; // initial layout
    const gapTweenFrame = 30; // during gap tweening
    const midRotationFrame = 90; // during rotation
    const finalFrame = 150; // final transformed state

    await renderSingleFrame(app.page, sceneName, initialFrame);
    const initialImage = await readFrameFromScene(sceneName, initialFrame);
    expect(initialImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'position-initial',
    });

    await renderSingleFrame(app.page, null, gapTweenFrame);
    const gapTweenImage = await readFrameFromScene(sceneName, gapTweenFrame);
    expect(gapTweenImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'position-gap-tween',
    });

    await renderSingleFrame(app.page, null, midRotationFrame);
    const midRotationImage = await readFrameFromScene(
      sceneName,
      midRotationFrame,
    );
    expect(midRotationImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'position-mid-rotation',
    });

    await renderSingleFrame(app.page, null, finalFrame);
    const finalImage = await readFrameFromScene(sceneName, finalFrame);
    expect(finalImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'position-final',
    });
  }, 30000);
});
