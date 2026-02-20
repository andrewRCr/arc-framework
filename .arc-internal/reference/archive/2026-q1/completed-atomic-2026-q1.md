# Completed Atomic Tasks — 2026 Q1

- [x] Codify verification phase, success criteria ownership, and `[~]` supersession marker
    - **Outcome:** Standardized the final phase of every task list as a two-task verification
      phase (Tier 3 quality gates + PRD success criteria validation). Established three-state
      model for success criteria: `[x]` met, `[~]` superseded, `[ ]` not met — with immutable
      criterion text and inline deviation/superseded annotations. Updated archive-completed for
      second-pass PRD confirmation during archival. Aligned superseded task marker to `[~]`
      (replacing `~~[ ]~~`) for raw markdown readability. Added to generate-tasks workflow.
    - **Files:** `strategy-task-list-formatting.md`, `2_generate-tasks.md`,
      `archive-completed.md`

    - **Branch:** `technical/structural-readiness-pass`

- [x] Remove Implementation Notes as a task list concept
    - **Outcome:** Removed all guidance for including notes sections in task lists — notes
      belong in the dedicated `notes-*.md` file, not inline. Removed "Notes & Observations"
      from annotated example, updated generate-tasks to redirect to notes file, updated
      maintain-task-notes inventory guidance, adjusted session-init task list extraction
      (both `.arc/` and `.arc-internal/`), deleted Implementation Notes section from current
      task list.
    - **Files:** `strategy-task-list-formatting.md`, `2_generate-tasks.md`,
      `maintain-task-notes.md`, `session-init.md` (x2), `tasks-structural-readiness-pass.md`

    - **Branch:** `technical/structural-readiness-pass`

- [x] Restructure session-init orientation summary for scannability
    - **Outcome:** Replaced env/context + active-work-understanding structure with: ARC-branded
      header line (branch + tree status), grouped active work state, standalone prominent "Next
      action" as primary scanning target. Environment details now implicit on success, only
      surfaced on failure.
    - **Files:** `.arc/system/workflows/arc/supplemental/session-init.md`,
      `.arc-internal/system/workflows/arc/supplemental/session-init.md`

    - **Branch:** `technical/structural-readiness-pass`
