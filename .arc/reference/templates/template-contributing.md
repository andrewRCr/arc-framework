# Contributing to [Project Name]

<!-- ARC Framework contributing template. Adapt this for your project:
     - Replace [Project Name] and placeholder commands
     - Add project-specific sections (community channels, recognition, etc.)
     - Link to your CODE_OF_CONDUCT.md if you have one
     - See ARC docs for contributor role details -->

This project uses the [ARC Framework][arc] for development methodology. This guide covers
the ARC-specific setup and conventions you need to know.

## Quick Start

1. **Clone the repository** and install dependencies per the project README.

2. **Join as a contributor:**

    ```bash
    arc join --contributor
    ```

    This sets your role (`arc.role=contributor`) and identity, configures git hooks, and
    sets up your local environment. Use `--yes` for non-interactive mode.

3. **Verify your setup** by running the project's quality gates. All checks should pass
   on a clean checkout.

<!-- Replace with your project's actual quality gate commands
     from .arc/reference/QUICK-REFERENCE.md § Quality Gate Commands -->

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Commit Convention

This project enforces a commit message format and a `Context:` footer via git hooks. The
format is configured in `.arc/system/arc-config.yml` — check the `commit.format` and
`commit.context_footer` settings for the active rules.

Contributors use the `contribution` context footer:

```text
feat(auth): add password reset endpoint

- Implements POST /api/auth/reset
- Sends reset email via SendGrid integration

Context: contribution (implement password reset per issue #42)
```

The `Context: contribution (...)` parenthetical is freeform — describe what the contribution
addresses (issue reference, feature name, bug description).

## What to Know

**Maintainer-managed files:** Files in `.arc/active/` and `.arc/backlog/` are managed by
project maintainers (task lists, work status, planning artifacts). The pre-commit hook warns
if you stage changes in these directories. This is a soft warning, not a hard block.

**Quality standards are the same** for contributors and maintainers — linting, type checking,
tests, and build verification all apply equally. CI enforces these on every PR.

**Branch from the base branch** (typically `main`) for your work. Check
`.arc/system/arc-config.yml` → `branch.base` for the project's integration branch.

## Pull Request Guidelines

<!-- Customize for your project's PR conventions, review SLA, etc. -->

- Reference relevant issues in the PR description
- Ensure all quality gates pass (CI will verify)
- Keep changes focused — one concern per PR
- Add tests for new functionality

---

_This project uses the [ARC Framework][arc] for human-AI development collaboration.
Contributors work on project code while maintainers manage the development pipeline._

---

[arc]: https://github.com/andrewRCr/arc-framework
