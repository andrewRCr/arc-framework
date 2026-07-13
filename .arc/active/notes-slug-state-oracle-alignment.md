# Notes: slug-state-oracle-alignment

Reference material for task generation and execution — source anchors, reproduction recipes, and
coordination constraints backing `spec-slug-state-oracle-alignment.md`.

## Problem 1 — blast radius of the checkout-local resolver (source anchors)

Consumers of `buildLifecycleIndex` truth, from source:

1. **Agent doctrine points at the blind surface.** DEV-RULES.ARC § Verify before assuming names
   `arc status <slug>` as *the* lifecycle resolver, and session-init's `--start` focused-recon arm resolves
   Tier-1 dependency edges through it. Any agent operating outside a WU's own worktree inherits the false facts.
2. **`arc start` dispatch — the sharp edge.** `resolveStartDispatch` (`commands/start.ts`) routes `planned` →
   graduate and `nonexistent` → create-new; both mint. The refuse arms (`planning` / `active` / `integrating`)
   cannot fire from a stale index, and the foot-gun guards (`lifecycle-guards.ts`) check only the current
   checkout's `active/`.
3. **Dep-edge reads.** `dischargeDepEdges` (satisfied at `landed ∨ integrating`,
   `lib/work-unit/side-effects/discharge-dep-edges.ts`) and `buildReadyMineSlice` (deps-shipped filter,
   `lib/status/ready-mine.ts`) read stale for edges onto in-flight siblings — an `integrating` dep reads
   `planned`. Conservative-wrong (under-reports readiness, never over-reports).
4. **`occupied` reporting.** No code consumer beyond the query surface today (`isOccupied`,
   `lib/work-unit/lifecycle-resolver.ts`), but agents read it; a false-negative occupancy invites the
   double-mint in (2).

Live observation (2026-07-09): both wave-1 probes integration-ready, yet `arc status burn-in-probe-a` / `-b`
from FP's worktree reported `planned · Planning · occupied: false` while `arc status --project` in the same
checkout rendered both `Active`.

## Problem 2 — reproduction anchors and candidate channels

- **Forward direction:** FP's own-artifact commit `4c05c455` flagged FP-side files as probe overlaps.
- **Behind-base direction:** probes lagging `main` flagged ~20 backlog drafts they never authored
  (2026-07-09 cascade). Cheap induction: hold local `main` behind while a sibling merges `origin/main`, then
  commit against a target path — the stale-local-base channel.
- **Code read (2026-07-09):** the committed probe is already three-dot with SHAs frozen up-front
  (`committedMatches`, `lib/git/foreign-artifact-detection.ts`), so the defect enters through what feeds the
  primitive. Candidate channels: candidate branch/SHA pairs from the in-flight roster snapshot; stale
  remote-tracking or shadow refs resolved as candidates; the `baseSha` fallback; the uncommitted-status probe;
  local-base-ref staleness (`check-foreign-writes.ts` passes `branch.base`, resolved locally — never
  `origin/<base>`), which puts merge-base at the old fork point and lists every base-side change a candidate
  merged. Consistent with "went clean once the probes were current."
- Distinct from the 2026-07-06 phantom-meta roster misfire (fixed by `project-state-integrity`).

## Decision 1 — oracle mechanics (source anchors)

- Candidate set: `resolveInFlightBranchSetFromLocalRefs` (`lib/git/remote-ref-reader.ts`) — local
  remote-tracking refs ∩ live membership; live mode prunes, never expands. `resolveInFlightBranchSet` returns
  `liveRefs` + `reachable` with completeness-keyed degradation (partial parse → local snapshot).
- `fetchRefBounded` (same module) is the unwired expansion primitive: bounded fetch landing the tip at
  `FETCH_HEAD`; `readMetaAtRef` reads the meta there.
- Degraded-entry drop stages the composed helper must surface around: `inFlightEntryToCandidate`
  (`lib/status/project-view.ts`) nulls unknown-state entries; `buildLifecycleIndexFromRecords`
  (`lib/work-unit/lifecycle-index.ts`) skips unknown-state records.

## Decision 6 — prospective-render mechanics (source anchors)

During the archive-commit window the checked-out branch contributes two oracle candidates — its worktree local
head and its remote-tracking twin `origin/<branch>`, both at the pre-commit tip; `dedupeWorkUnitCandidates` /
`candidateSourceRank` (`lib/git/in-flight-derivation.ts`) collapse them per-WU. `mergeProjectReadinessRecords`
ranks active over completed, which is why the staged `Shipped` record loses today. The prospective override
must therefore substitute for *both* ref forms of the current branch. Hook + CLI parity is by construction via
the shared render in `lib/status/roadmap-regeneration-assert.ts` (`arc status --project --staged`).

## Execution constraints

- **Launch mode:** code WU — run `--here` in the primary worktree per the standing spawned-code-WU caveat
  (wave 2 is what blesses spawned code worktrees for quality gates).
- **Sequencing / coordination:** land on `main` before `finalize-parallelism` wave 2 — the waves consume these
  surfaces. FP merges the fix in; FP wave-1 cell 3.2.e induces the behind-base foreign-write case, and wave 2
  verifies both halves under live concurrency.
- Origin mechanism and source anchors for the founding defect: `notes-finalize-parallelism.md` § Dogfood
  finding (2026-07-09) — slug-state surfaces are checkout-local.
