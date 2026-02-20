# GitHub Copilot Instructions

Copilot suggestions must align with the canonical docs:
[AGENTS](AGENTS.md),
[DEVELOPMENT-RULES](../../reference/constitution/DEVELOPMENT-RULES.md) v0.2.0-dev (hash: 4b3d89f2),
and [QUICK-REFERENCE](../../reference/QUICK-REFERENCE.md) v0.2.0-dev.

## Copilot-Specific Notes

- **Context snippets:** When prompting Copilot, include the active task, acceptance criteria, and relevant files;
keep prompts short to avoid stale context.
- **Command hints:** Suggest Docker-first commands (see QUICK-REFERENCE for path patterns from repo root) and remind users
to run quality gates before committing.
- **Code style reminders:**
    - Backend: Django + Ninja, type hints, prefer helper imports over duplicating factories
    - Frontend: React + Chakra UI, strict TypeScript, include loading/error states
- **Testing prompts:** Encourage generating unit/integration tests alongside implementation (Vitest + Django TestCase patterns).
- **Deferrals:** If Copilot proposes outdated tooling (flake8/mypy), correct the suggestion to Ruff/Pyright per DEVELOPMENT-RULES.
