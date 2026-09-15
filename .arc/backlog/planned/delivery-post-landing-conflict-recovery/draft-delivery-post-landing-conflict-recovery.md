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

Two captures in `USER-INBOX § Work Unit` name this slug and route here at the next drain: **Make post-landing stack
conflicts recoverable** and **Make multi-base delivery terminal reconciliation actionable**. The second carries four
loci and is the origin of most of the evidence below. They are left in the inbox rather than moved here, because the
drain owns that transit; this note exists so neither is lost in the meantime.

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
