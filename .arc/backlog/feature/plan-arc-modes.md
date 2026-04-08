# Plan: ARC Operating Modes

**Purpose:** Establish ARC's mode architecture — alternative operating modes that expand where and how ARC
can be used. Two modes: a lightweight mode that preserves execution discipline without lifecycle ceremony,
and a local mode that enables ARC in repositories the developer doesn't control.

**Status:** Draft (design phase — Lite boundary resolved, details and local mode still open)
**Created:** 2026-04-01
**Origin:** Developer experience gaps at both ends of the adoption spectrum — small projects need less
ceremony, and constrained environments need ARC without repo footprint.

**Planning approach:** This work unit has a broadly known intent but largely unknown shape. Spend time here
in the plan stage doing research, evaluation, and design decisions so the PRD can be specific about
deliverables rather than deferring design to implementation. The plan doc is the primary working artifact
until design decisions are resolved.

**Upstream dependency:** Methodology Maturation (`prd-methodology-maturation.md`) — settles the
methodology/implementation boundary, language consistency, and content architecture that this work unit
builds on. **Completed** (2026-04-08, archived). The conditional content architecture analysis
(`analysis-conditional-content-architecture.md`) is a direct feed-forward deliverable from that work unit.

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

**Partially resolved.** ARC Lite is too foundational to be a config value — it determines what config
options even exist. The decision:

- **Lite vs Full is the first fork in `arc init`** — a top-level installation type, not a `pm.mode`
  value or a config setting in `arc-config.yml`. It's stored in the manifest's `install_config`
  (like `pm.mode` is now) and readable by the CLI for reconfigure/update operations.
- **Lite gates downstream prompts** — Lite skips the `pm.mode` prompt (implicitly `none`; `arc-in-git`
  is contradictory since Lite has no work unit stream for the planning module to manage). `team.mode`
  is likely also skipped — Lite is inherently solo from a methodology perspective.
- **Lite ships its own config template** — a reduced `arc-config.yml` containing only settings relevant
  to Lite, rather than conditionalizing the Full config. The CLI recipe already supports mode-conditional
  file installation.

**Still open:** Lite + `pm.mode: external` interaction. There's no reason you couldn't use Lite execution
discipline with an external tracker — but what concrete value does `external` mode provide in Lite, given
there's no integration workflow or lifecycle to hook into? May reduce to "different context footer
pattern" rather than a mode. Evaluate during detail design.

**Original options considered** (preserved for context):

1. New `pm.mode` value (e.g., `pm.mode: lite`) — rejected, stretches `pm.mode` semantics beyond PM
2. Top-level mode (e.g., `arc.mode: lite | standard`) — closest to the resolution, but expressed via
   CLI init flow rather than a config key
3. Profile concept — explored and rejected during earlier work (WU1); too many moving parts
4. Orthogonal flags — interesting but risks confusing combinations; the bounded Lite mode is better
   served by a single installation-type choice than emergent flag combinations

### Conditional Content Architecture

The upstream Methodology Maturation work unit produced `analysis-conditional-content-architecture.md` —
a complete inventory of all conditional mechanisms in ARC with scaling projections for Lite and local mode.

Key findings relevant to Lite mode design:

- **Current mechanisms scale.** The projected growth for Lite is 15-25 new conditionals across all
  mechanism types. No architectural change needed.
- **File exclusion absorbs the largest impact** — work unit lifecycle workflows simply aren't installed,
  avoiding dozens of potential in-prose conditionals.
- **Density thresholds** — session-init and process-task-loop may warrant Lite-specific template
  variants rather than layering conditionals into the Full versions. The analysis recommends variants
  when a document accumulates 5+ in-prose conditionals on the same axis.
- **Install-time resolution preferred** — where content can be decided at `arc init` time, use template
  blocks or recipe conditions rather than in-prose conditionals. Keeps rendered documents clean.

---

## Mode 1: ARC Lite (Primary Deliverable)

### Design Philosophy

**"Does less, just as reliably."**

ARC's strength is that you can trust it. The system has opinions, enforces them, and protects you from
common failure modes. Lite mode preserves this property — it does less than Full ARC, but everything it
does, it does with the same reliability and enforcement.

Lite is not "Full ARC with optional steps." Making features optional means the system has no opinions,
which means the system can't protect you. A toolkit that hopes you'll use it well is not ARC.

Lite is not for developers who want Full ARC's lifecycle management with less ceremony. If you need work
unit lifecycle (multiple concurrent work streams, formal verification, integration review, archival),
you need Full ARC. Lite doesn't try to serve that audience with a watered-down version.

**The target audience is projects you can hold in a single task list and scope brief.** When the project
outgrows that — and the system will tell you when it does — you graduate to Full.

### Core Boundary Hypothesis (Confirmed)

**The differentiator is work unit lifecycle presence/absence.**

Full ARC models projects as a stream of work units flowing through a lifecycle pipeline. Each work unit is
born (planning), activated, executed, verified, integrated, and archived. The project persists across many
work units.

ARC Lite models the project as a single bounded effort. There is no lifecycle pipeline — you plan scope,
create tasks, execute them, and ship. The project _is_ the work unit.

**Why this boundary, and not others:**

This decision was reached after exploring two alternatives that were ultimately rejected:

1. **"Required vs. available" model** — same capabilities as Full, but pipeline gates removed. Everything
   above a minimum floor is optional. Rejected because: making features optional means the system can't
   enforce quality. ARC's value comes from structural enforcement, not developer discipline. "Trust the
   dev, hope for the best" is not ARC. This model would serve a wider audience but guarantee nothing.

2. **"Simplified-but-complete workflow suite"** — Lite variants of every Full workflow (lite-activate,
   lite-integrate, lite-archive). Rejected because: every process needs its own Lite boundary definition,
   which is arbitrary and unmaintainable. You're defining "how much simpler?" for each workflow with no
   principled answer. The complexity shifts from the user to the framework maintainer.

The work unit lifecycle is the right structural cut because:

- It's a natural boundary — the conditional content architecture analysis confirms 85-90% of the
  framework has zero dependencies on work unit lifecycle workflows.
- It aligns with the value decomposition — execution discipline (scale-independent) vs. lifecycle
  ceremony (scale-dependent). Research confirms execution discipline drives quality independent of
  project size.
- It's clean — workflows are either installed or not. No parallel variants, no "simpler how?" questions.
- It matches the research boundary — ~2 weeks is where planning pipeline overhead begins to earn its
  keep. Below that, execution discipline alone is sufficient.

### Enforced Sequence

Lite has a defined, enforced sequence — not a pipeline with gates like Full, but a progression that the
system expects and the agent follows:

**Scope --> Tasks --> Execute --> Ship**

| Step        | Lite                                                                     | Full ARC equivalent                                |
| ----------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| **Scope**   | Required lightweight scope artifact — intent, approach, success criteria | Plan doc --> formal PRD (multi-section, detailed)  |
| **Tasks**   | Single task list generated from scope                                    | Task list generated from PRD, multi-phase common   |
| **Execute** | Same process-task-loop (identical)                                       | Same process-task-loop (identical)                 |
| **Ship**    | Run Tier 3 quality gates, review diff, merge/push                        | Verify --> Integrate --> Archive (3 formal phases) |

**Scope artifact:** ARC is spec-directed development — having zero planning artifacts means you're not
doing ARC. Lite requires a lightweight scope document before task creation. The vehicle is lighter than a
full PRD (fewer sections, faster to produce, purpose-built for Lite), but it's **required, not optional**.
You can write it in 5-10 minutes for a simple project. The system won't let you skip it.

Format and template details are open for later design. The important constraint is: it must capture enough
intent that scope drift can be detected (see guardrails below).

**Ship step:** Replaces Full ARC's three-phase ending (verification, integration, archival) with a
lightweight checklist — run quality gates, review your aggregate diff, merge or push. Not a ceremony,
but not nothing either. Details TBD.

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

**Scope artifact replaces PRD:** Lite's planning requirement is a lightweight scope document, not a full
PRD. The scope brief captures intent, approach, and success criteria — enough for the agent to generate
a task list and enough for guardrails to detect scope drift. A full PRD's detailed sections (background
research, technical constraints, verification criteria, etc.) are not required.

**Task list structure:** Single task list, likely simpler default structure. Fewer phases (possibly
single-phase default for very small projects). Same formatting conventions. Task list location is
`.arc/active/tasks.md` (singular, no category subdirs).

**File structure:**

```text
.arc/
  active/
    tasks.md              # The task list (singular)
    WORK-STATUS.md        # Current task pointer
    scope.md              # Lightweight scope artifact (name TBD)
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

**Absent workflows:** Work unit lifecycle workflows are not installed — activate-work-unit,
archive-work-unit, integrate-work-unit, clean-work-unit, verify-arc-integrity. Planning pipeline
workflows (activate-planning-branch, integrate-planning-branch) are also absent. These are excluded
via recipe conditions, not conditionals.

**Session init/handoff:** Simplified Lite variants — different document set, simpler discovery (no work
unit pipeline to assess), no lifecycle state tracking. Likely separate template files rather than
conditionals layered onto the Full versions.

### Guardrails and Graduation Triggers

Lite doesn't have lifecycle workflows to manage complexity — so it needs a different mechanism to keep
you honest. The system should detect when a project is outgrowing Lite and surface that clearly, without
hard-blocking the user.

**Observable signals that suggest graduation:**

- **Task list size** — past a threshold, a single evolving task list becomes unwieldy. Research suggests
  working memory is ~3-5 concurrent concerns.
- **Scope drift** — user describing work that doesn't connect back to the scope brief. The scope artifact
  exists precisely so this is detectable.
- **Multiple efforts emerging** — "let's also do X" where X is clearly a separate concern, not a task
  within the current scope.
- **Duration** — the ~2 week boundary from research. Session count is a rough proxy.
- **Branch pressure** — user wanting to separate work onto different branches, which signals multiple
  concurrent concerns that Lite isn't built to manage.

**Response model:** Not "you can't do that" — transparent, honest communication:

> This project is showing signs of outgrowing Lite mode — [specific signal]. Lite is designed for
> projects you can hold in a single task list and scope brief. Consider graduating to Full ARC
> (`arc init --reconfigure`) where you can manage separate work units with their own scope, task
> lists, and lifecycle. Continuing in Lite is fine, but the framework can't help you manage this
> complexity.

**Where guardrails live:**

- **Session init** — the natural checkpoint. Already reads the task list and WORK-STATUS. A Lite-specific
  assessment step checks for signals and surfaces them in the orientation summary. Persistent — it keeps
  noting the signal until the user graduates or the signal subsides.
- **Process-task-loop** — agent awareness during execution. If the user starts describing a second effort,
  the agent flags it in the moment rather than waiting for the next session.

Exact thresholds and language are detail-design concerns. The architectural decision is: Lite has active
guardrails that detect complexity growth and nudge toward graduation.

### Graduation / Downgrade Paths

**Lite --> Full:** When a project outgrows Lite — scope expands, multiple work streams emerge, the single
task list becomes unwieldy. Graduation should be feasible and relatively seamless from a user perspective.

Mechanically: `arc init --reconfigure`. The CLI already supports reconfigure with file add/remove based
on config deltas. Graduation would:

1. Switch installation type from Lite to Full
2. Install Full-specific workflows, config, and directory structure
3. Relocate the existing task list (e.g., `active/tasks.md` --> `active/feature/tasks-{name}.md`)
4. The scope brief becomes (or informs) a proper PRD
5. Install backlog infrastructure if pm.mode is set to arc-in-git
6. Future work follows the full pipeline

**Key constraint:** Task list format must be identical in both modes. Graduation is relocation and
infrastructure addition, not content rewrite.

**Full --> Lite:** For developers who find Full ARC too heavy:

1. Only possible when a single work unit is active (or between work units)
2. Collapse directory structure — move active task list to `active/tasks.md`
3. Remove lifecycle workflows and backlog infrastructure
4. Switch configuration

Also serves as an escape hatch: try Full ARC, find it heavy, dial back to what you actually use rather
than abandoning the framework entirely.

### Configuration and Installation

**Installation type, not config value.** Lite vs Full is the first fork in `arc init`:

```text
? Project mode
  > ARC Lite  - Execution discipline for focused projects
    Full ARC  - Complete lifecycle management
```

The choice is stored in the manifest (`install_config`), not in `arc-config.yml`. It determines what
files are installed, what config options are available, and what prompts appear during init.

**PM mode gating:** Lite + `arc-in-git` is contradictory (no work unit stream for the planning module to
manage). The `pm.mode` prompt is skipped in Lite; the effective mode is `none`. Lite + `external` is an
open question — there may be value (external ticket references in context footers) but no integration
workflow to hook into. Evaluate during detail design.

**Lite config template:** Lite ships a reduced `arc-config.yml` that omits irrelevant settings (`pm.mode`,
`team.mode`, and possibly others). This keeps the config honest about what Lite actually configures rather
than showing options that don't apply.

### Quick-Start / On-Ramp Angle

Lite mode could be the default first experience with ARC:

- `arc init` --> Lite mode. Hooks work, dev rules load, you can create a scope brief and task list
  immediately
- Developer experiences the execution discipline without upfront ceremony
- When the project (or a new project) outgrows it, graduate to Full

This reverses the current adoption model where you choose your complexity level before experiencing ARC.
Instead: start working, discover value, add structure when you need it.

**Open question:** Should Lite be the default, or should `arc init` always ask? The on-ramp argument
favors defaulting to Lite. The "informed choice" argument favors asking. The CLI's `--lite` and `--full`
flags provide explicit paths regardless.

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

### Upgrade Path (Local --> Tracked)

Upgrading is frictionless because files are already in `.arc/` in the working tree:

1. Remove the exclusion (`.gitignore` line, `.git/info/exclude` entry, or global gitignore entry)
2. `git add .arc/`
3. Enable context footers in `arc-config.yml`
4. Going forward, commits get full traceability

No migration, no content rewrite, no file moves. Git history starts from the point of tracking, but
content is continuous. The graduation path composes: local ARC Lite --> tracked ARC Lite --> tracked
Full ARC. Each step adds structure; none requires rewriting what you have.

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

Once detail design begins, audit all framework domains to classify each file and concept by mode
applicability. Uses the methodology/implementation classification from the Methodology Maturation work
unit and the conditional content analysis (`analysis-conditional-content-architecture.md`) as its
foundation.

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

---

## Open Questions

### ARC Lite

1. ~~**Naming**~~: **Resolved** — ARC Lite (will become ARCd Lite after rebrand).

2. **Scope artifact design**: What does the lightweight planning document look like? How is it different
   from a PRD — subset of the same template, or a distinct document? What's the minimum it must capture
   to satisfy spec-directed development and enable guardrail detection? Shape is right (required,
   lightweight, quick to produce); details need design.

3. **"Ship" step specifics**: How structured is the ship step? Literally "run Tier 3 gates and merge,"
   or does it include a lightweight pre-merge review? Research shows self-review catches significant
   issues at any scale — worth including even in Lite?

4. **Task list simplifications**: Does Lite default to single-phase task lists? Are multi-phase lists
   available but unusual, or actively discouraged? Does phase structure imply lifecycle complexity that
   Lite shouldn't have?

5. **Session management simplifications**: What does Lite session-init look like? The document loading is
   the same core set, but discovery and lifecycle assessment are absent. Is the full session handoff
   ceremony appropriate, or does Lite need a lighter version?

6. **Process-task-loop adjustments**: The loop references work unit concepts (atomic companion files,
   incidental work routing to backlog, coherent unit protocol). These need conditional handling or
   removal in Lite. Separate template variant or in-prose conditionals?

7. **Strategy applicability mapping**: Which strategies apply in Lite? Core philosophy, session
   operations, quality gates, task list formatting — yes. Work organization, planning module — no.
   Need a clear mapping for the content audit.

8. **Guardrail thresholds**: What are the specific trigger thresholds for graduation nudges? Task list
   size, session count, scope drift detection — these need calibration. Too sensitive is annoying;
   too lax defeats the purpose.

9. **Default mode question**: Should `arc init` default to Lite (on-ramp argument) or always ask
   (informed choice argument)? Affects adoption story.

10. **Lite + external PM**: Is there meaningful value in `pm.mode: external` within Lite? If so, what
    does it concretely provide? If not, Lite is always `pm.mode: none` implicitly.

### Local mode

11. **Context footer strategy**: Disable entirely, use plain-text descriptions, or make configurable?
    What does the commit-msg hook do in local mode?

12. **Backing store scope**: Does `arc export` capture everything in `.arc/`, or a curated subset?
    How large can `.arc/` get, and does that affect export viability?

13. **Agent discoverability mitigations**: Beyond CLI `arc open` commands, are there platform-specific
    solutions? (e.g., Claude Code settings, VS Code `search.useIgnoreFiles`, editor plugins)

### Cross-cutting

14. **Configuration mechanism for local mode**: Local mode is orthogonal to Lite/Full. How is it
    expressed? `arc init --local` flag, or a prompt? Can you combine `--local` with `--lite`?

15. **Initial setup workflow impact**: The current `01_verify-and-configure.md` and
    `02_define-project.md` assume Full ARC. Lite needs a dramatically faster setup path. This likely
    means Lite-specific setup workflows or a single combined workflow.

---

## Research Findings

External research conducted 2026-04-01. Key findings organized by relevance to design decisions.

### Execution discipline is scale-independent (PSP evidence)

Humphrey's Personal Software Process research demonstrates that structured execution practices — task-level
discipline, commit standards, code review at ~200 LOC/hour — reduce defect density with statistical
significance, independent of project size. TSP implementations showed 94% on-time delivery at Microsoft
India. The discipline itself drives quality, not the planning ceremony around it. This validates the core
hypothesis: execution discipline (what Lite keeps) is the high-value layer.

### Duration boundary: ~2 weeks

Research points to a natural breakpoint around project duration:

- **< 2 weeks with clear scope**: Planning pipeline overhead exceeds its value. Execution discipline
  alone is sufficient.
- **2-8 weeks**: Lightweight planning has value (optional PRD, some scope documentation).
- **> 8 weeks or high integration complexity**: Full planning pipeline justified.

### Ceremony proportionality: 15-20% threshold

Process overhead becomes counterproductive when ceremony time exceeds 15-20% of total project time. For a
2-hour project, even 20 minutes of setup is ~17% — right at the threshold. For a 2-week project, 30
minutes of ceremony is trivial (~0.6%). This suggests Lite should target near-zero setup time.

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
Lite keeps and what it drops.

### Sources

- PSP empirical studies (Humphrey; IEEE TSE)
- Crystal agile methodology variants (Cockburn — methodology scaling by team/project size)
- Lean software development (waste identification in process overhead)
- PMI project complexity research (37 complexity indicators, 23 attributes)
- Solo developer workflow practitioner surveys (2024-2025)

---
