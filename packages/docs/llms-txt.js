const fs = require('fs');
const path = require('path');

const DEFAULT_HEADER =
  '# Canvas Commons Documentation\n\n' +
  'Plain-text export of the Canvas Commons documentation for LLM consumption.\n' +
  'Individual pages are delimited by `---` and prefixed with `// File: <path>`.\n';

function parseFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return {frontmatter: {}, body: source};
  }
  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    frontmatter[kv[1]] = value;
  }
  return {frontmatter, body: source.slice(match[0].length)};
}

function shouldInclude(frontmatter, isDev) {
  if (frontmatter.hidden === 'true' || frontmatter.unlisted === 'true') {
    return false;
  }
  if (frontmatter.draft === 'true') {
    return isDev;
  }
  return true;
}

function processLinesOutsideFences(body, transform) {
  const lines = body.split(/\r?\n/);
  let inFence = false;
  const out = [];
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    out.push(inFence ? line : transform(line));
  }
  return out.join('\n');
}

function stripImports(body) {
  return processLinesOutsideFences(body, line =>
    /^import\b/.test(line.trimStart()) ? '' : line,
  );
}

function stripJsxBlocks(body) {
  return processLinesOutsideFences(body, line => {
    const trimmed = line.trimStart();
    if (/^<([A-Z][\w.]*)[^>]*\/>\s*$/.test(trimmed)) return '';
    if (/^<\/?[A-Z][\w.]*(?:\s[^>]*)?>\s*$/.test(trimmed)) return '';
    if (/^<([A-Z][\w.]*)[^>]*>[^<]*<\/\1>\s*$/.test(trimmed)) {
      return '';
    }
    return line;
  });
}

function flattenAdmonitions(body) {
  return body.replace(
    /^(:{3,})(note|tip|info|caution|warning|danger|experimental)[^\n]*\r?\n([\s\S]*?)\r?\n\1\s*$/gm,
    (_, _fence, _kind, inner) =>
      inner
        .split(/\r?\n/)
        .map(line => (line.length ? `> ${line}` : '>'))
        .join('\n'),
  );
}

function collapseBlankLines(body) {
  return body.replace(/\n{3,}/g, '\n\n').trim();
}

function extractTitle(body, frontmatter, relPath) {
  if (frontmatter.title) return frontmatter.title;
  const heading = body.match(/^#\s+(.+?)\s*$/m);
  if (heading) return heading[1];
  return path.basename(relPath);
}

function transform(source, relPath) {
  const {frontmatter, body} = parseFrontmatter(source);
  let out = body;
  out = stripImports(out);
  out = flattenAdmonitions(out);
  out = stripJsxBlocks(out);
  out = collapseBlankLines(out);
  const title = extractTitle(out, frontmatter, relPath);
  if (!/^#\s/m.test(out)) {
    out = `# ${title}\n\n${out}`;
  }
  return {
    title,
    frontmatter,
    body: `${out}\n`,
  };
}

function walkDocs(docsDir) {
  const results = [];

  function walk(dir, relDir) {
    const entries = fs.readdirSync(dir, {withFileTypes: true});
    const files = [];
    const dirs = [];
    let categoryPosition = Infinity;

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        dirs.push({name: entry.name, full});
      } else if (
        entry.name === '_category_.yml' ||
        entry.name === '_category_.json'
      ) {
        const raw = fs.readFileSync(full, 'utf8');
        const match = raw.match(/position:\s*(\d+)/);
        if (match) categoryPosition = parseInt(match[1], 10);
      } else if (/\.mdx?$/.test(entry.name)) {
        const raw = fs.readFileSync(full, 'utf8');
        const fmMatch = raw.match(/sidebar_position:\s*(\d+)/);
        files.push({
          name: entry.name,
          full,
          relPath: path
            .join(relDir, entry.name.replace(/\.mdx?$/, ''))
            .split(path.sep)
            .join('/'),
          position: fmMatch ? parseInt(fmMatch[1], 10) : Infinity,
        });
      }
    }

    files.sort(
      (a, b) => a.position - b.position || a.name.localeCompare(b.name),
    );
    for (const file of files) {
      results.push({
        full: file.full,
        relPath: file.relPath,
        source: fs.readFileSync(file.full, 'utf8'),
      });
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name));
    for (const sub of dirs) {
      walk(sub.full, path.join(relDir, sub.name));
    }
    return categoryPosition;
  }

  walk(docsDir, '');
  return results;
}

module.exports = function llmsTxtPlugin(context, options = {}) {
  const docsDir = path.join(context.siteDir, 'docs');
  const staticDir = path.join(context.siteDir, 'static');
  const emitFull = options.emitFull !== false;
  const siteHeader = options.siteHeader ?? DEFAULT_HEADER;
  const isDev = process.env.NODE_ENV !== 'production';

  async function generate() {
    if (!fs.existsSync(docsDir)) {
      console.warn(`[llms-txt] docs dir not found: ${docsDir}`);
      return;
    }
    if (!fs.existsSync(staticDir)) {
      fs.mkdirSync(staticDir, {recursive: true});
    }

    const staticDocsDir = path.join(staticDir, 'docs');
    if (fs.existsSync(staticDocsDir)) {
      fs.rmSync(staticDocsDir, {recursive: true, force: true});
    }
    for (const leaf of ['llms.txt', 'llms-full.txt']) {
      const p = path.join(staticDir, leaf);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    const pages = walkDocs(docsDir);
    const rendered = [];
    for (const page of pages) {
      const {frontmatter, body} = parseFrontmatter(page.source);
      if (!shouldInclude(frontmatter, isDev)) continue;
      const transformed = transform(page.source, page.relPath);
      rendered.push({...page, ...transformed});

      const outPath = path.join(staticDir, 'docs', page.relPath, 'llms.txt');
      fs.mkdirSync(path.dirname(outPath), {recursive: true});
      fs.writeFileSync(outPath, transformed.body);
      void body;
    }

    const indexParts = [siteHeader];
    for (const page of rendered) {
      indexParts.push(`// File: ${page.relPath}\n\n${page.body}`);
    }
    const indexContent = indexParts.join('\n---\n\n');
    fs.writeFileSync(path.join(staticDir, 'llms.txt'), indexContent);
    if (emitFull) {
      fs.writeFileSync(path.join(staticDir, 'llms-full.txt'), indexContent);
    }

    console.log(
      `[llms-txt] wrote ${rendered.length} per-page files + llms.txt${
        emitFull ? ' + llms-full.txt' : ''
      }`,
    );
  }

  return {
    name: 'canvas-commons-llms-txt',
    async loadContent() {
      await generate();
    },
    extendCli(cli) {
      cli
        .command('llms-txt')
        .description('Regenerate llms.txt files for the docs site')
        .action(async () => {
          await generate();
        });
    },
  };
};
