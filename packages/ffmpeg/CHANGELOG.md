# Change Log

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @canvas-commons/core@0.2.1
  - @canvas-commons/vite-plugin@0.2.1

## 0.2.0

### Minor Changes

- [#59](https://github.com/canvas-commons/canvas-commons/pull/59)
  [`dc986d0`](https://github.com/canvas-commons/canvas-commons/commit/dc986d05c85ac203d46e3bfd82735cf896cd29cb)
  Thanks [@hhenrichsen](https://github.com/hhenrichsen)! - Modernize packaging,
  build, and release pipeline.
  - Closes the public API surface with explicit `exports` maps. Each package
    ships a single root entry (`.`) plus only the subpaths that genuinely need
    to be separate: `@canvas-commons/2d/{jsx-runtime,jsx-dev-runtime,editor}`,
    `@canvas-commons/ffmpeg/{client,server}`, `@canvas-commons/core/shaders/*`
    (for `#include` directives in user shaders), and the standard file exports
    (`./project`, `./tsconfig.project.json`, `./package.json`). Previously
    available subpaths like `@canvas-commons/core/scenes`,
    `@canvas-commons/2d/components`, etc. are gone — re-import the same symbols
    from the root entry. The packages are `sideEffects: false`, so tree-shaking
    removes anything you don't use.
  - Drops Lerna for pnpm workspaces + Changesets.
  - Bumps `engines.node` floor to `>=20.19.0`.
  - `@canvas-commons/vite-plugin` peerDep range broadened to
    `^4 || ^5 || ^7 || ^8`. The editor, player, template, and examples now build
    against Vite 8 (Rolldown-backed) by default, with Vitest 4 driving unit and
    end-to-end tests. The plugin emits Vite 8's `oxc.jsx` configuration in place
    of the deprecated `esbuild.jsx*` keys, resolves project entries to absolute
    paths so they survive resolution from virtual modules, and looks up the
    editor package from the consumer's cwd so pnpm's strict layout finds it.
  - `@canvas-commons/editor`'s library build now emits its CSS as `style.css` to
    match the `./style.css` export. Vite 8's library mode renamed the default
    CSS output, so the explicit `cssFileName: 'style'` keeps the
    consumer-visible filename stable.
  - `LogPayload.remarks` is markdown source now, not pre-rendered HTML. The
    canvas-commons editor renders it at display time; consumers that read
    `remarks` directly should pass it through a markdown parser like `marked`.
  - Library builds (`core`, `2d`, `vite-plugin`, `ffmpeg`) migrated from `tsc`
    to `tsdown` (Rolldown-based) and emit a bundled single-file `lib/index.js`
    to match the single-entry `exports` map. Published output is still ESM with
    `.d.ts` declarations and source maps.
  - `core` and `2d` no longer ship a separate `bundle` script. The regular build
    produces both the library (`lib/index.js`) and the minified single-file
    bundle (`dist/index.js`) used by the in-browser docs examples.
  - `@canvas-commons/ui` renamed to `@canvas-commons/editor`. Update your
    `package.json` deps and any imports. The package shape, exports map, and
    `./style.css` subpath are unchanged.
  - Upgrades Docusaurus to v3, enables future v4 changes, and migrates to
    React 18.

  Pre-1.0, so this ships as a minor across the linked `core`+`2d` group and the
  rest of the publishable packages.

### Patch Changes

- Updated dependencies
  [[`dc986d0`](https://github.com/canvas-commons/canvas-commons/commit/dc986d05c85ac203d46e3bfd82735cf896cd29cb)]:
  - @canvas-commons/core@0.2.0
  - @canvas-commons/vite-plugin@0.2.0

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.17.2](https://github.com/motion-canvas/motion-canvas/compare/v3.17.1...v3.17.2) (2024-12-14)

**Note:** Version bump only for package @motion-canvas/ffmpeg

# [3.17.0](https://github.com/motion-canvas/motion-canvas/compare/v3.16.0...v3.17.0) (2024-08-13)

**Note:** Version bump only for package @motion-canvas/ffmpeg

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# 1.1.0 (2023-05-10)

### Features

- initial commit
  ([7a01fd5](https://github.com/motion-canvas/exporters/commit/7a01fd5614f2d62b4bd6e24c1096706f5dbf218b))
