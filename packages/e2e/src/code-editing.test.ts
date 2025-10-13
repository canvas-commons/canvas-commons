import * as fs from 'fs';
import {toMatchImageSnapshot} from 'jest-image-snapshot';
import * as path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {App, start} from './app';
import {readFrameFromScene, renderSingleFrame} from './test-helpers';

expect.extend({toMatchImageSnapshot});

describe('Code Editing', () => {
  let app: App;
  const sceneName = 'code-editing';
  const projectMetaPath = path.join(
    process.cwd(),
    'tests',
    'projects',
    'code-editing.meta',
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
    const replaceLineMidFrame = 37; // during line replacement
    const afterReplaceFrame = 60; // after line replacement
    const removeWordMidFrame = 97; // during word removal
    const replaceWordMidFrame = 157; // during word replacement
    const finalFrame = 194; // final state

    await renderSingleFrame(app.page, sceneName, initialFrame);
    const initialImage = await readFrameFromScene(sceneName, initialFrame);
    expect(initialImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-editing-initial',
    });

    await renderSingleFrame(app.page, null, replaceLineMidFrame);
    const replaceLineMidImage = await readFrameFromScene(
      sceneName,
      replaceLineMidFrame,
    );
    expect(replaceLineMidImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-editing-replace-line-mid',
    });

    await renderSingleFrame(app.page, null, afterReplaceFrame);
    const afterReplaceImage = await readFrameFromScene(
      sceneName,
      afterReplaceFrame,
    );
    expect(afterReplaceImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-editing-after-replace',
    });

    await renderSingleFrame(app.page, null, removeWordMidFrame);
    const removeWordMidImage = await readFrameFromScene(
      sceneName,
      removeWordMidFrame,
    );
    expect(removeWordMidImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-editing-remove-word-mid',
    });

    await renderSingleFrame(app.page, null, replaceWordMidFrame);
    const replaceWordMidImage = await readFrameFromScene(
      sceneName,
      replaceWordMidFrame,
    );
    expect(replaceWordMidImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-editing-replace-word-mid',
    });

    await renderSingleFrame(app.page, null, finalFrame);
    const finalImage = await readFrameFromScene(sceneName, finalFrame);
    expect(finalImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-editing-final',
    });
  }, 30000);
});
