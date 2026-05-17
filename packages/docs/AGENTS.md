# @canvas-commons/docs

The documentation website at canvascommons.io. Docusaurus 3 with a custom MDX
setup that embeds live Canvas Commons animations via the player web component
and interactive code editors via CodeMirror.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## Commands

```bash
pnpm docs:dev          # docusaurus start --no-open
pnpm docs:build        # docusaurus build
pnpm docs:serve        # docusaurus serve (preview built output)
pnpm docs:blog         # node release-blog-generator.js
pnpm --filter @canvas-commons/docs run typedoc       # API reference generation
pnpm --filter @canvas-commons/docs run typecheck     # tsc
pnpm --filter @canvas-commons/docs run swizzle       # docusaurus swizzle
pnpm --filter @canvas-commons/docs run write-translations
```

The `examples` and `player` packages need to be built first if you're iterating
on docs that pull from them; the docs scripts will use the prebuilt output.

## Where things live

API reference pages are generated from TSDoc comments in `@canvas-commons/core`
and `@canvas-commons/2d`. The typedoc script handles the extraction.

## Traps

**This package is React 18, not Preact.** Docusaurus pulls in React, and so does
anything in this package's `src/`. The runtime story here is unrelated to the
editor or 2d. Don't carry React imports out of this package.

**Live examples use the player web component, not direct core imports.** Code
blocks tagged as Canvas Commons get rendered through `<canvas-commons-player>`,
which bundles its own runtime. Don't try to share a runtime between the docs
page and the player.

**TSDoc examples are part of the public API.** TypeDoc renders them into the
reference site. Breaking an `@example` block in `core` or `2d` shows up here as
a broken example page.

## Don't touch without thinking

- `docusaurus.config.ts`: site URL, base path, plugin configuration.
- `sidebars.ts`: page ordering. Reordering changes URLs if slugs aren't pinned.
- `typedoc-standalone.js`: controls what shows up in the API reference.
- `static/llms.txt` and `static/llms-full.txt`: generated artifacts.

## Used in the wild

Public site at canvascommons.io. Build output is also deployed via
`docusaurus deploy` to GitHub Pages.

A doc page embeds an example by referencing one of the scenes in
`@canvas-commons/examples` and pointing the player at the built output. The
specifics live in the theme overrides under `src/`; when you need to introduce a
new example, add a scene to the examples package first, then reference it from
MDX.
