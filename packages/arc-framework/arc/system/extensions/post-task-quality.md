---
name: post-task-quality
description: Additional checks after each task — supplements Tier 1
active: false
---

# Extension: post-task-quality

> - **Workflow:** [process-task-loop.md][process-task-loop]
> - **Fires:** After Tier 1 checks pass, before marking task complete
>
> - **Contract:** Add quality checks that run after every task completion. Actions here run in addition to
>   ARC's default Tier 1 checks, not instead of them. Must return a clear pass/fail signal — the agent does
>   not mark the task complete if any check fails.

## post-task-quality.actions

[No extension configured]

---

[process-task-loop]: ../workflows/arc/3_process-task-loop.md
