# Metadata: Worktree Foundation

- **State:** Shipped
- **Owner:** andrew
- **Branch:** feat/worktree-foundation

- **Origin:** [internal]
- **Design:** `spec-worktree-foundation.md`

- **Depends On:** work-organization-reform
- **Cohort:** agile-parallelism

- **Task List:** tasks-worktree-foundation.md
- **Last Completed:** Task 8.1 — Complete verification (Tier-3 gates; all 11 success criteria met).
- **Next Task:** [none] — verification complete; WU shipped.
- **Blockers:** [none]

- **Next Action:** [none] — shipped.

- **PR URL:** https://github.com/andrewRCr/arc-framework/pull/35
- **Completed:** 2026-05-28

---

## Release Notes Entry

Work units can now run in their own git worktree, so several can progress in parallel off a single
repository without colliding. Session initialization is worktree-aware, personal session notes sync
across worktrees, and the lifecycle ceremonies create and clean up worktrees as work units begin and
ship — with externally-created worktrees accommodated, never relocated or refused.

### Added

- Worktree-aware session initialization — resolves primary-vs-linked worktree identity and
  pre-computes branch-gone recovery candidates and stale-worktree sweeps, adding no fetch or scan on
  the common resume path.
- Entry primitives that spawn or cold-start a work unit into its own worktree (branch, meta, and
  seeded session notes) at a configurable location, leaving the originating session untouched.
- Cross-work-unit personal-notes sync — per-work-unit session notes stay isolated, while shared notes
  merge by entry identity with deletion tombstones and reconcile across concurrent worktree pushes.
- A machine-local worktree-ownership marker that drives marker-gated worktree cleanup at integration,
  branch-gone recovery, and the stale-worktree sweep.
- `worktree.location_template` config key (default `../{repo}.{branch}`) and worktree branch-posture
  overrides via the branch-format method.

### Changed

- A deleted upstream is reported distinctly from a transient remote failure, with a guided recovery
  cascade that surfaces candidate branches instead of requiring manual recovery.
- Session entry resolves to the active worktree's work unit; the activate / integrate / deactivate /
  handoff ceremonies are worktree-aware.
- The session-entry skill is renamed from `arc-resume` to `arc-session`.

### Removed

- The `atomic-*` work-unit companion file type is retired.

## Completion Notes

Delivers the worktree substrate for the agile-parallelism cohort: the ability to run concurrent work
units in sibling worktrees off one repository, which is the precondition for parallel workstreams and
the separation-of-concerns the cohort targets. Shipped across seven implementation phases (Phase 6,
in-session shift / `arc-shift`, was cut and deferred to a later work unit).

Key design points settled during implementation rather than upfront:

- **`worktree.location_template` is a config key, not a method** (refined at execution kickoff). The
  value is code-consumed by the path-resolution helper, so it belongs with ARC's other code-read
  config values; a documentation-only method would have been a category error. Branch posture stays a
  `branch-format` method extension (agent-read).
- **Cold-start writes no ownership marker.** The marker records that *ARC created* a worktree; in
  cold-start the user pre-creates the bare worktree and ARC only scaffolds content into it, so the
  worktree is advisory (reads as external at every cleanup site). The spec's R29 was reconciled to
  this as-built shape at integration.
- **The marker is coupled to the worktree's lifetime** — it lives inside the worktree, so it cannot
  orphan or outlive it; absence reads as an externally-managed worktree.

Verification: all eleven success criteria met (resume-clean 0-prompt budget observed live; branch-gone
split, conditional roster/sweep pre-compute, cross-WU sync purity, external-worktree composability, and
coupled marker lifetime confirmed against the implementation and passing unit/e2e coverage). Tier 3
gates green; a scoped CodeRabbit pass returned zero code findings.

Because the worktree isolation this WU delivers did not yet exist, cross-cutting planning that surfaced
mid-WU was captured on this branch (ADR-021 Errand work class, ADR-022 managed operational-state
documents, agile-parallelism cohort restructuring, and several sibling/future WU draft updates) — the
bootstrap case the cohort exists to close. See PR #35 for the disclosed scope split.
