# Plan: Agile WU Lifecycle

**Purpose:** Introduce a three-tier work-unit model (atomic / quick / standard) with structurally
differentiated artifact requirements and invariant execution discipline. Make small bounded work
fast to spin up and ship, while preserving ARC's spec-directed, review-disciplined character. Closes
the agility gap where ARC's uniform ceremony costs more than the work for short-lived WUs.

- **State:** Draft — pre-PRD exploration captured during agile/mobility design discussion 2026-04-28.
  Three-tier model and constitutional reframing identified; external research and PRD-time
  ratification expected. Updated 2026-05-08: sweep-as-you-go foundation (formerly scope item 7a's
  load-bearing pieces) moved to upstream Work Organization Reform WU; this WU retains
  tier-aware adaptations on top. Updated 2026-05-19 with WOR-induced terminology shifts (see
  § WOR alignment note below).

- **Created:** 2026-04-28 (terminology refresh 2026-05-19)

## WOR alignment note (2026-05-19)

WOR R66-R68 renames WU artifact prefixes (`plan-*` → `draft-*`, `prd-*` → `spec-*`) and meta-file
fields (`**Spec:**` → `**Design:**`, `**Task List:**` → `**Blueprint:**`). Spec form variation
routes through template choice under the unified `spec-*` filename — `template-prd.md` preserved as
heaviest variant; lighter variants (e.g., `template-brief.md`) deferred to `plan-arc-plan-conductor`
WU scope.

Comprehensive content sweep of this plan defers to WU activation (Activation Audit pattern).
Readers today should substitute terms inline.

Substantive AWL-specific implications (captured here):

1. **Tier ↔ spec-form coupling is a conductor-WU decision, not AWL's.** This plan's § Three-Tier
   Model table currently couples tier to spec form (atomic: none; quick: task-list `## Scope`;
   standard: full PRD). Per WOR follow-on planning (2026-05-19 session), that coupling is now an
   **open conductor-WU question** — the alternative (user picks form per WU, decoupled from tier)
   is on the table. AWL should defer to conductor's resolution rather than encoding coupling here.
   PRD-time: align with whatever conductor lands.
2. **Quick-tier spec shape — partially superseded.** § Open Questions § "Quick-tier spec shape —
   task-list header vs reduced PRD doc" narrows under WOR's variant model. The remaining question
   is "which template variant does quick default to?" — not "does quick have a spec doc?" The
   default-to-spec-doc-with-form-variant answer is the WOR-aligned shape; the exact form (brief,
   compact-PRD, etc.) decides at conductor PRD time.
3. **Atomic-tier spec — binary at conductor PRD time.** Per WOR follow-on planning: atomic either
   gets a required-and-tiny spec (one-paragraph form) OR no spec at all. Not optional. Resolution
   defers to conductor WU's PRD.
4. **Meta-file field values** (current scope item 3) — under WOR rename, `**Spec:**` field becomes
   `**Design:**`; values become `draft-{name}.md` (Planning), `spec-{name}.md` (Active+). Form
   variation (PRD vs brief vs etc.) lives in template choice + H1, not in filename. Update scope
   item 3's value examples accordingly at WU activation.

- **Origin:** Surfaced during the agile/mobility expansion discussion when Worktree
  Foundation (mechanism) and Concurrent Work Conventions (conventions) were carved out
  of the original Work-Unit Mobility WU. The agility gap — small bounded work paying full ceremony
  cost — emerged as a third concern alongside concurrency. Solo-dev sequential work patterns shaped
  ARC's current uniform ceremony, which doesn't fit team practice where small WUs are spun up and
  shipped constantly.

---

## Problem / Motivation

ARC's WU ceremony is uniform regardless of WU size. A 30-minute fix and a 6-week feature go through
the same activate/integrate/archive pipeline. For small bounded work, that ceremony costs more than
the work itself.

Current "lighter" options fall short:

- **`incidental/` category** — documented as the lighter tier, but workflows are identical to
  feature/technical. The "lightening" is mostly about scope (no PRD/plan needed), not ceremony.
- **Lightweight completion-doc template** — exists, but only saves doc time at integration; doesn't
  reduce activation or task-list overhead.
- **Atomic work** (atomic companion + ATOMIC-INBOX) — bypasses WU lifecycle entirely. But the
  boundary is "smaller than warrants a branch" — under `branch.protection: full` (the default for
  most teams), most reviewable work needs a branch and therefore a WU.
- **`branch.protection: partial`** — allows direct-to-main commits for atomic work, but that's not
  what teams using PR review do.

For an experienced dev's "spin up a branch for a small bug, work, PR, merge" pattern under `full`
protection, there's no lightweight path. Every branch becomes a WU; every WU gets full ceremony.

This WU introduces a tiered model where ceremony scales with the work's actual scope, while
execution discipline (mandatory stops, quality gates, commit format) stays invariant.

---

## Working Thesis: Tiered Artifacts, Invariant Execution Discipline

ARC's value is in **structural enforcement of execution discipline**: mandatory stops at task
completion, quality gates per tier, atomic commits with format and context-footer enforcement,
PR review for shared branches. That discipline drives quality and is invariant across all WU sizes.

What scales with WU size is **artifact ceremony**: planning artifacts (plan-*, PRD), task structure
(phased vs flat vs none), and archival artifacts (completion doc vs PR description).

This framing **explicitly answers the `plan-arc-modes.md` § Mode 1 rejection** of the
"Required vs Available" model. That rejection was about making *execution discipline* optional — task
interlocks removed, quality gates skipped, "trust the dev." This WU does none of that: execution
discipline is enforced at every tier. What varies is where the spec lives, how tasks are organized,
and how the work is archived. Those are scaling-dependent ceremony, not discipline.

---

## Three-Tier Model

| Tier         | Planning artifacts                                   | Task structure                             | Verification                                         | Archive                  |
|--------------|------------------------------------------------------|--------------------------------------------|------------------------------------------------------|--------------------------|
| **atomic**   | None                                                 | None (work IS the task)                    | Per-commit T1 gates                                  | PR description           |
| **quick**    | None (spec via task list header or compact PRD)      | Flat task list (no phases)                 | Tasks complete + T2 gates                            | PR description           |
| **standard** | plan-\* + PRD                                        | Phased task list (with verification phase) | PRD success criteria + verification phase + T3 gates | Completion doc + archive |

### Boundary tests (objective)

**Atomic vs Quick:** *"Does this work need multiple coordinated commits to do well?"*

- Yes → quick (multi-commit means tasks)
- No → atomic (single concern, single commit)

**Quick vs Standard:** *"Could a competent engineer execute this work from the existing description
(issue/ticket/bug/pattern) without writing additional design before they start?"*

- Yes → quick (design space settled, spec is sufficient)
- No → standard (design space open, PRD required)

The Quick-vs-Standard test is the **design-doc boundary** — well-trodden ground in industry practice
(Stripe RFC criteria, Google design doc guidance, Basecamp Shape Up's "shaping" tier, GitLab MR-
driven workflow). The boundary is recognizable in retrospect: when work classified as quick starts
needing design notes, alternatives, or success-criteria specification, it's promoting to standard.

### Promotion is one-way

The system is asymmetric: easy promotion (atomic → quick → standard adds artifacts), no demotion
(standard → quick would discard work). Standard tier WUs that turn out smaller than expected just
complete against their existing artifacts; over-specification is harmless. Quick tier WUs that grow
get promoted: add the plan-*/PRD, restructure the task list into phases, continue.

---

## Scope

### In scope

1. **Three-tier WU model** with structural differentiation per the table above. Constitutional
   amendment to [DEV-RULES.ARC][dev-rules] establishing tier definitions, boundary tests, and the
   tiered-artifacts/invariant-discipline framing. Companion ADR documenting the constitutional
   shift (parallel scale to ADR-016).

2. **`**Tier:**` field on every meta file** — source of truth, declared at activation. Existing
   in-flight WUs migrate to `**Tier: standard**` (matches their current ceremony level).

3. **`**Spec:**` field on every meta file** — pointer to where the work's specification lives.
   **Field introduction is upstream:** `**Spec:**` is introduced as a generic optional pointer in
   Session-Operational Flow Phase 1 (planning-session active surface scope, with
   `**Spec:** plan-{name}.md` value). This WU adds tier-specific value semantics and tier-aware
   validation on top of the already-introduced field.

   **Orthogonality with `**Origin:**`** (per WOR's Origin ⊥ Spec design decision): `**Spec:**`
   always points at an ARC-owned planning artifact. External trackers (GitHub issues, Jira, Linear)
   go in `**Origin:**`, never `**Spec:**`. The two fields are independent — a quick-tier WU can have
   an external `**Origin:**` and an internal `**Spec:** tasks-{name}.md`.

   Values:
    - `**Spec:** plan-{name}.md` — planning state (introduced upstream)
    - `**Spec:** prd-{name}.md` — standard tier, in-repo PRD
    - `**Spec:** tasks-{name}.md` — quick tier under `pm.layer: arc-pm`, points to Scope section in
      the task list header (or to a compact PRD doc — see open question below)
    - omitted for atomic — work is self-evident from PR description; `**Origin:**` carries any
      external-tracker reference

4. **`arc start <name>` command** for fast WU activation. Bounded subset of post-WOR
   `activate-work-unit.md` workflow — same logic, faster invocation. Flags:
    - `--tier atomic | quick | standard` (default: `quick`)
    - `--type <conventional-commit-type>` (default: `feat`; per Work Organization Reform's
      Conventional Branch alignment — `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, etc.)
    - `--branch <branch>` (override default `<type>/<name>`)
    - `--spec <path-or-url>` (sets the Spec field)

   Standard tier reached via the planning workflow path (plan → PRD → activate), not via
   `arc start`.

   **Composition with the cold-start primitive (`plan-worktree-foundation.md` item 11).**
   `arc start` is the spawn-from-existing-session entry point — it creates the worktree (when
   applicable per tier), scaffolds the meta file, and reports the new worktree path so a fresh
   session can pick up via the cold-start primitive. Adopters working in tool-spawned worktrees
   (Conductor, emdash, Maestro, Warp, Worktrunk, Zed, etc.) skip `arc start` and invoke the
   cold-start primitive directly inside the tool-created worktree — same scaffolding logic,
   different entry point. Both paths converge once the meta file is written.

5. **Quick-tier task list shape.** Flat task list (no phases). Required `## Scope` prose section at
   the top (3-5 sentences, bounded by convention) when no external `**Spec:**` is set — fills the
   internal-spec gap under `pm.layer: arc-pm`. New section in [strategy-task-list-formatting.md][
   tasklist-fmt] § Quick Tier.

6. **Atomic-tier WU shape.** No task list. Meta file minimal (Tier, State, Branch, Origin). Execution
   discipline preserved at commit boundaries: each commit IS a review increment with mandatory stop.
   Quality gates: T1 per commit. PR description as archive.

7. **Ceremony scaling for activate / integrate / archive workflows.** Tier-aware branches in each
   workflow, layered on top of Work Organization Reform's consolidated boundary workflows
   and sweep-as-you-go foundation:
    - `activate-work-unit.md` (post-WOR shape — state-transition workflow, not branch creation):
      skip plan/PRD checks for atomic and quick; require for standard. Standard tier path
      inherits Work Organization Reform's planning-checkpoint opt-in
      (`review.planning_checkpoint` config + `pre-execution-graduation` extension) at the
      state-transition fire-site; atomic and quick tiers bypass the planning workflow entirely
      (via `arc start`), so the checkpoint doesn't apply to them.
    - `integrate-work-unit.md` (post-WOR shape — single integration boundary with sweep-as-you-go
      bundled): skip clean-work-unit and completion-doc steps for atomic; lightweight for quick
      (PR description as archive); full ceremony for standard. Integration-time updates include
      the `**Integration:**` field per metadata-state model and a one-line ROADMAP/PROJECT-STATUS
      touch (one WU's status line) — tracking docs are current at merge, not stale until sweep.
    - `archive-work-unit.md`: shape depends on Work Organization Reform's resolution of
      the default `archive.cadence` open question. Under `with-integration` default (current
      lean), this workflow collapses into `integrate-work-unit.md`; under `deferred` default, it
      retains its current shape as a separate post-integration ceremony. Tier-aware sweep
      ceremony applies in both cadences; the cadence-default decision affects the workflow's
      existence-as-separate-doc, not the tier-awareness logic itself.

7a. **Tier-aware adaptations on top of WOR's foundation.** Implements Session-Operational Flow
    § Scope → "Metadata-state foundation for WU lifecycle" against the actual lifecycle workflows,
    consuming Work Organization Reform's sweep-as-you-go foundation. Concrete deliverables
    that remain in this WU's scope (post-2026-05-08 split):

    - **State + Integration field rollout.** `**State:**` enum:
      `Planning | In Progress | Complete | Paused | Superseded` (`Planning` introduced upstream in
      Session-Operational Flow Phase 1; this WU operates on the post-introduction
      enum); optional `**Integration:** Merged` marker added to template-status. Workflow updates
      compose with WOR's consolidated boundaries: `clean-work-unit.md` Mode 2 sets State to
      Complete (current); PR review state remains in the PR; archival marks Integration as Merged
      before moving files.
    - **Tier-aware sweep ceremony.** Atomic WUs: trivial sweep (single meta file delete in
      integration PR). Quick: standard sweep. Standard: full sweep with ROADMAP/PROJECT-STATUS
      updates. Layered on top of WOR's sweep-as-you-go shape.
    - **CodeRabbit-flagged contradictoriness fix.** `State: Complete` + integration-step
      `Next Action` no longer reads as contradictory; `Integration:` field carries the in-flight
      workflow position cleanly separated from execution-state.

    **Moved to Work Organization Reform** (load-bearing for per-worktree isolation; not
    tier-specific):

    - Sweep cadence configuration (`archive.cadence` config key)
    - Sweep-as-you-go integration PR shape (code → completion → status flip → sweep commit
      ordering)
    - Deferred sweep variant (integration PR omits sweep; archive batches with next-WU planning)
    - Per-worktree isolation invariant (meta file on WU branch only, not on main while in
      flight)

8. **Atomic companion file retirement (or repurposing).** With cheap atomic-WU spin-up, the
   companion's "holding area before decision" role largely evaporates — noticed → fold into commit
   OR spin up atomic WU OR backlog. Open question: retire entirely or repurpose as session-scoped
   "noticed-pending-decision" capture that drains at handoff. PRD-time question.

9. **Incidental concept retirement.** With shift lifecycle handling "unplanned, interrupts another
   WU" and the tier model handling "lighter ceremony," the incidental concept becomes redundant.
   Work Organization Reform retires the `incidental/` category prefix as part of its
   broader category-prefix retirement (`feature/` / `technical/` / `incidental/` → Conventional
   Branch alignment); this WU retires the remaining conceptual references in workflows, strategy
   docs, and templates that frame incidental as a distinct WU shape. Mechanical sweep across
   those surfaces. (The pointer-field migration is Worktree Foundation scope; the
   conceptual retirement lands here.)

10. **Documentation cascade.** [DEV-RULES.ARC][dev-rules] tier definitions and boundary tests;
    [strategy-task-list-formatting.md][tasklist-fmt] tier-aware task list shapes;
    [strategy-work-organization.md][strategy-work-org] tier integration with categories and branch
    naming, plus § Spec-Flow Invariants updates — name AWL in § Deferred contract as the
    tier-classification model home, and replace § Escape-hatch guardrails intent-level phrasing
    with concrete `--tier atomic` flag default (currently abstracted pending this WU per
    audience-boundary discipline); [template-meta.md][template-meta] new fields;
    [template-tasks.md][template-tasks] quick-tier shape variant; quality-gate-commands method
    tier awareness.

### Out of scope

- **Worktree mechanism and shift lifecycle** — Worktree Foundation.
- **Focus-role model and concurrent-work conventions** — Concurrent Work Conventions.
- **Tier-aware quality gate scaling beyond T1/T2/T3 split per tier table** — defer detailed gate
  tier mapping to Quality Gate Tiers and Hook Integration WU. This WU establishes that
  tiers exist; gate-tier mapping per WU tier is the gate-tiers WU's PRD work.
- **Auto-promotion of tier based on commit count or duration thresholds.** Manual promotion only.
  Structural-detection nudges (warnings) may be considered at PRD time but auto-promotion is too
  aggressive — promotes work the user hasn't classified.
- **Demotion paths.** No demotion; standard tier WUs complete against their artifacts.
- **Atomic-tier workflow generation tooling.** The atomic tier is intentionally workflow-light;
  scaffolding tooling would defeat the purpose.

---

## Design Decisions

### Tier as structural differentiation, not opt-in optionality

Each tier has a distinct artifact shape — atomic has no tasks, quick has flat tasks no PRD, standard
has phased tasks plus PRD. This is structural, not "skip optional steps." Reviewers, agents, and
tooling can detect tier from artifact presence and the explicit `**Tier:**` field; they don't need to
reason about which optional steps were skipped.

### Default tier at `arc start` is `quick`, not `atomic`

`quick` is the median case for "I'm spinning up a WU." Defaulting to `atomic` would push every "I'll
just fix this quickly" into the smallest ceremony tier, where growth becomes awkward (promotion
required mid-work). Defaulting to `quick` accepts one extra Tier-field declaration for trivial work
in exchange for safer scaling. Atomic is opt-in (`--tier atomic`) for declared-tiny single-commit
work.

### Quick-tier scope section is prose, not frontmatter

Frontmatter is for metadata; the scope is content. A `## Scope` prose section at the top of the
quick-tier task list is human-readable, version-controlled, naturally bounded by convention. The
scope section is the in-repo spec surface regardless of whether an external tracker is the WU's
Origin — under WOR's Origin ⊥ Spec orthogonality, external trackers go in `**Origin:**`, not
`**Spec:**`, and the internal spec always lives in an ARC-owned artifact.

### Atomic tier preserves task discipline at commit boundaries

The mandatory stop after each task — ARC's core review-increment discipline — applies at atomic
tier too, just at commit boundaries instead of task-list-checkbox boundaries. Each commit is a
review increment; quality gates run per commit; the user reviews and confirms before the next
commit. Execution discipline preserved; task-list ceremony stripped.

### Incidental retirement, not repurposing

The incidental category was a workaround for ARC not having mobility infrastructure. With shift
lifecycle handling interrupts and tier model handling lighter ceremony, the category has no
remaining function. Renaming or repurposing would create migration confusion; clean retirement is
simpler. Workflows that reference incidental migrate to use shift state and tier instead.

### Atomic-the-character vs atomic-the-shape

"Atomic" describes the work's character (single bounded concern). The shape it takes adapts to
protection mode: under `partial`, atomic work goes direct-to-main with no branch or meta file;
under `full`, the same atomic intent becomes an atomic-tier WU with branch, minimal meta file, and
PR. The word's meaning is consistent across modes; the framework's shape adapts.

**Towards — atomic-tier WU init shape (surfaced 2026-05-20 during WOR Task 6.7.c):** WOR ships
`init-work-unit.md` as planning-only — Step 2 hardcodes `git checkout -b plan/{name}` and Step 4
sets `**State:** Planning`. Under WOR-as-shipped, an atomic-tier WU under `full` protection has
no codified init workflow that skips Planning; the meta file gets hand-created with
`**State:** Active` on a `<type>/<name>` branch. This WU's `arc start <name>` command (scope item
4) is the natural home for that path — decide at PRD time whether `arc start` covers atomic-tier
init directly (no Planning → Active transition), whether `init-work-unit.md` evolves to accept a
life-phase parameter (Planning vs Active → branch-prefix follows), or whether the conductor
(`plan-arc-plan-conductor.md`) absorbs both shapes. Surfaced during WOR's cross-reference sweep
when reframing `2_generate-tasks.md`'s pre-WOR "directly-on-base-branch" bifurcation — that
workflow narrowed under WOR to the canonical planning-life-phase flow only.

---

## Dependencies and Sequencing

### Upstream

- **Work Organization Reform:** delivers the consolidated boundary workflows (single
  activate/integrate pair under single-branch-per-WU lifecycle), sweep-as-you-go foundation, and
  per-worktree isolation invariant. This WU's tier-aware adaptations layer on top. Hard upstream
  dependency.
- **Worktree Foundation:** clean activate/integrate workflows post-pointer-field retirement;
  the tier model's `arc start` command operates on the worktree-aware activation substrate. Pointer
  fields are retired in WF; the incidental category retirement here folds in cleanly afterward.
- **Session-Operational Flow** (shipped): consumes Phase 7 (metadata-state foundation —
  State + Integration field model). Sweep cadence config moved to WOR; this WU consumes it. Phase 2
  (meta-file timing split) also informs which fields belong on commit vs handoff.

### Downstream

- **Concurrent Work Conventions:** tier model informs concurrency conventions (focus-role
  model probably doesn't apply to atomic tier; quick-tier WUs are short-lived enough that focus
  designation is less meaningful).
- **Quality Gate Tiers and Hook Integration:** gate-tier mapping per WU tier is that
  WU's PRD work; this WU establishes that tiers exist.
- **ARCd Rebrand:** tier vocabulary absorbed into rename pass.

### Recommended sequencing

Work Organization Reform → Worktree Foundation → (CLI Substrate Adoption ‖ arc-plan Conductor ‖
Coord Probe — post-WF parallel candidates) → **Agile WU Lifecycle** → Concurrent Work Conventions.
Per 2026-05-20 resequence, this WU sequences after the post-WF parallel layer settles; benefits
especially from arc-plan Conductor's tier-aware orchestration integration if Conductor ships
first, but degrades gracefully if not (Conductor defaults to standard-tier behavior until this
WU's `**Tier:**` field exists).

---

## Pressure Points and Risks

### Tier drift via under-specification

Adopters may default to `quick` for everything to avoid PRD ceremony, even when work is genuinely
standard-tier. Mitigation:

- Boundary test ("does this need a written design document?") is recognizable in retrospect — when
  design notes start accumulating, promotion is the signal
- Explicit `**Tier:**` field invites scrutiny: a reviewer reading "Tier: quick" on a complex change
  has the explicit signal to push back
- Strategy doc guidance with concrete examples on each side of the boundary

### Constitutional change scope

Tier definitions, boundary tests, and tiered-artifacts/invariant-discipline framing are
constitutional-level additions to DEV-RULES.ARC. Scope is comparable to ADR-016's commit-control
downgrade. Companion ADR required to document the architectural shift.

### Incidental retirement ripple

Retiring the incidental category affects every reference: workflows, strategies, status template,
branch-prefix conventions, examples. Mechanical sweep but broad. Risk: orphaned references that
lint/CI doesn't catch. Mitigation: thorough grep + integration test coverage on activation /
integration / archive flows.

### `arc start` command novelty

ARC currently has no activation command — activation is workflow-based. Adding `arc start` is a
real shift. Counter-argument: every CLI subcommand adds maintenance, docs, discoverability burden.
Resolution: `arc start` IS the workflow's automation for the bounded quick-tier case. The workflow
document (`activate-work-unit.md`) stays as canonical specification; the command is its packaged
form. Adopters using defaults run the command; adopters deviating read the workflow.

### Atomic-tier discoverability

If atomic tier WUs have minimal meta files and short lifetimes, session-init's "active WUs"
enumeration could become noisy. Mitigation: tier-aware orientation summary ("3 active WUs: 1
standard, 2 atomic"); auto-cleanup of completed-but-not-archived atomic WUs at session-init.

---

## Open Questions

### Atomic-companion retirement vs repurpose

The companion's "holding area before decision" role largely evaporates with cheap atomic-WU
spin-up. Two paths:

- **Retire entirely.** Migration: existing companion-file content reviewed at retirement, items
  routed to atomic WUs / commits / backlog as appropriate.
- **Repurpose as session-scoped capture.** The companion becomes a per-session "noticed-pending-
  decision" surface that drains at session-handoff (each item resolves to fold-in / new-WU /
  defer). Lighter than current; preserves a holding area for in-flight decisions.

PRD-time decision after observing usage patterns under the new tier model.

### Default `**Origin:**` population with an external tracker present

Under WOR's Origin ⊥ Spec orthogonality, external trackers populate `**Origin:**`, not `**Spec:**`
(retired `pm.layer: external` value, framing collapsed per WOR's design decision). Should
`arc start --tier quick` default to populating `**Origin:**` from the current branch's linked
PR/issue (via coord-probe) when a `coord.adapter` is configured? Or always require explicit
`--origin`? Auto-population is convenient but risks pointing at the wrong ticket if inference is
wrong. PRD decision.

### Promotion mid-work UX

User starts atomic, scope grows, needs to promote. What's the command shape?

- `arc promote-tier <name> --to quick` — explicit
- Implicit: when a task list is created on an atomic-tier WU, automatically promote with
  notification
- Manual: user edits meta file and creates artifacts; framework detects on next session-init

Likely manual + structural-detection nudges, but PRD decision.

### Tier-aware Spec field validation

Should pre-commit hooks validate the `**Spec:**` field matches tier expectations (standard tier must
point at PRD; quick must point at task list or compact PRD; atomic omits)? Validation adds
strictness; relaxed handling tolerates in-flight transitions. Probably warn-not-block; PRD decision.
External-tracker URLs (now in `**Origin:**`, not `**Spec:**`, per WOR's orthogonality framing) are
out of this validation's scope.

### Quick-tier spec shape — task-list header vs reduced PRD doc

Under WOR's Origin ⊥ Spec orthogonality framing, `**Spec:**` always points at an ARC-owned
artifact (external trackers go in `**Origin:**`). The remaining question is where the
quick-tier internal spec lives:

- **Task-list header `## Scope` section** (current scope item 5): in-repo spec surface as a
  prose section at the top of `tasks-{name}.md`. Minimal — no separate doc.
- **Reuse Lite mode's reduced PRD template**: quick tier under `pm.layer: arc-pm` points its
  `**Spec:**` field at a compact PRD doc rather than a section of the task list. Creates
  cross-mode parallelism: Lite project's PRD has the same shape as Full mode's quick-tier PRD, and
  graduation Lite → Full preserves the spec shape for the first quick WU.

**Tradeoffs:**

- *(For compact-PRD)* Spec field semantics become uniform — always points at a doc, never at a
  section-of-another-file. Cleaner contract for tooling and reviewers.
- *(For compact-PRD)* Reuses Lite mode's reduced PRD template (when it lands) — no separate
  "scope section" convention to maintain.
- *(For compact-PRD)* Honors ARC's spec-directed principle more cleanly — "spec lives in a doc,
  regardless of tier" is consistent with the principle.
- *(Against compact-PRD)* Adds a doc to quick tier (currently zero docs besides task list + meta
  file).
- *(Against compact-PRD)* Spec budget (5-10 min for Lite's PRD) might be 20-50% of total work time
  for short quick-tier work — boundary check: if you can't articulate the goal in ~5 minutes,
  you're probably standard tier.
- *(Against compact-PRD)* "PRD" naming carries weight quick tier may not warrant — could rename
  for the reduced shape (Spec? Brief? compact-PRD?) but that fragments naming across modes.

**Coordination:** depends on Lite mode's reduced PRD template shape, which is `plan-arc-modes.md`
§ The Lite PRD scope. If Lite PRD template lands first or in parallel, this WU adopts it for
quick tier directly. If Lite mode is still iterating, this WU may need to either wait or ship
with the task-list-header fallback and migrate later.

PRD decision informed by Lite mode's PRD template progress and external research on lightweight
spec patterns.

### Status template versioning during migration

Adding `**Tier:**` and `**Spec:**` fields to template-status is a template change. Existing in-flight
meta files don't have the fields. Migration: assume `Tier: standard`, `Spec: prd-{name}.md` if
PRD exists else `tasks-{name}.md`. Auto-migrate at session-init? Manual? PRD decision.

---

## Scope Estimate

**Large.** Constitutional change scope plus broad sweep of workflows, templates, strategy docs.
Tier model is conceptually clean but touches many surfaces.

Phases (provisional):

1. **Constitutional foundation** — ADR drafting, DEV-RULES.ARC tier-definition amendments,
   tiered-artifacts/invariant-discipline framing, alignment with plan-arc-modes' rejection of
   "Required vs Available" model (explicit answer in the constitutional language).
2. **Status template, Spec field, and Integration field** — `**Tier:**`, `**Spec:**`, and
   `**Integration:**` fields on template-status; migration handling for existing WUs.
3. **`arc start` command** — CLI subcommand implementation, default-tier semantics, flag handling,
   error semantics, tests.
4. **Integration-workflow restructure** — implements the metadata-state foundation from
   Session-Operational Flow Phase 7. State + Integration field rollout in
   workflows; sweep cadence configuration; sweep-as-you-go integration PR shape (multi-commit with
   isolated sweep commit); deferred sweep variant; tier-aware sweep ceremony. Resolves CodeRabbit
   contradictoriness and stale-tracking-doc inbox concerns.
5. **Workflow tier-awareness** — activate-work-unit, integrate-work-unit, archive-work-unit
   tier-aware branches (built on top of Phase 4's restructured workflows); quick-tier task list
   shape in template-tasks; atomic-tier minimal flow.
6. **Incidental retirement sweep** — workflows, strategies, status template references, branch-
   prefix conventions, examples. Mechanical broad sweep.
7. **Atomic-companion decision and migration** — retire or repurpose per PRD-time decision;
   existing companion-file content migration.
8. **Strategy doc cascade** — strategy-task-list-formatting tier-aware shapes, strategy-work-
   organization tier integration, quality-gate-commands tier awareness.
9. **External research** — Shape Up shaping criteria, Stripe RFC threshold, Google design doc
   guidance, GitLab MR-driven workflow. Validates boundary tests against industry idiom; informs
   PRD-time language refinement.
10. **Documentation / tests / examples** — standard closing phase.

Phase 1 gates everything else (constitutional foundation precedes implementation). Phase 4 has a
hard upstream dependency on plan-session-operational-flow Phase 7; Phases 2-3 can proceed in
parallel. Phase 5 depends on Phase 4. Phases 6-8 are sweeps that depend on Phase 5. Phase 9
(external research) can run alongside any phase but informs Phase 1's language.

---

## External Research

The Quick-vs-Standard boundary aligns with industry-recognized "design-doc-or-not" criteria. PRD-
time research validates the boundary tests against idiomatic practice and refines language:

- **Shape Up methodology (Basecamp)** — explicit "shaping" tier vs "small batch" tier with
  documented criteria.
- **Google's design doc when-to-write guidance** — public engineering blog material on this exact
  boundary.
- **Stripe's RFC process** — documented threshold for when an RFC is required.
- **GitLab's MR-driven workflow** — published criteria for "just open an MR" vs "needs an issue +
  design first."
- **Internal-spec patterns for quick-tier work** — how teams handle "well-defined work that doesn't
  need a design doc" in practice (issue templates, PR templates, conventional task lists).

Research wouldn't change the boundary itself; it would inform PRD-time language and provide
concrete examples for the strategy doc.

### Worktree-management tool landscape (completed 2026-05-12)

- `research-worktree-tool-convergence.md` — convergence pass across 11 agentic worktree-management
  tools (Cluster 1: Zed, Warp, Worktrunk; Cluster 2: Conductor, emdash, Maestro; Cluster 3: Super,
  Superset, T3code, Soloterm, Nora). Closes the question of whether `arc start` retains a clear
  role alongside parallel workspace tools — yes, as the spawn-from-existing-session entry point,
  paired with `plan-worktree-foundation.md` item 11's cold-start primitive (the tool-spawned-
  worktree entry point). Both entry points produce the same scaffolded meta file; adopters pick
  per WU based on origin. Tier model survives unchanged — tier selection at `arc start`
  (`--tier atomic | quick | standard`) and at the cold-start primitive operates on the same
  meta-* foundation.

---

[dev-rules]: ../../../../reference/constitution/DEV-RULES.ARC.md
[strategy-work-org]: ../../../../reference/strategies/arc/strategy-work-organization.md
[tasklist-fmt]: ../../../../reference/strategies/arc/strategy-task-list-formatting.md
[template-meta]: ../../../../reference/templates/template-meta.md
[template-tasks]: ../../../../reference/templates/template-tasks.md
