# Contributing to ARC Framework

Thanks for your interest in contributing to ARC.

## Quick Start

**Prerequisites:** Node.js ≥24 (current Active LTS), Git ≥2.28, and `shellcheck`
installed on your system (`apt-get install shellcheck`, `brew install shellcheck`,
or equivalent). Shellcheck is invoked by `npm run lint:sh` from the system PATH;
it is not bundled as an npm dependency.

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Join as a contributor: `npx arc join`
4. Verify your setup — all checks should pass on a clean checkout:

```bash
npm run -s lint:md
npm run lint:ts
npm run lint:sh
npm run typecheck
npm test
npm run build
```

## Development Workflow

After pulling self-hosting changes or making local source edits, rebuild before invoking the
CLI. Its dev-mode check refuses to run against a stale build: every command exits 1 with a
stderr error naming the fix, since a stale bundle silently produces wrong answers. Rebuild with
`npm run build:fast` — a runtime-only build that takes about a second — and retry.

There is no warning tier and no exempt set of commands, so read-only commands refuse too. The
sole exception is the compaction-seed write, which proceeds so that a recovery seed still lands.
The repository's `commit-msg` hook runs through the CLI as well, so a stale build blocks
committing until you rebuild — editing source and then committing is the ordinary way to meet
the check.

The check fires only when the CLI runs as the built bundle in this development checkout.
Invoking it from source produces no verdict at all, and published installs don't include `src/`,
so it never fires there.

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

Quality gates are zero-tolerance — all checks must pass before any commit. The pre-commit
hook runs automatically. See the [full contributing guide][contributing-docs] for the
complete check reference, PR guidelines, and what to know about the project structure.

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
[issues]: https://github.com/andrewRCr/arc-framework/issues
[discussions]: https://github.com/andrewRCr/arc-framework/discussions
