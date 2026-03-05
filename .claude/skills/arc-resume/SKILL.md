---
name: arc-resume
description: Initialize and resume the active working session with required project context. Use when starting or resuming work and the agent must reload critical operating instructions and session initialization steps.
disable-model-invocation: true
---

# Resume Current

1. Read required context first.

   - Read `.arc-internal/system/agent/AGENTS.md` before other session workflow steps.

2. Initialize the session.

   - Run the workflow in `.arc-internal/system/workflows/arc/supplemental/session-init.md`.

3. Confirm readiness.

   - Ensure the active constraints, workflow expectations, and session state are loaded
     before proceeding with feature work.
