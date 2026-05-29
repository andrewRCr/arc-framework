---
name: arc-session
description: Enter an ARC session: resume the active work unit, cold-start a new one, or orient when none is active.
disable-model-invocation: false
---

# ARC Session

Run `.arc/system/workflows/arc/session-lifecycle/session-init.md`. It resolves the session probe and
dispatches the entry mode — resume the active work unit, cold-start a new one in a bare worktree, or
orient when none is active — establishing session context.

An optional positional argument supplies an **entry seed** — a spec pointer or description that the workflow's
cold-start arm consumes (confirmed before use). The explicit `--errand` flag instead routes the no-WU **Orient**
arm into errand mode — cold-Errand setup in the primary worktree; it is orthogonal to the positional seed. A
bare invocation enters per the probe.
