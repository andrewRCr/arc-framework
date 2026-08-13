---
name: pre-merge
description: Final pre-merge gate after review-response processing — reserved for final-state checks before merge
active: false
---

# Extension: pre-merge

> - **Workflows:** [integrate-work-unit.md][integrate-work-unit], [run-errand.md][run-errand]
> - **Fires:** After the lane's final head is ready, before the integration interlock
>
> - **Contract:** Sequential execution with halt-on-fail. Every action is read-only, idempotent, or retry-safe because
>   final-head settlement may repeat. Fire once per ready head, between its rendered evidence and the
>   integration-interlock stop. No commit or push may occur after readiness is established.

## pre-merge.actions

1. **Future final-head actions.** Append additional actions here in authored order. Execute sequentially and halt
   before later actions when an earlier action fails.

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[run-errand]: ../workflows/arc/supplemental/run-errand.md
