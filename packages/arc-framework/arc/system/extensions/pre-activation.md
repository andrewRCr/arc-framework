---
name: pre-activation
description: Verification gate before WU activation — plan-quality checks, alignment-verification routines beyond create-PRD time
active: false
---

# Extension: pre-activation

> - **Workflow:** [activate-work-unit.md][activate-work-unit]
> - **Fires:** After step 1's pre-condition gate passes (running on `plan/<name>`, `**State:** Planning`,
>   PRD and `tasks-*` present), before the state-flip and branch rename
>
> - **Contract:** Sequential execution with halt-on-fail — any action surfacing a failure stops the workflow
>   and awaits user direction; fix-and-retry or explicit-invoke bypasses on user signal. Fires once per
>   activation. Use for plan-quality verification, design-doc completeness checks, or alignment-verification
>   routines that extend the create-PRD-time gates into the activation boundary.

## pre-activation.actions

[No extension configured]

---

[activate-work-unit]: ../workflows/arc/work-unit-lifecycle/activate-work-unit.md
