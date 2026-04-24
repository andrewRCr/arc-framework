# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 4.5.a — Planning workflows audit (`1_create-prd.md`, `2_generate-tasks.md`
  post-4.4.b relocated-checklist state) (line ~3190)
- **Last Completed:** Task 4.4 — Task-list-formatting restructure (three-move unit). 4.4.b
  relocated the Quick Format Checklist from `strategy-task-list-formatting.md` into
  `2_generate-tasks.md § Step 4` as a pre-save verification gate; dropped the redundant caller
  pointer. 4.4.c rewrote `strategy-task-list-formatting.md` to rules-only (701 → 285 lines,
  ~59% reduction): 7 contract-carrying sections preserved, format-element subsections
  collapsed to 2–4 line rule summaries, templates delegated to `template-tasks.md` via
  cross-reference, heading structure stable (all non-anchor external references still
  resolve). Five staging entries (23-27) extracted pedagogical and design-philosophy content
  (incidental worked example, indentation visual + example, verification rationale paragraphs,
  success-criteria three-state example, atomic-companion Purpose + sample). STRATEGY-INDEX
  entry updated in both copies. Tier 2 markdown lint clean across all eight modified files.
- **Blockers:** none
- **Next Action:** Begin Task 4.5 — Tier 3 audit on remaining session-init-relevant workflows.
  Starts with 4.5.a (planning workflows): operational-context audit on `1_create-prd.md`
  (138 lines) and `2_generate-tasks.md` (post-4.4.b state, now ~183 lines after checklist
  insertion). Standard posture, same protocol as 4.3.a/4.3.c: extract rationale/prose to
  `notes-docs-content-sweep.md` staging entries, agent-audience lens (no inline placeholders),
  two-copy sync per file. 4.5 decomposes into domain clusters — a/planning, b/WU-lifecycle
  core, c/branch+verify+planning, d/supplemental — completion of one cluster is the natural
  review increment boundary.
