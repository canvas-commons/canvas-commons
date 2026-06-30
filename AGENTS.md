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
- `player` - Custom element for displaying animations in a browser
- `template` - Template project included for developer's convenience
- `vite-plugin` - Vite plugin for developing and bundling animations
- `webcodecs` - In-browser WebCodecs video exporter

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

Overall, it is expected that any new additions to the project should follow what
already exists stylistically. Pay attention to what needs comments and what
doesn't. Check what the git commit formatting is like.

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
- `legacy`
- `player`
- `vite-plugin`
- `webcodecs`

Commit subjects should be in the imperative mood, and should be no more than 50
characters; short and to the point.

Commit bodies should not re-describe the changes in the commit diff. They should
only include information that is not obvious from the commit diff. These should
be rare, and are generally reserved for breaking changes or an explanation of
how changes work at a project management level (like being temporary).

Commit footers can be used to reference issue numbers or pull request numbers.

User-facing changes should include a changeset file, including changes to the
runtime (`vite-plugin`, `editor`, `player`, `webcodecs`, `core`, `2d`,
`create`). Docs changes, changes to workflows, and other internal package
changes (`docs`, `e2e`, `examples`, `template`) are not expected to include a
changeset file.

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
- [`packages/webcodecs/AGENTS.md`](packages/webcodecs/AGENTS.md)
- [`packages/create/AGENTS.md`](packages/create/AGENTS.md)
- [`packages/template/AGENTS.md`](packages/template/AGENTS.md)
- [`packages/examples/AGENTS.md`](packages/examples/AGENTS.md)
- [`packages/docs/AGENTS.md`](packages/docs/AGENTS.md)
- [`packages/e2e/AGENTS.md`](packages/e2e/AGENTS.md)

[angular]:
  https://github.com/angular/angular/blob/main/contributing-docs/commit-message-guidelines.md
