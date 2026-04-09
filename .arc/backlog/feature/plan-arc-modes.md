# Plan: ARC Operating Modes

**Purpose:** Establish ARC's mode architecture — alternative operating modes that expand where and how ARC
can be used. Two modes: a lightweight mode that preserves execution discipline without lifecycle ceremony,
and a local mode that enables ARC in repositories the developer doesn't control.

**Status:** Draft (design phase — Lite, Local, and shift lifecycle resolved; pending pre-PRD audit)
**Created:** 2026-04-01
**Last Updated:** 2026-04-09
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

- **ARC Lite** — lightweight mode for small, bounded projects.
- **Local mode** — untracked ARC for constrained environments (repos the developer can't modify).
  Orthogonal to Lite/Full — any combination is valid.
- **Shift lifecycle** — cross-cutting mechanism for paused work units. Fills a team-mode gap in Full ARC
  while enabling Local Full viability.
- **Mode-aware config template scaffolding** — per-mode `ARCd-config.yml` template variants and
  forbidden-combinations enforcement.
- **Pre-PRD design investigations** — solo-dev blind spot audit must complete before PRD creation.

**Scope boundary (2026-04-09):** Configurability cleanup items that are mechanical and rebrand-adjacent
— the `pm.mode: arc-in-git` → `pm.mode: arc-pm` rename and the associated doc sweep — have been
extracted into the [ARCd Rebrand][arcd-rebrand] work unit. Both WUs benefit: the rebrand bundles
related config-file churn into one editorial pass, and the modes WU stays focused on modes-specific
design and implementation. Modes WU depends on the rebrand landing first (clean, renamed foundation
to build on). Revisit this boundary after the pre-PRD audit runs — if findings push scope beyond what's
manageable in a single modes WU, a further split along the dependency line (foundation → Lite+Local)
is available.

**Lite and Local are intertwined, not sequential.** Shared machinery — mode-aware config templates,
mode-aware `arc init` flow, mode-aware session-init, content audit, workflow adaptations, forbidden
combinations enforcement — dominates the unique per-mode work. Building them together avoids
retroactive refactoring and the risk of mode-specific decisions that turn out to conflict across
modes. This is not just "coherent to keep together" but "separating would be actively wasteful."

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

### Solo-Dev Blind Spot Audit (Gating Pre-PRD)

**This audit must complete before PRD creation.** Findings may reshape this work unit's scope or the
shift lifecycle design itself. Not an atomic task, not deferred to a follow-up WU — a gating
deliverable of this work unit's design phase.

**Motivation:** The framework has been developed under a solo-sequential lens (one WU at a time,
integrate fully before starting the next). The shift lifecycle emerged from realizing Full ARC lacks
a formal "paused awaiting external progress" state — a gap that's invisible in solo-sequential flow
but everyday reality in team and multi-stream work. If one such gap exists, others likely do. Better
to surface them before PRD lock-in than to discover them mid-implementation or post-release.

**Candidate areas to audit:**

1. **Integration phase latency** — the gap between "ready to merge" and "merged" can be days to
   weeks. Does ARC model this formally, or is the developer implicitly "stuck in integration
   workflow" until someone clicks approve?
2. **Cross-team dependencies** — "blocked on another team's API change" is a common real state.
   Does ARC have language beyond freeform `Blockers:` text?
3. **Concurrent developer-pair support in team mode** — team mode exists, but do the workflows
   (session-init, integration, archival) actually compose when two developers each have their own
   in-progress WU simultaneously with shared backing material (backlog, ROADMAP)?
4. **Sprint / iteration boundaries** — do WUs align with sprints, or crosscut them? If they
   crosscut, what does status reporting at sprint boundaries look like?
5. **Hotfix protocol** — is there a formal "drop current WU briefly for urgent fix" workflow,
   or is it ad hoc? Does shift apply here, or is hotfix small enough to stay branch-only?
6. **Stakeholder review cycles** — PRD signoff, design review, architecture review. Are these
   modeled anywhere, or implicit?
7. **Long-running WUs spanning multiple reviews** — is there any model for "WU paused at phase
   boundary awaiting checkpoint review, then resumed"?
8. **Review feedback loops** — when a PR gets substantial review feedback requiring rework, what
   state does the WU occupy? Back to in-progress? Some intermediate "revising" state?

**Expected outputs:**

- Identified gaps, each classified by severity and by whether this WU can/should address it
- For gaps in scope: proposed design extensions or refinements to the shift lifecycle, Local mode,
  or Lite treatment
- For gaps out of scope: captured as follow-up work unit candidates (roadmap additions)
- Confirmation or revision of the shift lifecycle design based on audit findings

**How the audit flows into PRD:** Any gaps this WU absorbs become additional deliverables in the
PRD scope. Any gaps deferred become explicit "out of scope" entries in the PRD with rationale.
The PRD cannot be written until the audit has run — the audit determines what the PRD covers.

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

## Mode 2: Local Mode

**Equal-weight deliverable — scoped in alongside ARC Lite.**

### Purpose

Local mode enables ARC in repositories where the developer doesn't control the tracked space — work
projects with strict tooling policies, OSS contributions where personal tooling doesn't belong, trial
runs on repos the developer hasn't committed to adopting ARC in yet. The developer gets ARC's execution
discipline without the repo footprint.

Local mode is orthogonal to Lite/Full: any combination of (Lite, Full) × (tracked, local) is valid.
Each combination serves a different adoption context.

### Design Philosophy

**"Does less only where it has to, just as reliably."** Same framing as Lite. Local mode sacrifices only
what the constraint (no repo footprint) literally forces. Everything else — execution discipline, quality
gates, lifecycle workflows, hooks, session management — works the same way, by the same rules, with the
same reliability. Where Local mode appears to "degrade" something, we interrogate that degradation and
either find a mechanism that preserves reliability or honestly name it as an unavoidable cost.

### Technical Approach

**The core insight: `.arc/` stays in the working tree.** Rather than relocating files outside the repo,
keep them exactly where agents, hooks, and workflows expect them — but exclude them from git tracking.
Agents can read gitignored files by explicit path, hooks live in `.git/hooks/` already, and workflows
load files by hardcoded paths, so nothing in ARC's core machinery needs to change.

### Exclusion Mechanism

Research into industry norms (see [Research Findings](#research-findings) below) established that personal
tooling entries in project-level `.gitignore` are **not** the norm for methodology tools — the prevailing
guidance is "shared team patterns go in project `.gitignore`, user-specific tooling goes in
`~/.gitignore_global`." Global gitignore is unusable as a default (machine-wide blast radius — adding
`.arc/` there would break tracked ARC on every other repo on the same machine). That leaves
`.git/info/exclude` as the primary path, with the tracked `.gitignore` line as an opt-in for teams that
explicitly welcome tool-specific entries.

**Primary: `.git/info/exclude` (automated via CLI)**

- Repo-local, untracked gitignore. Zero footprint in the tracked repo.
- Aligns with the industry norm for per-user tooling (personal, not shared).
- Survives the lifetime of the clone, lost on re-clone (see below).
- CLI automates setup and re-clone recovery.

**Secondary: tracked `.gitignore` line (opt-in)**

- A single line — `.arc/` with a comment — added to the project's tracked `.gitignore`.
- For teams where per-developer tool entries are explicitly welcome.
- Survives re-clones naturally (tracked content).
- Selected via `arc init --local --shared-gitignore` (or equivalent flag); not the default.

**Dropped: global gitignore (`~/.gitignore_global` / `core.excludesFile`)**

- Machine-wide blast radius — would force every `.arc/` on the machine into untracked state.
- Breaks coexistence with tracked ARC installs on other projects.
- Not offered as an option.

**Init flow:** By default, `arc init --local` sets up `.git/info/exclude`. If the developer passes
`--shared-gitignore`, the CLI prompts to add the tracked line (with preview) and proceeds with the
`.gitignore` path. The developer doesn't pick between invisible and durable on taste — they pick based
on environmental constraint, and the CLI guides them.

### Re-Clone UX

`.git/info/exclude` is reset on re-clone (confirmed — no native git mechanism preserves per-repo excludes
across clones; see Research Findings). Without automation this would be friction enough to undermine
Local mode. **The backing store (see next subsection) doubles as the re-clone detection signal**,
making recovery a one-prompt operation.

**Project identity** — stable across clones via git remote URL (primary) or first-commit hash (fallback
for remoteless repos). The CLI computes a project ID from these, which keys the backing store location
and persists across clones of the same repo.

**Re-clone detection flow:**

When any `arc` command runs in a repo where:

1. The computed project ID matches an existing backing store location, AND
2. The `.arc/` directory is absent or empty, AND
3. `.git/info/exclude` lacks the expected `.arc/` entry

...ARC concludes this is a fresh clone of a previously-initialized Local mode repo and offers restoration.
If all three signals align unambiguously, restoration can proceed with a single confirmation — no need
for the developer to remember the setup command exists.

**Recovery steps:**

1. Re-populate `.git/info/exclude` with the `.arc/` entry (or restore the tracked `.gitignore` line if
   that was the original setup)
2. Pull backing store contents into `.arc/`
3. Re-install hooks (local by nature; re-applied)
4. Report restoration complete; developer resumes work

### Backing Store

**Required, not opt-in.** Losing local ARC state is catastrophic — tracking spans weeks of work, and
opt-in backup would mean any developer who doesn't read carefully loses everything on disk failure.
Reliability requires this to be on by default with zero configuration friction.

**Baseline — auto-created local bare repo:**

- Location: `~/.arc-state/{project-id}.git` (or platform-equivalent — details in implementation)
- Created automatically during `arc init --local`
- Populated from `.arc/` on each handoff via the transparent portability redirect (see below)
- Full git history of ARC state, independent of the project repo
- Developer does nothing — zero configuration, zero maintenance

**Durability:** Survives project repo re-clone, accidental `rm -rf .arc/`, branch switching. Lost only
if the developer loses their home directory (at which point much else is also gone).

**Optional — remote backing store (opt-in, for cross-machine portability):**

- Developer configures a git remote on the backing store (private GitHub repo, GitLab project,
  self-hosted server)
- `arc sync` (or handoff) pushes local backing → remote
- `arc init --local` on another machine detects the backing store via project ID, offers to bootstrap
  from the remote
- Cross-machine use is a one-time setup task, not automatic
- For developers who don't need cross-machine sync, zero extra steps

**What the backing store contains:** Full snapshot of `.arc/` — including `active/`, `user/{identity}/`,
`backlog/` (if `pm.mode` is `arc-pm`), archived work, and configuration. Backup is comprehensive;
restoration is exact.

### Single-Active-Unit Invariant

Local Full (and Local Lite, trivially) is constrained to a single in-progress work unit at a time. The
invariant reflects a structural fact: without git tracking, untracked files don't switch with branches,
so tracked Full's "work units live with their branches" model can't carry over. Having multiple parallel
in-progress WUs in Local mode would produce permanent state/branch mismatch confusion.

**But ARC tracks work units, not branches.** This distinction is essential. Single-active is about ARC's
formal attention, not about what the developer can do in git. The developer can freely:

- Branch, merge, switch, rebase, stack — any git pattern works
- Visit other branches for reviews, hotfixes, drive-by fixes without ARC caring
- Spin up side branches for small fixes that don't warrant ARC ceremony
- Use worktrees, cherry-picks, any advanced git pattern

What the developer cannot do under single-active alone: have two work units both formally tracked by
ARC (task lists, lifecycle, scope) simultaneously in in-progress state.

### Shift Lifecycle Makes Local Full Viable

The single-active invariant on its own would be too restrictive for the motivating Local mode use case
(long-running work project where you can't install ARC to the repo). It would force developers into
"archive prematurely to switch contexts" or "handle side work without ARC tracking" in situations where
those are genuinely wrong answers.

The [shift lifecycle](#shift-lifecycle) resolves this. With shift, single-active becomes "one
_in-progress_ WU at a time, plus any number of _paused_ WUs." The developer can pause feature-X when
it hits review, activate the auth refactor incidental WU, complete it, shift back to feature-X.
Real-world multi-stream work flows naturally.

Shift is not a Local-mode-specific feature — it fills a parallel gap in Full ARC that was previously
masked by implicit branch-switching. But Local mode is where the gap is unmistakable. Both modes get
shift from the same implementation.

### Scenario Walk-Through

Real scenarios tested against the Local Full + shift model:

**Scenario 1 — Mid-WU, unrelated bug in another file.**

Local Full: fix in passing (commit to current WU branch), or defer via existing issue-triage pathways.
No shift needed. Identical to tracked Full.

**Scenario 2 — CI breaks, need hotfix while mid-WU.**

Local Full: switch to hotfix branch, fix, merge, return. ARC state stays on feature-X. Orientation
reports "on hotfix branch, active focus feature-X" — visibly mismatched but correct. No ARC
intervention needed. Identical to tracked Full.

**Scenario 3 — Stacked development (feature-B built on feature-A).**

Local Full: a stack is typically one work unit with multiple task list phases/branches. Works
identically in both modes.

**Scenario 4 — Mid-WU discovery of substantial unplanned work that blocks progress.**

Example: "feature-X can't reach Phase 4 until we refactor auth middleware, which is itself a multi-phase
effort."

Local Full: `arc-shift` feature-X (pause, reason "blocked on auth refactor"). Activate the auth refactor
as an incidental work unit. Complete it. Archive it. `arc-shift` back to feature-X. Phase 4 can now
proceed. This is the "incidental work unit" pattern from tracked Full, preserved intact in Local Full
via shift.

**Scenario 5 — Feature-X is waiting on code review (days to a week). Developer wants to start feature-Y.**

Local Full: `arc-shift` feature-X (pause, reason "awaiting review from Alice, expected ~Thursday").
Activate feature-Y. When review lands, `arc-shift` back. Feature-Y resumes later. This is the scenario
that single-active alone couldn't handle. Shift resolves it cleanly.

### What Changes vs. Tracked Full

**Changed:**

- Exclusion mechanism (`.git/info/exclude` or `.gitignore` line) and init flow
- Backing store required for durability
- Context footer format — hook enforces descriptive freeform pattern (`Context: <description>`) instead
  of task-list references, leaving zero ARC fingerprint in commit history
- Portability layer commands (`arc user save/load/push/pull`, `arc sync`) transparently redirected to
  backing store semantics
- Role concept dropped (Local drops role regardless of Lite/Full — see
  [Configurability Architecture Cleanup](#configurability-architecture-cleanup))
- `team.mode` forced to `false` (solo-ARC by definition)
- `pm.mode` either `arc-pm` (ARC's built-in PM, artifacts untracked like everything else) or
  `external` / `none`

**Unchanged:**

- All constitutional docs, strategies, methods, workflows
- Hooks (already local in nature)
- Skills (already local in nature)
- Task lists, session state files, work unit directory structure
- Process-task-loop, quality gates, mandatory stops
- Shift lifecycle (same workflow, mode-aware only at the persist step)
- Upgrade path to tracked — remove exclusion, `git add .arc/`, switch context footer format, done

### Upgrade Path (Local → Tracked)

Frictionless because files already live in `.arc/` in the working tree:

1. Remove the exclusion (`.git/info/exclude` entry or `.gitignore` line)
2. `git add .arc/`
3. Switch context footer format in `arc-config.yml` (or remove the local-mode override)
4. Commit — standard tracked content from this point forward

No migration, no content rewrite, no file moves. Git history starts from the tracking commit; content
is continuous. The composition chain remains intact: local Lite → tracked Lite → tracked Full, each
step adds structure without rewriting what exists.

### Agent and Editor Discoverability

Editor UI features that respect gitignore rules (e.g., `@` file mentions, default editor search) will
hide `.arc/` contents from the developer's interactive surface. This affects the human's UX, not ARC's
reliability — agents load files by explicit path and workflows reference hardcoded paths, so core ARC
operations work unchanged.

**Mitigation posture:** document the friction honestly, provide `arc open <path>` CLI helpers for
direct access, and accept that we can't fix editor UI from outside the editor. Some editors expose
configuration to include gitignored files in search (`search.useIgnoreFiles: false` in VS Code, etc.);
Local mode docs mention these as developer-side options without ARC modifying editor settings.

This is a "does less where it has to" concession. The reliability of ARC's operation is not affected,
only the ergonomics of ad-hoc human navigation.

---

## Shift Lifecycle

**Cross-cutting deliverable — applies to all ARC modes.**

### The Gap This Fills

Work units don't always move from activation through completion without interruption. Real team
workflows regularly park a WU mid-stream while waiting on code review, stakeholder feedback, blocking
work from another team, or an external dependency. Meanwhile the developer is often ready to start the
next thing.

Full ARC today has no formal model for this state. The implicit workaround — leaving the WU "active"
on its branch while starting a new feature branch for the next WU — works mechanically in tracked mode
(git swaps files per branch) but creates a stale-state problem: WORK-STATUS on branch A says "finish
integration, Next Action X" when you've actually moved on. Session-init reports misleading state.
Nothing formally captures why the WU is paused or when it's expected to resume.

This gap is largely invisible in solo-sequential workflows (complete one WU, archive, start next) but
is everyday reality in team contexts and multi-stream work. Local mode surfaces it hard — without the
branch-swap implicit mechanism to hide the problem, Local Full can't support "waiting on review"
at all without a formal pause.

### Design Philosophy

**Metadata-in-place, not file relocation.** A paused WU stays where it is. Its files don't move.
WORK-STATUS tracks the state change, the WU's own status header reflects the new state, and session-init
reads both. Rolling back a pause is a metadata flip, not a filesystem operation.

**One user-facing skill, unified workflow.** The skill is `arc-shift`, the workflow is
`shift-work-unit.md`. "Shift" reads naturally for all three transitions:

- "Let's shift away from this while we wait on review" — pure pause
- "Let's shift to feature-Y" — rotate (pause current, resume target)
- "Let's shift back to feature-X" — resume (when no in-progress WU, or suspend current first)

The workflow reads current WORK-STATUS state and the target argument (if any), determines which
transition this is, and executes accordingly.

**Works identically in Full and Local, with only the persist step differing.** The metadata updates,
document status headers, and WORK-STATUS changes are mode-agnostic. The final "persist" step commits
in tracked Full and syncs the backing store in Local. Developers reading the workflow see one
description, not two.

### State Model

A work unit in the pipeline can be in one of these states:

| State         | Location   | Meaning                             |
| ------------- | ---------- | ----------------------------------- |
| `planned`     | `backlog/` | Scoped but not yet activated        |
| `in-progress` | `active/`  | Currently being worked on           |
| `paused`      | `active/`  | In flight but temporarily set aside |
| `archived`    | archive    | Completed (or abandoned), terminal  |

The critical observation: `active/` holds both `in-progress` and `paused` WUs. Directory membership
means "in flight, between backlog and archive." Per-WU state is metadata, not location.

### WORK-STATUS as In-Flight Registry

WORK-STATUS.md gains an "In Flight" section that serves as the authoritative registry of WUs in
`active/` and their current states. Sketch:

```markdown
## In Flight

- **feature-x** → `feature/tasks-feature-x.md`
    - State: in-progress
    - Current Task: Task 3.2 — Implement token validation
    - Started: 2026-04-01
- **feature-y** → `feature/tasks-feature-y.md`
    - State: paused 2026-04-07
    - Reason: Awaiting code review from Alice, expected ~2026-04-09
    - Last Task: Task 5.3 — Phase 2 integration
- **incidental-auth-refactor** → `incidental/tasks-auth-refactor.md`
    - State: paused 2026-04-05
    - Reason: Blocked by decision on session token approach; paused to complete feature-x first
    - Last Task: Task 1.2 — Assess middleware coupling

## Active Focus

**feature-x** · Task 3.2 · on branch `feature-x`

## Next Action

Resume validation implementation in feature-x Task 3.2
```

The "Active Focus" section is the single "where you are right now" pointer. The "In Flight" section
is the multi-WU registry. Session-init reads both to populate the orientation summary.

**Template redesign scope.** The current WORK-STATUS template is shaped around a single-WU assumption
(flat Branch / Task List / Next Task fields). The multi-WU shape replaces that top-level structure
with the In Flight registry + Active Focus pattern. Backward compatibility for the single-WU common
case is preserved (In Flight contains one entry, Active Focus points to it). Detail design of the
template is implementation-time work — the shape above is illustrative, not final.

### Document Status Headers

PRDs and task lists carry status headers today (e.g., `Status: In Progress`). Shift lifecycle adds
`paused` as a valid status value, consistent with the existing vocabulary. The shift workflow updates
these in sync with WORK-STATUS — single conceptual source of truth, multiple in-document reflections
for local discoverability.

Scope:

- **PRD status header** — updated on shift transitions
- **Task list status header** — updated on shift transitions
- **Supplementary docs** (`atomic-*.md`, `notes-*.md`) — deferred to implementation. Gut-level: skip
  them, they're supplementary and the churn isn't worth it. Revisit if implementation surfaces a reason.

### Workflow Shape

`shift-work-unit.md` encodes the three transitions via state-driven branching.

**Inputs:** Current WORK-STATUS state, optional target WU name, optional reason string.

**Transition detection:**

- Active Focus exists, no target → **pure pause** (pause current)
- Active Focus exists, target is in In Flight as paused → **rotate** (pause current, resume target)
- Active Focus exists, target is new or in backlog → **shift-with-activation** (pause current, hand off
  to activate-work-unit workflow for the target)
- No Active Focus, target exists as paused → **pure resume** (resume target)
- No Active Focus, no target → invalid, report and exit

**Uncommitted work handling:**

Before any pause, the workflow detects uncommitted changes in the working tree. When found, it surfaces
the state to the user with a recommended default of **commit first** (clean pause is the reliable
default), but allows override:

1. **Commit first (recommended)** — workflow prompts for commit message or invokes arc-commit
2. **Stash** — `git stash push` with a descriptive message tied to the WU
3. **Leave as-is** — pause proceeds, dirty state remains in working tree, noted in WORK-STATUS entry

The workflow presents commit as the default; the user is in charge of the final choice. This preserves
reliability bias without being dogmatic.

**State-update steps (common to all transitions):**

1. Gather reason and context (ask if not supplied and transition needs one)
2. Optionally snapshot SESSION-NOTES to the WU's directory as preserved context
3. Update WORK-STATUS In Flight registry (state, reason, timestamp, last task)
4. Update Active Focus pointer (clear, set, or swap depending on transition)
5. Update WU document status headers (PRD, task list)
6. Persist — commit in tracked Full (via arc-commit invocation or inline commit step), backing store
   sync in Local

**Resume-side additions:**

On resume transitions, the workflow additionally:

1. Surfaces the preserved SESSION-NOTES snapshot (if any) as recovery context
2. Checks branch alignment in tracked Full, suggests the switch if needed
3. Reports how long the WU was paused (for time-sensitivity awareness — assumptions may be stale)

### Session-Init Integration

Orientation reports paused WUs in the state summary without reading their content. Sketch:

> **ARC session initialized** · `main` · clean · 2 paused WUs
>
> **Active work state:**
>
> - **Active**: feature-x (Task 3.2, on branch feature-x)
> - **Paused**: feature-y (awaiting review, paused 2d ago), incidental-auth-refactor (paused 4d ago)
> - **Blockers**: none

Detail reads (a paused WU's task list content) happen only when the developer shifts to one.
Session-init stays cheap.

**Growth nudge:** If the count of paused WUs passes ~3, the orientation summary surfaces a gentle
triage prompt: "3 paused WUs — consider `arc status --paused` to review whether any should be
archived." Not blocking, just visibility.

### Skill Shape

`arc-shift` is a thin skill invoking the workflow, following the same pattern as arc-commit →
prepare-commits. Skill content is minimal (load workflow, follow steps in order). The workflow
carries all the logic.

User invocations that naturally route through arc-shift:

- "Let's shift this aside while we wait on review"
- "Shift to feature-y"
- "Let's shift back to feature-x now that review landed"
- "Shift this and start the auth refactor incidental WU"

### Why This Lives in Its Own Cross-Cutting Section

Shift was initially scoped as a Local-mode necessity — needed because Local Full's single-active
invariant would be too restrictive without it. But the gap it fills exists in tracked Full too, where
it's currently masked by implicit branch-switching. Making it explicit gives tracked Full something
it was missing: a formal model for "paused awaiting external progress" that the framework can reason
about, report on, and help manage.

This is why shift lives in its own cross-cutting section rather than inside the Local mode treatment.
It's universal.

### Out of Scope (For This Plan Doc Iteration)

- **Multi-paused limit policy** — hard cap, soft nudge, or configurable? Leaning toward soft nudge at
  ~3 with no hard cap, but this is detail design.
- **Pause-reason taxonomy** — should reasons be freeform, or structured with categories (`awaiting-review`
  / `blocked-external` / `deferred` / `other`)? Freeform is simpler; structured enables better
  reporting. Revisit during detail design.
- **Cross-branch paused visibility in tracked Full** — is branch-local paused state sufficient, or
  should there be a way to see "all paused WUs across all branches" from one location? Lean
  branch-local for simplicity, revisit if team mode dogfooding says otherwise.
- **Expected-resume-date field** — useful context ("expected back Thursday") but potentially stale.
  Consider during detail design.

---

## Mode Combinations

**The four valid combinations form a 2×2 grid.** Lite/Full and Tracked/Local are orthogonal axes —
any combination is valid and each serves a distinct adoption context.

|          | Tracked                        | Local      |
| -------- | ------------------------------ | ---------- |
| **Full** | Full+tracked (current default) | Full+local |
| **Lite** | Lite+tracked                   | Lite+local |

### Collision-Free Composition

The two axes cut on orthogonal concerns:

- **Lite/Full axis** governs lifecycle ceremony. Lite removes the work unit lifecycle pipeline;
  Full keeps it. This axis does not touch git visibility or role.
- **Tracked/Local axis** governs git visibility and the team-collaboration surface. Tracked keeps
  role and commits ARC state to the repo; Local drops role and keeps `.arc/` untracked. This axis
  does not touch lifecycle ceremony.

Because the axes cut on different concerns, the four combinations compose without conflict. Each
mode layer contributes its own deletions and overrides independently; when combined, both layers
apply. Worked examples:

- **Full+tracked** → baseline, nothing removed
- **Full+local** → Local layer drops role, sets up exclusion + backing store; lifecycle intact
- **Lite+tracked** → Lite layer removes lifecycle, keeps role (OSS solo-dev scenario); tracked intact
- **Lite+local** → both layers apply: no lifecycle, no role, `.arc/` untracked, backing store required

### Walk-Through: Lite+Local

This combination wasn't explicitly designed — it falls out of the orthogonal axes. Walking through
what it actually looks like:

- `.arc/` exists in working tree, untracked via `.git/info/exclude`
- Contains: `scope.md` (or equivalent scope artifact), `active/tasks.md`, `active/WORK-STATUS.md`,
  `user/{identity}/SESSION-NOTES.md`, plus reference/system/constitutional content
- No `backlog/`, no `suspended/`, no `feature/` subdirs, no lifecycle workflows (Lite's contribution)
- No `arc.role` in config, Local-mode context footer pattern, role resolution skipped (Local's
  contribution)
- Backing store at `~/.arc-state/{project-id}.git` captures all of the above
- Hooks enforce the standard quality gates and the Local-mode context footer pattern
- Session-init loads the Lite document set, skips lifecycle discovery, reports on the single effort
- Single-active-unit invariant is trivially satisfied — Lite is already single-effort by design
- Shift lifecycle is not present — there are no parallel work units to shift between

This is arguably the **smallest, most focused ARC install possible:** execution discipline,
spec-directed development (via scope brief), session continuity, quality gates, everything backed
up reliably, zero footprint in the project repo. It's potentially the best "try ARC in five minutes
on a work project" story — and maybe the most-recommended first install for a large audience.

### Graduation Grid

Graduation happens along either axis:

```text
Lite+tracked ──────▶ Full+tracked
     ▲                    ▲
     │                    │
Lite+local  ──────▶ Full+local
```

**Four axis movements:**

1. **Lite → Full (tracked):** `arc init --reconfigure` adds work unit lifecycle, relocates task
   list into `active/feature/`, scope brief becomes (or informs) a PRD, backlog infrastructure
   installed if `pm.mode: arc-pm` selected
2. **Local → tracked (Lite variant):** remove exclusion entry, `git add .arc/`, standard commit;
   role concept becomes available (reconfigure may prompt for it)
3. **Local → tracked (Full variant):** same as above, plus lifecycle artifacts already present
4. **Lite → Full (local variant):** reconfigure adds lifecycle workflows while keeping exclusion
   and backing store

Diagonal graduations (e.g., Lite+local → Full+tracked) are compositions of two axis moves, done
sequentially, not as a single composite operation. The CLI does not ship a diagonal-graduation
shortcut; each axis movement is its own `reconfigure` invocation with its own confirmation step.

**Lite+local as a starting point:** Because graduation is reversible along each axis independently,
starting in Lite+local commits the developer to nothing. If the project grows, graduate along
whichever axis is relevant (tracking first if the team accepts it, lifecycle first if scope grows).
If the project stays small and local-only, no graduation needed.

### Init Flow Implications

`arc init` asks two independent questions in sequence:

1. **Install type:** Lite or Full? (structural choice — lifecycle or not)
2. **Tracking:** Tracked or Local? (visibility choice — in-repo or personal)

Order matters only modestly — install type first establishes the bigger structural decision; tracking
is then applied as an overlay. The questions are independent: no combination is invalid, no earlier
answer closes off a later choice.

Flags for non-interactive use:

- `--lite` / `--full` (default: ask)
- `--local` / `--tracked` (default: tracked, the common case)
- `--shared-gitignore` (Local only, opt-in for teams that welcome tool-specific tracked entries)

---

## Configurability Architecture Cleanup

**In-scope for modes WU.** Covers the mode-specific config surface and orthogonal-axis enforcement.
The mechanical `pm.mode: arc-in-git` → `pm.mode: arc-pm` rename and its associated doc sweep have
been extracted into the [ARCd Rebrand][arcd-rebrand] work unit — they compose naturally with the
rebrand's own config file rename (`arc-config.yml` → `ARCd-config.yml`) and content sweep, and
modes WU depends on landing the renamed foundation first. This section covers what remains in
modes WU.

### Mode-Aware Config Template Mechanism

Each mode axis (Lite/Full, Tracked/Local) contributes its own deletions and overrides to the
`ARCd-config.yml` template. The two axes compose orthogonally: each layer applies independently,
and when combined, both layers' changes are applied.

**Lite layer (contributes when install type is Lite):**

- Omits `pm.mode: arc-pm` option (Lite has no work unit stream for the planning module)
- Forces `team.mode: false` (Lite is solo-bounded methodology)
- Does not touch `arc.role` (neutral on the tracked/local axis)
- Omits lifecycle-related settings if any exist

**Local layer (contributes when install type is Local):**

- Omits `arc.role` (role is a Tracked concept — see below)
- Forces `team.mode: false` (Local is solo-ARC by definition)
- Redirects `user.sync_push` semantics (controls backing store push behavior instead of git notes push)
- Customizes `commit.context_footer` to enforce descriptive freeform pattern (see below)
- Does not touch lifecycle settings (neutral on the lite/full axis)

**Combining layers:** When a developer picks Lite+local, both layers apply. Each layer's concerns
are independent, so the combination is just the union of their changes. No special-case logic for
the combination itself — the mode-template machinery supports N mode axes without needing to
enumerate every combination.

### Role Is a Tracked Concept

The role values (`maintainer` / `contributor` from ADR-014) exist to differentiate ARC artifact
ownership from code contribution on projects where `.arc/` is visible in the tracked repo. Whenever
ARC is tracked, teammates or external contributors can see the planning artifacts, and the
maintainer/contributor distinction has meaning — the maintainer owns them, contributors avoid
touching them and use a different commit footer.

**Role applies in:**

- **Full+tracked** — original case. Maintainer owns backlog, PRDs, task lists; contributors submit
  code without touching ARC planning artifacts.
- **Lite+tracked** — OSS solo-developed scenario. The solo maintainer owns the scope brief and
  single task list; external contributors submit patches without touching them. Every
  contributor-role concern applies unchanged: reduced session-init document set, `contribution`
  commit footer, contributor-protected-paths warning for `active/`.

**Role is dropped in:**

- **Full+local** — ARC isn't visible in the tracked repo, so there's no visible artifact ownership
  to differentiate around.
- **Lite+local** — same reason.

**The rule:** role is meaningful when `.arc/` is tracked in the repo, regardless of Lite vs Full.
When tracked, others can see ARC content, so the maintainer/contributor distinction matters. When
untracked (Local mode), nobody else sees ARC at all, and the distinction is moot.

**Implementation:** The Local layer of the config template omits `arc.role`. The Lite layer does
not touch it — Lite keeps role intact when the install is tracked. In Local mode, session-init
skips role resolution and workflows that branch on role default to the non-contributor path.

### Context Footer Format (Local Mode)

Local mode enforces a descriptive freeform footer via the commit-msg hook, with pattern distinct
from tracked mode's task-reference format. This preserves the discipline (every commit explains
its context) in a form that leaves zero ARC fingerprint in the commit history visible to teammates.

Examples of valid Local mode footers:

- `Context: auth middleware refactor`
- `Context: token validation cleanup`
- `Context: investigating CORS handling`

The hook runs locally in the developer's clone, so ARC can enforce this format without teammates
seeing any ARC-specific content. The form is not configurable by the user within Local mode — it's
a mode-level enforcement.

### Portability Layer Redirect (Transparent)

The `arc user save/load/push/pull` and `arc sync` commands target `refs/notes/arc/user/{identity}`
in tracked mode and the backing store in Local mode. The developer never writes different commands
— the CLI reads install mode from the manifest and does the right thing. Docs for Local mode include
a brief "under the hood: where your state lives" section for debugging, but daily use is mode-agnostic.

### Forbidden Combinations

- **Local + `team.mode: true`** — forbidden. Local is solo-ARC by definition; team mode requires
  shared state that Local's exclusion mechanism prevents.
- **Local + `arc.role` set to any value** — forbidden. Role is a tracked concept; Local installs
  omit the setting entirely. CLI refuses `arc init --local --role=contributor` with an
  explanatory error.
- **Lite + `pm.mode: arc-pm`** — forbidden. Lite has no work unit stream for the planning module
  to manage. Lite installs force `pm.mode: none` implicitly. (Whether Lite + `pm.mode: external`
  has value remains an open question — see Open Questions.)

The CLI refuses these combinations at `arc init` time with explanatory error messages pointing to
the correct path.

### Audit as Part of Modes Work

The mode-aware configurability audit is part of this work unit's scope. The content audit (see
[Content Audit](#content-audit) below) is expanded to include configurability architecture as a
domain — not just docs and workflows. The goal is a complete inventory of which settings apply in
which modes, which are forced, which are omitted, and which semantics shift per mode. This inventory
feeds the Lite and Local config templates and the CLI's init-time validation logic.

Note: the `pm.mode` rename's doc sweep is handled in the ARCd rebrand WU as part of its unified
content audit pass. The modes WU's configurability audit picks up where the rebrand leaves off —
classifying the (already-renamed) settings by mode applicability.

---

## Content Audit

Once detail design begins, audit all framework domains to classify each file, concept, and setting
by mode applicability. Uses the methodology/implementation classification from the Methodology
Maturation work unit and the conditional content analysis
(`analysis-conditional-content-architecture.md`) as its foundation.

**Categories:**

- **Unchanged**: Works identically across all modes (e.g., hooks, commit format methods, most dev rules)
- **Modified**: Present but adapted (e.g., session-init with simpler discovery in Lite, context footer
  behavior in local mode, process-task-loop without work unit lifecycle references)
- **Excluded**: Not installed or loaded (e.g., strategy-work-organization in Lite, backlog files in
  Lite, activation/archival workflows in Lite)
- **Relocated**: Same content, different tracking (e.g., WORK-STATUS in local mode — same file, untracked)

**Audit domains:**

- **Strategy documents** — applicability per mode, which sections load on-demand
- **Workflow documents** — same content or mode-aware variants; shift lifecycle additions
- **Constitutional documents** — DEV-RULES sections referencing work unit concepts and role
- **Session-init document set** — what loads in each mode, in what order
- **Templates installed by `arc init`** — per-mode file inclusion/exclusion
- **CLI commands** — available, hidden, or guarded by install mode; transparent portability redirects
- **Configurability architecture** — `ARCd-config.yml` settings per mode, forced values, omitted
  options, repurposed semantics, forbidden combinations. Feeds the Lite and Local mode config
  templates and CLI init-time validation. (Note: the `pm.mode` rename's mechanical sweep is handled
  in the [ARCd Rebrand][arcd-rebrand] WU.)
- **Lifecycle transitions** — shift workflow, status header updates across PRDs and task lists,
  WORK-STATUS In Flight registry, session-init reporting changes

### Phrasing Sweep (Mode-Aware Content Updates)

Classification is one activity; phrasing sweep is a distinct activity. Classification answers
"does this apply to Lite?" — phrasing sweep answers "does this sentence need rewording even where
it applies?"

A substantial amount of pre-existing content assumes Full+tracked implicitly through its phrasing.
Once mode design decisions are finalized, a sweep pass updates the wording to be mode-aware (or
mode-neutral where the content applies universally).

**Categories of content needing phrasing updates:**

- **Strategy docs** that say "work units flow through the lifecycle pipeline" or similar —
  acknowledge Lite has no lifecycle
- **Constitutional docs** (DEV-RULES.ARC, DEV-RULES.PROJECT) referencing backlog, activation,
  integration as universal — add mode qualifiers or reframe as Full-only
- **Workflow docs** (process-task-loop, session-init, session-handoff) referencing concepts that
  don't exist in Lite or behave differently in Local
- **QUICK-REFERENCE** sections that assume tracked mode for commands like `arc sync`
- **Agent briefings** describing the session state mechanism as tracked-plus-gitignored — Local
  mode changes this
- **Config schema comments** in `ARCd-config.yml` describing settings that don't apply in all modes
- **Role-related content** acknowledging role is Tracked-only (Full+tracked and Lite+tracked),
  dropped in Local
- **Session state portability** content (git notes layer) acknowledging Local mode uses backing
  store instead

**What this sweep is NOT:**

- Not the mechanical ARCd/ARC language sweep — that lives in the rebrand WU
- Not the mechanical `pm.mode: arc-in-git` → `arc-pm` references sweep — also in the rebrand WU
- Not a classification exercise (that's the audit above)

**Timing:** This sweep cannot begin until mode design decisions are locked in. It's implementation
work, scheduled near the end of the modes WU so it benefits from settled decisions. The audit
classification runs earlier and feeds into this sweep by identifying which files are in scope and
what changes each needs.

---

## Resolved Decisions

Decisions settled during the 2026-04-09 design iteration. Each entry names the decision and a brief
rationale; the full reasoning is in the relevant section above.

| Decision                                  | Resolution                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Local mode exclusion — primary            | `.git/info/exclude` (research-verified industry norm for per-user tooling)                                                                       |
| Local mode exclusion — opt-in             | Tracked `.gitignore` line via `--shared-gitignore` flag                                                                                          |
| Local mode exclusion — dropped            | Global gitignore (machine-wide blast radius breaks coexistence with tracked ARC)                                                                 |
| Backing store                             | Required, auto-created git-based local bare repo; durability + re-clone detection signal                                                         |
| Project ID                                | Git remote URL primary, first-commit hash fallback                                                                                               |
| Re-clone UX                               | Backing-store + absent-`.arc/` + missing-exclude → restoration flow, one-prompt recovery                                                         |
| Cross-machine portability                 | Opt-in remote on backing store, not automatic                                                                                                    |
| Local + Full combination                  | Supported via single-active invariant + shift lifecycle                                                                                          |
| Single-active invariant framing           | ARC tracks work units not branches; git usage unconstrained                                                                                      |
| Shift lifecycle — inclusion               | In-scope for this work unit (not deferred); universal, applies to all ARC modes                                                                  |
| Shift lifecycle — approach                | Metadata-in-place (no file moves), WORK-STATUS "In Flight" registry as central state                                                             |
| Shift lifecycle — skill                   | One skill (`arc-shift`), unified workflow (`shift-work-unit.md`), handles pause/resume/rotate via state-driven branching                         |
| Shift lifecycle — uncommitted work        | Workflow surfaces state, recommends commit, allows stash or leave-as-is                                                                          |
| Shift lifecycle — document status headers | PRDs and task lists updated in sync with WORK-STATUS; supplementary docs deferred to implementation                                              |
| Context footer in Local mode              | Enforced descriptive freeform pattern via commit-msg hook                                                                                        |
| Role concept applicability                | Tracked concept. Applies in Full+tracked AND Lite+tracked (OSS solo-dev scenario). Dropped in Local regardless of Lite/Full.                     |
| `team.mode` in Local mode                 | Forced `false`                                                                                                                                   |
| `user.sync_push` in Local mode            | Same shape, semantic redirected to backing store                                                                                                 |
| Portability commands in Local mode        | Transparent redirect by install mode (`arc user save/load/push/pull`, `arc sync`)                                                                |
| `pm.mode: arc-in-git` → `arc-pm` rename   | Scope migrated to [ARCd Rebrand][arcd-rebrand] WU (composes with `arc-config.yml` → `ARCd-config.yml` rename and content sweep)                  |
| Mode axes composition                     | Lite/Full and Tracked/Local are orthogonal; four combinations all valid; each axis contributes independent changes to the config template        |
| Lite + Local development                  | Intertwined, not sequential — shared machinery (config templates, init flow, session-init, audit, phrasing sweep) dominates unique per-mode work |
| WU scope split                            | pm.mode rename + mechanical content sweep → rebrand WU; pre-PRD audit + shift lifecycle + Lite + Local (intertwined) → modes WU                  |
| Content audit scope                       | Expanded to include configurability architecture and lifecycle transitions; mode-aware phrasing sweep added as implementation activity           |
| Branch / Active Focus mismatch UX         | Orientation reports facts without editorializing; escalation only on work-affecting actions                                                      |
| Solo-dev blind spot audit                 | Gating pre-PRD deliverable of this work unit (not atomic, not deferred)                                                                          |

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

5. **Session management simplifications**: What does Lite session-init look like? The document loading
   is the same core set, but discovery and lifecycle assessment are absent. Is the full session handoff
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

### Shift lifecycle (detail design)

11. **Multi-paused limit policy**: Hard cap, soft nudge only, or configurable? Leaning toward soft
    nudge at ~3 with no hard cap, but detail design.

12. **Pause-reason taxonomy**: Freeform vs. structured categories (`awaiting-review` /
    `blocked-external` / `deferred` / `other`). Freeform is simpler; structured enables better
    reporting.

13. **Cross-branch paused visibility in tracked Full**: Is branch-local paused state sufficient, or
    should there be a way to see "all paused WUs across all branches" from one location?

14. **Expected-resume-date field**: Useful context ("expected back Thursday") but potentially stale.
    Worth including, or pause reason free text is enough?

### Cross-cutting

15. **Initial setup workflow impact**: The current `01_verify-and-configure.md` and
    `02_define-project.md` assume Full ARC tracked. Lite and Local each need different setup paths.
    Separate workflows per mode, or a unified workflow with mode-conditional sections?

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

[arcd-rebrand]: ../technical/plan-arcd-rebrand.md
