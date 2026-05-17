# @canvas-commons/player

A standalone custom element, `<canvas-commons-player>`, that loads a built
Canvas Commons project and plays it in any HTML page. Self-contained: it bundles
the `@canvas-commons/core` runtime it needs, so consumers don't install or
import core separately. Used by `@canvas-commons/docs` for live examples and by
anything that wants to drop an animation into static HTML.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## Commands

```bash
pnpm player:dev      # vite dev server against the player itself
pnpm player:build    # tsc && vite build, outputs to dist/main.js and types/main.d.ts
pnpm --filter @canvas-commons/player run lint:pkg
```

The build pipeline pre-compiles types into `types/` and produces a single
bundled `dist/main.js` with terser applied.

## Where things live

The package has no runtime dependencies. The web component registers itself on
import: load `dist/main.js` and the tag is available.

## Traps

**The script registers the element on import.** That's a side effect. The
package's `sideEffects` field lists `./dist/main.js` so bundlers won't tree-
shake it away.

**`src` points at a built project bundle, not a `.ts` scene file.** Run the
downstream project's `vite build` first; point `src` at the resulting project
chunk.

**No core import required downstream.** The player includes its own bundled copy
of the core runtime. Don't try to share a core instance between the host page
and the player; they won't agree.

## Don't touch without thinking

- The custom-element tag name (`canvas-commons-player`) and its observed
  attributes. Renaming either breaks every page that embeds the player.
- The default export shape of `main.ts`.
- The bundle's `dist/main.js` filename. It's referenced in the `exports` field
  and in downstream `<script>` tags.
