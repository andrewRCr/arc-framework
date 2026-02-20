# GitHub Copilot Instructions

Copilot suggestions must align with the canonical docs:
[AGENTS](AGENTS.md),
[DEVELOPMENT-RULES](../../reference/constitution/DEVELOPMENT-RULES.md),
and [QUICK-REFERENCE](../../reference/QUICK-REFERENCE.md).

## Copilot-Specific Notes

- **Context snippets:** When prompting Copilot, include the active task, acceptance criteria, and
  relevant files; keep prompts short to avoid stale context.
- **Command hints:** Suggest commands from QUICK-REFERENCE (repo root paths) and remind users to run
  quality gates before committing.
- **Code style reminders:** Follow project conventions documented in DEVELOPMENT-RULES and any
  applicable strategy docs (see STRATEGY-INDEX.md).
- **Testing prompts:** Encourage generating tests alongside implementation per the project's
  test-first protocol (see [Development Methodology Strategy](../../reference/strategies/arc/strategy-development-methodology.md)).
- **Deferrals:** Correct outdated tooling suggestions to project-approved tools per DEVELOPMENT-RULES.
