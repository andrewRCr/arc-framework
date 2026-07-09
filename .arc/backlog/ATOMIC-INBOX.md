# Atomic Inbox

> _Project-shared queue of homeless atomic (single-step) items — single-step captures with no better home. Live
> capture in resolver-backed identity-global `user/{identity}/USER-INBOX.md` § Errand drains here via the
> `arc-housekeep` flow; items execute as-is and remove on completion. No work-unit stub passes through here: multi-step
> work always has a stub home, so it
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

### `[ ]` **Pin the two-copy parity of Framework hook recipes in tests**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-07-07) — homeless atomic, deferred; captured during
  PR #189 CodeRabbit review (compaction-recovery hook-resolution hardening errand).
- _Observation:_ `codex-cli.test.ts` reads only the authoritative
  `packages/arc-framework/arc/system/.internal/harness-hooks/codex-cli/hooks.json` copy (`hookRoot`), so the shipped
  `.arc/system/...` mirror can silently drift out of parity — no automated test catches a divergence between the two
  copies. The copies are currently byte-identical; the gap is the missing guard, not a live drift.
- _Approach:_ add a byte-for-byte parity assertion between the two copies to the harness-hooks unit suite — or, more
  broadly, a shared Framework-file two-copy parity check if other `.arc/**` mirrors share the same test-side
  exposure. Scope to whichever check is cheap and general.

### `[ ]` **Add progress feedback (spinners) to `arc start`'s slow legs**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-07-07) — self-contained UX, deferred; captured during
  `finalize-parallelism` wave-1 spawn, 2026-07-06 (perceived-hang observed live).
- _Observation:_ `arc start`'s spawn runs several multi-second legs silently between the clack intro and the final
  "Graduated" note — `git worktree add`, `post_create` provisioning (`npm install`), harness-dir copy, ROADMAP regen,
  ceremony commit + push. The handler uses only `p.intro` / `p.log` / `p.note` (no `p.spinner`), so it reads as a
  hang for several seconds.
- _Approach:_ Wrap each slow leg in a clack `p.spinner()` with a label ("Spawning worktree…", "Provisioning
  dependencies…", "Copying harness layer…", "Graduating…", "Committing & pushing…"). Generalize the pass to other
  long-running commands with the same silence (`materialize`, `sync`).
