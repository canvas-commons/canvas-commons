import {cp, mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures');
const WORKSPACE_PACKAGES = path.resolve(import.meta.dirname, '../../..');

export const FIXTURE_LIBRARY = 'motion-canvas-fixture-library';

export interface FixtureProject {
  root: string;
  dispose(): Promise<void>;
}

/** Create a temporary project with the fixture library copied into `node_modules`. */
export async function createFixtureProject(): Promise<FixtureProject> {
  const root = await mkdtemp(path.join(tmpdir(), 'compat-project-'));
  const modules = path.join(root, 'node_modules');

  await mkdir(path.join(modules, '@canvas-commons'), {recursive: true});
  for (const name of ['core', '2d', 'editor', 'vite-plugin']) {
    await symlink(
      path.join(WORKSPACE_PACKAGES, name),
      path.join(modules, '@canvas-commons', name),
      'junction',
    );
  }
  await cp(
    path.join(FIXTURES, 'library'),
    path.join(modules, FIXTURE_LIBRARY),
    {recursive: true},
  );
  await cp(
    path.join(FIXTURES, 'motion-canvas-trap'),
    path.join(modules, '@motion-canvas'),
    {recursive: true},
  );

  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'package.json'), '{"type": "module"}');
  await cp(path.join(FIXTURES, 'probe.ts'), path.join(root, 'src', 'probe.ts'));
  await writeFile(
    path.join(root, 'src', 'project.ts'),
    "import {makeProject} from '@canvas-commons/core';\nexport default makeProject({scenes: []});\n",
  );
  // The project path is absolute, so the entry needs a name from its meta file.
  await writeFile(
    path.join(root, 'src', 'project.meta'),
    '{"version": 0, "name": "project"}',
  );

  return {root, dispose: () => rm(root, {recursive: true, force: true})};
}
