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

- [ ] **General refinement pass on `.arc/` framework docs**
    - Audit all `.arc/reference/` docs for content quality: clarity, accuracy, staleness, completeness
    - Scope includes: workflows (core + supplemental), strategies (ARC), constitution templates,
      agent templates, QUICK-REFERENCE template — everything under `.arc/reference/`
    - Also review `.arc/active/` and `.arc/backlog/` starter/template files
    - Focus on **content quality only** — not structural concerns (that's the subsequent structural
      audit). If structural issues are spotted, note them but don't fix.
    - For each file: Is the content current? Is guidance clear and actionable? Are examples
      accurate? Is anything stale, redundant, or missing? Are there mixed concerns worth flagging
      for the structural pass?
    - Output: fixes applied directly (with commits), plus a summary of structural observations
      to feed into the structural analysis pass
    - Context: prerequisite for distribution system; clean content before structural decisions
    - Reference: `backlog/ROADMAP.md` (Phase B.2), `backlog/technical/BACKLOG-TECHNICAL.md`
    - Note: if scope expands beyond atomic, escalate to task list per process-task-loop protocol
