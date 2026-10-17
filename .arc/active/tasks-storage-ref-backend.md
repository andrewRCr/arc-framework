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

- _Goal:_ Every record maps to exactly one ref and one stored path, through one expansion every caller shares.

- _Outcome:_ `expandStoredPath` shares registry-based ref, record, family-root, metadata, and manifest expansion.
  Named and path-keyed companions keep their distinct encodings; completed work units, Errands, and cohorts take
  their quarter folders, while history retains the live layout. Expanded instances remain unique across refs.

### `[x]` **3.3 The read path — § 3.1, § 3.2, § 3.3, § 3.4, § 3.7, § 11.6, § 13.1**

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

    - `[x]` **3.4.a The manifest**
        - In-process tree hashing mirrors registered state refs as gitlinks and matches Git under both object formats;
          the common config selects the hash without Git. Legacy, history, temporary, and forwarding refs stay outside
          the manifest, and empty SHA-256 stores use Git's empty tree.

    - `[x]` **3.4.b `version` and a live listing's token**
        - Captured manifests persist through one batch tree write and an expected-value token update; equal state reuses
          the token. Listings return their own snapshot's token. A competing checkout keeps its newer retained token,
          and bounded atomic cross-namespace writers leave reftable snapshots coherent while the files control tears.

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

- _Outcome:_ Ref commits use a shared store message codec for caller provenance, optional code head and owner UID,
  operation batch ID, and optional clone actor. Parsing derives each changed record's owner UID from its reference.
  Control-bearing or quote-opening values round-trip as JSON strings, and Git authorship follows code-repository
  configuration, including writes before ARC identity exists.

### `[x]` **4.4 The ref-backend conformance fixture over the default layout — § 14.1, § 14.12**

- _Goal:_ The shared suite runs over the ref backend on real temporary repositories with a bare origin, each test
  copying a prepared template, its declarations stating exactly what the backend serves.

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

### `[x]` **4.5 The engine's first path** — validate exit criterion at segment scope

- _Goal:_ The ref-backend fixture in the default layout passes items 1, 2, 4, 6, 9, 10, 13, and 15 for every served
  family, with every other item and assertion excluded by name, reason, and retiring phase.

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

- _Outcome:_ Live primary lookup ranks current slugs over former slugs and reports every tied owner; lineage resolves
  UID paths and registry slugs with path-presence checks. A four-process metadata scan is cached by checkout and tips
  across backend instances, with one-process reuse and no failed-scan retention. The same selector accepts prepared
  tree sets for write views.

### `[x]` **5.8 Write checks — § 5.3, § 1.4**

- _Goal:_ Every registered write check runs under the write's locks over the state before and after the batch, and the
  first broken rule refuses the whole write.

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

- _Outcome:_ Archive and Errand-close batches lock the quarter and history destinations, stamp the final item,
  copy record/metadata blobs without anchor manifests, and move refs in one transaction. Reads and check views derive
  completed placement from assigned folders; numbering counts cohorts and current gaps. A missing quarter tree refuses
  before publication and admits the unchanged retry after object restoration.

### `[x]` **6.2 Reopen — § 7.2**

- _Goal:_ A placement write out of `completed` brings an item back under `refs/arc/work/` and removes every folder it
  holds, refusing where this clone lacks what the folder names.

- _Outcome:_ Reopens validate every archive folder's batch against retained history, revalidate after acquiring locks,
  and publish the live move with every folder removal while preserving other owners. Check views retain independent
  archived/live states; missing or stale history and slug clashes refuse with repaired retries. Canonical quarter refs
  enter manifests, and slug reads keep selecting the live generation after a name is reused.

### `[x]` **6.3 Writes to a completed item — § 7.3**

- _Goal:_ Every write to a completed item's records lands on its history ref and refreshes its quarter folder in one
  transaction, so `history` reads one log and a reopen finds the latest state.

- _Outcome:_ Completed writes and conflict resolutions validate retained history and refresh every folder, preserving
  each end's batch and quarter. Reads and listings select one latest folder; check views expose the prepared state.
  Shared quarter preparation composes archive, reopen, and refresh changes, while identical rewrites remain no-ops.

### `[x]` **6.4 Abandon, decomposition, and every other removal — § 7.4, § 7.5**

- _Goal:_ An item ends outside the archive exactly when a write leaves it with its lineage and no primary, and every other
  removal is an ordinary write of absence, so each end carries a record other machines read.

- _Outcome:_ Lineage writes lock their origin and history destination. After checks admit the prepared batch, a
  primary-less origin with lineage moves to history with an empty final tree; history recovers paths from retained
  metadata. Other origin puts refuse unless the batch restores its primary or settles inbound during retirement.
  Missing lineage trees and retained history name repair routes without publishing partial changes.

### `[ ]` **6.R Retirement checks before the final sweep — § 5.3, § 7.4**

- _Goal:_ A4's ref-backend retirement checks observe the batch's prepared mutations before the automatic sweep, refusing
  held inbound entries while admitting a batch that settles them itself.

    - Exercise the shipped `checkLineageRecord` through a registry override supplying a declared inbound test grammar;
      `KIND_MECHANISMS["work-item/inbound"]` declares none until the kind's grammar lands
    - Build `test-first` (one behavior at a time):
        - abandonment and decomposition batches creating terminal lineage over held inbound entries refuse
          `lineage.inbound-held`, leaving every touched ref unchanged
        - the same batch settling the entries, or explicitly removing the inbound record, admits retirement; the check
          sees that proposed change rather than the old list, and the history tip's final tree is empty
        - adding a put of another origin record to that retirement still refuses and changes no ref; the settlement
          exception applies only to the origin's inbound list in the batch creating terminal lineage

### `[ ]` **6.5 A cohort's close — § 7.6**

- _Goal:_ A cohort closes by a `completed` placement write to its document, its folder named as today's closeout sidecar
  with the coordinates seam-lifecycle's reference backend assigns, so the projection resolves it with the same letters.

    - The sequence is the highest the same batch assigns, in the cohort's quarter, to a work unit whose meta's `Cohort`
      path names the cohort, else the quarter's next; the closeout is `b` where any cohort document's parsed `parent`
      names the cohort, else `a`, as `assignCompletedCohorts` (`__tests__/helpers/store/cohort-placement.ts`) assigns
      them; a document whose kind has no parser registered names no parent, as that assignment reads it
    - A cohort put carries no other placement, so a closed cohort comes back only through the reopen an end's withdrawal
      runs (10.5): its history ref moves back under `refs/arc/cohort/` and its folder leaves the quarter, as 6.2's reopen
      moves a work item
    - Build `test-first` (one behavior at a time):
        - a close commits finally on the cohort's ref, copies the document and metadata into
          `<sequence><a|b>_cohort-<slug>/`, and moves the ref to `refs/arc/history/cohort/<uid>`
        - the sequence is the work unit's the same batch archives into the quarter naming the cohort, the highest of
          several, else the quarter's next, and a work unit of another cohort archived in the batch lends it none
        - the closeout is `b` where another cohort's document names the cohort as its parent, whether or not the batch
          closes that one, and `a` otherwise or with no parser registered
        - a cohort with a 2,040-byte slug closes into a folder name Git accepts
        - the reopen a withdrawal runs, called directly, moves the history ref back and removes the folder

### `[ ]` **6.6 Renames and role changes — § 3.3, § 3.6, § 5.2, § 5.3**

- _Goal:_ A rename and a primary's role change move no ref and add no record blob, and `history` follows a record through
  both.

    - A rename of an item whose lineage the registry holds rewrites that lineage's owner slug in the registry's metadata
      in the same batch (§ 3.3)
    - A rename refuses where a companion keyed verbatim at the root would read back under the new slug as another
      reference, 5.2.a's key check run over each such key under the new slug (§ 3.6)
    - A put expecting absence in the new primary role admits a batch that removes the other role, and a role replacement
      runs the removed kind's write check with no next record and the created kind's with no prior (§ 5.3)
    - Build `test-first` (one behavior at a time):
        - a rename writes the new slug, appends the old one to `formerSlugs`, and renames the projected files in one
          commit, adding no record blob, only the new metadata file: a companion keyed `notes-extra` moves to
          `notes-extra-<new slug>.md`, and one keyed `sub/notes.md` keeps its path
        - a rename of item `a` onto `b` holding a companion keyed verbatim `x-b.md` refuses `unsupported` `unhomed-kind`
          naming it, with or without a companion keyed `x`, and lands once it is re-keyed; one keyed `x-c.md` keeps its
          path through the rename
        - a completed item's rename also renames its quarter folder
        - a rename onto a live work item's or cohort's slug refuses `ambiguous-match` naming both, and one that ends a
          clash between machines lands
        - a rename to a 2,041-byte slug refuses `record-malformed` under `store.git-path`, and a companion of a 2,040-byte
          key renamed with its owner forms a name Git accepts
        - a rename of an item with lineage rewrites the registry's lineage slug
        - a role change between `work-item/meta` and `work-item/record` keeps the item's UID and links, and runs both
          kinds' checks
        - `history` lists a record's versions across a rename and a role change, from the paths its former slugs and
          roles give
        - a read by UID carrying the owner's prior name expands the current metadata's slug paths and returns its
          current name, including slug-named companions

## **Phase 7:** Changes, reads as of a state version, and lookup

_Purpose:_ Reading the store over time and by name: reads as of a manifest, `changes` between two manifests by the
namespace table and grouped by batch, `lookup`'s scan over ended items, claims, and commits, resolution of a reference
by every tier, and an item ref broken outside ARC.

### `[ ]` **7.1 Reads as of a state version — § 4.4**

- _Goal:_ `read` and `list` as of a state version return the store as that manifest named it, or refuse with what this
  clone lacks and the remedy that recovers it.

    - Build `test-first` (one behavior at a time):
        - a read as of an earlier manifest returns each record as it stood
        - a live listing's token resolves for a read as of it, as `version()`'s does
        - a manifest made on another person's clone, planted with 3.1.e's helper, reads that person's identity refs as
          absent and this clone's own as it names them
        - a manifest this clone no longer holds refuses `state-unresolvable` with no history refs, its remedy to rebuild
          from the current state
        - a manifest naming an ended item's tip this clone lacks refuses naming its history ref, its remedy to pull it
          and retry
        - an item reopened since the manifest resolves through its live ref

### `[ ]` **7.2 `changes` between two manifests — § 4.6**

- _Goal:_ `changes` returns every landed mutation between two manifests, one entry per record per batch where its version
  changed, whatever ref carried it, or refuses naming what this clone lacks.

    - A module of its own for the namespace table, the batch grouping, and the restriction to named records
    - Named lineage restrictions use 5.3's live-owner and registry-map resolution over the compared manifests
    - One case per row of § 4.6's table and per grouping rule; the pull by name that resolves a refusal fetches through
      9.1.b, and 10.3 carries the case of a `changes` landing after it
    - Build `test-first` (one behavior at a time):
        - a live ref in both manifests reads its log between the two tips, oldest first within a ref, refs in name order
        - an item in the older manifest only reads its end from its history ref
        - one new since the older reads from its root, and one reopened since reads from its reopen
        - one archived before the older and written while archived lists the window's writes alone, found through its
          quarter's folder
        - one reopened and archived again within the window lists from its reopen, and one reopened then abandoned lists
          from its reopen through its end, its live writes among them
        - one created and ended between them reads from its root on its history ref
        - any other ref new since reads from root, and one in the older only reads nothing
        - a reopen lists no removal of the item's other records, and an archive and a write to a completed item list each
          changed record once
        - a write followed by the item's archive in one window lists the record's later version last
        - an identity ref present in one manifest only carries its history whole
        - a manifest this clone lacks refuses `state-unresolvable`, and an item in the older manifest only whose history
          ref this clone lacks refuses naming it
        - a completed item whose history ref this clone holds without the batch its folder names, planted as another
          machine's write leaves it, refuses naming the ref

### `[ ]` **7.3 `lookup`'s scan over ended items, claims, and commits — § 8**

- _Goal:_ `lookup` answers every input kind in four Git processes with no index, ended items and claims among them, and
  an item ended outside the archive answers only through its lineage.

    - Extends 5.7's scan with the quarter refs and § 8's remaining tiers and inputs
    - Build `test-first` (one behavior at a time):
        - a slug resolves from the live item holding it, then a live former slug, then the one ended item in a quarter
          holding it, then one holding it as a former slug
        - any tier holding several items refuses `ambiguous-match` naming them
        - a branch resolves through branch links, and a commit through task captures and the landing commit: a
          captured SHA first, and the caller's copy key only where no SHA matches in that repository, a capture with no
          copy key matching by SHA alone
        - a work unit's checkout claim resolves by slug and an Errand's by its claim ID, and a `partial-errand` claim
          refuses `not-found` as one that keeps no record, as the suite's `missing-lookup-names-request` expects
        - a completed item resolves from its quarter folder, the one read placement reads where it holds two
        - a grooming or housekeeping claim resolves from the person's own claims ref
        - an abandoned item's slug refuses `not-found`, and a decomposed origin resolves through its lineage
        - `list` with `heldHere` refuses `unsupported` `held-here`, recoverable

### `[ ]` **7.4 Resolution by every tier — § 5.1, § 8**

- _Goal:_ A reference without a UID resolves the same way for `read`, `list`, `history`, `changes`, and every write, over
  the tips the operation reads, so a create over a completed item's slug starts a new generation.

    - Completes 3.3.a's and 4.2.a's resolution among live owners with the ended tiers
    - Build `test-first` (one behavior at a time):
        - a create over a completed item's slug mints a new UID
        - several ended holders, and two live items that each renamed away from one slug, refuse `ambiguous-match`, the
          second built under the test registry, since `work-item.former-slug` refuses its setup
        - a read, `history`, and `changes` by slug of a completed item resolve it
        - a read as of a state version resolves a slug over that manifest's tips

### `[ ]` **7.5 A broken item ref — § 3.3, § 8**

- _Goal:_ A commit made outside ARC that breaks one item's ref costs that item alone: its records refuse
  `namespace-corrupt` with the forward repair, and `lookup` refuses only where the broken ref could hold a better answer.

    - Build `test-first` (one behavior at a time):
        - a work item's ref whose metadata file or root tree such a commit broke lists as one `unreadable` diagnostic with
          `missed`, and `version` still lists it
        - `read`, `history`, `changes`, and a write touching its records refuse `namespace-corrupt` naming the ref, with
          the remedy to commit the last parseable metadata file on its tip
        - a slug another live item holds as its current slug, and a commit another item matches by SHA, resolve
        - a slug only the broken ref could hold, a commit another item matches only by copy key, and a branch or claim
          the scan matches nowhere else refuse `namespace-corrupt` naming it
        - the forward repair restores every read; the fixture's `namespace-corrupt` recovery case, which produces and
          repairs the break through the hooks 8.6 builds, lands there

## **Phase 8:** The separate layout

_Purpose:_ The store directory as the second layout of one engine — placed by the designation, made in reftable, named
with `--git-dir`, authored as the person, and serialized by the layout lock — with `maintain()`, many processes writing
at once, and the conformance fixture running over both layouts.

_Exit criterion:_ The ref-backend fixture passes the shared suite in both layouts with no exclusion beyond § 14.1's but
those 4.4.d holds until Phase 11, and every § 14.3 case that needs no pull passes.

### `[ ]` **8.1 Reading the designation and the code remote — § 9.1, § 9.2, § 9.7**

- _Goal:_ The backend reads each clone's `arc-state` keys and its code remote the same from every worktree, so a write
  or pull that finds no store places it where the designation calls for.

    - `remote.<name>.arc-state` read with `git --git-dir=<common directory> config`, which sees the main worktree's
      `config.worktree` and the person's global configuration as the primary checkout does, the store directory's own
      `backing` remote counted with it; the code remote is `remote.pushDefault` where set, else the clone's only remote,
      else `origin`; who sets a key lands in Phase 12
    - One module exports the counted designation that 9.1.b, 9.4.b, and 12.2 read: a code repository's remote named
      `backing` counts for nothing, a fork upstream's `push` counts for nothing beside the store directory's `backing`,
      and two `push` keys read as ambiguous, naming both
    - Build `test-first` (one behavior at a time):
        - for a fresh store, the resolver picks the code repository's refs where a code remote carries `push`, and the
          separate directory for every other designation, which 8.2 creates and lands in
        - the default-layout fixture's store stays in the code repository's refs
        - the code remote resolves through `remote.pushDefault`, a lone remote not named `origin`, and `origin` among
          others, the same from a detached worktree and from one whose `config.worktree` sets `remote.pushDefault`
        - a clone with no code remote resolves none
        - a code repository's remote named `backing` carrying `push` counts for nothing, a fork upstream's `push` beside
          the store directory's `backing` counts for nothing, and two `push` keys read as ambiguous
        - the resolver keeps a store that holds state where it is whatever the designation now says, a directory a
          case plants with plumbing standing for one 8.2 creates

### `[ ]` **8.2 The store directory — § 9.7**

- _Goal:_ A separate-layout store is a bare reftable repository at `arc/store` in the common Git directory, shared by
  every worktree, whose commands never read the code repository's configuration but its person.

    - Made by `git init --bare --ref-format=reftable --object-format=<the code repository's>` at a temporary sibling and
      renamed into place, under the layout lock (`arc/locks/layout.lock`, which 8.3 also takes around every commit), so
      an interrupted creation never leaves a directory that selects a broken store
    - Every store command names it with `--git-dir` and passes `cwd`, since `environmentForGitCwd`
      (`lib/git/process-executor.ts`) clears repository-local variables such as `GIT_OBJECT_DIRECTORY` only for a call
      given one; commits authored as the code repository resolves the person; commands read the person's global
      configuration and the directory's own
    - Its cases live in `store-ref-directory.test.ts`, the integration file 18.2 lists in the portability tier by name
    - Build `test-first` (one behavior at a time):
        - a first write on a clone the designation sends to the separate layout creates the directory and lands there
        - the directory's object format matches the code repository's, under SHA-1 and SHA-256
        - a commit there carries the name and email set only in the code repository's own configuration
        - a store command run with `GIT_OBJECT_DIRECTORY` set writes into the store directory
        - every worktree of the clone reads and writes the one directory, and its presence alone selects the layout with
          no Git call
        - a ref there whose tip commit the store lacks lists as one `unreadable` diagnostic with `missed`, and `version`
          lists it

### `[ ]` **8.3 The layout lock — § 11.4**

- _Goal:_ No write commits into a copy a layout move has taken or left: every write and merge takes the layout lock last,
  around its commit alone, and restarts where the layout changed.

    - `arc/locks/layout.lock` beside the ref locks, taken after them and only around step 7; a changed layout under it
      releases every lock and restarts from step 2; the commit step is one function 9.2.a's merge reuses, taking the
      repository its refs live in, with two modes beside its own: held, for a caller that already holds the layout lock,
      a layout move's copy (13.1), which takes it no second time, since a second take waits on its own holder and
      refuses `lock-held`, even in one process (`lib/advisory-lock.ts`); and unlocked, for a caller committing onto
      temporary refs no write or layout move reads, a remote move's copies, the follow's, and leaving the source's
      (13.1), which takes no layout lock
    - Until Phase 13's move exists, a case's stand-in move creates or removes the store directory with plumbing while it
      holds the layout lock, and the lock factory port pauses the first writer at the layout lock
    - Build `test-first` (one behavior at a time):
        - a write whose layout changed between its resolution and its commit restarts and lands in the new layout
        - a holder of the layout lock past a waiting write's injected wait refuses it `lock-held`
        - a commit step run in the held mode by a caller holding the layout lock commits without waiting on it
        - a commit step run unlocked commits onto refs in the repository it is given, the code repository in the
          separate layout, while another holder keeps the layout lock

### `[ ]` **8.4 `maintain()` — § 12**

- _Goal:_ `maintain()` keeps a store packed that only plumbing writes, and reports each never-retiring ref's growth for
  the tripwire.

    - `git maintenance run --auto` against the store, with `--git-dir` in the separate layout; each never-retiring ref's
      `git rev-list --count` and `git rev-list --disk-usage --objects`, over the tips read first, since both fail on an
      absent ref
    - The suite's `maintain()` assertion leaves 4.4.d's interim exclusions here
    - Build `test-first` (one behavior at a time):
        - it returns commit counts and disk usage for the person's `personal` and `claims` refs, `project/inbox`, and
          `project/registry`, in both layouts
        - a ref this clone lacks is left out

### `[ ]` **8.5 Many processes on one clone — § 14.5**

- _Goal:_ Concurrent writers on one clone lose no write, retry a bounded number of times, meet only typed conflicts, and
  never bring back a ref or folder a lifecycle move left.

    - Integration tier, in both layouts; each writer a child process, as `personal-lock-holder.ts` runs one, writing a
      personal document of its own key or a shared line-merge record, and re-reading and writing again over the current
      version after a `version-conflict`, at most five times
    - A race's second process waits at a seam the lock factory port provides, after it resolves and before it locks
    - Build `test-first` (one behavior at a time):
        - four processes each writing 25 times to one surface, and to four, lose no write, every refusal typed
        - a write racing its item's archive or abandon in a second process restarts and lands on the item's refs as
          they then stand, or refuses `not-found` after the abandon
        - a write to a completed item racing its reopen, or its reopen and archive into a later quarter, lands on the
          reopened or newly archived item, and no ended or reopened ref or folder comes back

### `[ ]` **8.6 Conformance over both layouts — § 14.1**

- _Goal:_ The shared suite passes over the ref backend in each layout with only § 14.1's named exclusions and those
  4.4.d holds until Phase 11.

    - The fixture registers twice, each layout in its own integration file beside `store-in-repo-conformance.test.ts`
      — `store-ref-conformance.test.ts` and `store-ref-separate-conformance.test.ts` — so CI lists and times each by
      name (18.2, 18.3): the default layout in a files-format code repository whose template sets
      `remote.origin.arc-state push`, and the separate one in its reftable directory with the key unset; 4.4.d's interim
      exclusions retiring here are removed, items 3 and 14 narrowing to their sync assertions, and the fixture's `plant`,
      `hold`, `race`, `produce`, and `repair` hooks serve every case they cover
    - The fixture produces `held-here`, `state-unresolvable`, and `namespace-corrupt`, the last by a commit outside ARC
      that a forward repair mends, which carries 7.5's recovery case
    - Replay 5.10.R's expired project UID, UID-less absence, and recreation case in both layouts to close A7's
      covering revalidation
    - Replay 5.R2's independent lineage format/version cases in both layouts to close A6's covering revalidation
    - Replay 5.R's companion name/path byte boundaries over both layouts, retaining atomic refusal and repaired
      retries, to close A5's covering revalidation

## **Phase 9:** Two clones converge

_Purpose:_ `pull` and `push` between clones for live writes: the fetch into the tracking namespace, fast-forwards and
merges by kind, lost-race classification, the push loop's listing, leases, and atomic push, backoff and the deadline,
and each family's publish outcome.

_Mode:_ `slice` through Phase 11 — closes on clones that write, end, reopen, and meet faults against one remote and
converge with no lost write.

### `[ ]` **9.1 The fetch — § 6.2, § 9.7**

- _Goal:_ One fetch round trip brings the remote's state, and only its state, into a tracking namespace no push, manifest,
  or listing reads, never naming a code commit as held.

    - `[ ]` **9.1.a Parsing the porcelain**
        - A pure parser in `lib/git/` over `git fetch --porcelain` output: each line's flag — ` ` a fast-forward, `+`
          forced, `*` new, `-` pruned, `!` refused, `=` up to date — its old and new tips, and its ref; on exit 1 the
          lines come from the rejection's `GitProcessError.stdout` (`lib/git/process-error.ts`), and
          `classifyRemoteFailure` reads the failure only where no per-ref line arrived
        - Build `test-first` (one behavior at a time):
            - Unit tier, over recorded output
            - each flag parses with its tips and ref, and a `!` line carries both
            - an exit-1 rejection whose stdout holds per-ref lines reads them, and one holding none reads as a remote
              failure

    - `[ ]` **9.1.b The fetch**
        - A fetch module under `lib/store/ref/`: refspecs on the command line, one wildcard each, with no `+`, the
          person's own two refs as one-ref patterns, each mapped to `refs/arc-remotes/<remote>/…`; `--refmap=`,
          `--no-tags`, `--no-filter`, `--prune`, `--show-forced-updates`, `--porcelain`, `diagnosticLocale: "stable"`
          (`LC_ALL=C`), and the lock waits (2.3.b); `--negotiation-tip` for each state pattern and tracking namespace
          that names a ref, else `--refetch`, with a blank `remote.<name>.negotiationInclude`; history refs by name as
          one-ref patterns
        - The code remote and `backing` are fetched by name; another of the code repository's remotes by the URL
          `git remote get-url` gives, tracked under that remote's name
        - Build `test-first` (one behavior at a time):
            - Integration tier, two clones on one bare origin, as every later sync case is but where it says otherwise,
              each clone designating it: in the default layout through `setupMultiClone`'s `config`,
              `remote.origin.arc-state=push`, and in the separate layout through a setup step after it, a helper in
              `__tests__/helpers/store/` that creates each clone's store directory as 8.2 makes one and adds its
              `backing` at the origin's URL carrying `push`, since `config` writes only the code repository's config
              (`createClone`, `__tests__/helpers/multi-clone.ts`) and 8.1 places an undesignated clone's store in the
              separate directory, where a remote with no key reads `no-remote` until 12.2
            - a fetch brings every state ref into `refs/arc-remotes/<remote>/` and none of `errands`, `errands-remote`,
              or `sync-state`
            - a remote ref this clone has never seen, and one the remote pruned, update the tracking namespace alone
            - a history ref asked by name that the remote lacks fetches nothing and fails nothing else, and a read as of
              a manifest naming an ended item's history ref resolves once a pull by name fetches it
            - in the separate layout the fetch reaches the remote through the command-line refspecs alone, the
              directory's own configuration carrying none
            - a fork's upstream fetched by URL creates and prunes its tracking refs as a fetch by name does

### `[ ]` **9.2 Merge after fetch — § 6.4**

- _Goal:_ A pull brings every fetched ref into local state as a fast-forward or a merge commit by each kind's mechanism,
  never as a check that gates and never bringing a deletion back.

    - `[ ]` **9.2.a Fast-forwards and merge commits**
        - Where one tip descends from the other the local ref moves or waits to push; otherwise a merge commit, this
          clone's tip first, its tree merged by kind against the merge base and its metadata field by field, under the
          ref's lock and compare-and-swap and committed through 8.3's commit step under the layout lock, with the
          provenance `sync` `merge`
        - A local ref absent where this clone holds the item's history ref, Phase 9's stand-in for this clone's own
          unpublished end (§ 6.6), is never brought back from its tracking ref (§ 6.4)
            - _Retired in:_ Phase 10
        - The merge runs over a local and an incoming ref set and the lock it is to take, as parameters: the pull passes
          the store's refs, its tracking refs, and the ref locks, and 13.1's copy its own sets, with the commit step's
          mode and repository its caller needs (8.3)
        - A lock past its wait — a ref lock, or the layout lock a move holds for its whole run — ends the pull with its
          top-level `lock-held` refusal naming the lock, as a write refuses (§ 11.4); the merges it committed before
          stand, and the next pull merges the rest
        - The pull mints one `Arc-Batch` per merged ref, but one across the commits that must publish together, which
          Phase 10's folder rebuilds, applied ends and reopens, and withdrawals use (§ 3.1)
        - The merge passes the merge library the record's version at the merge base as its base version, null where the
          base held no such record (§ 3.7); a metadata field changed on both sides files a conflict record naming the
          record the field belongs to, the primary for placement, slugs, and links
        - Build `test-first` (one behavior at a time):
            - another clone's write fast-forwards the local ref
            - a ref this clone ended, its end not yet pushed, stays absent beside its tracking ref
            - two clones' writes to different records of one ref merge into one commit holding both
            - a single-writer record changed on both sides becomes a conflict record, and a merge-kind record repeating
              an entry ID on either side or the base does too
            - a write's merge and a pull's merge clashing in one hunk: the pull's conflict record's `baseVersion` names
              the record's version at the merge base, and a pull whose two sides each created the record clashes with
              `baseVersion` null
            - tips sharing no ancestor merge against an empty base, as two machines' first archives into a quarter do
            - a personal record one clone removed, merged with another clone's unchanged older copy, stays removed
            - one metadata field changed on both sides becomes a conflict record, and a record removed on one side and
              changed on the other is one clash over the whole record
            - a pull whose merge waits on the layout lock past an injected wait refuses `lock-held` naming
              `arc/locks/layout.lock`, the refs it merged before keeping their merges, and a pull after the lock is
              released merges the rest

    - `[ ]` **9.2.b A quarter's merge renumbers**
        - Build `test-first` (one behavior at a time):
            - where both sides archived into one quarter, this clone's unpublished folders take the next sequences after
              the remote's highest, in this clone's order, and a published folder keeps its number
            - a cohort folder that took a member's number takes that member's new number, and one that took the
              quarter's next renumbers as a work unit
            - `changes` over the window groups the merge's entries under the merge's batch

    - `[ ]` **9.2.c Checks report and rules never gate**
        - Build `test-first` (one behavior at a time):
            - a merged record breaking a write check stores the merge and reports a `rule-broken` notice, filing nothing
            - a merged record breaking a serialization rule is stored, and one over the cap lists `oversized`

    - `[ ]` **9.2.d History and labels across a merge**
        - Build `test-first` (one behavior at a time):
            - where a merge keeps the remote side's version at a clash, `history` lists this clone's version and then the
              remote's, newest the current, and a stale base on this clone's version merges
            - where a merge keeps the local side after the remote's write, the local version lists again as newest
            - a nested pair of merges orders the same way, and `changes` restricted to the record lists them in that order
            - two clones of one person clashing on a single-writer record label the two sides with distinct actors
            - an anchor's manifest resolves on a fresh clone that fetches the meta's ref, and a fresh clone's first pull
              fetches no history ref

### `[ ]` **9.3 Classifying a push — § 6.9**

- _Goal:_ Every push rejection is a lost race the loop retries, a terminal refusal it reports with the server's own
  words, or one the next fetch's state settles, read from the push helper's typed outcome and from Git's text only in
  the named cases.

    - A pure classifier in `lib/git/` beside the push parser (2.4.a), over the helper's typed outcome; the loop settles
      the by-state arm with its next fetch (9.4.c)
    - Build `test-first` (one behavior at a time):
        - Unit tier, over parsed outcomes
        - a client-side `non-fast-forward`, `fetch first`, or `stale info` is a lost race
        - `cannot lock ref`, `incorrect old value provided`, `reference already exists`, `reference does not exist`, and
          `TF401028` under `remote rejected` are lost races
        - any other server text on a state ref reads by state
        - atomic collateral lines read as the refs whose lines carry a cause
        - a terminal `refused` message carries the server's `remote:` lines verbatim, as the suite's
          `remote-refusing-with-success-after-repair` asserts

### `[ ]` **9.4 The push loop — § 6.5, § 6.7**

- _Goal:_ `push` publishes every ref this clone wrote, never part of a local batch and never over a write it has not
  merged, and reports each declared family once.

- **Additional Context:** `notes-storage-ref-backend.md` § The second model check

- _Note:_ A case that needs the loop stopped between two steps wraps the executor port to pause at a named Git call —
  the loop's fetch, its tip read, or its push — through `createManualStepBarrier` (`__tests__/helpers/multi-clone.ts`);
  `setupMultiClone` gains a third clone and a second machine's worktree siblings where a case needs them.

    - A push-loop module under `lib/store/ref/` composing the pull, the listing, the leases, the push helper (2.4), and
      the classification (9.3); until 9.5 a retry repeats with no sleep; the deletes an end or reopen owes, and the skip
      of a live ref with a pending end, join the listing in Phase 10

    - `[ ]` **9.4.a Listing and locks**
        - Every store ref whose tip differs from its tracking ref or has none, taken under its locks in ref-name order and
          listed again; a grown listing releases every lock and takes the larger set in order
        - Build `test-first` (one behavior at a time):
            - a push lists only refs this clone wrote since its last push
            - a batch creating a ref while the loop lists grows the set, and the loop retakes it in order
            - a ref lock another process holds past an injected wait ends the push with `lock-held` naming it, pushing
              nothing

    - `[ ]` **9.4.b Leases and the push**
        - Tips and tracking tips read under the locks, then released before the network call; a work item's or cohort's
          ref leased on its tracking tip or on absence, never on a tip kept after a prune; quarter, registry, inbox, and
          identity refs pushed plainly; a moved tracking tip lets a ref push only where its local tip descends from it,
          never a delete, else the loop repeats from step 1; the designation read again (8.1) before the push
        - The code remote and `backing` are pushed to by name; another of the code repository's remotes to the URL
          `git remote get-url --push` gives, its push URL where it has one, with `insteadOf` and `pushInsteadOf` applied
        - Build `test-first` (one behavior at a time):
            - a push of two refs is one `--atomic` push, and a lost lease lands neither
            - two worktrees of one clone: one's loop between its merge and its push while the other's pull fetches another
              machine's push to the same ref lands nothing over that write, its loop repeating, and the remote's tip then
              descends from both machines' writes
            - a push composed before a designation switch, made by editing `remote.<name>.arc-state` while the loop is
              paused, reaches no remote after it

    - `[ ]` **9.4.c Tracking refs and the settled refusal**
        - On each per-ref `ok` line the tracking ref moves to the pushed tip, or is deleted for a pushed delete, where it
          still holds the tip step 3 read, in both layouts and for a push by URL
        - A refusal read by state repeats from step 1, whose fetch settles it: a lost race where the ref moved from the
          push's expected old value, terminal `refused` otherwise
        - Build `test-first` (one behavior at a time):
            - the next listing after a push lists nothing new, in both layouts and for a fork's upstream pushed by URL
            - a server refusing a state ref with other text, the ref moved meanwhile, settles as a lost race, and with the
              ref unmoved ends terminal `refused` with that text

    - `[ ]` **9.4.d Outcomes per family**
        - One publish outcome per status and one `failed` per failure, every declared family named once, identity families
          only with an identity, each carrying the loop's retry count and time waited; `publishes` lists `reconciled`,
          then `pushed`, then `noop`, then each `failed`; a subtree family, `review` or `lineage`, counts movement only
          where it changed a record under its subtree; a stopping state publishes nothing
        - Build `test-first` (one behavior at a time):
            - a family whose refs the loop's pulls moved reads `reconciled`, one that pushed with none `pushed`, and one
              with neither `noop`
            - with no identity, `no-identity` names the identity families and no outcome does
            - `no-remote` leaves `publishes` empty
            - a state-only push whose pull cannot reach the state remote ends before any push, `pulls` carrying that
              `failed` outcome with its notices and `publishes` one `failed` naming every family of its scope

### `[ ]` **9.5 The deadline and backoff — § 6.1, § 6.7**

- _Goal:_ No `pull` or `push` stalls a session past 120 s, and retries back off by the host's own push time, so writes
  stay local for the next firing point whatever the remote does.

    - The deadline is a 120 s bound on the sleep port (3.1.a), started with the operation, whose end aborts the signal
      passed to every Git call (2.1); on the fake's virtual clock a retry's wait ending before it wakes first, and a
      case reaches the deadline only by advancing the clock while a call never returns; the `n`th retry waits on the
      sleep port for a time the random source draws uniformly from zero to the lesser of 10 s and `d · 2^n`, `d` the
      last push's duration, holding no lock
    - Build `test-first` (one behavior at a time):
        - an HTTP endpoint that accepts the connection and never answers ends `pull` and `push` at the deadline, `failed`
          `unreachable` with cause `timeout`, carrying the notices of what applied, with no helper process left, and the
          next push lands the writes
        - a deadline passing between attempts ends the loop `retries-exhausted` with its retry count and time waited
        - each retry's wait stays within its limit, its draw taken from the random source
        - in the separate layout, an `unreachable` failure's remedy names moving a transport setting held only in the code
          repository's config — `core.sshCommand`, a credential helper, or an `http.*` key — to the person's global
          configuration or the store directory's (§ 9.7), which the default layout's omits

### `[ ]` **9.6 The conformance sync items in both layouts — § 14.1**

- _Goal:_ The shared suite's sync items, and the assertions 4.4.d holds for a pull or push, pass over the ref backend in
  both layouts, so no exclusion remains beyond § 14.1's.

    - The fixture's remote hooks drive a real bare origin, designated `push` on the code remote in the default layout
      and through the store directory's `backing` in the separate one; `remote(false)` sets the remote's `arc-state` to
      `off`, so pulls and pushes report `no-remote`, and from 13.1 runs the move such a setting calls for; `remoteState`
      moves the origin away for `down`, advances it from an executor wrapper at the push for `contended`, as
      `inRepoRemote` (`__tests__/helpers/store/in-repo-remote.ts`) does, and installs a receive hook for `refusing`
    - `remote(true)` returns a store over a second clone of the origin that pulls before each read and pushes after each
      write, as `remoteFacingStore` (`__tests__/helpers/store/in-repo-remote.ts`) does, so item 16's reconcile
      assertions write through it and read `reconciled` at the local push
    - The fixture declares `syncRetryCount` and `syncWaitedMs` from its own virtual clock and sleep port (3.1.a) and
      random source, so the contended case's figures are exact and no backoff wait reaches the deadline
    - Removes 4.4.d's exclusions held for a pull or push, which Phase 11's exit criterion retires: item 16, the
      pull-side merge cases, recovery's `unreachable`, `refused`, and `retries-exhausted` cases, and
      `primary-role-reopen-sync-and-current-side-conflicts`
    - Each layout's conformance time read once here against the in-repo conformance's on the same machine, so a fixture
      breaking § 14.12's 1.5 times bound is caught before 18.3 measures it in CI

## **Phase 10:** Lifecycle across clones

_Purpose:_ Ends and reopens read from state rather than from refs' absence: leased deletes and by-name history fetches,
pending ends and reopens, a completed item's folder rebuilt from its merged history ref, late writes meeting ends, and
the withdrawal rule for two ends — the rules the model checks held.

### `[ ]` **10.1 Leased deletes and by-name history fetches — § 6.5**

- _Goal:_ No push recreates a ref another machine's lifecycle move deleted, and a lifecycle move whose delete loses to a
  write holds rather than undoing.

- **Additional Context:** `notes-storage-ref-backend.md` § The first model check

    - The push loop's listing gains every delete an end or reopen owes; its skip of a live ref with a pending end is
      10.2.a's
    - Build `test-first` (one behavior at a time):
        - Integration tier, two and three clones on one bare origin
        - every push of a work item's or cohort's ref, live or under history, and every delete is leased
        - an end's delete losing its lease to a write merges that tip into the local history ref and leases again
        - a reopen's history-ref delete losing to another machine's write to the completed item merges it into the local
          live ref, the quarter merge keeping the folder's removal
        - the push loop's pull fetches by name each history ref its push creates, updates, or deletes, so a history-ref
          create losing to a restored ref settles rather than spinning to the deadline
        - a reopen racing another clone's write to the completed item keeps the write on the reopened item when the
          reopening loop's by-name fetch brings it, merging the fetched tip into the live ref
        - two worktrees of one clone, one's loop owing a ref's delete for an end, paused between its merge and its push
          while the other's pull fetches another machine's write to that ref: the delete repeats rather than removing a
          tip it never merged, and the next attempt merges that write into the history ref first

### `[ ]` **10.2 Another machine's end and reopen, read from state — § 6.4, § 6.6**

- _Goal:_ Every pull reads another machine's end or reopen from the records state holds, whichever merge brought them,
  so no live ref returns beside a published end and no end is lost to a reopen.

- **Additional Context:** `notes-storage-ref-backend.md` § The first model check, § The second model check

    - A module of its own for the pending-end and pending-reopen tests, kept apart from the merge, whose definitions of
      this clone's own unpublished end and reopen read records, never the tracking history ref, replacing 9.2.a's
      stand-in; it takes the local and incoming ref sets and the test of what counts as published as parameters, the
      pull passing the store's refs, its tracking refs, and a published end's tracking state, and 13.1's copy its own
      (§ 10.4)

    - `[ ]` **10.2.a Pending ends**
        - The push loop's listing skips a live ref whose item has a pending end, which waits for the pull that applies
          it
        - Build `test-first` (one behavior at a time):
            - a quarter folder beside a live ref, or beside a history ref whose log lacks the folder's `endBatch`, is a
              pending end
            - lineage in the fetched registry is a pending end only where the fetch left the live tracking ref absent,
              and lineage beside a live ref the remote still holds ends nothing
            - the pull fetches by name, in one fetch, the history ref of every item with a pending end, and a live ref
              then merges into the fetched history ref and moves under `refs/arc/history/`
            - a history ref fetched by name ahead of the merge merges only after the test, and only for an item with no
              end pending
            - a clone that reopens and ends an item between pushes, publishing only the history ref and the record, has
              its end applied on every other clone
            - a reopen's by-name fetch bringing a tip that holds an end the live ref's log lacks ends the item, as 10.1's
              reopen race extends
            - a history copy lacking a later write's `batch` takes no pending end from the folder it refreshed
            - lineage written beside a live ref and published reads no end through two pulls and a push from a second
              clone, and the primary's later removal ends the item there at the next pull, every later pull reading none
              pending; the same with the primary removed first and the lineage written after
            - an abandoned item whose history ref holds a late write's conflict records reads no end pending at any later
              pull
            - a live ref whose item has a pending end stays out of the push loop's listing, so an unleased live-ref push
              never recreates an ended item's ref
            - after a quarter's renumbering merge (9.2.b), each clone's next pulls read no pending end

    - `[ ]` **10.2.b When the by-name fetch fails**
        - Build `test-first` (one behavior at a time):
            - a by-name fetch that fails leaves the end pending and the live ref in place, reports the state remote
              `failed` with that cause and the notices of what applied, and a push meanwhile lists no live ref of that item
            - the next pull, its merge bringing nothing, applies the end
            - a push whose own pull's by-name fetch fails ends before any push, `pulls` carrying that `failed` outcome
              with its notices and `publishes` one `failed` naming every family of its scope
            - a by-name fetch that succeeds without the history ref reports `end-pending` naming it on every pull until
              a clone holding it pushes it back, and the next pull applies the end

    - `[ ]` **10.2.c Pending reopens**
        - Build `test-first` (one behavior at a time):
            - a history ref this clone holds, with no unpublished end of its own on it, beside a tracking ref for the live
              ref and no folder in the merged quarter, is a pending reopen, applied at the pull whose state shows it rather
              than the one whose merge brought the folder's removal
            - an archived item reopened and then given lineage beside its live primary reopens on a clone holding its
              history ref
            - a live ref back beside lineage alone reads as a reopen keeping the end's removals
            - a clone whose published end another machine then reopens applies the reopen at its next pull
            - a pruned tracking ref with no end record reads as a loss the next push restores

    - `[ ]` **10.2.d This clone's own unpublished end and reopen**
        - Build `test-first` (one behavior at a time):
            - a clone holding another machine's published archive when that machine's reopen publishes applies the reopen
              and deletes no live ref
            - a clone that undid its own unpublished archive by a reopen before applying another machine's end that is
              then reopened deletes no live ref
            - a clone holding its own unpublished reopen of an item another clone reopens and abandons between its pushes
              ends the item at its push loop's pull and publishes no live ref beside the lineage, the same where another
              worktree's by-name fetch moved the history tracking ref first
            - a clone whose live ref was never reopened applies another machine's abandon though another worktree fetched
              the history ref by name first
            - a clone that published an archive and then applied another machine's reopen applies that machine's later
              abandon, as does a clone whose other worktree fetched the item's history ref by name before another machine
              reopened and abandoned it, neither reading the reopen as its own
            - this clone's own unpublished end, made after a reopen of its own, meets another machine's published reopen
              by merging the fetched live tip into its history ref and leasing the live ref's delete on that tip, and a
              live ref back without the folder's removal meets the end the same way

### `[ ]` **10.3 A completed item's folder across clones — § 6.4, § 7.3**

- _Goal:_ A completed item's folder changes only with its history ref, so two machines' writes to it are filed once on the
  history ref and no folder rebuild drops a write another machine's refresh carried.

    - Build `test-first` (one behavior at a time):
        - a folder only one side changed takes that side's, and a removal on one side beside a change on the other holds
        - two clones writing one completed item's single-writer record: the second's pull fetches the history ref by
          name, merges it, files one conflict record there, and rebuilds the folder naming the history ref's conflict IDs
          and the pull's batch
        - a write merged in by a pull by name rebuilds the folder the same way
        - a clone whose history copy lacks the folder's `batch` leaves the folder as merged until its own pull by name,
          and its `history`, `changes`, writes, and reopen refuse `state-unresolvable` naming the ref, each landing after
          a pull by name
        - two writes to one completed item whose history ref a mirror push removed from the remote leave the second
          writer's folder and history ref as they were, report `end-pending` naming the ref, and apply every other ref

### `[ ]` **10.4 Late writes and ends — § 6.6, § 7.4**

- _Goal:_ A late write meets an end by merging into the item's history ref, the end's version staying current, so the
  end's other writes stand as written and the late version is kept.

    - Build `test-first` (one behavior at a time):
        - a write racing an end between the push loop's pull and its push lands on the ended item
        - a live ref back with its folder still in place meets the end as a late write
        - a late write changing a record the end also changed keeps the end's version current and files the late version
          in a conflict record on the item's ref, whichever side is remote, while a record only the late write changed
          merges in
        - an archived item's folder is refreshed from the merged tree, and an abandoned one's pull reports
          `ended-with-conflicts` naming its conflict records
        - a pull applying another machine's end while this clone holds unpublished writes merges the local ref into the
          fetched history ref, and the next push fast-forwards it, leased
        - a write to a completed item unpublished while another clone's reopen publishes lands on the reopened item, the
          folder's removal kept; the same with the item reopened and ended again first, the write merging into the new
          end's history ref
        - a merge leaving a live item its lineage and no primary refuses a put of its other records naming the lineage,
          while a put of its primary, or a batch putting the primary beside a companion, restores it and a removal ends
          it

### `[ ]` **10.5 Two ends of one item — § 6.6**

- _Goal:_ Of two ends of one item the first published holds: this clone withdraws its own unpublished end whole, and two
  ends both published are reported with the remedy that leaves one.

- **Additional Context:** `notes-storage-ref-backend.md` § The first model check, § The second model check

    - The withdrawal is one local transaction inverting every write the end's batch made, and an earlier unpublished
      lineage it relied on, with the provenance `sync` `withdraw-end`
    - Its inbox writes invert like the rest, found by the end's batch ID: each entry whose `_Id:_` line the end's batch
      added to an inbox is taken back out unless the merged published side holds it, and the routing receipts the batch
      wrote are removed, unpublished as the end is, as the withdrawal removes the conflict record it filed; no receipt
      is written, so the backend defines no receipt's content
    - Build `test-first` (one behavior at a time):
        - two clones ending one item — archive against abandon, and two archives, each perhaps after a reopen of its own
          — leave the first published, the second reporting `end-withdrawn`, through its push's `pulls` where the push
          loop met it
        - two abandons keep the published lineage and remove the conflict record filed over the withdrawn one
        - a withdrawn end whose batch closed a cohort reopens it, unless the published end closed it too, and each inbox
          entry it returned is taken back out and the receipt the end wrote for it removed, so its latest receipt again
          names its home before the end, unless the published end returned it too, whose receipt then stands
        - a clone that wrote the item's lineage in one batch and removed its primary in a later one, neither published,
          meeting another clone's archive, withdraws both and reports no `ended-twice`
        - a clone holding its own unpublished archive meets a lineage end as pending and withdraws its archive
        - the writes made around the withdrawn end merge into the published end's history ref as late writes
        - two ends both published — after a mirror push erased the first, or lineage beside an archive from one clone or
          two — report `ended-twice` on every clone, whose remedy leaves one end, as for two archives into two quarters,
          and every later pull reads no end pending
        - a decomposition's children stay as items of their own after its withdrawal

### `[ ]` **10.6 `arc rename`'s retry over a missing history ref — § 4.5**

- _Goal:_ Renaming an archived work unit on a clone that lacks its history ref completes: the verb pulls the refs the
  refusal names and retries, so the refusal never leaves the person at a dead end.

    - The verb's store path, `runStoreRename` (`lib/work-unit/verbs/rename-store.ts`), live over the ref store, which
      reports its state off the branch (`usesOffBranchState`, `lib/store/lifecycle-write.ts`; 3.1.a): meeting
      `state-unresolvable` whose `historyRefs` names refs, from `readStoreRenameSubject` or from the write
      `prepareStoreRename` (`lib/store/lifecycle-rename.ts`) and `applyPreparedLifecycleWrite` make, it pulls them by
      name (`PullInput.history`, 9.1.b) and runs again from the subject read, once; a pull that fails, or a second
      refusal, returns the refusal as it stands
    - Build `test-first` (one behavior at a time):
        - Integration tier, through `runStoreRename` over `createRefStore`, two clones on one bare origin
        - a rename of an archived work unit on a clone whose history copy lacks the item's history ref pulls it and
          lands, the folder renamed and its number kept
        - on a clone that cannot reach the remote, the same rename returns `state-unresolvable` naming the ref and changes
          nothing

## **Phase 11:** Sync under faults

_Purpose:_ What a rewrite, a broken ref, a remote, or a hook does to sync: the ancestry check and its kept tips, local
tracking updates that fail, refs left out of a push, a partial clone's completeness check, carried code refs, hooks,
receivers without atomic pushes, and races a server catches.

_Exit criterion:_ Every integration case of § 14.5 passes on every change, in both layouts where the case names them,
but three that need later phases: the presence read's bound (12.2.b), an imported store's ended items (15.2), and a
carried ref under `moved` (16.1) and `designation-needed` (12.2.c); and the ref-backend fixture passes the shared suite
in both layouts with no exclusion beyond § 14.1's, 4.4.d's last set removed (9.6).

### `[ ]` **11.1 The ancestry check — § 6.3**

- _Goal:_ A state ref whose new head does not descend from the last one seen is refused and reported with three ways out,
  while every other ref applies and a local tracking failure is never read as one.

    - The three remedies travel in the notice's remedy `text`, since `Remedy.argv` (`lib/store/refusal.ts`) holds one
      command
    - Build `test-first` (one behavior at a time):
        - a rewritten ref refuses at the pull, keeps its tracking and local tips, applies every other ref, and reports
          `history-diverged` naming both tips with the three remedies as Git commands against the store's repository,
          each forced fetch carrying § 6.2's flags
        - each remedy leads back to a clean pull
        - the same refusal with `fetch.showForcedUpdates` false in the person's global configuration and in the store
          repository's own, in both layouts
        - a ref pruned while its item lives keeps its last tip at `refs/arc/tmp/seen/<remote>/<path>`; a returned tip that
          neither descends from it nor is its ancestor fails the check, the pull deleting the tracking ref it created and
          reporting `history-diverged` again at a second pull, while one that descends or is an ancestor passes and the
          kept tip goes
        - after the forced fetch taking theirs, the kept tip goes and the next pull is clean
        - a `!` line whose new tip descends, or whose old tip is absent, reports `tracking-update-failed`, keeps that
          ref's tips, applies the rest, and the next pull applies it
        - a push holding writes on a diverged ref ends at once as terminal `refused` for every family of its scope, the
          notice in its `pulls`, while one holding none past the kept tip publishes every other ref
        - 9.4.b's two-worktree race run again with the check live: no clone's next pull reports `history-diverged`

### `[ ]` **11.2 Refs left out of a push — § 3.3, § 6.7**

- _Goal:_ A ref whose metadata a commit outside ARC broke, or whose end is pending, holds back exactly the unpublished
  batches that span it, and every other ref publishes.

    - Build `test-first` (one behavior at a time):
        - a broken item ref is left out of the push with every ref its unpublished batches reach — a batch spanning it and
          a second ref, and another spanning the second and a third, leaving out all three — failing their families
          `refused` while every other ref pushes, the refs a pull merged beforehand among them
        - a push whose other families then exhaust their retries reports one `failed` outcome for each failure
        - the same commit pushed outside ARC makes another clone's pull keep that ref, apply every other, and report a
          `namespace-corrupt` notice, while that clone's push fails its families only where it holds a write on that ref
        - a live ref left out for `end-pending` leaves out a ref a batch spans with it alike
        - a forward repair on either clone, once pushed, brings both back to reads that succeed

### `[ ]` **11.3 A partial clone's fetch — § 6.2**

- _Goal:_ A blobless or partial clone holds every state object after each fetch, so no read ever reaches the network.

    - After each fetch in a partial clone, `git rev-list --objects --missing=print` over the fetched tips short of the
      tracking tips; any missing object reruns the fetch with `--refetch`, and one still incomplete fails the remote as
      terminal `refused` naming the objects; a clone with no filter skips the check
    - Every check of a blob's presence runs with `--no-lazy-fetch`, since a plain `cat-file -e` fetches the blob it
      tests in a partial clone
    - Build `test-first` (one behavior at a time):
        - Integration tier
        - in a blobless partial clone of an origin whose state records share blobs with code history, served with and
          without bitmaps, over protocol v2 and v0, and with `remote.<name>.negotiationInclude` configured, a first pull
          and a later one each end holding every state blob, and reads run with no fetch
        - over protocol v0 from an origin with bitmaps, a later fetch's check finds the object the fetch left out and the
          `--refetch` rerun brings it, so the leg shows the check working rather than passing with nothing to find
        - a leg whose fetch leaves nothing out records that it does, a control beside the leg that loses a blob
        - a clone with no filter runs no `rev-list` check

### `[ ]` **11.4 Carrying a code ref — § 6.8**

- _Goal:_ A code ref rides the state push in one atomic push where one receiver serves both, or as an ordered first leg
  otherwise, and its own refusal never fails or delays the state publish.

    - Build `test-first` (one behavior at a time):
        - a carried ref over one atomic receiver and over ordered legs lands, `carry` reporting `pushed`
        - a carried branch rewritten with its `expect` lands where the remote branch still stands at `expect`, and is
          refused `stale-info` where another push moved it
        - a carried ref's own rejection repeats the push with state alone, `carry` reporting the refusal
        - an ordered code leg to an unreachable remote reports `carry` `unreachable` with its cause while the state leg
          pushes
        - a push carrying a code ref that publishes no state — on a failed pull and on a diverged ref — pushes the ref
          alone, as an ordered leg and over one atomic receiver, `publishes` as the stop gives it; the same under
          `designation-needed` and `moved` are cases of 12.2.c and 16.1, which produce those states
        - a clone with no code remote reports `no-push-destination`, the state pushing alone
        - a loop ending `retries-exhausted` with the carried ref not landed reports `carry` `unreachable` with cause
          `timeout`

### `[ ]` **11.5 Hooks, atomic capability, and races a server catches — § 6.8, § 6.9**

- _Goal:_ A hook or a receiver's limits shape a push only as § 6.8 and § 6.9 read them, and a race the server catches at
  its commit is told from a refusal by state.

    - A server's own move inside its window comes from an `update` hook, or a pre-receive hook run with
      `GIT_QUARANTINE_PATH` unset, since Git refuses a ref update from inside the quarantine a pushed pack lands in; the
      hook fails the test where its own update did not land
    - Build `test-first` (one behavior at a time):
        - a pre-push hook declining a carried ref repeats with state alone and reports its text verbatim as
          `hook-declined`, and one declining a state-only push ends the loop terminal `refused` with its stderr
        - a pre-push hook sleeping past the deadline ends `timeout` at the deadline with no hook process left, its
          remedy naming the hook, and one passing a push of `refs/arc/*` alone lets the push land
        - a receiver without atomic pushes falls back to ordered legs for one state ref and a carried ref, and refuses
          several state refs terminal `refused` naming the capability
        - a server moving or deleting a ref inside its own window makes a leased create, a leased delete, and an update
          each read as a lost race that settles on the next attempt; a hook that moves the ref and declines reads as one
          too, and one that declines and moves nothing reads terminal `refused` with its text
        - a server moving the carried branch inside its window fails the atomic push `atomic transaction failed` on every
          line, which the backend attributes to the carried ref by one `ls-remote` and its lease or ancestry, repeating
          with state alone and reporting the ref `raced`

### `[ ]` **11.6 Sync between clones** — validate exit criterion at segment scope

- _Goal:_ Every integration case of § 14.5 passes, in both layouts where it names them, with no lost write, but the
  three the exit criterion leaves to 12.2.b, 15.2, 16.1, and 12.2.c, and the shared suite runs with no interim
  exclusion left.

    - Request `arc check segment`

## **Phase 12:** Designation and read sources

_Purpose:_ Who designates a clone's state remote at its first pull, how a due question is reported, the project check
before any `push` designation, a read source fetched and read through its own store, and the tracked backing-repository
pointer.

_Mode:_ `slice` through Phase 13 — closes on a clone that designates its state remote, reads an upstream, and moves
between layouts as its designation calls for.

### `[ ]` **12.1 The tracked backing-repository pointer — § 9.7**

- _Goal:_ `storage.backing_repository` is a known configuration key, empty by default, that `arc config status` lists and
  `arc config validate` knows, while only the hidden `arc store` commands and a first designation act on it.

    - Added to `ARC_CONFIG_FIELDS` (`lib/config/schema.ts`) through `stringField` with a `repository-url` kind added to
      the string policy kinds and the posture `unset`, as `worktree.post_create` takes, over a non-empty trimmed string,
      so the empty value stays valid, and declared empty in the package's `arc/system/arc-config.yml` at the catalog's
      position, as `__tests__/unit/config/inventory.test.ts` matches the two in order; the shipped file states the key
      as fact, with no transitional framing
    - The project's `.arc/system/arc-config.yml`, a Configurable file, gains the key by an edit in `.arc/`, never a copy
      over it; the catalog's key lists in `__tests__/unit/config/schema.test.ts` and the full `ConfigSettings` literals
      in the tests take it
    - Build `test-first` (one behavior at a time):
        - `arc config status` lists the key empty
        - `arc config validate` gives no unknown-key warning for it

### `[ ]` **12.2 A first designation — § 9.2, § 9.3**

- _Goal:_ A clone's first pull sets its state remote without asking only where the answer cannot publish state the
  person did not choose, and otherwise reports the question with its answering command, never prompting.

- **Additional Context:** `notes-storage-ref-backend.md` § The second model check

- _Note:_ The rule changes what a remote with no `arc-state` key means, which before it read as `no-remote`; the
  fixture's `remote(false)` sets `off` (9.6), earlier tests designate explicitly — planted repositories through 3.1.e,
  the multi-clone cases through 9.1.b — and the 9.6 items and every Phase 9–11 case run again green with the rule live.

    - A designation module under `lib/store/ref/` over 8.1's counted designation, and its integration with `pull` and
      `push`; the backend's ports gain a pointer port reading `storage.backing_repository` from the invoking checkout's
      `arc-config.yml`, which 16.3 extends with a write, so `lib/store/` reads no configuration module itself
    - A first designation offers `push` and `off` for the code remote and for `backing`, and `push`, `read`, and `off` for
      an upstream; where two remotes other than the code remote hold the registry, the first in `git remote`'s order is
      asked, the next once it is answered

    - `[ ]` **12.2.a The decision**
        - Build `test-first` (one behavior at a time):
            - Integration tier, a fresh clone of remotes that hold or lack the registry, through `pull`
            - a code remote holding the registry where no other remote does sets `push` without asking, where that
              changes no layout and the project check passes
            - a clone already holding state in the separate directory is asked instead
            - an upstream holding the registry is asked `push`, `read`, or `off`, and a code remote where no remote holds
              it `push` or `off`
            - a clone whose store directory carries `backing` has it as its only candidate, and a fork upstream's `push`
              counts for nothing beside it
            - a pointer naming a backing repository at a first designation adds `backing` at its URL and asks about it,
              and the code remote is never set or asked about
            - a remote of the code repository named `backing` is never set or asked about, its key counting for nothing
            - a clone with no code remote is asked about nothing but a remote holding the registry
            - two remotes other than the code remote holding the registry: the first in `git remote`'s order is asked,
              and once its answer is set the next pull asks about the second
            - every remote `off` or `read`, or none to ask about, reports `no-remote`, and two `push` keys
              `designation-ambiguous` naming both

    - `[ ]` **12.2.b Presence reads**
        - `git ls-remote` of `refs/arc/project/registry` alone, run through the backend's executor and bounded by a
          `DEFAULT_NETWORK_TIMEOUT_MS` bound on the sleep port, whose end aborts its signal (3.1.a), not by the real
          timer `remote-ref-reader.ts` arms, counting only an output line naming exactly that ref, since `ls-remote`
          matches by tail and also prints a ref such as `refs/arc-remotes/x/refs/arc/project/registry`
        - Build `test-first` (one behavior at a time):
            - Integration tier
            - a remote whose presence read fails sets and asks nothing and reports a `failed` `unreachable` outcome in the
              role `candidate`, with no state beside it, and the next pull once it answers decides
            - a presence read against an HTTP remote that accepts and never answers fails once the case advances the
              clock past the bound while the server holds the connection, deciding nothing, as § 14.5 has it
            - a presence read inside `pull`, beside the operation's pending deadline, returns the remote's answer
            - a remote holding only a ref ending in that name reads as not holding the registry

    - `[ ]` **12.2.c The states a pull and push report**
        - Build `test-first` (one behavior at a time):
            - a fresh clone's first `pull` over each case — the code remote holding the registry, an upstream holding it,
              neither, and a tracked pointer — sets or reports `designation-needed`, the same whether or not the test
              process has a terminal, since the store asks nothing, its `argv` recommending `push` for the code remote and
              `backing` and `read` for an upstream
            - a designated clone syncs by its record from a worktree whose pointer is absent while the clone carries
              `backing`, present while it carries none, or at another URL, and reports no state
            - a state that stops the sync fetches and pushes nothing for the state remote
            - a push carrying a code ref under `designation-needed` pushes the ref alone, as an ordered leg and over one
              atomic receiver, `publishes` empty, as § 14.5 has it

### `[ ]` **12.3 The project ID and the `push` check — § 9.8**

- _Goal:_ No designation publishes one project's state onto another's, and a clone that never minted a project ID adopts
  the one its remote holds.

    - The check fetches the remote's registry and forwarding record into `refs/arc/tmp/designate/<remote>/`, cleared before
      and dropped after, so a `!` line fails the read, with § 6.2's flags under the pull's deadline or 120 s of its own;
      the arms a setting or an answer runs land with `arc store remote` in 13.4, and the forwarding-record arm with the
      record in 16.1
    - Build `test-first` (one behavior at a time):
        - a clone holding a project ID whose pull would set `push` without asking on a remote whose identity record names
          another project reports that remote's `failed` outcome terminal `refused`, naming both projects, with the remedy
          `arc store remote <remote> off`, setting and pushing nothing
        - a remote holding this project's ID, or none, is designated by the rule
        - a designation fetch against a remote that never answers ends within its deadline, setting nothing
        - a check whose fetch meets a `!` line fails the read, setting nothing
        - a teammate's registry holding no identity record merges with the published one by unrelated histories, adopting
          its ID

### `[ ]` **12.4 Read sources — § 9.6, § 9.8**

- _Goal:_ An upstream's state is fetched into its own namespace and read through a read-only store, never merged or
  pushed to, its refusals recover as the store's do, and a contributor's local-only store adopts its project ID.

    - `createReadSourceStore(ports, remote)` beside `createStore` in `lib/store/create.ts`: the ref backend over
      `refs/arc-remotes/<remote>/`, typed `ReadOnlyStore`, keeping its last manifest at
      `refs/arc/tmp/read/<remote>/version`; in the separate layout the source is fetched by its URL
    - Build `test-first` (one behavior at a time):
        - Integration tier, each case in both layouts
        - a pull fetches a read source's project namespaces into its namespace and no identity-scope ref, the person's
          own among them, its outcome in the role `read`
        - the read-source store reads, lists, and looks up there, as of its own state versions too
        - nothing it fetches merges into local state or pushes
        - a read source still pulls under a state that stops the state remote's sync
        - a history ref its refusal names, pulled by name, resolves
        - a diverged ref there reports `history-diverged` with taking theirs as its one way out
        - on a clone with no state remote and no ID, the first pull fetching a read source's identity record writes it
          create-only, `sync` `adopt-project-id`, a later pull leaving it, while a clone with a state remote adopts
          nothing from a read source

## **Phase 13:** The migrate verb and layout moves

_Purpose:_ The migrate verb's engine and the hidden `arc store` commands: a move's record and lock, all-or-nothing
landing, the report a move returns, the layout move both ways in its restartable order, `arc store remote`'s show and
set, and the `move-incomplete` and `move-unfinished` states.

_Exit criterion:_ Every case of § 14.6 but those that need a follow, leaving the source, the forwarding record, or a
`backing` repoint, and § 14.7's layout-move cases, pass, and the conformance suite's sync items still pass in both
layouts.

### `[ ]` **13.1 The move engine and the layout move — § 1.2, § 10.2, § 10.3, § 10.4, § 11.4**

- _Goal:_ A clone's store moves between the code repository's refs and the store directory with every ref, tracking ref,
  and kept tip, through one engine that keeps a record of each move across its switch and lands at its destination all
  or nothing, so an interruption at any step is finished by a rerun in the direction the record names, never reversed;
  tests reach every move through the two entries the `arc store` handlers call.

    - `runStoreRemote(ports, { remote?, role?, ownState? })` and `runStoreMigrate(ports, { to?, trial?, leaveSource?,
      import? })` in `lib/store/create.ts`, each building its store through `createRefBackend`; `runStoreRemote`
      returns the roles view, a setting with the `MigrateReport` of any layout move it ran, a refusal, or a confirmation
      due naming the repository and what a yes publishes; `runStoreMigrate` returns a `MigrateReport`, a refusal, or a
      question due carrying `designation-needed`'s remote, choices, and remedy (§ 2.2), which the follow produces (17.1)
      and its handler asks (17.2.a)
    - Their refusals are `StoreCommandRefusalSchema` beside them, § 10.1's closed union, every code landing here: each
      refusal Phases 13, 16, and 17 build takes the code § 10.1 gives its kind, which its case names; the import's
      refusals of Phases 14 and 15 take the codes 14.1 states; and one a store operation, the move lock, a project
      check, the import's check of a store holding state, or a remote read returns travels in the `store` arm unchanged,
      keeping its class
    - A migrate engine under `lib/store/ref/`: the move lock `arc/locks/migrate.lock`, held for the whole run; the record
      at `refs/arc/tmp/migrate/move`, a root commit holding `move.json`, written expecting absence and replaced leased on
      its value; gathered refs under `refs/arc/tmp/migrate/`; a layout move or the import landing in one `update-ref`
      transaction
    - `move.json` is a schema discriminated by kind: the layout arm, its two layouts, lands here; the remote, follow, and
      leaving-the-source arms, each remote by its name and the fetch and push URLs `git remote get-url` and
      `git remote get-url --push` resolve at the move's start, land with their moves in 16.2, 17.2, and 17.3
    - A step port the engine calls before each step a move declares, by the step's name — the layout move's build,
      record, rename, designation change, and delete here, and each later move its own as it builds the step (14.3;
      16.2, 16.3, and 16.4 for a remote move; 17.2.a; 17.3) — which a test makes throw, or at which a child process
      running the move is killed
    - The layout move: a local fetch between the two, then a delete of the source, under the layout lock from listing
      through the delete; into the separate layout the store builds under a temporary name and renames into place, out
      of it renames aside and is removed; moving in, the code remote's `push` is set before the rename, and moving out,
      `off` after it
    - A layout move run as another move's switch runs under that move's lock, writes no record of its own, and keeps its
      temporary refs under `refs/arc/tmp/migrate/layout/`
    - The copy onto a destination holding state (§ 10.4), a module of its own: 9.2.a's merge and 10.2's pending tests
      run over its own local and incoming ref sets and its own test of what counts as published, taking no ref lock,
      each broken rule in its `notices`:
        - a layout move's, which merges store refs it finds at its destination: the destination's refs local and the
          source's incoming, an end on the destination published where the source's copy of the item descends from it,
          committing onto the destination's store refs through 8.3's commit step in its held mode, under the layout lock
          the move holds (§ 11.4)
        - a remote move's copy and re-copy (16.2, 16.4), the follow's clearing copy (17.2.a), and leaving the source's
          (17.3): the destination's refs fetched under `refs/arc/tmp/migrate/` local and the source's incoming,
          committing onto those temporary refs, which no write or layout move reads, so through 8.3's commit step in its
          unlocked mode, in the code repository, where those refs live, each then pushed leased on the destination tip
          it read
    - The default-layout conformance fixture's `remote(false)`, once this task's layout check lives, runs the no-target
      `runStoreMigrate` after it sets `off`, and `remote(true)` after it sets `push`, each deferred to the fixture
      store's next call through a pending chain, as `inRepoRemote` (`in-repo-remote.ts`) defers its own; a Phase 9–11
      case that turns a remote off on a default-layout clone holding state does the
      same
    - `runStoreMigrate` with no target finishes a recorded move, then brings the clone into the layout its designation
      calls for, deleting leftovers and temporary directories
    - `--import` refuses `unsupported`, naming `--import`, until the import's entry lands (14.1)
        - _Retired in:_ Phase 14
    - `--to` on a clone with a state remote refuses `unsupported`, naming `--to`, until the remote move lands (16.2)
        - _Retired in:_ Phase 17
    - `--leave-source` refuses `unsupported`, naming it, until leaving the source lands (17.3), and a no-target run
      finds no follow due until the follow lands (17.1)
        - _Retired in:_ Phase 17
    - Build `test-first` (one behavior at a time):
        - Integration tier, through the two entries, as every case of Phase 13 is
        - a layout move each way, run by the no-target form, carries every store ref, the tracking refs,
          `refs/arc/tmp/seen/`, `refs/arc/tmp/version`, and `refs/arc/tmp/read/`, never `refs/arc/tmp/migrate/`
        - a landing that fails lands nothing at its destination
        - each step interrupted at the step port and rerun completes; one interrupted between the rename and the
          designation's change finishes in its record's direction
        - an interruption leaving the store directory beside a code remote carrying `push` reports `move-incomplete` from
          `pull` and `push`, naming both with its remedies, fetching and pushing nothing
        - a move out interrupted before its source's delete reports `move-unfinished` beside `no-remote` until a rerun
          deletes the leftover
        - a move out interrupted after its build and before its record leaves a temporary directory the next build
          replaces, a ref deleted meanwhile staying deleted, and a no-target run removes
        - a layout move finding store refs at its destination merges them, a broken rule in its `notices`, under the
          layout lock it already holds and with no ref lock taken
        - over a destination an earlier move left holding state, an end the source holds moves the destination's live
          ref under history
        - a reopen the source holds brings the destination's ended item back
        - a live ref the source holds beside the destination's end merges into that end as a late write
        - of two ends, the source's holds and the destination's is withdrawn
        - a writer in a second worktree creating one item and updating another lands both in the layout the move leaves,
          and a sync there that pulled before the switch pushes nothing to the old remote after it, the same for a move
          to local-only
        - after each move a ref rewritten on the remote still refuses `history-diverged` at the next pull
        - a `git remote rename` of `origin` among several remotes with no `remote.pushDefault`, a remote added beside a
          lone remote not named `origin`, and `remote.pushDefault` set each leave the store where it is and report
          `move-incomplete`
        - the 9.6 sync items in both layouts, and every Phase 9–11 case, run again green with the layout check live

### `[ ]` **13.2 The move lock and the record's guards — § 10.3, § 11.4**

- _Goal:_ Every move runs alone on its clone, and no run replaces another's record or proceeds past one it cannot read.

    - Build `test-first` (one behavior at a time):
        - two layout moves started at once from two worktrees: the second refuses `lock-held` before it fetches
        - a move started after a run was killed takes the lock its dead holder left
        - a record written by one run is never replaced by another's
        - a `move.json` that does not parse against its schema refuses the rerun `move-record-malformed`, naming the
          record

### `[ ]` **13.3 The report a move returns — § 10.5**

- _Goal:_ Every move returns one `MigrateReport` of what it wrote, and a `--trial` runs the same build and drops it, so
  a trial's report cannot drift from what its move does.

    - `MigrateReport` as § 10.5 gives it, its `refused` rules and `notices` filled by the moves and the import as they
      land; a layout move a setting runs returns its report through `runStoreRemote` (13.4.a)
    - A trial's match with its move is a case of each move that takes `--trial`: the import's in 14.3, and a remote
      move's, the one that changes the clone's layout among them, in 16.2 and 16.5
    - Build `test-first` (one behavior at a time):
        - a layout move the no-target form runs reports every ref it wrote, by scope and person
        - `--trial` with no target, or with `--leave-source`, refuses `request-invalid`, changing nothing

### `[ ]` **13.4 `arc store remote` — § 9.4, § 9.8**

- _Goal:_ A person sees each remote's role and sets one, the setting moving the layout first where it must and refusing
  any setting that would strand state or publish it where the person did not choose.

- **Additional Context:** `notes-storage-ref-backend.md` § The second model check

    - `runStoreRemote`'s show and set; the store reports a due confirmation and the handler asks, its prompt and
      no-terminal refusal covered by 13.5's handler tests; the follow's setting arm lands in 17.1
    - Repointing `backing` refuses `unsupported` until 17.5 builds it
        - _Retired in:_ Phase 17

    - `[ ]` **13.4.a Show and set**
        - Build `test-first` (one behavior at a time):
            - `arc store remote` shows each remote's role, the layout, and the store directory's remote, and `--json` the
              same as data
            - a setting that changes the layout finishes any recorded move, runs the layout move, and returns its report
              through `runStoreRemote`, every ref it wrote by scope and person
            - setting `push` while another remote carries it refuses `role-conflict` naming
              `arc store migrate --to <remote>` and `arc store remote <other> off`, and a code remote's `push` beside a
              `backing` carrying `push` refuses `role-conflict` naming `arc store migrate --to <remote>`
            - a team member on a fork who sets `push` for the upstream gets the separate layout, a pull and a push reaching
              the upstream by its fetch and push URLs, a `pushurl` among them, while a carried code ref goes to the fork
            - a setting that repoints `backing` refuses `unsupported`, changing nothing

    - `[ ]` **13.4.b The project check at a setting**
        - Build `test-first` (one behavior at a time):
            - a clone holding a project ID refuses `identity-mismatch`, naming both projects and setting and pushing
              nothing, when an answer, a setting, or a first designation of `backing` would set `push` on a remote whose
              identity record names another project
            - a designation after a check refused against another project's remote reads the next remote afresh

    - `[ ]` **13.4.c The pointer at a setting**
        - Build `test-first` (one behavior at a time):
            - where no `backing` carries `push` — none, or one carrying `off`, `read`, or no key — and the pointer names
              none, a code remote's `push` sets after the project check, moving the store into the code repository's refs
              and removing `backing`, after which `pull` and `push` sync there
            - where the pointer names a backing repository, the setting returns a confirmation due naming what a yes
              publishes and sets nothing, and with `ownState` sets as for a pointer naming none, its report naming § 9.6's
              route for keeping the backing repository as a read source
            - on a clone without `backing`, `arc store remote backing push` adds it at the pointer's URL
            - where the pointer names none, `backing` `off` or `read` sets in place, while `push` or adding refuses
              `role-conflict`, naming `git remote rename backing <name>` where the code repository has a remote so named
            - a `backing` setting refuses `role-conflict` while a code remote carries `push`, naming
              `arc store migrate --to <URL>`, and `move-incomplete` while state sits in the code repository's refs,
              naming its remedies, where a pull's first designation reports `move-incomplete` and adds no `backing`
            - where a remote rename, an added remote, or `remote.pushDefault` left the store reporting `move-incomplete`
              (13.1), a `backing` setting refuses `move-incomplete`, creating no directory

### `[ ]` **13.5 `arc store migrate` and the hidden `arc store` commands — § 10.1, § 1.2, § 1.3**

- _Goal:_ `arc store migrate` runs every move the verb defines through one engine, and `arc store` stays out of
  `arc --help` and every production path until the flip.

    - `arc store remote` and `arc store migrate` registered hidden in `cli.ts` as `hook-remedy-roadmap-conflict` is, each
      with its input declaration in `src/command-input-registrations.ts` and its `NO_INPUT_MATRIX` entry
      (`__tests__/fixtures/command-input/no-input-matrix.ts`), as that command's own declaration
      (`src/scripts/remedy-roadmap-conflict.ts`) and entry are; `--json` through `withInteractionContext`; the
      `--own-state` confirmation a prompt site declared through `declarePromptSite` (`lib/command-input/declaration.ts`)
      and asked through `prompt` (`lib/command-input/prompter.ts`), as `prompts/join-prompts.ts` declares and asks
      its sites, its no-input policy § 9.4's refusal
    - The handlers' production ports: `createDefaultRefStorePorts` in `lib/store/default-ports.ts`, beside
      `createDefaultStorePorts`, binding the executors, file access, clock, sleep, random source, identity, actor,
      production registry, and lock factory, the step port a no-op, and the pointer port the handler passes in: the
      handlers in `commands/` bind it over the config module's read of the invoking checkout's `arc-config.yml`, and 16.3
      adds its write there, so `lib/store/` reads no configuration itself (12.2); 14.1 adds the in-repo store the import
      reads
    - Build `test-first` (one behavior at a time):
        - `--to` from a local-only clone refuses `no-state-remote` naming `arc store remote <remote> push`, and for a
          URL the pointer's change then `arc store remote backing push`
        - `--json` gives each report as data
        - the `arc store remote` handler asks on a terminal through an injected prompt and runs a yes, sets nothing on a
          no, and without a terminal refuses naming `--own-state`
        - `arc --help` lists no `arc store`; a test reading every file under `src/` finds `runStoreRemote` and
          `runStoreMigrate` called only by the two handlers, and `createRefStore` and `createReadSourceStore` by nothing

### `[ ]` **13.6 Designation and layout moves** — validate exit criterion at segment scope

- _Goal:_ Every case of § 14.6 not needing a follow, leaving the source, the forwarding record, or a `backing` repoint,
  and every layout-move case of § 14.7, passes, and so do the conformance suite's sync items in both layouts.

    - Request `arc check segment`

## **Phase 14:** The import's first path

_Purpose:_ The import as the migrate verb's one-time source, proven on live work units and open cohorts: the transform
module reading through the in-repo implementation, the project ID from the review gate, the landing through the move's
transaction, its rerun and publication, and the comparison harness every later source reuses.

_Mode:_ `slice` — closes on a fixture repository's live items imported and compared clean against the in-repo
implementation.

_Exit criterion:_ Over a fixture in today's substrates, `arc store migrate --import` lands every live work unit and open
cohort, its trial report matching what it does, every record comparing clean, and a rerun after the landing finishing
without duplicating one.

### `[ ]` **14.1 The transform module and the import's entry point — § 1.2, § 10.8**

- _Goal:_ The import reads today's state through the in-repo implementation from a module the cutover can delete whole,
  refuses each record its build cannot land until the source is fixed, and lands into whatever layout the clone's
  designation selects.

    - The transform under `lib/store/ref/import/`, nothing else referencing it, naming surfaces through
      `IDENTITY_STATUS_FILENAME` and the layout resolver as the `surface-names` rule requires; `--import` and `--trial`
      through `runStoreMigrate`, whose transform uses the backend's own kind registry port (3.1.a) and whose ports add
      the in-repo store the transform reads, which only `lib/store/create.ts` may build
    - The fixture: a repository in today's substrates under `__tests__/helpers/store/`, built once as a prepared template
      each test copies (§ 14.12), holding live work units and open cohorts here, and each later source's rows as its
      task adds them
    - Each live work unit's review records and Candidate path log are read at the revision the in-repo implementation
      picks for its meta, the `revision` `composedMetaSource` returns over `composedMetas`'s composition
      (`lib/store/in-repo/meta.ts`), absent for a meta the working tree holds: its review records through the in-repo
      `list` and `read` with that revision's tree as `asOf`, since the in-repo `asOf` names a saved tree and its review
      sources otherwise read the working tree (`reviewSources`, `lib/store/in-repo/list.ts`), and its path log through
      `readRepositoryCandidateSupersessionChain` (`lib/work-unit/candidate-record-store.ts`), which gains a `revision`
      input its `git log` runs at, `HEAD` by default; the project's own records are read at the importing checkout's
      HEAD, which `Arc-Code-Head` names
    - The in-repo `list` reports a record its decode refuses only as a `malformed` diagnostic keyed by its path
      (`listedRecord`, `lib/store/in-repo/list.ts`), today's five schema-failing Candidate records among them (§ 10.9);
      for a kind whose row carries records as found, the transform maps that path back to its reference by the pairs
      `internalReferences` (`lib/store/in-repo/paths.ts`) enumerates at the same revision, reads it through the in-repo
      `read`, which returns its raw content (`readTracked`), and lands it
    - Every record built passes the serialization rules (`checkSerializationRules`, 5.1), the key checks (5.2.a), and
      the parse and stamp step (5.2.b), a refusal listed in the trial's `refused` under its rule
    - The project ID comes from `resolveRepositoryIdentity` at the landing; a trial reads the review gate's record
      through a `readRepositoryIdentity(publisher)` this task exports beside it from
      `scripts/review-gate/hosts/local/git-common-state.ts`, which reads and never mints, listing in `notices` that the
      landing would mint it where none exists
    - Wherever the build refuses — a record listed in `refused`, or a condition in `notices` that refuses the import —
      the import lands nothing and refuses `import-refused`, carrying its `MigrateReport`, while its trial returns that
      report; every case of Phases 14 and 15 that refuses the import until its source is fixed refuses so, and a store
      that holds state refuses through the `store` arm, as below (§ 10.1, § 10.5)
    - Phase 14's fixture holds no Errand, buffer section, held capture, or execute-bound mark, whose kinds the production
      registry declares no grammar for; 15.3 brings them under a test registry
    - Build `test-first` (one behavior at a time):
        - Integration tier, through `runStoreMigrate` over the fixture, as every case of Phases 14 and 15 is
        - the import lands in the default layout where the code remote carries `push`, and in the separate one otherwise
        - the store's project ID is the clone's review-gate repository ID, and a trial on a clone whose gate never ran
          writes nothing under `.git/arc/review-gate/`
        - a store that holds state refuses the import before its build, `identity-mismatch` naming both projects where
          it holds another project's ID and `version-conflict` naming what it holds otherwise, each with the remedy to
          import from a clone whose store holds none; one whose project ID is that repository ID finishes its landing
          (14.3)
        - a companion keyed as another kind is listed under `key`, and an entry the stamp cannot place an ID in and
          entries repeating an `_Id:_` under `entry-id`, each refusing the import until its source is fixed, after which
          the import lands
        - a fixture record breaking each serialization rule, one per rule of 5.1's table, is listed in `refused` under
          that rule's identifier, the import refusing until the record is fixed and then landing
        - a live work unit whose review records sit only on its unmerged branch imports them from that branch, and its
          landing commits name the importing checkout's HEAD as `Arc-Code-Head`
        - a live work unit's Candidate record today's schema rejects, which the in-repo `list` reports only as a
          diagnostic, lands unchanged
        - in the separate layout, the import creates the store directory and lands there

### `[ ]` **14.2 Live work units and open cohorts — § 10.9**

- _Goal:_ Each live work unit and open cohort lands under one UID reused across its kinds, every record at its current
  content on its owner's ref.

    - A live work unit's branch link and task captures land in 15.4, whose exclusions need the captures it derives
    - Build `test-first` (one behavior at a time):
        - a live work unit's meta, task list, draft, spec, notes, and companions land on one work ref under one UID
        - an open cohort's document lands on its cohort ref
        - the project inbox lands on its project ref, each entry stamped with an `_Id:_`
        - JSON machine records land in canonical form

### `[ ]` **14.3 Landing, rerunning, and publishing the import — § 10.4, § 10.5, § 10.11**

- _Goal:_ The import lands in one transaction with one `Arc-Batch` across every ref's landing commit, is finished by a
  rerun after any step, publishes through `push`, and reports in its trial exactly what it then lands.

    - Its steps, each declared at the step port (13.1): build, gathering every ref under `refs/arc/tmp/migrate/import/`
      in the store's own repository — the code repository in the default layout, and in the separate one the store
      directory, which the import first creates as 8.2 creates one, empty, so an interruption before the landing
      leaves a store that holds no state; land, in one `update-ref` transaction in that repository; and publish,
      through `push`; 15.3.a adds the transient-identity steps
    - The import writes no move record: a store whose project ID is the clone's review-gate repository ID is its own
      landing, from which a rerun finishes the steps after it (§ 10.4)
    - Provenance `migrate` `import`; one `Arc-Batch` for the landing commit on every ref, and one more for each replayed
      Candidate version (15.1)
    - A trial and its landing are compared as multisets of each ref entry's name with its UID masked, scope, person, and
      action, since the landing mints the UIDs the trial cannot name and `MigrateReport` carries no owner
    - Build `test-first` (one behavior at a time):
        - the landing writes every ref in one `update-ref` transaction, each ref's landing commit under one batch
        - the import interrupted after each step and run again completes
        - its trial report matches what it then lands
        - a run after the landing finishes the steps that follow it without minting a second UID for any owner

### `[ ]` **14.4 The import's comparison harness — § 14.7**

- _Goal:_ After an import, every record the in-repo implementation lists in the source it imported reads the same
  through the ref backend — its content and every field both carry, never its version — but for the transforms the
  import's table names.

    - A differential helper under `__tests__/helpers/store/`, on `lifecycle-differential.ts`'s precedent, over 14.1's
      fixture, reading the in-repo side from a fresh copy of the prepared template, the source as the import read it, so
      a source the import deletes, the transient-identity refs among them (15.3.a), still compares
    - The default comparator reads an entry kind's record less each entry's `_Id:_` stamp, the stamp § 10.9 gives every
      entry kind, so 14.2's project inbox compares clean; each later source registers a comparator for its own records
      with the other allowances its table row names, so a transform outside them reports
    - The harness compares the in-repo listing's diagnostics too, each matched to a record or diagnostic the ref backend
      lists, so a record the import dropped reports
    - Build `test-first` (one behavior at a time):
        - every live work unit's and open cohort's record compares clean
        - the project inbox compares clean less its stamps, and an entry whose text differs beyond its stamp reports
        - a record whose transform differs from its source by more than its table row reports the record and field
        - a record the in-repo listing reports only as a diagnostic, dropped from the landing, reports

### `[ ]` **14.5 The import's first path** — validate exit criterion at segment scope

- _Goal:_ Over the fixture, the import lands every live work unit and open cohort, its trial matching, every record
  comparing clean, and a rerun after the landing duplicating nothing.

    - Request `arc check segment`

## **Phase 15:** Every source the import carries

_Purpose:_ The rest of the import's source table, each row landed and compared through the first path's harness:
completed items and closed cohorts, Candidate chains, lineage and renames, the Errand identity refs and the three kinds
with no in-repo home, branch links with their exclusions and task captures, parked work units, notes snapshots, personal
state at D5's layout, and the review mapping's port.

_Mode:_ `replication` — closes when every row of § 10.9 lands and compares clean, and every source the import cannot yet
carry refuses it.

_Exit criterion:_ Every case of § 14.7's import, notes-snapshot, post-import, and Candidate items passes over the fixture.

### `[ ]` **15.1 Completed work units, closed cohorts, and Candidate chains — § 10.9, § 10.11**

- _Goal:_ Completed items land as an archive or close leaves them, under today's numbers, and each Candidate record's
  chain resolves through `history` exactly as today's reader resolves it over code history.

    - Candidate versions read from the plain path log `readRepositoryCandidateSupersessionChain` walks
      (`lib/work-unit/candidate-record-store.ts`), at the revision 14.1 names, never the in-repo `history`, which follows
      renames
    - No quarter repeats a work-unit number today, so the fixture builds its own two folders sharing a number, beside a
      gap as `2026-q3`'s at `54`
    - Build `test-first` (one behavior at a time):
        - a completed work unit lands its history ref — its Candidate chain replayed oldest first, then a commit of its
          current files — and its quarter folder under the number it holds today, two folders sharing a number and a gap
          surviving, and the next archive numbering after the quarter's highest
        - a closed cohort lands under today's `<NN><a|b>` folder name
        - each replayed version takes its own batch, and each ended item's record and history ref name one batch, so an
          imported store's ended items read as none pending (§ 14.5)
        - a chain with a version a merge commit introduced resolves through the store's `history` as through
          `resolveCandidateSupersessionAncestors`, and a broken chain and a record today's schema rejects refuse on both
          sides, the trial listing broken chains in `brokenChains`
        - a live work unit whose Candidate records sit only on its unmerged branch replays its chain from that branch
        - every completed work unit's and closed cohort's record compares clean through 14.4's harness with no allowance
          of its own, a completed work unit's placement naming the quarter and number its folder holds today

### `[ ]` **15.2 Lineage, renames, and abandoned origins — § 10.9, § 10.11**

- _Goal:_ Terminal transitions land as lineage under minted origin UIDs with every reference resolved to its owner's UID,
  and renames as former slugs, so `lookup` and `history` answer as an archive or abandon would have left them.

    - The build writes each origin's slug under its UID in the registry's lineage map, as 5.3's write path does, since
      the import lands through the move's transaction rather than `write`
    - Build `test-first` (one behavior at a time):
        - each `abandon` and `decompose` transition lands at `lineage/<uid>.json` keyed by a minted origin UID, its
          successors, dependents, replacements, prerequisites, and members carrying their owners' UIDs where held
        - each such origin gets a history ref of one empty-tree commit, and `history` of its records refuses `not-found`
        - each `rename` transition becomes a former slug in its successor's metadata, in its quarter folder, where
          `lookup` reads it, and never lineage
        - after the import, a completed work unit reopens and takes a write, and a write to a closed cohort's document
          lands on its history ref
        - `lookup` of an imported decomposed origin by its slug resolves through its lineage
        - a second clone that pulls the published import reads no end pending for its completed items or its
          lineage-ended origins, at that pull and every later one (§ 14.5)
        - its records compare clean through 14.4's harness, its comparator allowing only § 10.9's two transition rows:
          each `abandon` and `decompose` transition read against its lineage record, its work-item references carrying
          their owners' UIDs, and each `rename` transition against the former slug its successor's metadata holds

### `[ ]` **15.3 Errand identity refs, descriptions, inbound lists, and queues — § 10.9, § 10.11, § 3.8**

- _Goal:_ Every Errand and claim the configured person's identity ref holds, and every held capture, buffer section, and
  execute-bound mark, lands in its new home and leaves its source, so nothing integrates, routes, or starts twice after
  the flip.

    - The configured person's `refs/arc/user/<id>/errands` alone, as the in-repo implementation reads it (`transientIO`,
      `lib/store/in-repo/transient-common.ts`); any other person's is left in place and listed in `notices`
    - Descriptions, inbound lists, and queues rendered in the first section of the grammar the kind registry declares for
      each kind (`EntryConfig`, `lib/store/registry.ts`), passed through `runStoreMigrate`'s registry port (14.1); the
      tests pass § 14.1's test grammars, since the production registry declares none for the three kinds yet, and an
      entry the grammar's stamp cannot place an ID in is listed under `entry-id`

    - `[ ]` **15.3.a Errands and claims re-homed**
        - Starts only once `seam-locus` has shipped: `arc status seam-locus` reports `shipped: true`. Until then, stop
          here and raise it — 15.3.b and 15.3.c do not depend on this subtask, so they can run first if reordered, while
          15.4's case for a re-homed Errand's branch link waits on it
        - The transient-identity steps, each declared at the step port (13.1): the build keeps each tip it re-homes at
          `refs/arc/tmp/migrate/import/kept/` in the code repository, where those refs and `origin` live, a prefix the
          landing leaves; the local transient-identity refs are deleted, each expecting its kept tip, by the landing's
          transaction in the default layout, and in the separate one, whose landing is the store directory's own
          transaction, by a step of their own after it, which a rerun finishes as it finishes every step after the
          landing (14.3); after the publish, `origin`'s are deleted, where the Errand verbs publish them, leased on the
          kept tips; then the kept tips drop (§ 10.11)
        - On a clone with no state remote, which is always in the separate layout (§ 9.7), nothing publishes, so the
          kept tips drop in the local delete's own transaction, and transient-identity refs `origin` still holds are
          listed in `notices` with the remedy to delete them (§ 10.11)
        - Each re-homed Errand's record carries `owner`, the identity whose `refs/arc/user/<id>/errands` held it,
          serialized through `serializeTransientIdentityRecord` (`lib/errand/identity-record.ts`) (§ 10.9), whose schema
          gains the optional `owner` with `seam-locus`
        - Build `test-first` (one behavior at a time):
            - every Errand record the identity ref holds, open, paused, or awaiting merge, lands at `refs/arc/work/<uid>`
              as `errand-<uid>.json`, and each grooming and housekeeping claim on the person's claims ref
            - each re-homed Errand's record carries the configured person's identity, whose ref held it, as its `owner`
            - each Errand's origin entry, found by title, moves into its description before any `_Id:_` stamp, leaving
              its inbox; a source digest changed since adoption is listed in `notices`, and an Errand whose entry is gone
              takes its description from `intent`
            - the transient-identity refs leave by these steps, and a rerun after the first push clears `origin`'s and
              drops the kept tips
            - in the separate layout, an import interrupted after its landing and before the local delete leaves the
              transient-identity refs in place, and a rerun deletes them and finishes
            - an import on a clone with no state remote drops the kept tips in its local delete's transaction, listing
              `origin`'s transient-identity refs in `notices`, and one interrupted between its landing and that delete
              finishes on a rerun, each delete leased on its kept tip
            - its records compare clean through 14.4's harness, its comparator allowing only the re-homing: each Errand
              record read at its work ref, with the `owner` only that side carries, and each claim on the person's
              claims ref, each origin entry read in its Errand's description, and its inbox read without it

    - `[ ]` **15.3.b Queues and inbound lists**
        - Build `test-first` (one behavior at a time):
            - each person's execute-bound marks become their Errand queue in file order, each `_Disposition:_` line
              leaving its entry
            - each buffer section and held owner-adoption capture becomes its work unit's inbound list, a section's entry
              taking the first date of its `_Routed from:_` field, the drain's, as `_Created:_` and a capture keeping its
              own, each leaving its source
            - a mark `listExecuteBoundInboxEntries` (`lib/user-sync/inbox-writer.ts`) reports as a diagnostic, a held
              capture whose `WU_Target` names no work unit, and a `_Routed from:_` field with no date are each listed in
              `notices` with its repair, the import refusing until it is fixed, then landing
            - no routing receipt is written for what moved
            - each queue and inbound list compares clean with the marks, buffer sections, and held captures it came from,
              its comparator allowing only the `_Disposition:_` lines and `_Created:_` dates the import moves, and each
              source compares clean without what moved from it

    - `[ ]` **15.3.c Entry stamps and tombstones**
        - Build `test-first` (one behavior at a time):
            - every entry of every entry kind lacking an `_Id:_` is stamped, both inboxes, working memory, and the three
              kinds among them
            - the notes merge's `## Removed:` tombstones are dropped from `USER-INBOX.md` and `WORKING-MEMORY.md`
            - every entry compares clean through 14.4's harness, its comparator adding only the two shared files'
              dropped tombstones

### `[ ]` **15.4 Branch links, exclusions, and task captures — § 10.9, § 10.11**

- _Goal:_ Every commit whose footer names a closed task, and every live item's branch, resolves through the store's
  `lookup` to the same work unit as through the in-repo implementation's, each branch link recording whether ARC created
  the branch and which of its commits are no task's work, and a branch the import cannot place refusing it.

    - Each live work unit's and open Errand's branch, named by its meta's `branch` field (`META_FIELDS`,
      `lib/store/kinds/meta/projection.ts`) or its Errand record's `branch`, links as `BranchLinkSchema`
      (`lib/store/links.ts`) holds it, its repository the project ID; none where the field is empty or names
      `branch.base`
    - `linkedAs` by name: `created` for ARC's forms for the item — `plan/<slug>`, `<type>/<slug>`, and an Errand's
      `<errand-type>/<slug>` over `ERRAND_BRANCH_TYPES` (`lib/errand/branch-type.ts`) — and `adopted` for any other
    - The tip the link reads: of the branch's local tip and the tip its remote-tracking ref holds, the one that contains
      the other, or the remote's where only the remote holds it; a branch neither holds is listed in `refused` as
      `branch-missing`, and diverged tips as `branch-diverged`, each with § 10.5's remedies, both listed first, refusing
      the import until fixed
    - A work unit's `excluded` is `computeDefaultCaptureSet`'s set (`lib/git/default-capture-set.ts`) over that tip —
      `tips` that tip, `captures` the work unit's derived captures, and `refresh: false`, so a trial and its landing
      read one base — each commit a capture with its copy key; its `refused` result, where no base ref resolves, listed
      in `notices` with its reason and remedy, refusing the import (§ 10.5); an Errand's link excludes nothing
    - Captures from every commit reachable from the base branch or a live work unit's branch, once each, whose footer
      names the work unit: each range expanded with `expandTaskReference` (`lib/commit-check/task-reference.ts`), its IDs
      kept as written and only those whose task is closed captured, so a footer naming a closed task and an open one
      captures the closed alone; each capture the project ID as its repository, and its SHA with the copy key
      `computeCopyKeys` (`lib/git/copy-key.ts`) gives it, and none wherever it gives none: a merge commit, one with no
      readable author, and one whose patch is empty or the clone cannot produce
    - The in-repo `lookup` by ref finds a branch only where it exists locally, reads an Errand's records only for a
      `chore/` branch (`isTransientLookup`, `lib/store/in-repo/transient-lookup.ts`), and takes any other branch's slug
      from its name (`branchToWorkUnitSlug`), so the comparator's allowance names three links a transform difference: one
      whose branch is absent locally, one whose branch is not named `<prefix>/<slug>`, and an Errand's on a `fix/`,
      `refactor/`, or `hotfix/` branch, which the in-repo `lookup` reads as a work unit's slug
    - Build `test-first` (one behavior at a time):
        - its links compare clean through 14.4's harness under the allowance above: every captured commit resolves
          through the store's `lookup` by commit to the same work unit, and to the closed subset of the tasks the in-repo
          `lookupCommit` returns, each capture's copy key the one `computeCopyKeys` gives
        - each live work unit's branch, and each Errand's `chore/` branch, that exists locally under `<prefix>/<slug>`
          resolves through both implementations' `lookup` by ref to the same item, each passed its own repository, and a
          meta with no branch, or one naming the base branch, gets no link
        - each Errand 15.3.a re-homes links its record's `branch`, and one on a `fix/<slug>` branch resolves through the
          store's `lookup` by ref to the Errand, the comparator reporting the in-repo answer under its allowance
        - a `plan/<slug>`, a `feat/<slug>`, and an Errand's `fix/<slug>` branch link `created`, and a branch named
          otherwise `adopted`
        - a work unit's link excludes the branch's non-merge commits not on base less those its footers capture, over the
          local tip, the remote's where only the remote holds the branch, and the containing tip where they differ; an
          Errand's link excludes none
        - a branch neither side holds is listed under `branch-missing`, and one whose tips diverged under
          `branch-diverged`, first in `refused`, each naming its remedies and refusing the import until fixed, after which
          the import lands
        - a base branch no ref resolves, locally or on the remote, lists `computeDefaultCaptureSet`'s reason and remedy
          in `notices` and refuses the import, which lands once the base ref resolves

### `[ ]` **15.5 Parked work units — § 10.9**

- _Goal:_ A work unit parked from `Active` lands paused and in flight, its records as the branch it was parked on holds
  them, so nothing about a parked work unit is lost at the flip.

    - Its records read from the tip 15.4 reads of the branch its pointer record names (`composePointerRecord`,
      `lib/work-unit/pointer-record.ts`), refusing `branch-missing` and `branch-diverged` as 15.4 does; its meta's pause
      section built through `MetaPauseSchema` (`lib/active/meta-schema.ts`) from the pointer's `Reason:` line as its
      reason, the meta's `Owner` as who paused it, and the committer time of the commit that first wrote the pointer as
      since when, an ISO-8601 UTC string as `arc pause` writes it (`toISOString()`,
      `lib/work-unit/verbs/pause-handover.ts`), with no waits-on
    - A pause the schema refuses — an empty `Reason:` line, or an `Owner` that is not a slug — or whose reason the Pause
      section's writer refuses, a `##` heading or a `---` line (`pauseProseProblem`,
      `lib/store/kinds/meta/pause-section.ts`), is listed in `refused` as `pause`, naming the field, with the remedy to
      write the reason or correct the `Owner`
    - Build `test-first` (one behavior at a time):
        - a work unit parked from `Active` imports in flight at `Active`, its records as the tip 15.4 reads holds them
          and its pause carrying the pointer's reason, the meta's owner, and the parking commit's committer time in
          ISO-8601 UTC
        - a pointer whose `Reason:` line is empty, and a meta whose `Owner` is not a slug, are each listed in `refused`
          as `pause` naming the field, since the import invents neither, refusing the import until it is fixed, then
          landing
        - a pointer whose reason is `---`, and one whose reason is a `##` heading, are each listed in `refused` as
          `pause` naming the reason, refusing the import until it is fixed, then landing
        - a work unit parked from Planning imports as a stub
        - a parked work unit whose branch only the remote holds imports its records from the remote's tip, and one whose
          tips diverged is listed under `branch-diverged`, refusing the import until fixed
        - its records compare clean through 14.4's harness, its comparator allowing only § 10.9's parked row: its
          placement in flight at `Active`, its meta's pause section, and its records read at its branch's tip

### `[ ]` **15.6 Each person's notes snapshot — § 10.10**

- _Goal:_ The import refuses until each person's notes snapshot and every disk copy agree, carrying from disk only what
  notes save never writes, so no personal state is lost or resurrected by the import.

    - The snapshot read directly: each identity-global file merged across the recent-note window that
      `readRecentUserNotes` lists, by `mergeCrossWuFromNotes` (`commands/user/save-load.ts`), exported for the transform
      so the merge is a load's own; each live work unit's workspace from the newest note holding it, new code, by the
      notes ref's history and inside a compaction snapshot by the committer date of the commit each note annotates;
      compared as `projectManifest` compares, the two shared files without tombstones
    - Build `test-first` (one behavior at a time):
        - a file differing from its disk copy, by an entry removed on disk and by one only an older note holds, is listed
          `differs`, and agrees once saved and then loaded
        - a file the snapshot holds and no disk copy does is listed `snapshot-only` apart, and agrees once a load restores
          it
        - a tombstone the snapshot carries and the disk lacks is no difference
        - a file over 256 KiB, one off notes sync's allowlist, one under `scratch/`, and one in an ended work unit's
          workspace are listed `disk-only` and carried from disk, while an `.env` file is listed in `refused` and refuses
          the import until removed
        - with two live work units saved from their own checkouts, the second last, a trial from either checkout or a
          third compares each workspace with the newest note holding it, a file changed on disk in the first agrees once
          saved and loaded from the first's checkout, and a third live work unit's workspace no note holds is `disk-only`
        - the import refuses until every disagreement is cleared, then lands

### `[ ]` **15.7 Personal state at D5's layout — § 10.12**

- _Goal:_ Each person's files land at D5's layout, so from the flip no subdirectory of `.arc/user/<id>/` is a workspace
  and the identity root holds only ARC's surfaces and `scratch/`.

    - The fold takes the prose sections alone: the H1, the blockquote, comments, and the emptied `## Handoff Metadata`
      heading are dropped; `Next Task` and `Last Completed` drop on the metas that fold, and `Blockers` stays a field
      beside the prose it joins
    - A workspace named for a work unit, live or ended, maps to `scratch/work-unit/<slug>/`, any other root folder to
      `scratch/<folder>/`, and an existing `scratch/` keeps its paths
    - Build `test-first` (one behavior at a time):
        - a live work unit's `SESSION-NOTES.md`, where its meta's `Owner` names the person, folds into the meta's
          `## Session Context` through `writeMetaSessionContext`, headings demoted, `Commit at Handoff` and a recognized
          `Session Type` becoming fields, `Blockers` other than `[none]` joining the prose, and `Working On`,
          `Next Task`, and `Last Completed` dropped, with no `State at Handoff`
        - a body with an interior standalone `---`, which the section writer refuses, is listed in `refused` as
          `session-context`, refusing the import until fixed, then landing
        - every other workspace file but `.internal/`, `ADVERSARIAL-PASSES.md` and an unfolded `SESSION-NOTES.md` among
          them, lands at `scratch/work-unit/<slug>/`, and other root files outside ARC's surfaces at `scratch/`
        - the identity root's `STATUS.USER.md` and every `.internal/` folder land nowhere, and no session-context record
          is written
        - each person's imported personal ref compares clean with their notes snapshot, less what § 10.8 keeps out, its
          comparator allowing only § 10.12's moves: each moved file at its `scratch/` path, and each folded
          `SESSION-NOTES.md` read against its meta's session context by the fold's rules

### `[ ]` **15.8 What the import leaves out, and refuses until it lands — § 10.8, § 10.9**

- _Goal:_ The import carries no project machinery, constitution, machine-local state, or counters, and refuses, changing
  nothing, wherever a source needs a schema or mapping that has not landed.

    - Build `test-first` (one behavior at a time):
        - project machinery, the constitution, the shipped machinery under `.arc/system/.internal/`, the checkout marker,
          pristine store, editor schemas, and the registry's counters land nowhere, while tracked Candidate, boundary, and
          transition records do
        - a backend built with a registry that declares no grammar for one entry kind, over a fixture holding entries of
          it, lists the kind in the trial's `notices`, and the import refuses, changing nothing
        - the review gate's evidence and outcomes added to the fixture are listed in `notices`, and the import refuses,
          changing nothing

### `[ ]` **15.9 The review mapping's port — § 10.5, § 10.8, § 10.9**

- _Goal:_ Whatever mapping fills the port, the import hands it every review source of live work and lands only what it
  returns, so once the review family's mapping lands no review fact of live work is lost or carried in today's shape.

    - _Amended in:_ 15.R (A2)
    - An optional `reviewMapping` among `runStoreMigrate`'s ports, its `ReviewMappingInput` and `ReviewMappingResult`
      types in the transform module (§ 10.8); the `arc store migrate` handler passes none until the review family's
      mapping lands, and that mapping conforms by shape, importing nothing of the transform's
    - The gate's folder read whole from the Git common directory, every file with its path; each live work unit's
      Candidate versions from the path log 15.1 reads, with its commit, and its boundary record's current content
    - The work-item table from the UIDs the import mints (A11), each entry's `live` flag as § 10.8 states it; an
      archived work unit's landing tested with `isLandedInBaseStrict` (`lib/git/branch-containment.ts`) only where its
      `Branch` still resolves
    - Build `test-first` (one behavior at a time):
        - a test mapping receives the gate's whole folder, its quarantined and retired files among them, each live work
          unit's Candidate versions oldest first with its current boundary, and the work-item table: a work unit in
          flight, one merged but not yet archived among them, and every Errand live, and an archived, abandoned, or cut
          work unit not
        - what it returns lands in place of the live work unit's Candidate and boundary records and every gate file,
          each record at its kind's stored path and a record's contents replayed oldest first, one batch each, while a
          completed work unit's Candidate and boundary land as found
        - the trial's `reviewMapping` carries the listing, and an `in-flight` entry refuses the import, which lands once
          the mapping no longer reports it
        - a returned record a parser the test registry installs refuses, and one a serialization rule refuses, are each
          listed in `refused` under `review-mapping`, refusing the import
        - a gate file or Candidate version the listing omits, and one it lists twice, are listed in `notices`, refusing
          the import
        - an archived work unit whose branch exists unlanded in base is listed in `notices` and refuses the import,
          which lands once the branch merges, and one whose change landed by a multi-commit squash refuses likewise and
          lands once its branch is removed, while one whose branch is gone or merged imports as completed

### `[ ]` **15.R Review import claim IDs and source units — § 10.8 (A2)**

- _Goal:_ Amendment A2's port preserves each Errand's original claim ID and accounts for canonical file and folder
  source units exactly once, so review lineages join the correct imported work item and no source disappears in a
  name or grouping mismatch.

    - Extend 15.9's work-item table with required `claimId` on Errand rows, copied unchanged from the source record;
      work-unit rows retain their existing shape, and the imported store UID remains separately minted
    - Gate paths and listing sources follow § 10.8's four encodings; a left-behind materialization folder covers its
      supplied descendants once, without teaching the transform the review gate's record shapes
    - Build `test-first` (one behavior at a time):
        - a test mapping receives the original Errand claim IDs and joins reused slugs by claim ID to the correct UID
        - gate files, materialization folders, Candidate versions, and boundaries compare under their exact encodings;
          two Candidate versions at one tracked path remain separate sources
        - a folder lists once without separate child-file entries; an omitted or repeated source, folder/file overlap,
          or nested-folder overlap refuses with `notices`, then the import lands after the listing is repaired

### `[ ]` **15.10 Every source the import carries** — validate exit criterion at segment scope

- _Goal:_ Every import, notes-snapshot, post-import, and Candidate case of § 14.7 passes over the fixture.

    - Request `arc check segment`

## **Phase 16:** Remote moves

_Purpose:_ Moving a project's state between remotes: the copy over the old remote's whole state, the forwarding record
with the registry as each remote's move version, forward-then-switch, the delete rounds with their licensed re-copies,
moves that cross, end, or change the layout, and a move that stops publication without unpublishing.

_Mode:_ `slice` through Phase 17 — closes on state moved between remotes, every clone following it, and no write lost.

### `[ ]` **16.1 The forwarding record — § 10.6, § 3.1, § 9.8**

- _Goal:_ A remote the state left carries one control ref naming the project and the registry commit the move landed,
  so no teammate's push restores state there and every pull knows the state moved.

    - `refs/arc/project/moved`, a root commit holding only `moved.json`, canonical JSON (§ 3.5) of exactly
      `{ "projectId": <id>, "registryCommit": <oid> }`, a schema in `lib/store/ref/`, never a URL; fetched with the
      project namespace into the tracking refs, never listed, manifested, or merged
    - A `moved.json` that does not parse stops pushes to its remote as a record does, and each read of its content — the
      `push` check here, a move's steps 1 and 2 (16.2), and a follow (17.1) — refuses `move-record-malformed`, naming
      the ref, with the remedy to repair or delete it
    - The forwarding-record arm of the `push` check (12.3), and a carried code ref under `moved` (11.4)
    - Build `test-first` (one behavior at a time):
        - a pull from a remote carrying it reports `moved` with the remedy to bring in the pointer's change and run
          `arc store migrate`, and nothing pushes there
        - a `!` line for its tracking ref sets the tracking ref to the fetched record, never a refused ref or a notice,
          and a prune of it keeps no tip under `refs/arc/tmp/seen/`
        - a remote whose fetch fails while the record's tracking ref stands reports `unreachable`, its remedy naming
          `arc store migrate`
        - the `push` check reads the project ID from a record standing alone, and a record naming this project refuses
          the designation `moved`, naming `arc store migrate` and `arc store migrate --to <remote>`, while the rule that
          sets `push` without asking reports that remote's `failed` outcome terminal `refused`, with the remedies
          `arc store remote <remote> off` and `arc store migrate`, the clone staying undesignated
        - a push carrying a code ref under `moved` pushes the ref alone, as an ordered leg and over one atomic receiver,
          `publishes` empty
        - a malformed `moved.json` stops pushes there, and the `push` check refuses `move-record-malformed` naming the
          ref, then passes once it is repaired

### `[ ]` **16.2 The copy — § 10.2, § 10.3, § 10.4**

- _Goal:_ A remote move copies the old remote's whole state, every person's identity refs and every history ref among
  it, onto the new remote in one atomic push that merges where this project's state already sits there.

- **Additional Context:** `notes-storage-ref-backend.md` § The move model check

    - Steps 1 and 2, the record and the copy push each a step of its own, all declared at the step port (13.1) as they
      land here: the fetches under `refs/arc/tmp/migrate/remote/`, keyed by remote and cleared before each — the old
      remote's by every store ref it holds (§ 3.1), every person's identity refs and every history ref among them, and
      its forwarding record, and the new remote's registry and forwarding record by one-ref patterns — with § 6.2's
      flags and its partial-clone check; the project check; the copy with its one registry commit, `migrate`
      `move-remote`; the record, written before the copy push; the copy push leased on the new remote's registry tip,
      deleting a forwarding record step 1 found there only where the old remote's registry history holds its commit; the
      copied tips and kept heads under `refs/arc/tmp/migrate/copied/`, with any forwarding record the copy deleted, kept
      at `refs/arc/tmp/migrate/deleted-record` past the record's end (17.4)
    - `move.json`'s remote arm: the move's kind, each remote by its name and its URLs — `backing`'s as the store directory
      holds it, or for a remote of the code repository the fetch and push URLs `git remote get-url` and
      `git remote get-url --push` resolve at the move's start — and the registry commit step 2 lands
    - Every step that reaches the old remote once the record is written — step 3's forwarding record and the read before
      the switch, step 4's listings, re-fetches, and deletes, and a follow's deletes — goes by the record's URLs, the
      fetch URL for reads and the push URL for pushes, never by a remote name a switch may have repointed
    - Build `test-first` (one behavior at a time):
        - a move with a second person's identity refs and a history ref the mover never pulled on the old remote copies
          both to the new one
        - a new remote holding another project's identity record or forwarding record refuses `identity-mismatch` before
          any push, its trial alike, and stays unchanged
        - a copy onto a new remote holding this project's state merges there through 13.1's copy, the new remote's refs
          the local side and the old remote's the incoming, reporting a broken rule in `notices`
        - a malformed `moved.json` on the old remote refuses the move `move-record-malformed` at step 1, and on the new
          remote at step 2, each naming the ref, and the move passes once it is repaired
        - `--to` from a clone whose state remote carries a forwarding record from a move it has not recorded refuses
          `moved` before any copy, naming `arc store migrate`, the follow, and then `--to` from the remote it follows
          to, and pushes nothing
        - a copy losing a lease runs the move again from step 1, its record naming the commit that lands
        - a first run whose copy push a receiver without atomic pushes or a hook refuses ends in the `store` arm's
          terminal `refused`, leaving no record and changing nothing, while a run interrupted at the step port before
          its copy push, its record written, and rerun against such a receiver keeps its record
        - `--to` a remote carrying a forwarding record from outside this state's line of moves refuses `moved`, pushing
          nothing, naming `--to` the remote the state moved to
        - a remote move's trial report matches what the move then does

### `[ ]` **16.3 Forward, then switch — § 10.2, § 10.3**

- _Goal:_ The old remote carries the forwarding record before this clone switches, so of two moves off one remote only
  one switches, and the switch carries exactly the heads the copy holds.

- **Additional Context:** `notes-storage-ref-backend.md` § The move model check

    - Step 3 and the switch, each declared at the step port (13.1): the forwarding record and a registry commit,
      `migrate` `forward`, in one `--atomic` push, the record leased on absence and the commit on step 1's registry tip;
      the switch licensed by a read showing that record; the kept heads carried into `refs/arc-remotes/<new>/` and
      `refs/arc/tmp/seen/<new>/`; the new remote's `push` before the old one's `off`, `backing` taking the new URL or
      removed
    - Where the destination calls for the other layout (§ 9.7), the switch is the layout move run as this move's switch
      (13.1), under this move's lock and writing no record of its own
    - The pointer's change left in `arc-config.yml` uncommitted, through a write the pointer port (12.2) gains here,
      which the handlers in `commands/` bind over the config module beside its read (13.5): the key's line replaced as
      `renderConfigOverrides` (`lib/template/render.ts`) replaces one, appended where the file has none, and a removed
      pointer written empty, the key's default (12.1)
    - Build `test-first` (one behavior at a time):
        - in every direction — the code remote to a backing repository and back, between two backing repositories, and
          to and from a fork's upstream — the clone ends with the new remote carrying `push`, the old `off`, and `backing`
          set or removed, syncing with the new remote and reporting `move-unfinished` while its record stands
        - the new remote's registry holds the move's own commit, its tree unchanged, which the forwarding record names,
          and a rerun's merge descends from it
        - a run interrupted at the step port after step 3 and rerun finds its own forwarding record and pushes no second
          one
        - two remote moves started at once from two worktrees: the second refuses `lock-held`, and the first finishes,
          its switch carrying the heads its own step 1 kept
        - a move from a code-repository remote with a `pushurl` reaches it after the switch at that push URL
        - a sync in a second worktree of the moving clone, pulled before the switch, pushes nothing to the old remote
          after it and repeats against the new one
        - the pointer's change is written into a checkout's `arc-config.yml` that lacks the key, and a move off a backing
          repository to the code remote writes it empty
        - the report says teammates follow once the pointer's change reaches them as code

### `[ ]` **16.4 The delete rounds — § 10.2, § 10.3**

- _Goal:_ The old remote ends holding only the forwarding record, and no ref leaves it at a tip the new remote does not
  hold.

- **Additional Context:** `notes-storage-ref-backend.md` § The move model check

    - Step 4: each round reads the new remote, which must hold the move's registry commit, then fetches both remotes'
      store refs, re-copies whatever changed since the copy or the new remote lacks through 13.1's copy, the registry
      always in the first round, then deletes every fetched store ref in one `--atomic` push leased on its kept tip; each
      round declared at the step port (13.1)
    - Build `test-first` (one behavior at a time):
        - a teammate's write, new item, and end landing on the old remote after the copy reach the new remote, and the old
          one ends holding only the forwarding record
        - once its last listing finds only the forwarding record the move's record goes, and in every direction of 16.3
          the clone's next `pull` and `push` report no state
        - the commit step 3 left on the old remote's registry is copied to the new remote before that ref's delete
        - a move between two backing repositories leaves the forwarding record on the old repository's URL and deletes
          only there, the new repository keeping every ref
        - each step of a remote move, 16.2's and 16.3's among them, interrupted at the step port and rerun completes, the
          rerun merging onto the copy it landed
        - a move onto a new remote holding this project's state deletes the old remote's refs in one round where no push
          lands meanwhile
        - a lost lease, the round's read still showing this move's record, copies the late push in the next round
        - a move interrupted after step 3 and before its switch, a teammate's push landing on the old remote after the
          copy, reruns, its first delete round copying that push before deleting it and its switch carrying the heads
          kept with the copy
        - a delete round after an item's reopen on the new remote copies no history ref back for it
        - a delete or listing that fails keeps the record, `move-unfinished` naming the cause, and a no-target rerun
          retries it
        - a new remote emptied after the switch writes nothing on either remote and keeps the record, `move-unfinished`
          naming the cause
        - a mover that ended an item on the old remote after step 1 and syncs from the new remote before step 4 keeps the
          item ended
        - step 4's re-copy against a new remote whose ref another clone's push moved after the copy merges onto it,
          reporting a broken rule in `notices`
        - step 4's re-copy where the mover abandoned an item after its switch while a teammate's write to it landed on the
          old remote merges the write into the history ref; where a teammate's archive landed, the archive holds, the
          mover's abandon withdrawn and reported in `notices`; and where a teammate's abandon landed, the source's lineage
          holds and the mover's withdrawn abandon leaves neither its lineage nor a conflict record over it

### `[ ]` **16.5 Moves that cross, end, or change the layout — § 10.3, § 10.7**

- _Goal:_ Of moves that cross on one remote, the registry's leases let exactly one land; a move another has overtaken ends
  without stranding a clone; and a move that changes the layout runs it as its switch.

- **Additional Context:** `notes-storage-ref-backend.md` § The move model check

- _Note:_ Each case here asserts the remotes and the moving clones' records; the clones that then follow are 17.2.b's.

    - `[ ]` **16.5.a Crossing moves**
        - Build `test-first` (one behavior at a time):
            - two clones moving off one remote at once to two other remotes end on one, the second's move ending before
              its switch and reporting the copy it leaves
            - two clones moving between two remotes in opposite directions at once end on one, the push coming second
              losing its lease and its move ending before its switch
            - two crossing moves whose copies each carry the other's commit back both go on, one forwarding record landing
            - a copy losing its lease to a later move's forwarding record at its destination runs again from step 1 and
              ends there, that record staying

    - `[ ]` **16.5.b Moves back and moves ended**
        - Build `test-first` (one behavior at a time):
            - a rerun of a remote move whose forwarding record had landed, after another clone moved the state back onto
              the old remote, pushes no record there and ends, the old remote staying the state's home and the follow
              coming due
            - a rerun before its switch meeting the move back's forwarding record on its new remote ends at step 1, copying
              nothing
            - a rerun before its switch finding another move's forwarding record on its old remote ends, its record
              going, where a first run refuses `moved`
            - a rerun of step 4 after another clone moved the state back deletes nothing there and ends, the follow coming
              due
            - a lost lease whose re-copy meets a new remote a later move has left ends the move, reporting the refs it
              leaves
            - a move back interrupted between its record and its switch finishes on a rerun, the old remote holding the
              state
            - a move back ended before its switch by another move off its old remote leaves that move's record where its
              copy deleted an earlier one
            - a move back interrupted after its copy, whose destination another clone then moved on, reruns, deletes
              nothing there, and leaves that move's record on its old remote

    - `[ ]` **16.5.c A move that changes the layout, and what a move reports**
        - Build `test-first` (one behavior at a time):
            - a remote move between the code remote and a backing repository, interrupted inside either half of the
              layout move it runs as its switch (16.3), restarts that half from its own temporary refs, its trial report
              matching what it then does
            - interrupted after its switch, a move between two backing repositories and one back to the code remote each
              finish on a no-target rerun, syncing meanwhile and reporting `move-unfinished`, and `--to` another remote
              refuses `move-unfinished` while the record stands
            - a move refused `identity-mismatch` for another project, and one to a mistyped or unreachable remote,
              refused `unreachable`, each through the `store` arm, leave no record, and `--to` the right remote then
              succeeds
            - a move's trial and report say it stops later publication and never unpublishes, that teammates follow once
              the pointer's change reaches them, and that a push composed before a switch may land after the last listing

## **Phase 17:** Following a move and leaving the source

_Purpose:_ How every other clone reaches the state's new home: the follow's candidates, judged against the record the
old remote holds, its copy, switch, and deletes; leaving a source that can no longer be read; `--leave-source` ending a
recorded move; and `arc store remote` during a follow and when repointing `backing`.

_Exit criterion:_ Every case of § 14.6 and § 14.7 passes.

### `[ ]` **17.1 The follow's candidates — § 10.6, § 9.6**

- _Goal:_ A follower takes as the state's home only a remote that holds the commit the move landed, so a checkout behind
  a move never publishes state onto a fork that copied the registry before it.

- **Additional Context:** `notes-storage-ref-backend.md` § The move model check

    - The follow is due while a remote this clone fetches carries the forwarding record's tracking ref; it fetches the old
      remote's record into `refs/arc/tmp/follow/source/` first, and each candidate's registry and record into
      `refs/arc/tmp/follow/candidate/<remote>/` or `refs/arc/tmp/follow/pointer/`; candidates come from the invoking
      checkout's pointer, never from the clone's designation: the backing repository the pointer names, or, where it names
      none, each remote of the code repository holding the project's registry ref, read by presence as 12.2.b's presence
      read reads it (§ 9.2), whatever the clone's `backing` and its remotes' keys say
    - Each read by 9.1's one-ref patterns, § 6.2's flags, and its partial-clone check, since an exact refspec for a ref
      a candidate lacks fails the whole fetch
    - A candidate holds the move's commit where `git cat-file -e` under `objectAccess: "local-only"` finds it and
      `git merge-base --is-ancestor` then exits 0: a commit `cat-file -e` finds absent, one the fetch did not bring, and
      an exit 1 read as not held, and any other exit of either is a failed read, never not held
    - The follow-due arm of `runStoreRemote` (13.4), built first: while a follow is due, a setting naming a remote the
      follow names runs the follow with that remote and answer (17.2.a), the old remote's `off` is always allowed and
      ends the follow's being due, and any other setting refuses `role-conflict` naming `arc store migrate`
    - Until 17.2.a builds the steps an answer runs, a setting naming a remote the follow names refuses `unsupported`
        - _Retired in:_ Phase 17
    - The follow's judgment ends in a refusal or in the question due (13.1) naming the candidate it takes, which the
      cases here read; 17.2.a builds the steps an answer runs
    - Build `test-first` (one behavior at a time):
        - until the follow, `pull` and `push` report `moved`, or a read source fails terminal `refused` naming the move,
          whether or not the checkout holds the pointer's change, and `arc store remote` refuses `role-conflict` every
          setting but the follow's and the old remote's `off`, naming `arc store migrate`, the old remote's `off` ending
          the follow's being due
        - a follow from a checkout without the pointer's change refuses `follow-refused` naming the remedy to bring it
          in, changing nothing, for the fork-upstream and `read` followers of a move to a backing repository too, and
          over a fork that copied the upstream's registry before the move
        - a candidate carrying a forwarding record, holding another project's state, or lacking the move's commit is
          refused, and several accepted refuse `follow-refused` naming each
        - following a move back to the upstream, a fork that copied the upstream's registry before the state left it is
          refused for lacking the move's commit and the follow takes the upstream, and where the fork is the follower's
          only remote the follow refuses `follow-refused`, naming the remedy to add the upstream
        - a follower that missed two consecutive moves of different kinds follows from a checkout holding the second's
          pointer straight to its destination, and refuses `follow-refused` from a checkout between them
        - a follower whose tracking ref names a record a later move replaced judges candidates by the record its own fetch
          finds, passing over a fork that copied the registry between the moves
        - a follower offline across a move back and a second move away sets its tracking ref to the newer record,
          reporting no `history-diverged`, as does one pulling between them, and two candidates whose registries are
          ancestor-related read the same in either fetch order
        - a follow whose presence read, or read of a candidate's record, project ID, or registry, fails refuses through
          the `store` arm, changes nothing, and names that remote `unreachable`, as does a `cat-file -e` or `merge-base`
          exit outside 0 and 1
        - a malformed `moved.json` in the old remote's record refuses the follow `move-record-malformed` naming the ref,
          changing nothing, and the follow runs once it is repaired
        - a `read` follower whose store holds its own project ID follows to the candidate naming the record's project ID
        - where the upstream's state moved to a backing repository and the contributor's own state stays in the code
          repository's refs, the follow refuses `follow-refused` naming the third route of § 9.6, which then reads the
          upstream from the added remote

### `[ ]` **17.2 The follow's copy, switch, and deletes — § 10.3, § 10.6**

- _Goal:_ A follow asks about its destination, copies what raced the move before switching, and clears it from the old
  remote after, deleting only where its own listing found the record it judged by, so every clone of each move ends on
  one remote holding every write.

    - `move.json`'s follow arm: each remote by its name and URLs, the follow's answer, and the record it followed; its
      deletes go by the record's URLs (16.2)
    - The `arc store migrate` handler asks the follow's question through a select prompt site declared through
      `declarePromptSite` and asked through `prompt`, as 13.5's `--own-state` confirmation is, its no-input policy
      reporting `designation-needed`; the answer runs through `runStoreRemote`'s follow-due arm (17.1)
    - Its copies, before the switch and clearing after it, run 13.1's copy, the destination's refs the local side and the
      old remote's the incoming

    - `[ ]` **17.2.a The follow's steps**
        - Build `test-first` (one behavior at a time):
            - the follow asks on a TTY, never carrying the old role, and without one reports `designation-needed` whose
              answering command completes it, the recommended answer carrying the old remote's role
            - the `arc store migrate` handler asks on a terminal through an injected prompt and runs the answer, and
              without one reports `designation-needed`, changing nothing
            - while a follow is due, a setting naming a remote the follow names runs the follow with that remote and
              answer, and with several candidates accepted, `arc store remote <remote> push` naming one completes the
              follow onto it
            - on `push` the follower ends in the layout the move calls for, the old remote `off`, `backing` repointed or
              removed, and on `read` or `off` with the old source `off`; each switch drops the forwarding record's tracking
              ref; a follower holding `backing` follows a move back to the code remote
            - interrupted after each step, rerunning its answering command completes it, and one interrupted between the
              directory's rename and the designation's change finishes on a no-target rerun in its record's direction
            - a no-target rerun holding a move's record while a follow is due finishes the move first
            - a teammate's push landing after the mover's last listing stays on the old remote until that teammate
              follows, and leaves with the follow
            - a sync in a follower's second worktree, pulled before its switch, pushes nothing to the old remote after it
              and repeats against the new one
            - a `push` follow's listing that finds no forwarding record changes nothing and drops the stale tracking
              ref, and one finding another record refuses `moved`, changing nothing
            - a follow interrupted after its copy and before its switch copies again on a rerun and changes nothing more,
              and one interrupted between its switch and its deletes finishes them from its record, syncing meanwhile and
              reporting `move-unfinished`
            - a `push` follow between two backing repositories deletes only on the old repository's URL, keeping the old
              repository's record apart from the candidate's for its listing's comparison, and interrupted after its
              switch finishes its deletes on a rerun and follows nothing more
            - a rerun of a `push` follow's deletes after another clone moved the state back onto the old remote deletes
              nothing there and ends, its record going and the follow coming due
            - a follow whose destination a later move left after its candidate read copies nothing there and refuses
              `moved`
            - the follow's clearing copy against a new remote whose ref a follower's push moved merges there, and against
              one where the mover abandoned an item after its switch while a teammate's write, archive, or abandon of it
              landed on the old remote, applies each as § 10.4 has it
            - a clone that reopened an archived item before the move's switch, and a follower before its follow, each
              delete the copied history ref at their next push to the new remote
            - two checkouts of one clone after the clone moved or followed, the other holding the pointer's change, each
              sync with the one state remote in its one layout, reporting no state, a no-target `arc store migrate` from
              either changes nothing, and `arc store remote` there shows the same roles

    - `[ ]` **17.2.b Every clone following the moves of Phase 16**
        - Build `test-first` (one behavior at a time):
            - a follower pulling the old remote between steps 3 and 4 and following after step 4's deletes, and one
              following before them, each report no `history-diverged` at their next pull from the new remote
            - a new remote emptied after the switch writes nothing on either remote until a follower's push restores the
              move's commit, then re-copies every ref it lacks — another person's identity ref and a history ref no clone
              pulled among them — before deleting on the old remote
            - step 4's re-copy against a new remote a follower's clear reached first deletes nothing there
            - of two clones moving off one remote at once, the clone whose move ended before its switch follows the
              first's record
            - a clone still on the new remote follows the move back's forwarding record a rerun met there
            - a move back interrupted between its record and its switch, finished on a rerun, ends every clone on the old
              remote
            - a move back ended before its switch by another move off its old remote: a clone that never followed the
              earlier record, and a follower that took the ended move's copy for the home, follow that move's record to
              the state's home
            - a move back interrupted after its copy, whose destination another clone then moved on, ends every clone on
              the state's home

### `[ ]` **17.3 Leaving the source — § 10.6**

- _Goal:_ A clone whose old remote can no longer be read re-homes its own state onto the new remote from its last view,
  without ever reading or deleting on the old one, and says what it leaves there.

    - Under the move lock: copy the store refs the old remote's tracking refs name onto the destination through 13.1's
      copy, those tracking refs the incoming side; write the record, `move.json`'s leaving-the-source arm naming each
      remote by its name and URLs; switch as a move does, carrying those tracking refs and kept tips; delete nothing; the
      copy, the record, and the switch each declared at the step port (13.1)
    - Its old remote is `backing`, whatever its role, or the remote of the code repository carrying `push`, never a read
      source; its destination `--to`'s, or the pointer's URL where `backing`'s differs from it; a code-repository
      destination must hold this project's registry ref, and where the clone holds the old remote's forwarding-record
      tracking ref, the commit that record names
    - Tests delete a remote by removing its bare directory, and archive one read-only by a pre-receive hook that declines
      every push
    - Build `test-first` (one behavior at a time):
        - a follow whose listing of a deleted old remote fails refuses through the `store` arm's `unreachable`, naming
          `arc store migrate --leave-source --to <remote>`, which lands the clone's last view, an end it pushed there
          after the move's copy among it, on the new remote and switches, ending with no record and no
          `move-unfinished`, without a TTY too
        - on a clone whose backing repository went before any forwarding record reached it, `--leave-source --to` the
          code remote holding the project's registry moves the store into the code repository's refs, removing
          `backing`, and from a checkout whose code remote holds none refuses `request-invalid` naming that remote's
          `push` setting
        - on a fork whose upstream carries `push` and was deleted, `--leave-source --to <remote>` leaves the upstream,
          setting it `off`, and lands the clone's last view of it on the destination
        - a clone with neither `backing` nor a code remote carrying `push` refuses `no-state-remote` as `--to` does from
          a local-only clone, and one with no `--to` whose `backing` matches the pointer refuses `request-invalid`
          naming `--to`
        - a destination carrying this project's forwarding record refuses `moved`, naming `--leave-source --to` the
          remote the state moved to, or the mover's `--leave-source` where that is the remote this clone is leaving
        - a destination whose URL is the old remote's and `--trial` refuse `request-invalid`, and a read source as the
          old remote refuses `no-state-remote`, as a clone with neither does
        - leaving the source onto a remote a later move left refuses `moved` by the project check, changing nothing
        - a follower whose old remote, a read source, was deleted is refused `no-state-remote` naming
          `arc store remote <remote> off` and a setting of the remote the state moved to
        - interrupted at the step port after its copy, leaving the source leaves no record, and its command run again
          merges onto the copy it landed and completes; interrupted after its record, or inside its switch, the layout
          move's half among it where the destination calls for the other layout, it finishes on a no-target
          `arc store migrate` in its record's direction, deleting nothing on the old remote

### `[ ]` **17.4 `--leave-source` ending a recorded move — § 10.1, § 10.6**

- _Goal:_ A recorded move or follow whose old or new remote is gone for good ends by the person's command alone, the case
  told by a read of the new remote, never by the person's call.

- **Additional Context:** `notes-storage-ref-backend.md` § The move model check

    - Build `test-first` (one behavior at a time):
        - a remote move's step 4, and a follow's deletes, against an old remote deleted after the switch or archived
          read-only keep the record, `move-unfinished` naming the cause and a rerun failing alike, until `--leave-source`
          ends it, its report naming what stays on the old remote, after which `--to` another remote and a layout-moving
          setting each run
        - a move whose new remote is deleted after its copy deletes nothing on the old remote; its `--leave-source`
          withdraws its forwarding record and reverts the pointer's change, and a clone that followed onto the deleted
          remote leaves the source onto the old remote once that withdrawal has run, the pointer's change reverted where
          the old remote is a backing repository and removed where it is the code remote, a fresh clone's first
          designation then reading none
        - `--leave-source` on a move whose new remote answers, both remotes alive, ends its record withdrawing nothing,
          and while that remote is emptied ends the record withdrawing nothing, every clone ending on it once a push
          restores the commit
        - on a move whose new remote is deleted and whose old remote is archived read-only it keeps the record, its
          withdrawal push refused through the `store` arm's terminal `refused`, naming the record's deletion by hand
        - a move whose new remote is deleted after a delete on its old remote landed ends without a withdrawal
        - a move back whose new remote went before its switch is ended by `--leave-source`, which withdraws its forwarding
          record, every clone then syncing with the old remote
        - a rerun's refused copy is ended by `--leave-source`, whose report, where an earlier run's copy deleted a
          forwarding record there, names that record's commit, kept at `refs/arc/tmp/migrate/deleted-record`, and its
          restore

### `[ ]` **17.5 `arc store remote` after a follow and when repointing `backing` — § 9.4, § 9.8**

- _Goal:_ A `backing` repoint re-homes this clone's state with a copy only where it will push there, and a setting
  after a follow, or from a checkout behind one, reaches the state's home or refuses naming the route there.

- **Additional Context:** `notes-storage-ref-backend.md` § The second model check

    - Build `test-first` (one behavior at a time):
        - on a clone whose `backing` URL differs from the pointer, `arc store remote backing push` repoints it, and a clone
          whose old backing repository is gone then syncs with the new one, its pushes there after the move's copy — an
          end, and a reopen owing its history ref's delete — landing there
        - `arc store remote backing read` on such a clone repoints with no copy, pushing nothing to the new URL, and drops
          `backing`'s tracking refs and kept tips
        - after a follow between two backing repositories answering `read`, `arc store remote backing push` before any
          pull copies and deletes nothing and sets `push`
        - a `backing` setting from a checkout whose pointer predates a move the clone followed refuses `moved` by the
          project check, naming `arc store migrate` and `arc store migrate --to <remote>`
        - a clone whose `backing` carries `push`, its repository gone, whose code remote holds no state, is named
          `arc store remote backing off` and then the code remote's `push` setting by both
          `arc store remote <code remote> push` and `--leave-source --to` it
        - a local-only clone refused `moved` designating a remote whose forwarding record names its project follows the
          move after setting that remote `read`

### `[ ]` **17.6 Moving state between remotes** — validate exit criterion at segment scope

- _Goal:_ Every case of § 14.6 and § 14.7 passes, every clone of each scenario ending on one remote holding every write.

    - Request `arc check segment`

## **Phase 18:** Hosts, platforms, and cost

_Purpose:_ The evidence no per-change CI run gathers: the bursts, the Windows and macOS pair with the Windows budget and
its conditional reader or object batching, the CI cost bound, the hand-run host kit, the pack cost of shared personal
names, and the suites that survive the cutover.

_Mode:_ `replication` — closes when every platform, host, and measurement § 14.5 and § 14.8–§ 14.12 enumerate has run
and is recorded.

_Exit criterion:_ The bursts and the Windows budget pass on their dispatched runs, each layout's conformance run stays
within 1.5 times the in-repo conformance's time, and the host kit's results, the pack-cost measurement, and the
surviving suites are recorded in `notes-storage-ref-backend.md`.

### `[ ]` **18.1 The bursts — § 14.5**

- _Goal:_ Twenty worktrees and twenty clones writing at once lose no write, on the platforms where contention costs most.

    - Twenty worktrees writing personal-inbox insertions and removals at once, and twenty clones converging on one ref,
      in a suite registered in the `portability` tier's list (`localVitestTierArguments`, `lib/local-vitest-runner.ts`),
      which both portability jobs (`.github/workflows/ci.yml`) run through `test:portability`
    - The suite runs only where `ci.yml` sets `ARC_STORE_BURSTS`: on the pair's `schedule` and `workflow_dispatch`
      runs and the Linux job's `workflow_dispatch` runs, so the Linux job's runs on reviewed pull requests and the
      integration tier skip it; a per-test timeout above the Windows bursts' 378–401 s
    - Passes with no lost write in one dispatched run of the Windows and macOS pair (`run_portability_pair: true`) and one
      of the Linux portability job before this change lands, each recorded in `notes-storage-ref-backend.md`, since a
      scheduled workflow runs only on the default branch

### `[ ]` **18.2 The Windows budget and the portability pair — § 11.7, § 14.10**

- _Goal:_ A dispatched portability run passes `--git-dir` with Windows paths and reftable on NTFS, and times `version`,
  `read`, `list`, `lookup`, and `write` within their budgets over 600 work items in twelve quarters.

    - The separate layout's suites join the `portability` tier's list ungated, each listed by file name: 8.2's
      `store-ref-directory.test.ts` and 8.6's `store-ref-separate-conformance.test.ts`, so the pair runs `--git-dir` and
      reftable on each platform and the Linux `portability` job runs them on each reviewed pull request it runs on;
      `ARC_STORE_BURSTS` gates only the bursts (18.1) and the timing suite (18.2.a)

    - `[ ]` **18.2.a The timing run**
        - A timing suite in the same list under `ARC_STORE_BURSTS`, over a store of 600 work items in twelve quarters
          built once per run as one `git fast-import` stream imported into each layout's repository — the default
          layout's files-format code repository and the separate layout's reftable directory — timing each operation in
          both layouts and taking the median of eleven runs of each
        - It asserts § 11.7's budgets on `win32` alone and reports its medians on macOS and Linux; one dispatched run
          passes before this change lands, its figures recorded in `notes-storage-ref-backend.md`

    - `[ ]` **18.2.b Only where a budget is breached**
        - A read over its budget gets a long-lived `cat-file --batch` reader for the operation's reads, aborting on
          cancellation and closed before maintenance
        - A write over its budget writes its blobs through one `hash-object -w --no-filters --stdin-paths` over files in
          a temporary directory, and its trees through one `mktree --batch`, so its process count stops growing with its
          records; under `core.autocrlf=true` its blobs keep the bytes written
        - Built test-first against the breached operation's cases only where the run shows a breach; otherwise this
          subtask records that none was needed

### `[ ]` **18.3 CI cost — § 14.12**

- _Goal:_ Running both backends until the cutover costs CI no more than the bound: each layout's ref conformance run
  within 1.5 times the in-repo conformance's time on the same GitHub-hosted runner.

    - Per-file times from the `duration-results-integration-*` artifacts a dispatched run uploads (`ci.yml`), the in-repo
      conformance file (`__tests__/integration/store-in-repo-conformance.test.ts`) and each layout's ref conformance file
      read from one run on `ubuntu-latest`, the shard that ran each named beside its time
    - The tier and CI-job rows the new files touch re-measured after the last one lands, as 1.1 measured them, and
      updated to those figures, each delta from 1.1's baseline recorded in `notes-storage-ref-backend.md` § CI cost
      history
    - The Linux `portability` job, which has no budget row, read from its own per-file times on one dispatched run: the
      time the separate-layout files (18.2) add to each reviewed pull request it runs on, recorded there beside the rows

### `[ ]` **18.4 The host kit — § 14.8**

- _Goal:_ The checks no CI host can run are run by hand against the real hosts, GitHub and GitLab holding every one, so
  the design's two unverified load-bearing assumptions are settled before the flip.

    - `[ ]` **18.4.a The kit**
        - 2.5's hand-run script under `__tests__/benchmarks/` grown into the kit, as the hand-run benchmarks there are,
          never in a tier, a CI job, or the shipped package, needing credentials and scratch repositories
        - The contract's trial re-authored, its scripts never kept: push, fetch, delete, and lease of `refs/arc/*`; a
          default clone fetching none; `--atomic` holding a code branch back; rulesets; an ordinary member's write and
          read permissions; forks copying no `refs/arc/*`; each driven through the built backend's `pull` and `push`
          where the check concerns its behavior
        - What this design adds: `--porcelain` on each host, what a receiver without atomic pushes prints, each host's
          text for a lost race under `--atomic` and on a single ref, leased deletes, the forwarding record, Azure DevOps'
          fork copying and its ordinary members' permissions, the history-replay push refusal's message, and 2.5's two
          checks, protocol v2's narrowing and `atomic` over HTTP, run again on every host

    - `[ ]` **18.4.b The run**
        - Run against GitHub and GitLab, which must hold, Azure DevOps and Bitbucket, which should, and Gitea and
          Forgejo, best effort; results recorded in `notes-storage-ref-backend.md`; a must-hold host failing a check goes
          back to the specification as a design defect before landing, never a code fix alone

### `[ ]` **18.5 The pack cost of shared personal names — § 14.9**

- _Goal:_ Whether personal files' shared names cost a host's pack is measured, so renaming stored paths stays a forward
  change taken only if it bites.

    - Several people's personal refs pushed to a local bare repository and packed, today's names against names ending in
      the person's id; the result recorded in `notes-storage-ref-backend.md` beside the host kit's

### `[ ]` **18.6 The suites that survive the cutover — § 14.11**

- _Goal:_ The cutover's deletion pass has the list of suites it keeps and retires: one running the shared suite or testing
  a consumer through the contract survives, and one targeting the in-repo implementation, notes, or Errand refs by name
  retires.

    - Recorded in `notes-storage-ref-backend.md`

### `[ ]` **18.7 Hosts, platforms, and cost** — validate exit criterion at segment scope

- _Goal:_ The bursts and the Windows budget pass on their dispatched runs, CI cost holds, and the host kit, pack cost,
  and surviving suites are recorded.

    - Request `arc check segment`

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
