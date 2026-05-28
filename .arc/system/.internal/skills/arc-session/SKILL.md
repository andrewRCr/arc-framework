---
name: arc-session
description: Enter an ARC session: resume the active work unit, cold-start a new one, or orient when none is active.
disable-model-invocation: false
---

# ARC Session

Run `.arc/system/workflows/arc/session-lifecycle/session-init.md`. It resolves the session probe and
dispatches the entry mode — resume the active work unit, cold-start a new one in a bare worktree, or
orient when none is active — establishing session context.

An optional argument supplies an **entry seed** — a spec pointer or description that the workflow's cold-start
arm consumes (confirmed before use). A bare invocation enters per the probe.
