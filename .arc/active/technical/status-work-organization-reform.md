# Status: Work Organization Reform

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/work-organization-reform

- **Spec:** `prd-work-organization-reform.md`
- **Task List:** `tasks-work-organization-reform.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Task 5.2 — Wire `pre-push-review` markers across push fire-points
  (6 sites × 5 workflows × 2 copies) + strategy-workflow-authoring clarification that the
  sync exception is class-tag-routing scope only. Incidental Tier 2 fix landed alongside:
  `init-recipe.json` + classification.ts + 5 test files restored after the prior
  META-PRD → PROJECT-PRD, template-status → template-meta, and clean-work-unit move
  commits. Commits `03025226`, `3ce8ce6a`, `394d606d`.

- **Next Task:** Task 5.3 — Update CLI init/join code to strip instance-file preamble
  injection (line ~2174).

- **Blockers:** [none]

- **Next Action:** Start Task 5.3.a — grep `packages/arc-framework/src/lib/` for "About
  this file" / Lifecycle / Portability / Writing-guide preamble strings; identify seeding
  functions for SESSION-NOTES, USER-INBOX, BACKLOG-INBOX, `backlog/ATOMIC-INBOX.md`.
  Per R59, files seed as content-only; instance-file migration in this repo is separate
  scope (Task 6.8). Subtasks 5.3.b (strip from seed templates) and 5.3.c (verify CLI tests)
  follow.

---
