# @canvas-commons/motion-canvas-compat

Use Motion Canvas component libraries from npm in a Canvas Commons project. The
libraries import `@motion-canvas/*`. This package serves those imports from
Canvas Commons, so the project and the libraries share one engine.

> **Experimental.** This package may change or be removed in any release. The
> plugin needs the option `{experimental: true}`.

```bash
npm install -D @canvas-commons/motion-canvas-compat
```

Add the plugin next to the Canvas Commons plugin:

```ts
import canvasCommons from '@canvas-commons/vite-plugin';
import motionCanvasCompat from '@canvas-commons/motion-canvas-compat';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [canvasCommons(), motionCanvasCompat({experimental: true})],
});
```

See the
[guide](https://canvascommons.io/docs/migration/motion-canvas-libraries).
