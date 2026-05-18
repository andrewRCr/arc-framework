# Status: Work Organization Reform

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/work-organization-reform

- **Spec:** `prd-work-organization-reform.md`
- **Task List:** `tasks-work-organization-reform.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Tasks 5.6.a–5.6.d — per-WU user workspace lifecycle CLI shipped
  (`arc user open <wu-name>` + `arc user close <wu-name>` at `d65bc69d` / `c705f795`)
  and init-time seeding rewired for the R59 scaffolding shape (`173b6c0c`).
  `runPostInitSetup` / `runUserAdd` now iterate the canonical per-user file set
  (SESSION-NOTES, WORKING-MEMORY, USER-INBOX) cross-PM-mode; `pmMode` retired from
  `PostInitSetupOptions` / `UserAddOptions` / `JoinOptions` with all call sites
  updated. `init-recipe.json` arc-in-git arm now installs the shared
  `backlog/ATOMIC-INBOX.template.md` + `backlog/BACKLOG-INBOX.template.md`.

- **Next Task:** Task 5.6.e — Workflow wiring for `arc user open` / `arc user close` (line ~2525).

- **Blockers:** [none]

- **Next Action:** Start Task 5.6.e — wire inline Bash invocations into three workflows
  (both copies — `.arc/system/workflows/` + `packages/arc-framework/arc/system/workflows/`):
  `arc user open <wu-name>` at `init-work-unit.md` Step 2 (after planning-branch create)
  and `activate-work-unit.md` Step 5 (after branch rename); `arc user close <wu-name>` at
  `integrate-work-unit.md` Step 13 (post-merge). No class-tag or push-extension marker
  (not push fire-points).

---
