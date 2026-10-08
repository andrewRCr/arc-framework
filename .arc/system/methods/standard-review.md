---
name: standard-review
description: Satisfying standard for non-author review of one complete exact change set
related:
  - adversarial-review
  - implementation-audit
  - review-chunking
  - review-triage
override-active: false
---

# Method: standard-review

> - **When:** A review obligation requires satisfying non-author analysis
>
> - **Contract:** A non-author evaluator reviews the complete exact requested change set from source and governing
>   project context, applies the bound rubric, and returns a result eligible for exact-target attestation only when
>   the standard below is complete. The activity grants no mutation, disposition, or closure authority.

## standard-review.override

[No override configured]

## standard-review.default

The baseline version is `standard-review/v1`. Its semantic identity is owned by the registered typed contract
and derived digest; editorial guidance in this method is not a second identity authority.

- **Coverage:** Review the complete exact requested change set, not a sample or only the latest fix. For an
  incremental correction pass, that change set is the range from its predecessor head to its current head, together
  with the material findings its correction scope carries; the earlier range is covered by the recorded coverage chain.
- **Evaluator boundary:** Use a non-author evaluator with source and governing project context. Exclude author
  conclusions, suspected weak spots, preferred fixes, and self-verification claims from first-pass context.
- **Rubric:** Apply the effective `implementation-audit` lens and consider all five rubric dimensions across the
  complete target. A declared specialization augments the baseline and cannot omit any baseline dimension.
- **Finding floor:** Every actionable finding states materiality, a stable locus, source-grounded evidence, and why
  the change fails the rubric.
- **Clean rule:** Return clean only after complete coverage and explicit treatment of every effective dimension.
  Unavailable, partial, ambiguous, or failed review is never clean.

### Chunked local-carrier mode

When `review-chunking` selects bounded scopes, run them only through one curated-scope-capable local carrier
orchestration. The orchestration retains target identity, partition, and coverage state outside evaluator contexts.
It launches a fresh bounded evaluator context for every closure chunk and the seam; each receives only its current
scope, explicit external or pre-existing annotations, and the complete effective rubric.

After complete union and seam coverage, a fresh non-author aggregate context consumes the partition and coverage
facts plus the structured chunk and seam reports. It may inspect targeted source loci as needed without loading every
chunk body wholesale, then emits one aggregate whole-target standard-review result.

Hosted and whole-target-only local carriers are ineligible for chunked mode. Evaluator separation, exact-target
identity, and the ordinary completion authority boundary remain unchanged. The aggregate invocation counts as one
standard-review pass; evaluator-call count does not affect pass accounting, and no partial report or evaluator call
can settle the obligation.

### Carrier delivery boundary

A carrier adapter supplies an optional typed project-rubric augmentation to the generic projector, writes the
resulting rubric content into the reviewer's native instruction or configuration surface, then resolves that
surface for the exact target. It must validate the effective carrier content against the projection and record its
`guidanceDigest` alongside the baseline `rubricVersion` and `rubricDigest`. Missing, stale, conflicting, or
unverifiable content leaves the carrier non-satisfying.

The projection is not rubric authority and contains no coordination procedure, author findings, dispositions,
approvals, receipts, or controller state. The typed baseline remains rubric authority; the carrier projection proves
only what guidance that evaluator received. Result normalization and attestation remain separate adapter concerns.

A local fresh-context carrier may run this standard through `adversarial-review`; other qualified carriers apply the
same contract. A result becomes satisfying evidence only after an authorized attestor revalidates the exact target,
evaluator separation, rubric identity, and complete result. Findings remain advisory for mutation and return to the
author-side disposition cycle. This method defines evidence eligibility, not merge enforcement; agent-layer results
never by themselves prevent a host-UI merge when the obligation is unsatisfied.
