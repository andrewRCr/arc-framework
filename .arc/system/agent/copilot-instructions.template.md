# GitHub Copilot Instructions

Copilot suggestions must align with the canonical docs:
[AGENTS](AGENTS.md),
[DEV-RULES.ARC](../../reference/constitution/DEV-RULES.ARC.md),
[DEV-RULES.PROJECT](../../reference/constitution/DEV-RULES.PROJECT.md),
and [QUICK-REFERENCE](../../reference/QUICK-REFERENCE.md).

## Copilot-Specific Notes

- **Context snippets:** When prompting Copilot, include the active task, acceptance criteria, and
  relevant files; keep prompts short to avoid stale context.
- **Command hints:** Suggest commands from QUICK-REFERENCE (repo root paths) and remind users to run
  quality gates before committing.
- **Code style reminders:** Follow project conventions documented in DEV-RULES.PROJECT and any
  applicable strategy docs (see STRATEGY-INDEX.md).
- **Testing prompts:** Encourage generating tests alongside implementation per the project's
  test-first protocol (see [DEV-RULES.ARC](../../reference/constitution/DEV-RULES.ARC.md) § Test-first assessment).
- **Deferrals:** Correct outdated tooling suggestions to project-approved tools per DEV-RULES.PROJECT.
