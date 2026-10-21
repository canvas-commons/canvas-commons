import {version as viteVersion} from 'vite';
import {mapSpecifier} from './specifiers';

const PACKAGE_FILTER = /^@motion-canvas\//;

interface ExternalizingRolldownPlugin {
  name: string;
  resolveId(source: string): {id: string; external: true} | null;
}

interface EsbuildBuild {
  onResolve(
    options: {filter: RegExp},
    callback: (args: {path: string}) => {path: string; external: true} | null,
  ): void;
}

interface ExternalizingEsbuildPlugin {
  name: string;
  setup(build: EsbuildBuild): void;
}

const PLUGIN_NAME = 'canvas-commons:motion-canvas-compat-externals';

/** Whether the dependency optimizer of this Vite version is Rolldown. */
export function usesRolldownOptimizer(): boolean {
  return Number(viteVersion.split('.')[0]) >= 8;
}

/** Mark each `@motion-canvas/*` import of a library as external. */
export const externalizingRolldownPlugin: ExternalizingRolldownPlugin = {
  name: PLUGIN_NAME,
  resolveId(source) {
    return mapSpecifier(source) === null ? null : {id: source, external: true};
  },
};

export const externalizingEsbuildPlugin: ExternalizingEsbuildPlugin = {
  name: PLUGIN_NAME,
  setup(build) {
    build.onResolve({filter: PACKAGE_FILTER}, args =>
      mapSpecifier(args.path) === null
        ? null
        : {path: args.path, external: true},
    );
  },
};
