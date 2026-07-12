---
name: pre-merge
description: Final pre-merge gate after review-response processing — reserved for final-state checks before merge
active: false
---

# Extension: pre-merge

> - **Workflow:** [integrate-work-unit.md][integrate-work-unit]
> - **Fires:** After `review-response` processing completes, before the merge action
>
> - **Contract:** Sequential execution with halt-on-fail. Every action is read-only, idempotent, or retry-safe because
>   final-head settlement may repeat. Fire after review coordination and after any lifecycle- or review-authored head
>   update. No commit or push may occur between the settled checkpoint and merge authorization.

## pre-merge.actions

[No extension configured]

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
