# Metadata: ARC Operating Modes

- **State:** Planning
- **Owner:** andrew
- **Branch:** [none]

- **Origin:** [internal]
- **Design:** `draft-arc-modes.md`

- **Depends On:** worktree-foundation
- **Cohort:** [none]
- **Priority:** P3

- **Task List:** [none]
- **Last Completed:** [none]
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Re-scope at activation (preconditions: shift lifecycle extracted to Worktree Foundation
  ✓; confirm Lite is cut against ADR-020 / `draft-scalable-core.md` before deleting):
    1. Cut Lite mode (Mode 1 + Lite Config Template Mechanism + scattered Lite refs; ~1,700 lines) —
       superseded by scalable-core.
    2. De-stale surviving Local-mode content post-WOR: `WORK-STATUS.md` → meta-file model; retire
       task-list-header state / "Pure Option C".
    3. Finish the shift-reference sweep (TOC done): convert the residual dangling anchors in the Local,
       Solo-Dev Audit, Graduation, Deliverables-Inventory, and Resolved-Decisions sections to
       `draft-worktree-foundation.md` forward-pointers, or drop them with the cut Lite content.
    4. Rename WU → local-mode (draft + dir + meta + ROADMAP + ~6–8 external draft refs) once Lite is cut and
       only Local + the extracted-shift forward-pointer remain.

---
