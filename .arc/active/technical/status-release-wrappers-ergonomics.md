# Status: Release Wrappers — Ergonomics

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/release-wrappers-ergonomics

- **Spec:** `prd-release-wrappers-ergonomics.md`
- **Task List:** `tasks-release-wrappers-ergonomics.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Tasks 6.R.2 + 6.R.3 — resolver collapse + `releaseOptedIn` rename,
  consumer propagation, code-11 setting-key cleanup, and the test reshape (per-dev vs.
  dual-scope split, git-config-only coverage, integration-test git-config injection).
- **Next Task:** Task 6.R.4.b — `arc-config.yml` cleanup, remove four collapsed keys + add
  top-level pointer (line ~945)
- **Blockers:** [none]

- **Next Action:** Begin Phase 6.R Step 4 — remove the four collapsed yaml keys from both
  copies of `arc-config.yml` (`.arc/system/` + `packages/arc-framework/arc/system/`),
  retire or collapse the `# --- Session Interlocks ---` and `# --- Release Wrappers ---`
  blocks, and add the top-of-file pointer to `strategy-configurability-architecture.md`
  § Personal Configuration via Git Config. After this lands, the `commands/config/*` +
  `lib/config/status-reader.ts` yaml-tier surfaces can be tightened in lockstep — see
  6.R.6 cross-doc sweep for the surrounding cleanup.

---
