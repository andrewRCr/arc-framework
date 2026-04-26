# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 5.7.g — `add-agent.md` verification (no-op confirmed,
  to be marked `[~]`); then 5.7.h → 5.7.i.
- **Last Completed:** Task 5.7.e — `system/briefs/README.md` wholesale
  rewrite in both trees. Retired dual-hub + tool-files architecture
  framing ("Why Two Hub Files", "What Belongs in Tool-Specific Files",
  "Adding Files for Other Tools", "Tool-Specific Templates", "When to
  Update Tool-Specific Files"). New README scoped to session-init
  briefings (style matches `methods/README.md` and `extensions/README.md`):
  How briefs work + Loading model paragraphs, per-file Files table
  (ARC + CONTRIBUTOR Framework, PROJECT Configurable), customize-PROJECT
  adoption guidance, framework-managed note for ARC + CONTRIBUTOR, and
  "Agent-Specific Guidance Lives Outside ARC" section pointing at
  harness-level files (`CLAUDE.md`, `AGENTS.md`, `.gemini/GEMINI.md`)
  as the pre-session-init system-prompt surface. Trimmed 154 → 41 lines
  (~73% reduction). Mid-task correction: initial draft framed contributor
  sessions as reading CONTRIBUTOR brief *instead of* PROJECT; per
  session-init.md "Contributor Session Path" (lines 201–209), items 1–6
  are universal (ARC + PROJECT both load) and CONTRIBUTOR loads
  *additionally*. Corrected before commit. Two-copy sha256 match
  (`98035b45…`); manifest `pristine_hash` recomputed (`487b9a12…` →
  `98035b45…`). Tier 1 markdown lint clean (3 files); link check
  confirms session-init.md target resolves.
- **Blockers:** none
- **Next Action:** Begin Task 5.7.g — `add-agent.md` verification.
  Per audit findings, the file-scaffolding step was already retired in
  commit `27174b8` (Task 4.5.d, 2026-04-24); path/filename updates were
  covered under 5.7.d's cross-reference sweep. 5.7.g reduces to a no-op
  confirmation: re-grep for residual `system/agent` / `AGENT-BRIEFING`
  references in `add-agent.md` (both copies), confirm clean, mark `[~]`
  with brief deferral note. No content changes expected.
