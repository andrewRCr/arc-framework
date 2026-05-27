---
name: arc-session
description: Enter an ARC session: resume the active work unit, cold-start a new one, or orient when none is active.
disable-model-invocation: false
---

# ARC Session

The session-entry surface: inspect the worktree and dispatch — resume the active work unit,
cold-start a new one in a bare worktree, or (no active unit) orient and await direction. The
resume path:

1. Initialize the session.

   - Run the workflow in `.arc/system/workflows/arc/session-lifecycle/session-init.md`.
   - Follow the workflow steps in order. Environment verification (Step 1) gates document
     loading — confirm working directory before any other commands.
   - Read every document in full unless the workflow explicitly says otherwise. The load
     order matters — general context before active work state.

2. Surface problems, not procedure.

   - The orientation summary should foreground mismatches, blockers, and freshness gaps.
   - If everything loaded cleanly, confirm and state the next action — don't recap the
     documents you read.
