# @canvas-commons/create

The scaffolding CLI. Run it to bootstrap a fresh Canvas Commons project
preconfigured with the vite plugin, an example scene, and the right TypeScript
or JavaScript setup. Invoked through `pnpm create canvas-commons` or
`npm create canvas-commons`.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## Commands

```bash
# As a downstream user
pnpm create canvas-commons
# or
npm create canvas-commons@latest

# Local development against the CLI itself
node packages/create/index.js
```

No build step. `index.js` is the published artifact directly. No test script.

## Where things live

```
index.js                Executable. Reads args, prompts, copies a template.
template-2d-js/         JavaScript starter (package.json, vite.config.js, src/)
template-2d-ts/         TypeScript starter (package.json, vite.config.ts, src/)
```

Both templates ship a minimal scene, a project file, and a `vite.config` that
wires `@canvas-commons/vite-plugin`. They're checked-in source, not generated.

Dependencies are `minimist` for arg parsing and `prompts` for the interactive
selector. The workspace `@canvas-commons/*` deps are dev-only so the templates
can reference them during local development.

## Traps

**Files under `template-2d-js/` and `template-2d-ts/` are excluded from the
repo's ESLint and Prettier.** They're shipped as-is to downstream users, so
formatting and lint rules don't apply. Don't try to "clean them up"; they're
intentionally the simplest possible starting point.

**Both templates need to keep their `vite.config` and `tsconfig` in sync with
what the vite plugin actually expects.** When the plugin's defaults change,
update both templates.

**The CLI runs with whatever Node the user has.** It's plain JS, ES modules, no
TypeScript build step. Avoid Node-version-specific syntax.

## Don't touch without thinking

- `index.js`'s prompts and flag handling. This is the user's first interaction
  with the project.
- The `bin` entry in `package.json` (`create-canvas-commons`). That's the name
  `npm create` resolves.
- Template `package.json` dependency versions. They pin the published
  canvas-commons versions a fresh project starts on.

## Used in the wild

A user bootstrapping a new TypeScript project:

```bash
$ npm create canvas-commons@latest
> Project name: my-animation
> Language: TypeScript
> ...
$ cd my-animation
$ npm install
$ npm start
```

The generated `vite.config.ts` looks roughly like:

```ts
import {defineConfig} from 'vite';
import canvasCommons from '@canvas-commons/vite-plugin';

export default defineConfig({
  plugins: [canvasCommons()],
});
```

That's the same shape any downstream project ends up with, scaffolded or
hand-written.
