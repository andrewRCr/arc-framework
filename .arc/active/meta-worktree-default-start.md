# Metadata: worktree-default-start

| **State**       | **Owner** | **Branch**                    | **Class** | **Priority** |
|-----------------|-----------|-------------------------------|-----------|--------------|
| `Integrating`   | `andrew`  | `feat/worktree-default-start` | `Light`   | `P2`         |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** `concurrent-work-doctrine`

- **Origin:** [internal]
- **Design:** `spec-worktree-default-start.md`
- **Task List:** `tasks-worktree-default-start.md`

- **Last Completed:** Task 2.1 — Complete verification (Tier 3 gates + success criteria)
- **Next Task:** [none] — all phases complete; ready for integration
- **Blockers:** [none]

- **Next Action:** integrate-work-unit Step 1 — verify completion. Verification passed: all quality gates
  green and all 8 success criteria met (`tasks-worktree-default-start.md`), with the cohort-doc resolution
  scoped to `backlog/planned/` noted as a deviation.

---

## Release Notes Entry

`arc start <name>` now spawns an isolated worktree for new work by default, and new work units lean toward
worktree-creating starts so concurrent work stays isolated. Session initialization gained two coordination
surfaces: a concurrent-workload advisory and active-work-unit cohort-document awareness.

### Added

- `arc start <name>` (without `--here`) spawns an isolated worktree on a new `plan/<name>` branch, resolving
  the location, base, and repository from configuration. `--here` remains the in-place override.

### Changed

- New work units default to worktree-creating starts under full branch protection where worktree spawning is
  available, falling back to an in-place branch otherwise; partial protection still cuts no branch.
- Session initialization surfaces a one-line advisory when heavier work is already in flight, and reads the
  active work unit's coordinating cohort document when one applies.

## Completion Notes

Wired the create-new `arc start` mode to the existing `spawnWorktree` primitive — the CLI caller it shipped
without — so bare `arc start <name>` spawns an isolated worktree on a new `plan/<name>` branch. The
worktree-vs-branch decision was centralized in `init-work-unit`'s Execution Modes, resolved mechanically from
branch-protection × spawn-availability (mirroring `run-errand` Launch) rather than caller-selected, so every
WU-creating caller inherits the worktree-default by not forcing in-place. Two session-init coordination surfaces
landed probe-side: a plate-balance advisory tallying the in-flight `Class` composition, and `cohort-{name}.md`
discovery resolving the active WU's coordinating doc for context-load.

Cohort-doc resolution was deliberately scoped to `backlog/planned/` only — an active WU is an in-flight cohort
member, so its cohort is never archived to `completed/`, making resolution a deterministic path lookup rather
than a tree search. This narrowed the 1.4.a subtask wording; confirmed acceptable at verification.

Verification: all quality gates green (lint, typecheck, full suite, build) and all eight success criteria met.
CodeRabbit's pre-PR pass flagged a no-throw contract gap — `runCreateNew`'s spawn (and the sibling
`runColdStart`'s scaffold) could throw past the documented refusal union; both were wrapped to return refusals,
with command-core tests covering the new paths.
