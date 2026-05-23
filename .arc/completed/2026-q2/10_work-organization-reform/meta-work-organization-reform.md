# Metadata: Work Organization Reform

- **State:** Shipped
- **Owner:** andrew
- **Branch:** technical/work-organization-reform

- **Origin:** [internal]
- **Design:** `spec-work-organization-reform.md`

- **Depends On:** [none]
- **Cohort:** [none]

- **Task List:** `tasks-work-organization-reform.md`
- **Last Completed:** Task 8.1 — Complete verification (Tier-3 gates; 48 success criteria walked — 46 `[x]`, 2 `[~]`;
  per-worktree isolation acceptance test).
- **Blockers:** [none]

- **Next Task:** [none] — verification complete; WU ready for integration.

- **Next Action:** [none] — shipped.

- **PR URL:** https://github.com/andrewRCr/arc-framework/pull/34
- **Completed:** 2026-05-22

---

## Release Notes Entry

ARC's work-unit lifecycle is rebuilt around a single branch per work unit with sweep-as-you-go integration: a
WU now lives on one branch from planning through integration and merges to the main branch exactly once, with
archival landing in the same PR. The main branch no longer carries in-flight work-unit state, so worktrees
branched from it stay isolated. Branch and commit conventions, the meta file's shape and field set, the capture
pipeline, and the project-level PRD are realigned in the same constitutional pass.

**Breaking Changes:** existing installations adopting this release will see branch prefixes change (`feature/`
and `technical/` retired); `status-{name}.md` renamed to `meta-{name}.md` (and `template-status.md` to
`template-meta.md`); `PROJECT-STATUS.md` and `template-completion-doc.md` removed; the backlog restructured from
category directories to `planned/` / `provisional/` state-dirs; and the commit-message hook tightened to an
8-type set that now rejects out-of-set types.

### Added

- Single-branch-per-WU lifecycle — one branch from planning through integration, merging to the main branch
  exactly once.
- Per-worktree isolation invariant — the main branch carries no in-flight work-unit artifacts; a worktree
  branched from it contains only its own WU's `meta-*`. Codified with an acceptance test.
- `meta-{name}.md` with a codified field set (`State`, `Owner`, `Depends On`, `Origin`, `Cohort`) and
  archive-phase sections (`Release Notes Entry`, `Completion Notes`) composed at integration.
- Five lifecycle review extensions with consistent fire-point names: `pre-activation`, `pre-commit-review`,
  `pre-pr-review`, `pre-push-review`, `pre-merge-review`.
- Top-level `completed/` archive surface, organized by date.
- `branch-format` method — a branch-prefix convention (inspired by Conventional Branch) plus `plan/<name>` for
  planning state.
- Roster cascade utility in the CLI, with worktree-location resolution.

### Changed

- Branch prefixes: `feature/` and `technical/` replaced by a Conventional-Branch-inspired set plus `plan/<name>`.
- Commit-message hook tuned to an 8-type set (`feat | fix | chore | docs | refactor | test | perf | revert`); a
  three-layer scope convention codified in `commit-format.md`, with `(arc)` reserved for cross-cutting framework
  and lifecycle-ceremony commits and the `Context:` footer chain extended.
- Backlog layout: category sub-backlogs replaced by `planned/` and `provisional/` state-dirs with per-WU
  subdirectories.
- PROJECT-PRD redesigned to a codified template (Mission, named principles, Scope / Out of Scope, Problem,
  Design Tradeoffs); PRD / TECHNICAL-OVERVIEW alignment checks wired into the spec-creation and integration
  ceremonies.
- Integration: a single PR per WU; composition, sweep, and ROADMAP regeneration land as the final pre-merge
  push.
- Personal user state relocated to per-WU subdirectories under `user/{identity}/`.

### Removed

- The separate planning-branch PR and the `[PLAN]:` PR prefix.
- `status-{name}.md` (renamed to `meta-{name}.md`) and `template-status.md` (renamed to `template-meta.md`).
- `template-completion-doc.md` and `PROJECT-STATUS.md` — their function distributes across the meta archive
  sections, the PROJECT-PRD, Release Notes Entries, and directory queries.
- `backlog/feature/` and `backlog/technical/` category directories.

### Infrastructure

- Roster cascade function shipped with Vitest unit + integration coverage.
- CLI `init` / `join` no longer inject instance-file preamble into seeded files.

### Deprecated

- Concurrent multi-owner work units — `Owner` is singular per WU.

## Completion Notes

Work Organization Reform rebuilt ARC's work-unit lifecycle foundation in a single constitutional pass. The
driving intent was **per-worktree isolation** — the precondition the downstream parallelism track (Worktree
Foundation, Agile WU Lifecycle, Concurrent Work Conventions) depends on — which was unachievable under the
prior two-branch model, where the main branch retained in-flight `Planning`-state status files through
integration and any worktree branched from main inherited them. Rather than fix isolation alone, the WU
absorbed the entangled surfaces sharing that constitutional area: branch conventions, the status/meta-file
shape, commit conventions, the capture pipeline, and the project-level PRD. Touching them together avoided
successive waves of churn across DEV-RULES, the strategy suite, the boundary workflows, the template suite, and
the hooks.

What shipped: the single-branch-per-WU model with sweep-as-you-go integration (one PR per WU, archival in the
same merge); the per-worktree isolation invariant, codified with an acceptance test; the
`status-{name}.md` → `meta-{name}.md` rename with a codified field set and consolidated archive-phase sections
(retiring `completion-{name}.md` and `PROJECT-STATUS.md`); the branch-prefix realignment and the tuned 8-type
commit set with a three-layer scope convention; the five-extension fire-point family with the new
`pre-merge-review`; the backlog migration to `planned/` / `provisional/` state-dirs with per-WU subdirs; and the
PROJECT-PRD redesign. ADR-019 records the constitutional decision.

Key deviations from plan, all surfaced and resolved during execution:

- The "Conventional Branch core-6 alignment with intentional `test` / `revert` divergence" premise proved to
  rest on a misreading of the CB spec. It was corrected to an "inspired-by, not aligned-with" framing in the
  `branch-format` method; ADR-019 carries a dated amendment.
- Deterministic ROADMAP auto-regeneration (an `arc roadmap render` CLI) was deferred to a dedicated tooling WU.
  The rendered-view baseline, documented regen algorithm, and regen-trigger discipline shipped here; ROADMAP is
  hand-maintained per the algorithm in the interim.
- PROJECT-PRD principles landed as named (not numbered) identifiers, and anti-goals folded into § Scope /
  Out of Scope per convention.
- The spec-flow optionality contract was explicitly deferred to the arc-plan Conductor work.

Verification: Tier-3 quality gates — markdown lint (300 files), TypeScript lint, typecheck, the full Vitest
suite (1,839 unit + integration, 60 e2e), and build — all passed. The 48-item success-criteria walk resolved to
46 met and 2 superseded (the ROADMAP renderer and the CB-alignment premise above), with no genuine gaps. The
per-worktree isolation acceptance test passed against the real main branch.

This WU unblocks the parallelism track: Worktree Foundation can now build on a lifecycle where the main branch
stays free of in-flight work-unit state.
