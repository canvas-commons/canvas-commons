# Change Log

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

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.17.2](https://github.com/motion-canvas/motion-canvas/compare/v3.17.1...v3.17.2) (2024-12-14)

**Note:** Version bump only for package @motion-canvas/player

# [3.17.0](https://github.com/motion-canvas/motion-canvas/compare/v3.16.0...v3.17.0) (2024-08-13)

**Note:** Version bump only for package @motion-canvas/player

# [3.16.0](https://github.com/motion-canvas/motion-canvas/compare/v3.15.2...v3.16.0) (2024-05-16)

**Note:** Version bump only for package @motion-canvas/player

## [3.15.2](https://github.com/motion-canvas/motion-canvas/compare/v3.15.1...v3.15.2) (2024-04-02)

**Note:** Version bump only for package @motion-canvas/player

## [3.15.1](https://github.com/motion-canvas/motion-canvas/compare/v3.15.0...v3.15.1) (2024-03-21)

**Note:** Version bump only for package @motion-canvas/player

# [3.15.0](https://github.com/motion-canvas/motion-canvas/compare/v3.14.2...v3.15.0) (2024-03-21)

### Features

- expose parts of player to outside of shadow root
  ([#956](https://github.com/motion-canvas/motion-canvas/issues/956))
  ([c996d39](https://github.com/motion-canvas/motion-canvas/commit/c996d394dda9ba8c6a32f0360bf09e722ec15b0e)),
  closes [#950](https://github.com/motion-canvas/motion-canvas/issues/950)

## [3.14.1](https://github.com/motion-canvas/motion-canvas/compare/v3.14.0...v3.14.1) (2024-02-06)

**Note:** Version bump only for package @motion-canvas/player

# [3.14.0](https://github.com/motion-canvas/motion-canvas/compare/v3.13.0...v3.14.0) (2024-02-04)

**Note:** Version bump only for package @motion-canvas/player

# [3.13.0](https://github.com/motion-canvas/motion-canvas/compare/v3.12.4...v3.13.0) (2024-01-10)

**Note:** Version bump only for package @motion-canvas/player

## [3.12.1](https://github.com/motion-canvas/motion-canvas/compare/v3.12.0...v3.12.1) (2023-12-31)

**Note:** Version bump only for package @motion-canvas/player

# [3.12.0](https://github.com/motion-canvas/motion-canvas/compare/v3.11.0...v3.12.0) (2023-12-31)

**Note:** Version bump only for package @motion-canvas/player

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.11.0](https://github.com/motion-canvas/motion-canvas/compare/v3.10.1...v3.11.0) (2023-10-13)

**Note:** Version bump only for package @motion-canvas/player

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.10.0](https://github.com/motion-canvas/motion-canvas/compare/v3.9.0...v3.10.0) (2023-07-23)

**Note:** Version bump only for package @motion-canvas/player

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.9.0](https://github.com/motion-canvas/motion-canvas/compare/v3.8.0...v3.9.0) (2023-05-29)

**Note:** Version bump only for package @motion-canvas/player

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.8.0](https://github.com/motion-canvas/motion-canvas/compare/v3.7.0...v3.8.0) (2023-05-13)

**Note:** Version bump only for package @motion-canvas/player

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.7.0](https://github.com/motion-canvas/motion-canvas/compare/v3.6.2...v3.7.0) (2023-05-10)

**Note:** Version bump only for package @motion-canvas/player

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.6.1](https://github.com/motion-canvas/motion-canvas/compare/v3.6.0...v3.6.1) (2023-05-08)

**Note:** Version bump only for package @motion-canvas/player

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.6.0](https://github.com/motion-canvas/motion-canvas/compare/v3.5.1...v3.6.0) (2023-05-08)

**Note:** Version bump only for package @motion-canvas/player

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.4.0](https://github.com/motion-canvas/motion-canvas/compare/v3.3.4...v3.4.0) (2023-03-28)

**Note:** Version bump only for package @motion-canvas/player

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.3.4](https://github.com/motion-canvas/motion-canvas/compare/v3.3.3...v3.3.4) (2023-03-19)

**Note:** Version bump only for package @motion-canvas/player

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.3.0](https://github.com/motion-canvas/motion-canvas/compare/v3.2.1...v3.3.0) (2023-03-18)

**Note:** Version bump only for package @motion-canvas/player

# [3.2.0](https://github.com/motion-canvas/motion-canvas/compare/v3.1.0...v3.2.0) (2023-03-10)

**Note:** Version bump only for package @motion-canvas/player

# [3.1.0](https://github.com/motion-canvas/motion-canvas/compare/v3.0.2...v3.1.0) (2023-03-07)

**Note:** Version bump only for package @motion-canvas/player

# [3.0.0](https://github.com/motion-canvas/motion-canvas/compare/v2.6.0...v3.0.0) (2023-02-27)

### Features

- new playback architecture
  ([#402](https://github.com/motion-canvas/motion-canvas/issues/402))
  ([bbe3e2a](https://github.com/motion-canvas/motion-canvas/commit/bbe3e2a24de068a88f49ed7a2f13e9717039733b)),
  closes [#166](https://github.com/motion-canvas/motion-canvas/issues/166)

### BREAKING CHANGES

- `makeProject` no longer accepts some settings.

Settings such as `background` and `audioOffset` are now stored in the project
meta file.

# [2.6.0](https://github.com/motion-canvas/motion-canvas/compare/v2.5.0...v2.6.0) (2023-02-24)

**Note:** Version bump only for package @motion-canvas/player

# [2.5.0](https://github.com/motion-canvas/motion-canvas/compare/v2.4.0...v2.5.0) (2023-02-20)

**Note:** Version bump only for package @motion-canvas/player

# [2.4.0](https://github.com/motion-canvas/motion-canvas/compare/v2.3.0...v2.4.0) (2023-02-18)

**Note:** Version bump only for package @motion-canvas/player

# [2.3.0](https://github.com/motion-canvas/motion-canvas/compare/v2.2.0...v2.3.0) (2023-02-11)

**Note:** Version bump only for package @motion-canvas/player

# [2.2.0](https://github.com/motion-canvas/motion-canvas/compare/v2.1.0...v2.2.0) (2023-02-09)

### Features

- project variables
  ([#255](https://github.com/motion-canvas/motion-canvas/issues/255))
  ([4883295](https://github.com/motion-canvas/motion-canvas/commit/488329525939928af52b4a4d8488f1e1cd4cf6f7))

# [2.1.0](https://github.com/motion-canvas/motion-canvas/compare/v2.0.0...v2.1.0) (2023-02-07)

**Note:** Version bump only for package @motion-canvas/player

# 2.0.0 (2023-02-04)

### Bug Fixes

- use correct scene sizes
  ([#146](https://github.com/motion-canvas/motion-canvas/issues/146))
  ([f279638](https://github.com/motion-canvas/motion-canvas/commit/f279638f9ad7ed1f4c44900d48c10c2d6560946e))

### Features

- animation player
  ([#92](https://github.com/motion-canvas/motion-canvas/issues/92))
  ([8155118](https://github.com/motion-canvas/motion-canvas/commit/8155118eb13dc2a8b422b81aabacc923ce2f919b))
- **player:** add auto mode
  ([c107259](https://github.com/motion-canvas/motion-canvas/commit/c107259f7c2a3886ccfe4ca0140d13064aed238f))
- **player:** improve accessibility
  ([0fc9235](https://github.com/motion-canvas/motion-canvas/commit/0fc923576e7b12f9bc799f3a4e861861d49a2406))
- support multiple players
  ([#128](https://github.com/motion-canvas/motion-canvas/issues/128))
  ([24f75cf](https://github.com/motion-canvas/motion-canvas/commit/24f75cf7cdaf38f890e3936edf175afbfd340210))

### Reverts

- ci(release): 1.0.1 [skip ci]
  ([#175](https://github.com/motion-canvas/motion-canvas/issues/175))
  ([161a046](https://github.com/motion-canvas/motion-canvas/commit/161a04647ecdc8203daf2d887a6a44c79a92ee20))
- ci(release): 2.0.0 [skip ci]
  ([#176](https://github.com/motion-canvas/motion-canvas/issues/176))
  ([551096b](https://github.com/motion-canvas/motion-canvas/commit/551096bf636a791ea7c7c1d38d8e03c360433008))
