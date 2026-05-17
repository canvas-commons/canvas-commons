# @canvas-commons/editor

The visual editor that runs against a Canvas Commons project: timeline, preview,
scene graph, inspector, asset panel, presenter mode. Built with Preact and
`@preact/signals`. Loaded by `@canvas-commons/vite-plugin` during
`pnpm template:dev`, `examples:dev`, and any downstream project's dev server.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## Commands

```bash
pnpm editor:dev        # vite dev server on the editor itself
pnpm editor:build      # tsc && vite build, outputs to dist/
pnpm editor:type       # tsc -w, type-check on save
pnpm editor:showcase   # tsc && vite build -c vite.showcase.ts
pnpm --filter @canvas-commons/editor run preview
pnpm --filter @canvas-commons/editor run lint:pkg
```

`editor:dev` boots the editor by itself, useful when iterating on UI in
isolation. For end-to-end iteration against a real project use
`pnpm template:dev` from the repo root.

## Where things live

The `./` export is `dist/main.js` plus `dist/main.d.ts`. The `./style.css`
subpath is the editor stylesheet. Downstream projects don't import from this
package directly; the vite plugin wires it in.

## Traps

**This package is Preact. Not React.** `tsconfig.json` sets
`jsxImportSource: "preact"`. Imports come from `preact`, `preact/hooks`,
`@preact/signals`. If you reach for `react` you'll get the wrong types and the
wrong runtime.

**Two signal systems live next to each other.** UI state in this package uses
`@preact/signals` (`useSignal`, `useSignalEffect`, plain `signal()` for
module-level state). Animation state under the editor uses
`@canvas-commons/core` signals. They look similar; they're not interchangeable.
`storedSignal.ts` is a Preact-signals wrapper, not a core wrapper.

**The 2D editor plugin lives in another package.** Anything 2D-specific (scene
graph tab, node inspector, preview overlay) is in
`@canvas-commons/2d/src/editor/` and built by 2d's Rollup config. This package
provides the plugin shape via `makeEditorPlugin`; 2d implements one.

**Experimental editor hooks log a warning.** Plugins that name themselves
outside `@canvas-commons/*` and use `tabs`, `provider`, `previewOverlay`,
`presenterOverlay`, `inspectors`, or `shortcuts` will trigger an
`experimentalLog` unless the project sets `experimentalFeatures: true`. See
`main.tsx` for the exact list.

## Don't touch without thinking

- `src/main.tsx`: `editor(project)` and `index(projects)` are the entry points
  the vite plugin calls. Their signatures are part of the contract with
  `@canvas-commons/vite-plugin`.
- The plugin interface in `src/plugin/`. Third-party editor plugins implement
  against it.
- `storedSignal.ts`: persists state under `${projectName}-${id}` keys. Changing
  the key shape will silently lose users' editor state.

## Used in the wild

Implementing an editor plugin for a 2D project (the pattern 2d itself uses):

```tsx
/* @jsxImportSource preact */
import {makeEditorPlugin} from '@canvas-commons/editor';

export default makeEditorPlugin(() => ({
  name: 'my-plugin',
  tabs: [
    {
      name: 'my-tab',
      icon: () => <span>icon</span>,
      tab: () => <div>panel contents</div>,
    },
  ],
}));
```

Persisting a piece of UI state to localStorage:

```tsx
import {storedSignal} from '@canvas-commons/editor';

function ColorPicker() {
  const color = storedSignal('#e13238', 'inspector/color');
  return (
    <input
      value={color.value}
      onInput={e => (color.value = e.currentTarget.value)}
    />
  );
}
```

`storedSignal` keys are scoped to the current project name, so two projects
won't stomp on each other.
