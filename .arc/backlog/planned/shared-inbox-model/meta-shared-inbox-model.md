# Metadata: Shared-Inbox Model

| **State**  | **Owner** | **Branch** | **Class** | **Priority** |
| ---------- | --------- | ---------- | --------- | ------------ |
| `Planning` | `andrew`  | [none]     | `Heavy`   | `P3`         |

- **Cohort:** [none]
- **Depends On:** `concurrent-work-doctrine`

- **Origin:** [internal]
- **Design:** `draft-shared-inbox-model.md`
- **Task List:** [none]

- **Last Completed:** Grooming pass (2026-07-02) — reframed the WU from rot-fix sweep to shared-inbox model
  (renamed `shared-inbox-housekeep` → `shared-inbox-model`); settled the scope + tenure semantics, the
  promote-by-default drain fork, the consumption wiring, dual-mode `drain-inbox`, and the concurrency shape
  (consuming shipped `concurrent-work-doctrine`); recorded arc-backend compose notes and the coordination seams.
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Iterate the draft toward formalization-ready — remaining opens: the discovery-at-WU-start
  placement (here vs. `inbound-routing-method`), the errand-adoption discriminator's in-scope-vs-defer call, and
  the retain-aging threshold default; then assess draft readiness for create-spec.

---
