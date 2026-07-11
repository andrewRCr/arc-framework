---
name: post-pr-open
description: Idempotent actions after entering an open change request
active: false
---

# Extension: post-pr-open

> - **Workflows:** [integrate-work-unit.md][integrate-work-unit], [run-errand.md][run-errand]
> - **Fires:** After a newly created or previously existing open change request is resolved, before review coordination.
>
> - **Input:** `openedChangeRequest = { repositoryRef, hostRef, headSha }`. Callers supply these opaque coordinates;
>   host adapters validate and convert them. The extension does not infer branch or work-unit state.
>
> - **Contract:** Execute numbered actions in authored order and halt before later actions when one fails. Actions are
>   idempotent across create and re-entry paths and derive current host/controller state from the supplied reference.
>   The contract is platform-neutral and assumes no relationship between work units and change-request cardinality.

## post-pr-open.actions

[No extension configured]

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[run-errand]: ../workflows/arc/supplemental/run-errand.md
