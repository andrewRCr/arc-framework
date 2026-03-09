---
name: arc-resume
description: Initialize and resume the active working ARC session with required project context. Use when explicitly asked to initialize a session.
disable-model-invocation: false
---

# ARC Resume

1. Initialize the session.

   - Run the workflow in `.arc-internal/system/workflows/arc/session-lifecycle/session-init.md`.
   - Read every document in full unless the workflow explicitly says otherwise. The load
     order matters — general context before active work state.

2. Surface problems, not procedure.

   - The orientation summary should foreground mismatches, blockers, and freshness gaps.
   - If everything loaded cleanly, confirm and state the next action — don't recap the
     documents you read.
