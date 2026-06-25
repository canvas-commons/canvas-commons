# @canvas-commons/svg

A vector (SVG) exporter. Instead of rasterizing the canvas, it walks the 2D
scene graph and serializes each frame into a standalone `.svg`, mirroring the
transforms, z-ordering, gradients, filters, and clips the renderer draws.
Animated scenes emit one SVG per frame, but the usual case is a single frame
(logos, diagrams). The client half does the work in the browser editor; the
server half is a thin Vite plugin that registers the exporter and lets the
vite-plugin write the files.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## Commands

```bash
pnpm --filter @canvas-commons/svg run dev      # tsdown --watch
pnpm --filter @canvas-commons/svg run build    # tsdown
pnpm --filter @canvas-commons/svg run lint:pkg
```

No test script. The exporter runs in the browser and is exercised end-to-end
through `pnpm template:dev` (and the e2e SVG-fidelity suite).
`@canvas-commons/*` deps are never bundled.

## Traps

**Each node serializes itself.** The walk reads generic node state (transform,
opacity, filters, clip) and delegates geometry to each node's `toSVG`. A node
that draws to canvas but doesn't implement `toSVG` exports nothing — it must
track the renderer or vector and raster output diverge.

**Fonts only embed when `embed fonts` is on.** SVGs opened through an `<img>`
tag are sandboxed and can't fetch external fonts, so un-embedded text silently
falls back. Embedding inlines the font bytes as base64 so the document is
self-contained. Collection is best-effort: same-origin `@font-face` rules come
from the CSSOM, cross-origin ones (the editor's Google Fonts) are re-fetched and
parsed, and anything that can't be embedded is warned and skipped.

**Compositing and filters are approximations.** Blend modes map to
`mix-blend-mode`; `source-in` is emulated by masking; every other Porter-Duff
operator falls back to `source-over` with a warning. Filters force sRGB working
space and an enlarged region to match the canvas — output drifts if you touch
those defaults.

**Pattern fills approximate, text-on-a-path is faithful but not live.** A
pattern fill becomes a `<pattern>` (only `repeat` maps exactly; other
repetitions warn and tile). Text along a path is emitted as one positioned
`<text>` per glyph to match the renderer's placement exactly — a native
`<textPath>` can't, since a path forces each glyph's rotation to follow the
tangent — so the run is faithful but no longer a single selectable string.

## Used in the wild

In a downstream `vite.config.ts`:

```ts
import {defineConfig} from 'vite';
import canvasCommons from '@canvas-commons/vite-plugin';
import svg from '@canvas-commons/svg';

export default defineConfig({
  plugins: [canvasCommons(), svg()],
});
```

Once wired, the editor's render panel offers an "SVG (vector)" exporter with
`group by scene` and `embed fonts` toggles.
