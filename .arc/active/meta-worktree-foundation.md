# Metadata: Worktree Foundation

- **State:** Active
- **Owner:** andrew
- **Branch:** feat/worktree-foundation

- **Origin:** [internal]
- **Design:** `spec-worktree-foundation.md`

- **Depends On:** work-organization-reform
- **Cohort:** agile-parallelism

- **Task List:** tasks-worktree-foundation.md
- **Last Completed:** Task 5.1 — `init-work-unit` worktree-creating mode: `## Execution Modes` added to both
  copies (in-place vs. worktree-creating; caller-driven; neither stamped default); delegation prose only.
- **Next Task:** Task 5.2 — Spawn primitive (shared CLI-level scaffolding); build order b → c → a, begin with
  5.2.b meta scaffold (line ~691)
- **Blockers:** [none]

- **Next Action:** Begin Task 5.2, build order b → c → a (5.2.b meta scaffold first). Plan resolved via audit +
  forward-compat pass: pure code-render from a declarative `META_FIELDS` in `lib/active/meta-reader.ts` (no
  template read, no bundled meta file; meta-reader-only scope — don't touch other consumers); spawn branch bases
  off `branch.base` (config, default `main`); rollback on post-`worktree add` failure; breadcrumb dropped;
  "never under auto-cascade" is skill-layer (5.4), not the lib unit. Full ratification: `notes-worktree-foundation.md`
  § Phases 5 & 6.

---
