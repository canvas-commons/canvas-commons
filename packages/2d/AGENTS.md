# @canvas-commons/2d

The 2D renderer and scene-authoring API. Provides the `Node` hierarchy (`Rect`,
`Circle`, `Txt`, `Layout`, `Img`, `Video`, `Code`, ...), the custom JSX runtime
that builds it, and `makeScene2D` for declaring a scene. Sits on top of
`@canvas-commons/core`. Most downstream animation code spends most of its time
in this package.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## Commands

```bash
pnpm 2d:dev          # tsdown --watch
pnpm 2d:build        # build-lib then build-editor
pnpm 2d:test         # vitest run
pnpm --filter @canvas-commons/2d run build-lib       # tsdown, outputs to lib/
pnpm --filter @canvas-commons/2d run build-editor    # rollup -c rollup.editor.mjs, outputs to editor/
pnpm --filter @canvas-commons/2d run lint:pkg
```

The full `build` is two stages: tsdown for the library, then Rollup for the
editor plugin. The editor entrypoint is shipped as a separate bundle from
`./editor` and pulled in by `@canvas-commons/editor` when the 2D plugin is
active.

## Where things live

Public surface from `./` is everything re-exported by `src/lib/index.ts`. The
`./jsx-runtime` and `./jsx-dev-runtime` subpaths are consumed by the TypeScript
JSX transform, not by user code. The `./editor` subpath is the editor-side
plugin and is only used by `@canvas-commons/editor`.

## Traps

**JSX in scenes does not return DOM.** `tsconfig.project.json` sets
`jsxImportSource: "@canvas-commons/2d"`. The `jsx()` function in
`src/lib/jsx-runtime.ts` constructs scene-graph `Node` instances. A `<Rect>` is
a long-lived object you mutate, not a render output. No virtual DOM, no diff, no
reconciler.

**The editor folder runs a different JSX runtime.** `src/editor/tsconfig.json`
sets `jsxImportSource: "preact"`. Inside `src/editor/` you're writing Preact
components for the editor UI. Inside `src/lib/` you're writing scene-graph
nodes. Don't import one from the other.

**Components extend `Node` (or a subclass).** Function components are supported
by the JSX runtime but the usual pattern is a class with `@signal` properties.
See `src/lib/components/` for working examples.

**`ref` is a callback, not a React-style ref object.** `createRef<T>()` returns
a callable that gets invoked with the node once it's constructed. Read the value
back with `myRef()`.

## Don't touch without thinking

- `src/lib/jsx-runtime.ts` and `src/lib/jsx-dev-runtime.ts`: the JSX import
  contract for every downstream project. Change the function signature and you
  break every scene file in the wild.
- `src/lib/index.ts`: public exports. Removing one is breaking.
- The component class hierarchy in `src/lib/components/`. The `@signal`
  decorator and node-name metadata are load-bearing for tooling (inspector,
  scene graph, serialization).
- `rollup.editor.mjs`: the editor bundle config.
