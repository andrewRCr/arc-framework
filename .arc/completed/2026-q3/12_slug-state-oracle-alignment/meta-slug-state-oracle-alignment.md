# Metadata: slug-state-oracle-alignment

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-slug-state-oracle-alignment.md`
- **Task List:** `tasks-slug-state-oracle-alignment.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 7.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/233>
- **Completed:** 2026-07-13

---

## Release Notes Entry

ARC lifecycle queries and start dispatch now combine checked-out project state with concurrent in-flight branch
truth, preventing stale cross-worktree state from silently minting duplicate work-unit branches. The same state
model now keeps prospective transitions, cleanup residue, materialization candidates, and foreign-write advice
accurate across local, remote, and degraded-read conditions.

### Added

- `arc status <slug> --fetch` can opt into live membership while retaining warn-and-degrade behavior, and slug
  output includes a sibling worktree path when one is known.
- Session initialization exposes unclassified branch and errand-record residue for advisory cleanup instead of
  silently dropping it.

### Changed

- `arc start` consults composed live lifecycle truth, bounded-fetches never-seen candidates before branch-minting
  decisions, and refuses non-interactive starts when that truth is indeterminate.
- Remote-only materialization now requires both an absent local branch and an absent local worktree.

### Fixed

- Foreign-write overlap checks prefer the fetched base ref, preventing inherited base changes from being
  attributed to sibling work.
- Staged lifecycle transitions take precedence for their own branch, allowing archival ROADMAP regeneration to
  drop the shipped row in the archival commit without disturbing siblings.
- Degraded remote reads retain indeterminate errand-record residue without issuing a definitive cleanup warning.

## Completion Notes

This work unified four parallel-state failures behind one composed lifecycle model: checkout-local slug answers,
stale-base foreign-write attribution, pre-commit lifecycle renders losing to the branch tip, and branch or record
residue disappearing from cleanup surfaces. The implementation added a shared tree-plus-oracle composition layer,
then adopted it at the slug-query and start-dispatch construction sites without widening their pure projection
interfaces. Destructive start paths additionally expand live-only candidates and treat incomplete truth as a
safety condition rather than absence.

The reproduce-first foreign-write investigation identified the configured local base as the producing channel;
both the hook and interactive errand check now share fetched-base selection with a safe local fallback. The final
implementation also scopes prospective state precedence to the checked-out branch, distinguishes an unoccupied
local branch from a remote-only candidate, and carries classified residue plus completeness facts through the
session-start cleanup path. The conditional ready-view adoption was intentionally omitted because it would repeat
the oracle read without changing readiness, while dependency discharge remains conservatively tree-only as
designed.

The integration archive sweep exposed one missing production connection after review: lifecycle-triggered ROADMAP
regeneration had not supplied the checked-out branch to the prospective model. A real executor-bound archive
regression now covers that ceremony path, and the production binding reuses the same scoped precedence contract as
the staged hook and CLI renderer.

Verification covered focused regressions, the complete 5,257-test suite, strict typechecking, TypeScript,
Markdown and shell linting, build output, cross-platform CI, and full code review. All checks passed with no open
actionable findings.
