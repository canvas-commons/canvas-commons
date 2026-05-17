# @canvas-commons/ffmpeg

The video exporter. Hooks into the Vite plugin so the editor's render button can
produce an MP4 (or other ffmpeg-supported format) instead of a PNG sequence.
Split into a server half that drives ffmpeg over fluent-ffmpeg and a client half
that talks to it from the browser.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## License

GPLv3. The rest of the repo is MIT. If you're importing ffmpeg from a downstream
project that needs to stay MIT, only include it as an optional dev tool and keep
it out of the production bundle.

## Commands

```bash
pnpm --filter @canvas-commons/ffmpeg run dev      # tsdown --watch
pnpm --filter @canvas-commons/ffmpeg run build    # tsdown
pnpm --filter @canvas-commons/ffmpeg run lint:pkg
```

No test script. Exercised end-to-end through `pnpm template:dev` and any
downstream project that wires the plugin.

## Where things live

Note that source lives at the package root under `server/` and `client/`, not
under `src/`. `tsdown` outputs to `lib/server/` and `lib/client/`. Exports:

- `.`: same as `./server`. Default-imports of the package get the server half
  (this is what the Vite plugin needs).
- `./server`: explicit server entry.
- `./client`: browser entry.

Runtime deps: `@canvas-commons/core`, `@canvas-commons/vite-plugin`,
`fluent-ffmpeg`, `ffmpeg-ffprobe-static`. The static binary ships a working
ffmpeg, so there's no system-level install requirement.

## Traps

**The default import is the server.**
`import ffmpeg from '@canvas-commons/ffmpeg'` gives you the server entry, which
is what you want in `vite.config.ts`. Don't import this in browser code; reach
for `./client` instead.

**It only works when combined with the vite plugin.** The bridge talks to the
dev server over routes the vite plugin owns. Wire both, or neither.

## Don't touch without thinking

- The server/client split. The bridge protocol assumes the server module is the
  one running in Node.
- Default export shape. Wiring it as `ffmpeg()` in Vite configs is the public
  contract.

## Used in the wild

In a downstream `vite.config.ts`:

```ts
import {defineConfig} from 'vite';
import canvasCommons from '@canvas-commons/vite-plugin';
import ffmpeg from '@canvas-commons/ffmpeg';

export default defineConfig({
  plugins: [canvasCommons(), ffmpeg()],
});
```

Once wired, the editor's render panel offers MP4 output. No additional imports
in scene code.
