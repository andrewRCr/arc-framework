# Notes: Project State Integrity

Reference context for task generation and execution — implementation loci, verified evidence, and rationale
detail the spec summarizes.

## Implementation loci (verified 2026-07-08)

- **Branch-name identity mint + `plan/`-prefix phase proxy** (what the identity re-key replaces):
  `in-flight-derivation.ts` `classifyBranch` — name parsed after the type prefix (~line 205), planning state
  from `PLANNING_BRANCH_PREFIX` (~line 212). Input set is remote-tracking refs only: `commands/active/in-flight.ts`
  sources branches from `resolveInFlightBranchSet` (~line 59); no local-branch input.
- **Silent degradation to wrong shapes**: `resolveWorktreePathsByBranch` failure returns an empty map
  (`worktree-roster.ts` ~142–148) — every entry turns `remoteOnly` with no warning. The loud-degradation work
  starts here.
- **Path-equality self-exclusion**: `foreign-artifact-detection.ts` ~101–106 and `check-foreign-writes.ts`
  ~103–106; `originatingMetaPath` is `undefined` exactly when `resolveActiveWu` cannot resolve (ceremony
  windows).
- **Fire-time probes**: `committedMatches` (diff `base...branch`, mutable base ref) and `uncommittedMatches`
  (`git status --porcelain` with `cwd` set to the sibling worktree) — `foreign-artifact-detection.ts` ~132–172.
  The hook runs `localOnly: true` (`check-foreign-writes.ts` ~140), so commit-time detection never prunes.
- **Filesystem-free index construction**: `buildLifecycleIndexFromMetas` (`lifecycle-index.ts` ~231) — the
  union-fed construction the composer's dep resolution uses. An at-ref active meta resolves
  (`Planning`/`Active`, active) via `resolveLifecyclePosition` / `locationFromPath` and classifies pending,
  never `shipped` (`shipped` requires (`Shipped`, completed) per the lifecycle-resolver canonical map).
- **Errand identity source**: `errandSlugByBranch` option on `deriveInFlight` (~line 120), populated by
  `readErrandSlugByBranch` (`commands/active/in-flight.ts` ~60).
- **Existing regen triggers** (the tracked render's same-commit ceremony fire sites):
  `side-effects/readiness-regen.ts`; `handlers/start.ts` `stagePaths`.
- **Title read-back to retire**: `resolveTitle` (`project-view.ts` ~159–168) — the only `ROADMAP.md` data
  read-back in `src/` (repo-grepped).

## Live repro evidence — preserve until used

The stale `plan/burn-in-probe-a` branch on `origin` (with the WU's real `chore/burn-in-probe-a` checked out
locally, absent from the remote) is deliberately left in place as deterministic repro for the (A) work: it
exhibits both standing false facts (phantom remote-only materialize candidate; invisible local in-flight
worktree). Do not prune it during branch hygiene until the concurrency-harness work has used or fixture-ized
it. The wave-1 phantom-overlap signature: the detector's own probes return empty on re-run — transient truth,
unreproducible minutes later.

## Rationale detail

- **Why a hook assert, not a git merge driver**: a merge driver cannot ship purely via the repo (requires
  per-clone config), so regenerate-wins enforcement is convention + pre-commit assert.
- **ADR-022 §8 interim**: the tracked render is the "derived → tracked + regeneratable" interim tier; under
  the git-backing-store target the source resolution swaps to the backing store and the in-flight supersede
  tier *dissolves* (graduation stops being branch-local; one record per WU) — scaffolding that dissolves
  rather than reshapes. The sink swap (tracked-commit → materialized-write) leaves the render layer unchanged.
- **CSA sequencing**: `cli-substrate-adoption` would supply the zod meta-frontmatter schema for typed parsing;
  a hand-rolled parser is acceptable to land earlier — the schema swap is contained to the record-model
  boundary.
