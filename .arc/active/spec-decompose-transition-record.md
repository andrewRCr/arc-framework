# Spec (`detailed` · `RFC`): decompose-transition-record

- **Origin:** [internal] — a proportionality assessment of the decomposition cohort, run 2026-08-05 against the
  shipped core.

- **Purpose:** Replace the sealed v3 decomposition receipt with a lean transition record carrying the one fact
  git cannot reconstruct — the authored disposition of each incoming dependency edge — and retire the
  transaction-verification apparatus that accumulated around the heavier shape.

---

## Introduction / Context

Decomposition operates on markdown planning artifacts, in git, with every input already committed and the origin
surviving; a bad result is recoverable by resetting a branch. The shipped core nonetheless implements a
`prepare → candidate → finalize → receipt → publish → launch` transaction pipeline over that substrate — 18,417
lines of non-test source plus a comparable test mass, a large fraction of which manages states the transform
itself invented rather than states the problem contains.

Three source-verified findings force the redesign:

- **The planning-lane exception is circular.** The receipt's storage location (`.arc/system/.internal/`) is what
  kicks a decomposition out of the generic planning lane; the shipped `decompose-planning-lane` exception exists
  only to put it back, and grants `planning` only to change sets the generic lane would already have granted.
- **Launch readiness re-types an answer that already exists.** `adaptProjectReadinessProvider` wraps the existing
  `depsOnlyReadinessProvider` into a parallel vocabulary with six refusal codes describing failures of the
  adapter contract itself; ordinary lifecycle resolution already computes ready and blocked frontiers.
- **The receipt's surviving justification is small.** The disposition query reads three things — origin, incoming
  edge, authored disposition — and never touches the sealed fields; the digest sealing raises no consumer's
  confidence.

Downstream, `decompose-extraction`, `decompose-durable-consumers`, and the finalization hardening members are all
sized against the heavy receipt and hold on this work unit; each is cheaper to plan after this settles.

The full design rationale, alternatives analysis, and consumer-accounting evidence live in the draft this spec
crystallizes; the design below is the settled outcome.

## Goals

- One durable, human-legible record per **terminal** transition (decompose, rename, abandon) carrying only the
  facts git cannot reconstruct.
- A decomposition's change set classifies `planning` through the **generic** planning lane, with no
  decomposition-specific exception module.
- Retirement-adjacent authorization (abandon teardown, husk revalidation, park landing and teardown) holds its
  current safety with proofs **re-derived from committed git state**, not record fields.
- The eight live terminal records convert once, with consumer-visible behavior preserved; the sealed-receipt
  namespace, its validator, and the apparatus clusters retire.

## Non-Goals

Carried forward from the draft as standing constraints: a proposal that trips one is a scope decision routed
back to planning, never an implementation call.

- **Field-admission test.** The record carries a fact only if git cannot reconstruct it _and_ a live consumer
  reads it today. A proposed field failing either arm stays out — no fields for consumers that might want them
  later. One recorded exception: `successors` is one unified field because rename's target is live-read;
  decompose's successor list rides the same field rather than minting a second shape — the spec may narrow it if
  no consumer materializes.
- **No integrity machinery.** Written once, never sealed: no digests, no record or preparation identifiers, no
  validation beyond parsing the shape. Git commit history is the tamper-evidence layer; a genuine future
  integrity need is substrate-wide (signed commits, host-side protection) — per-record sealing does not return.
- **No invented states.** The replacement mints no new transient, claim, candidate, publication, or launch
  state. Whatever the claim-store trace shows must be kept is kept as-is, not redesigned into a successor
  mechanism.
- **The predicate stays exact.** One `isPlanningArtifactPath` entry scoped to the transitions namespace exactly;
  never widened toward `.arc/system/.internal/**` — that tree holds executable machinery, and matching the
  parent would let a hook or script change skip review.
- **No parallel readiness vocabulary.** Lifecycle resolution stays the sole authority for ready / blocked
  frontiers; nothing re-types, adapts, or wraps that answer.
- **No retention or compaction policy.** Records accumulate indefinitely; the open history-model question
  belongs to the storage direction, and this work adds no bespoke pruning, archiving, or GC.
- **No storage lift.** The record shape stays storage-agnostic, but the tier-2 backing store and materialized
  rendering remain out of scope.
- **One-way migration.** No dual-read bridge, alias, or compatibility reader survives the conversion.
- **Refusal work is subtractive only.** Codes describing deleted states go with their states; no renumbering or
  redesign of surviving codes; remedy authoring belongs to `decompose-finalization-diagnostics`.

## Proposed Design

### The transition record

One JSON record per terminal transition, written once at the transition commit and never edited:

```jsonc
{
  "schemaVersion": 1,
  "origin": "chunked-delivery",          // retired slug
  "kind": "decompose",                   // "decompose" | "rename" | "abandon"
  "successors": ["decompose-extraction"], // rename: exactly one; abandon: empty; decompose: the new members
  "edges": [                             // authored disposition per incoming dependency edge
    { "dependent": "decompose-durable-consumers",
      "disposition": { "kind": "replace", "replacementTargets": ["…"] } } // or { "kind": "drop", "reason": "…" }
  ]
}
```

- **Keyed by dependent slug.** `edges[].dependent` is the lookup key; the `edgeId` digest indirection through the
  machine inventory goes, deleting the `namespace-corrupt` mode that existed only because authored dispositions
  were matched by digest. The schema enforces one `edges` entry per dependent, so an in-record duplicate is a
  shape failure rather than a silently picked winner. Disposition values carry over the existing
  authored-disposition vocabulary unchanged (`replace` / `drop`).
- **Store and naming.** One file per record at `.arc/system/.internal/transitions/<origin>.json` — human-legible,
  no digest filenames. Writing a record for an origin that already has one refuses at the transition verb (slug
  reuse of a retired name surfaces at transition time). Enumeration treats multiple parseable records claiming
  one origin — however they arose — as `ambiguous` for that origin. The record's `origin` field is authoritative;
  the filename is human convention — enumeration reads content, a mismatched filename changes no answer, and
  same-origin multiplicity resolves to `ambiguous` regardless of filenames (deliberately not a filename↔content
  integrity check).
- **Unification.** The store's two current kinds collapse into this one shape: the light `receipt` kind's rename
  and abandon uses, and the heavy `v3-decomposition-receipt`'s decompose use. Park-planning writes no record
  (§ Authorization re-derivation).
- **Declined at schema authoring, recorded:** an authored out-of-inventory disposal disposition (floated by
  `decompose-conservation-coverage`'s explicit-disposal-record alternative). No live consumer reads it, so the
  field-admission test rejects it; the record is unsealed and pre-release, so admitting it later costs nothing.

### Write path

The decompose transform's `--execute <cut-map>` operation validates and applies the authored plan, then stages the
lean record from the cut map's allocation and incoming-edge dispositions in the same operation. It is the sole
terminal mutation command: there is no persisted preparation and no later `--finalize` / `--continuation` step.
Under full protection the complete transition is staged in the owned candidate worktree; under partial protection
it is staged in the current index. Success is reported only when the transform and the one exclusive origin record
share that staged tree. A record-write or later staging failure follows the existing protection-specific rollback
boundary and never reports a half-transition as complete.

Rename and abandon writers converge on the same record shape at their existing write points. Sealing artifacts
(`preparationId`, `receiptId`, `finalized.transitionPatch`, `managedPathResults`, `destinationDigests`,
`initialContinuation`) are not written by anything.

### Command and base-mobility cutover

The surviving decomposition modes are `--preflight`, `--execute <cut-map>`, and full-protection
`--advance-base <cut-map>`. Candidate cleanup uses the ordinary owned-worktree route, landed state comes from
lifecycle resolution, and the `--discard`, `--finalize`, `--continuation`, and `--handoff` modes retire with their
invented states.

Base advancement remains append-only and receipt-free. It revalidates the canonical completed map, pins the
deterministic candidate branch/worktree and current base, and authenticates the committed candidate from its Git
topology and exact transform delta. The initial transition is a unique single-parent commit; a candidate already
advanced remains valid only through a first-parent chain of previously validated append-only base merges. The
supplied map establishes authored allocation and incoming-disposition intent; neither the lean record nor an old
receipt grants mutation authority. Advancement admits only a descendant base with no newly acquired incoming
dependency, merges that pinned base into the candidate without rewriting history, revalidates the resulting tree,
and race-closes the candidate and base refs. Any retained transient claim is restated through its existing contract
only when the claim-store trace proves that contract independently necessary; no replacement state is introduced.

### Read path

- **Disposition query** (`queryRetirementDisposition`): branches on record `kind`, preserving every live consumer
  answer. `rename` yields `unique { kind: "retarget", targetSlug: successors[0] }` for **any** dependent;
  `abandon` yields `unique { kind: "abandoned" }` for **any** dependent; `decompose` looks up `edges` by
  dependent slug — `unmapped-dependent` when absent, the authored `replace` / `drop` disposition when present.
  The closed result set becomes `absent | unique | ambiguous | unmapped-dependent | namespace-corrupt`, where
  `namespace-corrupt` means shape-parse failure only (including an unrecognized `schemaVersion` and in-record
  duplicate dependents). `version-conflict` leaves the set — its sole producer was duplicate digest-id filenames,
  structurally impossible in the per-origin store — and the conflict vocabulary in reconcile and discharge drops
  the member with it. The `evidenceQuality` field leaves the result contract, and discharge's evidence
  vocabulary drops it (pure pass-through today — nothing branches on it).
- **Reference reconcile**: consumes the same records — `rename` yields `{kind: "rename", targetSlug}` from the
  single successor, `abandon` yields `{kind: "removed"}`, `decompose` yields `{kind: "decompose"}`.
- **Failure stance.** Enumeration stays fail-closed at the namespace level: one unparseable record poisons every
  read, because unclassifiable bytes cannot be ruled out as relevant evidence and dependency discharge is
  decision-bearing. The operator remedy is editing the record back to parseable — hand-editable planning content
  with git history behind it.

### Planning lane

One entry in `isPlanningArtifactPath` matches the transitions namespace exactly. With that, a decomposition's
change set (planned-tier artifacts + ROADMAP + record) classifies `planning` through the generic lane, and the
lane trio — the exception module, its receipt validation, and its wiring — retires. `decompose-planning-lane`,
which is shipped, retires as dead code.

The predicate change must reach every lane verdict: verify the host-side lane check consumes the same predicate,
so the local and server classifications move together rather than diverging on the new namespace.

### Authorization re-derivation

**The record is history, never authorization evidence.** Every proof that today validates sealed receipt fields
re-derives from committed git state at proof time; the record may point a proof at the right transition but is
never the evidence. Four arms:

- **Abandon teardown** (`validateAbandonResult` today): locate the abandon transition commit structurally (direct
  parent of the stamped head; lifecycle index), then prove conservation from trees — subject artifacts present at
  the source side, absent at the result side, lifecycle index clear — the same checks, evidenced by tree reads
  instead of `source.head` / `source.artifactDigest`.
- **Husk revalidation** (`validateGitRetirementReceiptEvidence` today): husk stamps drop the
  `{kind: "receipt", receiptId}` evidence ref for a receipt-free shape — transition kind plus a result digest
  computed against the stamped head — and revalidation recomputes the same proof from git. Per the pre-release
  posture no compatibility reader for old stamps is kept; existing husks are torn down or re-stamped.
- **Park landing** (partial protection): authenticates the park transition commit structurally — single-parent
  commit whose diff is a pure relocation of the complete planned artifact group (the blob-oid comparisons are
  already structural) — with no receipt in the commit to require or read.
- **Park teardown**: the byte-identical planned-artifact comparison against the base, computed at proof time.

Each arm gets its own consumer trace before its receipt-consuming predecessor is cut.

### Migration — one-time, required

Eight terminal records are live and in active use; they encode past human decisions and are not regenerable, so
the pre-release "clear or regenerate" posture does not apply. Conversion sources:

| Lean field                          | Source in the heavy receipt                                      |
| ----------------------------------- | ---------------------------------------------------------------- |
| `origin`                            | `prepared.completedMap.machine.source.origin`                    |
| `edges[].dependent`                 | `machine.incomingEdges`, via `edgeId`                            |
| `edges[].disposition`               | `authoring.incomingDispositions`, matched by `edgeId`            |
| `successors`                        | `authoring.destinations` where `kind` is `new-member`            |
| `kind` and `successors`, light kind | `subject.name`, `transition`, `result.kind`, `result.targetSlug` |

Convert all eight and verify equivalence: the disposition query and reference reconcile produce the same answers
from the lean records as from the heavy ones for every live consumer read. Then retire the old namespace and its
record validator. The ninth live record — the `decompose-extraction` park receipt — is not converted; it drops
with the namespace after the post-park consumer trace.

### Removal surface

Roughly 5,000 lines of non-test source plus a comparable test mass, cut cluster by cluster, **each cluster
traced for consumers before anything is cut**: the lane trio; the record validator; the claim store and
candidate discard (pending the concurrency trace — see Open Questions); the launch and publication cluster; the
decomposition receipt marker and special graduation/start path; the retirement-authorization cluster's
receipt-consuming halves (after re-derivation lands); and the sealing paths in preparation, receipt, finalization,
and their public command modes. Refusal codes describing deleted states go with their states.

### Delivery order

Additive before subtractive, so the tree is consistent at every boundary:

1. Lean record shape + writers + readers (query, reconcile) behind the existing store, plus the predicate entry.
2. One-time migration of the eight records, with the equivalence verification.
3. Authorization re-derivation arms land; husk stamp shape follows.
4. Ordinary candidate cleanup lands before discard retires; receipt-free terminal execution and base advancement
   land before their old execution/finalization/advancement paths cut over. Remaining cluster removals follow their
   consumer traces, with the namespace and validator retiring last.

These four stages are the candidate **stack-slice boundaries** for stacked delivery, decided here at planning
close rather than discovered mid-diff — a removal-plus-migration WU with per-cluster consumer traces is a
natural field run for the current delivery vehicle. Task generation phases against them.

## Alternatives & Rationale

- **Keep the spine** (status quo): the circular lane stays, downstream members keep consuming the heavy receipt,
  and the finalization members keep optimizing machinery whose shape is unsettled. Rejected — every downstream
  member is more expensive to plan.
- **Stop the bleeding only** — re-scope the unshipped queue, leave shipped code alone: cheap and safe, but the
  downstream collapse comes from the core changing shape, not from the queue being re-scoped around an unchanged
  core. Rejected.
- **Materialize the record now** — gitignored, rendered from a backing store: the eventual direction (it
  dissolves the lane question entirely), but unreachable until the tier-2 backing store exists, since gitignored
  content does not propagate. The record shape stays storage-agnostic so the later lift needs no reshaping.
- **Trust downgrade, accepted.** A record the predicate treats as planning content is conventional rather than
  tamper-evident — consistent with the rest of the planning substrate (metas, ROADMAP, cohort docs), and the
  mechanism that dissolves the lane. Sealing detected nothing anyway: consumers are advisory with an operator
  approving results, and a forger who can edit a record can reseal it.

## Cross-cutting Considerations

- **Testing.** Migration equivalence is test-verified (same consumer answers pre/post for all eight records).
  Each re-derivation arm carries tests proving parity with the receipt-validated behavior it replaces before the
  predecessor is cut. Cluster removals ride the existing suite — deletions that break a surviving consumer fail
  its tests.
- **Trust and review.** The predicate entry is the one review-bearing surface change: transitions-namespace
  records classify as planning content. The never-widen guard bounds it; hooks, scripts, and skills under
  `.internal/` remain review-bearing.
- **Concurrency.** Same-origin record writes collide as git conflicts on one file and surface for resolution;
  different origins never conflict. The claim-store question is traced before that machinery is cut.
- **Operator-facing losses** (accepted knowingly): a crashed source finish recovers via git checkout rather than
  an in-process preimage restore; the post-decompose initial-continuation choice and separate finalize, discard,
  and landed-handoff modes go; the operator picks a successor and starts it, and ordinary owned-worktree cleanup
  handles an abandoned candidate. Record-time reachability provenance (`inventoryRead`) also goes.
- **Downstream re-sizing.** `decompose-durable-consumers`' "receipt-backed retirement authority" contract
  re-sizes to the re-derived proof set; extraction and the finalization members re-plan against the lean core.
  `decompose-candidate-abandon` retires at closeout: its draft's four recorded discard refusals are all products
  of the exactness gates this cut deletes (see Success Criteria).
- **Enumeration cost, owned here.** Records accumulate indefinitely as one flat directory of small JSON files;
  enumeration is a directory read, linear in retired work units and acceptable at present scale. The prior
  deferral to `decompose-durable-consumers`' bounded reads is void — that spec is written against canonical
  receipt decoding this change unwrites — so bounded or windowed enumeration, if ever needed, is that member's
  re-scoped concern, not an obligation this record shape carries.
- **Scope tripwire.** The recorded estimate (Large, ~5,000 non-test lines removed plus migration) is recalibrated
  at spec close and again at task-generation close. Growth beyond it — new gaps exposed by real cuts, optional
  performance or authoring work — routes to `decompose-core-hardening` per the cohort's hardening-admission
  boundary; it does not fold back into this WU's spine. Finding-driven growth surfaces as a visible scope
  change, never silent accumulation.

## Success Criteria

1. A decomposition change set (planned-tier artifacts + ROADMAP + transition record) classifies `planning`
   through the generic planning lane, with the exception module deleted — and the host-side lane check consumes
   the same predicate, so local and server verdicts agree on the new namespace.
2. All eight live terminal records are converted, and the disposition query and reference reconcile return the
   same answers from the lean records as the heavy ones did for every live read — verified by test before the
   old namespace retires.
3. The sealed-receipt namespace, its validator, and the sealing write paths no longer exist in the tree; no
   production code path reads `receiptId`, `preparationId`, or any sealed receipt field.
4. Abandon teardown, husk revalidation, park landing, and park teardown authorize correctly with receipt-free,
   git-re-derived proofs — demonstrated by parity tests against the behaviors they replace.
5. The launch and publication cluster and the planning-lane trio are removed; `arc status` and lifecycle
   resolution remain the sole readiness authorities.
6. `decompose --execute <cut-map>` is the sole terminal mutation path, and full-protection
   `--advance-base <cut-map>` preserves append-only base mobility through pinned Git-derived proof without reading
   a receipt or treating the lean record as authority.
7. Every scope guard in Non-Goals holds over the landed diff — no sealing, no new states, no predicate widening,
   no compatibility readers.
8. A stranded candidate in each of the four recorded discard-refusal states (`candidate-cleanup-failed`,
   `candidate-not-exact`, `candidate-index-changed`, `candidate-path-set-changed`) is destroyable after the cut —
   the exactness gates that produced those states are in-scope machinery, and their removal is what licenses
   `decompose-candidate-abandon`'s retirement at closeout.

## Open Questions

Resolved during the work, none blocking start:

- **Claim-store concurrency trace.** Whether branch-name collision covers every interleaving the machine-local
  claim store guards. Outcome is pre-decided by the guards: what the trace shows is needed is kept as-is;
  the rest is cut.
- **Exact per-cluster removal lists.** The ~5,000-line estimate is verified cluster by cluster by the
  trace-before-cut passes; the clusters themselves are enumerated above.

## Amendment — Integration Review (2026-08-09)

Activation retired the formative backlog draft. The Introduction's reference to “the draft” records the evidence
source at planning time rather than a live artifact pointer. This spec is the surviving design authority;
`notes-decompose-transition-record.md` retains the consumer trace, and `tasks-decompose-transition-record.md`
retains implementation and deviation history. This document-topology clarification changes no design, non-goal,
or success criterion.
