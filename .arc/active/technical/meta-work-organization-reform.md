# Metadata: Work Organization Reform

- **State:** Active
- **Owner:** andrew
- **Branch:** technical/work-organization-reform

- **Origin:** [internal]
- **Spec:** `prd-work-organization-reform.md`

- **Depends On:** [none]
- **Cohort:** [none]

- **Task List:** `tasks-work-organization-reform.md`
- **Last Completed:** 6.2.j-k-m-n closed this session — the unblocked 5.4 paired-cleanup
  batch. validateState enum tightened to the codified four (6.2.j); inferSessionType
  docstring + tests reframed around the State-vs-Next-Action design (6.2.k);
  extractMetadataSection H2-wrapper fallback dropped + 9 test files migrated to
  H1-bounded fixtures (6.2.m); validate-status-spec.ts renamed to validate-meta-spec.ts
  with dual-recognition retired across script, hook wiring (both copies, plus flat-layout
  validation gap closure), and tests (6.2.n). Incidental atomic also landed —
  commit-msg-footer test fixtures flipped from `status-foo.md` to `meta-foo.md` (a 6.2.i
  hangover surfaced when the full suite ran after 6.2.m).
- **Next Task:** Task 6.5 — Clean up leaked Planning-state `status-*.md` files on
  `main`'s `active/` (line ~2977).
- **Blockers:** [none]

- **Next Action:** Run the 6.5 inspection-and-cleanup — from a fresh worktree branched
  off `main`, inspect `active/`; expect empty or inventory-placeholder-only. Any leaked
  `status-*.md` files get a `git rm` in a dedicated cleanup commit. 6.5 is a single
  bullet, no subtasks. After 6.5 closes, the 6.2 paired-cleanup chain unblocks:
  6.2.l (active-file scan compat retirement — drops legacy `status-` prefix + subdir
  layout + `wu-resolution.ts` legacy-prefix arm; the dual-prefix scan logic and
  dual-presence preference handling all retire) gets its 6.5-prerequisite cleared and can
  fire; 6.2.l in turn unblocks 6.2.o (`status-reader` → `meta-reader` module + symbol
  rename), closing parent 6.2 fully. Phase 6.3 (capture pipeline + user/ workspace
  migration including this WU's own SESSION-NOTES relocation per R65) follows from a
  fresh session after 6.2 ships.

---
