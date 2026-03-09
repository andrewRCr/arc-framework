# Atomic Tasks · `arc-in-git`

**Purpose:** Project-wide atomic tasks not scoped to any work unit. Individual task lists have their own
Atomic Tasks section for WU-domain discoveries; this file captures everything else — cross-cutting fixes,
methodology improvements, and standalone one-off work.

**How to use:**

1. Add tasks with checkboxes under "Active" section
2. When complete:
   - Mark `[x]` and add completion notes
   - Move to `../reference/archive/{quarter}/completed-atomic-{quarter}.md` (insert at top)
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

<!-- None currently. -->
