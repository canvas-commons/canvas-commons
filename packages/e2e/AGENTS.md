# @canvas-commons/e2e

End-to-end tests that exercise the full pipeline: vite plugin, editor, renderer,
and player. Drives Playwright against a real Vite server and compares rendered
frames to checked-in snapshots with `jest-image-snapshot`.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## Commands

```bash
pnpm e2e:test          # vitest run inside this package
pnpm --filter @canvas-commons/e2e run dev    # vite dev server (rarely needed)
```

Tests spin up Vite, launch a headless Chromium via Playwright, drive the editor
through render and playback flows, and write outputs to `./output/project/`. The
rendering test then reads those PNGs back and compares them to
`src/__image_snapshots__/`.

## Where things live

The test project's source lives wherever `app.ts` points Vite, typically a small
fixture inside this package's tree.

## Traps

**Image snapshots are checked into git.** If your change alters rendered output,
the snapshots need to be regenerated and committed. Don't blanket-regenerate;
verify each diff is intentional, especially anti-aliasing or sub-pixel changes
that can creep in across GPU/OS variations.

**This package depends on a working ffmpeg binary indirectly.** The render flow
goes through the vite plugin and may invoke `@canvas-commons/ffmpeg`. If exports
fail with binary-not-found errors, reinstall to fetch the correct platform
binary.

**Headless Chromium versions matter for pixel-exact diffs.** Playwright is
pinned in this package. If you bump it, expect snapshot churn.

**Tests are slow.** Each one boots Vite and Chromium. Don't add tests casually;
reach for unit tests in `core` or `2d` first.

## Don't touch without thinking

- `src/__image_snapshots__/`: only update with intent. Diffs are the test
  signal.
- `src/app.ts`: the Vite+Playwright handshake. Editing this can mask real
  failures.
- The pinned `playwright` version.

## Used in the wild

Not consumed outside the repo. CI runs `pnpm e2e:test` as the final integration
check.

When a `core` or `2d` change affects rendering, the e2e suite is what catches
it. The expected workflow:

1. Make the change.
2. Run `pnpm e2e:test`. If snapshots fail, inspect the diff under
   `src/__image_snapshots__/` versus the rendered output in `output/`.
3. If the diff is intentional, regenerate snapshots (delete the old PNG, re-run)
   and commit the new ones with a clear message about why they changed.
4. If the diff is unintentional, you've found a regression. Fix and re-run.
