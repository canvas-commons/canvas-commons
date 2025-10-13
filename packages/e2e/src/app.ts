import * as path from 'path';
import {Page, firefox} from 'playwright';
import {fileURLToPath} from 'url';
import {createServer} from 'vite';

const Root = fileURLToPath(new URL('.', import.meta.url));

export interface App {
  page: Page;
  stop: () => Promise<void>;
}

export async function start(projectName?: string): Promise<App> {
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
  const baseUrl = `http://localhost:${server.config.server.port}`;
  const url = projectName
    ? `${baseUrl}/tests/projects/${projectName}`
    : baseUrl;

  await page.goto(url);
  await page.waitForSelector('main');

  return {
    page,
    async stop() {
      await Promise.all([browser.close(), server.close()]);
    },
  };
}
