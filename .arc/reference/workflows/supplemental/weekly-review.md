# Workflow: Weekly Review

**Audience:** Human-driven — developer conducts this review, optionally with agent assistance.

**Purpose**: Process captured work, maintain backlog health, and ensure task tracking stays current.
See `strategy-work-organization.md` for work categorization context (feature vs technical, backlog
lifecycle).

In agent-assisted sessions, the agent reads each file, surfaces findings and proposed dispositions,
and the user makes final decisions on each item.

---

## Process

### Step 1: Process Task Inbox

**File:** `.arc/backlog/TASK-INBOX.md`

For each item, decide disposition:

- **Quick action (<5 min)?** → Do immediately, delete from inbox
- **Atomic task?** → Move to `active/ATOMIC-TASKS.md`
- **Feature idea?** → Move to `feature/BACKLOG-FEATURE.md`
- **Technical idea?** → Move to `technical/BACKLOG-TECHNICAL.md`
- **Not ready?** → Leave for next review

**Goal:** Empty or nearly-empty inbox.

### Step 2: Review Atomic Tasks

**File:** `.arc/active/ATOMIC-TASKS.md`

For each active task:

- Still relevant? → Keep
- No longer needed? → Delete
- Too complex for atomic? → Propose incidental task list, remove from atomic
- Reprioritize if warranted — high-priority items to top

Completed items are archived at completion time; no cleanup needed here.

**Goal:** Clean list with only relevant, actionable items.

### Step 3: Review Bucket Files

**Files:**

- `.arc/backlog/feature/BACKLOG-FEATURE.md`
- `.arc/backlog/technical/BACKLOG-TECHNICAL.md`

For each file:

1. Sort any "Unsorted" items into appropriate sections
2. Assess maturity:
   - Ready for planning? → Create `plan-{name}.md`, remove from bucket
   - Ready for PRD? → Create `prd-{name}.md`, remove from bucket
   - Still exploring? → Leave in bucket
3. Prune: delete stale items, combine related ideas
4. Check work unit files (`plan-*.md`, `prd-*.md`) in the same directories — still in planning,
   or ready to advance?

**Goal:** Bucket files reflect current thinking; mature ideas graduate to dedicated files.

### Step 4: Update Roadmap and Project Status

**Files:**

- `.arc/backlog/ROADMAP.md` — Internal planning guide: priorities, sequencing, rough direction
- `.arc/reference/constitution/PROJECT-STATUS.md` — Official project state, potentially public-facing

Review and update both:

- Do active task lists reflect current priorities?
- Any completed work to document?
- Are we working on the right things?

**Goal:** Both files accurately reflect current state and direction.

---

## Post-Review

Commit backlog changes:

```bash
git add .arc/backlog/ .arc/active/ATOMIC-TASKS.md
git commit -m "docs(arc): weekly review - process inbox and clean atomic tasks

Context: planning (atomic / no associated task list)"
```

---

## Troubleshooting

**Inbox not emptying?**

- Capturing too granularly — save quick thoughts for immediate action
- Items need more time to mature — leave for next review

**Atomic tasks accumulating?**

- Tasks too large? Convert to incidental task lists.
- Not getting done? Reassess priority or delete.

**Bucket files cluttered?**

- Graduate more aggressively to plan/PRD files
- Delete stale ideas, combine related items
