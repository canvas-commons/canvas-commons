# @canvas-commons/examples

The example scenes that ship with the documentation site. One scene per concept
(tweening, layouts, signals, transitions, presentations, media, code blocks,
...). Built and embedded by `@canvas-commons/docs` so the docs pages can show
working animations next to their explanations.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## Commands

```bash
pnpm examples:dev      # vite dev server with the editor
pnpm examples:build    # tsc && vite build --base /examples/
```

The build base is `/examples/` because the output is mounted under that path on
the docs site.

## Where things live

Each scene file is paired with a `.meta` sibling that stores time events, slide
markers, and project-specific metadata.

## Traps

**These scenes are the docs site's source of truth.** When the docs say "see the
example at /examples/foo", that's `src/scenes/foo.tsx`. Renaming or deleting a
scene breaks doc links; coordinate with `@canvas-commons/docs`.

**`.meta` files are JSON.** They're authored by the editor, not by hand.
Hand-editing is fine for small changes but easy to corrupt. Prefer opening the
scene in the editor and using its UI.

**This package is private (`@canvas-commons/examples`).** Don't add it as a
runtime dep of anything published.

## Don't touch without thinking

- Scene file names. The docs reference them.
- `.meta` files unless you know what each field does.

## Used in the wild

Not consumed by anything outside this repo; the docs package builds it and
serves it. The scenes themselves are useful as reference patterns when writing
new ones. A common starting point is `src/scenes/quickstart.tsx`:

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

For presentation-style scenes (slide markers, loops, cancellation), see
`src/scenes/presentation.tsx`. For signal-driven property graphs, see
`src/scenes/node-signal.tsx`.
