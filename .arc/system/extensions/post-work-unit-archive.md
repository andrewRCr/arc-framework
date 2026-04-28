---
name: post-work-unit-archive
description: Additional actions after work unit archival — PM layer interface
active: false
---

# Extension: post-work-unit-archive

> - **Workflow:** [archive-work-unit.md][archive-work-unit]
> - **Fires:** After Core archival steps complete (task list archived, branch cleaned up)
>
> - **Contract:** Perform additional actions after a work unit is archived. Core PM artifact updates
>   (PROJECT-STATUS, ROADMAP) are handled by the workflow's built-in arc-in-git step — this extension is for
>   additional project-specific actions: cleanup scripts, external tracker updates, or team notifications.
>   When `active: false`, the workflow proceeds naturally.

## post-work-unit-archive.actions

[No extension configured]

---

[archive-work-unit]: ../workflows/arc/work-unit-lifecycle/archive-work-unit.md
