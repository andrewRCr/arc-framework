# Draft: Delivery Post-Landing Conflict Recovery

- **Origin:** `USER-INBOX § Work Unit`, minted from the routing close-out of
  `concurrent-integration-characterization` (2026-09-14), which carried its captures and added field evidence.
- **Purpose:** Give a landed delivery member a typed route back to closeout when its retained suffix, its terminal
  binding, or the shape of the base history leaves the exact-head comparison unsatisfiable — without relaxing that
  comparison or turning an Owner authorization into a general escape contract.
- **Planning posture:** The failure is proven, live, and currently blocking. The recovery mechanism still needs
  design, and the surface spans the checkpoint, Candidate applicability, review readiness, and closeout, which
  establishes `Class: Heavy` and a `P1` slot.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

Both routed captures are reproduced below in full and removed from the inbox, so this draft is the single
authoritative source for the concern.

### `[ ]` **Make post-landing stack conflicts recoverable**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: delivery-post-landing-conflict-recovery (planned)`), routed at the
  `concurrent-integration-characterization` close-out, 2026-09-14.

- _Observation:_ `evidence-applicability` Member 1 PR #618 merged at `b088fff0` under a native linked-single
  reservation, but Member 2 PR #619 was retargeted to `main` without a new head and became conflicting; Member 3
  remains open. Delivery State revision 25 retains the exact M1 land operation. Both `delivery native land-status`
  and `delivery reconcile` enter the same suffix settlement. It replays the pinned pre-landing M2 contribution onto
  the landed predecessor and returns `contribution-conflicted` before it can evaluate a resolved M2 head or publish
  state. Its instruction to resolve paths and retry has no completing input: an external stack rebase alone cannot
  change the pinned replay, and the existing provider-adoption conflict decision cannot enter an active native-land
  reservation. This is a normal concurrent-stack conflict with a missing recovery transition, not an ambiguous M1
  merge result.

- _Approach:_ Design a durable, re-enterable post-land settlement that records the verified M1 effect once and
  admits an attended resolution for the remaining registered suffix and excluded terminal top. Bind the decision to
  the exact plan, operation, state revision, observed suffix, member identities, before/after refs and trees, and
  conflict paths. Require semantic approval only for the disclosed conflicted contributions; continue mechanical
  proof for every other movement. Reobserve host effects and refs, use lease-checked publication and revision-checked
  state writes, and make interrupted retries converge without resubmitting M1. Decide whether a durable
  `landed-awaiting-suffix-resolution` phase or an equally complete reservation-local transition best composes with
  the existing provider-adoption conflict machinery.

- _Success criterion:_ After a real overlapping base change prevents GitHub's M2 rebase, the CLI returns an exact
  actionable resolution offer; approved M2 and top resolutions can settle the retained operation and continue the
  delivery. New member heads receive fresh applicability, review, and checks before landing. Stale decisions,
  undisclosed divergence, ref collisions, incomplete suffix observations, and ambiguous host results still refuse
  without claiming clearance. Cover conflicting and clean suffixes, terminal-top conflict, and interruption/retry
  with Git-backed and handler-level tests, including no duplicate merge submission.

- _Boundary:_ Do not weaken repository-wide contribution proof, accept arbitrary state edits, or fold in unrelated
  prepublication authoring and review-fix convergence. The Owner-directed one-time recovery of the live
  `evidence-applicability` reservation is an urgent operational unblock, not a prerequisite WU lifecycle or evidence
  that the durable mechanism is complete.

- _Files:_ Native landing and suffix reconciliation, delivery execution request/result schemas, contribution and
  terminal absorption composition, the `deliver-stack` workflow, and focused unit/integration tests.

- _Captured during:_ `evidence-applicability` M1 post-landing recovery, 2026-09-13.

### `[ ]` **Make multi-base delivery terminal reconciliation actionable**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: delivery-post-landing-conflict-recovery (planned)`), routed at the
  `concurrent-integration-characterization` close-out, 2026-09-14.

- _Home fit:_ The existing post-landing recovery target already owns settlement of the retained suffix and
  terminal top after a member lands. This is a second, later failure at that same landing-to-terminal boundary;
  integrate it during that target's planning rather than minting a separate work unit.

- _Observation:_ After `evidence-applicability` Member 2 PR #619 landed, the terminal branch and `origin/main`
  had two best merge bases (`823239161` and `b5344fb19`). `arc base drift` had complete integration-event evidence
  but returned `overlap: unavailable / merge-base-failed`; `arc integrate checkpoint` stopped at
  `delivery-terminal-blocked / drift-classification-unavailable` and offered only a checkpoint retry. A local
  virtual merge was conflict-free and added just five unrelated base paths, but the typed checkpoint could not
  authorize the exact append-only base merge. An Owner-approved, exact-base/head `arc base merge` unblocked this
  instance; that one-time authorization is not a general escape contract.

- _Second locus:_ After that exact base merge and ordinary archive composition, Candidate applicability still
  compared the durable baseline `d1d25ef86` to the landed base `6804c40e4`, found the same two best merge bases,
  and stopped `classification-unavailable / merge-base-ambiguous`. The ordinary `attest` fallback instead reported
  roughly 130 removed paths and demanded a full new root, although the terminal branch already contains the
  landed predecessor. Include the Candidate producer and its recovery path in the post-landing design; neither a
  clean Git virtual merge nor a prior review alone establishes evidence carry.

- _Third locus:_ With terminal PR #620 at the post-archive head `841ddb632` while Delivery State still binds its
  member to reviewed head `57ce62b1d`, `arc review readiness` refuses `delivery-member-unbound`. Thus the typed
  draft-lock release cannot complete even if independent evidence proves the terminal contribution unchanged.
  The recovery design should carry a current terminal binding through review readiness and lock release, without
  treating a new commit ID alone as a fresh review obligation or weakening exact-head host merge protection.

- _Fourth locus:_ An explicitly approved, host-head-matched manual merge landed PR #620 at `841ddb632` into
  `main` as `cbf075da`. `arc review change-request resolve` confirms `merged-at-head`, but
  `arc delivery closeout` refuses `terminal-unsettled`: the retained terminal member still binds `57ce62b1d`,
  so the exact merged-host-head comparison fails. No delivery JSON, refs, or reservation were manually changed;
  typed closeout and physical teardown remain pending. Include a safe post-merge rebind or exact recovery route
  that can retire this residue without repeating verification or review solely for the binding mismatch.

- _Approach:_ Decide whether a conservative overlap proof across multiple best bases can admit the ordinary
  checkpoint and Candidate applicability, or whether the correct bounded route is a typed Owner-directed
  exact-base reconcile and Candidate decision when Git feasibility and integration/host evidence suffice. Preserve
  fail-closed treatment for unresolved substantive overlap and stale coordinates; never infer disjointness from a
  clean virtual merge alone. Cover native linked-single landing plus concurrent-base topology, clean and
  conflicting cases, and retry after a new head.

- _Scope:_ Public delivery terminal checkpoint, Candidate currentness, lock release, and post-merge closeout
  authority; not private delivery rebuilding, a review waiver, or automatic terminal merge approval.

- _Files:_ base overlap/drift analysis, `git-candidate-applicability.ts`, integration checkpoint composition,
  exact-base merge continuation, and delivery terminal integration tests.

- _Captured during:_ `evidence-applicability` terminal landing dogfooding, 2026-09-14.

---

## Problem / Motivation

Ordinary base movement after a member lands can leave a merged member under a reservation with no typed conflict
continuation. The exact-head comparisons that protect delivery are correct; what is missing is any route back when
independent evidence already proves the contribution landed and only the binding disagrees.

### The live instance

`evidence-applicability` landed on `main` as `cbf075da7`, its final member merged at head `841ddb632`, and its
archival composed. `arc review change-request resolve` reports `merged-at-head`. `arc delivery closeout` refuses
`terminal-unsettled`: the retained terminal member still binds reviewed head `57ce62b1d`, so the exact
merged-host-head comparison fails. No delivery JSON, refs, or reservation were changed by hand. Typed closeout and
physical teardown remain pending, which holds that checkout open and queues `candidate-reroot-recovery-frame`
behind it.

An Errand — **Retire the terminal binding residue blocking a landed delivery's closeout** — retires this specific
residue operationally. It is explicitly bounded to the one-time recovery and must not implement the durable route,
which is this work unit's.

### The four recorded loci

1. **Merge-base ambiguity at the checkpoint.** After member PR #619 landed, the terminal branch and `origin/main`
   had two best merge bases (`823239161` and `b5344fb19`). `arc base drift` held complete integration-event
   evidence and still returned `overlap: unavailable / merge-base-failed`; `arc integrate checkpoint` stopped at
   `delivery-terminal-blocked / drift-classification-unavailable` and offered only a checkpoint retry. A local
   virtual merge was conflict-free and added five unrelated base paths.
2. **Candidate applicability against the same ambiguity.** Applicability compared durable baseline `d1d25ef86` to
   landed base `6804c40e4`, found the same two best merge bases, and stopped
   `classification-unavailable / merge-base-ambiguous`. The ordinary `attest` fallback reported roughly 130 removed
   paths and demanded a full new root, although the terminal branch already contained the landed predecessor.
3. **Review readiness against a moved terminal top.** With terminal PR #620 at post-archive head `841ddb632` while
   Delivery State still bound its member to reviewed head `57ce62b1d`, `arc review readiness` refused
   `delivery-member-unbound`, so the typed draft-lock release could not complete even with independent evidence
   that the terminal contribution was unchanged.
4. **Closeout against the merged host head.** The fourth locus is the live instance above.

---

## Evidence from the characterization

`concurrent-integration-characterization` probed the landing and closeout boundaries against a moving base. Three
observations bear on this design; each is a recorded ledger row rather than a claim.

- **The merge window discards the overlap partition.** `readFinalDrift` reads `verdict` alone and emits
  `invalidated / drift-reconcile` with a `{ verdict }` payload. A base advance sharing no path with the branch
  therefore still costs a reconcile, a fresh checkpoint, and a fresh approval: the clean control span is two
  invocations and one approval stop, and the same span under a disjoint advance is three and three. The advance's
  disjointness is known at the checkpoint and discarded before the merge window consults it.
- **A base advance that is not merge-shaped is unreconcilable at the checkpoint, however disjoint it is.** The
  refusal reports an empty overlap and a mergeable host, and rests entirely on the advanced commit carrying no
  landing provenance to classify. A merge-shaped advance at the same boundary clears. Removing the
  integration-evidence term from the safety conjunction turns the same run into `reconcile / reconcile-base`.
- **Post-landing closeout tolerates a moved base, but one predicate deep.** The reap refetches and reads this work
  unit's own membership in the completed index at the refetched tip; landing shape never enters, so a direct push
  and a merge landing read identically. Refusing when the refetched head differs from the local base tip would turn
  that tolerance into a stop with nothing else changing.

## Recommendations, not decisions

Offered from the evidence above; this work unit's planning owns the actual design.

- Separate a binding that is **stale** from one that is **wrong**. The exact-head comparison is the right
  protection; what the recorded loci all share is that independent evidence already proved the contribution landed
  and only the coordinate disagreed. A typed rebind for exactly that case is narrower than relaxing the comparison.
- Treat merge-base cardinality as a first-class input rather than a failure. Three of the four loci are one
  ambiguity surfacing at three different verbs, each with its own refusal vocabulary.
- Do not relax exact-head host merge protection, weaken terminal absorption checks, or treat a new commit id as a
  fresh review obligation. A conflict-free virtual merge alone does not establish evidence carry.

## What the characterization did not cover

Its enumerated matrix spans **base movement only** — boundary by movement kind. Head movement under a bound record,
merge-base cardinality, and a ceremony's own writes moving the head its preconditions were read against were all
outside it, and those are where the loci above actually live. A second matrix covering those axes was added to that
work unit after this stub was written; read its ledger rows in
`notes-concurrent-integration-characterization.md` before starting design, rather than treating the first matrix's
`tolerates` verdicts as coverage of this surface.
