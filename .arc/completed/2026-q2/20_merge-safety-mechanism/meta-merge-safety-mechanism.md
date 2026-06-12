# Metadata: merge-safety-mechanism

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --- | --- | --- | --- | --- |
| `Shipped` | `andrew` | `feat/merge-safety-mechanism` | `Heavy` | `P2` |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** `concurrent-work-doctrine`

- **Origin:** [internal]
- **Design:** `spec-merge-safety-mechanism.md`
- **Task List:** `tasks-merge-safety-mechanism.md`

- **Last Completed:** Integration review iteration — PR #83 open, checks green, CodeRabbit green, review fixes
  committed and pushed
- **Next Task:** [none] — verification complete
- **Blockers:** [none]

- **Next Action:** merge PR #83

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/83>
- **Completed:** 2026-06-11

---

## Release Notes Entry

ARC now includes advisory merge-safety mechanisms for concurrent work: session startup can surface base-branch
drift and lossless supersession recovery, hooks warn about risky force-pushes and foreign work-unit writes, and
merge/integration commits fit the commit discipline without manual ceremony friction.

### Added

- A base-distance session-init probe that compares the current branch to `origin/<base>`, reports changed-path
  overlap when the base advanced underneath the branch, and surfaces a reconcile prompt only when useful.
- Patch-equal supersession detection for diverged branches, with a lossless-reset prompt when local commits have
  already been rebased onto the remote.
- An advisory pre-push warning for non-ancestor overwrites, wired into Husky, Lefthook, and pre-commit hook
  manager installation paths.
- A path-surface and `chore/`-aware write-context classifier, plus an advisory pre-commit warning for staged
  writes to another active work unit's artifacts.

### Changed

- Worktree sync and base-distance reads now share a ref-parameterized ahead/behind primitive, so future
  cross-machine and archive flows can reuse one git-distance contract.
- Failed distance reads degrade to `remote-unavailable` instead of throwing through the session-init status path.

### Fixed

- Merge commits in progress bypass `commit-msg` validation, and `Context: integration (...)` is accepted as a
  standalone footer kind for single-parent integration ceremony commits.

## Completion Notes

merge-safety-mechanism shipped the mechanism layer under concurrent-work-doctrine. The doctrine already states the
conventions; this work adds the advisory backstops that make those conventions visible at the right operator
moments without adding hard gates.

The behind-base contract is now general: `countAheadBehindRef` compares arbitrary refs, worktree sync consumes it,
and the session-init envelope carries a base-distance probe shaped like the existing worktree channel. When
`origin/main` advances under a branch, session init can surface the base drift, changed-path overlap, and a
reconcile prompt; parity and branch-only-ahead states stay quiet.

The append-only safety net covers the 2026-06-10 incident shape. Diverged branches now get a patch-equal
supersession read, with a lossless-reset prompt when local commits are already represented on the remote. Push-time
history rewrites get an advisory pre-push warning when the remote tip is not an ancestor of the local tip. One
intentional deviation from the original wording remains: the hook warns on every non-ancestor overwrite because
the git pre-push protocol exposes ref OIDs, not whether a branch is currently shared by another operator; the
surface is still advisory and never blocks.

The foreign-write backstop extended write-context classification with path-surface and `chore/` branch awareness,
then added a pre-commit warning for staged writes to another active work unit's artifacts. Cohort docs deliberately
stay out of that single-owner gate and remain covered by the behind-base overlap detector.

Hook friction was reduced at the same time: merge commits in progress are exempt from conventional-commit/footer
validation, and `Context: integration (...)` is recognized as a standalone footer kind. The pre-push advisory also
ships through the hook-manager installers, with Husky, Lefthook, and pre-commit wiring covered.

Verification passed the full Tier 3 gate set: markdown lint, TypeScript lint, shell lint, full typecheck, full
test suite, build, and package-project sync. Pre-PR review found and fixed three material issues before final
push: Lefthook pre-push wiring now forwards remote args, failed distance reads degrade cleanly, and the spec's
security wording is explicit. PR #83 is open with green CI and CodeRabbit success.
