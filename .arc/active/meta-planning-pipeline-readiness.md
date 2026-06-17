# Metadata: Planning-Pipeline Readiness

| **State**  | **Owner** | **Branch**                         | **Class** | **Priority** |
| ---------- | --------- | ---------------------------------- | --------- | ------------ |
| `Planning` | `andrew`  | `plan/planning-pipeline-readiness` | `Heavy`   | `P2`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-transition-core`

- **Origin:** [internal]
- **Design:** `draft-planning-pipeline-readiness.md`
- **Task List:** [none]

- **Last Completed:** Draft reached formalization-ready — integrated the four spine concerns into three coherent
  sections (`assess-draft-readiness` method, `create-spec` interlock split, planning-stage-pointer mechanics with
  the `init-work-unit` pointer fix folded in). Settled the buffer-drain seam (readiness checks only; drain stays at
  the `create-spec` floor — no hard dependency), homed the overlay-recommendation convention as a `DEV-RULES.ARC`
  behavioral norm, and pinned the six-event planning-stage set.
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Run `create-spec.md` — crystallize as a `detailed` · RFC (pointer-mechanics + event model is the
  dominant derivation; confirm the subtype at create-spec's own derivation read). Open items to sharpen there: the
  `assess-draft-readiness` method file + fire-point invocation shapes, and § C's CLI verb shape, `Current Workflow`
  encoding format, consistency-test, and session-init read path.

---
