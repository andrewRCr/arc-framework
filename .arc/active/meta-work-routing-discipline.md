# Metadata: Work-Routing Discipline

- **State:** Planning
- **Owner:** andrew
- **Branch:** `plan/work-routing-discipline`

- **Origin:** [internal]
- **Design:** `spec-work-routing-discipline.md`

- **Depends On:** [none]
- **Cohort:** [none]

- **Task List:** `tasks-work-routing-discipline.md`
- **Last Completed:** Task list `tasks-work-routing-discipline.md` generated (7 phases; three-pass: structural →
  content → per-phase grounding audit). Spec reconciled to current inbox names (`USER-INBOX` / `ATOMIC-INBOX`)
  and the errand↔PR batching doctrine made explicit (planning sweeps batch, code 1:1, same-file not an
  exception); two ARC-improvement captures filed to `USER-INBOX`.
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Run `activate-work-unit.md` when ready to begin implementation — flips State → Active and
  renames `plan/` → the work branch. Phase 1 (capture surfaces + parser) is the entry point. Lands before
  `in-flight-awareness` so that WU starts from a clean, trustworthy capture pipeline.

---
