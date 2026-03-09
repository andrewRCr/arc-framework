---
name: arc-handoff
description: Update and finalize current ARC session documentation for cross-session continuity. Use when explicitly asked to produce a handoff.
disable-model-invocation: false
---

# ARC Handoff

1. Verify git state before writing anything.

   - Run `git status` and `git log` first. The handoff documents actual state, not
     remembered state — never write session files before checking.

2. Follow the handoff workflow.

   - Apply `.arc-internal/system/workflows/arc/supplemental/session-handoff.md` to
     `.arc-internal/active/WORK-STATUS.md` and `.arc-internal/active/SESSION-NOTES.md`.

3. Don't leave WORK-STATUS.md dirty.

   - If WORK-STATUS.md changed and no task commit is pending to carry it, commit it
     standalone as part of the handoff. The handoff invocation is the approval.
