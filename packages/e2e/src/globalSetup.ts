import * as path from 'path';
import {firefox, BrowserServer as PlaywrightBrowserServer} from 'playwright';
import {fileURLToPath} from 'url';
import {createServer, ViteDevServer} from 'vite';
import type {TestProject} from 'vitest/node';

const Root = fileURLToPath(new URL('.', import.meta.url));

let ViteServer: ViteDevServer | null = null;
let BrowserServer: PlaywrightBrowserServer | null = null;

export async function setup(project: TestProject) {
  const [server, browser] = await Promise.all([
    createServer({
      root: Root,
      configFile: path.resolve(Root, '../vite.config.ts'),
    }).then(s => s.listen()),
    firefox.launchServer({headless: true}),
  ]);

  ViteServer = server;
  BrowserServer = browser;

  const port = server.config.server.port!;
  const wsEndpoint = browser.wsEndpoint();

  // Dev-server dependency optimization triggers a full reload when it
  // lands. Without a warm-up, that reload fires inside the first real
  // test, which can drop dynamic state like the player's `src` attribute.
  const warm = await firefox.connect(wsEndpoint);
  const warmPage = await warm.newPage();
  await warmPage.goto(`http://localhost:${port}/`);
  await warmPage.waitForSelector('main');
  await warmPage.close();
  await warm.close();

  project.provide('vitePort', port);
  project.provide('browserWsEndpoint', wsEndpoint);
}

export async function teardown() {
  await Promise.all([ViteServer?.close(), BrowserServer?.close()]);
}

declare module 'vitest' {
  export interface ProvidedContext {
    vitePort: number;
    browserWsEndpoint: string;
  }
}
