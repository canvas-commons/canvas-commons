# @canvas-commons/template

A private, unpublished project used by maintainers to develop against the rest
of the monorepo. Booting it via `pnpm template:dev` gives you the editor running
against a real animation with hot reload as you change `core`, `2d`, `editor`,
`vite-plugin`, or `ffmpeg`.

If you're a downstream user looking for a starter project, you want
[`@canvas-commons/create`](../create/AGENTS.md), not this.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## Commands

```bash
pnpm template:dev      # vite dev server with the editor
pnpm template:build    # tsc && vite build
```

Run other packages' watch scripts in parallel terminals to see your changes
propagate. For example:

```bash
# terminal 1
pnpm core:dev
# terminal 2
pnpm 2d:dev
# terminal 3
pnpm editor:dev
# terminal 4
pnpm template:dev
```

The vite config in this package imports siblings directly from their source
trees, so most edits don't even need a rebuild.

## Where things live

`vite.config.ts` reaches into `../vite-plugin/src/main` and `../ffmpeg/server`
directly. That's how this package picks up source-level changes without waiting
for builds.

## Traps

**`motion-canvas.d.ts` is the legacy filename.** It exists for backwards
compatibility with the editor's type augmentation pattern. Don't rename it
without coordinating across `@canvas-commons/editor` and `@canvas-commons/2d`.

**The vite config has a hard-coded `buildForEditor: true`.** That tells the vite
plugin to bundle the editor alongside the project. Downstream consumers don't
set this.

**This package is private and version `0.0.0`.** It must never get published.
The `private` flag in `package.json` keeps it that way.

## Don't touch without thinking

- `vite.config.ts` paths (`../vite-plugin/src/main`, `../ffmpeg/server`).
  They're load-bearing for the dev workflow.
- The `private: true` field.

## Used in the wild

Not used downstream. Internal dev only.

## Maintainer workflow

The recommended loop:

1. Run watch scripts for the packages you're editing.
2. Run `pnpm template:dev`.
3. Open the editor.
4. Edit. Reload. The animation in `src/scenes/example.tsx` is a working
   scaffold; tweak it freely to exercise whatever feature you're building.

When you need a more thorough integration check than the template offers, fall
back to `pnpm examples:dev` (more scenes, broader feature coverage) or
`pnpm e2e:test` (visual regression).
