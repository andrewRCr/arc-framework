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
- **Last Completed:** Task 2.1 — Meta value-format + IA convention (render/parse foundation; reader consolidated)
- **Next Task:** Task 2.2 — Add the `Class` field (`Light` / `Heavy` / `[TBD]`) with ratchet semantics (line ~198)
- **Blockers:** [none]

- **Next Action:** Begin Task 2.2 — the `Class` slot already exists in `META_FIELDS` (added in 2.1, default
  `[TBD]`, core-table); 2.2 adds the value set + ratchet + tests (Light/Heavy round-trip, absent → null), test-first.

---
