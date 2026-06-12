# Metadata: async-merge-lifecycle

| **State**  | **Owner** | **Branch**                   | **Class** | **Priority** |
| ---------- | --------- | ---------------------------- | --------- | ------------ |
| `Planning` | `andrew`  | `plan/async-merge-lifecycle` | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** `concurrent-work-doctrine`, `merge-safety-mechanism`, `notes-merge-coherence`

- **Origin:** [internal]
- **Design:** `draft-async-merge-lifecycle.md`
- **Task List:** [none]

- **Last Completed:** Extracted `worktree-default-start` sibling (decomposition); create-spec form resolved
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Continue `create-spec.md` (mid-flight) on the now-single-concern origin. **Resolved this
  session:** `Class: Heavy`, form **`detailed`·RFC** (technical-design derivation); start-time spawn/steering
  carved off to the sibling `worktree-default-start` (cohort doc updated); buildables re-grounded against shipped
  code (suspend/resume seam, completion sweep, finalize + notes-sync leg, `integration` footer all confirmed
  net-new; `notes-merge-coherence` dep shipped). **Next:** the discovery pass — settle the two open design
  decisions before authoring the RFC: (1) eager-vs-lazy post-merge teardown § Open; (2) `coord-probe` reaper
  ownership (whoever specs first owns the branch/worktree reaper). Then run PROJECT-PRD + TECHNICAL-OVERVIEW
  alignment checks and write the spec from `template-spec-detailed-rfc.md`.

---
