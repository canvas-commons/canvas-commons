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

## Coding conventions

Root [`AGENTS.md`](../../AGENTS.md) covers the repo-wide patterns. 2D adds two
stacked-decorator patterns that show up on almost every component.

### Reactive properties: `@initial` + `@signal`

Node properties go through a decorator stack. The order is fixed: outer
modifiers (`@initial`, `@interpolation`, `@parser`, etc.) first, `@signal` last.
The class field itself is declared but never assigned; the decorators wire it
up.

```ts
@initial(false)
@signal()
declare public readonly smoothCorners: SimpleSignal<boolean, this>;

@initial(0.6)
@signal()
declare public readonly cornerSharpness: SimpleSignal<number, this>;
```

These are accessed as call-signals (`this.smoothCorners()` reads,
`this.smoothCorners(true)` sets, `this.smoothCorners(true, 1)` tweens), the same
shape as `createSignal` in core.

### Threadable methods on classes

Core's flow primitives use `decorate(fn, threadable())` at module scope. 2D
components use the `@threadable()` method decorator on class methods that return
generators. Different syntax, same purpose: marking the function so the runtime
can name it on the timeline and treat it as a coroutine.

```ts
@threadable()
public *zoom(value: number, duration: number): ThreadGenerator {
  yield* this.scale(value, duration);
}
```

Use the method form inside a component class. Use the module form (see core) for
free functions.

## Don't touch without thinking

- `src/lib/jsx-runtime.ts` and `src/lib/jsx-dev-runtime.ts`: the JSX import
  contract for every downstream project. Change the function signature and you
  break every scene file in the wild.
- `src/lib/index.ts`: public exports. Removing one is breaking.
- The component class hierarchy in `src/lib/components/`. The `@signal`
  decorator and node-name metadata are load-bearing for tooling (inspector,
  scene graph, serialization).
- `rollup.editor.mjs`: the editor bundle config.

## Used in the wild

A minimal scene with a ref and a tween:

```tsx
import {Circle, makeScene2D} from '@canvas-commons/2d';
import {all, createRef} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const myCircle = createRef<Circle>();

  view.add(
    <Circle ref={myCircle} x={-300} width={140} height={140} fill="#e13238" />,
  );

  yield* all(
    myCircle().position.x(300, 1).to(-300, 1),
    myCircle().fill('#e6a700', 1).to('#e13238', 1),
  );
});
```

A signal-driven property graph, where the circle's size follows a tweened signal
and the line endpoint is recomputed reactively:

```tsx
export default makeScene2D(function* (view) {
  const radius = createSignal(3);
  view.add(
    <>
      <Circle width={() => radius() * 200} fill="#e13238" />
      <Line
        points={[Vector2.zero, () => Vector2.right.scale(radius() * 100)]}
      />
    </>,
  );
  yield* radius(4, 2).to(3, 2);
});
```

Function-style child callbacks (`() => ...`) is how reactivity attaches to node
props. Static values are set once and don't re-evaluate.
