import * as fs from 'fs';
import {toMatchImageSnapshot} from 'jest-image-snapshot';
import * as path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {App, start} from './app';
import {readFrameFromScene, renderSingleFrame} from './test-helpers';

expect.extend({toMatchImageSnapshot});

describe('Code Morphing', () => {
  let app: App;
  const sceneName = 'code-morphing';
  const projectMetaPath = path.join(
    process.cwd(),
    'tests',
    'projects',
    'code-morphing.meta',
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
    const firstMorphMidFrame = 37; // during first morph (10 -> 100)
    const afterFirstMorphFrame = 60; // after first morph
    const secondMorphMidFrame = 97; // during second morph (adding lines)
    const afterSecondMorphFrame = 120; // after second morph
    const thirdMorphMidFrame = 157; // during third morph (removing lines)
    const finalFrame = 180; // final state

    await renderSingleFrame(app.page, sceneName, initialFrame);
    const initialImage = await readFrameFromScene(sceneName, initialFrame);
    expect(initialImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-morphing-initial',
    });

    await renderSingleFrame(app.page, null, firstMorphMidFrame);
    const firstMorphMidImage = await readFrameFromScene(
      sceneName,
      firstMorphMidFrame,
    );
    expect(firstMorphMidImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-morphing-first-morph-mid',
    });

    await renderSingleFrame(app.page, null, afterFirstMorphFrame);
    const afterFirstMorphImage = await readFrameFromScene(
      sceneName,
      afterFirstMorphFrame,
    );
    expect(afterFirstMorphImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-morphing-after-first-morph',
    });

    await renderSingleFrame(app.page, null, secondMorphMidFrame);
    const secondMorphMidImage = await readFrameFromScene(
      sceneName,
      secondMorphMidFrame,
    );
    expect(secondMorphMidImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-morphing-second-morph-mid',
    });

    await renderSingleFrame(app.page, null, afterSecondMorphFrame);
    const afterSecondMorphImage = await readFrameFromScene(
      sceneName,
      afterSecondMorphFrame,
    );
    expect(afterSecondMorphImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-morphing-after-second-morph',
    });

    await renderSingleFrame(app.page, null, thirdMorphMidFrame);
    const thirdMorphMidImage = await readFrameFromScene(
      sceneName,
      thirdMorphMidFrame,
    );
    expect(thirdMorphMidImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-morphing-third-morph-mid',
    });

    await renderSingleFrame(app.page, null, finalFrame);
    const finalImage = await readFrameFromScene(sceneName, finalFrame);
    expect(finalImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-morphing-final',
    });
  }, 60000);
});
