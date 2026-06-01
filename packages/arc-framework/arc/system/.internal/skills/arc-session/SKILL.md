---
name: arc-session
description: Initialize and orient an ARC session, probing repo state to resume or start a work unit, or use --errand [<slug|description>] for isolated atomic work.
disable-model-invocation: false
---

# ARC Session

Run `.arc/system/workflows/arc/session-lifecycle/session-init.md`. It resolves the session probe and
dispatches the entry mode — resume or start a work unit, orient when none is active, or enter errand
mode — establishing session context.

An optional positional argument supplies an **entry seed** — a spec pointer or description that the workflow's
new-work arm consumes (confirmed before use). The explicit `--errand [<slug|description>]` flag instead routes
session entry into errand mode for isolated atomic work; it is orthogonal to the positional seed. A bare
invocation enters per the probe.
