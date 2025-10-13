import * as fs from 'fs';
import {toMatchImageSnapshot} from 'jest-image-snapshot';
import * as path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {App, start} from './app';
import {readFrameFromScene, renderSingleFrame} from './test-helpers';

expect.extend({toMatchImageSnapshot});

describe('LaTeX Tweening', () => {
  let app: App;
  const sceneName = 'latex-tweening';
  const projectMetaPath = path.join(
    process.cwd(),
    'tests',
    'projects',
    'latex-tweening.meta',
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
    const initialFrame = 0; // y = ax^2
    const firstMorphMidFrame = 37; // during first morph: adding + bx
    const afterFirstMorphFrame = 60; // y = ax^2 + bx
    const secondMorphMidFrame = 97; // during second morph: adding + c
    const afterSecondMorphFrame = 120; // y = ax^2 + bx + c
    const thirdMorphMidFrame = 157; // during third morph: reordering terms
    const finalFrame = 180; // y = c + ax^2 + bx

    await renderSingleFrame(app.page, sceneName, initialFrame);
    const initialImage = await readFrameFromScene(sceneName, initialFrame);
    expect(initialImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'latex-initial',
    });

    await renderSingleFrame(app.page, null, firstMorphMidFrame);
    const firstMorphMidImage = await readFrameFromScene(
      sceneName,
      firstMorphMidFrame,
    );
    expect(firstMorphMidImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'latex-first-morph-mid',
    });

    await renderSingleFrame(app.page, null, afterFirstMorphFrame);
    const afterFirstMorphImage = await readFrameFromScene(
      sceneName,
      afterFirstMorphFrame,
    );
    expect(afterFirstMorphImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'latex-after-first-morph',
    });

    await renderSingleFrame(app.page, null, secondMorphMidFrame);
    const secondMorphMidImage = await readFrameFromScene(
      sceneName,
      secondMorphMidFrame,
    );
    expect(secondMorphMidImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'latex-second-morph-mid',
    });

    await renderSingleFrame(app.page, null, afterSecondMorphFrame);
    const afterSecondMorphImage = await readFrameFromScene(
      sceneName,
      afterSecondMorphFrame,
    );
    expect(afterSecondMorphImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'latex-after-second-morph',
    });

    await renderSingleFrame(app.page, null, thirdMorphMidFrame);
    const thirdMorphMidImage = await readFrameFromScene(
      sceneName,
      thirdMorphMidFrame,
    );
    expect(thirdMorphMidImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'latex-third-morph-mid',
    });

    await renderSingleFrame(app.page, null, finalFrame);
    const finalImage = await readFrameFromScene(sceneName, finalFrame);
    expect(finalImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'latex-final',
    });
  }, 30000);
});
