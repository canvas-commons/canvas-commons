# @canvas-commons/fiddle

A browser playground runtime. It compiles a scene from source in a worker, runs
it inside a sandboxed iframe against vendored copies of `core` and `2d`, and
edits it in CodeMirror with TypeScript completions and diagnostics.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## Commands

```bash
pnpm fiddle:build                                # tsdown
pnpm fiddle:test                                 # vitest run
pnpm --filter @canvas-commons/fiddle run lint:pkg

# Produce the vendored bundles, the frame document and the type pack.
node packages/fiddle/lib/cli.js <output-dir> <public-base>
```

## Where things live

```
src/compiler.ts      Babel standalone, TSX plus legacy decorators, import allowlist.
src/worker.ts        Runs the compiler off the main thread.
src/protocol.ts      Host-to-harness messages, generation and variable tracking.
src/harness.ts       The iframe entry point that starts the harness.
src/harness-runtime.ts Injectable harness implementation, Player and Stage.
src/host.ts          The page side: creates the iframe and worker, debounces compiles.
src/editor.ts        CodeMirror with diagnostics and completions.
src/ts-*.ts          The language-service worker, its client and the CM bridge.
src/manifest.ts      The shape of a vendor build's output.
src/build-vendor.ts  The vendor build. src/type-pack.ts builds its types.json.
src/cli.ts           Command-line entry for the vendor build.
```

## Editor theme

The editor takes its colours from custom properties on the page. Each one has a
dark fallback, so an editor on a page that sets none is still readable. Set them
for both of a site's themes to make the editor follow the theme:

```
--cc-fiddle-background   --cc-fiddle-foreground   --cc-fiddle-font
--cc-fiddle-selection    --cc-fiddle-active-line  --cc-fiddle-muted
--cc-fiddle-border
--cc-fiddle-keyword      --cc-fiddle-string       --cc-fiddle-comment
--cc-fiddle-number       --cc-fiddle-function     --cc-fiddle-type
```

## Traps

**Assets are cached for a year, so the directory name has to change.** A vendor
build writes into `<engineVersion>-<hash>`. The hash covers the emitted bundles,
the frame template and the type pack, so a change to any of them mints a new
URL.

**The sandbox is the security boundary. The compiler's allowlist is only a
usability guard.** By default the preview frame is `sandbox="allow-scripts"`
only, giving it an opaque origin: scene code cannot reach the embedding page,
its storage, or the sandbox attribute itself. `allowSameOrigin` trades that
boundary away and must never be set where a third party chooses the code.

**An opaque origin needs `Access-Control-Allow-Origin` on the vendored
directory.** A module script, and every module the import map resolves, is
fetched with CORS from the frame's opaque origin. The hosting contract:

- Serve the versioned asset directory (`<engineVersion>-<hash>`) with
  `Access-Control-Allow-Origin: *` and a year-long cache. Its name changes with
  its contents, so caching it immutably is safe.
- Serve `manifest.json` with no cache, so a new deploy is picked up.
- GitHub Pages sends `Access-Control-Allow-Origin: *` on every response already.
  Netlify and Cloudflare Pages need a `_headers` rule:

  ```
  /fiddle/*
    Access-Control-Allow-Origin: *
    Cache-Control: public, max-age=31536000, immutable
  /fiddle/manifest.json
    ! Cache-Control
    Cache-Control: no-cache
  ```

A host that cannot send that header is the one case for `allowSameOrigin`.

**The compiler checks imports in a pass of its own.** The emit pass elides an
import whose bindings are all types, or the emitted module would ask the import
map for an export the bundle does not have. That elision also hides a disallowed
import, so the allowlist runs first, over the source as written.

**The compiler's allowlist and the frame's import map must agree.** The host
passes the import map's keys to the compiler as `extraSpecifiers`, so an import
cannot pass compilation and then fail to resolve in the iframe.

**`Project` and `FullSceneDescription` are completed after construction.**
`ProjectMetadata` reads the project it belongs to, and `Player` fills in a
scene's size, playback, logger and WebGL context before instantiating it. The
harness builds both in the same order `core`'s own bootstrap does.

**The type pack costs megabytes, so a page can put it off.** With
`deferTypeScript`, an editor starts with no language service and no type pack.
`enableTypeScript()` starts both. A page that may never be edited pays for
neither until the visitor focuses the editor.

**The type pack is validated with `skipLibCheck` off.** That is what catches an
ambient declaration that ships but never reaches the program. The pack itself
ships `skipLibCheck: true`, since checking every declaration on each worker
request would be wasted per-fiddle cost.

**The pack's compiler options have to survive `@typescript/vfs`.** It builds no
environment at all when the options produce a diagnostic, so a deprecated option
costs the whole language service. `validateClosure` checks the program's options
diagnostics for that reason.

**An empty document leaves the language service's program.** `@typescript/vfs`
reads empty text as a missing script snapshot, and a file the program has
dropped cannot be updated, only created. Select-all-delete is ordinary editing,
so `updateDocument` creates the file again.

**The harness installs `Code.defaultHighlighter`.** Highlighting compares tag
identities, so the harness, the `2d` bundle and `@lezer/javascript` must share
one copy of `@lezer/common` and `@lezer/highlight`. `SHARED_VENDOR_PACKAGES`
names the packages the vendor build asserts a single install of.

## Content security policy

The opaque sandbox isolates scene code from the host. The compiler's import
allowlist catches unsupported imports. CSP restricts browser resource loading.
Neither the allowlist nor CSP is an external-code containment boundary: with
`connect-src` and Blob modules allowed, a scene can fetch source and import a
Blob containing it. Resource requests can also transmit data.

The default frame policy starts with `default-src 'none'`. It allows inline
styles and HTTP(S), data and Blob images, media, fonts and connections. Scripts
are limited to the deployed vendor directory and Blob modules. Yoga requires
`'wasm-unsafe-eval'` for its embedded WebAssembly. JavaScript `'unsafe-eval'` is
not permitted. The import map and bootstrap use exact SHA-256 script hashes.

Two policies intersect to resolve the script directory at deployment time. The
static policy allows scripts from `'self'`, Blob URLs and the hashed inline
scripts. The hashed bootstrap installs a second policy with the frame's absolute
directory URL before importing the harness. This narrows script requests to that
directory without baking the deployment origin into the artifacts. Each policy
must permit a request, and the second cannot relax the first.

Use a hostname or IPv4 address when serving the default frame. CSP host sources
cannot express IPv6 literals. Serving on IPv6 requires a hostname or a custom
policy using `'self'`, which permits scripts across the origin. Vendor routes
must not redirect outside their directory: CSP path restrictions do not apply
after redirects.

`BuildVendorOptions.csp(importMapHash)` replaces the complete default policy and
omits the bootstrap's directory policy. The callback receives the quoted SHA-256
source for the emitted import map. It must be deterministic because the policy
participates in the artifact hash, and must supply its own script restrictions.
A working policy needs the import map hash, the vendor script location, `blob:`
for compiled scenes and `'wasm-unsafe-eval'` for Yoga, plus the asset directives
the application uses.

Asset permissions follow the loader, not the file extension:

| Loader                                                                     | CSP directive |
| -------------------------------------------------------------------------- | ------------- |
| `Img`, core `loadImage`, and SVG `<image>` nodes converted to `Img`        | `img-src`     |
| `Video`, including fast seeking, and `AudioManager`'s media element        | `media-src`   |
| `AudioResourceManager` fetching bytes for audio decoding                   | `connect-src` |
| `Icon` fetching SVG from `api.iconify.design`, or scene `fetch()` calls    | `connect-src` |
| Registered `FontFace` or `@font-face` URLs used by `document.fonts.load()` | `font-src`    |
| Explicit font-byte fetches and Yoga's embedded data-URL fetch              | `connect-src` |

`SVG` parses markup. Loading that markup from a URL requires a separate fetch.
MathJax renders local SVG glyph paths without webfont requests. The harness does
not inherit host font registrations. The TypeScript worker fetches its type pack
outside the frame and is not governed by the frame's policy.

`connect-src 'self' blob: data:` blocks external Iconify requests, remote audio
decoding and scene fetches to other origins, even if images and media from those
origins remain allowed by their own directives. `'self'` matches the policy's
response URL origin despite the opaque sandbox. Requests still have an opaque
CORS origin and need compatible server headers. CSP permission does not grant
CORS permission.

## Runtime and editor constraints

`harness.ts` starts automatically when the frame imports it. Tests instantiate
the injectable class in `harness-runtime.ts`. Reloads reuse the `Player` through
`onReplaced` and cancel the previous recalculation wait. Revoking a Blob URL
does not remove its module from the iframe's module registry. Unloading the
iframe releases those modules.

Compile generations and harness generations are independent. The host reserves a
compile generation when source changes and sends the successful compile's
generation with playback commands, without waiting for a harness echo.

TypeScript calls are synchronous inside the worker. Debounce diagnostics so
semantic checks do not queue ahead of every completion. `linter(null)` installs
CodeMirror's lint state without an idle pass that erases pushed diagnostics. The
TypeScript completion source replaces the default sources because options
without sections would sort ahead of the contextual group.

Completion lists may survive edits because CodeMirror maps their ranges.
Diagnostics and import edits must match the current document version. An entry's
replacement span belongs to the original list version. Resolving import details
uses CodeMirror's current completion endpoint. Insert the import before the
completion when both edits start at zero.

The language service needs both package entries and ambient declarations as
script roots, including packages the current source has not imported. Pass
format settings to `getCompletionEntryDetails`: TypeScript's change tracker
requires them despite the optional parameter type. Only supported trigger
characters may reach TypeScript. Ordinary letters use an unspecified trigger.

Contextual ranking depends on TypeScript's internal `sortText` values: values
below 15 denote in-scope symbols, and `z` marks deprecated entries. Ranking
tests cover that dependency. The bounded contextual pass skips ambient globals
and uninformative types, including null and undefined because the pack disables
strict null checks. It compares class and interface instance types, and caches
module exports against the resolved `SourceFile` identity.

The TypeScript worker bundles TypeScript and VFS for the browser. Its build sets
`process.browser` to true and Node-only path globals to undefined so downstream
bundlers do not analyze TypeScript's filesystem branch. Those dependencies stay
external only in declaration output. The shared DOM tsconfig declares the worker
scope locally because DOM and webworker libraries conflict.

The vendor includes the full engine and MathJax. Its largest chunk is about 2.4
MB. The build uses an explicit 3 MB warning budget. Suppress only Rolldown's
plugin timing diagnostic. Compiler and bundle warnings stay enabled.

## Don't touch without thinking

- The plugin order in `compiler.ts`. Legacy decorators must run before class
  properties, and TypeScript must strip `declare` fields before either. The last
  plugin then drops the constructor write Babel emits for a decorated field with
  no value, which would overwrite what `@signal` installed.
- Babel helper names come from `file.addHelper`, and source bindings can rename
  them. Reset per-transform metadata because Babel caches plugin objects.
- `new Worker(new URL('./worker.js', import.meta.url))` in `host.ts` and
  `ts-client.ts`. The `.js` names the built output, and the constructor form is
  the code-split point that keeps the compiler out of the host's chunk.
- The ambient `Callback` stub in `type-pack.ts`. `core`'s declarations reference
  it, and the file that declares it pulls in a Vite client reference the pack
  cannot resolve.
