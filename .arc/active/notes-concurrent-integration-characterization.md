# Notes: concurrent-integration-characterization

- [Fixture inventory](#fixture-inventory)
- [Base-movement coverage by boundary](#base-movement-coverage-by-boundary)
- [Source loci by decision](#source-loci-by-decision)
- [Alternatives retired at design](#alternatives-retired-at-design)
- [Characterization ledger](#characterization-ledger)

## Fixture inventory

Reference material for task generation and execution: what the test suite already holds that the probes compose
over, recorded so grounding passes start from the inventory rather than re-deriving it. Verified 2026-09-14 against
the tree at this branch's base.

- **Real-CLI spawn and repository scaffolding** — `__tests__/e2e/helpers.ts` (`git`, `runArc`, `runArcAnchored`,
  `runArcAnchoredSequence` for multi-verb lifecycle chains, `createTempRepo`); `__tests__/e2e/global-setup.ts`
  builds the CLI once; `__tests__/helpers/temp-repo.ts`; `__tests__/helpers/prepared-repository.ts`
  (`prepareRepositoryTemplate` / `copyPreparedRepository`, a template with an origin already attached — the cheap
  base for every probe); `__tests__/helpers/integration.ts` (`initInTempRepo`, `makeCommit`, bare-remote attach).
- **Second-checkout primitives** — `__tests__/helpers/multi-clone.ts`: `setupMultiClone` (bare origin plus two
  clones with their own identities) and `setupWorktreeSiblings` (bare origin plus primary and sibling worktrees
  sharing one git common dir — the exact-target isolation simulator); `createManualStepBarrier` /
  `runControlledSteps` for deterministic interleavings.
- **Remote-base advance** — `__tests__/helpers/in-flight-reshuffle.ts` `advanceRemoteBranch({ branch, markerPath })`:
  temporary branch from `origin/<branch>`, one marker-file commit, push to `refs/heads/<branch>`, tracking refresh.
  Marker path only, disjoint only; the extension point for the D6 helper.
- **Hand-rolled base-advance idioms** (not migrated; listed so probes do not add a fourth): publisher clone commits
  and pushes (`e2e/base-drift.e2e.test.ts`, `base-merge.e2e.test.ts`, `base-sync.e2e.test.ts`,
  `sync-purity.e2e.test.ts`); forged `refs/remotes/origin/main` with local `main` pinned back
  (`e2e/candidate-applicability.e2e.test.ts`, `helpers/candidate-lineage-suite.ts`); `commit-tree` plus push of a
  detached base (`e2e/errand.e2e.test.ts`).
- **True-race harness** — `__tests__/e2e/race-worker.ts` / `true-race.ts`: real multi-process racing over a file
  barrier; guards are `machine-id`, `sync-state`, `errand`, `notes` only, never the base. Out of scope for probes
  (D8 cost ceiling).
- **Hosted-review seam** — `__tests__/integration/review-fan-out-lifecycle.test.ts` runs hosted request, await, and
  settle without a provider by passing `request` and `observers` functions into the handlers; review status derives
  `base-moved` from the injected observation's containment fact (`src/scripts/review-gate/status.ts`). The
  `hosts/local/` directory holds record stores and materialization, not a host adapter; `hosts/github/` holds the
  provider-bound request, checks-await, merge-lock, and merge-method adapters.
- **Worktree evidence vocabulary** — `__tests__/helpers/worktree-evidence.ts` (`exact` | `not-applicable`).

## Base-movement coverage by boundary

What each existing test actually exercises, and the gap the probe at that boundary closes.

- **Standalone drift and merge probes** — `e2e/base-drift.e2e.test.ts` (disjoint publisher advance, `reconcile`
  verdict, typed `unavailable` when origin is removed); `e2e/base-merge.e2e.test.ts` (refuses a moved checkpoint
  head, no-ops when contained, appends the approved base as a merge); `e2e/base-sync.e2e.test.ts` (local base
  fast-forward from a linked worktree).
- **Candidate applicability** — `e2e/candidate-applicability.e2e.test.ts` (forged advance plus conflicted merge,
  owned selection, foreign-owner refusal, a second worktree carrier); `integration/candidate-applicability.test.ts`
  (typed movement during a staged-current projection); `helpers/candidate-lineage-suite.ts` (carried Candidate after
  a real overlapping move; settlement bound to the checkpoint-validated base after the ref moves; fail-closed on
  final drift).
- **Prepublication** — `e2e/publication-spine.e2e.test.ts` moves only the head (operational commits, responses,
  re-attestation) against an offline origin; the base never moves. Gap: the settle-to-submit window.
- **Public review** — `integration/frontline-target-materialization.test.ts` and
  `local-review-materialization.test.ts` move the caller branch under a pinned target; `origin/main` never moves.
- **Landing** — `e2e/delivery-terminal-recovery.e2e.test.ts` covers unavailable fresh base, substantive movement past
  a settled record-only terminal, and a native landing settled after the target advances; nothing moves the base
  between landing readiness and merge.
- **Closeout** — `integration/teardown.test.ts` rolls the local base behind an advanced `origin/main` to prove the
  reap refetches; the only post-landing base-movement case in the suite. `e2e/teardown.e2e.test.ts` and
  `e2e/lifecycle-exit.e2e.test.ts` have none.
- **Errand** — `e2e/errand.e2e.test.ts` cuts a warm continuation from a freshly advanced remote base at `open`; close
  and review-respond never see a base advance.
- **Exact-target isolation** — `e2e/wu-reconcile.e2e.test.ts` leaves another worktree byte-identical until its own
  reconcile ceremony; `integration/local-review-materialization.test.ts` and
  `frontline-target-materialization.test.ts` pin an exact target while the caller branch moves.
- **Unknown movement** — tested only as a static precondition (`base-drift.e2e.test.ts`,
  `session-init-remote-boundary.e2e.test.ts`, `delivery-terminal-recovery.e2e.test.ts`), never as evidence that
  goes unavailable mid-boundary.

## Source loci by decision

- **Movement classification** — `src/lib/git/base-distance.ts` (verdict authority: `clean` / `reconcile` /
  `unavailable` from raw behind-count, enriched with integration and overlap evidence); `src/lib/git/base-overlap.ts`
  (rename-conservative changed-path intersection partitioned into `substantivePaths` and `regenerablePaths`; unit
  coverage in `__tests__/unit/git/base-overlap.test.ts`); `src/lib/git/base-integration-evidence.ts`;
  `src/lib/git/base-branch-sync.ts`; `src/lib/git/base-sync.ts`; `src/lib/git/refresh-base.ts` (post-merge base ref
  resolution composed by teardown and errand close).
- **Candidate applicability** — `src/lib/work-unit/candidate-applicability.ts`,
  `git-candidate-applicability.ts` (reads `refs/remotes/origin/main` via `for-each-ref`),
  `candidate-applicability-resolution.ts`, `candidate-effective-target.ts`.
- **Review applicability** — `src/scripts/review-gate/policy/review-contribution-applicability.ts`,
  `git-review-contribution-applicability.ts`, `review-applicability-resolution.ts`, `review-applicability-authority.ts`,
  `earlier-review-applicability.ts`, `integration-boundary-locus.ts`.
- **Landing** — `src/scripts/review-gate/delivery-landing-readiness.ts`, `policy/delivery-review-terminus.ts`.
- **Session orientation** — `src/lib/session-init/delivery-position.ts`, `delivery-position-facts.ts` (where
  `baseDistance` and `baseBranchSync` surface to the agent).
- **Test cost** — `test-cost-budgets.json` (advisory, ten percent allowance over baseline, hand-refreshed in
  `perf(test-cost)` commits); `src/scripts/report-test-budget.ts` (CI summary when exceeded);
  `npm run benchmark:test-cost` and `benchmark:test-cost:compare`.
- **Verification seam** — `verify-work-unit.md` invokes exactly one typed verb, `arc attest`; the attestation binds
  the work unit's own subject digest and is expected to tolerate base movement.

## Alternatives retired at design

- **`test.fails` markers** — rejected: the runner converts every non-pass state to pass, so a marked probe cannot
  distinguish failing at the target from failing for any reason. Replaced by the pin-with-target helper (D1).
- **`todo` / skipped cases plus a prose ledger** — nothing arms.
- **A probe runner outside CI that emits a ledger** — new machinery with nothing enforced at the fix.
- **Exhaustive state cross-product** — obscures the ordinary concurrency path and outgrows the fixes it routes.
- **Live-provider harness** — external variability before the local boundary is understood; a recorded non-goal.
- **Merge queue** — a recorded non-goal in three places; not the remedy for ARC-only re-ceremony.
- **Fixing in place** — re-creates the piecemeal-patch pattern the charter names.
- **Characterizing by reading code** — finds what the code says, not what the lifecycle does across checkouts; its
  bounded use produced the coverage table above.

## Characterization ledger

One row per probe, appended during execution (D4). Columns: boundary · movement kind · shape · test name · base OID
observed against · observed typed result (reason, remedy) · verb invocations · approval stops · recommendation-bearing
or bare · classification (`tolerates` / `redundant ceremony` / `mechanical block` / `fail-closed, correct`) · owner ·
fix disposition at close · retention disposition at close (D9).

_No rows yet._
