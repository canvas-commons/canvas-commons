import canvasCommons from '@canvas-commons/vite-plugin';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {build, createServer} from 'vite';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import motionCanvasCompat from '../lib/index.js';
import {createFixtureProject, FixtureProject} from './helpers/fixtureProject';

const MOTION_CANVAS_PLUGIN_OPTIONS = Symbol.for(
  '@motion-canvas/vite-plugin/PLUGIN_OPTIONS',
);

describe('Motion Canvas plugins', () => {
  let project: FixtureProject;

  beforeAll(async () => {
    project = await createFixtureProject();
  });
  afterAll(() => project.dispose());

  it('reach the Canvas Commons project', async () => {
    const server = await createServer({
      root: project.root,
      configFile: false,
      logLevel: 'silent',
      appType: 'custom',
      server: {middlewareMode: true},
      plugins: [
        canvasCommons({project: ['./src/project.ts']}),
        Object.assign(
          {name: 'motion-canvas-library-plugin'},
          {
            [MOTION_CANVAS_PLUGIN_OPTIONS]: {
              entryPoint: 'motion-canvas-fixture-library/runtime-plugin',
            },
          },
        ),
        motionCanvasCompat({experimental: true}),
      ],
    });
    try {
      const generated = await server.transformRequest(
        '/src/project.ts?project',
      );
      const entryUrl = generated?.code.match(
        /import plugin0 from "(.*fixture-library.*runtime-plugin[^"]*)"/,
      )?.[1];

      if (entryUrl === undefined) {
        throw new Error('The project module does not import the plugin entry.');
      }
      // Closing the server while the dependency optimizer runs can hang.
      await server.transformRequest(entryUrl);
    } finally {
      await server.close();
    }
  });
});

describe('imports with no replacement', () => {
  let project: FixtureProject;

  beforeAll(async () => {
    project = await createFixtureProject();
  });
  afterAll(() => project.dispose());

  it('stop the build with a pointer to the guide', async () => {
    await writeFile(
      path.join(project.root, 'src', 'code-block.ts'),
      "import '@motion-canvas/2d/lib/components/CodeBlock';",
    );

    await expect(
      build({
        root: project.root,
        configFile: false,
        logLevel: 'silent',
        plugins: [motionCanvasCompat({experimental: true})],
        build: {
          write: false,
          lib: {entry: 'src/code-block.ts', formats: ['es']},
        },
      }),
    ).rejects.toThrow(/CodeBlock.*migration/s);
  });

  it('stop the build when the replacement package is not installed', async () => {
    await writeFile(
      path.join(project.root, 'src', 'ffmpeg.ts'),
      "import '@motion-canvas/ffmpeg';",
    );

    await expect(
      build({
        root: project.root,
        configFile: false,
        logLevel: 'silent',
        plugins: [motionCanvasCompat({experimental: true})],
        build: {
          write: false,
          lib: {entry: 'src/ffmpeg.ts', formats: ['es']},
        },
      }),
    ).rejects.toThrow(/@canvas-commons\/ffmpeg.*@motion-canvas\/ffmpeg/s);
  });
});
