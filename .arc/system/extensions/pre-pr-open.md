---
name: pre-pr-open
description: Retry-safe actions immediately before opening a change request
active: false
---

# Extension: pre-pr-open

> - **Workflows:** [integrate-work-unit.md][integrate-work-unit], [run-errand.md][run-errand]
> - **Fires:** After the head is pushed and immediately before creating a change request; skipped when one is open.
>
> - **Input:** `proposedChangeRequest = { repositoryRef, baseRef, headRef, headSha }`. Callers supply these opaque
>   coordinates; host adapters validate and convert them. The extension does not infer branch or work-unit state.
>
> - **Contract:** Execute numbered actions in authored order and halt before later actions when one fails. Actions are
>   retry-safe because creation can fail after they run. The contract is platform-neutral and assumes no relationship
>   between work units and change-request cardinality.

## pre-pr-open.actions

[No extension configured]

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[run-errand]: ../workflows/arc/supplemental/run-errand.md
