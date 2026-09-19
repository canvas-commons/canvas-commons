// @vitest-environment node
import {createHash} from 'crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {runInNewContext} from 'vm';
import {
  buildFiddleVendor,
  CORE_VENDOR_PACKAGES,
  findDuplicatePackageRoots,
  SHARED_VENDOR_PACKAGES,
} from './build-vendor';
import type {FiddleVendorManifest} from './manifest';

const BUILD_TIMEOUT_MS = 300_000;

describe('buildFiddleVendor', () => {
  let outputDir: string;
  let manifest: FiddleVendorManifest;

  beforeAll(async () => {
    outputDir = mkdtempSync(join(tmpdir(), 'fiddle-vendor-'));
    manifest = await buildFiddleVendor({outputDir, publicBase: '/fiddle'});
  }, BUILD_TIMEOUT_MS);

  afterAll(() => {
    if (outputDir) rmSync(outputDir, {recursive: true, force: true});
  });

  it('writes the manifest it returns', () => {
    const written = JSON.parse(
      readFileSync(join(outputDir, 'manifest.json'), 'utf8'),
    ) as FiddleVendorManifest;
    expect(written).toEqual(manifest);
  });

  it('names the asset directory after the engine version and the hash', () => {
    const directories = readdirSync(outputDir).filter(
      name => name !== 'manifest.json',
    );
    expect(directories).toEqual([`${manifest.engineVersion}-${manifest.hash}`]);
    expect(manifest.engineVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('points every URL inside the versioned directory', () => {
    const base = `/fiddle/${manifest.engineVersion}-${manifest.hash}`;
    const urls = [
      manifest.frameUrl,
      manifest.harnessUrl,
      ...Object.values(manifest.importMap.imports),
    ];
    for (const url of urls) {
      expect(url.startsWith(`${base}/`)).toBe(true);
      expect(existsSync(join(outputDir, url.slice('/fiddle/'.length)))).toBe(
        true,
      );
    }
  });

  it('emits one bundle per vendored package', () => {
    expect(Object.keys(manifest.importMap.imports).sort()).toEqual(
      CORE_VENDOR_PACKAGES.map(pkg => pkg.specifier).sort(),
    );
  });

  it('emits a frame document carrying the import map and the harness', () => {
    const frameHtml = readFileSync(
      join(outputDir, manifest.frameUrl.slice('/fiddle/'.length)),
      'utf8',
    );
    expect(frameHtml).toContain('<script type="importmap">');
    for (const specifier of Object.keys(manifest.importMap.imports)) {
      expect(frameHtml).toContain(specifier);
    }
    expect(frameHtml).toContain(manifest.harnessUrl);
  });

  it('restricts scripts while allowing engine assets and WebAssembly', () => {
    const frameHtml = readFileSync(
      join(outputDir, manifest.frameUrl.slice('/fiddle/'.length)),
      'utf8',
    );
    const policy = frameHtml.match(
      /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/,
    )?.[1];
    const importMap = frameHtml.match(
      /<script type="importmap">([\s\S]*?)<\/script>/,
    )?.[1];
    const bootstrap = frameHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];

    expect(policy).toBeDefined();
    expect(importMap).toBeDefined();
    expect(bootstrap).toBeDefined();
    if (!policy || !importMap || !bootstrap) return;

    const hash = (text: string) =>
      `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
    expect(policy.split('; ')).toEqual([
      "default-src 'none'",
      `script-src 'self' blob: 'wasm-unsafe-eval' ${hash(importMap)} ${hash(bootstrap)}`,
      "style-src 'unsafe-inline'",
      'img-src http: https: data: blob:',
      'media-src http: https: data: blob:',
      'font-src http: https: data: blob:',
      'connect-src http: https: data: blob:',
      "base-uri 'none'",
      "form-action 'none'",
    ]);
    expect(frameHtml.indexOf('Content-Security-Policy')).toBeLessThan(
      frameHtml.indexOf('<style>'),
    );
    expect(bootstrap).toContain("new URL('.', window.location.href)");
    expect(bootstrap).toContain(hash(importMap));
    expect(bootstrap.indexOf('document.head.append')).toBeLessThan(
      bootstrap.indexOf('document.body.append'),
    );
    expect(frameHtml).not.toContain('<script type="module"');
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it.each([
    [
      'http://localhost:8080/fiddle/frame.html',
      'http://localhost:8080/fiddle/',
    ],
    [
      'https://docs.example/base;a,b/fiddle/frame.html',
      'https://docs.example/base%3Ba%2Cb/fiddle/',
    ],
  ])('scopes scripts before starting the harness at %s', (href, directory) => {
    const frameHtml = readFileSync(
      join(outputDir, manifest.frameUrl.slice('/fiddle/'.length)),
      'utf8',
    );
    const bootstrap = frameHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(bootstrap).toBeDefined();
    if (!bootstrap) return;

    const elements: {tag: string; content?: string; src?: string}[] = [];
    const parent = {
      append: (element: (typeof elements)[number]) => elements.push(element),
    };
    runInNewContext(bootstrap, {
      /* eslint-disable-next-line @typescript-eslint/naming-convention -- the
         context key is the global constructor's own name. */
      URL,
      window: {location: {href}},
      document: {
        createElement: (tag: string) => ({tag}),
        head: parent,
        body: parent,
      },
    });
    expect(elements).toEqual([
      expect.objectContaining({
        tag: 'meta',
        httpEquiv: 'Content-Security-Policy',
        content: expect.stringContaining(
          `script-src ${directory} blob: 'wasm-unsafe-eval' 'sha256-`,
        ),
      }),
      expect.objectContaining({
        tag: 'script',
        type: 'module',
        src: manifest.harnessUrl,
      }),
    ]);
    expect(elements[0].content).not.toContain("'self'");
  });

  it('emits a type pack the worker can check its own version against', () => {
    expect(manifest.typesUrl).toBeDefined();
    expect(manifest.tsVersion).toMatch(/^\d+\.\d+\.\d+/);
    const typesPath = join(
      outputDir,
      String(manifest.typesUrl).slice('/fiddle/'.length),
    );
    const pack = JSON.parse(readFileSync(typesPath, 'utf8')) as {
      tsVersion: string;
      files: {path: string}[];
      rootPaths: string[];
    };
    expect(pack.tsVersion).toBe(manifest.tsVersion);
    expect(pack.rootPaths.length).toBe(CORE_VENDOR_PACKAGES.length);
    expect(pack.files.length).toBeGreaterThan(0);
  });

  it(
    'reuses the directory and prunes only stale vendor directories',
    async () => {
      const staleVendorDir = `${manifest.engineVersion}-${'0'.repeat(16)}`;
      mkdirSync(join(outputDir, staleVendorDir), {recursive: true});
      const stalePrereleaseDir = `0.1.0-beta.2+local-${'0'.repeat(16)}`;
      mkdirSync(join(outputDir, stalePrereleaseDir), {recursive: true});
      const sharedAssetDir = `images-${'0'.repeat(16)}`;
      mkdirSync(join(outputDir, sharedAssetDir), {recursive: true});
      const archiveDir = `archive-${staleVendorDir}`;
      mkdirSync(join(outputDir, archiveDir), {recursive: true});
      mkdirSync(join(outputDir, 'blog'), {recursive: true});
      writeFileSync(join(outputDir, 'blog', 'post.html'), '<p>hi</p>');
      writeFileSync(join(outputDir, 'robots.txt'), 'User-agent: *\n');

      const rebuilt = await buildFiddleVendor({
        outputDir,
        publicBase: '/fiddle',
      });

      expect(rebuilt.hash).toBe(manifest.hash);
      const entries = readdirSync(outputDir);
      expect(entries).toContain(`${manifest.engineVersion}-${manifest.hash}`);
      expect(entries).not.toContain(staleVendorDir);
      expect(entries).not.toContain(stalePrereleaseDir);
      expect(entries).toContain(sharedAssetDir);
      expect(entries).toContain(archiveDir);
      expect(entries).toContain('blog');
      expect(entries).toContain('robots.txt');
      expect(existsSync(join(outputDir, 'blog', 'post.html'))).toBe(true);
    },
    BUILD_TIMEOUT_MS,
  );
});

describe('buildFiddleVendor custom CSP', () => {
  it(
    'replaces the default, supplies the import-map hash, and changes the asset URL',
    async () => {
      const outputDir = mkdtempSync(join(tmpdir(), 'fiddle-vendor-csp-'));
      try {
        const options = {outputDir, publicBase: '/fiddle', skipTypePack: true};
        const original = await buildFiddleVendor(options);
        const custom = await buildFiddleVendor({
          ...options,
          csp: importMapHash =>
            `default-src 'none'; script-src ${importMapHash}; report-uri /"<report>`,
        });
        const frameHtml = readFileSync(
          join(outputDir, custom.frameUrl.slice('/fiddle/'.length)),
          'utf8',
        );
        const importMap = frameHtml.match(
          /<script type="importmap">([\s\S]*?)<\/script>/,
        )?.[1];
        expect(importMap).toBeDefined();
        if (!importMap) return;
        const hash = createHash('sha256').update(importMap).digest('base64');
        expect(frameHtml).toContain(
          `content="default-src 'none'; script-src 'sha256-${hash}'; report-uri /&quot;&lt;report&gt;"`,
        );
        expect(frameHtml).not.toContain('connect-src');
        expect(frameHtml).not.toContain('document.head.append');
        expect(frameHtml).toContain(
          `<script type="module" src="${custom.harnessUrl}">`,
        );
        expect(custom.hash).not.toBe(original.hash);
      } finally {
        rmSync(outputDir, {recursive: true, force: true});
      }
    },
    BUILD_TIMEOUT_MS,
  );
});

describe('findDuplicatePackageRoots', () => {
  let root: string;

  function install(installPath: string, name: string): string {
    const directory = join(root, installPath);
    mkdirSync(directory, {recursive: true});
    writeFileSync(join(directory, 'package.json'), JSON.stringify({name}));
    const modulePath = join(directory, 'index.js');
    writeFileSync(modulePath, 'export {};\n');
    return modulePath;
  }

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'fiddle-roots-'));
  });

  afterAll(() => {
    if (root) rmSync(root, {recursive: true, force: true});
  });

  it('reports every install of a package bundled more than once', () => {
    const first = install(
      'a/node_modules/@lezer/highlight',
      '@lezer/highlight',
    );
    const second = install(
      'b/node_modules/@lezer/highlight',
      '@lezer/highlight',
    );
    const duplicates = findDuplicatePackageRoots(
      [first, second],
      SHARED_VENDOR_PACKAGES,
    );
    expect(duplicates.get('@lezer/highlight')).toHaveLength(2);
  });

  it('reports nothing when every module comes from one install', () => {
    const only = install('c/node_modules/@lezer/common', '@lezer/common');
    expect(findDuplicatePackageRoots([only], SHARED_VENDOR_PACKAGES)).toEqual(
      new Map(),
    );
  });

  it('covers the packages the harness shares with the 2d bundle', () => {
    expect(SHARED_VENDOR_PACKAGES).toEqual(
      expect.arrayContaining([
        '@canvas-commons/core',
        '@canvas-commons/2d',
        '@lezer/common',
        '@lezer/highlight',
      ]),
    );
  });
});

describe('buildFiddleVendor frame template escaping', () => {
  let outputDir: string;

  beforeAll(async () => {
    outputDir = mkdtempSync(join(tmpdir(), 'fiddle-vendor-escape-'));
    await buildFiddleVendor({
      outputDir,
      publicBase: '/fiddle"></script><script>alert(1)</script>',
      skipTypePack: true,
    });
  }, BUILD_TIMEOUT_MS);

  afterAll(() => {
    if (outputDir) rmSync(outputDir, {recursive: true, force: true});
  });

  it('escapes a hostile publicBase in the frame document', () => {
    const [directoryName] = readdirSync(outputDir).filter(
      name => name !== 'manifest.json',
    );
    const frameHtml = readFileSync(
      join(outputDir, directoryName, 'frame.html'),
      'utf8',
    );
    const scriptTagOpenings = frameHtml.match(/<script[\s>]/g) ?? [];
    // Exactly the two the template itself writes: importmap and bootstrap.
    expect(scriptTagOpenings.length).toBe(2);
    expect(frameHtml).not.toContain('<script>alert(1)</script>');
  });
});
