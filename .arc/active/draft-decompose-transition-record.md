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

One record per transition, written once, never edited. It unifies the store's two current record kinds — the light
`receipt` kind serving rename, removal, and park-planning, and the heavy `v3-decomposition-receipt` kind serving
decompose.

The record carries: origin slug, transition kind, recorded date, successors, and the authored incoming-edge
dispositions keyed **directly by dependent slug**. Keying by slug removes the `edgeId` digest indirection through
the machine inventory, which deletes two `namespace-corrupt` failure modes that exist only because the lookup is
digest-keyed.

It drops: `preparationId` and `receiptId` sealing, `finalized.transitionPatch`, `managedPathResults`,
`destinationDigests`, and `initialContinuation`.

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

### Accumulation

Records accumulate one per retired work unit indefinitely — references to a dead slug are arbitrarily long-lived.
That is the correct answer rather than a deferred problem: the storage direction already carries an open
history-model policy question for the user-notes ref, and this composes with it rather than receiving a bespoke
policy. The real cost is enumeration rather than disk, and `decompose-durable-consumers` already owns bounded reads.

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
- **Does `park-planning` belong in this record** or remain a separate concept? It is already excluded from the
  disposition query.
- **Removal surface is an estimate, not a verified list.** Roughly 5,000 lines of non-test source plus a comparable
  test mass are implicated across the lane trio, the record validator, the claim store and candidate discard, the
  launch and publication cluster, and parts of preparation, receipt, and finalization. Each cluster needs its own
  consumer trace before anything is cut.

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
