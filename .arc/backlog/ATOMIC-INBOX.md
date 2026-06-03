# Atomic Inbox

> _Project-shared queue of homeless atomic (single-step) items — single-step captures with no better home. Live
> capture in `user/{identity}/USER-INBOX.md` § Atomic drains here via the `arc-housekeep` flow; items execute as-is and
> remove on completion. No work-unit stub passes through here: multi-step work always has a stub home, so it
> graduates to a `backlog/{planned,provisional}/<wu-name>/` stub and only genuinely homeless single-step items
> rest in this shared surface. See `strategy-planning-module.md` § Inbox Family._

## Inbox

### `[ ]` **Migrate remaining `commit-msg` hook subdir-loops off `active/*/` to flat-root checks**

- _Observation:_ The `commit-msg` hook's TASK-LIST scanner was migrated from an `.arc/active/*/` subdir-loop to
  a flat-root check. Two similar subdir-loops remain in the same hook (both copies) — around
  `.arc/system/githooks/commit-msg` lines 266 (`for dir in .arc/active/*/ .arc/backlog/*/`) and 285
  (`for dir in .arc/active/*/`), plus a line ~305 needing a context check. These fire stale "Meta file not
  found in active directories" warnings on handoff and archival commits now that the meta file lives at flat
  `.arc/active/` (and leaves it entirely at archival). Non-blocking, but noisy and procedurally wrong.

- _Proposed action:_ Same fix shape as the task-list-scanner migration — replace each subdir-loop with a
  flat-root file-existence check, and make the `(archival)` footer case `completed/`-aware so the post-sweep
  archival commit doesn't warn. Both copies mirror byte-identical. (This is the concrete hook fix behind the
  stale-warning facet noted in the `interlock-release-refinement` draft's archival-ceremony Inbound Buffer entry.)

- _Scope:_ Atomic-tier. ~3 surgical edits per copy + optional hook smoke test.

### `[ ]` **Split `supplemental/` workflows into session-adjacent vs installation-level**

- _Observation:_ `.arc/system/workflows/arc/supplemental/` mixes two implicit categories: framework-level
  one-offs (`add-agent.md`, `integrate-external-content.md`, `verify-arc-integrity.md`, and a future
  `switch-mode.md`) and session-work-adjacent helpers (`manage-incidental-work.md`, `maintain-project-docs.md`,
  `prepare-commits.md`). The split is implicit in the directory but not structurally expressed.

- _Possible cleanup:_ Create a sibling `installation/` directory, move the four framework-level workflows,
  leaving `supplemental/` cleanly session-adjacent. Atomic move of 4 files + reference updates in DEV-RULES.ARC
  and workflow cross-references. Cleanup-eligible any time.
