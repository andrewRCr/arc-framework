# Draft: session-locus-model — durable execution loci and recoverable session frames

- **Origin:** FP wave-2 dogfooding exposed checkout-identity failures while running split-out Errands beside a
  live WU. The full finding is recorded in `notes-finalize-parallelism.md` § Dogfood finding (2026-07-14):
  execution-locus doctrine is sequential-era; session state is single-frame.
- **Purpose:** Make a checkout's role durable and record the bounded session/locus frame needed to leave, recover,
  and return without repurposing a WU worktree or relying on harness-summary state.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Execution-locus doctrine + machine-local session/locus record**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-14); captured during
  `finalize-parallelism` wave-2 locus review.
- _Finding:_ Every hard failure in the wave-2 split-out cycle was a checkout-identity failure: a warm Errand
  displaced FP's WU worktree, close assumed the primary-held base was switchable, base updates reached into the
  primary manually, and compaction recovery rehydrated only the Errand frame. The WU/Errand model itself resolved
  the work correctly; the physical execution-locus rules did not.
- _Direction — durable loci:_ primary checkout = launchpad; a WU worktree belongs to that WU from spawn through
  teardown; new work never repurposes an existing workspace. Warm Errands use ephemeral Errand worktrees once
  the wave-3 evidence pass establishes the final contention and drain shape.
- _Direction — bounded frame record:_ add a deterministic machine-local record under
  `user/{identity}/.internal`, carrying locus kind, governing workflow, required loadset, and the optional parent
  WU frame. Frame depth is two by construction—Errands never nest and no warm WU-entry path exists. A read verb
  exposes the record; Errand close pops it; recovery consumes it instead of reconstructing intent from branch
  presence and a harness summary.
- _Sequencing:_ groom beside wave 2, use wave 3 on the current model as evidence collection, then execute inside
  the FP GA gate before the default launch flips from `--here` to spawned worktrees.
- _Coordination:_ `wu-lifecycle-state-model` owns state vocabulary; this WU initially stores de-facto states as
  opaque values. `worktree-teardown-decoupling` emits the shipped-husk transition. Check the design against
  `strategy-knowledge-evolution.md` for loadset placement and `strategy-storage-evolution.md` for the deliberately
  machine-local, non-backing-store record.

### `[ ]` **Consume the interim warm-Errand record-and-restore behavior without preserving displacement**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-14); captured during the
  `start-class-flag` Errand and updated after its close failure.
- _Concern:_ warm `arc errand open` currently occupies the invoking worktree in place, and close attempts to
  switch to base rather than restore what open displaced. The pre-wave-3 topology Errand supplies an interim
  record-and-restore fix so close works in linked worktrees.
- _Disposition at grooming:_ preserve the frame-pop requirement, but do not make displacement confirmation part
  of the durable design. Ephemeral Errand worktrees remove the displacement instead of merely warning about it.

### `[ ]` **Mint ownership markers for materialized and spawned Errand worktrees**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-14); captured during
  `worktree-teardown-decoupling` create-spec review.
- _Concern:_ session-init materializes remote Errands with raw `git worktree add`, so no ARC ownership marker is
  written. Such worktrees are invisible to cleanup surfaces, and a self-teardown can leave a markerless husk.
- _Approach:_ make creation-time provenance part of the Errand-worktree spawn/materialize primitive. If the new
  locus model does not subsume the raw materialize arm, provide an Errand-materialize verb or an explicit marker
  write at that boundary.

## Boundaries carried from FP

- The pre-wave-3 topology-aware close fix is an interim split-out Errand, not this WU's execution.
- The base-sync verb and stub mint-to-launch bundle are determinate mechanization Errands around the model.
- FP retains verification: wave 3 re-observes the current Errand surface, and the GA bar is running an Errand
  beside two live WUs without narrating git topology.

---
