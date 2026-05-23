---
name: post-work-unit-activate
description: Additional actions after work unit activation — PM layer interface
active: false
---

# Extension: post-work-unit-activate

> - **Workflow:** [activate-work-unit.md][activate-work-unit]
> - **Fires:** After core activation completes — state flip `Planning → Active`, branch rename
>   `plan/<name>` → `<type>/<name>`, absorption write (when applicable), and ROADMAP regen.
>
> - **Contract:** Perform additional actions after a work unit is activated. The workflow's built-in
>   absorption write + ROADMAP regen are the only PM artifact updates — this extension is for
>   additional project-specific actions: external tool notifications, custom ceremony actions, or
>   environment setup. When `active: false`, the workflow proceeds naturally.

## post-work-unit-activate.actions

[No extension configured]

---

[activate-work-unit]: ../workflows/arc/work-unit-lifecycle/activate-work-unit.md
