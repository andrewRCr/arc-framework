---
name: review-chunking
description: Contract-cohesive bounded scopes for reviewing one exact change set
related:
  - frontline-review
  - standard-review
override-active: false
---

# Method: review-chunking

> - **When:** A caller explicitly selects chunked review, or the derived exact-target changeset-size attention
>   signal recommends considering it
>
> - **Contract:** Partition one exact change set into bounded review scopes without changing its work-unit, branch,
>   pull-request, or merge boundary. Preserve complete local and cross-chunk review through dependency closure,
>   union coverage, and a dedicated seam scope.

## review-chunking.override

[No override configured]

## review-chunking.default

A **chunk** is a bounded, contract-cohesive slice of one exact change set reviewed in one pass. It is a review
boundary only: it does not create another work unit, review increment, task-plan phase, branch, pull request, or
merge unit. A downstream delivery model may define a `deliverable` as a chunk with an independent merge boundary
and a `stack` as a dependency ordering over deliverables; this method neither requires nor implements that topology.

### Boundary contract

A chunk is closed from every in-chunk consumer to each declaration it depends on when that declaration is part of
the change set. Keep the declaration in the same chunk, or annotate it explicitly as external or pre-existing.
Standard-library, third-party, and unchanged repository declarations are external by definition. A boundary that
places a changed consumer inside while leaving its changed declaration outside is malformed.

Keep behavior with the tests that exercise it. A code scope without its changed tests cannot support reliable
verification findings. Apply the same closure principle to prose: keep a changed term, method, heading, or artifact
definition with the changed material that consumes it, or identify the referent as external or pre-existing.

Derive boundaries through **seed → judgment → guard**:

- **Seed:** Start from logical commit structure and the module or directory tree.
- **Judgment:** Merge heavily cross-referencing scopes and split unrelated contracts. Cohesion, not a line or file
  budget, determines validity.
- **Guard:** Check changed consumer-to-declaration edges with type checking and definition/reference navigation for
  code, or explicit reference inspection for prose. Re-run against the current exact target if it moves.

The configured exact-target changeset-size advisory thresholds derive an attention signal only. They can recommend
considering chunks, but never draw boundaries, cap chunk size, or make a numeric budget a validity rule. Explicit
callers may apply this method even when automatic consideration is disabled.

Closure establishes validity; it does not by itself establish that a chunk is bounded enough for one review pass.
After closure and test cohesion hold, inspect the candidate's residual attention burden using its available size,
hunk density, contract breadth, and evaluator capability. A candidate that independently trips an enabled
target-level tripwire should be reconsidered for a contract-respecting split by default; a candidate below the
tripwires may still need one. These facts are pressure signals, not caps.

When a cohesive candidate remains attention-heavy, recursively split it along real subcontracts, preserve complete
union coverage, and assign the new cross-child surface to a local seam. If no honest split preserves closure and
test cohesion, record the candidate as an irreducible large closure and make that limitation explicit to the
review carrier; do not silently treat size alone as proof that the pass is bounded.

### Completeness and the seam

Require `change-set − union(chunks) = empty`. Close or surface every uncovered file or hunk; an unmeasured or
uncovered region is not implicitly small or reviewed.

Add a dedicated seam scope whenever boundaries create cross-chunk surface. Review changed contracts at their use
sites and inspect boundary-spanning duplication, abstraction choices, and naming consistency. The seam complements
the local chunks; it does not re-read every chunk body as one diluted whole-target pass.

Recursive chunking forms a hierarchy: local seams reconcile sibling chunks, and a top-level seam reconciles the
domain roots. Higher seams consume the cross-boundary contracts and bounded child summaries they need, not every
descendant body or raw diff wholesale.

`frontline-review` and `standard-review` may consume this method only through a carrier capable of curated scopes
and complete aggregation. Partial chunk reports have no standalone review authority. The role-specific methods own
carrier eligibility, evaluator isolation, pass accounting, and their existing authority boundaries.
