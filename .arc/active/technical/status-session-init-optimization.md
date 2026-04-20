# Status: Session-Init Optimization

> **About this file:** Per-WU state pointer — committed alongside task list updates
> in the same atomic operation. Lightweight factual state so anyone on this branch
> can see where work stands at a glance.
>
> **Companion:** `user/{identity}/SESSION-NOTES.md` (gitignored) carries personal
> session context. Together they implement P5 (Context Preservation). See
> `session-handoff.md` for the update protocol.

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** Task 1.5 — Reliable-trigger CI audit script (test-first) (line ~367)
- **Last Completed:** Task 1.4 (all subtasks a–f) — per-file restructure + method rename. Created
  `system/methods/` and `system/extensions/` directories in both copies with thin READMEs; migrated
  8 methods and 8 extensions to per-file entries (36 new files). Schema codified in
  `strategy-session-operations.md § Per-file Frontmatter Schema` (4-field contract, `workflow` field
  dropped as editorial noise) and body conventions codified alongside (H1 form, bulleted-blockquote
  preamble with trigger / contract visual separator, structural content sections). Extensions adopted
  `active` / `.actions` terminology during execution (renamed from spec's `has-steps` / `.steps` for
  clarity). Two-copy sync applied throughout; all 16 per-file entries + 2 READMEs byte-identical
  across `.arc/` and `packages/arc-framework/arc/`. Full markdown lint clean; ref-def sweep verified
  every relative path resolves.
- **Blockers:** [none]
- **Next Action:** Begin Task 1.5 — reliable-trigger CI audit script. TypeScript test-first: place
  at `packages/arc-framework/src/scripts/audit-method-triggers.ts` with unit tests under
  `__tests__/unit/scripts/`. Add `lint:arc:triggers` script to root `package.json` only (not
  workspace), add `tsx` dev dep at root. Enumerate methods/extensions from per-file directories
  (not aggregate), walk workflow frontmatter for `arc.methods` / `arc.extensions` declarations,
  build separate coverage maps per kind, fail CI with per-entry diagnostics on any gap.
