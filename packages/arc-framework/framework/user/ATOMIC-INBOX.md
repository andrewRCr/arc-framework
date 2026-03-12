# Atomic Inbox

> **Requires:** `pm.mode: arc-in-git` in `arc-config.yml`. This file is part of ARC's optional
> Project Management (PM) suite. Without `arc-in-git`, use the "Atomic Tasks" section in task
> lists for off-plan work instead.

**Purpose:** Personal capture bucket for small, one-off tasks — things discovered during work
that don't belong in the current task list. Inbox semantics: capture quickly, triage later.

**How to use:**

1. Add tasks with checkboxes under "Inbox" section as you discover them
2. When complete:
   - Mark `[x]` in this file, then remove the entry
   - Commit with: `Context: {{CATEGORY}} (atomic / no associated task list)`
   - Categories: maintenance, refactor, documentation, planning
3. Browse completed atomic work: `arc log --atomic`

**Triage at integration:** Before merging a work unit, review inbox items — keep, promote to
backlog, or drop. See `integrate-work-unit.md` for the triage protocol.

---

## Inbox

<!-- Add tasks here with checkboxes -->

<!-- Example structure:

- [ ] {{Task name}}
    - Problem: {{What issue this addresses}}
    - Approach: {{How to solve it}}
    - Files: `{{path/to/file.ext}}`

-->
