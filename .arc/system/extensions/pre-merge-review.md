---
name: pre-merge-review
description: Final pre-merge gate after review-response processing — reserved for final-state checks before merge
active: false
---

# Extension: pre-merge-review

> - **Workflow:** [integrate-work-unit.md][integrate-work-unit]
> - **Fires:** After `review-response` processing completes, before the merge action
>
> - **Contract:** Sequential execution with halt-on-fail. The integrate-work-unit workflow's review-and-merge
>   sequence runs `pre-pr-review` (before PR creation, after the [diff-review method][diff-review]) →
>   `review-response` processing (handling AI / human review findings) → `pre-merge-review` (this extension,
>   before merge). This extension fires last in that sequence — it has visibility into review-response
>   outcomes that the earlier `pre-pr-review` couldn't anticipate. Reserved-pending-final-state-check use
>   cases: verifying review-response fixes haven't introduced regressions, post-fix quality-gate re-runs,
>   final approval ceremonies before the merge action lands.

## pre-merge-review.actions

[No extension configured]

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[diff-review]: ../methods/diff-review.md
