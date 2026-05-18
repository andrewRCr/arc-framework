# Status: Work Organization Reform

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/work-organization-reform

- **Spec:** `prd-work-organization-reform.md`
- **Task List:** `tasks-work-organization-reform.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Task 5.5 — instance-file scaffolding shape complete. R59 pointers
  across 5 templates + B1 design call: USER-INBOX strategy orientation moved from
  `strategy-planning-module.md` (arc-in-git-only) to `strategy-session-operations.md`
  (cross-mode per R65b). Commits `45bad377` (strategy move) / `cb582bcc` (SESSION-NOTES
  pointer) / `d5176bd7` (WORKING-MEMORY + USER-INBOX templates) / `78905584` (shared
  backlog templates + parent 5.5 close). Plan-doc capture `9265c913` filed the
  commit-interlock inclusive-semantic ambiguity surfaced mid-cascade into
  `plan-interlock-release-refinement.md`.

- **Next Task:** Task 5.6.a — Implement `arc user open <wu-name>` helper (line ~2451).

- **Blockers:** [none]

- **Next Action:** Start Task 5.6.a — implement `arc user open <wu-name>` at
  `packages/arc-framework/src/commands/user/open.ts`. Test-first per the task's 7-behavior
  list (path computation; idempotent subdir creation; SESSION-NOTES seeding from
  `templates/user/SESSION-NOTES.md`; defensive-prompt on stale-subdir-for-different-WU
  with `inspect` and `y` arms; identity-error handling). Wire into `arc user` namespace
  alongside existing `add` / `pull`.

---
