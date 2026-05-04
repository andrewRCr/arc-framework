# Atomic Tasks — User Sync UX Polish

**Purpose:** Tracking of indivisible one-off tasks you elect to do in parallel to the planned
work — discovered during execution, not required for the work unit's success criteria. No
phases or numbering hierarchy; items are flat parent-level entries under a single `## Tasks`
wrapper.

**Ordering:** Incomplete tasks (`[ ]`) stay at the top. Completed tasks (`[x]`) sink below them
in completion order (oldest completed first). See process-task-loop § Atomic Task Completion for
the full protocol.

> Multi-step work required for the WU belongs in the task list as a new phase.
> For multi-step work outside the WU's concern, see `manage-incidental-work.md`.

---

## Tasks

- [x] **Broaden DEV-RULES.ARC § No meta-project references in code**
    - Expanded planning-ID enumeration (added behavior IDs, requirement IDs, spec citations)
      and broadened scope from "production code" to code, tests, and durable documentation.
      Added a positive complement naming the sanctioned homes for the IDs.
    - Edited both copies (package source + `.arc/` instance).
