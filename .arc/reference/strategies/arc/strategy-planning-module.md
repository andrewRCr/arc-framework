# Strategy: Planning Module · `arc-in-git`

> **Decision guide:** [The Planning Module](https://andrewrcr.github.io/arc-framework/work-planning/#the-planning-module)
> on the docs site covers when arc-in-git fits, scaling considerations, and the external tracker
> alternative.

**Purpose:** Overview of what `pm.mode: arc-in-git` adds to an ARC installation — ARC's built-in
project management layer for backlog capture, work sequencing, and atomic task routing.

**Layer:** arc-in-git (`pm.mode: arc-in-git`). Everything described here is installed only when
this mode is active. Core ARC (`pm.mode: none`) and external tracker mode (`pm.mode: external`)
work without these artifacts.

---

## Contents

- [What It Installs](#what-it-installs) — artifacts and directory structure
- [How Work Flows Through](#how-work-flows-through) — routing and graduation
- [Inbox vs. Companion File](#inbox-vs-companion-file) — routing by lifecycle intent
- [When to Use Arc-in-Git](#when-to-use-arc-in-git) — fit and scaling boundaries
- [Relationship to Core ARC](#relationship-to-core-arc) — what changes without it

---

## What It Installs

| Artifact             | Location               | Purpose                                                  |
|----------------------|------------------------|----------------------------------------------------------|
| ROADMAP.md           | `backlog/`             | Sequencing strategy — order of operations across WUs     |
| BACKLOG-FEATURE.md   | `backlog/feature/`     | Bucket file for feature ideas (sections, non-atomic)     |
| BACKLOG-TECHNICAL.md | `backlog/technical/`   | Bucket file for technical ideas (sections, non-atomic)   |
| PROJECT-STATUS.md    | `reference/`           | High-level project health and progress snapshot          |
| ATOMIC-INBOX.md      | `user/{identity}/`     | Personal capture bucket for small ready-to-execute items |

The `backlog/` directory and its structure exist only in arc-in-git installations.
ATOMIC-INBOX.md lives in the gitignored user directory — personal and branch-agnostic.

---

## How Work Flows Through

```text
New work idea
  ├─ Atomic & ready?   → ATOMIC-INBOX.md
  ├─ Feature idea?     → BACKLOG-FEATURE.md
  ├─ Technical idea?   → BACKLOG-TECHNICAL.md
  └─ Quick (< 5 min)?  → Fix immediately
```

**Graduation:** Bucket item → `plan-*.md` (when scope is clear) → `prd-*.md` (when ready for
requirements). Items that stay atomic execute directly from the inbox or companion file —
no graduation needed. See [Work Planning Strategy][work-planning] for the full pipeline,
plan/PRD conventions, and discovery checklist.

**Inbox graduation:** Items in ATOMIC-INBOX.md that grow beyond atomic scope promote to the
appropriate `BACKLOG-*.md` file. The inbox is personal (gitignored); backlog files are shared
(tracked).

---

## Inbox vs. Companion File

Route by **when you intend to handle it**, not what domain it's in:

- **During this work unit** → atomic companion file (`atomic-{name}.md` — tracked, archives
  with the WU)
- **For later** → ATOMIC-INBOX.md (gitignored, branch-agnostic, persists across WU boundaries)

The companion file is scoped to a work unit's lifecycle. The inbox is personal and permanent
until you triage it. For the full routing table, see [DEV-RULES.ARC][dev-rules] § Leave it
cleaner. For companion file format and completion protocol, see
[Task List Formatting][task-list-fmt] § Atomic Companion File and
[process-task-loop][process-loop] § Atomic Task Completion.

---

## When to Use Arc-in-Git

Arc-in-git is designed for solo developers and small teams where keeping everything in git is
a simplicity win — no external tools, no context-switching, no sync overhead. The backlog,
planning pipeline, and work tracking all live alongside the code.

**Ideal for:**

- Solo development — no concurrency concerns, backlog always current, zero tool overhead
- Small teams (2-3) integrating regularly — occasional merge conflicts in bucket files are
  trivial, backlog stays roughly current across branches

**Works with awareness:**

- Medium teams (4-6) with short-lived branches. Backlog files may lag behind in-flight work
  between integrations; ATOMIC-INBOX absorbs captures during branch work, items promote to
  backlog at integration boundaries. Expect occasional merge conflicts in bucket files —
  manageable if branches integrate often.

**The scaling boundary** is a function of team size, branch lifetime, and integration
frequency — not a hard headcount threshold. The backlog surface (bucket files, ROADMAP,
PROJECT-STATUS) is tracked in git on the base branch. When multiple developers capture work
from concurrent feature branches, those edits only converge at merge time. Teams that
integrate often stay current; teams with long-lived branches experience growing staleness
and merge friction.

When the global backlog needs to be live, shared, and branch-independent — typically larger
teams or teams with longer branch lifetimes — an external tracker is the right tool. ARC's
`pm.mode: external` provides a structured integration path: the tracker owns assignment and
global status while ARC task lists own execution detail, session context, and quality gates.
See [Team Coordination][team-coord] § External Tracker Integration for the integration model.

---

## Relationship to Core ARC

Without arc-in-git (`pm.mode: none` or `external`):

- No `backlog/` directory, no ROADMAP, no PROJECT-STATUS
- No ATOMIC-INBOX.md (atomic tasks still exist via companion files — that's Core)
- Plan documents and PRDs live in `active/` directly (no graduation pipeline)
- Deferred work routing follows project convention or external tracker

The planning module adds structure for teams that want built-in project management without
external tools. Teams using Jira, Linear, or GitHub Issues use `pm.mode: external` — ARC
provides extension points for syncing task completion, work unit activation, and archival
events to external trackers.

---

## Related Documentation

- [Work Planning][work-planning] — Planning pipeline, plan/PRD conventions
- [Work Organization][work-org] — Work categories, branching, directory structure
- [DEV-RULES.ARC][dev-rules] § Leave it cleaner — Capture routing table
- [Process Task Loop][process-loop] § Incidental Work — Atomic task execution and routing
- [Team Coordination][team-coord] § External Tracker Integration — external PM integration model

---

[work-planning]: strategy-work-planning.md
[work-org]: strategy-work-organization.md
[dev-rules]: ../../constitution/DEV-RULES.ARC.md
[process-loop]: ../../../system/workflows/arc/3_process-task-loop.md
[task-list-fmt]: strategy-task-list-formatting.md
[team-coord]: strategy-team-coordination.md
