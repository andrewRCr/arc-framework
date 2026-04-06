# Plan: ARC Operating Modes

**Purpose:** Establish ARC's mode architecture — alternative operating modes that expand where and how ARC
can be used. Two modes: a lightweight mode that preserves execution discipline without lifecycle ceremony,
and a local mode that enables ARC in repositories the developer doesn't control.

**Status:** Draft (deep design phase — resolve design decisions before PRD)
**Created:** 2026-04-01
**Origin:** Developer experience gaps at both ends of the adoption spectrum — small projects need less
ceremony, and constrained environments need ARC without repo footprint.

**Planning approach:** This work unit has a broadly known intent but largely unknown shape. Spend time here
in the plan stage doing research, evaluation, and design decisions so the PRD can be specific about
deliverables rather than deferring design to implementation. The plan doc is the primary working artifact
until design decisions are resolved.

**Upstream dependency:** Methodology Maturation (`prd-methodology-maturation.md`) — settles the
methodology/implementation boundary, language consistency, and content architecture that this work unit
builds on. That work unit must complete before this one begins implementation.

**Deliverable structure:**

- **ARC Lite** — primary deliverable. Lightweight mode for small, bounded projects.
- **Local mode** — secondary deliverable, defers cleanly at phase boundary. Untracked ARC for constrained
  environments. Naturally paired with Lite but orthogonal in principle.

---

## Problem Statement

ARC's value splits into two separable layers:

1. **Execution discipline** — task-driven work (process-task-loop), commit format and traceability,
   quality gates, hooks, session continuity, dev rules, methods. Valuable at any project scale.
2. **Lifecycle ceremony** — PRD requirement, formal task generation from PRD, work unit activation,
   verification phase, integration review, archival, backlog pipeline, roadmap tracking. Valuable
   for multi-week, multi-phase efforts with discovery and evolving scope.

Two gaps prevent ARC from reaching developers who would benefit from it:

**Gap 1 — Ceremony disproportionate to project scale.** For small projects (theme ports, CLI tools,
config libraries, weekend prototypes), layer 2 creates friction disproportionate to its value. Developers
skip ARC entirely, then miss layer 1. Current `pm.mode` options don't address this — `pm.mode: none`
strips PM _artifacts_ (backlogs, roadmap) but the workflow layer still assumes multi-phase, multi-week
efforts. The friction is in the workflows, not the artifacts.

**Gap 2 — ARC requires repo ownership.** ARC lives in `.arc/`, committed to the repository. This
assumes the developer controls the repo's tracked space. Common scenarios where that's false:

- Team policy prohibits tool-specific directories (organizational constraints, repo governance)
- Team members aren't interested in ARC or use their own workflows
- Contributing to an open source project where `.arc/` would be inappropriate
- Wanting to try ARC on an existing project without committing to it in the repo

Both gaps share a root cause: ARC's current architecture assumes a single operating context (long-running,
repo-owned project) and provides no way to adapt to others.

---

## Design Investigations (Pre-PRD)

These are upstream of both modes — decisions here inform the PRD's deliverable specifications. The
methodology/implementation boundary and content architecture are resolved in the upstream Methodology
Maturation work unit (`prd-methodology-maturation.md`). The investigations below are specific to
operating mode design.

### Configuration Identity

How modes are expressed in ARC's configuration system. This affects both modes.

`pm.mode` currently means "where does project management live" — the axis is PM artifact location. What
we're describing changes more than PM artifacts: workflow layer, file structure, branch model, session-init
behavior, tracking strategy.

**Options to evaluate:**

1. **New `pm.mode` value** (e.g., `pm.mode: lite`) — simplest, but stretches `pm.mode` semantics
2. **Top-level mode** (e.g., `arc.mode: lite | standard`) — separate from PM, affects multiple layers.
   `pm.mode` still exists within standard mode for arc-in-git vs external
3. **Profile concept** — named collection of settings that configure multiple axes at once
4. **Orthogonal flags** — e.g., `pm.work_units: false` disables lifecycle layer, `arc.tracking: local`
   disables repo tracking. Modes emerge from flag combinations rather than being named presets

Option 4 is interesting because it naturally handles the ARC Lite + local mode composition — they're
independent flags, not a matrix of named modes. But it risks confusing flag combinations that don't
make sense.

**Mutual exclusivity:** Lite mode and `pm.mode: arc-in-git` are mutually exclusive. Local mode and
`team.mode: true` are mutually exclusive. The CLI must guard against incompatible combinations.
Graduation/downgrade paths are the supported transitions.

Decision deferred pending deeper analysis of what exactly changes at the workflow and CLI level.

### Conditional Content Architecture

The upstream Methodology Maturation work unit inventories existing conditionals and assesses whether
the mechanisms scale. This investigation applies those findings to the specific modes being added.

**Mode-specific evaluation:** For each conditional mechanism (in-prose, template rendering, file
inclusion), determine what changes for ARC Lite and local mode. The conditional matrix grows with each
mode — each workflow step, template block, and file inclusion decision potentially needs to account for
more combinations. The pattern established upstream guides how new conditionals are expressed.

---

## Mode 1: ARC Lite (Primary Deliverable)

### Core Boundary Hypothesis

**The differentiator is work unit lifecycle presence/absence.**

Full ARC models projects as a stream of work units flowing through a lifecycle pipeline. Each work unit is
born (planning), activated, executed, verified, integrated, and archived. The project persists across many
work units.

Lightweight ARC models the project as a single evolving task list. There is no lifecycle pipeline — tasks
are added, completed, and the list grows organically. The project _is_ the work unit.

All other structural differences flow from this boundary:

| Aspect              | Full ARC                                                       | ARC Lite                    |
| ------------------- | -------------------------------------------------------------- | --------------------------- |
| Work model          | Stream of work units                                           | Single evolving task list   |
| Task list location  | `.arc/active/{category}/tasks-{name}.md`                       | `.arc/active/tasks.md`      |
| PRD                 | Required before task generation                                | Available, not required     |
| Plan docs           | Pipeline stage                                                 | Available, not required     |
| Branching model     | Strategy-driven (full/partial protection)                      | Simplified (on/off)         |
| Active directory    | Category subdirs (feature/, technical/)                        | Flat                        |
| Backlog             | Pipeline with roadmap                                          | Not installed               |
| Work unit lifecycle | Activation → execution → verification → integration → archival | None                        |
| Verification        | Formal phase in task list                                      | Run Tier 3 gates when ready |
| Integration         | Pre-merge review, formal PR workflow                           | Push/merge when ready       |
| Session lifecycle   | Same                                                           | Same                        |
| Process-task-loop   | Same                                                           | Same                        |
| Hooks               | Same                                                           | Same                        |
| Methods             | Same                                                           | Same                        |
| Dev rules           | Same                                                           | Same                        |

### What Stays Identical

These layers are project-scale-independent and work the same in both modes:

- **Constitutional layer**: DEV-RULES.ARC, DEV-RULES.PROJECT, strategies
- **Methods**: Commit format, issue triage, test-first, quality gates, all overrides
- **Hooks**: Pre-commit, commit-msg validation, format enforcement
- **Session lifecycle**: Session init and handoff, WORK-STATUS, SESSION-NOTES
- **Process-task-loop**: One task at a time, quality gates, mandatory stops, completion protocol
- **Task list format**: Same markdown structure, same formatting conventions
- **Agent briefings**: Same documents, same behavioral guidance

### What Changes

**Task list creation:** Without a PRD requirement, task lists are created conversationally. The developer
describes what they're building; the agent drafts a task list. The formatting strategy still applies — same
structure, likely fewer phases (possibly single-phase for very small work).

**File structure:**

```text
.arc/
  active/
    tasks.md              # The task list (singular)
    WORK-STATUS.md        # Current task pointer
    prd.md                # Optional — only if developer wants one
    notes.md              # Optional — thinking/planning notes
  reference/              # Constitutional docs, strategies
  system/                 # Agent config, workflows, settings
  user/{identity}/        # Session state (same as full ARC)
```

No `feature/`, `technical/`, `incidental/` subdirs. No backlog directory. No archive directory (completed
task lists can be deleted or kept in place — no archival ceremony).

**WORK-STATUS simplification:** Tracks less — no task list path (there's only one), no "Following Task
List" field. Possibly just: current task, last completed, blockers, next action.

**Branch model:** Full ARC's branch protection modes (full/partial) and category-based branching don't
apply. Simplified choice: work on main directly, or create a single branch per effort. No
strategy-work-organization dependency.

### Graduation / Downgrade Paths

**Lightweight → Full:** When a project outgrows lightweight mode — scope expands, multiple work streams
emerge, the single task list becomes unwieldy:

1. Introduce category subdirs in `active/` (move `tasks.md` → `active/feature/tasks-{name}.md`)
2. Install backlog infrastructure (ROADMAP, backlog files)
3. Switch configuration to full mode
4. Existing task list continues as-is — same format, new location
5. Future work follows the full pipeline (PRD → task generation → lifecycle)

**Key constraint:** Task list format must be identical in both modes. Graduation = relocation and
infrastructure addition, not content rewrite.

**Full → Lightweight:** For developers who find full ARC too heavy:

1. Only possible when a single work unit is active (or between work units)
2. Collapse directory structure — move active task list to `active/tasks.md`
3. Remove backlog infrastructure
4. Switch configuration

Also serves as an adoption on-ramp: try full ARC, find it heavy, dial back to what you actually use
rather than abandoning the framework entirely.

CLI support: `arc init --reconfigure` or a dedicated command handles mode transitions in both directions.

### Quick-Start / On-Ramp Angle

Lightweight mode could be the default first experience with ARC:

- `arc init` → lightweight mode. Hooks work, dev rules load, you can create a task list immediately
- Developer experiences the execution discipline without upfront ceremony
- When the project (or a new project) outgrows it, graduate to full

This reverses the current adoption model where you choose your PM mode before experiencing ARC. Instead:
start working, discover value, add structure when you need it.

---

## Mode 2: Local Mode (Secondary Deliverable — Defers Cleanly)

Implementation phases for local mode come after ARC Lite core is complete and validated. If the work unit
runs long or local mode proves more complex than estimated, the phase boundary is a natural cut point —
defer to a follow-up work unit with no abandoned half-implementations.

### Technical Approach

**The key insight: `.arc/` stays in the working tree.** Rather than relocating files outside the repo,
keep them exactly where agents, hooks, and workflows expect them — but exclude them from git tracking.

**Primary path — `.gitignore` addition:**

Adding `.arc/` to the project's `.gitignore` is the most robust approach. Tool-specific directory
exclusions are the most common category of `.gitignore` entry after build artifacts (`.vscode/`, `.idea/`,
`.direnv/`, `.env.local`). In most workplaces and OSS projects, a one-line addition for developer tooling
is unremarkable and routinely accepted. Persists across clones — set once, everyone inherits.

**Fallback — `.git/info/exclude`:**

For scenarios where the developer truly cannot modify any tracked file. Project-local untracked gitignore —
zero trace, but must be re-applied on each clone. The CLI automates this.

**Power-user — global gitignore (`core.excludesFile`):**

Add `.arc/` to `~/.gitignore_global`. Applies to all repos on the machine automatically. Zero trace, zero
per-repo setup, survives re-clone. Recommended for developers using local mode across multiple repos.

**Init flow:** `arc init --local` asks which exclusion method to use (`.gitignore` recommended, exclude
as fallback, global as power-user option).

### What Works, What Degrades, What's Lost

**Fully functional locally:**

- Task lists, session management, dev rules, strategies, methods, agent briefings
- Hooks (installed to `.git/hooks/`, local by nature — no trace)
- Process-task-loop, one-task-at-a-time discipline, quality gates
- Skills (`.claude/skills/` etc. are local by design — arc-resume, arc-handoff work unchanged)

**Degraded but workable:**

- **Commit context footers** — `Context: tasks-foo.md (Task 3.2)` references a file nobody else can see.
  Options: disable context footers (`commit.context_footer: disabled`), use plain-text descriptions
  (`Context: auth implementation`), or accept orphaned references. Conventional commit format itself
  (type(scope): description) is a widely-adopted standard and leaves no ARC fingerprint.
- **Agent/tool discoverability** — Agents can `Read`/`Grep`/`Glob` gitignored files by explicit path, so
  core ARC workflows (session-init, process-task-loop) work unchanged — they load files by hardcoded path.
  But UI features like `@` file mentions and editor search may not surface gitignored files by default.
  Configurable in most tools, but a friction point. CLI could mitigate with `arc open` commands.

**Lost entirely:**

- Version control of ARC files themselves (no git history for task lists, session state)
- Shared ARC state with team members (but this mode is inherently solo-ARC)
- ARC artifacts in PR diffs (this is the _goal_ — you don't want them visible)
- Atomic commits spanning ARC state + code changes (different tracking contexts)

**The trade-off to name:** Local mode trades _traceability_ (the historical record linking commits to
tasks) for _compatibility_ (using ARC anywhere). The discipline that produces well-scoped commits is
still there; the evidence of the methodology isn't.

### Backing Store Design

The durability concern should be first-class. Without version control of ARC files, losing them means
losing all tracking state. The CLI should make backup seamless once init is done.

**Baseline — export/import (zero infrastructure):**

- `arc export` dumps state to a portable archive
- `arc import` restores it
- Manual but simple — good for short-lived local use (weekend contribution, trial run)

**Upgrade — persistent sync (opt-in):**

- Developer configures a backing location (separate private repo, cloud directory, etc.)
- `arc sync` pushes current state; restoration is automatic on `arc init --local` if backing store exists
- Full git history of ARC state, completely disconnected from project repo

Baseline ships with local mode. Persistent sync is available but opt-in — the happy path (short-lived
local use) has zero friction.

### Upgrade Path (Local → Tracked)

Upgrading is frictionless because files are already in `.arc/` in the working tree:

1. Remove the exclusion (`.gitignore` line, `.git/info/exclude` entry, or global gitignore entry)
2. `git add .arc/`
3. Enable context footers in `arc-config.yml`
4. Going forward, commits get full traceability

No migration, no content rewrite, no file moves. Git history starts from the point of tracking, but
content is continuous. The graduation path composes: local ARC Lite → tracked ARC Lite → tracked Full ARC.
Each step adds structure; none requires rewriting what you have.

### Branching and Solo Context

Local mode is inherently solo from ARC's perspective — no team coordination features apply (no shared
WORK-STATUS, no `(@name)` ownership, no team branching). The developer is still on a team from git's
perspective — branching, merging, and PRs work normally.

**Key constraint — untracked files don't switch with branches.** `.arc/` persists across branch switches
because git doesn't manage it. This is the strongest argument for aligning local mode with ARC Lite:

- **ARC Lite (single task list):** You work on one thing at a time. Switching branches temporarily doesn't
  conflict — your task list is about your current work regardless of which branch you're on.
- **Full ARC (branch-specific work units):** Work units assume branch-aware state. An untracked task list
  about feature A persists when you switch to feature B's branch. This creates confusion.

**Recommendation:** Local mode pairs with Lite by default. Local + Full is not prohibited but not the
documented or supported path.

---

## Content Audit

Once the upstream methodology boundary is settled, audit all framework domains to classify each file and
concept by mode applicability. Uses the methodology/implementation classification from the Methodology
Maturation work unit as its foundation.

**Categories:**

- **Unchanged**: Works identically across all modes (e.g., hooks, commit format methods, most dev rules)
- **Modified**: Present but adapted (e.g., session-init with simpler discovery in Lite, context footer
  behavior in local mode, process-task-loop without work unit lifecycle references)
- **Excluded**: Not installed or loaded (e.g., strategy-work-organization in Lite, backlog files in Lite,
  activation/archival workflows in Lite)
- **Relocated**: Same content, different tracking (e.g., WORK-STATUS in local mode — same file, untracked)

Audit scope: strategy documents, workflow documents, constitutional documents (DEV-RULES sections
referencing work unit concepts), session-init document set, templates installed by `arc init`, and CLI
commands (available, hidden, or guarded by mode).

## Open Questions

### ARC Lite

1. **Naming**: "ARC Lite" is a working name. Does it accurately convey what this is? Other options:
   "ARC Solo," "ARC Quick," "ARC Core+" (core + task lists). The name should suggest "same discipline,
   less ceremony" rather than "lesser version."

2. **Atomic tasks**: In full ARC, atomic companion files and ATOMIC-INBOX handle small deferred work.
   Does Lite need these? Probably not the companion file (no work unit boundary), but ATOMIC-INBOX could
   still be useful for "I'll get to this later" capture.

3. **Session management weight**: Is the full session init/handoff ceremony appropriate for a 2-hour
   project? The document loading is the same, but SESSION-NOTES might be overkill for single-session work.
   Maybe session handoff is only triggered if the developer is actually leaving and coming back?

4. **Process-task-loop adjustments**: The loop references work unit concepts (atomic companion files,
   incidental work routing to backlog). These need conditional handling or lightweight alternatives.

5. **Strategy applicability mapping**: Which strategies apply in Lite? Core philosophy, context loading,
   session management, quality gates — yes. Work organization, backlog organization, work planning — no.
   Task list formatting — yes. Need a clear mapping.

6. **The "feels lighter" test**: Beyond structural differences, the day-to-day experience must feel
   measurably lighter. What does session init look like? What does "start working" look like? (Describe
   what you're building → task list → go?) What does "I'm done for now" look like?

### Local mode

7. **Context footer strategy**: Disable entirely, use plain-text descriptions, or make configurable?
   What does the commit-msg hook do in local mode?

8. **Backing store scope**: Does `arc export` capture everything in `.arc/`, or a curated subset?
   How large can `.arc/` get, and does that affect export viability?

9. **Agent discoverability mitigations**: Beyond CLI `arc open` commands, are there platform-specific
   solutions? (e.g., Claude Code settings, VS Code `search.useIgnoreFiles`, editor plugins)

### Cross-cutting

10. **Configuration mechanism**: Does the orthogonal-flags approach (mode emerges from flag combinations)
    scale better than named modes? How does the CLI present this to users without exposing combinatorial
    complexity?

## Research Findings

External research conducted 2026-04-01. Key findings organized by relevance to design decisions.

### Execution discipline is scale-independent (PSP evidence)

Humphrey's Personal Software Process research demonstrates that structured execution practices — task-level
discipline, commit standards, code review at ~200 LOC/hour — reduce defect density with statistical
significance, independent of project size. TSP implementations showed 94% on-time delivery at Microsoft
India. The discipline itself drives quality, not the planning ceremony around it. This validates the core
hypothesis: execution discipline (what lightweight mode keeps) is the high-value layer.

### Duration boundary: ~2 weeks

Research points to a natural breakpoint around project duration:

- **< 2 weeks with clear scope**: Planning pipeline overhead exceeds its value. Execution discipline
  alone is sufficient.
- **2-8 weeks**: Lightweight planning has value (optional PRD, some scope documentation).
- **> 8 weeks or high integration complexity**: Full planning pipeline justified.

### Ceremony proportionality: 15-20% threshold

Process overhead becomes counterproductive when ceremony time exceeds 15-20% of total project time. For a
2-hour project, even 20 minutes of setup is ~17% — right at the threshold. For a 2-week project, 30
minutes of ceremony is trivial (~0.6%). This suggests lightweight mode should target near-zero setup time.

### Graduation triggers should be signal-based

Rather than time-based thresholds, introduce planning ceremony when:

- Unplanned work emerges mid-project (scope wasn't as clear as assumed)
- Scope clarification starts consuming > 10% of available time
- Task count exceeds working memory (~3-5 concurrent concerns) without external tracking
- Multiple concurrent work streams emerge

These are more actionable than arbitrary duration cutoffs and could inform the graduation CLI experience.

### Solo developer adoption patterns

Practitioners consistently adopt: frequent commits (traceability + recovery), feature branches even for
solo work, automated testing, structured commit messages. Practitioners consistently abandon: planning
documents, formal review ceremonies, lifecycle phases. This directly matches the split between what
lightweight mode keeps and what it drops.

### Sources

- PSP empirical studies (Humphrey; IEEE TSE)
- Crystal agile methodology variants (Cockburn — methodology scaling by team/project size)
- Lean software development (waste identification in process overhead)
- PMI project complexity research (37 complexity indicators, 23 attributes)
- Solo developer workflow practitioner surveys (2024-2025)

---
