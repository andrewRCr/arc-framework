# Atomic Inbox

> _Project-shared queue of homeless atomic (single-step) items — single-step captures with no better home. Live
> capture in resolver-backed identity-global `user/{identity}/USER-INBOX.md` § Errand drains here via the
> `arc-housekeep` flow; items execute as-is and remove on completion. No work-unit stub passes through here: multi-step
> work always has a stub home, so it
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

### `[ ]` **Migrate the toolchain to TypeScript 7 when the 7.1-era ecosystem lands**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-07-18) — condition-gated atomic, deferred; captured
  during post-handoff TS 7 evaluation discussion, 2026-07-18.
- _Awaiting:_ all three — (1) TS 7.1 stable programmatic API (~Oct 2026 on cadence); (2) typescript-eslint TS 7
  support (their tsgolint PoC → Oxlint's `oxlint-tsgolint` is an alternative lint stack if ever re-evaluated);
  (3) tsup `.d.ts` emit against 7.
- _Observation:_ TS 7.0 went GA 2026-07-08 — Go-native compiler, ~8–12x faster full builds, type-checking
  semantics structurally identical to 6.0. Not adoptable here yet: 7.0 ships no stable programmatic API, and two
  zero-tolerance gates embed that API — `lint:ts` (typescript-eslint `recommended-type-checked`, does not work
  with tsgo) and tsup's `.d.ts` emit. Vitest and tsx transpile via esbuild and are unaffected. Payoff modest at
  this scale (typecheck runs in seconds); not worth dual-compiler complexity today.
- _Observation:_ infra smell — touches quality-gate configs across both copies' docs; likely the reviewed lane.
- _Approach:_ when all three land, the bump should be near-mechanical (identical checker semantics). Interim
  escape hatch if typecheck time matters sooner: side-by-side `typescript@7` for `tsc` +
  `@typescript/typescript6` pinned for ESLint. Coordinate with the `cli-substrate-adoption` kernel buffer note
  (Zod-first inversion) so the kernel never needs the compiler API at all.
