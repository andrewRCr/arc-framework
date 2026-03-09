---
name: arc-resume
description: Initialize and resume the active working ARC session with required project context. Use when explicitly asked to initialize a session.
disable-model-invocation: true
---

# ARC Resume

1. Read required context first.

   - Read `.arc-internal/system/agent/AGENTS.md` before other session workflow steps.

2. Initialize the session.

   - Run the workflow in `.arc-internal/system/workflows/arc/supplemental/session-init.md`.

3. Confirm readiness.

   - Ensure the active constraints, workflow expectations, and session state are loaded
     before proceeding with feature work.
