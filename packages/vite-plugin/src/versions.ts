import fs from 'fs';
import path from 'path';

export function getVersions() {
  return {
    core: loadVersion('@canvas-commons/core'),
    two: loadVersion('@canvas-commons/2d'),
    ui: loadVersion('@canvas-commons/ui'),
    vitePlugin: loadVersion('..'),
  };
}

function loadVersion(module: string): string | null {
  try {
    const modulePath = path.dirname(require.resolve(`${module}/package.json`));
    const packageJsonPath = path.resolve(modulePath, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString());
    return packageJson.version ?? null;
  } catch (_) {
    return null;
  }
}
