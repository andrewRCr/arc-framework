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
- **Next Task:** Task 3.11 — Link-validator hardening + stale-ref cleanups (line ~1075)
- **Last Completed:** Task 3.10 — ADR-013 sanity check, PRD refresh, and finalize. ADR-013
  amendment L164–167 rewrite: "performing an override-presence scan only" and "aggregated
  frontmatter-only read across ~16 per-file entries" replaced with asymmetric-split
  description (methods no init read; extensions enumerated via `grep -l "^active: true"`
  producing the active-extensions list consumed by fire-point directives). PRD refresh: 7
  locations updated — P0.2 historical parenthetical trimmed; P0.5 dropped `workflow` field,
  renamed `has-override` → `override-active`, added rationale for omitted `workflow`; P0.6
  renamed `has-steps` → `active`, noted `.steps` → `.actions`; P0.8 retitled and rewrote to
  describe the asymmetric split; P1.13 tightened to match shipped Step 2 (Batch 1/2 structure,
  grep location, Step 4 simplification, imperative-citation safety pass); § Architectural
  Shape and § Session-Init Consumption Model both retired thin-index framing for methods with
  extensions-only enumeration retained. Notes-file § Compliance-Reliability Grounding middle
  paragraph rewritten to reflect landed mechanism (first/third/fourth paragraphs retained).
  5-point amendment checklist verified — (a) per-file structure, (b) schema field names,
  (d) `pre-merge-review` → `diff-review` rename, (e) CI invariant at `lint:arc:triggers` /
  `ci.yml:21` all accurate; (c) the one rewrite target. No literal "draft marker" existed in
  ADR text (Phase 2.3 "draft" status was conceptual). No strategy edits needed — strategy
  content already matched landed state. ADR-013 single-copy confirmed (no package copy
  exists). Tier 1 gates clean (markdown lint on all four edited files). Previous:
  `5e0b1c3` Task 3.9 — CLI test coverage for per-file restructure.
- **Blockers:** [none]
- **Next Action:** Begin Task 3.11 — Link-validator hardening + stale-ref cleanups. Extend
  `system/scripts/validate-links.sh` `validate_file()` to skip (a) source files matching
  `*.template.md` or `template-*.md` and (b) files under `reference/archive/**` (both copies
  — package source + `.arc/`). Add integration test cases to
  `packages/arc-framework/__tests__/integration/validate-links.test.ts` covering the three
  skip paths. Remove the `validate-links.sh` template-skip item from
  `.arc/user/andrew/ATOMIC-INBOX.md` (promoted into this WU). Apply inline stale-ref cleanups:
  `.arc/backlog/feature/BACKLOG-FEATURE.md` → `plan-arc-lite.md` (Lite mode removed during
  Work-Status Restructure WU), and restore `[arc-ext-post-context-load]` ref-def in
  `.arc/reference/analysis/analysis-workflow-clarity-audit.md`. Verify: full-tree scan
  post-change yields only `.arc/backlog/feature/**` cross-WU hits.
