# Draft: cohortless-decomposition — make WU decomposition a first-class parallel-era primitive

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit` at the housekeep drain (2026-07-07); captured
  during `roadmap-tooling` grooming, 2026-07-06. **Intended retitle: `decomposition-machinery`** — decided on
  the decomposition-program grooming branch (2026-07-21) when the 2026-07-19 consolidation (the retired
  `decomposition-machinery-hardening` slug's three transform-hardening captures folded into this stub's buffer)
  widened its real scope past the original cohort-less-split concern; deferred because no sanctioned slug-rename
  transition exists (see the rename-transition buffer entry below). Execute the rename once this WU ships one.
- **Purpose:** Make `decompose-work-unit` + `arc decompose` a first-class primitive that is correct under
  parallel multi-worktree operation. Four concerns, all live-run evidence: a cohort-less multi-WU split shape
  (flat siblings + dependency edge, no vacuous cohort node); authoritative-source resolution for base-run
  transforms; topology-aware incoming-edge conservation across linked worktrees; and a lifecycle-complete
  terminal with a successor-launch bridge. The transform was designed in a pre-parallel ARC; the
  `cli-substrate-adoption` decomposition (2026-07-18) proved each gap in one run.

---

## Problem / Motivation

`decompose-work-unit` + `arc decompose` were designed in a pre-parallel ARC — one worktree, one active WU,
cohort-always outcomes. Under multi-worktree operation every one of those assumptions has now failed live. The
first cohort decomposition (`cli-substrate-adoption`, 2026-07-18) could not execute the documented base-run
contract (stopped `conservation-unproven`), missed a live cross-worktree dependent in its cut map, and ended
with no owned terminal — the successor member was launched by hand a session later. Adjacent, the cohort-always
outcome forces a vacuous cohort node onto flat-sibling splits (`roadmap-tooling`, 2026-06), and no slug-rename
transition exists at any lifecycle tier (this stub's own retitle was refused by the retirement gate,
2026-07-21). With `decomposition-doctrine` set to make decomposition _more_ frequent, each gap's cost
multiplies: the transform must become boring, correct machinery before the doctrine leans on it.

## Proposed direction — five deliverable areas

1. **Cohort-less split shape** — an `assess-cohort-fit` verdict for N flat siblings + dependency edge, a
   `decompose-work-unit` arm that skips cohort-mint, and a cut-map schema that lets `cohort` be omitted.
2. **Authoritative-source resolution** — one origin projection across base and planning refs (or a preparation
   step that constructs the correct transform branch), so the documented base-run contract is executable and a
   stale base stub plus live active artifacts can never become a duplicate-slug inventory.
3. **Topology-aware edge conservation** — incoming-`Depends On` inventory across authoritative local
   refs/worktrees with explicit out-of-checkout dispositions; settle the two-branch coordination shape
   (pre-transform repoint receipt vs. blocked-dependent list) at spec.
4. **Lifecycle-complete terminal + successor bridge** — the transform locus as a verified contract; a
   surviving-base terminal, or reuse of the stamped-husk machinery on any origin-worktree arm; one
   lifecycle-complete result covering teardown and user-workspace close; ready-member derivation from the cut
   graph with a spawn-anchored launch offer on a unique head.
5. **Slug rename transition** — a rename receipt kind (or an `arc rename` verb producing one) the retirement
   gate accepts, plus the reference sweep; first use: execute this WU's own retitle to
   `decomposition-machinery`.

## Coordination

- `wu-lifecycle-state-model` — owns husk/terminal-state and transition vocabulary; areas 4–5 consume its names,
  never mint parallels.
- `retirement-record-relocation` — owns the retirement-record store location; areas 4–5 read that store —
  coordinate on the path, not just transition semantics.
- `decomposition-doctrine` — the demand driver (more cuts, earlier); soft precedence pairing, no hard edge.
- `pr-decomposition` — orthogonal axis (review-surface carving vs. concern splitting); keep the cut-map and
  chunk vocabularies distinct.
- **`assess-cohort-fit` has four pending editors** — this WU (cohort-less verdict), `decomposition-doctrine`
  (discriminator rebalance), `cohort-cut-coherence` (consistency-on-exit rail), and `pr-decomposition`
  (delivery-framing coherency pass). Sequence the method edits at each WU's grooming close so one surface
  doesn't churn four ways.

## Unknowns and Assumptions

- **Rename tier scope** — v1 likely backlog-tier-only (directory, files, references); an active-WU rename adds
  branch and worktree identity and can defer.
- **Cross-worktree coordination shape** (area 3) is a genuine design fork — settle at spec, not by default.
- **Class expectation:** Heavy — CLI transform machinery, workflow arms, schema changes, and linked-worktree
  test surfaces; the design must be authored. Resolve via `classify-work-unit` at spec time.
- **Coverage is incident-shaped — audit the full path at next grooming.** The five areas derive from one live
  run of one arm (standalone WU → top-level cohort, symmetric transform) plus incidental discoveries; the other
  decomposition shapes have never been exercised under parallelism. Before spec, walk the path end-to-end —
  `assess-cohort-fit` verdict → cut-map authoring → `arc decompose` across all three parent-position arms, the
  active-state extraction path, and errand-character relocations → terminal / successor handling — under
  linked-worktree conditions, auditing each step for pre-parallel assumptions and friction. Promote anything
  found to a deliverable area, so the set is provably exhaustive rather than capture-shaped.

## Scope Estimate

**Medium–Large.** Five areas over one coherent surface (the decompose transform and its receipts), spanning
schema, verbs, workflow arms, and linked-worktree tests, package-synced. The areas are separable in delivery
order: 5 is smallest and self-proving, 2–4 share the transform core, 1 is schema + workflow. Worth its own
cohort-fit read at spec time — if the areas prove orthogonal enough, this WU decomposes with its own improved
machinery.

## Inbound Buffer — Pending Integration

> _Routed-in concern pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`)._

### `[x]` **Support cohort-less multi-WU decomposition (flat siblings + dependency edge)**

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
- _Disposition (grooming 2026-07-21):_ **Integrated** — § Proposed direction, area 1.

### `[x]` **Make base-run decomposition resolve the authoritative active source**

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
- _Disposition (grooming 2026-07-21):_ **Integrated** — § Proposed direction, area 2.

### `[x]` **Make decomposition incoming-edge conservation topology-aware**

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
- _Disposition (grooming 2026-07-21):_ **Integrated** — § Proposed direction, area 3.

### `[x]` **Give lifecycle slugs a sanctioned rename transition**

- _Routed directly at capture_ — decomposition-program grooming branch session (2026-07-21); live evidence from
  this stub's own attempted retitle.
- _Observation:_ renaming a backlog stub (`git mv` of its directory and `meta-*`/`draft-*` files) is refused by
  the pre-commit retirement gate: a lifecycle meta slug that disappears from the staged tree must be covered by
  a finalized `decompose`/`abandon` retirement receipt, and no rename verb or receipt kind exists. The only
  receipt-producing verbs are semantically wrong (`abandon` destroys; `decompose` splits), so a pure retitle —
  scope unchanged, artifacts unchanged — has no sanctioned shape at any lifecycle tier.
- _Approach:_ add a rename transition to the retirement-record model (a `rename` receipt kind binding old and
  new slugs, or a dedicated `arc rename` verb producing one) and teach the commit gate to accept it; sweep the
  reference surface (ROADMAP regen, cross-stub mentions, `Depends On` edges) in the same transform. Coordinate
  with `wu-lifecycle-state-model` (transition vocabulary) and `retirement-record-relocation` (record store
  location), the same two seams the terminal-bridge entry below already names.
- _Captured during:_ the deferred `cohortless-decomposition` → `decomposition-machinery` retitle (2026-07-21).
- _Disposition (grooming 2026-07-21):_ **Integrated** — § Proposed direction, area 5.

### `[x]` **Give decomposition a lifecycle-complete terminal and successor bridge**

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
- _Disposition (grooming 2026-07-21):_ **Integrated** — § Proposed direction, area 4.
