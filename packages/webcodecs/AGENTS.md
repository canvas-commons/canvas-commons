# @canvas-commons/webcodecs

A self-contained in-browser video exporter. Encodes video and audio via
[Mediabunny](https://mediabunny.dev) (a WebCodecs muxer + encoders) and the Web
Audio API, then uploads the finished mp4 to the dev server, which only writes it
to disk.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## License

MIT. The `mediabunny` dependency is MPL-2.0 (file-level copyleft) — fine to
depend on as long as its sources aren't modified.

## Commands

```bash
pnpm --filter @canvas-commons/webcodecs run dev      # tsdown --watch
pnpm --filter @canvas-commons/webcodecs run build    # tsdown
pnpm --filter @canvas-commons/webcodecs run test     # vitest (mix-math parity)
pnpm --filter @canvas-commons/webcodecs run lint:pkg
```

The unit tests cover only the pure audio-mix math. The full pipeline runs in the
browser (Chromium or recent Firefox) and is exercised through a downstream
project that wires the plugin (`pnpm template:dev`).

## Audio mix

`mixAudio.ts` renders the project's audio to a single `AudioBuffer` in an
`OfflineAudioContext`; `mixMath.ts` holds the pure timing/gain math, unit-tested
in `client/__tests__`.

## Traps

**Needs a WebCodecs encoder, secure context.** `VideoEncoder` must be present
(the exporter throws a clear message otherwise) — true for Chromium and recent
Firefox (verified on **Firefox 151**: real H.264 + Opus encode at 1080p and 4K);
see [caniuse](https://caniuse.com/webcodecs) for current support. Firefox
shipped the WebCodecs encoder later than Chromium, so only older Firefox hits
the throw. WebCodecs is exposed only over `https`/`localhost`, both of which the
editor dev server satisfies. Hardware H.264 encode is unavailable in headless
Chrome on Linux/NVIDIA, so the `realtime` latency mode is the practical speed
lever.

**Codec and quality are configurable.** The exporter exposes video/audio codec
dropdowns (the mp4-muxable subset of mediabunny's `VIDEO_CODECS`/`AUDIO_CODECS`)
and a resolution-aware `Quality` preset; defaults are H.264 + AAC at `high`.

**Audio codec falls back per browser.** The chosen audio codec is used where the
browser can encode it, otherwise the first encodable of `aac`/`opus` (both mux
into mp4). Notably Linux Chrome and Firefox have no AAC encoder, so they fall
back to Opus (with a warning); if none encodes, the file is written without
audio (also with a warning).

**Odd dimensions are rejected for H.264/H.265.** Those codecs require even
width/height, so a render whose `size * resolutionScale` is odd in either axis
is refused up front (in `start`) rather than silently cropped. VP8/VP9/AV1 allow
odd dimensions and skip the check. A chosen video codec the browser can't encode
is also rejected up front (in `begin`, via `canEncodeVideo`).

## Used in the wild

In a downstream `vite.config.ts`:

```ts
import {defineConfig} from 'vite';
import canvasCommons from '@canvas-commons/vite-plugin';
import webcodecs from '@canvas-commons/webcodecs';

export default defineConfig({
  plugins: [canvasCommons(), webcodecs()],
});
```

Once wired, the editor's render panel offers a "Video (WebCodecs)" exporter.
