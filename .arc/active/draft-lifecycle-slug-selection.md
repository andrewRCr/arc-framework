# Draft: lifecycle-slug-selection

**Purpose:** Make lifecycle verb subject and dependency selection agree with canonical slug lookup under reuse and
clashes.

- **Origin:** [internal] — inbox routing, 2026-10-19; original capture provenance is retained below.
- **Planning posture:** planned; `P1`; `Heavy`. This capture draft carries unresolved design input; no approved design
  is implied.

---

## Concerns

### Make lifecycle's store verbs agree with the slug lookup on a reused or clashed slug

- _Observation:_ From the flip a slug can have several holders: a completed work unit and a new one reusing its slug
  (the storage contract's D2, which the reference backend admits), or two live ones after a clash (D14). The store's
  slug lookup ranks them (`preferredSlugRecords`, `__tests__/helpers/store/lookup.ts`; the ref backend ranks alike), but
  lifecycle's view does not: `readLifecycleView` (`lib/store/lifecycle-view.ts`) builds its slug index with
  `buildLifecycleIndexFromRecords`, where the last entry listed wins, and several verbs pick their subject from its
  `entries` by name, the first listed winning — `agreesWithInventory` and `resumeStoreTransitionFinalization`
  (`lib/work-unit/lifecycle-store-executor.ts`), `readLifecyclePrimary`
  (`lib/work-unit/verbs/activate-deactivate-store.ts`), `lib/work-unit/verbs/abandon-store.ts`,
  `handlers/abandon-store.ts`, `handlers/start-store.ts`, and `commands/start-store.ts`. Over the reference backend,
  which lists in insertion order, `arc activate` of a reused slug pairs the live primary from `readWorkUnit` with the
  completed holder's entry and rejects "The work unit changed during transition preparation". Under a clash the store
  reconcile's word check (`artifactAliasTransitions`, `lib/work-unit/store-reconcile-context.ts`) skips a slug the index
  holds; were the index to drop it, the lookup would refuse `ambiguous-match` and block activation.
  `seam-status-roadmap` folds holders for status alone (`spec-seam-status-roadmap.md` § 2.1) and leaves these verbs as
  they are.

- _Approach:_ Give lifecycle's verbs from the flip one selection of a slug's standing holder, as the lookup ranks, for
  both the subject and the index, with a defined behavior under a clash; and add the register row the mechanism lacks.

- _Captured during:_ `seam-status-roadmap` create-spec, adversarial pass 2 fix-check round 2 (findings on the fold's
  reach), 2026-10-16.

## Sequencing and boundaries

This planned P1 repair is required before `storage-cutover`, independently of the later `work-item-relations` model.
Selection of a canonical subject, index entry, dependency holder, and transition finalization is this work unit’s
concern; typed relation gate semantics remain with that existing owner.

Coordinate shared lifecycle and reconcile files with the current seam writers and the backend’s canonical lookup
contract. Implementation waits until overlapping seam writers have landed; planning establishes the exact provider and
landing edges rather than assuming a new edge from shared domain alone.

---
