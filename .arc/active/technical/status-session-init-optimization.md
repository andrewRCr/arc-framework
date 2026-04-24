# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 4.5.b — Work-unit lifecycle core audit (`activate-work-unit.md` 234,
  `archive-work-unit.md` 275, `clean-work-unit.md` 374 (heavy),
  `deactivate-work-unit.md` 278) (line ~3312)
- **Last Completed:** Task 4.4.d — Templates directory outlier cleanup.
  4.4.d.a reshaped `template-tasks.md` 215 → 169 (~21%): dropped redundant
  § Verification Phase and § Success Criteria Section (skeletons embedded within
  each variant scaffold; rules owned by post-4.4.c `strategy-task-list-formatting.md`);
  trimmed § Atomic Companion File to minimal lead-in + skeleton; cleaned up dangling
  "See template-tasks.md for the skeleton" pointer in strategy doc (redundant with
  inline skeleton directly above). 4.4.d.b reshaped `template-completion-doc.md`
  161 → 126 (~22%): relocated "Required Reading Before Drafting" and "Standard Template
  Verification Checklist" into `integrate-work-unit.md § 3) Create Completion Metadata`
  (mirrors 4.4.b's operational-machinery-to-use-site pattern); `integrate-work-unit.md`
  353 → 380 (+27). Task-spec reduction targets (~40% / ~50%) not hit — landed 21% / 22%.
  Driver: scaffold code blocks are on-disk content of every real atomic-{name}.md /
  completion-{name}.md file, not trim-eligible. Non-scaffold prose in
  template-completion-doc reduced ~45% (~55 → ~30 lines), closer to spec intent.
  Two-copy sync verified across all four file pairs; Tier 2 markdown lint clean
  (223 files).
- **Blockers:** none
- **Next Action:** Begin Task 4.5.b — work-unit lifecycle core operational-context
  audit across four workflows (`activate-work-unit.md`, `archive-work-unit.md`,
  `clean-work-unit.md`, `deactivate-work-unit.md`). Standard posture (same protocol
  as 4.5.a / 4.3.a / 4.3.c): extract rationale/prose to `notes-docs-content-sweep.md`
  staging entries (agent-audience lens, no inline `[TODO-docs-site]` placeholders),
  two-copy sync per file. `clean-work-unit.md` flagged "heavy" (374 lines) — likely
  the largest yield in the cluster. Cluster completion (all four files audited) is
  the natural review increment boundary. **Scope reminder:** `integrate-work-unit.md`
  is NOT in 4.5.b — it's Tier 2 (audited in 4.3.b, expanded by 4.4.d.b's relocations).
