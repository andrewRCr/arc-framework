# Notes: Work Organization Reform

## Contents

- Design decisions and alternatives considered
- Pressure points (depth beyond PRD Open Questions)
- Open design questions (surfaced during Pass 3; pending resolution)
- Migration mapping reference

---

## Design Decisions and Alternatives Considered

### Single-branch-per-WU as the load-bearing decision

Everything else (branch conventions, sweep-as-you-go, workflow consolidation, meta-file location)
follows from this or composes with it. Alternative models considered:

- **Meta file in `backlog/` during planning.** Rejected — `backlog/` is `pm.layer: arc-pm` only;
  doesn't generalize to `none`. Also semantically odd: meta file in backlog while WU is actively
  being planned reads wrong.
- **Meta file gitignored (per-developer like SESSION-NOTES).** Rejected — loses cross-WU
  coordination visibility. Meta files are project state, not personal state.
- **Two branches with delayed planning-merge until activation.** Rejected — planning artifacts merge
  at activation moment instead of planning-integration moment, but main still gets them. Same leak,
  different timing.

Single-branch-per-WU avoids the leak structurally: artifacts only land on main at WU integration,
and sweep-as-you-go routes them through `active/` on the branch directly into `archive/` on main.

### Conventional Branch alignment over no-prefix

No-prefix execution branches considered and rejected: scannability matters when many branches exist
(atomic chores blending with serious feature work was a real failure mode). CB alignment preserves
visual scannability while removing the feature-vs-technical contradiction with PR conventional-commit
types. The arbitrariness concern (WUs cross types internally) is real but mitigated: dominant-type
pick at activation, when PRD/spec is settled, is informed.

`plan/<name>` preserved as a separate branch state (not a CC type). Captures phase-of-life cleanly.

CB has emergent spec (conventional-branch.github.io) that explicitly limits canonical set to core-6
and rejects expansion on cognitive-load grounds. ARC's core-6 choice aligns with that
intentional-scarcity philosophy. Contested types (`test/`, `style/`, `build/`, `ci/`) treated as
adopter-extension territory.

### Group dirs in `backlog/` only — strictness over symmetry

Symmetric group dirs in `active/` considered: every group's WUs co-locate in both `backlog/` and
`active/`. Rejected on cost — group-dir on activation introduces a file-move ceremony, and
active-side WU counts are bounded enough that visual chunking benefit is small. Group identity in
`active/` lives in the meta file's `**Cohort:**` field, not in the directory tree. Asymmetry is
intentional: `backlog/` accumulates over months and benefits from chunking; `active/` holds 1-3 WUs
typically and doesn't.

### Default `disabled` for planning-checkpoint review

Defaults calibrate to ARC's current validation surface — solo dev with focused tool set, where
planning-PR review isn't substantively exercised. Team mode and concurrent-pair coordination are
designed-for but not yet validated. `required` is the opt-in for adopters who want a planning-review
gate. Default `disabled` matches ARC's tier-2 convention pattern: minimal ceremony default,
configurability available.

The `disabled | required` framing reads as a **per-team governance stance**, not a per-task knob —
chosen once at adoption based on team's risk tolerance and review-bandwidth posture. Comparable
methodologies (RFC processes, big-org design-doc culture) embed governance in project culture rather
than per-task configuration; ARC's choice to expose it as config is the explicit-configurability
axis, but the *decision shape* (one-time team stance) is consistent with field practice.

### Sweep-as-you-go subsumed from Agile WU Lifecycle, not deferred

Agile WU Lifecycle's scope item 7a originally bundled the metadata-state foundation
(`**State:**` + `**Integration:**` field rollout, sweep cadence config, sweep-as-you-go shape,
tier-aware sweep ceremony, deferred-sweep variant). Foundation pieces (sweep-as-you-go shape +
sweep cadence config) subsumed into WOR because they're load-bearing for per-worktree isolation
under single-branch-per-WU. AWL retains tier-aware sweep ceremony (atomic / quick / standard
scaling) on top of WOR's tier-agnostic foundation. Split logic: WOR lands the *model*; AWL lands
the *tier-specific adaptations*.

### Migration is forward-only

All WOR-introduced structural changes apply forward-only. Principle: retroactive migration of
historical artifacts rewrites the historical record without proportional benefit; the format
evolution itself becomes part of that record, visible in archive structure.

**In-flight WUs at WOR activation:**

- Retain current `feature/`/`technical/` branches through natural integration (branch rename would
  force coordination across multiple in-flight branches)
- Rename `status-*` → `meta-*` mechanically (small, low-risk)
- Backfill `**Origin:**` field
- Recodify `**State:**` per the mapping table below
- Backfill `**Owner:**` from `arc.identity`
- Initialize `**Depends On:** [none]`
- Initialize `**Cohort:** [standalone]` (or cohort name for known sibling sets)

**Historical archive read-only:** retains categorical layout, `status-*` / `completion-*` filenames,
uncodified `**State:**` / `**Integration:**` values. No retroactive Release Notes Entry backfill;
no content rewrite to match new META-PRD shape.

### Boundary-materialization over append-only or backend-only

Shared backlog inboxes write only at lifecycle ceremonies (activation absorption, integration
drain, planning-kickoff promotion). Alternatives:

- **Append-only structured convention with continuous writes.** Per-entry blocks (dated, authored),
  conflict-tolerant additions. Rejected — works under solo and well-disciplined teams but breaks
  the first time two writers edit the same existing entry simultaneously. Discipline load is real
  and unbounded; concurrency safety relies on convention rather than mechanism.
- **Per-WU intermediate captures merged at integration.** Each WU branch carries own captures file;
  integration sweeps merge into main's shared inbox. Rejected as redundant — the per-user
  `USER-INBOX.md` already serves the personal in-flight capture role; per-WU file added a tier
  without distinct semantic value.
- **Defer to the backend.** Rejected — worktree-era multi-WU is downstream of WOR; current backlog
  inbox shape becomes genuinely broken (not just suboptimal) the moment two worktrees both want
  to write.

Boundary-materialization sacrifices write immediacy for write isolation. Shared inboxes represent
*committed direction as of the last ceremony*, not real-time capture. Live capture lives in
per-user `USER-INBOX.md`; cross-team visibility materializes at next ceremony boundary. Future
backend replaces materialized files with live-queried view; conceptual model survives transition.

### Work-unit-as-wrapper, atomic-as-work-character

Vocabulary tangle: "atomic" was doing two jobs (item-shape AND tier-shape); "work unit" was getting
stretched ("is an atomic WU really a work unit?"). Separating resolves both:

- **Work unit** — wrapper noun. Any bounded chunk with branch, status, PR. Invariant across tiers.
- **Atomic** — work character. Single-bounded, indivisible, no internal stages. Applies to items
  (capture-tier), tasks (companion-file scope), WUs (atomic-tier).

Inboxes distinguish by work *character* (atomic vs multi-step), not wrapper presence/absence.

Alternative considered: **rename "work unit" entirely.** Industry alternatives (epic, story,
initiative) don't fit ARC's flat, technical-or-feature-agnostic shape. Cost of renaming high;
benefit unclear.

### `status-*` → `meta-*` rename

`status-*` files evolved beyond their original current-state role. They now carry metadata
(Branch, Spec, Origin, Sibling WUs, Task List, Owner, Depends On) + active-state pointers (Last
Completed, Next Task, Blockers, Next Action, State) + archive-phase sections (PR URL, Completed,
Release Notes Entry, Completion Notes). Primary content header is `## Work Unit Metadata`. "Status"
undersells the composite role.

Alternatives:

- **Keep `status-*`.** Familiar. Rejected: rename moment is active, not passive. With
  completion-status consolidation absorbed into WOR, rename and lifecycle extension land together
  rather than across two WUs.
- **`metadata-*`.** Direct synonym but reads colder/more bureaucratic; composes worse with
  `{wu-name}` than shorter `meta-`.
- **`manifest-*`.** Captures the role but carries connotations from other domains (package
  manifests, container manifests).
- **`wu-*` / `unit-*`.** Too short; loses semantic content.

Sort-order benefit: with `atomic-*` companions retiring per AWL, `meta-*` prefix puts the WU's
primary orientation target first in `active/` listings (meta-, plan-, prd-, tasks-).

### Origin ⊥ Spec orthogonality

Existing `**Spec:**` field was specified to accept external-tracker URLs as one possible value
alongside internal artifact references. That conflation was a category error.

**The principle:**

- `Origin:` — where the need came from. External tracker, customer request, internal initiative.
  Default `[Internal]`. Free-text; validated only loosely.
- `Spec:` — what the WU is building. Always points at ARC-owned planning artifact (`plan-*`,
  `prd-*`, `tasks-*`). Never external.

Consequence: `pm.layer` value-set collapses from `arc-pm | external | none` to `arc-pm | none`. The
`external` value tried to encode two distinct concerns ("we have a tracker" AND "skip ARC's
planning pipeline") and was coherent at neither. Tracker presence is per-WU (Origin);
planning-pipeline presence is project-level (`pm.layer: arc-pm | none`). The `pm.layer` update
lands in `plan-arc-modes.md`, not WOR direct scope.

Alternatives:

- **Keep Spec as only field; codify "external URLs allowed."** Rejected — perpetuates conflation.
- **Add Origin only; leave Spec ambiguous.** Rejected — Spec's role stays unclear.
- **Introduce Origin and rename Spec.** Rejected as scope creep; "Spec" is established vocabulary.

### `plans/` interlude in backlog

`backlog/` root holds three top-level overview docs only (the two shared inboxes + ROADMAP.md); all
`plan-*` docs and group dirs nest under `backlog/plans/{planned,provisional}/`. Alternatives:

- **Flat layout.** Plan-* docs and group dirs mixed at backlog/ root alongside inbox files.
  Rejected — in dirs-first explorer sort, inbox files end up sandwiched between group subdirs
  (above) and standalone plan files (below), losing project-overview-entrypoint position. ROADMAP
  orphans among individual plans.
- **`_inbox/` subdir for inbox files only.** Plans stay at backlog/ root. Rejected — solves
  inbox-sandwich but leaves ROADMAP orphaned; doesn't scale with many plans.
- **Single-level `plans/` with no state-dir split.** Rejected — loses ROADMAP's alignment axis
  (provisional thinking drifts onto roadmap; sequenced commitments lose distinguishing signal).

Interlude pays path-verbosity cost (two extra directory levels on every `plan-*` reference) for
three durable benefits: scannable backlog root; project-overview triad reads cleanly; state-dir
split aligns roadmap presence with directory presence by construction.

### Single source of truth at meta file; ROADMAP and CHANGELOG as rendered views

Load-bearing principle across multiple scope items: meta file is canonical artifact per WU.
Everything else (ROADMAP, future CHANGELOG aggregation, done-vs-left queries) is rendered or
derived. External research's convergent finding across KEPs (Kubernetes), Project Goals (Rust),
and changesets-pattern tooling: a per-WU persistent artifact carrying both forward intent (state,
deps, owner) and backward record (release notes, completion notes) is the proven structural
mechanism that avoids drift between artifacts.

Alternatives:

- **ROADMAP.md as hand-maintained source of truth + meta files as derived.** Rejected — drift
  between roadmap and per-WU state is exactly the failure mode the rendered-view pattern
  eliminates. Surveyed projects that try this (OpenStack blueprints in Launchpad) consistently
  report staleness.
- **Separate "completion record" doc per WU + meta file lifecycle ending at integration.** Today's
  shape (`completion-{name}.md` + `status-{name}.md`). Rejected — two artifacts where one
  suffices.
- **Defer rendered-view pattern; keep ROADMAP hand-edited.** Rejected — without explicit dep
  fields and documented rendering algorithm, ROADMAP can't surface parallelizability for
  worktree-per-WU operationally.

### META-PRD as load-bearing reference, not standalone document

External research's strongest finding on vision-doc liveness: live vision docs are referenced as
nouns in ceremonies (RFC gates, PR review checks, onboarding teaching tools). Stale vision docs
sit unquoted in isolation.

Three fire-points (PRD creation gate, integration verification, conditional activation check) wire
META-PRD into the development loop. Update triggers are organic (PR-time clarification when
conflict surfaces) + event-driven (major release, scope shift, governance change), not
cadence-driven.

Alternatives:

- **Quarterly review cadence.** Rejected — surveyed projects without ceremony integration
  consistently let cadence slip (PSF mission review is rare counter-example; required dedicated
  governance role to sustain).
- **Single repo-root mission statement; no separate META-PRD.** Rejected — ARC's PRD-per-WU
  pattern needs a higher-level alignment artifact for cross-WU principles question. README doesn't
  carry that load.
- **Fold META-PRD into DEV-RULES.ARC.** Rejected — rules and principles are different artifacts.
  Rules govern execution mechanics; principles govern design direction. Conflation would dilute
  both.

### Singular Owner per WU; concurrent multi-owner deprecated

Worktree-per-WU (downstream Worktree Foundation) + KEP/Project-Goals single-owner convention
together make concurrent multi-owner operationally redundant. Existing patterns surviving:
task-level distribution under singular Owner via `(@name)` checkbox markers; sequential handoff
during impl (Owner field updates).

Pattern deprecated: two devs equally owning and concurrently editing one WU's files. Decomposes
naturally into separate WUs (different scope per dev) or task-level distribution (one Owner).

Alternatives:

- **Plural Owner field (list).** Rejected — surveyed projects' single-owner pattern (KEP author,
  Rust goal POC) is the proven structural shape. Plural ownership pushes accountability into
  ambiguity; concurrent edits push toward merge conflict.
- **Implicit Owner (whoever's branch the WU is on).** Rejected — works in solo mode by accident;
  breaks the moment team mode handoff occurs mid-flight.

### Release Notes Entry composability with Conventional Commits

Per-WU Release Notes Entry sits at WU granularity; Conventional Commits sits at commit granularity.
They compose, not compete:

- **Conventional Commits** — per-commit; source of truth = commit message; commit-level format
  discipline (scope/type tags)
- **Per-WU Release Notes Entry** — per-WU; source of truth = section in `meta-*.md`; WU-level
  user-facing summary; aggregation source

In ARC's WU-spans-many-commits model, each commit follows Conventional Commits; the WU's Release
Notes Entry summarizes the aggregate at the right granularity for a release reader. Aggregation
tooling (deferred) reads per-WU entries, not commit history.

External research framing "Conventional Commits vs. changesets" was oppositional because projects
often pick one *or* the other for CHANGELOG generation; ARC's KEP-analog model ("WU artifact
carries the summary") makes it neither. Same composition logic applies to Conventional Branches:
branch-naming at branch-creation, orthogonal to commit format and WU-level summary.

---

## Pressure Points (depth beyond PRD Open Questions)

### Boundary-workflow restructure scope

Retiring `integrate-planning-branch.md` and consolidating activate/integrate workflows is a
constitutional-level workflow change. Scope comparable to ADR-016's session-operations
consolidation. Risk: orphaned references in DEV-RULES, strategies, and other workflows.
Mitigation: thorough grep + integration-test coverage on new boundary workflows + ADR documenting
the shift.

### `[PLAN]:` PR prefix retirement reverberations

Adopters who've configured PR templates, branch-protection rules, or CI workflows around the
`[PLAN]:` prefix need migration guidance. Retired entirely under single-branch-per-WU (no separate
planning PR exists). Mitigation: explicit migration note in adopter-facing release docs.

### Group-dir migration from existing categories

Existing `backlog/feature/` and `backlog/technical/` contents migrate at WOR activation. Some WUs
are already siblings (parallelism trio, interlock-release-wrappers cluster) and pick up group-dir
treatment cleanly. Standalone WUs flatten. Risk: missing cross-references that point at old paths.
Mitigation: grep sweep + lint check + migration commit shape that records path changes.

### Planning-checkpoint review default

Default `disabled` reflects current validation scope; adopters used to `[PLAN]:` PR pattern may
expect prior behavior by default. Mitigation: clear guidance in adopter-facing release notes and
strategy doc on the `review.planning_checkpoint: required` opt-in.

### Opt-in framing — codification ahead of curve

Configurable planning-review is novel as methodology-level config among comparable frameworks.
RFC processes (Rust RFC, Python PEP, Kotlin KEEP, Ember RFC) and big-org design-doc culture
(Google) gate review by *change scope*, not by *team configuration*. AI-coding peers (Cursor
Plan Mode, Aider `/architect`) have planning surfaces but no codified governance gate. ARC's
opt-in config places it ahead of where AI-coding peers have codified governance, and bridges —
rather than replicates — pre-agent RFC norms. Risk: adopters bringing pre-agent mental models may
expect mandatory-or-not-applicable framing and read "configurable" as either under-discipline or
over-engineering. Mitigation: strategy doc framing positions choice as per-team governance stance.

### Lite mode interaction

`plan-arc-modes.md` § Lite Session Management is in active design. Lite is single-WU-at-a-time
and unaffected by this reform, but Lite's branching shape and lifecycle workflows need
confirmation during WOR execution that new conventions don't accidentally constrain Lite.
Forward-compat check.

### Backend tier compatibility

`plan-arc-backend.md` notes worktree-per-WU maps to per-WU materialized views. Backend WU PRD
should verify single-branch-per-WU model maps cleanly (it should — each WU is a coherent
branch-plus-artifacts unit, easier to materialize/dematerialize than a multi-branch lifecycle).

### Deferred sweep cadence interaction

Adopters using `archive.cadence: deferred` (current pattern) keep current shape. Per-worktree
isolation under deferred cadence has a small post-integration-pre-archive window where main has
Complete-state files in `active/` until next sweep. Window is bounded and factually accurate (the
WU IS complete) but worth documenting as known transitional state for deferred-cadence adopters.

### Per-WU Release Notes Entry authorship gap

Release Notes Entry composition happens at integration ceremony (post-merge timing means summary
composed later than today's pre-PR creation). Risk: with integration workflow doing additional
work, Release Notes Entry composition gets perfunctory or skipped. Mitigation: Tier-1 step in
`archive-work-unit.md` blocks ceremony completion until section composed (per PRD R14).
Optional CLI validation hook (deferred) hardens this mechanically later.

### META-PRD live-vs-stale tension

Ceremony integration is the liveness mechanism, but the failure mode is real: agents running PRD
review may treat the alignment check as procedural rather than substantive, and META-PRD drifts
into ornament. Mitigation strategies during WOR execution:

- Require alignment check to **cite** a specific META-PRD principle by number when passing — not
  just "checked, passed"
- PR-time META-PRD-clarification proposals get fast-track review treatment to lower friction
- Failure to cite during PRD review surfaces as a flag at integration verification

Mechanism only works if agent and human treat META-PRD as load-bearing reference, not box-check.

### ROADMAP rendering CLI sequencing risk

CLI command implementation deferred to downstream WU. Risk: CLI gets lost in downstream WU
sequencing (Worktree Foundation, Agile WU Lifecycle, Concurrent Work Conventions each have own
priority pressure), leaving ROADMAP hand-maintained indefinitely. Hand-maintenance discipline is
acceptable interim per PRD R38 (current planned/active WU count is low) but degrades as queue
grows. Mitigation: CLI captured in PRD § Non-Goals and § CLI tooling capture (must not be lost);
activation audit confirms downstream WU absorbs the entry.

### Inter-WU planning freshness — model raises but doesn't solve

Single-branch-per-WU isolates each WU's planning artifacts to its branch. Cross-WU references (one
WU depending on another's evolving planning state) require dependent worktree to see upstream WU's
current state, which it does not by default. Mechanisms available: cross-branch reads (`git show
<branch>:<path>`), cross-worktree filesystem reads (requires colocated worktrees + naming
convention), out-of-band coordination.

External research (2024-2026) confirms field's modal answer is out-of-band coordination — no
codified inter-WU planning-freshness pattern in agentic-coding practice. WOR treats out-of-band
human coordination as interim default and defers any codified inter-WU sync mechanism to
Concurrent Work Conventions WU downstream.

---

## Open Design Questions

Surfaced during Pass 3 task-generation audit; substantial enough to warrant fresh-session resolution
rather than mid-Pass-3 mutation. Out of WOR's currently settled scope until resolved.

### Plan-doc optionality and meta-* source for ROADMAP renderer

**The gap.** R37/R38 specifies the ROADMAP renderer walks `meta-*.md` files in both `active/**` and
`backlog/plans/planned/**`. Today's backlog contains only `plan-*.md` files; no `meta-*.md` lives at
the backlog stage, and no WOR task creates them. Without resolution, the renderer covers only
in-flight WUs — defeating R37/R38's programmatic-render value for backlog plans.

**Two-layer question.**

*Layer 1 — Where do backlog meta-files come from?*

- **Option A.** Embed metadata block (`State` / `Owner` / `Origin` / `Depends On` / `Cohort`) in
  plan-* body via `template-plan.md`. Renderer parses two file types; fields migrate to a fresh
  meta-* at init-work-unit; block stripped from plan body at that moment.
- **Option B.** Create a meta-* sibling stub alongside each backlog plan-*. Renderer walks meta-*
  per R38 as-written. At init-work-unit, meta-* moves from `backlog/plans/planned/<cohort?>/` →
  `active/<category>/`; task pointers and execution state populate at activation.

Option B is more architecturally clean (single source of truth invariant; no new renderer parser
path; literal R38 compliance), at the cost of one extra file per backlog item. Aligns with the
existing multi-artifact-per-WU convention.

*Layer 2 — When is plan-* doc optional vs required?*

Current `template-plan.md` framing — "Using this template is not required ... Delete this file
after the PRD is written and stable" — is incoherent under `pm.mode: arc-in-git`, where plan-* moves
from `backlog/plans/planned/` to `active/<category>/` at init-work-unit (not deleted post-PRD).
Proper contract:

- `pm.mode: arc-in-git` (excluding Lite mode): plan-* not optional, unless an external origin
  (GitHub issue, external tracker) carries sufficient shape to justify going straight to PRD —
  typical for atomic-tier WUs sourced from external work.
- `pm.mode: lite` (planned, not yet shipping per `plan-arc-modes.md`): plan-* optional.
- `pm.mode: none`: plan-* optional.
- PRD is **always** required (downstream of plan-* / external origin). An ARC task list needs a
  structured, ARC-specified spec to build from — the spec form is mandatory even when the route to
  it is flexible.

WU tier interaction (per Worktree trio's atomic / quick / standard classification): atomic and
quick tiers may collapse the plan → PRD → task list pipeline, but still need SOME spec for the
task list. Tier classification likely informs spec-flow shape.

**Cross-cutting implications.**

- `template-plan.md` framing needs update to reflect the spec-flow contract per pm.mode + WU tier
  (drop the blanket "optional" framing; route correctly with no gaps).
- `1_create-prd.md` and `init-work-unit.md` need spec-flow guidance (plan required vs external
  origin sufficient vs tier-collapsed pipeline).
- PRD may need new R-ID for backlog meta-* source (and template-plan framing rule), or clarifier
  on R37/R38 + R58.
- Phase 6.5 in this WU's task list likely gains a backfill subtask once design resolves — current
  6.5 acknowledges the open question via inline `_Note:_`.

**Next-session entry point.**

1. Resolve the meta-* source question (Option A vs B vs other).
2. Codify the plan-* optionality contract per pm.mode + WU tier.
3. Decide whether to expand WOR scope or spin out a follow-up WU (natural candidates: fold into
   Agile WU Lifecycle, which already owns tier-aware ceremony scaling; or new standalone WU).
4. Update `template-plan.md` and downstream workflows per the resolution.
5. Apply Phase 6.5 backfill scope per resolution (interactive: per-plan `Depends On` + `Owner` +
   `Cohort` assignment).

---

## Migration Mapping Reference

### `**State:**` value recodification

Old → new mapping for in-flight WU meta files at WOR activation:

- `Planning` → `Planning` (pre-activation state preserved during migration; recodifies to
  `Provisional` if plan-doc moves to `provisional/`, or stays `Planning` if branch-active)
- `Draft` → `Provisional` (pre-sequencing plan-doc state)
- `In Progress` → `Active` (execution underway)
- `Active` → `Active` (already aligned; no change)
- `Complete` + `**Integration:** Merged` → `Shipped` (post-merge, archived)
- `Complete` + `**Integration:** (PR open)` → `Integrating` (PR open or sweep in progress)
- Any `**Integration:**` field value folds into `**State:**`; field retires

### `**Origin:**` backfill rule

- Default: `[Internal]`
- External tracker URL/ID present in prior `**Spec:**`: migrate URL/ID to `**Origin:**`;
  `**Spec:**` resets to internal artifact reference (`plan-*.md`, `prd-*.md`, `tasks-*.md`) or
  `[no spec yet]` during planning state

### Inbox renames and merges

- `user/{id}/ATOMIC-INBOX.md` → `user/{id}/USER-INBOX.md` (rename; content moves under
  `## Atomic` section; `## Backlog` section initially empty)
- `backlog/BACKLOG-FEATURE.md` + `backlog/BACKLOG-TECHNICAL.md` → `backlog/BACKLOG-INBOX.md`
  (merge; entries reclassified during merge — some may route to `backlog/ATOMIC-INBOX.md` based on
  shape; some may promote directly to draft `plan-*` docs if matured)
- New empty file created: `backlog/ATOMIC-INBOX.md`

### Plan-doc relocations

- `backlog/feature/plan-*.md` and `backlog/technical/plan-*.md` flatten/classify into
  `backlog/plans/{planned,provisional}/`
- Routing rule:
    - On ROADMAP today → `planned/`
    - Not on ROADMAP → `provisional/`
- Sibling sets (parallelism trio, interlock-release-wrappers cluster, etc.) pick up group-dir
  treatment within their state-dir: `backlog/plans/{state}/<cohort>/plan-*.md`

### Workflow rename (filename + cross-refs)

- `activate-planning-branch.md` → `init-work-unit.md` (creates WU + meta-file; new responsibility)
- `activate-work-unit.md` — name preserved with new semantic (state-flip + branch rename only, no
  directory move); `[!NOTE]` block added redirecting to `init-work-unit.md` when invoked against
  non-existent WU
- `integrate-planning-branch.md` — retired entirely
- `integrate-work-unit.md` — restructured for sweep-as-you-go + single integration PR
- `archive-work-unit.md` — Tier-1 step for Release Notes Entry + Completion Notes composition;
  collapses into `integrate-work-unit.md` under default `archive.cadence: with-integration`

### Doc retirements (with content destinations)

- `plan-roadmap-evolution.md` — retired; tiered-horizons direction superseded by PRD R37-R39
  rendered-view shape
- `plan-completion-status-consolidation.md` — retired; content absorbed into PRD R14, R30-R32
- `template-completion-doc.md` — retired; content folds into `template-meta.md` archive-phase
  sections
- `.arc/reference/PROJECT-STATUS.md` — retired; function decomposes per PRD R40 (completed-work
  history → Release Notes Entries; project direction → META-PRD; done-vs-left → directory query)
- `research-commit-convention-reform.md` — retired; findings synthesized into PRD R25-R29 +
  Technical Considerations § Hook regex updates

### Cross-reference sweep targets

Grep across workflows, strategies, rules, briefs, and templates for these patterns (PRD R52):

- Branch-prefix patterns: `feature/`, `technical/`
- PR-prefix pattern: `[PLAN]:`
- Retired workflow refs: `integrate-planning-branch`, `activate-planning-branch`
- Retired file-prefix patterns: `status-*.md`, `completion-*.md`
- Retired template/strategy/plan refs: `template-completion-doc.md`, `PROJECT-STATUS.md`,
  `plan-roadmap-evolution.md`, `plan-completion-status-consolidation.md`
- Lazy scope-tag example: `docs(arc):` (in commit-format method examples, etc.)
