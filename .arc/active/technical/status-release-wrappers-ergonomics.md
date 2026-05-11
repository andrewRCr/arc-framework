# Status: Release Wrappers — Ergonomics

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/release-wrappers-ergonomics

- **Spec:** `prd-release-wrappers-ergonomics.md`
- **Task List:** `tasks-release-wrappers-ergonomics.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Task 6.R.10 — Dogfooding install + workflow refinements
  (commit `c019694f`). Laptop install landed for claude-code + codex (both bypass-mode);
  four amendments to `setup-release-wrapper.md` (bypass + custom-hook framing parity,
  codex granular `approval_policy` form coverage, agent-driven invocation path with
  command-shape template, Step 5 cross-reference to per-dev config catalog). Task 6.R.7
  — TS wire-format sweep dropping the four collapsed yaml keys from `ConfigSettings` /
  emitters / tests across 5 src + 12 test files — committed earlier at `c3796ba4`.
- **Next Task:** Task 6.R.8.a — Identify PRD rework scope (line ~1158)
- **Blockers:** [none]

- **Next Action:** Evaluate the release-wrapper triggered-only discipline question
  (per SESSION-NOTES § Additional Context) before resuming task list. Then begin
  Task 6.R.8.a.

---
