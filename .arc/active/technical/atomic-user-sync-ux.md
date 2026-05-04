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

- [ ] **Task list Goal-as-protected-anchor refinement**
    - Codify the new task-list shape: Goal first at root and required on every parent
      task; peer descriptors as siblings of Goal at root; Goal preserved across
      completion (Outcome subsumes peer descriptors and body, lands at root peer to
      Goal); subtask Goals opt-in via diagnostic test; verification-task exception
      preserved.
    - Restructure `2_generate-tasks.md` into Pass 1 (structural decomposition) /
      Pass 2 (content fill) / Pass 3 (grounding audit via arc-task-audit) with
      explicit stops per pass.
    - Migrate user-sync-ux active task list (Phase 3 — Phase 5) to the new shape;
      add Goals where missing.
    - Files: `strategy-task-list-formatting.md`, `template-tasks.md`,
      `3_process-task-loop.md`, `2_generate-tasks.md` (both copies);
      `tasks-user-sync-ux.md`.

- [x] **Broaden DEV-RULES.ARC § No meta-project references in code**
    - Expanded planning-ID enumeration (added behavior IDs, requirement IDs, spec citations)
      and broadened scope from "production code" to code, tests, and durable documentation.
      Added a positive complement naming the sanctioned homes for the IDs.
    - Edited both copies (package source + `.arc/` instance).
