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

    - _Amended in:_ 6.2.R (A16)

    - `[x]` **1.3.a The envelope, its parser, and its key**

        - Added strict decision envelopes, an issue-bearing JSON codec, and time-independent content keys. Termini
          carry their counted basis; approved-fix decisions retain the original producer and logical ordinal and reuse
          the production authorization key. Historical attribution stays nullable except for the required authorizer.

    - `[x]` **1.3.b The write check**

        - The registered check binds content keys and approved-fix grants to stored finished producers. Withdrawals
          require an existing decision on the same work item, the original approved-fix authorizer, and no outcome
          citing that grant. Related listings must be complete and parseable; in-flight and successor timing remain
          with the withdrawing verb.

### `[x]` **1.4 Build `review/evidence` and its succession rules — § 6.2, § 6.3, § 6.5**

- _Goal:_ An evidence record holds one approved response under its disposition set, naming its result by outcome key and
  its predecessor and successor sets; its parser holds the set and settlement rules a record settles alone, and its
  write check admits a record created whole and only today's in-place advances after: a performance once, the successor
  mark in its successor's batch, the policy projection's one correction, the Candidate response's binding once, and
  append-only settlement.

    - `[x]` **1.4.a The schema and its parser**

        - Added strict approved-response envelopes with all five ownership shapes, optional advisory tags, atomic
          performance, and hosted settlement. Canonical approval, transition, policy-projection, and settlement checks
          share existing constructors and the extracted per-set validator. Producer-dependent checks remain in 1.4.R.

        - _Amended in:_ 1.R (A10)

    - `[x]` **1.4.R Ground producer-dependent evidence rules in the outcome**

        - _Goal:_ Rules requiring the result's source kind or original lineage read the referenced outcome through the
          write check, preserving the existing performance invariants without treating response ownership as producer
          lineage (§ 2.5, A8).
        - Outcome-backed checks bind the exact producer, approved context, findings, original fix head, and host
          coordinates. Candidate response digests require original Candidate lineage. Missing or unreadable outcomes
          refuse with diagnostics; an unperformed frontline member binding remains readable. Settlement and admission
          share one pure comparison of approved sets with outcomes.

    - `[x]` **1.4.b The write check**

        - Registered evidence admission binds keys and sealed findings, requires complete response histories, and
          preserves reciprocal linear succession in one batch. Updates permit only the exact monotonic performance,
          Candidate digest, policy-projection, and current-set settlement advances; tags and ownership remain fixed.
          Carried receipts retain their predecessor's exact facts, and whole imported histories may arrive performed
          and settled.

### `[x]` **1.5 Build `review/adversarial-pass` — § 7.1, § 7.3, § 7.4**

- _Goal:_ An adversarial-pass record holds a typed header and the evaluator's report as prose under the store's `pass`
  key; its parser validates the header, its artifacts as its activity gives them, and refuses two dispositions for one
  finding, and its write check refuses a key naming another activity.

- _Outcome:_ Added strict activity-specific headers, opaque artifact versions, reviewed code heads, and issue-bearing
  JSON decoding. Finding dispositions are unique; reports and accounts remain prose. The activity-key check keeps
  global stored-pass numbering separate from the loop's ordinal, and recorded approvals grant no next-pass permission.

### `[x]` **1.6 Build the Candidate and boundary kinds, and the readiness digest — § 8, § 9.1, § 9.2, § 9.5**

- _Goal:_ The Candidate kind's parser validates today's managed record whole and recomputes its IDs; the boundary kind's
  parser admits `schemaVersion` 1 as today's parse reads it and 2, its write check refusing version 1; and one pure
  digest over a standard-lane listing gives the binding readiness records and publication recomputes.

    - `[x]` **1.6.a The Candidate kind**

        - Added the Candidate kind's public schema, issue-bearing JSON codec, and registration over the existing whole
          managed-record schema. Canonical Candidate and response identities, running-target continuity, evidence
          freshness, and exact review-selection uniqueness remain enforced. The public versioned read shape accepts
          opaque backend versions; registration needs no write check.

    - `[x]` **1.6.b The boundary's two versions**

        - Extracted shared action, reservation, Candidate identity, and member-vehicle validation while retaining
          version one's projections and legacy normalization. Version two has named decisions, explicit readiness
          bindings at publication loci, merge verification, and post-attest continuations without projection
          dispositions. Both schemas initialize independently; the public codec dispatches by version and exposes the
          opaque versioned read shape. The canonical caller inventory includes both extracted modules.

    - `[x]` **1.6.c The boundary's write check**

        - Added current-format write admission and registration. Retained version-one boundaries remain readable;
          writes refuse with a version-two regeneration remedy, and version-two writes are admitted.

    - `[x]` **1.6.d The readiness binding's digest**

        - Added the pure canonical selector for standard-lane outcomes, responding evidence, approved-fix grants and
          withdrawals, and pending attempts. Backend versions and byte formatting do not affect the binding; incomplete
          listings yield no digest. Stored outcomes suppress pending leftovers, including re-keyed hosted admissions.

### `[x]` **1.7 Register the six kinds — § 2.5**

- _Goal:_ `PRODUCTION_REGISTRATIONS` installs each review kind's parser, and each but the Candidate's write check, so
  every backend built on it parses and checks through them, while the in-repo implementation, built on a list that
  imports no review registration, reads today's Candidate and boundary records with their keys and own-key check as
  today.

- _Outcome:_ Registered all six review codecs and five write checks in the complete production list, with public
  schemas and derivations and private registration imports. The in-repo list preserves deferred decoding, own-key
  refusals, and existing writer bytes. Production-backed batch tests exercise reciprocal succession and atomic refusal
  of a second successor.

### `[x]` **1.8 Take the planned locus change's landing, and re-ground the tasks built on it — § 12.1, § 12.4, § 14.4**

- _Goal:_ Phase 2 starts on a base carrying the planned locus change, with every task that names that change's code
  grounded in what landed rather than in its plan.

- _Outcome:_ Confirmed the shipped locus landing and re-grounded every named consumer against the merged source.
  A6 remains current: preserve store-aware Candidate ownership, store-only Errand discovery, marker claim identities,
  checkout-occupancy resolution, and lazy status imports. The subject's remaining Candidate-bullet and boundary reads,
  status's absent stored boundary, and both nested probe callbacks remain assigned to their existing tasks.

### `[x]` **1.R Preserve no-fix settlement performance headers — § 6.2, § 6.5**

**Additional Context:** `notes-seam-delivery-review.md` § A10.

- _Goal:_ Evidence retains recorded no-fix settlement headers without inventing fix transitions, while performed Errand
  and member fixes still require their complete authorized response (A10).

- _Outcome:_ Evidence ownership validation distinguishes recorded settlement headers from complete fix transitions.
  Errand and member fixes still require their authorized response, while no-fix sets refuse either response object.
  Native settlement import retains the exact header and settled reading; the captured repository scenario admits the
  four historical headers through production parsers and write checks without inventing transition facts.

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

### `[x]` **2.1 Bind the integration checkpoint to the meta record and the code head — § 3.2**

- _Goal:_ The checkpoint records the version of the work unit's meta record it attested, read as of the lifecycle
  snapshot's state version, beside the approved head, and merge compares those, so a write to any other record between
  checkpoint and merge no longer stales it, and a checkpoint written before the change invalidates as `head-mismatch`.

    - `[x]` **2.1.a The snapshot gives the meta record's version, and the checkpoint records it**

        - Added the snapshot's meta-version lookup over its listed records. Checkpoint persistence retains the exact
          record binding beside the published namespace version, including interleaved lifecycle reads. Missing
          acquisition requires re-reading the lifecycle snapshot before retrying; injected ports and fixtures carry it.

    - `[x]` **2.1.b Merge compares the meta record's version and the code head**

        - Merge composition selects the snapshot's meta version, including absence; the existing comparison retains
          code-head checks and invalidates old HEAD-bound checkpoints with the re-checkpoint remedy. Reference-store
          cases cover selected-meta movement, unrelated writes, and retry; in-repo fixtures use record versions.

### `[x]` **2.2 Read a review record's placement from the reading checkout's own tree — § 3.1**

- _Goal:_ Wherever today's store read returns a Candidate or boundary record, the store's in-repo read returns it too:
  its placement comes from the reading checkout's flat-active meta, then the tree's other lifecycle tiers, before any
  composed selection that could refuse `store.lifecycle-incomplete`.

- _Outcome:_ Review reads select flat-active metadata, then held-tree metadata, before composed lifecycle. A held
  owner's placement survives access-denied diagnostics from another tier and foreign-branch acquisition failure;
  missing review bytes still return not-found before placement, and saved-tree reads retain their revision.

### `[x]` **2.3 Move the paths, the typed access, and the Candidate history read to `lib/store/kinds/review/` — § 3.1**

- _Goal:_ Callers find the Candidate's and boundary's paths, their typed reads and writes, and the Candidate's history
  in `lib/store/kinds/review/`, the paths resolved through the layout's addresses, the reads and writes through the
  checkout's store with today's names and parameters, and the history's in-repo arm today's plain path-log walk, so no
  caller imports either store.

    - `[x]` **2.3.a The path resolvers**

        - Moved both pure resolvers to `lib/store/kinds/review/paths.ts`, using the layout's Candidate and boundary
          addresses. The filesystem adapters re-export them, preserving their established paths and slug validation.

    - `[x]` **2.3.b The typed access**

        - Added typed Candidate and V1 boundary access for supplied/opened stores, explicit file ports, and batch puts.
          Shared conflict errors retain adapter identity. Candidate versions and checkpoint comparisons are opaque,
          with explicit digest parsing at the two published fields.

    - `[x]` **2.3.c The Candidate history read**

        - Moved supersession and revision reads to `candidate/history.ts`, with adapter re-exports and bounded parsing
          helpers. The plain path log preserves linked versions introduced by merge commits that the generic store's
          rename-following history can omit, while existing refusals and revision bindings remain intact.

### `[x]` **2.4 Reroute the work-unit, lifecycle, delivery, and locus callers — § 3.1, § 14.2**

- _Goal:_ No work-unit, lifecycle, delivery, or locus module imports the Candidate or boundary store: each reads and
  writes through the typed access, takes its types from the kinds' public schemas and its paths from their new home, and
  passes today's tests unchanged.

    - `[x]` **2.4.a Attest, the publication claim, and the reopen permit**

        - Attest and publication reads and writes use typed access with the executor's store; Candidate history uses
          its relocated Git reader. The attest core takes its versioned type from the public schema, while result
          revision bindings, reopen behavior, and existing test assertions remain intact.

    - `[x]` **2.4.b The Candidate's own verbs**

        - Candidate applicability binds one store to the invocation's Git runner for all typed reads and writes;
          rename forwards its existing store and runner. Both applicability cores take their versioned type from the
          public schema; selection replay, publication-state refusal, and the existing assertions remain intact.

    - `[x]` **2.4.c The subject's readers**

        - Active status keeps typed record access lazy, with its lint ban and loading inventory. Subject paths use review
          resolvers; boundary reads retain injected I/O, V1 parsing, absence, and owner checks. The shipped store-backed
          Candidate authority and owner-generation binding remain intact.

    - `[x]` **2.4.d Delivery and the path classifiers**

        - Delivery execution and repository inspection bind current Candidate and boundary access to stores using
          their Git runners. Delivery lifecycle, record-effect, and base-drift classifiers use the pure review paths;
          fixed-revision and index proof reads, staging, and existing test assertions remain intact.

### `[x]` **2.5 Reroute the integration callers — § 3.1, § 14.2**

- _Goal:_ No integration module imports the Candidate or boundary store, and the checkpoint, its confirmation, and its
  lineage review compose as today.

- _Outcome:_ Checkpoint composition shares its store across lifecycle, Candidate, boundary, and lineage reads;
  lineage passes it into private response confirmation. Standalone confirmation uses its caller's store or Git runner.
  Fixed-head and index proofs remain intact, and the relocated checkpoint stubs retain their call-count assertions.

### `[x]` **2.6 Reroute the review gate's callers — § 3.1, § 14.2**

- _Goal:_ No review-gate module imports the Candidate or boundary store, and every lane, response, and status read
  behaves as today.

    - `[x]` **2.6.a The review handler**

        - The review handler uses typed access, relocated history, pure paths, and the public V1 boundary type.
          Terminus, hosted-progress, and prepublication boundary operations reuse bound stores; Git history,
          fixed-HEAD replay, staging, and existing test assertions remain intact.

    - `[x]` **2.6.b The policy modules**

        - Pre-publication composition uses typed Candidate access and reuses the handler's store when provided. Public
          review schemas supply boundary and Candidate version types, and mechanical carry uses pure review paths.
          Exact-head carry proofs, plain-path-log supersession, and the existing assertions remain intact.

    - `[x]` **2.6.c The runtime and status modules**

        - Runtime, status, lane-read, and reserved-obligation readers share typed store access across prepare, response,
          and singleton continuation. Status parses digest-typed publication fields and keeps unreserved obligations in
          a pure helper; exact-head proofs, staging, and existing assertions remain intact.

### `[x]` **2.7 Before the flip** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

- _Outcome:_ On merged base `9fe2f2f0d`, the existing review, delivery, integration, and checkpoint scenarios pass with
  their behavioral assertions preserved. The boundary adapter joins the Candidate adapter's import ban at a zero floor,
  and whole-project lint confirms no suppression growth. Meta and code-head movement still invalidate checkpoints,
  while unrelated record writes do not.

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

### `[x]` **3.1 Build the mapping's module, its work-item resolution, and its listing — § 11, § 11.1, § 11.3, § 11.4**

- _Goal:_ A pure function takes the project ID, the review gate's folder, each live work unit's Candidate versions and
  boundary, and the import's work-item table, and returns records on their work items with their keys and a listing that
  accounts for every source it was given exactly once.

- **Additional Context:** `spec-storage-ref-backend.md` § 10.8, on `feat/storage-ref-backend` — `ReviewMappingInput`,
  `ReviewMappingResult`, and the listing's conventions.

    - `[x]` **3.1.a The input, the result, and work-item resolution**

        - Structural import types and pure resolvers join validated Candidate history, delivery-member slugs, and
          Errand claims to live imported identities. Missing or ended owners classify as left behind; hosted result
          joins normalize outcome keys while retaining the approved set's original producer identity and content.

    - `[x]` **3.1.b The listing**

        - Source enumeration preserves gate prefixes, tracked Candidate versions and boundaries, and one trailing-slash
          entry per materialization folder. Per-source listings retain partial-mapping reasons and references, classify
          discarded sources with reasons, and omit every mapped reference for an in-flight source.

    - `[x]` **3.1.c A mapped set is valid**

        - Complete mapped sets cover outcomes, evidence, decisions, whole Candidate histories, and version-two
          boundaries. Tests validate every returned version through the production parser and each registered write
          check over the complete after-view; Candidate validation remains parser-owned and the mapping registry-free.

### `[x]` **3.2 Map lane progress, receipts, and frontline outcomes to outcomes, and leave working state behind — § 11.2**

- _Goal:_ Every attempt lane progress records but a `pending` one becomes one `review/outcome` keyed as § 4.1, joined
  with the facts today's other records hold for it, while a `pending` attempt lists its file as in flight and every
  record of working state, retired attempts, or other stores is left behind with its reason.

    - _Amended in:_ 3.R (A9)

- _Outcome:_ Pure source decoding and producer mappings preserve each attempt's admission lineage, local request and
  receipt identity, sealed hosted findings, and original frontline source binding before executable redaction. Ordered
  outcomes and complete source listings distinguish pending live lanes, ended owners, joined evidence, and discarded
  working state; shared persistence envelopes keep repository readers and the mapping on the same source grammar.

### `[x]` **3.3 Map approved-disposition records to evidence — § 11.2**

- _Goal:_ Each disposition set an approved-disposition record holds becomes one `review/evidence` record naming its
  predecessor and successor, its result resolved to an outcome key, and its performance and settlement joined from the
  record and lane progress, while records in an older shape are left behind.

- _Outcome:_ Each approved set retains its binding, succession, policy snapshot, and optional advisory tags. Current
  and historical lane headers join complete fix responses; without a header, the recorded fix consumption supplies
  its time. Hosted actions and receipts remain set-specific, including predecessor carry. The shared legacy decoder
  preserves enumeration skips, and local approval checks bind the recorded evaluator identity.

### `[x]` **3.4 Map authorizations, the skip marker, termini, and the resume token's judgments to decisions — § 11.2**

- _Goal:_ Every decision today's records hold becomes a `review/decision` record carrying a decider, time, head, and
  subject digest only where its source recorded them, so no one is asked to decide again after the import.

    - _Amended in:_ 6.2.R (A16)

- _Outcome:_ Native authorization histories retain original keys, logical pass ordinals, capture metadata, and
  withdrawals; consumed admissions and their retries cite the grant, including hosted acknowledgment identity changes.
  Skip markers and boundary/member termini preserve recorded subjects without inferred authority. The shared legacy
  replay decoder and lane schema recover extra passes and unstored termini, whose basis uses mapped settlement and
  Candidate ancestry; duplicate decisions coalesce while every contributing source retains its reference.

### `[x]` **3.5 Map a live work unit's Candidate versions and boundary — § 11.2**

- _Goal:_ A live work unit's every Candidate version maps whole, oldest first, and its boundary at its current content
  maps to version 2, keeping the publication state it holds today.

- _Outcome:_ Accepted Candidate versions retain complete source bytes and chronology; refused schemas or supersession
  chains keep per-version reasons. Boundary conversion preserves every locus, reservation, and continuation while
  naming imported termini, retaining hosted producer references, and encoding only caller inputs in saved tokens.
  Readiness joins native lane versions to the canonical imported-content binding without backend metadata; stale or
  absent recorded versions remain unbound. Candidate ancestry retains the repository reader's identities and budgets.

### `[~]` **3.6 Pass the mapping into the import's port where the import landed first — § 11, § 14.2**

- _Goal:_ Where the import has landed on base, `arc store migrate`'s handler passes the mapping into the import's
  `reviewMapping` port, so the import's trial lists the mapping's account; where it has not, the import's change wires
  the handler when it lands.

- _Outcome:_ The import has not landed; `storage-ref-backend` remains Active. Its import change binds
  `mapReviewRecords` to the handler's `reviewMapping` port when it lands.

### `[x]` **3.7 Take the planned pass-policy change's landing before the review gate's arms — § 4.3, § 5.5**

- _Goal:_ Phase 4 starts on a base carrying the planned change to the standard lane's pass policy, or on the Owner's
  decision to proceed without it, so the review gate's arms from the flip are built over the pass policy that ships.

- _Outcome:_ The shipped cadence is present on base. The stored derivation now numbers the next pass from completed
  logical passes, including independently numbered ancestor histories; complete coverage controls only the standard
  ceiling. Remaining tasks retain grant ordinals, optional stored tags and report replay, and invocation-bound ports for
  correction proofs, next-pass context, and lane history. The amendment entry gate leaves the design unchanged.

### `[x]` **3.R Defer unused frontline payload decoding — § 11.2**

- _Goal:_ An unjoined frontline outcome is left behind without requiring its payload to meet today's schema, while a
  mapped live attempt still requires the complete native outcome validation (A9).

- _Outcome:_ Frontline identity headers index independently of opaque payloads. Unjoined historical findings retain
  the retired-attempt reason and foreign records retain their identity reason; a mapped live attempt still decodes
  through the complete native schema. The repository's actual-live pass now completes without decoding unused findings.

### `[x]` **3.8 The import's mapping** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds over this repository's review records on a freshly merged base.

    - _Amended in:_ 6.2.R (A16)

- _Outcome:_ The uncommitted port harness ran at `02d50eef5`, merging base `e6856533f`, over 2,206 gate files,
  272 work units, one actual Errand, and 324 archived Candidate versions. Actual live ownership left every gate file
  behind. The diagnostic's 257 live Errand claims yielded 505 outcomes, 228 evidence records, 115 decisions, 26
  Candidates, and 31 boundaries; every version parsed and passed its registered write checks over the complete set.
  Independent source assertions preserved all 505 eligible ended attempts, 228 disposition sets, 41 authorizations,
  and 27 skip markers; all 37 consumed authorizations were cited by their admitting attempts. All 22 fully mapped
  Candidate histories matched the repository reader, including 12 ancestors; nine histories retained refused versions.
  The listing accounted for every source once: 807 mapped, 1,753 left behind, and one pending lane in flight with no
  records. Left-behind reasons were retired snapshots (581), join-only working state (500), older dispositions (192),
  schema-refused Candidate versions (179), unjoined frontline outcomes (137), frontline runs (63), local operations
  (61), chain-refused Candidate versions (20), foreign repository identity (13), quarantine (2), absent Candidate
  ownership (2), adopted repository identity (1), an empty lane (1), and an unjoined disposition set (1). The mapped
  receipt ledger retained its two unjoined receipts' reason. Missing ownership and that disposition refer to a
  concurrent work unit's Candidate absent from this checkout's supplied history; pending work remains the explicit
  quiesce exclusion. The scenario revalidated A9 and A10 without changing any Success Criteria checkbox.

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

_Scenario extension (A13):_ The local completion scenario also re-enters its CLI-produced references after ended
working-state pruning and from a second clone, with the original source files absent. It retains the admitted UID
through rename and slug reuse; mismatched references refuse and succeed after correction (4.R2.d, § 9.3).

### `[x]` **4.1 Give the review gate's composition roots the store and the family's ports — § 2.3, § 3.3**

- _Goal:_ Every review-gate composition root that reads or writes a review fact holds the store its invocation opens —
  production opening the checkout's store, a test injecting any `Store` — and binds the family's ports from it, with no
  behavior changing before the flip.

    - `[x]` **4.1.a The ports**

        - _Amended in:_ 4.R (A12)

        - Typed outcome, evidence, and decision ports bind one supplied store and work item, preserve listing
          completeness and repair guidance, and expose prepared puts for atomic batches. Evidence advances retain
          opaque versions; composed native approvals preserve lineage order, optional tags, authorizations, performed
          responses, and portable source bindings. Repository selection retains today's adapters, and working state
          keeps its separate numeric CAS and snapshot contract. The family's schemas remain outside the review registry.

    - `[x]` **4.1.b The composition roots**

        - _Amended in:_ 4.4.R (A11)

        - Handler, runtime, policy, status, lifecycle, delivery, integration, and result-reader roots retain one
          invocation Store, project-ID reader, and selected work-item owner through their nested helpers. Family
          ports select the backend; read-only consumers use core ports while writable adapters retain their existing
          contracts. Candidate and boundary access shares the selected Store and exact generation, including renewal
          and singleton response rebinding. Native fixtures prove refusal/repair, selected-generation access after slug
          reuse, stored approvals, and ordinary next-pass history with both pass counts preserved.

### `[x]` **4.2 Build the review harness over the reference backend**

- _Goal:_ A review-gate test runs an arm from the flip over the reference backend with the production kind registry,
  seeded with a work unit's meta, Candidate, and boundary records, an Errand, and the project's identity record, beside
  a scripted repository and a temporary Git common directory for working state; a second clone shares the store; and a
  differential mode runs one scenario over both implementations and compares what each derives.

- _Outcome:_ Checked review seeders compose the lifecycle harness's production registry. Scripted checkouts share its
  Store and isolate their common directories; production locus and mutation-owner readers resolve store-only Errands
  and active/completed work units without projected metas. Real-clone helpers carry injected review context and can
  dual-seed the retained Errand ref. Differential observations compare independently read lane and outcome counts,
  detect an omitted result, and agree after its restoration.

### `[x]` **4.3 Take the project ID as the review gate's repository identity from the flip — § 2.4**

- _Goal:_ From the flip `resolveRepositoryIdentity` resolves the project ID through the invocation's project-ID reader,
  so two clones' records of one target agree; on a clone holding no project ID every review command refuses
  `project-identity-unavailable` with the port's remedy and succeeds once the clone holds it.

    - `[x]` **4.3.a The resolver**

        - Both repository-identity readers select the invocation's project-ID port on a native Store, retain the
          port's typed reason and remedy, and perform no clone-local identity access. Independent checkout views agree
          on the project ID; a fresh invocation succeeds after the missing record is restored. The repository arm
          retains its existing UUID and deterministic minting behavior.

    - `[x]` **4.3.b Its callers and the refusal**

        - Direct and lazy identity reads retain the invocation's project-ID reader. Command, status, and integration
          refusals keep port text and commands, with submitted requests retained for stdin retries; remedy-free identity
          error envelopes refuse. Native policy, lifecycle, checkpoint, and merge re-entry resumes after project
          restoration, retaining exact primary owners and unchanged native boundaries.

### `[x]` **4.4 Resolve the checkout's work unit and Errand through the store from the flip — § 12.4**

- _Goal:_ From the flip the review gate resolves the checkout's work unit through its branch link and its Errand
  through the checkout's claim and `lookup`, refusing where either refuses with anything but `not-found`, and
  pre-publication reads the work unit's assurance from its stored meta, so every later arm from the flip reviews a
  work unit whose meta carries no `Branch` and has no file in the checkout.

    - `[x]` **4.4.a The work-unit resolution**

        - Live context, subject selection, and all five review-local resolver calls use project-qualified branch links
          and stored metadata from the flip. Default hosted progress, chunking, and incremental applicability resolve
          adopted branches without a metadata file. Pre-binding delivery uses the linked originating top and the
          primary's projected lifecycle location; unlinked branches remain unbound and repository occupancy is retained.

    - `[x]` **4.4.b The Errand reads**

        - Live review and respond resolve the marker's exact claim through the invocation's Store, retaining the
          selected primary and each caller's state filter. Non-missing lookup and read refusals name the Errand and
          carry the Store's repair guidance. An exact claim remains usable beside malformed inventory entries; an
          incomplete miss refuses with its diagnostics and remedies and resolves after repair.

    - `[x]` **4.4.c The assurance read**

        - Pre-publication reads class and rubric through the selected Store's exact metadata record, with project
          method files supplying the rubric. Missing records return the existing refusal and proceed after repair;
          removing a stored rubric's method still refuses, and repository-backed metadata reads retain their behavior.

### `[x]` **4.5 Write the boundary in its new shape — § 3.5, § 9.1, § 9.5, § 12.6**

- _Goal:_ From the flip every reader reads version 2, and every write of a boundary that carries no terminus and is
  neither `candidate-publish-ready` nor `publication-pending` writes it, while the in-repo arm writes and reads version
  1 as today; the run-verification action emits `"merge"` in place of `"tier-3"`; and every published schema carrying
  either, or a record's version, admits the flip's value before the flip with nothing it emits changed.

    - _Amended in:_ 6.2.R2 (A17)

    - `[x]` **4.5.a The widened published schemas**

        - _Amended in:_ 4.R2 (A13)

        - Published boundary outputs and publish's unchanged result admit both formats. Pre-publication's native
          envelope keeps variant-typed policy, while strict V1 boundaries retain their original action rules.
          Published actions accept `merge` and projection-free continuations; record versions stay opaque, and
          terminus and delivery results admit stored authority without tracked artifacts.

        - _Amended in:_ 6.2.R (A16)

    - `[x]` **4.5.b The projections**

        - Boundary projections select the native format explicitly, omit copied policy and projection bookkeeping,
          and keep policy on transient envelopes. Publication and recovery carry readiness bindings and named authority
          through Candidate repair, verified singleton responses, and exact delivery renewal. Native readiness refuses
          an unbound digest.

    - `[x]` **4.5.c The writers and readers**

        - Native boundary projections and carries preserve version 2 through review, attest, publication, singleton
          response, and delivery writers; repository writes retain version 1. Store-backed inspection, status,
          admission, and checkpoint reads retain the selected owner and opaque version. Real delivery admission
          rejects a concurrent boundary change that leaves its Candidate and driver action intact, then succeeds
          on a stable retry without projected boundary records.

    - `[x]` **4.5.d `verificationKind`**

        - Native full convergence actions report `merge` at attest, pre-publication, and both checkpoint routes;
          repository actions retain `tier-3`. Published action schemas admit either backend's full-scope kind, while
          persisted V1 boundaries reject `merge` and V2 boundaries reject `tier-3`. Default pre-publication persists
          native convergence through the Store without staging a projected file; focused scope retains its own kind.

### `[x]` **4.6 Store reads for attest and delivery inspection, and the `Candidate` bullet's readers — § 12.1, § 12.4**

- _Goal:_ From the flip `arc attest` reads the work unit's meta and task list through the store, writes only
  `Current Workflow` and `Next Action` through the meta kind's field writers in the batch that writes the Candidate and
  its boundary, and refuses a paused work unit naming `arc resume <slug>` before writing anything; delivery inspection
  resolves the work unit and reads its meta and task list through the store; every reader of the meta's `Candidate`
  bullet but the subject's, which 7.6 moves, reads the Candidate record instead; and session-init's projection takes an
  Integrating work unit's branch from its link.

    - `[x]` **4.6.a Attest's reads, its batch, and its pause refusal**

        - Attest reads stored metadata, tasks, and pause state by exact identity. Candidate, version 2 boundary, and
          only the two orientation fields land in one batch; stale metadata, Candidate, or boundary bases leave no
          partial writes. Native root, re-root, convergence, and repair retain their continuations and retired fields.

    - `[x]` **4.6.b The `Candidate` bullet's readers**

        - Publication checks the stored Candidate; rename refuses an attested owner, completed placement included.
          Active and session-init projections share their Store and selected owner, read native Candidate and boundary
          records without files, and select the Integrating branch by project-qualified link behind a lazy module.

    - `[x]` **4.6.c Delivery entry inspection's work unit and meta**

        - Entry and review-fix continuation read stored metadata and tasks by selected generation, without following
          the metadata path. Production resolution confirms active and completed owners; exact family binding and
          task reads retain the invocation Store, with refusal and normal continuation after repair.

### `[x]` **4.4.R Bind native family ports after authenticated vehicle resolution — § 2.3**

- _Goal:_ Default native review binds the family's ports to the exact work item its invocation resolves, without
  requiring a caller-supplied `workItem`, adding no family refusal or owner-selection policy (A11).

- _Amended in:_ 4.R2 (A13)
- _Amended in:_ 4.R4 (A15)

    - `[x]` **4.4.R.a Bind the selected primary before family access**

        - Composition roots retain the primary selected by branch link, exact Errand claim, explicit vehicle, or
          produced continuation before family access. Selected Store, project reader, and UID survive nested reads;
          missing vehicles retain their existing refusal, and fact-free policy follows 4.R4. Repository adapters
          and owner-selection policy remain unchanged.

    - `[x]` **4.4.R.b Prove native defaults without owner injection**

        - Default local, frontline, hosted, pre-publication, lane-read, and status handlers resolve checked native
          owners without an injected resolver or owner. Real checkouts cover branch-linked work units, exact Errand
          claims, and status-produced delivery admission through local preparation and resume. Project and vehicle
          repairs resume normally; produced continuations and explicitly selected status retain their UID after
          slug reuse, with no fallback to the new holder or writes from read-only commands.

### `[x]` **4.R Preserve sync-conflict refusals in typed review listings — § 2.2, § 2.3**

- _Goal:_ Typed outcome, evidence, and decision listings refuse incomplete authority while a listed record holds sync
  conflicts, retaining the exact conflict references and resolution guidance; composed approved-disposition reads refuse
  conflicted evidence and resume after resolution.

- _Outcome:_ Typed listings report incomplete authority with every exact conflict reference. Both composed approval
  readers refuse conflicted evidence and resume once its conflict records are resolved.

### `[x]` **4.R2 Carry native continuation ownership in command references — § 2.3, § 4.7, § 9.3**

- _Goal:_ CLI-produced native references retain the exact project and work-item owner through re-entry, working-state
  pruning, and clone changes without altering stable result keys or adding owner-selection or authorization policy
  (A13).

    - `[x]` **4.R2.a Build the owner-bearing codecs and widen their published embeddings**

        - Native codecs and published continuations retain project and exact owner outside stable IDs. Local,
          frontline, and hosted embeddings check operation/admission agreement; zero working versions and omitted
          local source references require native locators. Hosted action and timing projections retain them, while
          repository inputs and emitted values stay unchanged.

    - `[x]` **4.R2.b Bind native continuation roots from their produced reference**

        - Default local, frontline, and hosted continuations bind the admitted UID from their produced operation or
          source reference before family access. Work-unit and Errand findings reach response proposals without owner
          injection; hosted settlement retains its source owner. Project repair, coordinate refusals and corrected
          retries preserve existing actor and state checks. Hosted index replay retains its owner outside identities;
          repository inputs and encodings stay unchanged.

    - `[x]` **4.R2.c Propagate native references through result and response composition**

        - Composed evidence takes its owner from the stored outcome. Pre-publication, hosted discharge, earlier
          applicability, delivery, and integration retain and validate the selected project and UID. Candidate fix
          continuation resolves native facts within its bound family; hosted source resolution keeps acknowledged
          attempts within that owner. Cross-owner substitutions refuse and corrected references succeed. Import
          decoding and keys remain unchanged, as do repository source and disposition behavior.

    - `[x]` **4.R2.d Prove local completed re-entry after pruning and on a second clone**

        - Actual local commands retain clean and findings results, approvals, and original UIDs after ended-state
          pruning, slug reuse, and second-clone re-entry. Independent clones produce the same project-bound target;
          re-entry from a different current Errand still reads the original outcome, reports working version zero,
          and omits unavailable source references without launching review.

### `[x]` **4.7 Keep in-flight state in a namespace of its own — § 4.7**

- _Goal:_ From the flip operation records hold only in-flight execution state, in `in-flight/`, one record per lane and
  lineage owner, so no record of today's shapes reaches the new schemas, an attempt whose outcome is stored never counts
  as in flight, no pass holds two attempts under way or one after its finished outcome, and the in-repo arm still reads
  today's records.

- _Outcome:_ UID-bound execution records persist under `in-flight/`, composing local, frontline, and hosted pending
  admissions with portable outcomes and evidence. Ended attempts disappear on the next write without losing the
  record's version. Duplicate pending passes and finished-pass admissions refuse; Errand records span heads while
  exact review targets remain separate. Legacy operation files stay outside native snapshot parsing.

### `[x]` **4.8 Read the Candidate's supersession chain through `history` from the flip — § 8.4**

- _Goal:_ From the flip the Candidate history read walks the record's store history for the supersession chain and gives
  a record's revision as its store version, returning the chain the in-repo arm returns over the same versions, so pass
  inheritance runs over the reference backend.

- _Outcome:_ Native Candidate readers share the exact stored supersession walk, skip removals, retain opaque versions,
  and refuse damaged linked history. Attestation's recovery carries the stored version; inherited review names the
  predecessor's attempt on this clone and resumes after it ends. Repository path-log history and owning-branch recovery
  retain their existing behavior.

### `[x]` **4.9 Write a local attempt's outcome, and derive the lane's pass count from outcomes — § 4.1–4.3, § 4.6, § 4.8**

- _Goal:_ From the flip a local attempt that ends writes one `review/outcome` on its vehicle's work item through the
  lane-progress transition every caller uses, and the policy numbers the next pass, records an exhausted pass count, and
  refuses an unsettled supersession from the count and state derived from stored records, its chain's included.

    - `[x]` **4.9.a An ended local attempt writes its outcome**

        - Ended local transitions publish immutable outcomes and retain receipts there. Failures and stale targets
          consume no pass; retries keep their pass and advance generation. Replay retains the original outcome and
          rejects conflicting conclusions. The source sweep reads each pin's bound work item and releases finished
          sources across work items while preserving unfinished pins until expiry.

    - `[x]` **4.9.b The policy reads the derived count**

        - Native lane reads compose ordered outcomes with pending execution, preserving local versions and admitting
          outcome-only history at version zero. Mapped fallback and retry lanes retain the repository lane's source
          order, terminal producer, and policy result. Logical counts number grants independently of complete-pass
          budgets; inherited counts retain settled history and omit late unsettled outcomes on replaced Candidates.

    - `[x]` **4.9.c The local lane reads settled state from evidence**

        - Preparation, completed replay, and predecessor liveness consume composed evidence. Deferred findings settle
          the current Candidate and carry its pass after replacement. Approved fixes remain live until complete
          performance is recorded; default Errand preparation then offers the exact fix check and admits its emitted
          coverage choice at the next logical pass without changing the original outcome.

### `[x]` **4.10 Read local results and reduce them from outcomes — § 4, § 9.3**

- _Goal:_ From the flip the review result reader and reduction read a local result from its outcome, through the
  command source reference whose durable part is the outcome key, so a local review's result reads back as today with
  no published schema changed.

- _Amended in:_ 4.R2 (A13)

- _Outcome:_ Default attest, resume, reduction, and result composition read local outcomes and approved evidence on
  the reference-bound UID. The result matches the repository reader with portable source coordinates and unchanged
  digest. Real-Git clean and findings continuations retain that result and approval after local state pruning, slug
  reuse, and re-entry from a second clone; absent source references are omitted and absent working state reports zero.

### `[x]` **4.R3 Verify the local continuation payload boundary — § 3.5, § 9.3**

- _Goal:_ Attest's `attested-current` payload retains the actual source-store reference where available and omits it
  only for ended native replay without that record; resume payloads carry no `sourceRef`, with both commands retaining
  their native receipt references and unchanged in-repo payloads (A14).

- _Outcome:_ Published schemas and actual command replay retain attest's available source reference and omit it only
  with a native locator after ended-state pruning. Resume carries the native receipt without `sourceRef`; repository
  requests and payloads retain their existing shape.

### `[x]` **4.R4 Preserve fact-free generic policy resolution — § 2.3**

- _Goal:_ Native generic policy resolution binds family ports only for required record evidence, preserving fact-free
  resolution without a vehicle and refusing missing evidence context actionably without another owner or invented
  history (A15).

    - `[x]` **4.R4.a Defer generic family binding until a record read is needed**

        - The default native handler resolves fact-free requests through the configured reducer after project and
          vehicle resolution. Producer and runnable-standard requests without an owner return the existing error
          envelope with an owning-checkout remedy; branch repair resumes them without writes. Explicit generations
          survive slug reuse, project-identity repair stays intact, and fact-free results match the repository arm.

### `[x]` **4.11 The review gate's store** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.
- _Outcome:_ On base `7e6852542`, actual native attestation, paused refusal/resume, local completion, derived counts,
  supersession, repository-state coexistence, and project-identity repair satisfy the segment scenario. Supplemental
  re-entry retained the admitted UID through stored-owner rename and slug reuse after pruning, including a second
  clone and mismatched-reference repair, without changing outcome contents or version. A11–A15 are revalidated.

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

_Scenario extension (A13):_ Frontline and hosted completed references also survive pruning and a second clone without
original execution files. Result, response, reservation, delivery, and integration consumers retain the reference's
exact project and owner; mismatched references refuse and succeed after correction (§ 9.3). The 5.8 verifier includes
this extension, following the 4.11 local proof.

### `[x]` **5.1 Write frontline outcomes and skip decisions, and derive the window — § 4.2, § 4.7, § 5.6, § 5.9**

- _Goal:_ From the flip a frontline attempt that ends writes its outcome where its run writes its result today, its
  admission numbers its pass from the derived count, a frontline skip — a Candidate's or an Errand's — is a lane-skip
  decision on the vehicle's subject, and the window's closure derives from the vehicle's records, so nothing writes or
  reads the skip marker and an Errand's skip closes its window.

    - `[x]` **5.1.a Frontline outcomes and admission**

        - Native runs publish one immutable outcome before ending pending execution, retaining the original source
          binding and portable executable identity. Produced references replay the stored result after pruning and
          on a fresh checkout without provider execution; admission and retry retain derived pass/generation counts,
          validated ancestry, and current ready-response authority.

    - `[x]` **5.1.b The lane-skip decision**

        - Candidate and Errand skips publish one immutable decision with null basis and the active identity unchecked.
          Repeated skips retain the same decision; Candidate closure reaches the validated supersession chain.

    - `[x]` **5.1.c The derived window**

        - Native closure reads skip decisions, terminal clean or settled-stop frontline outcomes, and pending or
          recorded standard attempts across validated ancestor lineages. The lazy pre-publication adapter retains its
          native fact ports. Evidence binding carries selected backend context through policy, response continuation,
          and pre-publication; native closure emits `frontline-window-closed` with the published `phase-closed` reason.
          Repository diagnostics and invocation judgments retain their behavior.

### `[x]` **5.2 Write hosted outcomes with their sealed results — § 4.1, § 4.5, § 9.3**

- _Goal:_ From the flip a hosted attempt that ends writes its outcome keyed by its admission ID, keeping its sealed
  result under `hostedResultId` with its host locator; its admission numbers its pass from the derived count; and
  settlement, coverage validation, and every hosted reference resolve to that outcome, never a host comment.

- _Outcome:_ Native admission and acknowledgment retain pending-only state; ended requests and sealed results publish
  admission-keyed outcomes that completed await replays without provider observation. A native producer sequence now
  proves complete pass 1 plus incremental pass 2 admits logical pass 3, retains one complete pass, and advances the
  request-owner index from the derived logical count.

### `[x]` **5.3 Write evidence at approval, performance, settlement, and succession — § 6, § 9.3**

- _Goal:_ From the flip `arc review respond` writes one evidence record per approved disposition set, its binding
  resolved at the first write, advances it in place as its response is performed and settled, and marks its predecessor
  in the batch that creates a successor, so the current set is the one no record succeeds.

    - `[x]` **5.3.a Approval and its binding**

        - Approval publishes one producer-bound evidence record per disposition set across all three sources, including
          private Candidate/member bindings and initial uncarried record-only hosted receipts. Replay retains the first
          binding and advisory tags, including absence, while composed reads recover the same approved response.

    - `[x]` **5.3.b Performance and the Candidate response**

        - Native response storage advances complete fix facts and performance together, preserving the original
          approval, binding, tags, and immutable outcome. Matching replay adds no version; Candidate performance binds
          its response ID once, retaining its original timestamp and refusing a replacement.

    - `[x]` **5.3.c Hosted settlement**

        - Hosted settlement appends each exact receipt once through the default settle handler and native response
          transitions. Conflicting receipts and unverified response heads refuse with a successful repair path;
          complete sealed-finding coverage derives settled state, and succession carries retained host proof.

    - `[x]` **5.3.d Succession and the current set**

        - Successor approval atomically creates its record and marks its exact unperformed predecessor. Current-set
          composition follows reciprocal edges; second successors and performed predecessors refuse with a replay
          route. Policy-projection completion preserves both lineage records and their captured advisory tags.

### `[x]` **5.4 Write, consume, and withdraw `approved-fix` extra passes — § 5.4, § 5.5, § 5.7**

- _Goal:_ From the flip approving a fix with a conditional next pass writes an `approved-fix` extra-pass decision keyed
  by today's `authorizationId`, the admission citing it consumes it as today, a successor set's approval ends it, and
  its withdrawal is a withdrawal decision, refused once it is consumed or superseded or when the withdrawer is not its
  decider; a repeated capture or withdrawal reports the stored decision, as today.

- _Outcome:_ Existing lane transitions capture immutable approved-fix decisions, bind pending admissions and ended
  outcomes through `admittedBy`, and recover exact retry contracts after pruning. Native withdrawal and succession
  retain consumption, author, and current-set refusals with working repair routes; repeated capture or withdrawal
  preserves the stored facts, including withdrawal replay after succession.

### `[x]` **5.5 Move delivery's review fix onto evidence — § 6, § 9.3, § 14.2**

- _Goal:_ From the flip a delivery member's fix advances its evidence record, its continuation reads the resolved policy
  request from it, and delivery reads evidence and outcomes in place of disposition and operation-state records, while
  a verification response stays a Candidate transition alone.

- _Outcome:_ Delivery binds its native owner lazily, validates ended local member responses from immutable outcomes,
  and publishes complete fix performance through native evidence. Continuation retains the approved policy request
  after pruning and on a fresh checkout; exact replay preserves evidence versions and outcomes. Verification-only
  responses remain Candidate transitions, with no evidence write. Repository delivery acknowledgment paths remain intact.

### `[x]` **5.6 Compose review results, policy evidence, reduction, and status from records — § 4, § 6, § 9.3, § 14.2**

- _Goal:_ From the flip every reader that reads the family's records or today's stores directly — to compose a review
  result, a lane's state, a reservation, or status — reads outcomes, evidence, and decisions through the store and
  reaches today's verdicts.

    - `[x]` **5.6.a The result readers**

        - Native result composition preserves producer verdicts, portable source keys, recorded frontline binding IDs,
          and Candidate/member bindings after redaction. Exact owner/project references retain refusal and repair.
          Default respond settles a native frontline source from outcomes and evidence alone, closing its opening
          window with no legacy execution, outcome, or disposition files; supersession retains current-set checks.

    - `[x]` **5.6.b Policy evidence, earlier reviews, the pending fix, and reduction**

        - Bound family ports supply policy and pre-publication evidence, earlier-review snapshots, and pending Candidate
          authority from outcomes and approved evidence. Native local authority needs no operation file; frontline
          identity retains its recorded binding. Default frontline reduction preserves the producer's portable source
          reference through approval and reads completed results at version zero without changing stored facts.

    - `[x]` **5.6.c The hosted reservation**

        - Native progress, evidence-bound admission, and discharge match repository-backed verdicts across terminal
          request failure, next-head restart, and clean completion. Attempt history preserves failure-before-restart
          order, a pending restart holds the reservation, and a completed outcome discharges it on a fresh checkout
          without working-state files. Native source and operation references retain their selected owner.

    - `[x]` **5.6.d Integration's review reads**

        - Native lineage settlement validates producer-bound outcomes and evidence, retaining the approved policy
          request. Private response confirmation reads the stored Candidate and original frontline binding without a
          Candidate file in Git or local execution records, preserving target-object, approval, actor, span, and
          currentness checks. Foreign-owner references refuse and retry with the matching reference succeeds;
          checkpoint reservation progress uses the bound family's composed snapshot.

    - `[x]` **5.6.e Status**

        - Work-unit and Errand status bind the selected generation's review family. Native lane history reads stored
          rejections, complete and incremental looks, and performed fix evidence without legacy operation, outcome,
          disposition, or boundary files. Two completed looks retain one complete-pass count, and repeated reads leave
          the store unchanged; default status and lane handlers preserve identity and vehicle refusal/repair paths.

- _Outcome:_ Result, policy, reservation, integration, and status readers share the selected native family. Completed
  reads retain exact source ownership and approved policy snapshots without local execution files; inherited history,
  rejection explanations, and complete-pass counts remain derived.

### `[x]` **5.7 Add `arc review adversarial record` — § 7.2**

- _Goal:_ One call at the disposition approval writes one `review/adversarial-pass` record on the work unit its request
  names, the CLI deriving the artifact versions and the pass number and publishing its input schema; malformed input
  refuses naming the expected shape, an incomplete listing refuses, and before the flip the write refuses `unsupported`
  naming the remedy of keeping the pass where the method keeps it today: the work unit's `ADVERSARIAL-PASSES.md` for a
  planning activity, the criteria report for `verification` and `criteria`.

    - `[x]` **5.7.a The command, its help, and its request schema**

        - Registered the command, navigation, public request and result schemas, and pinned schema inventories.
          Its text-only `unsupported` variant belongs to this mode alone. Shared JSON transport, error projection,
          and option diagnostics now live outside the large handler and CLI modules.

    - `[x]` **5.7.b The handler**

        - The dedicated handler resolves the named generation through `lookup`, derives artifact versions, code HEAD,
          and the next activity key across loops, then creates one immutable record. Incomplete observations refuse
          before writing and resume after repair. Shared header validation rejects duplicate findings and unapproved
          over-cap passes; malformed requests name schema discovery, and pre-flip refusals retain text-only remedies.

### `[x]` **5.8 Every lane's results** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

- _Outcome:_ Base `acc49f873` is reconciled in `679ec0950`. Reference-backend local, frontline, and hosted
  results survive actual execution-file pruning and a second Git clone. Default reduction and response proposals
  retain exact project and owner UID coordinates; foreign references refuse and matching references resume, with
  original outcome bytes and versions unchanged.

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

### `[x]` **6.1 Bind readiness to the standard lane's records, and claim publication in its batch — § 9.2, § 10.1**

- _Goal:_ From the flip readiness records `readinessBinding` over the current listing of the standard lane's records on
  the Candidate's lineage and its in-flight attempts, every publication site recomputes it and refuses on a mismatch or
  an incomplete listing, and publication writes its claim in the publish transition's batch, while
  `standardLaneOwnerVersion` guards publication before the flip.

- _Outcome:_ Native readiness binds the complete standard-lane facts and pending attempts; advanced re-entry and
  attestation-ordering recovery retain its digest. Publication rechecks that binding and the exact boundary version,
  preparing its claim for the lifecycle batch. Attestation and response recovery preserve the stored binding, and
  interrupted publication resumes without another write. Version-one publication retains its scalar guard.

### `[ ]` **6.2 Record ceiling and additional extra passes and termini as decisions — § 5.3, § 5.6, § 5.7, § 9.3**

- _Goal:_ From the flip an Owner's ceiling override, additional pass, and terminus — a singleton's or a member's — are
  decision records written by whichever call carries them and read by the resolution within their reach, the `--resume`
  token keeps only its call inputs, the frontline resolve form relays a recorded judgment by its decision, and the
  boundary names the terminus it carries by key, carrying or dropping it where today's writers carry or drop the
  terminus.

    - `[x]` **6.2.R Retain ordinary grant policy bindings and relay keys**

        - _Goal:_ Ordinary extra-pass decisions retain whether their original grant bound repository and PR or binds
          them at use, the import preserves targetless authority without inventing coordinates, and native relays name
          the stored decision without changing its author or writing a second grant (A16).

            - `[x]` **6.2.R.a Envelope, identity, published schemas, and import**

                - Ordinary preconditions require their original target binding, and their content keys distinguish
                  repository and PR bindings. Full and targetless schemas carry optional decision references, with
                  ceiling references excluding approved-fix authorization IDs. Replay imports retain `call-target`
                  without inventing policy coordinates; approved-fix envelopes and identities stay unchanged.

            - `[x]` **6.2.R.b Native resolution and exact decision references**

                - Native resolution validates full grants before writing and selects live decisions within their
                  original repository, nullable PR, head, and logical-pass reach. Relayed keys resolve on the bound
                  owner without a fresh identity lookup or another write; invalid references refuse with a repair
                  route. Targetless imports retain call binding, and Candidate ceiling carry excludes successors.

            - `[x]` **6.2.R.c Relay projections and bounded regression proof**

                - Relay projections retain and compare decision references; repository invocations refuse native
                  references, and ownerless native calls require their owning context. Delivery admission identity
                  and replay comparisons omit transient keys while retaining grant constraints. Native pre-publication
                  composition reuses each stored grant without another write.

    - `[x]` **6.2.R2 Preserve native terminus provenance through policy composition**

        - _Goal:_ Native policy resolves an imported terminus with no recorded author through its original decision
          and stored pass-count basis, without changing public command inputs, repository records, or in-repo output
          (A17).

            - `[x]` **6.2.R2.a Native projection and bound policy schema**
                - Native bound requests and policy results retain the decision key and nullable author. Evidence and
                  continuation preserve that authority only with trusted native context; public commands and remedies
                  retain their version-one shape. Native boundary projection requires the matching decision key.
            - `[x]` **6.2.R2.b Native decision reads and pre-publication composition**
                - Native composition resolves live decisions on the selected owner before policy, retaining their
                  author and pass-count basis. Default pre-publication and owned generic resolution recompose omitted
                  authority without another decision write; retained invalid keys and incomplete listings refuse with
                  repair routes. Pre-publication boundaries name the original key, and ownerless resolution is unchanged.
            - `[x]` **6.2.R2.c Bounded regression proof**
                - Replay-imported termini reach default readiness, retain their provenance, and re-enter without a new
                  decision. Bound evidence, continuation, command, and remedy contracts retain their required forms;
                  repaired references resume normally. Live singleton and member writes remain in 6.2.b.

    - `[x]` **6.2.R3 Preserve supersession after withdrawal**

        - _Goal:_ Withdrawing the newest native decision leaves earlier decisions of the same kind superseded within
          their shared reach, as § 5.4 requires; only a fresh live decision restores authority.
        - _Outcome:_ Terminus and ordinary-grant selection establishes the newest decision within reach before
          checking withdrawal. Superseded records refuse key and raw replay; a fresh live decision restores resolution.

    - `[x]` **6.2.a Ceiling and additional extra passes**

        - `[x]` **6.2.a.1 Generic policy resolution**
            - Generic native resolution records full grants on the bound owner with the current effective Candidate
              subject or exact review target. References relay the stored author without another write; automatic
              grants leave incremental coverage uncharged, and new ownerless judgments require their owning context.
        - `[x]` **6.2.a.2 Errand status**
            - Native status records grants before unrecorded-lane returns and relays their keys without another write.
              Policy composition resolves their exact claim, head, host binding, and logical count; automatic grants
              leave incremental admission free while explicit contradictory inputs retain policy refusal.
        - `[x]` **6.2.a.3 Local preparation**
            - Production preparation binds explicit and stored judgments before pending replay, validates referenced
              authority, and resumes an additional pass after its separate coverage choice. Pending operations retain
              their immutable targets and identities; fresh delivery inputs retain exact driver validation.
        - `[x]` **6.2.a.4 Frontline resolution**
            - Native frontline resolution records and relays ordinary ceiling authority before pending replay,
              preserving exact head reach and window closure. Delivery policy targets use the member's retained
              branch; matching references preserve the admission, and invalid references refuse before replay.
        - `[x]` **6.2.a.5 Hosted requests**
            - Fresh capacity authorization records and resolves ordinary grants on the actual Candidate or head-bound
              subject and logical count. Exact references retain their author, reserved replay writes no new grant,
              and provider actor identity stays separate from the judgment's active identity.
        - `[x]` **6.2.a.6 Publication status**
            - `[x]` **6.2.a.6.1 Stored grants in reservation discharge**
                - Native terminal policy reads stored grants without a fresh decider. Current and retained evidence
                  preserve the verified producer and executable next source, allowing an additional Candidate pass
                  while retaining outstanding findings and the repository arm's behavior.
            - `[x]` **6.2.a.6.2 Status writers and continuation projections**
                - Singleton and member status record judgments before policy or unreserved returns and validate exact
                  references before replay. Settled members retain the queried target, continuation actions relay the
                  selected key, and automatic singleton grants follow discharge coverage.
            - `[x]` **6.2.a.6.3 Delivery admission relay proof**
                - Production local preparation compares stable driver admissions while native composition validates
                  decision references. A raw grant and its recorded relay admit the same pass; changed target, pass,
                  grant, scope, and coverage constraints still refuse before a repaired continuation succeeds.

            - _Outcome:_ Every extra-pass entry point records or resolves the native decision on its bound owner
              before pure admission or replay. Status and reservation discharge preserve executable continuations
              through the same decision, without changing repository-backed behavior or incremental pass accounting.

    - `[x]` **6.2.b Termini**

        - `[x]` **6.2.b.1 Singleton judgments and atomic persistence**
            - Authorized singleton judgments prepare one decision on the effective Candidate subject, joining a
              settled boundary's batch or persisting alone while review remains unfinished. Resume reuses the record;
              a refused boundary batch leaves no decision, and retry records both together.
        - `[x]` **6.2.b.2 Member acceptance and native discharge**
            - Native acceptance records the decision and boundary atomically, preserves exact replay and pass-count
              refusals, and returns without staging a tracked file. Status and checkpoint composition resolve member
              keys with their recorded provenance; invalid references refuse and repaired authority resumes normally.
        - `[x]` **6.2.b.3 Terminus carry and recovery proofs**
            - Native resolution follows the retained boundary across attestation, verified response, and corrective
              renewal, preserving original provenance and live-decision checks. Private subject advance drops the
              name; imported and live singleton decisions key alike on stored and unstored subjects.

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
        - a pending fix's native source reference agrees with its stored producer after execution-state pruning and
          rename or slug reuse; a substituted owner refuses and the matching reference restores the normal projection

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

- `[ ]` Imported Errand and member evidence with no `fix` disposition retains its native performance header without a
  fix response. Performed Errand or member fixes require their complete authorized transition, and a set with no fix
  refuses either fix-response object (spec, A10).

- `[ ]` Native operation and source references retain the exact project and work-item UID through pruning and clone
  changes without changing stable IDs or result keys. Production local completed re-entry/reduction and frontline and
  hosted result/response reads use them without original working files; rename and slug reuse retain the selected
  generation. Invalid reference coordinates refuse actionably and succeed after correction (spec, A13).

- `[ ]` Local attest's `attested-current` payload carries the actual retained source-store reference, or omits it on
  ended native replay when that record is absent. Resume payloads carry no `sourceRef`; completed receipt references
  retain the native outcome key and owner. In-repo payloads stay unchanged (spec, A14).

- `[ ]` Native generic frontline resolution without a terminal producer and exempt or source-free standard
  resolution without one retain their configured results without an established owner. Producer reads and runnable
  standard review refuse with an actionable owning-checkout remedy and succeed after context repair, without selecting
  another owner or treating unknown history as empty. Existing owner, project-identity, and in-repo behavior remain
  intact (spec, A15).

- `[ ]` Native full ordinary grants retain their original host repository and nullable PR binding, and targetless
  imports bind them at use. Relay keys preserve recorded authors and all constraints, invalid references refuse and
  recover after repair, and incremental passes cite no grant. Approved-fix keys and in-repo emissions remain unchanged
  (spec, A16).

- `[ ]` An imported replay-only terminus reaches default native pre-publication readiness through its original key,
  nullable recorded author, and stored pass-count basis without new acceptance or a second decision. Native policy
  outputs preserve that projection while the boundary stores only its key; invalid authority refuses and recovers
  after repair. Public command and corrective payloads and version-one repository behavior remain unchanged (spec, A17).
