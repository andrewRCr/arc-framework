# Metadata: Compaction Recovery

- **State:** Planning
- **Owner:** andrew
- **Branch:** [none]

- **Origin:** [internal]
- **Design:** `draft-compaction-recovery.md`

- **Depends On:** [none]
- **Cohort:** agent-context-optimization
- **Priority:** P3

- **Task List:** [none]
- **Last Completed:** [none]
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Build the small recovery bridge: `arc status --compaction-seed` with write mode,
  the `session-recover` workflow, the `arc-recover` skill wrapper, and an optional Codex hook recipe
  that wires pre-compact seed capture to compact-session-start recovery.

---
