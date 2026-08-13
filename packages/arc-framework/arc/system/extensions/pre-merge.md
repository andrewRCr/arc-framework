---
name: pre-merge
description: Final pre-merge gate after review-response processing — reserved for final-state checks before merge
active: false
---

# Extension: pre-merge

> - **Workflow:** [integrate-work-unit.md][integrate-work-unit]
> - **Fires:** After an integration checkpoint returns `ready`, before the integration interlock
>
> - **Contract:** Sequential execution with halt-on-fail. Every action is read-only, idempotent, or retry-safe because
>   final-head settlement may repeat. Fire once per ready checkpoint, between its rendered evidence and the
>   integration-interlock stop. No commit or push may occur after the checkpoint becomes ready.

## pre-merge.actions

[No extension configured]

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
