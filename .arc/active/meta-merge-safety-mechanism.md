# Metadata: merge-safety-mechanism

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --- | --- | --- | --- | --- |
| `Active` | `andrew` | `feat/merge-safety-mechanism` | `Heavy` | `P2` |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** `concurrent-work-doctrine`

- **Origin:** [internal]
- **Design:** `spec-merge-safety-mechanism.md`
- **Task List:** `tasks-merge-safety-mechanism.md`

- **Last Completed:** Phase 3 (Tasks 3.1–3.3) — path-surface + `chore/`-awareness in `classifyWriteContext`,
  advisory pre-commit foreign-write backstop (CHECK 19), and confirmed behind-base coverage of the cohort doc
- **Next Task:** Task 4.1 — Merge-commit exemption in `commit-msg` (line ~190)
- **Blockers:** [none]

- **Next Action:** Begin Task 4.1 — exempt two-parent merge commits from the `commit-msg` subject + footer
  rules (detect `MERGE_HEAD` / two-parent right after the `hook_enabled` early-exit), both hook copies, opening
  Phase 4 (merge-commit exemption + `integration` footer kind) (`tasks-merge-safety-mechanism.md`).

---
