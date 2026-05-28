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
- [Work Character](#work-character)
- [Task Lists and Branches](#task-lists-and-branches)
- [Work Unit State](#work-unit-state)
- [Spec-Flow Invariants](#spec-flow-invariants)
- [Branching](#branching)
- [Per-Worktree Isolation](#per-worktree-isolation)
- [Main-on-Main Pattern](#main-on-main-pattern)
- [WU Artifact Headers](#wu-artifact-headers)
- [Archival](#archival)
- [ROADMAP](#roadmap)
- [Incidental Work Model](#incidental-work-model)
- [Branch Protection Modes](#branch-protection-modes)
- [Errand Work Class](#errand-work-class)
- [Directory Structure](#directory-structure)
- [Team Coordination](#team-coordination) *(→ dedicated strategy)*
- [Planning Module](#planning-module) *(→ dedicated strategy)*

---

## Work Categories

Work units are identified by their branch type prefix (`feat`, `fix`, `chore`, etc.) from the
[`branch-format`][branch-format-method] method's type set. See [§ Branching](#branching) for
the branch model and [`branch-format`][branch-format-method] for the type set and override
mechanism.

---

## Decision Rules

Branch-type selection for a new work unit follows the [`branch-format`][branch-format-method]
method's type set. The method ships per-type semantic guidance (`feat` for new capability,
`fix` for correction, `chore` for routine maintenance, `refactor` for restructuring without
behavior change, `hotfix` for production-issue response) and supports overriding the set
itself.

For routing deferred or discovered work — inline fix vs. atomic task vs. new work unit — see
[DEV-RULES.ARC][dev-rules-arc] § Leave it cleaner.

---

## Work Character

Orthogonal to a work unit's *category* (its branch-type prefix, above) is its *character* — whether the work is
**atomic** or **multi-step**. Character is a routing axis in its own right, and it is *scale-invariant*: the same
distinction sorts inbox items, individual tasks, and whole work units.

- **Atomic** — single-bounded, indivisible, no internal stages: one review increment, fully resolved when its
  commit lands. At the **WU scale** it sets the atomic tier (a `meta-*` and little else); at the **task scale**,
  atomic work surfacing mid-WU folds into the current commit or spins off as an [Errand](#errand-work-class)
  rather than accreting a holding file; at the **item scale**, deferred atomic work lands in an inbox's
  `## Atomic` section.
- **Multi-step** — distinct stages with separate goals; needs decomposition into phases or a task list, and
  (when for-later) matures through the planning pipeline rather than executing as-is.

**Route by character, not by wrapper.** Capture surfaces sort on this axis directly — on what the work *is*, not
on which artifact happened to produce it. That is why inboxes carry character-named sections rather than
surface-named ones, and why the same word ("atomic") stays correct at every scale. For the
during-WU-vs-later routing table, see [DEV-RULES.ARC][dev-rules-arc] § Leave it cleaner.

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

**Per-WU meta file behavior on branches.** Each active WU carries its own
`meta-{name}.md` at `active/`. The file is created by
[activate-work-unit][activate-work-unit] on the WU's branch and deleted by
[archive-work-unit][archive-work-unit] at the end of the WU's lifecycle. Parallel WUs on
independent branches carry different files — no cross-branch mutation conflict is possible at
the meta-file layer. For within-WU team sub-branches sharing one file, see
[Team Coordination Strategy][team-coordination] § Session State Merge Behavior.

Archive triggers when all tasks in the task list are complete, not when any individual branch
is merged or deleted. Branch cleanup happens independently as PRs merge.

---

## Work Unit State

The `**State:**` field on each WU's `meta-{name}.md` is the load-bearing lifecycle marker.
Enum values and optional pointer fields below; workflows listed set each value.

### State Enum

| Value                                          | Set By                                                                          | Meaning                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `In Progress`                                  | [activate-work-unit][activate-work-unit] Step 4; resume from pause              | Active task execution (the common case)                                              |
| `Paused (YYYY-MM-DD) — reason`                 | [manage-incidental-work][manage-incidental]; future arc-shift pause             | Interrupted by an incidental or future arc-shift pause                               |
| `Waiting-For {category} (YYYY-MM-DD) — reason` | Future arc-shift lifecycle                                                      | Blocked awaiting external action (not yet written by any current workflow)           |
| `Complete`                                     | [clean-work-unit][clean-work-unit]                                              | Work done, opened for integration; file is stable through review, deleted at archive |
| `Superseded (partial)`                         | [integrate-work-unit][integrate-work-unit] § Handling Partially Superseded Work | Partial work being integrated; remaining phases absorbed into a successor WU         |

### Optional Pointer Fields

Added to meta files when the WU's state calls for cross-references. Omit otherwise.

| Field                                                     | Appears On                                         | Set By                                                                               |
| --------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `**Superseded By:** tasks-{new-approach}.md (YYYY-MM-DD)` | WU meta files with `State: Superseded (partial)`   | [integrate-work-unit][integrate-work-unit] § Appendix — points to successor WU       |

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
contract — which spec form applies under which combination, whether `draft-*` is required vs.
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

Planning work — discovery, draft-doc iteration, PRD authoring, task generation — runs on a
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

## Main-on-Main Pattern

The **main worktree** — the primary checkout the repository was cloned into — stays on `main`. It is not
a work unit's worktree; it is the stable reference every WU worktree spawns from (see
[§ Per-Worktree Isolation](#per-worktree-isolation)) and the launchpad for work that has no WU branch of
its own: planning entry, stale-worktree sweep, repository-wide edits, and Errand launches (atomic fixes
and other short-lived off-WU work — see [§ Errand Work Class](#errand-work-class)).

ARC defines no separate, dedicated administrative worktree. Admin operations run from the main worktree
directly — keeping `main` checked out there is what makes them safe to launch and gives every spawn a
clean base. The pattern composes with externally spawned worktrees: whatever checkout the tooling treats
as the primary workspace *is* the main worktree, with no extra setup.

### Operational constraint

One worktree per IDE / language-server window. Coordination across worktrees at the editor and
language-server layer is largely outside ARC's control, so the working model is one active worktree per
window rather than machinery to share state across them.

---

## WU Artifact Headers

A WU's tracked artifacts form a chain of authority: an `Origin` (the upstream issue, request,
or discussion that prompted the work), a `Spec` (the artifact defining what to build), a
`Task List` (the execution surface derived from the spec), and a `PR URL` (the integration
record). Each non-meta artifact carries a single 1-hop pointer to its immediate upstream;
`meta-*` carries the full chain.

### Chain of authority

`Origin → Spec → Task List → PR URL`. Each artifact is downstream of its predecessor.
Downstream artifacts name only their immediate upstream in the header; `meta-*` is the only
artifact carrying the full chain end-to-end.

### Per-file header fields

| File      | Header field(s)                                                              | Substantive opening                       |
| --------- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| `meta-*`  | Full chain: `Origin`, `Design`, `Task List`, plus `PR URL` after integration | (none — meta is structural)               |
| `draft-*` | `**Origin:**` (default `[Internal]`)                                         | `**Purpose:**` follows as document thesis |
| `spec-*`  | `**Origin:**` (default `[Internal]`)                                         | `**Purpose:**` follows as document thesis |
| `tasks-*` | `**Design:**` (the upstream spec artifact)                                   | (no thesis — derived execution surface)   |
| `notes-*` | (none — companion to the entire WU; no formal upstream)                      | (free-form content)                       |

### Bounded duplication and drift cost

Each non-meta artifact carries exactly one 1-hop upstream pointer — no two-hop or full-chain
duplication outside `meta-*`. The pointer values that do appear in more than one place are
structurally immutable:

- `Origin` appears on `meta-*`, `draft-*`, and `spec-*`. The value is set at WU creation and
  effectively never changes.
- `Spec` appears on `meta-*` and `tasks-*`. The `tasks-*` value is fixed at task-list
  creation; `meta-*`'s value transitions exactly once (at activation, from `draft-*` to the
  spec artifact). Both positions are immutable post-set.

Drift risk across the redundant positions is therefore near-zero. `meta-*` retains authority
as the only artifact holding the full chain at any state of the WU lifecycle — reading
`meta-*` alone gives a complete trace from origin to delivered PR.

Non-meta artifacts also remain **self-describing in isolation**: opening any of them cold
tells the reader its immediate authority (`Origin` for plan/prd, `Spec` for tasks) without
first having to consult `meta-*`.

### `Spec` field generalizability

`**Design:**` names the upstream spec artifact regardless of artifact type. The default ARC
pipeline pairs each WU with a PRD (`spec-*.md`) as its spec, but the field name does not lock
to "PRD." Projects may pair WUs with lighter-templated specs — compact PRDs, scope-section
variants, external-tracker-referenced specs — and `**Design:**` still names whichever artifact
carries the spec for that WU.

### Purpose statement lives on the spec

The WU's purpose statement is substantive content, not an upstream pointer. It lives once on
the spec artifact (PRD by default) and not on `tasks-*` — duplicating it would carry a prose
field rather than a 1-hop pointer, a substantially larger drift surface than the
effectively-immutable pointer values above. Readers of `tasks-*` reach the purpose statement
via the `**Design:**` pointer.

---

## Archival

WU archival is the file-move ceremony that retires a shipped WU from `active/` to `completed/`.
Archival rides on the integration PR by default (sweep-as-you-go), keeping the WU's entire
lifecycle on one branch through one merge.

### Sweep-as-you-go default

`archive.cadence` in `arc-config.yml` controls when the file-move sweep fires:

- **`with-integration`** (default) — sweep commits ride on the integration PR; the WU's meta
  file and any companions move from `active/` to `completed/<dated>/<NN>_<wu-name>/` as part of the
  same merge that ships the code.
- **`manual`** — sweep fires only on explicit invocation; no automatic ceremony coupling.

Under `with-integration`, the integration PR carries a multi-commit structure: code commits →
completion content (Release Notes Entry + Completion Notes composed into the meta file) → sweep
commits (file moves from `active/` to `completed/<dated>/<NN>_<wu-name>/`). Reviewers focus per-commit.

See [integrate-work-unit.md][integrate-work-unit] and [archive-work-unit.md][archive-work-unit]
for the full ceremony workflows.

### Archive directory shape

```text
.arc/completed/<dated>/
  <NN>_<wu-name>/
    meta-*.md, spec-*.md, tasks-*.md, notes-*.md, ...
```

Each shipped WU gets its own subdir directly under the temporal grouping. The `<dated>` segment
follows a `<YYYY-q*>` convention (e.g., `2026-q2/`); the `<NN>` prefix is a 2-digit completion-order
index assigned at archival, reset per `<dated>` subdir (the next index after the highest already
present). It gives a browse-time "by completion order" view — `ls completed/<quarter>/` lists WUs in the
order they shipped, which a plain alphabetical sort would scramble. The subdir contains all WU artifacts
that existed at integration time, symmetric with the backlog's per-WU subdir convention (see
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

ROADMAP.md is a rendered artifact derived from `active/**` and `backlog/planned/**` meta files — a
**readiness and dependency view**: what is in flight, what is ready to start, and what is blocked and
on what. It is **not a priority ordering**. Relative importance and what to pick up next are
project-governance and session/PM concerns, not properties derivable from meta-file state; the only
assignment signal the view carries is `**Owner:**`. The meta files are the source of truth for state,
ownership, dependencies, and cohort membership; ROADMAP is a tiered, dependency-ordered projection of
those fields, with each WU rendered by its canonical WU-name.

### Source of truth

`active/**/<wu-name>/meta-<name>.md` and `backlog/planned/**/<wu-name>/meta-<name>.md` carry the
canonical fields ROADMAP renders from:

- `**State:**` — lifecycle phase (`Planning | Active | Integrating | Shipped`)
- `**Owner:**` — single owner (per WU)
- `**Depends On:**` — dependency list (bare WU names; `[none]` if independent)
- `**Cohort:**` — cohort membership (`[none]` for solo WUs)

Each WU renders under its **canonical WU-name** — the `<wu-name>` token from its directory and
`meta-<wu-name>.md` filename, the same token `**Depends On:**` entries reference. Keying on the
WU-name rather than the meta-file title keeps the render greppable and isomorphic with the source.

ROADMAP's header carries a `Generated from meta files — re-render at ceremony boundaries` note plus
the commit reference of the last regeneration. Edits to ROADMAP without a corresponding meta-file
edit drift from the source of truth and should be avoided.

### Dependency satisfaction by absence

A WU's listed dependency is **satisfied** once its target has shipped — resolved at render time by
the target's **absence** from the `active/` + `backlog/` pipeline (a shipped WU has moved on to
`completed/`). Two consequences follow from resolving satisfaction this way:

- `**Depends On:**` entries are never pruned when a target ships — the target simply stops appearing
  in the scanned set, and the next render reflects it.
- Ceremony workflows never reach into dependents' meta files: a WU shipping flips its dependents from
  Blocked to Ready at the next regen, with no fan-out edits to shared state.

### Render algorithm

1. Walk `active/**` and `backlog/planned/**` recursively for `meta-*.md` files — the **render set**.
   The recursive glob handles both standalone subdirs (`backlog/planned/<wu-name>/`) and
   cohort-wrapped subdirs (`backlog/planned/<cohort>/<wu-name>/`).
2. Parse `**State:**`, `**Owner:**`, `**Depends On:**`, and `**Cohort:**` from each meta file.
3. Resolve each `**Depends On:**` entry against the `active/` + `backlog/` set (planned and
   provisional): a target still present is unsatisfied; an absent target is satisfied (shipped).
4. Group into three tiers:
    - **In Flight** — `State: Active | Integrating`.
    - **Ready** — planned work with no unsatisfied dependencies (deps all shipped, or none to begin
      with).
    - **Blocked** — planned work with at least one unsatisfied dependency, banded by dependency
      depth (shallowest first) so each WU follows the deps it waits on.
5. Render each tier as a markdown table, splitting **Blocked** into one table per depth band (`Depth 1`,
   `Depth 2`, …). Columns: **Work unit** (the canonical WU-name) · **Owner** · **Depends on** ·
   **Cohort**, with an em-dash (`—`) for empty cells. Within a tier or band, order rows to cluster
   cohort members (by cohort, then WU-name), and pad columns to shared widths so the raw tables align.
6. Footer note pointing to `backlog/provisional/` for pre-commitment thinking that hasn't been
   sequenced.

### Regeneration fire-points

ROADMAP regenerates at the events that change its render inputs — not on every meta-file edit. Each
regeneration re-reads current state, so a regen reflects whatever changed since the last one.

**Ceremony-wired** — the lifecycle workflow that owns the transition carries a regenerate-ROADMAP
step, so these need no separate discipline:

- **Activation** (`backlog/planned/<wu>/` → `active/<wu>/`, `State: Planning → Active`) — moves the WU
  into In Flight.
- **Integration / archive** (`active/<wu>/` → `completed/<dated>/<wu>/`, `State: Integrating →
  Shipped`) — drops the WU from the render set; by the same absence its dependents re-evaluate from
  Blocked to Ready, with no edits to their meta files.
- **Deactivation** (`active/<wu>/` abandoned) — drops the WU from the render set.

Because each re-renders from current state, these ceremonies also **self-heal** any manual trigger
missed since the previous one.

**Manual discipline** — these change a render input but have no ceremony workflow to carry the step,
so re-render by hand (per § Render algorithm) when you make the change:

- **Backlog membership** — graduation (`backlog/provisional/<wu>/` → `backlog/planned/<wu>/`) adds a
  WU to the render; demotion (the reverse) and creating a stub directly in `backlog/planned/` likewise
  change the render set.
- **Render-field edits** on a planned or active meta — a `**Depends On:**` change re-tiers the WU
  between Ready and Blocked; `**Owner:**` and `**Cohort:**` changes alter the owner column and
  within-tier grouping. These are ordinary file edits, not ceremonies, so nothing else prompts the
  re-render.

A skipped manual re-render is bounded, not permanent: the next ceremony-wired regeneration sweeps the
ROADMAP back into agreement with meta-file state.

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

Planned work units require a branch from inception (single-branch-per-WU per
[§ Branching](#branching)). Routine commits may go directly to the base branch as documented
exceptions:

- Framework maintenance: documentation updates, linting fixes
- Off-work-unit maintenance commits (no associated task list or work-unit branch)

### Fully Protected

All changes require branches and PR review. No direct base branch commits.

---

## Errand Work Class

ARC defines two work classes that share commit and review machinery but differ in tracking and lifecycle:

- **Work Unit (WU)** — a bounded chunk of design-bearing or trackable work with its own branch, a
  `meta-{name}.md`, a lifecycle (Planning → Active → Integrating → Shipped), and one PR. Activated via the
  planning entry point (spawn or cold-start; see [§ Branching](#branching)).
- **Errand** — a single review increment fully consumed when its commit lands. No meta, no lifecycle, no name
  as a WU. Tracked by git history (Conventional Commits + the `standalone (...)` context footer — see
  [`commit-footer`][commit-footer-method]), not by the planning layer (ROADMAP, backlog, `active/`).

### Threshold

Use a Work Unit when *any* of these hold:

1. The work spans **more than one review increment** (multiple logical commits / internal sequencing).
2. It carries **design that must be authored and referenced** (a Spec).
3. It must be **tracked or resumed** as future or owned work (a roadmap slot, dependencies, an owner, a
   cross-session lifecycle).

None of these → it is an Errand. As an empirical *symptom* check (not the primary criterion), a candidate
Errand that cannot be reviewed in one window (~400 lines / ~60 minutes) is almost certainly multi-increment,
so treat it as a Work Unit.

**Create vs. maintain.** *Creating* a new tracked unit of future work — a backlog stub — is a (small) Work
Unit even when it is one commit, because its output is a tracked deliverable with a meta file. *Maintaining*
an existing artifact — a dependency note, a cross-reference, a doc fix — is an Errand.

### Cheap-branch path

The cheap-branch mechanism lands an Errand without WU machinery. Behavior depends on protection mode (see
[§ Branch Protection Modes](#branch-protection-modes)):

- **Partially protected:** an Errand commits directly to the base branch (the documented off-WU-maintenance
  path).
- **Fully protected:** an Errand uses a short-lived ephemeral branch with a `chore`-type prefix (per
  [`branch-format`][branch-format-method]) plus a PR. The branch exists only long enough for review and
  merge, then is torn down. It is not a planning branch, carries no meta, and never enters lifecycle.

Either way, the work is tracked by its commit's `standalone (...)` context footer (vocabulary:
`maintenance | planning | documentation | refactor`; see [`commit-footer`][commit-footer-method]) rather than
by an `active/` entry.

### Entry path

An Errand launches from the **main worktree** (see [§ Main-on-Main Pattern](#main-on-main-pattern)). The
Errand is initiated by starting a fresh session there on a new `chore`-type branch (under full protection)
or directly against the base branch (under partial). It does
not invoke planning entry — spawn and cold-start scaffold meta files and lifecycles, which an Errand has
neither of. The Errand mints no `active/` artifact and produces no orientation surface; it ships, is recorded
by git history through its commit footer, and tears down.

---

## Directory Structure

### Active Work

```text
.arc/active/
  meta-<name>.md         # WU metadata + state (always present)
  prd-<name>.md          # product requirements (when WU has a PRD)
  tasks-<name>.md        # execution spec (when WU has a task list)
  notes-<name>.md        # working context (optional; may carry content graduated from draft-*)
```

`active/` is flat — per-worktree isolation (see [§ Per-Worktree Isolation](#per-worktree-isolation))
means each worktree's `active/` carries one WU's artifacts at a time, so per-WU and per-category
subdirs would be redundant. Artifact applicability scales with mode and tier; see
[§ Spec-Flow Invariants](#spec-flow-invariants) for the invariants and scaling axes. `draft-*.md` is
the pre-PRD synthesis artifact, deleted at PRD creation per `1_create-spec.md` (with optional
graduation of substantive persisting content into `notes-*.md`); it never appears in `active/`.
Archive-phase content (Release Notes Entry, Completion Notes, PR URL, Completed date) composes into
the meta file at integration — there is no separate `completion-<name>.md` artifact.

### Alignment

Branch name and completed subdirectory share the WU identifier:

- Branch `feat/api-modernization` → completed in `.arc/completed/<dated>/api-modernization/`

---

## Team Coordination

See [Team Coordination Strategy][team-coordination] — task ownership markers, team branching
patterns, merge conflict expectations, and external tracker integration.

---

## Planning Module

See [Planning Module Strategy](strategy-planning-module.md) **(arc-in-git)** — what arc-in-git
installs, routing and graduation flow, inbox routing, and scaling guidance.

---

[team-coordination]: strategy-team-coordination.md
[activate-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/activate-work-unit.md
[integrate-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[archive-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/archive-work-unit.md
[clean-work-unit]: ../../../system/workflows/arc/supplemental/clean-work-unit.md
[manage-incidental]: ../../../system/workflows/arc/supplemental/manage-incidental-work.md
[dev-rules-arc]: ../../../system/rules/DEV-RULES.ARC.md
[branch-format-method]: ../../../system/methods/branch-format.md
[commit-footer-method]: ../../../system/methods/commit-footer.md
[commit-format-method]: ../../../system/methods/commit-format.md
[cb-spec]: https://conventional-branch.github.io/
