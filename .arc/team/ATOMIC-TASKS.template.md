# Atomic Tasks

> **Requires:** `pm.mode: arc-in-git` in `arc-config.yml`. This file is part of ARC's optional
> Project Management (PM) suite. Without `arc-in-git`, use the "Atomic Tasks" section in task
> lists for off-plan work instead.

**Purpose:** Small, one-off tasks that are ready to execute (GTD "Next Actions").

**How to use:**

1. Add tasks with checkboxes under "Active" section
2. When complete:
   - Mark `[x]` and add completion notes
   - Move to `reference/archive/{{QUARTER}}/completed-atomic-{{QUARTER}}.md` (insert at top)
   - Add branch line after completion notes (with empty line separator):

     ```markdown
     - [x] Task description
         - **Outcome:** What was done, key changes
         - **Files:** list of modified files

         - **Branch:** `feature/feature-name` or `technical/tech-name`
     ```

3. Commit atomic work with: `Context: {{CATEGORY}} (atomic / no associated task list)`
   - Categories: maintenance, refactor, documentation, planning
   - See [Backlog Organization Strategy](../reference/strategies/arc/strategy-backlog-organization.md)
     for full conventions

**Referencing completed work:** "see {{TASK_NAME}} in `completed-atomic-{{QUARTER}}.md`"
    - Quick access: [Completed Atomic Tasks](../reference/archive/{{QUARTER}}/completed-atomic-{{QUARTER}}.md)

---

## Active

<!-- Add tasks here with checkboxes -->

<!-- Example structure:

- [ ] {{Task name}}
    - Problem: {{What issue this addresses}}
    - Approach: {{How to solve it}}
    - Files: `{{path/to/file.ext}}`
    - Rationale: {{Why this matters}}

-->
