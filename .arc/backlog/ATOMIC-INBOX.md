# Atomic Inbox

> _Project-shared queue of homeless atomic (single-step) items — single-step captures with no better home. Live
> capture in `user/{identity}/USER-INBOX.md` § Errand drains here via the `arc-housekeep` flow; items execute as-is and
> remove on completion. No work-unit stub passes through here: multi-step work always has a stub home, so it
> graduates to a `backlog/{planned,provisional}/<wu-name>/` stub and only genuinely homeless single-step items
> rest in this shared surface. See `strategy-planning-module.md` § Inbox Family._

## Inbox

### `[ ]` **Return protection mode from housekeep write-context checks**

- _Routed from:_ `USER-INBOX § Atomic`, housekeep drain (2026-06-14); captured during between-WUs handoff /
  housekeep after PR #99 (`lifecycle-state-resolver`) merge cleanup.
- _Observation:_ `npx arc housekeep check --json` returned `verdict: proceed` on `main` with `baseBranch: main`,
  but omitted the resolved project `branch.protection`. The drain workflow's next write-mechanics branch depends
  on `full` vs. `partial`, so the missing field pushed the agent into re-probing weaker surfaces (`git config`,
  broad grep, code defaults) before reading `.arc/system/arc-config.yml`.
- _Approach:_ Extend the write-context check envelope, at least for `arc housekeep check --json`, with the
  caller-resolved protection mode from config, for example `branchProtection: "full" | "partial"`. Consider the
  same field for shared write-context/check primitives whose consumers immediately branch on protection mode.
  Update human copy/tests so `verdict: proceed` cannot be mistaken for "direct base write is allowed."
- _Files:_ `packages/arc-framework/src/handlers/housekeep.ts`,
  `packages/arc-framework/src/lib/git/write-context.ts`, housekeep/write-context tests, and `drain-inbox.md` if
  the workflow should name the returned field.

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
