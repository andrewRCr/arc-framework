# Contributing to ARC

ARC uses its own methodology for development — we are our own test case. This guide covers
what you need to know to contribute.

## Quick Start

1. **Fork and clone** the repository.

2. **Install dependencies:**

    ```bash
    npm install
    ```

3. **Join as a contributor:**

    ```bash
    npx @arc-framework/cli join
    ```

    Select the **contributor** role when prompted. This sets your identity, configures git hooks,
    and generates agent skill files. The contributor role scopes your workspace to project code —
    you work on the codebase, not ARC planning artifacts.

4. **Verify your setup** — all checks should pass on a clean checkout:

    ```bash
    npm run -s lint:md
    npm run lint:ts
    npm run lint:sh
    npm run typecheck
    npm test
    npm run build
    ```

## What You're Working With

ARC is a hybrid project:

- **`.arc/`**: the methodology documents (workflows, strategies, templates, configuration).
  Markdown files that structure how development happens.
- **`packages/arc-framework/`**: the CLI package (`@arc-framework/cli`). TypeScript, built
  with tsup, tested with vitest.

All commands run from the repository root — npm workspaces delegates to the CLI package
automatically.

## Commit Convention

Git hooks enforce a commit message format and a `Context:` footer. Contributors use the
`contribution` context:

```text
feat(cli): add --dry-run flag to arc update

- Shows what would change without applying
- Useful for reviewing updates before committing

Context: contribution (add dry-run preview for arc update)
```

The format is `type(scope): description` (conventional commits). The `Context: contribution
(...)` parenthetical is freeform — describe what the contribution addresses.

**Types:** `feat`, `fix`, `docs`, `content`, `style`, `refactor`, `test`, `chore`, `perf`,
`build`, `ci`, `config`, `revert`.

## Quality Standards

Quality gates are zero-tolerance: all checks must pass before any commit. The pre-commit hook
runs automatically, but you can run checks manually:

| Check            | Command              | What it catches                   |
| ---------------- | -------------------- | --------------------------------- |
| Markdown linting | `npm run -s lint:md` | Documentation formatting errors   |
| TypeScript lint  | `npm run lint:ts`    | Code style and type-checked rules |
| Shell lint       | `npm run lint:sh`    | Hook and script issues            |
| Type checking    | `npm run typecheck`  | Type errors (strict mode)         |
| Tests            | `npm test`           | Unit, integration, and E2E        |
| Build            | `npm run build`      | Build verification                |

## Areas to Contribute

- **CLI features and fixes** — the TypeScript package in `packages/arc-framework/`
- **Documentation improvements** — both `.arc/` methodology docs and the docs site in `docs/`
- **Bug reports** — open an issue with reproduction steps
- **Test coverage** — unit tests in `__tests__/unit/`, integration in `__tests__/integration/`,
  E2E in `__tests__/e2e/`

## Pull Request Guidelines

- Branch from `main`
- Keep changes focused — one concern per PR
- Ensure all quality gates pass (CI verifies automatically)
- Add tests for new functionality
- Reference relevant issues in the PR description

## Architectural Decisions

Significant design choices are documented as Architecture Decision Records (ADRs) in
`.arc/reference/adr/`. ADRs capture not just *what* was decided, but *why* — so future
contributors have the context they need before revisiting a choice.

**Write an ADR when:**

- The decision affects system structure or external contracts
- Multiple alternatives were considered and trade-offs weighed
- An external constraint drove the choice (API limitations, regulatory requirements)
- Future developers will ask "why did we do it this way?"

**Don't write an ADR for** tactical choices obvious from reading the code (variable names,
standard patterns, framework conventions) or temporary experiments.

ADRs use a five-section format (Title, Status, Context, Decision, Consequences) following the
`ADR-NNN` sequential numbering convention. Once accepted, an ADR's decision changes only through
supersession — a new ADR that explicitly replaces it. Minor corrections (typos, broken links,
clarified wording) are permitted without a new ADR. See `strategy-adr-methodology.md` in your
`.arc/reference/strategies/` directory for the full format and lifecycle.

## File Naming Conventions

ARC uses filename prefixes (`strategy-`, `tasks-`, `prd-`, `plan-`, `atomic-`) for type-based
grouping. This matters for two reasons:

**Fuzzy-find grouping.** Typing `@strategy` in an editor or prompt file picker surfaces all
strategy documents regardless of their directory. Without the prefix, you'd search by domain
keyword and get unrelated results from across the repository.

**Context-independent type marking.** Filenames appear without full paths in git log, diff stats,
and search results. `strategy-work-organization.md` communicates its type anywhere;
`work-organization.md` does not. This is especially useful for files that move between
directories during their lifecycle (backlog → active → archive).

Workflows are the exception — they use numbered prefixes (`1_`, `2_`, `3_`) for pipeline
ordering rather than a `workflow-` prefix, because they're activated through embedded
cross-references, not fuzzy-find.

## Maintainer-Managed Files

Files in `.arc/active/` and `.arc/backlog/` are managed by project maintainers: task lists,
work status, and planning artifacts. The pre-commit hook warns (soft, non-blocking) if you
stage changes in these directories. This is expected; contributors work on project code, not
the development pipeline.
