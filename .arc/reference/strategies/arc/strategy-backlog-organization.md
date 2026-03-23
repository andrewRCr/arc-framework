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
- **ATOMIC-INBOX.md** lives in `user/{identity}/` — Personal, gitignored, branch-agnostic capture
  for items that **outlive the current work unit**. Three mechanical properties distinguish it from
  the atomic companion file (`atomic-{name}.md`): it's gitignored (personal, not in diffs),
  branch-agnostic (persists across branch switches), and not tied to any work unit's lifecycle
  (survives activation, integration, and archival). Items that grow beyond atomic scope promote to
  backlog.
- **Companion file vs. inbox** — The distinguishing question is lifecycle intent, not domain:
  "will I do this during the current work unit?" → `atomic-{name}.md` (branch-scoped, archives
  with WU). "Is this for later?" → ATOMIC-INBOX (persistent, personal). In team contexts, the
  inbox is especially valuable because you can't edit tracked backlog files from a feature branch.
- **ROADMAP.md** is an internal planning artifact for sequencing, referenced from PROJECT-STATUS.md
- **Bucket → plan → PRD graduation** — Items move to individual files when scope is defined
- **Inbox → backlog graduation** — Items that turn out to be larger than expected promote from inbox
  to the appropriate `BACKLOG-*.md` file. The inbox is personal; backlog files are shared.

## Commit Context for Atomic Work

Atomic work uses different context footer patterns depending on where it lives:

**Work-unit-scoped** (from the atomic companion file):

```text
Context: atomic-api-modernization.md
Context: atomic-theme-system.md
```

**Standalone** (from the inbox or done directly, no associated work unit):

```text
Context: maintenance (atomic / no associated task list)
Context: refactor (atomic / no associated task list)
Context: documentation (atomic / no associated task list)
```

The commit message is the canonical completion record — no separate archive file. `arc log --atomic`
searches commit history by both the `atomic-` filename pattern and the
`(atomic / no associated task list)` pattern.

---

## Related Documentation

- [Work Organization Strategy](strategy-work-organization.md) — Work categories, git workflow, archive structure
