# Metadata: lifecycle-transition-core

| **State** | **Owner** | **Branch**                       | **Class** | **Priority** |
|-----------|-----------|----------------------------------|-----------|--------------|
| `Active`  | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** Task 6.2 — Cohort-doc archival sweep, completing the executor's terminal-sweep mechanics
  (6.1 `archive` relocation + dated-path computation + the `arc archive` command; 6.2 last-member cohort-doc sweep)
- **Next Task:** `Task 6.3 — slug→state read surface (line ~517)`
- **Blockers:** [none]

- **Next Action:** Start Task 6.3 — move the slug→state read to `arc status <slug>` (bare `arc status` =
  session/active view; a slug = that WU's lifecycle state, preserving the shipped JSON shape). Only the thin CLI
  shell changes — `handlers/status.ts` dispatches to `resolveSlugQuery` (the durable artifact, stays put); the
  `--lifecycle <slug>` option becomes a `status <slug>` positional. Then 6.4 (re-point existing workflows) before
  Phase 7.

---
