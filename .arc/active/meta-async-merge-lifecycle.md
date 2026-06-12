# Metadata: async-merge-lifecycle

| **State**  | **Owner** | **Branch**                   | **Class** | **Priority** |
| ---------- | --------- | ---------------------------- | --------- | ------------ |
| `Planning` | `andrew`  | `plan/async-merge-lifecycle` | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** `concurrent-work-doctrine`, `merge-safety-mechanism`, `notes-merge-coherence`

- **Origin:** [internal]
- **Design:** `draft-async-merge-lifecycle.md`
- **Task List:** [none]

- **Last Completed:** [none]
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** **Resumed to active planning** — all three `Depends On` edges have shipped
  (`concurrent-work-doctrine`, `merge-safety-mechanism`, `notes-merge-coherence` all in `completed/2026-q2/`),
  so the build-first park gate has cleared. Run `create-spec.md` from `draft-async-merge-lifecycle.md`. At spec:
  (1) re-ground the `integrate-work-unit` / session-init touchpoints against current shipped code (the draft's
  2026-06-12 sweep holds, but PRs #81/#83 shifted adjacent surfaces); (2) decide the eager-vs-lazy post-merge
  teardown § Open; (3) coordinate the teardown-reaper surface with `coord-probe` (whoever specs first owns it).

---
