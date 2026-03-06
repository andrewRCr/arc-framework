# GitHub Copilot Instructions

Copilot suggestions must align with the canonical docs:
[AGENTS](AGENTS.md),
[DEV-RULES.ARC](../../../.arc/reference/constitution/DEV-RULES.ARC.md),
[DEV-RULES.PROJECT](../../reference/constitution/DEV-RULES.PROJECT.md),
and [QUICK-REFERENCE](../../reference/QUICK-REFERENCE.md).

## Copilot-Specific Notes

- **Context snippets:** When prompting Copilot, include the active task, acceptance criteria, and relevant files;
keep prompts short to avoid stale context.
- **Command hints:** This is a documentation-only framework — no Docker, no services. Quality gate
  is markdown linting (`npx --yes markdownlint-cli2`). See QUICK-REFERENCE for command patterns.
- **Style reminders:** Follow reference-style links, template-first documents, and the naming
  conventions in DEV-RULES.PROJECT and DEV-RULES.ARC (`.template.md` for templates, conventional commits).
- **Deferrals:** If Copilot proposes application-stack tooling (test runners, build systems, linters
  beyond markdownlint), redirect — this project has no runtime code.
