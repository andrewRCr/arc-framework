---
name: frontline-review
description: Advisory pre-publication review that shapes a change before standard review
related:
  - adversarial-review
  - implementation-audit
  - review-chunking
  - review-triage
active: false
override-active: false
---

# Method: frontline-review

> - **When:** A caller elects to review an exact change before publishing it to a downstream independent evaluator
>
> - **Contract:** Run an advisory pre-publication review from fresh context using `adversarial-review` with the
>   effective `implementation-audit` rubric. Return grounded findings to the author-side response cycle. Frontline
>   review cannot satisfy an standard-review obligation, produce satisfying evidence, or authorize mutation.
>   As agent-side ergonomics, it does not structurally enforce merge safety.

## frontline-review.override

[No override configured]

## frontline-review.default

Review the complete exact target from source and governing project context. Exclude author conclusions, suspected
weak spots, preferred fixes, and self-verification claims from the evaluator's first-pass context.

Apply `implementation-audit` through the fresh-context `adversarial-review` mechanism. Report every actionable
finding with materiality, a stable locus, source-grounded evidence, and the failed rubric dimension. Return a clean
result only after considering the complete target across every effective rubric dimension.

### Chunked carrier mode

When `review-chunking` selects bounded scopes, run them only through one curated-scope-capable local carrier
orchestration. The orchestration retains the canonical target, partition, and coverage state outside evaluator
contexts. It launches a fresh bounded evaluator context for each closure chunk and the seam; each receives only its
current scope, explicit external or pre-existing annotations, and the complete effective rubric.

After complete union and seam coverage, a fresh non-author aggregate context consumes the partition and coverage
facts plus the structured chunk and seam reports. It may inspect targeted source loci as needed, but does not load
every chunk body wholesale. That context emits the one aggregate whole-target frontline result.

The aggregate invocation counts as one frontline pass. Evaluator-call count does not affect pass accounting, and no
partial chunk or seam report completes the pass. Chunking does not admit author conclusions, make the advisory result
satisfying evidence, or change the method's authority boundary.

The pass is advisory regardless of its outcome. Return its report without editing the target, approving
dispositions, closing conversations, or attesting review evidence. The caller owns whether to invoke this method,
which review source carries it, and what downstream standard-review obligation remains.
