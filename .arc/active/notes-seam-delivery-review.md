# Notes: seam-delivery-review

## Contents

- [How the rows were checked](#how-the-rows-were-checked)
- [Corrections across rows](#corrections-across-rows)
- [Rows](#rows)
- [Files no row covers](#files-no-row-covers)
- [Register keys](#register-keys)
- [Mechanisms that exist because records ride the branch](#mechanisms-that-exist-because-records-ride-the-branch)
- [Where review state lives today](#where-review-state-lives-today)
- [Decision-record census](#decision-record-census)
- [Withdrawal, reopen, and retirement](#withdrawal-reopen-and-retirement)
- [Rules a write check cannot see](#rules-a-write-check-cannot-see)
- [Neighbors](#neighbors)
- [Prior art](#prior-art)

## How the rows were checked

The rows are the 35 seam-owned rows this work unit inherits from `notes-storage-contract.md` § Consumer map — 17 under §
Delivery and 18 under § Review and evidence — re-verified at `66924aa56` on 2026-10-15, with the files no row covers,
the review gate's decision records, and the withdrawal and reopen paths. Four read-only sweeps did the reading; each
finding the design acts on was checked against source before it entered the design. `generate-tasks` grounds against
these notes and re-derives line numbers, which drift, so a citation here is the file and symbol, with a line only where
the line is the evidence. `src/` is `packages/arc-framework/src/`, and `rg/` is `src/scripts/review-gate/`.

| Verdict   | Delivery | Review and evidence |
| --------- | -------- | ------------------- |
| Confirmed | 6        | 7                   |
| Drift     | 11       | 11                  |
| Moved     | 0        | 0                   |

No row points the wrong way. Most drift is a missed state touch, a stale line, or a miscited key; the material drift is
under § Corrections across rows. Every path exists at HEAD, and none of the four file splits (#812, #818, #826, #827)
moved a row: #827 moved three locus lookups into `handlers/review-locus-context.ts`, which `seam-locus` took, and #812
touches no row here.

## Corrections across rows

- **The store already holds Candidate and boundary records, and nothing uses it.** `review/candidate` and
  `review/integration-boundary` are registered (`lib/store/registry.ts`) and implemented in the in-repo backend, whose
  `landTracked` (`lib/store/in-repo/write-stores.ts`) delegates to `writeCandidateRecord` and
  `writeSubmissionBoundary`. Every consumer still imports `candidate-record-store.ts` and `submission-boundary-store.ts`
  directly (31 imports), so the work is adoption, not construction. The in-repo backend stages nothing and reports
  `capabilities: { stateOffBranch: false }` (`createInRepoBackend`), the one gate for every mechanism under § Mechanisms
  that exist because records ride the branch.
- **Integration's lifecycle reads are already store-backed.** `checkpoint-composition.ts` and `merge-composition.ts`
  default to `createStoreLifecycleStorage` (`lib/store/lifecycle-storage.ts`), whose version is still HEAD in-repo.
  What remains of key 48 is D2's binding to per-record versions plus the code head, and two Git-tree readers: the
  shipped-delivery boundary replay in `checkpoint-composition.ts` and the merge-lock readiness gate's read of the
  pull-request head tree in `merge-composition.ts`.
- **Key 13 is missing on both record stores.** Each hand-builds the path the layout's `candidate-record` and
  `integration-boundary-record` addresses already resolve.
- **Key 17 is miscited on the eight review-gate store rows.** Frozen key 17 is the per-work-unit workspace; no
  review-gate code reads a workspace path. Their mechanism is the register's machine-local row ("Machine-local state
  under `.git/arc/`"), inserted after the freeze and so keyless. Key 39 on the two `git-common-state.ts` rows is an
  analogue only: those modules take their own locks, not `.notes.lock`.
- **Key 57 is now `storage-cutover`'s** in the current register, though the map's key table names `storage-seam`; it
  sits on all three workflow rows.
- **Mechanisms newer than the sweep.** The response head continuation (2026-10-03) and `gitCandidateRecordAtHead` with
  `recordsOwnSelection` (2026-10-02) postdate every row. Both exist because records ride the branch and retire at the
  flip rather than move to store reads.
- **`handlers/lifecycle.ts`'s row** (lifecycle partition) no longer holds the attest and publish staging; it moved to
  `handlers/lifecycle-delivery-review.ts` with #826.
- **D18's review copy is evidence-neutral in every direction, not only on its delete.** Seven rows, and the contract
  notes' handoff for the Candidate review subject, keep the export's add and re-export reviewable while the
  candidate-tail delete stays neutral. That cannot hold. `classifyPathTreatment` classifies by path alone, so D18's one
  arm for the export path makes the add, the re-export, and the delete neutral alike. A reviewable add would let the
  delete change the subject: the copy is never in base, so its delete drops out of the base-relative diff
  (`collectGitCandidateSubject`). The copy reaches review on the pull request, and a work unit's own spec on the branch
  is evidence-neutral today (`isWorkUnitArtifactOrCompanion`), so a spec-only fix moves no subject now either. A
  stacked delivery meets the copy in delivery's lifecycle-contribution path group too
  (`CurrentDeliveryLifecycleContributionPathSource`, `lib/delivery/lifecycle-contribution.ts`), which three readers take
  under a delivery plan only: `classifyDeliveryTerminalDelta`, through `classifyGitDeliveryTerminalDelta` and
  `lib/delivery/repository-entry.ts`; `revalidateDeliveryLifecycleContribution`
  (`lib/delivery/git-lifecycle-contribution.ts`), which holds every group path to the protected base in each member,
  from `lib/delivery/eligibility.ts`, `handlers/delivery-execution.ts`, and `rg/policy/pre-publication-composition.ts`;
  and `compareNormalizedDeliveryTree`, which reports a group path the base lacks as invented, through
  `compareGitNormalizedDeliveryTrees` (`lib/delivery/git-eligibility.ts`) from `handlers/delivery-execution.ts` and
  `rg/policy/pre-publication-composition.ts`, and through `lib/delivery/chain-containment.ts` from
  `lib/delivery/chain-adoption.ts`. In the group no member could carry the copy, so the export adds nothing to it, and
  where a delivery's design reaches review is `delivery-observe-attest`'s question (spec, § 12.5). The
  rows read the same: this member's `rg/policy/pre-publication-composition.ts` and
  `rg/status-composition.ts` (§ Rows), `storage-cutover`'s `lib/evidence-applicability/path-treatment.ts`,
  `lib/git/base-overlap.ts`, and `lib/base-drift/current-adapters.ts`, and `delivery-observe-attest`'s
  `lib/delivery/git-lifecycle-contribution.ts` and `lib/delivery/lifecycle-contribution.ts`, the other owners' sent as
  captures.

## Rows

| Row                                                  | Verdict   | Correction                                                                                                                                                                                                         |
| ---------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `integrate-work-unit.md`                             | Drift     | Misses the `commit-boundary` step and the reconcile commit. The review-copy steps it cites are D18's planned `.arc/specs/<slug>/` copy, which no workflow implements yet.                                          |
| `prepare-work-unit.md`                               | Drift     | Names neither `commit-selection` nor `commit-boundary` (integrate does); misses the staged Candidate-response `taskCommit`.                                                                                        |
| `verify-work-unit.md`                                | Drift     | Families omit `wu.meta` (attest's meta projection rides the verification commit), the personal inbox, `wu.prose`, and adversarial passes; Shared with is not empty.                                                |
| `handlers/delivery-entry.ts`                         | Confirmed | —                                                                                                                                                                                                                  |
| `handlers/candidate.ts`                              | Drift     | Misses the `recordEffect` digest (key 35) and the completed-placement read in its mutation-owner check.                                                                                                            |
| `lib/delivery/repository-entry.ts`                   | Confirmed | Misses approved-disposition reads, delivery's machine-local plan and state, and the lifecycle-artifacts-at-ref classification (key 27).                                                                            |
| `lib/delivery/task-list-render.ts`                   | Drift     | The region splice now lives in the store's task-list kind; its one repository caller is `handlers/delivery.ts`, `delivery-observe-attest`'s.                                                                       |
| `lib/work-unit/candidate-record-store.ts`            | Drift     | Now also the in-repo backend's adapter for `review/candidate`; key 13 missing.                                                                                                                                     |
| `lib/work-unit/submission-boundary-store.ts`         | Drift     | Now also the in-repo backend's adapter for `review/integration-boundary`; key 13 missing.                                                                                                                          |
| `integration/candidate-response-confirmation.ts`     | Confirmed | Misses its frontline-outcome, operation-state, and disposition reads.                                                                                                                                              |
| `integration/checkpoint-composition.ts`              | Drift     | Lifecycle port store-backed; the shipped-delivery boundary replay still reads the HEAD tree; misses the workspace read, key 15, and key 26.                                                                        |
| `integration/checkpoint-store.ts`                    | Confirmed | —                                                                                                                                                                                                                  |
| `integration/checkpoint.ts`                          | Drift     | Line moves only: the `--regenerate-roadmap` remedy and the `commit-boundary` action.                                                                                                                               |
| `integration/errand-merge-composition.ts`            | Drift     | Reads no meta; takes the Errand's identity through the locus probe; its readiness tree reader is never consulted for an Errand.                                                                                    |
| `integration/lineage-review-composition.ts`          | Confirmed | —                                                                                                                                                                                                                  |
| `integration/merge-composition.ts`                   | Drift     | Lifecycle port store-backed; the pull-request-head readiness gate survives (key 48); misses the checkpoint read and the Candidate-from-HEAD read.                                                                  |
| `integration/merge.ts`                               | Confirmed | Still compares the whole lifecycle version, as the row's until-the-flip clause allows.                                                                                                                             |
| `handlers/review.ts`                                 | Drift     | Missing families machine-local, delivery, and Errand; missing `history`; `wu-workspace` unsupported; the Owner terminus's HEAD-against-worktree replay uncited.                                                    |
| `lib/git-common-state.ts`                            | Drift     | `transact` serves delivery's authoring store only; "Shared with user-sync" is stale; keys 17 and 39 miscited.                                                                                                      |
| `rg/hosts/local/disposition-record-store.ts`         | Confirmed | Its records embed references into machine-local stores; key 17 miscited.                                                                                                                                           |
| `rg/hosts/local/frontline-outcome-store.ts`          | Confirmed | —                                                                                                                                                                                                                  |
| `rg/hosts/local/git-common-state.ts`                 | Drift     | Lines only.                                                                                                                                                                                                        |
| `rg/hosts/local/hosted-request-owner-index.ts`       | Confirmed | Shares the `identity/` namespace with the repository ID.                                                                                                                                                           |
| `rg/hosts/local/live-context.ts`                     | Confirmed | —                                                                                                                                                                                                                  |
| `rg/hosts/local/operation-state-store.ts`            | Drift     | Materializations and quarantine are not here; operation records carry durable-fact fields (§ Where review state lives today).                                                                                      |
| `rg/hosts/local/receipt-store.ts`                    | Drift     | The cited import and materialization lock is not in this module; the ledger is one record with positional references.                                                                                              |
| `rg/hosts/local/source-store.ts`                     | Confirmed | Record names derive from machine-local locators (`sourceRecordName`), which a project-scope record cannot keep.                                                                                                    |
| `rg/policy/delivery-review-terminus.ts`              | Confirmed | —                                                                                                                                                                                                                  |
| `rg/policy/mechanical-review-applicability-carry.ts` | Confirmed | Its Becomes should read retire, not move: with no selection commit after the flip, `recordsOwnSelection` has nothing to prove.                                                                                     |
| `rg/policy/pre-publication-composition.ts`           | Drift     | Misses the lifecycle-artifacts-at-ref read, the pending-fix authority read, and the keep-staged rule; its review copy is neutral in every direction (§ Corrections across rows).                                   |
| `rg/readiness.ts`                                    | Confirmed | Misses the machine-local delivery-state lookup and branch-name identity.                                                                                                                                           |
| `rg/runtime/local-prepare-composition.ts`            | Drift     | Understated: `history`, five stores and two locks, the Errand claim, and the head continuation.                                                                                                                    |
| `rg/runtime/respond-composition.ts`                  | Drift     | Misses the head continuation, the completed-work-unit placement read, and the index-against-worktree subject check.                                                                                                |
| `rg/runtime/singleton-publication-response.ts`       | Confirmed | —                                                                                                                                                                                                                  |
| `rg/status-composition.ts`                           | Drift     | Misses the terminal record-advance proofs, the operations snapshot, delivery state, the Errand arm, and the branch-to-work-unit lookup; its review copy is neutral in every direction (§ Corrections across rows). |

## Files no row covers

Each is a seam row the member adds; `Shared with` follows the file's callers.

- **`handlers/lifecycle-delivery-review.ts`** — `handleAttest`, `claimPublicationBoundary`, and `permitDeliveryReopen`:
  the partition's densest staging site, four `git add` calls over the Candidate record, meta, and boundary. Keys 1, 2,
  12, 13, 34, 45, and 80; shared with lifecycle (publish and reopen call in) and review (lane progress and lock).
- **`lib/work-unit/verbs/attest.ts`** — orchestration over ports; its result schema and remedy text carry the Candidate
  record's commit OID (`recordRevision`, `candidateRecordRevision`, key 2), and it returns record paths for its caller
  to stage.
- **`lib/work-unit/git-candidate-subject.ts`** — `collectGitCandidateSubject` reads no state record, but most of its
  classification exists for state on the branch: own-artifact relocation keying, `candidateProjectionPaths`, and the
  evidence-neutral arm through `classifyPathTreatment`. `notes-storage-contract.md` gives the subject's D18 redefinition
  to review and evidence work, so the row sits under review.
- **`lib/work-unit/git-candidate-effective-target.ts`** and **`lib/work-unit/candidate-effective-target.ts`** — collect
  the subject from the index and from HEAD to yield `staged-change` (`projectStagedCandidateCurrentness`); they feed
  `handlers/candidate.ts`, `repository-entry.ts`, `candidate-response-confirmation.ts`, `checkpoint-composition.ts`,
  `lineage-review-composition.ts`, and `handlers/lifecycle-delivery-review.ts`. Neither imports either store, and this
  change leaves both as they are.
- **`lib/delivery/review-fix.ts`** — parses an approved-disposition record and builds the advanced record a delivery
  member's fix writes (`ApprovedDispositionRecordSchema.parse`, `currentApprovedDispositionNode`), so it changes with
  the evidence record's shape.
- **`lib/delivery/review-fix-continuation.ts`** — reads a lineage node's fix authorization, delivery-member response,
  and resolved policy request (`responsePolicyRequest`), the snapshot the evidence record keeps.
- **`handlers/delivery-execution.ts`'s review reads and write** — lists disposition records
  (`LocalApprovedDispositionRecordStore`), reads lane operation state (`LocalReviewOperationStateStore`), appends the
  advanced disposition record, and settles the lane attempt (`settleLaneAttempt`). `delivery-observe-attest` has a row
  for the file; this member adds one for these reads and the write beside it.
- **`rg/policy/assurance.ts`** — reads the meta's `workClass` and `reviewRubric` through its callers; moves with the
  meta parser.
- **`rg/runtime/candidate-response-head-continuation.ts`** — `confirmCandidateResponseHeadContinuation` proves the
  commit after a verified fix is a clean, record-only successor. Its port is threaded through ten other modules
  (`hosted-response-completion.ts`, `lane-progress.ts` with its conditional, hosted-request, and hosted-settlement
  siblings, `frontline-command.ts`, `local-prepare.ts`, `local-prepare-composition.ts`, `respond-composition.ts`, and
  `handlers/review.ts`). Its record-only proof retires at the flip; the port stays, from the flip proving only a direct
  successor whose one change is the review copy (spec, § 5.6, § 14.3).
- **`rg/core/review-subject.ts`** — resolves a branch to its work unit by stripping the type prefix
  (`branchToWorkUnitSlug`); becomes the store's reverse `lookup` on the branch link.
- **`rg/policy/earlier-review-applicability.ts`** and **`rg/policy/local-review-coverage-selection.ts`** — deciding
  consumers of `gitCandidateRecordAtHead`, which retires with `recordsOwnSelection`.
- **Unrowed importers of the review gate's state modules:** `frontline-materialization.ts`,
  `review-result-reader-composition.ts` (joins operations, receipts, outcomes, and sources in one read — where machine
  and project scope cross), `candidate-review-fix-continuation.ts`, `hosted-reservation-discharge.ts`,
  `frontline-run-composition.ts`, `local-attest-composition.ts` and `local-resume-composition.ts` (both write
  receipts), `reduce-composition.ts`, `status-singleton.ts`, and `review-applicability-resolution.ts`, which imports
  only the Candidate record's type but emits `commit-selection`. Also unrowed: `rg/runtime/respond-command.ts`, which
  imports none of the stores but is the main writer of disposition records and the Candidate stager, and refuses
  unstaged reviewable paths because the subject is the index.
- **`rg/status-errand.ts`'s review reads** — it imports `LocalReviewOperationStateStore`,
  `LocalApprovedDispositionRecordStore`, and `resolveRepositoryIdentity`, so the reshape of lane progress and
  dispositions changes what it reads. Its one consumer-map row is `storage-ref-backend`'s, for its Errand reads
  (key 62); this member adds a row for the review reads beside it.
- **Importers of `rg/core/advisory-records.ts`,** where the disposition record's schema and its lineage readers live: a
  module can read the shape with no store import, as the two delivery fix modules above do. 24 non-test modules import
  it, and 20 are rowed in the map or above, or fated in the next bullet. The other four:
    - _Composing from records._ `rg/core/review-result-disposition.ts` checks an approved-disposition record's lineage
      against its result (`validateApprovedDispositionRecordForResult`), so it becomes the per-set check over evidence
      records, read through it by `runtime/respond-command.ts`, `policy/pre-publication-request.ts`,
      `policy/review-policy-evidence.ts`, `runtime/reduce-command.ts`, and `runtime/local-resume-command.ts`.
      `rg/runtime/reduce-command.ts` reads the current lineage node and the reduction projection
      (`currentApprovedDispositionNode`, `ReviewReductionProjectionSchema`), so it reads the current set from the
      succession instead.
    - _Unchanged unless their shapes change._ `rg/core/review-command-envelope.ts` imports only the reduction
      projection's schema, and `rg/providers/coderabbit/frontline-execution.ts` only the `FrontlineExecutableIdentity`
      type, which the frontline result keeps.
- **Importers of `rg/core/operation-state-schema.ts`,** which the family splits: 35 non-test modules import it on
  2026-10-16, `policy/frontline-pending-admission.ts` and `runtime/frontline-admission-validation.ts` among them, and 27
  of the 33 counted earlier sit on no consumer-map row and no row above. Their fates, by role:
    - _The family's writers._ The lane-progress transitions — `lane-progress.ts`, `lane-progress-conditional.ts`,
      `lane-progress-hosted-request.ts`, `lane-progress-hosted-settlement.ts`, `lane-progress-seal-recovery.ts`, and
      `hosted-response-completion.ts` — write outcomes, evidence, and decisions, and `policy/frontline-phase.ts`'s skip
      marker becomes a lane-skip decision. Three modules also run in-flight admission, whose state stays working state,
      but write a result that becomes an outcome: `runtime/local-attest-command.ts` appends the local receipt
      (`attestLocalReviewCommand`) and records a `terminal-failure` attempt, `runtime/local-pending-replay.ts` records
      an interrupted attempt as `stale-target`, and `policy/frontline-operation.ts` appends the frontline outcome
      (`executeFrontlineRun`). `runtime/local-resume-command.ts`, which imports neither schema module, writes one too:
      resuming a local attempt appends its receipt (`resumeLocalReviewCommand`).
    - _The kinds' write checks._ `core/lane-attempt-validation.ts` and `core/lane-progress-state-validation.ts` carry
      today's invariants into the outcome and evidence checks.
    - _Readers composing from records._ `hosts/local/review-result-reader.ts`, `core/review-result.ts`,
      `policy/review-policy-evidence.ts`, `policy/pre-publication-request.ts`, and `lane-progress-supersession.ts`,
      which carries pass counts across supersession.
    - _In-flight admission and retry, staying working state in the new namespace._ `core/local-operation.ts`,
      `core/local-prepare.ts`, `core/local-source-sweep.ts`, `lane-progress-local-retry.ts`, `runtime/local-prepare.ts`,
      `runtime/local-prepare-retry.ts`, `core/frontline-retry-contract.ts`, and `runtime/frontline-retry-remedy.ts`.
    - _Registration._ `core/ports.ts` and `core/register-review-schemas.ts` take the new kinds' ports and schemas.

    The other six are rowed: `handlers/review.ts`, `hosts/local/operation-state-store.ts`, and `status-errand.ts` in the
    map, and `runtime/candidate-response-head-continuation.ts`, `policy/local-review-coverage-selection.ts`, and
    `runtime/respond-command.ts` above.

## Register keys

Keys are `notes-storage-contract.md` § Register keys, matched by mechanism (`cohort-storage-seam.md` § Citing the
register). The rows this work unit inherits carry these, each closing when the spec's fate for it is built:

- **01**, its Candidate half — Candidate records, with withdrawal and retirement (spec, § 3.1, § 8, § 10).
- **02** — the Git-history supersession read, whose `recordRevision` becomes a store version (spec, § 8.4).
- **13** — the record stores' hand-built paths, which the layout's addresses replace (spec, § 3.1).
- **34** — a singleton's own record writes, which close at the flip with no continuation built before it (spec,
  § 10.5).
- **45** — writers completing through a code commit (spec, § 14.3).
- **48** — readiness and integration reads of lifecycle state: the checkpoint's binding, the shipped-delivery boundary
  replay, and the merge lock's readiness read (spec, § 3.2, § 12.7, § 14.3).
- **62** — the review gate's listing protocols over Errands and claims, which keep refusing to authorize review from
  incomplete evidence (spec, § 12.4).
- **The machine-local row** ("Machine-local state under `.git/arc/`"), keyless, which the eight review-gate store rows
  carry in place of the miscited key 17 (§ Corrections across rows; spec, § 4.7, § 13).

Keys on this work unit's rows that close elsewhere: 27 with `storage-cutover`, which removes delivery's
lifecycle-contribution path group and keeps the review copy's arm (spec, § 12.5); 57 with `storage-cutover`'s deletion
pass over the in-repo arms (spec, § 14.3); 35, stacked-delivery convergence, with `delivery-correction-convergence`; and
80, the terminus's reach and invalidation, with `review-source-authority` (spec, § 5.6).

## Mechanisms that exist because records ride the branch

Each retires at the flip. Before it, today's in-repo arm keeps it, gated as one unit on `stateOffBranch`. Twelve of
the 17 delivery rows and every new row carry at least one.

- **Write, then stage** (key 45): `handlers/lifecycle-delivery-review.ts` (four sites), `handlers/candidate.ts`,
  `rg/runtime/respond-composition.ts` (`appendCandidateResponse`, `stageCandidateResponse`),
  `rg/runtime/singleton-publication-response.ts`, and `handlers/review.ts` (the Owner terminus, the pre-publication
  boundary, and the attestation-ordering recovery).
- **`commit-*` next actions:** `commit-boundary` in `rg/policy/delivery-review-terminus.ts`, `handlers/review.ts`, and
  `integration/checkpoint.ts`; `commit-selection` in `rg/policy/review-applicability-resolution.ts`,
  `lib/work-unit/candidate-applicability-resolution.ts`, and `handlers/candidate.ts`; the workflows' `chore(arc):`
  record commits in `integrate-work-unit.md` and `prepare-work-unit.md`; the keep-staged rule emitted in
  `handlers/review.ts` and `integration/checkpoint.ts`, tolerated by `rg/policy/pre-publication-composition.ts`'s diff
  base, and stated in `verify-work-unit.md`.
- **Replay against HEAD or the index:** the staged-terminus recovery in `handlers/review.ts`; the boundary checks in
  `checkpoint-composition.ts`; `candidate-response-confirmation.ts`'s `HEAD == approvedHead` and its comparison of the
  committed record with the worktree's.
- **Proofs that a record commit moved the head:** `confirmCandidateResponseHeadContinuation`,
  `projectGitDeliveryTerminalRecordAdvance` (`lib/delivery/public-review-continuation-git.ts`) and the owner-terminus
  advances in `rg/status-composition.ts` and `integration/checkpoint-composition.ts`, the record-commit arms of
  `projectGitDeliveryTerminalCoordinateAdvance` at its three consumers, and `recordsOwnSelection`.
- **Protecting a subject digest from the work unit's own writes** (key 34): `candidateProjectionPaths`, the
  evidence-neutral arm of `classifyPathTreatment` for the work unit's own artifacts, publication binding
  `candidateSubjectDigest` rather than the head, and `handlers/review.ts` honoring an advanced boundary only while the
  Candidate's head is the current root. `candidateProjectionPaths` alone stays past the flip, until the deletion pass: a
  live work unit's committed Candidate and boundary files stay on its branch, and must stay neutral to keep the subject
  digest its imported Candidate holds (spec, § 14.3).
- **Records read from history or a head tree** (keys 2, 26, 48): `readRepositoryCandidateSupersessionChain` and
  `readRepositoryCandidateRecordRevision` (`git log`, `git show`), `gitCandidateRecordAtHead`, the readiness reads of
  the pull-request head tree in `rg/readiness.ts`, delivery's record-effect recovery
  (`reconstructExpectedRecordEffects`), and `readGitDeliveryLifecycleArtifactsAtRef`.
- **Decisions inside a command string:** `buildPrePublicationResumeCommand` encodes the lane judgments — ceiling
  override, additional pass, terminus judgment, invocation — into a `--resume` token stored in the tracked boundary,
  with `consumeOwnerAcceptedTerminus` and its sibling scrubbing them out after subject movement.

## Where review state lives today

The review gate's own records already live off the branch, under the Git common directory
(`RepositoryGitCommonStatePublisher`, `<common>/arc/review-gate/<namespace>/`). Two tracked files ride it: the Candidate
record (`.arc/system/.internal/candidates/<slug>.json`) and its boundary (`<slug>.boundary.json`), each versioned by a
byte digest.

| Location                                                 | Record                                                                                                                                        | Today's class, and what the research found                                                                                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review-gate/evidence/disposition-*.json`                | Approved disposition record                                                                                                                   | Durable. Embeds `localSourceRef` and `attemptRef` (`ApprovedDispositionSourceSchema`), which point into machine-local `sources/` and `operations/`.                                                                 |
| `review-gate/evidence/receipts-v2.json`                  | One repository-wide receipt ledger (`ForwardReceiptLedgerRecord`)                                                                             | Durable. References are positional (`receipts-v2.json#N`); compare-and-swap is ledger-wide.                                                                                                                         |
| `review-gate/outcomes/frontline-outcome-*.json`          | Frontline outcome                                                                                                                             | Durable.                                                                                                                                                                                                            |
| `review-gate/identity/repository-identity.json`          | Repository UUID (`resolveRepositoryIdentity`)                                                                                                 | Identity; the import maps it onto the project ID.                                                                                                                                                                   |
| `review-gate/identity/hosted-request-owner-*.json`       | Hosted request owner index                                                                                                                    | Working (operation routing), in the identity namespace.                                                                                                                                                             |
| `review-gate/operations/operation-*.json`                | `lane-progress`, `frontline-run`, `frontline-phase`, `review-suspension`, `local-review`                                                      | Working by D5, but `LaneProgressStateSchema` also holds `completedPasses`, sealed hosted results, settlement evidence, response performance, and conditional pass authorizations, and publication is gated on them. |
| `review-gate/sources/source-*.json`                      | Local review source                                                                                                                           | Mixed: semantic fields are portable (`sourceDigest`), the record name and locators are not.                                                                                                                         |
| `review-gate/materializations/<operationId>/`            | Detached review checkout                                                                                                                      | Working.                                                                                                                                                                                                            |
| `refs/arc/review/local*`                                 | Reachability pins                                                                                                                             | Working; outside `.git/arc/`, and D5 does not name it.                                                                                                                                                              |
| Locks (`.write.lock`, `.sweep.lock`, `operation-locks/`) | —                                                                                                                                             | Working.                                                                                                                                                                                                            |
| `.arc/system/.internal/candidates/<slug>.json`           | Candidate record: attestation, subject, review- and verification-response and applicability-selection transitions, and lineage attestations   | Tracked on the branch.                                                                                                                                                                                              |
| `.arc/system/.internal/candidates/<slug>.boundary.json`  | Boundary: locus, `nextAction`, `terminus`, `deliveryReviewTermini`, `reservation`, `policy`, `standardLaneOwnerVersion`, the `--resume` token | Tracked on the branch; `standardLaneOwnerVersion` is a machine-local operation record's version, and `policy` copies a resolve envelope with its own terminus and pass count.                                       |

No quarantine mechanism exists in code; the nearest are orphan source reaping (`core/local-source-sweep.ts`) and
skipping malformed records.

The frontline skip marker (`rg/policy/frontline-phase.ts`) is keyed by Candidate ID under the operation-ID domain
`arc.review.singleton-frontline-phase/v1`. Retiring it for a derived window touches `frontlinePhaseClosed`,
`readSingletonFrontlinePhaseClosure`, and `recordSingletonFrontlineInitialSkip`; the `frontline-phase` operation kind
and its published schema ID `frontline-phase-state`, with the schema-inventory variant
(`core/operation-state-schema.ts`, `core/schema-inventory.ts`); the `FrontlinePhase*` schema and type names; the
`frontline-phase-closed` diagnostic; and the policy driver's `phase-closed` skip reason.

## Decision-record census

Seventeen shapes decide something about an exact review subject. Six live in tracked files, four in the Git common
directory, four only as request input, and two nowhere.

| Shape                                                             | Decided-by                                    | Stored                             | What the census found                                                                                         |
| ----------------------------------------------------------------- | --------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `ReviewCeilingOverride`                                           | none                                          | request; leaks into four records   | One pass past an exhausted ceiling at one head; `nextPass` is always the count plus one.                      |
| `ReviewAdditionalPassAuthorization`                               | none                                          | request                            | One elective pass after convergence; folded into the same applied flag at the ceiling.                        |
| `ConditionalPassAuthorization`                                    | `authorizedBy`                                | operations (lane progress)         | Five states and a lineage chain for one pass after an approved fix.                                           |
| `DispositionApproval`                                             | `approvedBy`, owner-checked on the local path | evidence                           | Content-addressed approval of a disposition set; proposer and approver must differ. The defensible precision. |
| `FixAuthorization` and its consumption                            | copied                                        | embedded in the disposition record | Derived deterministically from the approval (`createFixAuthorization`); the consumption is a performed fact.  |
| `OwnerAcceptedReviewTerminus`                                     | `acceptedBy`, authenticated                   | boundary                           | No subject or timestamp of its own; bound by its container.                                                   |
| `DeliveryReviewTerminus*`                                         | `acceptedBy`, authenticated                   | boundary, then a commit            | The same shape per delivery member; refused when `completedPasses` differs.                                   |
| `FrontlineInvocationOverride`                                     | none                                          | request                            | Routing precedence for one call.                                                                              |
| Frontline skip marker (`frontline-phase`)                         | none                                          | operations                         | Singleton Candidates only; re-synthesized into a skip request; never deleted.                                 |
| `CandidateResponseConfirmationAction`                             | none                                          | checkpoint                         | Not a decision: recomposed and compared at merge.                                                             |
| Owner-directed review stop                                        | none                                          | nowhere                            | Conversation only (`run-errand.md`); re-entry loses it and status reads `review-required` throughout.         |
| `CandidateReviewApplicabilitySelectionV1`                         | `selectedBy`, unchecked                       | Candidate record, then a commit    | Covered or review-required for one residual.                                                                  |
| `CandidateReviewResponseEvidenceV1`                               | copied                                        | Candidate record, then a commit    | The fourth copy of one approval; its commit is what the head continuation proves.                             |
| `CandidateApplicabilitySelectionV1` (verification)                | `selectedBy`, unchecked                       | Candidate record                   | The verification twin of the review selection.                                                                |
| Checkpoint approval and the Errand merge interlock                | none                                          | checkpoint; conversation           | An exact-head merge authorization held as a handle.                                                           |
| `--resume` token judgments                                        | none                                          | boundary                           | An unschematized store of Owner decisions inside a command string.                                            |
| Legacy receipt payloads (`decision`, `head-update-authorization`) | `actorIdentity`                               | parse only                         | No writer found.                                                                                              |

- **They share a shape.** The CLI emits an exact offer, the agent obtains the Owner's choice, and echoes the offer back
  with it; only some shapes then keep who decided, and the shapes missing a decider are exactly those missing a
  timestamp. One envelope — subject, choice, decided-by, decided-at, basis — covers them. The two applicability
  selections already hold the whole envelope in their Candidate transitions (`selectedBy`, `selectedAt` on the review
  twin, `choice`, and the projection and residual digests), which the Candidate's fold reads in order.
- **They collapse.** The ceiling override, additional pass, and conditional authorization are one extra-pass decision
  with three preconditions; the singleton and delivery termini are one shape in two containers; the frontline skip and
  a `skip` invocation are interconvertible; the two applicability selections differ only in domain; and the Errand
  stop is an Owner terminus on an Errand subject.
- **Some go.** The fix authorization as its own shape, the confirmation action, the resume token's judgments with
  their scrubbers, the record-only head-move proofs, the redundant `nextPass`, and the legacy payloads.
- **Trust.** Who decided is checked for the termini, through `readOwnerTerminusAuthority`
  (`rg/policy/pre-publication-composition.ts`) with a completed work unit's owner as the fallback
  (`acceptDeliveryReviewTerminus`, `handlers/review.ts`), and for a local disposition approval, through
  `resolveLocalReviewAuthority` (`rg/hosts/local/review-authority.ts`): in both, `arc.identity` must equal the work
  unit's owner, and the local approval takes the active identity as an Errand's author. A frontline or hosted
  disposition approval takes the active identity unchecked (`resolveFrontlineActors`,
  `rg/runtime/respond-composition.ts`), and a conditional authorization must name the approver (`respond-command.ts`).
  Each is the active identity the review gate resolves, not a separate credential. The applicability selections'
  `selectedBy` is caller-supplied and unchecked.
- **Inventory.** `REVIEW_DURABLE_RECORD_INVENTORY` lists the disposition set, fix authorization, and fix consumption as
  durable records of their own, but each persists only inside the approved-disposition record.

## Withdrawal, reopen, and retirement

- **Withdrawal leaves no record.** No verb, flag, or record state names it. `reopen` returns an Integrating work unit to
  Active and closes or drafts its pull request (`withdraw-pr`, `lib/work-unit/lifecycle-transitions.ts`), leaving the
  Candidate and its `publication-pending` boundary as they were. `arc publish` then admits through
  `authorizeActivePublication`'s `publication-pending` arm (`lib/work-unit/verbs/publish.ts`), and a no-change
  `arc attest` re-carries the boundary to an Active work unit, so publication authority survives a deliberate
  withdrawal. A reopened work unit and an interrupted publish are the same state, and nothing tells them apart.
- **What reopen keeps.** The Candidate, the boundary with any Owner terminus and hosted reservation, lane progress, and
  frontline closure, which is keyed by Candidate rather than head. A no-change re-publish carries all of it. A re-root
  after code changes inherits pass counts through the supersession chain but overwrites the boundary, dropping the
  terminus and reservation, whose only durable home it was. The hosted-reservation carry checks the Candidate ID and
  repository but not the subject, by design: the Candidate record's currentness is the authority, and the
  reservation's use checks that the current Candidate head is the hosted target's (spec, § 9.4).
- **The original capture concerned a singleton,** not a one-member delivery: a withdrawn singleton could leave its
  Candidate and boundary mutually recognizable, so a later no-change reattestation revived it. A bound one-member
  delivery cannot be reopened (`entry-inspection.ts`).
- **Retirement.** 56 tracked files sit under `.arc/system/.internal/candidates/` on 2026-10-16 — 28 records and 28
  boundaries, every one for an archived work unit. Archive moves only the work unit's artifacts, and the record store
  has no delete. `subject-meta.ts` does not read them for a shipped work unit; before merge under `with-integration` the
  checkpoint and `attest --new-root` read the working-tree files; after merge only the Git-history reads remain.
  Deleting them is safe only after merge.
- **`seam-lifecycle` changes none of this:** it reuses `authorizeActivePublication`, its store-backed reopen and archive
  leave Candidates alone, and its spec's non-goals exclude Candidate and review records. Its store-backed
  `arc status <slug>` returns `integrationBoundary: null`, dropping the interrupted-publication recovery hint.

## Rules a write check cannot see

A write check reads stored records alone, not the order they were written in, and an attempt still in flight is
machine-local working state (spec § 4.7), so these rules of today's stay with the verbs that admit, approve, and
withdraw, each from the flip reading the in-flight record beside the stored outcomes:

- **No attempt pending at a pass after its finished one.** `validatePassCounts` refuses it over lane progress today;
  from the flip admission refuses to start one (Task 4.7 and Task 5.1 - `tasks-seam-delivery-review.md`).
- **An explicit frontline retry binds its prior.** `retryOfOperationId` is a run input no record keeps, so
  `validateExplicitRetry` keeps binding the retry to its prior's repository, target, and logical pass, refusing a
  `clean` or `findings` prior (Task 5.1 - `tasks-seam-delivery-review.md`).
- **A local retry's generation.** Admission computes one past the highest stored or in-flight generation
  (`nextLocalRetryGeneration`); the check verifies only that the stored generations stay contiguous (Task 4.9 -
  `tasks-seam-delivery-review.md`).
- **A consumed `approved-fix` extra pass whose admission has not ended.** The admission's citation lives in its
  in-flight record until its outcome is written, so `withdrawConditionalNextPassAuthorization` reads that record to
  refuse the withdrawal, as `withdrawLockedAdmission` refuses withdrawing the unrun admission itself
  (`conditional-authority-consumed`; Task 5.4 - `tasks-seam-delivery-review.md`).
- **A withdrawal after a successor's approval.** Today a withdrawal of an `approved-fix` extra pass refuses once a
  successor disposition set for its result is approved, while the reverse order stands: withdrawn, then a successor
  approved, since `invalidateConditionalNextPassAuthorization` keeps a withdrawn authorization as it is. Stored records
  show both and not their order, so `withdrawConditionalNextPassAuthorization` keeps the refusal, reading the stored
  evidence when it withdraws, and an imported or merged history that withdrew first passes the write check, the ref
  backend's pull-time check among them (Task 5.4 - `tasks-seam-delivery-review.md`).
- **A hosted record's first settlement entries.** `validInitialHostedDisposition` requires them `record-only` and
  uncarried; the approving verb writes them so (Task 5.3 - `tasks-seam-delivery-review.md`), and no check can tell
  that write from the import creating a record whose response was settled before it.

## Neighbors

The spec names no other work unit. These are the ones its descriptive references mean, and what each owns where it
meets this one:

- **"The lifecycle change"** — `seam-lifecycle`, merged: the pause record, the store-backed reopen (`runStoreReopen`)
  and publication this change edits, the project-ID port, and the task close verb with its copy-key match.
  Implementation builds on its landing.
- **"The planned locus change"** — `seam-locus`, Active on 2026-10-16: the `store` option on the subject's meta read
  (`projectCheckoutSubjectMeta`) with its read of the subject's Candidate record through it
  (`readStoreSubjectCandidate`, its A22, at `3a684b671` on its branch), its read of the subject's branch from the link
  (spec, § 12.1), and the reader of the landing-commit link. The subject's store read waits for that option on base
  (Task 7.6 - `tasks-seam-delivery-review.md`), the task loop stopping there where it has not landed; it reads the
  boundary through the same store and takes the Candidate authority from the record's `attestation.candidateId`, which
  that change leaves to this one. It also edits `lib/locus/subject-meta.ts`, `commands/active/status.ts`, and
  `handlers/status/lifecycle.ts`, so the two serialize there (spec, § 14.4), and reroutes the active-meta resolver's
  body (`resolveActiveWu`), which the review gate's five calls to it do not wait for: they resolve by the work item's
  link (spec, § 12.4; Task 4.4). The two Errand reads this change reroutes take the claim from the checkout's marker,
  which carries it today (`claimId`, `lib/git/worktree-marker.ts`), so they wait on none of its work; its probe
  (`runDerivedLocusStateProbe`), through which the review gate's hosted-Errand reads resolve, stays on the Errand ref
  until that change gives it a store arm (spec, § 14.4; Task 4.2). The Candidate mutation owner projects that probe
  until then (`resolveCandidateMutationOwner`), and its completed set reads the working tree's lifecycle index
  (`resolveCompletedCandidateWorkUnits`); that change's spec moves both onto the store (its § 2.1, § 3.4). Respond's Candidate
  reads and writes, `arc candidate applicability resolve`, and delivery execution's review-fix inspection and
  acknowledgement resolve their owner through them, so this change's flip-time tests take the owner from the harness's
  stand-in (spec, § 14.4; Tasks 4.2 and 4.6.c). Its landing is the pause before Phase 2, which merges base and
  re-grounds each task built on its plan against the code that landed (Task 1.8 - `tasks-seam-delivery-review.md`).
- **"A planned change to the standard lane's pass policy"** — `review-coverage-cadence`, its D4: a fix check takes a
  logical pass but adds nothing to the standard lane's pass count, the exhausted pass count an extra pass records stays
  its producer's logical pass, and the supersession chain carries both numbers (spec, § 4.3, § 5.5). It lands ahead of
  this change's Phase 4, where the task loop takes its landing or the Owner's choice to proceed without it (Task 3.7 -
  `tasks-seam-delivery-review.md`), and the two edit several of the same review-gate files, so the first base merge
  after it lands conflicts there: `status-errand.ts`, `status-composition.ts`, `status-singleton.ts`,
  `runtime/respond-command.ts`, `runtime/respond-composition.ts`, `runtime/local-prepare-composition.ts`,
  `policy/pre-publication-composition.ts`, `policy/review-policy-driver.ts`, `policy/hosted-reservation-discharge.ts`,
  `policy/hosted-reservation-support.ts`, `policy/hosted-reservation-admission.ts`, `hosted/coderabbit.ts`,
  `hosted/codex.ts`, `hosted/correction-review-capability.ts`, and `handlers/review.ts`.
- **"The ref backend" and "the import"** — `storage-ref-backend`: the import, its trial, and its refusals, which call
  this change's mapping (spec, § 11); the history refs and the `state-unresolvable` refusal (spec, § 10.4); and the
  layout row for the review kinds. Its spec builds only `arc rename`'s retry and leaves every other caller's to its
  verb, so this change builds the ended-item retry around every store it opens, the one task that waits for the refusal
  and `pull({ history })` on base (Task 7.5 - `tasks-seam-delivery-review.md`; spec, § 14.4).
- **"The cutover"** — `storage-cutover`: the flip, its workflow rewrite (spec, § 12.6), the quiesce of reviews in
  flight, and the deletion pass (spec, § 14.3).
- **The terminus's reach and invalidation** (spec, § 5.6) — `review-source-authority`. Whether an Errand takes a
  terminus, and a computed carry policy in place of the attended applicability choice (spec, § 5.8), are
  `review-orchestration-right-sizing`'s.
- **"Delivery's own redesign"** (spec, § 12.2, § 12.5) — `delivery-observe-attest`: how a stacked delivery's members and
  its lifecycle-contribution path group treat the review copy, and delivery's attribution moving onto captures.
- **"The Candidate-state projection"** (spec, Non-Goals) — `candidate-reroot-recovery-frame`; the boundary's withdrawal
  and a work item's end feed it.
- **`seam-status-roadmap`,** which the spec has no reason to mention: its "One identity" fix switches the identity read
  in `readLocalReviewLiveContext` (`rg/hosts/local/live-context.ts`) before the flip, and Task 4.4 -
  `tasks-seam-delivery-review.md` gives the same function its store-backed work-unit and Errand reads, so whichever
  lands second takes the conflict.

## Prior art

Gathered 2026-10-15 by a bounded research pass that verified nothing itself; the facts the design relies on match
independent knowledge and are re-checked at source-grounding.

- **Review records bind to an exact revision, and carry is mechanical.** A [GitHub review][github-reviews] carries
  `commit_id`; a [check run][github-check-runs] binds `head_sha`; a merge queue binds the exact merged SHA it tested.
  Gerrit copies a vote to a new patch set by a per-label `copyCondition` over computed change kinds — `NO_CHANGE`,
  `NO_CODE_CHANGE`, `TRIVIAL_REBASE`, `MERGE_FIRST_PARENT_UPDATE`, `REWORK` — marks the rest outdated, and keeps
  blocking votes sticky, `is:MIN` ([Gerrit labels][gerrit-labels]). GitLab resets approvals on push but compares pushes
  by `git patch-id`, so a rebase with an unchanged diff keeps them ([GitLab approval settings][gitlab-approvals]). No
  system read asks a person whether earlier review covers a change.
- **Git-native stores are append-only logs with a derived view.** [git-appraise][git-appraise] keeps one JSON object
  per line in notes with a format field `v`; git-bug folds operation packs into a snapshot; Radicle's collaborative
  objects fold a commit DAG ([Radicle protocol][radicle]). None stores a counter.
- **Findings have a computed identity.** [SARIF][sarif] gives a result versioned `partialFingerprints` and a
  `baselineState` — new, unchanged, updated, absent — relative to a baseline run.
- **Decisions bind a subject digest, and lifecycle is observed.** An [in-toto statement][in-toto] is a subject digest
  set plus a typed, versioned predicate; SLSA's [verification summary][slsa-vsa] names the verifier, policy, and inputs
  and leaves staleness to the reader. [Kubernetes conditions][k8s-conventions] are "observations and not, themselves,
  state machines", with `observedGeneration` marking the spec version a status was computed from. A
  [Step Functions task token][step-functions] binds an answer to one pending request and is regenerated on timeout;
  [Stripe's idempotency key][stripe-idempotency] replays the first result and refuses a reuse with different
  parameters.
- **Agent-facing interfaces.** [Published guidance][anthropic-tools] favors few workflow-level operations over many fine
  ones, compact default output with drill-down, and errors that state the fix; the one measured study,
  [SWE-agent][swe-agent]'s interface ablations, found bounded, summarized feedback and guardrails at the point of action
  raised task success. Typed refusals map onto [RFC 9457][rfc-9457]'s machine `type` plus extension members, and a
  resumable operation onto [AIP-151][aip-151]'s handle with `done`, progress, and result. No controlled study isolates
  call count or schema discoverability against agent cost, so efficiency claims want ARC's own measurement.

---

[github-reviews]: https://docs.github.com/en/rest/pulls/reviews
[github-check-runs]: https://docs.github.com/en/rest/checks/runs
[gerrit-labels]: https://gerrit-review.googlesource.com/Documentation/config-labels.html
[gitlab-approvals]: https://docs.gitlab.com/ee/user/project/merge_requests/approvals/settings.html
[git-appraise]: https://github.com/google/git-appraise
[radicle]: https://radicle.dev/guides/protocol
[sarif]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/sarif-v2.1.0-errata01-os-complete.html
[in-toto]: https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md
[slsa-vsa]: https://slsa.dev/spec/v1.0/verification_summary
[k8s-conventions]: https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md
[step-functions]: https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html
[stripe-idempotency]: https://docs.stripe.com/api/idempotent_requests
[anthropic-tools]: https://www.anthropic.com/engineering/writing-tools-for-agents
[swe-agent]: https://arxiv.org/abs/2405.15793
[rfc-9457]: https://www.rfc-editor.org/rfc/rfc9457
[aip-151]: https://google.aip.dev/151
