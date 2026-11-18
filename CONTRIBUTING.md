# Contributing to ARC Framework

Thanks for your interest in contributing to ARC.

## Quick Start

**Prerequisites:** Node.js ≥24 (current Active LTS), Git ≥2.53, and `shellcheck`
installed on your system (`apt-get install shellcheck`, `brew install shellcheck`,
or equivalent). Shellcheck is invoked by `npm run lint:sh` from the system PATH;
it is not bundled as an npm dependency.

Install [actionlint][actionlint-install] on the system PATH as well (`brew install actionlint` on macOS, or use its
release binary on Linux/Windows). `npm run lint:workflows` requires both actionlint and ShellCheck so inline workflow
shell is checked alongside GitHub Actions expressions and dependencies. CI installs actionlint 1.7.12.

1. Fork and clone the repository
2. Install dependencies and initialize the approved tools: `npm install && npm run setup`
3. Join as a contributor: `npx arc join`
4. Verify your setup — run the declared local merge checks on a clean checkout:

```bash
npx arc check gate merge
```

Dependency lifecycle scripts are disabled by the repository's `.npmrc`, including during `npm audit fix`.
Run `npm run setup` after installing or updating dependencies: it refuses an unexpected `lefthook.yml`, rebuilds
only esbuild, and installs the Husky hooks. Keep `ignore-scripts` enabled for installs; setup explicitly enables
scripts only for the named esbuild rebuild.

## Development Workflow

After pulling self-hosting changes or making local source edits, the next CLI command brings its build current itself.
Its dev-mode check finds a stale build before the command runs, since a stale bundle silently produces wrong answers.
It then runs the runtime-only build, first waiting for any other build or test run in the checkout that holds the build
output, and runs the command again on the new bundle, noting the rebuild on stderr. If that build fails, or leaves the
bundle stale, the command exits 1 with a stderr error: fix the build, run `npm run build:fast` — the same runtime-only
build, which takes about a second — and retry.

There is no warning tier and no allowlist of safe commands, so read-only commands rebuild too. The one exception is not
a command at all: the compaction-seed write is an option on `status`, and it proceeds on a stale build with a warning,
so that a recovery seed still lands. The repository's `commit-msg` hook runs through the CLI as well, so a commit after
a source edit rebuilds before it checks the message.

The check fires only when the CLI runs as the built bundle in this development checkout.
Invoking it from source produces no verdict at all, and published installs don't include `src/`,
so it never fires there.

### Packing and publishing the CLI

The CLI's `prepack` script runs the full build before packing or publishing. Enable lifecycle scripts explicitly for
these commands because the repository's `.npmrc` disables them:

```bash
npm pack --workspace @arc-framework/cli --ignore-scripts=false
npm publish --workspace @arc-framework/cli --ignore-scripts=false
```

Keep scripts disabled for file-list checks with `npm pack --dry-run --ignore-scripts --workspace @arc-framework/cli`.

## Commit Convention

Git hooks enforce conventional commit format with a `Context:` footer. Contributors use
the `contribution` context:

```text
feat(cli): add --dry-run flag to arc update

- Shows what would change without applying

Context: contribution (add dry-run preview for arc update)
```

The `Context: contribution (...)` parenthetical is freeform — describe what the contribution
addresses.

## Quality Standards

Quality gates are zero-tolerance: each check must pass at its declared commit, push, or merge deadline. The Git
hooks run the relevant declared checks automatically. Checks and deadlines live in
[the check declaration][check-declaration]; use `npx arc check` for selection, results, and measured costs. See the
[full contributing guide][contributing-docs] for PR guidelines and project structure.

## Areas to Contribute

- **CLI features and fixes** — TypeScript package in `packages/arc-framework/`
- **Documentation** — methodology docs in `.arc/` and the docs site in `docs/`
- **Bug reports** — [open an issue][issues] with reproduction steps
- **Test coverage** — unit, integration, and E2E tests in `packages/arc-framework/__tests__/`

---

Full guide: [Contributing to ARC][contributing-docs] | [Report a bug][issues] |
[Discussions][discussions]

---

[contributing-docs]: https://andrewrcr.github.io/arc-framework/contributing/
[check-declaration]: .arc/system/arc-checks.yml
[issues]: https://github.com/andrewRCr/arc-framework/issues
[discussions]: https://github.com/andrewRCr/arc-framework/discussions
[actionlint-install]: https://github.com/rhysd/actionlint/blob/main/docs/install.md
