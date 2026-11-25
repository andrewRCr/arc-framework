# Draft: Method Document Conventions

- **Origin:** `USER-INBOX § Work Unit`, routed at the 2026-07-21 housekeep drain after the
  `review-architecture` method-family expansion exposed corpus drift.
- **Purpose:** Establish one authoring contract for ARC method documents: when a method has a signature, where
  relatedness is declared, and how workflow-to-method relationships are indexed without hand-maintained back-edges.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's next planning iteration. Integrate — or_
> _consciously reject — each one._

### `[ ]` **Retire the `related:` frontmatter field**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: method-conventions`), housekeep drain (2026-10-15).

- _Shapes:_ § Candidate Direction — "Choose one authoritative relatedness declaration and derive or remove duplicate
  projections."

- _Drain note:_ extension frontmatter no longer has a schema since `retire-extension-points`; 20 method files still
  carry `related:` (2026-10-15).

- _Observation:_ every method carrying `arc.methods` repeats the same names in `related:`, and
  `strategy-session-operations.md` defines `related` only as coupled names whose override should prompt a look at the
  others; nothing found reads it beyond schema validation. The Owner's position (2026-10-13): it serves no real
  purpose and should go. The duplication also inflates the frontmatter that `verify-integrity.sh`'s 20-line window
  measures: `adversarial-review`'s repeats three of its declared methods there.

- _Approach:_ settle the candidate direction as removal: drop `related` from the method and extension frontmatter
  schema, the corpus, the strategy's field list, and the frontmatter validator, and confirm no reader depends on it.

- _Captured during:_ the `review-nonconvergence` Errand's merge gate, 2026-10-13.

---

## Problem / Motivation

The method corpus stores the same structural ideas inconsistently. Call-shaped methods sometimes expose a
`Signature` and sometimes express it only as prose; relatedness appears in frontmatter, header bullets, the methods
README, and prose with no clear authority; and each method's `Workflow` line manually reverses the authoritative
`arc.methods` declarations already present at workflow call sites.

The review-method family makes the drift visible, but the contract belongs to all methods. Backfilling the current
shape would create more hand-maintained state without deciding which declarations should survive.

## Candidate Direction

- Require a signature for call-shaped mechanisms; omit it for rubrics and conformance rules.
- Choose one authoritative relatedness declaration and derive or remove duplicate projections.
- Treat workflow frontmatter as the authority for method use; derive or delete method-side workflow back-edges.
- Pin the allowed header vocabulary and validate it mechanically where cheap.

Coordinate the instantiated callsite grammar with `composable-workflows`, which owns the procedural substrate, and
check placement against the knowledge- and procedure-evolution strategies. This WU owns the declaration contract,
not compilation of workflows.

## Scope Estimate

Corpus-wide convention design and migration across the 23 shipped methods plus their index. Resolve `Class` during
grooming after choosing generated-versus-deleted projections.

---
