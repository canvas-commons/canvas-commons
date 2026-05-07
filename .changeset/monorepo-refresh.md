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

- Closes the public API surface with explicit `exports` maps. Internal `/lib/`
  paths are no longer accessible; subpaths previously reached that way
  (`scenes`, `components`, `client`, `jsx-runtime`, etc.) are `exports` entries
  on each package.
- Drops Lerna for pnpm workspaces + Changesets.
- Bumps `engines.node` floor to `>=20.19.0`.
- `@canvas-commons/core/scenes` re-exports `timeEvents` so `Scene.timeEvents`
  types are reachable through an `exports` entry.
- `@canvas-commons/vite-plugin` peerDep range broadened to
  `^4 || ^5 || ^7 || ^8`.

Pre-1.0, so this ships as a minor across the linked `core`+`2d` group and the
rest of the publishable packages.
