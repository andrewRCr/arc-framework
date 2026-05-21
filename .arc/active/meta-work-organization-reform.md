# Metadata: Work Organization Reform

- **State:** Active
- **Owner:** andrew
- **Branch:** technical/work-organization-reform

- **Origin:** [internal]
- **Spec:** `prd-work-organization-reform.md`

- **Depends On:** [none]
- **Cohort:** [none]

- **Task List:** `tasks-work-organization-reform.md`
- **Last Completed:** Task 6.11 (`a49b6473`) — System/reference re-tier: `constitution/` → `system/rules/`,
  `briefs/` → `reference/briefs/` (both copies; full inbound + inside-file-link + CLI/test sweep, 124 files).
  CLI module rename + domain-rules mechanism deferred to `rules-restructure` (captured in its plan).
- **Blockers:** [none]

- **Next Task:** Task 6.12.c — Move `githooks/` → `system/.internal/githooks/` (line ~3936). 6.12.a/b
  superseded (`.internal/` kept singular — parent already exists, manifest stays).

- **Next Action:** Audit Phase 6.12 first (arc-task-audit) — its CLI surface (`core.hooksPath` writes, script
  callers, `add-agent` skill-source path) needs the same pre-execution pass 6.11 got; the audit may reshape
  subtasks. Then execute 6.12.c-g. See WORKING-MEMORY § framework-dir moves for the both-link-forms +
  CLI-surface + manifest-hash gotchas.

---
