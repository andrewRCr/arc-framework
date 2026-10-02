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

### `[ ]` **4.1 Layout addresses for the internal records and the inbox — D8**

- _Goal:_ The tracked records under `.arc/system/.internal/` — Candidate, integration-boundary, and transition
  records — and the inbox at project and identity scope have layout address kinds named by role, which
  `resolveArcPath` maps to today's paths, so the in-repo implementation finds every record it reads through the one
  layout authority and only the resolver knows a surface's filename.

    - The inbox is one address kind with a scope, and the inbox kind in each family that holds it — the project family's
      and the identity family's — takes it as its projection at its family's scope. The record stores —
      `candidate-record-store.ts`, `submission-boundary-store.ts`, and `transition-record-store.ts` under
      `lib/work-unit/` — and today's inbox readers keep building their own paths; moving them onto the resolver is later
      work.
    - The resolver returns repository-relative paths. The identity-scope inbox is materialized against the
      identity-global root `resolveUserSurfaceResolver` (`lib/user-surfaces.ts`) selects, the primary worktree's, as
      `WORKING-MEMORY` already is.
    - Build `test-first` (one behavior at a time):
        - each new internal-record address kind resolves to the path today's store builds for the same record, for
          every record shape that store writes;
        - the inbox address resolves at project scope to today's project inbox, and at identity scope, materialized
          against the user-surface resolver's identity-global root, to the path today's readers use, from a linked
          worktree as from the primary;
        - every existing address kind resolves as before.

### `[ ]` **4.2 In-repo backend and the composition point — D1, D8**

- _Goal:_ The in-repo implementation exists behind the one composition point, dispatches each kind to its substrate by
  the registry, and answers the capability report with no.

- _Note:_ The tracked-write lock composes the existing advisory lock rather than sharing another lock's file; see
  `notes-storage-contract.md` § Implementation pointers (the tracked-write lock).

    - `[ ]` **4.2.a The tracked-write lock**
        - `withAdvisoryLock` in `lib/advisory-lock.ts` runs an operation while holding a lock and releases it after,
          surfacing both errors when the operation and the release fail; it is `withWorktreeOperationLock`'s body
          (`lib/work-unit/worktree-operation-lock.ts`), which then calls it.
        - The tracked-write lock is a named lock file in the checkout's own Git directory (`git rev-parse
          --absolute-git-dir`), resolved beside `resolveGitCommonDir` (`lib/git/exec.ts`) and held through
          `withAdvisoryLock` around each digest check and write, and across a batch (Task 4.4). The Candidate and
          boundary stores' per-file locks are taken inside it, as their writers take them today; no lock held across a
          whole command — the worktree-operation lock among them — is taken while it is held, so a rerouted verb takes
          that lock first.
        - Build `test-first` (one behavior at a time):
            - `withAdvisoryLock` releases after the operation returns and after it throws, and a failed release
              alongside a failed operation surfaces both;
            - `withWorktreeOperationLock`'s tests pass unchanged;
            - two checkouts of one repository write their own tracked records without waiting on each other;
            - a lock held past the wait refuses `lock-held` naming the lock, classified by `AdvisoryLockTimeoutError`'s
              class, and the write succeeds once the lock is released.

    - `[ ]` **4.2.b The composition point**
        - A factory in `lib/store/` that takes the Git executor and the stdin executor (`execInput`), file access, the
          clock, the checkout root, the identity, the remote selection, and the write locks — the tracked-write lock
          (Task 4.2.a) and the notes lock — as one required object and returns the contract; it is the only importer of
          a backend's module.
        - Constructing the contract runs no command and reads no file. The identity, the remote selection, and each
          lock's path are resolved on first use by the operation that needs one, so an operation that needs none —
          reading a meta that sits flat in `active/` (Task 4.3.a), or listing this checkout's own tracked records —
          spawns no Git process and runs outside a Git repository, as `readActiveMetaCandidates` does today (Task 5.1).
          The in-repo backend statically imports none of the modules `arc active status` defers
          (`deferredActiveProjectionModules`, `__tests__/unit/cli-loading-boundary.test.ts`): it loads the Candidate,
          integration-boundary, and transition stores on first use of their kinds, the configuration reader
          (`lib/config/status-reader.ts`), which the composition's base branch needs, on its first read or listing of
          other branches' records, and its sync arm — the notes save and push (`commands/user/save-load.ts`,
          `commands/user/push-fetch.ts`), which import `lib/config/status-reader.ts`, and the Errand push — on first
          `sync`, so reading metas loads none of them.
        - The identity is resolved as user and Errand commands resolve it: `resolveIdentity` (`lib/git/identity.ts`)
          with no prompt, which falls back to a slugified `user.name` when `arc.identity` is unset, so records are read
          under the identity they were written under. It may be absent, when neither is set. Every operation that names
          or resolves to identity-scope state — a personal file, or a record on a transient-identity ref — then refuses
          `not-found`, saying no identity is configured and naming `arc.identity`, which `arc init` sets, as its remedy,
          and a listing of either is `absent`, as `readTransientInFlightIndexes` (`lib/errand/record.ts`) answers today,
          since no identity holds no claims. A command rerouted onto the contract maps that refusal onto the error it
          reports today, as user commands report `IDENTITY_MISSING` (`resolveUserIdentity`, `handlers/shared.ts`), and
          callers that branch on a missing identity today — `arc status`'s `no-identity` view, the handoff probes, the
          stale-worktree sweep — keep checking it before they call.
        - The remote selection is read from configuration — whether `origin`, the remote every notes and Errand push and
          fetch names today (`commands/user/push-fetch.ts`, `lib/errand/merge.ts`), is set, by
          `git remote get-url origin` — never from a failed push's message.
        - Build `test-first` (one behavior at a time):
            - constructing the contract, a read of a meta flat in `active/`, and a held-here listing of this checkout's
              tracked records spawn no Git process, and each succeeds in a directory that is not a Git repository;
            - with no identity configured, a tracked read and listing succeed; the personal and transient-identity arms'
              answers are tested with the arms (Tasks 7.1.a, 7.2.a, and 7.2.c);
            - an import-boundary test fails when a module under `src/` outside `lib/store/` imports a backend, or a test
              reaches one other than through a conformance fixture;
            - a loading test that reads imports as `cli-loading-boundary.test.ts` does finds no module that test defers
              in the in-repo backend's static import closure, and the stores, the configuration reader, and the sync arm
              imported only on first use;
            - a repository whose only remote is `upstream` has no remote selected.

    - `[ ]` **4.2.c Substrate dispatch and the capability report**
        - Each kind dispatches by the in-repo location the registry records; a work-item listing that names no kind
          refuses `unsupported` (recoverable), naming listing each kind.
        - The personal and transient-identity arms throw an `ArcError` until Phase 7 builds them.
        - _Retired in:_ Phase 7
        - Build `test-first` (one behavior at a time):
            - the capability report answers no;
            - every kind with no home before the flip lists `absent` and refuses a write `unsupported` (terminal),
              naming that it has no home before the flip;
            - an error the wrapped code throws that the backend cannot classify surfaces as a thrown `ArcError` with the
              original as its cause, never as a refusal.

### `[ ]` **4.3 Tracked reads and listings through the composed lifecycle index — D5, D8**

- _Goal:_ Tracked records read and list through the contract with the results today's code paths return — a meta through
  the composed lifecycle index with its parser registered, a Candidate record and a transition record through the layout
  resolver, and another companion through today's matcher — including records on other branches, read-only and live,
  with the copy today's composition selects where a record has more than one, but for a flat-active meta its parser
  rejects and a read of a copy this checkout holds that agrees with the selected one, as a parked work unit's backlog
  pointer does.

    - `[ ]` **4.3.a The meta kind and its parser**
        - Register `parseMetaRecord` (`lib/active/meta-reader.ts`) as the meta kind's parser, and list metas through
          `resolveComposedLifecycleIndex`: a listing gives each work unit's selected copy, and the backend decides write
          admission itself (Task 4.4.c), never through a listing field.
        - The composition's oracle is built as `arc status`'s slug query builds it (`handlers/status.ts`): local refs
          only, with no network call; the base branch from configuration; and the Errand branch map and its completeness
          from the ref of the identity the composition point resolves (`readTransientInFlightIndexes`,
          `lib/errand/record.ts`), so a recorded Errand branch is never reported as residue. `arc status` and ROADMAP
          rendering read only `arc.identity` (`readIdentityPointers`; `resolveProjectErrandOracleContext`,
          `lib/status/project-oracle-context.ts`), so for a person with only `user.name` set they differ from it
          (`notes-storage-contract.md` § Implementation pointers, one identity). Callers that read live today —
          `arc status --fetch`, and the lifecycle verbs, `arc start`, and `arc rename`, which supply a materialized
          result — keep their code until they are rerouted.
        - A meta's placement is its selected copy's directory, as the layout resolver's reverse reads it
          (`identifyWorkUnitArtifactPath`, `lib/layout/identification.ts`). A parked work unit — one whose copy in
          `backlog/planned/` is `Active`, today's parked pointer, and whose selected copy is not terminal — keeps its
          backlog placement, that copy's directory, where today's composition places it at `planned` and marks it parked
          (`mergeProjectReadinessRecords`, `lib/status/project-view.ts`). Parked follows from that placement with
          `State` `Active`, so a listing carries no scheduling field (`notes-storage-contract.md` § Implementation
          pointers, parked work units). A meta at a path that reverse cannot place — flat in `backlog/planned/` or
          `completed/`, or under an uppercase quarter — lists as a diagnostic naming its file, where today's composition
          places it by its tier; only test fixtures hold one. The placement carries no cohort: a cohort member's backlog
          folder comes from its `Cohort` field (D5), which a listing gives among the meta's fields, as today's
          composition reads it (`lib/status/project-view.ts`); see `notes-storage-contract.md` § Implementation pointers
          (a cohort member's folder).
        - `read` returns a meta's bytes whether or not its parser accepts them: the parser gives a listing its fields,
          and a meta it rejects lists as a diagnostic naming its identity (D5).
        - A meta that sits flat in `active/` is this checkout's record of its work unit whether or not its parser
          accepts it or its `State` places it: a `read` returns that file and consults no other branch, so no Git
          process runs; a write targets it (Task 4.4.c); and both listings give it in place of any other copy of its
          slug, as a record or a diagnostic. Today's selection takes an `active` copy over every other
          (`selectRecordCandidate`, `lib/status/project-view.ts`) once the composition's reader (`readProjectMeta`) has
          accepted it; a flat-active meta that reader rejects, beside another copy of its slug — which no ARC writer
          produces — is one of two cases where the listings differ from today's composition, which drops the file and
          selects the other copy; a meta at a path the layout cannot place, above, is the other. Every other read
          composes as Task 4.3.b reads.
        - `list`'s held-here filter is answered from the working tree, with no cross-branch lookup, by the files the
          lifecycle walk finds (`collectLifecycleMetaFiles`, `lib/work-unit/lifecycle-index.ts`) — `active/` read flat,
          regular files only, a symbolic link skipped — restricted to the locations the filter names. Of a slug found in
          more than one, it keeps the flat-active file where there is one; otherwise, of the copies the lifecycle index
          can place (`entryFromMeta`), the one `compareLifecycleSources` prefers — active over planned over provisional
          over completed, then path order by code unit — else the preferred of all. Each file kept lists as a record or
          a diagnostic, as any listing does, whatever its `State`: its location is its directory. Dropping a meta whose
          `State` places it nowhere is the lifecycle index's own step, which the index over the contract takes (Task
          5.2.a), so `readActiveMetaCandidates`, which keeps such a meta, still does (Task 5.1). A file whose name
          carries no slug the kernel's slug schema accepts has no identity and lists as a diagnostic. The composition
          walks the same files and ranks a slug's copies the same way (`compareCandidates`,
          `lib/status/project-view.ts`), so this checkout's copy in the held-here listing is the composed index's
          current-tree copy, but for the rejected flat-active meta above; see `notes-storage-contract.md` §
          Implementation pointers (one tree walk).
        - Build `test-first` (one behavior at a time), each differential against today's path over the same repository:
            - a meta listed and read through the contract returns the fields today's path read returns;
            - every record reads format version 1, with no links and no open conflict records;
            - a read of a meta flat in `active/` returns it with no Git process spawned, from a directory that is not a
              Git repository too;
            - a flat-active meta `parseMetaRecord` rejects, beside a planned copy of its slug, is the record a read
              returns, a write targets, and both listings give as a diagnostic, where today's composition gives the
              planned copy;
            - each meta lists with the placement its directory gives — active; planned and provisional, each from a
              cohort folder too; and completed with its quarter and sequence — and with the cohort its `Cohort` field
              gives;
            - a parked work unit whose pointer sits in its cohort's folder lists with its backlog placement and the
              fields its branch copy gives, where today's composition gives `planned`;
            - a meta flat in `backlog/planned/`, one flat in `completed/`, and one under an uppercase quarter each list
              as a diagnostic naming its file, where today's composition gives each at its tier;
            - an unparseable meta lists as a diagnostic naming its identity, still reads its bytes, and blocks no read
              of another work unit;
            - a held-here listing at `active` gives the metas `readActiveMetaCandidates` reads from the flat `active/`
              root, a meta whose `State` names no lifecycle state among them, and never a record only on another
              branch, but skips a symbolic link to a meta, which that reader follows today;
            - a held-here listing over every location finds the files `buildLifecycleIndex`'s walk finds, and this
              checkout's copy of each slug is the one that index keeps and the composed index's current-tree copy, over
              a repository that also holds a meta nested under `active/`, which none finds; one slug's metas in
              `active/` and `completed/`, whose active copy all keep; and another's in `backlog/planned/` and
              `completed/` with the planned copy's `State` placing it nowhere, whose completed copy all keep — and a
              third's in `active/` and `completed/` with the active copy's `State` placing it nowhere, whose active copy
              the listing keeps where the index and the composition keep the completed one;
            - a meta whose filename carries no valid slug lists as a diagnostic naming the file.

    - `[ ]` **4.3.b Records on other branches**
        - Local branches, and pushed branches through their remote-tracking refs as last fetched, as `arc status` reads
          them without `--fetch`; a listing never fetches.
        - Where this checkout's copy agrees with the selected one — its slug, `State`, `Owner`, `Priority`, `Cohort`,
          `Depends On`, and placement matching, the fields `recordsAgree` (`lib/work-unit/composed-lifecycle-index.ts`)
          compares to grant a writable path, placement standing for its location and parked scheduling, while progress
          fields may differ — a read returns this checkout's copy and
          its version, so a write built on it checks the copy it replaces (Task 4.4.c). A parked work unit's backlog
          pointer is the one such copy whose bytes differ from the selected copy's; listings keep the selected copy's
          fields, and every listed record carries the version its read returns.
        - The index carries a record's projected fields, not its bytes; an in-flight meta's source path is
          `<ref>:<path>` (`lib/status/project-view.ts`), and the backend reads that blob for the content and its digest.
        - A work unit is read from one copy: its companions and task list are read beside the meta copy its read returns
          — this checkout's where it holds the selected copy or an agreeing one, else the selected copy on its branch,
          found by today's matcher over that copy's directory in the branch's tree, read-only and live. No reader reads
          a companion from another branch today, so this path is new; a parked work unit's are read beside its pointer,
          which park writes into the planned folder where a stub left on base after start keeps its companions, so they
          are the stub's from before start, as today's readers on base read them. The task list is read at its address,
          `tasks-<slug>.md` beside the meta copy, never through the meta's `Task List` field, which today's readers
          resolve (`resolveTaskListPath`, `commands/active/status.ts`); where no file is there, a read is `not-found`.
        - Build `test-first` (one behavior at a time):
            - a record only on another branch lists and reads, live;
            - where a record has a tree copy other than a flat-active one and a copy on another branch, reads return the
              copy today's composition selects, the branch's over a backlog copy that disagrees with it, as a stub left
              on base after start does;
            - a parked work unit's read returns its backlog pointer's bytes and version, as abandon reads the meta at
              today's writable path, though the pointer's progress fields differ from the branch copy's, while its
              listing gives the branch copy's fields with the pointer's version, and a write built on that listing
              lands;
            - a listing runs no fetch and makes no network call, and a branch pushed from another clone lists once a
              fetch has updated its remote-tracking ref;
            - a recorded Errand branch is never reported as residue: with `arc.identity` set, as `arc status` reports
              none for it, and with only `user.name` set, where `arc status` reports it;
            - a work unit's draft and task list read from its branch beside the selected meta when this checkout holds
              no copy, and from the branch rather than beside a stub on base that disagrees with the selected copy,
              while an agreeing copy's are read from this checkout's tree;
            - a task list is read at its address whatever the meta's `Task List` field names, and a read is
              `not-found` where no file is there.

    - `[ ]` **4.3.c Candidate records, transition records, and other companions**
        - Build `test-first` (one behavior at a time), each differential against today's reader:
            - a Candidate record read through the contract equals the Candidate store's read;
            - a transition record read through the contract equals today's reader's;
            - another companion — a `<prefix>-<slug>.md` file beside the meta that no address kind names, and a paired
              spec's two halves — lists with its work unit and reads byte for byte, found as Task 1.5.b records, while
              a same-name `cohort-<slug>.md` beside it does not;
            - each record's version is its content digest;
            - a stored Candidate record whose key names another work unit lists as a `key-mismatch` diagnostic, and a
              read of it refuses `identity-mismatch` naming both, where today's store read throws.

### `[ ]` **4.4 Tracked writes and batches — D3, D8**

- _Goal:_ Writes to tracked records through the contract produce the bytes today's writers produce, compare-and-swap
  on content digests under the checkout's tracked-write lock (Task 4.2.a), apply a batch all or nothing with every
  record restored on failure, and leave the Git index as they found it.

    - `[ ]` **4.4.a Single writes**
        - A Candidate, boundary, or transition record is written through today's store — `writeCandidateRecord`,
          `writeSubmissionBoundary`, or `writeTransitionRecord`. The backend first parses the content as JSON and
          validates it with the parser that store applies — `CandidateManagedRecordV1Schema`,
          `parseIntegrationBoundaryLocus` (`scripts/review-gate/policy/integration-boundary-locus.ts`, which also
          accepts and upgrades a legacy boundary shape), or `TransitionRecordSchema`, exported from
          `lib/work-unit/transition-record.ts` for it, since `parseTransitionRecord` returns `null` and loses the
          failing rule — before any version check: content that fails refuses `record-malformed` naming the failing
          rule, whatever version it expects, and content whose own key — `attestation.workUnit`, `workUnit`, or `origin`
          — names another record than the write does refuses `identity-mismatch`, naming both, since the boundary and
          transition stores take the file's path from that key and the Candidate store never checks it.
        - The store then writes inside the tracked-write lock, the Candidate and boundary stores under their own
          per-file locks and the transition store by exclusive create (`flag: "wx"`, no lock). The version returned is
          the digest (`digestBytes`) of the bytes the store's own serializer gives for the validated record —
          `serializeCandidateManagedRecord`, `canonicalize`, or `serializeTransitionRecord` — computed, never re-read,
          since today's stores return a path or nothing. Anything the store throws after that comes from the stored
          record or the version: a stored record its own read rejects — malformed, or naming another work unit — throws
          the store's error as an `ArcError` (D4). A meta, companion, or task list is written as its bytes, unvalidated,
          as today.
        - Today's stores report a stale version as `CandidateRecordVersionConflictError` and
          `SubmissionBoundaryVersionConflictError`, and the transition store's create-only write as `EEXIST`; the
          backend maps each to `version-conflict` by its class or code.
        - A transition record is created once and never updated, by lineage's create-only writer rule (Task 1.5.b): a
          second creation refuses `version-conflict` naming the existing record, and its remedy is to read that record.
          The verb that created one removes it when its transition fails, as `rollbackRecord`
          (`lib/work-unit/terminal-transition-record-writer.ts`) does for abandon and decompose today.
        - A write that creates a work item writes its meta at its placement's path (`resolveArcPath`): flat in
          `active/`, or in the backlog in its commitment's folder under the cohort folder its `Cohort` field names —
          none where the field is empty, `[none]`, or `—`, as the lifecycle index reads it for
          `projectBacklogDestination` today, else one level or two — read through `parseMetaProjectionRecord`
          (`lib/active/meta-reader.ts`), as `projectBacklogDestination` (`lib/work-unit/verbs/promote-demote.ts`) builds
          a stub's folder today. A meta that projection cannot read, or a `Cohort` value the layout cannot place — more
          than two levels, or a segment that is not a slug — refuses `record-malformed` naming the field, before
          anything is written. A write to an existing work item keeps its placement.
        - A creation at `completed`, which archive does with its sequence; a write naming another placement, which moves
          the work item as today's lifecycle verbs do; and a rename, which names a UID the in-repo implementation has
          none of, each refuse `unsupported` (terminal) before writing anything, naming the verb that serves it until it
          is rerouted — archive, the lifecycle verbs, or `arc rename`. A write carrying a links value, an empty one
          included, refuses `unsupported` (terminal), since this implementation stores none and derives reverse lookup
          as today (Task 4.6).
        - Build `test-first` (one behavior at a time):
            - a write with the current digest writes the file and returns the new digest;
            - a Candidate record whose content its schema rejects refuses `record-malformed` naming the rule, with no
              file changed, also when its expected version is stale, and the corrected content lands; and a write over a
              stored Candidate record naming another work unit throws an `ArcError`;
            - a Candidate record, a boundary, and a transition record whose content names another work unit each refuse
              `identity-mismatch` naming both, with no file changed under either name, and the content naming the
              record written lands;
            - each store's write returns the digest a read of the written file then returns, a legacy-shaped boundary
              included;
            - a write creating a meta at `active` writes it flat in `active/`, and one at a backlog commitment writes it
              in the folder its commitment and `Cohort` field give — no cohort, whether empty, `[none]`, or `—`, one
              level, and two;
            - a creation whose `Cohort` the layout cannot place, or whose meta the field projection cannot read, refuses
              `record-malformed` naming the field, with no file written, and the corrected meta lands;
            - a creation at `completed`, a write naming another placement, and a rename each refuse `unsupported` naming
              its verb, and a write carrying a links value, an empty one included, refuses `unsupported`, each with no
              file changed;
            - a stale digest refuses `version-conflict`, also when racing writers produce it — one write lands and the
              other refuses — and a re-read and re-apply succeeds;
            - two racing creations of one transition record land one and refuse the other `version-conflict` naming
              it, and reading the record it names succeeds;
            - the bytes written equal today's writer's for a meta, a Candidate record, and a transition record;
            - a removal with the current digest deletes the file, as abandon and resume delete today, and a stale digest
              refuses `version-conflict` with the file in place;
            - a transition record created and then removed with its current digest, as a refused abandon rolls it back,
              leaves no file, and a later creation for the same origin lands;
            - a contract write leaves the index unchanged.

    - `[ ]` **4.4.b Batches within the tracked substrate**
        - Each record is checked against its current bytes, as the Candidate store checks today; on any failure every
          record already written is restored from the bytes captured before the batch, as start graduation restores its
          files (`lib/work-unit/atomic-graduation.ts`).
        - Build `test-first` (one behavior at a time):
            - a batch with one stale record writes nothing and names every stale record;
            - a write that fails midway restores every record already written;
            - a restore that itself fails throws an `ArcError` naming every file it left changed and the repair —
              inspect each with `git diff` and restore it by hand.

    - `[ ]` **4.4.c `checkout-not-writable`**
        - A write to a work unit's meta, companion, or task list — an update, a removal, or a creation — is admitted
          where the meta copy a read of the work unit returns is one this checkout holds: its flat-active meta, or a
          tree copy agreeing with the selected one. Everywhere else it refuses, naming where the selected copy lives —
          the worktree holding it where one does (`worktreePathBySlug`, `lib/work-unit/composed-lifecycle-index.ts`),
          else its branch, which a checkout of it can write. A companion or task list lands beside that copy, and a
          creation's absence is checked there, where its read looks.
        - A meta flat in `active/` is its own selected copy (Task 4.3.a), so a write to its work unit's records checks
          its content digest and no other copy's agreement, and composes nothing, whether or not its parser accepts it.
          A parked work unit's backlog pointer agrees with its selected copy, so a write to it, or its removal, checks
          the pointer's digest, as resume and abandon read and delete the pointer at today's writable path, and a write
          to the stub's files beside it is admitted as today, abandon removing them with the pointer (`artifactMatcher`
          over the pointer's folder, `verbs/abandon.ts`) while resume removes the pointer alone (`park-resume.ts`). A
          companion or task list of a work unit no read finds is `not-found`, its remedy creating the meta with it in
          one batch. A meta's creation is checked against this checkout's tree, as the lifecycle executor's create edge
          checks a new slug (`buildLifecycleIndex`, `lib/work-unit/lifecycle-executor.ts`), and a companion or task list
          created in the batch that creates its meta lands beside it. A write to a Candidate, boundary, or transition
          record, which are read from this checkout's tree alone, is admitted as today, the preflights below its only
          guard.
        - Admission reads the listing's composition (Task 4.3.a), not the one abandon, resume, and rename build with
          remote work units expanded live and `prospective` set (`handlers/lifecycle.ts`, `commands/rename.ts`): a work
          unit started from another clone and not yet fetched here is admitted or refused as the listing shows it, and
          one whose tree copy was moved from `active/` into the backlog on its own branch and not yet committed is
          checked against the committed copy and refused, naming the move's commit as its remedy, since the worktree
          holding the selected copy is this one.
        - Today's write-context preflights (`lib/git/write-context.ts`) map onto the refusal through one function the
          rerouted verbs call; no ordinary write runs a preflight.
        - Build `test-first` (one behavior at a time):
            - each case refuses with its remedy, and the write succeeds from the checkout the remedy names, or from a
              checkout of the branch it names where no worktree holds the selected copy, or once the commit it names
              lands;
            - a write for a work unit started from another clone and not yet fetched here refuses as the listing shows
              no agreeing copy here, and a write after a move from `active/` into the backlog on the work unit's own
              branch refuses naming the move's commit, and lands once it is committed;
            - a draft written for a work unit no read finds is `not-found`, and lands in a batch that creates its meta;
            - a meta created with its draft in one batch lands, while a write to a draft or task list beside a stub
              that disagrees with its selected copy refuses, naming the selected copy's branch, and lands from that
              branch's checkout;
            - creating a draft beside a stub that disagrees with its selected copy, and creating one for a work unit
              this checkout holds no copy of, each refuse, with no file written, and the same creation lands from the
              selected copy's checkout, where a read then returns it;
            - in a work unit's own checkout whose flat-active meta its parser rejects, a write to its task list lands
              with no composition run;
            - a parked work unit's pointer and the stub's draft start left beside it are removed in one batch, as
              abandon removes them, and a draft written beside the pointer lands;
            - a parked work unit's pointer is written and removed against the version its read returns, after which a
              read returns its branch copy and the listing of this checkout's records no longer gives it;
            - each preflight refusal maps onto `checkout-not-writable` with the landing place it names today.

### `[ ]` **4.5 State version, history, and changes over the branch — D2, D8**

- _Goal:_ Over tracked records the state version is the branch tip, reads and lists as of a version read that commit's
  tree alone by the rules the listing of this checkout's records runs by over the working tree, `changes` reports the
  records whose files differ between two commits, and `history` walks the branch's commits with their messages, while
  records outside the state version refuse `unsupported`.

    - Build `test-first` (one behavior at a time):
        - `version` returns `HEAD`, and moves only when a commit lands;
        - a read as of a version returns the bytes at that commit, an uncommitted edit excluded;
        - a listing as of a version keeps the copies the listing of this checkout's records keeps over that commit's
          tree, never another branch's — a stub left on base after start lists as the stub, where the working tree's
          composed listing gives its branch copy — with a rejected flat-active meta beside a completed copy and a meta
          under an uppercase quarter each as a diagnostic;
        - a listing as of a version carries that version, and a live listing carries none;
        - `changes` between two commits names the records whose files changed, restricted when asked, with the commits'
          messages;
        - `history` of a meta returns its commits newest first with their messages;
        - `history` of a renamed meta follows the file across the rename, as `git log --follow` does;
        - a read as of a version, or `changes`, for another branch's record refuses `unsupported` (recoverable), naming
          per-record versions as the remedy, and a check of the record's own version then succeeds, while one for a
          record no branch holds is `not-found`.

### `[ ]` **4.6 Lookup through today's derivations — D3, D8**

- _Goal:_ `lookup` over tracked records resolves a slug, a former slug through today's transition record, a lineage
  origin, a work unit's checkout claim, and a commit or ref through today's derivations, so reverse lookup answers as
  today before captures exist.

    - An Errand's or a claim's checkout claim, and a ref resolving to its Errand, join with the transient-identity arm
      in Task 7.2.
    - A commit's `Context:` footer parses through `parseTaskReference` (`lib/commit-check/task-reference.ts`), and a
      range expands against the work unit's task list as `expandTaskReference` (`lib/delivery/from-branch.ts`) expands
      it, falling back to its endpoints where either is missing; the expansion moves beside the parser, so delivery's
      attribution and the in-repo implementation share it.
    - Build `test-first` (one behavior at a time):
        - a slug resolves to its work unit, and a former slug to the renamed one;
        - a lineage origin resolves to the decomposed or abandoned origin's transition record;
        - a work unit's checkout claim resolves to its meta;
        - a commit resolves to its work unit and every task its `Context:` footer names, two included and a range
          expanded against the task list, through that footer, and a ref to its work unit through the branch name;
        - `not-found` and `ambiguous-match` carry their remedies.

### `[ ]` **4.7 In-repo conformance over the tracked families — D7**

- _Goal:_ The conformance suite passes against the in-repo implementation over the tracked families, with version
  conflicts produced by racing writers, so the tracked arm meets the reference backend's assertions before the shared
  caller pieces build on it.

    - `[ ]` **4.7.a The in-repo conformance fixture**
        - Over a temporary repository (`createTempRepo`, `__tests__/helpers/integration.ts`), serving the tracked
          families; `settle` commits as a ceremony would, `race` runs two writers against one record, and `identity`
          builds the contract with its identity dependency resolving none. It runs in the integration lane; the personal
          and transient-identity families join it in Task 7.4.
        - Its fault hooks plant a bad record file, hold the checkout's tracked-write lock, and produce and repair each
          in-repo refusal — `record-malformed` by a Candidate record whose content its schema rejects, and
          `identity-mismatch` by one whose content names another work unit, each repaired by a valid write (Task 4.4.a).
          Its `content` hook gives a Candidate record, a boundary, or a transition record whose key is the identity
          written, and any bytes for a meta, companion, or task list, with no rejecting variant for those three. It
          declares its capability report's answer, no (Task 4.2.c), that its live listings carry no state version (Task
          4.5), and what the tracked families cannot produce, each with its reason, and the list is complete:
            - a newer format version (item 10), since every record reads version 1 until the ref backend writes one;
            - `sync` (item 16), which never covers tracked records;
            - `not-found`'s no-identity case (Task 3.6.b), since no tracked record is identity-scope; it runs from Task
              7.4;
            - a created record's UID (item 1), since a tracked record keys by its slug and carries no UID before the
              flip (D2);
            - a rename (its assertions in items 1, 11, and 12), a move to another placement, and a creation at
              `completed` (item 1), which it refuses `unsupported` (Task 4.4.a), since `arc rename`, the lifecycle
              verbs, and archive keep their code until they are rerouted;
            - links (item 1) and `lookup` by a stored link — a captured commit or a branch link (item 12) — since the
              in-repo implementation stores none and refuses a write carrying a links value (Task 4.4.a); its
              derivations through `Context:` footers and branch names are tested in Task 4.6;
            - a batch's shared batch ID (item 4) and each write's own provenance in `changes` and `history` (items 7 and
              11), since a tracked record's history is the commits that carry it, whose messages it returns as they are
              (D3);
            - the `oversized` and unknown-format-version diagnostics, `key-mismatch` on a meta, companion, or task list,
              and the `unreadable` family outcome (item 9), since today's tracked readers cap no size, a meta's identity
              is its filename with no key inside to disagree, every record reads format version 1 until the ref backend
              writes one, and the lifecycle walk reads a directory it cannot open as empty;
            - content a meta's, companion's, or task list's validation rejects (the `content` hook's rejecting variant),
              since the in-repo backend validates none of them at write (D8);
            - `namespace-corrupt` (item 14), since the tracked substrate is the working tree, whose walk reads a
              directory it cannot open as empty;
            - `unsupported`'s held-here case (item 12), since it answers the filter (Task 4.3.a).

    - `[ ]` **4.7.b The suite over the tracked families**
        - Every item and assertion the fixture's declarations admit passes over the tracked families, and each excluded
          item, assertion, and refusal is reported by name with its reason.

## **Phase 5:** Shared caller pieces

_Purpose:_ The current-work-unit resolver, the lifecycle index keyed by identity, and the store behind the
integration checkpoint's lifecycle port, landed over the contract and serving their existing call sites unchanged,
so parallel rerouting work shares nothing but the landed contract. The index is proven here on one caller; Phase 6
covers the rest. Reviewable as one chunk; its seam with Phase 6 is the index's query surface.

_Exit criterion:_ `resolveActiveWu`, `readActiveMetaCandidates`, and `resolveCurrentWuSlug` delegate to the resolver,
and the checkpoint and merge compositions default to the new store, with every existing test passing unchanged; the
identity-keyed index answers the pilot caller's query with the records and fields that caller's path read returns.

### `[ ]` **5.1 Current-work-unit resolver and its three delegates — D9**

- _Goal:_ One resolver answers which work unit this checkout holds, by identity, with the answers `resolveActiveWu`,
  `readActiveMetaCandidates`, and `resolveCurrentWuSlug` give today and the candidates the one-work-unit-per-worktree
  guard checks, a symbolic link to a meta aside, and those three become delegates over it with their call sites served
  unchanged.

    - `[ ]` **5.1.a The resolver**
        - It returns each candidate's identity — with its parsed meta record where the meta's parser accepts it, and its
          listing diagnostic where it does not — resolved, none, and ambiguous kept distinct. It lists metas at `active`
          with the held-here filter. Over the in-repo implementation that resolves as today: the metas in the checkout's
          flat `active/`, whatever their `State`, read from the checkout's working tree (Task 4.3) with no Git process
          (Task 4.2.b). They are regular files only, as the lifecycle walk takes them, so a symbolic link to a meta,
          which today's reader follows with `stat`, is no candidate (`notes-storage-contract.md` § Implementation
          pointers, one tree walk). A meta `parseMetaRecord` rejects — a hand-written `[TBD]` or `—` in `Design` or
          `Depends On` — is still a candidate, as today's reader keeps it, while one it cannot read, or whose content
          `parseMetaFile` cannot parse — a malformed core table — is a warning and no candidate, as today's reader drops
          it (`parseCandidate`). It never reads another branch, so session-init and the release commands keep today's
          cost.
        - On a backend whose state lives off the checkout's branch the held-here filter refuses `unsupported`
          (recoverable), and the resolver takes its remedy: it reads the checkout's marker (`readWorktreeMarker`,
          `lib/git/worktree-marker.ts`), which reads a file and runs no Git, and, where the marker names a work unit and
          carries no husk stamp, resolves its claim through `lookup` and keeps the work unit only where a read of its
          primary record gives placement `active`, as the in-repo arm lists metas at `active` alone. It finds none where
          the marker is absent, names no work unit — an Errand, a grooming or housekeeping claim, or a branch — or is
          husked — as teardown leaves a checkout whose work unit shipped, was abandoned, or was parked — or where the
          work unit is no longer in flight, including where `lookup` or the read refuses `not-found` because this
          machine no longer holds its record, as after it was abandoned or decomposed elsewhere, just as the in-repo arm
          finds none where no meta sits at `active`; and none with a warning where the marker is malformed or either
          refuses otherwise. So the resolver runs unchanged across the flip, without the flat read of `active/` that the
          projection's `active/current/` layout (D13) would not satisfy; see `notes-storage-contract.md` §
          Implementation pointers (the checkout's marker).
        - Two reads stay with today's reader. The lite layout's `status.md` has no slug, so no identity and no layout
          address. The contributor root under `.arc/user/<identity>/active/`, which `arc status` reads for a
          contributor (`commands/active/status.ts`), is the contributor's separate layout, which retires (D14), so the
          contract never carries it.
        - Build `test-first` (one behavior at a time): one case per layout and per outcome, each matching today's
          functions over the same checkout, a meta `parseMetaRecord` rejects, an unreadable meta, and one with a
          malformed core table among them, a symbolic link to a meta that is no candidate, and a directory that is not a
          Git repository resolving as today with no Git process spawned; and, over the reference backend, whose
          held-here filter refuses, the work unit the checkout's marker claims resolved through `lookup`; none where the
          marker is absent, names an Errand, or carries a husk stamp, or where the work unit it names is archived,
          parked, or abandoned, its records removed; and none with a warning where the marker is malformed, `lookup`
          refuses `ambiguous-match` through the fixture's `produce` hook, or the read of its primary record refuses
          `identity-mismatch`, planted through its `plant` hook.

    - `[ ]` **5.1.b The delegates**
        - `readActiveMetaCandidates` (`lib/active/meta-reader.ts`) delegates to the resolver for which metas the
          checkout holds and renders today's result from them: it reads each candidate's content through the contract's
          `read`, which returns it whether or not the meta's parser accepts it, and builds today's candidate with
          `parseMetaFile`, each candidate's path through the layout resolver's `active` placement, and each read
          diagnostic as today's warning text. The resolver's parsed record does not serve here: `parseMetaRecord` turns
          `[none]` and `—` into null and `[TBD]` into `TBD`, while `parseMetaFile` keeps them as written, and today's
          consumers compare them so (`commands/active/status.ts`, `resolveActiveWu`'s `branch`). Its lite `status.md`
          branch runs ahead of the resolver, as it runs ahead of the scan today, and a caller-supplied root other than
          `.arc/active` — the contributor root — keeps today's scan. `resolveActiveWu` always passes a root, the default
          one when its caller names none (`lib/release/wu-resolution.ts`), so the test is the root's value, never
          whether one was passed. It loads the resolver on first call, with a dynamic `import()`, so importing
          `meta-reader.ts`, which the lifecycle index and the composition the in-repo backend wraps import, loads no
          `lib/store/` module and closes no import cycle.
        - Build `test-first`: a meta whose fields hold `[none]`, `[none associated]`, `—`, and `[TBD]` — in `Design` and
          `Depends On` too, where `parseMetaRecord` rejects them — renders the candidate today's reader renders, field
          for field; and a loading test that reads imports as `cli-loading-boundary.test.ts` does finds no static import
          of a `lib/store/` module in `meta-reader.ts`.
        - `resolveActiveWu` (`lib/release/wu-resolution.ts`), `resolveCurrentWuSlug` (`handlers/lifecycle.ts`), and
          the occupancy guard (`makeWorktreeOccupancyGuard`, `lib/work-unit/lifecycle-guards.ts`) already compose over
          `readActiveMetaCandidates`, so they follow it; every existing test passes unchanged.

### `[ ]` **5.2 Lifecycle index keyed by identity, proven on one caller — D9**

- _Goal:_ A lifecycle index keyed by identity lists work units with their parsed meta fields, never a path, answers
  `lookup` for lineage by slug and in-flight work by checkout claim, and returns, for one existing caller's query, the
  records and fields that caller's path read returns.

    - `[ ]` **5.2.a The index**
        - Composed from the contract's meta listing, which `resolveComposedLifecycleIndex` answers in-repo, keeping each
          work unit's selected copy with its fields and placement; this checkout's own copy comes from the held-here
          listing below. From the two listings the index answers whether this checkout's copy is the selected one — its
          slug, `State`, `Owner`, `Priority`, `Cohort`, `Depends On`, and placement agreeing with the selected copy's,
          the fields today's composition compares to grant a writable path (`recordsAgree`,
          `lib/work-unit/composed-lifecycle-index.ts`), placement standing for its location and parked scheduling,
          never every parsed field — for callers that read that today:
          `arc status <slug>`'s operational read, abandon's read of the meta in the verb and in its handler, resume's
          check, rename's write authority, and transform coordination's partition of dependents. A parked work unit's
          backlog pointer agrees with its selected copy, both carrying its backlog placement (Task 4.3.a). A caller that
          needs the copy's path takes it from its placement through the layout resolver, as Task 5.3.a's adapter does.
          Write admission stays the backend's, answered by a write's `checkout-not-writable` (Task 4.4.c), never an
          index field.
        - Both answers that rest on `list`'s held-here filter — whether this checkout's copy is the selected one, and
          this checkout's records alone (below) — are the in-repo implementation's bridge for callers of today's
          tree-only index and writable path, and retire with it: on a backend whose state lives off the checkout's
          branch each refuses as the filter does, and a caller rerouted onto either branches on the capability (D15).
        - Given a state version, it lists as of that version through the contract's `list`: over the in-repo
          implementation, a commit on this checkout's branch, read through the in-repo backend's tree reader at it.
        - It also lists this checkout's records alone, through `list`'s held-here filter over every location — over the
          in-repo implementation, the lifecycle walk with the copy Task 4.3.a keeps — dropping a meta it cannot place,
          as `entryFromMeta` does, so callers of today's tree-only index compare like for like but for two metas: a
          flat-active meta it cannot place beside another copy of its slug, which the listing keeps and so the index
          drops, where `buildLifecycleIndex` keeps the other copy; and a meta at a path the layout cannot place, which
          the listing gives as a diagnostic, where `buildLifecycleIndex` places it by its tier.
        - Build `test-first` (one behavior at a time):
            - a backlog, an active, a completed, and an in-flight work unit each list with the fields today's path
              reads give;
            - listed as of `HEAD`, the index gives what today's composition gives over the tree at `HEAD`, but for the
              two metas it drops there too, and a working-tree edit made after it reaches neither;
            - listing this checkout's records alone gives what `buildLifecycleIndex` gives over the same checkout, a
              meta whose `State` places it nowhere absent from both, and a slug whose planned copy cannot be placed at
              its completed copy in both, while a slug whose flat-active copy cannot be placed, beside a completed copy,
              is absent from the index and at its completed copy in `buildLifecycleIndex`, as a meta flat in
              `backlog/planned/` is absent from the index and at `planned` there;
            - whether this checkout's copy is the selected one matches whether today's composed index grants a writable
              path, over a work unit whose tree copy is selected, one selected on another branch, one whose tree copy
              disagrees with the selected copy, and a parked work unit, whose backlog pointer agrees, and the path from
              its placement is the writable path;
            - lineage by slug and in-flight work by checkout claim resolve;
            - over the reference backend, whether this checkout's copy is the selected one and this checkout's records
              alone each refuse `unsupported`, as the filter does.

    - `[ ]` **5.2.b The pilot caller**
        - `arc view`'s resolution (`handlers/view.ts`), which parses the meta at an index entry's path and is
          read-only: a differential test shows, for each of its queries, the identity-keyed index returning the same
          records and fields. The caller keeps its code, and heads the enumeration Task 6.1 records.

### `[ ]` **5.3 Store behind the integration checkpoint's lifecycle port — D9**

- _Goal:_ The checkpoint's and merge composition's default lifecycle storage is the new store — its version the
  contract's `version`, its file reads the contract's reads as of that version through the layout resolver — and it
  answers as today's default ports do in the lifecycle summary, but for the two metas the index drops (Task 5.2.a),
  which its summary omits where they give an unplaceable meta at its tier and a rejected flat-active meta's slug at its
  other copy.

    - `[ ]` **5.3.a The port over the store**
        - `IntegrationLifecycleStoragePort.readSnapshot()` (`scripts/integration/checkpoint-composition.ts`) returns
          `{ version, fs }` from the store: `version` is the contract's `version` — `HEAD` over the in-repo
          implementation — and `fs` is an adapter in `lib/store/` over the contract's `read` and `list` as of that
          version. The port's `fs` lists directories as well as reading files — it is `resolveComposedLifecycleIndex`'s
          reader (`ProjectViewFs`) — so the adapter maps a path to a record through the layout resolver's reverse,
          `identifyWorkUnitArtifactPath` (`lib/layout/identification.ts`), and each listed work item back to its path
          through `resolveArcPath`, from the placement its listing carries and, in the backlog, the cohort folder its
          `Cohort` field gives, as a creation's path is built (Task 4.4.a). No caller reaches a backend's tree reader.
        - The adapter lists only what records give it — no README, no index file, no archive folder without a meta, and
          no meta the layout cannot place (Task 4.3.a) — and, for a slug held in two locations, only its selected copy,
          so its directory listings are not the tree's.
        - Build `test-first`: a differential test, which today's default ports lack, shows the store's snapshot and
          today's default, `createGitTreeReadFs` (`scripts/review-gate/hosts/local/git-tree-fs.ts`) at `HEAD`, returning
          the same version, the same lifecycle summary for each work unit (`readLifecycleSummary`, which builds the
          composed lifecycle index over the port's `fs` and reads the meta it finds), and the same bytes for every file
          that summary reads, but for a work unit whose meta sits under an uppercase quarter, which the store's summary
          omits and today's gives at `completed`, and one whose flat-active meta its parser rejects beside a completed
          copy, which the store's summary omits and today's gives at `completed`.

    - `[ ]` **5.3.b The defaults become the store**
        - The defaults in `checkpoint-composition.ts` and `merge-composition.ts` construct the store; the checkpoint and
          merge tests pass unchanged.

### `[ ]` **5.4 Shared pieces served end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds as one exercised scenario: production callers are served through the
  contract over today's tracked records, with no change in behavior.

    - Run the three delegates' tests, the checkpoint and merge tests, the pilot differential, and the in-repo
      conformance run together at the segment's head, and record the scenario and its result.

## **Phase 6:** The lifecycle index across its existing callers

_Purpose:_ Every existing caller that reads the meta through an index entry's path in this checkout, enumerated and
held by a differential test to the identity-keyed index returning the same records and fields for each of its queries.
The callers keep their code until rerouted. Reviewable as one chunk: tests only, beside the index they exercise.

_Mode:_ `replication` — closes when the enumerated caller set is exhausted and batch-verified.

_Exit criterion:_ Every caller in the enumerated set has a passing differential test for each of its queries, and the
enumeration is re-derived against the tree at the phase's close.

### `[ ]` **6.1 Enumerate the index-path callers and their queries — D9**

- _Goal:_ Every existing caller that reads the meta through an index entry's path is enumerated with each of its
  queries and assigned to a batch, so the replication has a closed surface whose exhaustion can be checked.

- **Additional Context:** `notes-storage-contract.md` § Lifecycle and in-flight (128)

    - Search `src/` for the callers of every lifecycle index builder — `buildLifecycleIndex`,
      `buildLifecycleIndexFromMetas`, `buildLifecycleIndexFromRecords`, and `resolveComposedLifecycleIndex` — and for
      every read of an entry's `path` from what they return. Record each caller, its queries (which records, which
      fields, read from where), and its batch (Task 6.2 or 6.3) in `notes-storage-contract.md` § Index-path callers,
      with the commit it was derived at. The design expects at least ten.
    - A read of the composed index's writable path or current-tree copy (`writablePath`, `currentTree`) is recorded as
      the question whether this checkout's copy is the selected one (Task 5.2.a), with the path from its placement where
      the caller uses one; `handlers/status.ts`, abandon in `handlers/lifecycle.ts` and
      `lib/work-unit/verbs/abandon.ts`, `lib/work-unit/verbs/park-resume.ts`, `commands/rename.ts`, and
      `lib/work-unit/transform-coordination.ts` read it today. Decomposition's writable path
      (`lib/work-unit/decompose-v3-conservation.ts`) is a meta's path in the result base's tree, read by `readTreeMetas`
      (`lib/work-unit/decompose-v3-repository-tree.ts`) rather than through any index, so it is no caller here.
    - Each query reads one of three places, and the record names it: the working tree; a commit on this checkout's
      branch, which is a state version, as the integration checkpoint reads at `HEAD`; or another branch's tree at a
      named commit, as teardown's retirement authorization reads a parked work unit's head and base. The third kind is
      a branch-tree reader, recorded with its consumer-map row and left out of the set: the in-repo implementation reads
      other branches' records live and refuses reads of them as of a version (D8).

### `[ ]` **6.2 Differential batch: lifecycle verbs — D9**

- _Goal:_ For every enumerated lifecycle-verb caller, and for each of its queries, a differential test shows the
  identity-keyed index returning the same records and fields as the caller's path read over the same repository.

    - One test per caller over a repository arranged to exercise each query, reading the index where the query reads:
      the working tree, or as of the state version the query reads at. A caller of `buildLifecycleIndex` compares with
      the index's listing of this checkout's records alone.
    - A divergence is fixed in the index, never by loosening the comparison, and the caller keeps its code. A
      flat-active meta its parser rejects, beside another copy of its slug, and a meta at a path the layout cannot place
      are the two designed differences (Tasks 4.3.a and 5.2.a), asserted there, never divergences to fix here.

### `[ ]` **6.3 Differential batch: integration, status, view, reconcile, teardown, and retirement — D9**

- _Goal:_ For every enumerated caller in integration, status, view, reconcile, teardown, and retirement, and for each
  of its queries, a differential test shows the identity-keyed index returning the same records and fields as the
  caller's path read over the same repository.

    - One test per caller, as in Task 6.2.

### `[ ]` **6.4 Index callers exhausted** — validate exit criterion at segment scope

- _Goal:_ The enumerated caller set is exhausted and batch-verified: every caller has a passing differential for each
  of its queries, and a fresh enumeration at the phase's close finds no caller the record lacks.

    - Re-run Task 6.1's search at the phase's head and compare it with the recorded enumeration; record the scenario
      and its result.

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

### `[ ]` **7.1 Personal files: lock-free reads and compare-and-swap writes — D5, D8**

- _Goal:_ Personal files read and write through the contract where they live, each file one record, with the whole-file
  content digest as its version and compare-and-swap basis and writes under today's notes lock, returning the bytes
  today's readers read and writing the bytes today's writers write, for a `USER-INBOX` file and a `SESSION-NOTES` file.

    - `[ ]` **7.1.a Reads and listings**
        - Reads and listings take no lock, as today's readers take none: a contract write replaces a file atomically
          (Task 7.1.b), so a read sees the old bytes or the new, never a part. A read never waits on a notes push,
          which holds the notes lock across `git fetch` (`reconcileAndRepush`, `commands/user/push-fetch.ts`). The
          machine-local set is never listed, by today's two dot-prefix rules.
        - Each file is read from the root today's code reads it from (`createUserSurfaceResolver`,
          `lib/user-surfaces.ts`): a `SESSION-NOTES` file from this checkout's per-work-unit workspace, by its work
          unit, at its `session-notes` address (Task 1.5.b), as is any other file in that workspace; `USER-INBOX`,
          `WORKING-MEMORY`, and the other files at the identity's top level from the identity-global root
          `resolveUserSurfaceResolver` selects, the primary worktree's.
        - Build `test-first` (one behavior at a time), each differential against today's reader:
            - a `USER-INBOX` file reads byte for byte, and today's entry parser (`parseCrossWuEntries`,
              `lib/user-sync/parser.ts`) over the bytes read gives the entries today's reader gives;
            - a `SESSION-NOTES` file reads byte for byte;
            - a personal document reads byte for byte by its path under the identity's root;
            - from a linked worktree, `SESSION-NOTES` reads that checkout's file and `USER-INBOX` the primary's;
            - a read and a listing return at once while another process holds the notes lock;
            - with no identity configured, a listing is `absent`, and a read and a write each refuse `not-found` saying
              no identity is configured and naming `arc.identity` as its remedy; once it is set, the same read and write
              succeed;
            - a missing file is `not-found`.

    - `[ ]` **7.1.b Compare-and-swap writes**
        - A write replaces the whole file. The caller computes the new content with today's writer — the inbox writer's
          transforms (`lib/user-sync/inbox-writer.ts`) for an entry change — so finding an entry by its title, and any
          content today's writer rejects, stay with the caller, and the backend never parses the file.
        - Under the lock `getNotesLockPath` names, acquired through `acquireAdvisoryLock` (`lib/advisory-lock.ts`), the
          write checks the digest — new, since no personal writer checks one today — and replaces the file atomically
          (`atomicWriteFile`, `lib/fs.ts`), as the inbox mutation does today (`commands/user/inbox-mutation.ts`).
        - Build `test-first` (one behavior at a time):
            - a write with the current digest writes the content and returns the new digest, and for an inbox entry
              change the file's bytes equal the inbox writer's for the same change;
            - a `SESSION-NOTES` file written with the seed `runUserOpen` (`commands/user/open.ts`) writes has the bytes
              it leaves today;
            - a stale digest refuses `version-conflict`, also from racing writers, and a re-read and re-apply succeeds;
            - a removal with the current digest deletes the file under the lock, as workspace close deletes today;
            - a lock held past the wait refuses `lock-held`, classified by error class, and the write succeeds once the
              lock is released;
            - `history` of a personal file refuses `unsupported` (terminal), and a read as of a version `unsupported`
              (recoverable).

    - `[ ]` **7.1.c Batches of personal files**
        - Under one hold of the notes lock, every file's digest is checked before any is replaced; then each is replaced
          atomically, and on any failure every file already replaced is restored from the bytes captured before the
          batch, as tracked batches restore (Task 4.4.b). A removal in the batch is restored by rewriting its bytes.
        - Build `test-first` (one behavior at a time):
            - a batch with one stale file writes nothing and names every stale file;
            - a batch that fails midway restores every file already written or removed;
            - a restore that itself fails throws an `ArcError` naming every file it left changed, as a failed tracked
              restore does.

### `[ ]` **7.2 Transient-identity records: snapshot reads and transactional writes — D4, D8**

- _Goal:_ Errand records and grooming and housekeeping claims read through the identity snapshot and write through
  today's transaction, keeping the absent, `error`, and complete outcomes and the blob object ID as each record's
  version, with every transaction outcome mapped onto a typed result, so their reads and writes through the contract
  match today's code paths.

- _Note:_ No production code writes a grooming or housekeeping claim today — `groomClaimTransform` and
  `housekeepClaimTransform` (`lib/errand/identity-claims.ts`) have no caller — so fixtures write claims through them.

    - `[ ]` **7.2.a Snapshot reads and listings**
        - Through `lib/errand/identity-snapshot.ts`'s tip, tree, and blob acquisition over this person's local ref
          (`readTransientIdentitySnapshot`), which keeps each record's blob object ID; the Errand record kind's parser
          is its existing schema (`lib/errand/identity-record.ts`).
        - `read` and `list` never fetch: the local ref is current as of this machine's last write or sync, since the
          write transaction and `sync` fetch (D1: a verb confirms from the local store). `lib/errand/record.ts`'s
          fetched variant serves neither, since its projection drops the blob object IDs and it falls back to the
          local read when the remote is unavailable.
        - One ref holds both families: a listing keeps the records the registry assigns to the family listed, by kind
          and purpose (Task 1.5.b).
        - Each Errand record lists and reads with placement `active`, since close removes it from the ref; a grooming or
          housekeeping claim is no work item and carries none.
        - A read of a key whose entry names another slug — the snapshot's `key-mismatch` diagnostic
          (`deserializeTransientIdentityRecord`, `lib/errand/identity-record.ts`) — refuses `identity-mismatch`, naming
          the key and the slug, with the hand repair that rewrites the entry as its remedy; a write to the ref refuses
          `record-malformed` naming it, as for any entry the transaction's basis rejects (Task 7.2.b). A read of an
          entry the snapshot finds malformed or of an unknown version returns its bytes, read by its blob object ID,
          since a read returns bytes whatever the parser says (D5). Today's `unknown-version` names the entry's own
          content version (`version` other than 3, `lib/errand/identity-record.ts`), not a format version, so a listing
          gives it as a `malformed` diagnostic naming that version; one over the snapshot's size cap
          (`MAX_LOCUS_JSON_BYTES`), whose bytes the snapshot does not keep, refuses `record-malformed` naming its size
          and the cap, with the hand repair as its remedy; and one whose blob cannot be read throws an `ArcError`
          carrying the failure. Any operation but a listing over a ref whose tip or tree cannot be read — the snapshot's
          `error`, which tells a broken structure from a Git failure only by its message — throws an `ArcError` carrying
          it, as D4 throws what it cannot classify.
        - Build `test-first` (one behavior at a time), each differential against today's snapshot over the same ref:
            - absent, `error`, and complete match today's outcomes;
            - an Errand listing omits grooming and housekeeping claims, and a claims listing omits Errand records;
            - a complete listing carries today's per-entry diagnostics, an entry of another content version among
              them as a `malformed` diagnostic naming that version;
            - each record's version is its blob object ID, never the ref's tip;
            - a read and a listing run no fetch, and a record another clone pushed reads once a write or `sync` has
              fetched it;
            - each Errand record lists and reads with placement `active`, and a claim with none;
            - a read of a key-mismatched entry refuses `identity-mismatch` naming both, and succeeds once the entry is
              rewritten;
            - a read of a malformed entry and of one with an unknown version each return the entry's bytes, and a read
              of an oversized entry refuses `record-malformed` naming its size and the cap, and succeeds once the entry
              is rewritten within it;
            - a read over a ref whose tree cannot be read throws an `ArcError`, while its listing is `unreadable`;
            - with no identity configured, a listing is `absent`, as today, and a read and a write each refuse
              `not-found` saying no identity is configured and naming `arc.identity` as its remedy; once `arc.identity`
              is set, the same read succeeds.

    - `[ ]` **7.2.b Transactional writes**
        - Through `lib/errand/identity-transaction.ts`, the expected record version checked inside the transaction
          against the reconciled records: the transform also receives the basis's blob object IDs, which it does not
          see today, as an optional second parameter, so today's transforms and the test double that calls one
          (`__tests__/unit/errand/close-runtime.test.ts`) type-check unchanged.
        - A stale expected version is answered `idempotent`, carrying the stale records' names, and the backend reports
          `version-conflict` naming them. The transaction still lands the reconciled records without the caller's
          change: where they differ from the local ref's, it commits them over the local tip and pushes, as it does for
          any `idempotent` decision (`applyAndPublish`), so a change only the remote made reaches this machine's ref
          and a re-read through the snapshot sees it. A `refused` decision would return before that and leave the local
          ref stale, so no re-read could clear it.
        - The transaction's outcomes gain the detail the mapping needs, their kinds and messages unchanged so today's
          callers are untouched: the keys of diverged records and of unreadable entries as data, a fetch or push
          failure's cause — `unreachable`, `refused`, or `retries-exhausted` — set where Git fails, and whether a
          write-stage error is retries exhausted.
        - The transaction runs only with a remote the configuration names (the remote selection, Task 4.2.b), so a
          fetch or push failure that `isRemoteUnavailableError` (`lib/git/ref-tree.ts`) matches is `unreachable`: Git
          prints that text for a configured remote it cannot read, as for a missing one. Today's retry loop stays, and
          its last failure is classified: a non-fast-forward (`isNonFastForwardError`, as `reconcileErrandPush` splits a
          race today) is `retries-exhausted` with the attempt count; any other goes through `classifyRemoteFailure`
          (`lib/git/remote-ref-reader.ts`) — a network or authentication failure is `unreachable`, any other `refused`.
          Each `unreachable` carries `classifyRemoteFailure`'s reason. The backend measures the time waited with its
          injected clock.
        - Outcomes map by kind and that detail, never by message: a stale expected version or a record changed on both
          sides is `version-conflict`, an unreadable entry `record-malformed`, each naming its records, and a failed
          publish takes its cause.
        - A write placing an Errand record at `completed`, by creating it there or moving it, renaming one, or carrying
          a links value refuses `unsupported` (terminal) before writing anything, naming `arc errand close`, which
          closes an Errand by removing its record, for a placement, and nothing for a rename or links, since no verb
          renames an Errand today and the in-repo implementation stores no links (D3).
        - A write's content is decoded before the transaction runs, by `deserializeTransientIdentityRecord` with the key
          the write names (`lib/errand/identity-record.ts`), since today's transforms write only records its schema
          accepts (`serializeTransientIdentityRecord`): content it finds malformed or of another content version refuses
          `record-malformed`, and content naming another slug refuses `identity-mismatch`, naming both, so no write
          plants an entry that would refuse every later write to the ref.
        - The transaction's `error` at its write stage maps by the detail it gains: retries lost to a concurrent local
          update on every attempt are `retries-exhausted`, as a push's are; any other failure — a ref Git holds locked
          among them, since Git's ref lock refuses a concurrent update once its brief retry runs out
          (`core.filesRefLockTimeout`, 100 ms by default) — is thrown as an `ArcError` carrying the transaction's
          message (D4).
        - Build `test-first` (one behavior at a time):
            - the transaction's outcomes carry the diverged and unreadable keys and each failure's cause, with today's
              messages unchanged;
            - a push lost to contention on every attempt is `retries-exhausted` with its attempt count and time waited,
              and a host rejection on the last attempt `refused` with the server's message;
            - a write lands and returns the record's new blob object ID, and the blob it writes is byte for byte the one
              today's transform writes for the same record (`serializeTransientIdentityRecord`);
            - a removal drops the record from the ref, as close's transform does, and a stale expected version refuses
              `version-conflict` with the record in place;
            - a stale expected version refuses `version-conflict`, and a re-read and re-apply succeeds — on one clone,
              and across two (`__tests__/helpers/multi-clone.ts`) when the other clone changed the record and this
              clone's ref has not yet seen the change;
            - a record diverged between two clones refuses every write to the ref, naming it, and the hand repair the
              remedy names clears it;
            - with the remote's bare repository moved away, the write fails `unreachable`, and succeeds once it is moved
              back;
            - with no remote configured the write commits locally;
            - a write creating an Errand record at `completed`, one moving it there, one renaming it, and one carrying a
              links value, an empty one included, each refuse `unsupported` with the ref unchanged;
            - a write whose local ref update loses to another on every attempt is `retries-exhausted`, and one while Git
              holds the ref's lock past that retry throws an `ArcError`, never a refusal;
            - a write whose content is malformed, or names another slug, refuses `record-malformed` or
              `identity-mismatch` with the ref unchanged, and later writes to the ref still land.

    - `[ ]` **7.2.c History and lookup**
        - Build `test-first` (one behavior at a time):
            - `history` of an Errand record walks its ref's commits with their messages;
            - an Errand's or a claim's checkout claim resolves to its record;
            - a partial-protection Errand's claim is `not-found`, saying it keeps no record;
            - a ref resolves to its Errand through the record that names the branch;
            - with no identity configured, `history` of an Errand record, a lookup by an Errand's checkout claim, and a
              lookup by its branch each refuse `not-found` saying no identity is configured, and each succeeds once
              `arc.identity` is set.

### `[ ]` **7.3 Batches across substrates and in-repo sync — D3, D4, D8**

- _Goal:_ A batch spanning substrates refuses `unsupported` before anything is written, and contract `sync` covers
  personal files through today's notes save and push and transient-identity refs through their reconcile and push,
  reporting D4's outcomes with the in-repo additions while what `arc sync` does stays unchanged.

- **Additional Context:** `notes-storage-contract.md` § Implementation pointers (sync outcomes today; no remote read
  from configuration; the Errand push's two-way merge)

    - `[ ]` **7.3.a Cross-substrate batches**
        - Build `test-first`: a batch spanning tracked, personal, and transient-identity records refuses `unsupported`
          (recoverable) with no file, note, or ref changed, all three asserted, and the writes sequenced as the remedy
          names succeed.

    - `[ ]` **7.3.b In-repo sync**
        - Personal files sync through today's notes sync, save then push, as `arc sync` runs them when it pushes notes
          without the branch (`pushNotesLeg` in `handlers/sync.ts`): `runUserSave` (`commands/user/save-load.ts`)
          snapshots the files into today's note on `HEAD`, then `reconcileNotesPush` (`commands/user/push-fetch.ts`)
          pushes, and on a `history-diverged` refusal or a non-fast-forward fetches, merges the notes, and pushes again.
          Contract `sync` never pushes the branch, so `arc sync`'s paired path (`runPairedPush`), which pushes the
          branch and then a notes export bounded by it, stays `arc sync`'s own until the cutover removes it.
          Transient-identity refs sync through `reconcileErrandPush` (`lib/errand/merge.ts`). The notes push runs first,
          as `arc sync` runs it, and the Errand push runs whatever outcome the first returns, since they push
          independent refs; sync reports one outcome for each: the notes push's naming personal files, the Errand push's
          naming Errand records and claims. A throw is no outcome: a leg that throws — the notes save's failed readback,
          below, or anything D4 rethrows — ends sync there, so a notes leg that throws leaves the Errand push unrun,
          where `arc sync` records the save failed and still runs its Errand leg (`handlers/sync.ts`); the caller
          repairs the cause and syncs again. Each outcome they produce maps onto D4's as D4 states it: the notes push's
          `pushed`, `noop`, and `reconciled` as themselves, `no-local-notes` as `noop`, `conflict` and `blocked` as the
          in-repo outcomes, `refused` as the notes export's local refusal it names, and `no-remote` and `failed` as
          below.
        - A save that finds no eligible file ends `noop`, as `no-local-notes` does: the `UserSaveError` it throws gains
          a typed reason, its class and message unchanged, and only that reason ends `noop`. `UserSaveVerificationError`
          extends `UserSaveError` (`commands/user/types.ts`) and means the saved note failed its readback: the backend
          rethrows it as an `ArcError` with the original as its cause, as `arc sync` reports it failed.
        - With no identity configured — neither `arc.identity` nor `user.name` set — both pushes ride refs keyed by the
          identity, so sync reports `no-identity` once, naming `arc.identity` and the three families they carry —
          personal surfaces, work items for the Errand records, and claims — and runs neither the save nor either push,
          whether or not a remote is configured, as `arc sync` reports `identity-absent` before either leg today
          (`handlers/sync.ts`).
        - Whether `origin` is set is read from configuration before anything is pushed (the remote selection, Task
          4.2.b): with none, sync reports no remote as a state and calls neither push. A push or fetch that then fails
          maps as in Task 7.2.b, so today's `no-remote` from a configured remote is `unreachable`; whether a remote
          exists is never told apart by Git's message.
        - The Errand push's `failed` and the notes push's `failed` carry their cause as data, set where Git fails, their
          kinds and messages unchanged; the Errand push's exhausted attempts are `retries-exhausted`. A notes push
          `failed` with no Git cause — the notes lock not taken within its wait (`AdvisoryLockTimeoutError`), the
          compaction-lineage check unable to run, or a local error inside the push — is rethrown as an `ArcError` with
          the original as its cause (D4), as the save's own lock timeout already throws, so either leg's lock held past
          its wait ends sync before the Errand push.
        - Build `test-first`: one case per outcome today's save and two pushes produce, asserting the mapped outcome and
          its fields; with this clone's Errand ref ahead of the remote's, left by a transient write whose own push
          failed, so that an unchanged remote ref shows the Errand push never ran, a reconciling notes push whose lock
          seam (`ReconcileNotesLock`, `commands/user/push-fetch.ts`) times out, and one whose lineage check cannot run,
          each throw an `ArcError` with the remote's Errand ref unchanged, and a failed readback surfaces as a thrown
          `ArcError`, never `noop`, with the remote's Errand ref unchanged; notes saved on a commit not yet pushed
          refuse `unpublished-history` while the same sync's Errand push ends `pushed`, each outcome naming its
          families; two clones (`__tests__/helpers/multi-clone.ts`) that each save notes on a commit of their own,
          pushed to the remote, and then sync end `pushed` and then `reconciled`, the remote holding both clones' files,
          while two that save different content on one commit end `conflict`; with no identity configured, sync reports
          `no-identity` once, naming the three families, with no note or ref changed, and with `origin` unset reports no
          remote beside it, and syncs once `arc.identity` is set; and a personal file written through the contract and
          then synced reaches the remote's notes.
        - `arc sync` (`handlers/sync.ts`) keeps its code; its tests pass unchanged.

### `[ ]` **7.4 Conformance over every family — D7**

- _Goal:_ The conformance suite passes against the in-repo implementation over every family its fixture serves —
  tracked, personal, and transient-identity — with version conflicts produced by racing writers on each substrate.

    - `[ ]` **7.4.a The fixture serves every substrate**
        - Personal files over a temporary identity directory with its notes lock; transient-identity records over a ref
          with a remote from the multi-clone helper; `remote` provides the notes and Errand remotes for item 16.
        - The `content` hook gives any bytes for a personal file, with no rejecting variant, and for an Errand or a
          claim a valid record keyed to the identity written, its change, and a record the decoder rejects.
        - The fault hooks reach the new substrates: `plant` writes on the Errand ref each entry the snapshot diagnoses —
          malformed, oversized, unreadable, of an unknown version, or keyed for another slug — `hold` holds the notes
          lock, and `remoteState` takes the multi-clone remote down by moving its bare repository away, or makes it
          contended or refusing.
        - The fixture's declarations now cover every substrate, each exclusion with its reason, and the list is
          complete:
            - personal files and transient-identity records sit outside the state version (item 7; item 8 covers them);
            - a personal file has no history (item 11) and no format version a build can find newer (item 10), and a
              transient-identity record reads format version 1 until the ref backend writes one, as a tracked record
              does (Task 4.7.a), so neither gives a newer format version (item 10) or the unknown-format-version
              diagnostic (item 9) — today's `unknown-version` names an Errand entry's content version and lists as
              `malformed` (Task 7.2.a);
            - `lookup` of a personal file (item 12), since lookup resolves work items and checkout claims, never a
              personal file;
            - the reconciling notes push does not retry (item 16's `retries-exhausted`);
            - item 16's assertion that project-scope families publish beside `no-identity`, since every in-repo publish
              rides a ref keyed by the identity until the flip (Task 7.3.b);
            - a personal batch's shared batch ID (item 4), since personal files have no history or changes to show one
              (items 7 and 11);
            - `namespace-corrupt` stays declared (item 14), since no substrate produces it — the tracked one for Task
              4.7.a's reason, personal files having no structure beyond themselves, and today's snapshot reporting a ref
              whose tip or tree cannot be read as one `error` whose cause only its message tells, its listing
              `unreadable` and any other operation on it throwing (Task 7.2.a); the Errand ref produces
              `record-malformed` and `identity-mismatch` (Tasks 7.2.a and 7.2.b), as the tracked one does (Task 4.7.a);
            - a transient-identity batch's shared batch ID (item 4) and each write's own provenance in `history` (item
              11), since an Errand record's history is its ref's commits, whose messages it returns as they are (D3);
            - a created record's UID (item 1), since no record here carries one before the flip (D2);
            - a move of an Errand record to another placement, its creation at `completed`, a rename of one, and its
              links (items 1, 11, and 12), which it refuses `unsupported` (Task 7.2.b);
            - the `malformed`, `oversized`, and `key-mismatch` diagnostics on personal files (item 9), since the backend
              never parses a personal file (Task 7.1.b), today's readers cap no size, and a file's identity is its path
              with no key inside; and, for the first of those reasons, content a personal file's validation rejects;
            - `lookup` of a transient-identity record by a stored link — a captured commit or a branch link (item 12) —
              since the in-repo implementation stores none; a ref resolves to its Errand through the record that names
              the branch (Task 7.2.c), and a commit only from the flip (D3);
            - `lock-held` comes from the tracked and personal substrates alone (item 14), since a transient-identity
              write takes no lock of its own and Git's ref lock refuses a concurrent update once its brief retry runs
              out, which the backend throws (Task 7.2.b).

    - `[ ]` **7.4.b The suite over the new families**
        - Every item and assertion the fixture's declarations admit passes over each new family, and each excluded
          item, assertion, and refusal is reported by name with its reason.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` The conformance suite passes against the in-repo implementation and the reference backend, each over every
  family its fixture serves, with each item, assertion, or refusal a fixture excludes reported by name with its reason.

- `[ ]` Version conflicts are produced and asserted on both backends — on the in-repo implementation by racing writers
  on each substrate — and stale bases, with merged versions and conflict records, on the reference backend.

- `[ ]` On both backends, a write to an unrelated record changes no bound check.

- `[ ]` A batch with one stale record applies nothing and names every stale record; on the in-repo implementation a
  batch spanning substrates refuses `unsupported` with no file, note, or ref changed.

- `[ ]` Differential tests show reads through the contract returning what the current code path returns, and writes
  producing the bytes today's writers produce, for a meta through the lifecycle index, a Candidate record, a transition
  record, a `USER-INBOX` file with its entries as today's parser reads them, a `SESSION-NOTES` file, and Errand records
  — their absent, `error`, and complete outcomes read, and a record's blob written.

- `[ ]` `resolveActiveWu`, `readActiveMetaCandidates`, and `resolveCurrentWuSlug` delegate to the current-work-unit
  resolver, and every existing test passes unchanged.

- `[ ]` The identity-keyed lifecycle index returns the same records and fields as today's path reads for each query of
  every enumerated caller, but for the two cases Tasks 4.3.a and 5.2.a name, and the enumeration re-derived at Phase 6's
  close finds none missing.

- `[ ]` The checkpoint's and merge composition's default lifecycle storage is the new store, and their tests pass
  unchanged.

- `[ ]` The diff touches nothing under `packages/arc-framework/arc/`, no verb gains or loses a commit, and the existing
  ceremony tests pass unchanged.

- `[ ]` The concurrency library is covered for disjoint insertions; a same-entry clash keeping the current version and
  becoming a conflict record that names its entry, with both sides labelled; a removal racing an edit leaving the edit;
  a retitle merging as an edit; an entry without an ID gaining one and an ID clash re-drawn; clean and conflicting
  three-way line merges; and rank keys at any position, tied neighbours included, sorting as specified.

- `[ ]` The package build output contains none of the reference backend, and the import guard fails on a planted import
  from `src/`.

- `[ ]` Every refusal the contract defines is returned as a value, never thrown, and carries its class, observed
  condition, and remedy; each recoverable refusal has a test reaching the success path after its remedy; and no error a
  backend catches from the code it wraps is classified by its message text — the wrapped code sets each cause where
  Git fails, with today's predicates.

- `[ ]` The in-repo implementation reports no for state off the checkout's branch and the reference backend yes; every
  record reads format version 1 over the in-repo implementation; and an unparseable record is an unreadable entry with
  a diagnostic that blocks no session-init for an unrelated work unit.

- `[ ]` On the in-repo implementation, every kind with no home in today's substrates lists `absent` and refuses writes
  `unsupported`.

- `[ ]` No module under `src/` outside `lib/store/` imports a backend, and tests reach backends only through the
  conformance fixtures.

- `[ ]` The reference backend produces every sync outcome and failure class, and over the in-repo implementation each
  outcome today's notes save and push and Errand push report maps onto D4's as stated, with `arc sync`'s behavior and
  tests unchanged.

- `[ ]` Every test-cost budget row the change moves was baselined before the first new test file landed, and its
  comparison is recorded at verification.

- `[ ]` All quality gates pass: Markdown lint and the ARC contract checks, both type checks, `lint:ts` with no new
  size-gate suppression, `npm test`, and the build, with E2E and portability passing in required CI.

- `[ ]` Ready for integration
