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

### Solo-Dev Blind Spot Audit (Gating Pre-PRD) — **Complete**

**Status:** Complete as of 2026-04-09. Audit ran in three phases: initial scenario battery,
contributor-lifecycle stress test, and B-vs-C registry walk. All three produced permanent
reference documents; findings are absorbed into this plan doc as resolved decisions.

**Motivation** (for historical context): The framework has been developed under a solo-sequential
lens (one WU at a time, integrate fully before starting the next). The shift lifecycle emerged
from realizing Full ARC lacks a formal "paused awaiting external progress" state — a gap
invisible in solo-sequential flow but everyday reality in team and multi-stream work. If one such
gap existed, others likely did. The audit surfaced them before PRD lock-in.

**Outputs (permanent reference documents):**

- [`analysis-modes-solo-dev-blind-spot-audit.md`][solo-audit] — ~60 scenarios across 14 categories,
  findings A–J, and the initial Open Design Space enumeration (Options A/B/C). The audit's
  Clarifications That Frame This Audit section carries the six reframing decisions that narrowed
  the problem space.
- [`analysis-modes-contributor-lifecycle-stress-test.md`][contrib-stress-test] — contributor-role
  stress test that rediscovered `ADR-014`'s latent full-lifecycle capability, ruled out Option A,
  and formalized the mirror-structure principle as an amendment to `ADR-012`.
- B-vs-C registry walk (2026-04-09 session) — scenario-by-scenario walk against the remaining
  options, resolving to pure Option C with the session-init reframe. Findings are baked into
  this plan doc's [Shift Lifecycle](#shift-lifecycle) section and Resolved Decisions table
  rather than held as a separate document.

**Key resolutions absorbed into this plan doc:**

- **Registry shape:** Pure Option C (task list headers as single source of truth). See
  [State Lives in Task List Headers](#state-lives-in-task-list-headers-pure-option-c).
- **Finding B vocabulary split:** `Paused` (dev next mover) vs `Waiting-For {category}` (external
  next mover). See [Document Status Headers](#document-status-headers).
- **Finding C pause-pointer reconciliation:** No rename needed; formalizing the four existing
  pointer fields (`Interrupts:` / `Paused:` / `Paused To:` / `Spawned:`) is an independent doc
  sweep, not shift-blocking.
- **Contributor lifecycle gap closure:** G2, G3, G5, G7, G11, G13, G14 absorbed into Operating
  Modes WU scope (see stress test doc § Consolidated Gap Table).
- **Mirror-structure principle:** Formalized in `ADR-012` amendment, cross-referenced in
  contributor briefing, user/README, and plan-arc-modes § Mode Combinations.
- **Operating Modes WU scope updates:** Adds `/arc-status` skill and `mid-session-status.md`
  workflow to the deliverables; finishes `ADR-014`'s latent contributor full-lifecycle capability.

**Out-of-scope findings** (captured in the audit's § Out-of-Scope Findings for future WU
candidates): PRD revision mid-flight, incidental-to-feature promotion, WU merge/split, WU
abandonment, integration revert/restart, task-reopen-after-review state, cross-developer
ATOMIC-INBOX visibility, cadence/sprint overlay, global-freeze operation, PROJECT-STATUS/ROADMAP
auto-sync.

**Gating unblocked:** With the audit resolved, the Operating Modes WU is cleared to proceed to
PRD creation.

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
|-------------|--------------------------------------------------------------------------|----------------------------------------------------|
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
|---------------|------------|-------------------------------------|
| `planned`     | `backlog/` | Scoped but not yet activated        |
| `in-progress` | `active/`  | Currently being worked on           |
| `paused`      | `active/`  | In flight but temporarily set aside |
| `archived`    | archive    | Completed (or abandoned), terminal  |

The critical observation: `active/` holds both `in-progress` and `paused` WUs. Directory membership
means "in flight, between backlog and archive." Per-WU state is metadata, not location.

### State Lives in Task List Headers (Pure Option C)

**Decided 2026-04-09** after walking the audit's scenario battery against Options B and C
(Option A was previously ruled out by the contributor-lifecycle stress test —
see [`analysis-modes-contributor-lifecycle-stress-test.md`][contrib-stress-test] § S5). The walk
established that task list headers as the sole source of truth — with no registry file and no
per-dev cache — is the cleanest shape under the reframe described below. The full walk and
failure-mode analysis is preserved in the follow-up session's record; this section captures the
resolved shape.

**Key reframe that shaped the decision:** session-init does not need to know about inactive or
paused WUs. Multi-WU awareness is an on-demand concern, not a session-init concern — the
developer already knows what they paused, and if they need a reminder they can ask. Baking
multi-WU reporting into every session-init orientation is noise for both human and agent. This
reframe collapsed a complex registry-vs-cache-vs-file-vs-skill design space into something much
simpler.

**The shape:**

Each task list's status header carries its own state. A paused WU's task list has, for example:

```markdown
**Status:** Paused (2026-04-09) — awaiting code review from Alice
```

Or for external-blocking states (see [Finding B resolution](#finding-b-paused-vs-waiting-for-vocabulary-split) below):

```markdown
**Status:** Waiting-For Review (2026-04-09) — Alice, PR #42
```

Valid `Status:` values: `In Progress` / `Paused` / `Waiting-For {category}` / `Complete`. Inline
date in parentheses is the pause timestamp (ceremony-free, auto-observed per Clarification #4 in
the audit). Freeform reason follows the dash.

**`WORK-STATUS.md` remains branch status, single-slot.** No In Flight registry, no Active Focus
section, no template redesign. The current shape (flat Branch / Task List / Next Task fields)
stands — this decision _reduces_ scope from the earlier sketch rather than adding to it. The
semantic distinction carried in Clarification #2 of the audit is preserved: `WORK-STATUS.md`
describes the current branch's WU; it is not a multi-WU registry.

**No index file.** No `user/{identity}/IN-FLIGHT.md`, no per-dev cache, no registry file in any
form. The walk's honest-failure-mode analysis demonstrated that any cache introduces drift risk
that erodes the "trust the system" value prop, and that the self-healing discipline needed to
keep a cache trustworthy exceeds the UX benefit it provides. Task list headers are the only
state.

**Mid-session multi-WU awareness is on-demand via `/arc-status` skill.** See
[Skill Shape](#skill-shape) below. The skill reads headers and composes a current-state view
only when invoked. This keeps multi-WU reporting out of session-init orientation entirely,
aligned with the reframe above.

**How this resolves the scenario battery's findings:**

- **Scenario 1 (solo tracked Full, 2 WUs on 2 branches):** Current-branch scan sees only the
  current branch's task lists. That is the expected behavior under the reframe — the developer
  knows about the other branch, and if they need an explicit reminder they invoke `/arc-status`
  (which can offer an on-demand cross-branch git query as an opt-in for the rare case).
- **Scenario 2 (solo Local Full, 2 WUs):** `.arc/` is shared across branches in Local mode, so
  any scan naturally finds all in-flight task lists. Clean.
- **Scenario 3 (team merges to main):** Tracked task lists travel with their branches. After
  merges, main's `active/` naturally carries the aggregate view. Clean.
- **Scenario 4 (person-to-person handoff):** The paused task list is in tracked `active/` and
  moves with the branch on pull. Personal context still moves via SESSION-NOTES git notes as
  today. No additional state to coordinate.
- **Scenario 5 (activate new while one is paused):** `activate-work-unit` sets new task list's
  `Status: In Progress`. Paused task list's header is untouched. No cross-workflow coordination.
- **Scenario 7 (rotate between two paused WUs):** Shift updates two task list headers +
  `WORK-STATUS.md` Active Focus (single-slot pointer to current branch's WU). Atomicity is
  local to three file writes.
- **Scenario 8 (resume after long pause):** Pause timestamp lives inline in the Status header.
  Shift reads the header on resume and surfaces a staleness warning if the interval exceeds a
  threshold (threshold TBD in detail design, see Open Questions).
- **Scenario 9 (waiting-for-review distinction):** Encoded as a specific `Status:` value. See
  Finding B resolution.

**What this decision removes from scope (vs. the earlier "In Flight registry" sketch):**

- Registry file design (none needed)
- Per-dev cache file and its rebuild/self-healing logic (none needed)
- Template redesign for `WORK-STATUS.md` (unchanged from today)
- Session-init integration work for multi-WU reporting (unchanged — session-init stays lean)
- Growth-nudge count aggregation across branches (nudge runs at shift-add time on current
  branch only; see Workflow Shape)
- Cross-file atomicity discipline between registry and task list headers (single source of
  truth means no sync concern)

The cascade of simplification from the reframe is intentional and the primary value of walking
the scenario battery carefully — the design gets smaller, not bigger.

### Document Status Headers

PRDs and task lists carry status headers today (e.g., `Status: In Progress`). Shift lifecycle
extends the vocabulary with two new values — `Paused` and `Waiting-For` — and adds an inline
date and freeform reason format. Per the
[State Lives in Task List Headers](#state-lives-in-task-list-headers-pure-option-c) resolution,
these headers are the sole source of truth for WU state; there is no cache or registry to keep
in sync.

**Header format:**

```markdown
**Status:** In Progress
**Status:** Paused (2026-04-09) — blocked on session token decision
**Status:** Waiting-For Review (2026-04-09) — Alice, PR #42
**Status:** Waiting-For Approval (2026-04-09) — ARB signoff expected Thursday
**Status:** Complete
```

**Valid Status values:**

- `In Progress` — active work. Default state for an activated WU.
- `Paused` — developer is the next mover; they set it aside and will return to do more work.
  Counts against the growth nudge (WIP pressure).
- `Waiting-For {category}` — external actor is the next mover; the developer cannot unblock it
  from their side. Does **not** count against the growth nudge — waiting on three PRs is a
  normal pipeline, not WIP pressure.
- `Complete` — terminal state, prelude to archival.

**`Waiting-For` categories** (initial set, may expand during detail design):

- `Review` — awaiting code review
- `Approval` — awaiting stakeholder / ARB / compliance signoff
- `Delivery` — awaiting downstream deployment or external artifact
- `Decision` — awaiting a decision from someone else (not a self-decision — that's `Paused`)
- `Other` — freeform, with the reason string carrying the detail

#### Finding B: Paused vs Waiting-For vocabulary split

The `Paused` / `Waiting-For` distinction came from the solo-dev audit's Finding B and is backed
by Kanban literature, GTD's "Waiting For" list, and empirical research on PR review latency
(see [`analysis-modes-solo-dev-blind-spot-audit.md`][solo-audit] § B for evidence). The
distinction matters because:

- **Orientation reporting can triage differently.** "Waiting for review (3d)" suggests nudging
  the reviewer; "paused on incidental (2d)" is self-state with no external action available.
- **WIP nudges should only apply to developer-paused WUs.** Three items in `Waiting-For Review`
  is a normal PR pipeline; three developer-paused WUs is WIP pressure.
- **Pause reason taxonomy becomes simpler** — the state itself carries the "what kind of
  waiting" category, so the freeform reason only needs to carry the detail (who/what/when).

**Cost:** Trivial. One extra Status enum value plus a category modifier for `Waiting-For`. No
mechanism change beyond the existing Status header. Documentation sweep in
`strategy-task-list-formatting.md` to catalog the valid values.

**Scope:**

- **PRD status header** — updated on shift transitions (Status value + date + reason)
- **Task list status header** — updated on shift transitions (same format)
- **Supplementary docs** (`atomic-*.md`, `notes-*.md`) — deferred to implementation. Gut-level:
  skip them, they're supplementary and the churn isn't worth it. Revisit if implementation
  surfaces a reason.

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
3. Update the affected task list(s) Status headers — e.g., feature-x header flips from
   `In Progress` to `Paused (YYYY-MM-DD) — reason`, and for rotations feature-y's header flips
   from `Paused` (with its own old timestamp) to `In Progress`
4. Update PRD Status header(s) to match (same format as task list)
5. Update `WORK-STATUS.md` to reflect the new current-branch WU (single-slot, branch-local)
6. Persist — commit in tracked Full (via arc-commit invocation or inline commit step), backing
   store sync in Local

Step 3 is the canonical state write. Everything else derives from it or is a surface for local
discoverability. There is no registry file or cache to keep in sync — task list headers are the
single source of truth per the
[State Lives in Task List Headers](#state-lives-in-task-list-headers-pure-option-c) decision.

**Growth nudge:** On pause transitions (not resume), after updating the task list header, the
workflow counts current-branch task lists with `Status: Paused` (excluding `Waiting-For`
categories per Finding B). If the count is ≥3, surface a soft nudge: "N paused WUs — consider
`/arc-status` to review whether any should be archived or resumed." Advisory, not blocking.
Current-branch-only count may undercount in multi-branch tracked Full juggling scenarios; the
nudge is intentionally advisory, and the cost of an occasional false-negative is accepted.

**Resume-side additions:**

On resume transitions, the workflow additionally:

1. Surfaces the preserved SESSION-NOTES snapshot (if any) as recovery context
2. Checks branch alignment in tracked Full, suggests the switch if needed
3. Reads the pause timestamp from the task list Status header and reports pause age (e.g.,
   "paused 2d ago", "paused 3w ago — assumptions may be stale"). If the interval exceeds a
   staleness threshold (TBD in detail design — see Open Questions), surfaces a prompt to
   re-read PRD/task list before proceeding

### Session-Init Integration

**Session-init stays unchanged from today.** Multi-WU awareness is an on-demand concern, not a
session-init concern. Per the reframe that drove the
[State Lives in Task List Headers](#state-lives-in-task-list-headers-pure-option-c) decision,
paused and waiting-for WU information is not load-bearing for every session orientation — the
developer already knows what they paused, and if they need a reminder they can invoke
`/arc-status` (see [Skill Shape](#skill-shape)).

Session-init continues to read `WORK-STATUS.md` as the branch-local WU pointer and reports that
single WU's state (branch, current task, next action, blockers). It does not scan `active/` for
paused task list headers. It does not summarize cross-WU state. This keeps the orientation
summary focused on "what am I doing right now?" — which is all session-init needs to answer
for the common single-WU case, and all it _should_ answer for the multi-WU case where extra
information would be noise.

The only session-init touchpoint the shift lifecycle adds is **drift detection** — if
`WORK-STATUS.md` points to a task list whose Status header reads `Paused` or `Waiting-For`,
the orientation surfaces the mismatch ("WORK-STATUS says active, but the task list is paused —
did you shift in another session and forget to commit `WORK-STATUS.md`?"). This is a safety
check, not a multi-WU report.

**Growth nudge is not a session-init concern.** It fires at pause-transition time inside the
shift workflow, not at every session start. See Workflow Shape above.

### Skill Shape

Two skills ship with the shift lifecycle, both following the established thin-skill pattern
(skill file is a short pointer; the workflow carries the logic).

#### `/arc-shift` — pause/resume/rotate transitions

Backed by `shift-work-unit.md`. Handles the state transitions described in
[Workflow Shape](#workflow-shape) above.

User invocations that naturally route through `/arc-shift`:

- "Let's shift this aside while we wait on review"
- "Shift to feature-y"
- "Let's shift back to feature-x now that review landed"
- "Shift this and start the auth refactor incidental WU"

#### `/arc-status` — mid-session work orientation ("toggle HUD")

Backed by `mid-session-status.md` (new workflow in `session-lifecycle/`). Provides on-demand
warm orientation — a concise snapshot of current work state composed from a small targeted set
of reads, distinct from the cold orientation session-init performs.

**Why this skill exists:** It is the answer to the "how do I see paused/in-flight WUs?" question
that the [State Lives in Task List Headers](#state-lives-in-task-list-headers-pure-option-c)
decision deferred out of session-init. But it earns its keep well beyond the multi-WU case —
the most common use is a mid-session refresher when the developer has stepped away, switched
contexts, or simply wants a quick "where am I?" bookmark without restarting the session.

**Slot in the session lifecycle:**

```text
/arc-resume    — cold orient at session start  (workflow: session-init.md)
/arc-status    — warm orient mid-session       (workflow: mid-session-status.md)
/arc-handoff   — close session at end          (workflow: session-handoff.md)
```

Three skills, three workflows, three lifecycle points. Symmetric and cleanly namespaced.

**Naming note:** This name becomes available during the ARCd rebrand WU, which renames the
existing `arc status` CLI command (framework installation health) to `arcd health`, freeing
the `arc-status` name for this skill. The skill is a slash-command invocation (`/arc-status`)
and occupies a different namespace from CLI binaries anyway, but the rename resolves the
naming ambiguity at its root. See
[`plan-arcd-rebrand.md`][arcd-rebrand] § Implementation Scope → CLI command surface cleanup.

**Output shape:**

```markdown
**Current focus** · `branch-name` · clean|dirty

- **Working on**: feature-x, Task 4.2 — Implement token validation
- **Since session start**: 3 tasks completed (Tasks 3.5, 4.0, 4.1), 2 commits landed
- **Uncommitted**: [files, if any] | none

**In flight** · [only shown if >1 WU, otherwise omitted entirely]

- **Paused**: incidental-auth-refactor (paused 2d ago — blocked on session token decision)
- **Waiting for**: feature-y (review from Alice, 1d ago)

**Next action**: Resume token validation in Task 4.2.b — schema check for malformed tokens

**Flags**: [blockers, quality gate state, stale assumptions, etc. — or omitted]
```

**Composition rules:**

- **Conditional sections.** Single-WU sessions do not see the "In flight" block. No blockers
  means no "Flags" block. Only show what is load-bearing right now. The output is
  length-variable by design — a clean single-WU session might be three lines; a multi-WU
  session with blockers might be ten. Either way, no noise.
- **Do not duplicate session-init.** If a line would repeat what `/arc-resume` already told
  the user, omit it. The skill's value is **what has changed or emerged since session-init** —
  completed tasks, new commits, shifts, drift, uncommitted mid-implementation state. If
  nothing has changed, say so tersely and suggest the next action without re-recapping.
- **Suggest, do not re-quote.** "Next action" in session-init comes from `WORK-STATUS.md`
  verbatim. "Next action" in `/arc-status` is composed from mid-session state — reflects what
  was just done, what is uncommitted, what the task list checkbox state implies next. Often
  the same as `WORK-STATUS.md`'s Next Action, often not.
- **Cheap enough to invoke freely.** Tens of milliseconds of reads, no heavy workflow
  machinery. Should feel lightweight enough that "let me just check" is reflexive.

**Input sources** (all targeted, none expensive):

1. `git status` + `git log HEAD@{session-start}..HEAD` — working-tree state, commits since
   session start
2. `WORK-STATUS.md` — current WU pointer (with drift detection against the task list header
   per the Session-Init Integration note)
3. **Current task list** (path from `WORK-STATUS.md`) — checkbox state of current phase, used
   to compute "what has been completed this session" by cross-referencing the checkbox
   transitions with the git log since session start
4. **Scan of current-branch `active/`** for task list Status headers — only included in output
   if any show `Paused` or `Waiting-For`; completely omitted otherwise (the "In flight" block
   does not appear for single-WU sessions)
5. `SESSION-NOTES.md` Persistent Context section — for active constraints worth restating if
   relevant to the current state

**Use cases:**

- "I stepped out for lunch — what was I doing?" (post-context-switch bookmark)
- "I've been working for a while, quick check on where I am" (mid-session refresh)
- "What's next after this?" (looking ahead when the current unit lands)
- "What else do I have in flight?" (multi-WU visibility on demand — the original driver)
- "I suspect my WORK-STATUS.md is stale — what does the world actually look like?" (drift
  detection)

**Out of scope for this skill:**

- Installation/framework health (that is `arcd health` post-rebrand)
- Team-aggregate view across developers (requires cross-identity git notes aggregation,
  deferred to external tooling or a future WU)
- Cross-branch paused-WU enumeration in tracked Full — by default the skill only sees
  current-branch state. A `--all-branches` opt-in flag (or equivalent agent behavior) can
  perform an on-demand git query for task lists with paused Status headers across all
  branches when the user explicitly asks. Pay-for-what-you-request.

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
|----------|--------------------------------|------------|
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

### Local Mode and Contributor Mode Are Alternatives, Not Compositions

Local mode and contributor mode (per `ADR-014`) both answer the question "I want ARC in a
repository whose tracked state I don't own." They achieve this through different mechanisms —
Local mode excludes `.arc/` from git tracking via `.git/info/exclude`; contributor mode
piggybacks on upstream's already-gitignored `user/{identity}/` subtree and runs a personal
planning pipeline there (see `AGENT-BRIEFING.CONTRIBUTOR.md`).

**The two are selected by upstream context, not stacked:**

- **Upstream is NOT an ARC project** → Local mode is the answer. There is no upstream `.arc/`
  to collide with; the Local mode exclusion mechanism works as designed.
- **Upstream IS an ARC project** → contributor mode is the answer. Upstream's `.arc/` is
  already present and the contributor's personal workspace at `user/{identity}/` is already
  gitignored by upstream's tracked `.gitignore`. Contributor mode subsumes Local mode's value
  proposition in this context, with zero directory collision and no need for a separate
  backing store (git notes portability covers the user directory).

The "nested Local mode inside an ARC upstream" scenario is explicitly not supported — it would
require either colliding `.arc/` installs or a novel nested-install pattern that is not
idiomatic in the wider tooling ecosystem. The `arc.role = contributor` path handles the
motivating use case (OSS contribution to an ARC-using project) without the collision.

See `analysis-modes-contributor-lifecycle-stress-test.md` § S6 for the full derivation.

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

| Decision                                     | Resolution                                                                                                                                                                                                                                                   |
|----------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Local mode exclusion — primary               | `.git/info/exclude` (research-verified industry norm for per-user tooling)                                                                                                                                                                                   |
| Local mode exclusion — opt-in                | Tracked `.gitignore` line via `--shared-gitignore` flag                                                                                                                                                                                                      |
| Local mode exclusion — dropped               | Global gitignore (machine-wide blast radius breaks coexistence with tracked ARC)                                                                                                                                                                             |
| Backing store                                | Required, auto-created git-based local bare repo; durability + re-clone detection signal                                                                                                                                                                     |
| Project ID                                   | Git remote URL primary, first-commit hash fallback                                                                                                                                                                                                           |
| Re-clone UX                                  | Backing-store + absent-`.arc/` + missing-exclude → restoration flow, one-prompt recovery                                                                                                                                                                     |
| Cross-machine portability                    | Opt-in remote on backing store, not automatic                                                                                                                                                                                                                |
| Local + Full combination                     | Supported via single-active invariant + shift lifecycle                                                                                                                                                                                                      |
| Single-active invariant framing              | ARC tracks work units not branches; git usage unconstrained                                                                                                                                                                                                  |
| Shift lifecycle — inclusion                  | In-scope for this work unit (not deferred); universal, applies to all ARC modes                                                                                                                                                                              |
| Shift lifecycle — approach                   | Metadata-in-place (no file moves); task list Status headers as single source of truth; no registry file, no per-dev cache                                                                                                                                    |
| Shift lifecycle — state location             | Pure Option C (2026-04-09 decision after B-vs-C scenario walk). Task list headers carry Status, date, reason. `WORK-STATUS.md` stays single-slot                                                                                                             |
| Shift lifecycle — multi-WU awareness         | On-demand via `/arc-status` skill, not baked into session-init. Session-init orientation remains single-WU focused                                                                                                                                           |
| Shift lifecycle — skills                     | Two skills: `/arc-shift` (transitions, workflow `shift-work-unit.md`) and `/arc-status` (mid-session HUD, workflow `mid-session-status.md`)                                                                                                                  |
| Shift lifecycle — uncommitted work           | Workflow surfaces state, recommends commit, allows stash or leave-as-is                                                                                                                                                                                      |
| Shift lifecycle — document status headers    | PRDs and task lists updated in sync via the Status header (inline date + reason format); supplementary docs deferred to implementation                                                                                                                       |
| Shift lifecycle — vocabulary (Finding B)     | Two-state split: `Paused` (dev is next mover, counts toward WIP nudge) vs `Waiting-For {category}` (external is next mover, excluded from nudge)                                                                                                             |
| Shift lifecycle — growth nudge               | Fires at pause-transition time inside shift workflow, not at session-init. Current-branch count; ≥3 paused is advisory                                                                                                                                       |
| Shift lifecycle — Finding C (pause pointers) | No rename needed. The `Paused:` pointer field in `clean-work-unit.md` and the new Status header vocabulary do not collide (different field shapes, different semantics). Formalizing the four pointer fields is an independent doc sweep, not shift-blocking |
| Shift lifecycle — `PROJECT-STATUS.md`        | Stays project-focus oriented. Updated at activate/archive only, not at personal shift operations. Paused WUs still appear as project focus until archived (ownership-of-tracked-state framing)                                                               |
| Shift lifecycle — CLI naming coordination    | `arc status` (framework health CLI) rename to `arcd health` absorbed into [ARCd Rebrand][arcd-rebrand] WU, freeing `/arc-status` for the mid-session skill                                                                                                   |
| Context footer in Local mode                 | Enforced descriptive freeform pattern via commit-msg hook                                                                                                                                                                                                    |
| Role concept applicability                   | Tracked concept. Applies in Full+tracked AND Lite+tracked (OSS solo-dev scenario). Dropped in Local regardless of Lite/Full.                                                                                                                                 |
| `team.mode` in Local mode                    | Forced `false`                                                                                                                                                                                                                                               |
| `user.sync_push` in Local mode               | Same shape, semantic redirected to backing store                                                                                                                                                                                                             |
| Portability commands in Local mode           | Transparent redirect by install mode (`arc user save/load/push/pull`, `arc sync`)                                                                                                                                                                            |
| `pm.mode: arc-in-git` → `arc-pm` rename      | Scope migrated to [ARCd Rebrand][arcd-rebrand] WU (composes with `arc-config.yml` → `ARCd-config.yml` rename and content sweep)                                                                                                                              |
| Mode axes composition                        | Lite/Full and Tracked/Local are orthogonal; four combinations all valid; each axis contributes independent changes to the config template                                                                                                                    |
| Lite + Local development                     | Intertwined, not sequential — shared machinery (config templates, init flow, session-init, audit, phrasing sweep) dominates unique per-mode work                                                                                                             |
| WU scope split                               | pm.mode rename + mechanical content sweep → rebrand WU; pre-PRD audit + shift lifecycle + Lite + Local (intertwined) → modes WU                                                                                                                              |
| Content audit scope                          | Expanded to include configurability architecture and lifecycle transitions; mode-aware phrasing sweep added as implementation activity                                                                                                                       |
| Branch / Active Focus mismatch UX            | Orientation reports facts without editorializing; escalation only on work-affecting actions                                                                                                                                                                  |
| Solo-dev blind spot audit                    | Gating pre-PRD deliverable of this work unit (not atomic, not deferred)                                                                                                                                                                                      |

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

Most registry / multi-WU / vocabulary questions were resolved on 2026-04-09 (see
Resolved Decisions table). These remaining items are narrower detail-design questions that can
be settled at PRD time or implementation time.

11. **Multi-paused limit policy**: Hard cap, soft nudge only, or configurable? Current direction
    (Resolved Decisions) is soft nudge at ~3 with no hard cap. Still open: is the threshold
    itself configurable, or hardcoded at 3? Research supports 2–3 as the natural range.

12. **Waiting-For category taxonomy finalization**: Initial set is `Review` / `Approval` /
    `Delivery` / `Decision` / `Other`. Is this exhaustive enough? Should any categories be
    added or renamed during detail design? Freeform reason handles detail; the category is
    for triage semantics.

13. **Staleness threshold for long-pause resume prompt**: When shift resumes a WU, at what pause
    interval should the "your mental model may be stale, re-read the PRD" prompt fire?
    1 week? 2 weeks? Configurable per project? Per-WU? (Clarification #4 in the audit sets
    the direction but not the number.)

14. **`/arc-status` drift detection threshold**: The skill checks for `WORK-STATUS.md` vs task
    list header drift. Should it also flag drift between `Paused At` date in the header and the
    actual last-commit date on the task list file? Second-order concern — only relevant if
    headers are edited manually without shift.

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
[contrib-stress-test]: ../../reference/analysis/analysis-modes-contributor-lifecycle-stress-test.md
[solo-audit]: ../../reference/analysis/analysis-modes-solo-dev-blind-spot-audit.md
