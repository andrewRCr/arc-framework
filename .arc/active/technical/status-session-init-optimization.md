# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 5.7.e — Subdir README rewrite (next per amended
  execution order: 5.7.e → 5.7.g → 5.7.h → 5.7.i)
- **Last Completed:** Tasks 5.7.c + 5.7.d batched into a single commit.
  5.7.c: 8 `git mv` rename ops (`system/agent/` → `system/briefs/`,
  `AGENT-BRIEFING.*.md` → `AGENT-BRIEF.*.md`) + path-string updates in
  `classification.ts:74`, `init-recipe.json` (4 briefs paths), 6 test
  files (path-existence and CONFIGURABLE_FILES-membership assertions),
  and 3 manifest entries. 5.7.d: cross-reference sweep across all live
  framework docs, source, hooks, and scripts in both `.arc/` and
  `packages/arc-framework/arc/` trees — 30+ files touched including
  brief files (titles, tables, closing pointers reframed to harness-level
  files), session-init.md, DEV-RULES.ARC, workflow files
  (`01_verify-and-configure.md` content section deletions per spec,
  `02_define-project.md`, `add-agent.md`, `maintain-project-docs.md`),
  strategy docs (file-classification, session-operations,
  package-project-sync — also dropped retired per-tool agent file
  entries and `template-agent.md` references), reference docs
  (META-PRD, PROJECT-STATUS, TECHNICAL-OVERVIEW), READMEs,
  template-contributing, `arc-setup` SKILL, `verify-integrity.sh`
  (4 path checks + message text), `validate-links.sh` comment,
  `pre-commit:351-352` comment cleanup, `init.ts:291` post-init message
  plus dependent test assertions. Manifest pristine_hash recomputed for
  3 briefs entries (content changed in this commit). `briefs/README.md`
  intentionally deferred to 5.7.e for wholesale rewrite (34 grep
  matches remain there). Tier 2 gates clean (1099 tests / 8 files,
  typecheck, eslint, shellcheck, 214 markdown files, build).
- **Blockers:** none
- **Next Action:** Begin Task 5.7.e — rewrite `system/briefs/README.md`
  (both copies). Retire dual-hub + tool-files architecture framing
  ("Why Two Hub Files", "What Belongs in Tool-Specific Files",
  "Adding Files for Other Tools", "Tool-Specific Templates",
  "When to Update Tool-Specific Files" — all obsolete under
  `{AGENT}.ARC.md` removal). Scope new README to session-init
  briefings: purpose, three files and their roles (ARC / PROJECT /
  CONTRIBUTOR), classification per file, adoption guidance
  (customize PROJECT; ARC and CONTRIBUTOR are framework-managed).
  Add pointer to harness-level files (`CLAUDE.md`, `AGENTS.md`) as
  the ARC-external surface for agent-specific operational guidance.
  Two-copy sync. Manifest pristine_hash will need recompute again
  after the rewrite.
