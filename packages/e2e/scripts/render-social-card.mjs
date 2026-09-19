#!/usr/bin/env node
// Renders the docs social card to a PNG without running the full e2e suite.
import * as fs from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {firefox} from 'playwright';
import {createServer} from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const e2eRoot = resolve(here, '..');
const outputFile = resolve(e2eRoot, '../docs/static/img/social-card.png');

const server = await createServer({
  root: e2eRoot,
  configFile: resolve(e2eRoot, 'vite.config.ts'),
}).then(s => s.listen());
const browserServer = await firefox.launchServer({headless: true});

try {
  const {useStandaloneServer} = await server.ssrLoadModule('/src/app.ts');
  useStandaloneServer(server.config.server.port, browserServer.wsEndpoint());

  const {openScene, renderFrame} = await server.ssrLoadModule(
    '/src/helpers/render.ts',
  );

  const page = await openScene('social-card');
  const png = await renderFrame(page, 'social-card', 0, 1);
  await page.close();

  await fs.writeFile(outputFile, png);
  console.log(`Wrote ${outputFile} (${png.length} bytes)`);
} finally {
  await Promise.all([server.close(), browserServer.close()]);
}
