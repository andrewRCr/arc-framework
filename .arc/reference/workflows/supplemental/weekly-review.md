# Workflow: Weekly Review

**Purpose:** Process captured work, maintain backlog health, and ensure task tracking stays current.

**When to use:** Weekly (recommended: Friday afternoon or Sunday evening)

**Duration:** 15-30 minutes

---

## Overview

Weekly review is the cornerstone of backlog organization. It ensures:

- TASK-INBOX.md stays lean (no accumulation)
- ATOMIC-TASKS.md shows current priorities
- Bucket files reflect work ready for promotion
- Nothing gets lost or forgotten

---

## Review Steps

### 1. Process Task Inbox

**File:** `.arc/backlog/TASK-INBOX.md`

**For each item, decide:**

- **Quick action (<5 min)?** → Do immediately, delete from inbox
- **Atomic task (ready now)?** → Move to `active/ATOMIC-TASKS.md` (Active section)
- **Feature idea?** → Move to `feature/BACKLOG-FEATURE.md` (appropriate section)
- **Technical idea?** → Move to `technical/BACKLOG-TECHNICAL.md` (appropriate section)
- **Uncertain/not ready?** → Leave in inbox for next week

**Goal:** Empty or nearly-empty inbox at end of review.

**Red flag:** If inbox has >20 items, you're not reviewing frequently enough or capturing too granularly.

---

### 2. Review Atomic Tasks

**File:** `.arc/active/ATOMIC-TASKS.md`

**Actions:**

1. **Review active tasks**
   - Still relevant? Keep
   - No longer needed? Delete
   - Too complex (needs task list)? Create incidental task list, delete from atomic

2. **Reprioritize if needed**
   - Move high-priority items to top
   - Consider effort vs value

**Note:** Completed items are immediately archived to `completed-atomic-{quarter}.md` at completion time,
so no cleanup of completed items is needed during weekly review.

**Goal:** Clean active list with only relevant, actionable items.

---

### 3. Review Bucket Files

**Files:**

- `.arc/backlog/feature/BACKLOG-FEATURE.md`
- `.arc/backlog/technical/BACKLOG-TECHNICAL.md`

**For each section:**

1. **Sort "Unsorted" items** into appropriate sections

2. **Assess maturity:**
   - Ready for planning? → Create `plan-{name}.md`, delete from bucket
   - Ready for PRD? → Create `prd-{name}.md`, delete from bucket
   - Still exploring? → Leave in bucket

3. **Check for bloat:**
   - Are sections getting too large?
   - Should some items be combined or deleted?
   - Are items stale (no longer relevant)?

**Goal:** Bucket files reflect current thinking, mature ideas graduate to files.

---

### 4. Update Project Status

**File:** `.arc/reference/constitution/PROJECT-STATUS.md`

**Review and update:**

- **Current priorities:** Do active task lists reflect what matters most?
- **Feature progress:** Any completed work to document?
- **Roadmap alignment:** Are we working on the right things?
- **Recent completions:** Celebrate wins, update completion status

**Goal:** PROJECT-STATUS.md accurately reflects current state and priorities.

---

## Optional: Extended Review

If time permits or quarterly:

### 5. Review Work Unit Files

**Files in:** `.arc/backlog/feature/` and `.arc/backlog/technical/`

- **plan-*.md files:** Still in planning? Or ready for PRD?
- **prd-*.md files:** Ready to move to active and generate tasks?

### 6. Audit Active Work

**Check:** `.arc/active/CURRENT-SESSION.md`

- Is current work still aligned with priorities?
- Any blockers that need addressing?
- Should paused work be resumed or archived?

---

## Post-Review Actions

After completing review:

1. **Commit changes** to backlog files:

   ```bash
   git add .arc/backlog/ .arc/active/ATOMIC-TASKS.md
   git commit -m "docs(arc): weekly review - process inbox and clean atomic tasks

   Context: planning (atomic / no associated task list)"
   ```

2. **Optional:** Plan next week's focus based on review

---

## Troubleshooting

**Inbox not getting empty?**

- Capturing too granularly? Save truly quick thoughts for immediate action.
- Not reviewing frequently enough? Consider bi-weekly reviews.
- Items need more time to mature? That's okay, leave for next week.

**Atomic tasks accumulating?**

- Tasks too large? Break down or convert to incidental task lists.
- Not doing them? Reassess priority or delete if no longer relevant.
- New ones faster than completion? Normal - just ensure list stays <30 items.

**Bucket files feeling cluttered?**

- Graduate more aggressively to notes/PRD files.
- Delete stale ideas (if not touched in 3+ months, probably not happening).
- Combine related ideas into single work units.

---

## Reference

- strategy-work-organization.md: Work categorization and workflow
- 3_process-task-loop.md: Task execution workflow
