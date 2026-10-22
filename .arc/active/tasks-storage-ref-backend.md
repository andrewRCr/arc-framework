# Task List: Storage Ref Backend

- **Design:** `spec-storage-ref-backend.md`

---

## **Phase 1:** Contract changes

_Purpose:_ Part A's types take `pull`, `push`, and `maintain`, the new results and refusal, the hunk record's base
version and side counts, `RefHome`, and `ReadOnlyStore`, and the in-repo implementation, the reference backend, and the
shared suite follow, a cohort's archive placement among them as seam-lifecycle ships it, and a companion keyed by its
path, so the contract is settled before any ref-backend code builds on it.

_Mode:_ `layer` through Phase 2 — closes on the settled substrate the ref backend builds on: the amended contract over
both existing backends, and the Git access the engine calls.

### `[x]` **1.1 Baseline the test-cost rows the new files touch — § 14.12**

- _Goal:_ The unit, integration, and `lane` tier rows and the CI-job rows that the ref backend's test files will move
  carry a baseline taken before the first such file lands, so the cost they add reads as a delta.

- _Outcome:_ Warm, single-run baselines and normalized reports cover unit, integration, and combined lane at 12
  workers, before any test-file change. `notes-storage-ref-backend.md` § CI cost history records the figures, retained
  evidence, and approved CI-source correction: preceding `main` unit jobs and reviewed-PR integration jobs, with their
  exact commits and source difference; `main` pushes never execute integration. Existing budgets remain unchanged.

### `[x]` **1.2 The sync inputs and results — § 2.1, § 2.2**

- _Goal:_ Every input and result `pull`, `push`, and `maintain` carry is a schema a caller parses, and both existing
  backends' publish outcomes carry the retry figures, so the operations that follow change no result type.

- _Outcome:_ `sync.ts` exposes strict pull, push, and maintenance schemas, the five additional configuration states,
  pull notices, and carried-ref results; `HistoryRefSchema` names work and cohort history. Both existing backends
  report retry counts and elapsed time on shared publication outcomes, retaining the in-repo-only status shapes.

### `[x]` **1.3 `pull`, `push`, and `maintain` on `Store` and both backends — § 2.1**

- _Goal:_ `Store` exposes `pull`, `push`, and `maintain` and no `sync`, and both existing backends serve them with
  today's behavior mapped onto the new results.

    - `[x]` **1.3.a The in-repo implementation**
        - Fetch-only personal pulls preserve producer outcomes, load successful fetches, and retain typed remote
          failures and thrown local faults. Publication is `push`; maintenance reports no measurements.

    - `[x]` **1.3.b The reference backend**
        - Pull reconciles archives and cohort positions locally, retaining the observed remote as its common basis
          without publishing. Push retains publication with empty `pulls`, and maintenance reports no measurements.

    - `[x]` **1.3.c The contract and its callers**
        - `Store`, its lazy composition, archive publication, and every contract test/helper use `pull`, `push`, and
          `maintain`; the old `sync` operation and result names are removed, and push assertions retain `pulls`.

### `[x]` **1.4 The `state-unresolvable` refusal and its recovery case — § 2.3, § 14.2**

- _Goal:_ A read, write, or listing that names a state version or ended item's history this clone cannot resolve
  refuses recoverably with what it needs, and every backend produces or excludes the case by name.

- _Outcome:_ The strict recoverable refusal retains optional anchor/write evidence and required history refs.
  Reference reads, listings, and changes return it for unknown anchors; known reversed intervals remain defects.
  The exhaustive recovery case rebuilds the read from the current version, and the in-repo fixture excludes it.

### `[x]` **1.5 A cohort's archive placement — § 2.4**

- _Goal:_ A cohort's document closes by a `completed` placement write and reads back with its sequence and closeout
  letter, as seam-lifecycle ships it, and each backend serves or refuses it by name.

    - `[x]` **1.5.a The suite item**
        - Item 1's `cohort-close-placement` installs the cohort parser and checks the quarter's next sequence,
          standalone closeout `a`, and parent closeout `b` through reopened reads. The in-repo fixture names its
          `unsupported:placement-move` exclusion.

### `[x]` **1.6 Hunk conflict records carry their base version and side counts — § 3.7**

- _Goal:_ Any clone can place a hunk conflict against the record version its base range counts in and draw each side's
  exact line count, an empty side apart from one blank line, on every backend that merges.

    - `[x]` **1.6.a The record and the merge library**
        - Hunk records require a nullable base version and nonnegative integer side counts. Line and entry-prose
          merges retain the supplied basis and count clash lines before joining, distinguishing empty and blank sides.

    - `[x]` **1.6.b The reference backend's merges and the suite**
        - Writes and pulls retain their actual common record version; independent creations carry null. Shared merge
          assertions cover the basis and both side counts, while fixtures without concurrent merges skip them.

### `[x]` **1.7 `RefHome` and `ReadOnlyStore` — § 3.2, § 9.6**

- _Goal:_ Every kind whose family has a ref names where the ref backend stores it, and a store over another remote's
  state has a type offering the read operations alone.

- _Outcome:_ Every kind in a ref-owning family declares its stored-path template beside its interim home;
  non-ref families retain none. Registry assertions check the complete path table and owner/key placeholders.
  `ReadOnlyStore` exposes capabilities and the six read operations through the public contract. The approved lint
  amendment recognizes the registry as the ref-path authority while retaining caller and checkout-path restrictions.

### `[x]` **1.8 The suite: write admission, merges, and listings — § 14.2**

- _Goal:_ The suite's new write, merge, and listing assertions hold on the reference backend, and the in-repo fixture
  excludes each it cannot serve by the refusal that stops it.

- _Outcome:_ Reference writes validate mutations, provenance, batches, repeated entry IDs, and final merged bytes
  before publishing prepared state. Named shared cases cover live-slug collisions, missing primary placement,
  merge-authored conflict history, explicit resolution, and parser-refused merges; the interim fixture names its
  unsupported moves. Key independence respects one project, and size diagnostics select projected kinds only.

### `[x]` **1.9 The suite: `pull`, `push`, and `maintain` — § 2.1, § 14.2**

- _Goal:_ The shared suite holds every backend to `pull`, `push`, and `maintain`, and the reference backend passes it as
  the model the ref backend is held to.

- _Outcome:_ Named pull cases observe remote writes locally while preserving remote records and versions; the
  personal case also leaves an unpublished local file absent remotely. The interim fixture excludes work-item and
  claims pulls. Shared maintenance validates nullable measurements, publication cases retain retry measurements,
  and existing-backend assertions retain empty push pulls.

### `[x]` **1.10 The contract specification's Amendments log — § 2.6**

- _Goal:_ The contract specification describes the types the code has: its Amendments log carries one row per row of
  the amendments table, in the change that alters Part A's types.

- _Outcome:_ The completed contract's Amendments log appends A15–A24, one per decision row in § 2.6,
  preserving the original decisions and tracing each amendment to its ref-backend design sections.

### `[x]` **1.11 A companion keyed by its path — § 2.5, § 14.2**

- _Goal:_ Any file among a work item's records can be a companion, keyed by its path, while every name key today's
  callers build keeps its meaning and both existing backends serve what they served.

- _Outcome:_ Companion keys accept relative paths while conventional names and paired spec halves retain their
  filenames. Lifecycle coordinates, Design lookup, and rename maps preserve complete relative paths, keeping nested
  basename collisions distinct. Shared cases cover path-keyed records and owner renames; the interim backend retains
  its flat-layout refusal and conventional-name behavior.

## **Phase 2:** Git access

_Purpose:_ The executor capabilities the engine calls — cancellation that ends a whole process tree on every variant,
the 2.47 floor with its failure-time check, the ref-transaction helper and its lock waits, and the push helper — so the
write path and the push loop read typed outcomes rather than Git's text; and the two host properties the sync design
rests on, checked by hand before it is built.

_Exit criterion:_ The in-repo implementation, the reference backend, and the shared suite pass the amended contract's
cases, the transaction helper, the push helper, cancellation, and the floor check pass theirs, and GitHub and GitLab are
recorded holding the two load-bearing host properties.

### `[x]` **2.1 Cancellation that ends the call — § 6.1, § 11.8**

- _Goal:_ A Git call whose signal aborts settles promptly on every variant, with the transport helper or hook it
  started ended too, so the existing bounded reads and every deadline built on them hold.

- _Outcome:_ The stdin and both byte bindings accept signals; all four bindings end descendants before the Git child
  through shared cancellation support. Real lock waits, hung HTTP transports, and sleeping push hooks exercise aborts;
  admission and reference-transaction hooks cover pre-aborted calls, normal completion, and unchanged process groups.

### `[x]` **2.2 ARC's Git floor is 2.47 — § 11.3**

- _Goal:_ Every place ARC states its Git floor reads 2.47, and a store failure an older Git would explain names the
  version found and the floor, at no cost to a command that succeeds.

    - `[x]` **2.2.a The six sites**
        - The package engine, lockfile, quick-reference template and project copy, contributor prerequisites, and
          capability pin all require Git 2.47, with the pin naming reftable lock timeouts.

    - `[x]` **2.2.b The failure-time check**
        - `parseGitVersion`, `withGitVersionFloor`, and the reusable `checkGitVersionFloor` preserve each executor
          port's types and original failures, probing only after a completed usage error. Old Git receives an upgrade
          diagnostic; supported, unavailable, and unrecognized versions leave Git's error intact.

### `[x]` **2.3 The ref-transaction helper — § 11.1, § 11.2**

- _Goal:_ One `update-ref --stdin` transaction applies every ref change with its expected old value, and a failure comes
  back as a typed lost race naming each ref's actual tip, or as Git's own error where nothing raced.

    - _Amended in:_ 3.R (A28)

    - `[x]` **2.3.a The transaction and its outcomes**
        - `updateRefTransaction` applies changes atomically and re-reads exact ref names to report every lost race.
          Matching tips preserve Git's failure or name the Git floor; updates never follow symbolic refs into another
          namespace. Files and reftable cases include refusal repair and retry.

    - `[x]` **2.3.b Lock waits**
        - `gitRefLockArgs` shares the parameterized five-second lock settings across ref formats. A transaction
          commits after another process releases a contended lock in either format; stale locks retain a short override.

### `[x]` **2.4 The push helper — § 11.5**

- _Goal:_ A push with explicit `<oid>:<ref>` pairs, leases, and `--atomic` returns a typed outcome per ref and for the
  whole push, reading Git's porcelain lines and exit code, and its cause from `classifyRemoteFailure`, never prose.

    - `[x]` **2.4.a Parsing the porcelain**
        - `parsePushPorcelain` reads every success flag, client and server refusals, atomic collateral, and whole-push
          failures. Captured stdout and stderr retain server and pre-push diagnostics verbatim; atomic capability
          refusal takes precedence over unreachable classification.

    - `[x]` **2.4.b Running the push**
        - `pushRefs` sends explicit tips and deletes with leases, uses atomic batches for multiple refs, and pins
          non-interactive stable diagnostics. Real remotes cover all-or-none races, absence and delete leases, unchanged
          tips, capability refusal, hook repair, and network cancellation; an aborted call reports a timeout cause.

### `[x]` **2.5 The two load-bearing host properties — § 14.8**

- _Goal:_ Before the sync design is built on them, GitHub and GitLab are shown to narrow a protocol v2 ref advertisement
  to a command-line refspec's prefixes and to keep the `atomic` capability over HTTP, or the specification learns that
  they do not.

- _Outcome:_ The manual raw-Git kit proves prefix-filtered protocol v2 advertisements and atomic HTTPS pushes on
  GitHub and GitLab, with client version, dates, scratch repositories, and packet evidence recorded in
  `notes-storage-ref-backend.md`. It remains outside test tiers, CI, and the shipped package.

## **Phase 3:** Encoding and the read path

_Purpose:_ The ref backend's module and construction and the half of its first path that decodes refs into records:
stored paths, then the read path — the four-process listing with its decode, metadata files, record versions, and
diagnostics — and the manifest a state version names, each tested through `lib/store/create.ts` over refs planted with
plumbing.

_Mode:_ `slice` through Phase 4 — closes on records written, read, listed, and versioned through real refs in the
default layout.

### `[x]` **3.1 The backend module and its construction — § 1.2**

- _Goal:_ `lib/store/ref/` builds one backend from one ports object without running a command or reading a file, is
  reachable only through `lib/store/create.ts`, and can be tested before its write path exists.

    - `[x]` **3.1.a Construction**
        - `createRefStore` lazily composes the backend from explicit ports, reporting off-branch state without consulting
          a dependency. The backend binds production registrations and failure-time checks on all three Git ports;
          the shared virtual clock orders pending bounds before retry wakes and resolves cancellation without delay.
        - `history`, `changes`, `lookup`, and `maintain` throw naming the operation until their tasks build them, the
          shared suite's items over them excluded meanwhile (4.4.d)
            - _Retired in:_ Phase 8
        - `pull` and `push` throw likewise until Phase 9 builds them
            - _Retired in:_ Phase 11

    - `[x]` **3.1.b The store import rules**
        - Both private backend directories share `store-production` and `store-tests` enforcement. Only `create.ts`
          imports either backend entry; internal helper imports and type-only test imports retain their exceptions.

    - `[x]` **3.1.c The Git directories without a Git call**
        - `readGitDirectories` follows `.git` and `commondir` through file ports, resolving each relative path against
          its containing file. Main and linked-worktree answers match Git; malformed markers and unreadable common
          directories refuse without hiding the failure and succeed after repair.

    - `[x]` **3.1.d The machine ID and the actor**
        - `lib/store/machine-id.ts` owns shared ID reads, exclusive creation, and complete-winner readback. Notes sync
          delegates to it with lazy legacy candidates, retaining its API and adoption order. Worktrees share one ID,
          fresh clones mint distinct IDs, and the actor port remains unresolved during construction.

    - `[x]` **3.1.e The planting helper**
        - `ref-plant.ts` builds real nested trees, binary blobs, gitlinks, parented commits, and refs, with files-only
          missing-tip planting and loose-object removal for either ref format. Repositories carry a push-designated
          code remote; new Git fixtures use the shared teardown that tolerates background-GC races.

### `[x]` **3.2 Stored paths — § 3.2**

- _Amended in:_ 18.R (A24)

- _Goal:_ Every record maps to exactly one ref and one stored path, through one expansion every caller shares.

- _Outcome:_ `expandStoredPath` shares registry-based ref, record, family-root, metadata, and manifest expansion.
  Named and path-keyed companions keep their distinct encodings; completed work units, Errands, and cohorts take
  their quarter folders, while history retains the live layout. Expanded instances remain unique across refs.

### `[x]` **3.3 The read path — § 3.1, § 3.2, § 3.3, § 3.4, § 3.7, § 11.6, § 13.1**

- _Amended in:_ 18.R (A24)

- _Goal:_ `read` and `list` decode records, with their metadata, versions, and open conflicts, in a fixed number of
  one-shot Git processes; every tree entry maps back to one record, its ref's metadata file, its manifest, or a
  diagnostic, and a fault in one entry or ref is a diagnostic beside every other record rather than a failed listing.

    - `[x]` **3.3.R Exact diagnostics for invalid path keys — § 11.6 (A3)**
        - _Goal:_ Preserve managed-path admission while a backslash-bearing entry lists as `malformed` under its exact
          original path beside valid Unicode and quote-bearing records (A3).
        - Invalid decoded path keys become `malformed` diagnostics under their original path; valid Unicode and
          quote-bearing records remain in complete listings with `missed: true`, in both ref formats.

    - `[x]` **3.3.a The processes and the tip read**
        - Live reads capture tips and batch records with metadata in two processes, three with open conflicts; listings
          use four. Recursive NUL-framed diffs preserve path bytes and shared-blob instances; output limits split batches.
        - Slug-only references resolve once through live metadata. Identity absence refuses person reads and leaves
          identity families absent; local-only byte calls skip SSH rewriting. Kind filters retain open conflict links.
        - _Amended in:_ 3.3.R (A3)

    - `[x]` **3.3.b The decode**
        - Every registered home round-trips by kind, key, and owner. Specific roles and named companions precede generic
          paths; lineage owners come from the registry's UID map and typed conflict targets. Owner-form mismatches and
          invalid, reserved, derived, or machine-local keys remain exact-path diagnostics beside valid records.

    - `[x]` **3.3.c The metadata file**
        - Strict canonical metadata parsing refuses unsupported versions and unknown fields with a forward repair route.
          Composite format keys survive renames; unlisted records use the initial version. Retained primary facts place
          surviving records, and registry metadata names each lineage origin by UID.
        - _Amended in:_ 5.R2 (A6)

    - `[x]` **3.3.d Record versions**
        - A pure version helper digests the blob and each record's own metadata. Primary placement changes leave
          companion versions unchanged; equal bytes and metadata retain one version across distinct tips and read times.

    - `[x]` **3.3.e Diagnostics and the newer-format refusal**
        - Listings isolate exact-path content, format, size, owner, and object diagnostics; unreadable refs retain their
          own diagnostics beside readable and empty refs. Missing metadata repairs forward. Never-projected JSON reads
          canonically, projected records share a byte cap, and newer formats read after a supporting registry rebuild.

### `[x]` **3.4 The state version — § 4.1, § 4.2, § 4.3**

- _Goal:_ A state version names one saved state of the whole store, costs one Git process when nothing changed, and is
  never torn in the separate layout's reftable format.

    - _Amended in:_ 3.R (A28)

    - `[x]` **3.4.a The manifest**
        - In-process tree hashing mirrors registered state refs as gitlinks and matches Git under both object formats;
          the common config selects the hash without Git. Legacy, history, temporary, and forwarding refs stay outside
          the manifest, and empty SHA-256 stores use Git's empty tree.

    - `[x]` **3.4.b `version` and a live listing's token**
        - Captured manifests persist through one batch tree write and an expected-value token update; equal state reuses
          the token. Listings return their own snapshot's token. A competing checkout keeps its newer retained token,
          and bounded atomic cross-namespace writers leave reftable snapshots coherent while the files control tears.

### `[x]` **3.R Refused torn listings run again — § 4.3, § 11.1, § 11.6 (A28)**

- _Goal:_ A state-ref listing Git refuses because one directory read met a ref at two values runs again, at most three
  attempts in all, in the tip read, sync's ref sets, fetch negotiation, and the ref-transaction helper's re-read, while
  every other failure keeps Git's error (A28).

    - `[x]` **3.R.a The bounded listing retry**
        - `retryTornRefListing` (`lib/git/ref-listing.ts`) runs a listing again at once while a completed Git call
          fails with the duplicate-ref refusal, three attempts in all; every other failure and the last refusal
          propagate unchanged.

    - `[x]` **3.R.b The four listings take it**
        - `readRefTips`, `readSyncRefs`, `refFetchNegotiation`, and `updateRefTransaction`'s re-read run through
          `retryTornRefListing`; the notes-ref listing in `personal-disk.ts` stays outside. Refusals injected through
          `createRefStore` (`version`, a name-resolved `read`, `pull`) and the transaction's scripted re-read each
          fail with their site unwired.

- _Outcome:_ Every operation's tip read, a pull's sync and negotiation reads, and the lost-race read behind the
  write path's retries survive a refused torn listing, while the files-format snapshot control counts the same refusal
  as a tear (`bf0013ce7`).

## **Phase 4:** The write spine and the conformance fixture

_Purpose:_ The write path's spine — validate, resolve, lock, read under the locks, build, and commit through the
transaction helper — with provenance in commit messages, and the ref-backend conformance fixture over the default
layout, so the shared suite exercises the first path.

_Exit criterion:_ The ref-backend fixture in the default layout passes the shared suite's items 1, 2, 4, 6, 9, 10, 13,
and 15 for every served family, but for the assertions 4.4.d excludes by name, and holds items 3, 7, 11, 12, 14, 16, and
17 by interim exclusions, each naming the phase that retires it.

### `[x]` **4.1 Machine-local ref locks — § 11.4**

- _Goal:_ Every worktree of a clone serializes writes to one ref, in either layout, and a set of locks taken together can
  never deadlock another.

- _Outcome:_ Distinct advisory locks acquire in name order with the native default wait or an explicit limit; a failed
  acquisition releases every earlier handle and preserves cleanup errors. The lazy ref-lock factory nests full ref
  names under the code repository's common Git directory, shared by linked worktrees in either layout.

### `[x]` **4.2 The write path's spine — § 5.1, § 5.4**

- _Goal:_ `write` and `batch` land a put or removal as one commit per ref in one compare-and-swap transaction under the
  refs' locks, all or none, with nothing landing on refs an owner has left.

    - _Amended in:_ 4.R2 (A23)

    - _Amended in:_ 4.R (A22)

    - `[x]` **4.2.a Validation and resolution**
        - Input schemas refuse missing primary placement before Git; personal writes without identity refuse before
          resolution or locks and retry on the same store after configuration. Live names and authoritative UIDs resolve
          to current owners; a new slug's records share one minted UID, exercised through minimal tree/commit creation.

    - `[x]` **4.2.b Locks, reads, and expected versions**
        - Ordered ref locks wrap a fresh live/history capture; changed owner refs release and resolve again without
          recreating retired owners. Expected absence and versions report every stale record before mutation. Real
          contention retries after release; partial acquisition cleans up, and post-commit release errors stay errors.

    - `[x]` **4.2.c Build and commit**
        - Trees store canonical metadata and never-projected JSON while preserving other record bytes. Removals retain
          primary facts and unaffected versions. A bypassing writer's CAS race retries under the same ref locks with
          current trees; owner relocation or rename restarts resolution, and changed writes yield distinct state tokens.
        - _Amended in:_ 5.R2 (A6)

    - `[x]` **4.2.d Batches**
        - Cross-ref batches publish together, including a new personal ref with expected absence. A competing creation
          leaves both own mutations unapplied; stale-record preflight also preserves every ref. Concurrent batches
          naming overlapping refs in opposite orders both complete and retain all records in files and reftable stores.

### `[x]` **4.3 Provenance in commit messages — § 3.1, § 5.5**

- _Goal:_ Every commit renders its batch's provenance as D3 has a backend over Git render it, authored as the person, so
  `history` and `changes` read the stored provenance back and conflict labels name the machine.

    - _Amended in:_ 4.R2 (A23)

- _Outcome:_ Ref commits use a shared store message codec for caller provenance, optional code head and owner UID,
  operation batch ID, and optional clone actor. Parsing derives each changed record's owner UID from its reference.
  Control-bearing or quote-opening values round-trip as JSON strings, and Git authorship follows code-repository
  configuration, including writes before ARC identity exists.

### `[x]` **4.4 The ref-backend conformance fixture over the default layout — § 14.1, § 14.12**

- _Goal:_ The shared suite runs over the ref backend on real temporary repositories with a bare origin, each test
  copying a prepared template, its declarations stating exactly what the backend serves.

    - _Amended in:_ 4.R (A22)

    - `[x]` **4.4.a Fixture and declarations**
        - A public ref-store registration copies isolated files-format templates with local bare origins and a push
          designation. Both fixtures share the extracted generic test registry; ref declarations cover served families
          and scope-specific sync, and content uses one project owner, canonical JSON, and the project-identity schema.

    - `[x]` **4.4.b The hooks**
        - Public hooks retain companion names, state tokens, persisted data, real-lock races, and operation-time
          identity. Fault commits preserve sibling records and earlier missing blobs while producing each declared
          diagnostic; conflict reads also diagnose parsed target-owner mismatches.
        - `hold`, `produce`, and `repair` remain throwing placeholders.
            - _Retired in:_ Phase 8
        - Remote hooks remain throwing placeholders.
            - _Retired in:_ Phase 11

    - `[x]` **4.4.c The history item's owner UID**
        - Shared history assertions require `ownerUid` only when the record's reference has one. Project history before
          identity creation is accepted, while the reference and in-repo fixtures retain their existing UID checks.

    - `[x]` **4.4.d The named exclusions**
        - The full ref suite registers exact permanent and interim exclusions and validates every named exclusion's
          use. Conformance corrected name-only conflict ownership, placement-rule specificity, and writes preserving
          existing unavailable blobs.
        - Remaining local-engine assertions carry their retirement reason.
            - _Retired in:_ Phase 8
        - Pull, push, and synchronized primary-role assertions retain their later retirement boundary.
            - _Retired in:_ Phase 11

### `[x]` **4.R Atomic observations and native publication admission — § 5.1, § 5.3, § 5.4, § 11.4 (A22)**

- _Goal:_ Correct the write spine and check views under A22: observations and every registered check hold against
  one coherent before-state through local publication, with no effect from observation-only records and no renewed
  approval for unrelated writes.

    - `[x]` **4.R.a Serialize final native admission with publication**
        - Final admission recaptures logical/history tips under the existing publication lock and rebuilds changed
          captures internally. Registered checks stay protected through the pre-sweep view and CAS publication,
          including no-op writes; real read-only, new-owner, overlapping-writer, and pull races exercise both layouts.

    - `[x]` **4.R.b Bind serialized observations and captured before-history**
        - Native admission compares the shared strict observations against its captured before-state and passes
          validated writer action and observations to every check. History resolves only against captured live,
          archived, and retained tips; observation-only records publish no effect. Incoming callers and conflict
          fixtures use the pull/push and hunk contracts already served by this backend.

    - `[~]` **4.R.c Verify production admission and close the native contract correction**
        - Superseded by 4.R2.d, which verifies the production rule with the complete native creation facts its
          landed implementation requires and closes both A22 and A23 before 17.6.

### `[x]` **4.R2 Native owner births and retained receipts — § 5.7, § 14.3.2 (A23)**

- _Goal:_ Supply exact backend-owned candidate births and whole accepted-batch receipts to checks and bounded
  history queries, then verify the production admission rule before moving-remote segment verification.

    - `[x]` **4.R2.a Derive exact proposed owner births**
        - Resolved attempts retain fresh allocations; final locked admission derives one canonical complete
          inventory from actual proposed primary creations and supplies it to every check, including known-empty.
          Re-resolution rebuilds evidence, refused allocations publish nothing, and existing generations stay out.

    - `[x]` **4.R2.b Publish strict accepted receipts**
        - Accepted ordinary operations validate one complete receipt after checks and retain it on ordinary,
          conflict, archive/history, reopen, completed-refresh, and retirement commits. The canonical trailer codec
          distinguishes unavailable facts and refuses malformed, duplicated, or batch-mismatched advertised evidence.

    - `[x]` **4.R2.c Retain facts through queries and other publishers**
        - Bounded history, captured before-history, and changes retain whole receipts and validate every acquired
          physical message before filtering/grouping, including lifecycle discovery and boundary tips. Encountered
          batch disagreement refuses with authentic restoration or explicit regeneration remedies; repair resumes.
          Copies and fast forwards preserve facts; new sync, withdrawal, and registry commits carry complete-none,
          while imports retain unavailable facts. Native scenarios cover both layouts without expanding acquisition.

    - `[x]` **4.R2.d Verify production admission and the complete native contract correction**
        - Twenty-two native production scenarios cover final-gap read-only/conflict and dependency changes,
          source/removal additions, stale discard, unrelated admission, and exact acquisition refusal then repair in
          both layouts. Targeted reconstructions fail all cases; restored production behavior passes. Full native
          conformance and affected regressions cover 2,515 completed cases, with 118 declared skips; 710 decomposition
          unit cases also pass. Three stale sync-writer assertions were aligned with the trusted merge action and
          passed focused retries. A22 and A23 close before 17.6; domain logic stays in its production registration.

### `[x]` **4.5 The engine's first path** — validate exit criterion at segment scope

- _Goal:_ The ref-backend fixture in the default layout passes items 1, 2, 4, 6, 9, 10, 13, and 15 for every served
  family, with every other item and assertion excluded by name, reason, and retiring phase.

    - _Amended in:_ 4.R2 (A23)

    - _Amended in:_ 4.R (A22)

- _Outcome:_ Default-layout conformance exercises the stated items across every served family with the exact
  permanent and interim inventory recorded by 4.4.d. Fresh path checks retain valid Unicode and quote records and
  exact-path backslash diagnostics in both ref formats, closing A3's covering revalidation.

## **Phase 5:** The complete write path

_Purpose:_ Everything the spine defers — serialization rules, key rules and entry stamps, writer rules, the shared slug
namespace, `history` over a record's own ref, stale bases and no-op rewrites, conflict records and their labels,
`lookup` over live state, write checks, anchors, and the project's identity record — so every write the contract admits
lands exactly as specified.

_Mode:_ `layer` through Phase 8 — closes on the local engine complete in both layouts.

### `[x]` **5.1 Serialization rules — § 5.6, § 14.4**

- _Goal:_ One pure function refuses content that would wedge a push, leak a secret, or break canonical JSON, the same at
  every write and in the import's build, naming the first broken rule.

    - _Amended in:_ 5.R (A5)

- _Outcome:_ Exported pure `checkSerializationRules` with ordered byte, secret, Git-path, and canonical JSON
  admission. The ref writer checks puts before resolution and changed bytes before storage; public write/batch tests
  retain atomic refusal, repaired retries, and large never-projected records.

### `[x]` **5.R Companion path length admission — § 3.2, § 5.6 (A5)**

- _Goal:_ Verbatim companion path keys use per-segment bounds, while companion names combined with owner slugs retain
  the 2,040-byte bound (A5).

- _Outcome:_ `hasUnsafeStoredPath` applies the existing slug classifier to companion keys. Verbatim paths use
  per-segment byte limits; combined names retain their key limit, with public persistence, listing, atomic refusal,
  and repaired retries covered.

### `[x]` **5.2 Validation: key rules, parsers, entry stamps, and writer rules — § 3.2, § 3.3, § 5.1**

- _Goal:_ A put whose key, content, or writer the contract forbids refuses before any lock is taken — but for a path
  colliding with a stored record's, which only the tips read under the locks can show — and an entry kind's stamped IDs
  are the same on every retry.

    - `[x]` **5.2.a Key rules**
        - Pure reference and neighbor-path checks reject reserved coordinates, aliases, controls, and file/folder
          collisions before locks or against captured tips. Reads enforce the same key boundary; decoding shares its
          classifier, and concurrent prefix writes retain one valid record with typed refusal and repaired retry.
        - _Amended in:_ 7.4.R (A10)

    - `[x]` **5.2.b Parsers and entry stamps**
        - `prepareRefPut` runs the constructed parser and declared entry grammar before I/O, refusing malformed entry
          frames and deriving stable IDs from the original reference, expected base, and bytes. Writes prepare once
          across retries, preserve existing IDs and formatting, and recheck final serialized bytes before storage.

    - `[x]` **5.2.c Writer rules and the primary a record needs**
        - Declared writer verbs and explicit self-resolution gate mutations before locks; name and UID handles resolve
          through one captured namespace. Companion puts require captured primary metadata or a primary anywhere in
          the batch, retain placement after primary removal, and exempt conflict records.

### `[x]` **5.3 Live owners, the shared slug namespace, and lineage owners — § 3.3, § 5.1**

- _Goal:_ Every work item and cohort shares one slug namespace, so no write that finds another live holder of its slug
  leaves two live owners holding it, while a clash between machines stays writable until a rename resolves it, and every
  lineage record's owner stays named.

- _Outcome:_ Captured primary claims enforce the shared namespace while unchanged UID-addressed writes survive
  existing clashes. Transition puts/removals maintain independent registry origin names; reads resolve live owners
  before that map, conflict owners come from content, and origin UID mismatches retain exact-path diagnostics.
  Shared resolvers support the later history and changes operations; the lineage conformance exclusions are retired.

### `[x]` **5.R2 Independent lineage format versions — § 3.3 (A6)**

- _Goal:_ Each lineage transition's format key includes its origin UID, so reads, writes, and removals of one origin
  preserve every other origin's format and record version (A6).

- _Outcome:_ `refFormatKey` adds the resolved origin UID only to lineage transition coordinates. Decoding, stale
  admission, puts, removals, and fixture fault planting agree, preserving independent initial and newer formats and
  other origins' versions. Unsupported formats remain per-origin diagnostics with a supporting-registry retry.

### `[x]` **5.4 `history` follows a record — § 3.1, § 3.6**

- _Goal:_ `history` returns a record's versions as its own ref's log holds them, every one a commit where the record's
  version or presence changed, so a stale base finds the version it names.

    - _Amended in:_ 4.R2 (A23)

    - _Amended in:_ 4.R (A22)

    - _Amended in:_ 7.2.R (A9)

- _Outcome:_ `readRefHistory` compares path-limited commit snapshots by each record's own version and presence,
  retaining repeated versions, metadata-only primary changes, removals, and per-record owner provenance. Batched
  literal-path tree reads distinguish unavailable blobs from absence; restoration resumes the query. Historical
  bytes bypass current semantic parsers, and legacy commit messages remain verbatim.

### `[x]` **5.5 Stale bases, merges, and no-op rewrites — § 3.7, § 5.2**

- _Goal:_ A stale put of a merge kind merges from the version it names, every other stale write refuses, and a write that
  changes nothing makes no commit.

- _Outcome:_ Captured version admission checks both primary roles, collects unmergeable stale records, and admits only
  the current terminal-snapshot repair. Historical line/entry merges retain clashes, reject malformed stored IDs, and
  recheck merged bytes. Tree comparison preserves true no-ops; conflict resolutions share their refs’ locks and atomic
  publication while leaving unchanged subjects’ versions and histories intact.

### `[x]` **5.6 Conflict records and their side labels — § 3.7**

- _Goal:_ A write's clash is filed as write-once conflict records owned by the record they name, with each side labeled
  by the machine that wrote it, so one person's two machines read apart and any clone can place a hunk.

- _Outcome:_ Stale clashes land at family conflict paths in a second commit with merge provenance and the caller’s
  batch, lifecycle action, and code head. Each retry allocates fresh UUIDs. Labels use the subject’s actual change
  commit and this clone’s actor/clock, with committer-email and unknown fallbacks; lineage ownership decodes from the
  conflict target without requiring an origin-map entry.

### `[x]` **5.7 `lookup` over live state — § 8**

- _Goal:_ `lookup` answers a slug and a lineage origin among live owners in four Git processes, over the store's tips or
  over a write's views, so the write checks that guard a slug read what the write found.

    - _Amended in:_ 15.R4 (A21)

- _Outcome:_ Live primary lookup ranks current slugs over former slugs and reports every tied owner; lineage resolves
  UID paths and registry slugs with path-presence checks. A four-process metadata scan is cached by checkout and tips
  across backend instances, with one-process reuse and no failed-scan retention. The same selector accepts prepared
  tree sets for write views.

### `[x]` **5.8 Write checks — § 5.3, § 1.4**

- _Goal:_ Every registered write check runs under the write's locks over the state before and after the batch, and the
  first broken rule refuses the whole write.

    - _Amended in:_ 4.R2 (A23)

    - _Amended in:_ 4.R (A22)

- _Outcome:_ Registered checks run under all batch locks against captured-before and complete prepared-after views,
  including generated conflicts. Checks receive persisted merged bytes, preserve unparseable prior content without
  fields, derive writer authority from provenance, and refuse the whole batch in deterministic rule/write order.
  Public real-Git cases cover view isolation, absent refs, repaired retries, and shipped slug-edge settlement.

### `[x]` **5.9 Anchors and the manifests that travel with them — § 4.5**

- _Goal:_ A state version written into a record resolves on any machine that fetches the record's ref, because the
  anchor and its manifest land in one commit on one ref.

- _Outcome:_ Backend construction validates anchor cardinality and ref ownership. Writes resolve complete canonical
  manifests before publication and carry changed anchors' trees in the record commit; null removes the active subtree.
  Unchanged anchors and earlier manifests remain reachable, including empty trees. Public real-Git cases fetch only
  the owning ref, resolve its token, and cover atomic refusal plus repaired retries for unavailable manifests/subtrees.

### `[x]` **5.10 The project owner and its identity record — § 3.2**

- _Goal:_ A store holds one project, whose ID exists only once its create-only identity record does, and no reference to
  another project shares its paths.

- _Outcome:_ Project reads, listings, history, batch mutations, check views, and commit owners resolve the registry's
  identity without extra read/list processes. Backend-owned shape checks preserve canonical JSON and parsed fields;
  unavailable identity refuses with a repair route, while partial listings retain diagnostics and earlier conflicts.

### `[x]` **5.10.R Identity removal conformance — § 14.2 (A7)**

- _Goal:_ Removing the project identity invalidates its UID-bearing handle while the UID-less handle reports absence,
  and shared removal conformance retains recreation coverage without a new fixture exclusion (A7).

- _Outcome:_ Shared removal conformance uses the original UID-less handle only for identity, retaining its removal
  and recreation assertions. Real-Git coverage verifies expired UID refusal, UID-less absence, and recreation without
  adding any fixture exclusion; A7's covering revalidation remains at Task 8.6.

## **Phase 6:** Lifecycle moves

_Purpose:_ Every lifecycle move as one local transaction, as one clone sees it before any sync: archive and an Errand's
close into a quarter folder, reopen, writes to a completed item, abandon and decomposition with lineage, a cohort's
close, and renames and role changes.

### `[x]` **6.1 Archive and an Errand's close — § 7.1**

- _Goal:_ A placement write to `completed` ends a work item in one transaction: a final commit on its ref, its records
  in a numbered or named folder of its quarter's ref, and its ref moved under `refs/arc/history/`.

    - _Amended in:_ 4.R2 (A23)

- _Outcome:_ Archive and Errand-close batches lock the quarter and history destinations, stamp the final item,
  copy record/metadata blobs without anchor manifests, and move refs in one transaction. Reads and check views derive
  completed placement from assigned folders; numbering counts cohorts and current gaps. A missing quarter tree refuses
  before publication and admits the unchanged retry after object restoration.

### `[x]` **6.2 Reopen — § 7.2**

- _Goal:_ A placement write out of `completed` brings an item back under `refs/arc/work/` and removes every folder it
  holds, refusing where this clone lacks what the folder names.

    - _Amended in:_ 4.R2 (A23)

- _Outcome:_ Reopens validate every archive folder's batch against retained history, revalidate after acquiring locks,
  and publish the live move with every folder removal while preserving other owners. Check views retain independent
  archived/live states; missing or stale history and slug clashes refuse with repaired retries. Canonical quarter refs
  enter manifests, and slug reads keep selecting the live generation after a name is reused.

### `[x]` **6.3 Writes to a completed item — § 7.3**

- _Goal:_ Every write to a completed item's records lands on its history ref and refreshes its quarter folder in one
  transaction, so `history` reads one log and a reopen finds the latest state.

    - _Amended in:_ 4.R2 (A23)

- _Outcome:_ Completed writes and conflict resolutions validate retained history and refresh every folder, preserving
  each end's batch and quarter. Reads and listings select one latest folder; check views expose the prepared state.
  Shared quarter preparation composes archive, reopen, and refresh changes, while identical rewrites remain no-ops.

### `[x]` **6.4 Abandon, decomposition, and every other removal — § 7.4, § 7.5**

- _Goal:_ An item ends outside the archive exactly when a write leaves it with its lineage and no primary, and every other
  removal is an ordinary write of absence, so each end carries a record other machines read.

    - _Amended in:_ 4.R2 (A23)

- _Outcome:_ Lineage writes lock their origin and history destination. After checks admit the prepared batch, a
  primary-less origin with lineage moves to history with an empty final tree; history recovers paths from retained
  metadata. Other origin puts refuse unless the batch restores its primary or settles inbound during retirement.
  Missing lineage trees and retained history name repair routes without publishing partial changes.

### `[x]` **6.R Retirement checks before the final sweep — § 5.3, § 7.4**

- _Goal:_ A4's ref-backend retirement checks observe the batch's prepared mutations before the automatic sweep, refusing
  held inbound entries while admitting a batch that settles them itself.

    - _Amended in:_ 4.R (A22)

- _Outcome:_ Real-Git coverage runs the shipped lineage check with a declared inbound grammar. Held entries block
  abandonment and decomposition without ref changes; same-batch settlement or removal admits an empty final history
  tree. Adding another origin put still refuses, preserving the exception's inbound-only boundary.

### `[x]` **6.5 A cohort's close — § 7.6**

- _Goal:_ A cohort closes by a `completed` placement write to its document, its folder named as today's closeout sidecar
  with the coordinates seam-lifecycle's reference backend assigns, so the projection resolves it with the same letters.

- _Outcome:_ Cohort closes share the locked archive transaction, borrowing the highest matching same-quarter member
  number or allocating the next. Registered fields select parent letters across prepared, live, and archived documents.
  Closed-cohort edits refresh their folder through retained history; incomplete child evidence refuses before publication
  and admits repaired retries. Long slugs retain their full Git folder names.

### `[x]` **6.6 Renames and role changes — § 3.3, § 3.6, § 5.2, § 5.3**

- _Goal:_ A rename and a primary's role change move no ref and add no record blob, and `history` follows a record through
  both.

    - _Amended in:_ 6.6.R (A8)

- _Outcome:_ Renames move projected tree paths and completed folders, preserving record blobs and owner refs while
  updating former slugs and retained lineage metadata atomically. Companion aliases refuse with a re-key retry;
  UID-based renames repair live slug clashes. UID reads resolve the current name within two processes and retry a
  changed capture. History follows every former slug and primary role without attributing a reused path to another key.

### `[x]` **6.6.R Primary role replacement admission — § 5.2, § 5.3 (A8)**

- _Goal:_ Replace a primary's role with one put against its current version, preserving the shared contract's one
  mutation per logical primary; an absent expectation and duplicate role mutations refuse without changing state.

- _Outcome:_ Both replacement directions retain the UID, links, and actual historical roles, remove the old physical
  path, and run each kind's check against its own prior/next side with complete views. Either check can refuse without
  publishing; an admitted retry lands. Shared mutation and result uniqueness schemas remain unchanged.

## **Phase 7:** Changes, reads as of a state version, and lookup

_Purpose:_ Reading the store over time and by name: reads as of a manifest, `changes` between two manifests by the
namespace table and grouped by batch, `lookup`'s scan over ended items, claims, and commits, resolution of a reference
by every tier, and an item ref broken outside ARC.

### `[x]` **7.1 Reads as of a state version — § 4.4**

- _Goal:_ `read` and `list` as of a state version return the store as that manifest named it, or refuse with what this
  clone lacks and the remedy that recovers it.

- _Outcome:_ Saved reads and listings use immutable manifest tips through the captured-state readers, retain the
  listing token, and bind personal and project records to the saved identity. Missing manifests name rebuilding;
  missing ended tips name their history refs and admit restored retries. Archive, reopen, later names, and later
  primary roles leave the saved result intact; an unrelated quarter is unnecessary for a directly named live owner.

### `[x]` **7.2 `changes` between two manifests — § 4.6**

- _Goal:_ `changes` returns every landed mutation between two manifests, one entry per record per batch where its version
  changed, whatever ref carried it, or refuses naming what this clone lacks.

    - _Amended in:_ 4.R2 (A23)

- _Outcome:_ Immutable ref windows enumerate record versions and group them by batch, discovering ended and reopened
  owners through quarter folders and lineage changes. Copied archive records add no changes; saved archive batches
  bound the log even after later lifecycle moves. Missing manifests or retained history admit repaired retries;
  restrictions follow primary roles and compared lineage names without requiring unrelated histories.

### `[x]` **7.2.R Merge history follows ordered record state — § 3.6 (A9)**

- _Goal:_ A merge retaining the remote version adds no duplicate entry, while one retaining the local version adds
  that result after both branches, so the newest history entry equals the current record.

- _Outcome:_ `readRefHistoryDetails` walks local-before-remote order from oldest to newest, comparing a merge result
  with the preceding ordered entry while retaining parent comparison for ordinary commits. Both retained-side cases
  preserve branch writes and provenance; the newest entry matches the readable merge result.

### `[x]` **7.3 `lookup`'s scan over ended items, claims, and commits — § 8**

- _Goal:_ `lookup` answers every input kind in four Git processes with no index, ended items and claims among them, and
  an item ended outside the archive answers only through its lineage.
- _Outcome:_ The four-process scan includes latest completed folders and own claims, with current/former name tiers,
  global exact-SHA precedence, copy-key fallback, and branch and claim matching. Captured write-check views share the
  selectors and payloads. Retired origins remain lineage-only, partial Errands name their absent record, and held-here
  listings refuse with a supported retry.

### `[x]` **7.4 Resolution by every tier — § 5.1, § 8**

- _Goal:_ A reference without a UID resolves the same way for `read`, `list`, `history`, `changes`, and every write, over
  the tips the operation reads, so a create over a completed item's slug starts a new generation.
- _Outcome:_ Typed owner names use the lookup tiers for reads, owner-filtered listings, history, changes, and writes,
  over each operation's captured tips. Saved lineage references retain live-owner precedence, and generic companion
  aliases validate after owner binding. New-primary batches reserve one fresh generation even over ambiguous ended
  holders; name-only write replies retain their requested hint beside the resolved UID, preserving input-bound
  validation. Auxiliary records remain addressable when their owner has no primary.

### `[x]` **7.4.R Companion alias admission uses the resolved owner — § 3.2, § 5.1 (A10)**

- _Goal:_ Fixed role and reserved-storage paths refuse before I/O; generic companion aliases use the resolved owner,
  accepting a valid old-name-shaped path and refusing true aliases without partial write or batch effects (A10).
- _Outcome:_ Fixed-form admission shares registered path patterns with the decoder, retaining canonical companion
  names and paired keys. Only generic aliases wait for owner binding; true aliases refuse atomically and corrected
  keys land through write and batch. Older UID hints and former names retain valid literal paths; A10's covering
  revalidation remains at Task 8.6.

### `[x]` **7.5 A broken item ref — § 3.3, § 8**

- _Goal:_ A commit made outside ARC that breaks one item's ref costs that item alone: its records refuse
  `namespace-corrupt` with the forward repair, and `lookup` refuses only where the broken ref could hold a better answer.

    - _Amended in:_ 7.5.R (A11)

- _Outcome:_ Captures retain readable trees beside per-ref failures, applying highest-tier slug/SHA precedence and
  refusing uncertain lower matches. UID operations name the damaged ref; ordinary peer updates continue while unknown
  namespace claims refuse. Listings retain diagnostics and manifests retain damaged tips.

### `[x]` **7.5.R Forward repair preserves exact historical evidence — § 3.3 (A11)**

- _Goal:_ Verify that metadata repair restores current operations without inventing an ancestor's metadata, and that
  restoring missing objects separately recovers exact historical queries (A11).

- _Outcome:_ Tip admission returns typed refusals before history traversal. Forward metadata repair restores current
  operations; malformed ancestors and saved broken states remain explicit failures, while post-repair changes succeed.
  Restoring missing tip/root objects recovers exact history; A11's covering revalidation remains at Task 8.6.

## **Phase 8:** The separate layout

_Purpose:_ The store directory as the second layout of one engine — placed by the designation, made in reftable, named
with `--git-dir`, authored as the person, and serialized by the layout lock — with `maintain()`, many processes writing
at once, and the conformance fixture running over both layouts.

_Exit criterion:_ The ref-backend fixture passes the shared suite in both layouts with no exclusion beyond § 14.1's but
those 4.4.d holds until Phase 11, and every § 14.3 case that needs no pull passes.

### `[x]` **8.1 Reading the designation and the code remote — § 9.1, § 9.2, § 9.7**

- _Goal:_ The backend reads each clone's `arc-state` keys and its code remote the same from every worktree, so a write
  or pull that finds no store places it where the designation calls for.

- _Outcome:_ One counted designation reader combines common-directory and global config, resolving the code remote
  consistently across worktrees and excluding reserved or upstream candidates. Lazy selection preserves existing
  state; configuration-only pull stops report ambiguity before fetching.

### `[x]` **8.2 The store directory — § 9.7**

- _Goal:_ A separate-layout store is a bare reftable repository at `arc/store` in the common Git directory, shared by
  every worktree, whose commands never read the code repository's configuration but its person.

- _Outcome:_ First writes install a complete bare reftable store by sibling rename under the layout lock. Every
  executor pins its Git directory and cwd; commits use the code checkout's person. Both object formats, shared
  worktrees, environment isolation, interrupted-install retry, and missing-tip diagnostics retain their behavior.

### `[x]` **8.3 The layout lock — § 11.4**

- _Goal:_ No write commits into a copy a layout move has taken or left: every write and merge takes the layout lock last,
  around its commit alone, and restarts where the layout changed.

    - _Amended in:_ 16.R (A12)

- _Outcome:_ A shared commit step takes the layout lock after ref locks and retains it through publication. Layout
  changes release all locks and restart resolution; prospective blobs remain in memory until publication, preserving
  writes across a separate-store replacement at the same path. Migration modes retain public-caller verification.

### `[x]` **8.4 `maintain()` — § 12**

- _Goal:_ `maintain()` keeps a store packed that only plumbing writes, and reports each never-retiring ref's growth for
  the tripwire.

- _Outcome:_ Both layouts run Git auto maintenance and measure captured permanent tips, omitting absent refs and
  other identities. A real Git configuration failure remains retryable after repair; the shared maintenance assertion
  now runs while remote-only assertions retain their existing later retirement.

### `[x]` **8.5 Many processes on one clone — § 14.5**

- _Goal:_ Concurrent writers on one clone lose no write, retry a bounded number of times, meet only typed conflicts, and
  never bring back a ref or folder a lifecycle move left.

- _Outcome:_ Independent Node writers retain all 100 records on one ref and four refs in both layouts, with validated
  refusals and at most five version attempts. Two-process archive, abandon, reopen, and later-quarter races retain
  writes or return `not-found` without restoring obsolete refs or folders.

### `[x]` **8.6 Conformance over both layouts — § 14.1**

- _Goal:_ The shared suite passes over the ref backend in each layout with only § 14.1's named exclusions and those
  4.4.d holds until Phase 11.

    - _Amended in:_ 18.R2 (A29)

- _Outcome:_ Both prepared layouts run the local shared suite with only the permanent and remote-only exclusions.
  Real lock and recovery hooks, location-filtered views, current-role removals, fresh named generations, and refusal
  details meet the shared contract. Both-layout identity, lineage, path, alias, and repair replays close A5, A6, A7,
  A10, and A11.

## **Phase 9:** Two clones converge

_Purpose:_ `pull` and `push` between clones for live writes: the fetch into the tracking namespace, fast-forwards and
merges by kind, lost-race classification, the push loop's listing, leases, and atomic push, backoff and the deadline,
and each family's publish outcome.

_Mode:_ `slice` through Phase 11 — closes on clones that write, end, reopen, and meet faults against one remote and
converge with no lost write.

### `[x]` **9.1 The fetch — § 6.2, § 9.7**

- _Goal:_ One fetch round trip brings the remote's state, and only its state, into a tracking namespace no push, manifest,
  or listing reads, never naming a code commit as held.
    - _Amended in:_ 9.1.R (A13)

    - `[x]` **9.1.a Parsing the porcelain**
        - `lib/git/fetch.ts` reads all six flags with both tips and preserves the complete process evidence. Typed
          exit-1 stdout supplies per-ref refusals; only rowless failures use the remote-failure classifier.
          Unit fixtures retain real Git output, including verbose up-to-date reporting.

    - `[x]` **9.1.b The fetch**
        - Public `pull` fetches designated sources through explicit state-only refspecs, isolated tracking refs, local
          lock waits, stable diagnostics, and state-only negotiation. Both layouts cover all live namespaces, own-person
          filtering, pruning, history-backed saved reads, upstream URLs, and successful remote repair.

### `[x]` **9.1.R Empty fetches keep state-only negotiation — § 6.2 (A13)**

- _Goal:_ A pull with no state tips completes when the remote has no requested state, preserving state-only
  negotiation, and a nested tracking tip remains usable after the remote prunes its ref.

- _Outcome:_ Empty state fetches use the unmatched state pattern; the prefix scan discovers nested tracking refs.
  Both layouts complete empty/absent-history and final-tracking-prune cases. Protocol-v2 packets retain no held code
  commits, and cancellation preserves diagnostics as failure rather than completed acquisition.

### `[x]` **9.2 Merge after fetch — § 6.4**

- _Goal:_ A pull brings every fetched ref into local state as a fast-forward or a merge commit by each kind's mechanism,
  never as a check that gates and never bringing a deletion back.

    - _Amended in:_ 4.R2 (A23)

    - `[x]` **9.2.a Fast-forwards and merge commits**
        - Pull merges captured ref sets under ref locks and the layout-guarded commit step, with local-first parents
          and per-ref batches. Kind-driven records and field-wise metadata preserve deletions, whole-record clashes,
          merge-base versions, and record-changing labels. Lock refusal retains completed refs and supports retry.
            - _Retired in:_ Phase 10

    - `[x]` **9.2.b A quarter's merge renumbers**
        - Quarter merges select whole folders against their base, preserve published numbers, and renumber local
          unpublished folders after the remote in local order. Cohorts retain borrowed member assignments or take the
          next number; saved-state changes keep each merge's records under its one stored batch.

    - `[x]` **9.2.c Checks report and rules never gate**
        - Registered checks report every broken rule against immutable local and prepared views, including unreadable
          priors and primary-role replacements. Companion values retain inherited placement. Merges carry serialization
          violations and report oversized entries through listings.

    - `[x]` **9.2.d History and labels across a merge**
        - Public pulls preserve both merge sides, ordered replay of retained local versions, and stale-base writes.
          Nested merges keep restricted changes in the same order and label machines distinctly. A first pull carries
          the meta's saved-state anchor without implicitly fetching ended-item history.

### `[x]` **9.3 Classifying a push — § 6.9**

- _Goal:_ Every push rejection is a lost race the loop retries, a terminal refusal it reports with the server's own
  words, or one the next fetch's state settles, read from the push helper's typed outcome and from Git's text only in
  the named cases.

- _Outcome:_ `classifyPushOutcome` retains causal refs, distinguishes known races from refusals awaiting a state read,
  and makes atomic collateral inherit those causes. Whole-push failures retain their typed reason, and diagnostic
  streams remain verbatim for the loop's final refusal.

### `[x]` **9.4 The push loop — § 6.5, § 6.7**

- _Goal:_ `push` publishes every ref this clone wrote, never part of a local batch and never over a write it has not
  merged, and reports each declared family once.

    - `[x]` **9.4.a Listing and locks**
        - Captures changed state refs under sorted native locks, releasing and retaking the whole set when it grows.
          Concurrent batch publication stays intact; a held lock reports its path and permits a retry after release.

    - `[x]` **9.4.b Leases and the push**
        - Captures source and tracking tips for one atomic publication, leasing work/cohort refs on the current tracking
          tip or absence. Shared tracking advances require ancestry from the exact merged basis; a switched designation
          restarts without pushing. Upstreams use Git's rewritten push URL; code and backing remotes use their names.

    - `[x]` **9.4.c Tracking refs and the settled refusal**
        - Acknowledges successful refs with captured-value tracking CAS in both layouts and for pushes by URL. A fresh
          fetch settles unknown server rejections against the expected tips; unchanged state returns the server's
          verbatim reason, while moved state retries. A concurrent pull's newer tracking value survives acknowledgment.

    - `[x]` **9.4.d Outcomes per family**
        - Groups every served family once by status or failure, with retry measurements and separate missing-identity
          state. Subtree outcomes compare their own stored record versions, including format changes; quarter-only
          pulls identify archived families. A failed state pull retains its failure and stops publication.

### `[x]` **9.5 The deadline and backoff — § 6.1, § 6.7**

- _Goal:_ No `pull` or `push` stalls a session past 120 s, and retries back off by the host's own push time, so writes
  stay local for the next firing point whatever the remote does.

- _Outcome:_ Pulls and the push loop share one cancellable deadline across Git ports and cap native lock waits by the
  remaining budget. Retries use measured push duration and full jitter, with capped waits and measured exhaustion.
  Applied merge notices survive cancellation, including after remote acceptance; a fresh call reconciles saved writes.
  Unreachable results explain the separate store's transport configuration boundary.

### `[x]` **9.6 The conformance sync items in both layouts — § 14.1**

- _Goal:_ The shared suite's sync items, and the assertions 4.4.d holds for a pull or push, pass over the ref backend in
  both layouts, so no exclusion remains beyond § 14.1's.

    - _Amended in:_ 4.R2 (A23)

    - _Amended in:_ 18.3.R (A25)

    - _Amended in:_ 18.R2 (A29)

- _Outcome:_ A prepared peer clone, real origin fault controls, and a virtual between-attempt deadline exercise sync
  and repair through public stores in both layouts. All temporary sync exclusions are retired. Ordinary clashes keep
  the published side current, including metadata, removals, labels, and primary roles; local-first history remains.
  The early local cost comparisons exceed 1.5 times; `notes-storage-ref-backend.md` § CI cost history records the
  measurements, with the hosted bound still open under 18.3.

## **Phase 10:** Lifecycle across clones

_Purpose:_ Ends and reopens read from state rather than from refs' absence: leased deletes and by-name history fetches,
pending ends and reopens, a completed item's folder rebuilt from its merged history ref, late writes meeting ends, and
the withdrawal rule for two ends — the rules the model checks held.

### `[x]` **10.1 Leased deletes and by-name history fetches — § 6.5**

- _Goal:_ No push recreates a ref another machine's lifecycle move deleted, and a lifecycle move whose delete loses to a
  write holds rather than undoing.

- _Outcome:_ Push listings include leased lifecycle deletes and fetch pending history creates, updates, and deletes by
  name. Archive and reopen delete races merge competing writes into the retained or live ref before retrying; retained
  merges refresh visible folders in the same batch. A changed shared tracking tip forces another merge before a
  delete may lease it. Three-clone and sibling-worktree cases exercise both layouts.

### `[x]` **10.2 Another machine's end and reopen, read from state — § 6.4, § 6.6**

- _Goal:_ Every pull reads another machine's end or reopen from the records state holds, whichever merge brought them,
  so no live ref returns beside a published end and no end is lost to a reopen.

    - `[x]` **10.2.a Pending ends**
        - Shared records are merged before end detection against the held history. All pending histories are fetched
          together; live items move atomically into their merged histories and stay out of pending push listings.

    - `[x]` **10.2.b When the by-name fetch fails**
        - Failed fetches retain pending ends and prior notices, stop publication, and resume on retry. Missing history
          reports an `end-pending` remedy on every pull until a holding clone restores it.

    - `[x]` **10.2.c Pending reopens**
        - Folder removal and a fetched live tip move held history back to live state, retaining end removals beside
          lineage. A surviving unpublished end holds against that move.

    - `[x]` **10.2.d This clone's own unpublished end and reopen**
        - Record-backed predicates distinguish own moves, undone archives, and subsequent ends, including sibling
          history fetches. Local ends retain fetched reopen ancestry; retired histories containing conflicts stay ended.

- _Outcome:_ The lifecycle classifier is separate from merging and accepts the caller's publication predicate for a
  later copy. Named history observations come from verbose fetch rows, including unchanged tips. Historical quarter
  snapshots supply completed placement when an intervening reopen removed the current folder.

### `[x]` **10.3 A completed item's folder across clones — § 6.4, § 7.3**

- _Goal:_ A completed item's folder changes only with its history ref, so two machines' writes to it are filed once on the
  history ref and no folder rebuild drops a write another machine's refresh carried.

- _Outcome:_ Concurrent completed writes fetch their retained history together with pending ends, then publish the
  history and rebuilt folders with one batch and one set of conflict records. The pending refresh survives failed and
  missing-history fetches across repeated pulls. Named-history fast-forwards pair a history batch with a folder refresh
  only when needed, including when the local history ref is absent. Stale history operations refuse until the same
  operation can retry successfully after a named pull.

### `[x]` **10.4 Late writes and ends — § 6.6, § 7.4**

- _Goal:_ A late write meets an end by merging into the item's history ref, the end's version staying current, so the
  end's other writes stand as written and the late version is kept.

- _Outcome:_ Late writes preserve the end's accepted version and retain conflicts on history, including leased push
  races, restored live refs, and completed writes crossing reopens and later ends. Abandonment conflicts surface in
  pull notices for both prepared merges and fast-forwards. Native split-retirement cases refuse other origin puts
  without ref changes, then admit primary restoration alone or with a companion, or retirement by removal.

### `[x]` **10.5 Two ends of one item — § 6.6**

- _Goal:_ Of two ends of one item the first published holds: this clone withdraws its own unpublished end whole, and two
  ends both published are reported with the remedy that leaves one.

- _Outcome:_ Losing unpublished end batches are inverted in one transaction, including earlier lineage, cohort closes,
  and selective inbox returns and receipts; surrounding writes and decomposition children remain. Published double ends
  persist as notices until their histories are reconciled, lineage cleared, and every archive folder reopened. Lineage
  removal preserves branch authority through an exact archived-primary snapshot match.

### `[x]` **10.6 `arc rename`'s retry over a missing history ref — § 4.5**

- _Goal:_ Renaming an archived work unit on a clone that lacks its history ref completes: the verb pulls the refs the
  refusal names and retries, so the refusal never leaves the person at a dead end.

- _Outcome:_ `runStoreRename` pulls named history refs after a `state-unresolvable` refusal and restarts from the subject
  read once. Failed pulls retain the original refusal, and a renewed refusal remains actionable; restoring missing
  remote history lets the same rename finish with its archive number unchanged in either layout.

## **Phase 11:** Sync under faults

_Purpose:_ What a rewrite, a broken ref, a remote, or a hook does to sync: the ancestry check and its kept tips, local
tracking updates that fail, refs left out of a push, a partial clone's completeness check, carried code refs, hooks,
receivers without atomic pushes, and races a server catches.

_Exit criterion:_ Every integration case of § 14.5 passes on every change, in both layouts where the case names them,
but three that need later phases: the presence read's bound (12.2.b), an imported store's ended items (15.2), and a
carried ref under `moved` (16.1) and `designation-needed` (12.2.c); and the ref-backend fixture passes the shared suite
in both layouts with no exclusion beyond § 14.1's, 4.4.d's last set removed (9.6).

### `[x]` **11.1 The ancestry check — § 6.3**

- _Goal:_ A state ref whose new head does not descend from the last one seen is refused and reported with three ways out,
  while every other ref applies and a local tracking failure is never read as one.

    - _Amended in:_ 11.1.R (A15)

- _Outcome:_ Fetches retain tracking heads before pruning and check returned ancestry; refused refs keep their tips
  with executable store-specific repair commands. Only unpublished writes on a diverged ref stop publication; a still
  absent remote ref remains restorable. Failed local updates use actual tracking state, known keeper locks refuse
  recoverably, and applied ends release keepers. Supplemental rewrite notices survive later failures and displace false
  absence notices; shared-worktree lease races remain valid.

### `[x]` **11.1.R Failed fetch transaction evidence — § 6.3 (A15)**

- _Goal:_ A failed Git fetch's ordinary success rows are accepted only where actual tracking state establishes the
  update, preserving tips and classifying failed creates, advances, and deletes as local tracking failures (A15).

### `[x]` **11.2 Refs left out of a push — § 3.3, § 6.7**

- _Goal:_ A ref whose metadata a commit outside ARC broke, or whose end is pending, holds back exactly the unpublished
  batches that span it, and every other ref publishes.

- _Outcome:_ Damaged local and remote endpoints and pending ends exclude the transitive closure of unpublished
  batches, including merged history and owed lifecycle deletes. Independent refs still publish; held writes alone fail
  their families, separately from later transport or retry failures. Archive metadata cannot turn an unreadable local
  end into a reopen, forward repairs restore publication, and malformed historical merge labels remain per-ref notices.

### `[x]` **11.3 A partial clone's fetch — § 6.2**

- _Goal:_ A blobless or partial clone holds every state object after each fetch, so no read ever reaches the network.

    - _Amended in:_ 11.3.R (A17)

- _Outcome:_ Partial-clone fetches check the full reachable object closure locally and retry once with `--refetch`.
  An incomplete repair refuses without applying its remote and retains rewrite notices. Retries repair earlier missing
  ancestors with an unchanged or advancing remote; protocol and bitmap controls cover passive current and history reads,
  while unfiltered stores skip the traversal.

### `[x]` **11.3.R Completeness after a refused fetch — § 6.2 (A17)**

- _Goal:_ A tracking tip advanced by a fetch that later refused cannot hide missing ancestor objects from a later
  completeness check, including a retry after the remote advances again (A17).

### `[x]` **11.4 Carrying a code ref — § 6.8**

- _Goal:_ A code ref rides the state push in one atomic push where one receiver serves both, or as an ordered first leg
  otherwise, and its own refusal never fails or delays the state publish.

- _Outcome:_ Code tips are captured from the code repository and join its state receiver atomically or publish first
  as an independent leg for a separate store. Client rejections preserve their code-specific reasons and immediately
  retry state alone. Failed or diverged state still permits code publication; missing code destinations, independent
  transport failures, and an unlanded ref at the shared deadline retain distinct carry outcomes and safe retries.

### `[x]` **11.5 Hooks, atomic capability, and races a server catches — § 6.8, § 6.9**

- _Goal:_ A hook or a receiver's limits shape a push only as § 6.8 and § 6.9 read them, and a race the server catches at
  its commit is told from a refusal by state.

- _Outcome:_ An atomic-capability refusal falls back to ordered code and state while multi-ref state batches stay
  atomic. Hook refusals retain their text; deadline cancellation ends hooks and their children and names the hook's
  repair. Verified receiver mutations exercise leased creates, updates, and deletes. One code-tip observation attributes
  ambiguous atomic failures by lease or local ancestry without fetching code; unattributed failures wait for state,
  and code inspection failures and ordered-leg races leave state independently publishable.

### `[x]` **11.6 Sync between clones** — validate exit criterion at segment scope

- _Goal:_ Every integration case of § 14.5 passes, in both layouts where it names them, with no lost write, but the
  three the exit criterion leaves to 12.2.b, 15.2, 16.1, and 12.2.c, and the shared suite runs with no interim
  exclusion left.

- _Outcome:_ The sync scenario covers both layouts, fault recovery, and lifecycle races without lost writes. Both
  shared suites retain only permanent applicability exclusions. Empty fetches, failed tracking updates, and partial-clone
  completeness revalidate A13, A15, and A17.

## **Phase 12:** Designation and read sources

_Purpose:_ Who designates a clone's state remote at its first pull, how a due question is reported, the project check
before any `push` designation, a read source fetched and read through its own store, and the tracked backing-repository
pointer.

_Mode:_ `slice` through Phase 13 — closes on a clone that designates its state remote, reads an upstream, and moves
between layouts as its designation calls for.

### `[x]` **12.1 The tracked backing-repository pointer — § 9.7**

- _Goal:_ `storage.backing_repository` is a known configuration key, empty by default, that `arc config status` lists and
  `arc config validate` knows, while only the hidden `arc store` commands and a first designation act on it.

- _Outcome:_ The ordered configuration catalog and both configuration files declare the empty backing pointer.
  Status exposes it, validation recognizes it, and its unset repository-URL policy accepts the empty sentinel or a
  trimmed nonempty string. Explicit key inventories and complete settings fixtures include the new field.

### `[x]` **12.2 A first designation — § 9.2, § 9.3**

- _Goal:_ A clone's first pull sets its state remote without asking only where the answer cannot publish state the
  person did not choose, and otherwise reports the question with its answering command, never prompting.

    - `[x]` **12.2.a The decision**
        - The first-choice resolver preserves recorded roles, asks about a separate store or backing pointer, and
          automatically designates only the sole registry-bearing code remote. Upstreams are asked in Git order;
          reserved code remotes are ignored, local-only clones report no state remote, and held state requires an explicit
          layout move. The tracked-pointer port remains lazy and outside configuration policy.

    - `[x]` **12.2.b Presence reads**
        - Registry queries use the executor with their own cancellable sleep-port bound. Only the exact registry ref
          counts; candidate transport failures report no designation and retain a repair or manual-setting remedy.
          Real HTTP admission exercises the five-second bound and a later repaired pull; successful reads remain
          independent of the enclosing operation's pending deadline.

    - `[x]` **12.2.c The states a pull and push report**
        - Piped and actual terminal processes return the same choices and recommended commands. Recorded remotes sync
          despite absent, present, or changed checkout pointers. A designation question leaves state untouched while
          carried code publishes alone in both layouts; the earlier sync scenario and both full shared suites also run
          with designation active.

### `[x]` **12.3 The project ID and the `push` check — § 9.8**

- _Goal:_ No designation publishes one project's state onto another's, and a clone that never minted a project ID adopts
  the one its remote holds.

- _Outcome:_ Automatic designation compares project IDs in a locked temporary namespace before setting a role. A
  foreign ID refuses with both IDs and an answering command; failed fetches and incomplete repairs decide nothing.
  Candidate refs are cleared before acquisition and removed after the decision, including cancellation. Partial clones
  repair full object closure, and an unrelated teammate registry adopts the published identity without losing records.

### `[x]` **12.4 Read sources — § 9.6, § 9.8**

- _Goal:_ An upstream's state is fetched into its own namespace and read through a read-only store, never merged or
  pushed to, its refusals recover as the store's do, and a contributor's local-only store adopts its project ID.

- _Outcome:_ `createReadSourceStore` exposes the shared read engine over a remote's tracking namespace, with its own
  manifest keeper and no mutation methods. Read sources survive stopped state synchronization, recover named history,
  and offer only a source-scoped take-theirs remedy for rewrites. Local-only stores adopt an absent project identity
  through a create-only `sync` / `adopt-project-id` write, preserving existing IDs and state-remote authority.

## **Phase 13:** The migrate verb and layout moves

_Purpose:_ The migrate verb's engine and the hidden `arc store` commands: a move's record and lock, all-or-nothing
landing, the report a move returns, the layout move both ways in its restartable order, `arc store remote`'s show and
set, and the `move-incomplete` and `move-unfinished` states.

_Exit criterion:_ Every case of § 14.6 but those that need a follow, leaving the source, the forwarding record, or a
`backing` repoint, and § 14.7's layout-move cases, pass, and the conformance suite's sync items still pass in both
layouts.

### `[x]` **13.1 The move engine and the layout move — § 1.2, § 10.2, § 10.3, § 10.4, § 11.4**

- _Goal:_ A clone's store moves between the code repository's refs and the store directory with every ref, tracking ref,
  and kept tip, through one engine that keeps a record of each move across its switch and lands at its destination all
  or nothing, so an interruption at any step is finished by a rerun in the direction the record names, never reversed;
  tests reach every move through the two entries the `arc store` handlers call.

- _Outcome:_ Public migrate and remote-setting entries share a clone-wide move lock and leased root record. Isolated
  copies reuse pull lifecycle reconciliation under held layout serialization, then land through one ref transaction or
  directory rename. No-target recovery finishes the recorded direction before aligning designation and cleaning up.
  Both layouts retain state, history, tracking, and version keepers; sync reports incomplete switches and unfinished
  cleanup. Conformance remote toggles queue the public migration before the next store operation.

    - `--import` remains unsupported, naming the flag.
        - _Retired in:_ Phase 14
    - `--to` remains unsupported with a state remote and names it; no state remote returns a designation remedy.
        - _Retired in:_ Phase 17
    - `--leave-source` remains unsupported, naming the flag.
        - _Retired in:_ Phase 17

### `[x]` **13.2 The move lock and the record's guards — § 10.3, § 11.4**

- _Goal:_ Every move runs alone on its clone, and no run replaces another's record or proceeds past one it cannot read.

    - _Amended in:_ 18.R2 (A29)

- _Outcome:_ Real-Git public-entry cases cover clone-wide exclusion across worktrees, captured-value leases for
  record creation, replacement, and removal, and malformed-record refusal followed by repair. Competing records come
  from the real no-target producer; the existing killed-process fixtures cover abandoned-holder recovery.

### `[x]` **13.3 The report a move returns — § 10.5**

- _Goal:_ Every move returns one `MigrateReport` of what it wrote, and a `--trial` runs the same build and drops it, so
  a trial's report cannot drift from what its move does.

- _Outcome:_ Layout reports verify complete ref listings and project/identity scope with the person through both
  command entries. Invalid no-target and leave-source trial requests preserve refs, roles, and the physical layout;
  correcting the input permits the no-target move.

### `[x]` **13.4 `arc store remote` — § 9.4, § 9.8**

- _Goal:_ A person sees each remote's role and sets one, the setting moving the layout first where it must and refusing
  any setting that would strand state or publish it where the person did not choose.

    - Repointing `backing` refuses `unsupported` until 17.5 builds it
        - _Retired in:_ Phase 17

    - `[x]` **13.4.a Show and set**
        - Returns the actual layout and every configured remote's role, distinguishing backing from code remotes.
          Settings finish recorded moves first, combine both reports, reject competing push roles, and preserve a
          fork's separate state routing through fetch/push URLs while carried code reaches the fork.

    - `[x]` **13.4.b The project check at a setting**
        - Push settings, own-state answers, and first backing settings check project IDs before changing configuration
          or layout, under their own network deadline. Captured fetch tips and leased temporary-ref cleanup keep
          concurrent candidate checks independent and repaired targets are read afresh.

    - `[x]` **13.4.c The pointer at a setting**
        - Pointer-backed publication requires consent and reports the route for retaining the backing as a read source.
          Backing installs only after pointer, layout, role, and project checks; refusal preserves configuration and
          code-held state, and the same setting succeeds after repair.

### `[x]` **13.5 `arc store migrate` and the hidden `arc store` commands — § 10.1, § 1.2, § 1.3**

- _Goal:_ `arc store migrate` runs every move the verb defines through one engine, and `arc store` stays out of
  `arc --help` and every production path until the flip.

- _Outcome:_ Hidden migrate and remote commands bind native lazy ports and canonical input/prompt declarations.
  JSON retains reports and typed input refusals; publication applies only an affirmative terminal answer or explicit
  own-state input. Checkout-root resolution keeps destination reads local, and unreadable pointers preserve roles.
  Native actors use the shared machine ID, cancellation settles waits and bounds, and source guards confine entries to
  their handlers while ordinary backend selection stays unchanged.

### `[x]` **13.5.R Retained conflict inspection and explicit discard — § 2.6, § 6.6, § 14.13 (A16)**

- _Goal:_ Every ended-conflict notice leads to exact history inspection and explicit expected-version conflict removal
  while the owner stays retired, with executable hidden-command remedies (A16).

- _Outcome:_ Expected-version removals resolve exact retired conflicts on their history coordinate, including paired
  owner writes, without exposing ordinary retained records or reviving the owner. Notices retain review kinds and
  executable remedies; hidden `arc store conflict` inspects complete sides, discards explicitly, retries missing
  history once, and preserves malformed, unavailable, and changed-basis refusals. D6's forward amendment is recorded.

### `[x]` **13.6 Designation and layout moves** — validate exit criterion at segment scope

- _Goal:_ Every case of § 14.6 not needing a follow, leaving the source, the forwarding record, or a `backing` repoint,
  and every layout-move case of § 14.7, passes, and so do the conformance suite's sync items in both layouts.

- _Outcome:_ The designation/layout scenario and both layouts' shared sync assertions hold, including native command
  answers, deadline repair, read-source isolation, and interrupted/concurrent layout moves. Hidden command pages have
  curated summaries, and the lazy implementation inventory includes all three store handlers.

## **Phase 14:** The import's first path

_Purpose:_ The import as the migrate verb's one-time source, proven on live work units and open cohorts: the transform
module reading through the in-repo implementation, the project ID from the review gate, the landing through the move's
transaction, its rerun and publication, and the comparison harness every later source reuses.

_Mode:_ `slice` — closes on a fixture repository's live items imported and compared clean against the in-repo
implementation.

_Exit criterion:_ Over a fixture in today's substrates, `arc store migrate --import` lands every live work unit and open
cohort, its trial report matching what it does, every record comparing clean, and a rerun after the landing finishing
without duplicating one.

### `[x]` **14.1 The transform module and the import's entry point — § 1.2, § 10.8**

- _Goal:_ The import reads today's state through the in-repo implementation from a module the cutover can delete whole,
  refuses each record its build cannot land until the source is fixed, and lands into whatever layout the clone's
  designation selects.

- _Outcome:_ The deletable import transform reads the in-repo source through the composition point, pins each live
  work unit's reviews and Candidate chain to its selected meta revision, and prepares isolated commits in either
  layout. Serialization, key, parser, and entry-ID admission block the entire landing until repaired; legacy Candidate
  diagnostics retain their raw records. Trials read the repository identity passively, and occupied stores refuse
  before the build with typed project or version conflicts.

### `[x]` **14.2 Live work units and open cohorts — § 10.9**

- _Goal:_ Each live work unit and open cohort lands under one UID reused across its kinds, every record at its current
  content on its owner's ref.

- _Outcome:_ The prepared source includes every live work-unit document, an open cohort, the project inbox, and a
  machine record. Imports retain the work unit's one UID across its kinds, place the cohort on its own ref, preserve
  existing inbox IDs while stamping missing ones, and store machine bytes in canonical JSON in both layouts.

### `[x]` **14.3 Landing, rerunning, and publishing the import — § 10.4, § 10.5, § 10.11**

- _Goal:_ The import lands in one transaction with one `Arc-Batch` across every ref's landing commit, is finished by a
  rerun after any step, publishes through `push`, and reports in its trial exactly what it then lands.

    - _Amended in:_ 4.R2 (A23)

    - _Amended in:_ 18.R2 (A29)

- _Outcome:_ The import declares build, land, and publish steps, replaces interrupted gathering refs in the selected
  store, and lands all refs atomically under one batch. Its trial matches the landing after UID masking. Reruns
  recognize their existing project ID and resume publication without reading or duplicating source records, including
  after an unreachable remote or an interrupted successful push; failures carry the import retry remedy.

### `[x]` **14.4 The import's comparison harness — § 14.7**

- _Goal:_ After an import, every record the in-repo implementation lists in the source it imported reads the same
  through the ref backend — its content and every field both carry, never its version — but for the transforms the
  import's table names.

    - _Amended in:_ 18.R2 (A29)

- _Outcome:_ The differential harness reads an independent prepared source through public store, lifecycle, and
  layout APIs, comparing content, common parsed fields, and placement with per-kind normalization hooks. It ignores
  version differences and entry-ID stamps, normalizes machine JSON, and matches source diagnostics to retained records
  or diagnostics, reporting dropped records. The combined scenario compares clean after landing and an unchanged rerun
  in both layouts, while deliberate prose, field, and record loss remains observable.

### `[x]` **14.5 The import's first path** — validate exit criterion at segment scope

- _Goal:_ Over the fixture, the import lands every live work unit and open cohort, its trial matching, every record
  comparing clean, and a rerun after the landing duplicating nothing.

    - _Amended in:_ 18.R2 (A29)

- _Outcome:_ The first import path compares clean in both layouts, with masked trial and landing ref multisets
  agreeing and the combined rerun preserving every imported ref. The segment scenario also covers source repair,
  branch-selected review records, retained legacy diagnostics, and interrupted publication.

## **Phase 15:** Every source the import carries

_Purpose:_ The rest of the import's source table, each row landed and compared through the first path's harness:
completed items and closed cohorts, Candidate chains, lineage and renames, the Errand identity refs and the three kinds
with no in-repo home, branch links with their exclusions and task captures, parked work units, notes snapshots, personal
state at D5's layout, and the review mapping's port.

_Mode:_ `replication` — closes when every row of § 10.9 lands and compares clean, and every source the import cannot yet
carry refuses it.

_Exit criterion:_ Every case of § 14.7's import, notes-snapshot, post-import, and Candidate items passes over the fixture.

### `[x]` **15.1 Completed work units, closed cohorts, and Candidate chains — § 10.9, § 10.11**

- _Goal:_ Completed items land as an archive or close leaves them, under today's numbers, and each Candidate record's
  chain resolves through `history` exactly as today's reader resolves it over code history.

- _Outcome:_ Completed work units and closed cohorts retain their quarter coordinates, duplicate numbers, and gaps,
  with flat history trees and the next archive following the highest number. Candidate versions replay oldest first
  from the selected revision's plain path log, including merge-introduced and unmerged-branch records; broken chains
  remain reported and schema-rejected bytes remain intact. Distinct replay batches precede one shared landing batch,
  each ended folder agrees with its history, and every completed record compares clean without a new allowance.

### `[x]` **15.2 Lineage, renames, and abandoned origins — § 10.9, § 10.11**

- _Goal:_ Terminal transitions land as lineage under minted origin UIDs with every reference resolved to its owner's UID,
  and renames as former slugs, so `lookup` and `history` answer as an archive or abandon would have left them.

    - _Amended in:_ 15.R4 (A21)

- _Outcome:_ Terminal transitions land under minted origin UIDs with held work-item references enriched and registry
  lineage names indexed; each origin retains one empty history commit whose absent records read `not-found`.
  Renames become archived successors' former slugs. Lineage lookup accepts an origin slug while ordinary slug lookup
  retains D9's refusal. Imported work reopens, closed cohort corrections reach history, repeated peer pulls report no
  pending ends, and independent comparison permits only UID enrichment and rename-to-former-slug projection.

### `[x]` **15.3 Errand identity refs, descriptions, inbound lists, and queues — § 10.9, § 10.11, § 3.8**

- _Goal:_ Every Errand and claim the configured person's identity ref holds, and every held capture, buffer section, and
  execute-bound mark, lands in its new home and leaves its source, so nothing integrates, routes, or starts twice after
  the flip.

    - `[x]` **15.3.a Errands and claims re-homed**
        - Pinned configured-identity Errands land with owner, active placement, and descriptions; both claim roles
          re-home to the personal claims ref. Origin captures leave before stamping; changed digests and other
          identities are reported. Kept code-repository tips lease landing, local deletion, and post-publication origin
          cleanup across retries, with atomic local cleanup and manual origin remedies when no state remote exists.

    - `[x]` **15.3.b Queues and inbound lists**
        - Queues reuse inbox capture IDs and fractional ranks in file order. Draft buffers and held captures move
          into inbound lists with source dates, leaving no source copy or receipt. Malformed marks, missing targets,
          and undated buffers refuse before landing and succeed after repair.

    - `[x]` **15.3.c Entry stamps and tombstones**
        - Shared admission stamps missing IDs across all six entry kinds, preserving existing capture and queue IDs.
          Personal inbox and memory tombstones leave at acquisition; source comparisons retain every other byte.

- _Outcome:_ The three newly homed entry kinds use supplied registry grammars. Comparisons account only for moved
  entries, dispositions, stamps, dates, and personal tombstones across the default and separate layouts.

### `[x]` **15.4 Branch links, exclusions, and task captures — § 10.9, § 10.11**

- _Goal:_ Every commit whose footer names a closed task, and every live item's branch, resolves through the store's
  `lookup` to the same work unit as through the in-repo implementation's, each branch link recording whether ARC created
  the branch and which of its commits are no task's work, and a branch the import cannot place refusing it.

- _Outcome:_ Live branch links name the project identity and read the containing held tip without fetching. Missing
  and diverged branches refuse before other record failures, with repair guidance; an unresolved configured base
  carries the capture service's reason and remedy. Batched footer attribution captures only closed tasks with copy
  keys, while work-unit exclusions retain keyless non-merge commits and Errand exclusions stay empty. Created links
  follow the activation type grammar and Errand branch policy; reverse lookups agree with independent source reads.

### `[x]` **15.5 Parked work units — § 10.9**

- _Goal:_ A work unit parked from `Active` lands paused and in flight, its records as the branch it was parked on holds
  them, so nothing about a parked work unit is lost at the flip.

- _Outcome:_ Parked Active owners acquire every tracked work-item kind and their Candidate histories from the
  containing held branch tip, bypassing ordinary source precedence. Their records land Active; their metas gain a
  canonical Pause with the pointer's current reason, the preserved meta's owner, and the first pointer commit's
  committer time. Missing or diverged branches and invalid pause fields or prose refuse with repair guidance.
  Planning parks remain stubs, and independent comparisons allow only tip selection, Active placement, and Pause.

### `[x]` **15.6 Each person's notes snapshot — § 10.10**

- _Goal:_ The import refuses until each person's notes snapshot and every disk copy agree, carrying from disk only what
  notes save never writes, so no personal state is lost or resurrected by the import.

- _Outcome:_ Import compares every identity's notes snapshot with every registered worktree's disk copies before
  admission, using load's flat-file merge and workspace note history, including compacted-note ordering. Disagreements
  block landing; disk-only sources retain their bytes through serialization checks. Machine-local files and generated
  status stay outside both sides, and save/load or restored access reopens a refused import.

### `[x]` **15.7 Personal state at D5's layout — § 10.12**

- _Goal:_ Each person's files land at D5's layout, so from the flip no subdirectory of `.arc/user/<id>/` is a workspace
  and the identity root holds only ARC's surfaces and `scratch/`.

- _Outcome:_ Owned live session notes fold through the meta section writer, retaining handoff fields and blockers
  while removing obsolete progress fields. Other personal files move into scratch with live, ended, and former
  work-unit folders recognized; existing scratch stays put. Differing destination aliases refuse until reconciled.
  Independent per-person comparisons cover both layouts, and writer refusals reopen after a saved repair.

### `[x]` **15.8 What the import leaves out, and refuses until it lands — § 10.8, § 10.9**

- _Goal:_ The import carries no project machinery, constitution, machine-local state, or counters, and refuses, changing
  nothing, wherever a source needs a schema or mapping that has not landed.

- _Outcome:_ The trial inventories unmapped review-gate files from the Git common directory and refuses landing
  until a mapping is available; inaccessible inventories retain an actionable retry. Missing entry grammars name
  their kinds before any ref or identity mutation. The source inventory excludes machinery, constitution, ignored
  machine files, and counters while retaining tracked Candidate, boundary, and transition state.

### `[x]` **15.9 The review mapping's port — § 10.5, § 10.8, § 10.9**

- _Goal:_ Whatever mapping fills the port, the import hands it every review source of live work and lands only what it
  returns, so once the review family's mapping lands no review fact of live work is lost or carried in today's shape.

    - _Amended in:_ 15.R (A2)
    - _Amended in:_ 15.9.R (A20)

- _Outcome:_ The pure mapping receives byte-exact gate files, selected live review sources, minted work-item UIDs, and
  original Errand claim IDs. Returned revisions replace live legacy review records, pass normal admission with
  mapping-specific refusals, and replay in separate batches; completed review records remain as found. Coverage,
  in-flight reviews, unlanded archived branches, and identity races refuse with a repair route.

### `[x]` **15.9.R Current Candidate input and coverage — § 10.8, § 14.7 (A20)**

- _Goal:_ Amendment A20 supplies every live selected Candidate's current bytes independently of committed history,
  accounting for its plain tracked path exactly once so an uncommitted review fact survives the mapping.

- _Outcome:_ Current Candidate bytes are supplied separately from real committed versions, including uncommitted working
  content; boundary-only inputs carry null. Plain-path current coverage is independent of every historical source,
  omissions and repetitions refuse through repair, and the mapped current bytes survive import.

### `[x]` **15.R Review import claim IDs and source units — § 10.8 (A2)**

- _Goal:_ Amendment A2's port preserves each Errand's original claim ID and accounts for canonical file and folder
  source units exactly once, so review lineages join the correct imported work item and no source disappears in a
  name or grouping mismatch.

- _Outcome:_ Mapping rows join held Errands by unchanged claim ID, keeping a reused slug's ended review lineage out
  of its minted UID. Canonical left-behind folders with reasons cover supplied gate descendants once; missing,
  repeated, folder/file, and nested-folder coverage refuse until repaired. Current Candidates and committed versions
  retain separate source identities alongside boundaries and exact gate paths.

### `[x]` **15.R2 Production entry import compatibility — § 10.9, § 14.7 (A18)**

- _Goal:_ Amendment A18's imported descriptions, inbound lists, and queues serve their production readers in both
  layouts, with queue references bound to their inbox captures and keyless branch exclusions retained.

- _Outcome:_ Production-registry imports serve descriptions and inbound entries through `listInbox` under their
  declared sections, and `listErrandQueue` retains ordered personal references sharing both existing and minted
  capture IDs. Existing native link cases retain keyless exclusions by project and SHA in both layouts while omitting
  keyless task captures; generic conformance and source comparisons remain intact.

### `[x]` **15.R3 Errand branch comparison coverage — § 14.7 (A19)**

- _Goal:_ Amendment A19's branch comparisons resolve imported Errands through both stores for every admitted branch
  prefix, without a transform allowance for `fix/`, `chore/`, `refactor/`, or `hotfix/`.

- _Outcome:_ One independent source/target fixture pair covers `fix/`, `chore/`, `refactor/`, and `hotfix/` Errands.
  Every branch resolves to the same Errand through both stores and imports as `created` with no exclusions; the
  existing missing-branch refusals and adopted-name behavior remain covered without a new transform allowance.

### `[x]` **15.3.R Session synchronization port binding — § 6.1, § 12 (A14)**

- _Goal:_ The status session's synchronization port calls the same selected store as its operational reads, so session
  entry, named-history retries, explicit status fetches, and local maintenance reach the backend after the flip.

- _Outcome:_ The selected store supplies pull and maintenance through the status context and default deciding-verb,
  recovery, and handoff bindings. Native configuration states, failures, partial outcomes, notices, and unsupported
  measurements retain their meaning. Named-history retries preserve the original repair guidance. Every status mode,
  including slug fetch, renders incomplete pulls and every notice, retaining ended-conflict details even when a later
  read refuses; local queries stay offline, and the pre-flip session arms stay dormant.

### `[x]` **15.R4 Durable terminal former-name lookup — § 3.3, § 8, § 10.9 (A21)**

- _Goal:_ Amendment A21's terminal lineage lookup keeps exact UID and current-name precedence while retaining
  authenticated former names through retirement, sync, withdrawal, and import, without widening direct operations.

    - _Amended in:_ 18.R2 (A29)

- _Outcome:_ Private per-UID registry evidence retains authenticated former names across rename, retirement, lineage
  recreation, sync, and end withdrawal. Lookup preserves exact UID/current-name precedence and direct-operation
  authority. Import resolves known chains to terminal generations, with independent source comparison and actionable
  refusal/retry for unresolved or cyclic chains; both layouts retain the bounded metadata scan.

### `[x]` **15.10 Every source the import carries** — validate exit criterion at segment scope

- _Goal:_ Every import, notes-snapshot, post-import, and Candidate case of § 14.7 passes over the fixture.

    - _Amended in:_ 15.R4 (A21)

    - _Amended in:_ 18.R2 (A29)

- _Outcome:_ Independent source comparisons cover every imported record and admitted transform, notes snapshots and
  source retirement, post-import writes and history, Candidate chains, and review mapping. Production entry readers in
  both layouts, all admitted Errand branch prefixes, claim-lineage joins, canonical source coverage, and separate current
  Candidate bytes close A2, A18, A19, and A20 against the same fixture suite.

## **Phase 16:** Remote moves

_Purpose:_ Moving a project's state between remotes: the copy over the old remote's whole state, the forwarding record
with the registry as each remote's move version, forward-then-switch, the delete rounds with their licensed re-copies,
moves that cross, end, or change the layout, and a move that stops publication without unpublishing.

_Mode:_ `slice` through Phase 17 — closes on state moved between remotes, every clone following it, and no write lost.

### `[x]` **16.1 The forwarding record — § 10.6, § 3.1, § 9.8**

- _Goal:_ A remote the state left carries one control ref naming the project and the registry commit the move landed,
  so no teammate's push restores state there and every pull knows the state moved.

- _Outcome:_ Strict forwarding-record reads stop state application and publication at the departed remote while carried
  code can publish alone in either layout. Malformed records and moved read sources refuse; failed fetches retain the
  follow remedy and independent tracking notices stay visible. Standalone project IDs protect explicit and automatic
  designation without setting a role on refusal. Replaced tracking tips adopt the fetched record, pruning leaves no
  control keeper, and repaired operations return to their normal paths.

### `[x]` **16.2 The copy — § 10.2, § 10.3, § 10.4**

- _Goal:_ A remote move copies the old remote's whole state, every person's identity refs and every history ref among
  it, onto the new remote in one atomic push that merges where this project's state already sits there.

- _Outcome:_ Complete source acquisition and isolated destination views merge through the shared lifecycle engine in
  code-repository temporary refs without adopting unseen state locally. Captured fetch and push URLs survive designation
  changes; strict project and forwarding checks precede publication. The record precedes the atomic leased copy, and
  a lost lease restarts acquisition. Definitive first-run refusals clean up; interrupted or uncertain copies retain
  their records and deleted forwarding roots for repair. Copied tips and observed heads remain pinned, and trial
  reports include the same copy, merge, and control-ref deletion actions.

### `[x]` **16.3 Forward, then switch — § 10.2, § 10.3**

- _Goal:_ The old remote carries the forwarding record before this clone switches, so of two moves off one remote only
  one switches, and the switch carries exactly the heads the copy holds.

- _Outcome:_ Atomic forwarding leases license every switch; all seven remote directions preserve the copied tracking
  and seen heads. Layout changes borrow the remote move’s record, the tracked pointer preserves unrelated text,
  and resumed switches retain newer sync heads. Native worktree races cover move exclusion and redirected pushes.

### `[x]` **16.4 The delete rounds — § 10.2, § 10.3**

- _Goal:_ The old remote ends holding only the forwarding record, and no ref leaves it at a tip the new remote does not
  hold.

- _Outcome:_ Fresh move-version reads license leased re-copy and atomic deletion at the recorded URLs; only a final
  forwarding-only listing releases the record. Late writes, ends, reopens, and unseen identities survive restart and
  repair. Copies stop on unreadable merges, retirement labels come from the merged registry, and completed moves retain
  their reports when a remote setting follows them.

### `[x]` **16.R Migration commit modes through public callers — § 11.4 (A12)**

- _Goal:_ Verify held and unlocked commit modes through real migration calls, preserving the backend's private test
  boundary and the original lock behavior required by 8.3 (A12).

- _Outcome:_ Public layout and remote callers prove held and unlocked commits with real contending locks.
  The separate-layout remote copy anchors its two-parent merge in the code repository’s temporary refs before release;
  the completed move retains both sides’ records at its destination. A12 is revalidated.

### `[x]` **16.5 Moves that cross, end, or change the layout — § 10.3, § 10.7**

- _Goal:_ Of moves that cross on one remote, the registry's leases let exactly one land; a move another has overtaken ends
  without stranding a clone; and a move that changes the layout runs it as its switch.

- **Additional Context:** `notes-storage-ref-backend.md` § The move model check

    - `[x]` **16.5.a Crossing moves**
        - Native competing moves settle through registry leases before either losing clone switches. Overtaken moves
          release their journals, report every leftover, and preserve the winner’s forwarding route on abandoned copies.
          Crossed copies continue until a forward lands; propagation retains the last landed copy’s lease across retries.

    - `[x]` **16.5.b Moves back and moves ended**
        - Interrupted moves back resume across copy and forwarding boundaries. Overtaken cleanup ends without writing
          to either receiver, retaining recovery for missing move versions. Native three-clone moves preserve newer
          forwarding records at old sources and abandoned copies, with every remaining source ref reported.

    - `[x]` **16.5.c A move that changes the layout, and what a move reports**
        - Both layout directions restart with their copied heads and retain writes made during interruption; switched
          backing moves sync and finish without a target. Reports retain landed merge actions, conditions, and remedies,
          while trials include cleanup and publication residuals without ending records or clearing copied heads.

## **Phase 17:** Following a move and leaving the source

_Purpose:_ How every other clone reaches the state's new home: the follow's candidates, judged against the record the
old remote holds, its copy, switch, and deletes; leaving a source that can no longer be read; `--leave-source` ending a
recorded move; and `arc store remote` during a follow and when repointing `backing`.

_Exit criterion:_ Every case of § 14.6 and § 14.7 passes.

### `[x]` **17.1 The follow's candidates — § 10.6, § 9.6**

- _Goal:_ A follower takes as the state's home only a remote that holds the commit the move landed, so a checkout behind
  a move never publishes state onto a fork that copied the registry before it.

    - Until 17.2.a builds the steps an answer runs, a setting naming a remote the follow names refuses `unsupported`
        - _Retired in:_ Phase 17

- _Outcome:_ Follow judgment fetches the old remote's current record and each checkout-derived candidate into isolated
  namespaces, accepting only the same project's registry containing that move. It names ambiguous candidates, rejects
  stale forks and onward moves, preserves read followers' own identities, and directs code-publishing contributors to
  the separate read-source route. Read failures retain state and roles with repair remedies; stale tracking is dropped.
  The remote-setting guard allows the old remote's `off` and reserves accepted answers for the follow.

### `[x]` **17.2 The follow's copy, switch, and deletes — § 10.3, § 10.6**

- _Goal:_ A follow asks about its destination, copies what raced the move before switching, and clears it from the old
  remote after, deleting only where its own listing found the record it judged by, so every clone of each move ends on
  one remote holding every write.

    - `[x]` **17.2.a The follow's steps**
        - Recorded explicit roles, fresh licensed copies, restartable layout switches, and leased clearing through
          `follow*.ts`; wired the terminal question through the migration handler. Native callers cover late writes,
          lifecycle merges, interrupted steps, move-back races, and a second worktree's publication retry.

    - `[x]` **17.2.b Every clone following the moves of Phase 16**
        - Extended native remote-move fixtures so every clone follows interrupted, crossing, move-back, and onward
          records to one home. Covered both clearing timings, unseen-ref restoration after a follower's push, preserved
          destination publications during re-copy, and the next pull's history after every switch.

### `[x]` **17.3 Leaving the source — § 10.6**

- _Goal:_ A clone whose old remote can no longer be read re-homes its own state onto the new remote from its last view,
  without ever reading or deleting on the old one, and says what it leaves there.

- _Outcome:_ Added last-view source departures with isolated destination admission, captured heads, and a retained
  copy/switch record. No source transport or deletion occurs, and tracked pointers stay untouched. Code receivers must
  identify the project and hold any tracked move commit. Native CLI and restart paths carry late ends and unpublished
  work across both layouts; source, destination, and input refusals retain concrete repair routes.

### `[x]` **17.4 `--leave-source` ending a recorded move — § 10.1, § 10.6**

- _Goal:_ A recorded move or follow whose old or new remote is gone for good ends by the person's command alone, the case
  told by a read of the new remote, never by the person's call.

- _Outcome:_ Recorded remote moves and follows now end explicitly without local role, layout, or pointer changes.
  A fresh destination read licenses either retaining the old control or withdrawing only the mover's own control in
  one registry-leased atomic push. Failed withdrawals retain their journal and repair route; reports preserve source
  leftovers, pointer repairs, and deleted forwarding roots. Both clones can leave to the restored home, and a matching
  `--to` resumes a recorded follow while other destinations and trials remain refused.

### `[x]` **17.5 `arc store remote` after a follow and when repointing `backing` — § 9.4, § 9.8**

- _Goal:_ A `backing` repoint re-homes this clone's state with a copy only where it will push there, and a setting
  after a follow, or from a checkout behind one, reaches the state's home or refuses naming the route there.

- _Outcome:_ Outside a due follow, a backing push repoint reuses the retained-view departure and its restartable copy;
  read/off repoints copy nothing and clear the old tracking and kept tips. Push admission checks the pointer's actual
  candidate URL before changing designation. Native cases retain late ends and a reopen's owed history delete, keep
  read-to-push settings copy-free, and recover stale-pointer and missing-code-home refusals through their named routes.

### `[x]` **17.6 Moving state between remotes** — validate exit criterion at segment scope

- _Goal:_ Every case of § 14.6 and § 14.7 passes, every clone of each scenario ending on one remote holding every write.

- _Outcome:_ The effective scenario combines 13.6's designation/layout coverage, 15.10's import coverage, 4.R2.d's
  unchanged native lifecycle-move coverage, and fresh move, forwarding, follow, leave-source, backing-repoint, and
  read-source runs in both layouts, including their CLI paths. Every scenario retains all accepted writes at its
  selected remote; the evidence union is recorded in `notes-storage-ref-backend.md`.

## **Phase 18:** Hosts, platforms, and cost

_Purpose:_ The evidence no per-change CI run gathers: the bursts, the Windows and macOS pair with the Windows budget and
its conditional reader or object batching, the CI cost measurements, the hand-run host kit, the pack cost of shared
personal names, and the suites that survive the cutover.

_Mode:_ `replication` — closes when every platform, host, and measurement § 14.5 and § 14.8–§ 14.12 enumerate has run
and is recorded.

_Exit criterion:_ The bursts and the Windows budget pass on their dispatched runs, complete conformance costs and
workload differences are recorded, affected tier/job cost rows are re-measured and updated with baseline deltas, and
Linux portability marginal cost, the host kit's results, the pack-cost measurement, and the surviving suites are recorded
in `notes-storage-ref-backend.md` (A25).

### `[x]` **18.1 The bursts — § 14.5**

- _Goal:_ Twenty worktrees and twenty clones writing at once lose no write, on the platforms where contention costs most.

    - `[x]` **18.1.a Native contention suite and dispatch gating**
        - Both native layouts retain every insertion and observed removal from twenty independent worktree writers
          and converge twenty publishing clones on the exact final remote tip. Workers preserve the captured basis
          and use production locks, clocks, identities, and publication backoff.
        - The exact suite joins portability selection under `ARC_STORE_BURSTS`, with 900-second process/test bounds.
          Linux enables it on dispatch; the existing scheduled/dispatched Windows and macOS pair enables it too.

    - `[x]` **18.1.b Dispatched platform evidence**
        - Full dispatch `39557918142`, source `c39ed3778`, passes all four twenty-writer burst cases on Linux, macOS,
          and Windows, preserving exact final inboxes and remote tips. The pair uses `run_portability_pair: true`.
          Native logs and artifacts are recorded in `notes-storage-ref-backend.md`; Windows's independent write-budget
          failure remains open under 18.2.

    - `[x]` **18.1.c Publishing failure diagnostics**
        - Boolean pull and publish assertions retain full native result details on failure, including the initial
          clone pulls and final convergence pulls. Their no-notice and accepted-publication requirements stay intact.

    - `[x]` **18.1.d Isolate full writer bursts from unrelated test execution**
        - A separate native sequence group preserves all twenty concurrent writers inside each burst while excluding
          other selected tests. Assertions, production deadlines, timeouts, and tier/cost/portability membership remain.
        - The live-configuration witness first demonstrated burst overlap with ordinary files, then proved timing and
          bursts each run once without overlap while ordinary files still run concurrently. The previous dispatched
          Windows failures remain recorded in `notes-storage-ref-backend.md` § Second dispatched platform results.

    - `[x]` **18.1.e Bounded publication continuation in the burst harness**
        - All twenty writes remain accepted once. Publishing workers retain up to five public attempts, continuing only
          typed recoverable timeout/exhaustion results; terminal, configuration, notice, and credential stops remain.
          Production deadlines and the 900-second harness bound stay intact.
        - Both layouts complete native timeout recovery and all four twenty-writer bursts with unchanged exact final
          inbox and remote-tip checks.

### `[x]` **18.2 The Windows budget and the portability pair — § 11.7, § 14.10**

- _Goal:_ A dispatched portability run passes `--git-dir` with Windows paths and reftable on NTFS, and times `version`,
  `read`, `list`, `lookup`, and `write` within their budgets over 600 work items in twelve quarters.

    - _Amended in:_ 18.2.R2 (A27)
    - _Amended in:_ 18.R2 (A29)
    - The separate layout's suites join the `portability` tier's list ungated, each listed by file name: 8.2's
      `store-ref-directory.test.ts` and 8.6's `store-ref-separate-conformance.test.ts`, so the pair runs `--git-dir` and
      reftable on each platform and the Linux `portability` job runs them on each reviewed pull request it runs on;
      `ARC_STORE_BURSTS` gates only the bursts (18.1) and the timing suite (18.2.a)

    - `[x]` **18.2.a The timing run**
        - `[x]` **18.2.a.1 Bulk fixture, measurements, and portability selection**
            - One native-produced prototype supplies exact record/registry formats; one bulk stream builds identical
              600-item, twelve-quarter stores in both layouts, retaining complete per-quarter creation receipts.
              Eleven samples measure each operation with verification outside the timing window.
            - Directory and separate-conformance suites join portability ungated; timing retains `ARC_STORE_BURSTS`.
              Windows alone enforces the budgets. Both layouts' medians and native durations persist as CI artifacts.

        - `[x]` **18.2.a.2 Dispatched budget evidence**
            - Both complete platform jobs pass in dispatch `39664555792`; Windows satisfies all calibrated limits
              in both layouts. Exact source, medians, complete native outcomes, and the separate Linux harness
              failure/correction are recorded in `notes-storage-ref-backend.md`.

    - `[x]` **18.2.b Only where a budget is breached**

        - `[x]` **18.2.b.1 Batched blob and tree construction**
            - Staged blobs use one filter-free native hash batch with temporary-file cleanup; each prepared tree uses
              one child-first native tree batch, sharing exact SHA-1/SHA-256 hashing with manifests. Bulk nested
              documents retain CRLF bytes; interrupted staging publishes no record and permits a fresh retry.

        - `[x]` **18.2.b.2 Operation-scoped object reader**
            - Native read, list, and lookup calls reuse byte-framed local-only readers within each operation and close
              them before returning. Backend-owned readers drain before explicit or fetch-triggered maintenance;
              cancellation, overflow, malformed framing, native failure, and fresh-operation recovery are covered.
              Native reader and write-batching cases join portability selection for the dispatched pair.

    - `[x]` **18.2.c Git-serialized prepared fixture paths**
        - Copies recognize Git-escaped template roots as well as literal and slash-normalized spellings. The real-Git
          regression copies and publishes to an independent remote; path assertions compare resolved filesystem
          addresses across host separator spellings.

    - `[x]` **18.2.d UID-scoped archived acquisition**
        - Archived point reads, mutation resolution, and check-view point reads select complete folders by metadata
          UID before acquiring or decoding unrelated prose. Cross-quarter selection, retained-history validation,
          fresh admission captures, and complete-list diagnostics retain their existing meaning.
        - Native resource regressions exercise both layouts and join portability selection. The measured reduction
          and remaining fixed native calls are recorded in `notes-storage-ref-backend.md` § Archived acquisition cost.

    - `[x]` **18.2.e Isolate operation timing from other test execution**
        - A dedicated native project/sequence group isolates the unchanged timing case; supported integration, lane,
          and cost-run selectors include it once. Other portability cases retain normal parallelism and artifacts.
        - A native configuration regression first observed overlap, then proved isolation with an explicit three-worker
          override while ordinary files still overlapped. Local eleven-sample results are recorded in
          `notes-storage-ref-backend.md` § Timing isolation; hosted Windows acceptance remains open.

    - `[x]` **18.2.f Remove redundant native acquisition**
        - Retain all fixed Windows operation budgets; record each resource reduction and its refusal/recovery proof.

        - `[x]` **18.2.f.1 Share tree and blob acquisition**
            - Root-tree acquisition shares the operation's native reader with blobs; recursive enumeration and
              missing/empty-tree distinctions remain. Real listings return every record with one fewer native process.
            - Both layouts first exposed the separate tree-check launch; the shared reader closes before return.

        - `[x]` **18.2.f.2 Reuse successful immutable write evidence**
            - Successful immutable objects and complete tree enumerations are reused within one repository-bound write
              attempt; mutable namespace captures and publication locks remain fresh. A later write refuses a missing
              physical blob and continues after repair; retaining evidence across public calls fails this witness.

        - `[x]` **18.2.f.3 Carry selected point-read evidence**
            - Named reads retain the selected archive folder and revalidate root/interior trees and ranking objects
              from their unchanged capture plan; selected record bytes are acquired afresh. Hot archived reads use two
              native processes, preserving ambiguity, aliases, retained history, and physical-corruption refusal/repair.

        - `[x]` **18.2.f.4 Bounded hosted timing diagnostics**
            - An explicit dispatch input runs only the unchanged operation timing case on Windows/macOS, clearly named
              as diagnostic; ordinary platform runs retain the complete native suite. Post-measurement native traces
              retain a verified write in each layout without entering the median windows.

    - `[x]` **18.2.g Re-measure costs after platform corrections**
        - Source `c39ed3778` supplies the four sequential warm/retained local tiers; dispatch `39557918142` supplies all
          ten hosted job clocks, complete conformance populations, and Linux portability file costs. All fourteen
          advisory rows retain the 35% allowance; both baseline deltas and prior overruns remain recorded in
          `notes-storage-ref-backend.md`. Windows operation and host acceptance remain separate.

    - `[x]` **18.2.h Reuse writer capture and physical confirmations**
        - _Goal:_ Eliminate duplicate metadata/blob acquisitions and the discarded initial code-store capture without
          removing any lock-boundary namespace check or reusing evidence across write attempts.
        - _Outcome:_ Repository selection supplies its proven initial code-store capture; metadata loads use captured
          object IDs, and staged blobs enter attempt evidence only after Git confirms every identity. Both layouts
          satisfy the tighter native resource bound with their physical-object refusal/repair and race checks intact.

    - `[x]` **18.2.i Retain the new native boundaries in platform selection**
        - The named-acquisition and publication-continuation suites join the existing portability selector; both
          remain ordinary integration cases as well. The selector contract first exposed the missing membership.

    - `[x]` **18.2.j Identify platform evidence and retain diagnostics**
        - Platform matrix jobs name their OS, avoiding ambiguous same-name log retrieval. Full dispatched pair runs
          retain the existing post-measurement write traces; the complete native workload and numeric limits remain.

    - `[x]` **18.2.k Stage final metadata within the native write attempt**
        - _Goal:_ Batch retained-history and completed-folder metadata with record blobs, reuse only native-confirmed
          immutable evidence within the same attempt, and attribute the history and quarter commits coherently while
          retaining the layout lock, admission views, fresh namespace comparison, and expected-old publication.
        - _Outcome:_ Both layouts batch final metadata with record bytes, preserving completed-folder end identity and
          sharing the attempt's commit actor. The native resource regression retains exact history/folder contents and
          reopen behavior; the unchanged 600-item profile uses 19/default and 21/separate commands. Hosted timing
          acceptance remains with 18.2.a.2; details are in `notes-storage-ref-backend.md` § Final metadata batching.

    - `[x]` **18.2.l Bound diagnostic dispatch to its platform measurements**
        - Explicit timing-only dispatch skips unrelated Linux build/lint/test jobs and selects the Windows/macOS
          pair even without the additional pair flag. Ordinary push, pull-request, schedule, and complete dispatch
          selection remain unchanged. Job-graph comparison evidence is retained in `notes-storage-ref-backend.md`.

    - `[x]` **18.2.m Materialize UID-qualified check reads at point scope**
        - UID-qualified work-item/cohort reads retain their captured owner and archive tips while acquiring only the
          selected archive folders' blobs. Complete inventories remain independent; later list/lookup and name-only
          or project reads retain the full captured namespace. Native witnesses preserve refusal/repair and complete
          inventories after point reads; the 600-item trace uses 14/default and 16/separate processes.

    - `[x]` **18.2.n Calibrate the budget before further mechanism changes**
        - `[x]` **18.2.n.1 Retain caller-visible native baselines and write-stage costs**
            - Profiling retains eleven raw samples for Git startup, a repository probe, and the actual namespace
              capture through production adapters, plus runtime/image identity. Write profiles retain parent-call
              intervals and their overlap-aware union; all diagnostics run after unchanged acceptance medians.
        - `[x]` **18.2.n.2 Assess hosted cost and the original target's basis**
            - Dispatch `39663125872` retains eleven-sample native baselines and write intervals in both layouts.
              Windows writes measure 1,077.811/1,077.347 ms; minimal Git calls cost 57–59 ms against the original
              local 30 ms premise. The budget assessment and proposed limits are recorded in the notes; no limit
              changes, enumeration mechanism, or portability acceptance are claimed.

    - `[x]` **18.2.o Correct the full-run test harnesses**
        - `[x]` **18.2.o.1 Supply ordinary workflow input context**
            - The authored-condition evaluator supplies the empty `inputs` object present on ordinary events, so
              light-content build/E2E selection remains exercised after diagnostic dispatch conditions were added.
        - `[x]` **18.2.o.2 Keep the snapshot control to one ref iteration**
            - Both state namespaces use one listing prefix, excluding the saved manifest. The native probe retains
              visible files-format tearing, complete stable readback, and 128 consistent reftable snapshots during
              writer progress, without accepting native errors as successful observations.

### `[x]` **18.2.R Operation-scoped acquisition during writes**

- _Goal:_ Native `write` and `batch` reuse the existing bounded object reader within one public call, close it on
  every exit and before maintenance, and preserve fresh publication checks and later-call corruption detection (A26).

    - `[x]` **18.2.R.a Bind mutation calls to the existing reader coordinator**
        - Both public mutations use the existing operation coordinator, retaining exact invocation bindings,
          cancellation, output bounds, and layout-specific repository selection without extending evidence lifetime.

    - `[x]` **18.2.R.b Prove resource ownership and successful continuation**
        - Native traces prove one reader per mutation call and close before successful/refused/error return or
          maintenance; interrupted calls preserve state and retry successfully. Physical-object refusal/repair and
          atomic-admission regressions remain intact in both layouts. Existing portability selection includes these
          witnesses; Windows acceptance remains open under 18.2.a.2.

- _Outcome:_ The unchanged 600-item trace uses 15/default and 17/separate processes, including one native object
  reader in each layout. Reader ownership remains per public call; immutable evidence remains per write attempt.
  Hosted acceptance is separate; local measurements and reconstruction evidence are in `notes-storage-ref-backend.md`.

### `[x]` **18.2.R2 Calibrated Windows operation limits**

- _Goal:_ Both layouts enforce the approved 100/300/600/300/1,500 ms version/read/list/lookup/write medians over the
  unchanged 600-item, twelve-quarter workload, and the complete dispatched portability pair passes (A27).

    - `[x]` **18.2.R2.a Align timing assertions with the calibrated limits**
        - The timing assertion table changes read/list/write to 300/600/1,500 ms. Eleven samples, population,
          validation, reader ownership, resource coverage, and diagnostic/full-run selection retain their meaning;
          the complete hosted run remains the acceptance witness under 18.2.R2.b.

    - `[x]` **18.2.R2.b Complete the dispatched portability pair**
        - Dispatch `39664555792` passes both complete platform jobs at `ec617a92e`; Windows writes measure
          729.986/727.299 ms and every calibrated median passes. The unchanged backend/workload retains this
          platform evidence across the two test-harness fixes; their Linux CI confirmation remains separate.

### `[~]` **18.3 CI cost — § 14.12**

- _Goal:_ Running both backends until the cutover costs CI no more than the bound: each layout's ref conformance run
  within 1.5 times the in-repo conformance's time on the same GitHub-hosted runner.

    - _Amended in:_ 18.3.R (A25)
    - _Amended in:_ 18.R2 (A29)
    - Per-file times from the `duration-results-integration-*` artifacts a dispatched run uploads (`ci.yml`), the in-repo
      conformance file (`__tests__/integration/store-in-repo-conformance.test.ts`) and each layout's ref conformance file
      read from one run on `ubuntu-latest`, the shard that ran each named beside its time
    - The tier and CI-job rows the new files touch re-measured after the last one lands, as 1.1 measured them, and
      updated to those figures, each delta from 1.1's baseline recorded in `notes-storage-ref-backend.md` § CI cost
      history
    - The Linux `portability` job, which has no budget row, read from its own per-file times on one dispatched run: the
      time the separate-layout files (18.2) add to each reviewed pull request it runs on, recorded there beside the rows

    - `[x]` **18.3.a CI measurement preflight**
        - The standalone Node change-facts entrypoint loads cancellation support only for signaled executor calls.
          Command-surface coverage requires remote designation to register while the default backend stays in-repo.

    - `[x]` **18.3.b Errand-import CLI source fixture**
        - The E2E source now creates the open Errand's recorded branch, as the integration source already does;
          both layouts import and rerun without weakening missing-branch admission.

    - `[x]` **18.3.c Personal raw-tree fixture closure**
        - Eleven native suites plant and inspect canonical identity-suffixed personal paths, including historical
          damage/recovery and oversized-entry diagnostics. Logical references and merge, conflict, history, and
          rollback assertions retain their existing meaning.

    - `[x]` **18.3.d Join synchronization fixture**
        - Registered join and identity-setup cases supply schema-shaped outcomes through their selected store's public
          pull; production synchronization binding and rendering run unchanged. The first-identity pull precedes
          configuration, preserving its supplied inbox; neighboring cancellation/recovery assertions remain covered.

- _Outcome:_ A25 supersedes the interim ratio with complete cost reporting and tier/job budget updates in 18.3.R.
  The original ratio misses remain recorded; supersession does not turn them into passes.

### `[x]` **18.3.R Record complete conformance cost and retain tier/job budgets — § 14.12**

- _Goal:_ Record complete hosted conformance costs and workload differences without an interim legacy ratio, retaining
  all native coverage, Windows budgets, and affected tier/job cost measurements and baseline deltas (A25).

    - _Amended in:_ 18.R2 (A29)

    - `[x]` **18.3.R.a Complete-file hosted evidence**
        - Dispatch `39543872100` retains exact-head complete file times, shard identities, and completed populations
          for the in-repo suite and both native layouts in `notes-storage-ref-backend.md` § CI cost history.
        - The existing registration inventory explains unequal workloads; all native cases and historical ratio
          misses remain, without matched-cohort hosted machinery.

    - `[x]` **18.3.R.b Final tier and job cost closure**
        - Warm, retained twelve-worker captures cover unit, integration, combined lane, and E2E; ten hosted job clocks
          update the affected rows with the existing 35% allowance. Baseline deltas and Linux portability file costs
          are recorded in `notes-storage-ref-backend.md` § CI cost history, including the missing local E2E before value.
        - Raw file work, admission waits, and job clocks remain distinct; native coverage and fixed Windows operation
          budgets remain required. The successful source tree is bound in the retained measurement evidence.

### `[x]` **18.4 The host kit — § 14.8**

- _Goal:_ The checks no CI host can run are run by hand against the real hosts, GitHub and GitLab holding every one, so
  the design's two unverified load-bearing assumptions are settled before the flip.

    - `[x]` **18.4.a The kit**

        - `[x]` **18.4.a.1 Native owner and receiver probes**
            - The manual kit binds production store ports, checks default-clone isolation and exact public roundtrips,
              captures stale single/atomic/delete leases and replay refusals, and verifies forwarding refusal and
              successful publication after repair. A local receiver supplies the unsupported-atomic diagnostic.
            - Temporary native refs are removed only through exact leases; raw stdout/stderr and structured results
              remain in the requested evidence directory. GitHub/GitLab use their existing CLI logins.

        - `[x]` **18.4.a.2 Provider policy, fork, and separate-role probes**
            - Invocation-owned production Git bindings isolate owner/member credentials and appliance trust. Native
              role refusals recover after access restoration; protected code stays held while state publishes.
              Provider-created forks are checked against copied code and state refs, including Azure's full copy.
              Capability failures remain nonzero, and unreached checks remain unverified.

    - `[x]` **18.4.b The run**
        - GitHub, GitLab.com, GHES, self-managed GitLab, Bitbucket, Gitea, and Forgejo completed every probe. Azure
          lacks protocol v2 narrowing and atomic pushes; its multi-ref refusal, single-ref continuation, roles, policy,
          and full-state fork copy were observed separately. Evidence and limitations are recorded in
          `notes-storage-ref-backend.md` § Real-host backend trials. The public policy fixture was deleted afterward.

### `[x]` **18.5 The pack cost of shared personal names — § 14.9**

- _Goal:_ Whether personal files' shared names cost a host's pack is measured, so renaming stored paths stays a forward
  change taken only if it bites.

- _Outcome:_ Sixteen personal refs with forty snapshots each were pushed and repacked in three controlled corpus
  variants. Exact paired blob inventories isolate the filename difference; three repetitions record both sizes and
  repack times in `notes-storage-ref-backend.md` § Personal-path pack cost.

### `[x]` **18.6 The suites that survive the cutover — § 14.11**

- _Goal:_ The cutover's deletion pass has the list of suites it keeps and retires: one running the shared suite or testing
  a consumer through the contract survives, and one targeting the in-repo implementation, notes, or Errand refs by name
  retires.

- _Outcome:_ `notes-storage-ref-backend.md` § Cutover suite inventory names preserved shared/native and consumer
  assertions, implementation-specific retirement groups, mixed-suite splits, dormancy exceptions, and helper
  sequencing. Surviving consumers rebind before their old fixture helpers retire.

### `[x]` **18.R Identity-suffixed personal storage — § 3.2 (A24)**

- _Goal:_ All five personal content kinds use identity-suffixed stored basenames while retaining logical keys,
  projection addresses, role-alias refusals, logical file/folder collision refusals, and public operation behavior.

    - `[x]` **18.R.a Canonical mapping and namespace admission**
        - Five registry templates append the identity to stored content basenames, keeping independent logical and
          projection addresses. Admission checks both physical overlap and the logical namespace before I/O.

    - `[x]` **18.R.b Native behavior and import closure**
        - Both layouts preserve exact names/content and logical keys through read/list/history/changes and sync;
          aliases and both collision classes refuse atomically, then corrected keys succeed. Full native conformance
          and personal import comparisons retain the original logical keys without an old-name reader.

### `[ ]` **18.R2 Per-change cost and selection of the store suites — § 14.14, § 14.1, § 14.12 (A29)**

- _Goal:_ The store suites cost at most half their 2,633 s summed merge-gate time at `212f6432e` and run only on changes
  that reach them, every required case keeping its coverage on every change that reaches it (A29).

    - `[x]` **18.R2.a Identity once per operation — § 1.2**
        - `createRefBackend` gives each public operation a context from `withOperationIdentity`
          (`lib/store/ref/operation-identity.ts`), whose identity resolves on first use and serves the rest of the
          operation, its retries, bound repositories, and nested pulls. `store-ref-identity-once.test.ts` counts one
          resolution in a write, a push with its nested pulls, and a pull that brings in work, and a later write taking
          a changed identity; the cases are integration cases because unit tests run no Git and import no private store
          module. The shared default ports are unchanged.

    - `[x]` **18.R2.b The separate layout's declared subset and the split default run — § 14.1**
        - `registerStoreConformanceSuite` takes a run: one item range or the per-change subset its registration declares
          (`ConformanceRuns`, `fixture-contract.ts`). Every file registers the whole registration and runs only the
          cases its run selects, through `caseTest` and `caseSkip` (`suite-tools.ts`), so each file's declaration
          inventory checks exclusions and the subset against every case of the registration
          (`validateConformanceInventory`), in-repo and reference fixtures included; declared ranges must cover every
          item once. The separate registration declares the layout map's 50 cases by item and case ID
          (`separate-subset.ts`), run by `store-ref-separate-conformance-subset.test.ts`;
          `store-ref-separate-conformance.test.ts` keeps the whole suite. The default run splits into
          `store-ref-conformance-{records,reads,sync}.test.ts` (items 1–6, 7–15, 16–17, about 60, 69, and 69 s of the
          197 s file), whose cases together equal the whole registration's 1,068.

    - `[x]` **18.R2.c The verified cut set — § 14.14**
        - The value reviews' candidates, the layout map's, and every case the reviews kept in both layouts were checked
          against source, the layout rule, and the criteria each evidences, and approved as one set: about 255 s of the
          2,633 s baseline, the restart rows growing by 26 under a recovery state counting what the rerun reads in each
          configuration a move runs in. `notes-storage-ref-backend.md` § A29 records the decisions and each move's sets
          with their standing rows; the derivations and the verified set sit beside the value reviews in the checkout's
          `.internal/storage-ref-backend-tools/verification/selection/`.

    - `[x]` **18.R2.d Apply the approved set — § 14.14**
        - Cases that observe no layout code beyond selection, binding, and the commit step run in the default layout;
          each removed duplicate's cover first gained its approved assertion; the gap cases are closed; and each move
          keeps one restart row per recovery state under Reading R, 28 rows cut and 52 added. 18.R2.h's two mid-switch
          rows and `[separate, publish]` amendment remain there. `layout-move:476` [default] is withheld: it exposes
          F8, a push's listing read racing a move in (`.internal/storage-ref-backend-tools/verification/apply/`).
          13.2, 14.3, 14.4, 14.5, 15.R4, and 15.10 cite removed cases.

    - `[ ]` **18.R2.h Defects the derivations found — § 10.3, § 10.5, § 10.11**
        - Each defect gets its exposing case first, then its fix. An interrupted local-only import that re-homed
          transient refs reruns to `ok` without the notices naming origin's copies: `store-ref-import-landing`'s
          [separate, publish] restart seeds one. A remote move overtaken by a move back inside its switch, at
          `remote.switch` and `layout.designation`, ends with no record beside its pointer, designation, and layout
          changes; where the specification leaves the outcome open, the failure enters `amend-design`. A step hook
          after the layout source's delete reaches the states no hook interrupted, and its rows for leaving the source
          both ways expose layout gathering refs outliving a switch its predicate completes. A separate-layout import
          trial stops creating the store directory, and the advanced-origin errands case [separate] stops relying on
          it. Kept import tips a rerun no longer re-homes are pruned.

    - `[ ]` **18.R2.e Prepared multi-clone states — § 14.14**
        - `copyPreparedRepository` gains multi-clone shapes whose copies resolve every path inside themselves: remote
          URLs, worktree links, alternates, and the backing pointer are rewritten, reflog messages naming the template
          are left, and a state holding a resolved path inside a Git object, such as a recorded move's record, is built
          per test. An integration case proves a copy's remotes, worktree links, alternates, store directory, and
          backing pointer resolve inside the copy, and finds no template path in the objects the copy's refs reach. Each
          file whose tests share a starting state builds it once per file, in a hook or in the first test that needs it
          and never at module scope, and copies it per test, heaviest first, and a case run against a copy proves what
          it proved against a fresh build.

    - `[x]` **18.R2.f Selection by reach — § 14.14**
        - `test:store` (`.arc/system/arc-checks.yml`) is a non-widening `files` merge-gate check that withholds its
          paths, over the integration tier's inputs, with its ask (`ARC_STORE_CHECK`) a runtime input.
          `scripts/run-reach-check.mjs` reads `__tests__/reach/store-suites.json` and runs `runReachCheck`
          (`lib/reach-check.ts`): the change from `ARC_CHECK_BASE` to `ARC_CHECK_TREE`, deletions included, selects each
          suite whose reach (`lib/vitest-reach.ts`) holds a changed path — its import closure, the literal
          `new URL(…, import.meta.url)` and `resolve(import.meta.dirname, …)` locations, scripts under
          `__tests__/fixtures/store/` with their closures, declared locating modules' finds, and the widening inputs —
          and an unplaceable location, an unresolved import, or no suite fails. An ask, no base, or a change to the data
          file, runner, or check entry sets the full or per-change-every form. Selected suites run in the `store` tier's
          projects under the heavy-test admission, the `ARC_STORE_BURSTS`-gated bursts and timing suites left out
          without it. The integration tier, the lane, and a pull request's portability run (`ARC_PORTABILITY_FORM`)
          leave the store suites out; `ci.yml`'s `store` job replays the forecast on a pull request and asks for a full
          run on push, schedule, and dispatch, and `remote-check` gives the check the integration class. The lock
          holder's inline code moved to `__tests__/fixtures/store/`, and `store-ref-timing-isolation.test.ts` proves
          the order under the store tier.

    - `[ ]` **18.R2.g Measure and record — § 14.12**
        - Rerun the merge gate on the remote check machine with the store check's own pool at five workers asked to
          select every suite in its per-change form, under the admission the baseline's integration run had — the
          heavy-test slot and the host runner's integration class (18.R2.f) — and one hosted dispatch that includes the
          whole separate suite. Sum the store suites' per-file durations against the 2,633 s baseline measured from the
          integration tier's pool at `212f6432e` (`integration-file-times-212f.txt` in
          `.arc/user/andrew/.internal/storage-ref-backend-tools/verification/selection/`), and record them, the
          selection replayed over recent merges to `main`, the run's admission, and the worker measurement in
          `notes-storage-ref-backend.md` § A29. Re-measure the tier and CI-job rows and update them to the measured
          figures, the notes separating relocation from reduction, recording the store check's own cost, and keeping the
          A25 figures as history.

### `[x]` **18.7 Hosts, platforms, and cost** — validate exit criterion at segment scope

- _Goal:_ The bursts and the Windows budget pass on their dispatched runs, CI cost holds, and the host kit, pack cost,
  and surviving suites are recorded.

    - _Amended in:_ 18.3.R (A25)

    - _Amended in:_ 18.R2 (A29)

- _Outcome:_ The complete platform pair and all twelve platform/burst combinations pass; both layouts meet the
  calibrated Windows limits. Corrected Linux CI `39674185052` passes. The cost measurements, real-host results and
  limitations, pack trial, surviving-suite inventory, and latest advisory E2E overrun are retained in the notes.

## **Phase 19:** Verification

### `[ ]` **19.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` `Store` has `pull`, `push`, and `maintain` and no `sync`; the result types, the `state-unresolvable` refusal,
  the cohort's archive placement, a companion's path key, `ReadOnlyStore`, and `RefHome` match the spec's contract
  changes; the hunk conflict record carries `baseVersion`, `currentLines`, and `incomingLines`, and `MergeTextInput` the
  base's version; and the contract specification's Amendments log carries one entry per amendment

- `[ ]` The shared conformance suite passes over the ref backend in both layouts with no exclusion beyond the spec's
  named set, and over the in-repo and reference fixtures with the suite's changes

- `[ ]` `checkSerializationRules` is exported from `lib/store/`, and each rule refuses at `write`, at `batch`, and in
  the import's build, with every case of § 14.4

- `[ ]` A no-change `version` spawns one Git process; the manifest's in-process id equals Git's own write in both object
  formats; an anchor's manifest resolves on a fresh clone; and every case of § 14.3 passes

- `[ ]` Every integration case of § 14.5 passes on every change, and the bursts pass with no lost write in one
  dispatched run of the Windows and macOS pair and one of the Linux portability job before this change lands

- `[ ]` Designation and read sources follow § 9.2 and § 9.6 in every case of § 14.6

- `[ ]` Every case of § 14.7 passes: each move, interrupted after each step, completes on a rerun; the trial report of
  each move that takes `--trial` matches it; and the import's comparison differs only by the transforms of § 10.9, its
  three entry kinds compared under § 14.1's test grammars, refusing for the review gate's facts while no mapping is in
  the port and landing a test mapping's records in place of what it was given; and a parked work unit lands paused and
  in flight, every branch link carrying `linkedAs` and `excluded` and every task capture its copy key

- `[ ]` The Git floor reads 2.47 at every listed site, a store failure an older Git explains names the version found
  and the floor, and the stdin and byte executor variants end a call on an aborted signal

- `[ ]` A dispatched portability run passes and times every budgeted operation within its Windows budget

- `[ ]` The backend stays dark: `createStore` composes the in-repo implementation, nothing outside `lib/store/` imports
  `lib/store/ref/`, no production code calls `createRefStore` or `createReadSourceStore`, only the `arc store` handlers
  call `runStoreRemote` and `runStoreMigrate`, and `arc store` is absent from `arc --help`

- `[ ]` Each layout's conformance run stays within 1.5 times the in-repo conformance's time on the same runner, and the
  test-cost rows the new files touch were baselined before they landed

- `[ ]` The host kit has run with GitHub and GitLab holding every check, and the other hosts' results, the pack-cost
  measurement, and the surviving suites are recorded in `notes-storage-ref-backend.md`

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration

- `[ ]` Review import rows preserve each Errand's original claim ID, and canonical file/folder source units account
  for every supplied source exactly once, with reused-slug joins and omission, repetition, and overlap repaired as
  § 14.7 requires (A2)

- `[ ]` Valid Unicode and quote-bearing managed path keys list as records; a backslash-bearing entry lists as
  `malformed` under its exact original path beside every valid record (§ 11.6) (A3)

- `[ ]` Ref-backend retirement checks observe prepared batch mutations before the automatic sweep: terminal lineage
  over held inbound entries refuses without changing state, and settling or explicitly removing those entries in that
  batch admits retirement with an empty final history tree (A4)

- `[ ]` Verbatim companion paths over 2,040 total UTF-8 bytes store with segments up to 4,096 bytes; combined
  companion names retain the 2,040-byte bound at the pure guard and ref write/batch boundaries (A5)

- `[ ]` Each lineage transition's format key includes its origin UID; reads, puts, and removals preserve other origins'
  formats and record versions in the same registry ref, including initial and newer-format cases (§ 3.3) (A6)

- `[ ]` Removing project identity expires its UID-bearing handle with `identity-mismatch`; the UID-less handle
  reports `not-found`, recreation succeeds, and shared removal conformance adds no fixture exclusion (§ 14.2) (A7)

- `[ ]` Fixed role and reserved-storage paths refuse before I/O; generic companion aliases use the resolved owner,
  preserving valid literal keys through older UID and former-name hints while true aliases refuse atomically and a
  corrected key succeeds through write and batch (§ 3.2, § 5.1) (A10)

- `[ ]` Forward metadata repair restores current operations without inferring historical metadata; malformed ancestors
  still refuse explicitly, readable post-repair changes succeed, and restoring missing objects recovers exact historical
  queries (§ 3.3) (A11)

- `[ ]` Empty state fetches complete without code negotiation, absent history patterns leave other refs
  fetchable, and nested tracking refs remain usable negotiation tips (§ 6.2) (A13)

- `[ ]` Failed fetches verify actual tracking updates: files and reftable lock failures report failed creates,
  advances, and deletes as `tracking-update-failed`, including reftable success rows before transaction abort; other
  acquired refs apply, shared tracking advances cause no false rewrite, and release permits a clean pull (§ 6.3) (A15)

- `[ ]` An ended-conflict notice's remedy inspects its exact retained conflict and explicitly discards it with
  expected-version protection through the hidden store command; both layouts preserve retirement, unrelated retained
  records, lineage, and children, and missing-history retry and stale-basis refusal remain actionable (§ 14.13) (A16)

- `[ ]` Partial-clone completeness checks do not cut off at tracking tips advanced by a failed check: after the
  remote advances again, retry repairs the missing ancestor objects and passive historical reads succeed without
  fetching (§ 6.2, § 14.5) (A17)

- `[ ]` Production-registry imports in both layouts serve `listInbox` for descriptions and inbound lists and
  `listErrandQueue` for queues; queue IDs match their personal inbox captures, valid ranks preserve file order, and
  keyless branch exclusions retain their repository and SHA (§ 10.9, § 14.7) (A18)

- `[ ]` Review mapping receives each live selected Candidate's current content separately from committed versions,
  including newer uncommitted bytes, or null when absent; its plain tracked path is covered exactly once independently
  of `path@commit`, omitted and repeated coverage refuse through repair, and mapped current bytes survive (A20)

- `[ ]` Exact UUID lineage lookup never falls back to names; current terminal names precede authenticated former
  names and distinct generations refuse ambiguity. Private identity evidence survives retirement, sync, withdrawal,
  and known rename-chain import without terminal-history enumeration or changed UID-less direct operation authority
  (§ 3.3, § 8, § 10.9, § 14.7) (A21)

- `[ ]` In both layouts, exact observation versions/conflict sets and every registered check hold through native
  publication, including changed read-only evidence, new relevant refs, and sync publishers. Captured history,
  refusal rollback, repaired retry, and unrelated-write admission are proved through public Store behavior;
  observation-only records gain no published effect (§ 14.3.1) (A22)

- `[ ]` Native proposed births and complete accepted-batch receipts meet § 5.7 and § 14.3.2 in both layouts:
  backend allocation evidence binds exact primary creations; bounded history/changes preserve whole envelopes and
  reject visible corruption before grouping/omission, with repaired continuation and the stated lifecycle/sync/import
  policy; production admission closes A22 and A23 before the moving-remote segment verifier

- `[ ]` All five personal content kinds retain logical keys, projection addresses, and public operation/import behavior
  under identity-suffixed stored basenames; aliases and logical file/folder collisions refuse atomically, and corrected
  keys succeed in both layouts without old-name compatibility (A24)

- `[ ]` Complete conformance costs, completed-case populations, shards, and workload differences are recorded from one
  hosted dispatch; all required native cases remain, affected tier/job rows retain before baselines and receive final
  measurements and deltas, and Linux portability marginal cost is recorded. Raw execution excludes admission waits,
  job clocks are labeled, and Windows budgets remain required (§ 14.12; supersedes the legacy-ratio criterion) (A25)

- `[ ]` Native `write` and `batch` in both layouts reuse only operation-owned, exactly bound object readers; all
  success/refusal/error exits release them before return or maintenance, subsequent calls detect physical corruption
  and succeed after repair, and fresh namespace/observation admission remains atomic with unchanged Windows budgets
  (§ 11.7) (A26)

- `[ ]` A complete dispatched portability pair passes with eleven-sample Windows medians over 600 work items across
  twelve quarters at or below 100/300/600/300/1,500 ms for version/read/list/lookup/write in both layouts, retaining
  all correctness and native resource coverage. Timing-only diagnostics do not close acceptance; these limits
  supersede the earlier numeric budget obligations, including the unchanged-budget clause in A26 (§ 11.7) (A27)

- `[ ]` The tip read, sync's ref sets, fetch negotiation, and the ref-transaction helper's re-read each run a listing
  again when Git refuses it with `Duplicated ref, and SHA1s don't match`, at most three attempts in all, and rethrow
  Git's error unchanged past them or on any other failure (§ 4.3, § 11.1) (A28)

- `[ ]` The store suites' summed per-file durations, hooks included, on the remote check machine at five workers in a
  merge-gate run whose store check is asked to select every store suite in its per-change form, are at most half the
  2,633 s the integration tier's pool measured at `212f6432e`; prepared states, layout assignment, and removals follow
  § 14.14, no case that was a criterion's last evidence is gone, and the tier and CI-job rows are re-measured after that
  work and updated to the measured figures, the notes separating relocation from reduction and keeping the A25 figures
  as history (§ 14.12, § 14.14) (A29)

- `[ ]` The merge gate and pull-request CI run the store check once per gate, and it runs each store suite a change
  reaches through its import closure, a file its code locates from its own path, a declared locating module's finds, or
  a widening input, deletions included, and reports the suites selected; a change reaching none passes with that report,
  a failed or empty reach computation or a location-relative path the runner cannot place fails, and every push to
  `main`, through a CI job of its own, the weekly scheduled run, a dispatched run, and a run not asked for another form
  that is given no base or a change to the selection run them all, the separate layout's whole suite among them, while
  the portability tier's pull-request run leaves them to the store check and its scheduled and dispatched runs keep them
  whole (§ 14.14) (A29)

- `[ ]` The separate registration declares a subset holding one case for each operation path through the layout's
  selection and binding, run on every change that reaches it; the whole separate suite passes in one hosted dispatch
  before this change lands with no exclusion beyond § 14.1's; and the default run spans files split by item range, every
  declared exclusion checked against the whole registration (§ 14.1) (A29)

- `[ ]` Every integration case of § 14.5 passes on every change that reaches it (§ 14.14), and the bursts pass with no
  lost write in one dispatched run of the Windows and macOS pair and one of the Linux portability job before this change
  lands; supersedes the every-change criterion (§ 14.5) (A29)

- `[ ]` Every case of § 14.7 passes: each move and each follow, interrupted at each distinct recovery state § 10.3 gives
  it, what the interrupted run left on the machine counted and each one's sets recorded in
  `notes-storage-ref-backend.md`, completes on a rerun; the trial report of each move that takes `--trial` matches it;
  and the import's comparison differs only by the transforms of § 10.9, its three entry kinds compared under § 14.1's
  test grammars, refusing for the review gate's facts while no mapping is in the port and landing a test mapping's
  records in place of what it was given; and a parked work unit lands paused and in flight, every branch link carrying
  `linkedAs` and `excluded` and every task capture its copy key; supersedes the after-each-step criterion (§ 14.7) (A29)

- `[ ]` Each public ref-store operation, its nested pulls included, resolves the identity at most once, and the next
  operation resolves it again (§ 1.2) (A29)
