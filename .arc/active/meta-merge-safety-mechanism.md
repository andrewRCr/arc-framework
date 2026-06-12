# Metadata: merge-safety-mechanism

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --- | --- | --- | --- | --- |
| `Active` | `andrew` | `feat/merge-safety-mechanism` | `Heavy` | `P2` |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** `concurrent-work-doctrine`

- **Origin:** [internal]
- **Design:** `spec-merge-safety-mechanism.md`
- **Task List:** `tasks-merge-safety-mechanism.md`

- **Last Completed:** Phase 4 (Tasks 4.1–4.2) — `MERGE_HEAD` exemption in `commit-msg` (merge commits skip the
  format + footer rules) and a standalone `Context: integration (...)` footer kind, both hook copies + e2e
- **Next Task:** Task 5.1 — Complete verification (line ~211)
- **Blockers:** [none]

- **Next Action:** Begin Phase 5 verification — Task 5.1 loads and follows `verify-work-unit.md` against the
  WU's success criteria (every added surface advisory, package-project sync clean for the hook edits)
  (`tasks-merge-safety-mechanism.md`).

---
