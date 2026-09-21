import getReleasePlan from '@changesets/get-release-plan';
import {fromMarkdown} from 'mdast-util-from-markdown';
import {toMarkdown} from 'mdast-util-to-markdown';
import {execFile} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs, promisify} from 'node:util';

const exec = promisify(execFile);
const REPOSITORY = 'canvas-commons/canvas-commons';
const GITHUB_URL = `https://github.com/${REPOSITORY}`;

async function getGithubInfo(commits, root) {
  const info = new Map();
  if (!commits.length) return info;

  const fields = commits.map(
    commit => `
    c${commit}: object(oid: "${commit}") {
      ... on Commit {
        author { user { login } }
        associatedPullRequests(first: 50) {
          nodes { number mergedAt author { login } baseRepository { nameWithOwner } }
        }
      }
    }
  `,
  );
  const [owner, name] = REPOSITORY.split('/');
  const query = `query { repository(owner: "${owner}", name: "${name}") { ${fields.join('\n')} } }`;
  try {
    const stdout = await new Promise((resolve, reject) => {
      const child = execFile(
        'gh',
        ['api', 'graphql', '--input', '-'],
        {cwd: root},
        (error, stdout, stderr) => {
          if (error) reject(new Error(stderr.trim() || error.message));
          else resolve(stdout);
        },
      );
      child.stdin?.on('error', reject);
      child.stdin?.end(JSON.stringify({query}));
    });
    const result = JSON.parse(stdout);
    if (result.errors || !result.data?.repository) {
      throw new Error('GitHub returned an incomplete response.');
    }
    for (const commit of commits) {
      const data = result.data.repository[`c${commit}`];
      if (!data) continue;
      const pull = data.associatedPullRequests?.nodes
        ?.filter(
          pr => pr.mergedAt && pr.baseRepository?.nameWithOwner === REPOSITORY,
        )
        .sort((a, b) => a.mergedAt.localeCompare(b.mergedAt))[0];
      info.set(commit, {
        user: data.author?.user?.login ?? pull?.author?.login,
        pr: pull?.number,
      });
    }
  } catch (error) {
    console.warn(
      `GitHub metadata unavailable; using local git links. ${error.message}`,
    );
  }
  return info;
}

async function getChangesetMetadata(root, id) {
  const {stdout} = await exec(
    'git',
    [
      'log',
      '--follow',
      '--diff-filter=A',
      '-1',
      '--format=%H%x00%s%x00%ae%x00%b',
      '--',
      `.changeset/${id}.md`,
    ],
    {cwd: root},
  );
  const [commit, subject = '', email = '', body = ''] = stdout
    .trim()
    .split('\0');
  const type = /^(feat|fix)(?:\([^)]*\))?!?:/.exec(subject)?.[1] ?? 'change';
  const prMatch = /\(#([1-9]\d*)\)$/.exec(subject);
  const pr = prMatch ? Number(prMatch[1]) : undefined;
  const user = /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/.exec(
    email,
  )?.[1];

  const issues = [
    ...body.matchAll(
      /\b(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)\s+#([1-9]\d*)\b/gi,
    ),
  ].map(match => Number(match[1]));
  return {commit, type, pr, user, issues: [...new Set(issues)]};
}

function formatSummary(summary) {
  return toMarkdown(fromMarkdown(summary), {
    bullet: '-',
    fences: true,
    unsafe: [{character: '{'}, {character: '<'}],
    handlers: {
      html: (node, _parent, state, info) => state.safe(node.value, info),
    },
  }).trim();
}

function renderIssue({packages, summary, commit, pr, user, issues}) {
  const props = [
    user ? ` user={${JSON.stringify(user)}}` : '',
    pr ? ` pr={${pr}}` : '',
  ].join('');
  const links = [];
  if (commit && !pr) {
    links.push(
      `[Commit ${commit.slice(0, 7)}](${GITHUB_URL}/commit/${commit})`,
    );
  }
  if (issues.length) {
    links.push(
      `Closes ${issues.map(issue => `[#${issue}](${GITHUB_URL}/issues/${issue})`).join(', ')}`,
    );
  }
  return `<Issue${props}>
<strong>{${JSON.stringify(packages)}}</strong>

${formatSummary(summary)}
${links.length ? `\n${links.join(' · ')}\n` : ''}
</Issue>`;
}

/**
 * Generate an MDX blog draft from pending Changesets and their git history.
 * GitHub attribution uses the authenticated gh CLI when available.
 *
 * @example
 * const {content} = await generateReleaseBlog(repositoryRoot);
 */
export async function generateReleaseBlog(
  root,
  {resolveGithubInfo = getGithubInfo} = {},
) {
  const {changesets, releases: plannedReleases} = await getReleasePlan(root);
  const releases = plannedReleases.filter(release => release.type !== 'none');
  const version = releases.find(
    release => release.name === '@canvas-commons/core',
  )?.newVersion;
  const releasedPackages = new Set(releases.map(release => release.name));
  const includedChangesets = new Set(
    releases.flatMap(release => release.changesets),
  );
  const notes = changesets
    .sort((a, b) => a.id.localeCompare(b.id))
    .filter(
      change => includedChangesets.has(change.id) && change.summary.trim(),
    )
    .map(change => ({
      ...change,
      packages: change.releases
        .filter(
          release =>
            release.type !== 'none' && releasedPackages.has(release.name),
        )
        .map(release => release.name)
        .sort()
        .join(', '),
    }))
    .filter(change => change.packages);

  if (!version || notes.length === 0) {
    throw new Error(
      'No pending Canvas Commons release. Add a changeset first.',
    );
  }

  const issues = await Promise.all(
    notes.map(async change => ({
      ...change,
      ...(await getChangesetMetadata(root, change.id)),
    })),
  );
  const commits = [
    ...new Set(issues.map(issue => issue.commit).filter(Boolean)),
  ];
  const githubInfo = await resolveGithubInfo(commits, root);
  for (const issue of issues) {
    const info = githubInfo.get(issue.commit);
    issue.user = info?.user ?? issue.user;
    issue.pr = issue.pr ?? info?.pr;
  }
  const sections = ['feat', 'fix', 'change'].flatMap(type => {
    const entries = issues.filter(issue => issue.type === type);
    return entries.length
      ? [
          `<IssueGroup type="${type}">\n\n${entries.map(renderIssue).join('\n\n')}\n\n</IssueGroup>`,
        ]
      : [];
  });

  return {
    version,
    content: `---
slug: v${version}
title: Canvas Commons v${version}
authors: hhenrichsen
mdx:
  format: mdx
---

import IssueGroup from '@site/src/components/Release/IssueGroup';
import Issue from '@site/src/components/Release/Issue';

${sections.join('\n\n')}

Check out the [Update Guide](/docs/updating) for information on how to update
your existing projects.
`,
  };
}

async function main() {
  const {values} = parseArgs({
    options: {
      output: {type: 'string', short: 'o'},
      help: {type: 'boolean', short: 'h'},
    },
  });
  if (values.help) {
    console.log(
      'Usage: pnpm docs:blog [--output <file.mdx>]\n\n' +
        'Generate a draft from pending changesets before running changeset version.\n' +
        'Uses git for PR/issue links and gh api for GitHub attribution.\n' +
        'Prints to stdout by default; --output creates a file without overwriting it.',
    );
    return;
  }

  const root = fileURLToPath(new URL('../..', import.meta.url));
  const {content} = await generateReleaseBlog(root);
  if (values.output) {
    await writeFile(values.output, content, {encoding: 'utf8', flag: 'wx'});
  } else {
    process.stdout.write(content);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
