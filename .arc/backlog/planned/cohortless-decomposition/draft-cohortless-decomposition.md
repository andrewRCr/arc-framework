# Draft: cohortless-decomposition — support cohort-less multi-WU decomposition (flat siblings + dependency edge)

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit` at the housekeep drain (2026-07-07); captured
  during `roadmap-tooling` grooming, 2026-07-06.
- **Purpose:** Add a first-class cohort-less multi-WU decomposition outcome — N flat siblings joined only by a
  dependency edge, no cohort node — so a split with no shared coordination isn't forced into a vacuous cohort.

---

## Inbound Buffer — Pending Integration

> _Routed-in concern pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`)._

### `[ ]` **Support cohort-less multi-WU decomposition (flat siblings + dependency edge)**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: cohortless-decomposition`), housekeep drain (2026-07-07).
- _Observation:_ The decompose chain assumes a cohort is always minted, with no first-class path for a cohort-less
  multi-WU split — N flat siblings joined only by a dependency edge, no cohort node. `assess-cohort-fit` § Output
  is binary (stays one WU | cohort of WUs); `decompose-work-unit` mints a cohort doc on every arm but at-cap (and
  at-cap enrols members into an existing parent cohort); the `arc decompose` cut-map schema requires `cohort`
  except at-cap. So a two-WU split whose only relationship is a `Depends On` edge — no ownerless shared
  coordination for a cohort doc to carry — is forced into a vacuous cohort node (Purpose floor, nothing to
  coordinate): pure ceremony.
- _Approach:_ Add a first-class cohort-less multi-WU outcome across the three surfaces — an `assess-cohort-fit`
  verdict for it, a `decompose-work-unit` arm (Step-3 cohort-mint skipped) that yields siblings without a cohort
  node, and a cut-map schema that lets `cohort` be omitted for the flat-sibling shape. Makes `decompose` a more
  reusable primitive.
- _Coordination:_ Adjacent rail to `cohort-cut-coherence` — same two surfaces (`assess-cohort-fit` +
  `strategy-work-organization § Decomposition`) but a distinct concern (what a cohort absorbs on exit vs. whether
  to mint a cohort at all). Coordinate, don't fold.
- _Live instance:_ `roadmap-tooling`'s `assess-cohort-fit` verdict was "two flat siblings + one dependency edge,
  not a cohort" (see `draft-roadmap-tooling.md` § Decomposition), which the current primitive cannot express.

### `[ ]` **Make base-run decomposition resolve the authoritative active source**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-19); re-targeted from the retired provisional
  `decomposition-machinery-hardening` slug — folded here per the 2026-07-19 consolidation (decompose-transform
  hardening lands on this WU). Captured during `cli-substrate-adoption` symmetric decomposition, 2026-07-18.
- _Observation:_ `decompose-work-unit` correctly requires a symmetric transform to run from a base checkout, but
  `arc decompose` could not conserve the active planning source from that locus. Materializing the active artifacts
  into a main-based transform exposed both the pre-start backlog stub still on base and the active source, so the
  verb stopped with `conservation-unproven`. The safe refusal worked, but the documented run-context was not
  executable without cutting the transform branch from the origin planning branch instead.
- _Approach:_ make the verb resolve one authoritative origin projection across base and planning refs, or have the
  preparation step construct the correct transform branch itself. Preserve the base-locus teardown invariant while
  preventing a stale base stub and live active artifacts from becoming a duplicate-slug inventory.
- _Scope:_ align the workflow run-context, source-resolution model, preparation receipt, and regression coverage for
  started Planning origins whose pre-start stub remains visible on base.

### `[ ]` **Make decomposition incoming-edge conservation topology-aware**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-19); re-targeted from the retired
  `decomposition-machinery-hardening` slug. Captured during `cli-substrate-adoption` symmetric decomposition,
  2026-07-18.
- _Observation:_ `arc decompose` inventoried incoming `Depends On` edges only from metas visible in the transform
  checkout. The active `session-locus-model` dependent lived on another linked worktree and planning branch, so it
  was absent from the cut map and had to be repointed, committed, and pushed separately. The finalized receipt can
  therefore prove checkout-local conservation while missing a live cross-worktree dependent.
- _Approach:_ inventory incoming edges across authoritative local refs/worktrees and make out-of-checkout
  dispositions explicit. Because the verb should not silently mutate another branch, settle a coordination shape such
  as a required pre-transform repoint receipt, a blocked dependent list, or another verifiable two-branch protocol.
- _Scope:_ extend dependency discovery, cut-map validation, conservation receipts, diagnostics, and linked-worktree
  tests without weakening branch isolation.

### `[ ]` **Give decomposition a lifecycle-complete terminal and successor bridge**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-19); re-targeted from the retired
  `decomposition-machinery-hardening` slug. Captured during the first live `cli-substrate-adoption` cohort
  decomposition postmortem, 2026-07-18.
- _Observation:_ the symmetric workflow intends to preserve the session by running the transform from a base
  checkout, but the first live run could not execute that contract and instead cut the transform from the origin
  planning lineage. After the decompose PR merged, out-of-band base-side teardown retired the origin worktree with
  no single driver owning the originating session's terminal state. The flow therefore had neither an explicit
  surviving-base result nor integration's typed husk result, and it offered no bridge to the uniquely ready cohort
  head; `cli-schema-kernel` had to be launched manually in a later session.
- _Approach:_ make the transform's locus an explicit, verified contract rather than an assumed workflow condition. A
  base-owned transform should terminate cleanly on the surviving base session; any supported origin-worktree arm
  should reuse the stamped-husk terminal machinery instead of deleting the active locus. In both cases, emit one
  lifecycle-complete result covering teardown and user-workspace close, derive the ready zero-dependency member set
  from the cut graph, and offer a spawn-anchored fresh-session launch when there is a unique head. Surface candidates
  without guessing when the cut has multiple ready heads; never auto-start a member.
- _Scope:_ align the decomposition workflow, CLI result/receipt and teardown choreography, session terminal/husk
  handling, successor selection and launch recipe, and end-to-end tests. Keep deterministic locus and successor
  decisions CLI-owned so this composes with the procedure-evolution target rather than adding prose dispatch.
- _Coordination:_ two seams — (1) `wu-lifecycle-state-model` owns the husk/terminal-state vocabulary this consumes
  (surviving-base vs typed husk result); consume its state names, do not mint parallel ones. (2)
  `retirement-record-relocation` owns the retirement-record store location; the receipt/teardown choreography here
  reads that store, so coordinate on the store path, not just the transition semantics.
