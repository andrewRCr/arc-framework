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

- [x] **Task list Goal-as-protected-anchor refinement**
    - Codified Goal-first-at-root-and-required, peer descriptors as Goal siblings, Goal
      preserved across completion (commit `e90d0f13`). Restructured `2_generate-tasks.md`
      into three-pass workflow with explicit interlocks; arc-task-audit dual-purposed for
      Pass 3 (commit `f9c6afa8`). Migrated user-sync-ux Phase 3-5 to new shape (this commit).
    - Affected: `strategy-task-list-formatting.md`, `template-tasks.md`, `2_generate-tasks.md`,
      `3_process-task-loop.md`, arc-task-audit `SKILL.md` (both copies); active task list.

- [x] **Session-init DRY for partial-read structural mapping**
    - Hoisted "one grep for the section delimiter — never per-section greps; skip when a
      stable file convention places the section at a known location" into Step 3 prelude.
      Item 6 (QUICK-REFERENCE) simplified to file-convention read (`limit: ~35`, first
      section) with structural-mapping fallback only when convention breaks; item 9 retitled
      "Structural mapping" and references the prelude rule with the phase-heading delimiter.
    - Surfaced during arc-resume — agent ran a grep on QUICK-REFERENCE before partial-Read
      where the file convention made the grep avoidable.
    - Affected: `session-init.md` (`.arc/` instance + package source template).
