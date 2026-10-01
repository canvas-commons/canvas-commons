#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const e2eDir = resolve(here, '..');
const repoRoot = resolve(e2eDir, '../..');

// CI resolves the playwright tag from the lockfile
// (atos-actions/get-playwright-version). Mirror that so the container's
// browsers match what pnpm will actually install.
const lockfile = readFileSync(resolve(repoRoot, 'pnpm-lock.yaml'), 'utf8');
const match = lockfile.match(/^ {2}playwright@(\d+\.\d+\.\d+):$/m);
const playwrightVersion = match?.[1];
if (!playwrightVersion) {
  console.error('Could not resolve playwright version from pnpm-lock.yaml');
  process.exit(1);
}

const tag = `canvas-commons-e2e:pw-${playwrightVersion}`;
const snapshotsDir = resolve(e2eDir, 'src', '__image_snapshots__');

console.log(`Building ${tag} (repo root as context)...`);
const build = spawnSync(
  'docker',
  [
    'build',
    '--build-arg',
    `PLAYWRIGHT_VERSION=${playwrightVersion}`,
    '-f',
    resolve(e2eDir, 'Dockerfile.test'),
    '-t',
    tag,
    repoRoot,
  ],
  {stdio: 'inherit'},
);
if (build.status !== 0) process.exit(build.status ?? 1);

const userCommand = process.argv.slice(2).join(' ');

console.log(
  userCommand ? `Running: ${userCommand}` : 'Running: pnpm run e2e:test',
);
// Mount only the snapshots dir out so regenerated baselines land in the
// host worktree. Everything else (node_modules, source, build output)
// stays inside the container — the host's install never gets touched.
const args = [
  'run',
  '--rm',
  // xvfb-run hangs on its start-up handshake when it is PID 1.
  '--init',
  '-v',
  `${snapshotsDir}:/work/packages/e2e/src/__image_snapshots__`,
  tag,
];
// Firefox needs a display to create a WebGL context.
args.push('xvfb-run', '-a', 'bash', '-c', userCommand || 'pnpm run e2e:test');
const run = spawnSync('docker', args, {stdio: 'inherit'});
process.exit(run.status ?? 1);
