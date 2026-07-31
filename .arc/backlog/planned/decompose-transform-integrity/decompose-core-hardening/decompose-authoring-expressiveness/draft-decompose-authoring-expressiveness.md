# Draft: Widen the Decomposition Cut-Map Authoring Contract

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit`, housekeep drain (2026-07-30); captured during the
  `chunked-delivery` cohort cut.
- **Purpose:** Let an authored cut map express prospective destination structure and dependencies on work units
  outside the cut, so a correct decomposition does not require unrecorded post-publication repair.

---

## Problem / Motivation

Two authoring limits make a semantically complete cut impossible to encode:

1. An allocation's `targetLocator` resolves against the destination's current state. A newly scaffolded member has
   no authored sections, so section locators fail and only `preamble` resolves. Conserved content therefore lands
   in an unstructured block even when the author knows its intended destination structure.
2. `internalEdges` requires both endpoints to be new members. A member cannot declare a dependency on an existing
   work unit outside the cut. Editing the generated meta afterward also fails finalization because the prospective
   projection and receipt do not include that change.

Both gaps belong to the cut map's authored language: target placement and dependency topology are known before
execution but cannot be stated.

## Approach

- Define target positions against the prospective destination, either through post-scaffold locators or a stable
  allocation-order/anchor representation.
- Add external dependency edges whose targets resolve as work-unit slugs outside the cut.
- Validate external endpoints against the authoritative roster and carry the resulting edges through prospective
  projection, receipt evidence, ROADMAP rendering, and publication.
- Preserve conservation and topology validation for internal edges; do not overload their proof to imply that an
  external dependency was created by the cut.
- Improve refusal text for authoring intent the current schema cannot express.

## Unknowns and Assumptions

- Should destination structure be an authored skeleton, a locator over the post-allocation projection, or an
  ordering relation among allocations?
- What snapshot proves an external dependency resolved at authoring and still resolves at publication?
- How should a later dependency-contract drift interact with the general revalidation owned by
  `decomposition-doctrine`?

## Scope Estimate

Medium — cut-map schema, projection, topology, receipt, validation, and authoring diagnostics.
