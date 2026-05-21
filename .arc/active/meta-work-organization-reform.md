# Metadata: Work Organization Reform

- **State:** Active
- **Owner:** andrew
- **Branch:** technical/work-organization-reform

- **Origin:** [internal]
- **Spec:** `prd-work-organization-reform.md`

- **Depends On:** [none]
- **Cohort:** [none]

- **Task List:** `tasks-work-organization-reform.md`
- **Last Completed:** Task 6.12.c+d (`720fa797`) — nest `githooks/` + `scripts/` under `system/.internal/`
  (both copies; full inbound sweep — CLI, `.husky/`, init-recipe, manifest keys, docs, 9 tests; hooks
  smoke-tested from the new path). Phase 6.12 audit + 6.12 subtask reshape landed at `5326741a`.
- **Blockers:** [none]

- **Next Task:** Task 6.12.e — Move `skills/` → `system/.internal/skills/` (line ~3960).

- **Next Action:** Execute Task 6.12.e; its description carries the c+d-derived hazards — 5 segmented-`join`
  CLI sites invisible to literal grep, bare-relative link-defs at 3 depths (not a blanket sed), and the
  depth-shift that breaks a moved `.md`'s own outside-pointing `../` links by one level. Then 6.12.f (final
  skills sweep) + 6.12.g (verify) close Phase 6.12.

---
