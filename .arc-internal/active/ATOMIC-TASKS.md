# Atomic Tasks - ARC Framework

**Purpose:** Small, one-off tasks that are ready to execute (GTD "Next Actions").

**How to use:**

1. Add tasks with checkboxes under "Active" section
2. When complete:
   - Mark `[x]` and add completion notes
   - Move to `reference/archive/{quarter}/completed-atomic-{quarter}.md` (insert at top)
   - Add branch line after completion notes (with empty line separator):

     ```markdown
     - [x] Task description
         - **Outcome:** What was done, key changes
         - **Files:** list of modified files

         - **Branch:** `feature/feature-name` or `technical/tech-name`
     ```

3. Commit atomic work with: `Context: {category} (atomic / no associated task list)`
   - Categories: maintenance, refactor, documentation, planning

**Referencing completed work:** "see {task name} in `completed-atomic-{quarter}.md`"

- Quick access: [Current quarter archive](../reference/archive/2026-q1/)
- **Quarter format:** Use `YYYY-qN` (e.g., `2025-q4` for Oct-Dec 2025)

---

## Active

*No active atomic tasks.*

<!-- General refinement pass escalated to task list: tasks-content-refinement-pass.md
     (in progress on branch technical/content-refinement-pass). -->
