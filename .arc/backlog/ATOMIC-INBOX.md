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

### `[ ]` **Remove the TS6 deprecation bridge before TypeScript 7**

- _Awaiting:_ `TypeScript 7 GA / decision to adopt` — blocked until the trigger; re-judge at a housekeep sweep or
  WU-init absorption ("trigger met → route/execute : keep waiting"), do not execute as-is. (`_Awaiting:_` is an
  interim hand-applied marker — formalization tracked in `draft-operational-state-docs.md`.)

- _Observation:_ the dependency-maintenance errand added `ignoreDeprecations: "6.0"` because TypeScript 6 flags
  `baseUrl` in the tsup declaration-build path, even though ARC's own tsconfig does not set `baseUrl`. TypeScript's
  TS6 guidance says the bridge will not carry into TypeScript 7.

- _Approach:_ before adopting TypeScript 7, upgrade or replace the declaration-build path so it no longer
  injects/depends on `baseUrl`, then remove `ignoreDeprecations: "6.0"`.

- _Captured during:_ dependency/audit follow-up errand (`USER-INBOX § Atomic`, 2026-06-05); re-homed to the shared
  inbox as a homeless, trigger-gated project concern.
