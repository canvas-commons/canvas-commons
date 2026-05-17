# Change Log

## 0.2.1

### Patch Changes

- [#69](https://github.com/canvas-commons/canvas-commons/pull/69)
  [`0978c35`](https://github.com/canvas-commons/canvas-commons/commit/0978c35c04a5154ab2c48a94fc48d31f0ecdb47d)
  Thanks [@hhenrichsen](https://github.com/hhenrichsen)! - fix(create): include
  template directories in the published tarball

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

**Note:** Version bump only for package @motion-canvas/create

## [3.17.1](https://github.com/motion-canvas/motion-canvas/compare/v3.17.0...v3.17.1) (2024-08-17)

**Note:** Version bump only for package @motion-canvas/create

# [3.17.0](https://github.com/motion-canvas/motion-canvas/compare/v3.16.0...v3.17.0) (2024-08-13)

**Note:** Version bump only for package @motion-canvas/create

# [3.16.0](https://github.com/motion-canvas/motion-canvas/compare/v3.15.2...v3.16.0) (2024-05-16)

**Note:** Version bump only for package @motion-canvas/create

## [3.15.2](https://github.com/motion-canvas/motion-canvas/compare/v3.15.1...v3.15.2) (2024-04-02)

**Note:** Version bump only for package @motion-canvas/create

## [3.15.1](https://github.com/motion-canvas/motion-canvas/compare/v3.15.0...v3.15.1) (2024-03-21)

**Note:** Version bump only for package @motion-canvas/create

# [3.15.0](https://github.com/motion-canvas/motion-canvas/compare/v3.14.2...v3.15.0) (2024-03-21)

**Note:** Version bump only for package @motion-canvas/create

## [3.14.2](https://github.com/motion-canvas/motion-canvas/compare/v3.14.1...v3.14.2) (2024-02-08)

**Note:** Version bump only for package @motion-canvas/create

## [3.14.1](https://github.com/motion-canvas/motion-canvas/compare/v3.14.0...v3.14.1) (2024-02-06)

**Note:** Version bump only for package @motion-canvas/create

# [3.14.0](https://github.com/motion-canvas/motion-canvas/compare/v3.13.0...v3.14.0) (2024-02-04)

### Features

- **create:** include simple animation
  ([#931](https://github.com/motion-canvas/motion-canvas/issues/931))
  ([925f63f](https://github.com/motion-canvas/motion-canvas/commit/925f63f3588922224511b1687ac44ba7b9920d83))

# [3.13.0](https://github.com/motion-canvas/motion-canvas/compare/v3.12.4...v3.13.0) (2024-01-10)

**Note:** Version bump only for package @motion-canvas/create

## [3.12.4](https://github.com/motion-canvas/motion-canvas/compare/v3.12.3...v3.12.4) (2024-01-05)

### Reverts

- ci(release): 3.12.4 [skip ci]
  ([#908](https://github.com/motion-canvas/motion-canvas/issues/908))
  ([86c5170](https://github.com/motion-canvas/motion-canvas/commit/86c517067c7225f827aa05b47e2397e0d90fe622))

## [3.12.3](https://github.com/motion-canvas/motion-canvas/compare/v3.12.2...v3.12.3) (2024-01-04)

**Note:** Version bump only for package @motion-canvas/create

## [3.12.2](https://github.com/motion-canvas/motion-canvas/compare/v3.12.1...v3.12.2) (2023-12-31)

**Note:** Version bump only for package @motion-canvas/create

## [3.12.1](https://github.com/motion-canvas/motion-canvas/compare/v3.12.0...v3.12.1) (2023-12-31)

**Note:** Version bump only for package @motion-canvas/create

# [3.12.0](https://github.com/motion-canvas/motion-canvas/compare/v3.11.0...v3.12.0) (2023-12-31)

**Note:** Version bump only for package @motion-canvas/create

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.11.0](https://github.com/motion-canvas/motion-canvas/compare/v3.10.1...v3.11.0) (2023-10-13)

**Note:** Version bump only for package @motion-canvas/create

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.10.1](https://github.com/motion-canvas/motion-canvas/compare/v3.10.0...v3.10.1) (2023-07-25)

**Note:** Version bump only for package @motion-canvas/create

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.10.0](https://github.com/motion-canvas/motion-canvas/compare/v3.9.0...v3.10.0) (2023-07-23)

**Note:** Version bump only for package @motion-canvas/create

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.9.0](https://github.com/motion-canvas/motion-canvas/compare/v3.8.0...v3.9.0) (2023-05-29)

**Note:** Version bump only for package @motion-canvas/create

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.8.0](https://github.com/motion-canvas/motion-canvas/compare/v3.7.0...v3.8.0) (2023-05-13)

### Features

- **create:** add exporter selection
  ([#673](https://github.com/motion-canvas/motion-canvas/issues/673))
  ([82fd47d](https://github.com/motion-canvas/motion-canvas/commit/82fd47d93ffad6125a685880a132ce0d3a388693))
- **create:** support command-line arguments
  ([#668](https://github.com/motion-canvas/motion-canvas/issues/668))
  ([fa62a98](https://github.com/motion-canvas/motion-canvas/commit/fa62a9868d5cd33f1cb6ac5f147cca81917457dc))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.7.0](https://github.com/motion-canvas/motion-canvas/compare/v3.6.2...v3.7.0) (2023-05-10)

**Note:** Version bump only for package @motion-canvas/create

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.6.2](https://github.com/motion-canvas/motion-canvas/compare/v3.6.1...v3.6.2) (2023-05-09)

**Note:** Version bump only for package @motion-canvas/create

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.6.1](https://github.com/motion-canvas/motion-canvas/compare/v3.6.0...v3.6.1) (2023-05-08)

**Note:** Version bump only for package @motion-canvas/create

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.6.0](https://github.com/motion-canvas/motion-canvas/compare/v3.5.1...v3.6.0) (2023-05-08)

**Note:** Version bump only for package @motion-canvas/create

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.5.1](https://github.com/motion-canvas/motion-canvas/compare/v3.5.0...v3.5.1) (2023-04-08)

**Note:** Version bump only for package @motion-canvas/create

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.5.0](https://github.com/motion-canvas/motion-canvas/compare/v3.4.0...v3.5.0) (2023-04-06)

**Note:** Version bump only for package @motion-canvas/create

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.4.0](https://github.com/motion-canvas/motion-canvas/compare/v3.3.4...v3.4.0) (2023-03-28)

**Note:** Version bump only for package @motion-canvas/create

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.3.4](https://github.com/motion-canvas/motion-canvas/compare/v3.3.3...v3.3.4) (2023-03-19)

**Note:** Version bump only for package @motion-canvas/create

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.3.3](https://github.com/motion-canvas/motion-canvas/compare/v3.3.2...v3.3.3) (2023-03-18)

**Note:** Version bump only for package @motion-canvas/create

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.3.2](https://github.com/motion-canvas/motion-canvas/compare/v3.3.1...v3.3.2) (2023-03-18)

**Note:** Version bump only for package @motion-canvas/create

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.3.1](https://github.com/motion-canvas/motion-canvas/compare/v3.3.0...v3.3.1) (2023-03-18)

**Note:** Version bump only for package @motion-canvas/create

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.3.0](https://github.com/motion-canvas/motion-canvas/compare/v3.2.1...v3.3.0) (2023-03-18)

### Features

- update vite from v3 to v4
  ([#495](https://github.com/motion-canvas/motion-canvas/issues/495))
  ([c409eee](https://github.com/motion-canvas/motion-canvas/commit/c409eee0e61b67e43afed240c5ae279714681246)),
  closes [#197](https://github.com/motion-canvas/motion-canvas/issues/197)

## [3.2.1](https://github.com/motion-canvas/motion-canvas/compare/v3.2.0...v3.2.1) (2023-03-10)

**Note:** Version bump only for package @motion-canvas/create

# [3.2.0](https://github.com/motion-canvas/motion-canvas/compare/v3.1.0...v3.2.0) (2023-03-10)

**Note:** Version bump only for package @motion-canvas/create

# [3.1.0](https://github.com/motion-canvas/motion-canvas/compare/v3.0.2...v3.1.0) (2023-03-07)

**Note:** Version bump only for package @motion-canvas/create

## [3.0.2](https://github.com/motion-canvas/motion-canvas/compare/v3.0.1...v3.0.2) (2023-02-27)

**Note:** Version bump only for package @motion-canvas/create

## [3.0.1](https://github.com/motion-canvas/motion-canvas/compare/v3.0.0...v3.0.1) (2023-02-27)

### Bug Fixes

- **create:** update templates
  ([#439](https://github.com/motion-canvas/motion-canvas/issues/439))
  ([8483557](https://github.com/motion-canvas/motion-canvas/commit/8483557f0a3ca7914aafacceab5d466abba59df0))

# [3.0.0](https://github.com/motion-canvas/motion-canvas/compare/v2.6.0...v3.0.0) (2023-02-27)

**Note:** Version bump only for package @motion-canvas/create

# [2.6.0](https://github.com/motion-canvas/motion-canvas/compare/v2.5.0...v2.6.0) (2023-02-24)

**Note:** Version bump only for package @motion-canvas/create

# [2.5.0](https://github.com/motion-canvas/motion-canvas/compare/v2.4.0...v2.5.0) (2023-02-20)

**Note:** Version bump only for package @motion-canvas/create

# [2.4.0](https://github.com/motion-canvas/motion-canvas/compare/v2.3.0...v2.4.0) (2023-02-18)

### Bug Fixes

- **vite-plugin:** fix js template
  ([#337](https://github.com/motion-canvas/motion-canvas/issues/337))
  ([3b33d73](https://github.com/motion-canvas/motion-canvas/commit/3b33d73416541d491b633bada29f085f5489f6c2))

# [2.3.0](https://github.com/motion-canvas/motion-canvas/compare/v2.2.0...v2.3.0) (2023-02-11)

**Note:** Version bump only for package @motion-canvas/create

# [2.2.0](https://github.com/motion-canvas/motion-canvas/compare/v2.1.0...v2.2.0) (2023-02-09)

**Note:** Version bump only for package @motion-canvas/create

# [2.1.0](https://github.com/motion-canvas/motion-canvas/compare/v2.0.0...v2.1.0) (2023-02-07)

**Note:** Version bump only for package @motion-canvas/create

# 2.0.0 (2023-02-04)

### Bug Fixes

- change executable file permissions
  ([#38](https://github.com/motion-canvas/motion-canvas/issues/38))
  ([23025a2](https://github.com/motion-canvas/motion-canvas/commit/23025a2caefd993f7e4751b1efced3a25ed497a6))
- **create:** fix package type
  ([#40](https://github.com/motion-canvas/motion-canvas/issues/40))
  ([f07aa5d](https://github.com/motion-canvas/motion-canvas/commit/f07aa5d8f6c3485464ed3158187340c7db7d5af7))
- fix scaffolding
  ([#93](https://github.com/motion-canvas/motion-canvas/issues/93))
  ([95c55ed](https://github.com/motion-canvas/motion-canvas/commit/95c55ed338127dad22f42b24c8f6b101b8863be7))

### Code Refactoring

- remove legacy package
  ([6a84120](https://github.com/motion-canvas/motion-canvas/commit/6a84120d949a32dff0ad413a9f359510ff109af1))

### Features

- add scaffolding package
  ([#36](https://github.com/motion-canvas/motion-canvas/issues/36))
  ([266a561](https://github.com/motion-canvas/motion-canvas/commit/266a561c619b57b403ec9c64185985b48bff29da)),
  closes [#30](https://github.com/motion-canvas/motion-canvas/issues/30)
- extract konva to separate package
  ([#60](https://github.com/motion-canvas/motion-canvas/issues/60))
  ([4ecad3c](https://github.com/motion-canvas/motion-canvas/commit/4ecad3ca2732bd5147af670c230f8f959129a707))
- make scenes independent of names
  ([#53](https://github.com/motion-canvas/motion-canvas/issues/53))
  ([417617e](https://github.com/motion-canvas/motion-canvas/commit/417617eb5f0af771e7413c9ce4c7e9b998e3e490)),
  closes [#25](https://github.com/motion-canvas/motion-canvas/issues/25)
- support for multiple projects
  ([#57](https://github.com/motion-canvas/motion-canvas/issues/57))
  ([573752d](https://github.com/motion-canvas/motion-canvas/commit/573752dd4d79d62a1a30958f1ed550d2cf22c344)),
  closes [#141414](https://github.com/motion-canvas/motion-canvas/issues/141414)

### Reverts

- "ci(release): 9.1.3 [skip ci]"
  ([62953a6](https://github.com/motion-canvas/motion-canvas/commit/62953a6a8a1b1da3eb2e5f51c9fe60c716d6b94b))
- ci(release): 1.0.1 [skip ci]
  ([#175](https://github.com/motion-canvas/motion-canvas/issues/175))
  ([161a046](https://github.com/motion-canvas/motion-canvas/commit/161a04647ecdc8203daf2d887a6a44c79a92ee20))
- ci(release): 2.0.0 [skip ci]
  ([#176](https://github.com/motion-canvas/motion-canvas/issues/176))
  ([551096b](https://github.com/motion-canvas/motion-canvas/commit/551096bf636a791ea7c7c1d38d8e03c360433008))

### BREAKING CHANGES

- remove legacy package
- change to import paths

See
[the migration guide](https://motion-canvas.github.io/guides/migration/12.0.0)
for more info.

- change the way scenes are imported

Scene files no longer need to follow the pattern: `[name].scene.tsx`. When
importing scenes in the project file, a dedicated `?scene` query param should be
used:

```ts
import example from './scenes/example?scene';

export default new Project({
  name: 'project',
  scenes: [example],
});
```
