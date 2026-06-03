# Atomic Inbox

> _Project-shared queue of homeless atomic (single-step) items — single-step captures with no better home. Live
> capture in `user/{identity}/USER-INBOX.md` § Atomic drains here via the `arc-housekeep` flow; items execute as-is and
> remove on completion. No work-unit stub passes through here: multi-step work always has a stub home, so it
> graduates to a `backlog/{planned,provisional}/<wu-name>/` stub and only genuinely homeless single-step items
> rest in this shared surface. See `strategy-planning-module.md` § Inbox Family._

## Inbox

### `[ ]` **Split `supplemental/` workflows into session-adjacent vs installation-level**

- _Observation:_ `.arc/system/workflows/arc/supplemental/` mixes two implicit categories: framework-level
  one-offs (`add-agent.md`, `integrate-external-content.md`, `verify-arc-integrity.md`, and a future
  `switch-mode.md`) and session-work-adjacent helpers (`manage-incidental-work.md`, `maintain-project-docs.md`,
  `prepare-commits.md`). The split is implicit in the directory but not structurally expressed.

- _Possible cleanup:_ Create a sibling `installation/` directory, move the four framework-level workflows,
  leaving `supplemental/` cleanly session-adjacent. Atomic move of 4 files + reference updates in DEV-RULES.ARC
  and workflow cross-references. Cleanup-eligible any time.
