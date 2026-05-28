# Strategy: Planning Module · `arc-in-git`

> **Decision guide:** [The Planning Module](https://andrewrcr.github.io/arc-framework/work-planning/#the-planning-module)
> on the docs site covers when arc-in-git fits, scaling considerations, and the external tracker
> alternative.

**Purpose:** Overview of what `pm.mode: arc-in-git` adds to an ARC installation — ARC's built-in
project management layer for capture, work sequencing, and backlog organization.

**Layer:** arc-in-git (`pm.mode: arc-in-git`). Everything described here is installed only when
this mode is active. Core ARC (`pm.mode: none`) and external tracker mode (`pm.mode: external`)
work without these artifacts.

---

## Contents

- [What It Installs](#what-it-installs) — capture surfaces and directory shape
- [Inbox Family](#inbox-family) — per-inbox orientation: purpose, lifecycle, write discipline
- [How Work Flows Through](#how-work-flows-through) — routing by intent, ownership, and character
- [Ceremony-Only Writes to Shared Inboxes](#ceremony-only-writes-to-shared-inboxes) — write-isolation discipline
- [State-Dir Graduation](#state-dir-graduation) — `provisional/` → `planned/` commitment semantics
- [Cohort Wrapper Subdirs](#cohort-wrapper-subdirs) — codified sibling sets, backlog-only
- [When to Use Arc-in-Git](#when-to-use-arc-in-git) — fit and scaling boundaries
- [Relationship to Core ARC](#relationship-to-core-arc) — what changes without it

---

## What It Installs

Four capture surfaces plus a generated sequencing view, distinguished by **ownership** (personal
vs. project-shared) and **work character** (atomic vs. multi-step):

| Artifact                              | Location           | Scope                | Purpose                                                |
|---------------------------------------|--------------------|----------------------|--------------------------------------------------------|
| `USER-INBOX.md`                       | `user/{identity}/` | Personal, gitignored | Live capture; `## Atomic` and `## Backlog` sections    |
| `ATOMIC-INBOX.md`                     | `backlog/`         | Project-shared       | Atomic-character entries (committed, tracked)          |
| `BACKLOG-INBOX.md`                    | `backlog/`         | Project-shared       | Multi-step entries (committed, tracked)                |
| `{planned,provisional}/<wu-name>/`    | `backlog/`         | Project-shared       | Per-WU subdirs for matured backlog WUs                 |
| `ROADMAP.md`                          | `backlog/`         | Project-shared       | Generated view — sequencing across committed WUs       |

Per-WU subdirs always carry `meta-<wu-name>.md` and may carry `plan-<wu-name>.md`,
`prd-<wu-name>.md`, and other companions when present. Meta-file shape lives in
[Work Organization Strategy][work-org] § Work Unit State.

ROADMAP is a generated artifact, not a capture surface — it renders from `meta-*.md` files in
`active/**` and `backlog/planned/**`. See [Work Organization Strategy][work-org] § ROADMAP for
the render algorithm and regeneration fire-points.

The `backlog/` directory and its contents exist only in arc-in-git installations. `USER-INBOX.md`
is part of arc-in-git's capture model — it routes to shared backlog destinations at drain time.

---

## Inbox Family

The capture surfaces split by **ownership** (personal vs. project-shared) and **work character**
(atomic vs. multi-step):

- **Personal** — `user/{identity}/USER-INBOX.md`. Live-capture surface; cross-PM-mode (exists
  outside arc-in-git too). See `strategy-session-operations.md` § USER-INBOX for purpose,
  lifecycle, and the `## Atomic` / `## Backlog` section semantics.
- **Project-shared atomic** — `backlog/ATOMIC-INBOX.md` (below).
- **Project-shared multi-step** — `backlog/BACKLOG-INBOX.md` (below).

§ How Work Flows Through covers the routing tree across all three; the subsections below cover
per-inbox orientation for the two project-shared inboxes.

### `backlog/ATOMIC-INBOX.md` — project-shared atomic capture

Committed-tracked queue of atomic-character entries from across the project. Ceremony-only writes
— read freely between ceremonies, write only at the three lifecycle fire-points. Entries execute
as-is from inbox at their owning WU; completion deletes the entry, and the routing record lives
in the deletion commit message plus the absorbing artifact.

Off-WU work is committed with the `standalone (...)` footer; browse that history with
`arc log standalone`.

### `backlog/BACKLOG-INBOX.md` — project-shared multi-step capture

Committed-tracked queue of multi-step entries awaiting draft-doc maturation. Ceremony-only writes
(same fire-points as ATOMIC-INBOX). When scope and plan emerge, entries graduate to a per-WU
subdir at `backlog/{planned,provisional}/<wu-name>/` carrying their `plan-<wu-name>.md` and any
companions — see § State-Dir Graduation.

**Entry shape:** H3 with a `[ ]` checkbox and bold title, followed by italic-descriptor bullets
— `_Observation:_`, `_Proposed action:_`, `_Scope:_`, `_Branch:_`, `_Captured during:_` (and
others as the entry warrants). Entries sit under a `## Inbox` H2 wrapper (the H2 layer below the
file H1); USER-INBOX additionally splits into `## Atomic` / `## Backlog` sections in lieu of
`## Inbox`. Multi-line bullets within an entry separate with blank lines (loose-list per
`strategy-task-list-formatting.md` § Blank-Line Discipline). Same shape applies to
project-shared ATOMIC-INBOX entries.

### Write-discipline summary

Personal capture (`USER-INBOX.md`) accepts writes any time (live capture). Shared inboxes
(`backlog/ATOMIC-INBOX.md`, `backlog/BACKLOG-INBOX.md`) batch writes at ceremony fire-points
(write isolation). The discipline trades write immediacy for elimination of multi-writer merge
conflicts on shared files. See [DEV-RULES.ARC][dev-rules] § Leave it cleaner for the
constitutional rule statement.

---

## How Work Flows Through

Routing depends on three axes: **lifecycle intent** (during this WU vs. for later),
**ownership** (personal vs. project-shared), and **work character** (atomic vs. multi-step):

```text
New work item
  ├─ Atomic, during this WU?      → fold into the commit, or spin an Errand
  ├─ Multi-step, during this WU?  → fold into current task list
  ├─ Atomic, for later?           → USER-INBOX.md § Atomic
  ├─ Multi-step, for later?       → USER-INBOX.md § Backlog
  └─ Quick (< 5 min)?             → fix immediately
```

Captures land in `USER-INBOX.md` (personal, live). Entries drain at ceremony boundaries —
§ Atomic flows to `backlog/ATOMIC-INBOX.md`; § Backlog flows to `backlog/BACKLOG-INBOX.md`, or
graduates directly to a per-WU subdir under `backlog/{planned,provisional}/` when scope and plan
have emerged. Atomic items execute as-is from inbox; multi-step items mature
into `plan-<wu-name>.md` and (when ready) `prd-<wu-name>.md`. See
[Work Planning Strategy][work-planning] for the plan → PRD pipeline and discovery checklist.

For the full intent × mode routing table (including `pm.mode: external` and `pm.mode: none`),
see [DEV-RULES.ARC][dev-rules] § Leave it cleaner.

---

## Ceremony-Only Writes to Shared Inboxes

Shared inboxes (`backlog/ATOMIC-INBOX.md`, `backlog/BACKLOG-INBOX.md`) are read-only by
convention outside three lifecycle fire-points:

- **Activation absorption** — at WU activation, USER-INBOX entries scoped to that WU's domain
  absorb into the WU's task list; the remainder stays personal.
- **Integration drain** — at WU integration, surviving USER-INBOX entries flush to the matching
  shared inbox (`§ Atomic` → `ATOMIC-INBOX.md`; `§ Backlog` → `BACKLOG-INBOX.md`), or graduate
  to a new `backlog/provisional/<wu-name>/` subdir if scope and plan have emerged.
- **Planning-kickoff promotion** — when a maintainer commits to a backlog WU, entries from the
  shared inbox or provisional subdir promote into the WU's plan/PRD as concrete tasks.

**Absorbed entries are deleted, not marked.** The routing record lives in the deletion commit
message plus the absorbing artifact (task list or new WU subdir). Don't leave
strikethrough, `[absorbed]` tags, or status markers — git history is the audit trail.

The discipline trades write immediacy for write isolation. Shared inboxes represent
**committed direction as of the last ceremony**, not real-time capture. Live capture lives in
`USER-INBOX.md`; cross-team and cross-worktree visibility materializes at the next ceremony
boundary. The rule eliminates by construction a class of merge conflicts that continuous
multi-writer edits to shared inboxes would otherwise produce.

---

## State-Dir Graduation

Backlog WUs live in one of two commitment dirs at the backlog root:

- `backlog/planned/<wu-name>/` — committed by a maintainer; sequenced on ROADMAP.
- `backlog/provisional/<wu-name>/` — drafted but not yet committed; not on ROADMAP.

Each WU subdir carries `meta-<wu-name>.md` (always) plus `plan-<wu-name>.md` and any other
companions when present.

**Graduation:** `backlog/provisional/<wu-name>/` → `backlog/planned/<wu-name>/` fires when a
maintainer commits to the WU. The `git mv` of the WU subdir and the regenerated ROADMAP (which
now picks up the WU via the `backlog/planned/**` walk) ride the same commit. Symmetric demotion
is supported.

ROADMAP is the **derived surface**, not the trigger — the trigger is the maintainer commitment;
ROADMAP regen is the observable effect. The `**State:**` field on the meta file stays
`Planning` across the graduation; commitment level lives in directory location, not in State.
See [Work Organization Strategy][work-org] § Work Unit State for the State enum semantics.

---

## Cohort Wrapper Subdirs

For codified sibling sets (formally tracked groups of WUs intended to ship together), introduce
a cohort wrapper inside the commitment dir:

```text
backlog/planned/<cohort>/<wu-name>/
backlog/provisional/<cohort>/<wu-name>/
```

Standalone WUs sit directly at `backlog/{state}/<wu-name>/` — no cohort wrapper.

**Constraints:**

- **Backlog-only.** `active/` stays flat — no cohort dirs in `active/`. Cohort membership
  tracks on the meta file via `**Cohort:**`.
- **Codified-cohorts only.** Reserve for sibling sets with formal codification; don't wrap
  ad-hoc groupings.
- **State-uniform.** All cohort members live in the same state-dir. Partial commitment splits
  the cohort and is not supported.

ROADMAP rendering handles both subdir shapes (standalone and cohort-wrapped) via the same
`meta-*.md` walk.

---

## When to Use Arc-in-Git

Arc-in-git is designed for solo developers and small teams where keeping everything in git is
a simplicity win — no external tools, no context-switching, no sync overhead. The backlog,
planning pipeline, and work tracking all live alongside the code.

**Ideal for:**

- Solo development — no concurrency concerns, backlog always current, zero tool overhead
- Small teams (2-3) integrating regularly — occasional merge conflicts in shared inboxes are
  trivial, backlog stays roughly current across branches

**Works with awareness:**

- Medium teams (4-6) with short-lived branches. Shared inboxes may lag behind in-flight work
  between integrations; `USER-INBOX.md` absorbs captures during branch work, items promote to
  the shared backlog surface at integration boundaries. Expect occasional merge conflicts in
  shared files — manageable if branches integrate often.

**The scaling boundary** is a function of team size, branch lifetime, and integration
frequency — not a hard headcount threshold. The shared backlog surface (`ATOMIC-INBOX.md`,
`BACKLOG-INBOX.md`, per-WU subdirs, ROADMAP) is tracked in git on the base branch. When
multiple developers capture work from concurrent feature branches, those edits only converge
at merge time. Teams that integrate often stay current; teams with long-lived branches
experience growing staleness and merge friction.

When the global backlog needs to be live, shared, and branch-independent — typically larger
teams or teams with longer branch lifetimes — an external tracker is the right tool. ARC's
`pm.mode: external` provides a structured integration path: the tracker owns assignment and
global status while ARC task lists own execution detail, session context, and quality gates.
See [Team Coordination][team-coord] § External Tracker Integration for the integration model.

---

## Relationship to Core ARC

Without arc-in-git (`pm.mode: none` or `external`):

- No `backlog/` directory — no `ATOMIC-INBOX.md`, `BACKLOG-INBOX.md`, ROADMAP, per-WU
  subdirs, or commitment-dir split
- No `USER-INBOX.md` — for-later routing follows project convention or the external tracker
- Atomic during-WU work still folds into the commit or spins an Errand — that's Core
- Plan documents and PRDs (when used) live in `active/` directly; no graduation pipeline

The planning module adds structure for teams that want built-in project management without
external tools. Teams using Jira, Linear, or GitHub Issues use `pm.mode: external` — ARC
provides extension points for syncing task completion, work unit activation, and archival
events to external trackers.

---

## Related Documentation

- [Work Planning][work-planning] — Planning pipeline, plan/PRD conventions, discovery checklist
- [Work Organization][work-org] — Branching, archival, ROADMAP render algorithm, state semantics
- [DEV-RULES.ARC][dev-rules] § Leave it cleaner — Full intent × mode capture routing table
- [Process Task Loop][process-loop] § Atomic Task Completion — atomic task execution and routing
- [Team Coordination][team-coord] § External Tracker Integration — external PM integration model

---

[work-planning]: strategy-work-planning.md
[work-org]: strategy-work-organization.md
[dev-rules]: ../../../system/rules/DEV-RULES.ARC.md
[process-loop]: ../../../system/workflows/arc/3_process-task-loop.md
[team-coord]: strategy-team-coordination.md
