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

## Coding conventions

Root [`AGENTS.md`](../../AGENTS.md) covers the repo-wide patterns (TSDoc shape,
file naming, class accessibility, generic naming, test colocation). These are
the core-specific ones layered on top.

### Threadable generator functions

Every flow primitive in `src/flow/` and every tween in `src/tweening/` is a
generator function paired with a `decorate(fn, threadable())` call placed on its
own line immediately above the TSDoc. The decoration relies on hoisting, so the
call order looks inverted from the function definition. Don't change that order.

```ts
import {decorate, threadable} from '../decorators';
import {ThreadGenerator} from '../threading';

decorate(waitFor, threadable());
/**
 * Wait for the given amount of time.
 *
 * @param seconds - The relative time in seconds.
 */
export function* waitFor(seconds = 0): ThreadGenerator {
  // ...
}
```

Overloads stack: each overload signature gets its own TSDoc block, the
implementation signature gets none. See `src/flow/loop.ts` for the canonical
example.

### `useX` is a scene-context pattern

`useScene`, `usePlayback`, `useThread`, `useLogger`, `useRandom`, `useTime`,
`useDuration` all read from a module-level stack populated when a scene runs.
They throw when called outside their context. Don't reach for the `useX` name
unless you're actually pulling from such a stack; it isn't a React hook and it
isn't a generic getter.

### Logging

User-surfaceable diagnostics go through `useLogger()` with a structured payload:

```ts
useLogger().error({
  message: 'Tried to execute an infinite loop in the main thread.',
  remarks: infiniteLoop,
  stack: new Error().stack,
});
```

Long-form `remarks` strings live in `src/<area>/__logs__/<name>.ts` as exported
constants and get imported where the log fires. Programming errors that should
crash hard (like `useScene` outside a scene) throw `Error` directly instead.

## Don't touch without thinking

- `src/index.ts` re-exports define the public API. Adding to it is fine;
  removing or renaming is a breaking change and needs a changeset.
- `src/signals/SignalContext.ts` is the reactive core. Changes here affect every
  animation downstream.
- `tsconfig.project.json` is consumed by downstream projects via the
  `./tsconfig.project.json` export.

## Used in the wild

Driving a signal-derived computation and tweening the source:

```tsx
import {Circle, makeScene2D} from '@canvas-commons/2d';
import {createSignal, waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const radius = createSignal(3);
  const area = createSignal(() => Math.PI * radius() * radius());

  view.add(<Circle width={() => radius() * 200} fill="#e13238" />);

  yield* radius(4, 2).to(3, 2);
  yield* waitFor(1);
  console.log(area());
});
```

Driving a presentation with named slides and a background loop thread:

```tsx
import {makeScene2D} from '@canvas-commons/2d';
import {beginSlide, cancel, loop} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  yield* beginSlide('intro');
  const spin = yield loop(Infinity, () => rotation(-5, 1).to(5, 1));
  yield* beginSlide('content');
  cancel(spin);
});
```

`all`, `chain`, and `sequence` compose threads. `spawn` starts a detached child.
`cancel` stops one explicitly; a parent terminating cancels all children.
