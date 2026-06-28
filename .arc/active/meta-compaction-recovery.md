# Metadata: Compaction Recovery

| **State**  | **Owner** | **Branch**                 | **Class** | **Priority** |
| ---------- | --------- | -------------------------- | --------- | ------------ |
| `Planning` | `andrew`  | `plan/compaction-recovery` | `Heavy`   | `P3`         |

- **Cohort:** `agent-context-optimization`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `draft-compaction-recovery.md`
- **Task List:** [none]

- **Current Workflow:** `draft-design`
- **Last Completed:** [none]
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Begin `draft-design` from the session-decoupling reframe (settled 2026-06-28) — the ARC
  session decouples from the harness session and compaction becomes a first-class re-hydration event (lean seed,
  hook-deterministic recovery, `clear → session-init` / `compact → recover`), not the draft's original
  emergency-bridge framing. Scope grows to an ADR-002 amendment + `strategy-session-operations § Auto-Compaction`
  rewrite. Reassess `Class` (Heavy → possibly Novel). Two planning deliverables: author Coordination sections, and
  route reciprocal forward-compat notes to the downstream inbound buffers (`composable-workflows`,
  `operational-state-docs`, `cli-substrate-adoption`) so each owns its end of the seam.

- **PR URL:** [none]
- **Completed:** [none]

---
