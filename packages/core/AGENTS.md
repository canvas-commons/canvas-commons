# @canvas-commons/core

Animation timing, scene lifecycle, threading, tweening, and the reactive signal
system that every other package depends on. Pure TypeScript, no renderer, no UI.
Downstream packages plug in their own rendering surface (`@canvas-commons/2d`
for canvases, `@canvas-commons/player` for a web component) and let core drive
the playhead.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## Commands

```bash
pnpm core:dev      # tsdown --watch
pnpm core:build    # tsdown, outputs to lib/
pnpm core:test     # vitest run
pnpm --filter @canvas-commons/core run lint:pkg
```

Build target is ES2022 with decorators enabled. Output is ESM only.

## Where things live

Public surface is everything re-exported from `src/index.ts`. The `./project`
subpath export covers the type-level `Project` declaration for scene authoring.

## Traps

**Signals are not React or Preact hooks.** They're standalone reactive
primitives. `createSignal(0)` returns a callable: `s()` reads, `s(5)` sets,
`s(5, 1)` tweens to `5` over `1` second. There is no component lifecycle, no
hooks rules, no dependency arrays. Effects are tracked automatically by reading
other signals inside them.

**Threads are cooperative coroutines, not OS threads.** They share the JS event
loop. A `while (true) { ... }` without a `yield` will freeze the animation. Use
`yield` to give up a frame, `yield* waitFor(t)` to sleep, or `yield* all(...)`
to run children concurrently.

**View coordinates are center-origin.** Positive Y is down. Absolute coordinates
(where you'd interact with the DOM) are top-left. Don't mix the two.

**No null assertions or `any`.** ESLint flags both. Prefer narrowing, generics,
or proper types; if a cast is truly needed, justify it in a comment.

## Don't touch without thinking

- `src/index.ts` re-exports define the public API. Adding to it is fine;
  removing or renaming is a breaking change and needs a changeset.
- `src/signals/SignalContext.ts` is the reactive core. Changes here affect every
  animation downstream.
- `tsconfig.project.json` is consumed by downstream projects via the
  `./tsconfig.project.json` export.
