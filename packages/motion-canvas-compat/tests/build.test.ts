import canvasCommons from '@canvas-commons/vite-plugin';
import path from 'node:path';
import {build} from 'vite';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import motionCanvasCompat from '../lib/index.js';
import {createFixtureProject, FixtureProject} from './helpers/fixtureProject';
import {runBuiltProbe} from './helpers/runBuiltProbe';

interface ProbeBuild {
  code: string;
  probeFile: string;
}

async function buildProbe(project: FixtureProject): Promise<ProbeBuild> {
  const outDir = path.join(project.root, 'dist');
  const result = await build({
    root: project.root,
    configFile: false,
    logLevel: 'silent',
    plugins: [
      canvasCommons({project: [path.join(project.root, 'src/project.ts')]}),
      motionCanvasCompat({experimental: true}),
    ],
    build: {
      outDir,
      minify: false,
      rollupOptions: {
        input: {probe: path.join(project.root, 'src/probe.ts')},
      },
    },
  });
  const [bundle] = Array.isArray(result) ? result : [result];
  if (!('output' in bundle)) {
    throw new Error('The build returned no output.');
  }
  const code = bundle.output
    .map(output => (output.type === 'chunk' ? output.code : ''))
    .join('\n');
  const probe = bundle.output.find(
    output => output.type === 'chunk' && output.name === 'probe',
  );
  if (probe === undefined) {
    throw new Error('The build has no probe chunk.');
  }
  return {code, probeFile: path.join(outDir, probe.fileName)};
}

describe('build with a Motion Canvas library', () => {
  let project: FixtureProject;
  let probeBuild: ProbeBuild;

  beforeAll(async () => {
    project = await createFixtureProject();
    probeBuild = await buildProbe(project);
  });
  afterAll(() => project.dispose());

  it('never loads Motion Canvas', () => {
    expect(probeBuild.code).not.toContain('loadedRealMotionCanvas');
  });

  it('gives the library the engine and the offset of the project', async () => {
    expect(await runBuiltProbe(probeBuild.probeFile)).toEqual({
      offsetInSuperProps: [-1, 0],
      offsetXYInSuperProps: [1, -1],
      offsetInJsxProps: [0, 1],
      offsetYInJsxProps: [1, 1],
      offsetInJsxPropsOfEngineClass: [1, 1],
      offsetRead: [-1, 0],
      offsetComponentRead: -1,
      offsetIsAnchor: true,
      offsetTweened: [0, -1],
      offsetCloned: [-1, 0],
      ownOffset: [3, 4],
      ownOffsetLeavesAnchor: [0, 0],
      colorFromLibraryIsEngineColor: true,
      pillIsEngineLayout: true,
      libraryLayoutIsEngineLayout: true,
      libraryVector2IsEngineVector2: true,
      libraryColorIsEngineColor: true,
      insertedByDiff: 1,
      defaultPluginName: '@canvas-commons/core/default',
    });
  });
});
