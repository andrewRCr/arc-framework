# Metadata: Staleness-Guard Hard-Fail Policy

| **State** | **Owner** | **Branch**                   | **Class** | **Priority** |
| --------- | --------- | ---------------------------- | --------- | ------------ |
| `Active`  | `andrew`  | `fix/staleness-guard-policy` | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-staleness-guard-policy.md`
- **Task List:** `tasks-staleness-guard-policy.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Phases 1 and 2 — the runtime-only `build:fast` path, then unconditional refusal against a
  stale bundle with the compaction-seed write as its sole exception (Tasks 1.1, 2.1–2.3).
- **Next Task:** Task 3.1 — Point the compaction repair at the fast script (line ~139)
- **Blockers:** [none]

- **Next Action:** Begin Task 3.1 — retarget the repo-local Codex hook's repair command in `.codex/hooks.json`
  at `build:fast`

- **PR URL:** [none]
- **Completed:** [none]

---
