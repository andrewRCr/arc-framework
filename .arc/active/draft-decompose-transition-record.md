# Draft: decompose-transition-record

- **Origin:** [internal] — a proportionality assessment of the decomposition cohort, run 2026-08-05 against the
  shipped core.
- **Purpose:** The v3 decomposition receipt is transaction-verification apparatus wrapped around one durable fact.
  Git already records the mechanical transform; what it cannot record is the human's authored decision about which
  successor inherits which dependency edge. Replace the sealed receipt with a lean transition record carrying that
  fact alone, and retire the apparatus that accumulated around the heavier shape.

---

## Problem / Motivation

The decomposition transform is 18,417 lines of non-test source plus a comparable test mass — 11% of the CLI, and
4.5× the next-largest subsystem. That is not disproportionate on its own: decomposition runs a few times a week and
sits in the same operational band as review and locus resolution. The disproportion is in _what the machinery is
buying_.

Decomposition operates on markdown planning artifacts, in git, with every input already committed and the origin
surviving. A bad result is recoverable by resetting a branch. The core nonetheless implements a
`prepare → candidate → finalize → receipt → publish → launch` transaction pipeline over that substrate — and a
large fraction of it manages states the transform itself invented rather than states the problem contains.

Three findings drive this work unit.

### The planning-lane exception is circular

`decomposition-planning-lane.ts` is a passthrough when no receipt is present:

```ts
const receiptChanges = changeSet.changes.filter(touchesRetirementNamespace);
if (receiptChanges.length === 0) {
  return { outcome: classifyPlanningLane(changeSet) };
}
```

And when a receipt _is_ present, every other change must still pass the generic classifier. So the exception grants
`planning` only for change sets the generic lane would already have granted. It cannot rescue a mid-implementation
decomposition — code paths classify `reviewed` before the receipt is read.

The exception exists because the receipt lives at `.arc/system/.internal/retirement-receipts/`, which
`isPlanningArtifactPath` does not match. The receipt breaks the planning lane; an entire shipped work unit exists to
put it back.

### Launch readiness re-types an answer that already exists

`adaptProjectReadinessProvider` wraps the existing `depsOnlyReadinessProvider` and translates `ready` / `blocked`
into a parallel vocabulary, adding six refusal codes that describe failures of the adapter contract itself. Ordinary
lifecycle resolution already recomputes ready and blocked frontiers from the landed base.

### The receipt's surviving justification is small

`queryRetirementDisposition` reads exactly three things from the receipt: the origin slug, the incoming edge for a
given dependent, and the disposition the human authored for that edge. It never touches `finalized.transitionPatch`,
`managedPathResults`, `destinationDigests`, `receiptId`, `preparationId`, or `initialContinuation` — and it returns
`evidenceQuality: "tree-only"` regardless, so the digest sealing raises no consumer's confidence.

### Why now

`decompose-extraction`, `decompose-durable-consumers`, and the finalization hardening members are all sized against
the heavy receipt. `decompose-durable-consumers` already carries a spec and task list written against it. Every one
of them is cheaper to plan after this settles than before, which is why they hold on this work unit rather than
proceeding.

## Proposed direction

One record per **terminal** transition — decompose, rename, abandon — written once, never edited. It unifies the
terminal uses of the store's two current record kinds: the light `receipt` kind serving rename and abandon, and the
heavy `v3-decomposition-receipt` kind serving decompose. Park-planning stays out (§ Terminal transitions only).

The record carries: origin slug, transition kind, successors, and the authored incoming-edge dispositions keyed
**directly by dependent slug**. Keying by slug removes the `edgeId` digest indirection through
the machine inventory, which deletes two `namespace-corrupt` failure modes that exist only because the lookup is
digest-keyed.

It drops: `preparationId` and `receiptId` sealing, `finalized.transitionPatch`, `managedPathResults`,
`destinationDigests`, and `initialContinuation`. It also drops the evidence-quality channel — the v2 receipt's
`inventoryRead` and the query result's required `evidenceQuality`: the field is live-read but pure pass-through
(the query hardcodes it for v3, discharge only carries it into evidence hops, nothing branches on the value), and
pass-through is not the consumption the field-admission test protects. The query-result contract and discharge's
evidence vocabulary drop the field with it.

### Location — the record stays; the predicate moves

The record is not user-facing. The _fact_ reaches humans through `arc status <slug>`; the record is machine-read
state behind that query. `.arc/system/.internal/` is therefore the honest classification, and it is already there.
No move.

Location was never the variable — trackedness is. A tracked file under `.internal/` is what kicks a decomposition
out of the generic planning lane. The resolution is one entry in `isPlanningArtifactPath` scoped to the transitions
namespace exactly.

**Never widen the predicate to `.arc/system/.internal/**`.** That tree holds `githooks/`, `harness-hooks/`,
`scripts/`, and `skills/` — executable machinery. Matching the parent would let a hook or script change classify as
planning content and skip review.

This is why the planning lane collapses so cheaply. It is not large because of a path; it is large because it must
validate a sealed receipt before trusting it. A lean, unsealed record needs none of that validation, so the work
unit reduces to one predicate line.

### Trust boundary — a deliberate downgrade

A record the predicate treats as planning content is conventional rather than tamper-evident. This is consistent
with the rest of the planning substrate — metas, ROADMAP, and cohort docs are all hand-editable — and it is the
mechanism that dissolves the lane. It is an accepted design position, recorded here rather than discovered later.

The failure stance survives the downgrade: enumeration stays fail-closed at the namespace level — one unparseable
record still poisons every read, because bytes that cannot be classified cannot be ruled out as relevant evidence,
and dependency discharge is decision-bearing. The closed result set reduces to parse-failure, ambiguity, and
version-conflict once the digest-keyed modes go; the operator remedy is editing the record back to parseable — it
is hand-editable planning content with git history behind it.

### Terminal transitions only — park stays out

Park is a location-axis move with an inverse: the slug is not retired, `parked` derives from the artifact
location, and the authored park reason is verb input rather than receipt content. Its receipt is never history:
the disposition query excludes park, and the eight records the reference-reconcile authority reads are exactly
the terminal ones. What the receipt does serve is authorization — the out-of-band post-park teardown,
detached-husk revalidation, and the partial-protection landing arm, which authenticates a park transition commit
by the exact receipt it contains. Every input to each of those proofs is committed, so park fails the
field-admission test on both arms and stays out of the record; its authorization consumers re-derive per
§ History, never authorization. One live park receipt exists (`decompose-extraction`, parked during the
re-scope; its branch is already gone locally and on origin), dropped unconverted when the namespace retires.

### History, never authorization — the proof cluster re-derives

The disposition query is not the receipt's only consumer. A retirement-authorization cluster reads receipts by
`receiptId` after the transition lands and validates sealed fields before acting: abandon teardown reads
`source.head` and `source.artifactDigest` to prove conservation before destroying a branch or worktree
(`validateAbandonResult`), detached-husk revalidation re-reads the receipt behind a husk stamp's
`{kind: "receipt", receiptId}` evidence ref (`validateGitRetirementReceiptEvidence`), and the partial-protection
park landing authenticates the transition commit by the exact receipt it contains
(`park-planning-landing.ts`).

The settled position: **the record is history, never authorization evidence.** Every proof in that cluster
re-derives from committed git state at proof time — the transition commit located structurally (direct parent,
lifecycle index), its trees byte-compared — the same move settled above for park. The lean record may point a
proof at the right transition, but it is never the evidence, so dropping the sealed fields costs the cluster
nothing once it re-derives. Husk evidence refs need a receipt-free shape (transition kind plus a result digest
against the stamped head — a spec-level detail); per the pre-release posture no compatibility reader for old
stamps is kept — existing husks are torn down or re-stamped. `decompose-durable-consumers`' "receipt-backed
retirement authority" contract re-sizes against this: the authority it consumes becomes the re-derived proof
set, not receipt decoding. Each of the three arms gets its own consumer trace in the removal work, alongside the
clusters already listed.

### Migration is required, not optional

Eight records are live on the integration base and in active use: dependency discharge and user-reference reconcile
read transitions out of them. They encode past human decisions and are **not regenerable**, so the pre-release
"clear or regenerate development state" posture does not apply. A one-time conversion is in scope from the start:

| Lean field                          | Source in the heavy receipt                                      |
| ----------------------------------- | ---------------------------------------------------------------- |
| `origin`                            | `prepared.completedMap.machine.source.origin`                    |
| `edges[].dependent`                 | `machine.incomingEdges`, via `edgeId`                            |
| `edges[].disposition`               | `authoring.incomingDispositions`, matched by `edgeId`            |
| `successors`                        | `authoring.destinations` where `kind` is `new-member`            |
| `kind` and `successors`, light kind | `subject.name`, `transition`, `result.kind`, `result.targetSlug` |

Convert all eight, verify against current consumer behavior, then retire the namespace and its record validator.
A ninth live record — the `decompose-extraction` park receipt — is not converted; it drops with the namespace
after the post-park consumer trace (§ Terminal transitions only).

### Accumulation

Records accumulate one per retired work unit indefinitely — references to a dead slug are arbitrarily long-lived.
That is the correct answer rather than a deferred problem: the storage direction already carries an open
history-model policy question for the user-notes ref, and this composes with it rather than receiving a bespoke
policy. The real cost is enumeration rather than disk, and `decompose-durable-consumers` already owns bounded reads.

## Non-goals and scope guards

The origin of this work unit is a proportionality failure — machinery grown around states the problem does not
contain. These guards exist so the replacement cannot re-grow it. They carry forward into the spec as standing
constraints: a proposal that trips one is a scope decision routed back to planning, never an implementation call.

- **Field-admission test.** The record carries a fact only if git cannot reconstruct it _and_ a live consumer
  reads it today. A proposed field failing either arm stays out — no fields added for consumers that might want
  them later; a future consumer that needs more is that work unit's scope question, not this record's. One
  recorded exception: `successors` is one unified field because rename's target is live-read; decompose's
  successor list rides the same field rather than minting a second shape — git could reconstruct it from the
  transition commit, so the spec may narrow it if no consumer materializes.
- **No integrity machinery.** Written once, never sealed: no digests, no record or preparation identifiers, no
  validation beyond parsing the shape. Git commit history is the tamper-evidence layer, shared with the whole
  planning substrate (§ Trust boundary); its consumers are advisory with an operator approving the result, and a
  forger who can edit a record can reseal it, so sealing without an external trust anchor detects nothing. A
  genuine future integrity need is substrate-wide — signed commits, host-side protection — and per-record sealing
  does not return.
- **No invented states.** The replacement mints no new transient, claim, candidate, publication, or launch state.
  Whatever the claim-store trace (§ Unknowns) shows must be kept is kept as-is, not redesigned into a successor
  mechanism.
- **The predicate stays exact.** One `isPlanningArtifactPath` entry scoped to the transitions namespace exactly;
  never widened toward `.arc/system/.internal/**` (§ Location).
- **No parallel readiness vocabulary.** Lifecycle resolution stays the sole authority for ready / blocked
  frontiers. Nothing in this work re-types, adapts, or wraps that answer.
- **No retention or compaction policy.** Accumulation is accepted (§ Accumulation) and composes with the storage
  direction's open history-model question; this work unit adds no bespoke pruning, archiving, or GC.
- **No storage lift.** The record shape stays storage-agnostic, but the tier-2 backing store and materialized
  rendering remain out of scope — no gitignored materialization, no propagation machinery.
- **One-way migration.** The eight live records convert once and the old namespace retires with its validator. No
  dual-read bridge, alias, or compatibility reader survives the conversion (per the pre-release posture — and the
  authored dispositions themselves are preserved by conversion, not by keeping the old shape readable).
- **Refusal work is subtractive only.** Codes describing deleted states go with their states; no renumbering or
  redesign of surviving codes, and remedy authoring belongs to `decompose-finalization-diagnostics`.

## Alternatives

- **Keep the spine.** Status quo. The circular lane stays, `decompose-durable-consumers` continues consuming the
  heavy receipt, and the finalization members keep optimizing machinery whose shape is unsettled. Rejected: every
  downstream member is more expensive to plan.
- **Stop the bleeding only** — right-size the unshipped queue and leave shipped code alone. Cheap and safe, but it
  forgoes most of the value: the downstream collapse comes from the core changing shape, not from the queue being
  re-scoped around an unchanged core.
- **Materialize the record now** — gitignored, rendered from a backing store. This is the eventual direction and it
  dissolves the lane question entirely, since materialized files never appear in a diff. Not reachable yet:
  consumers on every machine need this data, and gitignored content does not propagate until the tier-2 backing
  store exists. Keep the record shape storage-agnostic so the later lift needs no reshaping.

## Unknowns and Assumptions

- **Claim-store concurrency is unverified.** The transient claim machinery is machine-local, so it buys nothing
  cross-machine. Two concurrent decompositions on one machine are plausible, and it is _not_ established that
  branch-name collision covers every interleaving the claim store guards. **Trace before cutting.**
- **Refusal handling is a remedy problem, not a count problem.** The corpus carries 92 distinct typed refusal codes.
  Typed CLI-computed refusals are correct; the defect is a missing precomposed remedy. With a remedy, 92 costs the
  executing agent nothing; without one, ten still force improvisation. Codes describing solution-invented states go
  when their state goes. This overlaps `decompose-finalization-diagnostics` directly — that member may be more
  justified than its hold suggests, and should be revisited first.
- **`decompose-candidate-abandon` is expected to largely dissolve** — its scope is the stranded states the
  candidate and claim model invented. Its draft has not been read; confirm against it before acting.
- **Removal surface is an estimate, not a verified list.** Roughly 5,000 lines of non-test source plus a comparable
  test mass are implicated across the lane trio, the record validator, the claim store and candidate discard, the
  launch and publication cluster, the retirement-authorization cluster (abandon teardown, husk revalidation, park
  landing — § History, never authorization), and parts of preparation, receipt, and finalization. Each cluster
  needs its own consumer trace before anything is cut.

## Forward-compatibility check

| Check-doc           | Result                                                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage evolution   | An earlier shape placed the record at a planning-artifact path chosen to satisfy the diff predicate — a direct violation of the record/projection principle. Corrected: the record is operational state, stays in `.internal/`, and resolves its path through the storage layer |
| Procedure evolution | Reframed the refusal finding from collapsing codes to emitting remedies. Verbs-over-mechanics applies to the decomposition workflow's prose                                                                                                                                     |
| Knowledge evolution | Does not fire — scope is the non-procedural guidance layer; this is operational state                                                                                                                                                                                           |
| PM composition      | Fires lightly on dependency and completion facts. Authority: ARC alone, no external tracker. Duplication: replaces a record rather than adding a copy. Identity: internal slugs. Passes                                                                                         |

Surfaced and not owned here: `isPlanningArtifactPath` is itself a tracked-tree assumption — a hard-coded path regex
deciding review-bearingness, which stops matching most of its own list once operational state materializes.

## Losses accepted knowingly

- **Automatic restore becomes manual.** A crashed source finish leaves a partly-thinned tree recovered with a git
  checkout rather than an in-process preimage restore. Correctness is preserved because all inputs are committed;
  the cost is that the operator must know.
- **The initial-continuation choice goes** with the launch cluster. After decomposing, the operator picks a
  successor and starts it.
- **Record-time reachability provenance goes.** `inventoryRead` recorded whether the remote was reachable when a
  retirement was recorded; nothing ever branched on it, and the lean record does not carry it.

## Scope Estimate

Large. Removal plus a required one-time migration of eight live records, a narrowly-scoped predicate change, and a
consumer trace per cluster before cutting.

Retires `decompose-planning-lane`, which is shipped, as dead code.

Holds until this settles: `decompose-extraction`, `decompose-durable-consumers`, `decompose-finalization-scaling`,
`decompose-finalization-diagnostics`, and `decomposition-doctrine` — doctrine cannot codify against machinery whose
shape is unsettled.

Proceeds unchanged: `decompose-conservation-coverage`, which may need to grow rather than hold level, since
conservation proof becomes the only net once transaction verification is gone; `decompose-authoring-expressiveness`;
`decompose-preflight-scaling`.
