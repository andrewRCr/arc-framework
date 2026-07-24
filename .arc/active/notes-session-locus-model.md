# Notes: session-locus-model

## Contents

- [Codebase pointers](#codebase-pointers)
- [Dogfood evidence trail](#dogfood-evidence-trail)
- [Adjacent work and shipped substrate](#adjacent-work-and-shipped-substrate)
- [Right-sizing audit (2026-07-22)](#right-sizing-audit-2026-07-22)
- [Chunked-review finding triage (2026-07-24)](#chunked-review-finding-triage-2026-07-24)

## Codebase pointers

- **Grooming-as-residue misclassification** — `in-flight-derivation.ts:1303` emits a cleanup-needed advisory for
  the sanctioned `chore/groom-*` branch because residue detection reads branch shape, not records; it re-fires on
  effectively every CLI invocation (observed 5× in one session, 2026-07-15), and `arc start` mislabels the emission
  a "ROADMAP advisory". The durable fix (Proposed Design D8/D11) is records-based classification — detectors read
  the groom-kind identity record plus the machine-local role, never branch shape.
- **Raw materialize arm** — session-init's Errand materialization currently uses raw `git worktree add`, producing
  markerless worktrees invisible to cleanup surfaces (a self-teardown can leave a markerless husk). D7 replaces it
  with `arc errand materialize`, which writes the ownership marker plus role record at creation.
- **Marker vs. record** — the ownership marker is durable provenance the sweep trusts; the locus record is the live
  frame. They stay distinct artifacts written at the same creation site.

## Dogfood evidence trail

The model was motivated by FP (finalize-parallelism) wave-2/wave-3 dogfooding; the full findings live in
`notes-finalize-parallelism.md`. Key references for design rationale during task-gen/execution:

- **§ Dogfood finding (2026-07-14)** — the originating wave-2 failures: warm `errand open` displaced the WU worktree
  onto the errand branch and hard-blocked on the WU's uncommitted notes; `errand close` died on `git switch main`
  (base held by the primary); a mid-errand compaction recovered errand context only — the suspended WU frame
  survived only in the harness summary. All were checkout-identity failures, not model failures.
- **§ Wave-3 seam-audit decisions (decision 5.3, 2026-07-17)** — settled the serialized-primary default over
  ephemeral-worktree-by-default: out-of-WU work occupies the free primary, one session at a time; warm entries are
  occupancy-keyed (relocate to the free primary, else spawn), not temperature-keyed; spawn is the non-default
  fallback; the sequential drain is codified, addressing "sequential feels slow" by tightening per-errand overhead
  rather than by parallelism. This is why the default (D1/D7) is primary-serialized with spawn as fallback.
- **§ 7.3** — the linked-session husk/orphan cleanup gate: cleanup surfaces render only in the primary worktree,
  invisible to operators in linked worktrees; FP preserved that boundary expecting this record's read verb to lift
  it eventually (a `husk-lifecycle-drivers` seam, not owned here).

## Adjacent work and shipped substrate

- **Mechanization errands around the model** (not this WU's execution): the base-sync verb and `stub-mint-to-launch`
  (in `backlog/planned/`) are determinate mechanization errands; a near-term residue-detector patch (teach the
  detector the `chore/groom-*` shape, dedup the emission, fix the `arc start` provenance label) is a stopgap around
  the durable records-based fix this WU ships.
- **Shipped substrate this builds on**: BI-1 worktree provisioning (spawn/teardown cost dismantled — spawn is cheap
  now), `worktree-teardown-decoupling` (the shipped-husk transition plus the driver socket the lease composes with),
  and PR #241 (the v2 `returnBranch` topological close fix — consumed as the degrade-path shape, superseded for the
  default by displacement removal).

## Right-sizing audit (2026-07-22)

Standalone `design-audit` run over the spec and the delivered implementation against the draft's motivating
intent, ahead of verification — prompted by the disproportion pattern remediated in `review-architecture`.
Efficacy holds: all six motivating failures (worktree displacement, base-held close failure, lost suspended
frame, groom-residue misclassification, markerless materialization, cleanup-vs-live-session) are solved. The
findings are fit/optimality: the spec answered every question the draft deliberately left open at the
maximum-exactness end of the range, and several operator-facing surfaces pay for guarantees the single-operator,
machine-local domain does not need. Phase 7.R carries the remediation; task letters below.

Major findings:

- **Lease scope gap (7.R.b)** — spec D4/D11 expect session-init to attach/refresh the session lease; the shipped
  workflow attaches only on a resolved live-lease match, which a fresh session never produces. Plain WU sessions
  therefore run leaseless (`frame: idle` on a live checkout), leaving the liveness apparatus mainline-idle and the
  roster's session-visibility goal unmet. Resolution: ratify verb-scoped leases and align spec, workflow, and
  narration claims.
- **Warm-entry capability table (7.R.c)** — hard `cold-entry-required` refusal keyed to harness process forensics;
  table churn began pre-ship (`f6d6bda87`). Demote to an operator-confirmed advisory.
- **Awaiting-merge rigidity (7.R.d)** — resume/materialize demand host-proven `requested-work`, so a plain-open
  own PR cannot be resumed to push one more commit. Relax to open-change-request-at-recorded-head; host truth
  stays required only where identity retires.
- **Housekeep plan-commitment protocol (7.R.e)** — canonical plan file, per-entry source digests, immutable plan
  digest, persisted monotonic lane, and dispatch IDs protect against a mid-sweep interruption whose real cost is
  re-confirming a list. Trim to execute-bound marking plus one-live-sweep serialization.
- **Groom overlap arbitration (7.R.f)** — cross-machine unique-winner CAS with exact-set retry adoption, for a
  race a single operator cannot meaningfully lose. Trim to same-key/overlapping-member conflict semantics.

Minor: `locusGuidance` renders non-actionable litany every init — seven `worktree-without-role` diagnostics plus
per-row no-deletion-authority cleanup lines in this repo (7.R.h); routine narration presents bare "locus" to the
operator (7.R.g); `heartbeatAt` changes no verdict and grants nothing (kept as-is; do not extend).

Keep-list (retained deliberately; do not extend): platform inspectors and PID-plus-start-token liveness, the
record store with atomic replace plus record-scoped locks and stale-break protocol, staged provisioning receipts,
teardown linearization, determinism/sorting rules, the v3 identity state model and complete-basis transaction
core, and the `arc locus` reader with typed session-init verdicts. These are internal, tested, and
friction-neutral; deleting them buys churn, not simplicity. Guiding boundary for future edits: full exactness on
data-destroying paths; advisory or simple-conflict semantics on operator-facing routine paths.

## Chunked-review finding triage (2026-07-24)

The chunked-review hierarchy reviewed this branch pinned at `0c5dd045a` against base `ebe446fe2` and returned 66
deduplicated findings with a `changes-requested` whole-target verdict. The reviewing effort classified its own
mechanics **supports-scalability**: 17 leaf contexts, four root seams, and one top seam reconstructed a coherent
verdict over 43,754 changed lines without any leaf reporting partiality, context overload, or malformed scope.
Finding density is outcome evidence, not a reviewability failure.

**Packet standing.** The packet is advisory, SHA-bound, and never satisfies a review obligation on its own — every
item is verified against source before any fix is applied. Two independent spot checks confirmed its calibration:
the probe adapter does throw on the unverifiable anchor its own reader accepts, and in-place resume does supply
`attachSession` and `deferCheckout` together into a driver that rejects the un-switched branch.

**Decay is smaller than the packet's own warning implies.** The only delta between the reviewed head and the
branch tip is the handoff commit's meta edit, so every reviewed line of code is unchanged. Base reconcile adds
little: of the sibling's changed runtime files only `cli.ts` and `init-recipe.json` are named in any finding, and
the remaining base integrations carry no substantive overlap. Post-reconcile revalidation therefore lands on a
handful of loci rather than the whole set.

### Root causes, not 66 independent defects

The findings restate a small number of causes across leaves; fixing by cause is what keeps the remediation
bounded. Some findings sit in two causes — the grouping drives the work, it is not a partition.

- **Unknown collapsed into absent** — an error or unverifiable state renders as empty or default instead of
  stopping or surfacing unknown.
- **Destructive dispatch without exact proof** — a mutation that can delete or overwrite work proceeds on evidence
  gathered before the lock that authorizes it.
- **Mutation before proof, with no compensation** — external state changes ahead of its authorizing proof, and a
  post-mutation failure leaves durable residue with no replay path.
- **Receipts that misdescribe the operation** — outcomes derive from one stage rather than the whole transaction,
  so a command reports idempotent after authoritative local change.
- **Typed boundaries that leak** — errors escape the declared vocabulary, and success shapes validate without the
  authority coordinates a caller needs.
- **Anchor identification** — wrapper and shell classification can bind a lease to a short-lived process.
- **Claims that outrun the code** — spec, workflow, quick-reference, and distribution assertions that the
  implementation does not meet.
- **Tests asserting the double** — the reason a 66-defect branch held a green suite: the resume round-trip injects
  an always-successful driver, the current-open e2e cases seed legacy records, and a rewrite dropped the
  derivation-floor integration coverage.

### Disposition

- **59 in scope** — Phase 7.E in `tasks-session-locus-model.md`. Everything destructive, every named path that
  does not work, and every claim the work unit makes about itself that is false.
- **6 carved** to a follow-on unit — the systematic generation-capability contract and its failure-injection test
  substrate: `L4-F2` (≡ `A-F2`), `L4-F4`, `A-F4`, `E4-F2`, `W1-F5`, and the whole-lifecycle portion of `P1-V1`.
- **1 already resolved** — `R1-F5`, corrected by the handoff commit that follows the reviewed head.
- **1 did not reproduce** — `S2S1-002`, rejected on verification during Phase 7.E execution (below).

**`S2S1-002` does not reproduce.** The finding reads a hard-coded `activeExtensions: []` in the recovery base
manifest as dropped context that both the seed and the fresh load set then agree on. `resolveLoadSetManifest`
declares that input and never reads it: extension bodies are excluded from every load set by design, and
active-extension names reach workflows through the status envelope's own extensions slot. Both the work-unit
projection and the recovery base call that same function, so an empty set and a populated one produce identical
manifests — verified by a temporary invariance check over both the execution and between-work-units shapes. The
compaction seed carries no extensions field at all, so there is nothing to drift and nothing for the audit to
agree on incorrectly. What was real is the inverse of the prescribed fix: a required parameter no output depended
on, threaded through eighteen files. It was removed rather than populated, which makes the exclusion structural.

**Why the carve is decomposition rather than deferral.** The carved set is one design question — what exact
generation capability every mutator carries, and where it is revalidated under lock — plus the failure-injection
and replay substrate needed to prove it. That is spec-worthy on its own terms, it does not exist in the tree
today, and authoring it under merge pressure on a branch this size is the disproportion that produced this
situation. The carved items are races between concurrent sessions whose consequence is a stolen lease, a stale
receipt, or a lost marker generation; every member whose consequence is destroyed or stranded work stayed in
scope, including `L2-F1`, `E2-F2`, `E3-F2`, `E4-F1`, and `E5-F1`. Each Phase 7.E fix still carries targeted
coverage for the path it touches — only the systematic injection matrix is carved.

**Recorded risk of the carve:** the model ships with known non-destructive race windows between concurrent
sessions on the same machine. This is a stated position, not an oversight.

### Remediation shape

The leaf partition is reusable as a delivery map, not only a review map. Each Phase 7.E task decomposes into
leaf-scoped subtasks at entry, so its re-review is a bounded delta against that leaf's preserved report rather
than a fresh pass over the whole target. That keeps the post-fix review obligation proportional to the fix delta
and closes the loop with the method this branch motivated.

### `7.E.c.i` carve boundary — settled 2026-07-24

`L2-F1`'s correction boundary reads "carry an exact generation capability into every subject driver and
revalidate it before identity, ref, checkout, teardown, or role-pop mutation" — wording indistinguishable from the
systematic generation-capability contract carved to a follow-on unit with `L4-F2`, `L4-F4`, `A-F4`, `E4-F2`, and
`W1-F5`. Read literally, the leaf rebuilds what the carve exists to defer. Source says otherwise.

**The capability is already carried and revalidated on all three abandon paths.** `abandon-runtime.ts` re-reads
the record under its lock and compares `recordId` and `checkoutPath`; `housekeep/lifecycle-runtime.ts` and
`groom/close-runtime.ts` both check marker provenance against `{slug, claimId}` and HEAD against `expectedHead`,
then call `popOwnedLocusRole` with `recordId`, an `expectedSubject` carrying the claim, and `expectedLeaseId`.
Every one proves an exact generation before its destructive pop.

**The defect is one degree narrower than the finding states.** Each driver derives its expected generation from
its _own_ roster read by slug rather than from the generation the resolve path selected and validated, so each is
internally consistent but unbound to the caller's selection. The race window is exactly between those two
selections. `resolveLocusGeneration` validates record, lease, claim, and checkout, then discards all of it and
dispatches with `(subject, action, key)`.

**Fix shape:** thread the already-validated identifiers into the three drivers and have each assert its
re-derived generation equals the caller's, refusing on mismatch. The `resume` arm of the same dispatch is the
working precedent — it binds record and lease under lock and refuses with "the dead transient generation changed
before resume." A resolve-side pre-check is **not** viable: all three drivers acquire the same record lock
themselves, so locking before dispatch deadlocks or refuses against itself. Revalidation can only happen inside
each driver, under the lock it already takes.

**Stop tripwire.** Re-carve to the follow-on unit if the fix requires _either_ introducing a shared capability
type or abstraction, _or_ touching any mutator outside the three abandon drivers. Neither should be necessary:
the values exist on both sides of the seam, and the race is constructible deterministically by replacing the
record between selection and dispatch, so no failure-injection substrate is needed.

**Open before implementing:** where each driver derives its expected values from is inferred from the dispatch
signature passing only `key`, not traced to source. If a driver already accepts an externally supplied
generation, its fix is smaller still; nothing found suggests any needs the comparison built from scratch, which
is the case that would favor carving instead.
