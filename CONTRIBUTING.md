# Contributing to Canvas Commons

This is an initial version of the Contribution Guide. Feel free to discuss it
and suggest any changes on [our discord server][discord].

## Code of Conduct

Before contributing to the project, please read our
[Code of Conduct](./CODE_OF_CONDUCT.md).

## Reporting a bug

Before you submit an issue, please search [the issue tracker][issues]. An issue
for your problem might already exist and the discussion might inform you of
workarounds readily available.

You can file new issues by [selecting an issue template][new-issue] and filling
out the necessary information.

## Proposing a Change

If you intend to change the public API, make any non-trivial changes to the
implementation, or create brand-new guides in the documentation, make sure to
[create an issue][new-feature] first. This will let us discuss a proposal before
you put significant effort into it. After a proposal has been discussed it may
receive the [`c-accepted`][label-accepted] label indicating that it's ready to
be implemented.

If you're only fixing a bug or a typo, it's fine to submit a pull request right
away without creating an issue, but make sure it contains a clear and concise
description of the bug.

## Working on Issues

Before you start working on an issue make sure that it has been accepted
(indicated by a [`c-accepted`][label-accepted] label) and that no one has
claimed it yet. Otherwise, you may duplicate other people's efforts. If somebody
claims an issue but doesn't follow up for more than two weeks, it’s fine to take
it over, but you should still leave a comment. You should also leave a comment
on any issue you're working on, to let others know.

## Semantic Versioning

Canvas Commons follows [semantic versioning][semver]. The packages (`core`,
`2d`, `editor`, `vite-plugin`, `ffmpeg`, `player`, `create`) release at a shared
version, managed by [Changesets](https://github.com/changesets/changesets).

If your change is user-visible, add a changeset:

```shell
pnpm changeset
```

The CLI walks you through picking which packages to bump, the bump type
(`patch`/`minor`/`major`), and the summary that lands in the changelog. Commit
the generated file under `.changeset/` alongside your changes. Internal-only
work (refactors, tests, CI tweaks) doesn't need one.

## Making a Pull Request

1. Fork the canvas-commons/canvas-commons repo.
2. In your forked repo, create a new branch for your changes:
   ```shell
   git checkout -b my-fix-branch main
   ```
3. Update the code.
4. Commit your changes using a **descriptive commit message** that follows the
   [Angular Commit Message Conventions][commit-format]. We strongly discourage
   using AI to generate commit descriptions. If you believe the description is
   not worth writing then it's probably not necessary.
   ```shell
   git commit --all
   ```
   When committing the changes, our git hooks should automatically run Prettier
   and ESLint for you. If, for some reason, hooks are not supported in your
   working environement, you can run these tools using `pnpm run prettier:fix`
   and `pnpm run eslint:fix` respectively.
5. Push your branch to GitHub:
   ```shell
   git push origin my-fix-branch
   ```
6. In GitHub, send a pull request to [the main branch][main] and **request a
   review** from [@hhenrichsen](https://github.com/hhenrichsen).

### Going through verification

After you made a pull request, a GitHub workflow will be dispatched to verify
it. There are a few checks that can fail:

| Check name        | Description                                                                                                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Commit name`     | The commit message doesn't follow the [Angular Commit Message Conventions][commit-format]. You can ignore this check since maintainers can modify your commit message before merging, but make sure to follow the conventions in the future. |
| `Lint`            | ESLint has failed. Run `pnpm run eslint` locally to list the problems.                                                                                                                                                                       |
| `Code&nbsp;style` | The code is not correctly formatted. Run `pnpm run prettier:fix` locally to fix the formatting issues.                                                                                                                                       |
| `Build`           | The build process failed. Run `pnpm run build` locally to see the errors.                                                                                                                                                                    |
| `Unit&nbsp;tests` | Unit tests failed. Run `pnpm run test` locally to see the which tests are failing and fix them.                                                                                                                                              |
| `E2E`             | End-to-end tests failed to build. Run `pnpm run e2e:test` locally to see the errors.                                                                                                                                                         |
| `Documentation`   | The documentation website failed to build. Run `pnpm run docs:build` locally to see the errors.                                                                                                                                              |

### Addressing review feedback

1. Make required updates to the code.
2. Create a fixup commit and push it to your GitHub repo:
   ```shell
   git commit --all --fixup HEAD
   git push
   ```

## Using generative AI

Using generative AI to help you write code and documentation is allowed, but use
it to enhance your work, not replace it. Pull requests that are a mindless copy
of the output of an AI model will be rejected.

## Getting the _Contributor_ Discord role

After one of your pull requests has been merged, you can receive the
_Contributor_ role on [our discord server][discord]. To do that, create a
[secret gist][gist] on GitHub and DM one of the server moderators with the link.
This will let us verify that you're the author of the pull request.

## Attribution

This Contribution Guide was partially inspired by [React][react] and
[Angular][angular].

[semver]: https://semver.org/
[discord]: https://chat.canvascommons.io
[semantic-release]:
  https://semantic-release.gitbook.io/semantic-release/support/faq#can-i-set-the-initial-release-version-of-my-package-to-0.0.1
[main]: https://github.com/canvas-commons/canvas-commons/tree/main
[issues]: https://github.com/canvas-commons/canvas-commons/issues
[new-issue]: https://github.com/canvas-commons/canvas-commons/issues/new/choose
[new-feature]:
  https://github.com/canvas-commons/canvas-commons/issues/new?template=feature_request.md
[commit-format]:
  https://github.com/angular/angular/blob/main/CONTRIBUTING.md#commit
[angular]: https://github.com/angular/angular/blob/main/CONTRIBUTING.md
[react]: https://reactjs.org/docs/how-to-contribute.html
[label-accepted]:
  https://github.com/canvas-commons/canvas-commons/labels/c-accepted
[gist]: https://gist.github.com/
