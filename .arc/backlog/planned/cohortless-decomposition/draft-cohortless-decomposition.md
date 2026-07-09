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
