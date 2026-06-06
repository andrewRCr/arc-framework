# Metadata: Class Model Foundation

- **State:** Active
- **Owner:** andrew
- **Branch:** feat/class-model-foundation

- **Origin:** [internal]
- **Design:** `spec-class-model-foundation.md`

- **Depends On:** worktree-foundation
- **Cohort:** principle-anchored-core/agile-wu-lifecycle
- **Class:** heavy
- **Priority:** P1

- **Task List:** tasks-class-model-foundation.md
- **Last Completed:** Task 5.R.4 — deep model surfaces (`strategy-work-organization` / `classify-work-unit` /
  `graduate-work-unit` / ADR-023) carry the three-value `Novel` tier
- **Next Task:** Task 5.R.5 — Schema, render, parse, status: admit `Novel` through the code (line ~674)
- **Blockers:** [none] — the within-`heavy` calibration is resolved (the `Novel` tier; Phase 5.R executes it)

- **Next Action:** Begin Task 5.R.5 — the `Novel` code surfaces: `commands/active/types.ts` (`WorkClass` +
  `validateClass`, whose `default` silently sentinels `Novel`) and `lib/status/class-composition.ts` (the balance
  tally), then `template-meta`, status render, tests. Must land before the 5.R.6 / 5.R.8 re-stamps.

---
