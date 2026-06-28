---
name: arc-recover
description: Restore ARC operating context after harness compaction from the latest compaction seed.
disable-model-invocation: false
---

# ARC Recover

Run `.arc/system/workflows/arc/session-lifecycle/session-recover.md`.

Use this as the manual fallback when a harness does not inject recovery automatically, or when
the developer notices that compaction erased ARC operating context. It rehydrates the recovery
load set from the latest machine-local seed and live recovery probe state.

Do not use this for a normal session start, after a `clear` event, or to start new work. Those
paths run `arc-session`. Recovery does not sync, discover next work, relocate, commit, push, or
run gated release operations; it resumes directly unless the workflow surfaces a seed, audit,
dirty-state, or task-pointer mismatch.
