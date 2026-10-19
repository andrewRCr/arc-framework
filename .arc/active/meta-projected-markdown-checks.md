# Metadata: projected-markdown-checks

| **State**     | **Owner** | **Branch**                       | **Class** | **Priority** |
| ------------- | --------- | -------------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/projected-markdown-checks` | `Heavy`   | `P1`         |

- **Cohort:** `state-storage`
- **Depends On:** [none]

- **Origin:** [internal] — the split of the `state-storage` register's lint clause (2026-10-16)
- **Design:** `spec-projected-markdown-checks.md`
- **Task List:** `tasks-projected-markdown-checks.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:e7aa19c360ec8535f0dabd7d857219e8bfc496767b1a37696008695067a73819`

- **Current Workflow:** `integrate-work-unit`
- **Last Completed:** Task 6.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Resume publication at the idempotent push, then resolve or open the change request.

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

Markdown validation now checks indexed source bytes and uses one explicit file corpus for linting and fixing.

### Added

- Check declarations support uncached selection feedback over changed, whole, or named projected-file scopes.
  The in-repository backend currently supplies an empty selection.
- Record-kind registrations include tool-free checks for newly introduced unstable links and undefined full
  references, preserving unchanged historical violations.

### Changed

- State-authoring workflows request increment feedback before approval and after later authored-text changes.
- Markdown linting and fixing share an explicit tracked-plus-projected file corpus, with bounded literal fixer
  batches and write-authority validation before mutation.

### Fixed

- Tracked Markdown validation rejects links into movable or ignored ARC state, resolves leading slashes from the
  repository root, and checks staged source bytes even when worktree contents differ or are absent.
- Link validation and fixing preserve literal filenames, including glob characters and case-distinct paths.

## Completion Notes

Delivered both validation layers and the feedback path: production record-kind registrations carry introduced-link
checks, tracked Markdown uses the strengthened hook and repository audit, and selection declarations feed the
project's Markdown recipes and exact-list fixer. The record checks are exercised through the reference backend;
the current in-repository backend still relies on tracked-file hooks. Projection acquisition remains the specified
empty adapter until the projection connects it, so this landing carries no claim of live projected-file selection.

All 22 operational success criteria were verified. Five adversarial criteria passes ended after the approved
repairs; the subsequent standard pass's two minor workflow findings were fixed and verified. Review retains the
explicit Owner-accepted residual-risk terminus. The base reconcile preserves main's shared review methods while
retaining feedback after settled planning edits and before both ordinary and spec-changing review-fix commits.
Installation inventory resolves to 148 files, and workflow counterparts were rendered from package source.

The original forced merge validation passed all 19 applicable checks. Validation after the base reconcile passed
both type checks, workflow and package audits, 241 ARC contract tests, and 16,278 unit tests; related feedback also
passed 1,158 E2E tests. CI-only checks retain their host deadlines. The singleton landing bridge keeps this meta
Integrating in active placement; archival and physical teardown follow in the separate post-merge archive PR.

---
