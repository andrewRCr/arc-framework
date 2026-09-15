# Notes: concurrent-integration-characterization

- [Fixture inventory](#fixture-inventory)
- [Base-movement coverage by boundary](#base-movement-coverage-by-boundary)
- [Source loci by decision](#source-loci-by-decision)
- [Alternatives retired at design](#alternatives-retired-at-design)
- [Cell matrix](#cell-matrix)
- [Pre-probe cost baseline](#pre-probe-cost-baseline)
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
- **Lane reach of the advance helper** — `multi-clone.ts` imports nothing from `src/` and is already imported by
  three e2e files, so its topologies reach both lanes as they stand. `in-flight-reshuffle.ts` does not: it takes one
  value import from `src/` (`renderMetaProjectionFile`) and builds its execs through `integration.ts`'s
  `makeGitExec`, which carries about ten more. An e2e probe needs neither — it spawns the CLI rather than injecting
  an exec, and `arc start` writes the meta itself. The `src`-free topology and advance steps are therefore separable
  from the integration-lane conveniences wrapped around them. Note the "e2e imports only node builtins" line in
  `e2e/helpers.ts` is convention rather than an enforced boundary: `helpers/test-cost-timeout.ts` takes a value
  import from `src/lib/test-cost/metrics.js` and is imported from the e2e lane today.
- **Hand-rolled base-advance idioms** (not migrated; listed so probes do not add a fourth): publisher clone commits
  and pushes (`e2e/base-drift.e2e.test.ts`, `base-merge.e2e.test.ts`, `base-sync.e2e.test.ts`,
  `sync-purity.e2e.test.ts`); forged `refs/remotes/origin/main` with local `main` pinned back
  (`e2e/candidate-applicability.e2e.test.ts`, `helpers/candidate-lineage-suite.ts`); `commit-tree` plus push of a
  detached base (`e2e/errand.e2e.test.ts`).
- **Mid-process failure injection, by lane** — in-process callers wrap a `GitExec` with
  `withGitCallBoundaryInjections` (`__tests__/helpers/in-flight-reshuffle.ts`), which fires before or after a
  matched call; a spawned verb cannot be reached that way. The spawned lane's equivalent is a `PATH` shim:
  `__tests__/helpers/delivery-position-suite.ts` writes a `git` wrapper that alters one behavior under an
  environment flag and otherwise execs the real binary, and the same file plus `e2e/delivery-plan.e2e.test.ts` and
  `delivery-authoring.e2e.test.ts` use a fake host binary the same way. This is the only route by which a remote
  read can **go** unavailable mid-boundary in the spawned lane.
- **URL-rewrite origin idiom** — `__tests__/helpers/delivery-position-suite.ts` attaches a bare remote, then sets
  `url.<bare-path>.insteadOf` a host-shaped URL and points `origin` at that URL. The result parses as an
  owner-and-repository coordinate for resolvers that need one while still pushing and fetching against a local
  bare repository — the way to give a fixture a live base without discarding a host-shaped origin it depends on.
- **True-race harness** — `__tests__/e2e/race-worker.ts` / `true-race.ts`: real multi-process racing over a file
  barrier; guards are `machine-id`, `sync-state`, `errand`, `notes` only, never the base. Out of scope for probes
  (D8 cost ceiling).
- **Hosted-review seam** — `__tests__/integration/review-fan-out-lifecycle.test.ts` runs hosted request, await, and
  settle without a provider by passing `request` and `observers` functions into the handlers; review status derives
  `base-moved` from the observation's containment fact (`src/scripts/review-gate/status.ts`). Two instruments reach
  this boundary and they observe different things: injecting `observers` supplies the containment fact directly, so
  the base read never runs, while the status port the production handler composes is exported and takes an
  injectable exec — driving that runs the real fetch-and-contain read and is the only way an unavailable base read
  can be observed here. The same file already drives production compositions through a fake host. The
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
  resolution; its only importers are `src/lib/work-unit/verbs/teardown.ts` and `src/handlers/start.ts`). Two
  neighbours look like consumers and are not: the base-merge script defines its own inline refresh port method
  rather than importing the module, and Errand close pins a remote base head through `pinRemoteBaseHead` in
  `src/lib/errand/identity-claims.ts`, composed by `close-runtime.ts` and `partial-settle-runtime.ts`.
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

## Cell matrix

Enumerated at task generation from D3. Applicability is deliberately **not** settled here: the first task confirms
each boundary's typed seam against source and records every not-applicable cell with its reason. Cells are cited by
their boundary × movement kind × shape tuple; they carry no identifier, and nothing in this section may reach a test
name (D1 — names and messages describe behavior only).

Each boundary below contributes five singleton cells: the four movement kinds plus one no-movement control row.
The movement kinds are `disjoint`, `overlapping-substantive`, `overlapping-regenerable-only`, and `unknown` — the
last being remote evidence that **goes** unavailable at the boundary, not a static precondition.

A movement kind is a property of the **intersection** of the branch's own diff with the base's, not of the advance
alone: the shipped analyzer diffs `merge-base..HEAD` against `merge-base..<base>`, partitions what both touched, and
short-circuits to an empty result whenever the branch is not both ahead and behind. The partition has three
outcomes rather than two — `reviewable` paths become substantive, `.arc/backlog/ROADMAP.md` is the one path treated
as regenerable, and evidence-neutral paths (a work unit's own artifacts, its candidate record under
`.arc/system/.internal/candidates/`, its submission boundary) are dropped from the overlap entirely. An advance that
intersects only evidence-neutral paths therefore reads identically to one that intersects nothing; `disjoint` means
no intersection at all.

### Singleton shape — 6 boundaries × 5 cells = 30

| Boundary                     | Typed seam                                                      | Lane        | Nearest extendable test                        |
| ---------------------------- | --------------------------------------------------------------- | ----------- | ---------------------------------------------- |
| Whole-work-unit verification | `arc attest`                                                    | e2e         | `e2e/attest.e2e.test.ts`                       |
| Candidate / prepublication   | `arc review pre-publication`, the publication transition        | e2e         | `e2e/publication-spine.e2e.test.ts`            |
| Public review and checks     | `arc review status`, the hosted request and await handlers      | integration | `integration/review-fan-out-lifecycle.test.ts` |
| Member / singleton landing   | `arc integrate checkpoint` / `merge`, the delivery landing path | e2e         | `e2e/delivery-terminal-recovery.e2e.test.ts`   |
| Post-landing closeout        | `arc teardown`, archival                                        | e2e         | `e2e/teardown.e2e.test.ts`                     |
| Errand review / merge        | `arc errand close`, the Errand's typed merge lane               | e2e         | `e2e/errand.e2e.test.ts`                       |

Public review is the one integration-lane boundary: a spawned CLI cannot reach the seam its existing tests use,
which inject the request and observer functions into the handlers. Its probes do not extend those tests. Injecting
an observation is what makes the containment fact a value the test chose, so the probes drive the production status
port instead, over a work unit whose branch is an ordinary one and whose publication reserved no hosted review —
the shape that leaves the moved-base arm reachable rather than decided by a conjunction. The port reaches the host
through the same injected exec it uses for Git, except for required checks, which resolve through the process
runner; a stub host on `PATH` covers both. That fixture lives in `integration/review-status-base-movement.test.ts`
and is where this boundary's remaining cells belong.

### Delivery-member shape — 7 cells

| Boundary                   | Cells                                      | Why this coverage                            |
| -------------------------- | ------------------------------------------ | -------------------------------------------- |
| Member / singleton landing | all four movement kinds plus a control row | the delivery path decides admissibility here |
| Candidate / prepublication | `disjoint` only                            | the path only re-observes                    |
| Post-landing closeout      | `disjoint` only                            | the path only re-observes                    |

### Exact-target read isolation — 3 cells

Not a boundary. One family in the integration lane on the worktree-siblings helper, where two checkouts share one
git common dir. The first two are live field classes — three sibling checkouts' Candidate records were unreadable
under this build's schema at this work unit's first session-init.

- A sibling checkout whose build cannot parse this checkout's records.
- A foreign owner's Candidate record in the shared namespace.
- A sibling left byte-identical after this checkout's reconcile.

### Control rows and excess

One no-movement probe per boundary. A movement row's **excess** is its verb invocations and approval stops minus
the control row's; the idiomatic excess is zero. The control row's own count is the ceremony baseline, and
non-concurrency excess in it is routed, never fixed here. Probes assert typed outcomes only — never counts; counts
are ledger observations taken from the probe's run, so deleting a control row under D9 breaks no retained probe.

### Covered input

D3 names the covered input per ceremony, which is what decides whether a repeat is justified: quality gates, the
tree they ran over; attestation and verification currentness, the work unit's own subject digest; review clearance,
the exact reviewed head and reviewed path set; checkpoint, the Candidate head and observed base relation; approval,
the exact head it was given on. Which of these each boundary actually reads is confirmed against its typed seam at
the first task, not assumed from this list.

### Ceiling

Thirty singleton and Errand cells, seven delivery-member cells, three isolation cells — forty before
not-applicable verdicts. Cells at which the boundary never reads the base become not-applicable ledger rows rather
than probes. There is no exhaustive state cross-product.

### Seam verdicts

Confirmed against each boundary's typed seam on this branch's base. Every verdict is a source read at the seam: it
decides what is worth probing and never stands in for the observation. A cell closes `not-applicable` only on
positive evidence that the boundary's own typed result would be identical to one already recorded at that
boundary. Where the source read leaves the question open, the cell stays applicable — absence of evidence for a
collapse is not evidence of one.

Two facts recur and are stated once rather than per boundary:

- **A `local-only` base read cannot produce `unknown`.** The Candidate seam resolves its base coordinate from the
  already-materialized `refs/remotes/origin/<base>` through `for-each-ref`, falling back to the local `<base>`
  branch, and every invocation on that path carries `objectAccess: "local-only"`. Nothing on it fetches, so remote
  evidence has no opportunity to go unavailable mid-boundary. An absent remote-tracking ref is a static
  precondition, which the design already excludes from `unknown`.
- **A merge-base coordinate absorbs every advance.** `collectGitCandidateTarget` diffs the index against
  `merge-base(HEAD, <base>)` (`src/lib/work-unit/git-candidate-subject.ts`). A base advance descends from the fork
  point, so the merge base is unmoved and the subject stays byte-identical whatever the advance touched. This is
  the amendment's first prompt, now confirmed at the seam.

#### Whole-work-unit verification — `arc attest`

`verify-work-unit.md` invokes exactly one typed verb. Its `blocked / establish-new-root` continuation is the same
verb with `--new-root`, the `self-review` method invokes none, and the delivery-member scale step inspects results
already recorded rather than issuing a verb. Nothing else in the workflow reads the base.

Covered inputs the seam consumes: the staged subject digest, the canonical task list (readable, structurally
valid, closed on `no-open-task`), the index itself (unstaged reviewable content refuses), and — only while
`Integrating` or `Shipped` — delivery Candidate renewal evidence, which performs no base read of its own. The
subject digest is the only one of these derived from the base.

| Cell                           | Verdict        | Reason / probe intent                                        |
| ------------------------------ | -------------- | ------------------------------------------------------------ |
| control (no movement)          | applicable     | ceremony baseline for this boundary's excess                 |
| `disjoint`                     | applicable     | the boundary's one real probe: advance, then attest          |
| `overlapping-substantive`      | not-applicable | no overlap classification on this path; merge base unmoved   |
| `overlapping-regenerable-only` | not-applicable | same seam, same byte-identical subject                       |
| `unknown`                      | not-applicable | the seam performs no remote read; nothing can go unavailable |

One window does discriminate, and it is not a movement kind: on the convergence arm (a Candidate record already
exists), `projectGitCandidateEffectiveTarget` re-reads the base ref inside the invocation and returns
`rerun-checkpoint / base-moved` when it changed between the two reads. That requires the local remote-tracking ref
to move _mid-verb_, reachable only through an injected exec or a `PATH` shim. Recorded here; whether it earns a
probe is Phase 3's call.

#### Candidate and private-delivery prepublication — `arc review pre-publication`, the publication transition

`handleReviewPrePublication` reads the Candidate through `projectGitCandidateEffectiveTarget` — the same
`local-only` seam as `arc attest`. `arc publish` performs no base read at all; the publication transition writes
the durable boundary the prepublication settle point already composed.

| Cell                           | Verdict        | Reason / probe intent                                        |
| ------------------------------ | -------------- | ------------------------------------------------------------ |
| control (no movement)          | applicable     | ceremony baseline                                            |
| `disjoint`                     | applicable     | the real probe, across the settle-to-submit window           |
| `overlapping-substantive`      | not-applicable | identical to `disjoint`; merge base unmoved, no overlap read |
| `overlapping-regenerable-only` | not-applicable | same                                                         |
| `unknown`                      | not-applicable | no remote read on this path                                  |

#### Public review and checks — `arc review status`, the hosted request and await handlers

This is the one boundary that fetches. `readBasePosition` in `status-composition.ts` runs `git fetch <remote>
<base>`, resolves `refs/remotes/<remote>/<base>`, and derives `baseContained` from
`merge-base --is-ancestor <base> <head>`. `resolveReviewStatus` returns `base-moved / rerun-checkpoint` on
`!baseContained` with a non-null base OID, and that arm sits **ahead of** every applicability arm, so a moved base
short-circuits before any overlap classification is consulted.

Instrument, settled here: drive `createReviewStatusPort` with an injectable exec. It is the production composition
and no test drives it today. Injecting `observers` supplies the containment fact directly and the base read never
runs. One caveat the probe must respect: `observe`'s catch collapses _every_ error into
`currentBaseOid: null` plus a blocked obligation, so only the `fetch <remote> <base>` call may be failed if
`unknown` is to be attributed to the base read rather than to `gh`.

| Cell                           | Verdict        | Reason / probe intent                                         |
| ------------------------------ | -------------- | ------------------------------------------------------------- |
| control (no movement)          | applicable     | ceremony baseline; base contained                             |
| `disjoint`                     | applicable     | `base-moved / rerun-checkpoint`                               |
| `overlapping-substantive`      | not-applicable | `baseContained` is pure ancestry; the kind is never consulted |
| `overlapping-regenerable-only` | not-applicable | same                                                          |
| `unknown`                      | applicable     | null base OID → `blocked / status-unavailable`, distinct      |

#### Member and singleton landing — `arc integrate checkpoint` / `merge`, the delivery landing path

Two base-read windows, and they discriminate differently. The **checkpoint** window runs `runBaseDrift` in
`authoritative` mode: a real fetch, then `behind > 0` ⇒ `verdict: reconcile` carrying the overlap partition.
`reconcileSafety` gates on `substantivePaths.length === 0` (unless the delivery arm supplies
`residual-contained`), and the emitted payload carries both `substantivePaths` and `regenerablePaths`. The
**merge** window (`readFinalDrift`) reads `verdict` alone and emits `invalidated / drift-reconcile` with a
`{ verdict }` payload, so the three overlap kinds are indistinguishable there.

Cells are therefore placed at the window that can tell them apart, and the merge window carries the movement the
design named as uncovered — nothing in the suite moves the base between landing readiness and merge.

| Cell                           | Verdict    | Window · reason / probe intent                                   |
| ------------------------------ | ---------- | ---------------------------------------------------------------- |
| control (no movement)          | applicable | clean checkpoint-to-merge span; ceremony baseline                |
| `disjoint`                     | applicable | merge · `invalidated / drift-reconcile`, `verdict: reconcile`    |
| `overlapping-substantive`      | applicable | checkpoint · `blocked / unsafe-reconcile`                        |
| `overlapping-regenerable-only` | applicable | checkpoint · `reconcile / reconcile-base`, regenerable non-empty |
| `unknown`                      | applicable | checkpoint · `blocked / drift-unavailable`                       |

#### Post-landing closeout — `arc teardown`, archival

Archival performs no base read; `arc teardown` carries the boundary alone. Under `full` protection
`resolveParkProofTarget` fetches `origin/<base>` and a failure returns `rejected` naming the unresolvable
lifecycle authority ref; the fetched head is then the ref the completed-index membership of _this_ work unit is
read from. The separate `refreshBase` leg is best-effort and falls back to the local base silently, so an
unavailable base read is observable only through the proof-target leg.

| Cell                           | Verdict        | Reason / probe intent                                          |
| ------------------------------ | -------------- | -------------------------------------------------------------- |
| control (no movement)          | applicable     | ceremony baseline                                              |
| `disjoint`                     | applicable     | the real probe: the reap refetches and sees this WU's archival |
| `overlapping-substantive`      | not-applicable | no overlap read; the verdict turns on this WU's own membership |
| `overlapping-regenerable-only` | not-applicable | same                                                           |
| `unknown`                      | applicable     | fetch failure → `rejected`, authority ref unresolvable         |

Instrument, settled at the probe: the existing e2e file has no origin and runs at the shipped `partial`
default, under which the proof target reads the local base and never fetches — the boundary's base read does
not exist there. Adding an origin and full protection to its shared builder would change what its existing
cases observe, so these probes take their own file, `teardown-base-movement.e2e.test.ts`, over a repository
whose merge and archival have both reached a live base.

#### Errand review and merge — `arc errand close`, the Errand's typed merge lane

The base read at `close` is narrower than the coverage table implied. `close-runtime.ts` calls
`pinRemoteBaseHead` only inside `localBase.oid === head.oid` — the no-op shortcut — so an ordinary Errand whose
branch is ahead of the base never reaches it. When it is reached, a pin that is not `pinned` and a pin at a moved
head take the same fall-through to `observeExactChangeRequest`, so an unavailable base read is absorbed
indistinguishably from a moved one. `src/lib/errand/merge.ts` merges Errand _record_ trees, not the base. The
lane's actual base gate is prose over `arc base drift` (below), whose typed verb the standalone drift probes
already cover.

Under `partial` protection the picture differs — `partial-settle-runtime.ts` refuses `preservation-unproven` on a
failed pin — but this project runs `full`, and D2 binds observation to the tree under test.

| Cell                           | Verdict        | Reason / probe intent                                          |
| ------------------------------ | -------------- | -------------------------------------------------------------- |
| control (no movement)          | applicable     | ceremony baseline                                              |
| `disjoint`                     | applicable     | the real probe: close after an advance, observe no re-ceremony |
| `overlapping-substantive`      | not-applicable | the seam runs no overlap classification                        |
| `overlapping-regenerable-only` | not-applicable | same                                                           |
| `unknown`                      | not-applicable | a failed pin takes the same fall-through as a moved base       |

#### Delivery-member shape

Landing keeps four of its five cells. `classifyDeliveryDrift` supplies the `residual-contained` safety class that
moves the substantive cut, so the member rows are not repeats of the singleton ones. `unknown` is the exception:
`verdict: unavailable` never enters the delivery arm, so it reaches the identical `blocked / drift-unavailable`
the singleton cell already records. Prepublication and closeout each close their single `disjoint` cell — the
delivery arms add no base read of their own, so the shape cannot change a base-derived result.

| Cell                                     | Verdict        | Reason                                             |
| ---------------------------------------- | -------------- | -------------------------------------------------- |
| landing · control                        | applicable     | member-scope ceremony baseline                     |
| landing · `disjoint`                     | applicable     | member admissibility decides here                  |
| landing · `overlapping-substantive`      | applicable     | `residual-contained` moves the cut                 |
| landing · `overlapping-regenerable-only` | applicable     | partition reaches the member payload               |
| landing · `unknown`                      | not-applicable | skips the delivery arm; identical to the singleton |
| prepublication · `disjoint`              | not-applicable | the renewal inspection performs no base read       |
| closeout · `disjoint`                    | not-applicable | no delivery-specific base read at teardown         |

#### Exact-target read isolation

Not a boundary and not a base read: all three cells stay applicable as enumerated. Their concern is what one
checkout's records look like from a sibling sharing the git common dir, which no base advance reaches.

#### Prose-only gates visible at this base

Provisional — the set moves with each base merge and is superseded from the tree at close. Each is a workflow step
that loops or gates on a drift read with no typed verb behind the disposition, so each takes a ledger-only row.

- `integrate-work-unit.md` Step 1 — the pre-hosted-pass advisory read. Keeping `clean` and regenerable-only drift
  silent, reconciling early "only when the interaction is clear", and stopping on a material interaction are all
  agent judgment; no verb enforces any of them.
- `run-errand.md` Step 5 — "authoritative base freshness", then "repeat until base, head, and requirements are
  settled". The loop itself is the gate.
- `run-errand.md` Step 6, before either lane action — only `clean` continues, `reconcile` returns to Step 5,
  unavailable or malformed output stops.
- `run-errand.md` Step 6, auto-merge lane after checks permit merge — the same disposition, re-read under the held
  lock.

#### Confirmed count

Twenty-four applicable cells and sixteen not-applicable, against the enumerated forty: seventeen of thirty
singleton and Errand cells, four of seven delivery-member cells, and all three isolation cells. Four prose-only
gates take ledger-only rows on top.

## Pre-probe cost baseline

Taken on a tree carrying no new test file, before the helper and pin work of Tasks 1.4 and 1.5, so the delta
stated at close is attributable to the probes. The tool refuses to default any measurement axis and the closing
comparison refuses outright when one differs, so the axes below must be repeated exactly at close.

**Mode, all three baselines:** `condition: tier-isolated` · `projectSet: <tier>` · `workerSizing: 12`. These match
the four tier-isolated rows in the package's budget record; the per-CI-job rows measure a different thing under
different worker sizing and are not this work unit's to move.

**Three runs per tier, not one.** The retained-run reducer takes the median of a group and stamps a lone run as
`single-run` rather than `median`, and the project's existing cost baseline was established the same way. The
first round ran cold and produced the widest sample at every tier — e2e came in above its recorded budget on that
run alone — which is the spread a single sample would have silently baked into the delta.

| Tier          | Runs (wall-clock ms)        | Median ms | Summed file time (median ms) | Files | Tests  |
| ------------- | --------------------------- | --------- | ---------------------------- | ----- | ------ |
| `integration` | 42 072 / 44 784 / 48 993    | 44 784    | 411 631                      | 141   | 1 418  |
| `lane`        | 49 543 / 49 624 / 50 883    | 49 624    | 542 947                      | 845   | 11 354 |
| `e2e`         | 201 009 / 205 011 / 231 338 | 205 011   | 1 272 393                    | 56    | 548    |

**Where the medians sit against the recorded budgets.** `integration` lands on its recorded baseline almost
exactly. `lane` sits just above its own. `e2e` has drifted up about eight percent since its baseline was recorded
and now consumes most of its ten-percent allowance before a single probe lands, so the refresh at close is
compelled rather than optional — and an integration probe moves `lane` as well as `integration`, because `lane`
is the combined local tier.

**Effective e2e shard membership at this base.** Four legs, each anchored on one heavyweight file and carrying a
thirteen-file remainder out of fifty-two: `errand`, `candidate-lineage`, `command-input-no-input`, and
`lifecycle-exit`. A new e2e probe lands in a remainder, so the re-read at close compares like with like only if
it derives membership the same way.

**Retained run files.** `~/.local/share/arc/test-cost-baselines/concurrent-integration-characterization/` — an
absolute path outside every checkout. Nine run files plus the shard membership:
`pre-probe-{integration,lane,e2e}-{1,2,3}.json` and `pre-probe-e2e-shards.json`. The closing comparison reads
these paths directly, so they are the baseline; the table above is a reader's summary of them, not the record.

The package-local run directory is gitignored, so a clean, a fresh worktree, or a sibling checkout would lose it —
and worktree churn is something the lifecycle performs routinely. Tracking the files would answer two of those
three and cost the repository a permanent couple of megabytes of packed history that deleting them later would not
reclaim. A path outside every checkout answers all three at no such cost.

What it assumes is that this work unit runs on one machine, which is its plan. If the work does move machines the
run files do not follow, and the closing comparison degrades from a tool-computed delta to the medians recorded
above. Nothing is removed from the tree at close, because nothing was added to it.

## Movement shape

The advance helper carries two landing shapes, and they are not interchangeable at any seam gated on integration
evidence. The shipped scan proves an event from commit topology alone — a second parent is the whole proof — so a
change request landed as a merge classifies, while a commit pushed straight to the base cannot be classified by any
scan and leaves coverage `partial` with the movement unclassified.

Observed at the checkpoint seam over one disjoint advance, every other fact held constant:

| Landing shape | Evidence coverage | Reconcile safety | Checkpoint result            |
| ------------- | ----------------- | ---------------- | ---------------------------- |
| `direct`      | `partial`         | unsafe           | `blocked / unsafe-reconcile` |
| `merge`       | `complete`        | safe             | `reconcile / reconcile-base` |

Two consequences the probes carry forward. Movement shape is a real axis of this boundary's behavior even though
the matrix has no column for it, so a row that observed a refusal names the shape it observed. And the refusal
under `direct` is mis-signalled: its reason and remedy name a substantive overlap that the same payload reports as
empty, so a reader following the remedy would look for a conflict that is not there.

`direct` stays the helper's default. It is the shape every row recorded before this was observed against, and
changing the default would silently restate those observations.

## Characterization ledger

One row per probe, appended during execution (D4). Columns: boundary · movement kind · shape · test name · base OID
observed against · observed typed result (reason, remedy) · verb invocations · approval stops · recommendation-bearing
or bare · continuation (`cleared` / `did-not-clear` / `none-offered` / `not-applicable`) · classification
(`tolerates` / `redundant ceremony` / `mechanical block` / `fail-closed, correct`) · owner · fix disposition at
close · retention disposition at close (D9).

`fail-closed, correct` requires a continuation the probe exercised and that cleared the stop; a refusal the baseline
also requires but which nothing is proven to clear is a `mechanical block`. A continuation's own invocations count
toward that row's excess. An observation with nothing to probe — a prose-only gate, or a completion path no test
covers — takes a ledger-only row carrying its recorded fix and an owner.

### Conventions

Fixed here and applied to every row. Excess is a difference against a control row on the same fixture, so the
counting rules below only have to be consistent — an inconsistent one makes the metric noise.

**Append-only under re-run.** Every row names the base OID it was observed against. Each base merge re-runs the
suite and appends a row per changed observation; an existing row is never edited to match a later run. A row whose
observation is unchanged by the merge is not re-appended.

**A citation addresses exactly one collected test.** A row names its probe by the title the runner collects it
under — the enclosing describe path plus the test's own title. The title alone stands while it is unique within
its file; where two tests share one, the row carries the describe path as well, so no row resolves to a pair. A
continuation exercised in a test of its own is named the same way, so its verdict rests on a resolvable test
rather than on prose.

**`disjoint` means no intersection at all.** The shipped classifier drops evidence-neutral paths from the overlap
entirely, so an advance touching only a work unit's own artifacts, its candidate record, or its submission
boundary reports the same empty overlap as one touching nothing the branch touched. Record the second case as
`disjoint (evidence-neutral intersection)` so a reader does not collapse the two into one observation.

**Continuation.** Records whether the probe took the result's recommended continuation and whether it cleared the
stop: `cleared`, `did-not-clear`, `none-offered`, `not-applicable`. Taking it is observation, not repair, and its
invocations count toward the row's excess. `fail-closed, correct` requires a continuation the probe exercised and
that cleared; a refusal nothing is proven to clear is a `mechanical block` however justified it is.

**What counts as one invocation.** One verb entry: one spawned `arc <verb>` process in the e2e lane, one handler
or port entry call in the integration lane. A verb that internally composes others counts once.

- Fixture setup does not count — everything before the boundary's precondition holds, including repository
  scaffolding, the lifecycle verbs that reach the precondition, and the base advance itself.
- A read-only status call counts when the procedure requires it to reach the next step, and does not count when
  the probe issues it only to assert. The control row applies the same rule, so an assertion-only read never
  inflates excess.
- Inside one anchored sequence, each verb in the chain counts separately, and a step interleaved mid-sequence
  counts as its own invocation attributed to the row whose movement prompted it.

**What counts as one approval stop.** One typed result whose next action requires operator direction before the
next step — `stop`, `rerun-checkpoint`, `select-review-scope`, `obtain-ceiling-override`, `establish-new-root`,
`reconcile-base`, `retarget`, `reopen-and-retarget`. A result the procedure continues from without direction is
not a stop, whatever it reports.

### Row shape

An open row carries its identity and its intent; every observation field reads `—` until the probe runs and is
filled from that run, never from a source read. A row is complete when no `—` remains.

- _Intent:_ what this cell is expected to establish, from the confirmed seam verdict.
- _Probe:_ test name · _Base OID:_ the base this run observed against · _Observed:_ typed result, reason, remedy.
- _Invocations:_ · _Stops:_ · _Fork:_ recommendation-bearing or bare · _Continuation:_ per the convention above.
- _Classification:_ `tolerates` / `redundant ceremony` / `mechanical block` / `fail-closed, correct` ·
  _Owner:_ · _Fix at close:_ · _Retention at close:_ per D9.

Not-applicable rows close on the seam verdict alone and carry no observation fields. Each declares its closure
kind — collapse or unproducible — and a collapse names the row it defers to, so no closure rests on an
observation nobody will take.

### Open probe rows

Twenty-four rows, one per applicable cell. Owner, fix disposition, and retention disposition resolve at this work
unit's close, not at seed time.

**Whole-work-unit verification · control · singleton**

- _Intent:_ Ceremony baseline: the invocation and stop count the movement row at this boundary subtracts from.
- _Probe:_ `attest.e2e.test.ts` — "stages Candidate evidence over a base it shares a remote with" ·
  _Base OID:_ `4f6b11568` · _Observed:_ `attested`, operation `root`, locus `candidate-review-pending`; no reason,
  no remedy. Same fixture as this boundary's movement row, with the base held still.
- _Invocations:_ 1 · _Stops:_ 0 · _Fork:_ none, the result is not a stop · _Continuation:_ `not-applicable`
- _Classification:_ not a movement row — the four values classify a boundary's response to movement, and this row's
  finding is its count · _Owner:_ not applicable · _Fix at close:_ none — baseline count · _Retention at close:_ —

  The baseline is one invocation and no stops, so this boundary carries no non-concurrency excess to route. The
  `disjoint` row observes the same one and zero, putting its excess at the idiomatic zero: the advance costs the
  boundary nothing.

**Whole-work-unit verification · `disjoint` · singleton**

- _Intent:_ Attest after an advance the checkout has fetched; expect the staged subject unchanged and the result
  unaffected.
- _Probe:_ `attest.e2e.test.ts` — "stages the same Candidate evidence after a base advance sharing none of its
  paths" · _Base OID:_ `4f6b11568` · _Observed:_ `attested`, operation `root`, locus `candidate-review-pending`;
  no reason, no remedy. Subject entries and staged set identical to the run with the base held still. The origin
  attached for this probe moves the coordinate the seam actually reads — with a remote present the base resolves
  from `refs/remotes/origin/main` rather than the local branch — so the unchanged subject is a result, not an
  advance the boundary never saw.
- _Invocations:_ 1 · _Stops:_ 0 · _Fork:_ none, the result is not a stop · _Continuation:_ `not-applicable`
- _Classification:_ `tolerates` · _Owner:_ not applicable · _Fix at close:_ none — the boundary's response needs no
  change · _Retention at close:_ —

**Candidate / prepublication · control · singleton**

- _Intent:_ Ceremony baseline across the settle-to-submit window with the base held still.
- _Probe:_ `publication-spine.e2e.test.ts` — "submits the settled Candidate with the base held still" ·
  _Base OID:_ `4f6b11568` · _Observed:_ `published`, boundary `publication-pending` on the Candidate the settle
  point recorded; no reason, no remedy.
- _Invocations:_ 3 — attest, the pre-publication settle, and the submit · _Stops:_ 0 · _Fork:_ none, no result in
  the window is a stop · _Continuation:_ `not-applicable`
- _Classification:_ not a movement row — the four values classify a boundary's response to movement, and this row's
  finding is its count · _Owner:_ not applicable · _Fix at close:_ none — baseline count · _Retention at close:_ —

  Three invocations reach the window's end with the base still, and none of them stops. The `disjoint` row
  observes the same three and zero, so the advance's excess here is the idiomatic zero.

**Candidate / prepublication · `disjoint` · singleton**

- _Intent:_ Advance the base inside the settle-to-submit window the spine test never moves across; expect the
  settled Candidate to stay current.
- _Probe:_ `publication-spine.e2e.test.ts` — "submits the same settled Candidate after an advance sharing none of
  its paths" · _Base OID:_ `4f6b11568` · _Observed:_ `published`, boundary `publication-pending` on the same
  Candidate the settle point recorded; no reason, no remedy. The advance lands between the settle and the submit,
  and the submit neither re-reads nor re-ceremonies it.
- _Invocations:_ 3 — attest, the pre-publication settle, and the submit · _Stops:_ 0 · _Fork:_ none, the result is
  not a stop · _Continuation:_ `not-applicable`
- _Classification:_ `tolerates` · _Owner:_ not applicable · _Fix at close:_ none — the row records what the tolerance
  rests on · _Retention at close:_ —

  What the tolerance rests on is visible when it is removed: deriving the Candidate subject from the base tip
  rather than the fork point turns this same run into `rejected`, "the Candidate lineage is not current", carrying
  a re-attest remedy. The whole settle-to-submit window survives concurrent base movement because one coordinate
  is a merge base, and the re-ceremony is one source line away.

**Public review and checks · control · singleton**

- _Intent:_ Ceremony baseline with the fetched base still contained in the reviewed head.
- _Probe:_ `review-status-base-movement.test.ts` — "reports the settled state the moved-base reading is measured
  against" · _Base OID:_ `4f6b11568` ·
  _Observed:_ `settled / continue-reconcile` over a non-null base revision; no reason, no remedy.
- _Invocations:_ 1 — the status reading · _Stops:_ 0 — `continue-reconcile` continues without direction, which
  is the convention's own test · _Fork:_ bare · _Continuation:_ `not-applicable`
- _Classification:_ not a movement row — this row's finding is its count · _Owner:_ not applicable · _Fix at close:_
  none — baseline count · _Retention at close:_ —

  The cheapest baseline on the spine, and the reason this boundary's two movement rows are both excess: every
  stop recorded at it is added by the movement rather than carried by the ceremony.

**Public review and checks · `disjoint` · singleton**

- _Intent:_ Advance the base under an open request; expect `base-moved / rerun-checkpoint` from the containment
  fact alone.
- _Probe:_ `review-status-base-movement.test.ts` — "stops for a checkpoint rerun after an advance sharing no
  path with the branch" · _Base OID:_ `4f6b11568` · _Observed:_ `base-moved / rerun-checkpoint`, carrying no
  reason and no remedy. The routed obligation is `settled` and required checks are `not-required`, so the stop
  comes from the containment fact alone, as the seam read predicted.
- _Invocations:_ 2 — the status resolve, plus the checkpoint the stop names · _Stops:_ 2 — `rerun-checkpoint`,
  then the checkpoint's own `stop` · _Fork:_ bare at the stop, which names an action but carries no argv; the
  continuation's refusal is recommendation-bearing · _Continuation:_ `did-not-clear`, taken in "does not clear
  the stop after an advance sharing no path with the branch"
- _Classification:_ `mechanical block` · _Owner:_ Errand — refusal remedy accuracy · _Fix at close:_ name the cause the
  refusal actually rests on, not the overlap its own payload reports empty · _Retention at close:_ —

  The continuation refuses with `blocked / unsafe-reconcile` while reporting an empty overlap and a mergeable
  host. Removing the integration-evidence term from the safety conjunction turns the same run into
  `reconcile / reconcile-base`, so the refusal rests entirely on the advanced commit carrying no landing
  provenance to classify — not on the overlap its remedy text tells the reader to resolve. A base advance that
  is not merge-shaped is therefore unreconcilable at this seam however disjoint it is, and the remedy names a
  cause the same payload contradicts. Whether the fixture can present merge-shaped movement is the landing
  boundary's question, not this row's; the refusal stands either way, and only its attribution is at issue.

  _Answered at the landing boundary, without restating this observation:_ it can, and the continuation then
  clears — see § Movement shape. This row's `did-not-clear` stands as the observation taken against
  movement pushed straight to the base.

**Public review and checks · `unknown` · singleton**

- _Intent:_ Fail only the base fetch inside the composed status port; expect a null base object id and `blocked /
  status-unavailable`.
- _Probe:_ `review-status-base-movement.test.ts` — "blocks on the unavailable base revision, and settles once the
  read is restored" · _Base OID:_ `4f6b11568` ·
  _Observed:_ `blocked / stop`, reason `status-unavailable`, detail "The current base revision is unavailable.",
  over a null base revision.
- _Invocations:_ 2 — the blocked reading and the re-run its remedy names, taken at the port rather than the
  process boundary, which is the same reading in this lane · _Stops:_ 1 — the refusal ·
  _Fork:_ recommendation-bearing · _Continuation:_ `cleared`
- _Classification:_ `fail-closed, correct` · _Owner:_ not applicable · _Fix at close:_ none — the row records that the
  attribution rests on arm order · _Retention at close:_ —

  The attribution survives, and only just: the failed fetch also collapses the routed obligation into a blocked
  state carrying the raw transport error, and that arm produces the same reason one step later. What separates
  them is the order — the null-base arm is read first, so the detail names the base rather than the error text.
  Making the fetch best-effort, the way the closeout boundary's second leg already is, turns this row green
  against a stale tracking ref instead.

**Member / singleton landing · control · singleton**

- _Intent:_ Ceremony baseline across a clean checkpoint-to-merge span.
- _Probe:_ `integrate-base-movement.e2e.test.ts` — "merges the approved head when the base holds still"
  · _Base OID:_ `4f6b11568` ·
  _Observed:_ `ready / request-approval`, then `merged`. The clean span costs one approval stop and lands.
- _Invocations:_ 2 — the checkpoint and the merge · _Stops:_ 1 — `request-approval`, the integration
  interlock · _Fork:_ recommendation-bearing · _Continuation:_ `not-applicable`
- _Classification:_ not a movement row — the four values classify a boundary's response to movement, and this row's
  finding is its count · _Owner:_ not applicable · _Fix at close:_ none — baseline count · _Retention at close:_ —

  `request-approval` is an approval stop by the convention's own test and is absent from the enumerated
  list, which was written before any landing run existed. The list is illustrative; the test is whether the
  next action requires operator direction, and merge authority always does.

**Member / singleton landing · `disjoint` · singleton**

- _Intent:_ Advance the base between landing readiness and merge — the span nothing in the suite moves; expect
  the settled merge invalidated on the verdict alone.
- _Probe:_ `integrate-base-movement.e2e.test.ts` — "invalidates the handle when the base advances under it"
  · _Base OID:_ `4f6b11568` ·
  _Observed:_ `invalidated / drift-reconcile`, payload `{ verdict: "reconcile" }` — the verdict alone, with no overlap
  partition, exactly as the merge window's seam read predicted.
- _Invocations:_ 3 — checkpoint, merge, and the checkpoint the refusal names · _Stops:_ 3 —
  `request-approval`, the invalidation, then `reconcile / reconcile-base` · _Fork:_ recommendation-bearing ·
  _Continuation:_ `did-not-clear`
- _Classification:_ `mechanical block` · _Owner:_ [open — ceremony-repetition doctrine home] · _Fix at close:_ carry the
  partition into the merge window so a disjoint advance does not re-ceremony the landing · _Retention at close:_ —

  Excess over the control row is one invocation and two stops. The continuation does not return a handle:
  the same invocation that minted one before now reads a moved base and asks for a reconcile first, so a
  landing interrupted by any base movement costs a reconcile, a fresh checkpoint, and a fresh approval.
  The advance shared no path with the branch, and the window discards that fact before it is consulted.

**Member / singleton landing · `overlapping-substantive` · singleton**

- _Intent:_ Advance over paths the branch also touched; expect the checkpoint to refuse as an unsafe reconcile.
- _Probe:_ `integrate-base-movement.e2e.test.ts` — "refuses an advance over a reviewable path the branch also changed"
  · _Base OID:_ `4f6b11568` ·
  _Observed:_ `blocked / unsafe-reconcile`, naming the shared path in `substantivePaths` with `safe: false`.
- _Invocations:_ 2 — the checkpoint and the one its remedy names · _Stops:_ 2 — the same refusal twice ·
  _Fork:_ recommendation-bearing · _Continuation:_ `did-not-clear`
- _Classification:_ `mechanical block` under the convention, though the refusal itself is correct ·
  _Owner:_ Errand — refusal remedy accuracy · _Fix at close:_ make the remedy's argv reach the step its prose
  names · _Retention at close:_ —

  The refusal is right: a reviewable path changed on both sides is exactly what should stop a merge. What
  the probe records is the gap between the remedy's prose and its argv — the text asks for an append-only
  base merge, the argv only re-runs the checkpoint, and following the argv exactly returns the same
  refusal. The convention reserves `fail-closed, correct` for a continuation the probe exercised and that
  cleared, and this one cannot clear without a step the result does not carry.

**Member / singleton landing · `overlapping-regenerable-only` · singleton**

- _Intent:_ Advance over the regenerable projection only; expect the checkpoint to stay safe and report the
  partition, proving regenerable overlap does not block.
- _Probe:_ `integrate-base-movement.e2e.test.ts` — "the checkpoint's own base read > offers a reconcile for an
  advance over the regenerable projection alone" · _Base OID:_ `4f6b11568` ·
  _Observed:_ `reconcile / reconcile-base`, `substantivePaths` empty and the projection in `regenerablePaths`,
  `safe: true`.
- _Invocations:_ 1 — the checkpoint · _Stops:_ 1 — `reconcile-base` · _Fork:_ **bare**, the only result at
  this boundary carrying no remedy at all · _Continuation:_ `none-offered`
- _Classification:_ `tolerates` ·
  _Owner:_ capture — recommendations at approval gates (`WU_Target` still TBD) ·
  _Fix at close:_ compose a next-step invocation for the one safe result at this boundary ·
  _Retention at close:_ —

  The partition works: regenerable overlap does not block, and the register says so in plain terms. The
  finding is the fork — the one result here that is safe to act on is the only one that names a next action
  without an invocation to reach it, while every refusal carries one.

**Member / singleton landing · `unknown` · singleton**

- _Intent:_ Sever the checkpoint's base fetch; expect a distinct drift-unavailable refusal rather than a reconcile.
- _Probe:_ `integrate-base-movement.e2e.test.ts` — "refuses when the base read goes unavailable under it"
  · _Base OID:_ `4f6b11568` ·
  _Observed:_ `blocked / drift-unavailable` — distinct from every reconcile arm, as the seam read predicted.
- _Invocations:_ 2 — the checkpoint and the reading its remedy names · _Stops:_ 1 — the refusal ·
  _Fork:_ recommendation-bearing · _Continuation:_ `cleared`
- _Classification:_ `fail-closed, correct` · _Owner:_ Errand — refusal remedy accuracy · _Fix at close:_ return the
  reader to the checkpoint rather than ending on a drift report · _Retention at close:_ —

  The continuation is a base reading rather than another checkpoint, and with the base read restored it
  reports a clean base. The refusal clears in one recommended step, which makes this friction rather than a
  freeze — though the step lands the reader on a drift report and leaves the return to the checkpoint to
  them.

**Post-landing closeout · control · singleton**

- _Intent:_ Ceremony baseline for the reap with the base held still.
- _Probe:_ `teardown-base-movement.e2e.test.ts` — "reaps the branch when the base holds still"
  · _Base OID:_ `4f6b11568` ·
  _Observed:_ `torn-down` — the branch deleted locally and on the remote, the worktree in-place, the stale
  tracking ref pruned; no reason, no remedy.
- _Invocations:_ 1 — the cleanup verb · _Stops:_ 0 — the reap runs to completion unattended · _Fork:_ bare ·
  _Continuation:_ `not-applicable`
- _Classification:_ not a movement row — this row's finding is its count · _Owner:_ not applicable · _Fix at close:_
  none — baseline count · _Retention at close:_ —

  Full protection is what puts a base read here at all: the shipped default resolves the proof target from the
  local base and never fetches, so on that setting the boundary has nothing for an advance to move.

**Post-landing closeout · `disjoint` · singleton**

- _Intent:_ Advance the base past this work unit's landing; expect the reap to refetch and recognize its own
  archival.
- _Probe:_ `teardown-base-movement.e2e.test.ts` — "reaps the branch after an advance sharing no path with it"
  · _Base OID:_ `4f6b11568` ·
  _Observed:_ `torn-down`, identical to the control in every reported field — the same two deletions, the same
  prune, no reason and no remedy.
- _Invocations:_ 1 · _Stops:_ 0 · _Fork:_ bare · _Continuation:_ `not-applicable`
- _Classification:_ `tolerates` · _Owner:_ not applicable · _Fix at close:_ none — the row records that the tolerance is
  one predicate deep · _Retention at close:_ —

  Excess is zero and the advance is real: at the boundary the local base sits one commit behind the remote, and
  the gate reads membership from the refetched tip, which still carries this work unit's archival. Landing shape
  does not enter — nothing here proves an integration event from topology — so the advance is recorded as a
  direct push and a merge landing would read the same. The tolerance is one predicate deep: refuse when the
  refetched head differs from the local base tip, and this row goes red while the control stays green.

**Post-landing closeout · `unknown` · singleton**

- _Intent:_ Sever the proof-target fetch; expect a refusal naming the unresolvable lifecycle authority ref.
- _Probe:_ `teardown-base-movement.e2e.test.ts` — "refuses with the branch untouched, and reaps once the read is
  restored" · _Base OID:_ `4f6b11568` ·
  _Observed:_ `rejected` — "Could not resolve lifecycle authority ref `origin/main`; refusing teardown.", with the
  branch and its remote head left intact.
- _Invocations:_ 2 — the refused cleanup and the one that follows it · _Stops:_ 1 — the refusal ·
  _Fork:_ **bare**, the refusal names no invocation · _Continuation:_ `cleared`
- _Classification:_ `fail-closed, correct` · _Owner:_ Errand — refusal remedy accuracy · _Fix at close:_ name the plain
  retry that clears it · _Retention at close:_ —

  The refusal is attributable: it fires on the proof-target leg, ahead of the best-effort refresh that would have
  absorbed the same failure into a silent fall-back to the local ref. It also costs nothing to clear — a plain
  retry once the read is restored tears down — but nothing in the message says so. That makes it the second
  result in the ledger whose decision is correct and whose signalling names no step, after the landing boundary's
  safe reconcile.

**Errand review / merge · control · singleton**

- _Intent:_ Ceremony baseline for the Errand close path with the base held still.
- _Probe:_ `errand.e2e.test.ts` — "closes the Errand when the base holds still" · _Base OID:_ `4f6b11568` ·
  _Observed:_ `applied`, operation `errand-close` — the branch reaped and the identity record retired; no reason,
  no remedy.
- _Invocations:_ 1 — the close · _Stops:_ 0 · _Fork:_ bare · _Continuation:_ `not-applicable`
- _Classification:_ not a movement row — this row's finding is its count · _Owner:_ not applicable · _Fix at close:_
  none — baseline count · _Retention at close:_ —

  Preservation here is proven from merged host truth, not from local containment: the Errand head is one commit
  ahead of the local base at close and the lane retires it anyway. Proving it from containment instead refuses
  both rows at this boundary.

**Errand review / merge · `disjoint` · singleton**

- _Intent:_ Advance the base between the Errand's open and its close; expect close to proceed with no added
  ceremony.
- _Probe:_ `errand.e2e.test.ts` — "closes the Errand after an advance sharing no path with it" ·
  _Base OID:_ `4f6b11568` ·
  _Observed:_ `applied`, operation `errand-close` — identical to the control, with the remote base proven to have
  moved inside the same sequence.
- _Invocations:_ 1 — the close; the advance is fixture movement and does not count · _Stops:_ 0 · _Fork:_ bare ·
  _Continuation:_ `not-applicable`
- _Classification:_ `tolerates` · _Owner:_ Errand — Errand-close base-pin coverage · _Fix at close:_ pin the structural
  tolerance so a hardening of the base pin is caught · _Retention at close:_ —

  Excess zero, and the tolerance is structural rather than decided: the base pin sits behind the no-op shortcut,
  which an Errand carrying a commit never enters, so the close reads no base at all. That is what the seam read
  predicted, and it is why this boundary's three other movement kinds close not-applicable. Pinning the base
  unconditionally and refusing a moved head turns this row red while the control stays green — so the tolerance
  is one predicate away from being a stop, and nothing at this boundary would notice the difference today.

**Member / singleton landing · control · delivery-member**

- _Intent:_ Member-scope ceremony baseline; the delivery arm's own admissibility span.
- _Probe:_ `integrate-base-movement.e2e.test.ts` — "mints a handle for the top member when the base holds still"
  · _Base OID:_ `4f6b11568` ·
  _Observed:_ `ready / request-approval`, at stack position `top` and over a requirement summary reporting every
  derived delivery-member review discharged — neither reachable except through the delivery arm.
- _Invocations:_ 1 — the checkpoint · _Stops:_ 1 — `request-approval` · _Fork:_ recommendation-bearing ·
  _Continuation:_ `not-applicable`
- _Classification:_ not a movement row — this row's finding is its count · _Owner:_ not applicable · _Fix at close:_
  none — baseline count · _Retention at close:_ —

  The member baseline costs exactly what the singleton one costs; what differs is what decided it. Reaching it at
  all needs a genuinely landed predecessor: every non-terminal member must resolve as merged at its exact bound
  head before any ready composition is attempted, a precondition the singleton path has no analogue for.

**Member / singleton landing · `disjoint` · delivery-member**

- _Intent:_ Advance under a bound member; expect the delivery path to decide admissibility rather than re-observe.
- _Probe:_ `integrate-base-movement.e2e.test.ts` — "offers a reconcile after an advance sharing no path with the
  branch" · _Base OID:_ `4f6b11568` ·
  _Observed:_ `reconcile / reconcile-base`, both path sets empty, `safe: true` — structurally identical to the
  singleton result at the same window.
- _Invocations:_ 1 · _Stops:_ 1 — `reconcile-base` · _Fork:_ bare · _Continuation:_ `none-offered`
- _Classification:_ `tolerates` · _Owner:_ not applicable · _Fix at close:_ none — the boundary's response needs no
  change · _Retention at close:_ —

  The delivery arm does decide this row — severing it turns the result into `blocked / delivery-terminal-blocked`
  — but it decides the same way. With no substantive overlap there is nothing for the residual scope to narrow,
  so the safety class never enters and the payload carries no trace of the shape.

**Member / singleton landing · `overlapping-substantive` · delivery-member**

- _Intent:_ Advance over shared paths under a bound member; expect the residual-contained safety class to move the
  cut the singleton row refuses on.
- _Probe:_ `integrate-base-movement.e2e.test.ts` — "admits an advance over a reviewable path the top member alone
  changed" · _Base OID:_ `4f6b11568` ·
  _Observed:_ `reconcile / reconcile-base` carrying the shared path in `substantivePaths` with `safe: true` — the
  same overlap the singleton row refuses on, admitted.
- _Invocations:_ 1 · _Stops:_ 1 — `reconcile-base` · _Fork:_ bare · _Continuation:_ `none-offered`
- _Classification:_ `tolerates` · _Owner:_ Errand — refusal remedy accuracy · _Fix at close:_ compose the register from
  the decision rather than from the overlap partition alone · _Retention at close:_ —

  The cut moves as the seam read predicted, and a safe verdict over a non-empty substantive set is reachable no
  other way. The finding is the register riding along with it: its text is composed from the partition alone, so
  it reads "Merge the base before continuing edits on those paths" on the very result that just admitted those
  paths. The decision and its advisory disagree, and only the decision knows about the residual. The same scoping
  adds one stop the singleton shape has no analogue for — an advance intersecting a landed member's span refuses
  as a predecessor overlap — which the matrix enumerates no cell for and this row records rather than probes.

**Member / singleton landing · `overlapping-regenerable-only` · delivery-member**

- _Intent:_ Advance over the regenerable projection under a bound member; expect the partition to reach the member
  payload.
- _Probe:_ `integrate-base-movement.e2e.test.ts` — "the checkpoint's base read under a bound delivery plan >
  offers a reconcile for an advance over the regenerable projection alone" · _Base OID:_ `4f6b11568` ·
  _Observed:_ `reconcile / reconcile-base`, the projection in `regenerablePaths`, `safe: true`, register `calm` —
  identical to the singleton row.
- _Invocations:_ 1 · _Stops:_ 1 — `reconcile-base` · _Fork:_ bare · _Continuation:_ `none-offered`
- _Classification:_ `tolerates` · _Owner:_ not applicable · _Fix at close:_ none — the boundary's response needs no
  change · _Retention at close:_ —

  Two of this boundary's four member cells read identically to their singleton counterparts while genuinely
  running the delivery arm. That is the shape's actual reach: it narrows a refusal and never a tolerance, so it
  can only be seen where the singleton path would have stopped.

**Exact-target read isolation · sibling build cannot parse · isolation**

- _Intent:_ A sibling checkout whose build rejects this checkout's candidate record; the live field class three
  sibling checkouts reproduced at this work unit's first session entry.
- _Probe:_ `exact-target-read-isolation.test.ts` — "names the sibling unresolved while this checkout's own frame
  still resolves" · _Base OID:_ `4f6b11568` ·
  _Observed:_ the sibling row `unresolved-checkout`, naming its subject and carrying one `subject-unresolved`
  diagnostic — "Candidate record could not be read under this build's schema". This checkout's own row stays
  selected and its primary reads free.
- _Invocations:_ 1 — the locus reading · _Stops:_ 0 · _Fork:_ bare · _Continuation:_ `not-applicable`
- _Classification:_ `tolerates` · _Owner:_ not applicable · _Fix at close:_ none — the boundary's response needs no
  change · _Retention at close:_ —

  The isolation is real and asymmetric: the refusal stays with the checkout that owns the record — which cannot
  enter a session at all — while a reader next door gets a named diagnostic and keeps going. The record is only
  opened when the sibling's own meta demands Candidate authority, so the guard is one precondition deep: with
  that demand removed the same unreadable record resolves silently.

**Exact-target read isolation · foreign-owner record · isolation**

- _Intent:_ A foreign owner's candidate record in the shared namespace; expect this checkout's read to stay bound
  to its own.
- _Probe:_ `exact-target-read-isolation.test.ts` — "refuses the sibling on ownership without projecting its
  subject at all" · _Base OID:_ `4f6b11568` ·
  _Observed:_ the sibling row `unresolved-checkout` with `subject: null` and one `authority-evidence-unreadable`
  diagnostic sourced to lifecycle — "The marker-named work unit is owned by another identity".
- _Invocations:_ 1 · _Stops:_ 0 · _Fork:_ bare · _Continuation:_ `not-applicable`
- _Classification:_ `tolerates` · _Owner:_ not applicable · _Fix at close:_ none — the boundary's response needs no
  change · _Retention at close:_ —

  Narrower than the row above, and deliberately so: ownership settles before the record is opened, so a foreign
  work unit never reaches the Candidate guard and its subject is never projected. A foreign owner's unreadable
  record therefore reports as foreign, not as unreadable. Covering test at close: a foreign active owner is
  already refused in `candidate-applicability.e2e.test.ts`.

**Exact-target read isolation · byte-identical sibling · isolation**

- _Intent:_ A sibling left byte-identical after this checkout's reconcile ceremony.
- _Probe:_ `exact-target-read-isolation.test.ts` — "leaves the sibling byte-identical after the ceremony applies"
  · _Base OID:_ `4f6b11568` ·
  _Observed:_ `applied` — the dependency rewritten in this checkout's own projection, the sibling's copy of the
  same file byte-identical and its worktree clean.
- _Invocations:_ 1 — the reconcile · _Stops:_ 0 · _Fork:_ bare · _Continuation:_ `not-applicable`
- _Classification:_ `tolerates` · _Owner:_ not applicable · _Fix at close:_ none — the boundary's response needs no
  change · _Retention at close:_ —

  The write direction of the same isolation, and the one the other two cannot show: a ceremony that rewrites a
  projection touches only the checkout that ran it. Fanning the rewrite out to every registered worktree — the
  plausible convenience — is what turns this row red. Covering test at close:
  `wu-reconcile.e2e.test.ts` asserts the same property over its own topology.

### Not-applicable rows

Sixteen rows, each closed on the confirmed seam verdict and carrying no observation fields. Two closure kinds:
**collapse** — the boundary's typed result would be identical to a named row already open — and **unproducible**
— the movement kind cannot arise at this seam at all. A collapse names the row it defers to, so every closure is
auditable against an observation that will actually be taken.

- **Whole-work-unit verification · `overlapping-substantive` · singleton** — collapse onto this boundary's
  `disjoint` row. The seam runs no overlap classification, and its base coordinate reaches it only as a merge-base
  argument that an advance descended from the fork point leaves unmoved, so the staged subject is byte-identical
  whatever the advance touched.
- **Whole-work-unit verification · `overlapping-regenerable-only` · singleton** — collapse onto this boundary's
  `disjoint` row, for the same seam fact.
- **Whole-work-unit verification · `unknown` · singleton** — unproducible. Every invocation on this seam is
  local-only and nothing on it fetches, so remote evidence has no opportunity to go unavailable at the boundary.
  An absent remote-tracking ref falls back to the local base branch, which is a static precondition the design
  excludes from `unknown`.
- **Candidate / prepublication · `overlapping-substantive` · singleton** — collapse onto this boundary's
  `disjoint` row; the same effective-target seam, with the same unmoved merge-base coordinate.
- **Candidate / prepublication · `overlapping-regenerable-only` · singleton** — collapse onto this boundary's
  `disjoint` row, for the same seam fact.
- **Candidate / prepublication · `unknown` · singleton** — unproducible, for the same reason as verification: the
  prepublication read shares that local-only seam, and the publication transition reads no base at all.
- **Public review and checks · `overlapping-substantive` · singleton** — collapse onto this boundary's `disjoint`
  row. Containment is a pure ancestry fact over the fetched base, and that arm precedes every applicability arm,
  so the kind of movement never reaches the result.
- **Public review and checks · `overlapping-regenerable-only` · singleton** — collapse onto this boundary's
  `disjoint` row, for the same ordering.
- **Post-landing closeout · `overlapping-substantive` · singleton** — collapse onto this boundary's `disjoint`
  row. The reap runs no overlap classification; its verdict turns on whether this work unit is present in the
  completed index at the refetched head, which the advance's path set cannot change.
- **Post-landing closeout · `overlapping-regenerable-only` · singleton** — collapse onto this boundary's
  `disjoint` row, for the same seam fact.
- **Errand review / merge · `overlapping-substantive` · singleton** — collapse onto this boundary's `disjoint`
  row; the close path runs no overlap classification.
- **Errand review / merge · `overlapping-regenerable-only` · singleton** — collapse onto this boundary's
  `disjoint` row, for the same seam fact.
- **Errand review / merge · `unknown` · singleton** — collapse onto this boundary's `disjoint` row. A base pin
  that fails and a base pin at a moved head take the same fall-through, so an unavailable read is not
  distinguishable from a moved one at this seam.
- **Member / singleton landing · `unknown` · delivery-member** — collapse onto the singleton `unknown` row at the
  same boundary. An unavailable drift verdict never enters the delivery arm, so the member shape reaches the
  identical refusal.
- **Candidate / prepublication · `disjoint` · delivery-member** — collapse onto the singleton `disjoint` row at
  the same boundary. The delivery renewal inspection performs no base read, so the shape cannot change a
  base-derived result.
- **Post-landing closeout · `disjoint` · delivery-member** — collapse onto the singleton `disjoint` row at the
  same boundary; teardown has no delivery-specific base read.

### Ledger-only rows

Seven observations with nothing to probe. The prose-only set is provisional — it is read from the tree at each
base merge and superseded at close. The close re-read found five gates rather than four: the Errand lane carries
its own copy of the pre-hosted-pass advisory at Step 4, which the first pass recorded only at the integration
boundary. The five split two ways, and only one half has a fix.

**Prose-only gate · pre-hosted-pass drift read**

- _Observation:_ `integrate-work-unit.md` Step 1 reads authoritative drift before spending a hosted pass, then
  disposes of it in prose — keeping clean and regenerable-only silent, reconciling early "only when the
  interaction is clear", and stopping on a conflict or material interaction. No typed verb carries any of it.
- _Fix:_ none — the disposition turns on whether the interaction is clear and whether a product
  decision is uncertain, which is agent judgment; a typed verb would have to define both first. ·
  _Owner:_ not applicable

**Prose-only gate · Errand pre-hosted-pass drift read**

- _Observation:_ `run-errand.md` Step 4 carries the same advisory verbatim before entering the open pull request.
  Found at the close re-read rather than the first pass, which recorded this text only at the integration boundary.
- _Fix:_ none — the disposition turns on whether the interaction is clear and whether a product
  decision is uncertain, which is agent judgment; a typed verb would have to define both first. ·
  _Owner:_ not applicable

**Prose-only gate · Errand base-freshness loop**

- _Observation:_ `run-errand.md` Step 5 invokes authoritative drift, then loops in prose until base, head, and
  requirements are settled. The loop itself is the gate.
- _Fix:_ none — the loop closes on base, head, and requirements all being settled, a composite the verb
  does not observe. · _Owner:_ not applicable

**Prose-only gate · Errand pre-lane-action gate**

- _Observation:_ `run-errand.md` Step 6 re-reads drift immediately before either lane action and admits only a
  clean verdict, returning a reconcile to Step 5 and stopping on unavailable or malformed output — all in prose.
  The disposition is a pure function of the typed verdict, so nothing here needs deciding.
- _Fix:_ dispatch the typed verdict rather than restating it in prose. ·
  _Owner:_ Errand — typed drift dispatch

**Prose-only gate · Errand post-checks gate under the held lock**

- _Observation:_ `run-errand.md` Step 6's auto-merge lane re-reads drift once more after checks permit merge,
  while the lock is held, with the same prose disposition, and the same pure function of the typed verdict.
- _Fix:_ dispatch the typed verdict rather than restating it in prose. ·
  _Owner:_ Errand — typed drift dispatch

**Uncovered completion path · Errand close unchanged-base resolution**

- _Observation:_ the Errand close path's remote base pin sits behind an unchanged-base precondition, and no test
  in the suite references that resolution. The gap is the mechanism itself, not merely its operator-facing route:
  nothing proves the pin, the shortcut it guards, or the fall-through when the pin fails. This work unit's Errand
  cells probe the ordinary path, which never reaches it, so the gap survives this characterization.
- _Fix:_ coverage of the unchanged-base resolution and its base pin. ·
  _Owner:_ Errand — Errand-close base-pin coverage

**Doctrine · ceremony repetition turns on covered input**

- _Observation:_ the review-admission sentence already landed generalizes to every ceremony in the post-execution
  tail — a ceremony repeats only when a covered input changed, and head or base movement is never itself a
  covered input. There is no probe for a doctrine sentence; it needs a home.
- _Fix:_ land the generalized sentence in its own home. ·
  _Owner:_ [open — no surface owns it yet; see the routing report]

### Excess and bare stops

Computed from the rows above: each movement row against its own boundary's control row, counting the continuation's
own invocations. Counts are ledger observations taken from the runs, never assertions in the probes.

| Boundary · shape                         | Control baseline |
| ---------------------------------------- | ---------------- |
| Whole-work-unit verification · singleton | 1 / 0            |
| Candidate / prepublication · singleton   | 3 / 0            |
| Public review and checks · singleton     | 1 / 0            |
| Member / singleton landing · singleton   | 2 / 1            |
| Post-landing closeout · singleton        | 1 / 0            |
| Errand review / merge · singleton        | 1 / 0            |
| Member / singleton landing · member      | 1 / 1            |

Invocations / approval stops. Read isolation has no control row and no movement, so excess does not reach its three
rows.

| Boundary · shape                         | Movement row                   | Counts | Excess  | Landed |
| ---------------------------------------- | ------------------------------ | ------ | ------- | ------ |
| Whole-work-unit verification · singleton | `disjoint`                     | 1 / 0  | 0 / 0   | yes    |
| Candidate / prepublication · singleton   | `disjoint`                     | 3 / 0  | 0 / 0   | yes    |
| Public review and checks · singleton     | `disjoint`                     | 2 / 2  | +1 / +2 | no     |
| Public review and checks · singleton     | `unknown`                      | 2 / 1  | +1 / +1 | yes    |
| Member / singleton landing · singleton   | `disjoint`                     | 3 / 3  | +1 / +2 | no     |
| Member / singleton landing · singleton   | `overlapping-substantive`      | 2 / 2  | 0 / +1  | no     |
| Member / singleton landing · singleton   | `overlapping-regenerable-only` | 1 / 1  | −1 / 0  | no     |
| Member / singleton landing · singleton   | `unknown`                      | 2 / 1  | 0 / 0   | no     |
| Post-landing closeout · singleton        | `disjoint`                     | 1 / 0  | 0 / 0   | yes    |
| Post-landing closeout · singleton        | `unknown`                      | 2 / 1  | +1 / +1 | yes    |
| Errand review / merge · singleton        | `disjoint`                     | 1 / 0  | 0 / 0   | yes    |
| Member / singleton landing · member      | `disjoint`                     | 1 / 1  | 0 / 0   | no     |
| Member / singleton landing · member      | `overlapping-substantive`      | 1 / 1  | 0 / 0   | no     |
| Member / singleton landing · member      | `overlapping-regenerable-only` | 1 / 1  | 0 / 0   | no     |

`Landed` records whether the row reached the endpoint its control row reached, and it is what keeps the excess
column honest. Excess is a raw difference, so a row that stops early reads low for the wrong reason: the landing
boundary's regenerable-only row runs one fewer invocation than its control only because it never merges, its
`unknown` row reads a flat zero while the continuation leaves the reader on a drift report, and all three
delivery-member rows read zero at exactly the stops where no handle was minted. Eight of the fourteen movement
rows did not land. Every figure here is read with that column beside it.

Where the ceremony did complete, the cost is legible and small: two of the three `unknown` rows clear for one extra
invocation and one extra stop and both land, and five of the seven `disjoint` rows cost nothing at all — the
exceptions are the singleton landing and public review.

**Bare stops.** Six stops name a next action with no composed invocation to reach it, and four of the six are the
same typed result.

| Stop                                   | Row                                                      |
| -------------------------------------- | -------------------------------------------------------- |
| `reconcile / reconcile-base`           | landing `overlapping-regenerable-only` · singleton       |
| `reconcile / reconcile-base`           | landing `disjoint` · delivery-member                     |
| `reconcile / reconcile-base`           | landing `overlapping-substantive` · delivery-member      |
| `reconcile / reconcile-base`           | landing `overlapping-regenerable-only` · delivery-member |
| `rejected`, authority ref unresolvable | closeout `unknown` · singleton                           |
| `base-moved / rerun-checkpoint`        | public review `disjoint` · singleton                     |

The bare ones are the safe ones. `reconcile-base` is the only recurring bare stop, and it is what the boundary
returns once it has decided the movement is tolerable, while every refusal at the landing boundary carries a remedy.
The closeout refusal is the exception in both directions: it is a refusal, it is bare, and it clears on a plain
retry its own message never names. The public-review stop names an action but carries no argv for it.

**Classification tally.** Eleven `tolerates`, three `mechanical block`, three `fail-closed, correct`, and seven
control rows that classify no movement. **No row is `redundant ceremony`** — across six boundaries and both shapes,
nothing in the post-execution tail re-ran a ceremony on base movement alone. Each `fail-closed, correct` rests on a
continuation the probe exercised and that cleared, and each `mechanical block` on a refusal nothing is proven to
clear, so every classification follows the continuation rather than a reading of how justified the refusal looks.

### Forward-compatibility screen

Run once per routed mechanism against each project strategy's own firing conditions rather than the index summary.
Three of those surfaces are marked in-development and one provisional, so what fired is recorded as a pointer for
the owner, never as a design or an acceptance condition.

| Mechanism                                 | Fired                                                          | Pointer                                                                       |
| ----------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Refusal remedy accuracy                   | procedure-evolution                                            | precomposed text at the CLI↔agent boundary                                    |
| Typed drift dispatch                      | procedure-evolution; package-project sync                      | a verb replacing prose mechanics, in a two-copy workflow file                 |
| Errand-close base-pin coverage            | —                                                              | the testing methods settle it                                                 |
| Recommendations at approval gates         | procedure-evolution; knowledge-evolution; package-project sync | precomposed text; it grows an always-loaded surface; that surface is two-copy |
| `delivery-post-landing-conflict-recovery` | storage-evolution                                              | work-unit identity and branch coupling — a member bound to a commit           |
| `delivery-rebuild-continuity`             | storage-evolution                                              | branch coupling, and the records carried across a rebuild                     |
| Ceremony-repetition doctrine              | knowledge-evolution                                            | placement of agent-facing guidance                                            |

The PM-composition surface fired for nothing: no routed mechanism adds or moves a PM-like fact, and none changes
whether a backlog, roadmap, or inbox surface is authoritative.

One screen result reaches back into a disposition rather than forward into a capture. The procedure surface's target
model is deterministic logic in the CLI, structure in typed contracts, and **judgment in minimal prose** — which is
the layer the three judgment-bearing drift gates already occupy. Their no-fix disposition is that model's own
answer, arrived at independently, rather than only this work unit's reading of them.
