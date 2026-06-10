---
name: post-task-completion
description: Additional actions after task marked complete — external trackers, team notifications
active: false
---

# Extension: post-task-completion

> - **Workflow:** [process-task-loop.md][process-task-loop]
> - **Fires:** After task marked `[x]` and description updated, before verification and reporting
>
> - **Contract:** Perform additional actions when a task is completed. ARC's core behavior (marking `[x]` in
>   the task list file and updating the task description) is non-negotiable — this extension adds to it, not
>   replaces it. Use for external tracker updates (Jira, Linear), team notifications, or custom ceremony steps.

## post-task-completion.actions

[No extension configured]

---

[process-task-loop]: ../workflows/arc/process-task-loop.md
