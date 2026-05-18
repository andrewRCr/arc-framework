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

### Per-WU subdir in backlog (supersedes earlier `plans/` interlude lean)

Each backlog WU lives in its own subdir: `backlog/{planned,provisional}/<wu-name>/` for
standalone WUs; `backlog/{planned,provisional}/<cohort>/<wu-name>/` when cohort-grouped. The
subdir holds `meta-<name>.md` (always) plus `plan-<name>.md` and other companions
(`notes-*`, `prd-*`, etc.) when present. Backlog root carries `planned/`, `provisional/`,
`ATOMIC-INBOX.md`, `BACKLOG-INBOX.md`, and `ROADMAP.md` — two state dirs plus three overview
files, no other content.

Alternatives considered:

- **Flat layout (no state dirs).** Plan-* docs at `backlog/` root. Rejected — loses the
  planned-vs-provisional alignment axis ROADMAP needs (provisional drift onto roadmap;
  sequenced commitments lose distinguishing signal). Also re-introduces the dirs-first sort
  sandwich problem (group dirs above, plan files below, inboxes wedged between).
- **`plans/` interlude (`backlog/plans/{state}/...`).** Earlier lean. Rejected after Pass 3
  pressure-test: the interlude was paying path-verbosity to keep backlog root scannable
  given many sibling `plan-*` files. Per-WU subdir achieves the same scannability one level
  shallower — every WU is one directory entry under `planned/`/`provisional/`, regardless of
  companion file count. The interlude becomes redundant.
- **Flat sibling files in state dirs (`backlog/{state}/meta-*.md` + `plan-*.md`).** Considered
  during Pass 3 resolution. Rejected — at backlog scale (~26 plans pre-WOR), entry count
  doubles when plans have meta companions; alphabetical sort interleaves meta and plan files
  by name; the "what WUs are in the backlog" view becomes mental dedupe rather than a direct
  listing. Subdirs make WU identity legible at the `ls` level.
- **Conditional subdir promotion (flat when meta-only; subdir when companions appear).**
  Rejected — introduces a lifecycle ceremony at the moment a plan-doc is generated
  (flat → subdir promotion, path-reference churn), and forces renderer to handle both
  layouts. Uniform structure beats conditional shape.

Per-WU subdir benefits beyond legibility: symmetric with `archive/<dated>/<wu-name>/` (R41);
cohort dirs nest cleanly without breaking the pattern (`<state>/<cohort>/<wu-name>/`); path
stability across lifecycle (the WU identity directory exists in backlog through archive,
disappearing only at the active-stage flat zone where WU count is bounded to 1-3 and chunking
isn't needed); accommodates companion artifacts (notes, research, analysis) without
restructuring. Single-file subdirs (meta-only WUs) are accepted as the trade — the directory
listing entry count is identical to flat, just with directory shape instead of file shape;
the precedent for single-artifact subdirs already exists in `archive/`.

### Meta-* as durable invariant from inception through archive

Meta file is the WU's identity artifact across the entire lifecycle, not a surface that
appears at activation. Created at WU stub creation (alongside plan-doc, or alone for
external-tracker-origin WUs), persists through all state transitions, lands in `archive/`
at integration with archive-phase sections composed. ROADMAP renderer (R37/R38) walks
`active/**` and `backlog/{planned,provisional}/**` for `meta-*.md` — same parser path
everywhere; single source of truth across the lifecycle.

This is the load-bearing invariant that makes spec-flow optionality (deferred to AWL +
arc-plan conductor) work without breaking ARC's structural guarantees: regardless of whether
a WU has a plan-doc, PRD, or even a task list at any given moment, the meta file exists and
carries the WU's identity / state / dependencies / cohort. Workflows and programmatic
elements consume the meta file's structured fields; ROADMAP renders from them; cross-WU
references resolve through them.

### Spec-flow contract deferral

WOR lands three invariants — `meta-*` always exists, task list has invariant structure, a
parseable spec exists in some form before tasks are generated — and the two scaling axes
that govern everything above them: **mode** (Lite vs Full; `pm.mode: arc-in-git` vs `none`)
and **work-shape tier** (atomic / quick / standard, per AWL). WOR explicitly **does not**
codify the optionality contract (which spec form applies under which mode × tier
combination, when `plan-*` is required vs optional, how task-list generation verifies against
tier-collapsed specs). That contract is deferred to:

- **Agile WU Lifecycle (AWL)** — tier classification, per-tier artifact requirements,
  verification model under tier collapse
- **arc-plan Conductor** — canonical planning entry verb, depth selection, status-file /
  meta-file creation contract across all entry routes, spec-flow routing per mode + tier

WOR's role is structural — make sure these invariants and scaling hooks exist so downstream
WUs can populate them without breaking WOR's foundations. Specifically: don't codify rules
that AWL + conductor will need to override (e.g., "PRD always required" or "plan-doc
retires when PRD generated"), and update template-plan.md framing to acknowledge but not
solve the optionality.

Guardrail against escape-hatching ("I'll pick a lower tier to skip planning rigor") is not
WOR's mechanism — it lives in tier classification (AWL: `arc start --tier`; default `quick`,
explicit opt-in for atomic), one-way promotion (atomic → quick → standard easy; demotion
hard/forbidden), conductor's escalation-suggestion behavior on novelty cues, and the
tier-invariant disciplines that stay uniform across tiers (process-task-loop, quality gates,
commit discipline). WOR preserves the structural cuts; AWL + conductor enforce the policy.

### Conductor sequencing — after WOR, before the worktree trio

arc-plan Conductor (plan: `feature/plan-arc-plan-conductor.md`) sequenced between WOR and
the worktree trio (Worktree Foundation || Coord Probe → AWL → CWC) rather than its earlier
holding-bucket position under "Post-Parallelism Trio: Sequencing TBD". Reasoning:

- **Consumes WOR-delivered foundations.** Meta-* invariant, per-WU subdir convention,
  State codification, sessionType inference all land in WOR; conductor reads them.
- **Establishes scaling hooks the trio populates.** Depth selection slots (minimum /
  standard / expanded) absorb AWL's tier-aware defaults; status-file creation contract
  absorbs Worktree Foundation's spawn paths; spec-flow routing absorbs the contract that
  AWL and conductor PRDs settle.
- **Trio WUs simpler when conductor exists.** Each trio WU otherwise has to invent its own
  planning entry surface, and conductor would later have to undo those local assumptions
  as a refactor rather than a feature.
- **Hard deps in both directions absent.** Conductor reads AWL's `**Tier:**` field —
  defaults to "treat as standard" until AWL lands; conductor invokes WF's spawn —
  defaults to "no spawn (current behavior)" until WF lands. Forward-compat both ways.

ROADMAP entry updated to reflect new sequencing; conductor plan's stale upstream notes
(referencing "Interlock Foundation WU current planning") get reconciled against WOR's
settled scope at PRD-time.

### State enum — 4 values, lifecycle phase only; commitment via dir

State enum codified as `Planning | Active | Integrating | Shipped` (4 values; strict state
machine). Each value names exactly one lifecycle phase. Commitment level (uncommitted vs
committed-to-ROADMAP) lives entirely in dir location (`backlog/provisional/<wu>/` vs
`backlog/planned/<wu>/`), not in State. The activity sub-mode within `Planning` state
(backlog-planning vs on-branch-planning) is also dir-derived: backlog dirs vs `active/<category>/`.

Alternatives considered:

- **6-state enum (`Provisional | Planned | Planning | Active | Integrating | Shipped`).**
  Rejected — `Planning` and `Planned` collision is too tight semantically. `Planned` carries
  dual readings ("committed to ROADMAP" vs "planning is complete; ready for activation");
  pairing it with a separate `Planning` state makes the ambiguity acute.
- **5-state with `Accepted` rename (`Provisional | Accepted | Active | Integrating | Shipped`).**
  Rejected — mixes concept-levels in one enum (Provisional/Accepted name commitment;
  Active/Integrating/Shipped name lifecycle phase). Cleaner to put commitment in dir,
  lifecycle in State.
- **5-state with `Queued` rename (`Provisional | Queued | Active | Integrating | Shipped`).**
  Rejected — `queued/` sorts after `provisional/` alphabetically, inverting today's ordering;
  also same concept-level mixing as Accepted variant.
- **Separate `Maturity` field for in-planning/PRD-ready/etc.** Rejected — observable from
  artifact existence (meta-only vs meta+plan vs meta+plan+PRD vs meta+plan+PRD+tasks); a
  field would double-track filesystem reality. Maturity also loses meaning post-activation,
  so a field that goes N/A is poor design.
- **`Planning` state covers backlog-only; on-branch-planning collapses to `Active`.**
  Rejected — Active state would then cover both planning-on-branch and execution-on-branch,
  forcing the execution-vs-planning distinction entirely into branch prefix and losing the
  session-init signal at meta-file inspection time. Cleaner to let `Planning` span all
  pre-execution phases (backlog or on-branch) and let branch prefix disambiguate.

Key property: each WU is in exactly one State at any moment; transitions are well-defined
edges firing at workflow ceremonies (`init-work-unit` / `activate-work-unit` /
`integrate-work-unit` / archive). Branch creation and branch rename do NOT fire State
transitions — they're internal to the `Planning` state. The `activate-work-unit` ceremony
fires the `Planning → Active` transition; branch rename rides alongside but is not the State
trigger.

session-init's `sessionType` inference becomes a composite read:

- `State: Planning` + branch `plan/*` (in `active/`) → `sessionType: planning`
- `State: Planning` + no branch (in backlog) → no active session
- `State: Active` (always on `<type>/*` branch) → `sessionType: execution`
- `State: Integrating` → `sessionType: integration`
- `State: Shipped` → no active session

### Backlog-stage PRDs are anomalous

Today's backlog contains two PRDs (`prd-arcd-rebrand.md` and `prd-arcd-docs-site.md`).
PRDs in ARC are activation-coupled artifacts — they come into being via `1_create-prd.md`
at WU activation, after the plan-doc has matured to formalization-ready shape. Pre-activation
thinking lives in plan-docs. The two backlog-stage PRDs are historical anomalies from a
prior workflow shape; WOR migration demotes them to plan-docs (file rename `prd-*` → `plan-*`
with content reshaped from PRD commitment-language to plan-doc exploratory framing).

The ARCd rebrand work is decoupled from the docs-site work — they're not a cohort, despite
their current filename pairing. ARCd rebrand is provisional (no longer committed; may or may
not happen); docs-site work is committed (still valid; needed after most of backlog clears).
The docs-site WU renames to `docs-site-refresh` to drop the `arcd-` prefix and convey the
"we have a docs site, this is an update + platform migration" framing (vs. "creating
something new"). Routing at migration:

- `prd-arcd-rebrand.md` → `backlog/provisional/arcd-rebrand/plan-arcd-rebrand.md` +
  generated `meta-arcd-rebrand.md`
- `prd-arcd-docs-site.md` → `backlog/planned/docs-site-refresh/plan-docs-site-refresh.md` +
  generated `meta-docs-site-refresh.md`; any current ROADMAP entry for the docs-site work
  updates to the new WU name

Constitutionally, this surfaces a convention worth codifying separately: **PRDs are
activation-coupled, not backlog-stage**. Captured here as design-decision context;
strategy doc capture deferred (could land in `strategy-work-planning.md` or in arc-plan
Conductor's PRD scope as part of the spec-flow contract — out of WOR direct scope).

### `plans/` interlude design history (superseded by Per-WU subdir)

Earlier WOR lean placed all plan content under `backlog/plans/{planned,provisional}/` to
prevent a dirs-first sort sandwich where group dirs (above) flanked standalone plan files
(below) with inbox files wedged between. Per-WU subdirs eliminate that scenario
structurally (no standalone plan files at any backlog level), making the interlude
redundant. Decision recorded here so future readers don't relitigate the path-verbosity
trade — it was paid for a problem that the Per-WU subdir resolution removes.

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

### Post-review-approval composition timing

Early WOR drafts placed Release Notes Entry + Completion Notes composition (plus archive sweep) before PR creation
under `with-integration`. Phase 3 evaluation surfaced two issues with that timing:

- **Premature composition.** Release Notes Entry + Completion Notes + ROADMAP entries composed pre-review reflect
  pre-review scope. If the reviewer requests scope changes (drop a subtask, rename a feature, restructure work), the
  composition is stale by merge time. Re-firing composition is possible but easy to miss; deterministic ROADMAP regen
  lands wrong data.
- **Rejection churn.** Under pre-PR sweep, a rejected PR has archive sweep commits + `Shipped` state already on the
  branch. Re-work requires unwinding both before fixing code, or pushing fixes on top of `Shipped`-state. Both are
  friction.

Resolution: composition + sweep fire **post-review-approval, within the PR, before the final push**:

1. PR opens with code commits only; state `Integrating`.
2. Review iterates (review-response cycles, may push code-fix commits). State stays `Integrating`.
3. `pre-merge-review` extension fires (post-review-response gate).
4. Workflow-interlock: explicit "proceed to archive ceremony" signal from user.
5. Final-form composition lands in working tree (uncommitted): PROJECT-PRD / TECHNICAL-OVERVIEW alignment checks,
   Release Notes Entry, Completion Notes, drain-write.
6. Workflow-interlock: agent surfaces composed content + planned sweep target + ROADMAP delta; explicit
   "proceed to commit + sweep + push" signal from user.
7. Commit composition; invoke archive-work-unit inline (state flip `Integrating → Shipped` + sweep +
   ROADMAP regen).
8. Final push to PR; merge follows.

Per-worktree isolation invariant (R15) preserved: sweep lands on the WU branch before merge in both old and new
sequencing — moving the sweep within the PR (from pre-open to post-approval) does not change main's `active/{name}`
window. The load-bearing constraint is "swept before merge," not "swept before PR-open."

`Shipped` semantic clarified: "branch is in its terminal form; merge pending or complete." Under sync-merge (WOR's
primary flow), the window between `Shipped`-on-branch and merge is brief and intentional — the developer is
actively driving the merge button. Async-merge nuances stay Concurrent Work Conventions scope per R18.

The two workflow-interlocks bracket the high-judgment composition middle: step 4's "ready to compose" gate, step 6's
"composed content looks right, ship it" gate. Mechanical sweep + state flip after step 6 is reviewable via
`git log -p` if anything seems off, but the agent surfaces all changes inline before that point — the
interlocks are designed so the user can catch problems before commit, not after.

### `archive.cadence: deferred` considered and rejected

Early PRD drafts specified a third cadence value `deferred` (sweep at next-WU planning batch) as
a distinct option between `with-integration` and `manual`. Evaluation in Phase 3 found no
mechanism gap it would fill:

- The "sweep at next-WU planning batch" trigger has no wiring point in WOR's workflow set.
  `init-work-unit.md` (planning kickoff) carries no prior-WU sweep step, and adding one is poor
  UX — planning ceremonies surprise-committing prior-WU file moves entangles unrelated work.
- The PRD's "current pattern" parenthetical conflated user behavior pattern (people manually
  archive around planning time) with system mechanism (ARC auto-fires at planning). The former
  is `manual` usage habit; the latter never existed in pre-WOR ARC.
- Every plausible use case for `deferred` collapses to one of the surviving two values:
  batched housekeeping → `manual`; async-merge accommodation → `manual` (or future `on-merge`);
  high-rejection PR risk → `manual`; archiver ≠ implementer role separation → `manual`.
- Future async-merge cadence work (Concurrent Work Conventions scope per R18) would want a
  crisply-named value like `on-merge` with post-merge auto-fire semantics, not a revival of
  the underspecified `deferred`.
- ARC's configurability stance favors small enums over knob-soup. A third value with no
  distinct mechanism is dead weight that adopters either pick by accident or have to research
  to ignore.

WOR ships two values: `with-integration` (default) | `manual`. Pre-WOR Phase 2 had already
narrowed the existing enum to two values; PRD R16, Task 3.4.g, Task 3.7, and this notes file
were corrected to match. The `with-integration` window where main's `active/` contains the WU
until the integration PR merges is the trade-off for sweep-as-you-go — bounded and resolved at
merge.

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

### Release-lifecycle model — currently unspecified

WOR codifies the contribution-side of release activity (per-WU Release Notes Entries per R30–R32) but leaves the
cut/aggregate/tag/announce side unspecified. ARC has no codified release lifecycle: no version-bump convention, no
CHANGELOG aggregation workflow, no tag-cut ceremony, no notion of release branches vs. tag-on-main vs. continuous
deployment as adopter-facing choice. Aggregation tooling is deferred ("reads per-WU entries, not commit history") but
the workflow that invokes that tooling, and the lifecycle phase around it, is uncodified.

Surfaced during WOR Phase 2 execution (2026-05-14) when verifying CB spec alignment for R1: CB's recommended set
includes `release/` and `hotfix/`. `hotfix/` maps cleanly to atomic-tier WUs (urgent, low-ceremony, single-purpose) and
ARC adopts it. `release/` doesn't map to any current ARC lifecycle phase — adopting the prefix without modeling the
phase creates an orphan type (strategy can't describe what to do on a release branch).

Resolution path: `release/` dropped from ARC's default branch type set (per R1 amendment). Adopters who need release
branches today can add `release/` via `branch-format` method override. Canonical handling deferred to a future ARC WU
that codifies release lifecycle — landing-pad plan-doc captures the gap as a discussion surface for the eventual
scope/shape decision (release-branch model vs. tag-on-main vs. configurable).

Mitigation in the interim: `branch-format` method preamble documents the gap explicitly; per-WU Release Notes Entries
continue accumulating in archived meta files, ready for whatever aggregation/cut ceremony lands next.

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

### Customization-architecture smell surfaced mid-execution (planning-checkpoint deferred)

Drafting 3.3's workflow body (activate-work-unit.md restructure) surfaced a design smell in the
R46 `review.planning_checkpoint` config key, then in ARC's broader customization architecture.
The smell: `review.planning_checkpoint: required` is a bare halt-toggle with no associated
activity — there is no "planning-review method" the way `review.pre_merge` gates a `diff-review`
method. R46 was framed as following `review.pre_merge`'s precedent, but `pre_merge` gates a
concrete method invocation while `planning_checkpoint` gates nothing. The composition R47 cited
("config + extension as independent axes") collapses to "author a `pre-activation` extension
whose `.actions` is a halt prompt" — the config adds no expressive power.

Following the thread further: methods in ARC have an override axis but no clean enable/disable
axis. So when ARC wants a default-on activity that teams might opt out of, it ships a parallel
config key — `review.pre_merge` is exactly this pattern. The shape is workable but not
principled. Without a method `active` flag, the config surface accumulates one knob per
opt-out-able activity, and the meaning of each knob varies (gate-invocation vs. halt-and-confirm
vs. pure value).

R46 was the trigger; the broader concern is the customization architecture itself. Resolution
moved out of WOR scope to `plan-customization-architecture.md`. For WOR's forward-compat
discipline: R46 deleted; arc-config.yml + CLI types + validator + tests reverted (commit
`5c19d8d8`'s content un-shipped); R47's `pre-activation` extension stands on its own; R48's
convention-inventory row updated to "Extension only."

Supersedes the design rationale captured at § Design Decisions § Default `disabled` for
planning-checkpoint review (line 55) and the pressure-points sections § Planning-checkpoint
review default (line 478) and § Opt-in framing — codification ahead of curve (line 484). Those
sections describe what was originally proposed; the deferral above describes what shipped.

---

## Open Design Questions

### USER-INBOX universality under `pm.mode: none` and (future) Lite mode

R59 deliberately splits seeding by file class: per-user files (SESSION-NOTES, WORKING-MEMORY,
USER-INBOX) seed unconditionally; project-shared backlog files (BACKLOG-INBOX,
`backlog/ATOMIC-INBOX.md`) gate on `pm.mode == arc-in-git`. Task 5.6.c codified the per-user
arm in CLI code (retired `pmMode` from `PostInitSetupOptions` / `UserAddOptions` /
`JoinOptions`; dropped `PM_MODE_ARC_IN_GIT` from setup functions). Result: under
`pm.mode: none`, USER-INBOX seeds with its `## Atomic` and `## Backlog` sections present,
but project-side drain targets (`backlog/ATOMIC-INBOX.md`, `backlog/BACKLOG-INBOX.md`,
`backlog/{planned,provisional}/`) don't exist — § Backlog has no drain destination.

**Inherited, not introduced.** Pre-WOR per-user `ATOMIC-INBOX.md` had the same shape:
always seeded, no drain target under `pm.mode: none`. WOR widens the affected surface
(atomic + backlog sections vs. atomic only) without changing the underlying coherence gap.

**Not WOR's to resolve.** Two downstream WUs own the redecision:

- `plan-arc-in-git-as-default.md` (R64 / Task 6.11) — the "modes scale rather than swap
  shapes" thesis is precisely this question generalized. The Implication Inventory section
  (6.11.d) should call out USER-INBOX's role under each mode as a worked example. Task
  6.11 carries an explicit "pull from this section" pointer.
- `plan-arc-modes.md` Lite design pass — Lite is solo, single-WU, has no cross-WU
  coordination surface. USER-INBOX § Backlog reads even weirder there than under
  `pm.mode: none`. Plan-arc-modes flagged its own design pass is behind recent ARC
  evolution; this question lands in that revisit.

**Action:** Continue with the current shape (PRD-consistent). Carry forward as an
Implication Inventory bullet during 6.11 authoring and as input to arc-modes' Lite design
pass when it runs.

---

## Migration Mapping Reference

### `**State:**` value recodification

Under the 4-state enum (`Planning | Active | Integrating | Shipped`), commitment level
(provisional vs planned) lives in dir location, not in State. Old → new mapping for in-flight
WU meta files at WOR activation:

- `Planning` → `Planning` (preserved; covers both backlog-Planning and on-branch-Planning;
  dir location distinguishes — `backlog/{provisional,planned}/<wu>/` vs `active/<category>/`)
- `Draft` → `Planning` + dir `backlog/provisional/<wu>/` (pre-sequencing thinking)
- `Planned` (any pre-WOR use) → `Planning` + dir `backlog/planned/<wu>/` (sequenced, committed)
- `In Progress` → `Active` (execution underway on `<type>/*` branch)
- `Active` → `Active` (already aligned; no change)
- `Complete` + `**Integration:** Merged` → `Shipped` (post-merge, archived)
- `Complete` + `**Integration:** (PR open)` → `Integrating` (PR open or sweep in progress)
- Any `**Integration:**` field value folds into `**State:**`; field retires

State transitions fire at workflow ceremonies (not on branch creation):

- `init-work-unit` → creates meta with `State: Planning`
- `activate-work-unit` → `Planning → Active` (branch rename + plan-doc removal ride alongside;
  the rename itself is internal to Planning state until the State flip fires)
- `integrate-work-unit` → `Active → Integrating`
- archive ceremony → `Integrating → Shipped`

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

- `backlog/feature/plan-*.md` and `backlog/technical/plan-*.md` migrate to per-WU subdirs
  under `backlog/{planned,provisional}/<wu-name>/`. Each plan's companions (`notes-*.md`,
  any `prd-*.md`, etc.) move into the same subdir.
- Each migrated WU gets a `meta-<wu-name>.md` stub generated alongside its plan
  (interactive backfill: `Origin` / `Owner` / `Depends On` / `Cohort`; all backlog WUs
  land `State: Planning` per the 4-state enum — commitment level lives in dir, not State).
- Routing rule (commitment-dir determination):
    - On ROADMAP today → `backlog/planned/<wu-name>/`
    - Not on ROADMAP → `backlog/provisional/<wu-name>/`
- Backlog-stage PRDs (`prd-arcd-rebrand.md`, `prd-arcd-docs-site.md`) demote at migration:
  rename `prd-*` → `plan-*` with content reshape from PRD commitment-language to plan-doc
  exploratory framing. The docs-site WU additionally renames `arcd-docs-site` →
  `docs-site-refresh`. Not a cohort — two standalone WUs.
- Sibling sets (parallelism trio, interlock-release-wrappers cluster, etc.) pick up cohort
  wrapper subdir within their state-dir: `backlog/{state}/<cohort>/<wu-name>/`.

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
