# Constitution

Development rules governing how the project operates. These files are loaded every session
during initialization.

- **DEV-RULES.ARC.md** — Framework methodology (commit discipline, task execution, session
  management, verification). Ships with ARC; updated via CLI.
- **DEV-RULES.PROJECT.md** — Project-specific standards (quality gates, testing, architecture,
  code quality). Customized per project.

## Domain-Scoped Rules

Teams can split domain-specific rules into separate files alongside DEV-RULES.PROJECT:

```text
constitution/
  DEV-RULES.ARC.md           # always loaded (framework)
  DEV-RULES.PROJECT.md       # always loaded (project-wide)
  DEV-RULES.FRONTEND.md      # loaded when working on frontend
  DEV-RULES.AUTH.md           # loaded when working on auth
```

Domain rule files follow the naming pattern `DEV-RULES.{DOMAIN}.md` and are loaded on-demand
when a task touches the relevant domain — not every session. Use this when a domain's rules
are substantial enough to warrant separation from DEV-RULES.PROJECT.
