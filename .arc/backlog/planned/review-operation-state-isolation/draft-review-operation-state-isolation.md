# Draft: Review Operation State Isolation

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).
- **Purpose:** Keep exact-target review operations isolated from unrelated stored-operation skew while preserving
  fail-closed validation and actionable diagnostics for state that actually affects the selected target.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Keep unrelated review-operation schema skew from blocking exact-target status**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- `WU_Target: review-operation-state-isolation (planned)`

- _Observation:_ During `evidence-applicability` public delivery review, `arc review status --work-unit` and an
  exact Member 1 target both returned `status-unavailable / malformed-operation-state`. The older work-unit CLI
  strictly parsed every record in the repository-shared review-operation snapshot. Two newly written records for
  the unrelated, active `resolve-errand-review-status-from-identity` Errand carried `claimId` and
  `rubricIdentity` fields that this checkout's schema does not accept. Neither record belonged to the delivery
  target; quarantining them would disrupt the other session. PR #617 remained open, so merging base was not yet
  available as a safe immediate remedy. One concurrent session's schema advance thereby stopped another session's
  review despite exact target and valid checks.

- _Approach:_ settle the trust boundary for selecting operation progress before strict parsing. An unrelated
  unreadable record must not silently become clean or contaminate a target's progress; a relevant unreadable
  record must still fail closed with its exact locus. Compare target-scoped snapshot selection, versioned record
  reading, and a bounded compatibility diagnostic against concurrent old/new checkout traces. Preserve replay,
  identity, and provenance checks for every selected record; do not erase or quarantine active shared state.

- _Success criterion:_ with two concurrent checkouts on different supported schema revisions, an unrelated new
  Errand operation does not block a Work Unit's exact-member status; malformed or ambiguous records that can
  affect that member still block, and the result never asserts review clearance from omitted progress.

- _Captured during:_ `evidence-applicability` public delivery review, PR #618, 2026-09-13.

### `[ ]` **Name the operator's index when a minted delivery-member admission stops matching**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- `WU_Target: review-operation-state-isolation`

- _Observation:_ Preparing a delivery member's local review re-resolves that member's review status and requires
  the supplied admission to still equal, byte for byte, what status projects at that moment. A path staged in the
  operator's index reaches the Candidate subject, the subject feeds the projection, and the projection is what the
  admission is compared against — so an uncommitted correction on the top branch invalidates an admission minted
  for a member whose own contribution never moved. It surfaces as exit 1 with `unexpected-failure` and "Local
  delivery-member review no longer has exact driver admission.", carrying no reason field, no remedy and no next
  action.

- _Approach:_ give the mismatch a typed reason naming the index as the thing that moved, and a remedy the operator
  can act on. The refusal itself is correct and should stay fail-closed — the admission genuinely no longer
  matches — so this is about what the result says, not whether it refuses.

- _Boundary:_ not a shipping blocker and not a capability gap. Clearing the index and re-running admits the same
  admission unchanged, with no re-derivation and no restart; that recovery is proven by the probe below rather
  than assumed. The cost is diagnosability at the moment a member is about to be reviewed.

- _Probe:_ `delivery-position-suite.ts`, inside "drives a registered review correction through superseded
  verification to hosted review" — the staged observation and the recovery both ride that chain.

- _Captured during:_ `concurrent-integration-characterization` Task 7.4, 2026-09-15.

- _Pinned probe:_ the probe above holds this boundary's current behavior rather than asserting it is correct. It
  passes today and fails the moment the behavior changes, printing "This now produces the result it was waiting
  for, so the hold is spent: replace this call with a plain assertion on `<result>`." Retiring it is part of the
  fix, not a regression — a change here cannot merge while it is red. The target is a meta-only stub with no
  draft yet, so this note rides the capture and should land in that draft when one is seeded.

- _Target rationale:_ routed here rather than to the protocol chain because the mechanism is exact-member review
  status resolution and a fail-closed refusal that needs a typed reason — this stub's own recorded blocker —
  rather than request-shape derivation. It also sits adjacent to the chain instead of behind three of its links.

### `[ ]` **Isolate review continuations from unrelated malformed operation records**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-11-10).

- _Shapes:_ "Keep unrelated review-operation schema skew from blocking exact-target status" — the same failure, seen
  through a review continuation.

- _Observation:_ `LocalReviewOperationStateStore.readOperationSnapshot` validates the entire shared Git-common
  operation namespace and returns an incomplete snapshot on the first malformed record.
  `LocalReviewResultReader.readResult` requires that whole snapshot before resolving a specific producer. A damaged
  or reader-incompatible review in one worktree can therefore block a valid continuation in another worktree.

- _Evidence:_ During `storage-contract` Standard Pass 3 at `eaac1e444`, local attestation succeeded, but the exact `arc
  review reduce -` continuation refused `corrupt-state / operation snapshot is incomplete: malformed-operation-state`.
  Read-only validation checked 168 operation records: storage-contract's operation was valid; the sole record rejected
  by that checkout's decoder belonged to `spec-reader-standard` (PR #790, head `c40d5bf3c`). Its singleton hosted handle
  carried a force invocation admitted by the updated schema from merged PR #791. The older decoder required a
  delivery-member vehicle and rejected it; the updated CLI accepts the same record. This incident is reader/writer
  version skew, not damaged state. Update the CLI reader and retry the retained reduce request without editing the
  record. Evidence is retained in storage-contract's private prepublication `pass-3-native-continuation-blocker.json`
  and `pass-3-operation-schema-check.json`; the old- and new-reader comparison probes ran locally and were not kept.
  This capture addresses the cross-worktree failure propagation independently.

- _Approach:_ Resolve and validate the relevant producer, owning lane and required linked records without making
  their continuation depend on unrelated operation bodies being valid. Preserve legitimate shared review state
  across worktrees. Keep strict, actionable refusal for damaged required records and ambiguous or duplicate producer
  bindings. Surface unrelated corruption through a separate diagnostic/recovery path; never erase it or invent a
  clean review. Re-triage before implementation if safe scope discovery requires a new routing/index contract.

- _Verification:_ Exercise the public attest → reduce → findings-response continuation with two worktrees sharing
  one Git-common directory. A malformed unrelated operation must not obstruct the valid lane or alter its exact
  target, receipt, authorization or pass count. A malformed required operation and ambiguous relevant linkage must
  still refuse with a useful diagnostic. Include malformed JSON and schema-invalid records, plus normal shared-lane
  continuation, so isolation does not weaken legitimate coordination.

- _Files:_ `hosts/local/operation-state-store.ts`, `hosts/local/review-result-reader.ts` and `core/ports.ts` under
  `packages/arc-framework/src/scripts/review-gate/`; the operation-store integration tests, result-reader unit tests
  and reduce-command unit tests.

- _Scope:_ One review-infrastructure failure-containment concern, captured as an Errand for later re-triage. Use the
  reviewed lane. Do not fold it into storage-contract or spec-reader-standard, rewrite native state manually, or
  implement a future storage backend. The immediate version-skew remedy is an updated reader, with the shared
  review record preserved.

- _Captured during:_ `storage-contract` Standard Pass 3 continuation, 2026-10-03; Owner requested a separate capture.

---
