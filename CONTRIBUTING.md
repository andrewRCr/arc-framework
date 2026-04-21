# Contributing to ARC Framework

Thanks for your interest in contributing to ARC.

## Quick Start

**Prerequisites:** Node.js ≥24 (current Active LTS) and `shellcheck` installed on your system
(`apt-get install shellcheck`, `brew install shellcheck`, or equivalent). Shellcheck is invoked
by `npm run lint:sh` from the system PATH; it is not bundled as an npm dependency.

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Join as a contributor: `npx @arc-framework/cli join`
4. Verify your setup — all checks should pass on a clean checkout:

```bash
npm run -s lint:md
npm run lint:ts
npm run lint:sh
npm run typecheck
npm test
npm run build
```

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
