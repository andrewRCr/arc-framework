# Notes: Project State Integrity

Reference context for task generation and execution — implementation loci, verified evidence, and rationale
detail the spec summarizes.

## Implementation loci (verified 2026-07-08; paths re-verified at task generation)

All paths below are under `packages/arc-framework/`.

- **Branch-name identity mint + `plan/`-prefix phase proxy** (what the identity re-key replaces):
  `src/lib/git/in-flight-derivation.ts` `classifyBranch` (~line 186) — name parsed after the type prefix
  (~line 206), planning state from `PLANNING_BRANCH_PREFIX` (~line 212). Input set is remote-tracking refs
  only: `src/commands/active/in-flight.ts` sources branches from `resolveInFlightBranchSet` (~line 59); no
  local-branch input.
- **Silent degradation to wrong shapes**: `resolveWorktreePathsByBranch` failure returns an empty map
  (`src/lib/git/worktree-roster.ts` ~142–154) — every entry turns `remoteOnly` with no warning. The
  loud-degradation work starts here.
- **Path-equality self-exclusion**: `src/lib/git/foreign-artifact-detection.ts` ~101–106 and
  `src/scripts/check-foreign-writes.ts` ~103–106; `originatingMetaPath` is `undefined` exactly when
  `resolveActiveWu` cannot resolve (ceremony windows).
- **Fire-time probes**: `committedMatches` (diff `base...branch`, mutable base ref) and `uncommittedMatches`
  (`git status --porcelain` with `cwd` set to the sibling worktree) —
  `src/lib/git/foreign-artifact-detection.ts` ~132–172. The hook runs `localOnly: true`
  (`src/scripts/check-foreign-writes.ts` ~140), so commit-time detection never prunes.
- **Filesystem-free index construction**: `buildLifecycleIndexFromMetas`
  (`src/lib/work-unit/lifecycle-index.ts` ~231) — the union-fed construction the composer's dep resolution
  uses. An at-ref active meta resolves (`Planning`/`Active`, active) via `resolveLifecyclePosition` /
  `locationFromPath` and classifies pending, never `shipped` (`shipped` requires (`Shipped`, completed) per
  the lifecycle-resolver canonical map).
- **Errand identity source**: `errandSlugByBranch` option on `deriveInFlight` (~line 120), populated by
  `readErrandSlugByBranch` (`src/commands/active/in-flight.ts` ~60).
- **Existing regen triggers** (the tracked render's same-commit ceremony fire sites): the composer bindings
  at `src/lib/work-unit/executor-context.ts` ~263 (via `reconcileRoadmap`,
  `src/lib/work-unit/side-effects/readiness-regen.ts`) and `src/handlers/start.ts` ~579
  (`refreshRoadmapForStartCeremony`, which bypasses `reconcileRoadmap`).
- **Title read-back to retire**: `resolveTitle` (`src/lib/status/project-view.ts` ~159–168) — the only
  `ROADMAP.md` data read-back in `src/` (repo-grepped).
- **Pre-commit chain** (the regenerate-wins assert's home): `arc/system/.internal/githooks/pre-commit`
  (package source; syncs to the `.arc/` copy). CHECK 17 is the existing render-fields-without-regen nudge;
  CHECK 18 (`src/scripts/validate-cohort-consistency.ts`) is the blockable-check precedent; CHECK 19
  (`src/scripts/check-foreign-writes.ts`) is the advisory precedent.

## Live repro evidence — preserve until used

The stale `plan/burn-in-probe-a` branch on `origin` (with the WU's real `chore/burn-in-probe-a` checked out
locally, absent from the remote) is deliberately left in place as deterministic repro for the (A) work: it
exhibits both standing false facts (phantom remote-only materialize candidate; invisible local in-flight
worktree). Do not prune it during branch hygiene until the concurrency-harness work has used or fixture-ized
it. The wave-1 phantom-overlap signature: the detector's own probes return empty on re-run — transient truth,
unreproducible minutes later.

## Deferred design reckoning — parked-WU topology (recorded 2026-07-08)

Task generation ran a four-pass adversarial-review loop (task-audit rubric, full depth). Passes 1–3 plus
three pass-4 findings are folded into the suite; one pass-4 major is **deliberately deferred, not patched** —
it needs design consideration the draft/spec never gave it, and its cheap fix would deepen a derivation
`wu-lifecycle-state-model` may rework.

**The finding (verified against source).** park@Active leaves the WU's authoritative meta (`State: Active`,
matching `Branch`) on the preserved, pushed branch and writes a pointer record to
`.arc/backlog/planned/<name>/` that also stores the literal `State: Active` (`pointer-record.ts` ~53–65);
`parked` is derived from the `(Active, planned)` position (`lifecycle-resolver.ts` ~52), and today's composer
renders that pair as the Parked tier (`project-view.ts` ~247). The spec's § B composer precedence
(active-meta-at-a-known-ref > backlog stub) is stated unconditionally, so as designed the preserved branch's
at-ref meta would supersede the park pointer and every parked WU would render **In Flight** — a false-fact
class on the tier SC 2 protects. The oracle side inherits the same blindness: entry data alone cannot
distinguish parked from in-flight (both are Active metas at live refs), and the materialize surface would
offer a parked WU whose sanctioned verb is `arc resume` (pre-existing today). Related: `deactivate` /
`reopen` are shipped backward lifecycle edges the draft/spec also never weighed (their dedupe-ordering
consequence is already folded — ancestry-first — but their interaction with parked semantics is not).

**Proposed-but-deferred resolution (the cheap discriminator).** Precedence becomes state-aware: a backlog
record deriving `parked` (`(Active, planned)` via the lifecycle map Task 4.2 wires in) is authoritative over
the at-ref active meta; the In Flight supersede applies only to `planning`-derived stubs. Plus a materialize
parked-exclusion via the same index.

**Why deferred.** The discriminator reads truth off the exact `(State, location)` conflation — a stored
false `State: Active` disambiguated by directory — that `wu-lifecycle-state-model`'s two-axis reform exists
to unwind; parking is a scheduling-axis act under that model and may be re-modeled entirely. Parking and
backward transitions are built but never exercised, so the risk is latent, not live. Codifying the
discriminator now creates day-one reconciliation debt; deciding the topology fresh may instead yield an
interim park-record change, a different precedence model, or an explicit charter boundary deferring parked
semantics to WLSM.

**The reckoning (next session's resume point).** Give parked + backward transitions the design consideration
they never got — with `draft-wu-lifecycle-state-model.md` open beside the spec — and settle: (a) the
composer-precedence rule for park pointers; (b) whether the oracle roster carries parked WUs and how
consumers (materialize, foreign-write, views) treat them; (c) whether any interim park-model change is
warranted before WLSM. Then: fold the outcome into spec + tasks, re-run the final suite-coherence pass,
optionally run adversarial pass 5 (the agreed stopping check), and finalize
(`arc finalize generate-tasks --class Heavy` + ceremony commit). A coordination capture for WLSM's side of
the seam is in `USER-INBOX` (`WU_Target: wu-lifecycle-state-model`).

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
