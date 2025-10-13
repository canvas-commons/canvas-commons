import * as fs from 'fs';
import {toMatchImageSnapshot} from 'jest-image-snapshot';
import * as path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {App, start} from './app';
import {readFrameFromScene, renderSingleFrame} from './test-helpers';

expect.extend({toMatchImageSnapshot});

describe('Spline Tweening', () => {
  let app: App;
  const sceneName = 'spline-tweening';
  const projectMetaPath = path.join(
    process.cwd(),
    'tests',
    'projects',
    'spline-tweening.meta',
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
    const initialFrame = 0; // initial state
    const quarterFrame = 36; // circle partway along spline
    const transformMidFrame = 90; // during spline transformation
    const threeQuarterFrame = 135; // circle moving along modified spline
    const finalFrame = 180; // final state

    await renderSingleFrame(app.page, sceneName, initialFrame);
    const initialImage = await readFrameFromScene(sceneName, initialFrame);
    expect(initialImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'spline-initial',
    });

    await renderSingleFrame(app.page, null, quarterFrame);
    const quarterImage = await readFrameFromScene(sceneName, quarterFrame);
    expect(quarterImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'spline-motion-quarter',
    });

    await renderSingleFrame(app.page, null, transformMidFrame);
    const transformMidImage = await readFrameFromScene(
      sceneName,
      transformMidFrame,
    );
    expect(transformMidImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'spline-transform-mid',
    });

    await renderSingleFrame(app.page, null, threeQuarterFrame);
    const threeQuarterImage = await readFrameFromScene(
      sceneName,
      threeQuarterFrame,
    );
    expect(threeQuarterImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'spline-motion-three-quarter',
    });

    await renderSingleFrame(app.page, null, finalFrame);
    const finalImage = await readFrameFromScene(sceneName, finalFrame);
    expect(finalImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'spline-final',
    });
  }, 30000);
});
