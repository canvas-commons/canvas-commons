import {Browser, firefox, Page} from 'playwright';
import {inject} from 'vitest';

let BrowserPromise: Promise<Browser> | null = null;

export interface PageOptions {
  /**
   * Path to navigate to on the dev server. Defaults to `'/'`, which loads
   * the project selection screen in a multi-project package and the editor
   * directly in a single-project one.
   */
  path?: string;
  /**
   * Selector to wait for after navigation. Defaults to `'main'`, which both
   * the editor and the project selection screen render into.
   */
  waitFor?: string;
}

export async function getSharedBrowser(): Promise<Browser> {
  BrowserPromise ??= firefox.connect(inject('browserWsEndpoint'));
  return BrowserPromise;
}

export function baseUrl(): string {
  return `http://localhost:${inject('vitePort')}`;
}

export async function newPage(options: PageOptions = {}): Promise<Page> {
  const {path: targetPath = '/', waitFor = 'main'} = options;
  const browser = await getSharedBrowser();
  const page = await browser.newPage();
  await page.goto(`${baseUrl()}${targetPath}`);
  await page.waitForSelector(waitFor);
  return page;
}
