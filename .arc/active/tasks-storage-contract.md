# Task List: Storage Contract

- **Design:** `spec-storage-contract.md`

---

## **Phase 1:** Contract core

_Purpose:_ The contract's types and data under `lib/store/` — operations, identities and versions, write and link
shapes, the refusal and outcome vocabulary, and the family and kind registry — so every backend, the concurrency
library, and the shared caller pieces build against one declared surface. Reviewable as one chunk: declarations
only, no backend; its seam with Phases 2–7 is the types they import.

_Mode:_ `layer` through Phase 3 — closes on a settled contract, shown implementable without Git.

### `[x]` **1.1 Baseline the test-cost rows this change moves**

- _Goal:_ Every test-cost budget row this change moves has a pre-change baseline, taken before the first new test
  file lands, so the comparison at verification measures this change alone.

- _Outcome:_ Retained and normalized three pre-change runs each of `unit`, `integration`, and `lane`, with
  `tier-isolated` and 12 workers, in the personal workspace's `.internal/test-cost/` directory. Raw `before-<row>-<n>.json`
  groups remain available for the verification comparison; no new test file existed when they were captured.

### `[x]` **1.2 Contract interface: operations, identities, and versions — D1, D2, D5**

- _Goal:_ One interface declares every operation D1 names with its input and result, over opaque owner identities and
  record references, record versions, state versions, ordered format versions, and work items' placements and links, so
  every backend and caller builds against the same surface and no caller can learn which backend answered.

    - `[x]` **1.2.a Identity, reference, version, and placement values**
        - Added opaque owner and record values, typed per-kind constructors, equality and accessors, ordered format
          versions, and logical placement. Archive labels now have one kernel authority shared with layout.

    - `[x]` **1.2.b The operations interface and its result envelope**
        - Declared all nine Store operations under the common result envelope, with path-free lookup, marker-shaped
          claims using the shared kernel token grammar, and lifecycle listing filters.

### `[x]` **1.3 Write, batch, provenance, link, and conflict-record shapes — D3, D6**

- _Goal:_ Writes, batches, provenance, links, and conflict records each have one validated shape, so a version-checked
  write, an all-or-nothing batch, the provenance it carries, the traceability links a backend stores, and the clash a
  merge keeps are the same data on every backend.

    - `[x]` **1.3.a Writes and batches**
        - Added strict put/removal and batch inputs, input-bound success validators, and UID-based duplicate
          detection. Primary placement and whole-value optional links remain distinct from companion writes.

    - `[x]` **1.3.b Provenance and links**
        - Added caller and backend provenance plus branch, change-request, landing, and task-capture links; caller
          validation rejects backend-assigned fields and repeated captures.

    - `[x]` **1.3.c Conflict records**
        - Added serialized conflict loci and both labeled sides over the common base; resolving writes name conflict-
          record references.

### `[x]` **1.4 Refusals, sync and listing outcomes, and the capability report — D1, D4**

- _Goal:_ Every failure a backend can report is a member of one closed, Zod-defined vocabulary carrying its class,
  observed condition, and remedy, and every listing and sync outcome is typed, so a caller handles each case
  exhaustively and a refusal serializes into an `arc` command's JSON output as it stands.

    - `[x]` **1.4.a The refusal vocabulary**
        - Added the closed local and transient-publish refusal union, assigned classes, observed conditions, and
          executable remedies, including every named interim unsupported case.

    - `[x]` **1.4.b Listing and sync outcomes**
        - Added complete listing diagnostics and per-record mutation bases, independently reported sync states, and
          family-scoped publish outcomes with retry timing and remote failure causes.

    - `[x]` **1.4.c The capability report** — one capability, whether state lives off the checkout's branch
        - Added the strict stateOffBranch capability report as the single caller-visible backend distinction.

### `[x]` **1.5 Family and kind registry as data — D5, D10**

- _Goal:_ The record model lives as one data registry under `lib/store/` — every family's storage properties and
  every kind's mechanism, never a field schema — from which the conformance suite, the in-repo dispatch, the ref
  layout, and moving state all derive.

    - `[x]` **1.5.a Families**
        - Recorded the eight state families, reserved roles, and two ghost families with scope, declared ref
          ownership, retention, sync, lifecycle, and profile assignment.

    - `[x]` **1.5.b Kinds and their mechanisms**
        - Recorded every role's owner, cardinality, key, parser slot, format, writer and merge rules, projection and
          interim home; entry grammars and the five pending layout addresses remain explicit.

    - `[x]` **1.5.c The machine-local path set and derived views**
        - Recorded machine-local paths, including interim workspace internal directories, and derived views separately
          from stored families, with registry and layout invariants exercised across all kinds.

## **Phase 2:** Concurrency library

_Purpose:_ Entry merge, three-way line merge, ID stamping, and rank keys as pure functions with no I/O, property-tested,
for the reference backend now and the ref backend and projection later. Reviewable as one chunk: pure modules plus their
dependencies; its seam is the conflict-record type from Phase 1 and the merge calls Phase 3 makes.

### `[x]` **2.1 The library's dependencies and import boundary — D6**

- _Goal:_ The library's two dependencies are present as the design names them — `node-diff3` pinned to an exact
  version among the runtime dependencies, `fast-check` among the development dependencies — with the root
  `package.json` untouched, and no library module can reach anything that does I/O.

- _Outcome:_ Added exact runtime `node-diff3` 3.2.1 and development `fast-check`, preserving the root manifest.
  The import guard scans static, dynamic, and re-export dependencies against the pure library boundary; package
  checks pin the merge dependency and its license and dependency properties.

### `[x]` **2.2 Entry lists: splitting, IDs, and stamping — D6**

- _Goal:_ An entry list splits into its entries and the bytes around them and rejoins unchanged, and every entry can be
  keyed by a stable `_Id:_` — eight hex characters in `_Created:_`'s grammar, re-drawn on a clash within the file, and
  given at first persist to an entry without one — so entry merge keys on identity and a retitle stays an edit.

- _Outcome:_ Added lossless heading and field-header splitting, comment masking, and injected ID stamping.
  Parser correspondence, managed field placement, mixed line endings, collision redraws, and existing ID preservation
  are exercised through the public functions.

### `[x]` **2.3 Three-way line merge over `node-diff3` — D6**

- _Goal:_ Prose merges from the base both writers started from, given base, current, and incoming by role: a hunk both
  sides changed differently keeps the current side in the merged text and lands as a conflict record holding the
  incoming side, through one module that passes `node-diff3`'s `diff3Merge` arrays of lines and exposes none of its
  types.

- _Outcome:_ Added a line-array adapter with explicit merge options and separate final newline reconciliation.
  Conflicts keep current text and carry base hunk coordinates and labeled sides; generated unchanged-side cases and
  emitted declaration checks protect byte preservation and the dependency boundary.

### `[x]` **2.4 Entry merge — D6**

- _Goal:_ Two concurrent edits of an entry list merge from their common base without manual action where they do not
  clash, a same-entry clash keeps the current entry and becomes a conflict record holding the incoming one, and nothing
  is lost silently.

    - `[x]` **2.4.a Insertions, edits, and placement**
        - Added ID-anchored insertion ordering, whole-entry and section comparison, retitle handling, and separate
          surrounding prose merges. Entry clashes retain current bytes with labeled conflict records.

    - `[x]` **2.4.b Removals as an observed-remove set**
        - Added observed removals that preserve concurrent edits, remove mutually deleted entries, and ignore
          wall-clock recency.

    - `[x]` **2.4.c Properties**
        - Generated entry-list cases exercise role symmetry, entry conservation, unchanged-side merging, and
          insertion ordering, including prose and section boundaries.

### `[x]` **2.5 Rank keys — D6**

- _Goal:_ A key can be generated at any position in an ordered list, so a reorder writes one stub — or, where the
  stubs on both sides of the position share a rank, the moved stub and the tied stubs above it in one batch — by
  ARC's own adaptation of the public-domain `fractional-indexing` algorithm with its default base-62 alphabet.

- _Outcome:_ Adapted the attributed CC0 base-62 arithmetic with strict neighbor ordering. Atomic placement
  returns the moved stub and only tied successors; generated open-bound and tied-list cases plus stored-format
  checks protect ordering and the persisted key grammar.

## **Phase 3:** Reference backend and conformance suite

_Purpose:_ The in-memory, test-only reference backend and the one conformance suite every backend passes, so the
contract is shown implementable without Git before any Git-backed backend is built against it, and kept out of the
package. Reviewable as one chunk: the suite with the backend it first proves; its seam with Phases 4 and 7 is the
fixture contract the in-repo fixture implements.

_Exit criterion:_ The conformance suite passes against the reference backend over every family and kind, its sync
producing every outcome and failure class; the concurrency library's property tests pass; and the ship guard fails
when a module under `src/` imports the reference backend.

### `[x]` **3.1 Conformance suite harness and fixture contract — D7**

- _Goal:_ One suite every backend passes, parameterized by a fixture that declares what its backend serves and how to
  drive it, so each backend runs the same assertions and differs only in its fixture's declarations.

    - `[x]` **3.1.a The fixture contract**
        - Added backend-neutral hooks for valid and rejecting content, persistence, races, identity, faults, locks,
          remote state, and refusal repair. Family, publish, entry-shape, and coverage declarations stay test-only.

    - `[x]` **3.1.b The suite's registration and item map**
        - Registered all sixteen items over every served kind, with named reasoned exclusions. Invalid declarations
          fail before registration; known subsets and multiple publishes remain supported.

### `[x]` **3.2 Reference backend: records, versions, history, and changes — D1, D2, D3, D7**

- _Goal:_ An in-memory backend with no Git serves `read`, `write`, `list`, `version`, `history`, and `changes` over
  every family and kind, with a monotonic opaque state version that advances with each landed write and record
  versions assigned as writes land, so the contract is shown implementable without Git.

    - `[x]` **3.2.a Records, references, record versions, and capability** — suite items 1, 2, 13, and 15
        - Added durable memory records, minted UIDs, rename and generation isolation, exact record versions,
          placements and archive sequences, whole-value links, keyed ownership, and the off-branch capability.

    - `[x]` **3.2.b State versions, reads as of a version, and changes** — suite items 6 and 7
        - Added saved snapshots and bounded changes. Historical identity resolution ignores later aliases and faults;
          unrelated writes preserve record-bound writes and scoped changes through separate assertions.

    - `[x]` **3.2.c History** — suite item 11
        - Added newest-first record history across renames and removal, with caller facts, canonical references,
          owner UIDs, and shared batch provenance.

### `[x]` **3.3 Reference backend: batches and merge kinds — D3, D6, D7**

- _Goal:_ Batches apply all or nothing with every stale record named, and a stale base on a merge kind merges through
  the concurrency library by the kind's mechanism, returning the merged version and any conflict records, which the
  backend stores with the record's family.

    - `[x]` **3.3.a Batches** — suite item 4
        - Preflight every mutation and publish a prepared namespace atomically. Stale batches name all stale records
          and apply nothing; mixed removals and writes share one batch ID in history and changes.

    - `[x]` **3.3.b Merge kinds** — suite item 3
        - Applied registry-selected entry and line merges against saved record bases, with first-persist ID stamping.
          Conflicts persist with labeled sides in their family and close through subject writes naming them;
          create-only and write-once updates remain refused.

### `[x]` **3.4 Reference backend: listings, format versions, and lookup — D3, D4, D5, D7**

- _Goal:_ Listings keep absent, unreadable, and complete distinct with every diagnostic, a record newer than the build
  surfaces as a diagnostic or a refusal naming its remedy, and `lookup` resolves every input D1 names, so a deciding
  consumer can refuse on incomplete evidence and a browsing one can show what it has.

    - `[x]` **3.4.a Listings and format versions** — suite items 9 and 10
        - Added distinct absent, unreadable, and complete listings, all five entry diagnostics, lifecycle filters,
          identity admission, and record-bound mutation bases. Newer formats diagnose and refuse with a rebuild remedy.

    - `[x]` **3.4.b Lookup** — suite item 12
        - Added slug and former-name, terminal-origin, checkout-claim, commit, and ref lookup. Exact SHAs precede
          patch IDs, task captures remain complete, and held-here and ambiguous lookups have reachable remedies.

### `[x]` **3.5 Reference backend: sync against an in-memory remote — D4, D7**

- _Goal:_ The reference backend's `sync` against an in-memory remote produces every sync outcome and failure class
  with its fields, so the contract's sync semantics are held by a running backend before any Git-backed sync exists.

- _Outcome:_ Added an independently writable memory remote with registry-based reconciliation and family-scoped
  publishes. Actual competing writes exhaust compare-and-swap retries without applying pending local state, using
  injected elapsed time; transport and policy failures recover after repair. Configuration states remain independent,
  and concurrent entry, prose, and single-writer changes preserve labeled conflicts.

### `[x]` **3.6 Every refusal recovery-complete — D4**

- _Goal:_ Every refusal the contract defines is returned as a value with its class, observed condition, and remedy,
  and each recoverable refusal has a test that applies its remedy and reaches the success path, so no refusal is a
  guard-only dead end.

    - `[x]` **3.6.a Item 14 over the reference backend**
        - Produced each supported refusal, checked its exact code or case, class, condition, and remedy, then repaired
          the cause and retried successfully. Namespace admission covers every operation, and key faults differ by
          identity. Content and newer-format remedies use typed causes rather than message keywords.

    - `[x]` **3.6.b Completeness by construction**
        - Added the exhaustive code and case table, including future transient-write cases with explicit reference
          exclusions. All exclusions are reported by name; the reference suite's 56 skips cover substrate/state
          coverage, parser-free kinds, and checkout/interim/transient-only refusals.

### `[x]` **3.7 Keep the reference backend out of the package — D7**

- _Goal:_ The reference backend never ships: the package build output contains none of it, and a check fails when any
  module under `src/` imports it.

    - `[x]` **3.7.a Import guard**
        - Added source resolution guards for imports, re-exports, dynamic imports, require, and import types. Planted
          production imports demonstrate that a reference dependency is rejected.

    - `[x]` **3.7.b Build-output check**
        - Build-output criterion passed after the full package build: actual `dist/metafile-esm.json` raw inputs and
          every output's input attribution contain no reference support. Planted raw and output inputs are rejected.

## **Phase 4:** In-repo implementation over tracked records

_Purpose:_ The first backend over today's tracked substrate — reads and listings through the layout resolver and the
composed lifecycle index, compare-and-swap writes and batches, the branch tip as the state version, history through
branch commits, and lookup through today's derivations — behind the one composition point, so the shared caller
pieces can serve production callers. Reviewable as one chunk: the in-repo backend's tracked arm with its fixture; its
seam with Phase 7 is the substrate dispatch the other arms join.

_Mode:_ `slice` through Phase 5 — closes on production callers served through the contract over today's tracked
records, with no change in behavior.

### `[x]` **4.1 Layout addresses for the internal records and the inbox — D8**

- _Goal:_ The tracked records under `.arc/system/.internal/` — Candidate, integration-boundary, and transition
  records — and the inbox at project and identity scope have layout address kinds named by role, which
  `resolveArcPath` maps to today's paths, so the in-repo implementation finds every record it reads through the one
  layout authority and only the resolver knows a surface's filename.

- _Outcome:_ The layout now owns Candidate, boundary, origin-keyed transition, and scoped inbox paths. Registry
  descriptors resolve all five pending homes; differential coverage preserves existing paths and selects the primary
  identity-global inbox from linked worktrees.

### `[x]` **4.2 In-repo backend and the composition point — D1, D8**

- _Goal:_ The in-repo implementation exists behind the one composition point, dispatches each kind to its substrate by
  the registry, and answers the capability report with no.

    - `[x]` **4.2.a The tracked-write lock**
        - Shared advisory scope and checkout-private Git-directory locking isolate tracked writes; typed timeouts
          retain the lock-held repair and retry path.

    - `[x]` **4.2.b The composition point**
        - The public factory takes one complete port object, constructs without I/O, and lazily binds backend,
          identity, origin selection, and write locks. Import guards keep implementations private and heavy reads
          deferred.

    - `[x]` **4.2.c Substrate dispatch and the capability report**
        - Registry homes dispatch tracked, pending, and unhomed roles explicitly; capability reports false.
          Unclassified failures preserve their original cause in a thrown ArcError.
        - _Retired in:_ Phase 7

### `[x]` **4.3 Tracked reads and listings through the composed lifecycle index — D5, D8**

- _Goal:_ Tracked records read and list through the contract with the results today's code paths return — a meta through
  the composed lifecycle index with its parser registered, a Candidate record and a transition record through the layout
  resolver, and another companion through today's matcher — including records on other branches, read-only and live,
  with the copy today's composition selects where a record has more than one, but for a flat-active meta its parser
  rejects and a read of a copy this checkout holds that agrees with the selected one, as a parked work unit's backlog
  pointer does.

    - `[x]` **4.3.a The meta kind and its parser**
        - The meta parser and regular-file lifecycle walk preserve flat-active precedence, restricted held
          selection, duplicate ordering, and diagnostics for unreadable, malformed, and unplaceable records.

    - `[x]` **4.3.b Records on other branches**
        - Local composition selects branch or agreeing checkout copies without fetching; raw bytes supply
          digests while listings retain selected fields. Companion locality and writer-identity Errand discovery follow
          it.

    - `[x]` **4.3.c Candidate records, transition records, and other companions**
        - Layout roles and the existing companion matcher serve canonical internal records and paired specs;
          Candidate key mismatches retain explicit listing diagnostics and typed read refusals.

### `[x]` **4.4 Tracked writes and batches — D3, D8**

- _Goal:_ Writes to tracked records through the contract produce the bytes today's writers produce, compare-and-swap
  on content digests under the checkout's tracked-write lock (Task 4.2.a), apply a batch all or nothing with every
  record restored on failure, and leave the Git index as they found it.

    - `[x]` **4.4.a Single writes**
        - Canonical validation precedes digest checks and delegates serialization to the existing stores.
          Raw records retain their bytes; creation placement, typed conflicts, immutable transitions, and index
          isolation hold.

    - `[x]` **4.4.b Batches within the tracked substrate**
        - Batches capture and preflight every target under one tracked lock, name every stale record, and
          restore attempted writes on failure. Failed restores name all remaining files and the manual repair.

    - `[x]` **4.4.c `checkout-not-writable`**
        - Reads and writes share selected-copy admission, including flat metas, parked pointers, companion
          creation, last-fetched state, and uncommitted moves. A pure mapper preserves existing preflight landing
          remedies.

### `[x]` **4.5 State version, history, and changes over the branch — D2, D8**

- _Goal:_ Over tracked records the state version is the branch tip, reads and lists as of a version read that commit's
  tree alone by the rules the listing of this checkout's records runs by over the working tree, `changes` reports the
  records whose files differ between two commits, and `history` walks the branch's commits with their messages, while
  records outside the state version refuse `unsupported`.

- _Outcome:_ Saved anchors use branch HEAD and immutable local trees. History follows renamed files with exact commit
  messages and removal versions; changes conserve endpoint differences, restrictions, and other-branch refusal remedies.

### `[x]` **4.6 Lookup through today's derivations — D3, D8**

- _Goal:_ `lookup` over tracked records resolves a slug, a former slug through today's transition record, a lineage
  origin, a work unit's checkout claim, and a commit or ref through today's derivations, so reverse lookup answers as
  today before captures exist.

- _Outcome:_ Lookup derives current and former slugs, origin transitions, checkout claims, and final Context footers
  or branch names. Shared task-range expansion preserves delivery attribution; reused aliases retain ambiguity remedies.

### `[x]` **4.7 In-repo conformance over the tracked families — D7**

- _Goal:_ The conformance suite passes against the in-repo implementation over the tracked families, with version
  conflicts produced by racing writers, so the tracked arm meets the reference backend's assertions before the shared
  caller pieces build on it.

    - `[x]` **4.7.a The in-repo conformance fixture**
        - The public factory fixture uses real Git, tracked locks, racing writes, corrupt and unreadable files,
          and executable refusal repairs. Every interim assertion and refusal exception has a rendered name and reason.

    - `[x]` **4.7.b The suite over the tracked families**
        - The tracked suite exercises every admitted assertion; split capability assertions preserve the
          reference suite while isolating actual unsupported behavior and legacy provenance or format limits.

## **Phase 5:** Shared caller pieces

_Purpose:_ The current-work-unit resolver, the lifecycle index keyed by identity, and the store behind the
integration checkpoint's lifecycle port, landed over the contract and serving their existing call sites unchanged,
so parallel rerouting work shares nothing but the landed contract. The index is proven here on one caller; Phase 6
covers the rest. Reviewable as one chunk; its seam with Phase 6 is the index's query surface.

_Exit criterion:_ `resolveActiveWu`, `readActiveMetaCandidates`, and `resolveCurrentWuSlug` delegate to the resolver,
and the checkpoint and merge compositions default to the new store, with every existing test passing unchanged; the
identity-keyed index answers the pilot caller's query with the records and fields that caller's path read returns.

### `[x]` **5.1 Current-work-unit resolver and its three delegates — D9**

- _Goal:_ One resolver answers which work unit this checkout holds, by identity, with the answers `resolveActiveWu`,
  `readActiveMetaCandidates`, and `resolveCurrentWuSlug` give today and the candidates the one-work-unit-per-worktree
  guard checks, a symbolic link to a meta aside, and those three become delegates over it with their call sites served
  unchanged.

    - `[x]` **5.1.a The resolver**
        - The identity resolver keeps resolved, absent, and ambiguous outcomes, parser-rejected candidates,
          read warnings, and an unhusked marker-claim fallback with executable refusal repairs.

    - `[x]` **5.1.b The delegates**
        - The default full-layout reader delegates dynamically and renders raw bytes through its existing
          parser; lite and contributor scans, placeholder values, warnings, and all three existing delegates are
          preserved.

### `[x]` **5.2 Lifecycle index keyed by identity, proven on one caller — D9**

- _Goal:_ A lifecycle index keyed by identity lists work units with their parsed meta fields, never a path, answers
  `lookup` for lineage by slug and in-flight work by checkout claim, and returns, for one existing caller's query, the
  records and fields that caller's path read returns.

    - `[x]` **5.2.a The index**
        - The path-free identity index retains parsed fields, placement, versions, and completeness evidence;
          selected/held agreement uses lifecycle fields and placement, while saved-state and lookup queries retain
          refusals.

    - `[x]` **5.2.b The pilot caller**
        - Real-Git differentials preserve the view resolver’s records and fields for its explicit queries,
          including current, backlog, archive, absent, and saved-state cases; the caller remains unchanged.

### `[x]` **5.3 Store behind the integration checkpoint's lifecycle port — D9**

- _Goal:_ The checkpoint's and merge composition's default lifecycle storage is the new store — its version the
  contract's `version`, its file reads the contract's reads as of that version through the layout resolver — and it
  answers as today's default ports do in the lifecycle summary, but for the two metas the index drops (Task 5.2.a),
  which its summary omits where they give an unplaceable meta at its tier and a rejected flat-active meta's slug at its
  other copy.

    - `[x]` **5.3.a The port over the store**
        - The snapshot port binds Store version, indexed directory projection, layout reversal, and record
          reads to one saved state. Differentials preserve lifecycle summaries and legacy read normalization, with both
          omissions.

    - `[x]` **5.3.b The defaults become the store**
        - Checkpoint and merge defaults construct the Store snapshot port; injected lifecycle ports retain
          their authority and existing composition tests continue to pass.

### `[x]` **5.4 Shared pieces served end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds as one exercised scenario: production callers are served through the
  contract over today's tracked records, with no change in behavior.

- _Outcome:_ At `de1ebe1cf`, the combined delegates, checkpoint and merge compositions, view pilot, snapshot
  differential, and tracked conformance scenario passed. The existing callers and production defaults satisfy the
  shared-piece exit criterion over the committed Store implementation.

## **Phase 6:** The lifecycle index across its existing callers

_Purpose:_ Every existing caller that reads the meta through an index entry's path in this checkout, enumerated and
held by a differential test to the identity-keyed index returning the same records and fields for each of its queries.
The callers keep their code until rerouted. Reviewable as one chunk: tests only, beside the index they exercise.

_Mode:_ `replication` — closes when the enumerated caller set is exhausted and batch-verified.

_Exit criterion:_ Every caller in the enumerated set has a passing differential test for each of its queries, and the
enumeration is re-derived against the tree at the phase's close.

### `[x]` **6.1 Enumerate the index-path callers and their queries — D9**

- _Goal:_ Every existing caller that reads the meta through an index entry's path is enumerated with each of its
  queries and assigned to a batch, so the replication has a closed surface whose exhaustion can be checked.

- _Outcome:_ `notes-storage-contract.md` records eighteen query-owning call sites derived at `0d0e79a33`, split
  between lifecycle verbs and the remaining consumers, with saved-state queries and branch-tree exclusions explicit.

### `[x]` **6.2 Differential batch: lifecycle verbs — D9**

- _Goal:_ For every enumerated lifecycle-verb caller, and for each of its queries, a differential test shows the
  identity-keyed index returning the same records and fields as the caller's path read over the same repository.

- _Outcome:_ Eleven lifecycle query owners compare their original path reads with held or selected identity records,
  including pointer agreement, dependency authority, field-block validation and finalization workflow bindings.

### `[x]` **6.3 Differential batch: integration, status, view, reconcile, teardown, and retirement — D9**

- _Goal:_ For every enumerated caller in integration, status, view, reconcile, teardown, and retirement, and for each
  of its queries, a differential test shows the identity-keyed index returning the same records and fields as the
  caller's path read over the same repository.

- _Outcome:_ Seven consumer query owners compare their original path reads with identity records, including saved
  HEAD summaries, selected-record authority, task-list bindings and teardown projections.

### `[x]` **6.4 Index callers exhausted** — validate exit criterion at segment scope

- _Goal:_ The enumerated caller set is exhausted and batch-verified: every caller has a passing differential for each
  of its queries, and a fresh enumeration at the phase's close finds no caller the record lacks.

- _Outcome:_ At `4bacf9a9e`, both differential batches passed together over every recorded query owner. Re-running
  the builder and indirect-path enumeration at that same head found the recorded caller set exhaustive, with the
  branch-tree exclusions unchanged.

## **Phase 7:** In-repo implementation over personal files and transient-identity records

_Purpose:_ The in-repo backend's remaining arms — personal files written under today's machine lock, and Errand records
and grooming and housekeeping claims through today's identity snapshot and transaction — with in-repo sync over the
notes sync and the Errand push, and batches refused across substrates, so every family is served where it lives today.
Reviewable as one chunk per arm; its seam with Phase 4 is the substrate dispatch.

_Mode:_ `layer` — closes on the in-repo implementation serving every family where it lives today.

_Exit criterion:_ The conformance suite passes against the in-repo implementation over every family its fixture
serves; reads and writes of personal files and Errand records through the contract match today's code paths; a batch
spanning substrates refuses `unsupported` with no file, note, or ref changed; and in-repo sync outcomes map onto D4's
as stated.

### `[x]` **7.1 Personal files: lock-free reads and compare-and-swap writes — D5, D8**

- _Goal:_ Personal files read and write through the contract where they live, each file one record, with the whole-file
  content digest as its version and compare-and-swap basis and writes under today's notes lock, returning the bytes
  today's readers read and writing the bytes today's writers write, for a `USER-INBOX` file and a `SESSION-NOTES` file.

    - `[x]` **7.1.a Reads and listings**
        - Whole-file reads retain exact bytes and digest versions through the existing primary and checkout workspace
          roots. Lock-free listings exclude machine state and distinguish unreadable roots from unreadable entries.

    - `[x]` **7.1.b Compare-and-swap writes**
        - Whole-file replacements and removals check digests under the existing notes lock. Reserved aliases name their
          unique role; racing writes and typed lock timeouts have repairable refusals.

    - `[x]` **7.1.c Batches of personal files**
        - One lock covers complete digest preflight and all replacements. Restoration includes removals and attempted
          failing targets, certifies resulting bytes, and names every remaining changed or unreadable file.

### `[x]` **7.2 Transient-identity records: snapshot reads and transactional writes — D4, D8**

- _Goal:_ Errand records and grooming and housekeeping claims read through the identity snapshot and write through
  today's transaction, keeping the absent, `error`, and complete outcomes and the blob object ID as each record's
  version, with every transaction outcome mapped onto a typed result, so their reads and writes through the contract
  match today's code paths.

    - `[x]` **7.2.a Snapshot reads and listings**
        - Local snapshots retain blob versions, raw bytes and per-entry diagnostics, partition records by registered
          role, and preserve absent, structural-error and complete outcomes without fetching.

    - `[x]` **7.2.b Transactional writes**
        - The optional blob basis enables reconciled compare-and-swap inside the existing transaction. Additive outcome
          evidence names stale, divergent and invalid entries and classifies actual Git publication failures; local
          process failures retain their causes. Content admission runs before the transaction.

    - `[x]` **7.2.c History and lookup**
        - Record history returns raw ref commit messages newest first. Claims and canonical Errand branches resolve
          through local records, with explicit identity repair and partial-protection absence.

- _Outcome:_ A stale expected version leaves the caller change unapplied while publishing the reconciled basis,
  so a re-read can observe a remote-only change and clear the conflict.

### `[x]` **7.3 Batches across substrates and in-repo sync — D3, D4, D8**

- _Goal:_ A batch spanning substrates refuses `unsupported` before anything is written, and contract `sync` covers
  personal files through today's notes save and push and transient-identity refs through their reconcile and push,
  reporting D4's outcomes with the in-repo additions while what `arc sync` does stays unchanged.

    - `[x]` **7.3.a Cross-substrate batches**
        - A real three-substrate batch refuses before changing any tracked file, personal file, note, ref or index.
          The independently sequenced writes then succeed with the same expected versions.

    - `[x]` **7.3.b In-repo sync**
        - Notes save and reconcile run before the independent Errand push, preserving producer outcomes and family
          bindings. Typed empty-save results map to noop; local failures and failed readbacks retain their causes and
          end before the Errand push. Actual transport facts carry their failure class, retry count and elapsed time.

### `[x]` **7.4 Conformance over every family — D7**

- _Goal:_ The conformance suite passes against the in-repo implementation over every family its fixture serves —
  tracked, personal, and transient-identity — with version conflicts produced by racing writers on each substrate.

    - `[x]` **7.4.a The fixture serves every substrate**
        - Real identity files, notes locks, transient ref trees and a second clone provide writes, races and faults.
          Declarations cover every homed family and name the substrate limitations and existing sync exceptions.

    - `[x]` **7.4.b The suite over the new families**
        - All admitted assertions run against the public backend. Excluded items, assertions and refusals report their
          reasons; registration rejects unused or shadowed assertion declarations, including misspelled names.

### `[x]` **7.4.R Preserve existing sync in conformance — A1**

- _Goal:_ Realize A1's named in-repo sync exceptions without changing the existing producers, with direct checks
  preserving their outcomes and remote bytes beside the shared conformance suite.

    - `[x]` **7.4.R.a Exact fixture exceptions**
        - Repeated publication, same-key transient convergence and personal working-file refresh are excluded by
          assertion and role, with their existing producer behavior stated in each reported reason.

    - `[x]` **7.4.R.b Existing behavior verified**
        - Direct real-Git cases retain repeated notes and transient publication outcomes, same-key conflicts and
          disjoint reconciliation. Merged remote notes preserve both manifests while personal working files keep
          their local bytes; the complete shared suite runs beside those cases.

## **Phase 8:** Verification

### `[x]` **8.1 Complete verification** — whole-work-unit verification

- _Quality gates:_ Markdown/ARC checks, code/shell lint, both type checks, build and the routine lane pass;
  15,340 tests with 693 declared skips. Required CI run 37074329507 passes E2E and Linux portability.
- _Success criteria:_ All 20 met against the complete work-unit diff and tree. Four full adversarial passes
  stopped with the broader residual accepted; both focused response checks completed, the final one clean.

---

## Success Criteria

- `[x]` The conformance suite passes against the in-repo implementation and the reference backend, each over every
  family its fixture serves, with each item, assertion, or refusal a fixture excludes reported by name with its reason.

- `[x]` Version conflicts are produced and asserted on both backends — on the in-repo implementation by racing writers
  on each substrate — and stale bases, with merged versions and conflict records, on the reference backend.

- `[x]` On both backends, a write to an unrelated record changes no bound check.

- `[x]` A batch with one stale record applies nothing and names every stale record; on the in-repo implementation a
  batch spanning substrates refuses `unsupported` with no file, note, or ref changed.

- `[x]` Differential tests show reads through the contract returning what the current code path returns, and writes
  producing the bytes today's writers produce, for a meta through the lifecycle index, a Candidate record, a transition
  record, a `USER-INBOX` file with its entries as today's parser reads them, a `SESSION-NOTES` file, and Errand records
  — their absent, `error`, and complete outcomes read, and a record's blob written.

- `[x]` `resolveActiveWu`, `readActiveMetaCandidates`, and `resolveCurrentWuSlug` delegate to the current-work-unit
  resolver, and every existing test passes unchanged.

- `[x]` The identity-keyed lifecycle index returns the same records and fields as today's path reads for each query of
  every enumerated caller, but for the two cases Tasks 4.3.a and 5.2.a name, and the enumeration re-derived at Phase 6's
  close finds none missing.

- `[x]` The checkpoint's and merge composition's default lifecycle storage is the new store, and their tests pass
  unchanged.

- `[x]` The diff touches nothing under `packages/arc-framework/arc/`, no verb gains or loses a commit, and the existing
  ceremony tests pass unchanged.

- `[x]` The concurrency library is covered for disjoint insertions; a same-entry clash keeping the current version and
  becoming a conflict record that names its entry, with both sides labelled; a removal racing an edit leaving the edit;
  a retitle merging as an edit; an entry without an ID gaining one and an ID clash re-drawn; clean and conflicting
  three-way line merges; and rank keys at any position, tied neighbours included, sorting as specified.

- `[x]` The package build output contains none of the reference backend, and the import guard fails on a planted import
  from `src/`.

- `[x]` Every refusal the contract defines is returned as a value, never thrown, and carries its class, observed
  condition, and remedy; each recoverable refusal has a test reaching the success path after its remedy; and no error a
  backend catches from the code it wraps is classified by its message text — the wrapped code sets each cause where
  Git fails, with today's predicates.

- `[x]` The in-repo implementation reports no for state off the checkout's branch and the reference backend yes; every
  record reads format version 1 over the in-repo implementation; and an unparseable record is an unreadable entry with
  a diagnostic that blocks no session-init for an unrelated work unit.

- `[x]` On the in-repo implementation, every kind with no home in today's substrates lists `absent` and refuses writes
  `unsupported`.

- `[x]` No module under `src/` outside `lib/store/` imports a backend, and tests reach backends only through the
  conformance fixtures.

- `[x]` The reference backend produces every sync outcome and failure class, and over the in-repo implementation each
  outcome today's notes save and push and Errand push report maps onto D4's as stated, with `arc sync`'s behavior and
  tests unchanged.

- `[x]` Every test-cost budget row the change moves was baselined before the first new test file landed, and its
  comparison is recorded at verification.

- `[x]` All quality gates pass: Markdown lint and the ARC contract checks, both type checks, `lint:ts` with no new
  size-gate suppression, `npm test`, and the build, with E2E and portability passing in required CI.

- `[x]` The in-repo fixture reports each A1 sync exception by name and reason, and direct tests verify repeated
  publish outcomes, same-key transient conflicts, disjoint reconciliation, and merged notes with unchanged personal
  working files.

- `[x]` Ready for integration

- `[x]` Historical entries expose bytes matching each non-removal record version after later updates or removals;
  removal entries carry null content and version (A2).

- `[x]` Two distinct repository-qualified branches on one work-item UID both resolve to that UID; duplicate branch
  pairs are refused (A3).

- `[x]` D20 limits rewrites to code branches and preserves D2/D10/D11 store ancestry and saved-state anchors (A4).

- `[x]` A version-bound Errand-record-to-meta put on one UID leaves one primary, retaining its links, description,
  placement, rename aliases and open conflicts; either primary handle reads its actual role at a selected state,
  history and restricted changes retain historical roles, bytes and provenance, stale/expected-absent puts and a
  batch naming both primary handles apply nothing, and reopen/sync preserve it with current-side retention on a
  concurrent role clash (A5).
