import * as path from 'path';
import {Page, firefox} from 'playwright';
import {fileURLToPath} from 'url';
import {createServer} from 'vite';

const Root = fileURLToPath(new URL('.', import.meta.url));

export interface App {
  page: Page;
  stop: () => Promise<void>;
}

export interface StartOptions {
  /**
   * Path to navigate to on the dev server. Defaults to `'/'`, which loads
   * the editor. Pass `'/player.html'` to load the standalone player smoke
   * page instead.
   */
  path?: string;
  /**
   * Selector to wait for after navigation. Defaults to `'main'`, which is
   * the editor's root element.
   */
  waitFor?: string;
}

export async function start(options: StartOptions = {}): Promise<App> {
  const {path: targetPath = '/', waitFor = 'main'} = options;

  const [browser, server] = await Promise.all([
    firefox.launch({
      headless: true,
    }),
    createServer({
      root: Root,
      configFile: path.resolve(Root, '../vite.config.ts'),
    }).then(server => server.listen()),
  ]);

  const page = await browser.newPage();
  await page.goto(`http://localhost:${server.config.server.port}${targetPath}`);
  await page.waitForSelector(waitFor);

  return {
    page,
    async stop() {
      await Promise.all([browser.close(), server.close()]);
    },
  };
}
