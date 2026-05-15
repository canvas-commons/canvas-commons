---
'@canvas-commons/core': minor
'@canvas-commons/2d': minor
'@canvas-commons/ui': minor
'@canvas-commons/vite-plugin': minor
'@canvas-commons/ffmpeg': minor
'@canvas-commons/player': minor
'@canvas-commons/create': minor
---

Modernize packaging, build, and release pipeline.

- Closes the public API surface with explicit `exports` maps. Each package ships
  a single root entry (`.`) plus only the subpaths that genuinely need to be
  separate: `@canvas-commons/2d/{jsx-runtime,jsx-dev-runtime,editor}`,
  `@canvas-commons/ffmpeg/{client,server}`, and the standard file exports
  (`./project`, `./tsconfig.project.json`, `./package.json`). Previously
  available subpaths like `@canvas-commons/core/scenes`,
  `@canvas-commons/2d/components`, etc. are gone — re-import the same symbols
  from the root entry. The packages are `sideEffects: false`, so tree-shaking
  removes anything you don't use.
- Drops Lerna for pnpm workspaces + Changesets.
- Bumps `engines.node` floor to `>=20.19.0`.
- `@canvas-commons/vite-plugin` peerDep range broadened to
  `^4 || ^5 || ^7 || ^8`.
- `LogPayload.remarks` is markdown source now, not pre-rendered HTML. The
  canvas-commons editor renders it at display time; consumers that read
  `remarks` directly should pass it through a markdown parser like `marked`.

Pre-1.0, so this ships as a minor across the linked `core`+`2d` group and the
rest of the publishable packages.
