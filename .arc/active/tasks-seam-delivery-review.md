# Task List: Seam Delivery and Review Records

- **Design:** `spec-seam-delivery-review.md`

---

## **Phase 1:** The review family's kinds

_Purpose:_ Settle the six kinds every later phase writes, reads, or maps — their field schemas, keys, parsers, and write
checks, with the pure derivations the policy and the mapping share — before any caller moves onto them.

_Mode:_ `layer` — closes on the six kinds registered, their schemas and write checks settled and tested.

_Exit criterion:_ Each kind's parser and every write-check rule § 4–9 names refuse their breaking write and admit their
valid counterpart; `review/terminus` appears in neither `KIND_SHAPES` nor `KIND_MECHANISMS`; and with the
registrations in the production list, the in-repo implementation reads and writes today's Candidate and boundary records
unchanged, its own-key check included, and imports neither kind's parser.

_Design decisions:_ Each kind lives in a folder of its own under `lib/store/kinds/review/`, beside the shipped kinds'
layout (`schema`, `parser`, `check`, `registration`, `index`). A rule the record's content settles alone is the
parser's, and one that reads the record's key, another record, or its prior version is the write check's (§ 2.5), so
the Candidate registers no check. The pure derivations later phases share — the outcome's key, its pass counts and
settled state, the decision's key, and the readiness binding's digest — live with the kind whose records they read, so
the mapping (Phase 3) and the review gate (Phases 4–6) compute them one way.

### `[x]` **1.1 Reshape the review kinds in the catalog and the registry — § 2.1, § 13**

- _Goal:_ The registry names `review/decision` where it named `review/terminus`, still keyed by `id` on its work item;
  `review/outcome`, `review/decision`, and `review/adversarial-pass` take the `create-only` writer rule; and the four
  keyed kinds stay unhomed in the in-repo implementation.

- _Outcome:_ The catalog names `review/decision`; outcomes, decisions, and adversarial passes are create-only, while
  evidence remains single-writer. All four keyed review kinds retain their unsupported in-repo persistence and absent
  listings, and reference conformance selects their create-only checks automatically.

### `[x]` **1.2 Build `review/outcome`, its key, and its derivations — § 4.1–4.3, § 4.8**

- _Goal:_ An outcome record holds one ended attempt's result from any source under its attempt's stable identity, its
  parser and write check refuse every record today's attempt invariants and pass-count rules refuse, and pure
  derivations give a lineage's pass count in a lane and whether a result is settled, from stored records alone.

    - `[x]` **1.2.a The schema, its parser, and the key**

        - Added the immutable outcome schema, issue-bearing JSON codec, and stable admission-based hosted key. Source
          bindings retain portable admission and receipt facts; frontline policy and result digests stay recorded,
          without executable paths or arguments. Shared admission validators enforce content invariants, including
          delivery lineage and coverage, and local failure receipts retain the existing lane-vocabulary mapping.

        - _Amended in:_ 1.2.R (A7)

    - `[x]` **1.2.b The write check**

        - The registered write check evaluates the whole proposed lane-owner history, rejecting duplicate terminal
          producers or hosted admissions, late or discontinuous local generations, and altered or discontinuous retries
          under one extra-pass decision. Unavailable and malformed listings refuse with actionable diagnostics; moving
          Errand heads and independently numbered sources retain their existing behavior.

    - `[x]` **1.2.R Preserve frontline source-binding identity**

        - _Goal:_ The portable frontline outcome retains the original canonical `sourceBindingId` required by
          disposition matching, without carrying executable paths or arguments (A7).
        - _Outcome:_ The frontline binding requires its recorded canonical source digest. Production-derived fixtures
          retain command and response identities; an existing approved set still matches after portable serialization,
          while missing or malformed digests refuse and executable paths and arguments remain absent.

    - `[x]` **1.2.c The pass-count and settled derivations**

        - Pure derivations reproduce result identities, derive settlement from exact approved response evidence, and
          keep logical and complete-coverage counts distinct across validated supersession histories. Hosted findings
          require full settlement coverage; fixes require matching performance. Outdated predecessor outcomes do not
          carry passes, while current unsettled findings still count as finished.

### `[x]` **1.3 Build `review/decision`, its envelope, and its content key — § 5.1, § 5.2, § 5.4, § 5.10**

- _Goal:_ A decision record carries one person's choice about an exact review subject in one envelope, keyed by a
  digest of its content so the same decision recorded twice names one record, and its parser and write check refuse an
  envelope incomplete for its choice and a withdrawal that cites nothing it may withdraw.

    - `[x]` **1.3.a The envelope, its parser, and its key**

        - Added strict decision envelopes, an issue-bearing JSON codec, and time-independent content keys. Termini
          carry their counted basis; approved-fix decisions retain the original producer and logical ordinal and reuse
          the production authorization key. Historical attribution stays nullable except for the required authorizer.

    - `[x]` **1.3.b The write check**

        - The registered check binds content keys and approved-fix grants to stored finished producers. Withdrawals
          require an existing decision on the same work item, the original approved-fix authorizer, and no outcome
          citing that grant. Related listings must be complete and parseable; in-flight and successor timing remain
          with the withdrawing verb.

### `[ ]` **1.4 Build `review/evidence` and its succession rules — § 6.2, § 6.3, § 6.5**

- _Goal:_ An evidence record holds one approved response under its disposition set, naming its result by outcome key and
  its predecessor and successor sets; its parser holds the set and settlement rules a record settles alone, and its
  write check admits a record created whole and only today's in-place advances after: a performance once, the successor
  mark in its successor's batch, the policy projection's one correction, the Candidate response's binding once, and
  append-only settlement.

    - `[x]` **1.4.a The schema and its parser**

        - Added strict approved-response envelopes with all five ownership shapes, optional advisory tags, atomic
          performance, and hosted settlement. Canonical approval, transition, policy-projection, and settlement checks
          share existing constructors and the extracted per-set validator. Producer-dependent checks remain in 1.4.R.

    - `[x]` **1.4.R Ground producer-dependent evidence rules in the outcome**

        - _Goal:_ Rules requiring the result's source kind or original lineage read the referenced outcome through the
          write check, preserving the existing performance invariants without treating response ownership as producer
          lineage (§ 2.5, A8).
        - Outcome-backed checks bind the exact producer, approved context, findings, original fix head, and host
          coordinates. Candidate response digests require original Candidate lineage. Missing or unreadable outcomes
          refuse with diagnostics; an unperformed frontline member binding remains readable. Settlement and admission
          share one pure comparison of approved sets with outcomes.

    - `[ ]` **1.4.b The write check**

        - The key, the hosted result's sealed findings, a record created whole, and today's advances from
          `appendDispositionRecord` (`rg/hosts/local/disposition-record-store.ts`) and lane progress's transitions
          (`rg/hosts/local/operation-state-store.ts`) on update, each under a stable identifier.
        - Build `test-first` (one behavior at a time):
            - a record stored under a key other than its `dispositionSetId` refuses
            - a hosted set whose finding actions do not cover exactly its result's sealed findings, or whose settlement
              names another finding, refuses
            - a created record naming a successor its batch does not create, naming it as predecessor, refuses, and a
              record created already performed and settled is admitted
            - `performance` goes from absent to set once, nothing else changing (`isFixResponseAdvance`)
            - `successorDispositionSetId` goes from absent to the new set's ID only in the batch creating that set with
              this one as its predecessor, while neither has a performed response (`isDispositionSuccessorAdvance`);
              a second successor refuses
            - `policyProjectionPending` clears, and `responsePolicyRequest` may change in the same write, only while no
              response is performed (`isPolicyProjectionAdvance`)
            - a written performance stays unchanged but for `candidateResponseId`, which may be added once
              (`assertResponsePerformanceTransitions`, `isCandidateResponseBindingAdvance`)
            - settlement entries are append-only, each appended entry replied, resolved, and not carried, and a
              successor may start with its predecessor's entries, each carried and otherwise identical
              (`assertHostedTransitions`)
            - an unbound record does not gain a binding later
            - every advance preserves tags and their absence, refusing their addition, removal, or alteration; a
              successor may have its own tags without changing its predecessor's
            - a listing that is unreadable or missed entries refuses

        - A hosted record's first entries are `record-only` and uncarried as the approving verb writes them
          (5.3.a), a rule the check leaves out since it cannot tell that write from the import's (§ 6.5).

### `[ ]` **1.5 Build `review/adversarial-pass` — § 7.1, § 7.3, § 7.4**

- _Goal:_ An adversarial-pass record holds a typed header and the evaluator's report as prose under the store's `pass`
  key; its parser validates the header, its artifacts as its activity gives them, and refuses two dispositions for one
  finding, and its write check refuses a key naming another activity.

    - The record is JSON, as every never-projected kind is: the header fields of § 7.3 — activity, artifact versions,
      code head where it reviewed code, rubric identity, `Pass N of M`, approver and time, any over-cap approval, the
      stop reason, and one disposition per finding — with the report and each finding's account as prose fields.
    - The key is `{ activity, number }` (`lib/store/identity.ts`); the activities are § 7.1's six: `draft-readiness`,
      `spec-finalization`, `task-generation`, `design-amendment`, `verification`, and `criteria`.
    - Each activity's header binds the artifacts § 7.1 gives it, each by its store version, and the code head where it
      reviews code.
    - The record holds no next-pass authorization (§ 7.3).
    - Build `test-first` (one behavior at a time):
        - a record for each activity parses, and one with an unknown activity refuses to parse
        - a header binding artifacts other than its activity's, or lacking the code head where its activity reviews
          code, refuses to parse, while a `spec-finalization` header binding a spec no draft fed parses
        - a header missing a required field refuses to parse, and the prose fields take any text
        - two dispositions for one finding refuse to parse
        - a record whose key's activity differs from its header's refuses at the write check

### `[ ]` **1.6 Build the Candidate and boundary kinds, and the readiness digest — § 8, § 9.1, § 9.2, § 9.5**

- _Goal:_ The Candidate kind's parser validates today's managed record whole and recomputes its IDs; the boundary kind's
  parser admits `schemaVersion` 1 as today's parse reads it and 2, its write check refusing version 1; and one pure
  digest over a standard-lane listing gives the binding readiness records and publication recomputes.

    - `[ ]` **1.6.a The Candidate kind**

        - The parser is `CandidateManagedRecordV1Schema` (`lib/work-unit/candidate-attestation.ts`), whose refinements
          carry § 8.2's log checks and recompute the Candidate ID and every response ID (§ 8.5); the kind registers no
          write check. The public schema gives `VersionedCandidateRecord` its home (§ 3.1).
        - Build `test-first` (one behavior at a time):
            - a record whose Candidate ID or a response ID does not recompute refuses to parse
            - a verification response or selection that does not continue the running target refuses to parse
            - an evidence reference used twice, and a repeated exact review selection, refuse to parse

    - `[ ]` **1.6.b The boundary's two versions**

        - Version 2 is defined in a module of its own, `rg/policy/integration-boundary-locus-v2.ts`, since
          `rg/policy/integration-boundary-locus.ts` already sits near the file-length limit. The schema pieces both
          versions use — the next actions other than run-verification, the reservation and its target, and the common
          boundary fields — move to `rg/policy/integration-boundary-locus-shared.ts`, which imports neither version. The
          run-verification action and the post-attest continuation stay per version: version 1's module keeps today's
          and 4.5.a's widened copy (§ 3.5), and version 2's defines its own, `"merge"` and no `projectionDisposition`.
          Version 2's module imports only the shared one; version 1's module, which keeps the projections, imports the
          shared module and version 2's schema, which the projections' arms from the flip build and parse their output
          with (4.5.b, 6.1, 6.2.b, 6.4), and re-exports what moved so its importers stay unchanged. Imports run shared,
          then version 2, then version 1, and the kind's `schema` re-exports both versions.
        - Version 2 follows § 9.1 field by field: terminus names by decision key, no `policy` or
          `standardLaneOwnerVersion`, `readinessBinding` — a digest or `null` — on `candidate-publish-ready` and
          `publication-pending` alone, the policy-review variant folded into the review-resume variant,
          `postAttestContinuation` without `projectionDisposition`, `continue-pre-publication-review` keeping
          `responseOperationId` and `responseSource` as opaque keys that match the stored outcome (§ 9.3), and
          `verificationKind` `"merge"`.
        - The parser dispatches on `schemaVersion`: 1 to today's parse (`parseIntegrationBoundaryLocus`,
          `rg/policy/integration-boundary-locus.ts`), which reads a legacy hosted-review-pending boundary as
          `delivery-status-required`, and 2 to the new schema; the public schema exports both, and
          `VersionedSubmissionBoundary` (§ 3.1).
        - Build `test-first` (one behavior at a time):
            - a version 1 boundary of every locus parses as today, a legacy hosted-review-pending one as
              `delivery-status-required`, and a version 2 boundary of every locus parses
            - loading version 1's module alone, and version 2's alone, each defines its schemas with no import cycle
            - a version 2 boundary carrying `policy`, `standardLaneOwnerVersion`, or `"tier-3"` refuses to parse
            - a post-attest continuation without `projectionDisposition` refuses under version 1 and parses under
              version 2, and one carrying it refuses under version 2 (§ 3.5)
            - `readinessBinding` absent on `candidate-publish-ready` or `publication-pending`, or present elsewhere,
              refuses to parse, and `null` there parses
            - a next action, reservation, or continuation a locus does not admit, and a delivery member twice in
              `deliveryReviewTermini`, refuse to parse, as their variants' refinements refuse them today

    - `[ ]` **1.6.c The boundary's write check**

        - Build `test-first` (one behavior at a time):
            - a write of `schemaVersion` 1 refuses, and a write of version 2 is admitted

    - `[ ]` **1.6.d The readiness binding's digest**

        - One pure function takes a work item's listings of outcomes, evidence, and decisions, each with its
          completeness, the lineage's subject owner, and the lane's in-flight attempts, and selects for itself what the
          binding covers: the standard lane's outcomes on that owner, the evidence whose result is one of them, the
          `approved-fix` decisions on that lineage, and the withdrawals of those decisions, each by its key and a digest
          of its canonical content (`canonicalize`, `lib/kernel/canonical/canonical-json.ts`), with each in-flight
          attempt by its attempt ID and a digest of its canonical in-flight state. It returns their digest, or an
          incomplete result when any listing was incomplete (§ 9.2). The import, readiness, and every publication site
          call this one selector.
        - Build `test-first` (one behavior at a time):
            - the same records in any order give one digest
            - a record whose stored bytes differ only in key order or whitespace gives the same digest
            - a changed record, an added record, or an added in-flight attempt gives another
            - a record rewritten with the same content gives the same digest
            - a terminus, a selection, or a lane-skip decision changes nothing
            - another lane's outcome, an outcome on another subject owner, and evidence for an outcome outside the lane
              change nothing
            - an incomplete listing gives no digest

### `[ ]` **1.7 Register the six kinds — § 2.5**

- _Goal:_ `PRODUCTION_REGISTRATIONS` installs each review kind's parser, and each but the Candidate's write check, so
  every backend built on it parses and checks through them, while the in-repo implementation, built on a list that
  imports no review registration, reads today's Candidate and boundary records with their keys and own-key check as
  today.

    - One `registration.ts` per kind through `defineKindRegistration`, joining `PRODUCTION_REGISTRATIONS`
      (`lib/store/kinds/registrations.ts`); the schemas, keys, and derivations are public through
      `lib/store/kinds/review/index.ts`.
    - Each `registration.ts` joins `RAW_STATE_MODULES` (the package's `eslint/architecture-imports.ts`), which lists
      them by hand, with a case in `__tests__/unit/eslint-architecture-imports.test.ts`.
    - `createInRepoContext` (`lib/store/in-repo/context.ts`) builds its registry from a narrower list, today's
      registrations in a module that imports no review registration, since a parser is synchronous and cannot load
      lazily and the in-repo implementation runs no write check. Its read codec keeps its deferred Candidate and
      boundary decode (`decodeTrackedContent`, `lib/store/in-repo/read-codec.ts`), which already returns their keys, so
      `read.ts` and `list.ts` keep their own-key check and `in-repo-boundary.test.ts`'s deferred list stays as it is.
      `__tests__/integration/store-registered-reads.test.ts`, which mocks `kinds/registrations.js` to reach the in-repo
      context's registry, mocks the narrower module instead, the export its mock replaces renamed with it.
    - `lib/store/kinds/README.md` gains the review rows, and `lib/store/kinds/review/README.md` names the folder's
      kinds and what each holds.
    - Build `test-first` (one behavior at a time):
        - the production registry holds a parser for each of the six kinds and a write check for each but the
          Candidate
        - the in-repo backend's static import closure holds no review registration and no module the deferred list
          names
        - an in-repo read of today's Candidate record and boundary returns their fields, a record whose key names
          another work unit still refuses `identity-mismatch`, and the conformance cases
          `diagnostic-key-mismatch:review/candidate` and `diagnostic-key-mismatch:review/integration-boundary` pass
        - an in-repo write of today's boundary lands byte for byte as today with the registrations in place
        - over a reference backend built on the production registry (`createKindRegistry(PRODUCTION_REGISTRATIONS)`,
          as the lifecycle harness builds one), a successor evidence record and its predecessor's mark land in one
          `batch`, and a second successor refuses

    - The reference conformance fixture installs its own test registry, and the in-repo implementation runs no
      write check, so the production registrations reach a backend's checks in tests only through the wiring test above
      and 4.2's harness.

### `[ ]` **1.8 Take the planned locus change's landing, and re-ground the tasks built on it — § 12.1, § 12.4, § 14.4**

- _Goal:_ Phase 2 starts on a base carrying the planned locus change, with every task that names that change's code
  grounded in what landed rather than in its plan.

    - The merged base carries that landing. Verify its presence by slug and retain the source-grounding check below;
      there is no remaining locus landing wait.
    - Re-check against the landed code each task grounded on that change before it landed: 2.4.c
      (`lib/locus/subject-meta.ts`, `commands/active/status.ts`, and the deferred list in `cli-loading-boundary.test.ts`),
      4.2 (the production Candidate mutation owner and store-only locus Errand discovery), 4.4.a (the review
      gate's five calls to `resolveActiveWu`), 4.4.b (the marker's `claimId`), 4.6.b, 4.6.c
      (`resolveCandidateMutationOwner`), 7.2 (`handlers/status/lifecycle.ts`), and 7.6 (the subject's `store` option and
      `readStoreSubjectCandidate`), with spec § 12.1, § 12.4, and § 14.4 and `notes-seam-delivery-review.md`
      § Neighbors, including the probe's nested delivery-correction and pending-fix callbacks (4.1.b, 5.6.b, 7.6).
      Recheck the shipped code rather than reinstating provider stand-ins. A correction runs through
      `amend-design.md` before Phase 2 starts.

## **Phase 2:** Before the flip — Candidate and boundary callers through the store

_Purpose:_ Land everything observable before the flip: the checkpoint's binding first, ahead of the integration
reroute it precedes, then every Candidate and boundary caller outside `lib/store/` moved onto the store with today's
behavior.

_Mode:_ `replication` — closes when every Candidate and boundary caller outside `lib/store/` reads and writes through
the store, batch-verified by today's tests.

_Exit criterion:_ The review gate's, delivery's, and integration's existing tests pass over the in-repo implementation
with no assertion changed, but for 2.1's named tests and the loading-boundary specifiers 2.4.c names, a stub only moving
to the module its caller now imports or, where a caller's test runs outside a repository, stubbing the typed access
(2.3.b); the import ratchet refuses any production value importer of the Candidate or boundary store outside
`lib/store/`, at a zero floor; merge refuses when the meta record or the code head moved after the checkpoint and passes
when only an unrelated record did; and no import-ratchet floor grows.

_Design decisions:_ The two stores stay where they are as the in-repo implementation's adapters, re-exporting what moves
out of them until the deletion pass, since tests build fixtures with them (§ 3.1). The typed access keeps their function
names, parameters, and error classes, its last parameter taking today's `fs` port or an options object carrying the
caller's `Store`, and opens the checkout's store only where none is passed, so each caller batch lands with its tests
unchanged, a `vi.mock` of a store module moves to the typed access's module, and a composition root or test that holds a
store reads and writes through that one. Reads of a record at a Git revision, in the index, or at `HEAD` stay today's
in-repo arms and are not routed through the store: `handlers/delivery-execution.ts`'s `git show HEAD:` reads,
`candidate-response-confirmation.ts`'s read at `approvedHead`, `checkpoint-composition.ts`'s `HEAD` and index reads
(`readShippedDeliveryPublicationCommit`), and `gitCandidateRecordAtHead`
(`rg/policy/mechanical-review-applicability-carry.ts`). So does the worktree read `stageDeliveryReviewTerminusBoundary`
pairs with its `git show HEAD:` read (`handlers/review.ts`), the two halves of one replay against `HEAD` that 6.5.c
retires.

### `[ ]` **2.1 Bind the integration checkpoint to the meta record and the code head — § 3.2**

- _Goal:_ The checkpoint records the version of the work unit's meta record it attested, read as of the lifecycle
  snapshot's state version, beside the approved head, and merge compares those, so a write to any other record between
  checkpoint and merge no longer stales it, and a checkpoint written before the change invalidates as `head-mismatch`.

- _Note:_ In-repo the meta's version still derives from `HEAD`, so today's verdicts are unchanged there; the binding
  shows only over a store whose versions move independently. This is the one behavior change before the flip, so the
  tests that pin today's value change with it, each named below.

    - `[ ]` **2.1.a The snapshot gives the meta record's version, and the checkpoint records it**

        - `StoreLifecycleSnapshot` (`lib/store/lifecycle-storage.ts`) gives a work unit's meta record version by slug
          from the entries it already listed at its state version, so injected lifecycle storage carries it too.
        - `scripts/integration/checkpoint-composition.ts` records that version in `lifecycleVersion`, whose name and
          schema stay (`IntegrationCheckpointCompositionRecordSchema`, `checkpoint-store.ts`), in place of the
          snapshot's whole version.
        - The published lifecycle summary keeps `storageVersion` as the snapshot's whole version
          (`IntegrationLifecycleSummarySchema`, `scripts/integration/checkpoint.ts`); the meta record's version travels
          beside it, outside the published summary, from the snapshot to the checkpoint's record and to `readStatus`.
        - The Candidate record's version stays asserted on its own (`assertRecordVersion`).
        - Build `test-first` (one behavior at a time):
            - the snapshot gives each listed work unit's meta record version, and none for a work unit it did not list
            - the checkpoint records the meta record's version

    - `[ ]` **2.1.b Merge compares the meta record's version and the code head**

        - `readStatus` (`scripts/integration/merge-composition.ts`) returns the meta record's version as
          `lifecycleVersion`, and `merge.ts` compares it where it compares `lifecycleVersion` today.
        - The tests that change with the value: `store-lifecycle-storage.test.ts`'s `readStatus` assertions of
          `lifecycleVersion` as `HEAD` and its two injected snapshots, which gain the meta record's version; the
          `readStatus` stubs and checkpoint fixtures in `merge.test.ts`, `checkpoint-store.test.ts`, and
          `candidate-lineage-suite.ts`; and `checkpoint-lifecycle-artifacts.test.ts`'s injected snapshot, its
          `storageVersion` assertion unchanged.
        - Build `test-first` (one behavior at a time):
            - over the reference backend (`__tests__/helpers/store/reference-backend.ts`) passed as the store, with a
              scripted Git runner for the head and branch, merge refuses `head-mismatch` when the work unit's meta
              record moved after the checkpoint
            - it refuses when the code head moved
            - it passes when only an unrelated record moved — another work unit's meta, or a review record
            - a checkpoint holding `HEAD` as its `lifecycleVersion` invalidates as `head-mismatch`, whose next action is
              to checkpoint again
            - over the in-repo implementation, today's merge scenarios pass unchanged

### `[ ]` **2.2 Read a review record's placement from the reading checkout's own tree — § 3.1**

- _Goal:_ Wherever today's store read returns a Candidate or boundary record, the store's in-repo read returns it too:
  its placement comes from the reading checkout's flat-active meta, then the tree's other lifecycle tiers, before any
  composed selection that could refuse `store.lifecycle-incomplete`.

    - `lib/store/in-repo/read.ts` takes a review record's placement from `heldMetaSources` over the working tree before
      `selectMeta`'s composed selection (`requireComposedMetaSelection`); a tier the tree cannot read refuses nothing
      for a record whose meta another tier holds. The listing already takes held metas first (`metaListingSources`,
      `list.ts`).
    - Build `test-first` (one behavior at a time):
        - a record whose meta is flat-active reads at placement `active`
        - a record whose meta sits only in the same tree's `completed/` reads at its completed placement with no
          composed lifecycle read
        - an absent record file reads as not found before any placement
        - a branch-level acquisition failure elsewhere refuses nothing for a record whose meta the tree holds
        - an unreadable lifecycle tier refuses nothing for a record whose meta another tier holds

### `[ ]` **2.3 Move the paths, the typed access, and the Candidate history read to `lib/store/kinds/review/` — § 3.1**

- _Goal:_ Callers find the Candidate's and boundary's paths, their typed reads and writes, and the Candidate's history
  in `lib/store/kinds/review/`, the paths resolved through the layout's addresses, the reads and writes through the
  checkout's store with today's names and parameters, and the history's in-repo arm today's plain path-log walk, so no
  caller imports either store.

    - `[ ]` **2.3.a The path resolvers**

        - `resolveCandidateRecordRelativePath` and `resolveSubmissionBoundaryPath` move, built on the layout's
          `candidate-record` and `integration-boundary-record` addresses (`resolveArcPath`, `lib/layout/projection.ts`)
          in place of their hand-built paths; the stores re-export them.
        - Build `test-first` (one behavior at a time):
            - each resolver returns the literal path today's store builds for a named work unit's record

    - `[ ]` **2.3.b The typed access**

        - Each read and write the stores export today — `readCandidateRecord`, `readCandidateRecordVersioned`,
          `readCandidateRecordVersion`, `writeCandidateRecord`, `readSubmissionBoundary`,
          `readSubmissionBoundaryVersioned`, and `writeSubmissionBoundary` — keeps its name, its parameters, and its
          errors, its last parameter, today's `fs` port, taking either that port or an options object
          (`{ store?, exec?, fs? }`), so every call and stub today's callers make stands unchanged; where the caller
          passes no store, the call opens the checkout's store, with the caller's Git runner where it passes one
          (`createStore(createDefaultStorePorts({ checkoutRoot, exec }))`). A caller passing its own `fs` port, as tests
          do, reads and writes the file through that port as today.
        - The Candidate's version (`VersionedCandidateRecord.version`, `readCandidateRecordVersion`'s return) is typed
          `string | null`, as the boundary's version and the write's `expectedVersion` already are, since a store
          version is the backend's own; in-repo it stays the byte digest, so a stub or fixture building a digest literal
          stands. The checkpoint composition's internal `recordVersion` and `observedRecordVersion`
          (`scripts/integration/checkpoint-composition.ts`) widen with it, and where the value reaches a published field
          still typed as a digest — an applicability offer's `expectedRecordVersion` and the checkpoint's
          `candidate-record-moved` payload, both in 4.5.a's list — it is parsed as one (`CanonicalDigestSchema`,
          `lib/kernel/schema/vocabulary.ts`) until 4.5.a widens that field.
        - Each write is also available as the `put` a caller adds to its own `batch`.
        - A store `not-found` reads as `null`; `version-conflict` throws `CandidateRecordVersionConflictError` or
          `SubmissionBoundaryVersionConflictError`, which move here and the stores re-export; a malformed record throws
          today's parse error; any other refusal throws with its condition and remedy; a write returns the record's
          path.
        - Store access needs Git where today's file reads did not — a write takes the tracked lock, and a read with no
          meta in the tree composes lifecycle — so a test running a caller outside a repository stubs the typed access.
        - Build `test-first` (one behavior at a time):
            - a read over the in-repo implementation returns today's record with its byte-digest version, and an absent
              record reads as `null`
            - a read given a store whose versions are not digests returns that store's version, and the checkpoint
              composition compares it as it compares a digest today
            - a malformed record throws today's parse error, and a record whose key names another work unit throws
            - a write against a moved version throws today's conflict error and writes nothing
            - a write returns the path today's store returns
            - a read and a write given a store go through that store and open none, and a write's `put` lands in the
              caller's batch

    - `[ ]` **2.3.c The Candidate history read**

        - One read returns a Candidate's supersession chain and a record's revision; its in-repo arm is
          `readRepositoryCandidateSupersessionChain` and `readRepositoryCandidateRecordRevision`, which the store
          re-exports. Its arm from the flip is 4.8's.
        - Build `test-first` (one behavior at a time):
            - over a scripted repository, the chain and the revision name the scripted commits, a version a merge commit
              introduced included, where the store's `history` drops it

### `[ ]` **2.4 Reroute the work-unit, lifecycle, delivery, and locus callers — § 3.1, § 14.2**

- _Goal:_ No work-unit, lifecycle, delivery, or locus module imports the Candidate or boundary store: each reads and
  writes through the typed access, takes its types from the kinds' public schemas and its paths from their new home, and
  passes today's tests unchanged.

    - Each batch runs a whole-project `lint:ts` and prunes the `store-raw-state` suppressions its reroute leaves unused
      (`--prune-suppressions`), since an unused suppression fails the run.

    - `[ ]` **2.4.a Attest, the publication claim, and the reopen permit**

        - `handleAttest`, `claimPublicationBoundary`, and `permitDeliveryReopen`
          (`handlers/lifecycle-delivery-review.ts`), and `lib/work-unit/verbs/attest.ts`, whose result and remedy keep
          the Candidate record's commit (`recordRevision`, `candidateRecordRevision`) in-repo.

    - `[ ]` **2.4.b The Candidate's own verbs**

        - `handlers/candidate.ts`, `lib/work-unit/candidate-applicability-resolution.ts`, and `commands/rename.ts`.

    - `[ ]` **2.4.c The subject's readers**

        - `lib/work-unit/git-candidate-subject.ts` and `commands/active/status.ts`, whose dynamic import of the stores
          stays dynamic, so `cli-loading-boundary.test.ts`'s deferred-module list swaps their specifiers for the typed
          access's, and the package's `eslint.config.js` bans a static import of the typed access's module in
          `commands/active/status.ts` in place of the two stores'.
        - `lib/locus/subject-meta.ts` reads another checkout's records through its injected IO (`SubjectMetaIO`), the
          in-repo arm it keeps wherever it is given no store that reports `stateOffBranch` (7.6): it takes the resolvers
          and a pure boundary parse from `lib/store/kinds/review/`, keeping its absent-file reads as `null` and its
          work-unit and path checks.
        - _Note:_ Both subject readers already carry the shipped locus changes; preserve their store-aware paths
          while rerouting the in-repo adapters (§ 14.4).

    - `[ ]` **2.4.d Delivery and the path classifiers**

        - `handlers/delivery-execution.ts`'s Candidate and boundary reads and writes, `lib/delivery/repository-entry.ts`,
          `lib/delivery/lifecycle-contribution.ts`, `lib/delivery/review-fix-record-effects.ts`, and
          `lib/base-drift/current-adapters.ts`.

### `[ ]` **2.5 Reroute the integration callers — § 3.1, § 14.2**

- _Goal:_ No integration module imports the Candidate or boundary store, and the checkpoint, its confirmation, and its
  lineage review compose as today.

    - `scripts/integration/checkpoint-composition.ts`, `candidate-response-confirmation.ts`, and
      `lineage-review-composition.ts`; `checkpoint-delivery-composition.test.ts`'s stubs of the versioned and
      version-only Candidate reads and of `readSubmissionBoundary` move to the typed access's module, their call-count
      assertions unchanged.
    - Each batch prunes the suppressions its reroute leaves unused.

### `[ ]` **2.6 Reroute the review gate's callers — § 3.1, § 14.2**

- _Goal:_ No review-gate module imports the Candidate or boundary store, and every lane, response, and status read
  behaves as today.

    - Each batch prunes the suppressions its reroute leaves unused.

    - `[ ]` **2.6.a The review handler**

        - `handlers/review.ts`'s Candidate and boundary reads and writes.

    - `[ ]` **2.6.b The policy modules**

        - `rg/policy/delivery-review-terminus.ts`, `mechanical-review-applicability-carry.ts`,
          `pre-publication-composition.ts`, and `review-applicability-resolution.ts`.

    - `[ ]` **2.6.c The runtime and status modules**

        - `rg/runtime/candidate-response-head-continuation.ts`, `local-prepare-composition.ts`,
          `respond-composition.ts`, and `singleton-publication-response.ts`, and `rg/status-composition.ts`.

### `[ ]` **2.7 Before the flip** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

    - `lib/work-unit/submission-boundary-store.ts` joins `RAW_STATE_MODULES` (the package's
      `eslint/architecture-imports.ts`) beside the Candidate store, with a case in
      `__tests__/unit/eslint-architecture-imports.test.ts`, so the ratchet refuses any production value importer
      outside `lib/store/` at a zero floor; a type-only import, which the ratchet does not count, takes its types from
      the kinds' public schemas (2.4).
    - A whole-project `lint:ts` shows no floor grown; 2.1's tests and the carve-outs this phase names pass.

## **Phase 3:** The import's mapping

_Purpose:_ Map today's review records of live work into the family, so the kinds meet real records before any arm
from the flip writes them, and the ref backend's import can carry live review state.

_Mode:_ `slice` — closes on this repository's review records mapped into the family through the import's port shape.

_Exit criterion:_ Run over this repository's review records, the mapping's listing accounts for every source exactly
once; every record it returns parses and passes its kind's write check over the returned set; a fixture holding a
`pending` attempt lists its file as in flight; each live work unit's supersession chain read through the mapped
Candidate records equals `readRepositoryCandidateSupersessionChain`'s; and a diagnostic run over the same records, with
every work item marked live and a live Errand row for each claim ID the review gate's lineages name, maps every attempt,
disposition set, authorization, and skip marker to records that parse and pass, every consumed authorization's admitting
attempt citing it, gives each supplied Candidate whose versions all map the supersession chain
`readRepositoryCandidateSupersessionChain` gives, and leaves behind only for the reasons § 11.2 names, the Candidate
versions today's reader refuses among them.

_Design decisions:_ The mapping is a pure module under `lib/store/kinds/review/` that meets the import's port by shape
and imports nothing of the import's (§ 11). The import's own reads, writes, trial, and refusals stay with the ref
backend. A fact of work that is not live is left behind before any other rule applies. Today no live work unit holds a
Candidate and no Errand is open, so the real run maps nothing; the diagnostic run, every table row live and the archived
Candidates supplied, is what exercises the mapping over real records. Its table adds a live Errand row for each claim ID
the review gate's lineages name, since this clone's Errand ref holds none and an Errand's records name it by claim ID
alone.

### `[ ]` **3.1 Build the mapping's module, its work-item resolution, and its listing — § 11, § 11.1, § 11.3, § 11.4**

- _Goal:_ A pure function takes the project ID, the review gate's folder, each live work unit's Candidate versions and
  boundary, and the import's work-item table, and returns records on their work items with their keys and a listing that
  accounts for every source it was given exactly once.

- **Additional Context:** `spec-storage-ref-backend.md` § 10.8, on `feat/storage-ref-backend` — `ReviewMappingInput`,
  `ReviewMappingResult`, and the listing's conventions.

    - `[ ]` **3.1.a The input, the result, and work-item resolution**

        - The input and result types meet the port's by shape; the table's Errand rows carry each Errand's claim ID
          (§ 11).
        - A record's work item resolves from the slug or vehicle today's records name — a Candidate's work unit,
          through its supersession chain for a superseded Candidate's ID; a delivery member's work unit; an Errand's
          claim ID — to the UID the table gives it; a name the table lacks, or a row marked not live, is no live work,
          whose facts are left behind before any other rule (§ 11.1, § 11.3).
        - A hosted result's producer ID, its acknowledged `attemptId`, resolves to its attempt's outcome key where an
          evidence record's `result` cites it; the disposition set and the `approved-fix` decision keep it as recorded
          (§ 11.3).
        - Build `test-first` (one behavior at a time):
            - a superseded Candidate's ID resolves to its work unit through the chain
            - a delivery member, and an Errand by its claim ID, resolve to their work items
            - a name the table lacks, and a row marked not live, resolve to no live work, and their facts are left
              behind, a pending attempt among them
            - a hosted result cited by its acknowledged attempt ID resolves to its outcome key, while the disposition
              set citing it keeps its ID

    - `[ ]` **3.1.b The listing**

        - Each source lists once as `mapped` with the records it became, `left-behind` with a reason, or `in-flight`:
          each gate file by the `gate.path` it was given, its `arc/review-gate/` prefix included; a leftover
          materialization once by its folder, written with a trailing `/` and covering every file below it; each
          Candidate version as `<tracked path>@<commit>` with the path its slug gives
          (`resolveCandidateRecordRelativePath`); and each boundary by its tracked path. No two entries cover one file.
          A file mapped in part lists as mapped, its reason naming the entries it left behind; a file in flight returns
          none of its records.
        - Build `test-first` (one behavior at a time):
            - every source given lists exactly once, under its encoding, a gate file with its `arc/review-gate/` prefix
            - a repository-wide receipt ledger mapped in part lists as mapped with the entries it left behind
            - a leftover materialization lists once by its folder with a trailing `/`, and none of its files lists again

    - `[ ]` **3.1.c A mapped set is valid**

        - The module stays registry-free and checks nothing at runtime: its tests run each returned record through its
          kind's parser and its write check with the returned set as the after-view, through the production registry,
          3.8's run does so over this repository's records, and the import's own parse of what it writes is the
          runtime backstop (§ 11.4).
        - Build `test-first` (one behavior at a time):
            - every record the mapping returns parses under its kind and passes its kind's write check over the returned
              set

### `[ ]` **3.2 Map lane progress, receipts, and frontline outcomes to outcomes, and leave working state behind — § 11.2**

- _Goal:_ Every attempt lane progress records but a `pending` one becomes one `review/outcome` keyed as § 4.1, joined
  with the facts today's other records hold for it, while a `pending` attempt lists its file as in flight and every
  record of working state, retired attempts, or other stores is left behind with its reason.

    - A local attempt joins its `local-review` operation record, for its request, actors, policy binding, attestation,
      `sourceDigest`, and `guidanceDigest`, and its receipt (`evidence/receipts-v2.json`), kept as recorded with its
      findings, by `requestId`, its findings taking their ordinals by position (`rg/core/local-review-result.ts`); a
      frontline attempt takes its admission from lane progress and joins its frontline outcome (`outcomes/`) by
      operation ID. Before redaction, derive `sourceBindingId` from the outcome's full source and response binding
      through `computeFrontlineSourceBindingId`, comparing any joined run state's digest, without requiring a run
      record; a hosted attempt keeps its sealed result, its findings projected through `projectHostedFinding`
      (`rg/hosted/await.ts`). `settled-findings` maps to `findings`.
    - Each outcome's `lineage` is its admission's, a frontline or hosted attempt's, or its `local-review` request's, a
      local attempt's; lane progress's own `lineage` is only its latest attempt's.
    - `completedPasses`, `terminalProducer`, `settledFindingIds`, `attemptedSources`, and the tail pointers map to
      nothing.
    - Today's attempts record no end time, so the outcomes one lane-progress record maps take `endedAt` values rising
      strictly, a millisecond apart, in the order the record holds their attempts, the last its `updatedAt`, the latest
      time any could have ended; composed by § 4.7's order, they keep the record's order within each pass.
    - Left behind with their reasons: sources, materializations, locks, the hosted request owner index, `local-review`
      records, frontline run state, and review suspensions, as working state read only for the joins; a frontline
      outcome no current attempt joins, its attempt retired; a record naming another repository ID; `quarantine/` and
      `retired/`; and the repository ID, its value the project ID passed in.
    - Build `test-first` (one behavior at a time):
        - a local attempt maps to an outcome carrying its operation record's request, actors, policy binding,
          attestation, `sourceDigest`, and `guidanceDigest`, and its receipt as recorded, its findings with ordinals by
          position, so the result's digest recomputed from the outcome equals today's
        - each outcome's lineage is its own attempt's — its admission's or its request's — where an Errand's
          lane-progress record holding attempts at two heads names only the later head's lineage
        - a local attempt that ended stale with no receipt maps from its operation record alone
        - a frontline attempt maps carrying its lane-progress admission and its outcome record's executable identity,
          outcome digest, original `sourceBindingId`, and findings, including a command source bound to a
          Candidate/member response with no run record; any joined run state's source digest must agree
        - a hosted attempt maps keyed by its admission, keeping its sealed result and projecting its findings
        - a `settled-findings` attempt maps to a `findings` outcome
        - the outcomes one lane-progress record maps take strictly rising `endedAt` values in its attempt order, a
          millisecond apart, the last its `updatedAt`, a pass that fell back across two sources and a pass's retries
          included
        - a `pending` attempt lists its lane-progress file as in flight
        - frontline run state, a review suspension, an orphan frontline outcome, a record under another repository ID,
          and a file under `quarantine/` or `retired/` each list as left behind with its reason
        - a target's ID computed with the project ID matches the one today's records name where the project ID is the
          clone's repository ID, as the import adopts it (§ 2.4)

### `[ ]` **3.3 Map approved-disposition records to evidence — § 11.2**

- _Goal:_ Each disposition set an approved-disposition record holds becomes one `review/evidence` record naming its
  predecessor and successor, its result resolved to an outcome key, and its performance and settlement joined from the
  record and lane progress, while records in an older shape are left behind.

    - Build `test-first` (one behavior at a time):
        - a record holding a lineage of sets maps to one evidence record per set, each naming its predecessor and, where
          one was approved over it, its successor
        - a local, a frontline, and a hosted source reference each resolve to the result's outcome key
        - an Errand's or delivery member's set takes its performance from its lineage node's fix response
          (`errandFixResponse`, `deliveryMemberFixResponse`), merged with lane progress's response performance for that
          set, current or superseded (`responsePerformance`, `responsePerformanceHistory`)
        - a hosted set's settlement joins the attempt's settlement evidence and finding actions
        - each node's optional tags copy exactly to its evidence record, including absence, and replay on a second
          clone renders the stored tags without requiring the importing request's report inputs
        - a record `parseEnumeratedRecord` skips today is left behind with its reason

### `[ ]` **3.4 Map authorizations, the skip marker, termini, and the resume token's judgments to decisions — § 11.2**

- _Goal:_ Every decision today's records hold becomes a `review/decision` record carrying a decider, time, head, and
  subject digest only where its source recorded them, so no one is asked to decide again after the import.

    - A new pure module, `rg/policy/pre-publication-replay.ts`, which the mapping and `handlers/review.ts` both import,
      holds today's replay schema and decoder (`PrePublicationReplayInputSchema`, `decodePrePublicationReplay`, with
      `AttestationOrderingRecoverySchema`), moved out of `handlers/review.ts`, which keeps using them as its in-repo
      arm. The mapping decodes today's token through it, the token's `lanes` through `PrePublicationLaneJudgmentsSchema`
      (`rg/policy/pre-publication-request.ts`), which the replay schema leaves untyped.
    - Build `test-first` (one behavior at a time):
        - today's token decodes through the moved decoder for each judgment it carries, its `lanes` through
          `PrePublicationLaneJudgmentsSchema`
        - a conditional pass authorization maps to an `approved-fix` decision keyed by its `authorizationId`, its
          `authorizedBy` and `capturedAt` the decider and time, its subject its lineage at `originatingHeadSha` with no
          subject digest, its `passCount` the producer's logical pass, and a hosted one's
          producer kept as its acknowledged attempt ID
        - every attempt a consumed one admitted — its admitting attempt and the retries after it at its pass — cites it
          as `admittedBy` on its outcome, a withdrawn one gains a withdrawal decision from `withdrawnBy` and
          `invalidatedAt`, and a superseded one gains nothing
        - an authorization withdrawn and then superseded by a successor set's approval maps to records that pass every
          write check (1.3.b)
        - a consumed authorization's `admissionId` names a local admitting attempt by its `attemptId` and a hosted one
          by its admission's ID (`hosted.admission.admissionId`), so a hosted review's admitting attempt cites it too
        - the frontline skip marker maps to a lane-skip decision on its Candidate with no decider and its `updatedAt`
          as the time
        - the boundary's `terminus` maps to a terminus decision on the boundary's `candidateId` and
          `candidateSubjectDigest` with no head (§ 5.1), decided by `acceptedBy` with no time, its basis
          `{ passCount }` the pass count it holds, so it keys as the live decision would; each `deliveryReviewTermini`
          entry maps on its member vehicle
        - a boundary whose subject digest no target of its Candidate record carries maps its terminus alike
        - every other decision it maps carries a `null` basis
        - the resume token's additional pass maps to an `additional` extra pass, and its ceiling override to a `ceiling`
          extra pass unless it cites a conditional pass authorization, which maps to nothing; a frontline ceiling
          override is decided on the head the token bound it to (`frontlineCeilingHeadSha`)
        - the token's terminus maps to nothing where the boundary carries one, and otherwise to a terminus decision
          whose basis is the pass count the imported outcomes give its Candidate, its chain's included, counted as
          1.2.c derives the lane's count
        - two decisions with the same content map to one record
        - a mixed complete/incremental history preserves logical exhaustion and next-pass ordinals for every mapped
          grant, independently of the standard ceiling's complete count

### `[ ]` **3.5 Map a live work unit's Candidate versions and boundary — § 11.2**

- _Goal:_ A live work unit's every Candidate version maps whole, oldest first, and its boundary at its current content
  maps to version 2, keeping the publication state it holds today.

    - 3.4's module (`rg/policy/pre-publication-replay.ts`) gains, beside today's replay schema and decoder, the
      `--resume` token's schema from the flip, holding the call's own inputs alone, with its encoder and decoder
      (6.2.c); the schema from the flip types its ordering recovery's `expectedBoundaryVersion` as a store version
      (`RecordVersionSchema`).
    - A next action's `responseOperationId` stays as recorded, the attempt ID its result's outcome keeps, and its
      `responseSource`'s durable part resolves to that result's outcome key through the resolution 3.3 gives an
      evidence record's source reference, a hosted one keeping its acknowledged `attemptId` (§ 9.3).
    - Build `test-first` (one behavior at a time):
        - every replayed Candidate version maps to a `review/candidate` version, transitions whole, and a review response
          later versions repeat joins its evidence record once
        - a Candidate version failing today's schema, and one whose supersession chain does not resolve, list as left
          behind with their reason (§ 11.2)
        - the boundary maps to version 2 with its terminus names, `responseOperationId` kept as recorded,
          `responseSource`'s durable part resolved to its result's outcome key (a hosted one's kept), and `"merge"` in
          place of `"tier-3"`
        - a policy-review `candidate-review-pending` boundary maps to version 2's review-resume variant with no
          `policy`, keeping its reservation and post-attest continuation (§ 9.1)
        - a post-attest continuation maps without `projectionDisposition`, and no mapped boundary keeps
          `standardLaneOwnerVersion` (§ 9.1)
        - a next action's token is re-encoded with the call's own inputs alone and decodes under the replay schema from
          the flip
        - `readinessBinding` is computed over the imported records when `standardLaneOwnerVersion` equals the standard
          lane's current progress version, and is `null` otherwise, its absence included
        - a computed `readinessBinding` equals the one 1.6.d recomputes from the stored records
        - a reopened work unit's `publication-pending` boundary keeps its publication state
        - `resolveCandidateSupersessionAncestors` over the mapped versions returns the chain
          `readRepositoryCandidateSupersessionChain` returns

### `[ ]` **3.6 Pass the mapping into the import's port where the import landed first — § 11, § 14.2**

- _Goal:_ Where the import has landed on base, `arc store migrate`'s handler passes the mapping into the import's
  `reviewMapping` port, so the import's trial lists the mapping's account; where it has not, the import's change wires
  the handler when it lands.

    - Mark `[~]` where the import has not landed on base when this task is reached, naming the change that binds it.

### `[ ]` **3.7 Take the planned pass-policy change's landing before the review gate's arms — § 4.3, § 5.5**

- _Goal:_ Phase 4 starts on a base carrying the planned change to the standard lane's pass policy, or on the Owner's
  decision to proceed without it, so the review gate's arms from the flip are built over the pass policy that ships.

    - The merged base carries that landing; no proceed-without-provider choice remains. Verify its presence by slug
      and re-check 1.2.c's two-count derivation against `readStandardPassCounts`, `ceilingPassCount`, and
      `resolveInvalidOverrideReason`, and each task of Phases 4–5 naming a changed file.
    - Include optional stored tags, report replay, correction-proof port consumers, and the grant ordinals in the
      propagation sweep. A correction runs through `amend-design.md` before Phase 4 starts.

### `[ ]` **3.8 The import's mapping** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds over this repository's review records on a freshly merged base.

    - Run through the import's trial where it landed first (`arc store migrate --import --trial`), or otherwise through
      an uncommitted harness that builds the port's input from this checkout as § 11 states it.
    - Run the diagnostic pass through the same harness with every table row marked live, a live Errand row added for
      each claim ID the review gate's lineages name, and the archived Candidates supplied, and record its counts by kind
      and its left-behind reasons in the task's outcome, the Candidate versions today's reader refuses counted under
      their reason.
    - In the diagnostic pass, compare the supersession chain read through the mapped records of each supplied Candidate
      whose versions all map with `readRepositoryCandidateSupersessionChain`'s, and record the result beside the counts,
      a Candidate with a version left behind counted under that version's reason; today no live work unit holds a
      Candidate, so this is where the chain check meets real records.

## **Phase 4:** The review gate's store, proven on the local lane

_Purpose:_ Give the review gate the store it opens, its repository identity from the project ID, its subject resolved
through the store, the boundary's new shape, `arc attest`'s store reads and writes, in-flight state apart from today's
records, and the Candidate's history from the flip, then prove the pattern on the local lane's results, the reads of
them, and the pass count derived from them.

_Mode:_ `slice` — closes on a work unit attested from the flip, its local review's results written as outcomes, read
back, and counted.

_Exit criterion:_ Over the reference backend, review on a work unit's branch resolves the work unit with no `Branch` in
its meta; `arc attest` writes the Candidate and its version 2 boundary in one batch, and on a paused work unit refuses
naming `arc resume <slug>` and succeeds after it; a local standard-lane review of that Candidate writes one
`review/outcome` per ended attempt, a retry shares its logical pass, the result reader and reduction read each result
from its outcome, and the lane's pass count, its supersession chain's included, derives from stored outcomes and equals
today's count over the in-repo implementation; a clone whose `review-gate/operations/` holds records of today's shapes
still reads its review state; two clones' outcomes for one target carry the project ID; and review on a clone holding no
project ID refuses `project-identity-unavailable` naming the port's remedy and succeeds once it holds one.

_Design decisions:_ Tasks 4.1–4.6 are the footing every later test from the flip stands on — it resolves its subject,
attests, and reads the boundary through the store — so they come first. The arms from the flip live in the
lane-progress transitions every command calls (`rg/lane-progress.ts` and its siblings), behind the family's ports, which
each composition root binds from the store its invocation opens at its checkout, never a materialization's, to the work
item the invocation resolved (§ 2.3); the in-flight port composes today's lane-progress shape (§ 4.7). Each root selects
its arm once on `capabilities.stateOffBranch`, an absent store keeping the in-repo arm, as the lifecycle verbs do. The
family's schemas are store schemas, never entries in the review gate's published-schema registry.

### `[ ]` **4.1 Give the review gate's composition roots the store and the family's ports — § 2.3, § 3.3**

- _Goal:_ Every review-gate composition root that reads or writes a review fact holds the store its invocation opens —
  production opening the checkout's store, a test injecting any `Store` — and binds the family's ports from it, with no
  behavior changing before the flip.

    - `[ ]` **4.1.a The ports**

        - `rg/core/ports.ts` gains outcome, evidence, decision, and in-flight ports, which take over from the flip what
          `ForwardReviewReceiptStore`, `FrontlineOutcomeStore`, `ApprovedDispositionRecordStore` and its index, and
          `ReviewOperationStateStore` and its snapshot index serve today. A root binds them to the work item its
          invocation resolved (§ 2.3):
            - outcome — a create-only write, a read by key, and a listing of a lineage's outcomes in one lane on the
              work item, with the listing's completeness;
            - evidence — a create, an advance at an expected version, a read by disposition set, and a listing; and from
              the flip a read by producer composing today's approved-disposition record from that producer's evidence
              records, bound as `ApprovedDispositionRecordStore`'s `readDispositionRecord`, so its every reader —
              frontline closure (`settledFrontlineAdviceReader`, `rg/policy/frontline-phase.ts`), reduction's local arm,
              resume's check, respond, and policy evidence among them — keeps its input (§ 6.6);
            - decision — a create-only write, a read by key, and a listing;
            - in-flight — `ReviewOperationStateStore` and its snapshot over `in-flight/` (4.7), whose `readOperation` on
              a lane-progress ID composes the work item's outcomes whose lane and lineage recompute that ID
              (`laneProgressOperationId`) with the in-flight record, which holds only attempts under way, and whose
              snapshot composes every lane-progress record on the work item (§ 4.7).
        - Every write is also available as the `put` a caller adds to its `batch`.
        - The review gate imports the family's schemas from `lib/store/kinds/review/`; `rg/core/register-review-schemas.ts`
          registers none of them, so the registry's IDs stay as today.
        - Build `test-first` (one behavior at a time):
            - in-repo the ports bind today's stores, and an existing local review's records come out as today's
            - over the reference backend the ports read and write the family's records on the bound work item, and a
              listing that missed entries reports itself incomplete
            - from the flip, the test seeding the reference backend's project ID as the clone's repository ID, as the
              import adopts it (§ 2.4), the composed approved-disposition record equals the one today's store holds for
              the same approvals and performances but for its source's `receiptRef` or `outcomeRef`, whose durable part
              names the cited outcome's key, and a local source's `localSourceRef`, the cited outcome's `sourceDigest`
              (§ 9.3), a hosted source's `attemptRef` unchanged; its readers' verdicts through it are 4.10's and 5.6.a's
              tests, once the result readers bind the same references
            - the composed lineage nodes preserve each set's optional tags exactly, so approved-response replay and
              earlier-round reports read the same stored forecasts, including historical absence
            - a write's `put` lands in the caller's batch with the batch's other writes

    - `[ ]` **4.1.b The composition roots**

        - Production opens the store as the lifecycle verbs do (`createStore(createDefaultStorePorts({ checkoutRoot,
          exec }))`, `openDefaultStore` in `handlers/lifecycle-shared.ts`) at the invocation's checkout, and binds the
          project-ID reader as the executor context binds it (`lib/work-unit/executor-context.ts`).
        - The roots: `handlers/review.ts`'s default-dependency builders that construct a review-gate store
          (`resolveConfiguredReviewPolicy`, `defaultFrontlineResolveDependencies`, `defaultFrontlineRunDependencies`,
          `executeDefaultHostedRequest`, `defaultHostedAwaitDependencies`, `defaultHostedSettleDependencies`,
          `persistAcceptedFrontlineSkip`, and `prePublicationStandardLaneAccess` among them); `rg/runtime/`'s
          `local-prepare-composition.ts`, `respond-composition.ts`, `frontline-run-composition.ts`,
          `local-attest-composition.ts`, `local-resume-composition.ts`, and `reduce-composition.ts`;
          `rg/hosts/local/review-result-reader-composition.ts` and `frontline-materialization.ts`; `rg/policy/`'s
          `pre-publication-composition.ts`, `hosted-reservation-discharge.ts`, and
          `candidate-review-fix-continuation.ts`; `rg/status-composition.ts`, `status-errand.ts`, and
          `status-singleton.ts`; `handlers/lifecycle-delivery-review.ts` and `handlers/delivery-execution.ts`;
          `scripts/integration/checkpoint-composition.ts`, `merge-composition.ts`, `lineage-review-composition.ts`, and
          `candidate-response-confirmation.ts`; and `lib/delivery/repository-entry.ts`.
        - `runDerivedLocusStateProbe` (`handlers/derived-locus-state-probe.ts`) passes its store, project-ID reader,
          and exact selected work-unit owner to its delivery-correction and pending-fix callbacks (§ 12.1). The
          inspection and pending-fix readers use that store and the bound ports, opening no second default store.
        - `createLocalContributionConfirmation` (`rg/runtime/local-correction-context.ts`) takes core disposition and
          operation read ports instead of concrete local store classes, and receives this root's bound stores. Its
          correction proofs and the new report/history readers use the same composed ports.
        - `readResolveNextPassContext` (`handlers/review-next-pass-context.ts`) takes this invocation's store and
          project-ID reader for repository identity, live context, and Candidate history instead of opening another
          Candidate store. Both context helpers use composed core operation/disposition read ports rather than a
          concrete local operation store, retaining the two pass counts.
        - `readReviewLane` (`rg/runtime/lane-read-composition.ts`) is a read-only root too: bind its Candidate and
          boundary readers, result reader, lane-history reads, and operation/disposition ports from this invocation's
          store, rather than constructing local stores independently. Its core facts and rejection projections keep
          their inputs and write no records.
        - Each root passes its store to the Candidate and boundary's typed access (2.3.b), so its reads and writes of
          them and its family writes go through one store and can share a batch.
        - Build `test-first` (one behavior at a time):
            - each root's existing tests pass unchanged over the in-repo implementation
            - a root given a store reporting `stateOffBranch: true` binds the family's ports
            - a root given a store reads the Candidate and boundary through it, opening no other
            - the probe's two nested callbacks receive its store and exact selected owner, with no legacy-file
              fallback off branch; 7.6 exercises each through the production subject projection
            - ordinary next-pass context reads stored Candidate history and lane/evidence records through the same
              injected store, never a newly opened default store, and computes both counts from a mixed history

### `[ ]` **4.2 Build the review harness over the reference backend**

- _Goal:_ A review-gate test runs an arm from the flip over the reference backend with the production kind registry,
  seeded with a work unit's meta, Candidate, and boundary records, an Errand, and the project's identity record, beside
  a scripted repository and a temporary Git common directory for working state; a second clone shares the store; and a
  differential mode runs one scenario over both implementations and compares what each derives.

    - Builds on the lifecycle verbs' reference harness (`__tests__/helpers/store/lifecycle-harness.ts`), which seeds
      metas alone, adding seeders for `review/candidate`, `review/integration-boundary`, `work-item/record`, and
      `project-registry/identity`; uses the scripted Git runner (`__tests__/helpers/git-exec-fake.ts`), `temp-repo.ts`,
      `in-process-review.ts`, and `multi-clone.ts`; and builds its differential mode, modelled on
      `__tests__/helpers/store/lifecycle-differential.ts`, which compares lifecycle reads over today's files with the
      store's.
    - Locus and hosted-Errand discovery use store-only Errand and claim records with exact marker/topology evidence,
      through the production `runDerivedLocusStateProbe`. Only tests of Errand status's retained ref-based vehicle
      reader (`readTransientIdentitySnapshot`, `rg/status-errand.ts`) also seed the identity's Errand ref: commit a
      valid `transientContent` entry with `writeTreeCommit` (§ 14.4).
    - Flip-time scenarios use production `resolveCandidateMutationOwner` and `resolveCompletedCandidateWorkUnits`
      (`handlers/candidate-mutation-owner.ts`), supplied the seeded store and project-ID reader. Seed the actual
      checkout marker and topology needed to resolve active and completed owners. Respond, applicability resolution,
      and delivery execution's review-fix inspection and acknowledgement must resolve those owners without a stand-in.
    - Two tiers. The store harness — the reference backend, the seeders, and the scripted Git runner — runs each arm's
      tests in the unit tier. `in-process-review.ts`, `multi-clone.ts`, and the differential mode build or run a real
      Git repository, so the end-to-end scenarios built on them run in the integration tier, at each segment verifier.
    - Build `test-first` (one behavior at a time):
        - each seeded record reads back through the store, and locus discovers a seeded Errand with no identity ref;
          the separately retained Errand status reader resolves its dual-seeded fixture
        - with no meta file in the checkout, the production owner resolves the seeded active or completed work unit,
          and the production completed-owner inventory lists it from the same store
        - a local review run through the harness writes its working state under the temporary common directory, never
          the repository's
        - the differential mode reports a mismatch when the two implementations derive different counts

### `[ ]` **4.3 Take the project ID as the review gate's repository identity from the flip — § 2.4**

- _Goal:_ From the flip `resolveRepositoryIdentity` resolves the project ID through the invocation's project-ID reader,
  so two clones' records of one target agree; on a clone holding no project ID every review command refuses
  `project-identity-unavailable` with the port's remedy and succeeds once the clone holds it.

    - `[ ]` **4.3.a The resolver**

        - `resolveRepositoryIdentity` (`rg/hosts/local/git-common-state.ts`) takes the project-ID reader
          (`createProjectIdentityReader`) and resolves it through `resolveProjectIdentity` from the flip, still returning
          the ID and throwing a typed error where the port reports it unavailable; its in-repo arm keeps the per-clone
          record.
        - Build `test-first` (one behavior at a time):
            - from the flip, two clones resolve one repository identity, the project ID
            - a clone holding no project ID throws the typed error carrying the port's reason and remedy, and the same
              call succeeds once it holds one
            - in-repo, the per-clone record resolves as today

    - `[ ]` **4.3.b Its callers and the refusal**

        - Every module that calls `resolveRepositoryIdentity` passes the reader its invocation binds, including
          `readResolveNextPassContext` (`handlers/review-next-pass-context.ts`) and the lazily resolved sites
          (`receiptStore ??=`, `repositoryIdPromise ??=`). Re-enumerate direct callers rather than pinning a stale count.
        - The read-only `readRepositoryIdentity` call in `rg/runtime/lane-read-composition.ts` also resolves through
          the project-ID reader from the flip, minting no clone-local identity; its own refused envelope reports the
          typed code in `payload.code`, with the port's detail and remedy (§ 2.4), without a generic error variant.
        - Each caller reports the typed error through its own failure surface (§ 2.4): review commands through their
          envelope, as `project-identity-unavailable` (`ReviewCommandErrorCodeSchema`,
          `rg/core/review-command-error-codes.ts`) with a remedy-carrying variant for each mode (`remedialErrorVariant`,
          `rg/core/review-command-envelope.ts`), the plain variants each mode builds from every code (`errorVariant`,
          `ReviewCommandErrorEnvelopeSchema`) excluding it, so no envelope carries it without a remedy; review status,
          which is no command mode, through its own failure arm as `reason` `status-unavailable`, its `detail` naming
          `project-identity-unavailable` and its `remedy` built from the port's (`ReviewStatusCommandResultSchema`,
          `rg/status.ts`), which delivery's review status reads carry as today; attest's re-root and publish through
          their lifecycle refusal (`refuseWithRemedy`, `handlers/lifecycle-shared.ts`), as
          `lib/work-unit/verbs/task-close.ts` reports it; and the checkpoint and merge in their operation refusal's
          detail (`handlers/integration.ts`).
        - The review commands' variants and review status's failure arm carry a spine remedy (`SpineRemedySchema`,
          `scripts/integration/spine-refusal.ts`), each built from the port's text and the refusal's invariant. Its argv
          is the port's where the port's remedy carries one, as a store refusal's can (`lib/store/project-identity.ts`)
          and as `refuseWithRemedy` keeps it, and otherwise the command's own argv to re-run, as review status's
          failures wrap theirs today (`spineRemedy`, `handlers/review.ts`); where that argv ends in `-`, the submitted
          request is its `stdin`, as today's review remedies replay theirs (`uncommittedVerifiedFixRemedy`,
          `rg/runtime/respond-remedy.ts`; `reviewResolveRemedy`, `rg/runtime/review-policy-remedy.ts`).
        - Build `test-first` (one behavior at a time):
            - a local, a frontline, and a hosted review command each refuse `project-identity-unavailable` on a clone
              holding no project ID, their remedy carrying the port's text and the command's own argv, and a command
              reading its request from standard input replaying the submitted request as its `stdin`
            - where the port's remedy carries an argv, as a store refusal's can, a review command's remedy and review
              status's carry that argv
            - a review command envelope carrying `project-identity-unavailable` without a remedy refuses to parse
            - review status there returns its failure arm with `status-unavailable`, a `detail` naming
              `project-identity-unavailable`, and a remedy carrying the port's text and the status command's own argv,
              its published schema unchanged
            - attest's re-root and publish refuse with the port's remedy, and the checkpoint and merge carry it in
              their refusal's detail
            - each succeeds once the clone holds it
            - the read-only lane command refuses `project-identity-unavailable` through its existing refused envelope
              and succeeds once the ID is available, while its in-repo absent-identity behavior stays unchanged

### `[ ]` **4.4 Resolve the checkout's work unit and Errand through the store from the flip — § 12.4**

- _Goal:_ From the flip the review gate resolves the checkout's work unit through its branch link and its Errand
  through the checkout's claim and `lookup`, refusing where either refuses with anything but `not-found`, and
  pre-publication reads the work unit's assurance from its stored meta, so every later arm from the flip reviews a
  work unit whose meta carries no `Branch` and has no file in the checkout.

- _Note:_ The status change's identity fix also edits `readLocalReviewLiveContext` before the flip; whichever of the two
  lands second takes the conflict (`notes-seam-delivery-review.md` § Neighbors).

    - `[ ]` **4.4.a The work-unit resolution**

        - The live context's work-unit half (`readLocalReviewLiveContext`) and the review subject's
          (`resolveReviewSubject`, `rg/core/review-subject.ts`) resolve the work unit by `lookup`'s `ref` arm on the
          checkout's branch or head ref, the repository the project ID, and read its meta record through the store, in
          place of `readActiveMetaCandidates`' `Branch` match with its file read and of `branchToWorkUnitSlug`.
        - The review gate's five calls to `resolveActiveWu` (`lib/release/wu-resolution.ts`) switch to a review-local
          resolver taking the root's store and project-ID reader and resolving by the same branch link from the flip.
          Preserve the shared resolver's shipped checkout-occupancy selection (§ 12.4). The five calls are the
          incremental-applicability check (`confirmIncrementalApplicability`), hosted review progress, and the chunking
          resolve in `handlers/review.ts`, and `resolveOriginatingTop` and `resolveLifecyclePaths`
          (`createPreBindingDeliveryReviewTargetDependencies`, `rg/policy/pre-publication-composition.ts`). The
          originating top compares the checkout's branch with the work item's work-branch link (`selectWorkBranchLink`,
          `lib/store/lifecycle-branch.ts`) in place of the meta's `Branch`, and the lifecycle paths take the meta's
          projected path (`workUnitMetaPath`, `lib/store/lifecycle-write.ts`), which the `work-unit-paths` ratchet does
          not count, in place of its file's (§ 12.4).
        - Build `test-first` (one behavior at a time):
            - from the flip review on a work unit's branch resolves it with no `Branch` in its meta and no meta file
            - an adopted branch whose name parses as no slug resolves the work unit its link names
            - a branch no link names resolves no work unit, falling through to the Errand and delivery reads as today
            - from the flip hosted review progress, the chunking resolve, and the incremental-applicability check
              resolve the work unit with no meta file, and the originating top is the linked branch's ref where the
              checkout is on it and `null` where it is not

    - `[ ]` **4.4.b The Errand reads**

        - `readLocalReviewLiveContext` (`rg/hosts/local/live-context.ts`) and `resolveActiveErrand`
          (`rg/runtime/respond-composition.ts`) take the checkout's Errand claim from its marker, which already carries
          it (`claimId`, `lib/git/worktree-marker.ts`), and resolve the record through `CheckoutClaimSchema`'s `errand`
          arm (`lib/store/lookup.ts`), each keeping its state filter.
        - Build `test-first` (one behavior at a time):
            - an open Errand's checkout resolves for review and for respond, and an awaiting-merge one for review only
            - a lookup refusal other than `not-found` refuses review, naming the record and what was reported, and
              review succeeds once the record is repaired
            - a malformed listing entry alone refuses nothing, and an empty lookup beside one refuses naming its
              diagnostics and remedies, and review succeeds once the entry is repaired

    - `[ ]` **4.4.c The assurance read**

        - `readAssurance` (`rg/policy/pre-publication-composition.ts`) reads the work unit's meta record through
          `readWorkUnit` (`lib/store/lifecycle-write.ts`) on the root's store from the flip, in place of reading the
          meta file at its active path, refusing as today where no meta record exists or it is incomplete.
        - Build `test-first` (one behavior at a time):
            - from the flip pre-publication reads the work unit's class and rubric from its stored meta with no meta
              file in the checkout
            - a work unit with no meta record refuses as today

### `[ ]` **4.5 Write the boundary in its new shape — § 3.5, § 9.1, § 9.5, § 12.6**

- _Goal:_ From the flip every reader reads version 2, and every write of a boundary that carries no terminus and is
  neither `candidate-publish-ready` nor `publication-pending` writes it, while the in-repo arm writes and reads version
  1 as today; the run-verification action emits `"merge"` in place of `"tier-3"`; and every published schema carrying
  either, or a record's version, admits the flip's value before the flip with nothing it emits changed.

- _Note:_ Version 2 requires the readiness binding on `candidate-publish-ready` and `publication-pending` and names a
  terminus by its decision's key (§ 9.1), which 6.1 and 6.2.b build, so those two complete the writers that need them:
  6.1 readiness's write with the attestation-ordering recovery that persists it, its re-entry, the publication claim
  and publish-unchanged writes, attest's singleton recovery, repair, and unchanged writes, and the singleton response's
  rebind, and 6.2.b every write naming a terminus, the Owner terminus write among them.

    - `[ ]` **4.5.a The widened published schemas**

        - Per § 3.5: the boundary's version 2 in `commands/status/schema.ts`, `commands/active/schema.ts`, attest's
          `locus` (`AttestResultSchema`), publish's unchanged result (`lib/work-unit/verbs/publish.ts`), and
          `PrePublicationReviewEnvelopeSchema`; `"merge"` in a widened copy of `RunConvergenceVerificationActionSchema`,
          which `IntegrationCheckpointResultSchema` and `PrePublicationContinuationSchema` embed in place of the action,
          and in attest's own action schemas (`AttestConvergenceVerificationActionSchema`,
          `AttestRootVerificationActionSchema`); and `RecordVersionSchema` in attest's `recordRevision` and
          `candidateRecordRevision`, `DeliveryReviewTerminusOfferSchema` and `AttestationOrderingRecoverySchema`'s
          `expectedBoundaryVersion`, and an applicability offer's `expectedRecordVersion`
          (`rg/policy/review-applicability-resolution.ts`, `lib/work-unit/candidate-applicability-resolution.ts`), and
          the checkpoint's `candidate-record-moved` payload (`scripts/integration/checkpoint.ts`); the two that carry
          the Candidate's version, the applicability offer's and the checkpoint payload's, drop the digest parse 2.3.b
          gave it on its way in.
        - `PrePublicationReviewEnvelopeSchema`'s version 2 arm extends version 2's variants with the envelope's fields
          and keeps `policy`, typed per variant as version 1's are: a resolve envelope or `null` on the review-resume
          variant, which the policy-review one folds into, a nullable resolve envelope on `candidate-fix-pending`, and
          `null` elsewhere (§ 9.3).
        - Per § 3.5, the fields of a mechanism § 14.3 retires: the widened copy's post-attest continuation admits one
          without `projectionDisposition` (`PostAttestContinuationSchema`); a member terminus's acceptance result admits
          `recorded` with the next action `continue` and no `boundaryPath`
          (`DeliveryReviewTerminusAcceptanceResultSchema`, `rg/policy/delivery-review-terminus.ts`), which 6.2.b emits;
          and delivery's acknowledged result admits no `candidate.recordPath`, `boundaryCarry.path`, or `recordEffects`
          (`ResultSchema`, `handlers/delivery-execution.ts`), which 6.5.e stops emitting and its driver stops reading.
        - `createRunConvergenceVerificationAction` (`rg/policy/integration-boundary-locus.ts`) parses through the
          widened copy, while `IntegrationBoundaryLocusSchema`'s version 1 variants keep today's action and continuation
          objects, so version 1 still requires `projectionDisposition` and admits only today's kinds (1.6.b).
        - Sweep every emitted contract again for a field only a § 14.3 mechanism fills, widening each one found.
        - Build `test-first` (one behavior at a time):
            - each widened schema parses today's value and the flip's
            - a version 2 envelope parses each variant with its `policy`, its review-resume one with a resolve envelope
              or `null`, and refuses a `policy` its variant does not admit
            - a version 1 boundary still refuses a convergence action or continuation without `projectionDisposition`
              after the widening
            - every output emitted before the flip parses as it did, the schema-pinning tests changing only by the
              widened arms

    - `[ ]` **4.5.b The projections**

        - The boundary and next-action projections in `rg/policy/integration-boundary-locus.ts`, among them the
          publication boundary's input (`PublicationBoundaryInputSchema`) and its recovery (`recoverPublicationBoundary`),
          which carry `readinessBinding` into `publication-pending` (§ 9.2).
        - The pre-publication envelope keeps `policy`, which its handler and the workflow route on; from the flip
          `prePublicationBoundary` (`rg/policy/pre-publication-procedure.ts`) strips it with `target` and
          `responseBinding` before `handleReviewPrePublication` (`handlers/review.ts`) persists the boundary.
        - Build `test-first` (one behavior at a time):
            - from the flip the envelope carries `policy` and the persisted boundary carries none
            - every projection that writes `publication-pending` carries the binding it was published under, and a
              recovered publication boundary keeps it

    - `[ ]` **4.5.c The writers and readers**

        - Writers: `persistBoundary`, the attestation-ordering recovery, and the Owner terminus write in
          `handlers/review.ts`; `handleAttest`'s writes, its unchanged write among them, the publication claim, and the
          publish-unchanged write (`handlers/lifecycle-delivery-review.ts`); the delivery boundary writes in
          `handlers/delivery-execution.ts`; the rebind in `rg/runtime/singleton-publication-response.ts`; and the carry
          in `carryDeliveryReviewFixPublicBoundary` (`lib/delivery/review-fix.ts`). Each takes the new shape here for a
          boundary that carries no terminus and is neither `candidate-publish-ready` nor `publication-pending`; 6.1 and
          6.2.b complete the rest. Attest's writes take the new shape here, and 4.6.a, whose batch writes them, tests
          them from the flip.
        - Readers: `lib/delivery/repository-entry.ts`, `lib/delivery/entry-inspection.ts`,
          `rg/runtime/local-prepare-composition.ts`, whose before-and-after compare reads the store's version,
          `rg/status-composition.ts`, and `scripts/integration/checkpoint-composition.ts`.
          `lib/delivery/review-fix-record-effects.ts` reads the boundary only in its in-repo arm, whose settlement
          retires from the flip (6.5.e).
        - Build `test-first` (one behavior at a time):
            - from the flip a `candidate-convergence-verification-pending` boundary pre-publication writes with no
              terminus, and delivery's boundary, over a Candidate the harness seeds, read back as version 2 through each
              reader, and in-repo each writer, attest's among them, writes and reads version 1 as today
            - a delivery member's local review admission refuses when the boundary's store version moves during its
              validation

    - `[ ]` **4.5.d `verificationKind`**

        - From the flip `createRunConvergenceVerificationAction` (`rg/policy/integration-boundary-locus.ts`) emits
          `"merge"` at its callers, the integration checkpoint (`scripts/integration/checkpoint.ts`) and the
          pre-publication procedure (`rg/policy/pre-publication-procedure.ts`), and attest's own builder emits it for
          its next actions (`lib/work-unit/verbs/attest.ts`), which 4.6.a tests from the flip. The kind check of the
          widened copy and of attest's own action schemas (4.5.a) admits `"merge"` beside `"tier-3"` for a full scope;
          the boundary's version 1 keeps `"tier-3"` alone, and version 2 admits `"merge"` alone (§ 9.1).
        - Build `test-first` (one behavior at a time):
            - a convergence refusal from the flip emits `"merge"` at the checkpoint and pre-publication, and in-repo each,
              attest's among them, emits `"tier-3"`
            - the widened copy and attest's schemas admit a full scope with either kind, a version 1 boundary refuses
              `"merge"`, and a version 2 boundary refuses `"tier-3"`

### `[ ]` **4.6 Store reads for attest and delivery inspection, and the `Candidate` bullet's readers — § 12.1, § 12.4**

- _Goal:_ From the flip `arc attest` reads the work unit's meta and task list through the store, writes only
  `Current Workflow` and `Next Action` through the meta kind's field writers in the batch that writes the Candidate and
  its boundary, and refuses a paused work unit naming `arc resume <slug>` before writing anything; delivery inspection
  resolves the work unit and reads its meta and task list through the store; every reader of the meta's `Candidate`
  bullet but the subject's, which 7.6 moves, reads the Candidate record instead; and session-init's projection takes an
  Integrating work unit's branch from its link.

    - `[ ]` **4.6.a Attest's reads, its batch, and its pause refusal**

        - The meta through `readWorkUnit` (`lib/store/lifecycle-write.ts`) and the task list as `runStoreReopen` reads it
          (`lib/work-unit/verbs/reopen-store.ts`), in place of `base.io.readFile` and, for `--new-root`,
          `buildLifecycleIndex` (`handlers/lifecycle-delivery-review.ts`); `--new-root` on a Shipped work unit reaches
          its ended item through its root's retry (7.5).
        - Delivery inspection's task-list read (`readTaskList`, `lib/delivery/repository-entry.ts`), which attest's
          renewal of an Integrating or Shipped work unit runs through (`lib/delivery/entry-inspection.ts`), reads the
          stored task list from the flip; the reopen permit reaches the same read (6.4).
        - The writes in place of `setMetaBulletFields` and `setMetaCandidate`, with the values and conditions
          `handleAttest` selects today: `Current Workflow` from `ATTESTED_ORIENTATION` (`lib/work-unit/verbs/attest.ts`)
          unless a repair leaves it unchanged, and `Next Action` from the next action of the boundary it writes where
          the singleton publication recovery applies or the boundary does not match on a work unit not Shipped,
          otherwise from `ATTESTED_ORIENTATION`, unless a repair of a matching boundary finds it set; the pause is read
          through `checkAdvancingPause` (`lib/store/lifecycle-pause.ts`).
        - Build `test-first` (one behavior at a time):
            - from the flip attest reads a stored meta and task list with no file for either in the checkout, refusing
              an open task as today
            - attest renews an Integrating work unit's Candidate reading the stored task list with no task-list file in
              the checkout
            - `--new-root` attests a shipped work unit found by `lookup`
            - from the flip attest writes `Current Workflow` and `Next Action` with the Candidate and boundary in one
              batch, and none of `Last Completed`, `Next Task`, and `Candidate`
            - from the flip a non-matching boundary's next action becomes `Next Action`, and a repair of the current
              Candidate over a matching boundary writes neither field it would leave unchanged
            - from the flip attest's boundary, its unchanged write's included, reads back as version 2, and a
              convergence refusal at attest emits `"merge"` in its next actions
            - on a paused work unit it refuses naming `arc resume <slug>` and writes nothing, and succeeds after
              `arc resume`

    - `[ ]` **4.6.b The `Candidate` bullet's readers**

        - The store-backed publication's check (`inspectPublication`, `lib/work-unit/verbs/publish-store.ts`) and
          session-init's boundary projection (`commands/active/status.ts`) read the record's `attestation.candidateId`
          from the flip, and the store-backed rename (`readStoreRenameSubject`, `lib/store/lifecycle-rename.ts`) refuses
          where the work unit holds a `review/candidate` record.
        - Session-init's projection takes an Integrating work unit's branch from its work-branch link
          (`selectWorkBranchLink`, `lib/store/lifecycle-branch.ts`) in place of the meta's `Branch`.
        - `commands/active/status.ts` opens no store today, and its heavy imports load lazily, pinned by
          `deferredActiveProjectionModules` (`__tests__/unit/cli-loading-boundary.test.ts`) and the file's
          restricted-import list in `eslint.config.js`. From the flip it opens the checkout's store as 4.1.b's roots
          open it, through a module it imports lazily and that joins both lists, and reads the work item's links through
          it, the project ID from the project-ID port (`projectId`) as `selectWorkBranchLink`'s `repository`; its
          in-repo arm, branched on the store's `stateOffBranch`, reads the meta's `Branch` as today.
        - _Note:_ Build on `commands/active/status.ts`'s shipped locus projection and preserve its lazy import
          boundary (§ 14.4).
        - Build `test-first` (one behavior at a time):
            - the store-backed publication's check reads the attested Candidate from the record with no `Candidate` in
              the meta, and a work unit attested from the flip refuses rename
            - session-init's projection shows an Integrating work unit's boundary with no `Branch` in its meta
            - in-repo the projection reads the meta's `Branch` as today, and the loading-boundary test finds the store's
              module loaded lazily
            - session-init's projection names the Candidate the record holds

    - `[ ]` **4.6.c Delivery entry inspection's work unit and meta**

        - `inspectActiveRepositoryDeliveryEntry` (`handlers/delivery-entry.ts`), which `arc delivery entry inspect` runs,
          and delivery execution's review-fix inspection (`resolveReviewFixLocus`, `inspectReviewFixRepositoryEntry`,
          `handlers/delivery-execution.ts`) resolve the work unit through the store from the flip — the checkout's as
          4.4.a resolves it, and the review-fix one's completed owner confirmed by `lookup` in place of
          `buildLifecycleIndex` — and read its meta through `readWorkUnit` (`lib/store/lifecycle-write.ts`) in place of
          the file at its active or completed path, handing the inspection the work unit so its task-list read is 4.6.a's
          stored one, with no path resolved from the meta's `Task List` (§ 12.4).
        - `inspectActiveRepositoryDeliveryEntry` opens no store today: it opens the checkout's store as 4.1.b's roots
          open it, and the review-fix inspection reads through delivery execution's (4.1.b), each reading the project ID
          through the project-ID port (`projectId`) for 4.4.a's resolution by link.
        - The completed owner resolves through the shipped `resolveCandidateMutationOwner` and
          `resolveCompletedCandidateWorkUnits` (`handlers/candidate-mutation-owner.ts`), supplied the same store and
          project-ID reader; the tests exercise production resolution through 4.2's seeded records and topology.
        - Build `test-first` (one behavior at a time):
            - from the flip `arc delivery entry inspect` reports a work unit's entry with neither its meta nor its task
              list in the checkout
            - from the flip the review-fix inspection reads an active work unit's stored meta and task list with neither
              file in the checkout, and, given its owner, a completed work unit's
            - a work unit whose meta names no task list refuses as today

### `[ ]` **4.7 Keep in-flight state in a namespace of its own — § 4.7**

- _Goal:_ From the flip operation records hold only in-flight execution state, in `in-flight/`, one record per lane and
  lineage owner, so no record of today's shapes reaches the new schemas, an attempt whose outcome is stored never counts
  as in flight, no pass holds two attempts under way or one after its finished outcome, and the in-repo arm still reads
  today's records.

    - `in-flight/` joins the closed namespace list (`lib/git-common-state.ts`, its type and its schema), apart from
      `operations/`.
    - An in-flight store beside `LocalReviewOperationStateStore`, which stays the in-repo arm, keys each record as
      `laneProgressOperationId` keys lane progress — by lane and lineage owner (`laneSubjectOwner`), which leaves the
      head out of every head-bound lineage, so only a review target, whose identity names its head, has a record per
      head — and versions it as today; a record emptied of attempts persists, so its version continues. Each attempt
      under way keeps a pending attempt's fields today (`LaneAttemptSchema`, `rg/core/operation-state-schema.ts`) — its
      attempt ID, head, change request, source, and source binding, a hosted attempt's admission and handle among them —
      with its logical pass, generation, scope mode, coverage admission, and `admittedBy`. The frontline run state, a
      local attempt's guidance, whose digest its outcome keeps (1.2.a), its reviewer instructions, and review
      suspensions live there too; the hosted request owner index stays in `identity/`.
    - An attempt whose outcome is stored reads as ended, and the next write to its record drops it, matching a hosted
      attempt by its admission's ID, which keys its outcome, since its acknowledgement re-keys its attempt ID by its
      handle.
    - The record's writers: `recordLaneAttempt` (`rg/lane-progress.ts`), whose write of an attempt under way lands here
      from the flip, and the three that write lane progress directly today, each only an attempt under way —
      `publishHostedPendingAdmission` and `acknowledgeHostedRequest` (`rg/lane-progress-hosted-request.ts`), which 5.2
      moves, and `withdrawLockedAdmission` (`rg/policy/frontline-pending-admission.ts`), which 5.4 moves (§ 4.7).
    - The record's schema refuses two attempts under way at one logical pass, and admission refuses an attempt at a
      pass whose outcome has finished (§ 4.8), the two rules `validatePassCounts` enforces over lane progress today.
    - Admission reads a lane's attempts in flight from there, as it reads lane progress today.
    - Build `test-first` (one behavior at a time):
        - from the flip, an in-flight local attempt is recorded under `in-flight/` and nothing is written to
          `operations/`
        - an admitted attempt records the decision that admitted it
        - a local, a frontline, and a hosted attempt under way compose back as today's pending attempt, binding included
        - an attempt whose outcome is stored reads as ended, and the record's next write drops it, an acknowledged
          hosted attempt matched to its outcome by its admission's ID
        - a record whose last attempt is dropped persists, and its next write's version follows the last
        - one record holds an Errand's attempts at two heads, and a review target's record is its head's alone
        - a second attempt under way at one logical pass refuses, in any lane
        - a local admission at a pass whose outcome has finished refuses
        - a clone whose `operations/` holds records of today's shapes reads its review state from the flip, and the
          snapshot read of `in-flight/` never meets them (`readOperationSnapshot`)

### `[ ]` **4.8 Read the Candidate's supersession chain through `history` from the flip — § 8.4**

- _Goal:_ From the flip the Candidate history read walks the record's store history for the supersession chain and gives
  a record's revision as its store version, returning the chain the in-repo arm returns over the same versions, so pass
  inheritance runs over the reference backend.

    - `resolveCandidateSupersessionAncestors` runs over `history` entries, parsing each version's content and passing
      over a removal entry, which carries none; an ended item's history reaches its history refs through the root's
      retry (7.5).
    - From the flip `arc attest`'s result and remedy carry the store version (`recordRevision`,
      `candidateRecordRevision`, `lib/work-unit/verbs/attest.ts`) in the result schema 4.5.a widened; and
      `inspectReRootReviewAuthority` (`handlers/lifecycle-delivery-review.ts`) reads the revision through the
      history read, attest's re-root refusal naming the store version where its remedy names the record commit today.
    - The supersession refusal (`readCandidateInheritedLaneProgress`, `rg/lane-progress-supersession.ts`) names, from
      the flip, the remedy § 8.4 states: finish or resume the predecessor's attempt in flight on this clone, then retry.
    - Build `test-first` (one behavior at a time):
        - over the reference backend, a re-rooted Candidate's chain equals the in-repo arm's over the same versions
        - the record's revision is its store version, and attest's result carries it
        - a re-root over a live attempt refuses naming the record's store version, and succeeds once the attempt is
          settled
        - a successor's review over a predecessor's attempt in flight on the clone refuses naming its attempt, and
          succeeds once that attempt ends
        - a removal entry is passed over, and a version whose content does not parse refuses as the in-repo arm refuses
          it

### `[ ]` **4.9 Write a local attempt's outcome, and derive the lane's pass count from outcomes — § 4.1–4.3, § 4.6, § 4.8**

- _Goal:_ From the flip a local attempt that ends writes one `review/outcome` on its vehicle's work item through the
  lane-progress transition every caller uses, and the policy numbers the next pass, records an exhausted pass count, and
  refuses an unsettled supersession from the count and state derived from stored records, its chain's included.

    - `[ ]` **4.9.a An ended local attempt writes its outcome**

        - `recordLaneAttempt` (`rg/lane-progress.ts`), which every lane's ended attempt is written through and which 4.7
          gives its in-flight write, writes an ended attempt as its outcome from the flip, its input widened to carry the
          outcome content § 4.2 lists for its source; the three writers of attempts under way that bypass it write the
          in-flight record (4.7).
        - The receipt's append sites write the outcome in its place from the flip, keeping the receipt on it (1.2.a):
          `appendReceiptWithRetry` (`rg/runtime/local-attest-command.ts`) and resume's `appendReceipt` calls
          (`rg/runtime/local-resume-command.ts`). The reads that look for a request's receipt read its stored outcome
          instead: attest's and resume's terminal checks, `replayPendingLocalAdmission` and
          `verifyExistingLocalAdmission` (`rg/runtime/local-prepare.ts`), and `rg/runtime/local-pending-replay.ts`.
        - The local lane's writers reach it: `attestLocalReviewCommand` (`rg/runtime/local-attest-command.ts`), whose
          `terminal-failure` record calls `recordLaneAttempt` directly; the `stale-target` record
          `rg/runtime/local-pending-replay.ts` writes; `resumeLocalReviewCommand` (`rg/runtime/local-resume-command.ts`);
          and `replayPendingLocalAdmission` (`rg/runtime/local-prepare.ts`).
        - `nextLocalRetryGeneration` (`rg/runtime/local-prepare.ts`) numbers a retry one past the highest stored or
          in-flight generation from the flip.
        - The local source sweep (`rg/core/local-source-sweep.ts`, bound in `local-prepare-composition.ts`) recognizes a
          finished local review by its stored outcome from the flip, where it finds a receipt for its request today. It
          walks every pin in the repository while the outcome port binds one work item, so it reads each pin's outcome
          by key on the work item its `local-review` record names, through the root's store.
        - Build `test-first` (one behavior at a time):
            - a local standard-lane review that ends `clean` writes one outcome on the Candidate's work item
            - one that ends with findings writes them on its outcome
            - one that ends `terminal-failure` or `stale-target` writes an outcome that counts toward nothing, and its
              retry writes another at the same logical pass, one generation higher
            - a replayed pending admission writes its outcome once
            - an attest replayed after its outcome is stored returns today's envelope and writes nothing, and a
              conflicting replay refuses `corrupt-state` as today
            - the source sweep releases a finished review's pin by its outcome, and keeps an unfinished one's until it
              expires
            - a sweep run from one work item's review releases a second work item's finished pin by that work item's
              outcome

    - `[ ]` **4.9.b The policy reads the derived count**

        - From the flip every lane-progress read goes through the in-flight port's composition (4.1.a) —
          `readLaneProgressOwner` and `readLaneProgressOwnerVersioned` (`rg/lane-progress.ts`), the transitions' own
          `readOperation` calls on lane-progress IDs (`rg/lane-progress*.ts`), and the snapshot's lane-progress entries
          — and returns today's `LaneProgressState`, composed from the lineage's stored outcomes and its in-flight
          record (§ 4.7):
            - attempts ordered by logical pass, then `endedAt`, then generation, an unfinished outcome before a
              finished one, then attempt ID, with attempts in flight last;
            - `updatedAt` the latest of the in-flight record's time and the outcomes' `endedAt`;
            - the version the in-flight record's, or 0 where this clone holds none, which earlier-review candidates
              admit from the flip (`EarlierReviewAttemptCandidateSchema`, `rg/policy/earlier-review-attempts.ts`);
            - the count and settled state derived as 1.2.c derives them.
        - So `readLaneProgress` (`rg/policy/pre-publication-composition.ts`), `rg/policy/review-policy-driver.ts`, and
          `rg/lane-progress-supersession.ts` read the derived count with no change of shape;
          `readCandidateInheritedLaneProgress` keeps its refusals from the flip, refusing a predecessor's attempt only
          while it is in flight on the clone, a stored live outcome reading as outdated (§ 8.4), and reading its review
          responses from evidence.
        - Build `test-first` (one behavior at a time):
            - the composed state passes today's lane-progress validation (`LaneProgressStateSchema`)
            - attempts compose in pass, end-time, and generation order with attempts in flight last, and `updatedAt` is
              the latest of their times
            - outcomes 3.2 maps from one lane-progress record compose in that record's order, each pass's retries in
              generation order and its finished outcome after its unfinished ones; a pass that fell back across two
              sources, and one retrying its sources in source order, pass the source-order check
              (`validateConfiguredAttempts`, `rg/policy/review-policy-driver.ts`) with today's effective terminal
              attempt (`effectiveTerminalAttempt`, `rg/policy/pre-publication-request.ts`)
            - a lineage with stored outcomes and no in-flight record on this clone reads at version 0, and an
              earlier-review query admits it
            - the next logical pass and every grant's exhausted count follow the completed logical count, while only
              standard ceiling eligibility follows the complete-coverage count
            - a superseded Candidate's chain carries its passes into its successor's count
            - a predecessor with an attempt in flight, and one with a review response the frontline owner's performance
              does not account for, each refuse `CandidateSupersessionResolutionError`
            - a predecessor's unsettled `findings` outcome, written after its re-root on another clone, refuses nothing
              and adds nothing to the count
            - in the harness's differential mode, the derived count equals today's over the same reviews run in-repo

    - `[ ]` **4.9.c The local lane reads settled state from evidence**

        - Local preparation's terminal check and `terminalResponsePerformed` (`rg/runtime/local-prepare.ts`), the
          pending replay's (`rg/runtime/local-pending-replay.ts`), and `livePredecessorReviewAttempt`
          (`rg/lane-progress-supersession.ts`), which reads an unsettled `findings` attempt as live, read whether a
          `findings` outcome is settled through 1.2.c's derivation from the flip.
        - Build `test-first` (one behavior at a time):
            - a local `findings` outcome with approved evidence for its result reads as settled to preparation, replay,
              and supersession, and one without reads as unsettled, refusing its Candidate's re-root
            - one whose approved set carries a fix reads as unsettled until its performance is recorded

### `[ ]` **4.10 Read local results and reduce them from outcomes — § 4, § 9.3**

- _Goal:_ From the flip the review result reader and reduction read a local result from its outcome, through the
  command source reference whose durable part is the outcome key, so a local review's result reads back as today with
  no published schema changed.

    - `LocalReviewResultReader` (`rg/hosts/local/review-result-reader.ts`) and reduction's local source
      (`rg/runtime/reduce-command.ts`) read the outcome; local attest and resume bind `receiptRef`
      (`bindReviewSourceReference`) with the outcome key as its durable part, their `sourceRef` staying the source
      store's reference.
    - The reader's local result carries the outcome's `sourceDigest` as `localSourceRef` from the flip, in place of the
      operation state's `sourceRef`, as the composed approved-disposition record's local source does (4.1.a, § 9.3).
    - The reader recomputes the result's digest (`localResultDigest`) from the outcome — its attempt ID, its receipt as
      recorded, and its admission fields, `guidanceDigest` among them and `laneSourceId` the outcome's source — in place
      of the operation state and the receipt store (§ 4.2).
    - Build `test-first` (one behavior at a time):
        - from the flip, the reference local attest returns resolves to its outcome through the result reader and
          through reduction
        - from the flip the result's digest read on a second clone equals the one today's reader gives for the same
          review
        - from the flip a disposition approved on one clone matches its local result read on a second clone, and still
          matches once the source's pin is released
        - the attest, resume, and reduce envelopes parse under today's schemas from the flip
        - from the flip reduction's local arm and resume's check read the same verdicts through the composed
          approved-disposition record (4.1.a) as in-repo
        - in-repo, both read the receipt as today

### `[ ]` **4.11 The review gate's store** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

## **Phase 5:** Every lane's results and responses from the flip

_Purpose:_ Repeat the local lane's pattern over the frontline and hosted lanes, the approved responses and their fix
authorizations, delivery's review fix, the readers that compose from those records, and adversarial passes.

_Mode:_ `replication` — closes when every review fact the gate writes outside the boundary is written as its family
record from the flip, and every reader of it reads it back.

_Exit criterion:_ Over the reference backend, each lane's attempts write outcomes and each lane's admission numbers its
pass from the derived count, each approved response writes and advances its evidence record, an `approved-fix` extra
pass is written, consumed, withdrawn, and superseded as today, an Errand's frontline skip is kept and closes its window,
`arc review adversarial record` writes one record per call and refuses malformed input naming the expected shape, and
every reader composing results reads the same verdicts as today.

_Design decisions:_ Every lane's ended attempt is written through `recordLaneAttempt`, whose arm 4.9.a builds, so each
lane's task adds only what its outcome carries beyond the local lane's; the writers of attempts under way that bypass it
write the in-flight record (4.7), 5.2 moving the hosted two and 5.4 the frontline withdrawal. The composed lane-progress
read (4.9.b) gains each record this phase writes — performance, settlement, and the extra passes an attempt cites — so
the policy modules that branch on today's `LaneProgressState` keep their inputs, and the tasks below name only the
modules that read or write the family's records, or today's stores, directly. Each reader's tests also run over the
review harness's differential mode (4.2), the same reviews run in-repo and from the flip, in the integration tier.

### `[ ]` **5.1 Write frontline outcomes and skip decisions, and derive the window — § 4.2, § 4.7, § 5.6, § 5.9**

- _Goal:_ From the flip a frontline attempt that ends writes its outcome where its run writes its result today, its
  admission numbers its pass from the derived count, a frontline skip — a Candidate's or an Errand's — is a lane-skip
  decision on the vehicle's subject, and the window's closure derives from the vehicle's records, so nothing writes or
  reads the skip marker and an Errand's skip closes its window.

    - `[ ]` **5.1.a Frontline outcomes and admission**

        - `executeAndPersistFrontlineRun` (`rg/policy/frontline-operation.ts`) writes the attempt's outcome, composed
          from its admission and the run's result with the frontline content § 4.2 lists, where it appends the frontline
          outcome record today (`appendOutcome`), retaining the run's original `sourceBindingId` before redacting its
          source, so a crash after the run leaves its result as today; `readBoundOutcome` and `validateExplicitRetry`
          read a current or prior attempt's outcome through the outcome port; and `recordFrontlineAttempt`
          (`rg/lane-progress.ts`) finds the outcome stored and only ends the attempt in flight (§ 4.7).
        - From the flip the run envelope's `outcomeRef` (`rg/runtime/frontline-run-command.ts`) binds the attempt's
          outcome key as its durable part (`bindReviewSourceReference`) in place of the frontline outcome record's
          reference, as the composed approved-disposition record's frontline source does (4.1.a, § 9.3).
        - A frontline admission citing no `approved-fix` extra pass numbers its pass one past the derived count, its
          chain's included, and takes the larger of one past the highest generation among its pass's attempts, stored or
          in flight, and the version of the in-flight record for its lane and lineage owner
          (`admitNewFrontlineOperation`, `rg/policy/frontline-command.ts`).
        - Admission's unresolved-findings read over the lineage and its chain (`rg/policy/frontline-command.ts`) passes
          over an outcome that reads as outdated (§ 8.4).
        - The in-flight admission and retry modules keep their working state's shapes, reading the lane through the
          composed read: `rg/runtime/frontline-admission-validation.ts`, `rg/core/frontline-retry-contract.ts`, and
          `rg/runtime/frontline-retry-remedy.ts`.
        - Build `test-first` (one behavior at a time):
            - a frontline attempt that ends writes one outcome keyed by its attempt ID, carrying its executable identity
              and outcome digest and original `sourceBindingId` as recorded, with no executable path or arguments
            - from the flip the run envelope's `outcomeRef` names the attempt's outcome key as its durable part
            - a run interrupted after its outcome is written ends its attempt once when replayed
            - the next frontline pass is one past the derived count, a superseded Candidate's chain included
            - a replaced Candidate's outdated `findings` outcome leaves no unresolved finding for its successor
            - a retry after an unfinished attempt admits at a strictly higher generation
            - a frontline admission while another attempt is under way at its pass, or at a pass whose outcome has
              finished, refuses
            - a withdrawn admission that never ran leaves no outcome, and a ready response starts a run only for an
              admission identical to it

    - `[ ]` **5.1.b The lane-skip decision**

        - `recordSingletonFrontlineInitialSkip` (`rg/policy/frontline-phase.ts`), which a Candidate's accepted skip
          reaches through `persistAcceptedFrontlineSkip` (`handlers/review.ts`), and an Errand's `skip` invocation,
          which records nothing today, write a lane-skip decision on the vehicle's subject with a `null` basis, recording
          the active identity unchecked (§ 5.1, § 5.7).
        - Build `test-first` (one behavior at a time):
            - a Candidate's skip writes one decision that reaches its supersession chain
            - an Errand's skip writes one decision on the Errand
            - the same skip recorded twice names one decision

    - `[ ]` **5.1.c The derived window**

        - `frontlinePhaseClosed` derives closure from the vehicle's records — a skip decision; a terminal frontline
          outcome, clean or settled findings advising a stop (`readSettledFindingsAdvice`); or the standard lane's first
          attempt, in flight or recorded — from the flip.
        - From the flip the `frontline-phase-closed` diagnostic (`rg/policy/frontline-command.ts`,
          `rg/policy/review-policy-driver.ts`) reads `frontline-window-closed`; the `phase-closed` skip reason keeps its
          value, which a published schema fixes (§ 5.9).
        - Build `test-first` (one behavior at a time):
            - an Errand's skip closes its window
            - a Candidate's window closes on a superseded ancestor's skip, a terminal frontline outcome, or the standard
              lane's first attempt, and stays open otherwise
            - from the flip a closed window refuses with `frontline-window-closed`, the policy driver's skip reason
              still reading `phase-closed`

### `[ ]` **5.2 Write hosted outcomes with their sealed results — § 4.1, § 4.5, § 9.3**

- _Goal:_ From the flip a hosted attempt that ends writes its outcome keyed by its admission ID, keeping its sealed
  result under `hostedResultId` with its host locator; its admission numbers its pass from the derived count; and
  settlement, coverage validation, and every hosted reference resolve to that outcome, never a host comment.

    - The hosted transitions write through `recordLaneAttempt`'s arm: the request's conclusion, a failed one's included
      (`recordHostedRequestConclusion`, `rg/lane-progress-hosted-settlement.ts`); the await (`recordHostedAwaitAttempt`,
      `rg/lane-progress-hosted-request.ts`, mapping its state through `hostedAwaitLaneOutcome`, `rg/lane-progress.ts`);
      and seal recovery (`rg/lane-progress-seal-recovery.ts`). The hosted request owner index stays working state in
      `identity/`.
    - The hosted admission's pending attempt (`publishHostedPendingAdmission`) and its acknowledgement
      (`acknowledgeHostedRequest`, `rg/lane-progress-hosted-request.ts`), which write lane progress directly today,
      write the in-flight record from the flip (4.7), the acknowledgement re-keying the attempt by its handle.
    - A hosted admission numbers its pass one past the derived completed logical count, its chain's included
      (`rg/lane-progress-hosted-request.ts`), and the owner index's `completedPassesAtAdmission`
      (`rg/hosts/local/hosted-request-owner-index.ts`) is compared with the derived count where `handlers/review.ts`
      compares it with lane progress's today.
    - A hosted reference (`attemptRef`) resolves to the outcome holding its `attemptId` (§ 9.3), in hosted settlement
      (`readHostedSettlementAttempt`, `handlers/review.ts`) and wherever it is decoded.
    - Build `test-first` (one behavior at a time):
        - from the flip a hosted admission's pending attempt and its acknowledgement land in the in-flight record and
          write nothing under `operations/`, and the acknowledged attempt is dropped from it once its outcome is stored
        - a hosted attempt the provider acknowledged writes its outcome keyed by its admission ID
        - the sealed result's digest covers the admitted attempt's binding (`computeHostedResultId`)
        - a failed request writes an outcome carrying its failure reason
        - the next hosted pass is one past the completed logical count, and the owner index's admission count
          compares with it, including complete pass 1 followed by incremental pass 2 admitting pass 3 at ceiling count 1
        - a hosted retry at a later head after its pass's terminal failure writes a second outcome at that pass and
          generation 0 (`hostedPassHold`), composed after the failure
        - a hosted admission while another attempt is under way at its pass, or at a pass whose outcome has finished,
          refuses
        - a hosted reference resolves to its outcome, and settlement checks each finding it settles against the sealed
          findings

### `[ ]` **5.3 Write evidence at approval, performance, settlement, and succession — § 6, § 9.3**

- _Goal:_ From the flip `arc review respond` writes one evidence record per approved disposition set, its binding
  resolved at the first write, advances it in place as its response is performed and settled, and marks its predecessor
  in the batch that creates a successor, so the current set is the one no record succeeds.

    - The lane-progress transitions respond calls write evidence from the flip: `settleLaneAttempt` and
      `recordLaneResponsePerformance` (`rg/lane-progress.ts`), and `bindHostedAttemptDisposition`,
      `supersedeHostedAttemptDisposition`, and `completeHostedAttemptIfReady` (`rg/lane-progress-hosted-settlement.ts`,
      `rg/hosted-response-completion.ts`).

    - `[ ]` **5.3.a Approval and its binding**

        - `settleNewApprovedResponse` (`rg/runtime/respond-command.ts`) writes the record, resolving the binding as
          § 6.1 states it, and decodes the result's source reference to its outcome (§ 9.3); a replay reads it again.
        - `createPendingResponseDispositionNode` supplies optional tags at that first write, outside the approved set
          and its identity (§ 6.2). Every replay and advance preserves them, including absence; successors record their
          own tags without changing earlier nodes.
        - A hosted set's record is created with its first settlement entries `record-only` and uncarried, as
          `validInitialHostedDisposition` (`rg/hosts/local/operation-state-store.ts`) requires of the first binding
          today; the write check leaves this to the verb (1.4.b).
        - Build `test-first` (one behavior at a time):
            - an approved local, frontline, and hosted response each write one evidence record naming its result's
              outcome key
            - a hosted set's record is created with its first entries `record-only` and uncarried
            - a response for a frontline review of a private member binds the Candidate with the member
            - a response no binding resolves writes a record with none, and a replay changes nothing
            - supplied tags persist at approval; a replay reads them instead of incoming report tags, and a historical
              record with no tags stays without them after performance, settlement, projection, and succession

    - `[ ]` **5.3.b Performance and the Candidate response**

        - Today a fix response is two writes: its facts appended to the disposition record (`errandFixResponse`,
          `deliveryMemberFixResponse`), then its performance (`recordPerformedResponse`, `rg/runtime/respond-command.ts`;
          `LaneResponsePerformanceSchema`). From the flip both are one `performance` write, so no response is ever half
          recorded, and a replay that finds a matching performance returns today's envelope and writes nothing; a
          Candidate lineage adds `candidateResponseId` once.
        - Build `test-first` (one behavior at a time):
            - a performed fix advances its record once with its facts and its performance, and a second performance
              refuses
            - a respond replayed after its performance is written returns today's envelope and writes nothing
            - the Candidate response's ID is added once and never changed

    - `[ ]` **5.3.c Hosted settlement**

        - Settlement appends its entries to the record, `settleHostedAttemptFinding`
          (`rg/lane-progress-hosted-settlement.ts`), which `arc review hosted settle` calls (`handlers/review.ts`),
          among its writers.
        - Build `test-first` (one behavior at a time):
            - each settled finding appends one entry, replied and resolved, through `arc review hosted settle` as
              through respond
            - a successor's record starts with its predecessor's entries, carried
            - a hosted `findings` outcome reads as settled once its record's settlement covers every sealed finding

    - `[ ]` **5.3.d Succession and the current set**

        - Approving a successor writes it and marks its predecessor in one `batch`; the readers of
          `dispositionSetLineage` and its tail pointers read the current set as the one no record succeeds.
        - Build `test-first` (one behavior at a time):
            - a successor approval marks its predecessor, and a second successor to one set refuses
            - a successor over a set with a performed response refuses
            - `arc review respond` clears `policyProjectionPending` as today

### `[ ]` **5.4 Write, consume, and withdraw `approved-fix` extra passes — § 5.4, § 5.5, § 5.7**

- _Goal:_ From the flip approving a fix with a conditional next pass writes an `approved-fix` extra-pass decision keyed
  by today's `authorizationId`, the admission citing it consumes it as today, a successor set's approval ends it, and
  its withdrawal is a withdrawal decision, refused once it is consumed or superseded or when the withdrawer is not its
  decider; a repeated capture or withdrawal reports the stored decision, as today.

    - `captureConditionalNextPassAuthorization` (`rg/lane-progress-conditional.ts`), which
      `rg/runtime/respond-command.ts` reaches, writes the decision, naming the set's approver as its decider, its
      subject the lineage at the producer's reviewed head and its `passCount` the producer's
      logical pass (1.3.a); `bindConditionalPendingAdmission`, `invalidateConditionalNextPassAuthorization`,
      `inspectConditionalNextPassInvalidation`, and `withdrawConditionalNextPassAuthorization` read and write decisions,
      and the admitted attempt's outcome cites it as `admittedBy`.
    - A repeated call reads the stored decision and writes nothing (§ 5.2): a capture whose decision is stored compares
      it with the request and returns it, as `assertCaptureReplay` does today, and a withdrawal whose withdrawal
      decision is stored returns `already-withdrawn`, or refuses `foreign-authority` where another person withdrew it.
    - The withdrawal's supersession refusal stays with this verb, beside its in-flight one:
      `withdrawConditionalNextPassAuthorization` reads the stored evidence and refuses `superseded` once a successor
      disposition set for the producer's result is approved, an order the write check cannot see (§ 5.10; 1.3.b). It
      reads a stored withdrawal decision first: a stored withdrawal came before any successor, since one after it
      refuses, so a repeated withdrawal replays as today however many successors followed.
    - A consumption whose admission has not ended is read from the in-flight record's `admittedBy` (§ 4.7):
      `withdrawConditionalNextPassAuthorization`, `withdrawLockedAdmission` (`rg/policy/frontline-pending-admission.ts`),
      and `rg/core/frontline-retry-contract.ts` read it there. `withdrawLockedAdmission`, which writes lane progress
      directly today, drops the withdrawn admission's attempt from the in-flight record from the flip.
    - `assertConsumedRetry` (`rg/lane-progress-conditional.ts`) compares a retry under a consumed decision with the
      attempts that decision admitted, read from their outcomes: source, scope, and coverage for every lane, and for a
      local retry its author and evaluator identities, policy binding digest, request mechanism, and attestation
      runtime kind and mechanism (`retryOperationContract`).
    - Build `test-first` (one behavior at a time):
        - an approved fix with a conditional next pass writes one decision, and binds once its evidence records the fix
          performed at the head the fix produced
        - the attempt citing it consumes it; an attempt that did not finish spends nothing, and its retry runs under the
          same decision
        - a retry whose source, scope, or coverage, or a local retry whose actors or policy binding, differ from the
          ended attempt's outcome refuses, and a matching one admits one generation higher
        - a frontline admission citing it that never ran refuses withdrawal with `conditional-authority-consumed`, and
          the decision's own withdrawal refuses while that admission is in flight
        - from the flip withdrawing a frontline admission that never ran drops its attempt from the in-flight record
          and writes nothing under `operations/`
        - a successor set's approval ends it, refusing once it is consumed
        - its withdrawal writes a withdrawal decision, refused once consumed or superseded or when the withdrawer is not
          its decider, and a successor set approved after the withdrawal leaves the withdrawal standing
        - capturing the same decision again returns the stored one, and withdrawing it again returns
          `already-withdrawn`, each writing nothing; a second withdrawal by another person refuses `foreign-authority`
        - withdrawn, then superseded by a successor set's approval, then withdrawn again by the same person returns
          `already-withdrawn`, as today

### `[ ]` **5.5 Move delivery's review fix onto evidence — § 6, § 9.3, § 14.2**

- _Goal:_ From the flip a delivery member's fix advances its evidence record, its continuation reads the resolved policy
  request from it, and delivery reads evidence and outcomes in place of disposition and operation-state records, while
  a verification response stays a Candidate transition alone.

    - `lib/delivery/review-fix.ts` (`currentApprovedDispositionNode`), `lib/delivery/review-fix-continuation.ts`
      (`selectPendingDeliveryReviewFixAuthority`), the disposition listing `lib/delivery/repository-entry.ts` gives it,
      and `handlers/delivery-execution.ts`'s disposition and operation-state reads, its source-reference decodes, its
      disposition write, and its `settleLaneAttempt` call.
    - Build `test-first` (one behavior at a time):
        - a delivery member's fix advances its evidence record's performance, where `settleLaneAttempt` settles its
          attempt today
        - its continuation reads the resolved policy request from the evidence record, and the pending fix authority
          selects from evidence
        - a verification response writes no evidence record (`createCandidateVerificationResponseEvidence`,
          `lib/work-unit/candidate-attestation.ts`)

### `[ ]` **5.6 Compose review results, policy evidence, reduction, and status from records — § 4, § 6, § 9.3, § 14.2**

- _Goal:_ From the flip every reader that reads the family's records or today's stores directly — to compose a review
  result, a lane's state, a reservation, or status — reads outcomes, evidence, and decisions through the store and
  reaches today's verdicts.

    - `[ ]` **5.6.a The result readers**

        - `rg/hosts/local/review-result-reader.ts`'s frontline and hosted arms and its composition,
          `rg/core/review-result.ts`, and `rg/core/review-result-disposition.ts`, which decodes source references
          (§ 9.3) and whose lineage check becomes a per-set check over evidence records.
        - From the flip the reader's frontline result carries an `outcomeRef` whose durable part is the outcome key, as
          the run envelope's (5.1.a) and the composed approved-disposition record's (4.1.a) do, so the disposition's
          source check (`approvedRecordSourceMatchesResult`) and respond's comparison (`rg/runtime/respond-command.ts`)
          match (§ 9.3).
        - The frontline result returns the recorded `sourceBindingId`; source-context matching never recomputes it
          from the redacted descriptor. Its portable outcome projection carries no executable path or arguments.
        - Build `test-first` (one behavior at a time):
            - a frontline and a hosted result read back from their outcomes as today
            - an existing frontline approved set still matches after redaction, including a command source with a
              Candidate/member response binding
            - a disposition over a superseded set refuses as today
            - from the flip frontline closure reads the same verdicts through the composed approved-disposition record
              (4.1.a) as in-repo
            - from the flip a frontline run envelope's `outcomeRef` settles through respond, and the settled advice
              closes the frontline window

    - `[ ]` **5.6.b Policy evidence, earlier reviews, the pending fix, and reduction**

        - `rg/policy/review-policy-evidence.ts`; `rg/policy/pre-publication-request.ts`; earlier-review applicability's
          disposition reads and decodes (`rg/policy/earlier-review-applicability.ts`) and `queryEarlierReviewAttempts`
          (`rg/policy/earlier-review-attempts.ts`); `readPendingCandidateReviewFixAuthority`
          (`rg/policy/candidate-review-fix-continuation.ts`), which compares a local record's `localSourceRef` with its
          outcome's `sourceDigest` in place of the operation state's `sourceRef` (§ 9.3), and uses a frontline
          outcome's recorded `sourceBindingId` instead of recomputing it from a redacted source; and reduction's frontline
          source (`rg/runtime/reduce-command.ts`), which reads the current set from the succession.
        - The locus probe's pending-fix callback passes its invocation-bound store and exact selected owner to
          `readPendingCandidateReviewFixAuthority`, which binds its outcome/evidence reads from those ports instead
          of constructing a legacy disposition store off branch; its production projection test is 7.6's.
        - From the flip reduction's frontline source (`reduceFrontline`) reads the attempt's outcome through the outcome
          port in place of the frontline outcome store, and binds the reduce envelope's `outcomeRef` with the outcome
          key as its durable part, comparing it with the reader's (5.6.a, § 9.3).
        - Build `test-first` (one behavior at a time):
            - from the flip reduction over a frontline run reads its outcome with no frontline outcome record, and its
              bound `outcomeRef` equals the run envelope's
            - an earlier review's attempts and approved responses read from outcomes and evidence
            - a pending Candidate review fix reads from its evidence record, a local one matching its outcome's
              `sourceDigest` on a clone holding no operation state for it
            - reduction over a frontline outcome reaches today's projection

    - `[ ]` **5.6.c The hosted reservation**

        - `projectHostedReservationPolicyProgress` and `assertEvidenceBoundHostedReservationPolicyAdmission`
          (`rg/policy/hosted-reservation-admission.ts`) and `createHostedReservationDischargeReader`
          (`rg/policy/hosted-reservation-discharge.ts`).
        - Build `test-first` (one behavior at a time):
            - reservation progress, its admission, and its discharge reach today's verdicts from outcomes and evidence
            - over a pass holding a hosted terminal failure and its restart, the reservation keeps or releases its hold
              as it does over today's records of the same reviews, the composed order matching today's

    - `[ ]` **5.6.d Integration's review reads**

        - The settlement replay (`scripts/integration/lineage-review-composition.ts`),
          `candidate-response-confirmation.ts`'s frontline-outcome, operation-state, and disposition reads and decodes,
          and the checkpoint's snapshot read (`scripts/integration/checkpoint-composition.ts`).
        - Build `test-first` (one behavior at a time):
            - the settlement replay and the response confirmation reach today's verdicts from evidence and outcomes
            - the checkpoint's reservation progress reads the composed lane

    - `[ ]` **5.6.e Status**

        - `rg/status-composition.ts`, `rg/status-errand.ts`, and `rg/status-singleton.ts` read the family; Errand
          status's vehicle read stays on the identity's Errand ref (`readTransientIdentitySnapshot`), the cutover's to
          move (§ 14.4).
        - `rg/runtime/lane-read-composition.ts` and its lane-history and next-pass projections read the same composed
          outcomes, evidence, and decisions through 4.1.b's bound ports, including inherited history and stored tags.
        - Build `test-first` (one behavior at a time):
            - an Errand's and a singleton's review status reach today's verdicts from the family's records, the Errand
              seeded in the store and its identity's Errand ref (4.2)
            - the read-only lane command renders the same rejected findings and two-count history from stored
              records with no legacy operation, disposition, or boundary files, and leaves the store unchanged

### `[ ]` **5.7 Add `arc review adversarial record` — § 7.2**

- _Goal:_ One call at the disposition approval writes one `review/adversarial-pass` record on the work unit its request
  names, the CLI deriving the artifact versions and the pass number and publishing its input schema; malformed input
  refuses naming the expected shape, an incomplete listing refuses, and before the flip the write refuses `unsupported`
  naming the remedy of keeping the pass where the method keeps it today: the work unit's `ADVERSARIAL-PASSES.md` for a
  planning activity, the criteria report for `verification` and `criteria`.

    - `[ ]` **5.7.a The command, its help, and its request schema**

        - `cli.ts` registers `record` under a `review adversarial` parent; `COMMAND_SUMMARIES`
          (`lib/cli-help-summaries.ts`) and `HELP_GROUPS.review` (`lib/cli-help-content.ts`) carry it, as
          `cli-help-coverage.test.ts` requires.
        - Its request schema registers in `rg/request-command-schemas.ts` and joins `ReviewPublicRequestSchemaId`
          (`handlers/review.ts`), with the pinned schema-ID lists that name every published schema:
          `review-schema-registration.test.ts`, `__tests__/helpers/production-schema-ids.ts`,
          `authored-metadata.test.ts`, and the `--schema` table in `review-cli-surfaces.e2e.test.ts`.
        - Its result is a `review-adversarial-record` envelope carrying the record's key and version, the mode joining
          `ReviewCommandModeSchema` (`rg/core/review-command-envelope.ts`), its errors through the review error union.
          Its refusal before the flip is an `unsupported` error variant of its own mode alone, so no other mode's error
          union widens, built for that mode outside the shared code set (`ReviewCommandErrorCodeSchema`), since the
          shared variant builders take only that set's codes and their remedial variants a spine remedy, which needs an
          argv. Its remedy is the store's `RemedySchema` (`lib/store/refusal.ts`) with `text` alone, naming the file
          where the method keeps the pass, since it names no command (§ 7.2).

    - `[ ]` **5.7.b The handler**

        - In `handlers/review.ts`: the request names the work unit by slug, which resolves through `lookup`, and one of
          § 7.1's activities; the CLI derives the versions of the artifacts that activity binds, each by its store
          version, and the code head where it reviews code, and the next pass number for the activity across every loop,
          refusing where the listing it numbers from is incomplete, and writes with `expected: null`.
        - Build `test-first` (one behavior at a time):
            - over the in-repo implementation the write refuses with its mode's `unsupported` variant, its text remedy
              naming the work unit's `ADVERSARIAL-PASSES.md` for a planning activity and the criteria report for
              `verification` and `criteria`, and every other mode's error schema is unchanged
            - from the flip each call writes one record on the named work unit, binding its activity's artifact
              versions, numbered one past the activity's highest across loops, and returns its key and version
            - a slug `lookup` does not resolve refuses, and the call succeeds once the slug names a work unit
            - an incomplete listing refuses, and the call succeeds once the listing completes
            - malformed input refuses naming the expected shape, and the published schema accepts a valid input

### `[ ]` **5.8 Every lane's results** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

## **Phase 6:** The Candidate and its boundary from the flip

_Purpose:_ Bind readiness to the standard lane's records, move the Owner's judgments the boundary carries onto
decisions, cite results by their keys, record withdrawal, and retire every mechanism that exists because these records
ride the branch.

_Mode:_ `slice` — closes on a work unit attested, reviewed, withdrawn, and published from the flip with no record-only
commit.

_Exit criterion:_ Over the reference backend, a work unit attested from the flip publishes with no `Candidate` in its
meta and makes no record-only commit or `commit-*` next action; a re-root after code changes keeps a recorded terminus;
a reopened work unit's publication refuses, a no-change `arc attest` restoring nothing, until
`arc review pre-publication` records readiness again and, where the standard lane still awaits its change request, mints
the reservation it had before reopen, while an interrupted publish still finishes; publication refuses when the standard
lane's records changed after readiness or their listing is incomplete; every decision outside the Candidate's own
selections is a `review/decision` record; and an archived work unit leaves no Candidate in the live listings.

_Design decisions:_ Every mechanism § 14.3 names keeps its in-repo arm behind the same branch on `stateOffBranch`, so
the deletion pass removes whole arms. Readiness's binding comes first (6.1), since every later task's tests publish from
the flip. The store-backed publication and reopen are the lifecycle change's (`publish-store.ts`, `reopen-store.ts`);
this phase puts publication's claim and reopen's boundary write in their transitions' batches (§ 10.1).

### `[ ]` **6.1 Bind readiness to the standard lane's records, and claim publication in its batch — § 9.2, § 10.1**

- _Goal:_ From the flip readiness records `readinessBinding` over the current listing of the standard lane's records on
  the Candidate's lineage and its in-flight attempts, every publication site recomputes it and refuses on a mismatch or
  an incomplete listing, and publication writes its claim in the publish transition's batch, while
  `standardLaneOwnerVersion` guards publication before the flip.

    - Sites: readiness's write, the attestation-ordering recovery that persists it
      (`recoverProjectedPublicationBoundary`), and the re-entry over an advanced boundary (`handlers/review.ts`),
      `authorizeSubmission` and `authorizeActivePublication` (`lib/work-unit/verbs/publish.ts`), the store-backed
      publication (`runStorePublish`, `lib/work-unit/verbs/publish-store.ts`), the publication claim and
      publish-unchanged writes, attest's writes of a recovered singleton publication boundary
      (`recoverAttestedSingletonPublicationBoundary`) and of a repaired matching boundary, and its unchanged write
      (`handleAttest`, `handlers/lifecycle-delivery-review.ts`), and the singleton response's rebind
      (`stageSingletonPublicationResponse`, `rg/runtime/singleton-publication-response.ts`), each writing version 2 from
      the flip (4.5). A `publication-pending` boundary written from a stored one carries that boundary's binding, as
      today's projections carry `standardLaneOwnerVersion`.
    - Two version ports give way from the flip to a binding read that returns 1.6.d's digest, recomputed over the
      store's listings, or `incomplete`: the authorizers' (`readStandardLaneOwnerVersion`,
      `lib/work-unit/verbs/publish.ts`, bound in `handlers/lifecycle-delivery-review.ts`), and the pre-publication
      handler's own dependency of that name (`ReviewPrePublicationHandlerDependencies`, `handlers/review.ts`), which
      readiness's write and its re-entry read. The binding read's in-flight attempts are the standard lane's record on
      the Candidate lineage's owner. The authorizers parse the boundary by its version, comparing `readinessBinding` at
      version 2 and `standardLaneOwnerVersion` at version 1.
    - From the flip `runStorePublish` puts the claim, `publication-pending` with its binding, in the transition's
      `additionalWrites` rather than writing it through `claimPublicationBoundary` before `executeTransition`. It takes
      the claim's write from a new publish parameter, bound in `handlers/lifecycle-delivery-review.ts`, which returns
      the write with the boundary read at its store version and the binding rechecked inside it, as 6.4's reopen reads
      the boundary for its write. `PublishParams.claimPublicationBoundary` stays the in-repo arm's (`runPublish`,
      `lib/work-unit/verbs/publish.ts`), writing and staging the claim as today until the deletion pass removes that
      arm.
    - The store arm's tests (`__tests__/unit/work-unit/verbs/publish-store.test.ts`) that stage their scenario or count
      claims through `claimPublicationBoundary` take the new parameter, each scenario kept: malformed fields refusing
      before any claim, reconcile applied before renewed authorization and the claim, the interrupted claim, the pause
      after prepare, and the primary's Candidate or branch link changing at the claim.
    - Build `test-first` (one behavior at a time):
        - from the flip readiness writes `candidate-publish-ready` as version 2 carrying its binding, and its re-entry
          over an advanced boundary and an attestation-ordering recovery do too
        - from the flip a re-attest of an Integrating singleton at `publication-pending`, a repair of its current
          Candidate included, writes it as version 2 carrying the stored binding through its recovery, and a repair of
          the current Candidate over an Active work unit's matching `candidate-publish-ready` boundary does too
        - from the flip a hosted singleton's review response rebinds a `publication-pending` boundary as version 2
          carrying the stored binding
        - a work unit attested from the flip publishes with no `Candidate` in its meta, its claim written as version 2
          carrying the binding readiness recorded
        - publication refuses after readiness when a standard-lane outcome, an evidence advance, an `approved-fix`
          decision or its withdrawal, or an in-flight attempt is added
        - a terminus, a selection, or a lane-skip decision recorded after readiness refuses nothing
        - an incomplete listing refuses rather than reading as unchanged, and publication passes once the listing
          completes
        - publication passes once readiness is recorded again
        - a claim whose boundary moved since the port read it refuses and writes nothing, and the retry publishes
        - a publish interrupted before its batch leaves no claim, and one interrupted after it leaves
          `publication-pending` with the work unit Integrating, which finishes

### `[ ]` **6.2 Record ceiling and additional extra passes and termini as decisions — § 5.3, § 5.6, § 5.7, § 9.3**

- _Goal:_ From the flip an Owner's ceiling override, additional pass, and terminus — a singleton's or a member's — are
  decision records written by whichever call carries them and read by the resolution within their reach, the `--resume`
  token keeps only its call inputs, the frontline resolve form relays a recorded judgment by its decision, and the
  boundary names the terminus it carries by key, carrying or dropping it where today's writers carry or drop the
  terminus.

    - `[ ]` **6.2.a Ceiling and additional extra passes**

        - The calls that write the decision, recording the active identity unchecked (§ 5.7): `arc review
          pre-publication --lanes` (`ReviewLaneJudgmentSchema`, `rg/policy/review-policy-driver.ts`) and `arc review
          status --ceiling-override` and `--additional-pass` (`handlers/review.ts`; an Errand's through
          `rg/status-errand.ts`).
        - The request fields that relay one stay call inputs, and the call writes the decision: the frontline resolve
          form's and local preparation's `policyJudgment` (`rg/policy/frontline-command-schema.ts`,
          `rg/runtime/local-prepare.ts`), a hosted request's `ceilingOverride` and `additionalPassAuthorization`
          (`rg/hosted/request.ts`), and delivery's local review admission's `ceilingOverride`
          (`rg/policy/delivery-local-review-admission.ts`); a call relaying a judgment already recorded names that
          record (§ 5.2).
        - Each decision's basis is `null` (§ 5.1).
        - `passCount`, `exhaustedPassCount`, and `nextPass` keep completed-logical-pass units; only a standard ceiling
          override's eligibility reads the complete-coverage count. An incremental attempt cites no grant and does
          not consume one; its completed logical pass still participates in later ordinal-applicability checks.
        - The resolution reads the decisions within its reach (§ 5.6) at composition, before the pure functions run, as
          `applyCarriedOwnerAcceptedTerminus` (`rg/policy/pre-publication-request.ts`) injects today's carried terminus,
          and hands them to the places that read the override today: `withCeilingOverride`
          (`rg/policy/pre-publication-request.ts`), `resolveInvalidOverrideReason` (`rg/policy/review-policy-driver.ts`),
          `compatibleTerminalGrants` (`rg/policy/review-policy-evidence.ts`), and, for a lane judgment carrying no
          target, `bindJudgment` (`rg/policy/review-execution-admission.ts`).
        - Build `test-first` (one behavior at a time):
            - a standard-lane ceiling pass admits only the pass past the count it was decided at, at any later head of
              its Candidate, and not a re-root's successor
            - an additional pass reaches only the head it was decided on
            - a frontline ceiling pass reaches only the frontline head it was decided on
            - an Errand's and a delivery member's extra pass reaches only the target it was decided on, the target its
              call bound where the judgment carries none
            - a pass already used reads as spent
            - with completed logical count 2, complete-coverage count 1, and ceiling 1, an override binds 2 and admits
              logical pass 3; a grant using 1 refuses, and a failed attempt retries at 3 without spending another grant
            - an incremental pass cites no extra-pass decision and never treats complete count 1 as logical count 2
            - a call relaying a judgment already recorded names that decision and writes nothing

    - `[ ]` **6.2.b Termini**

        - The singleton terminus is written by every call carrying one — `arc review pre-publication --lanes` and its
          `--resume` replay (`handlers/review.ts`), whose compose reads its authority (`readOwnerTerminusAuthority`,
          `rg/policy/pre-publication-composition.ts`) — in one batch with the boundary `handleReviewPrePublication`
          persists where the call persists one, and alone where it persists none, as a call returning `run-self-review`
          or `continue` does; the member terminus is written by `resolveDeliveryReviewTerminusAcceptance`
          (`rg/policy/delivery-review-terminus.ts`) and `acceptDeliveryReviewTerminus` (`handlers/review.ts`) with the
          boundary naming it in one batch. Each decision's basis is the pass count its offer counted (`{ passCount }`),
          and the staged-terminus replay has no flip-time arm. A singleton terminus records no head, its subject the
          Candidate and the decided subject digest, as the import takes it (§ 5.1, 3.4). From the flip the member
          terminus's acceptance reports `recorded` with the next action `continue` and no `boundaryPath` (4.5.a).
        - The two write ports carry the decision's `put` into the boundary's batch: `persistBoundary`
          (`handlers/review.ts`) and the acceptance's `writeBoundary` (`rg/policy/delivery-review-terminus.ts`) widen to
          take it beside the boundary.
        - A call whose terminus decision is already stored reads it and leaves its `put` out of the batch, so a re-run
          or a `--resume` replay of the same answer does not refuse `version-conflict` over its own decision (§ 5.2).
          The acceptance's replay and conflict check (`resolveDeliveryReviewTerminusAcceptance`) resolve the decision
          the member's entry names, comparing its pass count with the offer's, and an exact replay returns its `record`
          composed from that decision in today's shape.
        - The resolution reads singleton termini within their reach (§ 5.6) at composition, as 6.2.a reads extra
          passes, so a terminus decided on a call that persisted no boundary, or imported from a resume token (3.4),
          reaches readiness; a boundary persisted later names that decision (§ 9.3).
        - From the flip the readers of a terminus resolve the name the boundary holds to its decision:
          `isDeliveryReviewMemberDischargedByOwnerTerminus` (`rg/status.ts`), status composition's terminus reads
          (`rg/status-composition.ts`), the checkpoint composition's (`scripts/integration/checkpoint-composition.ts`),
          and the pre-publication compose, which reads the boundary's terminus to carry it (`handlers/review.ts`).
        - The carry follows today's writers: `applyCarriedOwnerAcceptedTerminus` carries it only while the subject is
          unchanged; `recoverAttestedOwnerTerminusBoundary`, `rebindSingletonPublicationResponseBoundary`,
          `projectCorrectiveDeliveryStatusBoundary`, `recoverPublicationBoundary`, and `projectPublicationBoundary`
          (`rg/policy/integration-boundary-locus.ts`), `carryDeliveryReviewFixPublicBoundary`
          (`lib/delivery/review-fix.ts`), and `convergenceResumeAfterAttest` (`handlers/lifecycle-delivery-review.ts`)
          carry its name.
        - Build `test-first` (one behavior at a time):
            - an accepted terminus writes one decision, which the boundary names, in one batch
            - a terminus on a call returning `run-self-review` writes its decision alone, its resume reaches readiness
              with it, and the readiness boundary names it
            - a terminus decision the import mapped from a resume token reaches the resolution, and the next boundary
              names it
            - from the flip a member terminus's acceptance result reports `recorded` with `continue` and no
              `boundaryPath`, and in-repo `commit-boundary` with its path as today
            - the decision a singleton terminus writes keys as 3.4 maps the boundary it leaves, on a subject the
              Candidate record stores and on one it never stores, recognized as equivalent to its target
            - a second answer refuses where the live offer differs, or where the member carries a terminus with another
              pass count
            - from the flip re-running an accepted member terminus reports `exact-replay` with today's record, and a
              `--resume` replay carrying a stored singleton terminus writes the boundary alone, each writing no second
              decision and refusing nothing
            - a member terminus the boundary names discharges the member at status and at the checkpoint
            - an approved fix that advances the Candidate drops the name, and a non-semantic movement after publication
              keeps it

    - `[ ]` **6.2.c The resume token and the frontline resolve form**

        - From the flip `buildPrePublicationResumeCommand` and the replay encode and decode the token through the replay
          module's schema from the flip (3.5; `rg/policy/pre-publication-replay.ts`), which keeps the call's own inputs
          alone; today's `PrePublicationReplayInputSchema`, which 3.4 moves into that module, the judgments,
          `frontlineCeilingHeadSha`, and the scrubbers `consumeOwnerAcceptedTerminus` and
          `consumeFrontlineCeilingOverride` stay the in-repo arm. The frontline resolve form pre-publication emits
          (`rg/policy/pre-publication-procedure.ts`) keeps relaying the ceiling override as its `request`'s and
          `authorizationRequest`'s `policyJudgment`, which `arc review frontline resolve` reads as today
          (`resolveFrontlineSelection`, `frontlineConditionalAdmission`, `rg/policy/frontline-command.ts`); the judgment
          is already recorded, its conditional pass authorization's ID its `approved-fix` decision's key (§ 5.2), so the
          resolve call names that decision and writes nothing (6.2.a).
        - Build `test-first` (one behavior at a time):
            - from the flip a resume token carries no ceiling override, additional pass, or terminus, and its replay
              reaches the same resolution through the decisions
            - from the flip the frontline resolve form emitted over a frontline ceiling override citing a conditional
              pass authorization relays the `policyJudgment` with that ID, the recorded decision's key, and the resolve
              call it names admits the pass past the configured ceiling and writes no second decision
            - from the flip an attestation-ordering recovery carries the boundary's store version as its
              `expectedBoundaryVersion`, and its replay writes against that version

### `[ ]` **6.3 Reach a cited result through its stored outcome, and keep the reservation's carry — § 9.3, § 9.4**

- _Goal:_ From the flip `continue-pre-publication-review` still cites the result it responds to by
  `responseOperationId` and `responseSource`, opaque keys that match the stored outcome, through which
  `arc review respond` reaches that result with no published schema or workflow text changed; and the hosted
  reservation keeps its ID, its carry on the Candidate, and every check at use.

- _Note:_ Status renders the next action's command in 7.2, and `prepare-work-unit.md` reads both fields, as today.

    - `responseOperationId` is the cited attempt's ID (`reviewOperationId`, which `rg/policy/review-policy-attempt.ts`
      sets from its `attemptId`), which its outcome keeps, and `responseSource`'s durable part is that outcome's key, a
      hosted one's its acknowledged `attemptId`; the import resolves a stored boundary's durable part the same way
      (3.5). Respond reads the result by its attempt ID through the result reader, which from the flip composes it from
      the outcome, and checks the reference's other part as today (`resolveLocalSource`, `resolveFrontlineSource`,
      `resolveHostedSource`, `rg/runtime/respond-command.ts`).
    - The reservation keeps `createStandardReviewReservation`, the carry in `persistBoundary`
      (`preservesReservation`), and `assertHostedReservationBindingAuthority`'s checks.
    - Build `test-first` (one behavior at a time):
        - `arc review respond` reached through the next action responds to the cited outcome, for a result reviewed
          from the flip and for one the import mapped, an imported local result and the record composed for it both
          carrying the outcome's `sourceDigest` as `localSourceRef`
        - the next action parses under `ContinuePrePublicationActionSchema` unchanged
        - readiness recorded again for the same Candidate keeps the reservation, and a re-root drops it

### `[ ]` **6.4 Withdraw publication at reopen, and retire with the work item — § 10.1, § 10.2, § 10.4**

- _Goal:_ From the flip reopen rewrites the boundary, for the same Candidate, to `candidate-review-pending` naming
  `arc review pre-publication <slug>` with no reservation and the terminus names it carries, in its lifecycle batch, so
  a reopened work unit cannot publish until readiness is recorded again while an interrupted publish still finishes; a
  re-root removes no decision; and an archived work unit's Candidate leaves the live listings with no write of its own.

- _Note:_ The reference backend's test double has no history refs: it lists every saved record, with its meta's
  placement (`__tests__/helpers/store/read.ts`). Moving an ended item's records under `refs/arc/history/work/<uid>`
  (§ 10.4) is the ref backend's own conformance check.

    - `runStoreReopen` (`lib/work-unit/verbs/reopen-store.ts`) reads the boundary through the store for its expected
      version and adds its write to the transition's `additionalWrites`, as `projectCandidateReviewBoundary` writes it
      but keeping the terminus names; `recoverAttestedSingletonPublicationBoundary` takes only an Integrating work unit.
    - The reopen permit (`permitDeliveryReopen`, `handlers/lifecycle-delivery-review.ts`) reads the stored task list
      through delivery inspection's read (4.6.a).
    - Build `test-first` (one behavior at a time):
        - from the flip the reopen permit reads the stored task list with no task-list file in the checkout
        - a reopened work unit's publication refuses, and a no-change `arc attest` restores nothing
        - `arc review pre-publication` records readiness again for the same Candidate and mints the reservation it had
          before reopen, while the standard lane awaits its change request
        - a reopened Candidate whose standard lane closed by Owner terminus records readiness again with no new
          acceptance
        - with the change request kept as a draft (`--keep-pr`), readiness recorded again mints a reservation only
          where the standard lane still awaits its change request
        - an Integrating work unit with no boundary reopens writing none
        - a reopen whose boundary moved since it was read refuses and writes nothing, and its retry succeeds
        - a re-root after code changes keeps a recorded terminus and ceiling extra pass, neither binding the new Candidate
        - archive from the flip writes no review record, and a `review` listing filtered to live placements (`active`,
          `planned`, `provisional`) omits the archived Candidate

### `[ ]` **6.5 Retire the branch-riding mechanisms from the flip — § 14.3**

- _Goal:_ From the flip no delivery or review path stages a record, emits a `commit-*` next action, replays against
  `HEAD` or the index, proves a record commit moved the head, honors an advanced boundary only while the Candidate's
  head is the current root, or reads a record from history or a head tree; each mechanism keeps its in-repo arm behind
  one branch on `stateOffBranch`.

    - `[ ]` **6.5.a Write, then stage**

        - The `git add` sites in `handlers/lifecycle-delivery-review.ts`, `handlers/candidate.ts`,
          `rg/runtime/respond-composition.ts` (`appendCandidateResponse`, `stageCandidateResponse`),
          `rg/runtime/singleton-publication-response.ts`, `handlers/review.ts`'s Owner terminus, pre-publication
          boundary, and attestation-ordering recovery writes (`recoverAttestationOrdering`), and
          `handlers/delivery-execution.ts`'s four.

    - `[ ]` **6.5.b `commit-*` next actions and the keep-staged rule**

        - `commit-boundary` (`rg/policy/delivery-review-terminus.ts`, `handlers/review.ts`,
          `scripts/integration/checkpoint.ts`) and `commit-selection` (`rg/policy/review-applicability-resolution.ts`,
          `lib/work-unit/candidate-applicability-resolution.ts`, `handlers/candidate.ts`).
        - The keep-staged rule (`keep-staged-until-publication`), emitted by `handlers/review.ts` and
          `checkpointPostAttestContinuation` (`scripts/integration/checkpoint.ts`), with the diff base that tolerates it
          (`resolvePrePublicationDiffBase`, `rg/policy/pre-publication-composition.ts`).

    - `[ ]` **6.5.c Replays against `HEAD` or the index**

        - The staged-terminus recovery in `handlers/review.ts`, the boundary checks in
          `scripts/integration/checkpoint-composition.ts`, and `candidate-response-confirmation.ts`'s
          `HEAD == approvedHead` check and committed-record comparison.

    - `[ ]` **6.5.d Proofs that a record commit moved the head**

        - `confirmCandidateResponseHeadContinuation`'s proof that a record commit followed the fix
          (`rg/runtime/candidate-response-head-continuation.ts`). The port threaded for it stays —
          `rg/core/response-head-continuation.ts`, `rg/hosted-response-completion.ts`, `rg/lane-progress.ts`,
          `rg/lane-progress-conditional.ts`, `rg/lane-progress-hosted-request.ts`,
          `rg/lane-progress-hosted-settlement.ts`, `rg/policy/frontline-command.ts`, `rg/runtime/local-prepare.ts`,
          `rg/runtime/local-prepare-composition.ts`, `rg/runtime/respond-composition.ts`, and `handlers/review.ts` — and
          from the flip proves only that a head is a direct successor of the produced head whose only change is the work
          unit's export path (§ 5.6).
        - The export folder becomes a layout address (`ArcLayoutAddressSchema`, `lib/layout/schema.ts`; `resolveArcPath`,
          `lib/layout/projection.ts`) resolving to `.arc/specs/<slug>`, with no trailing separator, which
          `validateManagedPath` refuses as an empty segment, the copy being `spec-<slug>.md` inside it; the proof reads
          it, as 7.3.a's arm and 7.3.b's export do. It names no work-unit state, so the `work-unit-paths` ratchet does not
          count it (§ 12.5).
        - `projectGitDeliveryTerminalRecordAdvance` (`lib/delivery/public-review-continuation-git.ts`) and the
          owner-terminus advances it proves (`ownerTerminusAdvances`) in `rg/status-composition.ts` and
          `scripts/integration/checkpoint-composition.ts`; and the two arms of
          `projectGitDeliveryTerminalCoordinateAdvance` (same module) that call it — the state advance from the prior
          head and the immediate parent's advance — at its three consumers, `lib/delivery/repository-entry.ts`,
          `rg/status-composition.ts`, and `scripts/integration/checkpoint-composition.ts`, its subject-equality and
          machine-proof arms staying.
        - `gitCandidateRecordAtHead` and `recordsOwnSelection` with their consumers
          (`rg/policy/earlier-review-applicability.ts`, `rg/policy/local-review-coverage-selection.ts`).
        - Build `test-first` (one behavior at a time), a scripted commit changing only the export path standing in for
          7.3.b's export:
            - the export folder's address resolves to `.arc/specs/<slug>`, and the copy's path under it to
              `.arc/specs/<slug>/spec-<slug>.md`
            - from the flip a fix that amends the stored spec admits its `approved-fix` pass at the head of the copy's
              commit that follows it, and a successor changing any other path admits nothing
            - from the flip a hosted fix that amends the stored spec settles at the head of the copy's commit
            - from the flip delivery entry, status, and the checkpoint compute no record-commit advance, the coordinate
              advance's included, and consult no `recordsOwnSelection`

    - `[ ]` **6.5.e Subject protection and record reads from history**

        - `handlers/review.ts` honoring an advanced boundary only while the Candidate's head is the current root; the
          shipped-delivery boundary replay in `scripts/integration/checkpoint-composition.ts`; and
          `readGitDeliveryLifecycleArtifactsAtRef`. `candidateProjectionPaths` (`lib/work-unit/git-candidate-subject.ts`)
          keeps the Candidate and boundary paths neutral from the flip too, since a live work unit's committed files stay
          on its branch (§ 10.3, § 14.3).
        - Delivery's whole record-effect settlement retires from the flip (§ 14.3): its capture, its reconstruction of
          the Candidate and boundary at Git revisions (`reconstructExpectedRecordEffects`,
          `handlers/delivery-execution.ts`; `reconstructDeliveryReviewFixExpectedRecords`), and its record commit and
          push (`settleDeliveryReviewFixRecordEffects`, `lib/delivery/review-fix-record-effects.ts`). From the flip its
          acknowledged result carries no `candidate.recordPath`, `boundaryCarry.path`, or `recordEffects`, and its
          driver reads none (4.5.a).

    - Build `test-first` (one behavior at a time):
        - over the reference backend, a work unit's attest, review, response, terminus, and publication make no
          record-only commit and emit no `commit-*` next action
        - from the flip, delivery's review fix carries its boundary through the store and makes no record-effect commit,
          its acknowledged result naming no record path or record effect
        - from the flip a work unit whose branch carries its committed Candidate and boundary files computes the subject
          digest its imported Candidate holds
        - every in-repo arm passes today's tests unchanged

### `[ ]` **6.6 The Candidate and its boundary** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

## **Phase 7:** Delivery and integration at the flip

_Purpose:_ Give merge, status's boundary read, readiness, and the review copy their arms from the flip, retry an ended
item's reads and writes through every store this change opens, and read the subject's Candidate and boundary through the
store.

_Mode:_ `slice` — closes on a work unit checkpointed and merged from the flip with its design exported.

_Exit criterion:_ Over the reference backend, adding, re-exporting, and deleting the review copy leave the review
subject unchanged; a landed merge writes the landing-commit link naming the project ID; status reports a work unit's
boundary wherever it is checked out; and under either archive cadence the merge lock releases for a work unit whose meta
is a stored record, its branch adopted under another name included, and refuses `readiness-failed` where its position,
branch link, notes facts, or change-request link fails; and a read or write of an ended item meeting
`state-unresolvable` pulls the named history refs and retries once, through any store this change opens; and the subject
reads a work unit's Candidate and boundary from the store with neither file in the checkout.

_Design decisions:_ Edits to `handlers/status/lifecycle.ts` build on the shipped locus changes (§ 14.4). The ended-item
retry (7.5) and the subject's store read (7.6) remain last; only the first needs a future provider landing, the ref
backend's `state-unresolvable` refusal and `pull({ history })` on base. The subject's store and Candidate-reader
prerequisites have landed, and every earlier task is independent of the remaining ref-backend wait (§ 14.4).

### `[ ]` **7.1 Read the checkpoint's lifecycle through the store, and write the landing-commit link — § 12.3, § 12.4**

- _Goal:_ From the flip the checkpoint and merge read the work unit's current meta record through the store — its
  position from placement and lifecycle state, its artifact facts from the stored meta — and a landed merge writes the
  landing-commit link naming the project ID and the merge commit, a rerun writing it where the first write failed.

    - `[ ]` **7.1.a The lifecycle read**

        - `readLifecycleSummary` (`scripts/integration/checkpoint-composition.ts`) and `readStatus`
          (`scripts/integration/merge-composition.ts`) read the meta through `readWorkUnit` (`lib/store/lifecycle-write.ts`),
          merge comparing the meta record's version with the one the checkpoint bound.
        - A `not-found` refusal reads as the lifecycle state `nonexistent`, as a missing meta does today; a
          `record-malformed` one, an Errand's slug among them, becomes an artifact fact naming its condition; any other
          refusal throws with its condition and remedy. `storageVersion` stays the lifecycle snapshot's whole version,
          which the callers pass in (2.1.a).
        - _Note:_ `readWorkUnit` resolves by `lookup`, which reaches an archived item under the ref backend, where a live
          listing would not (§ 10.4); the reference backend's test double lists every record, so it cannot tell them apart.
        - Build `test-first` (one behavior at a time):
            - with a projected meta file that differs from the stored meta, the checkpoint reads the position and
              artifact facts from the stored meta
            - a store reporting the meta `not-found` reads as `nonexistent`, a malformed one as an artifact fact, and
              any other refusal throws naming its condition

    - `[ ]` **7.1.b The landing-commit link**

        - `scripts/integration/merge.ts` writes `landingCommit` (`lib/store/links.ts`), its repository the project ID
          read once per invocation through the project-ID port (`projectId`), wired into merge's composition
          (`scripts/integration/merge-composition.ts`); in-repo nothing is written.
        - The link names the merge commit the host reports (`providerMergeId`). Where merge finds the pull request
          already merged, `readMerged` returns one of three states in place of today's boolean — not merged, merged with
          the host's merge commit, or merged with none reported — at both its calls, before the merge and in the failure
          path's recovery, and each merged arm writes the link as a fresh merge does. The link joins the work item's
          other links in one whole-value write (`LinksSchema`) against the version read. Where the host reports no merge
          commit (`providerMergeId` `null`), merge writes no link and reports the landing-link state not written, naming
          the rerun.
        - `IntegrationMergeResultSchema`'s `merged` arm (`scripts/integration/merge.ts`) admits a landing-link state —
          written, or not written with the rerun's remedy — a pre-flip widening (§ 3.5) under which every result
          emitted before the flip parses as it did.
        - Build `test-first` (one behavior at a time):
            - a landed merge writes one landing-commit link naming the project ID and the merge commit, keeping the work
              item's other links
            - a rerun after the pull request merged writes the link from the host's merge commit, and one whose host
              reports the pull request merged with no merge commit writes none and reports it not written
            - a merge that fails and then finds the pull request merged writes the link from the host's merge commit
            - a merge whose host reports no merge commit writes no link and reports it not written with the rerun's
              remedy
            - a link write that fails after the merge lands reports the merge landed, its landing-link state not written,
              and names the rerun, which writes it
            - in-repo the `merged` result parses as today and carries no landing-link state

### `[ ]` **7.2 Read status's boundary through the store from the flip — § 9.3, § 12.4**

- _Goal:_ From the flip `arc status <slug>` reads an active or integrating work unit's boundary through the store
  wherever it is checked out, rendering its next action's command as today.

    - The lifecycle change's store arm (`handleStoreLifecycleStatus`, `handlers/status/lifecycle.ts`), which reports
      `integrationBoundary: null` today, reads the boundary through the store from the flip and reports it and its next
      action as recorded, with no currentness projection, rendering the stored next action's `command` as today
      (`handlers/status/lifecycle.ts`); `resolveSlugOperationalBoundary` stays the in-repo arm, the
      interrupted-publication hint with it, since from the flip an Integrating work unit at `publication-pending` has
      finished publishing (§ 12.4).
    - Build `test-first` (one behavior at a time):
        - status reports an Integrating work unit's `publication-pending` boundary with its push as the next action, for
          a work unit checked out elsewhere or nowhere
        - status reports an Active work unit's boundary, and none for a Planning one
        - status renders a version 2 boundary's stored next-action command as it renders today's, the next action
          parsing under `ContinuePrePublicationActionSchema` unchanged and `arc status`'s boundary schema admitting
          version 2 (4.5.a)

### `[ ]` **7.3 Build D18's export and its evidence-neutral arm — § 12.5**

- _Goal:_ From the flip one export writes and stages the work unit's spec as `.arc/specs/<slug>/spec-<slug>.md` at
  attest and re-exports it when a review fix amends the stored spec, `storage.track_design_docs` turning it off, while
  the export path stays evidence-neutral so adding, re-exporting, and deleting the copy leave the review subject
  unchanged.

    - `[ ]` **7.3.a The evidence-neutral arm**

        - `classifyPathTreatment` (`lib/evidence-applicability/path-treatment.ts`) gains the export path's arm,
          classifying by path alone, through 6.5.d's layout address, the export folder of the work unit its context
          names (`workUnit`), so every caller sees its own work unit's copy as evidence-neutral and another work unit's
          as reviewable, and a context naming no work unit, as Errand status's does (`rg/status-errand.ts`), classifies
          no export path; delivery's lifecycle-contribution path group gains nothing.
        - Build `test-first` (one behavior at a time):
            - adding, re-exporting, and deleting the copy leave the Candidate's subject digest unchanged
            - another work unit's copy classifies as reviewable, and a context naming no work unit classifies no copy
              as evidence-neutral

    - `[ ]` **7.3.b The option and the export**

        - `storage.track_design_docs: none | specs`, default `specs`, in `lib/config/schema.ts`, a pre-flip addition
          (§ 3.5) joining the lists kept by hand that name every option, among them `VALIDATION_DOMAIN_ORDER`
          (`commands/config/validate.ts`), the shipped `arc-config.yml` (`packages/arc-framework/arc/system/`),
          `__tests__/unit/config/schema.test.ts`, and the rendered validation lines the configuration tests keep
          (`EMPTY_CONFIG_VALIDATION_PASS_LINES`, `__tests__/fixtures/config/cases.ts`), and every complete settings
          object a test builds (`ConfigSettingsSchema`), which type checking finds. One export function in a new module
          writes and stages the copy, `spec-<slug>.md`, in the folder at 6.5.d's layout address.
        - `arc attest` calls it inside its publish step, just before writing the Candidate record
          (`writeCandidateRecord`, `handlers/lifecycle-delivery-review.ts`), after every refusal `runAttest` and the
          renewal checks make; the subject `handleAttest` collected earlier may omit the copy, which 7.3.a makes
          evidence-neutral.
        - `arc review respond` calls it for a Candidate's response alone, right after its single `performance` write for
          a performed fix (`recordPerformedResponse`, `rg/runtime/respond-command.ts`; 5.3.b) on both its paths
          (`persistCandidateResponse`, `replayCandidateResponse`), outside every check 6.5.c and 6.5.d retire, comparing
          the stored spec with the copy and re-exporting on a difference, so a replay after a completed export writes
          nothing, the copy riding the commit that follows. An Errand's and a delivery member's responses export nothing
          (§ 12.5).
        - Build `test-first` (one behavior at a time):
            - attest from the flip writes the copy before writing the Candidate record, a refused attest writes none,
              and the attested Candidate's subject digest is the one it would be without the copy
            - a performed fix's response re-exports a stored spec that differs from the copy, overwriting a hand-edited
              copy and reporting that it did, and re-exports nothing where they match, a replayed response included
            - an Errand's and a delivery member's performed responses export nothing
            - `none` exports nothing, and in-repo nothing is exported
            - the option parses with its default, and `arc config validate` reports it

### `[ ]` **7.4 Read readiness through the store for the merge lock — § 12.7**

- _Goal:_ From the flip both composition roots give `evaluateReviewReadiness` the store, and readiness reads the work
  unit's position, branch link, notes facts, other metas' diagnostics, cohort placement, and change-request link through
  it, refusing as today.

    - Roots: merge's lock port (`scripts/integration/merge-composition.ts`) and `readinessBoundTo`
      (`handlers/review.ts`); readiness's reads in `rg/readiness.ts` (`evaluateManualWorkUnit`,
      `evaluateArchivedWorkUnit`, `lifecycleArtifactFacts`, `lifecycleCandidateFacts`, `cohortCloseoutFacts`).
    - `ReviewReadinessDependencies` takes the store as optional: both work-unit roots pass it, and the work-unit arms
      read through it from the flip, an archived work unit's current records included; the
      Errand's caller (`scripts/integration/errand-merge-composition.ts`) and the delivery member's
      (`handlers/delivery-execution.ts`) read no lifecycle state and pass none.
    - The cleared-branch and completion-date facts retire from the flip; the pull-request fact reads the change-request
      link, passing where none exists; the cohort facts read the stored cohort document for the cohort and, for a
      subcohort, its parent (`cohortCoordinateFacts`): `missing-cohort-coordination` where an open member or subcohort
      remains and no document resolves, and once none remains, `incomplete-cohort-closeout` where the document is still
      placed planned, `missing-cohort-closeout` where none resolves, and `malformed-cohort-closeout` where its Closeout
      section fails `validCohortCloseout`.
    - Each diagnostic a store listing carries (`ListingDiagnosticSchema`, `lib/store/read.ts`) becomes a
      `malformed-artifact` fact, its path the diagnostic's `key` and its message its `condition`, where today the
      lifecycle index's own diagnostics become facts.
    - A listing readiness cannot read whole — `unreadable`, or `complete` with `missed: true` (`ListingOutcomeSchema`,
      `lib/store/read.ts`) — refuses as an `unreadable-artifact` fact naming its condition, as readiness reports an
      artifact it cannot read today, so an incomplete listing never passes as a clean one.
    - From the flip a work unit's head-branch check compares the pull request's head branch with its work-branch link
      (`selectWorkBranchLink`, `lib/store/lifecycle-branch.ts`) in place of parsing a slug from the branch's name
      (`branchToWorkUnitSlug`, as `rg/readiness.ts` calls it), refusing `vehicle-branch-mismatch` where they differ; an
      Errand keeps today's check.
    - Build `test-first` (one behavior at a time):
        - both roots give readiness the store, so `arc integrate merge` and `arc merge lock release` read the stored meta
        - under the manual cadence, readiness passes for an Integrating work unit whose branch link names the head
          branch, and refuses where the position, branch link, or notes facts fail
        - under `with-integration`, an archived work unit passes with no change-request link and refuses
          `pr-url-mismatch` where the link names another pull request
        - an archived work unit refuses naming a diagnostic the lifecycle listing carries, as a `malformed-artifact` fact
          whose path is the diagnostic's key and whose message is its condition
        - an unreadable lifecycle listing, and one that missed entries, refuse as an `unreadable-artifact` fact
        - a cohort whose final member archived reads `completed` with a well-formed Closeout section and passes, and one
          still planned with no open holding refuses `incomplete-cohort-closeout`
        - a cohort with an open member and no stored document refuses `missing-cohort-coordination`, and with none open
          and no stored document refuses `missing-cohort-closeout`
        - a completed cohort document whose Closeout section is malformed refuses `malformed-cohort-closeout`
        - a subcohort's parent is checked the same way, a malformed parent closeout refusing
        - a work unit whose branch was adopted under a name that parses as no slug passes where the head branch is its
          linked branch, and a pull request whose head branch is not the work unit's linked branch refuses
          `vehicle-branch-mismatch`
        - an Errand's and a delivery member's readiness are unchanged

### `[ ]` **7.5 Retry an ended item's reads and writes through every store this change opens — § 10.4**

- _Goal:_ From the flip a read or write of an ended item that meets the ref backend's `state-unresolvable` refusal,
  naming history refs this clone lacks, pulls them by name and retries once with no stop, through every store this
  change opens.

    - Every store this change opens goes through one wrapper: each root's — 4.1.b's, session-init's projection's
      (4.6.b), delivery entry inspection's (4.6.c), and `readinessBoundTo`'s (`handlers/review.ts`), which opens one
      from 7.4 — and the one the typed access opens where its caller passes none (2.3.b). Attest's handler
      (`handleAttest`) wraps the store it opens for its own reads and writes, leaving the lifecycle verbs' shared opener
      (`openDefaultStore`, `handlers/lifecycle-shared.ts`) unwrapped, so no other verb gains the retry. A read or write
      meeting `state-unresolvable` pulls the named refs (`pull({ history })`) and retries once; a second refusal refuses
      with it, and any other refusal passes through. Attest `--new-root` on a Shipped work unit (4.6.a) and the review
      writes after it, the Candidate history read of an ended item (4.8), the landing-commit link's write (7.1), and an
      applicability selection on an archived work unit (`handlers/candidate.ts`) reach it. The checkpoint's and merge's
      lifecycle reads (7.1) and readiness (7.4) read an archived item's current records, which the ref backend serves
      from its archive refs, so they need no history ref (§ 10.4).
    - This change builds the wrapper, since the ref backend's contract leaves every caller's retry to its verb. It
      alone needs the refusal and the pull on base: where they have not landed when this task is reached, the task loop
      stops here, as at any blocking dependency, for a base merge that brings them.
    - Build `test-first` (one behavior at a time):
        - a read and a write refusing `state-unresolvable` pull the named refs and succeed on the retry
        - a second refusal after the pull refuses with it, and any other refusal passes through unretried
        - over a store that refuses once, attest `--new-root` on a Shipped work unit and a review write after it, the
          Candidate history read of an ended item, merge's landing-link write under `archive.cadence: with-integration`,
          and `arc candidate applicability resolve` on an archived work unit, through the typed access's own store, each
          pull and succeed with no stop

### `[ ]` **7.6 Read the subject's Candidate and boundary through the store from the flip — § 12.1, § 14.4**

- _Goal:_ From the flip the subject (`projectCheckoutSubjectMeta`, `lib/locus/subject-meta.ts`) takes its Candidate
  authority from the Candidate record's `attestation.candidateId` and reads that record's content and the boundary
  through the store, so a work unit checked out elsewhere keeps its subject with neither file in that checkout.

    - The shipped projection takes the store (its `store` option) and reads the Candidate record
      through it where that store reports `stateOffBranch` (`readStoreSubjectCandidate`,
      `lib/locus/subject-meta-candidate.ts`), gated on the meta's `Candidate`. This task gates that read, and the
      Candidate authority the projection requires of an Integrating or a preparing work unit, on the record's
      `attestation.candidateId` in place of the meta's `Candidate`, and reads the boundary through the typed access over
      the same store (2.3.b), where the projection reads its file (`readSubmissionBoundary`). Its store prerequisite
      has landed; only 7.5 retains the ref-backend availability wait.
    - The shipped subject already takes its branch from the link (§ 12.1), so the test seeds that link. Exercise
      `runDerivedLocusStateProbe`'s production callbacks with the same store and exact selected owner: delivery
      correction reads its stored task list and review records (4.6.a), and pending-fix authority reads its outcomes
      and evidence (5.6.b), with no second store or off-branch fallback to legacy files.
    - Build `test-first` (one behavior at a time):
        - from the flip the subject's authority names the Candidate the record holds, with no `Candidate` in the meta
        - from the flip the subject reads the Candidate and its boundary from the store with neither file in the
          checkout
        - given no store, or one not reporting `stateOffBranch`, the subject reads both files through its injected IO
          as today
        - through the production probe, an Integrating subject projects delivery correction with no materialized
          task-list, Candidate, or boundary file; an Active changed target resolves pending-fix authority from its
          stored outcome and evidence with no legacy disposition record, using the exact selected owner in each case

### `[ ]` **7.7 Delivery and integration at the flip** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Each of the six review kinds registers a parser, and each but `review/candidate` a write check; every write-check
  rule § 4–9 names has unit cases refusing its breaking write and admitting its valid counterpart; and `review/terminus`
  appears in neither `KIND_SHAPES` nor `KIND_MECHANISMS`.

- `[ ]` The review gate's and delivery's existing tests pass over the in-repo implementation with no assertion changed
  but in the tests pinning what the checkpoint's binding, the recording verb's registration, the widened published
  schemas, the contracts admitting a retired mechanism's fields, the review error code, merge's landing-link state,
  `storage.track_design_docs`, and the export path's classification change (spec, A3–A5), a stub of a rerouted caller's
  store module moving only to the module that caller now imports, or stubbing the typed access where the caller's test
  runs outside a repository, as the deferred-module specifiers `cli-loading-boundary.test.ts` lists move and
  `store-registered-reads.test.ts`'s mock moves to the narrower registration module.

- `[ ]` No production module outside `lib/store/` imports the Candidate or boundary store.

- `[ ]` `arc review adversarial record` refuses its write `unsupported` before the flip.

- `[ ]` No import-ratchet floor (`store-raw-state`, `surface-names`, `work-unit-paths`) grows, in total or per file,
  from the final merged base.

- `[ ]` Over a store whose record versions move independently, merge refuses when the work unit's meta record or the
  code head moved since the checkpoint, and passes when only an unrelated record did.

- `[ ]` Run over this repository's review records, the mapping's listing accounts for every source exactly once, as
  mapped with its records, left behind with its reason, or in flight; every record it returns parses and passes its
  kind's write check; a fixture holding a `pending` attempt lists its file as in flight; and each live work unit's
  supersession chain through the mapped Candidate records equals `readRepositoryCandidateSupersessionChain`'s.

- `[ ]` A diagnostic run of the mapping over this repository's review records, every work item marked live, maps every
  attempt, disposition set, authorization, and skip marker to records that parse and pass their write checks, gives each
  supplied Candidate whose versions all map the supersession chain `readRepositoryCandidateSupersessionChain` gives, and
  leaves behind only for the reasons § 11.2 names.

- `[ ]` From the flip, a work unit's delivery makes no record-only commit and emits no `commit-*` next action.

- `[ ]` From the flip, a re-root after code changes keeps a recorded terminus.

- `[ ]` From the flip, a work unit attested publishes with no `Candidate` in its meta; a reopened work unit's
  publication refuses, a no-change `arc attest` restoring nothing, until `arc review pre-publication` records readiness
  again for the same Candidate, minting, while the standard lane still awaits its change request, the hosted reservation
  it had before reopen; and an interrupted publish still finishes.

- `[ ]` From the flip, an archived work unit leaves no Candidate in the live listings.

- `[ ]` From the flip, publication refuses when the standard lane's outcomes, evidence, `approved-fix` decisions or
  their withdrawals, or in-flight attempts changed after readiness, and when that listing is incomplete.

- `[ ]` From the flip, every decision a review subject carries outside the Candidate's own selections is a
  `review/decision` record.

- `[ ]` Adding, re-exporting, and deleting the review copy leave the review subject unchanged.

- `[ ]` From the flip, a landed merge writes the landing-commit link naming the project ID.

- `[ ]` From the flip, `arc attest` on a paused work unit refuses naming `arc resume <slug>` and succeeds after
  `arc resume`.

- `[ ]` A clone whose `review-gate/operations/` holds records of today's shapes still reads its review state from the
  flip.

- `[ ]` From the flip, `arc review adversarial record` writes one `review/adversarial-pass` record per call and refuses
  malformed input naming the expected shape.

- `[ ]` From the flip, an Errand's frontline skip is kept as a lane-skip decision and closes its frontline window.

- `[ ]` From the flip, two clones' outcomes for one target carry the project ID as their repository identity, and review
  on a clone holding no project ID refuses naming the port's remedy and succeeds once the clone holds it.

- `[ ]` Under either archive cadence, `arc integrate merge` and `arc merge lock release` release the merge lock for a
  work unit whose meta is a stored record, an archived one whose pull request has no change-request link included, and
  refuse `readiness-failed` where its position, branch link, notes facts, or change-request link fails.

- `[ ]` All quality gates pass (tests, linting, type checking).

- `[ ]` Ready for integration.

- `[ ]` Complete logical pass 1 followed by incremental logical pass 2, including across Candidate supersession,
  yields completed logical count 2, standard ceiling count 1, and next logical pass 3. Extra-pass decisions, keys,
  import, replay, consumption, and retry keep logical ordinals; incremental attempts cite no grant (spec, A6).

- `[ ]` Optional fix tags survive approval, import, composed reads, replay, and earlier-round reporting outside
  disposition and approval identity. Present tags cover exactly the `fix` findings, absence stays absent, and every
  advance and successor preserves the predecessor's stored tags (spec, A6).

- `[ ]` The production locus entry points resolve active and completed Candidate owners over the supplied store and
  exact marker/topology evidence with no meta file or owner stand-in, and hosted-Errand discovery succeeds with no
  identity-ref copy of its stored records (spec, A6).

- `[ ]` Through the production probe, an Integrating subject projects delivery correction without materialized
  task-list, Candidate, or boundary files, and an Active changed target projects pending-fix authority from stored
  outcomes and evidence without legacy disposition records. Both use the exact selected owner and invocation store,
  opening no default store for the subject's checkout (spec, A6).

- `[ ]` Imported and newly written frontline outcomes retain the original canonical `sourceBindingId` without
  executable paths or arguments. Result reads, disposition matching, and pending-fix authority use that digest, so an
  existing approved set still matches after redaction, including a command source with a Candidate/member response
  binding and an import with no run record (spec, A7).
