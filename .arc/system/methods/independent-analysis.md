---
name: independent-analysis
description: Satisfying standard for non-author review of one complete exact change set
related:
  - adversarial-review
  - implementation-audit
  - review-triage
override-active: false
---

# Method: independent-analysis

> - **When:** A review obligation requires satisfying non-author analysis
>
> - **Contract:** A non-author evaluator reviews the complete exact requested change set from source and governing
>   project context, applies the bound rubric, and returns a result eligible for exact-target attestation only when
>   the standard below is complete. The activity grants no mutation, disposition, or closure authority.

## independent-analysis.override

[No override configured]

## independent-analysis.default

The baseline version is `independent-analysis/v1`. Its semantic identity is owned by the registered typed contract
and derived digest; editorial guidance in this method is not a second identity authority.

- **Coverage:** Review the complete exact requested change set, not a sample or only the latest fix.
- **Evaluator boundary:** Use a non-author evaluator with source and governing project context. Exclude author
  conclusions, suspected weak spots, preferred fixes, and self-verification claims from first-pass context.
- **Rubric:** Apply the effective `implementation-audit` lens and consider all five rubric dimensions across the
  complete target. A declared specialization augments the baseline and cannot omit any baseline dimension.
- **Finding floor:** Every actionable finding states materiality, a stable locus, source-grounded evidence, and why
  the change fails the rubric.
- **Clean rule:** Return clean only after complete coverage and explicit treatment of every effective dimension.
  Unavailable, partial, ambiguous, or failed review is never clean.

A local fresh-context carrier may run this standard through `adversarial-review`; other qualified carriers apply the
same contract. A result becomes satisfying evidence only after an authorized attestor revalidates the exact target,
evaluator separation, rubric identity, and complete result. Findings remain advisory for mutation and return to the
author-side disposition cycle. This method defines evidence eligibility, not merge enforcement; only a configured
required host-side check can prevent merge when the obligation is unsatisfied.
