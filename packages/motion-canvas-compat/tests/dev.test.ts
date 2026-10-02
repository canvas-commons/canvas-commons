import canvasCommons from '@canvas-commons/vite-plugin';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer, ViteDevServer} from 'vite';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import motionCanvasCompat from '../lib/index.js';
import {
  createFixtureProject,
  FIXTURE_LIBRARY,
  FixtureProject,
} from './helpers/fixtureProject';

function importedUrls(code: string): string[] {
  return Array.from(code.matchAll(/ from "([^"]+)"/g), match => match[1]);
}

function findUrl(code: string, pattern: RegExp): string {
  const url = importedUrls(code).find(candidate => pattern.test(candidate));
  if (url === undefined) {
    throw new Error(`No import matches ${pattern} in:\n${code}`);
  }
  return url;
}

const ENGINE_CORE = /\/packages\/core\/lib\/index\.js$/;
const ENGINE_2D = /\/packages\/2d\/lib\/index\.js$/;
const ENGINE_JSX_RUNTIME = /\/packages\/2d\/lib\/jsx-runtime\.js$/;
const COMPAT_2D_SHIM = /\/runtime\/2d$/;

describe('dev server with a Motion Canvas library', () => {
  let project: FixtureProject;
  let server: ViteDevServer;
  let probeCode: string;
  let libraryCode: string;
  let shimCode: string;

  async function serve(url: string): Promise<string> {
    const id = url.replace(/^\/@id\/__x00__/, '\0');
    const result = await server.transformRequest(id);
    if (!result) {
      throw new Error(`Nothing is served at ${url}.`);
    }
    return result.code;
  }

  beforeAll(async () => {
    project = await createFixtureProject();
    server = await createServer({
      root: project.root,
      configFile: false,
      logLevel: 'silent',
      appType: 'custom',
      server: {middlewareMode: true},
      plugins: [
        canvasCommons({project: ['./src/project.ts']}),
        motionCanvasCompat({experimental: true}),
      ],
    });

    probeCode = await serve('/src/probe.ts');
    libraryCode = await serve(findUrl(probeCode, /deps\/.*fixture-library/));
    shimCode = await serve(findUrl(libraryCode, COMPAT_2D_SHIM));
  });
  afterAll(async () => {
    await server?.close();
    await project?.dispose();
  });

  it('pre-bundles the library without a copy of Motion Canvas', async () => {
    const prebundle = await readFile(
      path.join(
        project.root,
        'node_modules/.vite/deps',
        `${FIXTURE_LIBRARY}.js`,
      ),
      'utf8',
    );

    expect(prebundle).not.toContain('loadedRealMotionCanvas');
    expect(importedUrls(prebundle)).toEqual(
      expect.arrayContaining([
        '@motion-canvas/core',
        '@motion-canvas/2d',
        '@motion-canvas/2d/lib/jsx-runtime',
      ]),
    );
  });

  it('serves the engine of the project to the library', () => {
    expect(findUrl(libraryCode, ENGINE_CORE)).toBe(
      findUrl(probeCode, ENGINE_CORE),
    );
    expect(findUrl(shimCode, ENGINE_2D)).toBe(findUrl(probeCode, ENGINE_2D));
    expect(findUrl(libraryCode, ENGINE_JSX_RUNTIME)).toBeTruthy();
    expect(libraryCode).not.toContain('loadedRealMotionCanvas');
  });
});
