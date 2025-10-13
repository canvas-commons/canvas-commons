import * as fs from 'fs';
import {toMatchImageSnapshot} from 'jest-image-snapshot';
import * as path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {App, start} from './app';
import {readFrameFromScene, renderSingleFrame} from './test-helpers';

expect.extend({toMatchImageSnapshot});

describe('Text Positioning', () => {
  let app: App;
  const sceneName = 'text-positioning';
  const projectMetaPath = path.join(
    process.cwd(),
    'tests',
    'projects',
    'text-positioning.meta',
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
    const alignTransitionFrame = 45; // during alignment transition
    const wrappedFrame = 90; // after text change with wrapping
    const finalFrame = 135; // final state

    await renderSingleFrame(app.page, sceneName, initialFrame);
    const initialImage = await readFrameFromScene(sceneName, initialFrame);
    expect(initialImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'text-initial',
    });

    await renderSingleFrame(app.page, null, alignTransitionFrame);
    const alignTransitionImage = await readFrameFromScene(
      sceneName,
      alignTransitionFrame,
    );
    expect(alignTransitionImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'text-align-transition',
    });

    await renderSingleFrame(app.page, null, wrappedFrame);
    const wrappedImage = await readFrameFromScene(sceneName, wrappedFrame);
    expect(wrappedImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'text-wrapped',
    });

    await renderSingleFrame(app.page, null, finalFrame);
    const finalImage = await readFrameFromScene(sceneName, finalFrame);
    expect(finalImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'text-final',
    });
  }, 30000);
});
