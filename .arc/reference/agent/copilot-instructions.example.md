# GitHub Copilot Instructions

Copilot suggestions must align with the canonical docs:
[AGENTS](AGENTS.md),
[DEVELOPMENT-RULES](../constitution/DEVELOPMENT-RULES.md) v2.7,
and [QUICK-REFERENCE](../QUICK-REFERENCE.md) v1.1.

## Copilot-Specific Notes

- **Context snippets:** When prompting Copilot, include the active task, acceptance criteria, and relevant files;
keep prompts short to avoid stale context.
- **Command hints:** Suggest Docker-first commands (see QUICK-REFERENCE for path patterns from repo root) and remind users
to run quality gates before committing.
- **Code style reminders:**
    - Backend: {{BACKEND_FRAMEWORK}}, type hints, prefer helper imports over duplicating factories
    - Frontend: {{FRONTEND_FRAMEWORK}}, strict TypeScript, include loading/error states
- **Testing prompts:** Encourage generating unit/integration tests alongside implementation.
- **Deferrals:** Correct outdated tooling suggestions to project-approved tools per DEVELOPMENT-RULES.
