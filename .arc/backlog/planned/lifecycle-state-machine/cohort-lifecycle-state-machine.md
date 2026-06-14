# Cohort: `lifecycle-state-machine`

> _Identity and coordination record for this cohort. Membership is **derived** from each member's `Cohort`
> field — recorded here only as shared coordination, never as a roster or status table. The detailed,
> task-driving design lives in each member's `draft-*`; this doc holds what the cohort owns _as a whole_ — the
> as-is evidence spine, the north-star thesis, the cross-member contracts, and the forward-compat seams._

**Parent:** [none]

**Purpose:** Make the work-unit lifecycle an explicit, **complete** (gapless), coherent state machine — every
state and transition named with its inverse, across the WU lattice _and_ the two adjacent lifecycles that cross
into it (errands, cohort docs) — and take the first deliberate step toward the north star where deterministic
transition _mechanics_ live in the CLI and workflows shrink to the judgment that decides whether/when to fire
them. The members share one concern: the lifecycle reasoned about and built as a single machine, rather than the
half-built, asymmetric verb set restated per workflow that exists today.

---

## The as-is evidence spine — the lifecycle as it exists today

The shared baseline every member corrects. Three interacting lifecycles.

**WU lattice.** States: `provisional` → `planned` (in `backlog/`) → `Planning` → `Active` → `Integrating` (in
`active/`) → `completed`; plus `abandoned` (≡ deleted, no residue). Today ~90% markdown: of ~10 transitions,
exactly one is code-driven (`arc start` create-new, the newest, bolted on). The rest are agent-run markdown
ceremonies whose transition rules (branch prefix, meta `State`, preconditions) are restated per workflow. The
verb set is a half-built, asymmetric set: `activate ↔ deactivate` is the only clean inverse pair; `park`/`resume`
are unshipped on both sides; `graduate` has no inverse; the create-stub forward edge has no owner. `arc start`
mis-scaffolds a name that already exists as a `backlog/` stub. Relocation logic (`backlog ↔ active`,
`active → completed`) is re-authored across `init-work-unit` Path A, `decompose`'s park-exit, `archive`'s sweep,
and the unshipped park/resume.

**Errand lifecycle (adjacent).** `chore/<slug>` branch, no meta, no `(phase, location)` — state derived from
branch + PR (`in-progress` / `awaiting-merge` / `merged-cleanup` / `stale` / `materializable`). Crossing edges:
inbox → errand (`drain-inbox`); errand → WU (`init-work-unit` Promote Errand path).

**Cohort-doc lifecycle (adjacent).** `cohort-<name>.md` minted at `decompose` (or incrementally on the predicted
arm), lives in `backlog/planned/<cohort>/` as members graduate/ship around it, swept to `completed/` at
last-member ship by `lifecycle-transition-core`'s `archive` fire-point on the resolver's `isArchivalTriggered`
signal (the resolver detects; transition-core sweeps). Not a WU; membership derived from each member's `Cohort`
field.

## North star — deterministic mechanics in the CLI

The directional target this cohort takes its first step toward. The lifecycle splits into two layers:

- **Mechanics** (`git mv`, branch create/rename, scaffold, ROADMAP regen, collision detection,
  transition-legality validation, completion-order / dated-path computation) — pure rule-following. **→ CLI.**
- **Judgment** (the interlocks — _should_ we activate? WU or errand? what's the cut-map? is the design
  spec-ready? merge approval; the create-time commitment / priority / `Class` calls) — inherently human/agent.
  **→ stays in the workflow.**

The CLI _executes_ transitions; it never _decides_ to take them (except where the decision is genuinely
deterministic — a name collision forces graduate-not-scaffold) and never _fabricates_ judgment values
(commitment, priority, `Class`): it requires them supplied. CLI-migration depth is settled at **B1** — a
hand-rolled declarative transition table as code + a thin imperative executor, over _logical_ `(phase, location)`
(arc-backend-safe), full start/relocation/sweep scope. Not B0 (doc-only) and not B2 (generic engine).

## Coordination

### Sequencing

```text
lifecycle-state-resolver        (foundational — read-side state resolution; lands first)
  └─> lifecycle-transition-core (the state machine + executor + mutator bundle; the heavy member)
        ├─> decompose-matrix    (the decompose transition's full matrix)
        └─> errand-lattice      (the adjacent errand lifecycle + character gate)
              └─> lifecycle-closeout  (cross-cutting doc sweep + final consistency audit)
```

Each `Depends On` edge is a **live gate discharged at the depended-on member's activation**, not a hard blocker.
`decompose-matrix` and `errand-lattice` are parallel-able once `lifecycle-transition-core` lands.

### Shared contracts

Cross-member design no single member owns in isolation — each is a _pointer_ to its owning member's spec plus the
consumers, never the design itself:

- **The `(phase, location)` state-space model + derived-state predicates.** The two orthogonal axes (phase = the
  meta `State` field; location = `provisional` / `planned` / `active` / `completed` as a logical value) and the
  derived-state projection over them. Authoritative definition owned by **`lifecycle-state-resolver`** (the
  read-side foundation: _what the states are and how you resolve one_). Consumed by every member — it is the
  substrate the resolver's slug→state projection exposes, the matrix transforms over, the closeout documents, and
  the transition table moves between. _Planning maturity_ (draft / spec / tasks presence) is **not** a state value
  — it is a derived readiness overlay (owned by `planning-pipeline-readiness` / `roadmap-tooling`), layered over
  `planned` like `blocked`; the "did work begin?" signal is the phase axis (`parked` vs `planned`).
- **The code-level transition table** (legal edges between those states, inverses, guards). Owned by
  **`lifecycle-transition-core`** (_how you move between states_). Consumes the state-space model above.
- **The slug→state resolver** — the derived projection of `(phase, location)`: `nonexistent` / `provisional` /
  `planned` / `planning` / `active` / `integrating` / `parked` / `shipped` (`parked` ≡
  `(Active, planned)`, with physical storage under `backlog/planned/`; derived not stored;
  `abandoned ≡ nonexistent`, no residue). Owned by `lifecycle-state-resolver`. Consumed by
  `lifecycle-transition-core` (`start` dispatch + worktree-occupancy guard) and `decompose-matrix`
  (cohort-membership reads).
- **The 1↔1 relocation/sweep mutator bundle** (`relocate-artifacts` / `reconcile-branch` / `reconcile-worktree` /
  `set-phase`, fired together so the three-encoding invariant holds by construction). Owned by
  `lifecycle-transition-core`. `decompose-matrix` consumes only the **teardown legs** (`reconcile-branch` /
  `reconcile-worktree`) — it is _not_ a `relocate-artifacts` caller.

### Soft coordination — forward-compat seams (postures, not dependencies)

This cohort is the **first real CLI-orchestration work** and sits _upstream_ of nearly all the substrate it would
naturally consume, so the posture is "design toward / hand-roll now / build v1," not "pull in early":

- **`arc-backend` (ADR-022)** — the deepest constraint. Model WU state as a logical record (phase, location as
  fields), physical encoding (directory, branch) a projection. **Design guard:** the resolver and the
  worktree-occupancy guard resolve state from location + meta fields, **never** `git branch` / `git log`
  inference.
- **`operational-state-docs`** — transition _behaviors_ (slug→state resolver v1, cohort-membership resolver +
  archival-trigger, dep-edge discharge) are built **here** against the markdown substrate; OSD later re-homes them
  onto records (zero reshape). The record/projection _substrate_ itself stays OSD's.
- **`cli-substrate-adoption`** — hand-roll the thin executor's git + non-TTY mechanics now; CSA migrates them to
  execa / zod / neverthrow + the shared prompting substrate later. The `stub` required-fields _policy_ stays ours
  (authored in `strategy-work-organization`); the non-TTY prompting _mechanic_ migrates to CSA.
- **`roadmap-tooling`** — this cohort emits derived-state predicates + the new **Parked** render bucket; RT
  renders. Interim: `reconcile-roadmap` / `reconcile-status-user` ride the hand-render discipline, which must
  cover the Parked bucket until RT ships.
- **`composable-workflows`** — the workflow-shell twin. The mutator bundle is the code-tier worked example of a
  `public + fixed` shared procedure; the ceremonies' judgment halves are the markdown-tier fragments CW will own.
- **`graduation-cleanup`** — a companion history-rewrite ceremony riding the `activate` / `park` edges; those
  edges are **correct without it** (additive, not a consistency gap). `lifecycle-transition-core` names the hook
  point; the ceremony stays downstream.
- **`idiomatic-alignment`** — names the verbs (`start` / `park` / `promote` / `demote` / `reopen` / `abandon`);
  the final register check coordinates with it.
- **`out-of-wu-entry`** (member of `agile-parallelism`, **not** this cohort) — shares the `session-init` entry
  surface and the `resolveWriteContext` primitive with `lifecycle-transition-core`'s planning-entry gate. The two
  are **distinct concerns** (entry-signal dispatch vs. lifecycle-transition write-context) — sequence, don't
  merge. Whoever touches `resolveWriteContext` / the start-new code path second rebases on the first;
  `out-of-wu-entry` is bugfix-grade and can land ahead of or beside `lifecycle-transition-core`.

### Cross-cohort

Open seams whose home is elsewhere, recorded here only for a visible owner:

- **OSD record/projection substrate** (structured-record model, render/reconcile engine, the managed-doc
  migration) — `operational-state-docs`, a different foundational domain.
- **Planning-pipeline _content_** — `planning-pipeline-readiness` (the draft→spec exit-readiness judgment at the
  same `arc-plan` seam our entry gate sits on; the two compose).
- **Decomposition ownership-distribution motivation** (decompose to distribute pieces across single-owner devs) —
  team-scale doctrine owned by `single-owner-wu-model` (a parked `concurrent-work-conventions` member), not the
  state machine. `decompose-matrix` carries a pointer, not the design.
- **`finalize-parallelism`** (closeout of `agile-parallelism`) — downstream consumer. It depends on the lifecycle
  being coherent, so it carries a `Depends On: lifecycle-closeout` edge (the cohort's tail member); it should
  sequence after this cohort.

### Closeout criteria

The cohort is complete when **all five members ship AND the corpus is consistent** — the latter verified by
`lifecycle-closeout`'s final audit (no documented-but-unbuilt or half-migrated lifecycle surface).

**The consistency-on-exit standard (the cohort's governing principle).** When the transformed domain is this
foundational (the lifecycle core), the cohort owns leaving the substrate _coherent_, not merely
functional-in-parts: it absorbs the mechanical cascades that would otherwise leave a documented-but-unbuilt /
half-migrated core. **The limit (the test):** absorb what would be _inconsistent_ if deferred (model says X,
substrate doesn't do X); leave out what is merely _un-enhanced_ (substrate does X correctly, lacks an additive
nicety — e.g. `graduation-cleanup`) and what is a _different foundational domain_ (OSD's record/projection
substrate). Per-member docs still update _with_ their code (local consistency); `lifecycle-closeout` does the
cross-cutting sweep + audit (global consistency).

## Members

### `lifecycle-state-resolver`

_Exposes:_ the `(phase, location)` state-space model + derived-state predicates (the shared read-side contract),
the slug→state resolver (its derived projection), and the lifecycle-complete cohort-membership resolver +
archival-trigger loop — the read-side state-resolution infra every other member queries. Also the dep-state
_read_ half of dep-edge discharge (the _write_ half is transition-core's, at `activate`).

_Consumes:_ nothing from siblings (foundational). Designs _toward_ OSD's eventual record substrate.

### `lifecycle-transition-core`

_Exposes:_ the code transition table (legal edges over the state-space model), the thin executor, the 1↔1 mutator
bundle (with teardown legs), the guards, `start` dispatch, the park@Active pointer-record, the `archive` sweep,
the `stub` required-fields contract, the planning-entry write-context gate, and the dep-edge discharge _write_ at
`activate` — the state machine itself.

_Consumes:_ `lifecycle-state-resolver`'s `(phase, location)` state-space model (the substrate its transition table
moves over) and the slug→state projection (for `start` dispatch + the worktree-occupancy guard + the dep-state
read at `activate`).

_Coordination — dep-edge discharge readiness:_ the resolver exposes `shipped?` as a _merged fact only_
(`integrating` reads not-landed), deliberately leaving the "may a dependent start at its dependency's
_integration_ rather than its merge?" question — the team-review-latency case, where blocking a dependent on
days of review is undesirable — to this member's discharge write. Reckon with it explicitly when building
dep-edge discharge at `activate`: compose the readiness policy over the resolver's enum (`shipped` ∨
`integrating`), rather than redefining `shipped?`.

### `decompose-matrix`

_Exposes:_ the full decompose matrix (4 transform shapes × 3 parent positions), the generalized conservation
gate, and the rewritten `decompose` workflow.

_Consumes:_ `lifecycle-transition-core`'s mutator-bundle teardown legs and the resolver's cohort-membership reads.
Coordination seam with `errand-lattice`: whether `decompose` itself is runnable as a multi-increment errand
(its backlog-stub-source / heterogeneous-home arms are errand-class) keys on the character gate.

### `errand-lattice`

_Exposes:_ the errand lifecycle modeled as a distinct adjacent lattice + its crossing edges, the errand-vs-WU
**character gate**, and the maintenance-errand-class vocabulary/definition cascade.

_Consumes:_ `lifecycle-transition-core`'s crossing-edge firing points (errand → WU promotion, inbox → errand).

### `lifecycle-closeout`

_Exposes:_ the cross-cutting verb-rename documentation sweep (strategies, rules, briefs, lifecycle workflows) and
the final consistency audit that certifies the corpus matches the shipped model.

_Consumes:_ all four prior members — it is the global-consistency tail that runs only once their code + local
docs have landed.

## ADR anchors

- `adr-019-work-unit-lifecycle-reform.md` — the single-branch-per-WU substrate the lifecycle rests on.
- `adr-021-introduce-errand-work-class.md` — the Errand-vs-WU taxonomy `errand-lattice` extends.
- `adr-022-managed-operational-state-documents.md` — the record/projection model the logical `(phase, location)`
  design targets.
- `adr-024-cohort-decomposition-model.md` — the cohort/nesting model `lifecycle-state-resolver` resolves
  membership over.

---
