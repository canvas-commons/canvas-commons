# @canvas-commons/webcodecs

A self-contained in-browser video exporter. Encodes video **and** mixes +
encodes audio entirely in the browser via [Mediabunny](https://mediabunny.dev)
(a WebCodecs muxer + encoders) and the Web Audio API, then uploads the finished
mp4 to the dev server, which only writes it to disk. **No ffmpeg.** Skips the
ffmpeg exporter's per-frame PNG encode and frame transfer — the throughput
bottleneck at high resolutions.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## License

MIT, like the rest of the repo. The `mediabunny` dependency is MPL-2.0 —
file-level copyleft, fine to depend on from MIT code as long as its sources
aren't modified.

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

## Where things live

Source lives at the package root under `client/` and `server/`; `tsdown` outputs
to `lib/`. Exports mirror ffmpeg: `.`/`./server` is the Vite plugin, `./client`
is the browser exporter.

- `client/WebCodecsExporterClient.ts` — the `Exporter`. Drives a Mediabunny
  `Output` (`CanvasSource` for video, `AudioBufferSource` for audio), POSTs the
  mp4.
- `client/mixAudio.ts` — renders the project's audio to one `AudioBuffer` in an
  `OfflineAudioContext`, mirroring the ffmpeg filtergraph (table below).
- `client/mixMath.ts` — the pure mix math (unit-tested in `client/__tests__`).
- `server/index.ts` — the Vite plugin: receives the mp4 and writes it out.

Runtime deps: `@canvas-commons/core`, `@canvas-commons/vite-plugin`,
`mediabunny`.

## Audio parity with the ffmpeg exporter

The in-browser mix reproduces `@canvas-commons/ffmpeg`'s `applyAudioGraph`
filtergraph filter-for-filter, so both exporters yield the same audio:

| ffmpeg filter            | Web Audio equivalent                                    |
| ------------------------ | ------------------------------------------------------- |
| `-ss` (input seek)       | source offset arg of `start(when, srcOffset, …)`        |
| `atrim` (end)            | duration arg of `start(…, duration)` (source seconds)   |
| `volume=${gain}dB`       | `GainNode.gain = 10^(gain/20)`                          |
| `asetrate` + `aresample` | `AudioBufferSourceNode.playbackRate = realPlaybackRate` |
| `adelay` (offset > 0)    | `start(when = offset, …)`                               |
| `aresample` (rate)       | `OfflineAudioContext` sample rate                       |
| `amix` (`normalize=0`)   | summing sources at `destination`                        |
| `-t` (duration cap)      | `OfflineAudioContext` length = video duration           |

## Traps

**Needs a WebCodecs encoder, secure context.** `VideoEncoder` must be present
(the exporter throws a clear message otherwise) — true for Chromium and recent
Firefox (verified on **Firefox 151**: real H.264 + Opus encode at 1080p and 4K).
Firefox shipped the WebCodecs encoder later than Chromium, so only older Firefox
hits the throw. WebCodecs is exposed only over `https`/`localhost`, both of
which the editor dev server satisfies. Hardware H.264 encode is unavailable in
headless Chrome on Linux/NVIDIA, so the `realtime` latency mode is the practical
speed lever.

**Audio codec depends on the browser.** Output audio is AAC where the browser
can encode it, otherwise Opus (both mux into mp4). Notably Linux Chrome and
Firefox have no AAC WebCodecs encoder, so they produce Opus; if neither encodes,
the file is written without audio (with a warning).

**Odd dimensions are handled.** H.264 requires even width/height, so an odd
render canvas (`size * resolutionScale`) is encoded through an even-sized
canvas, dropping the last row/column.

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
