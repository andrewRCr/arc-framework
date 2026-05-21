---
name: post-work-unit-archive
description: Additional actions after work unit archival — PM layer interface
active: false
---

# Extension: post-work-unit-archive

> - **Workflow:** [archive-work-unit.md][archive-work-unit]
> - **Fires:** After core archival completes — state flip `Integrating → Shipped`, sweep
>   (`active/` → `completed/<dated>/<wu-name>/`), and ROADMAP regen — and immediately before the
>   archival commit lands.
>
> - **Contract:** Perform additional actions after a work unit is archived. The workflow's built-in
>   ROADMAP regen is the only PM artifact update — this extension is for additional project-specific
>   actions: cleanup scripts, external tracker updates, or team notifications. When `active: false`,
>   the workflow proceeds naturally.

## post-work-unit-archive.actions

[No extension configured]

---

[archive-work-unit]: ../workflows/arc/work-unit-lifecycle/archive-work-unit.md
