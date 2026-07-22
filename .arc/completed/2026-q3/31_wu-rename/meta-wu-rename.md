# Metadata: wu-rename

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P2`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-wu-rename.md`
- **Task List:** `tasks-wu-rename.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Task 8.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/329>
- **Completed:** 2026-07-22

---

## Release Notes Entry

Work-unit identities can now be renamed atomically across tracked lifecycle artifacts and applicable Git,
worktree, and user-workspace surfaces, with evidence-bound commit validation and resumable reconciliation
protecting partial failures.

### Added

- `arc rename <slug> <new-slug>` renames active spawned or in-place work units and planned or provisional stubs
  while preserving companion artifacts, cohort membership, cross-references, and project readiness state.
- Rename receipts bind the exact staged identity transformation so commit validation can prove artifact
  conservation and old-to-new correspondence without weakening other retirement checks.

### Changed

- Active-work-unit renames reconcile local and published branch names, user workspace directories, worktree
  ownership markers, and eligible worktree paths; unpublished branches remain unpublished.
- Interrupted renames resume from observed state without replaying completed legs, while stale remote leases and
  worktree moves that cannot be completed safely remain explicit operator follow-ups.

## Completion Notes

The rename command now resolves a work unit across active, planned, and provisional lifecycle locations, refuses
ambiguous or unsafe preflight states, and commits one receipt-authorized tracked sweep before reconciling the
applicable identity surfaces. The tracked sweep preserves the complete companion set, rewrites metadata and bounded
references, updates cohort membership and readiness output, and uses a short-lived branch for backlog stubs. Active
subjects additionally reconcile branch, remote, per-user workspace, ownership-marker, and worktree identities with
resume-safe status reporting.

Implementation stayed within the designed three-layer CLI boundary and retained the intentional exclusions:
completed work units, errands, cohort-identity renames, and work units with recorded open pull requests remain out of
scope. The planned exhaustive interruption proof was allocated between end-to-end commit/refusal and stale-lease
coverage plus deterministic orchestration tests at every identity-leg boundary; no behavioral scope was dropped.
Review follow-through hardened Windows-style metadata titles, structurally valid authorization fixtures, overlapping
slug worktree moves in both directions, and direct end-to-end fixture assertions.

Verification completed with Markdown, TypeScript, and shell linting; source and test typechecks; the production
build; and the full 602-file suite with 7,727 passing tests and one expected skip. Review-driven changes received
focused unit, integration, and end-to-end regression passes, including 218 related tests and all four rename command
scenarios. The hosted review completed with every conversation resolved and its status check successful.
