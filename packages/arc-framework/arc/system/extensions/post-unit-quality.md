---
name: post-unit-quality
description: Additional checks at coherent unit boundaries — supplements Tier 2
active: false
---

# Extension: post-unit-quality

> - **Workflow:** [process-task-loop.md][process-task-loop]
> - **Fires:** After Tier 2 checks at coherent unit completion
>
> - **Contract:** Add integration-level checks for coherent unit boundaries (last subtask under a parent, or
>   standalone tasks touching integration-tested code). Supplements ARC's default Tier 2 checks. Must return
>   a clear pass/fail signal.

## post-unit-quality.actions

[No extension configured]

---

[process-task-loop]: ../workflows/arc/process-task-loop.md
