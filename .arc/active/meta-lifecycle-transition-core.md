# Metadata: lifecycle-transition-core

| **State** | **Owner** | **Branch**                       | **Class** | **Priority** |
|-----------|-----------|----------------------------------|-----------|--------------|
| `Active`  | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** Phase 6 complete — 6.7.c (`park-work-unit.md` ceremony), 6.7.d (`resume-work-unit.md`
  ceremony + the `park ⊥ resume` pair wired bidirectionally), 6.7.e (park→resume round-trip integration coverage in
  both placement modes, plus the `--here` deferred-checkout fix: `reconcile-worktree` gained `deferCheckout`; resume
  in-place removes the pointer and returns `inPlaceCheckoutPending` rather than checking out, so the ceremony commits
  the removal then re-attaches).
- **Next Task:** `Task 7.1 — Complete verification: load + follow verify-work-unit.md (line ~822)`
- **Blockers:** [none]

- **Next Action:** Start Task 7.1 (Phase 7 — WU-end verification): load and follow `verify-work-unit.md`.
  Implementation Phases 1–6 are all complete; this is the final verification gate before integration.

---
