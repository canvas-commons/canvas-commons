import {execFile} from 'node:child_process';
import {mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

const RUN = promisify(execFile);
const PACKAGE = path.resolve(import.meta.dirname, '..');
const WORKSPACE_PACKAGES = path.resolve(PACKAGE, '..');
const TSC = path.resolve(PACKAGE, '../../node_modules/typescript/bin/tsc');

const CONSUMER = `
import ffmpeg from '@motion-canvas/ffmpeg';
import ffmpegClient from '@motion-canvas/ffmpeg/lib/client';
import ffmpegServer from '@motion-canvas/ffmpeg/lib/server';
import DefaultPlugin from '@motion-canvas/core/lib/plugin/DefaultPlugin';
import DefaultPluginJs from '@motion-canvas/core/lib/plugin/DefaultPlugin.js';
import {Vector2} from '@motion-canvas/core/lib/types/Vector.js';
import {Rect} from '@motion-canvas/2d/lib/components/Rect.js';
import {Rect as IndexRect} from '@motion-canvas/2d/lib/components/index.js';
import {Layout} from '@motion-canvas/2d';
import {editor, MotionCanvas} from '@motion-canvas/ui';
import type {CanvasCommonsPlayerProps} from '@motion-canvas/player';

export const plugins = [
  ffmpeg(),
  ffmpegClient(),
  ffmpegServer(),
  DefaultPlugin(),
  DefaultPluginJs(),
];
export const nodes = [
  new Rect({offset: [1, 2]}),
  new IndexRect({offsetX: 1}),
  new Layout({}).offset,
  Vector2.zero,
];
export const editors = [editor, MotionCanvas];
export type Props = CanvasCommonsPlayerProps;
`;

describe('type declarations', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'compat-types-'));
    const scope = path.join(root, 'node_modules', '@canvas-commons');
    await mkdir(scope, {recursive: true});
    for (const name of [
      'core',
      '2d',
      'editor',
      'ffmpeg',
      'player',
      'vite-plugin',
      'motion-canvas-compat',
    ]) {
      await symlink(
        name === 'motion-canvas-compat'
          ? PACKAGE
          : path.join(WORKSPACE_PACKAGES, name),
        path.join(scope, name),
        'junction',
      );
    }
    const types = path.join(scope, 'motion-canvas-compat', 'types');
    await writeFile(path.join(root, 'consumer.ts'), CONSUMER);
    await writeFile(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          target: 'es2022',
          skipLibCheck: true,
          preserveSymlinks: true,
          types: [],
        },
        files: [
          'consumer.ts',
          ...['index', 'ffmpeg', 'editor', 'player'].map(name =>
            path.join(types, `${name}.d.ts`),
          ),
        ],
      }),
    );
  });
  afterAll(() => rm(root, {recursive: true, force: true}));

  it('type a Motion Canvas project with Canvas Commons only', async () => {
    await expect(
      RUN(process.execPath, [TSC, '-p', root], {cwd: root}),
    ).resolves.toMatchObject({stdout: '', stderr: ''});
  });
});
