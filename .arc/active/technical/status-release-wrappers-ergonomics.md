# Status: Release Wrappers — Ergonomics

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/release-wrappers-ergonomics

- **Spec:** `prd-release-wrappers-ergonomics.md`
- **Task List:** `tasks-release-wrappers-ergonomics.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Task 6.R.6 — cross-doc sweep across DEV-RULES.ARC, AGENT-BRIEF.ARC,
  process-task-loop, QUICK-REFERENCE, and validate-config.sh (both copies). Mid-sweep
  6.R.6.e validator-script gap (collapsed yaml keys still accepted by `validate-config.sh`)
  discovered and folded in by user approval.
- **Next Task:** Task 6.R.7.a — Identify PRD rework scope (line ~1036)
- **Blockers:** [none]

- **Next Action:** Begin Task 6.R.7.a — grep `prd-release-wrappers-ergonomics.md` for
  `releaseEnabled` / `release.enabled` / `commit_interlock` / `push_interlock` /
  `sync_interlock`; classify each occurrence as rename-only, scope-rephrase, or
  section-rewrite; surface classification to user before edits land.

---
