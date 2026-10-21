# @canvas-commons/motion-canvas-compat

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

- Tests import `lib/`. Run `pnpm compat:build` first, after the builds of core,
  2d, editor, ffmpeg, player and vite-plugin.
- Shims resolve from the project root, so this package has no dependency on
  `@canvas-commons/core` or `2d`.
- The `vite` peer range matches `@canvas-commons/vite-plugin`.
- Run `generate:types`. Do not edit `types/modules.d.ts`.
