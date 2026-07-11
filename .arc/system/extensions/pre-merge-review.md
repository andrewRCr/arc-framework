---
name: pre-merge-review
description: Final pre-merge gate after review-response processing — reserved for final-state checks before merge
active: false
---

# Extension: pre-merge-review

> - **Workflow:** [integrate-work-unit.md][integrate-work-unit]
> - **Fires:** After `review-response` processing completes, before the merge action
>
> - **Contract:** Sequential execution with halt-on-fail. Every action is read-only, idempotent, or retry-safe because
>   final-head settlement may repeat. Fire after review coordination and after any lifecycle- or review-authored head
>   update. No commit or push may occur between the settled checkpoint and merge authorization.

## pre-merge-review.actions

1. **Settle the final pull-request head.** Invoke [coordinate-pr-review.md][coordinate-pr-review] with the current
   `openedChangeRequest`. Continue only when the controller reports that exact head settled.

2. **Future final-head actions.** Append additional actions here in authored order. Execute sequentially and halt
   before later actions when an earlier action fails.

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[coordinate-pr-review]: ../workflows/project/coordinate-pr-review.md
