# Cohort: `concurrent-work-conventions`

> _Coordination record for the concurrent-work-conventions sub-cohort — the single-owner members that
> together close the agile-parallelism cohort by shipping **both halves** of principled multi-WU work: the
> conventions layer and the merge-safety + lifecycle mechanism that makes those conventions real. Internal-dev-
> facing; not shipped. Each member's detailed design lives in its own `draft-*`; this record holds only what the
> sub-cohort owns as a whole — the shared thesis, cross-member contracts, sequencing, and the seams to other
> cohorts. Membership is **derived** from each member's `Cohort` field, never a roster here._

**Parent:** `agile-parallelism`

**Purpose:** Ship principled multi-WU work as a coherent whole. A single matured design — Concurrent Work
Conventions — split along natural deliverable boundaries into four single-owner member WUs: the conventions
doctrine (`concurrent-work-doctrine`), the merge-safety mechanism (`merge-safety-mechanism`), the async-merge
lifecycle accommodation (`async-merge-lifecycle`), and the single-owner-WU model rewrite (`single-owner-wu-model`) —
plus two members later extracted laterally from `async-merge-lifecycle` (see § Coordination provenance):
`notes-merge-coherence`, the single-machine notes-merge engine correctness its post-merge notes-sync leg depends
on, and `worktree-default-start`, the start-time spawn/steering surfaces (the origin keeps the completion tail).
The members share one design and dense internal coordination — a reused behind-base primitive, a shared
projection builder, the doctrine spine the other three reference, the append-only-until-integration principle, and
the cohort-doc concurrency exception — which is what makes this a coordinating sub-cohort rather than a flat
browsing bucket. The design target is **any team size**; solo is the degenerate case, never the target.

---

## Coordination

### Sequencing

Derived orientation view; each member's own `Depends On` edges remain the source of truth.

```text
concurrent-work-doctrine            (spine — no internal deps; carries most of the weight)
        │
        ├── merge-safety-mechanism          (deps: doctrine)
        │            │
        │            └── async-merge-lifecycle   (deps: doctrine, merge-safety-mechanism, notes-merge-coherence —
        │                                          reuses the behind-base primitive in its completion sweep; its
        │                                          notes-sync leg consumes notes-merge-coherence's engine)
        ├── single-owner-wu-model           (deps: doctrine)
        └── worktree-default-start          (deps: doctrine — start-time spawn/steering; extracted laterally
                                             from async-merge-lifecycle, parallel to it)

notes-merge-coherence               (no internal deps — orthogonal lib/user-sync correctness; build-first
                                     prerequisite of async-merge-lifecycle's notes-sync leg)
```

`concurrent-work-doctrine` is the spine the other three convention members reference; once it lands they are
largely independent and parallelize, with the soft edge that `merge-safety-mechanism` ideally precedes
`async-merge-lifecycle` (the completion sweep reuses merge-safety's behind-base primitive). `notes-merge-coherence`
sits outside the doctrine spine (orthogonal engine correctness) but is a **build-first** prerequisite of
`async-merge-lifecycle` — land it before that member executes. Members land uniformly in `backlog/planned/`; each
activates separately, in dependency order, via `init-work-unit` Path A.

> **Watch (realized twice):** `async-merge-lifecycle` proved large enough that two orthogonal surfaces were
> extracted laterally as siblings (the lateral fan-out the cap predicted — siblings here, not a deeper nest):
> first its `lib/user-sync/` correctness as `notes-merge-coherence`, then its start-time spawn/steering surfaces
> as `worktree-default-start`. The origin now reads as a single coherent concern (the async-merge completion
> tail); any further split would again fan out laterally, never nested deeper than this two-segment cap.

### Coordination provenance

Fanned out from `async-merge-lifecycle`: `notes-merge-coherence` (at-cap lateral extraction — the origin survives
as a still-active member; only its orthogonal `lib/user-sync/` engine-correctness surface was carved off).

Fanned out from `async-merge-lifecycle`: `worktree-default-start` (at-cap lateral extraction at create-spec — the
origin survives as a still-active member; its start-time spawn/steering surfaces — `arc start` create-new wiring,
worktree-by-default flip, `Class`-aware plate-balance, cohort-doc discovery — were carved off, leaving the origin
the async-merge completion tail).

### Shared contracts

Cross-member design no single member owns — each names the owning member's spec and the consuming members.

- **The behind-base / `origin/<base>`-distance primitive.** A ref-parameterized base-distance primitive plus a
  session-init probe slot (worktree-channel-shaped: `state` / `ahead` / `behind` / `recommendedAction` /
  `recommendedPromptText`). _Owner:_ `merge-safety-mechanism` (authoritative definition). _Consumers:_
  `async-merge-lifecycle` (its in-flight completion sweep reuses the primitive for behind-base classification);
  `concurrent-work-doctrine` (the reconcile-triage convention narrates the advisory detector this primitive
  backs). Built general so `cross-machine-sync-coherence`'s `baseBranchSync` _extends_ it (local-base-ref subject,
  `session.init_pull.main`, and the cross-machine layer) rather than double-building. Open seam: whether
  `merge-safety-mechanism` owns the diverged-branch patch-equal supersession detection or hands it to
  `cross-machine-sync-coherence` — decide at the member's spec.

- **The materialized-manifest (projection) builder.** A canonical builder that strips removal tombstones to the
  rendered-file projection, shared by `arc user load` and sync-status so the save-path hash, the load-path
  materialization, and the status comparison basis are one projection; paired with idempotent tombstone-aware
  removal resolution. _Owner:_ `notes-merge-coherence` (authoritative definition). _Consumers:_
  `async-merge-lifecycle` (its post-merge notes-sync leg requires the engine coherent before wiring the sync);
  `cross-machine-sync-coherence` (extends the builder for its cross-machine drift detection — subject-parameterized,
  build-general-once, the same pattern as the behind-base primitive). Bridge — retires into
  `operational-state-docs`' record/projection model (ADR-022 §4).

- **The unified advisory overlap-judgment doctrine.** One oracle-backed concurrency check, two trigger surfaces
  (WU-activation and `errand-launch`). _Owner:_ `concurrent-work-doctrine` (the doctrine and rubric in
  `strategy-concurrent-work.md`). _Consumers:_ the already-shipped In-Flight Awareness fire-sites consult it via
  thin pointers; `single-owner-wu-model` supplies the self/foreign asymmetry the doctrine keys on (single-owner
  WUs make this the entire "all-owner" addition). No new overlap-probe tooling — doctrine over mechanism.

- **`Class`-aware plate-balance awareness.** The doctrine ("roughly one genuinely-novel stream" balance rule) is
  `concurrent-work-doctrine`'s; the single advisory annotation line fed into session-init's next-work discovery is
  `worktree-default-start`'s surface. Both consume the `Class` contract (shipped with `class-model-foundation`);
  neither redefines it. Awareness-only — surfaces once, never gates / reorders / re-nags.

- **Cohort-`{name}.md` discovery at session-init.** Agent awareness of the coordinating cohort doc is load-bearing
  for parallelism actually coordinating. _Owner:_ `worktree-default-start` (the session-init discovery + optional
  surfacing; `AGENT-BRIEF.ARC` note). _Consumers:_ all members rely on the doc being read for their cross-member
  coordination to land.

- **The append-only-until-integration principle.** A pushed WU branch is the cross-machine sync substrate, so it
  is append-only until integration. _Owner (convention):_ `concurrent-work-doctrine`. _Owner (backstop):_
  `merge-safety-mechanism` (session-init `diverged`-handler patch-equal supersession downgrade + offer reset;
  optional pre-force-push warning). The convention and the detection backstop are two halves of one contract.

- **The all-owner gate at entry-level writes.** Errand Enablement's advisory foreign-artifact gate (file-level)
  is the floor; `concurrent-work-doctrine` extends it to entry-level writes. _Owner:_ `concurrent-work-doctrine`;
  the entry-level re-homing of foreign-owned atomics folds into the same all-owner gate doctrine that
  `merge-safety-mechanism`'s write-context extensions surface mechanically.

### Soft coordination

- **Ground every buildable against shipped reality.** The origin draft historically over-scoped against shipped
  infra; each member's spec must ground its buildables against shipped code/workflows first rather than rebuild.
  Four standing drift constraints: In-Flight Awareness shipped the activation-check _mechanism_ (not just the
  oracle) — Pillar 1 adds doctrine only; the async-merge touchpoints are largely shipped (`archive.cadence:
  manual` + the stale/in-flight sweeps) — the audit is mostly audit-don't-rebuild; the write-context classifier
  is shipped (`lib/git/write-context.ts`, `errand-branch.ts`) — net-new is the path-surface dimension,
  chore-awareness, the pre-commit backstop, and wiring; the at-branch-creation base-staleness check is shipped —
  the behind-base detector composes with it.

- **Completion is a worktree-agnostic, primary-worktree boundary action.** The integration tail (`gh pr merge` +
  `arc user close` + worktree-remove-from-elsewhere) runs cleanest from the primary worktree, never a
  mid-increment switch — a convention `concurrent-work-doctrine` records and `async-merge-lifecycle` mechanizes.

- **Errand (`chore/`) branches ride the same discipline.** Post the `work-routing-discipline` re-pivot, errands
  are execution-only `chore/<slug>` branches (full) / direct base commits (partial) — mini-PRs that ride the same
  rebase / merge and async-merge discipline the doctrine codifies. Their integration ordering and in-flight
  coordination are this sub-cohort's territory; fold `chore/` branches into the concurrency rubrics.

### Cross-cohort

Seams whose home is another cohort, recorded here so they have a visible owner.

- **`roadmap-tooling` — concurrency-safety overlay on the "Next" slice.** The ROADMAP / STATUS render grammar,
  views, and automation belong to `roadmap-tooling` (render standard + now/next/later horizon mode). This
  sub-cohort contributes only the concurrency-safety overlay on the "Next" slice — the parallel-safety question
  WOR explicitly deferred ("which Ready WUs are concurrency-safe with what's in flight"). Likely an on-contact
  convention, not a rendered field; if a parallel view is ever hand-curated it is a **sibling** artifact, never
  baked into the hand-maintenance-free derived ROADMAP. Owned by `concurrent-work-doctrine` on this side.

- **`cross-machine-sync-coherence` — extends the behind-base primitive and the projection builder.** This
  sub-cohort ships the ref-parameterized base-distance primitive + probe slot (`merge-safety-mechanism`) and the
  materialized-manifest projection builder (`notes-merge-coherence`); the cross-machine layer (local base-ref
  staleness, partial-push trust, notes-ref coherence) is explicitly the next WU's, not this one's. Both primitives
  are built for it to extend rather than rebuild. Write-back: moving the status comparison basis raw → projection
  shifts the classifier behavior CMSC's defect-1/2 analysis was written against — CMSC re-grounds its T3 scope once
  `notes-merge-coherence` lands.

- **`graduation-cleanup` — spec-graduation cleanup vs. the lighter merge gate.** Reconcile that stub's
  spec-graduation cleanup ceremony (dropping a WU's own planning-noise commits before the Planning → Active flip)
  with the planning-layer / lighter-gate merge treatment doctrine carries. Related but distinct — intra-WU history
  hygiene vs. cross-WU merge routing.

- **Cohort / wave grouping as first-class structure (open).** Whether explicit cohort/wave metadata adds value
  beyond what the dependency graph + WOR's group-dir convention already encode — strengthens only if cohorts gain
  shared lifecycle events (today each member integrates / archives independently). Deferred; surfaced for whoever
  owns ROADMAP-visualization research.

### Closeout criteria

The sub-cohort — and with it the parent `agile-parallelism` cohort — archives when **all six members have
shipped**: the conventions doctrine, the merge-safety mechanism, the async-merge lifecycle accommodation, the
single-owner-WU model rewrite, the notes-merge engine correctness (`notes-merge-coherence`), and the
worktree-default start steering (`worktree-default-start`). The parent cohort's closeout was explicitly gated on
the merge-safety cluster landing somewhere (not merely the conventions doc shipping); that cluster is distributed
across `merge-safety-mechanism` and `async-merge-lifecycle` here.

## Members

### `concurrent-work-doctrine`

_Exposes:_ `strategy-concurrent-work.md` — the doctrine spine the other three members reference: the unified
advisory overlap-judgment rubric (both trigger surfaces), parallelize-vs-serialize with the `Novel`-stream
plate-balance rule, branch/rebase discipline, append-only-until-integration convention, merge-ordering and
async-merge guidance, worktree operational guidance, anti-patterns, the main-worktree-under-full-protection
convention, and the team-mode-orthogonality framing. The self/foreign asymmetry and the all-owner gate doctrine.

_Consumes:_ the `Integrating` state (WOR, shipped) for awaiting-review framing; the `Class` contract
(`class-model-foundation`, shipped) for plate-balance; the behind-base primitive from `merge-safety-mechanism`
(narrated as the reconcile-triage detector); the single-owner model from `single-owner-wu-model` (the asymmetry
rests on one-DRI WUs). Soft prerequisite: mid-WU errand/housekeep entry (`out-of-wu-entry`, ships ahead).

### `merge-safety-mechanism`

_Exposes:_ the behind-base / `origin/<base>`-distance primitive + session-init probe slot (the shared contract
above); write-context extensions (path-surface dimension + chore-awareness composing `lib/git/write-context.ts`
and `errand-branch.ts`) + a pre-commit backstop hook; the merge-commit hook/footer exemption (`MERGE_HEAD` /
2-parent skip) plus an `integration` footer kind; the append-only-until-integration detection backstop
(patch-equal supersession downgrade + reset offer).

_Consumes:_ `concurrent-work-doctrine` (the conventions these mechanisms enforce). Confirms the behind-base
detector covers the cohort doc as the most-shared planning artifact.

### `async-merge-lifecycle`

_Exposes:_ the suspend/resume seam at the PR-open boundary; the in-flight completion sweep (forcing function,
full tail `awaiting-review → mergeable → merged-needs-archival → archived`); same-session finalize +
integration-failure surfacing; the post-merge notes-sync leg; the standalone `integration` footer emission;
merge-gate-awareness / unattended-merge completion trigger (option B, additive on `integrate-work-unit`).

_Consumes:_ `concurrent-work-doctrine` (the async-merge conventions); `merge-safety-mechanism`'s behind-base
primitive (reused in the completion sweep); `notes-merge-coherence`'s notes-merge engine (its post-merge
notes-sync leg — build-first edge). Open: eager vs. lazy post-merge teardown (soft dep on `composable-workflows`
for the shared-step hoist of `decompose-work-unit`'s park-exit block) — decide at spec.

### `notes-merge-coherence`

_Exposes:_ single-machine notes-merge engine correctness — idempotent removal-tombstone resolution
(`appendRemovalTombstones` routed through the tombstone-aware path) and a canonical materialized-manifest
(projection) builder shared by `arc user load` and sync-status, plus `ancestor`-freshness recognition. Owns the
projection-builder shared contract above; built general for cross-cohort reuse.

_Consumes:_ nothing internal — orthogonal `lib/user-sync/` correctness, no dependency on the doctrine spine.
Extracted from `async-merge-lifecycle` at create-spec (at-cap lateral extraction). Bridge: retires when
`operational-state-docs` (ADR-022 §4) lands the record/projection model. Consumers: `async-merge-lifecycle` (its
notes-sync leg) and `cross-machine-sync-coherence` (extends the projection builder).

### `single-owner-wu-model`

_Exposes:_ the single-owner-WU model (one DRI) as a rewrite of `strategy-team-coordination` + DEV-RULES.ARC
§ Task interlock + meta `**Owner:**` semantics; removal of `(@name)` and the within-WU concurrent multi-dev
apparatus (Personal-Sub-Branches, Stacked-PRs-per-Developer, shared-meta concurrent-write handling,
"concurrent pairs on different tasks"). Supplies the self/foreign asymmetry the doctrine's all-owner gate keys on.

_Consumes:_ `concurrent-work-doctrine` (the conventions framing the model sits inside). Separable execution; real
weight as the final increment of the stack.

### `worktree-default-start`

_Exposes:_ the `arc start` create-new worktree-spawning wiring (the unwired CLI caller for the shipped
`spawnWorktree` primitive); the worktree-by-default steering flip (worktree-creating as the default under full
protection, mirroring `run-errand` Launch's relocation logic); the `Class`-aware plate-balance session-init
advisory surface; cohort-`{name}.md` discovery at session-init. Owns the plate-balance and cohort-doc-discovery
shared contracts above.

_Consumes:_ `concurrent-work-doctrine` (the plate-balance balance rule its advisory surface implements; the
coordination doctrine the cohort-doc discovery serves). Substrate (shipped): WF's `spawnWorktree` + location
templating, the full-protection scaffold guard, `arc user close`, the `classComposition()` utility, the `Class`
contract. Extracted laterally from `async-merge-lifecycle` at create-spec; parallel to it (start-side vs.
completion-side).

## ADR anchors

- `adr-019-work-unit-lifecycle-reform.md` — the single-branch-per-WU substrate this whole sub-cohort builds on.
- `adr-020-adopt-principle-anchored-scalable-core.md` — the derived-vs-mutated shared-state split that governs the
  ROADMAP-parallelism convention and the cohort-doc concurrency exception.
- `adr-021-introduce-errand-work-class.md` — the Errand taxonomy whose `chore/` branches ride the doctrine.
- `adr-022-managed-operational-state-documents.md` — merge correctness for agent-maintained managed docs lives in
  the notes-merge engine on structured records, not in markdown or a schema; reference the model rather than
  redefining write/merge semantics for the managed inboxes.

---

## Closeout

- **Closed:** 2026-06-24
- **Final member:** `single-owner-wu-model`
- **Member archives:** `19_concurrent-work-doctrine`, `20_merge-safety-mechanism`, `21_notes-merge-coherence`,
  `22_async-merge-lifecycle`, `23_worktree-default-start`, `33_single-owner-wu-model`
- **Outcome:** Shipped principled multi-work-unit collaboration as a coherent whole — the conventions doctrine, the
  merge-safety behind-base primitive, the async-merge lifecycle accommodation, the notes-merge engine correctness,
  the worktree-default start steering, and the single-owner-WU model reconciliation that closes the stack.
- **Follow-up:** [none] — the cross-cohort seams (`roadmap-tooling`, `cross-machine-sync-coherence`,
  `graduation-cleanup`) remain owned by their named cohorts; the parent `agile-parallelism` cohort stays open
  pending its remaining members.

---
