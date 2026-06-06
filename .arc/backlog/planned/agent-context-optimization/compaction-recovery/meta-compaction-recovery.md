# Metadata: Compaction Recovery

| **State**  | **Owner** | **Branch** | **Class** | **Priority** |
| ---------- | --------- | ---------- | --------- | ------------ |
| `Planning` | `andrew`  | [none]     | `Heavy`   | `P3`         |

- **Cohort:** `agent-context-optimization`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `draft-compaction-recovery.md`
- **Task List:** [none]

- **Last Completed:** [none]
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Build the small recovery bridge: `arc status --compaction-seed` with write mode,
  the `session-recover` workflow, the `arc-recover` skill wrapper, and an optional Codex hook recipe
  that wires pre-compact seed capture to compact-session-start recovery.

---
