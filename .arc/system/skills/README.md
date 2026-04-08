# Skills

Canonical SKILL.md definitions for ARC workflow triggers.

Skills are thin dispatchers — they contain invocation instructions pointing to ARC workflows, not
the workflows themselves. This directory is the **source of truth**. Tool-discoverable copies
(`.claude/skills/`, `.agents/skills/`, etc.) are generated from these during `arc init` and
`arc update` based on the user's selected tooling.

**Naming convention:** Framework skills use the `arc-` prefix for namespace separation. Project
and personal skills use no prefix.

**Default skill set:**

- `arc-setup` — Post-install setup: verify, configure, define project (one-time)
- `arc-verify` — Installation health check: config, files, references, hooks, session state
- `arc-resume` — Session initialization (start of session)
- `arc-task-audit` — Pre-implementation task audit: assumptions, drift, scope, dependencies (on-demand)
- `arc-task-review` — Post-implementation review: spec deviations, judgment calls, unaddressed observations (on-demand)
- `arc-commit` — Atomic commit with WORK-STATUS staging (during session)
- `arc-handoff` — Session handoff (end of session)
