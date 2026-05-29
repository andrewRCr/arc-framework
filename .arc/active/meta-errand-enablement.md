# Metadata: Errand Enablement

- **State:** Integrating
- **Owner:** andrew
- **Branch:** feat/errand-enablement

- **Origin:** [internal]
- **Design:** `spec-errand-enablement.md`

- **Depends On:** worktree-foundation
- **Cohort:** agile-parallelism

- **Task List:** tasks-errand-enablement.md
- **Last Completed:** Task 6.1 — Complete verification (Phase 6 complete; Tier 3 gates green, 10/10 success
  criteria met)
- **Next Task:** [none] — task list complete
- **Blockers:** [none]

- **Next Action:** integrate-work-unit Step 1 — verify completion.

---

## Release Notes Entry

The Errand work class lands a lightweight path for atomic side-work that surfaces mid-work-unit — commit-now
detours you handle yourself without spinning up a full work unit. A single `arc errand` invocation composes a
forward-pointing queue entry and runs an advisory overlap check, leaving the originating work untouched (no
branch, no commit). Alongside it, an opt-in planning-path auto-merge lane lets low-risk grooming changes merge
once checks pass, while code and constitutional documents stay in the reviewed lane.

### Added

- **Errand work class** — doctrine and a decision matrix for atomic, commit-now detours that don't warrant a
  work unit, with a routing table cut on the commitment axis (act-now work vs. deferred captures).
- **`arc errand` command** — `queue` composes a forward-pointing entry into a per-user errand queue without
  creating a branch or commit; `check` reports whether any in-flight work touches a target path.
- **Errand queue (`ERRANDS.md`)** — a per-user queue that converges across worktrees and machines, drains by
  execution, and raises a staleness advisory when entries linger past a threshold.
- **Advisory foreign-artifact gate** — flags when an errand's target overlaps other in-flight work and records a
  coordinate/sequence caveat; advisory only, never a block.
- **Errand-aware session entry** — `arc-session --errand` orients a no-work-unit primary worktree into errand
  mode.
- **Planning-path auto-merge lane** — a copy-ready GitHub `merge-ok` recipe (lane classification plus a single
  required rollup check), a planning-paths `CODEOWNERS`, and a guided, idempotent setup workflow offered during
  initial configuration. Planning and backlog grooming PRs merge once checks pass; code and constitutional-doc
  PRs stay in the reviewed lane.

### Changed

- The "Leave it cleaner" routing guidance is re-cut on the commitment axis (act-now vs. capture-for-later), with
  the Errand as the atomic act-now destination.
- Branch and worktree terminology standardized to base-branch / primary-worktree.

### Removed

- The provisional `errand-launch` label, superseded by `arc errand` and the `arc-errand` skill.

## Completion Notes

Errand Enablement delivers the Errand floor for the agile-parallelism cohort — the lightweight in-place detour
path that closes the gap Worktree Foundation left: spawning a full work unit became cheap, but it stays overkill
for atomic side-work committed mid-WU. Six phases shipped: (1) the Errand work-class doctrine — the decision
matrix in `strategy-work-organization.md` § Errand Work Class and the commitment-axis re-cut of the
DEV-RULES.ARC "Leave it cleaner" routing table; (2) the `ERRANDS.md` queue substrate with slug-keyed,
notes-synced cross-worktree convergence; (3) the `arc errand` primitive (`queue` + `check`) and the advisory
foreign-artifact gate, paired with the `arc-errand` skill; (4) the cold-errand session-init Orient arm
(`--errand`); (5) the planning-path auto-merge lane — the `merge-ok` classify-and-rollup CI recipe, `CODEOWNERS`,
the `setup-merge-gate` workflow, dogfooded live on this repo with TECHNICAL-OVERVIEW § 3; (6) verification.

Design held to the spec — 10/10 success criteria met, with two scoped deviations recorded at verification. The
auto-merge lane's behavioral path is proven by construction plus live config: this WU's own PR is reviewed-lane,
so the auto-merge happy path will first be exercised by a later planning-only PR. And the cohort-wide
main → base-branch documentation sweep is scoped to Concurrent Work Conventions, not here.

Pre-PR self-review hardened two edge cases in the new errand code (landed as code-review fixes): the
foreign-artifact advisory now matches a target renamed into place in another worktree (porcelain `old -> new`),
and `arc errand` self-heals a missing `ERRANDS.md` from the packaged template scaffold rather than throwing on
installs that predate queue seeding.

Deferred deliberately: the integration drain of the personal USER-INBOX was held, per a standing decision to run
the full inbox sweep as a series of errands now that the mechanism exists. A capture filed during this
integration — making the WU lifecycle workflows merge-gate-aware, relocating the final-go interlock onto the
pre-push fire-site for the auto-merge lane — is part of that deferred set.
