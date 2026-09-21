import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {promisify} from 'node:util';
import {generateReleaseBlog} from './release-blog-generator.mjs';

const execFileAsync = promisify(execFile);
const offline = {resolveGithubInfo: async () => new Map()};

async function git(root, ...args) {
  const {stdout} = await execFileAsync(
    'git',
    ['-c', `safe.directory=${root}`, ...args],
    {cwd: root},
  );
  return stdout.trim();
}

async function commitChangesets(
  root,
  names,
  message,
  email = 'author@example.com',
) {
  await git(root, 'add', '--', ...names.map(name => `.changeset/${name}.md`));
  await git(
    root,
    '-c',
    'user.name=Test Author',
    '-c',
    `user.email=${email}`,
    '-c',
    `core.hooksPath=${join(root, '.git', 'no-hooks')}`,
    'commit',
    '--no-gpg-sign',
    '-m',
    message,
  );
  return git(root, 'rev-parse', 'HEAD');
}

async function createRepository(context, changesets = {}) {
  const root = await mkdtemp(join(tmpdir(), 'release-blog-'));
  context.after(() => rm(root, {recursive: true, force: true}));
  await git(root, 'init', '--initial-branch=main');
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({private: true, workspaces: ['packages/*']}),
  );
  await mkdir(join(root, '.changeset'));
  await writeFile(
    join(root, '.changeset', 'config.json'),
    JSON.stringify({
      changelog: false,
      fixed: [
        [
          '@canvas-commons/core',
          '@canvas-commons/2d',
          '@canvas-commons/editor',
        ],
      ],
      linked: [],
      access: 'public',
      baseBranch: 'main',
      updateInternalDependencies: 'patch',
      ignore: ['@canvas-commons/docs'],
    }),
  );
  await writeFile(join(root, '.changeset', 'README.md'), '# Changesets\n');
  for (const name of ['core', '2d', 'editor', 'docs']) {
    const directory = join(root, 'packages', name);
    await mkdir(directory, {recursive: true});
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({name: `@canvas-commons/${name}`, version: '0.3.1'}),
    );
  }
  for (const [name, content] of Object.entries(changesets)) {
    await writeFile(join(root, '.changeset', `${name}.md`), content);
  }
  await git(root, 'add', 'package.json', 'packages', '.changeset/config.json');
  await commitChangesets(root, ['README'], 'chore: initialize fixture');
  return root;
}

test('uses the fixed release plan and preserves shared Markdown once', async context => {
  const summary = [
    'Add layout animations shared by the renderer and editor.',
    '',
    '**Breaking:** use `<Layout>` with the new method.',
    '',
    '```tsx',
    'yield* row().insert(<Rect width={100} />, 1, 0.6);',
    '```',
  ].join('\n');
  const root = await createRepository(context, {
    layout: `---\n'@canvas-commons/2d': minor\n'@canvas-commons/editor': patch\n---\n\n${summary}\n`,
    color:
      "---\n'@canvas-commons/core': patch\n---\n\nFix color interpolation.\n",
  });
  await commitChangesets(root, ['layout'], 'feat(2d)!: add layout animations');
  await commitChangesets(root, ['color'], 'fix(core): fix color interpolation');

  const {version, content} = await generateReleaseBlog(root, offline);

  assert.equal(version, '0.4.0');
  assert.match(content, /slug: v0\.4\.0\ntitle: Canvas Commons v0\.4\.0/);
  assert.match(content, /authors: hhenrichsen\nmdx:\n  format: mdx/);
  assert.match(
    content,
    /import Issue from ['"]@site\/src\/components\/Release\/Issue['"]/,
  );
  assert.match(
    content,
    /import IssueGroup from ['"]@site\/src\/components\/Release\/IssueGroup['"]/,
  );
  assert.match(content, /<IssueGroup type=(?:\{)?['"]feat['"]/);
  assert.match(content, /<IssueGroup type=(?:\{)?['"]fix['"]/);
  assert.ok(
    content.includes('**Breaking:** use `<Layout>` with the new method.'),
  );
  assert.match(
    content,
    /```tsx\n\s*yield\* row\(\)\.insert\(<Rect width=\{100\} \/>, 1, 0\.6\);\n\s*```/,
  );
  assert.equal(content.split('Add layout animations').length - 1, 1);
  assert.match(
    content,
    /<strong>\{"@canvas-commons\/2d, @canvas-commons\/editor"\}<\/strong>/,
  );
  assert.match(
    content,
    /<Issue\b[^>]*>[\s\S]*?<strong>\{"@canvas-commons\/core"\}<\/strong>[\s\S]*?Fix color interpolation\.[\s\S]*?<\/Issue>/,
  );
});

test('links the introducing PR, closing issues, and GitHub author', async context => {
  const root = await createRepository(context, {
    color: "---\n'@canvas-commons/core': minor\n---\n\nImprove colors.\n",
  });
  const commit = await commitChangesets(
    root,
    ['color'],
    'feat(core): improve colors (#123)\n\nCloses #120\nFixes #121\nResolves #122\nSee #999 for context.',
    '42+color-author@users.noreply.github.com',
  );

  const {content} = await generateReleaseBlog(root, {
    resolveGithubInfo: async () => new Map([[commit, {pr: 999}]]),
  });

  assert.match(content, /<Issue\b[^>]*\bpr=\{123\}/);
  assert.match(content, /<Issue\b[^>]*\buser=(?:\{)?['"]color-author['"]/);
  for (const issue of [120, 121, 122]) {
    assert.ok(
      content.includes(
        `https://github.com/canvas-commons/canvas-commons/issues/${issue}`,
      ),
    );
  }
  assert.ok(!content.includes('/issues/999'));
});

test('links direct commits without guessing a GitHub user', async context => {
  const root = await createRepository(context, {
    color: "---\n'@canvas-commons/core': patch\n---\n\nFix colors.\n",
  });
  const commit = await commitChangesets(
    root,
    ['color'],
    'fix(core): fix colors',
  );

  const {content} = await generateReleaseBlog(root, offline);

  assert.ok(
    content.includes(
      `https://github.com/canvas-commons/canvas-commons/commit/${commit}`,
    ),
  );
  assert.doesNotMatch(content, /<Issue\b[^>]*\b(?:pr|user)=/);
});

test('enriches all changesets from a commit with one GitHub lookup', async context => {
  const root = await createRepository(context, {
    color: "---\n'@canvas-commons/core': minor\n---\n\nImprove colors.\n",
    layout: "---\n'@canvas-commons/2d': minor\n---\n\nImprove layouts.\n",
  });
  const commit = await commitChangesets(
    root,
    ['color', 'layout'],
    'feat: improve colors and layouts',
  );
  const lookups = [];

  const {content} = await generateReleaseBlog(root, {
    resolveGithubInfo: async commits => {
      lookups.push(commits);
      return new Map([[commit, {user: 'verified-author', pr: 321}]]);
    },
  });

  assert.deepEqual(lookups, [[commit]]);
  assert.equal(content.match(/<Issue\b[^>]*\bpr=\{321\}/g)?.length, 2);
  assert.equal(
    content.match(/<Issue\b[^>]*\buser=(?:\{)?['"]verified-author['"]/g)
      ?.length,
    2,
  );
  assert.ok(!content.includes('/commit/'));
});

test('keeps creation attribution when a changeset is edited later', async context => {
  const root = await createRepository(context, {
    color: "---\n'@canvas-commons/core': minor\n---\n\nImprove colors.\n",
  });
  await commitChangesets(root, ['color'], 'feat(core): improve colors (#123)');
  await writeFile(
    join(root, '.changeset', 'color.md'),
    "---\n'@canvas-commons/core': minor\n---\n\nClarify the new color behavior.\n",
  );
  await commitChangesets(root, ['color'], 'docs: clarify release note (#456)');

  const {content} = await generateReleaseBlog(root, offline);

  assert.match(content, /<IssueGroup type=(?:\{)?['"]feat['"]/);
  assert.match(content, /<Issue\b[^>]*\bpr=\{123\}/);
  assert.doesNotMatch(content, /\bpr=\{456\}/);
  assert.ok(content.includes('Clarify the new color behavior.'));
});

test('retains untracked changesets without fabricated attribution', async context => {
  const root = await createRepository(context, {
    color:
      "---\n'@canvas-commons/core': patch\n---\n\nUncommitted release note.\n",
  });

  const {content} = await generateReleaseBlog(root, offline);

  assert.match(content, /<IssueGroup type=(?:\{)?['"]change['"]/);
  assert.match(
    content,
    /<Issue>[\s\S]*?Uncommitted release note\.[\s\S]*?<\/Issue>/,
  );
  assert.doesNotMatch(content, /<Issue\b[^>]*\b(?:pr|user)=/);
  assert.ok(!content.includes('/commit/'));
});

test('escapes literal tags and braces while preserving code', async context => {
  const root = await createRepository(context, {
    color: [
      '---',
      "'@canvas-commons/core': minor",
      '---',
      '',
      'Use <Widget> with {value} in prose.',
      '',
      '`<Widget value={value} />` remains code.',
      '',
      '```tsx',
      '<Widget value={value} />',
      '```',
    ].join('\n'),
  });

  const {content} = await generateReleaseBlog(root, offline);

  assert.doesNotMatch(content, /Use <Widget> with \{value\} in prose\./);
  assert.match(content, /Use (?:\\<|&lt;|&#x3[Cc];|&#60;)Widget>/);
  assert.match(content, /(?:\\\{|&#123;|&#x7[Bb];)value/);
  assert.ok(content.includes('`<Widget value={value} />` remains code.'));
  assert.match(content, /```tsx\n\s*<Widget value=\{value\} \/>\n\s*```/);
});

test('rejects plans without release notes', async context => {
  for (const [name, changesets] of Object.entries({
    absent: {},
    empty: {empty: '---\n{}\n---\n'},
    unchanged: {
      core: "---\n'@canvas-commons/core': none\n---\n\nNo release.\n",
    },
    blank: {core: "---\n'@canvas-commons/core': minor\n---\n"},
    ignored: {
      docs: "---\n'@canvas-commons/docs': minor\n---\n\nUpdate the docs.\n",
    },
  })) {
    await context.test(name, async subtest => {
      const root = await createRepository(subtest, changesets);
      await assert.rejects(
        generateReleaseBlog(root, offline),
        /No pending Canvas Commons release/,
      );
    });
  }
});
