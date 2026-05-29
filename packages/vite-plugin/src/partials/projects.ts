import path from 'path';
import {Plugin, ResolvedConfig} from 'vite';
import {PluginOptions, ProjectData} from '../plugins';
import {createMeta} from '../utils';
import {getVersions} from '../versions';

const PROJECT_QUERY_REGEX = /[?&]project\b/;

interface ProjectPluginConfig {
  buildForEditor?: boolean;
  plugins: PluginOptions[];
  projects: ProjectData[];
}

export function projectsPlugin({
  buildForEditor,
  plugins,
  projects,
}: ProjectPluginConfig): Plugin {
  const versions = JSON.stringify(getVersions());
  let config: ResolvedConfig;
  return {
    name: 'canvas-commons:project',

    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    async load(id) {
      if (!PROJECT_QUERY_REGEX.test(id)) {
        return;
      }

      const [base] = id.split('?');
      const {name, dir} = path.posix.parse(base);

      const runsInEditor = buildForEditor || config.command === 'serve';
      const metaFile = `${name}.meta`;
      await createMeta(path.join(dir, metaFile));

      const imports: string[] = [];
      const pluginNames: string[] = [];
      let index = 0;
      for (const plugin of plugins) {
        if (plugin.entryPoint) {
          const pluginName = `plugin${index}`;
          let options = (await plugin.runtimeConfig?.()) ?? '';
          if (typeof options !== 'string') {
            options = JSON.stringify(options);
          }

          imports.push(`import ${pluginName} from '${plugin.entryPoint}'`);
          pluginNames.push(`${pluginName}(${options})`);
          index++;
        }
      }

      /* language=typescript */
      return `\
${imports.join('\n')}
import {${
        runsInEditor ? 'editorBootstrap' : 'bootstrap'
      }} from '@canvas-commons/core';
import {MetaFile} from '@canvas-commons/core';
        import metaFile from './${metaFile}';
        import config from './${name}';
        import settings from 'virtual:settings.meta';
        export default ${runsInEditor ? 'await editorBootstrap' : 'bootstrap'}(
          '${name}',
          ${versions},
          [${pluginNames.join(', ')}],
          config,
          metaFile,
          settings,
        );`;
    },

    config(config) {
      return {
        build: {
          target: buildForEditor ? 'esnext' : 'es2020',
          assetsDir: './',
          rollupOptions: {
            preserveEntrySignatures: 'strict',
            input: Object.fromEntries(
              projects.map(project => [
                project.name,
                project.filePath + '?project',
              ]),
            ),
          },
        },
        server: {
          port: config?.server?.port ?? 9000,
        },
        oxc: {
          jsx: {
            runtime: 'automatic',
            importSource: '@canvas-commons/2d',
          },
        },
        resolve: {
          // The editor and the 2d editor plugin treat preact as external, so a
          // consumer can otherwise resolve duplicate copies and break hooks.
          dedupe: ['preact', '@preact/signals', '@preact/signals-core'],
        },
        optimizeDeps: {
          entries: projects.map(project => project.filePath),
          // CommonJS deep imports from Latex; @canvas-commons/2d is excluded so
          // Vite won't discover them on its own. The `2d >` prefix resolves
          // mathjax relative to 2d, which isn't a direct consumer dependency.
          // Mirror the imports in packages/2d/src/lib/components/Latex.ts.
          include: [
            '@canvas-commons/2d > mathjax-full/js/adaptors/liteAdaptor.js',
            '@canvas-commons/2d > mathjax-full/js/handlers/html.js',
            '@canvas-commons/2d > mathjax-full/js/input/tex.js',
            '@canvas-commons/2d > mathjax-full/js/input/tex/AllPackages.js',
            '@canvas-commons/2d > mathjax-full/js/mathjax.js',
            '@canvas-commons/2d > mathjax-full/js/output/svg.js',
            '@canvas-commons/2d > mathjax-full/js/util/Options.js',
          ],
          exclude: [
            '@canvas-commons/2d',
            '@canvas-commons/2d/*',
            '@canvas-commons/core',
            '@canvas-commons/core/*',
            'preact',
            'preact/*',
            '@preact/signals',
          ],
        },
      };
    },
  };
}
