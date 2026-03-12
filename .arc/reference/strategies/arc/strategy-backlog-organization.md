# Strategy: Backlog Organization · `arc-in-git`

**Purpose:** Define the two-tier backlog structure, processing flow, and graduation model for
pre-active work items. Covers bucket files, inbox capture, and commit context conventions.

**Layer:** arc-in-git (`pm.mode: arc-in-git`). This strategy applies only when arc-in-git
Project Management mode is active.

**Scope:** Backlog directory structure, item lifecycle (capture → triage → graduation),
and inbox conventions. For active work organization (feature/technical/incidental
categories, git workflow, directory structure), see
[Work Organization Strategy](strategy-work-organization.md).

---

## Structure

```text
backlog/
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
  WORK-STATUS.md             # Project state (tracked)
  feature/  technical/  incidental/

user/{identity}/             # Personal workspace (gitignored)
  ATOMIC-INBOX.md            # Capture bucket for small, ready-to-execute items
```

## Processing Flow

```text
New work idea
  ├─ Atomic & ready? → user/{identity}/ATOMIC-INBOX.md
  ├─ Feature idea? → BACKLOG-FEATURE.md
  ├─ Technical idea? → BACKLOG-TECHNICAL.md
  └─ Quick (<5min)? → Do immediately

Inbox items graduate: keep → do now → promote to backlog → drop
Bucket → plan-*.md (when scope clear) → prd-*.md (when ready, delete plan)
```

## Key Design Points

- **No incidental/ in backlog** — Incidental work is discovered during active work, not pre-planned
- **ATOMIC-INBOX.md** lives in `user/{identity}/` — Personal, gitignored capture bucket for small,
  ready-to-execute items (GTD "Next Actions"). Items that grow beyond atomic scope promote to backlog.
- **ROADMAP.md** is an internal planning artifact for sequencing, referenced from PROJECT-STATUS.md
- **Bucket → plan → PRD graduation** — Items move to individual files when scope is defined
- **Inbox → backlog graduation** — Items that turn out to be larger than expected promote from inbox
  to the appropriate `BACKLOG-*.md` file. The inbox is personal; backlog files are shared.

## Commit Context for Atomic Work

Atomic work (whether from the inbox or done directly) uses boundary categories in the commit
Context footer:

```text
Context: maintenance (atomic / no associated task list)
Context: refactor (atomic / no associated task list)
Context: documentation (atomic / no associated task list)
```

The commit message is the canonical completion record — no separate archive file. `arc log --atomic`
searches commit history by the `(atomic / no associated task list)` pattern.

---

## Related Documentation

- [Work Organization Strategy](strategy-work-organization.md) — Work categories, git workflow, archive structure
