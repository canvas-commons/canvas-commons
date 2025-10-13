import * as fs from 'fs';
import {toMatchImageSnapshot} from 'jest-image-snapshot';
import * as path from 'path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {App, start} from './app';
import {readFrameFromScene, renderSingleFrame} from './test-helpers';

expect.extend({toMatchImageSnapshot});

describe('Code Highlighting', () => {
  let app: App;
  const sceneName = 'code-highlighting';
  const projectMetaPath = path.join(
    process.cwd(),
    'tests',
    'projects',
    'code-highlighting.meta',
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
    const initialFrame = 0; // initial state - no selection
    const lineHighlightedFrame = 35; // line highlighted
    const wordHighlightedFrame = 80; // word highlighted
    const multiHighlightedFrame = 125; // multiple ranges highlighted
    const finalFrame = 166; // selection cleared

    await renderSingleFrame(app.page, sceneName, initialFrame);
    const initialImage = await readFrameFromScene(sceneName, initialFrame);
    expect(initialImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-highlighting-initial',
    });

    await renderSingleFrame(app.page, null, lineHighlightedFrame);
    const lineImage = await readFrameFromScene(sceneName, lineHighlightedFrame);
    expect(lineImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-highlighting-line',
    });

    await renderSingleFrame(app.page, null, wordHighlightedFrame);
    const wordImage = await readFrameFromScene(sceneName, wordHighlightedFrame);
    expect(wordImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-highlighting-word',
    });

    await renderSingleFrame(app.page, null, multiHighlightedFrame);
    const multiImage = await readFrameFromScene(
      sceneName,
      multiHighlightedFrame,
    );
    expect(multiImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-highlighting-multi',
    });

    await renderSingleFrame(app.page, null, finalFrame);
    const finalImage = await readFrameFromScene(sceneName, finalFrame);
    expect(finalImage).toMatchImageSnapshot({
      customSnapshotIdentifier: 'code-highlighting-final',
    });
  }, 30000);
});
