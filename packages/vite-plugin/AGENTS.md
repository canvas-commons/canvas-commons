# @canvas-commons/vite-plugin

The Vite plugin that wires a Canvas Commons project into a dev server: it
discovers projects, serves the editor, intercepts scene and metadata imports,
proxies CORS-restricted assets, generates settings and project manifests, and
coordinates the WebGL preview. Every downstream project that runs `vite` against
Canvas Commons goes through this plugin.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## Commands

```bash
pnpm vite-plugin:dev     # tsdown --watch
pnpm vite-plugin:build   # tsdown, outputs to lib/
pnpm --filter @canvas-commons/vite-plugin run lint:pkg
```

No test script. This package is exercised through `pnpm template:dev`,
`pnpm examples:dev`, and the e2e suite.

## Where things live

The default export is a function returning an array of Vite `Plugin` objects.
Each partial in `partials/` is one Vite plugin; the factory wires them together.

Peer dependency: `vite` `^4 || ^5 || ^7 || ^8`. Bumping the range is a
breaking-ish change for downstream consumers and needs a changeset.

## Config shape

The main entry's config interface (`CanvasCommonsPluginConfig`) covers:

- `project`: path, array of paths, or glob. Default `./src/project.ts`.
- `output`: render output directory. Default `./output`.
- `bufferedAssets`: regex selecting assets to buffer in memory rather than
  stream from disk. Default `/^$/` (nothing buffered).
- `editor`: module path for the editor entry point. Default
  `@canvas-commons/editor`.
- `buildForEditor`: when `true`, builds the editor bundle alongside the project.
  Used internally by `template/vite.config.ts`.
- `proxy`: CORS proxy settings.

Read the JSDoc in `src/main.ts` before changing defaults; they're documented for
downstream consumers.

## Traps

**Not a general-purpose Vite helper.** It owns specific virtual modules (scenes,
projects, meta, settings) and a custom dev-server protocol the editor talks back
to. Reordering or removing partials will break the editor's handshake.

**The `editor` config option is a module path, not a file path.** It's resolved
through Node module resolution. Downstream projects almost never override it;
the default points at `@canvas-commons/editor`.

**`buildForEditor: true` is for the in-repo template setup only.** Downstream
projects shouldn't set it; they consume a prebuilt editor.

## Don't touch without thinking

- The Vite plugin list and ordering in `src/main.ts`. Partials assume an order.
- The names of virtual modules (`@canvas-commons/scenes`, etc.). Scene authors
  import them indirectly via the JSX runtime and code transforms.
- The peer-dep version range in `package.json`. Widening it without testing
  means downstream breakage.

## Used in the wild

A minimal downstream `vite.config.ts`:

```ts
import {defineConfig} from 'vite';
import canvasCommons from '@canvas-commons/vite-plugin';

export default defineConfig({
  plugins: [canvasCommons()],
});
```

With FFmpeg export wired in:

```ts
import {defineConfig} from 'vite';
import canvasCommons from '@canvas-commons/vite-plugin';
import ffmpeg from '@canvas-commons/ffmpeg';

export default defineConfig({
  plugins: [canvasCommons(), ffmpeg()],
});
```

With a custom project path and an explicit output directory:

```ts
canvasCommons({
  project: './src/projects/*.ts',
  output: './renders',
});
```
