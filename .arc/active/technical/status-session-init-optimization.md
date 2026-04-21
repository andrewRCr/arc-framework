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
- **Next Task:** Task 3.7 — Framework-sync + install pipeline: register per-file entries (line ~730)
- **Last Completed:** Phase 3 remainder audit + task-list restructure (uncommitted).
  3.7 expanded to include `init-recipe.json` and `classification.ts` updates alongside
  the manifest registration, with `pristine_hash` approach specified (`sha256sum` on
  UTF-8 content — matches the framework's `hashContent` helper byte-for-byte).
  3.8 broken into 3.8.a (hooks + verify-integrity script rewrite), 3.8.b (Tier 1
  always-loaded doc refs), 3.8.c (strategy narrative rewrites), 3.8.d (delete +
  install-pipeline cleanup + grep-verify) — sweep scope is ~74 live files, materially
  larger than the 3.6 anchor-form sweep. DEV-RULES.ARC L370 ref-def gap from 3.6
  named explicitly in 3.8.b. 3.9 tightened with a unit-level classification assertion.
  3.10 PRD refresh scope expanded beyond SESSION-NOTES bullets (P0.8, P1.13, consumption
  model and constitutional framing sections). New Task 3.11 (link-validator hardening +
  atomic stale-ref cleanups) added — template-skip + archive-skip structural fix clears
  the ~10 template false-positives, 2 inline cleanups for genuine stale live refs.
  Old 3.11 renumbered to 3.12 with a full-tree link-scan invariant added to Tier 3 gates.
  Previous: `fbe9738` incidental link-hygiene cleanup (10 genuine stale-path fixes across
  tree + 2 escape-quoted refs in `notes-session-init-optimization.md`; full-tree broken-link
  count 36 → 24). Previous: `b1398ad` Task 3.6 cross-reference sweep — 44 anchor-form
  ref-def lines rewritten across 21 files.
- **Blockers:** [none]
- **Next Action:** Begin Task 3.7 — expanded scope: manifest entries (18 new paths with
  sha256 pristine_hash values), `init-recipe.json` additions, `classification.ts`
  fall-through coverage. Aggregates stay in classification/recipe/manifest until 3.8.d
  removes them atomically.
