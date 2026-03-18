# Atomic Inbox

> **Requires:** `pm.mode: arc-in-git` in `arc-config.yml`. This file is part of ARC's optional
> Project Management (PM) suite.

**Purpose:** Personal capture for items that **outlive the current work unit**. Unlike the atomic
companion file (`atomic-{name}.md`, branch-scoped, archives with the work unit), this inbox is
gitignored, branch-agnostic, and persists across work unit boundaries. Inbox semantics: capture
quickly, triage later.

**When to use this vs. the companion file:** The question is lifecycle intent — "will I do this
during the current work unit?" → `atomic-{name}.md`. "Is this for later?" → here. In team
contexts, this is especially valuable because you can't edit tracked backlog files from a
feature branch.

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
