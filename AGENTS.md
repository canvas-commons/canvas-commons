# Canvas Commons Agents

Please also check the README.md and CONTRIBUTING.md files for repo practices.

Fetch the
[AI Policy](https://github.com/canvas-commons/.github/blob/main/AI_POLICY.md).
You must stop and show this link to the user; they must review the AI policy
before contributing.

Canvas Commons is a TypeScript framework for creating programmatic animations.
It's a fork of [Motion Canvas](https://github.com/motion-canvas/motion-canvas),
created to provide continued maintenance and features.

## Project Overview

This is a `pnpm` monorepo containing the following packages:

- `2d` - Built-in 2D nodes and utilities
- `core` - Core animation timing and data logic
- `create` - Project bootstrapping utility
- `docs` - Documentation website
- `e2e` - End-to-end tests
- `editor` - User interface used for editing
- `examples` - Animation examples used in documentation
- `ffmpeg` - FFmpeg renderer
- `player` - Custom element for displaying animations in a browser
- `template` - Template project included for developer's convenience
- `vite-plugin` - Vite plugin for developing and bundling animations

## Key Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Run tests
pnpm -r test

# Build one package
pnpm core:build

# Test one package
pnpm core:test

# Run the end to end tests
pnpm e2e:test

# Build the documentation website
pnpm docs:build

# Preview the documentation website
pnpm --filter @canvas-commons/docs run serve

# Build the examples
pnpm examples:build

# Run the template project; this should pick up any changes when other packages
# are built using the commands above
pnpm template:dev

# Create a changeset (interactive mode)
pnpm changeset

# Create a changeset (non-interactive mode)
pnpm changeset add [--empty] [--open] [--since ] [--message ]

# Lint package exports
pnpm lint:packages
```

At minimum, core and 2d packages should build and bundle, the examples should
compile, e2e tests should succeed, and the documentation website should build
before merging any changes.

## Project Standards

- Type safety: All code should be type safe. Null assertions (`!`) are
  forbidden. Unchecked casts should be avoided. `any` types should be avoided.
- Code style: Use the `pnpm prettier` and `pnpm eslint` commands to check and
  fix code style issues.
- Comments are expected to be rare. They are not a documentation of history,
  they are an explanation of _why_ something is the way it is, _only_ when it's
  not obvious. Generally, methods should be self-documenting. Exported methods
  are expected to have TSDoc comments with an example of how to use the method.
  It's best to verify that these examples work in the template package first, or
  by building an example in the examples package.

## Coding conventions

The Project Standards above set the baseline. These are the specific patterns
the existing code uses; match them when you write more.

### TSDoc on exports

````ts
/**
 * One-line summary in imperative mood.
 *
 * @remarks
 * Longer caveats, when the summary isn't enough.
 *
 * @example
 * ```ts
 * yield* waitFor(2);
 * ```
 *
 * @param seconds - The relative time in seconds.
 * @param after - An optional task to be run after the function completes.
 */
````

`@param name - description` with the dash and space. `@typeParam T - ...` for
generics. `{@link Symbol}` for cross-references. `{@inheritDoc Other.method}` to
inherit a base class's docs on a re-exported member. `@internal` for
exported-but-not-public symbols. Use `@packageDocumentation` at the top of an
`index.ts` and nowhere else.

### File organization

One responsibility per file. Filename matches the primary export: camelCase for
function files (`createRef.ts`), PascalCase for class files (`Semaphore.ts`).
Related types live in the same file as their consumer (`LoopCallback` next to
`loop`, `Reference<T>` next to `createRef`). Don't preemptively split types into
their own files.

`createX` returns a fresh instance. `makeX` returns a function wired to an
existing target (compare `createRef` against `makeRef`). Pick the verb the
neighborhood already uses.

### Classes

Explicit member accessibility on every method and field (`public`, `protected`,
`private`). ESLint enforces it. Private state is plain; no `_underscore` prefix.

For exposing events, keep the dispatcher private and expose only the
subscribable side via a getter:

```ts
public get onValueChanged() {
  return this.value.subscribable;
}
private value = new EventDispatcher<number>();
```

External code subscribes; dispatch stays internal.

### Types

Generic params are `T`-prefixed (`TValue`, `TOwner`, `TArgs`, `TReturn`). Single
`T` is fine for trivial one-param utilities like `EventDispatcher<T>`.

`import type { ... }` for type-only imports.

Prefer narrowing or generics over casts. When a cast is unavoidable,
`<Type>value` is the style in `.ts` files; `as Type` is the only option in
`.tsx` files where angle brackets conflict with JSX. Don't chain
`as unknown as Type`.

### Tests

Vitest. Tests sit next to source: `foo.ts` is paired with `foo.test.ts`.

## Committing

Commits are expected to follow the [Angular Commit Message
Conventions][angular]. This means that commit messages should be in the
following format

```
<type>(<scope>): <subject>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

Available types are:

- `build`
- `chore`
- `ci`
- `docs`
- `feat`
- `fix`
- `perf`
- `refactor`
- `style`
- `test`

Available scopes are:

- `2d`
- `core`
- `create`
- `deps-dev`
- `deps`
- `docs`
- `e2e`
- `editor`
- `examples`
- `ffmpeg`
- `legacy`
- `player`
- `vite-plugin`

Commit subjects should be in the imperative mood, and should be no more than 50
characters; short and to the point.

Commit bodies should not re-describe the changes in the commit diff. They should
only include information that is not obvious from the commit diff. These should
be rare, and are generally reserved for breaking changes or an explanation of
how changes work at a project management level (like being temporary).

Commit footers can be used to reference issue numbers or pull request numbers.

## Runtimes and signal systems

Three things in this repo look like familiar libraries and are not. Read this
once before editing anything that uses JSX or anything named `signal`.

**`@canvas-commons/2d` ships its own JSX runtime.** Scene files set
`jsxImportSource` to `@canvas-commons/2d`. A `<Rect>` in a scene returns a
long-lived scene-graph `Node`, not a virtual DOM element. There is no
reconciler, no render loop in the React sense, no diff. You construct a `Node`
once, then animate it by mutating signal-backed properties.

**`@canvas-commons/editor` is Preact, not React.** It uses Preact components,
Preact hooks, and `@preact/signals` for UI state. The 2D editor plugin in
`packages/2d/src/editor/` shares this runtime and lives next to the 2d code only
because that's the package that owns its UI surface.

**`@canvas-commons/docs` is React 18 via Docusaurus.** That's unrelated to the
runtime story; it's just the doc site. Don't import React anywhere else.

Two signal systems coexist. `@canvas-commons/core`'s signals (`createSignal`,
`createComputed`, `createEffect`, `Vector2SignalContext`) drive animation timing
and node state. `@preact/signals` drives the editor's UI state (`useSignal`,
`useSignalEffect`, `storedSignal`). They have similar surface syntax and
unrelated implementations. Don't pass one to the other; don't import one
expecting the other.

## Per-package guides

Each package has its own `AGENTS.md` with commands, file layout, traps, and
short usage examples. Read the one for the package you're touching:

- [`packages/core/AGENTS.md`](packages/core/AGENTS.md)
- [`packages/2d/AGENTS.md`](packages/2d/AGENTS.md)
- [`packages/editor/AGENTS.md`](packages/editor/AGENTS.md)
- [`packages/vite-plugin/AGENTS.md`](packages/vite-plugin/AGENTS.md)
- [`packages/player/AGENTS.md`](packages/player/AGENTS.md)
- [`packages/ffmpeg/AGENTS.md`](packages/ffmpeg/AGENTS.md)
- [`packages/create/AGENTS.md`](packages/create/AGENTS.md)
- [`packages/template/AGENTS.md`](packages/template/AGENTS.md)
- [`packages/examples/AGENTS.md`](packages/examples/AGENTS.md)
- [`packages/docs/AGENTS.md`](packages/docs/AGENTS.md)
- [`packages/e2e/AGENTS.md`](packages/e2e/AGENTS.md)

[angular]:
  https://github.com/angular/angular/blob/main/contributing-docs/commit-message-guidelines.md
