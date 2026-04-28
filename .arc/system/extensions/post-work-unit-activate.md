---
name: post-work-unit-activate
description: Additional actions after work unit activation — PM layer interface
active: false
---

# Extension: post-work-unit-activate

> - **Workflow:** [activate-work-unit.md][activate-work-unit]
> - **Fires:** After Core activation steps complete (branch created, task list moved to active, status file
>   written)
>
> - **Contract:** Perform additional actions after a work unit is activated. Core PM artifact updates
>   (PROJECT-STATUS, ROADMAP) are handled by the workflow's built-in arc-in-git step — this extension is for
>   additional project-specific actions: external tool notifications, custom ceremony actions, or environment
>   setup. When `active: false`, the workflow proceeds naturally.

## post-work-unit-activate.actions

[No extension configured]

---

[activate-work-unit]: ../workflows/arc/work-unit-lifecycle/activate-work-unit.md
