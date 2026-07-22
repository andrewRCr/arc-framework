# Draft: Method Document Conventions

- **Origin:** `USER-INBOX § Work Unit`, routed at the 2026-07-21 housekeep drain after the
  `review-architecture` method-family expansion exposed corpus drift.
- **Purpose:** Establish one authoring contract for ARC method documents: when a method has a signature, where
  relatedness is declared, and how workflow-to-method relationships are indexed without hand-maintained back-edges.

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
