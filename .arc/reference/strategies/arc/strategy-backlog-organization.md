# Strategy: Backlog Organization

**Purpose:** Define the two-tier backlog structure, processing flow, and graduation model for
pre-active work items. Covers TASK-INBOX capture, bucket files, atomic tasks, and commit
context conventions.

**Scope:** Backlog directory structure, item lifecycle (capture → triage → graduation),
and atomic task conventions. For active work organization (feature/technical/incidental
categories, git workflow, directory structure), see
[Work Organization Strategy](strategy-work-organization.md).

---

## Structure

```text
backlog/
  TASK-INBOX.md              # Zero-friction capture (flat bullets, lean)
  ROADMAP.md                 # Sequencing strategy, order of operations
  feature/
    BACKLOG-FEATURE.md       # Feature ideas (sections, non-atomic work only)
    plan-*.md                # Work units under planning/analysis
    prd-*.md                 # Work units ready for tasks
  technical/
    BACKLOG-TECHNICAL.md     # Technical ideas (sections, non-atomic work only)
    plan-*.md                # Work units under planning/analysis
    prd-*.md                 # Work units ready for tasks

active/
  ATOMIC-TASKS.md            # Committed atomic tasks (checkboxes, ready to execute)
  CURRENT-SESSION.md         # Session state
  feature/  technical/  incidental/
```

## Processing Flow

```text
Capture → TASK-INBOX.md
  ↓ Weekly Review
  ├─ Atomic & ready? → active/ATOMIC-TASKS.md
  ├─ Quick (<5min)? → Do immediately
  ├─ Feature idea? → BACKLOG-FEATURE.md
  ├─ Technical idea? → BACKLOG-TECHNICAL.md
  └─ Uncertain? → Leave in inbox

Bucket → plan-*.md (when scope clear) → prd-*.md (when ready, delete plan)
```

## Key Design Points

- **No incidental/ in backlog** — Incidental work is discovered during active work, not pre-planned
- **ATOMIC-TASKS.md** lives in `active/` — Small, one-off tasks ready to execute (GTD "Next Actions")
- **ROADMAP.md** is an internal planning artifact for sequencing, referenced from PROJECT-STATUS.md
- **Bucket → plan → PRD graduation** — Items move to individual files when scope is defined

## Commit Context for Atomic Tasks

Work from ATOMIC-TASKS.md uses boundary categories in the commit Context footer:

```text
Context: maintenance (atomic / no associated task list)
Context: refactor (atomic / no associated task list)
Context: documentation (atomic / no associated task list)
```

Atomic tasks aren't archived (deleted after completion) — the commit message IS the record.

---

## Related Documentation

- [Work Organization Strategy](strategy-work-organization.md) — Work categories, git workflow, archive structure
- [Weekly Review Workflow][weekly-review] — Backlog processing workflow
- [ATOMIC-TASKS Template][atomic-tasks-template] — Atomic task template with completion protocol

---

[weekly-review]: ../../../system/workflows/arc/supplemental/weekly-review.md
[atomic-tasks-template]: ../../../active/ATOMIC-TASKS.template.md
