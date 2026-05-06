# Status: User Sync UX Polish

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/user-sync-ux

- **Spec:** `prd-user-sync-ux.md`
- **Task List:** `tasks-user-sync-ux.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Task 4.2 — Shared-ref sync-state inference (Tasks 4.2.a–e complete)
- **Next Task:** Task 4.3 — Session-init load cascade (line ~934)
- **Blockers:** [none]

- **Next Action:** Begin Task 4.3 — session-init load cascade. Adds an additive `loadNeeded: boolean` signal to
  the user channel of `arc status --session-init --json` (ref-aligned-but-disk-behind detection driven by
  `inferUserSyncCause` + the 2.R.4.a notes-discovery walk), a new `session.init_load.notes: prompt | always |
  manual` config knob mirroring `session.init_pull.notes`, and a new notes-channel branch in `session-init.md`
  Step 2 that prompts/loads/surfaces per the knob. Dirty-tree precheck refuses auto-load even under `always`.
  Audit-enumerated affected files span the CLI orchestrator, config types/validators/templates, and the workflow
  doc — likely warrants subtask decomposition during implementation.

---
