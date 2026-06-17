# Metadata: lifecycle-transition-core

| **State**     | **Owner** | **Branch**                       | **Class** | **Priority** |
|---------------|-----------|----------------------------------|-----------|--------------|
| `Integrating` | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** PR #103 opened (integrate-work-unit Phase 1). Task 7.1 verification + integration entry
  (State → Integrating) landed, plus 8 pre-PR review fixes across 4 commits — worktree-clean guard wired
  (`arc park` on Planning WUs was broken), and occupancy/abandon/resume/null-identity/cohort-path hardened.
- **Next Task:** [none] — in integration; PR #103 awaiting review.
- **Blockers:** [none]

- **Next Action:** integrate-work-unit Step 4 — triage CodeRabbit's PR #103 findings via the
  `address-pr-review.md` workflow (`.arc/system/workflows/project/`), then resume review iteration.

---

## Release Notes Entry

Work-unit lifecycle transitions are now executed by the CLI. The relocation, branch, worktree, and
state-field mechanics that lifecycle workflows previously hand-ran as markdown steps are consolidated into a
single code-level state machine, invoked through a new family of top-level lifecycle commands.

### Added

- New top-level lifecycle commands: `arc park` / `arc resume`, `arc activate` / `arc deactivate`,
  `arc promote` / `arc demote`, `arc reopen`, `arc abandon`, `arc archive`, and `arc stub` (scaffold a new
  backlog work unit).
- `arc start` now dispatches the full set of entry transitions from one entry point — create a new unit,
  graduate one from the backlog, resume a parked one, or cold-start in the current worktree.
- `arc status <slug>` resolves a named work unit's lifecycle state; bare `arc status` keeps the
  session/active view.
- `arc plan check` classifies whether the current context is ready for planning before a draft is authored.
- `arc abandon` gates its destructive teardown behind a printed impact plan and an explicit `--yes`.

### Changed

- Lifecycle transitions — artifact relocation, branch and worktree reconciliation, state-field writes, and
  the dependent status/readiness regenerations — now run through one mechanical executor driven by a
  declarative transition table, replacing the per-workflow restated steps.

## Completion Notes

The heavy member of the `lifecycle-state-machine` cohort, and its first deliberate step toward the north
star of deterministic lifecycle *mechanics* in the CLI with *judgment* left to workflows. Shipped: a
declarative transition table over the `(phase, location)` state-space model; a thin imperative executor; the
1↔1 mutator bundle (`relocate-artifacts` / `reconcile-branch` / `reconcile-worktree` / `set-phase`) with
teardown legs; the foot-gun guards (`name-collision`, `worktree-occupancy`, `worktree-clean`); `start`
dispatch; the WU-lifecycle verbs; the park@Active pointer-record; the `archive` sweep (the mergeable ship
that rides the PR under `with-integration`); the `stub` required-fields contract; the planning-entry
write-context gate; and the dep-edge discharge write at `activate`.

Key supersessions from plan:

- `spawnWorktree` was **decomposed** into the bundle legs rather than delegated to — delegation would clobber
  a graduated meta with a fresh template write. `start` create-new and cold-start recompose the legs directly
  (the executor's fixed `artifacts`-before-`reconcileWorktree` leg order can't spawn-then-scaffold).
- The installation handlers (`update` / `health` / `diff`) moved `handlers/lifecycle.ts` →
  `handlers/installation.ts`; the new `handlers/lifecycle.ts` holds the verb handlers. Verbs land top-level
  (peers of `arc start`), with no `arc lifecycle` namespace — superseding the spec's earlier
  `arc lifecycle state` (now `arc status <slug>`).
- `reconcile-status-user` builds for real (its renderer is shipped); `reconcile-roadmap` ships an interim
  advisory because ROADMAP has no code renderer yet (owned downstream by `roadmap-tooling`).
- No merged-corner `abandon` cell: post-merge rework is a new origin-linked unit (ADR-026 amendment), so
  `deactivate` stays the narrow `Active → Planning` undo and `abandon` is pre-merge only.

Verification: full unit + integration + e2e suites green; CI green. Three CodeRabbit passes converged
(18 → 4 → 0 actionable) — hardening only: the executor cwd pin, fail-loud on malformed meta tables and
unexpected IO errors, path-traversal guards shared across `stub` / `park` / `resume`, partial-application
reporting on park/resume, and benign-vs-actionable classification of remote-branch-delete failures. One
forward-compat refactor (swap the hand-rolled git-error classification for structured `Result` errors) is
queued to `cli-substrate-adoption` via the user inbox.
