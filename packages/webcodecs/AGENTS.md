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
in `client/__tests__`. The table pins each audio operation to the Web Audio
mechanism that implements it:

| operation              | Web Audio mechanism                                   |
| ---------------------- | ----------------------------------------------------- |
| input seek             | source-offset arg of `start(when, srcOffset, …)`      |
| trim end               | duration arg of `start(…, duration)` (source seconds) |
| gain (dB)              | `GainNode.gain = 10^(gain/20)`                        |
| speed + pitch          | `AudioBufferSourceNode.playbackRate`                  |
| delay (offset > 0)     | `start(when = offset, …)`                             |
| output sample rate     | `OfflineAudioContext` sample rate                     |
| mix (no normalization) | summing sources at `destination`                      |
| duration cap           | `OfflineAudioContext` length = video duration         |

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

**Audio codec depends on the browser.** Output audio is AAC where the browser
can encode it, otherwise Opus (both mux into mp4). Notably Linux Chrome and
Firefox have no AAC WebCodecs encoder, so they produce Opus (with a warning, as
its player support is narrower); if neither encodes, the file is written without
audio (also with a warning).

**Odd dimensions are rejected.** H.264 requires even width/height, so a render
whose `size * resolutionScale` is odd in either axis is refused up front (in
`start`) with a clear error rather than silently cropped.

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
