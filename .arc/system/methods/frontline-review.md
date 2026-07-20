---
name: frontline-review
description: Advisory pre-publication review that shapes a change before independent analysis
related:
  - adversarial-review
  - implementation-audit
  - review-triage
active: false
override-active: false
---

# Method: frontline-review

> - **When:** A caller elects to review an exact change before publishing it to a downstream independent evaluator
>
> - **Contract:** Run an advisory pre-publication review from fresh context using `adversarial-review` with the
>   effective `implementation-audit` rubric. Return grounded findings to the author-side response cycle. Frontline
>   review cannot satisfy an independent-analysis obligation, produce satisfying evidence, or authorize mutation.
>   As agent-side ergonomics, it does not structurally enforce merge safety.

## frontline-review.override

[No override configured]

## frontline-review.default

Review the complete exact target from source and governing project context. Exclude author conclusions, suspected
weak spots, preferred fixes, and self-verification claims from the evaluator's first-pass context.

Apply `implementation-audit` through the fresh-context `adversarial-review` mechanism. Report every actionable
finding with materiality, a stable locus, source-grounded evidence, and the failed rubric dimension. Return a clean
result only after considering the complete target across every effective rubric dimension.

The pass is advisory regardless of its outcome. Return its report without editing the target, approving
dispositions, closing conversations, or attesting review evidence. The caller owns whether to invoke this method,
which review source carries it, and what downstream independent-analysis obligation remains.
