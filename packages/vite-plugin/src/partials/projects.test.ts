import fs from 'fs';
import path from 'path';
import {build, createLogger, createServer, InlineConfig} from 'vite';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import canvasCommons from '../main';
import {Plugin, PLUGIN_OPTIONS, PluginOptions} from '../plugins';

const PROJECT_FILES = ['first.ts', 'second.ts'];

function canvasCommonsPlugin(name: string, options: PluginOptions): Plugin {
  return {name, [PLUGIN_OPTIONS]: options};
}

function projectConfig(
  root: string,
  buildForEditor: boolean,
  warnings: string[],
): InlineConfig {
  const logger = createLogger('silent');
  logger.warn = message => {
    if (message.includes('loadIn')) {
      warnings.push(message);
    }
  };
  return {
    configFile: false,
    root,
    customLogger: logger,
    plugins: [
      canvasCommons({
        project: PROJECT_FILES.map(file => path.posix.join(root, file)),
        editor: path.resolve(root, 'editor/main.js'),
        buildForEditor,
      }),
      canvasCommonsPlugin('unset-plugin', {entryPoint: 'unset-entry'}),
      canvasCommonsPlugin('editor-plugin', {
        entryPoint: 'editor-entry',
        loadIn: 'editor',
      }),
      canvasCommonsPlugin('project-plugin', {
        entryPoint: 'project-entry',
        loadIn: 'project',
      }),
    ],
  };
}

async function buildProjects(
  root: string,
  buildForEditor: boolean,
  warnings: string[],
): Promise<string> {
  const result = await build({
    ...projectConfig(root, buildForEditor, warnings),
    build: {
      write: false,
      minify: false,
      rollupOptions: {external: id => !id.includes('?project')},
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  return outputs
    .flatMap(output => ('output' in output ? output.output : []))
    .map(chunk => (chunk.type === 'chunk' ? chunk.code : ''))
    .join('\n');
}

async function serveProject(root: string, warnings: string[]) {
  const server = await createServer({
    ...projectConfig(root, false, warnings),
    server: {middlewareMode: true, ws: false},
  });
  try {
    const result = await server.pluginContainer.load(
      path.posix.join(root, PROJECT_FILES[0]) + '?project',
    );
    return typeof result === 'string' ? result : (result?.code ?? '');
  } finally {
    await server.close();
  }
}

function importedEntryPoints(code: string): string[] {
  return [...code.matchAll(/from\s*["']([a-z]+-entry)["']/g)].map(
    match => match[1],
  );
}

describe('project module', () => {
  // Project paths stay relative to the working directory, as in a user's Vite
  // config, because Rolldown rejects absolute chunk names.
  const root = fs
    .mkdtempSync(path.join('node_modules', '.projects-test-'))
    .split(path.sep)
    .join(path.posix.sep);

  beforeAll(() => {
    for (const file of PROJECT_FILES) {
      fs.writeFileSync(path.join(root, file), 'export default {};\n');
    }
    fs.mkdirSync(path.join(root, 'editor'));
    fs.writeFileSync(path.join(root, 'editor/main.js'), '');
    fs.writeFileSync(path.join(root, 'editor/editor.html'), '{{source}}');
  });

  afterAll(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('loads every entry point in the dev server', async () => {
    const warnings: string[] = [];
    const code = await serveProject(root, warnings);

    expect(importedEntryPoints(code)).toEqual([
      'unset-entry',
      'editor-entry',
      'project-entry',
    ]);
    expect(warnings).toEqual([]);
  });

  it('loads every entry point in a build for the editor', async () => {
    const warnings: string[] = [];
    const code = await buildProjects(root, true, warnings);

    expect(new Set(importedEntryPoints(code))).toEqual(
      new Set(['unset-entry', 'editor-entry', 'project-entry']),
    );
    expect(warnings).toEqual([]);
  });

  it('loads only project entry points in a production build', async () => {
    const warnings: string[] = [];
    const code = await buildProjects(root, false, warnings);

    expect(new Set(importedEntryPoints(code))).toEqual(
      new Set(['project-entry']),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('unset-plugin');
    expect(warnings[0]).toContain("loadIn: 'editor'");
    expect(warnings[0]).toContain("loadIn: 'project'");
  });
});
