# Strategy: Work Organization

> **Decision guide and rationale:** [Work Organization](https://andrewrcr.github.io/arc-framework/reference/work-organization/)
> on the docs site covers categorization guidance, edge cases, incidental work rationale, branch
> protection trade-offs, and common pitfalls.

Operational specification for organizing development work in ARC-based projects. Defines work
categorization, git branch workflow, directory structure, and archive organization. Referenced by
workflows at specific trigger points — this is the agent's lookup reference, not narrative
documentation.

---

## Contents

- [Work Categories](#work-categories)
- [Decision Rules](#decision-rules)
- [Task Lists and Branches](#task-lists-and-branches)
- [Work Unit State](#work-unit-state)
- [Spec-Flow Invariants](#spec-flow-invariants)
- [Branching](#branching)
- [Per-Worktree Isolation](#per-worktree-isolation)
- [Archival](#archival)
- [ROADMAP](#roadmap)
- [Incidental Work Model](#incidental-work-model)
- [Branch Protection Modes](#branch-protection-modes)
- [Directory Structure](#directory-structure)
- [Team Coordination](#team-coordination) *(→ dedicated strategy)*
- [Planning Module](#planning-module) *(→ dedicated strategy)*

---

## Work Categories

Work units are identified by their branch type prefix (`feat`, `fix`, `chore`, etc.) from the
[`branch-format`][branch-format-method] method's type set. See [§ Branching](#branching) for
the branch model and [`branch-format`][branch-format-method] for the type set and
adopter-override mechanism.

---

## Decision Rules

Branch-type selection for a new work unit follows the [`branch-format`][branch-format-method]
method's type set. The method ships per-type semantic guidance (`feat` for new capability,
`fix` for correction, `chore` for routine maintenance, `refactor` for restructuring without
behavior change, `hotfix` for production-issue response) and supports adopter override of the
set itself.

For routing deferred or discovered work — inline fix vs. atomic task vs. new work unit — see
[DEV-RULES.ARC][dev-rules-arc] § Leave it cleaner.

---

## Task Lists and Branches

Task lists are the unit of work planning; branches are the unit of code delivery. The
relationship is many-to-one: a single task list may span multiple branches for reviewability
or team collaboration. The solo 1:1 pattern — one task list, one branch — is the natural
default but not a rule.

Common multi-branch patterns:

- **Stacked PRs:** Breaking a large task list into 2-3 branches for smaller, reviewable PRs
- **Team sub-branches:** Multiple developers each working a branch against a shared integration
  branch
- **Phased delivery:** Sequential branches delivering different phases of the same task list

**Branch scope:** One planned work unit per branch. Switching work units implies switching
branches. Incidental task lists may live alongside the primary work when they stay on the same
branch by design.

**Per-WU status file behavior on branches.** Each active WU carries its own
`status-{name}.md` at `active/{category}/`. The file is created by
[activate-work-unit][activate-work-unit] on the WU's branch and deleted by
[archive-work-unit][archive-work-unit] at the end of the WU's lifecycle. Parallel WUs on
independent branches carry different files — no cross-branch mutation conflict is possible at
the status-file layer. For within-WU team sub-branches sharing one file, see
[Team Coordination Strategy][team-coordination] § Session State Merge Behavior.

Archive triggers when all tasks in the task list are complete, not when any individual branch
is merged or deleted. Branch cleanup happens independently as PRs merge.

---

## Work Unit State

The `**State:**` field on each WU's `status-{name}.md` is the load-bearing lifecycle marker.
Enum values and optional pointer fields below; workflows listed set each value.

### State Enum

| Value                                          | Set By                                                                          | Meaning                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `In Progress`                                  | [activate-work-unit][activate-work-unit] Step 4; resume from pause              | Active task execution (the common case)                                              |
| `Paused (YYYY-MM-DD) — reason`                 | [manage-incidental-work][manage-incidental]; future arc-shift pause             | Interrupted by an incidental or future arc-shift pause                               |
| `Waiting-For {category} (YYYY-MM-DD) — reason` | Future arc-shift lifecycle                                                      | Blocked awaiting external action (not yet written by any current workflow)           |
| `Complete`                                     | [clean-work-unit][clean-work-unit] Mode 2                                       | Work done, opened for integration; file is stable through review, deleted at archive |
| `Superseded (partial)`                         | [integrate-work-unit][integrate-work-unit] § Handling Partially Superseded Work | Partial work being integrated; remaining phases absorbed into a successor WU         |

### Optional Pointer Fields

Added to status files when the WU's state calls for cross-references. Omit otherwise.

| Field                                                     | Appears On                                         | Set By                                                                               |
| --------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `**Interrupts:** {category}/{name}`                       | Incidental WU status files                         | [manage-incidental-work][manage-incidental] — names the parent WU being interrupted  |
| `**Paused At:** <task-id>`                                | Parent WU status file (when interrupted)           | [manage-incidental-work][manage-incidental] — records the task at which work paused  |
| `**Paused To:** {category}/{name}`                        | Parent WU status file                              | [manage-incidental-work][manage-incidental] — names the incidental that caused pause |
| `**Superseded By:** tasks-{new-approach}.md (YYYY-MM-DD)` | WU status files with `State: Superseded (partial)` | [integrate-work-unit][integrate-work-unit] § Appendix — points to successor WU       |

---

## Spec-Flow Invariants

Three structural invariants hold across the WU lifecycle regardless of mode or tier. Two axes
govern variation above them. The per-axis policy — which spec form applies under which mode ×
tier combination — lives downstream of this strategy.

### Invariants

1. **`meta-*` always exists.** The meta file is the durable identity artifact across the entire
   WU lifecycle. It is created at WU stub creation (alongside any planning artifact, or alone for
   external-tracker-origin WUs), persists through every state transition, and lands in the dated
   archive at integration. Single source of truth for state, owner, dependencies, cohort, and
   (when applicable) the spec pointer. Workflows, tooling, and renderers consume it across the
   lifecycle.

2. **Task list structure is invariant across tiers.** When a task list exists, its shape is fixed
   — phase headings, leaf task format, completion markers, Success Criteria section. Tier-aware
   ceremony scales the artifact's presence and rigor; the structural shape stays uniform.

3. **A parseable spec exists in some form before task-list generation.** Spec form varies by mode
   × tier — PRD, plan doc, atomic-companion description, external tracker entry — but existence
   does not. Task generation always has something to read.

### Scaling axes

Variation above the invariants happens along two axes:

- **Mode** — `pm.mode` ∈ {`arc-in-git`, `external`, `none`}. Mode determines which capture
  surfaces and spec-artifact sets the framework installs. The invariants hold equally under all
  three; the artifact set carrying them differs.

- **Tier** — atomic / quick / standard. Each tier carries a different artifact set per WU; the
  structural invariants apply uniformly across all three.

### Deferred contract

This strategy codifies the invariants and the scaling axes. The per-mode × per-tier optionality
contract — which spec form applies under which combination, whether `plan-*` is required vs.
optional, the verification model under tier collapse — is not codified here. The invariants
establish what's stable; the contract that builds on them lives with the surfaces that
orchestrate per-mode and per-tier policy.

### Escape-hatch guardrails

The structural cuts above raise a discipline question: how does the framework prevent
escape-hatching to lower-ceremony tiers for work that warrants higher discipline? Three
mechanisms:

- **Tier is one-way.** Promotion (atomic → quick → standard) is straightforward; demotion is
  deliberate. Work that grows beyond its initial tier rotates to the higher tier rather than
  absorbing scope under a thinner shape.

- **Atomic-tier requires explicit choice.** Atomic shape is the exception, not the path of least
  resistance — work defaults to the heavier ceremony unless its scope genuinely warrants atomic.

- **Tier-invariant disciplines stay uniform.** Process-task-loop, quality gates, and commit
  discipline apply identically regardless of tier. Tier scales artifact ceremony, not engineering
  rigor.

The invariants supply the structural floor; the guardrails above keep that floor intact
regardless of tier.

---

## Branching

ARC's branch model uses a type prefix per branch ([Conventional Branch][cb-spec] style) plus a
`plan/<name>` prefix for the planning life-phase. One work unit owns one branch through its
entire lifecycle.

### Branch type prefixes

Branch type prefixes are codified in the [`branch-format`][branch-format-method] method. ARC's
default type list and the override mechanism live in that file; the strategy describes only the
mechanism (every WU branch carries a type prefix) and its composition with the
[`commit-format`][commit-format-method] method. Branch typing and commit typing are independent
axes: each method overrides independently, and commits within a WU may use any type from the
project's commit-format type set regardless of the branch's prefix.

### Planning branches: `plan/<name>`

Planning work — discovery, plan-doc iteration, PRD authoring, task generation — runs on a
`plan/<name>` branch. The prefix marks the WU's life-phase, distinct from the execution-phase
type prefix the WU adopts at activation.

At activation ([activate-work-unit][activate-work-unit]), the planning branch rotates to its
execution-phase counterpart via local rename + remote replace:

1. `git branch -m plan/<name> <type>/<name>` — local rename
2. `git push origin <type>/<name>` — push under new name
3. `git push origin --delete plan/<name>` — drop the old remote

The rotation is the branch-side companion to the meta-file `State: Planning → Active` transition.
Branch identity persists across the rename; commits, PR, and history carry forward.

### Single branch per work unit

One WU = one branch, from planning through integration. The branch is created at WU inception
(as `plan/<name>`), rotated at activation (to `<type>/<name>`), and merged to main exactly once
at integration. WU artifacts (`meta-<name>.md`, `plan-<name>.md`, `prd-<name>.md`,
`tasks-<name>.md`, companions) live in `active/` on the WU's branch throughout the lifecycle;
main carries no in-flight WU artifacts.

This shape enables per-worktree isolation (see [§ Per-Worktree Isolation](#per-worktree-isolation)
below): each WU's artifacts are reachable only on its own branch, so worktrees never see
siblings' in-flight state.

---

## Per-Worktree Isolation

Single-branch-per-WU (see [§ Branching](#branching)) produces a structural invariant across
worktrees: **each worktree's `active/` contains only its own WU's meta file and that WU's
companions**. No other in-flight WU's meta file is reachable, because every other WU lives on
its own branch and no branch carries another WU's `active/` artifacts.

The invariant follows from two prior decisions:

- WU artifacts live in `active/` on the WU's branch only — main carries no in-flight WU
  artifacts between inception and integration.
- One WU = one branch = one worktree.

### Concurrency under worktrees

Per-worktree isolation enables independent concurrent work units. Each WU operates in its own
worktree without seeing or conflicting with sibling WUs' in-flight planning, status, or task
lists. Cross-WU coordination (dependency declarations, cohort grouping) materializes through
fields on the meta file, not through filesystem co-residency.

### Acceptance test

The invariant is enforceable mechanically: spawn a worktree from `main`, assert that `active/`
contains exactly the spawning WU's meta file plus its companions, and nothing else.

---

## Archival

WU archival is the file-move ceremony that retires a shipped WU from `active/` to `archive/`.
Archival rides on the integration PR by default (sweep-as-you-go), keeping the WU's entire
lifecycle on one branch through one merge.

### Sweep-as-you-go default

`archive.cadence` in `arc-config.yml` controls when the file-move sweep fires:

- **`with-integration`** (default) — sweep commits ride on the integration PR; the WU's meta
  file and any companions move from `active/` to `archive/<dated>/<wu-name>/` as part of the
  same merge that ships the code.
- **`deferred`** — sweep fires at the next-WU planning batch instead, bundling archival of the
  just-shipped WU with planning artifacts for the next one on a shared transition branch.
- **`manual`** — sweep fires only on explicit invocation; no automatic ceremony coupling.

Under `with-integration`, the integration PR carries a multi-commit structure: code commits →
completion content (Release Notes Entry + Completion Notes composed into the meta file) → sweep
commits (file moves from `active/` to `archive/<dated>/<wu-name>/`). Reviewers focus per-commit.

See [integrate-work-unit.md][integrate-work-unit] and [archive-work-unit.md][archive-work-unit]
for the full ceremony workflows.

### Archive directory shape

```text
.arc/reference/archive/<dated>/
  <wu-name>/
    meta-*.md, plan-*.md, prd-*.md, tasks-*.md, notes-*.md, ...
```

Each shipped WU gets its own subdir directly under the temporal grouping. The `<dated>` segment
follows a `<YYYY-q*>` convention (e.g., `2026-q2/`). Subdir contains all WU artifacts that
existed at integration time, symmetric with the backlog's per-WU subdir convention (see
[Planning Module Strategy](strategy-planning-module.md)).

### Tier and async-merge accommodations

The default is tier-uniform and assumes sync merge — the integration PR ships and archival
completes before the WU's branch is reused for other work. Tier-specific sweep ceremony
variations (light-ceremony archival for atomic-scale WUs; scaled coordination for larger-scope
WUs) and async-merge accommodations (handoff and cleanup behavior during awaiting-review
latency) are reserved for codification in adjacent strategy work. The default applies uniformly
until those land.

---

## ROADMAP

ROADMAP.md is a rendered artifact derived from `active/**` and `backlog/planned/**` meta files.
The meta files are the source of truth for state, ownership, dependencies, and cohort
membership; ROADMAP is a tier-grouped, topologically-sorted view of those fields.

### Source of truth

`active/**/<wu-name>/meta-<name>.md` and `backlog/planned/**/<wu-name>/meta-<name>.md` carry the
canonical fields ROADMAP renders from:

- `**State:**` — lifecycle phase (`Planning | Active | Integrating | Shipped`)
- `**Owner:**` — single owner (per WU)
- `**Depends On:**` — dependency list (bare WU names; `[none]` if independent)
- `**Cohort:**` — cohort membership (`[none]` for solo WUs)
- Title — H1 of the meta file

ROADMAP's header carries a `Generated from meta files — re-render at ceremony boundaries` note
plus the commit reference of the last regeneration. Edits to ROADMAP without a corresponding
meta-file edit drift from the source of truth and should be avoided.

### Render algorithm

1. Walk `active/**` and `backlog/planned/**` recursively for `meta-*.md` files. The recursive
   glob handles both standalone subdirs (`backlog/planned/<wu-name>/`) and cohort-wrapped
   subdirs (`backlog/planned/<cohort>/<wu-name>/`).
2. Parse `**State:**`, `**Owner:**`, `**Depends On:**`, `**Cohort:**`, and title from each
   meta file.
3. Topologically sort by `**Depends On:**` so dependencies precede dependents in the rendered
   order.
4. Group into tiers: **In Flight** (`State: Active | Integrating`), **Foundation** (planned
   work with no dependencies on other planned work), **Tier 2+** (planned work with planned
   dependencies; ordered by topological depth), **Independent Tracks** (planned work whose
   dependencies have all shipped or are external).
5. Render markdown per tier, with cohort members grouped within their tier.
6. Footer note pointing to `backlog/provisional/` for pre-commitment thinking that hasn't been
   sequenced.

### Regeneration fire-points

ROADMAP regenerates at ceremony boundaries, not on every meta-file edit:

- **WU graduation** (`backlog/provisional/<wu>/` → `backlog/planned/<wu>/`) — adds the WU to
  ROADMAP for the first time.
- **WU activation** (`backlog/planned/<wu>/` → `active/<wu>/`, `State: Planning → Active`) —
  moves the WU from a planned tier to In Flight.
- **WU integration** (`active/<wu>/` → `archive/<dated>/<wu>/`, `State: Integrating → Shipped`)
  — removes the WU from ROADMAP (shipped WUs aren't tracked there).
- **Dependency-field edit** on any planned or active meta file — recomputes the topological
  ordering when `**Depends On:**` changes.

Each ceremony workflow (graduation, activation, integration) carries a regenerate-ROADMAP step,
so ROADMAP stays consistent with meta-file state at every published ceremony commit.

---

## Incidental Work Model

Handling unplanned work that surfaces during a WU — quick inline fixes, atomic tasks, and
mid-execution interrupts requiring their own WU shape — follows the routing rules in
[DEV-RULES.ARC][dev-rules-arc] § Leave it cleaner. For mid-execution interrupts that warrant
a separate WU, see [manage-incidental-work][manage-incidental] for the interrupt protocol;
capture interrupt work on the current branch with clear commit boundaries separating
interrupt commits from primary task commits.

---

## Branch Protection Modes

ARC defines two branch protection modes configured in `.arc/system/arc-config.yml`
(`branch.protection` setting).

### Mode Summary

| Mode                              | Planned Work      | Atomic Tasks / Backlog | Direct Base Branch Commits |
| --------------------------------- | ----------------- | ---------------------- | -------------------------- |
| **Partially protected** (default) | Branches required | Commit directly        | Documented exceptions only |
| **Fully protected**               | Branches required | Micro-branches         | Not allowed                |

### Partially Protected (Default)

Planned work units (feature, technical) require branches — both planning branches for delivering
artifacts and implementation branches for execution. Routine maintenance may commit directly to
the base branch as a documented exception.

**Planning branches:** Required for planned work.

**Documented exceptions** (direct base branch commits allowed):

- Framework maintenance: Documentation updates, linting fixes
- Solo planning artifacts: PRDs, task lists committed directly by the sole author

### Fully Protected

All changes require branches and PR review. No direct base branch commits.

**Planning branches:** Required for all planned work.

**Lifecycle transitions:** Archival, planning, and activation all produce commits that can't go
directly to the base branch. The natural pattern is **batching**: a single branch carries
archival of the completed work unit alongside planning artifacts for the next one, merged via
one PR. This avoids a standalone housekeeping PR for archival alone.

**Branches without work units:** Under full protection, even small atomic fixes need branches.
These branches may not have task lists, PRDs, or other ARC artifacts — they're just branches
with commits and a PR. This is expected. The [integrate-work-unit][integrate-work-unit] workflow
only applies to work units with task lists; branches without artifacts follow standard git
lifecycle (merge, delete). See [manage-incidental-work][manage-incidental] for escalation
guidance on when discovered work warrants a task list vs. a simple branch.

---

## Directory Structure

### Active Work

```text
.arc/active/
  feature/
    prd-<name>.md, tasks-<name>.md, notes-<name>.md,
    atomic-<name>.md, status-<name>.md,
    completion-<name>.md (created before PR)
  technical/
    prd-<name>.md, tasks-<name>.md, notes-<name>.md,
    atomic-<name>.md, status-<name>.md,
    completion-<name>.md (created before PR)
  incidental/
    tasks-<name>.md, notes-<name>.md (optional),
    atomic-<name>.md, status-<name>.md,
    completion-<name>.md (created before PR)
```

### Alignment

Branch, directory, and file naming align consistently:

- **Planned:** Branch `technical/api-modernization` → `.arc/active/technical/` →
  `.arc/reference/archive/{quarter}/technical/{NN}_api-modernization/`
- **Incidental:** Branch `incidental/type-safety` →
  `.arc/active/incidental/` →
  `.arc/reference/archive/{quarter}/incidental/{NN}_type-safety/`

---

## Team Coordination

See [Team Coordination Strategy][team-coordination] — task ownership markers, team branching
patterns, merge conflict expectations, and external tracker integration.

---

## Planning Module

See [Planning Module Strategy](strategy-planning-module.md) **(arc-in-git)** — what arc-in-git
installs, routing and graduation flow, inbox vs. companion file routing, and scaling guidance.

---

[team-coordination]: strategy-team-coordination.md
[activate-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/activate-work-unit.md
[integrate-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[archive-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/archive-work-unit.md
[clean-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/clean-work-unit.md
[manage-incidental]: ../../../system/workflows/arc/supplemental/manage-incidental-work.md
[dev-rules-arc]: ../../constitution/DEV-RULES.ARC.md
[branch-format-method]: ../../../system/methods/branch-format.md
[commit-format-method]: ../../../system/methods/commit-format.md
[cb-spec]: https://conventional-branch.github.io/
