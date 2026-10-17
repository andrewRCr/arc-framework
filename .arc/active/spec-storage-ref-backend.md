# Spec (`detailed` · `RFC`): storage-ref-backend

- **Origin:** [internal] — the `state-storage` re-cut (2026-09-28); stage 2 of the storage program.

- **Purpose:** Build the store ARC's state flips onto. Operational and planning state lives in same-repository
  `refs/arc/*` behind the shipped storage contract, or in the same engine in a separate Git directory for a backing
  repository or local-only use. Sync works by explicit fetch and batched pushes, each clone designates its state remote,
  and one migrate verb moves state between layouts and remotes, with the one-time import of today's tracked state, Git
  notes, and transient-identity refs as its first source.

---

## Introduction / Context

ARC's storage contract is shipped: one interface for every read and write of operational and planning state (`Store`,
`lib/store/contract.ts`), a closed refusal vocabulary (`lib/store/refusal.ts`), a family and kind registry
(`FAMILY_REGISTRY` and `KIND_MECHANISMS`, `lib/store/registry.ts`), and two implementations. The in-repo implementation
(`lib/store/in-repo/`) serves today's tracked files, Git notes, and transient-identity refs, and retires at the cutover.
The reference backend (`__tests__/helpers/store/reference-backend.ts`) is in memory and test-only. The kind registry now
carries each kind's parser, write check, and anchor declaration (`PRODUCTION_REGISTRATIONS`,
`lib/store/kinds/registrations.ts`).

The contract's specification (`spec-storage-contract.md`) fixes what callers see and specifies, as its Part B, what a
store keeping state off the checkout's branch must do: the ref layout (its D10), each surface's concurrency in use (D11),
sync and freshness (D12), and the backends and moving state between them (D14). Part B binds whatever realizes it. This
change realizes it. Nothing yet keeps state in refs, so there is nothing for the flip to switch onto: the rerouted
callers, the projection, and the cutover all build against the contract and wait on a store that holds state off the
checkout's branch.

The contract leaves this change the engine: how records, versions, and metadata sit in refs; how one state version names
the whole store when no ref is updated by every write; how sync fetches, merges, and pushes; how lifecycle moves and
lookups run over hundreds of refs; how a clone designates where its state publishes; and how today's state gets in. A
defect here is lost or misattributed state on every machine that syncs, so rigor concentrates on writes, merges, ends of
items, and the import. Fetch and the read path are retryable and take lighter handling.

**Terms used throughout:**

- **Store, backend, record, family, kind, owner** — as `lib/store/` defines them: the contract (`Store`), one
  implementation of it, one stored document, a storage grouping (`FAMILY_REGISTRY`), a record type within a family
  (`KIND_SHAPES`, `KIND_MECHANISMS`), and the work item, cohort, project, or person a record belongs to
  (`OwnerIdentitySchema`, `lib/store/identity.ts`).
- **Ref backend** — the backend this change builds. **In-repo implementation** and **reference backend** — the two
  above.
- **Work item** — a work unit, whose primary record is its meta (`work-item/meta`), or an Errand, whose primary record
  is its Errand record (`work-item/record`). Its **UID** is the random identifier minted at its creation; an owner's
  **slug** is its human name.
- **Placement** — a record's logical lifecycle location (`ReadPlacementSchema`, `lib/store/placement.ts`). An item
  **ends** when it is archived, closed, abandoned, or decomposed; a **reopen** brings an archived item back.
- **Record version** — a record's compare-and-swap basis (`RecordVersionSchema`). **State version** — an opaque token
  naming one saved state of the whole store (`StateVersionSchema`). **Anchor** — a state version written into a record
  field, which another machine must be able to resolve.
- **Projected kind** — a kind whose `projection` in `KIND_MECHANISMS` is anything but `"never"`: the working copy shows
  it as a file. A **never-projected kind** is written only by ARC's verbs.
- **The projection** — the planned gitignored working copy at the familiar `.arc/` paths, with its two persist paths,
  automatic write-back and the explicit `arc save`. Not yet built.
- **The flip** — the per-repository switch after which the store reports `capabilities.stateOffBranch` as true and the
  ref backend serves every read and write. **The cutover** — the change that runs the flip, the import, and the deletion
  passes that remove what only today's substrates needed.
- **State remote** — the one remote a clone publishes its state to. **Code remote** — the remote this clone pushes code
  to, as Git picks a push destination with no branch to consult: `remote.pushDefault` where set, else the clone's only
  remote, else `origin`; a clone none of these names has none. It is read from the clone's configuration as its primary
  checkout sees it, so a linked worktree's own `config.worktree` never makes two checkouts differ: one per clone, as the
  designation and the layout are, so a planning worktree's detached checkout reads the same one. **Read source** — a
  remote whose state a clone reads but never merges or pushes.
- **Firing point** — a coarse moment that publishes state: handoff, a lifecycle transition, or an explicit `arc sync`.
- **Machine-local** — kept at a path `MACHINE_LOCAL_PATHS` lists (`lib/store/registry.ts`), under the Git directory or
  in a person's `.internal/` folders, or under `refs/arc/tmp/`, which no path constant covers; never stored as state,
  synced, or projected. The separate layout's store directory, `arc/store` in the common Git directory (§ 9.7), matches
  that constant's `arc/**` pattern but is the store itself, not machine-local.
- **Ghost mode** — ARC in a repository the person cannot commit ARC files to: nothing of ARC is tracked there, project
  machinery and the constitution become stored families, and the store is always the separate layout (§ 9.7). Its
  install profile is built elsewhere.

## Goals

| Goal | Area                                | Design    |
| ---- | ----------------------------------- | --------- |
| 1    | The contract over refs              | § 3–8, 13 |
| 2    | Two layouts, one engine             | § 9       |
| 3    | Sync, designation, and read sources | § 6, 9    |
| 4    | The migrate verb and the import     | § 10      |
| 5    | Git access and maintenance          | § 11–12   |
| 6    | Contract changes                    | § 2       |
| 7    | Verification                        | § 14      |

1. **The whole contract over `refs/arc/*`**, its capability report answering yes: records with their versions, format
   versions, placement, and links; batches applied all or none; provenance as commit messages; `history`, `changes`,
   `version`, and `lookup`; archive into each quarter's ref and ended items' refs under `refs/arc/history/`; the project
   ID, counters, and lineage in the registry ref; write serialization by compare-and-swap under a machine-local lock per
   ref; every registered write check run in `write` and `batch`; and the serialization rules enforced at every write.
2. **Local-only and the backing repository** as the same engine: in the code repository's own refs when state shares
   the code remote, in a separate Git directory otherwise, the layout derived from the clone's designation and never
   switched bare.
3. **Sync by explicit fetch and batched pushes**: a fetch-only `pull` and a publishing `push` that can carry a code ref,
   merging on fetch by each kind's mechanism, refusing a state head that does not descend from the last one seen,
   applying other machines' lifecycle moves from their records, and classifying every push rejection by its per-ref
   status; each clone's state-remote designation; and an upstream's state as a read-only source.
4. **One migrate verb** that moves a clone between layouts and a project's state between remotes, restartable and all
   or nothing at its destination, with the import of today's state as its one-time source for this repository.
5. **The Git access the engine needs** — a ref-transaction helper with typed rejections, a push helper, batched reads,
   cancellation on every executor variant, ARC's Git floor raised to 2.47 — and `maintain()`, which keeps the store
   packed and returns the growth tripwire's measurements.
6. **The contract changes this needs, made forward:** Part A's types gain `pull`, `push`, and `maintain`, a refusal for
   an unresolvable state version, push figures on every outcome, and a hunk conflict record's `baseVersion`,
   `currentLines`, and `incomingLines`, the merge library's input carrying the base's version; a cohort's archive
   placement is served in the shape the contract's code gives it (§ 2.4); a companion is keyed by its path (§ 2.5); and
   Part B is amended where this design finds it wrong (§ 2).
7. **Verified** by the shared conformance suite over both layouts with no exclusions but § 14.1's, by integration tests
   over real repositories and remotes, by a comparison of every imported record with its source, and by a hand-run host
   trial.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- **No caller-visible behavior beyond what § 2 amends.** Everything else the contract fixes stays as written; a finding
  that it is wrong becomes a forward amendment, never a redesign here.
- **No caller is rerouted and nothing selects this backend before the flip.** The in-repo implementation keeps serving
  this repository; `createStore` (`lib/store/create.ts`) keeps composing it.
- **No projection, `arc save`, write-back, worktree lock, or protected-file notice.** The projection builds them over
  this backend's operations.
- **No record kind's parser, field schema, or write rule.** The kind registry supplies them; this backend runs them. The
  one exception is the project identity record's content, which the registry leaves undefined and every identity rule
  here reads, so the backend defines and checks it (§ 3.2).
- **No `arc sync` rewiring, no deletion of notes sync or of the in-repo implementation, no workflow rewrite, and no run
  of the import against this repository's live state.** The cutover does those, using what this change builds.
- **Nothing the contract defers:** no rotation beyond its reserved continuation field, no query cache or persisted
  lookup index, no protected state, no service backend, and no stub rank field until a consumer reads one.
- **No code-branch history policy and no ghost-mode install profile.** Store history stays immutable; ghost mode
  configures this backend's separate layout without this change building its profile.
- **No designation of personal state separately from project state.** Every state ref publishes to the clone's one
  state remote (§ 9.5).
- **No import of CineXplorer.** The import serves this repository; CineXplorer is installed fresh.

## Proposed Design

### 1. Boundary and placement

#### 1.1 One work unit

One engine behind one contract stays one work unit: it lands single-branch with local review chunking and no delivery
plan. The import is the most separable piece — it reads through the contract — but it lands through the migrate verb's
transaction (§ 10), which the layout moves need regardless, so splitting it out would build that half twice. The record
stands unless material new evidence arrives, such as an import that proves independent of the engine and too large for
review chunking to hold.

#### 1.2 Module layout

- **`lib/store/ref/`** holds the backend: its tree codec, metadata, version model, write path, merge and sync, lifecycle
  moves, lookup, layouts, designation, and the migrate verb's engine. It depends on the contract core (`lib/store/`),
  the concurrency library (`lib/store/concurrency/`), the kind registry and production registrations
  (`lib/store/kinds/registrations.ts`), the kernel's canonical form (`lib/kernel/canonical/canonical-json.ts`), the
  advisory lock (`lib/advisory-lock.ts`), and `lib/git/`'s executor. Nothing outside `lib/store/` imports it, as for the
  in-repo implementation: this change extends the `store-production` and `store-tests` import rules (`storeViolations`,
  `eslint/architecture-imports.ts`), which name only `lib/store/in-repo/` today, to `lib/store/ref/`, so only
  `lib/store/create.ts` imports its entry and no test imports it.
- **`lib/git/`** gains the executor capabilities of § 11: the ref-transaction helper, the push helper, cancellation on
  the stdin and byte variants, and the Git-version check on failure.
- **`lib/store/`** gains the contract changes of § 2; the serialization rules' function (§ 5.6); and, in
  `lib/store/create.ts` beside `createStore`, four exports over the ref backend: `createRefStore(ports)`, which the
  conformance fixture and the integration tests build their store with (§ 14); `createReadSourceStore` (§ 9.6); and
  `runStoreRemote` and `runStoreMigrate`, the entry points the `arc store remote` and `arc store migrate` handlers call
  (§ 9.4, § 10.1). `createStore` stays the one composition point that selects the backend operational reads and writes
  run through; the four serve only tests, a read source's view, and the `arc store` commands, which act on the ref store
  by name. The two entries build their store through `createRefBackend`, so nothing under `src/` calls `createRefStore`
  or `createReadSourceStore`.
- **The import's transform** sits in its own module under `lib/store/ref/import/`, reading through the in-repo
  implementation, so the cutover's deletion pass removes it with that implementation and nothing else references it.
- **Commands:** `arc store remote` and `arc store migrate` (§ 9.4, § 10.1), registered hidden until the flip, as
  `cli.ts` registers `hook-remedy-roadmap-conflict`.

Construction follows the contract's composition rule: `createRefBackend(ports)` takes every dependency as one object —
the Git executor and its stdin and byte variants, file access, the clock, a sleep port whose waits and bounds a signal
ends, a random source, the checkout root, the identity, the actor, the kind registry (the production set by default),
and the lock factory — and runs no command and reads no file until an operation needs one. The sleep port and the random
source drive the push loop's backoff and the deadline (§ 6.1, § 6.7), so a test runs either without waiting: a retry's
backoff is a wait, which its caller awaits, and the deadline and a remote read's limit (§ 9.2) are bounds, each raced
against the call its end aborts. The **actor** names this machine in conflict labels and commit trailers (§ 3.1, § 3.7):
this clone's random machine ID for the configured identity, which `getOrCreateMachineId` (`lib/user-sync/sync-state.ts`)
keeps today at `arc/user/<identity>/.internal/.machine-id` in the common Git directory (`getRepoSharedUserInternalDir`,
`lib/user-sync/repo-shared-paths.ts`), resolved lazily on the first write that needs it. A clone with no identity
configured has no actor: its commits carry no `Arc-Actor`, and their sides are labeled as a commit without the trailer
is (§ 3.7). It holds no identity-scope state either, as the contract has it: a read or write of a record a person owns
refuses `not-found`, saying no identity is configured and naming `arc.identity`, and a listing of a family of identity
scope is `absent`, as the reference backend answers (`recordAdmission`, `__tests__/helpers/store/refusals.ts`;
`listReference`, `__tests__/helpers/store/read.ts`). The reader and its exclusive create move into `lib/store/` with
this change, since `lib/user-sync/` retires with notes, and notes sync calls them there until it does.

#### 1.3 Dark until the flip

The backend reports `capabilities.stateOffBranch` as true, and nothing selects it before the flip: `createStore` keeps
composing the in-repo implementation, and the cutover's flip changes the selection. The backend is verified by the
conformance suite and integration tests over real repositories and remotes (§ 14), then live in the cutover's rehearsal
on a clone of this repository.

#### 1.4 What the backend consumes from the kind registry

Each kind's registration (`RegisteredKind`, built through `defineKindRegistration`, `lib/store/registry.ts`) supplies an
optional parser, an optional write check (`WriteCheck`, `lib/store/write-check.ts`), and an optional list of parsed
fields holding an anchor (`anchorFields`). `createKindRegistry` merges them into each `KindDefinition`, and
`PRODUCTION_REGISTRATIONS` is the production set. The backend reads a write's writer from its provenance through
`deriveWriteCheckWriter`, which reads the verbs in `HAND_EDIT_VERBS` (`lib/store/links.ts`) as a hand edit, and composes
one refusal from every broken rule through `composeWriteCheckRefusal`.

### 2. Contract changes

Part A's types change where this design needs them, and the contract's decisions are amended forward where this design
changes them or finds them wrong. Each change below is normative here. The change that alters Part A's types also
appends one entry per amendment in § 2.6 to the contract specification's Amendments log, so that specification never
describes types the code does not have.

#### 2.1 Operations

`sync()` becomes `push()`, and `pull()` and `maintain()` join it:

```ts
interface Store {
  // read, list, write, batch, version, history, changes, lookup: unchanged
  /** Fetch from the state remote and read sources, and merge into local state; publishes nothing. */
  pull(input?: PullInput): Promise<StoreResult<PullResult>>;
  /** Pull, then publish every eligible family, optionally carrying one code ref. */
  push(input?: PushInput): Promise<StoreResult<PushResult>>;
  /** Run Git's automatic maintenance on the store and report the growth tripwire's measurements. */
  maintain(): Promise<StoreResult<MaintainResult>>;
}

/** An ended item's history ref, fetched by name. */
type HistoryRef = `refs/arc/history/${"work" | "cohort"}/${string}`;
interface PullInput { history?: readonly HistoryRef[] }
interface PushInput { carry?: { ref: string; expect?: CommitSha } }   // CommitSha: CommitShaSchema's type, lib/store/links.ts

/** A store over another remote's state: the read operations alone (§ 9.6). */
type ReadOnlyStore = Pick<Store, "capabilities" | "read" | "list" | "version" | "history" | "changes" | "lookup">;
```

- **`pull`** fetches every listed namespace (§ 6.2), and each history ref `history` names from every remote it fetches,
  into the remote-tracking refs, and merges the state remote's into local state (§ 6.4). It never pushes, so
  `push.interlock` never gates it. It is what session start under `session.remote_sync` and a deciding verb call before
  they decide.
- **`push`** is today's `sync()`, renamed for what it does: its result already reports `publishes` (`SyncResultSchema`,
  `lib/store/sync.ts`), and a name that sounds two-way no longer sits beside `pull`. Its loop pulls first, since every
  push is a fast-forward. `carry` names a code ref that rides the same `--atomic` push where code and state share an
  atomic-capable receiver, or goes first as an ordered leg otherwise; `expect` names the remote tip a rewritten branch
  replaces, pushed as `--force-with-lease=<ref>:<expect>` (§ 6.8).
- **`maintain`** runs `git maintenance run --auto` against the store and returns each never-retiring ref's commit count
  and disk usage (§ 12).
- **On the other two backends:** the in-repo implementation's `pull` is today's notes pull, a fetch and a load to disk
  that publishes nothing (`runUserPull`, `commands/user/push-fetch.ts`), for the `personal` family alone, since the
  transient-identity refs its `sync` also publishes take remote state into local state only in a transaction that also
  pushes — each remote identity transaction (`transactRemoteAttempt`, `lib/errand/identity-transaction.ts`) and a
  rejected push's reconcile (`reconcileErrandPush`, `lib/errand/merge.ts`). Its results map onto `PullOutcome` with no
  notices:
    - a fetch that moved or created the notes ref, then its load, is `pulled`;
    - one that moved nothing, found no note, or found the local notes ahead is `noop`, as is one whose fetch failed with
      the `absent-remote-ref` outcome (`GitProcessError.expectedOutcome`, `lib/git/process-error.ts`), a reachable
      remote holding no notes ref, which `runUserFetch` reports as `remote-unavailable` today;
    - notes that diverged are `failed` `refused`, terminal, with the remedy `arc sync`;
    - every other failure, the fetch's and the local ref update's (`classifyGuardedFetchUpdateFailure`, beside
      `runUserPull`), is `failed` `unreachable`, with the cause `classifyRemoteFailure` reads (§ 11.5).

  Its `push` is today's `sync`: each of the four statuses `PublishOutcomeSchema` shares with this backend (`pushed`,
  `noop`, `reconciled`, `failed`) carries a retry count of zero and, as its time waited, the elapsed time it already
  measures, and its in-repo-only statuses keep their shape (§ 2.2). Its `maintain` returns no measurements. The in-repo
  fixture excludes the suite's `pull` items for the `work-item` and `claims` families by name (§ 14.2). The reference
  backend's `pull` reconciles against its in-memory remote and publishes nothing (`createMemoryRemote`,
  `__tests__/helpers/store/sync.ts`), its `push` is today's `sync`, and its `maintain` returns no measurements. Both
  backends' `push` returns `pulls` empty, reporting its reconciliation through `publishes` as `sync` does today.
- **The rename is cheap now:** one production caller uses the contract's `sync()`, the store archive's publication
  (`publishArchive`, `lib/work-unit/verbs/archive-store.ts`), which moves to `push()` reading the `states` and
  `publishes` it reads today; `createStore` delegates it, and the conformance suite exercises it
  (`__tests__/helpers/store/suite-sync.ts`).

#### 2.2 Results

```ts
/** States reported once per pull or push; none is a failure. */
type SyncState =
  | { status: "no-remote" }
  | { status: "no-identity"; families: FamilyId[]; remedy: Remedy }
  | { status: "designation-ambiguous"; remotes: string[]; remedy: Remedy }   // § 9.1
  | { status: "move-incomplete"; condition: string; remedy: Remedy }         // § 10.3
  | { status: "move-unfinished"; condition: string; remedy: Remedy }         // § 10.3
  | { status: "moved"; remote: string; remedy: Remedy }                      // § 10.6
  | { status: "designation-needed"; remote: string; choices: ("push" | "read" | "off")[]; remedy: Remedy }; // § 9.3

interface PullResult { states: SyncState[]; pulls: PullOutcome[] }
type PullOutcome =
  | { status: "pulled" | "noop"; remote: string; role: "state" | "read"; families: FamilyId[]; notices: PullNotice[] }
  | { status: "failed"; remote: string; role: "state" | "read" | "candidate"; families: FamilyId[];
      failure: Extract<StoreRefusal, { code: "unreachable" | "refused" }>;   // PublishFailureSchema's arms
      notices: PullNotice[] };
type PullNotice =
  | { kind: "history-diverged"; ref: string; local: CommitSha; remote: CommitSha; condition: string; remedy: Remedy }
  | { kind: "tracking-update-failed"; ref: string; condition: string; remedy: Remedy }
  | { kind: "ended-with-conflicts"; item: OwnerIdentity; conflicts: RecordReference[] }
  | { kind: "end-withdrawn"; item: OwnerIdentity; condition: string; remedy: Remedy }
  | { kind: "ended-twice"; item: OwnerIdentity; condition: string; remedy: Remedy }
  | { kind: "rule-broken"; reference: RecordReference; rule: string; condition: string; remedy: Remedy }
  | { kind: "end-pending"; item: OwnerIdentity; ref: string; condition: string; remedy: Remedy }
  | { kind: "namespace-corrupt"; ref: string; condition: string; remedy: Remedy };           // § 3.3

interface PushResult { states: SyncState[]; pulls: PullOutcome[]; publishes: PublishOutcome[]; carry?: CarryOutcome }
// PublishOutcome: every `pushed`, `noop`, `reconciled`, and `failed` outcome gains `retryCount` and `waitedMs`.
type CarryOutcome =
  | { ref: string; status: "pushed" }
  | { ref: string; status: "refused"; reason: CarryRefusal; message: string }
  | { ref: string; status: "unreachable"; cause: RemoteFailureReason };
type CarryRefusal = "non-fast-forward" | "fetch-first" | "stale-info" | "raced" | "remote-rejected" | "hook-declined"
  | "no-push-destination";

type MaintainResult =
  | { measurements: null }
  | { measurements: { ref: string; commits: number; diskBytes: number }[] };
```

- **One pull outcome per remote fetched:** the state remote's, and one for each read source (§ 9.6). A
  `history-diverged`, `tracking-update-failed`, or `namespace-corrupt` notice ends nothing: the ref keeps its local tip,
  and every other ref in the fetch applies. A remote whose presence read failed reports a `failed` outcome in the role
  `candidate` (§ 9.2). A `failed` outcome carries the notices of the refs that did apply before or beside its failure,
  such as the namespace fetch's when a by-name fetch then fails (§ 6.4); its `notices` are empty where nothing applied.
- **A push's `pulls`** are the outcomes of every pull its loop ran (§ 6.7), in order, so a notice raised inside a push —
  a withdrawn end among them (§ 6.6) — reaches the firing point as a pull's does.
- **Push outcomes** keep today's per-publish shape (`PublishOutcomeSchema`, `lib/store/sync.ts`), each naming the
  families it carried, one per status and one `failed` outcome per failure (§ 6.7); every one now carries the push
  loop's retry count and time waited, which the contention tripwire reads from handoff's own push (§ 12). The
  in-repo-only statuses keep their shape and retire with notes.
- **`carry`** reports the carried code ref's own outcome. A refused carried ref never fails the state publish: the push
  repeats with state alone and reports the carried ref's refusal here (§ 6.8).
- **The new states** report why the state remote is not synced, but for one. Three come from a clone's own
  configuration: two remotes marked as the state remote; a store outside the layout its designation calls for — a layout
  move left unfinished or a remote edit outside ARC (§ 10.3); or a designation question due (§ 9.3). A pull or push
  reporting one of them fetches and pushes nothing for the state remote. The fourth, `moved`, comes from the state
  remote itself: the pull's fetch of the project namespace finds its forwarding record (§ 10.6), and nothing pushes to
  that remote. A read source still pulls under all four. The fifth, `move-unfinished`, stops nothing: while a move's
  record stands, or store refs a move left stand in the code repository's refs beside the store directory, every pull
  and push reports the leftover beside whatever else it reports (§ 10.3). Before its switch a move syncs with its old
  remote, and past it with its destination, or with no remote where it left the clone local-only; a switch that changes
  the layout, interrupted midway, its record already written, also reports `move-incomplete`, which stops the sync until
  a rerun finishes the move, while one that changes none syncs by the designation § 9.2 counts until the rerun (§ 9.2,
  § 10.3).

#### 2.3 Refusals

One local refusal is added to `LocalRefusalSchema` (`lib/store/refusal.ts`):

| Refusal              | Class       | Meaning and remedy                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state-unresolvable` | recoverable | A state version, or an ended item's history the operation needs, is not in this clone; its fields are below. Remedy: where it names history refs, pull them by name and retry, a write whose state remote lacks them taking § 7.3's remedy; where it names none, a read rebuilds from the current state, and a write whose anchor field names a token nothing here resolves writes that field from the current `version()`, or null |

```ts
// LocalRefusalSchema gains, a strict object like its other arms:
{ code: "state-unresolvable"; class: "recoverable"; condition: string; remedy: Remedy;
  stateVersion?: StateVersion;    // the state version the operation named, where it named one
  historyRefs: HistoryRef[];      // each ended item's history ref this clone lacks, or holds without the
                                  // batch its folder's metadata names (§ 3.3); possibly none
  reference?: RecordReference;    // the record of a write or batch the refusal is for
  field?: string }                // the anchor field whose token failed
```

- **Who produces it:** `read` and `list` as of a state version, `changes` from or to one, `history` of an ended item —
  one whose quarter folder or lineage record this clone holds — whose history ref it lacks, `history` and `changes` over
  an archived item whose history ref this clone holds without the batch its folder's metadata names (§ 3.3, § 4.6,
  § 7.3), and `write` or `batch` when an anchor field names a token this clone cannot resolve or the write, or a reopen,
  lands on a completed item whose history ref this clone lacks or holds without that batch (§ 4.5, § 7.3). The
  conformance suite gains its recovery case, which a backend produces or excludes by name.
- **It is not `unsupported`'s `uncovered-state-version`,** which names a state version the in-repo implementation's
  token does not cover and whose remedy, binding per-record versions, would not recover this one.
- **`history-diverged`** stays: the notes export's outcome retires with notes, and the same name becomes `pull`'s
  per-ref notice (§ 6.3).

#### 2.4 A cohort's archive placement

A cohort's document is its only record, and closing a cohort is a placement write to it, as archiving a work item is a
placement write to its primary. The contract's code holds the shape, and this design uses it unchanged:

- **Write:** a `put` to `cohort/document` may carry `placement: { kind: "completed", quarter }` to close the cohort, and
  no other placement; with none it keeps its current one. `MutationSchema` (`lib/store/write.ts`) admits it for that
  kind alone, with no `links`.
- **Read:** an archived cohort document reads with `{ kind: "completed", quarter, sequence, closeout: "a" | "b" }`
  (`CohortReadPlacementSchema`, `lib/store/placement.ts`), the store assigning the sequence and the letter (§ 7.6); an
  open one carries no placement. `StoreRecordSchema` validates the shape for the kind, and `completedCohortPath`
  (`lib/store/lifecycle-record-path.ts`) projects the letter as `resolveArcPath`'s `leaf` or `parent`.
- **No write reopens a cohort:** a closed one comes back only where a pull withdraws the end that closed it (§ 6.6,
  § 7.6).
- **The in-repo implementation** refuses the write as `unsupported` `placement-move`, terminal, as it refuses moving a
  work item, naming archive as what serves it until the flip (`admitTrackedRole`,
  `lib/store/in-repo/write-admission.ts`). The reference backend implements it (`assignCompletedCohorts`,
  `__tests__/helpers/store/cohort-placement.ts`).
- **The cohort kind's rules** already read this placement through `after` (`cohort.open-members`, `cohort.parent`), so
  an archive's batch that places the document completed beside its last open member passes, and a cohort read as open
  until a backend returned a completed placement now reads closed on this backend.

#### 2.5 A companion keyed by its path

A work unit owns the files in its folder by folder, not by name (D13), so a companion is keyed by its path below its
work item's records rather than by a name: `KIND_SHAPES["work-item/companion"]` (`lib/store/catalog.ts`) becomes
`keyed("work-item", "path")`, its key validated as a personal document's is (`validateManagedPath`, through
`keySchemas`' `path`, `lib/store/identity.ts`). A name is a managed path, so every key today's callers build stays
valid, a paired spec's halves keeping `spec-prd` and `spec-rfc`.

- **Stored path:** a key `SlugSchema` admits stores as `<key>-<slug>.md`, and a paired spec's halves as
  `spec-<slug>-prd.md` and `spec-<slug>-rfc.md`, as today (§ 3.2); any other key stores verbatim at that path among the
  work item's records, so it carries no slug and keeps its path through a rename, which refuses where such a key at the
  root would read back under the new slug as another reference (§ 3.6).
- **A verbatim key refuses** `unsupported` `unhomed-kind` where the decode would read its path back as another reference
  or as `key-mismatch` (§ 3.1) — at the root, a name `<key>-<slug>.md` whose key `SlugSchema` admits, a paired spec's
  half's name, or a kind's fixed form under another owner, since a name and the work-item family's forms store there —
  and at the paths § 3.2 reserves on a work item's ref: at the metadata file, and at `review`, `state-<uid>`,
  `conflicts`, or `receipts` or under any of them. So does a key whose path is a folder another record's path runs
  through, or runs through another record's path, and a segment Git refuses falls under § 5.6's `store.git-path`, as for
  a personal document.
- **The decode** reads an entry among a work item's records that no other kind's form claims, outside `review/` and but
  for the metadata file and manifest, as a companion keyed by its path, at the root or in a folder below it; an entry
  under `review/` that maps to no record, and one whose decoded key a write would refuse, stay `malformed` (§ 3.1).
- **The in-repo implementation** is unchanged: `companionPath` (`lib/store/in-repo/paths.ts`) builds `<key>-<slug>.md`
  and refuses `unsupported` `unhomed-kind` every key whose file name `artifactMatcher` rejects — any but a name of
  lowercase letters alone or a paired spec's half, `notes-extra` among them. The reference backend stores any key its
  schema admits.
- **A reader that places a companion** places it at its stored path below its meta's folder and matches by that path,
  never by its file name alone: `lifecycleRecordPath` (`lib/store/lifecycle-record-path.ts`), and the rename's
  projection, artifact-rename map, and Design lookup over it (`renameProjection` and `ownedArtifactRenames`,
  `lib/store/lifecycle-rename.ts`; `readLifecycleDesign`, `lib/store/lifecycle-design.ts`), so two companions sharing a
  file name, or one sharing another record's, stay apart. The map is what the meta's Design and Task List rewrite, the
  paired-reference check, and the reference sweep read.
- **The shared suite keys companions by name** wherever `everyKind` runs: each fixture's `reference` hook builds a
  companion's key as a name rather than through its `path` arm, which builds `scratch-<suffix>.md` in the in-repo
  fixture and `scratch/<suffix>.md` in the reference one (`in-repo-fixture.ts`, `reference-fixture.ts`,
  `__tests__/helpers/store/`), and the path-key cases are items of their own (§ 14.2).

#### 2.6 Amendments to the contract's decisions

Each amends the contract specification's named decision forward, in Part A or Part B:

| Decision | Amendment                                                                                                                                                                                                                                                                                                                                                                                | Section               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| D1       | Two remote operations, `pull` and `push`, replace `sync`; `maintain()` joins the contract                                                                                                                                                                                                                                                                                                | § 2.1, 12             |
| D2       | A companion is keyed by its path among its work item's records: a name stores where it does today, and any other path verbatim                                                                                                                                                                                                                                                           | § 2.5, 3.2            |
| D4       | `state-unresolvable` joins the local refusals; `history-diverged` stays as `pull`'s notice; Git's message text is read in three named places: a receiver without atomic pushes, a server's per-ref refusal line, and a remote failure's cause                                                                                                                                            | § 2.3, 6.9            |
| D4       | `pull` and `push` report five states beside `no-remote` and `no-identity`, none a failure: `designation-ambiguous`, `move-incomplete`, `moved`, `designation-needed`, and `move-unfinished`, the last stopping nothing; every publish outcome carries the push loop's retry count and time waited                                                                                        | § 2.2, 9.3            |
| D4, D6   | When a late write meets an item's end, the end's version stays current whichever side is remote, and the late version goes into a conflict record                                                                                                                                                                                                                                        | § 6.6                 |
| D6       | A hunk conflict record carries `baseVersion`, the record version its base line range counts in, or null where the base held no such record, and `currentLines` and `incomingLines`, its current and incoming sides' line counts                                                                                                                                                          | § 3.7                 |
| D6, D10  | No stub rank is built until a consumer reads one; only the Errand queue keeps rank keys                                                                                                                                                                                                                                                                                                  | § 3.8                 |
| D10      | The size cap reaches projected kinds only; a repository that goes public moves its state to a backing repository only when it wants that state private; `refs/arc/project/moved` joins the ref table; a backend over Git adds the refusals Git or canonical JSON needs — `store.git-path`, `store.json`, a key that is not one path segment, and an owner's name or key over 2,040 bytes | § 3.2, 5.6, 9.5, 10.6 |
| D12      | `stale info`, `reference already exists`, and `reference does not exist` join the retry set as lost races, and a server's refusal of a state ref outside it is read by state, a lost race when the ref moved; every push of a work item's or cohort's ref, live or under history, and every delete, is leased; a carried code ref's own rejection is never a lost race for state         | § 6.5, 6.7–6.9        |
| D14      | Where no remote holds the project's registry, the clone asks once about its code remote, `push` or `off`; on a host whose forks copy state refs, a contributor's lone fork remote holding that copy is designated without asking and adopts the upstream's ID, a residual the host trial checks                                                                                          | § 9.2, 9.8            |

The contract left open where the designation is kept; § 9.1 settles it in Git config.

### 3. Record encoding

#### 3.1 The store's refs

The store is the refs whose names match a family's ref pattern in `FAMILY_REGISTRY` (`lib/store/registry.ts`) —
`refs/arc/work/<uid>`, `refs/arc/cohort/<uid>`, `refs/arc/project/inbox`, `refs/arc/project/registry`,
`refs/arc/user/<id>/personal`, and `refs/arc/user/<id>/claims` — plus the two namespaces that the work-item and cohort
families' `retention: "archive-and-history"` adds: `refs/arc/archive/<quarter>` and
`refs/arc/history/{work,cohort}/<uid>`. The backend derives all of them from the registry and reads, lists, manifests,
merges, and pushes no other ref, but for the forwarding record and the machine-local refs below, a carried code ref it
pushes (§ 6.8), and the transient-identity refs the import deletes (§ 10.11).

- **Other refs under `refs/arc/` are invisible to it,** and no fetch brings them (§ 6.2). In this repository today those
  are `refs/arc/user/andrew/errands`, `errands-remote`, and `sync-state`, and the delivery residue under
  `refs/arc/bootstrap/`, `refs/arc/delivery-candidates/`, and `refs/arc/recovery/`.
- **`refs/arc/tmp/` is machine-local:** never state, never fetched or pushed. This design keeps the last manifest there
  (§ 4.2), each tracking ref's last head after a prune (§ 6.3), a move's gathered refs, what it keeps with its copy, and
  its record (§ 10.2, § 10.3, § 10.4), and the registries and forwarding records a designation, a follow, and a move
  read before acting (§ 9.8, § 10.3, § 10.6), each under a name keyed by the remote it reads, or by its role where two
  reads would share one (§ 10.6), cleared before its fetch and dropped after its decision; the pull's own fetch keeps
  § 6.2's refspecs and § 6.3's check, but for the forwarding record (§ 6.3).
- **`refs/arc/project/moved`, the forwarding record (§ 10.6), is a control ref, never a store ref:** a pull fetches it
  with the project namespace into the tracking refs, and the migrate verb builds it under `refs/arc/tmp/migrate/`,
  pushes it, and deletes it, but nothing lists, manifests, or merges it.
- **A store holds state** when it holds any of its refs.
- **A ref's tree encodes its records.** The backend decodes a tree into records, merges and versions records, and
  encodes them back; no merge or version reads a raw path.
- **A tree the decode cannot read whole lists what it can,** reporting D4's per-entry diagnostics
  (`ListingDiagnosticSchema`, `lib/store/read.ts`) keyed by the entry's path, as a tree edited outside ARC needs: a blob
  the batched read cannot return is `unreadable`, and a ref whose tip or root tree it cannot read is one `unreadable`
  diagnostic keyed by the ref, its records missed, in a listing that is otherwise complete (`missed: true`), so a fault
  in one item never blocks the rest (D4) — the family is `unreadable` only where none of its refs can be read: the
  project inbox's, the registry's, or a person's one ref, or every ref a work-item or cohort family holds; a record over
  the cap is `oversized` for a kind the cap reaches (§ 5.6); a blob its kind's parser refuses, a never-projected kind's
  that does not parse as JSON (§ 3.5), a tree entry that maps to no `RefHome` — the ref's metadata file and anchor
  manifest (§ 3.2) aside, and among a work item's records only one under `review/`, since any other is a companion keyed
  by its path (§ 2.5) — and an entry at a key § 3.2 refuses are `malformed`, an entry that maps to no kind reported by
  every listing of its ref's family; a `formats` entry above the registry's format version is `unknown-format-version`;
  and an entry whose stored state names two owners is `key-mismatch`: one under a metadata file whose UID is not its
  ref's, one at a path naming an owner — a slug, a UID, or a person — other than its ref's or its metadata file's, or
  one whose parsed content names an owner other than the one its path and ref map to.
- **One commit per batch per ref,** and a second where a write's stale-base merge files conflict records there (§ 5.1).
  Each commit's message renders the batch's provenance as D3 has a backend over Git render it: a subject naming the verb
  and the owner's slug (`archive storage-contract`), and the trailers `Arc-Lifecycle-Action`, `Arc-Code-Head` where the
  caller gave one, `Arc-Owner` with the owner's UID where it has one, `Arc-Batch` with the batch ID, which every
  operation that commits mints with `randomUUID` — a `write`, a `batch`, a move's landing — and shares across every ref
  it commits on, so a single write that commits on two refs — an archive or a reopen by a placement write (§ 7) — is one
  batch too; a pull mints one for each ref it merges, but one across the commits that must publish together — a folder
  it rebuilds with its history ref's merge (§ 6.4), an end or reopen it applies, and a withdrawal's parts (§ 6.6) — so a
  ref the push loop leaves out holds back no ref an unrelated merge touched (§ 6.7); and `Arc-Actor` with the clone's
  actor (§ 1.2), which labels conflict sides (§ 3.7). A verb or lifecycle action that holds a control character or opens
  with `"` renders as a JSON string, in the subject and in its trailer alike, and reads back unescaped, so no provenance
  a caller gives writes a line of its own into the message. `history` and `changes` return the subject's verb and the
  trailers `Arc-Lifecycle-Action`, `Arc-Code-Head`, and `Arc-Batch` as the stored provenance (`StoredProvenanceSchema`,
  `lib/store/links.ts`), with each record's reference read from the tree and the provenance's `ownerUid` from that
  reference, since one commit can hold several owners' records — the registry's ref with a work item's lineage beside
  the project's own, or a quarter's taking a work unit's archive and its cohort's close — where its subject and
  `Arc-Owner` name the first of them in the batch's order; `Arc-Actor` is not part of it. The records a commit changed
  come from its tree, never its message. Every commit the backend makes, a merge's (§ 6.4) among them, carries
  `Arc-Actor` where the clone has an actor (§ 1.2), and commits are authored as the person (D12), with their name and
  email as the code repository resolves them (§ 9.7).

#### 3.2 Stored paths

- **A projected kind keeps the name the checkout shows:** a work item's files their basenames, a person's files their
  path under `.arc/user/`, so plain Git reads the store as the checkout does.
- **A never-projected kind ends its name with its owner's UID or person id,** which D2 allows for a stored path that is
  never projected; the project's single refs take fixed names.
- **A store holds one project.** Its owner is named `project`, as the in-repo implementation names it
  (`lib/store/in-repo/list.ts`), and its UID, where a reference carries one, is the project ID (§ 9.8), which the
  import's one project owner takes (A11). The project's refs and paths carry neither, and a listing returns that owner.
  The store holds a project ID once the registry's `project-registry/identity` record exists, whose content the backend
  defines and checks at write (§ 5.1): canonical JSON (§ 3.5) of exactly `{ "projectId": <id> }`, the ID a lowercase
  UUID as `randomUUID` mints it. Its UID is never minted (§ 5.1): a project reference the store returns carries the
  project ID as its UID once the store holds one, and none before, and `Arc-Owner` carries the project ID on every
  commit after which the store holds one, the identity record's own creating commit among them. A reference to another
  project — another name, or a UID not the project ID — refuses `identity-mismatch` naming the store's project, so no
  two callers' project records silently share one path.
- **Placement never enters a path,** except an archived item's folder in its quarter's ref (§ 7), so every lifecycle
  move short of archive and reopen is a metadata write.
- **Every stored path is unique within its ref and across refs** (D10): slug, UID, ID, and person suffixes keep it
  so, and the reserved keys below.

`KindMechanism` (`lib/store/registry.ts`) gains the ref backend's home beside the in-repo implementation's `inRepo`:

```ts
/** Where the ref backend stores one kind's records inside its family's ref. */
export interface RefHome {
  /** Path template; `<slug>`, `<uid>`, `<person>`, and `<key>` expand from the record's reference. */
  path: string;
}
// KindMechanism gains: ref?: RefHome — set for every kind whose family has a ref.
```

| Kind                                                            | Stored path                                                                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `work-item/meta`                                                | `meta-<slug>.md`                                                                               |
| `work-item/task-list`                                           | `tasks-<slug>.md`                                                                              |
| `work-item/draft`, `spec`, `notes`                              | `draft-<slug>.md`, `spec-<slug>.md`, `notes-<slug>.md`                                         |
| `work-item/companion`                                           | `<key>-<slug>.md` for a name, a paired spec's halves below, and any other key verbatim (§ 2.5) |
| `work-item/description`                                         | `errand-<slug>.md`                                                                             |
| `work-item/inbound`                                             | `inbound-<slug>.md`                                                                            |
| `work-item/record`                                              | `errand-<uid>.json`                                                                            |
| `review/candidate`                                              | `review/candidate-<uid>.json`                                                                  |
| `review/integration-boundary`                                   | `review/integration-boundary-<uid>.json`                                                       |
| every `review/` kind keyed by `id` but `review/conflict-record` | `review/<name>-<key>-<uid>.json`, `<name>` the kind's name after `review/`                     |
| `review/adversarial-pass`                                       | `review/adversarial-pass-<key>-<uid>.json`                                                     |
| `cohort/document`                                               | `cohort-<slug>.md`                                                                             |
| `project-inbox/inbox`                                           | `ATOMIC-INBOX.md`                                                                              |
| `project-registry/identity`                                     | `identity.json`                                                                                |
| `project-registry/counter`                                      | `counters/<key>.json`                                                                          |
| `lineage/transition`                                            | `lineage/<uid>.json`                                                                           |
| `personal/inbox`                                                | `<person>/USER-INBOX.md`                                                                       |
| `personal/working-memory`                                       | `<person>/WORKING-MEMORY.md`                                                                   |
| `personal/document`                                             | `<person>/<key>`                                                                               |
| `personal/errand-queue`                                         | `<person>/errand-queue-<person>.md`                                                            |
| `personal/session-context`                                      | `<person>/<key>/SESSION-NOTES.md`                                                              |
| `claims/groom`, `claims/housekeep`                              | `groom-<key>-<person>.json`, `housekeep-<key>-<person>.json`                                   |
| every `*/conflict-record` of a family with a ref                | `conflicts/<key>.json` under the family's root                                                 |
| `project-inbox/routing-receipt`                                 | `receipts/<key>.json`                                                                          |
| `personal/routing-receipt`                                      | `<person>/receipts/<key>.json`                                                                 |

- **The session-context kind is interim** (`interim: true` in `KIND_MECHANISMS`): session context moves into the meta
  at the flip and the kind retires with it. The ref backend stores it at the path above only so the shared suite covers
  every registered kind until then, and the import never writes it (§ 10.12).
- **A family's root** is its ref's root, or its subtree for `review` and `lineage` (`review/`, `lineage/`), or
  `<person>/` on a personal ref. A companion's key is its path (§ 2.5): a name stores as `<key>-<slug>.md`, any other
  key verbatim, and a paired spec's halves, keyed `spec-prd` and `spec-rfc`, keep the checkout's `spec-<slug>-prd.md`
  and `spec-<slug>-rfc.md`, as `companionArtifactName` (`lib/store/companion-name.ts`) names them, which the in-repo
  `companionPath` shares; an adversarial pass's key is its activity and number joined by a hyphen.
- **A key that would land on another kind's path refuses** `unsupported` `unhomed-kind`, naming that kind, as the
  in-repo implementation refuses a conventional role's name: a companion keyed `meta`, `tasks`, `draft`, `spec`,
  `notes`, `errand`, `inbound`, or `cohort`, or keyed verbatim at a path the decode reads back as another reference or
  as `key-mismatch`, at the metadata file, or at `review`, `state-<uid>`, `conflicts`, or `receipts` or under any of
  them (§ 2.5), and a personal document at a path another personal kind, the ref's metadata file, or its anchor
  manifest's `state-<person>` holds, or at `conflicts` or `receipts` or under either, whatever the ref holds yet. So
  does any key whose path is a folder another record's path runs through, or runs through another record's path, naming
  that record — a personal document keyed as a session context's folder — since a Git tree cannot hold one name as both
  a file and a folder.
- **Generic companion aliases use the resolved owner (A10).** Whether a verbatim root key aliases the generic
  `<key>-<slug>.md` form depends on the current owner's slug, so this decision follows owner binding, for an older UID
  name hint or a UID-less former name alike. Fixed record forms, reserved storage coordinates, malformed keys, and
  personal-path exclusions retain their early guards. Canonical companion names and paired-spec keys keep their
  encoding; no additional key becomes valid under its resolved owner.
- **A key that is not one path segment refuses** `record-malformed` at validation (§ 5.1): an `id` key, or an
  adversarial pass's activity, that holds `/` or a control character, NUL and newline among them. `keySchemas` admit any
  non-empty string there (`lib/store/identity.ts`); a `/` would nest the stored path, which the decode of § 3.1 could
  not map back, a tree entry's name cannot hold a NUL, and a newline breaks the batched read's line-delimited names
  (§ 11.6). Every stored path embeds the key in a longer name, so `.` and `..` need no rule. A `path` key holding a
  control character refuses alike, since `validateManagedPath` (`lib/kernel/canonical/managed-path.ts`) refuses only a
  NUL. A stored path with a segment Git's object check refuses — `.git`, `.gitmodules`, or `.gitattributes` in any
  spelling, or any segment over 4,096 bytes — refuses under § 5.6's rule `store.git-path`, as does an owner's name or a
  key over 2,040 bytes, except a personal document's path or a companion key stored verbatim; a companion name
  combined with its owner's slug retains the 2,040-byte bound (A5).
- **A personal document keyed as a derived view or a machine-local path refuses** `record-malformed` at validation, and
  its read refuses alike, as the reference backend refuses both (`recordAdmission`,
  `__tests__/helpers/store/refusals.ts`): the identity root's `STATUS.USER.md` (`IDENTITY_STATUS_FILENAME`,
  `lib/user-surfaces.ts`), which status renders, and a key under `MACHINE_LOCAL_PATHS`' identity patterns
  (`lib/store/registry.ts`), `.internal/` at the root or one folder down. A nested `scratch/STATUS.USER.md` stores.
- **`project-machinery` and `constitution`,** stored only under ghost mode, and the three reserved families have no ref
  (`FAMILY_REGISTRY`), so their kinds carry no `RefHome` until their family takes one.
- **Each ref also holds one metadata file** (§ 3.3): `metadata-<uid>.json` on a work item's or cohort's ref, live or
  under history, while its tree holds a record — an abandon's or decomposition's final commit and the import's origin
  refs hold none (§ 7.4, § 10.11); `metadata-registry.json` and `metadata-inbox.json` on the project's refs;
  `<person>/metadata-<person>.json` on a personal ref; and `metadata-claims-<person>.json` on a claims ref.
- **A ref whose records carry an anchor holds its manifest** (§ 4.5) as a subtree at `state-<uid>/`, beside its metadata
  file and named as it is, with `state` for `metadata` and no extension.
- **A quarter's ref holds one folder per ended item,** each holding that item's records at the paths above and its
  metadata file: a work unit's `<sequence>_<slug>/`, as `completed/` names it today; a closed Errand's
  `<slug>-<suffix>/`, unnumbered and named for its branch, the suffix its UID's first eight hex characters (D2, D10);
  and a closed cohort's `<sequence><a|b>_cohort-<slug>/` (§ 7.6).
- **Personal files share names across people.** Git's default delta search sorts by a path's last sixteen characters,
  so `andrew/WORKING-MEMORY.md` hashes as every person's does. Each clone fetches only its own personal ref and a fetch
  packs only what it sends, so the cost lands only in the host's pack; § 14.9 measures it, and renaming stored paths
  is a forward change if it bites.

#### 3.3 The metadata file

One metadata file per ref, never projected, read and written in the kernel's canonical form (`canonicalize`,
`lib/kernel/canonical/canonical-json.ts`):

```ts
interface RefMetadata {
  formatVersion: 1;
  /** Work item and cohort refs: the owner's current and former slugs. */
  slug?: string;
  formerSlugs?: string[];
  /** A work item's primary: its actual role (A5), placement, and links; kept when the primary is removed. */
  primary?: { role: "work-item/meta" | "work-item/record"; placement: WritePlacement; links?: Links };
  /** A cohort's document once archived. */
  placement?: Extract<WritePlacement, { kind: "completed" }>;
  /** The registry's ref: each lineage record's owner slug, keyed by the origin UID its path names. */
  lineage?: Record<string, string>;
  /** A completed item's folder: the batch that ended it, and the last batch that wrote its records. */
  endBatch?: string;
  batch?: string;
  /** Per-record format versions; lineage transitions additionally key by their origin UID (A6). */
  formats: Record<string, number>;
}
```

- **`list` reads in four one-shot processes:** `for-each-ref` for each listed ref's tip (`%(objectname)`); one
  `cat-file --batch-check` of each tip's root tree (`<tip>^{tree}`); one `git diff-tree --stdin -r -z`, given each tree
  paired with the empty tree, which names every entry of every listed ref and quarter with its blob — every record's
  kind and key, the entries § 3.1 reports, and each quarter folder's name, which carries its sequence — in one process
  and with no entry left out for sharing another's blob; and one `cat-file --batch` of the metadata blobs (§ 3.2), which
  give placements and format versions, and of whatever record blobs the call returns (§ 11.6). A tip whose commit or
  root tree the clone lacks reads `missing` on its own line of the second, the ref's `unreadable` diagnostic (§ 3.1):
  probed on Git 2.55 in both ref formats, `for-each-ref` with `%(tree)` aborts the whole read on one such ref, while
  `%(objectname)` lists every ref, the files format's packed ones among them.
- **A record absent from `formats` is at the initial format version** (`FormatVersionSchema`, `lib/store/identity.ts`).
  Each key is canonical JSON of `{ kind, key? }`, omitting an absent key; a `lineage/transition` additionally includes
  `ownerUid`, its resolved origin UID, because multiple singleton origins share the registry ref (A6). A read,
  put, or removal uses that complete coordinate and leaves every other record's entry unchanged. This coordinate
  also governs format selection in history, changes, merges, and import; an absent entry remains version 1.
- **The registry's metadata names each lineage owner,** since a lineage record's path carries only its origin's UID
  (§ 3.2), and an origin ended outside the archive keeps no live ref whose metadata names it: a write of
  `lineage/<uid>.json` writes the owner's slug under that UID, its removal removes the entry, and a rename of an item
  whose lineage the registry holds rewrites it in the same batch. A listing names the record's owner by it, and `lookup`
  of a lineage slug reads it (§ 8).
- **It merges field by field** (§ 6.4), since placement and links are written by different verbs on different machines.
  One field changed on both sides becomes a conflict record, as a single-writer record changed on both sides does. A
  record removed on one side and changed on the other, in content or in metadata, is one clash over the whole record,
  and the version that stays current keeps its own metadata.
- **Read placement derives from it:** an active, backlog, or completed placement as written, and for a completed work
  unit or cohort the sequence and closeout read from its folder's name. An item two published ends left with two folders
  (§ 6.6) reads by the one in the later quarter, or with the higher number in one quarter — its placement, version, and
  records — and a listing and § 8's scan count it once; a write to it refreshes each folder (§ 7.3) until the
  `ended-twice` remedy's reopen removes them all (§ 7.2).
- **A completed item's folder names its batches:** the end writes `endBatch` and `batch` with its own batch ID, and each
  later write to the item (§ 7.3), a rename among them (§ 3.6), writes `batch` with its own and keeps `endBatch`. A
  merge's renumbering keeps both, and a folder a pull's merge rebuilds or refreshes takes as `batch` the batch the pull
  mints for the folder and its history ref's merge, which that merge commit carries (§ 3.1, § 6.4, § 6.6), so the tests
  that read them — a pending end (§ 6.4) and a stale history copy (§ 7.3) — never depend on a folder's path history.
- **A removed primary's placement stays** in `primary`, with its role and links, so the item's other records keep
  reading with it, as the reference backend keeps a retained placement (`validatePlacement`,
  `__tests__/helpers/store/write.ts`): `StoreRecordSchema` refuses a work-item or review record without one. A put of a
  work-item or review record whose owner has neither a primary nor a kept placement refuses `record-malformed`, with the
  remedy to create the primary first or in the same batch.
- **A metadata file that is missing or does not parse** where its tree holds records — a ref's, or a quarter folder's —
  leaves those records nothing to read placement, slugs, or format versions by. A tree that holds no record needs no
  metadata file and reads as holding none: an abandon's or decomposition's final commit (§ 7.4) and the import's origin
  refs (§ 10.11). Only a commit made outside ARC leaves one, since every write and merge that leaves a record builds the
  file (§ 5.1, § 6.4). A listing reports that ref, or that folder, as one `unreadable` diagnostic keyed by it, its
  records missed, in an otherwise complete listing, as for a tip it cannot read (§ 3.1). `read`, `history`, and
  `changes` of a record on it, and a `write` or `batch` touching its records, refuse `namespace-corrupt`, terminal,
  naming the ref as its `namespace`, with the remedy to repair it forward: commit on top of its tip the metadata file
  from its last commit whose file parses, against the store's repository as § 6.3's remedies run, which the next push
  publishes as a fast-forward wherever the broken commit went. A `lookup` whose scan skips it refuses so only where the
  skipped ref could hold a better answer (§ 8). The push loop publishes no such ref (§ 6.7), and a pull that would move
  a local ref onto such a tip, by fast-forward or merge, leaves the ref, applies every other, and reports a
  `namespace-corrupt` notice naming it (§ 2.2), with the remedy to take the remote's tip (§ 6.3) and repair it forward.

- **Repair preserves exact historical evidence (A11).** A forward metadata repair restores current reads, listings,
  lookup, and writes; a history or changes query that still requires an ancestor whose records lack parseable metadata
  continues to refuse `namespace-corrupt`, naming the ref and explaining that the historical state cannot be decoded.
  Its remedy restores the original missing objects when those are available, or uses a readable saved interval for
  `changes`; a forward commit cannot alter an ancestor. No reader substitutes inferred metadata or silently omits an
  undecodable state. A missing commit or root-tree object additionally needs restoration or fetching of that object;
  after restoration, historical queries succeed when all required states decode. A saved-state read keeps its exact
  captured tip and does not acquire a later repair. The ordinary forward-metadata remedy applies to malformed current
  metadata; unavailable-object diagnostics name the object-restoration prerequisite.

#### 3.4 Record versions

Each record carries two identifiers:

- **The record version,** the compare-and-swap basis (D2), is `canonicalDigest` (`lib/kernel/canonical/canonical-json.ts`)
  over the content's blob id and that record's own metadata: for an owner's primary record — a work item's primary or a
  cohort's document — its role, slug, former slugs, placement, links, and format version; for any other record, its
  format version alone. A metadata-only write moves it, and a lifecycle move or rename moves only the primary's.
- **The content's Git blob id,** unchanged by a metadata-only write, is the working copy's base stamp and the three-way
  merge base.
- A record version repeats when a record returns to earlier bytes and metadata. That is safe for compare-and-swap,
  since equal state is safe to overwrite, but it signals nothing; `history` and `changes` read commits, which never
  repeat.
- The in-repo implementation keeps its content digest.

#### 3.5 Canonical content

- **JSON records are stored in canonical form.** A kind whose `projection` is `"never"` — each stored at a `.json` path,
  though a personal document keyed `notes.json` is no such kind — is written in `canonicalize`'s bytes, whatever bytes
  the caller passes, as the in-repo implementation re-serializes its JSON kinds, chosen by kind and never by path
  (`writeContent`, `lib/store/in-repo/write-codec.ts`), so equal content is an equal blob on every machine. A read
  returns the canonical bytes. Content that is not JSON, or JSON `canonicalize` cannot encode — a string holding a lone
  surrogate, a number past the finite range such as `1e400`, or object keys that collide under NFC — refuses
  `record-malformed` under the rule `store.json` (§ 5.6), at validation, before any lock is taken.
- **Every other record is stored as written,** the meta and task list among them, since the working copy's base stamp is
  their blob id; an entry kind's put adds only the `_Id:_` lines its entries lack (§ 5.1).

#### 3.6 Rename and role change

- **A rename** writes its owner's metadata — the new slug, the old one appended to `formerSlugs` — and renames its
  projected files in the same commit, adding no record blob, only the new metadata file; a companion keyed verbatim
  keeps its path, since its path holds no slug (§ 2.5), and the rename refuses `unsupported` `unhomed-kind`, naming the
  companion, where one at the root would read back under the new slug as another reference — a name
  `<key>-<new slug>.md` whose key `SlugSchema` admits, a paired spec's half under it, or a kind's fixed form under it —
  with the remedy to re-key that companion first, so no rename changes a record's key or lands two records on one path.
  On a completed work unit or Errand, or a closed cohort, it also renames its quarter folder (§ 7.3). A rename onto a
  slug a live work item or cohort holds refuses `ambiguous-match` (§ 5.1).
- **`history` and `changes`' restriction follow a record** across renames and the primary's role change between
  `work-item/meta` and `work-item/record` (A5): the backend computes every path the record has had from its former slugs
  and roles, then runs one path-limited `git rev-list --full-history --parents` over those paths and the ref's metadata
  file, and keeps a commit as an entry only where the record's own version (§ 3.4) or presence differs from its
  parent's. A metadata-only write to the primary therefore appears as the primary's entry with unchanged content, and as
  no entry of the owner's other records. Git's default history simplification drops a merged-away side: probed on Git
  2.55, a plain path-limited `git log` over a merge that kept the remote side's version lists neither the local write
  the merge replaced nor the merge, so `history` would lose a version this clone returned and § 5.2's stale base would
  not find it.
- **A merge commit** is an entry for a record only where its merged result differs from the record's entry before it in
  the order below, or, with none before it in the window, from the record as the window's older tip holds it. So a write
  merged in from another machine appears once, at the commit that made it, and the version a merge leaves current is the
  record's newest entry: the remote side's version, kept at a clash, takes no second entry, and a merge that keeps the
  local side after the remote's write lists the local version again.
- **The backend orders the commits itself:** each merge after both its parents' sides, its first parent's side before
  its second's, every merge taking the local side as its first parent (§ 6.4), so a record's entries run this clone's
  writes, then the writes a pull brought in, then the merge, as the reference backend appends a fetched history after
  its own (`transferMemoryHistory`, `__tests__/helpers/store/history-transfer.ts`). Probed on Git 2.55,
  `--topo-order --reverse` gives the same order, but Git documents no side order, so the backend orders from
  `--parents`.

#### 3.7 Write-once records

Conflict records and routing receipts are one file each, named by their ID, so concurrent additions merge as a union of
paths, as git-annex unions its branch. A merge mints each conflict record's ID with `randomUUID`, as the reference
backend does (`storeConflicts`, `__tests__/helpers/store/merge.ts`). Every conflict record's owner is the owner of the
record its content names (`record`, `ConflictRecordSchema`, `lib/store/conflict.ts`), as the reference backend files it;
on a `lineage/conflict-record`, whose path names no owner, the content alone gives it. A record's `conflicts`
(`StoreRecordSchema`, `lib/store/read.ts`) lists the open conflict records on its ref whose content names it, read from
the family root's `conflicts` tree (§ 11.6). A conflict record is removed only by the write that resolves it (D6). A
hunk conflict record also carries `baseVersion` (§ 2.6; the `hunk` arm of `TextConflictRecordSchema`), the record
version its base line range counts in: a write's stale-base merge's expected version (§ 5.2), a pull's merge's record
version at the merge base (§ 6.4), or null where the base held no such record — two sides that each created it, or tips
with no shared ancestor — so any clone can place the hunk against that version's content, which `history` lists (§ 3.4);
an entry conflict record needs none, its entry's ID locating it. The merge library takes that version in its input
(`MergeTextInput`, `lib/store/concurrency/line-merge.ts`), null where the caller holds no base, and `mergeLineText`
copies it into each hunk record it emits, an entry merge's prose hunks among them. A hunk record also carries
`currentLines` and `incomingLines`, its current and incoming sides' line counts, which `mergeLineText` takes from the
clash, since a side stored as its lines joined by newlines reads the same empty as one blank line. Where a hunk's base
range holds only its base side's lines — every line merge's hunk, and an entry merge's prose hunk that spans no entry —
the base side's count is its range's, and a clone placing the hunk spans the current side's count of the content it
writes and draws the incoming side's count of lines between its markers. An entry merge's prose hunk whose lines sit on
both sides of an entry carries a range spanning that entry, since `mapConflicts`
(`lib/store/concurrency/entry-merge.ts`) maps its first and last skeleton lines into the base document, and the entry
splits its sides' lines in the content, so no one span of it holds them.

Each side's label (`SideLabelSchema`, `lib/store/conflict.ts`) names the machine that wrote that side and when:

- **A stored side** — either tip of a pull's merge (§ 6.4), or the current side of a write's stale-base merge (§ 5.2) —
  takes the `Arc-Actor` and committer date of the last commit on its ref that changed the record. A commit without the
  trailer, one made outside ARC, labels its side with its committer's email, or `unknown` where it has none.
- **The incoming side of a write's merge** takes this clone's actor and the clock's time, or, with no actor (§ 1.2),
  the person's email as the commit would carry it.

So one person's two machines, the commonest clash, label their sides apart.

#### 3.8 Rank keys

Rank keys order the Errand queue only. Each queue member keeps its rank key inside the queue's record (D6, D11), which
replaces the file order of today's execute-bound marks (`listExecuteBoundInboxEntries`,
`lib/user-sync/inbox-writer.ts`). No stub rank is built: D6 and D10 give each stub a rank field, but nothing sets or
reads one, Part A's record and mutation types carry none (`StoreRecordSchema`, `lib/store/read.ts`; `MutationSchema`,
`lib/store/write.ts`), and backlog order has no consumer. The metadata file merges field by field and carries its own
format version, so a rank lands later as one more field beside placement, with Part A's types amended then (§ 2.6).

### 4. The version model

#### 4.1 The state version is a manifest of ref tips

The state version is the object id of a **manifest**: a Git tree mirroring the store's ref names below `refs/arc/`, one
gitlink entry (mode `160000`) per ref naming its tip commit — `work/<uid>`, `cohort/<uid>`, `archive/<quarter>`,
`project/inbox`, `project/registry`, and `user/<id>/personal` and `user/<id>/claims` for every identity ref the clone
holds.

- **It never names `refs/arc/history/`,** whose set differs from clone to clone.
- **A gitlink names a commit without keeping it reachable;** the refs holding each tip do, so a manifest adds a few small
  trees, and each shares every unchanged subtree with the manifest before it.
- **A manifest never repeats:** every write moves a tip forward, an end moves a quarter's or the registry's tip as it
  deletes a live ref (§ 7), and no ref moves backward. The conformance suite compares state versions for equality only
  (`registerStateAssertions`, `__tests__/helpers/store/suite-versions.ts`).

#### 4.2 `version` costs one Git call

- **One `for-each-ref`** of `refs/arc/` as a single pattern with `--exclude=refs/arc/history/` reads every tip, by
  `%(objectname)` alone, which lists a ref whose commit the clone lacks where `%(tree)` would abort the read (§ 3.3).
  The backend keeps the store's refs (§ 3.1) in process and computes the manifest's id in process: Git's tree format is
  fixed, and a test holds the computed id to Git's own write in both object formats.
- **The same call reads `refs/arc/tmp/version`,** which names the last manifest this clone wrote. An equal id writes
  nothing. A new id writes the manifest's new trees and moves that ref to it, two further Git calls, which also keeps the
  newest token from collection.
- **Finding the store costs no call:** the common Git directory comes from the worktree's `.git` file and the
  `commondir` file it leads to, as Git lays out a linked worktree, and the store directory's presence there selects the
  separate layout (§ 9.7). The one reader returns the worktree's own Git directory beside it, which the working copy
  reads too.
- **No identity read:** the manifest takes every identity ref present. The designation is read only by `pull`, `push`,
  and the migrate verb, which reach a remote anyway, and by a write that finds no store (§ 9.7).
- **A live listing carries the current state version** on this backend (D4): the token `version()` would return, from
  the same single-pattern `for-each-ref`, which the listing's own tip read takes, with `refs/arc/tmp/version` read in
  that call and its manifest written or reused as `version()` writes it, so a token a listing returns resolves for
  § 4.4 and § 4.5 on this clone as `version()`'s does. A listing whose manifest is new adds `version()`'s two further
  calls (§ 11.6).

#### 4.3 A torn cut is accepted

Under the files ref format a concurrent reader may see part of a multi-ref `update-ref --stdin` transaction, so a
manifest built in that moment names a state no writer produced. `changes` heals at the next manifest; only a read as of
that one manifest is wrong.

- A store directory the backend creates — the separate layout's — uses Git's reftable format, which commits a multi-ref
  transaction atomically for a reader that lists in one iteration.
- `for-each-ref` reads one snapshot per pattern, so `version` lists with one. Probed on Git 2.55 against a writer moving
  two refs in one transaction, reftable tore in none of 11,303 listings with one pattern and in 81 of 11,221 with two; the
  files format tore with either.
- The push loop never publishes part of a local batch (§ 6.7), so the torn cut stays a property of a manifest alone.

#### 4.4 Reads as of a state version

`read` and `list` as of a state version resolve its manifest, take each needed ref's tip from its gitlink, and read
`<tip>:<path>` through one batched `cat-file`. A manifest names the identity refs its own clone held, so one made on
another person's clone names theirs, which this clone never fetches (D10): a read as of it treats another person's
identity ref as absent, as a current read does, and reads this clone's own as the manifest names them, absent where it
names none. They refuse `state-unresolvable` (§ 2.3) when:

- **the manifest is not in this clone** — never fetched, or collected — carrying the state version and no history refs,
  with the remedy to rebuild from the current state; or
- **a work item's or cohort's tip it names is not in this clone,** as for an item that ended before this clone saw it,
  carrying the state version and each ended item's history ref, `refs/arc/history/work/<uid>` or
  `refs/arc/history/cohort/<uid>`, with the remedy to pull them and retry.

A tip present in the object store resolves whichever ref holds it, so an item reopened since the manifest resolves
through its live ref, whose history holds the same commits.

#### 4.5 Anchors and the manifests that travel with them

Only a state version written into a record has to resolve on another machine. A kind declares which parsed fields hold
one through its registration's `anchorFields` (`RegisteredKind`, `lib/store/registry.ts`): today the meta's
`stateAtHandoff` (`lib/store/kinds/meta/registration.ts`).

- **On a write of such a kind,** the backend reads each anchor field from the parse the write already runs. When a
  field's value changed and is not null, the commit carries that token's manifest at the ref's manifest path (§ 3.2),
  overwriting the one before it, so the anchor and its manifest land in one commit on one ref and stay reachable as long
  as that ref's history does, under `refs/arc/history/` too. Earlier manifests stay reachable through the ref's history,
  and the token resolves without its path. A null carries nothing.
- **A token this machine cannot resolve** refuses the write `state-unresolvable`, naming the field, rather than store an
  anchor nothing resolves.
- **One anchor field per ref.** A ref holds one manifest path (§ 3.2), so one commit on it can carry one manifest: only
  a kind whose ref holds at most one record of it — a singleton on its owner's own ref, never `lineage/transition`,
  whose records share the registry ref — may declare an anchor field, and the kinds whose records one ref holds — a work
  item's ref holds the `work-item` and `review` families' — may declare one between them. `createRefBackend` throws on a
  registry that breaks either, naming the kinds, a registry defect caught at construction rather than a refusal one
  write meets. Today's one, the singleton meta's `stateAtHandoff`, fits.
- **A token a machine keeps for itself** — a compaction seed, a projection index — rests on Git's expiry and on the
  refusal, whose remedy is to rebuild from the current state.
- **A manifest keeps an ended item's last tip,** so a read as of it needs that item's history ref, which a clone holds
  only once a pull has fetched it: the pull that applied the end, or one that names it (§ 6.4). A clone that never saw
  the end refuses as § 4.4 says.

**Expected contract for callers** (each lands with its verb in later changes, but for rename's below): a verb that meets
`state-unresolvable` naming history refs pulls them by name (`pull({ history })`) and retries once with no stop — reopen
(§ 7.2), restate and recovery through `changes`, any verb that writes a completed item's records (§ 7.3), and any reader
of an ended item's `history`, the Candidate chain's among them. A person meets the refusal only when that pull fails:
with the remote unreachable, they rerun the verb once it answers; with the remote answering but holding no such ref, the
retry resolves through a reopened item's live ref or refuses again, a read with the remedy to rebuild from the current
state and a write with § 7.3's.

**`arc rename`'s retry is built here,** since the verb's store path is already built, running over any store that
reports its state off the branch (`usesOffBranchState`, `lib/store/lifecycle-write.ts`), and only this backend produces
the refusal, so only here can the retry be tested. `runStoreRename` (`lib/work-unit/verbs/rename-store.ts`) reads its
subject through `readStoreRenameSubject` and writes through `prepareStoreRename` (`lib/store/lifecycle-rename.ts`) and
`applyPreparedLifecycleWrite`; meeting `state-unresolvable` that names history refs from either, it pulls them by name
and runs again from the subject read, once, and a pull that fails, or a second refusal, returns the refusal as it stands
(§ 14.5).

#### 4.6 `changes`

`changes` between two manifests is each changed ref's log between the two tips — every landed mutation with its
provenance, oldest first within a ref, refs in name order — restricted to the named records' paths (§ 3.6) when the
caller names any. A ref in one manifest only reads by its namespace:

| Where the ref is                                                    | What `changes` reads                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A work item or cohort, older only                                   | Its end, from its history ref's log; refuses as § 4.4 when this clone lacks that ref                                                                                                                                                                                                                                                                               |
| A work item or cohort, newer only                                   | New since the older: from its root. Reopened since it: from its reopen, the commits the history tip it moved back from does not reach                                                                                                                                                                                                                              |
| A work item or cohort in neither, its folder in the older's quarter | Ended before the older and changed since — written while ended, or reopened and ended again: found by its folder among the quarters' changes, read on its history ref from the first such batch's commit through the last batch in the window that changed its folder or wrote its end's record — a quarter's, or the registry's lineage — which it needs as above |
| A work item or cohort in neither, otherwise                         | Created and ended between them: found by its end's record among the quarter's or the registry's changes, read from its root on its history ref, which it needs as above                                                                                                                                                                                            |
| Any other ref, newer only                                           | New since the older — a quarter, the inbox or registry, or an identity ref — from root                                                                                                                                                                                                                                                                             |
| Any other ref, older only                                           | Nothing                                                                                                                                                                                                                                                                                                                                                            |

- **A batch is one change** (D3): `changes` groups the commits it reads by their `Arc-Batch` across refs and gives each
  record one entry per batch — its version and content after the batch — only where that differs from its version before
  the batch, wherever the record is stored on either side. A record a batch only carries between refs at its version —
  an archive's copy into the quarter's folder, a reopen's removal of that folder, the folder refresh beside a write to a
  completed item (§ 7.3) — takes no entry for the carrying, so a reopen lists no removal of the item's records and an
  archive no second entry. Each record's entry for a batch takes its place at the batch's commit on the ref where that
  record's version changed, never on one that only carries it, so a record's entries run oldest first however its
  batches span refs. A merge commit carries the `Arc-Batch` its pull minted for it (§ 3.1), so a record a merge changes
  takes its entry under that batch, and a merge is read by § 3.6's rule, so one that renumbers or renames a folder adds
  no entry.
- **An archived item's later writes** are found through its quarter's ref, whose folder each such write refreshes in its
  batch (§ 7.3), and read on its history ref, where the record's version changed. A history ref whose log lacks the
  batch its folder's metadata names (`batch`, § 3.3) — another machine's write, which the default fetch does not bring
  (D10) — refuses as § 4.4 does, naming the ref, so § 4.5's pull by name and retry covers it.
- **An identity ref is missing from a manifest only on another person's clone,** since each clone fetches its own
  identity alone (D10), and a shared ref leaves only by loss, which the next push restores (§ 6.4). So `changes` between
  two people's manifests carries the newer one's identity history whole, and a reader that wants project scope alone
  restricts to it — restate from another person's anchor when a work unit changes hands. Comparing identity refs only
  where both manifests carry them cannot tell another person's ref from one created since without the clone's identity,
  a Git call on every no-change check.

### 5. Writes

#### 5.1 The write path

`write` and `batch` run one path:

1. **Validate.** The input schemas — a primary's put without placement, which `MutationSchema` refuses
   (`lib/store/write.ts`), refusing `record-malformed` — and § 3.2's owner-independent key rules (A10), then the
   serialization rules on every put (§ 5.6), then each put's kind parser, whose failure refuses `record-malformed` with
   the parser's error before any check runs; `project-registry/identity` has no parser, and a put of it whose content is
   not § 3.2's shape refuses `record-malformed` alike. A put of an entry kind whose grammar the backend's kind registry
   does not declare (its `KindDefinition`'s `entry`, in the registry the backend is constructed with, § 1.2) refuses
   `unsupported` `unhomed-kind` naming it — the contract's terminal case for a well-formed write that later work serves,
   which declaring the grammar is — so no stored record of such a kind reaches a merge. Each other put of an entry kind
   then stamps an `_Id:_` on every entry that lacks one, in the kind's grammar (`stampEntryIds`,
   `lib/store/concurrency/stamp.ts`), as the reference backend stamps after its parser and before its merge and checks
   (`persistedContent`, `__tests__/helpers/store/merge.ts`), so a stale base's merge (§ 5.2), the write check's `next`
   (§ 5.3), the stored blob, and the returned version all carry the IDs (D6). The stamp draws from a SHA-256 stream
   seeded by the put's reference, expected version or absence, and content, where the reference backend draws at random,
   so a retried put stamps the same IDs and its stale base merges to § 5.2's no-op. Content the stamp cannot place an ID
   in — an entry of a `field-header` grammar with no `_Remove when:_` line, which its ID line follows and without which
   `stampEntryIds` throws — refuses `record-malformed` naming the entry, and so does content whose entries repeat an
   `_Id:_`, naming the ID, with the remedy to give the later entry a fresh ID or drop its ID line for the stamp to fill,
   whether or not the put's base is stale, since the kind's merge frames entries by ID and throws on a repeat
   (`entryFrame`, `lib/store/concurrency/entry-frame.ts`); the import's build refuses both alike (§ 10.8). Then the
   writer rules (D6; `writerRule` and `writerVerbs` in `KIND_MECHANISMS`): a write to a `write-once` kind by a verb
   outside its `writerVerbs` refuses `record-malformed`, and a removal of a conflict record that the write's own
   `resolves` does not name refuses `record-malformed`, with the remedy to name it there or to write its subject naming
   it, as the reference backend refuses both (`preflight`, `__tests__/helpers/store/write.ts`). An update to a
   `create-only` or `write-once` record is § 5.2's.
2. **Resolve** each reference without a UID by `lookup`'s scan (§ 8). A write naming an owner nothing holds mints its
   UID with `randomUUID` — the project owner aside, whose UID is the project ID or none (§ 3.2) — and a put creating a
   primary mints one even where ended items hold the slug, so the slug starts a new generation (D2); the batch's other
   records naming that owner take the same UID. A create whose slug a live owner of its type holds resolves to that
   owner, and § 5.2's absence rule refuses it. A write that otherwise leaves its primary live under a slug another live
   work item or cohort holds — a create across the two, a rename onto that slug, or a reopen of an item whose slug a
   live one took after it ended — refuses `ambiguous-match` naming both, with the remedy to rename one by its UID: every
   work item, whatever its type, and every cohort share one namespace, since a planned work unit and a cohort project to
   one `backlog/planned/` folder (D14). Within one type the reference backend refuses the same state (`indexIdentities`,
   `__tests__/helpers/store/identities.ts`). A rename that ends a clash between machines leaves one holder and lands, as
   does every write that changes no primary's slug or placement. Two processes on this machine creating one slug, or
   renaming onto it, at once both land, and readers meet the result as they meet two machines' records with one slug
   (§ 5.3). The same listing finds every owner's refs, whether the batch names it by slug or by UID: its live ref, or
   once it is archived its history ref and each quarter's ref holding its folder (§ 3.3, § 7). A write to records kept
   on their owner's own ref, naming by UID an owner with neither — one ended outside the archive (§ 7.4), whose history
   ref the scan never reads — refuses `not-found`, as § 8 resolves its slug; lineage, kept on the registry's ref, is
   unaffected. Once each owner is resolved or minted, reject generic companion aliases using that owner's current
   slug, before locking (A10); the same resolved-owner rule governs reads, history, changes, and captured views.
3. **Lock.** Take the machine-local lock of every ref the batch writes, in ref-name order (§ 11.4); a wait past its
   limit refuses `lock-held`.
4. **Read under the locks.** One `for-each-ref` reads the tips, each owner's live and history refs among them, and the
   records the batch names decode from them. An owner whose refs differ from what step 2 found — a ref present or
   absent, or a folder gone from a quarter step 2 found it in, as an end, a reopen, or a pull applying one leaves it —
   releases every lock and restarts the write from step 2, as the push loop retakes a grown set (§ 6.7), so a write
   never recreates a ref or a folder an end or reopen moved. Each put or removal's expected version is then checked
   (§ 5.2).
5. **Build.** The new trees over those tips: records, metadata files, anchor manifests (§ 4.5), and any ref the batch
   creates, moves, or deletes (§ 7), with every conflict record a write's `resolves` names removed in the same commit
   (D6). A record whose bytes differ from its put's — an entry kind's stamped content, or a stale base's merge (§ 5.2) —
   passes the serialization rules again on the bytes it stores (§ 5.6), and a stale base's merged content passes its
   kind's parser, whose failure refuses `record-malformed` with the parser's error and the remedy to read the record and
   write it again over its current version, since a write can refuse what a pull's merge must store (§ 6.4).
6. **Check.** Each written record's write check runs under the same locks (§ 5.3).
7. **Commit.** Under the layout lock, taken last (§ 11.4), the layout is read again, and one a move changed since step 2
   releases every lock and restarts the write from step 2, as step 4 does; then the new objects, one commit per touched
   ref — and on a ref where a stale base's merge files conflict records, a second commit atop it holding them, with the
   provenance § 5.5 gives them — and one ref transaction naming every ref's expected old value (§ 11.1). A ref found off
   its expected value — a writer that bypassed the lock — retries the whole operation from step 4.
8. **Release** the locks and return each record's version, with any conflict records a stale base's merge created.

No lock is held across a network call or a hook's await: the write path makes no network call, and the push loop
releases its locks before it pushes (§ 6.7). A pull's merge takes the same locks and compare-and-swap as a write
(§ 6.4). So no write interleaves with another writer of its refs between its read and its commit, and none lands on refs
its owner has left, which are the races the reference backend closes by queueing writes and syncs on one shared state
and resolving inside the queue (`withStateQueue`, `__tests__/helpers/store/state-queue.ts`).

#### 5.2 Expected versions, stale bases, and no-op rewrites

- **A put expecting absence** requires the record absent; for a work item's primary, absent in both roles (A5).
- **A stale expected version on a put of a merge kind** — one whose `merge` in `KIND_MECHANISMS` is `line` or `entry`
  (D6) — is a stale base: the backend finds the content at that version in the record's history and merges from it by
  the kind's mechanism (`lib/store/concurrency/`), returning the merged version and any conflict records; a version the
  record's history does not hold refuses `version-conflict`. A stored side or merge base whose entries repeat an
  `_Id:_`, which only a commit made outside ARC leaves, refuses `record-malformed` naming that version and the ID, with
  the remedy to write the record over its current version with distinct IDs.
- **Every other stale expected version refuses `version-conflict`,** naming every stale record in the batch: a put's on
  a single-writer kind, and a removal's on any kind, since a removal carries no content to merge, as the reference
  backend's `stale` reads it (`__tests__/helpers/store/write.ts`) and the suite's `stale-removal` asserts.
- **A put updating a `create-only` or `write-once` record** refuses `version-conflict` with its expected version
  current, as `stale` reads it, and as the suite's `create-only-update` asserts for create-only kinds: such a record is
  written once and changes only by removal, under § 5.1's writer rules. The one exception is the terminal-lineage repair
  (`isTerminalSnapshotRepair`, `lib/store/kinds/lineage/repair.ts`): a `repair-lineage` or hand-edit put to a
  `lineage/transition` record at its current version whose only change adds the missing `retiredBranches` lands, as both
  other backends admit it (`stale`; `write-transaction.ts` and `write-stores.ts` in `lib/store/in-repo/`), and a stale
  one refuses `version-conflict`.
- **An identical rewrite is a no-op,** as Git declines an empty commit: no commit and no history entry, and the record
  version stays. A put naming in `resolves` a conflict record still open is never one, even where its content and
  metadata are the stored record's, as a resolution keeping the store's side sends them: its commit removes that
  conflict record (§ 5.1), and the record's own version and `history` stay as they were. A retried write whose first
  attempt landed or merged clean costs nothing — a put that stamps entries too, since its retry stamps the same IDs
  (§ 5.1) — and `history` and `changes` show only writes that changed something. A retry after its first attempt's
  stale-base merge clashed meets the same clash and files a second conflict record under a new ID (§ 3.7), since the
  merge keeps the store's current side at each clash, as the reference backend does (`mergeContents`,
  `__tests__/helpers/store/merge.ts`). Provenance is never evidence (D3), so nothing rests on a write that changed
  nothing.

#### 5.3 Write checks

Each written record's registered write check (`WriteCheck`, `lib/store/write-check.ts`) runs before the commit, in
`write` and `batch`:

- **Its input** (`WriteCheckInput`) is the record's reference; its prior record, with content and parsed fields, or with
  content and no fields where the stored version fails to parse, which only a pull's merge or the import stores; its
  next record, the content the write persists, which for a stale base is the merged content; the writer; and two
  read-only views, `before` over the tips the write found and `after` over the batch's new trees laid over those tips,
  each offering `read`, `list`, and `lookup`.
- **A retirement's check view precedes its final sweep (A4).** For an end under § 7.4, `after` contains the batch's
  prepared mutations laid over the captured tips, including its own inbound-list settlement or explicit removal,
  before the backend's automatic sweep. All write checks must admit the batch before that sweep runs. The empty final
  tree and the move to the history ref still land in the same atomic transaction.
- **The writer** comes from the batch's provenance through `deriveWriteCheckWriter`: a verb in `HAND_EDIT_VERBS`
  (`lib/store/links.ts`) is a hand edit, any other verb itself.
- **A primary's role replacement** (A5) runs the removed kind's check with no next record and the created kind's with no
  prior, as the reference backend's check pass does (`checkPreparedWrites`, `__tests__/helpers/store/write-checks.ts`).
- **Broken rules refuse `record-malformed`** composed through `composeWriteCheckRefusal`: the first broken rule in
  identifier order (UTF-8 bytes), the first record in the batch's write order that breaks it, that rule's condition and
  remedy, and the condition counting the other broken record-and-rule pairs.
- **A rule that reads records outside the batch holds as of the write.** The compare-and-swap guards only the refs the
  batch writes, so a race or a merge can produce a state such a rule would refuse; readers report that state, as two
  machines' records with one slug are handled (D14): both exist, status lists the clash, and a rename resolves it.
- **A merge never runs a check as a gate** (§ 6.4), and moving state between backends or layouts gates on none (§ 10.4).

#### 5.4 Batches

A batch is all or none (D3). Its refs commit in one `update-ref --stdin` transaction, so a reader of the reftable layout
sees all or none of it, and a reader of the files layout may see part of it for a moment (§ 4.3). A batch that creates a
ref — a new work item or cohort, a decomposition's children, a first write to a quarter or an identity ref — names it
with an expected absence.

#### 5.5 Provenance on the backend's own writes

Writes the backend makes for itself carry provenance of their own: a pull's merge `sync` with lifecycle action `merge`,
the conflict records a write's stale-base merge files `merge` with the write's lifecycle action, code head, and batch,
as the contract's writer rule has a merge write them (D6) and the reference backend files them (`storeConflicts`,
`__tests__/helpers/store/merge.ts`), whatever verb the write carried, an end's withdrawal `sync` with `withdraw-end`
(§ 6.6), a pull's adoption of a read source's project ID `sync` with `adopt-project-id` (§ 9.8), a move's landing
`migrate` with `import` or `move-remote`, and the registry commit landed with each forwarding record a remote move
leaves or withdraws `migrate` with `forward` (§ 10). The import's commits also carry, as `Arc-Code-Head`, the code
commit it read, so each imported record's history from before the flip is found in code history from there (§ 10.8).
`sync` is not in `HAND_EDIT_VERBS`, so the rules that bind only a hand edit stay silent on a merge.

#### 5.6 Serialization rules

D10's rules are checked at every write, by one pure function the write path and the import's build call; a merge and a
move store what they carry unchecked (§ 6.4, § 10.4):

```ts
/** Check one record's content against the store's serialization rules.
 * @returns The `record-malformed` refusal naming the first broken rule, or undefined when every rule holds.
 */
export function checkSerializationRules(
  reference: RecordReference, content: string,
): Extract<StoreRefusal, { code: "record-malformed" }> | undefined;
```

It lives in `lib/store/`, beside the contract, and reads only its arguments and the kind registry's mechanisms.

| Rule                | Refuses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store.text-only`   | Content with a NUL byte in its first 8,000 bytes, Git's own binary heuristic                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `store.size-cap`    | Content over 1 MiB (1,048,576 UTF-8 bytes), for a kind whose `projection` is not `"never"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `store.env-file`    | A personal document whose last path segment, lowercased, is `.env`, ends in `.env`, or begins with `.env.`, other than `.env.example`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `store.private-key` | A PEM private-key block — a `-----BEGIN … PRIVATE KEY-----` line with its matching `-----END` line after it — or a personal document named `id_rsa`, `id_dsa`, `id_ecdsa`, or `id_ed25519`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `store.git-path`    | A record of any kind whose stored path (§ 3.2) has a segment over 4,096 bytes, whose owner's name or key is over 2,040 bytes — a personal document's path and a companion key stored verbatim excepted, their segments checked one by one; a companion name combined with its owner's slug retains that bound (A5) — or whose stored path has a segment that is `.git`, `.gitmodules`, or `.gitattributes` in any spelling Git's object check treats as one — case-insensitive, and as Git's `is_hfs_dotgit`, `is_ntfs_dotgit`, `is_hfs_dotgitmodules`, `is_ntfs_dotgitmodules`, `is_hfs_dotgitattributes`, and `is_ntfs_dotgitattributes` match, HFS+ ignorable code points, NTFS trailing dots and spaces, and the short names `git~1`, `gitmod~1`, and `gitatt~1` among them |
| `store.json`        | Content that is not JSON, or JSON `canonicalize` cannot encode (§ 3.5), for a kind whose `projection` is `"never"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Rules run in the table's order, and the refusal names the first broken one, with the record's reference, that rule's
condition, and its remedy.

- **Callers:** the ref backend's `write` and `batch`, on each put and again on bytes the backend changed (§ 5.1), and
  the import's build (§ 10.8). Expected contract: the working copy keeps no copy of the rules. Its persist meets them
  through the backend's `write` and reports that refusal, and its removal check — which refuses an abandon, or a
  checkout's release, before anything changes — calls the function itself, so a refusal persist would meet surfaces
  first.
- **The size cap reaches projected kinds only,** a forward amendment to D10 (§ 2.6). It guards against an accidental
  file, which history keeps for good, and only a hand edit through write-back or `arc save` brings one; a kind that is
  never projected is written only by ARC's verbs. A Candidate record breaks a cap over every kind in ordinary use: one
  work unit's reached 2.67 MB, and 20 versions in this repository's code history are over the cap.
- **Reads follow the same scope:** a listing reports a stored record over the cap as `oversized` (D4) only for a kind
  the cap reaches, so a never-projected record over it lists and reads as any other.
- **`store.git-path` keeps one record from wedging every push.** A receiver that checks objects (`receive.fsckObjects`)
  refuses a tree holding a `.git` segment and checks every `.gitmodules` blob as submodule configuration, every
  `.gitattributes` as attributes, and every name's length. Probed on Git 2.55: a tree holding `scratch/.git/config`,
  `.GIT`, or `git~1` was refused (`hasDotgit`, `unpacker error`), and a two-ref push with one such ref landed neither; a
  `.gitmodules` declaring an option-like path or URL was refused (`gitmodulesPath`, `gitmodulesUrl`) while one holding
  prose was not; a `.gitattributes` with a 3,000-character line, or one that is a folder, was refused
  (`gitattributesLineLength`, `gitattributesBlob`) while a short one was not; and a 4,097-byte entry name was refused
  (`largePathname`) while 4,096 bytes was not. So the rule refuses each name whole rather than repeat Git's content
  checks. The push loop sends every pending ref in one `--atomic` push (§ 6.7) and store history is never rewritten, so
  one such commit would hold back every later push from the clone. A personal document's `path` key can produce any such
  segment, so the rule reads every kind's stored path. An `id` key or a slug embedded in a longer name can reach the
  length limit too, and an archive, a close, or a rename forms names no put carries — a quarter folder, and the new name
  of each record a rename moves — so the rule bounds every owner's name and every key combined with other name
  coordinates at 2,040 bytes: half of 4,096 less the 16 bytes `housekeep-<key>-<person>.json` adds, so no name formed
  from one name and one key passes 4,096 bytes, whenever it forms. A companion key that `expandStoredPath` stores
  verbatim carries no owner slug, so its whole path is exempt alongside a personal document's path; its segments retain
  the 4,096-byte bound (A5). A rename's put carries the new name in its reference, as the shared suite's
  `former-slug-after-rename` writes it (`__tests__/helpers/store/suite-lookup.ts`), so the bound meets it there. The
  import's build refuses alike, so a disk-only file at such a path lists in the trial's `refused` (§ 10.10).
- Today's notes sync saves only a file whose name `isAllowedFile` admits — an extension on a text allowlist, `.env`,
  `.ipynb`, and `.svg` excluded, or an extensionless name in `KNOWN_EXTENSIONLESS` — skips every path with a
  dot-prefixed segment and every `README.md`, and caps files at 256 KiB (`serialize`, `lib/git/user-sync.ts`), with no
  test of content and none for private keys; those rules retire with notes, and these replace them from the flip.

### 6. Sync

#### 6.1 Pull, push, and the firing points

`pull` fetches and merges, and `push` publishes (§ 2.1). Session start under `session.remote_sync` and a deciding verb
before it decides call `pull`; every firing point — handoff, a lifecycle transition, `arc sync` — calls `push`, whose
loop pulls first (D12). Expected contract: `arc sync` keeps its name and runs both, as Fossil's `sync` pulls then
pushes, once the cutover rewires it onto the contract.

**A deadline bounds each, so a session never stalls on the store** (D4). A `pull`, and a `push` with the pulls its loop
runs, ends within 120 s of its start: a Git call still running then is aborted through the executor's `signal`
(`GitExecOptions`, `lib/git/exec.ts`), which ends the call's whole process tree, a transport helper or a hook among it,
and settles without waiting on a descendant's output — probed on Git 2.55, aborting only `git` leaves an HTTP fetch's
`git-remote-http` helper holding the call's output pipe, and the call unsettled — and the remote's outcome is `failed`
`unreachable` with cause `timeout` (`RemoteFailureReasonSchema`, `lib/kernel/schema/vocabulary.ts`), carrying the
notices of what did apply (§ 2.2). The writes stay local for the next firing point. An aborted push may have landed,
which the next pull's fetch reads as any remote movement (§ 6.4). A deadline that passes between the push loop's
attempts ends it as § 6.7 has it. A move's transfers take no deadline (§ 10.2), since a person runs a move once and a
large state may outlast any bound.

#### 6.2 The fetch

- **Into a namespace of its own.** A fetch lands in `refs/arc-remotes/<remote>/…`, outside `refs/remotes/` (D10) and
  outside `refs/arc/`, so no push, manifest, or listing reads it: Git's remote-tracking convention one namespace over.
- **Refspecs on the command line,** one wildcard each, so a fetch stays one round trip: `refs/arc/work/*`,
  `refs/arc/cohort/*`, `refs/arc/archive/*`, `refs/arc/project/*`, and the person's own two refs as one-ref patterns,
  `refs/arc/user/<id>/personal*` and `refs/arc/user/<id>/claims*`, each mapped to
  `refs/arc-remotes/<remote>/<the same path below refs/arc/>`, with no `+`. The other refs there — `errands`,
  `errands-remote`, and `sync-state` (§ 3.1) — match neither, so none arrives.
- **Flags:** an empty `--refmap=`, so configured refspecs update nothing else; `--no-tags`; `--no-filter` and
  negotiation over state alone (below); `--prune`, which reaches only the listed namespaces; `--show-forced-updates`,
  which keeps the ancestry check on whatever `fetch.showForcedUpdates` says (§ 6.3); and `--porcelain` (Git 2.41), whose
  per-ref lines the pull reads. It runs under `LC_ALL=C`, as the push does, so a failure's cause reads the same in every
  locale (§ 11.5), and with the lock waits of store writes (§ 11.2), since every checkout of the clone updates the same
  tracking refs.
- **Every state object arrives with its fetch,** a partial clone's too, so no read fetches (§ 11.6). `--no-filter` keeps
  a partial clone's filter (`remote.<name>.partialclonefilter`) off state. A fetch that names a code commit as held lets
  the remote omit a state blob that also occurs in code history, which a blobless clone never received, as each record
  the import lands with a tracked file's bytes does — every non-JSON record, and every JSON record already canonical, as
  each tracked Candidate, boundary, and transition record in this repository is (§ 3.5, § 10.8): on Git 2.55, fetches
  that named code commits left one missing from origins with and without bitmaps. So the fetch names as held only state
  commits:
    - `--negotiation-tip` for each of § 3.1's ref patterns, and the tracking namespace `refs/arc-remotes/*`, that names
      a ref, or, where none does yet, `--refetch`, which names nothing as held under either protocol version. Tips that
      match nothing would name nothing under protocol v2 too, but Git warns of each such pattern.
    - A blank `-c remote.<name>.negotiationInclude=`, since Git 2.55's setting adds the refs it names to the tips; an
      older Git ignores the key.
    - The tips leave out the rest of `refs/arc/`, whose residue in this repository points at code commits (§ 3.1), and
      use `--negotiation-tip`, older than the 2.47 floor (§ 11.3), which Git 2.55 keeps as an alias of
      `--negotiation-restrict`.
- **A partial clone checks each fetch.** The tips confine what Git names as held only where the remote advertises the
  state refs alone, as protocol v2's ref prefixes have it; under protocol v0 Git also names advertised refs this clone
  holds, code branches among them, whatever the tips say. So after each fetch in a partial clone,
  `git rev-list --objects --missing=print` over the fetched tips, short of the tracking tips the fetch found, lists any
  object it left out; on any, the fetch runs once more with `--refetch`, and one still incomplete fails that remote as
  terminal `refused` naming the missing objects. A clone with no filter holds every object reachable from what it names
  as held, so it skips the check.
- **Every other fetch the store makes** — a move's (§ 10.2) and a read source's (§ 9.6) — takes the same flags and the
  same check.
- **A history ref by name** is fetched as a one-ref pattern, `refs/arc/history/work/<uid>*` or its `cohort/` twin: a
  refspec naming a ref the remote lacks fails the whole fetch, its other refspecs included, where a pattern that matches
  nothing fetches nothing, and a UID's fixed length keeps the pattern to its one ref. A pull's by-name fetches from one
  remote run as one fetch where they can: those named before it — `pull({ history })`'s and the push loop's own (§ 6.5)
  — ride the namespace fetch, and those its merge finds (§ 6.4) take one more. A ref `history` names is asked of every
  remote the pull fetches (§ 9.6).
- **No refspec joins the code remote's configuration** (D12). The separate layout's directory is ARC's own and may carry
  its remote's refspecs in its configuration; the backend passes them on the command line in both layouts.

#### 6.3 The ancestry check

- **Git's refspec rule is the check.** The refspecs carry no `+`, so Git moves a tracking ref only forward and reports
  each refusal on its porcelain line. The tracking ref is the last head seen, shared by every checkout of the clone, so
  no per-checkout record exists (D11). Git skips the rule where `fetch.showForcedUpdates` is false, moving the ref as if
  it fast-forwarded, and store commands read the person's global configuration (§ 9.7), so every store fetch passes
  `--show-forced-updates`, which keeps it (§ 6.2).
- **A prune would erase it,** so a pull that prunes a tracking ref whose item has not ended (§ 6.4) — never the
  forwarding record's, which is replaced rather than advanced, so that its return is a new record (below) — first keeps
  its last tip at `refs/arc/tmp/seen/<remote>/<path>`. When the ref returns, Git creates its tracking ref anew and
  refuses nothing, since no rule guards a ref it does not hold, so the check is the backend's, on the fetch that
  recreated it: the returned tip must descend from the kept one, or be an ancestor of it — a machine that missed the
  later pushes restored what it held, a loss this clone's next push repairs as a fast-forward. A tip that does neither
  fails the check: the pull deletes the tracking ref the fetch created, keeps the kept tip and the local ref as they
  were, applies every other ref, and reports the `history-diverged` notice a refused ref gets, with its three remedies
  (below). The push loop's listing then compares that ref's local tip with the kept tip in place of the deleted tracking
  ref, so it lists the ref only where this clone holds writes past the kept tip, which end the loop as a refused ref's
  do (§ 6.7), and every other ref publishes. The kept tip goes once a tracking ref exists that this check passed, or
  that the person's forced fetch set — taking theirs or merging both — so neither remedy meets the check again; keeping
  ours pushes the local tip, which the next fetch returns as descending.
- **A ref this clone never saw** has no last head to refuse against.
- **A `!` line is read by ancestry, never by text.** Git marks a refused non-fast-forward and a failed local update
  alike — a lock held past the wait, or a stale lock file a killed Git process left — and only its message text tells
  them apart. Where the line's old tip is absent, or its new tip descends from the old one
  (`git merge-base --is-ancestor`, over the objects the fetch brought), Git refused no history: the pull keeps that
  ref's tracking and local tips, applies every other ref, and reports a `tracking-update-failed` notice (§ 2.2) naming
  the ref, with the remedy to pull again and, where it repeats, to remove the stale lock file. Only a `!` line whose new
  tip does not descend is a refused ref. The forwarding record's tracking ref is the exception: a record is replaced,
  never advanced (§ 10.6), so a `!` line for it sets that tracking ref to the fetched record by `git update-ref`, the
  refused fetch having brought its object, as probed on Git 2.55, and is never a refused ref or a notice.
- **A refused ref** keeps its tracking and local tips, every other ref in the fetch applies, and the pull reports a
  `history-diverged` notice (§ 2.2) naming the ref and both tips, with a remedy giving the three ways out as Git
  commands: keep ours, a push of the local tip leased on the observed remote tip; take theirs, a forced fetch of the
  tracking ref and the local ref moved to it; or merge both, a forced fetch of the tracking ref, after which the next
  pull merges it as tips that share no ancestor merge (§ 6.4). Each command runs against the store's own repository —
  naming the store directory with `--git-dir` in the separate layout — and names the state remote as the push does, by
  name or by URL (§ 9.7), and each forced fetch carries § 6.2's flags, `--no-filter` and the state-only negotiation tips
  among them: probed on Git 2.55, a forced fetch by remote name in a fresh blobless clone inherits the clone's filter
  and leaves a state blob missing, which `--no-filter` brings. Keeping or taking discards one side's history and merging
  brings back whatever a rewrite removed, so the choice is the person's, and no verb is built for a case this rare. A
  push holding unpublished writes on a refused ref ends before pushing (§ 6.7).
- **What triggers it:** a whole-repository rewrite such as `git filter-repo`, which D10 names, or a mirror push. One from
  a clone without ARC's refs deletes them, and every machine's next push restores its own copy (D10's risk); one from an
  ARC clone sets each state ref to that clone's tip. Where the restored copies differ — one machine held pushes another
  never pulled — the restored ref refuses here, and merging both is the way out.

#### 6.4 Merge after fetch

- **Fast-forward where one tip descends from the other:** the local ref moves to the tracking tip, or waits to push.
- **Otherwise a merge commit** with both tips as parents — this clone's tip first and the tracking tip second, as every
  merge the backend makes takes the local side first: a late write's or an end's (§ 6.6), and a copy's, whose
  destination is the local side (§ 10.4), which `history` orders by (§ 3.6) — its tree from merging each record by its
  kind's mechanism (`lib/store/concurrency/`) against the merge base, and each metadata file field by field (§ 3.3). A
  single-writer record changed on both sides becomes a conflict record (D4, D12), and so does a merge-kind record whose
  merge base or either side repeats an entry `_Id:_` (§ 5.2), which only a commit made outside ARC leaves. Tips that
  share no ancestor merge against an empty base, as `git merge --allow-unrelated-histories` does, since shared refs are
  made separately: two machines' first archives into a new quarter, or a contributor's registry joining a team's. A
  record one side removed and the other left as the merge base had it stays removed: the merge base decides, never an
  older copy, so no older state brings a deletion back. The merge runs under the ref's lock and compare-and-swap like
  any write (§ 5.1), with the provenance of § 5.5; history stays immutable, and the next push is a fast-forward, as
  git-annex union-merges its branch.
- **A quarter's merge renumbers.** Where both sides archived into one quarter, every work unit's folder this clone has
  not published takes the next sequence after the highest the remote side holds, in this clone's own order, its folder
  renamed in the merge, and a published folder keeps its number. A cohort folder that took a member's number takes that
  member's new number, and one that took the quarter's next is renumbered as a work unit is (§ 7.6). Every pull's merge
  does this, the push loop's among them, so a pull before a push never leaves two folders one number (§ 7.1).
- **A completed item's folder is never merged on its own.** Where one side changed a folder the merge base holds and the
  other left it, the quarter's merge takes that side's folder. Where one side removed it — a reopen (§ 7.2) — and the
  other changed it, the removal holds, as § 6.5 and § 6.6 have it, and the change reaches the item through the reopen
  rules below, or through a pending end where the item has ended again. Where both changed a folder both still hold —
  two machines' writes to the completed item (§ 7.3) — the pull fetches the item's history ref by name, in the fetch its
  pending ends take, merges it as any ref, and rebuilds the folder from the merged tree, its metadata's `batch` naming
  the batch the pull mints for the folder and that merge (§ 3.1, § 3.3), so the writes' conflict records are filed once,
  on the history ref (§ 3.7). A fetch that fails leaves the folder and the history ref as this clone held them and fails
  the remote's outcome as a pending end's fetch does (below); one that succeeds without the history ref leaves them the
  same way and reports the `end-pending` notice a pending end's fetch reports then, with its remedy, and every other ref
  applies. Every merge of a completed item's history ref that changes its tree — this one, a by-name fetch's (§ 6.2),
  and a late write's or a withdrawn end's (§ 6.6) — rebuilds the folder the same way, and only where the merged history
  ref's log holds the batch the folder's metadata names, so no rebuild drops a write another machine's refresh carried;
  a copy that lacks it leaves the folder as the quarter's merge left it until a pull by name brings the ref (§ 7.3).
- **Checks report; they never gate a merge,** since both sides are already published. The backend runs each merged
  record's write check over the result, with `before` the local tips the pull found, and reports each broken rule as a
  `rule-broken` notice, storing nothing. Nor do the serialization rules gate one: a merged record that breaks a rule is
  stored, and one over the cap lists `oversized` (§ 3.1). Readers report that state as any state gone stale — D14's slug
  clash between machines among it, which status lists and a rename resolves.
- **A lifecycle move is read from its record, never from a ref's absence or return.** Every end's record reaches a
  fetched ref no later than the atomic push that deletes the live ref: an archive, an Errand's close, and a cohort's
  close join the quarter's ref in that push, and an abandon or a decomposition writes the registry's lineage there too,
  or in an earlier push where the lineage came first, beside the live primary (§ 7.4). A reopen removes the item's
  folder from every quarter's ref holding one (§ 7.2).
    - **Another machine's end** is read from state on every pull, never from which merge brought its record. After the
      merge, an item has a pending end where its end record stands beside a copy of the item this clone holds that has
      not applied that end, whether this pull's merge or an earlier one brought the record. A quarter folder does beside
      a live ref, or beside a history ref whose log lacks the folder's `endBatch` (§ 3.3) — the archive or close that
      wrote it, which no later write refreshing the folder changes (§ 7.3) — this clone's own unpublished end (§ 6.6)
      among them. A lineage record the fetched registry holds does only where the fetch left the item's live tracking
      ref absent: beside a live ref, but for one this clone's own unpublished reopen brought back (§ 6.6) while no
      history ref the pull fetches by name holds an end that live ref's log lacks, and beside a history ref holding this
      clone's own unpublished end. An end the live ref's log lacks is another machine's reopen and end, made after this
      clone's reopen read the ref, since the reopen moved the ref back holding every end it read; so it comes after both
      reopens, as § 6.6 orders a clone's own end after them, and holds. Neither reading takes the item's tracking
      history ref as the pull found it, which another worktree's by-name fetch moves (§ 6.2) and nothing moves when
      another machine's reopen deletes the history ref it names; the second reads only what this pull fetches by name.
      Lineage beside a live ref the remote still holds is no end, since a write may create the lineage before the write
      that removes the primary ends the item (§ 7.4), and a history ref's records tell nothing, since an item may hold
      lineage beside its archive (§ 6.6) and a late write files conflict records on an abandoned item's history ref. A
      history copy that missed a reopen and a lineage end both made between this clone's pulls stays as it was until a
      pull by name, which no read needs: an ended item's reads refuse from its lineage (§ 7.3). A clone that reopens and
      ends an item between pushes publishes only the history ref and the record, never touching the live ref on the
      remote, so the record is the only sign of its end; reading ends from anything else would let two such clones both
      publish ends. The same pull fetches by name, in one fetch, the history ref of every item with a pending end, and
      the end meets what it holds: a live ref merges into the fetched history ref and moves under `refs/arc/history/`
      (§ 6.6); this clone's own unpublished end meets the rule for two ends (§ 6.6); and a history ref merges. The test
      reads the history refs as this clone held them before the pull: one fetched by name ahead of the merge —
      `pull({ history })`'s or the push loop's (§ 6.2) — merges only after the test, and only for an item with no end
      pending; an item with one meets it as above. A by-name fetch that fails leaves every end it served pending, the
      live ref in place: the state remote's outcome is `failed` with the fetch's cause, carrying the notices of what did
      apply (§ 2.2), the next pull finds the same state and applies it, and the push never lists a live ref whose item
      has a pending end (§ 6.7), so no lease on absence recreates a ref an end deleted. A by-name fetch that succeeds
      without the history ref — the remote lost it, as the mirror push D10 names loses state refs, while the end record
      survived — leaves the end pending the same way, and the pull reports an `end-pending` notice (§ 2.2) naming the
      item and its history ref, with § 7.3's remedy that a clone holding the ref push it back; the pull that then brings
      it applies the end. An ended item this clone never held stays unfetched, as D10 keeps history refs out of the
      default fetch, so a fresh clone's first pull fetches none.
    - **Another machine's reopen** is read from state the same way: a history ref this clone holds, with no unpublished
      end of its own on it (§ 6.6), beside a tracking ref for the item's live ref, with no folder for the item in the
      merged quarter's ref, is a pending reopen, applied as § 6.6 has it whichever pull's merge brought the folder's
      removal; it needs no fetch beyond the namespace's. Lineage does not hold a reopen back, since lineage beside a
      live ref the remote holds is no end (§ 7.4): a reopened item whose owner writes its lineage before removing the
      primary, as an abandon may, still reopens on every clone. A live ref back with its folder still in place is a
      restore by a machine that missed the end, which the end meets as it meets a late write; one back beside lineage
      alone, as the mirror push D10 names can restore an abandoned item's, reads as a reopen that keeps the end's
      removals.
    - **A pruned tracking ref with no end record** — none, other than one this clone wrote, in the merged quarter refs
      or lineage — means the local ref was never pushed or the remote lost it, as a mirror push loses state refs, and
      the next push restores it.
- **Moving the ended ref** means no later push recreates the live ref, and `changes` and a read as of an earlier manifest
  find the item locally. These are tombstones, as CouchDB deletes by writing a `_deleted` revision, and the reasoning D10
  gives for keying refs by UID.
- **A read source is never merged** (§ 9.6); a contributor's store only adopts its project ID (§ 9.8).

#### 6.5 Leases

- **Every push of a work item's or cohort's ref,** live or under `refs/arc/history/`, is leased on its tracking ref's
  value — the tip last seen — or on absence where it has no tracking ref, for a ref this clone never saw or one a prune
  removed, never on the tip § 6.3 keeps after a prune, which the remote no longer has; **so is every delete,** which is
  never a fast-forward. Another machine's lifecycle move deletes exactly those refs, so an unleased push recreates one:
  a live ref another machine's end deleted between the push loop's pull and its push, or a history ref, outside the
  default fetch, that another machine's reopen deleted.
- **The quarter, registry, inbox, and identity refs push plainly,** as fast-forwards; no move deletes them.
- **A matching lease lifts Git's fast-forward check,** so a leased update stays a fast-forward because the backend
  pushes only a commit that descends from the tip it leases, which the push loop checks under its locks (§ 6.7), never
  because Git checks.
- **`stale info` joins D12's retry set** as a lost race, a forward amendment to D12 (§ 2.6).
- **A delete that loses its lease to a write** merges the remote tip it lost to and leases again on that tip, so the
  lifecycle move holds rather than undoing: an end merges it into the local history ref (§ 6.6), and a reopen, whose
  history-ref delete loses to another machine's write to the completed item, merges it into the local live ref, its
  quarter merge keeping the folder's removal. One that loses to another machine's end meets the rule for two ends, and a
  reopen's that loses to another machine's reopen and end — an end past the tip the reopen read — yields to it, the live
  ref ending as § 6.4 has it.
- **The push loop's pull fetches by name each history ref its push creates, updates, or deletes** — a create among them,
  since one loses to a ref another machine restored first. Where the push deletes that ref for this clone's own
  unpublished reopen, the fetch moves the tracking ref the delete leases on, so another machine's write to the completed
  item would never lose the lease: the pull merges the fetched tip into the local live ref first, as a reopen whose
  delete lost its lease does (above), unless that tip holds an end the live ref's log lacks, which ends the item
  (§ 6.4).

#### 6.6 Late writes and ends

- **A late write meets an end by merging into the item's history ref,** never by undoing or replaying the end, so the
  end's other writes — lineage, a decomposition's children, the archive number — stand as written. Where the late write
  changed a record the end also changed, an abandon's or a decomposition's removals among them, the end's version stays
  current whichever side is remote, and the late version is kept in a conflict record on the item's ref: a forward
  amendment to D4 and D6, which keep the remote's version current (§ 2.6). A record only the late write changed merges
  in.
    - An archived item's quarter folder is refreshed from the merged tree, as any write to a completed item refreshes it
      (§ 7.3), so reads and listings of the completed item find its conflict records.
    - An abandoned or decomposed item reads `not-found` (D9), so the pull's result names it and its conflict records in
      an `ended-with-conflicts` notice.
- **An end's leased delete that loses to another machine's write** merges that remote tip into the local history ref and
  leases the delete again on the tip it merged.
- **A pull that applies another machine's end while this clone holds unpublished writes to the item** merges the local
  ref into the fetched history ref before it moves; the next push fast-forwards the history ref, leased (§ 6.5).
- **A pull that applies another machine's reopen** — its removal of the folder, with the item's live ref back in the
  fetch while this clone holds its history ref — mirrors that: the reopen holds as an end does, so unpublished writes on
  the local history ref merge into the fetched live ref, the local history ref goes, and the quarter's merge keeps the
  folder's removal, so a write made to the completed item lands on the reopened one.
- **This clone's own unpublished end, made after a reopen of its own,** meets a fetched reopen as an end meets a write:
  both reopens made the same move and its end came after both, so the backend merges the fetched live tip into its
  history ref and leases the live ref's delete on that tip. A live ref back without the folder's removal meets the end
  the same way.

**This clone's own unpublished end,** here and in § 6.4, is an end this clone made whose record — its quarter folder, or
the lineage it wrote or relied on (§ 7.4) — it still holds, and which no tracking ref of the item, live or history,
reaches. An end it withdrew, or undid by a reopen of its own, is none, and so is another machine's end that a reopen has
since moved under the live ref, since a lifecycle move is read from its record (§ 6.4): reading ends from the history
ref's log against its tracking ref alone would take any of these for one still standing, and delete a live ref with no
end record published.

**This clone's own unpublished reopen,** in § 6.4 and § 6.5, is one whose record this clone holds unpublished: its
quarter ref has removed the item's folder, which the tracking quarter ref still holds. A reopen another machine
published removed the folder there too, and a reopen of this clone's own unpublished end removed a folder no tracking
ref held. It is read from that record (§ 6.4), never from the item's tracking history ref, which only a by-name fetch or
this clone's own push moves, so it can still name a history ref another machine's reopen has since deleted: read from
it, a clone that applied that reopen would take it for its own and push the live ref back over an abandon published
after it.

**Two ends of one item: the first published holds.** Two machines may end one item before either syncs — an archive on
one and an abandon on the other, or two archives, each perhaps after a reopen of its own.

- When a pull applies another machine's end while this clone holds its own unpublished end — whether the push loop's
  first pull reaches it or a leased delete lost to the ref's absence first — the backend **withdraws its own end,** none
  of which has published, rather than leasing the delete again on that absence.
- **The withdrawal is one local transaction** writing the inverse of every write the end made, found by the end's batch
  ID (§ 3.1), and of a lineage record this clone wrote for the item in an earlier batch still unpublished, which the end
  relied on (§ 7.4): a commit on the item's ref restoring each record the end's final commit removed or changed; its
  lineage record removed where it is still the current record, and where the published end's lineage holds that path
  instead — two abandons or decompositions of one item write one `lineage/<uid>.json`, whose merge keeps the published
  record and files the withdrawn one as a conflict record (§ 6.4, § 3.7) — that conflict record removed and the
  published lineage kept; its unpublished quarter folder removed; a cohort the end's batch closed reopened as § 7.6
  reopens one, unless the published end's batch closed it too; each entry whose `_Id:_` line the end's batch added to an
  inbox taken back out, unless the published side, once merged, holds it; and the routing receipts the end's batch wrote
  removed, unpublished as the rest of the end is, as the conflict record it filed is, so no other clone read them, no
  published receipt is edited (D11), and the withdrawal writes no receipt of its own. A decomposition's children stay as
  items of their own.
- **Then only the writes this clone made around its end** merge into the published end's history ref, as a late write's
  do, so a record both sides changed keeps the published version and holds the withdrawn one in a conflict record (D6).
  The pull's result names the item and the end withdrawn in an `end-withdrawn` notice, a push's through its `pulls`
  (§ 2.2).
- **Two ends both published** — once a mirror push erased the first (§ 6.3), or where lineage written beside the live
  primary, which ends nothing (§ 7.4), stands beside the item's archive or close — cannot be ordered, so the pull
  reports an `ended-twice` notice naming the item and both ends, with the remedy that clears every end record: remove
  its lineage record where it holds one — a removal, which a create-only record allows (§ 5.2) — then reopen it, which
  removes every folder it holds, in every quarter's ref (§ 7.2), and end it once.

#### 6.7 The push loop

1. **Pull** (§ 6.1–6.6), its outcomes kept for the result's `pulls` (§ 2.2).
2. **List** the refs to push: every store ref whose tip differs from its tracking ref or has none — a ref whose returned
   tip failed § 6.3's check compared with its kept tip instead — and every delete an end or reopen owes, but never a
   live ref whose item has a pending end (§ 6.4), which waits for the pull that applies it. Take their locks in ref-name
   order (§ 11.4) and list again; a batch that creates a ref grows the listing, and a grown one releases every lock held
   and takes the larger set in order, so the order holds.
3. **Read the tips under the locks, each listed ref's tracking tip among them, then release them** before the network
   call. Each ref pushes leased on the tracking tip read here (§ 6.5); where that tip is not the one step 1's pull
   merged — another worktree's fetch moved the shared tracking ref since (§ 6.2) — a ref pushes only where its local tip
   descends from it (`git merge-base --is-ancestor`), never a delete, which has none, else nothing pushes and the loop
   repeats from step 1, as for a lost race, whose pull merges what moved. A ref is left out of the push where its tree
   holds records but no metadata file that parses, or where the pull kept it from a remote tip whose file does not parse
   (§ 3.3), as is a live ref step 2 skips for a pending end; every ref an unpublished batch spans that spans a ref left
   out is left out too, repeated until none is added, so a push still never publishes part of a batch. A family takes
   the outcome `failed`, terminal `refused`, naming the ref, with § 3.3's forward repair or the `end-pending` notice's
   remedy (§ 6.4), where an unpublished batch spans a ref of it left out: some of this clone's writes in it stay local,
   whatever else of it pushes. A ref left out that no unpublished batch spans — listed only because the remote moved or
   deleted its tracking ref — reports through its pull's `namespace-corrupt` or `end-pending` notice alone, and its
   family takes the status of what it pushed. Every other ref pushes.
4. **Push** explicit `<oid>:<ref>` pairs — leases per § 6.5, `--porcelain`, and `--atomic` when the push names more than
   one ref (A7) — so a push never publishes part of a local batch, which a reader of the files format can see
   mid-transaction. First the loop reads the clone's designation again: where a move, a follow, or a setting switched
   its state remote since step 1 (§ 10.3), nothing pushes and the loop repeats from step 1, so a push composed before a
   switch never reaches the old remote after it, but for one already in flight (§ 10.6).
5. **Classify** the outcome (§ 6.9). On each per-ref `ok` line the loop sets that ref's tracking ref to the pushed tip,
   or deletes it for a pushed delete, where it still holds the tip step 3 read — in both layouts, and for a push by URL
   (§ 9.7) — since Git moves a remote-tracking ref on push only through a configured fetch refspec, and the store
   configures none (§ 6.2); so the next listing reads what this push published as published and an owed delete as paid,
   as the reference backend resets its publication base after each publish (`finishPublish`,
   `__tests__/helpers/store/sync.ts`). A lost race sleeps and repeats from step 1, as does a refusal read by state,
   which the repeat's fetch settles as a lost race or as terminal; a terminal refusal ends the loop.

- **A diverged ref ends the loop.** Where the loop's pull refuses a ref (§ 6.3) that step 2 would list, since this clone
  holds unpublished writes on it, no attempt can land it: its lease names the tracking tip the refusal kept, and a plain
  push meets the rewritten tip, so each would read as a lost race until the deadline, and the atomic push would hold
  back every other ref with it. The loop ends at once, before any push, with one `failed` outcome naming every family of
  the push's scope, terminal `refused` naming the ref, and the `history-diverged` notice in the result's `pulls` gives
  the ways out. A `tracking-update-failed` ref retries, since a held lock clears, and the deadline bounds a stale lock
  file, whose notice names its remedy.
- **A pull that fails the state remote ends the loop** before any push, whatever the cause — a partial-clone fetch still
  incomplete (§ 6.2), a failed by-name fetch (§ 6.4), a remote it cannot reach, or the deadline (§ 6.1). The result's
  `pulls` carries that `failed` outcome with the notices of what did apply (§ 2.2), and `publishes` one `failed` outcome
  naming every family of the push's scope with the same failure, so no attempt spins to the deadline on a ref no push
  can land.
- **A carried ref pushes even where the push publishes no state** — under a state that stops that sync (§ 2.2), on a
  diverged ref, or after a pull that fails the state remote — alone to its destination, a plain push of that one ref
  where code and state share a receiver, as D12's code leg pushes independently of the state leg, within the push's
  deadline; `carry` reports its outcome (§ 6.8), `no-push-destination` on a clone with no code remote.
- **Backoff:** exponential with full jitter — each sleep drawn uniformly from zero to the lesser of 10 s and the last
  push's duration doubled per retry — so it scales with the host's push time; no lock is held across a sleep, which
  Gerrit's first sequence retry did and blocked every other writer.
- **Deadline:** 120 s from the loop's start, bounding it rather than an attempt count. Twenty machines pushing one ref
  at once settled in 25–60 s on the hosts tried. Expiring between attempts, the loop returns `retries-exhausted` with
  its retry count and time waited; expiring during a Git call, it aborts the call, and the outcome is `failed`
  `unreachable` with cause `timeout` (§ 6.1). Either way the writes stay local for the next firing point.
- **One publish outcome per status, and one `failed` outcome per failure,** where the push syncs with its state remote,
  its families those of the push's scope with that status or failure — step 3's `refused` for the families a left-out
  batch spans, beside a later `retries-exhausted` or `unreachable` for the rest, since a failure carries one code
  (`PublishFailureSchema`, `lib/store/refusal.ts`) — so every declared family is named once whether or not it pushed a
  ref — identity families only with an identity, and the `no-identity` state naming them without one — each outcome
  carrying the loop's retry count and time waited (§ 2.2). A family's status is `reconciled` where the loop's pulls
  brought remote movement into one of its refs, whether or not it then pushed; `pushed` where it pushed with none; and
  `noop` where neither, as the shared suite's sync items expect (`__tests__/helpers/store/suite-sync.ts`). Under a state
  that stops that sync — `no-remote`, `designation-ambiguous`, `move-incomplete`, `moved`, or `designation-needed` —
  `publishes` is empty, as that suite expects for `no-remote`, and a carried ref still pushes, as above.

#### 6.8 Carrying a code ref

- **`carry`** names a code ref that rides the state push: in the same `--atomic` push where the code remote is the state
  remote and receives atomic pushes, or otherwise first, as D12's ordered code leg, then the state leg. A clone with no
  code remote has no destination for it, as Git has none: the push runs with state alone and `carry` reports `refused`
  with `no-push-destination`.
- **`expect`** names the remote tip a rewritten branch replaces, pushed as `--force-with-lease=<ref>:<expect>`, so a
  branch rewritten under a history policy that rewrites with a lease rides the push too; without it the carried ref
  pushes as a fast-forward.
- **The carried ref's own rejection ends the code leg and is never a lost race for state:** its `non-fast-forward`,
  `fetch first`, or `stale info`; a server refusal whose line names its own cause; a commit-time failure the loop
  attributes to it (§ 6.9); or a pre-push hook's refusal. The push repeats with state alone, as D12 has the state leg
  push alone when the code leg cannot, and `carry`'s outcome reports the refusal (§ 2.2).
- **An ordered code leg whose remote cannot be reached** — the code remote, or a fork member's fork, where state goes
  elsewhere — fails before any per-ref line. `carry` reports it `unreachable` with its cause, read by
  `classifyRemoteFailure` as a fetch's failure is (§ 11.5), and the state leg still pushes, since D12 keeps the legs
  apart.
- **The carried ref runs under the push's deadline** (§ 6.1), as every leg does: once the deadline has passed its leg
  never starts, so a loop ending on `retries-exhausted`, or on a pull that timed out, with the carried ref not landed
  reports `carry` `unreachable` with cause `timeout`, and a caller can tell a code ref that never pushed from one that
  did.
- **A pre-push hook** runs before Git sends anything, so its refusal prints the hook's text and
  `failed to push some refs`, exits 1, and prints no per-ref status. A push carrying a code ref that ends that way
  repeats with state alone, which a hook gating only code refs passes, and reports the hook's text verbatim as
  `hook-declined`'s message; a hook that refuses a push of state refs alone ends the loop as terminal `refused`, its
  message carrying the hook's stderr verbatim (§ 6.9). A hook also runs on every attempt — every state push and every
  retry, the code repository's in the default layout and any `core.hooksPath` the person's global configuration sets in
  the separate one — and its time counts against the deadline, so a slow hook, such as one running tests on push, can
  expire the loop at every firing point: a residual. The `timeout` outcome's remedy names it: a hook reads the refs
  being pushed on its standard input, as Git hands every pre-push hook its refs, and can pass a push of `refs/arc/*`
  alone without running.
- **The store only pushes a carried ref,** never fetches or merges it.

#### 6.9 Classifying a push

The loop reads `git push --porcelain`'s per-ref lines and the exit code, never prose, except where a line carries the
server's text, which it reads only as the named cases below. Text it never classifies it still reports: a terminal
`refused` outcome's message carries, verbatim and unparsed, the `remote:` lines the server printed — a server hook's
reason among them, since the per-ref line says only `pre-receive hook declined` — and a pre-push hook's stderr, so a
person reads the refusal's own reason, as the shared suite's `remote-refusing-with-success-after-repair` item asserts
(`__tests__/helpers/store/suite-sync.ts`).

- **A client-side `rejected`** — `non-fast-forward`, `fetch first`, `stale info` — is a lost race.
- **A `remote rejected`** carries the server's text, read under `LC_ALL=C`: `cannot lock ref`; stock Git's
  `incorrect old value provided`, `reference already exists`, and `reference does not exist`, which a server reports for
  an update, a create, and an update or delete whose ref moved after the client's lease check passed; and Azure DevOps'
  `TF401028` are lost races. Any other on a state ref is read by state, as a race the server catches at its commit is
  (below): a lost race when the ref's remote tip at the loop's next fetch differs from the old value the push expected,
  terminal `refused` with the message when it does not. A stock Git 2.43 server prints `failed to update ref` for each
  of those races, and for failures that are not races.
- **`--atomic` marks every ref beside the one that failed** `atomic push failed`, or `atomic push failure` from the
  server. Those collateral lines carry no cause, so the push reads as the refs whose lines do, a carried ref's first — a
  lost race when each reads as one, terminal otherwise.
- **A race the server catches at its commit** marks every ref `atomic transaction failed` and names no cause, in the same
  lines whether the carried ref or a state ref raced, so it is read by state: the loop's next fetch compares each pushed
  state ref's remote tip with the old value the push expected, and with a ref carried, one `ls-remote` of it reads its
  remote tip, fetching nothing.
    - The carried ref refused its own leg when its lease names a tip other than that one, or, carried without a lease,
      when its pushed commit no longer descends from that tip (`git merge-base --is-ancestor`, which refuses a tip this
      clone lacks, so a missing tip counts as not descending). A leased rewrite never descends from the tip it replaces,
      so its lease alone decides.
    - A state ref that moved makes a lost race. Both can hold at once.
    - Neither holding, the push is terminal `refused` with Git's text, so an unleased code ref raced to a commit the
      pushed one still descends from reads terminal, and the next firing point pushes it.
- **Atomic capability is classified, never probed:** `ls-remote` talks to the fetch side and cannot see the receiver's
  `atomic` capability. A receiver without it fails before any per-ref status with
  `the receiving end does not support --atomic push`, read under `LC_ALL=C` from Git's message text, since Git reports
  it no other way: one of the three named reads that amend D4 (§ 2.6). With a carried code ref the push falls back to
  D12's ordered legs: the code ref alone, then the state leg, where one ref pushes ordinarily and several end in A7's
  terminal `refused` naming the capability and the remedy to enable an atomic-capable receiver.

### 7. Lifecycle moves

Each move below is one local `update-ref --stdin` transaction and publishes in one `--atomic` push with its deletes
leased (§ 6.5).

#### 7.1 Archive and close

- **A work unit's placement write to `completed`** archives it. The work ref takes a final commit carrying the verb's
  writes — the meta's session context cleared among them (D5) — the item's current records and metadata file join its
  quarter's ref in its folder (§ 3.2), the same blobs, and the ref moves to `refs/arc/history/work/<uid>`.
- **The sequence** is the quarter's highest sequence plus one, counting every numbered folder, a closed cohort's among
  them, assigned under the quarter ref's compare-and-swap; nothing stores it but its folder's name, and read placement
  derives it (§ 3.3).
- **An Errand's close** moves it the same way into an unnumbered `<slug>-<suffix>/` folder (§ 3.2).
- **The archive sequence is final once pushed.** When two machines archive into one quarter, every merge of the
  quarter's ref renumbers the unpublished archive after the remote's highest, renaming its folder (§ 6.4), whichever pull
  runs it first, so a verb reports the number after it publishes. Offline-first stores reconcile a temporary ID at sync
  the same way, the shared log's order deciding. A reopen removes its folder, so where it held the quarter's highest
  number the next archive takes that number again, and otherwise its number stays a gap, as `computeArchiveDestination`
  (`lib/work-unit/completed-index.ts`) numbers `completed/` today.

#### 7.2 Reopen

A placement write out of `completed` reopens the item: its history ref moves back under `refs/arc/work/`, and its folder
leaves the quarter's ref — each folder it holds, in every quarter's ref holding one, where two published ends left two
(§ 6.6). A clone that holds no copy of the history ref, or a copy whose log lacks the batch its folder
names (§ 7.3), refuses the reopen `state-unresolvable`, naming it (§ 4.4). Expected contract: the reopening verb pulls
it by name first. A reopen whose slug a live work item or cohort has taken since refuses `ambiguous-match` naming both
(§ 5.1).

#### 7.3 Writes to a completed item

- **Any other write to a completed item's records** — the write that resolves one of its conflict records (D6) among
  them, since every work-unit kind spans `completed/` (D5) — commits on its history ref and refreshes its folder in the
  quarter's ref — each folder, where two published ends left two (§ 3.3, § 6.6) — in one transaction under both refs'
  compare-and-swaps and one `--atomic` push. `history` keeps reading one ref's log, and a reopen finds the latest state.
  A rename renames the folder too.
- **The history ref's push is leased** (§ 6.5), so another machine's reopen reads as `stale info`, a lost race, where an
  unleased push would recreate the ref the reopen deleted.
- **A clone that holds no copy of the history ref** refuses the write `state-unresolvable`, naming it, and refuses
  `history` of the item's records the same way rather than read the quarter folder's shorter log; an abandoned or
  decomposed item's `history` refuses alike, its end read from lineage (§ 2.3). A copy whose log lacks the batch its
  folder's metadata names (`batch`, § 3.3) — another machine's write, which the default fetch does not bring — refuses
  `history`, `changes`, a write, and a reopen the same way (§ 2.3), so no write lands over a copy whose folder refresh
  would drop another machine's write. Expected contract: the verb pulls it by name and retries (§ 4.5).
- **Where the remote answers without the ref and no reopen explains it** — the mirror push D10 names, which deletes
  state refs — the retried write stays refused, naming the ref. Rebuilding from the current state cannot land a write,
  so the remedy is that a clone holding the ref push it back: `git push` of that ref to that clone's own state remote,
  run against that clone's store repository as § 6.3's remedies run. The remedy names the ref and leaves the remote and
  repository to that clone, since remote names and layouts are each clone's own.
- **A clone that holds the ref** meets the same loss as `stale info` with no reopen behind it, and its write restores
  the ref, leased on its absence, as the next push restores a lost live ref; an archived item's quarter ref rides the
  same `--atomic` push, so a reopen racing it still reads as a lost race.

#### 7.4 Abandon and decompose

- **A write that leaves a work item with its `lineage/transition` and no primary** — the caller's create-only record,
  keyed by the item's UID (D5) — ends the item, whether one batch removes the primary and creates the lineage or either
  follows the other, as the shared suite's `terminal-transition-after-primary-removal` writes the lineage first
  (`__tests__/helpers/store/suite-lookup.ts`): in that write's batch the ref's final commit removes every record on it,
  after the write checks admit its pre-sweep `after` view (§ 5.3, A4), so `history` reads a removal
  (`HistoryEntrySchema`, `lib/store/contract.ts`), and the ref moves to `refs/arc/history/work/<uid>`. Lineage beside a
  live primary ends nothing. A merge that leaves a live item its lineage and no primary — the lineage and the primary's
  removal written on two machines, neither having pulled the other — ends nothing either, since a merge writes nothing
  of its own (§ 6.4): the item lists live with no primary until a removal on its ref ends it, in that write's batch.
  Each write is read by the state it leaves: one that leaves the item its primary restores it and ends nothing, whatever
  else of it the write puts, and one that puts any other record of it and leaves it no primary refuses
  `record-malformed` naming the lineage, with the remedy to run the abandon or decomposition again, whose write ends it,
  or to restore the primary. The exception is an origin `work-item/inbound` put that settles its entries in the same
  batch creating terminal lineage (A4): the declared grammar and `checkLineageRecord` must admit the resulting list
  before the sweep removes it. This is retirement cleanup; every other origin-record put still refuses. Explicit
  inbound removal is permitted without that put exception.
- **A decomposition's children** are refs the same batch creates, each with an expected absence.

#### 7.5 Every other removal and rename

- **Any other removal, a primary's included where the item holds no lineage,** is an ordinary write of absence (D3): the
  ref stays live, and its next commit removes the record, as the conformance suite's removals expect (`current-removal`,
  `__tests__/helpers/store/suite-records.ts`). So every end carries its own record — its quarter folder or its lineage —
  by which other machines tell it from a loss (§ 6.4).
- **A rename moves no ref** (§ 3.6).

#### 7.6 A cohort's close

- **A placement write of `completed` to a cohort's document** (§ 2.4) closes it: its ref takes a final commit, the
  document and metadata file join the quarter's ref in its folder, and the ref moves to
  `refs/arc/history/cohort/<uid>`.
- **Its folder** is `<sequence><a|b>_cohort-<slug>/`, today's closeout sidecar, with the coordinates the reference
  backend assigns (`assignCompletedCohorts`, `__tests__/helpers/store/cohort-placement.ts`):
    - The sequence is the highest the same batch assigns, in the cohort's quarter, to a work unit whose meta's `Cohort`
      path names the cohort — its last member — or, when the batch archives none, the quarter's next, assigned as a
      work unit's is (§ 7.1), so the next work unit archived there numbers after it.
    - The letter is `b` where any cohort document's parsed `parent` names the cohort, a parent cohort, and `a`
      otherwise. This backend reads a document whose kind has no parser registered as naming no parent, so with none
      registered the letter is `a`, as the reference backend's assignment does. Today's archive writes the same two
      (`sweepCohortDoc` and `sweepNestedParentDoc`, `lib/work-unit/verbs/archive.ts`), which the layout resolver
      projects as `leaf` and `parent` (`resolveArcPath`, `lib/layout/projection.ts`).
- **A closed cohort reopens only where a pull withdraws the end that closed it** (§ 6.6): its history ref moves back
  under `refs/arc/cohort/` and its folder leaves the quarter, as § 7.2 reopens a work item; no write reopens one (§ 2.4).
- **The history namespace mirrors the live one:** `refs/arc/history/work/<uid>` and `refs/arc/history/cohort/<uid>`.

#### 7.7 Counters

Counters get nothing of their own. Nothing allocates from the registry's counter kind (`project-registry/counter`):
source only registers it, and tests write it as a stand-in record. D6 reserves blocks only for a hot counter, which none
is, so a first consumer's claim is a write and a push against the remote, and no block leaves gaps in a counter people
read.

### 8. `lookup`

- **One scan over the metadata files, no index.** § 3.3's four one-shot processes read it — one `for-each-ref` over the
  live work and cohort refs and the quarter refs, one `cat-file --batch-check` of their root trees, one `diff-tree`
  naming every entry of their trees with its blob, and one batched `cat-file` of every metadata blob — matched in
  memory: four Git processes a lookup. A primary's metadata holds its slugs and links (`LinksSchema`,
  `lib/store/links.ts`), so it answers a slug, a former slug, a ref through branch links, and a commit through task
  captures and the landing commit: by its SHA, and only where no capture or landing commit in that repository holds the
  SHA, by the copy key the caller passes (`copyKey`), which a capture made without one never matches, as the reference
  backend matches them (`lookupReference`, `__tests__/helpers/store/lookup.ts`) (A6). A checkout claim resolves a work
  unit by slug and an Errand by its claim ID (`claimId`, today `lib/errand/identity-record.ts`), read from the few
  Errand records whose slug matches. A completed item resolves from its quarter's folder — the one § 3.3 reads where it
  holds two — which holds its current state, links included. One batched read of 601 metas took 17 ms.
- **Memoized within one process,** keyed on the ref tips, as git-bug keeps a disposable cache; nothing persists. A
  persisted index waits for the query cache's tripwire (D20).
- **A ref the scan cannot read** — its tip, its root tree, or its metadata file (§ 3.1, § 3.3) — is skipped, and its
  family's listing reports it. A lookup refuses `namespace-corrupt` naming it where the skipped ref could hold a better
  answer: a slug no live item holds as its current slug, which resolves before every other tier; a commit no readable
  item holds by its SHA, since an exact SHA outranks every copy-key match (A6); and a ref or claim the scan matches
  nowhere else. A skipped ref that could only tie a readable item's match — the same current slug, branch, SHA, or claim
  — goes unseen until it reads: the lookup answers with the readable item where the whole scan might refuse
  `ambiguous-match`, and the family's listing reports the ref meanwhile. A reference resolved by the scan for another
  operation (§ 5.1) follows the same rule.
- **A reference without a UID** resolves by this scan, for `read`, `list`, `history`, `changes`, and the write path
  alike (§ 5.1), over the tips the operation reads — a manifest's, as of a state version: to the live item holding its
  slug, else the live item that held it as a former slug, else the one ended item in a quarter holding it as its slug,
  else the one holding it as a former slug, as the reference backend ranks them (`preferredSlugRecords`,
  `__tests__/helpers/store/lookup.ts`). Any tier holding more than one item refuses `ambiguous-match` naming them, as
  `preferredSlugRecords` does whenever its top tier holds several: two live items with one slug after a clash between
  machines (D14), two that each renamed away from one slug, or several ended ones. A reference carrying its owner's UID
  names its owner and needs no scan: its refs — the live ref, or once archived the history and quarter refs — are found
  from the operation's listing, and the write path finds them again under its locks (§ 5.1). An item ended outside the
  archive resolves as below.
- **Lineage** is the registry's `lineage/` subtree, keyed by origin UID: a UID resolves by path, a slug by the owner
  slugs the registry ref's metadata keeps for it (§ 3.3).
- **A grooming or housekeeping claim** reads the person's own claims ref, keyed by slug, since a marker on this machine
  names this person and their identity is always fetched.
- **An item ended outside the archive** — abandoned or decomposed — sits under `refs/arc/history/`, outside the refs the
  scan reads, so `lookup` of its slug and `read` of its records, by slug or by UID, refuse `not-found` (D9), and a
  decomposed origin resolves through lineage. `history` of its records by UID reads its history ref where this clone
  holds a copy, and otherwise refuses `state-unresolvable` (§ 2.3, § 7.3).
- **`list` with the `heldHere` filter** refuses `unsupported` `held-here`, recoverable, with the remedy to look up this
  checkout's claim or list without the filter, as every backend whose state is off the branch does (D1, D4).

### 9. Layouts and remotes

#### 9.1 The designation

Each clone designates its state remote with a key on the remote itself: `remote.<name>.arc-state` in the clone's Git
config, set to `push`, `read`, or `off`.

- **`push`** marks the state remote, which `pull` fetches and `push` publishes to (D14). At most one remote carries it,
  counting the store directory's own remote (§ 9.7) and only the remotes the clone's record lets count (§ 9.2). Two
  make `pull` and `push` report `designation-ambiguous` (§ 2.2), naming both, with the remedy to set one `off`
  (`arc store remote <name> off`), and fetch and push nothing; a code remote carrying it beside the store directory is
  instead the unfinished move § 10.3 reports.
- **`read`** marks a read source (§ 9.6).
- **`off`** records an answer of neither, so the question is never asked again.
- **A remote with no key is undesignated,** and the backend never pushes `refs/arc/*` to it (D14).

Where it is kept, which the contract left open:

- **Git config,** because the designation names a remote, which means something only inside one clone — one clone's
  `origin` is another's `upstream` — so it must never sync; because it belongs to the clone, shared by every worktree
  through the common Git directory where `git config --local` writes; and because sync reads it before it can reach a
  remote. Git keeps a remote's per-clone roles the same way: `remote.pushDefault`, and `remote.<name>.promisor` for a
  partial clone's object source.
- **On the remote's own section,** because Git maintains that section and only the pointers it owns: on Git 2.55
  `git remote rename` carried a foreign key in the remote's section and rewrote `remote.pushDefault`, but left a
  top-level key naming the old remote pointing at nothing, and `git remote remove` dropped the section and left that key
  dangling. GitHub CLI records its per-clone choice among remotes the same way, as `remote.<name>.gh-resolved`. The
  hyphenated name follows such tool keys and survives Git's lowercasing of variable names.
- **Outside ARC's preference files:** a preference moved into a file syncs and can be read from it, and the designation
  must never sync and is a fact about Git's remotes.

#### 9.2 Who sets it

- **The clone's own record governs every per-clone rule:** its remotes' `arc-state` keys and the store directory's
  `backing` remote (§ 9.7), both shared by every worktree through the common Git directory. The tracked pointer to a
  backing repository, `storage.backing_repository` (§ 9.7), lives in a checkout's `arc-config.yml`, which ARC reads from
  that checkout's root (`lib/config/resolve-override.ts`), so two worktrees of one clone, or a branch older than the
  commit that set it, can read it differently. The backend reads it, from the invoking checkout, only at six decisions
  that take a destination from it or check one against it — a first designation (below), an `arc store remote backing`
  setting (§ 9.4), a code remote's `push` setting on a clone where no `backing` carries `push` (§ 9.4),
  `arc store migrate --to`, which writes its change (§ 10.2), and the follow's destination and leaving the source's
  (§ 10.6) — and never to judge a designation the clone already holds. A checkout whose pointer differs from the clone's
  record syncs by the record and reports nothing; another clone's move reaches this one only through the forwarding
  record on a remote it fetches (§ 10.6).
- **A clone whose store directory carries `backing`** has that remote as its only candidate: nothing sets `push` on the
  code remote or asks about it, but for the person's own setting where `backing` carries no `push`, which the invoking
  checkout's pointer allows where it names no backing repository and asks about where it names one, and which removes
  `backing` (§ 9.4); and a `push` a fork's upstream carries counts for nothing, so no answer can publish state there. A
  code remote carrying `push` beside the store directory is the unfinished move § 10.3 reports `move-incomplete`.
- **A first designation** — a clone with no `backing` none of whose remotes carries an `arc-state` key — reads the
  invoking checkout's pointer. Where it names a backing repository, the run adds `backing` at its URL (§ 9.7) and asks
  once about it, as `arc init` sets `push` on it; where it names none, the rest of this list applies, as it does to
  every clone without `backing`.
- **A remote of the code repository named `backing`** is never designated, since the name is the store directory's
  own remote's (§ 9.7): nothing sets or asks about it, a key it carries counts for nothing, and
  `arc store remote backing` names the store directory's (§ 9.4).
- **`arc init` sets `push` on the code remote** at creation, where one exists: an expected contract, wired with
  `arc init` at the flip (§ 9.3), so before it this change alters nothing `arc init` does.
- **A clone with none set, where the code remote holds the project's registry ref** (`refs/arc/project/registry`) and no
  other remote does, sets `push` there without asking where that changes no layout and § 9.8's project check passes. A
  clone already holding state in the separate directory is asked instead, and its answer,
  `arc store remote <code remote> push`, runs the layout move (§ 9.4), so `pull` never moves a layout. Presence is read
  by `git ls-remote` of that one ref, which fetches no objects, bounded by the shipped network timeout of remote reads
  (`DEFAULT_NETWORK_TIMEOUT_MS`, 5 s, `lib/git/remote-ref-reader.ts`), past which the read fails as below. The limit is
  a bound on the backend's sleep port, raced against the read, whose end aborts the read's signal, as the deadline's is
  (§ 1.2, § 6.7).
- **Where another remote holds it** — a fork's upstream — the person is asked once about that remote: `push` for a team
  member, `read` for a contributor, the answer setting the role as D14 says, or `off`. Where several remotes other than
  the code remote hold it, the first in `git remote`'s order is asked about, and the next once that one is answered, so
  each question names one remote, as `designation-needed` carries one (§ 2.2).
- **Where no remote holds it** — a project initialized before its remote existed, a teammate's clone before the first
  state push — the person is asked once about the code remote, `push` or `off`, so no project stays unpublished
  unremarked: a forward amendment to D14, which lists one question (§ 2.6). A fork clone whose upstream holds the
  registry gets only the question above. The code remote is still never designated without an answer, since a
  contributor's lone remote is usually their public fork.
- **A clone with no code remote** — several remotes, none named `origin`, and no `remote.pushDefault`, or no remote at
  all — is asked nothing about one: only a remote holding the registry is asked about, as above, so with none the clone
  stays local-only until a remote holds it or the person designates one.
- **A remote whose presence read fails** decides nothing, since it may hold the registry: the run sets and asks nothing,
  and the pull reports that remote's `failed` outcome, `unreachable` with its cause, in the role `candidate` (§ 2.2),
  with the remedy to repair the remote or designate one by hand (`arc store remote <remote> <role>`). The next run reads
  again.
- **`no-remote`** is what `pull` and `push` report for a clone with no state remote and no question due — every remote
  `off` or a read source, or none to ask about — as the reference backend reports a store with no remote
  (`__tests__/helpers/store/sync.ts`).
- **A run that cannot ask,** CI included, follows this list as any run does, since the store never asks (§ 9.3) and
  cannot tell such a run from one that can: it sets what the list sets without asking, and where a question is due
  `pull` reports `designation-needed`, which the verb surfaces as a typed stop or an orientation line, and nothing
  pushes. So it stays read-only until a remote is designated (D14).
- **Residual:** Azure DevOps' full fork copies state refs, so a contributor's lone fork remote holding that copy reads
  as holding the project's registry and is designated without asking, and their state pushes to the fork's copy, never
  upstream, and the clone adopts the upstream's project ID (§ 9.8): a forward amendment to D14, under which inherited
  ref presence alone establishes neither the choice nor the state source (§ 2.6). The host trial checks provider fork
  behavior (§ 14.8).

The ghost install profile's own cases — its local-only pointer, and an install without one — never designate a remote
of the code repository, since ghost mode's store is always the separate layout (D19): the store directory's `backing`
remote is the only candidate, as for a clone that carries it, and with none the store stays local-only. They are wired
with that profile.

#### 9.3 How the question is asked

`pull` and `push` apply the rule of § 9.2 themselves where it sets without asking, and where a question is due they
report it rather than ask, so the store never prompts:

```ts
// SyncState gains:
| { status: "designation-needed"; remote: string; choices: ("push" | "read" | "off")[]; remedy: Remedy }
```

- **The remedy's `argv`** is the answering command for the recommended choice — `arc store remote <remote> push` for the
  code remote and for `backing` at a first designation, `read` for an upstream, and for a follow's destination the role
  the old remote held (§ 10.6) — and its text names the others.
- **A verb that can ask** presents the choices on a TTY and runs the answer; one that cannot reports the state as a
  typed stop or an orientation line carrying that `argv`, never guessing. The question belongs to the person, since its
  answer publishes their state.
- **Expected contract for the asking points,** each wired with its verb at the flip: `arc init` sets `push` itself
  (§ 9.2); `arc join`, session start's `pull`, and `arc sync` surface `designation-needed` as above.

#### 9.4 `arc store remote`

- **`arc store remote`** shows each remote with its role — `push`, `read`, `off`, or undesignated — the store's layout,
  and the store directory's own remote where it has one; `--json` gives the same as data.
- **`arc store remote <remote> <push|read|off>`** sets one remote's role. A setting that changes the layout runs the
  migrate verb's layout move first (§ 10.2), after finishing any move whose record stands (§ 10.3), and reports it.
  Setting `push` while another remote carries it refuses, naming that remote: repointing the state remote without moving
  state would strand it, so the remedies are `arc store migrate --to <remote>` to move the project's state, or
  `arc store remote <other> off` first. Setting `push` on a code repository's remote while the store directory's
  `backing` carries `push` refuses the same way, naming `arc store migrate --to <remote>`, since § 9.2 lets no such key
  count beside `backing` and the layout move would drop it, and, where the backing repository is gone,
  `arc store migrate --leave-source --to <remote>` where that remote holds the project's state, which re-homes this
  clone's state there from its last view (§ 10.6), or else `arc store remote backing off` and then this setting, which
  asks. Where no `backing` carries `push` — the clone has none, or its `backing` carries `off`, `read`, or no key — the
  setting reads the invoking checkout's pointer (§ 9.2). One naming none sets it after § 9.8's project check, running
  the layout move into the code repository's refs where the store is the separate directory, which removes any `backing`
  with the store directory (§ 10.3). One naming a backing repository asks first, since the project's state lives there
  and what publishes is never withdrawn (§ 10.7): on a TTY it names that repository and asks once whether to publish
  this clone's store on that remote instead — everything it holds, any of the project's state it pulled from that
  repository among it — as D14 lets a contributor designate a remote for their own store, and without one it refuses,
  naming `arc store remote backing push` and the same setting with `--own-state`, which answers yes, with the same
  account of what a yes publishes. A yes sets it as for a pointer naming none, its report naming § 9.6's route for
  keeping the backing repository as a read source, and a no sets nothing. So a clone that answered `off` for `backing`,
  or kept `off` through a follow, can publish on the code remote once the project's state has moved back there, and a
  fresh clone of a project whose state lives in a backing repository publishes to the code remote by this setting only
  on that answer. A checkout whose pointer predates the backing repository's setting reads none, so there this setting,
  or § 9.2's question, can designate a code remote that never held the project's state, which § 9.8's check cannot tell
  from a first publication: a residual, since nothing on such a remote marks a project it never held. What it publishes
  there stays published (§ 10.7), and once the checkout brings in the pointer, `arc store migrate --to <URL>` merges its
  state into the backing repository's (§ 10.4). While a follow is due (§ 10.6), a setting for a remote the follow names
  — the one it asks about, or one of several it lists — runs the follow with that remote and answer; setting the
  follow's old remote `off` is always allowed, and the follow is then no longer due; and any other setting refuses,
  naming `arc store migrate`.
- **`backing` always names the store directory's own remote.** Outside a follow, a setting adds it at the URL the
  invoking checkout's pointer names (§ 9.2), or repoints a `backing` whose URL differs from that pointer — the route for
  a clone whose old backing repository is gone, which no forwarding record reaches (§ 10.6) — and either runs § 9.8's
  project check before it sets `push`. A repoint to `push` leaves the old repository as
  `arc store migrate --leave-source` does, re-homing this clone's state onto the new URL from its last view of the old
  one, with that operation's copy, checks, and residual (§ 10.6). A repoint to `read` or `off` copies nothing, as a
  follow answering either lists nothing (§ 10.6), and drops `backing`'s tracking refs and the tips § 6.3 kept for it,
  which name a repository the clone no longer reads. Where the pointer names none, a setting of `off` or `read` on an
  existing `backing` is made in place, so a clone whose checkout carries a move's removal of the pointer can still stop
  pushing there (§ 10.6), while `push`, adding, or repointing refuses, naming `git remote rename backing <name>` where
  the code repository has a remote so named, which can then be designated; and a setting refuses while a code remote
  carries `push`, naming `arc store migrate --to <URL>`, which moves the state with the designation (§ 10.2), or while
  state sits in the code repository's refs with no code remote carrying it, naming `move-incomplete`'s remedies
  (§ 10.3).
- It writes only Git config and, through the layout move, the store; nothing selects this backend before the flip, so it
  changes nothing today's state reads.

#### 9.5 This repository's backend

This repository runs the default backend, its personal state published with its project state. Nothing in it needs
hiding, and the project should exercise the path most teams will take; the backing repository is for the projects that
need it. Identity scope is not private, and privacy is the backing repository's (D14), so D10's sentence that a
repository going public moves its state to a backing repository describes the choice for one that wants its state
private: a wording amendment to D10 (§ 2.6).

- **Its personal state is pruned and brought to D5's layout before the import,** since store history is never rewritten
  (A4), so whatever the import carries is public for good (§ 10.12).
- **Every state ref publishes to the clone's one state remote.** On the default backend that puts identity-scope refs —
  `USER-INBOX`, `WORKING-MEMORY`, scratch, claims, the Errand queue — on the team's remote, which is what backs them up
  and carries them to a person's other machines. A designation per scope stays a follow-on, never precluded: this
  backend composes its push set by scope, so it lands additively.

#### 9.6 Read sources

- **A `read` remote** is fetched by `pull` into `refs/arc-remotes/<remote>/…` as the state remote is, through the
  project namespaces' refspecs alone — never another person's identity — and is never merged or pushed to, but for the
  project ID a contributor's store adopts from it (§ 9.8).
- **It is read through a second store instance** over that namespace: the same engine with its ref root moved and no
  write operations, typed as `ReadOnlyStore`, `Pick<Store, "capabilities" | "read" | "list" | "version" | "history" |
  "changes" | "lookup">`, exported from `lib/store/contract.ts`. Which commands offer the upstream's view is each
  consumer's call.
- **`createReadSourceStore(ports, remote)` builds it,** exported from `lib/store/` beside `createStore`: the ref backend
  over `refs/arc-remotes/<remote>/`, taking the same ports. Its `version` lists that namespace less its `history/` and
  keeps its last manifest at `refs/arc/tmp/read/<remote>/version`, machine-local beside the store's own, so neither
  instance's newest token loses the ref that keeps it.
- **Its refusals recover as the store's do:** a pull fetches each history ref `history` names from every remote it
  fetches, the state remote and each read source, since a pattern a remote lacks fetches nothing (§ 6.2), so an ended
  upstream item's history ref lands in that source's namespace.
- **A diverged ref on a read source** keeps its tip in the source's namespace, and the pull reports `history-diverged`
  (§ 6.3) with one way out, taking theirs, since nothing of a read source is merged or pushed.
- **A forwarding record on a read source** (§ 10.6) means the upstream moved its state: the fetch prunes the source's
  namespace as any fetch does, so its view empties, and the source's pull outcome is `failed`, terminal `refused`,
  naming the move, with three remedies: `arc store migrate`, the follow, which sets the old source `off` and asks about
  the remote the upstream's state moved to, where a contributor answers `read` (§ 10.6); `arc store remote <old> off`
  alone, which § 9.4 allows while the follow is due, for a contributor who cannot read the moved-to remote; or, where
  the state moved to a backing repository and the contributor's own state stays in the code repository's refs, which the
  follow refuses, that repository added as a remote of the code repository under a name other than `backing`
  (`git remote add upstream-state <URL>`), then `arc store remote <old> off` and `arc store remote upstream-state read`.

#### 9.7 Layouts

- **The layout follows the designation,** as D10's local copy follows the remote. A code remote carrying `push` puts the
  store in the code repository's own refs; otherwise — a backing repository, another of the code repository's remotes,
  or no state remote — the store is the separate directory, as D10 places state that goes to another remote or to none.
  A designation that changes the layout runs the migrate verb's layout move before it takes effect, and nothing switches
  the layout bare. A Git edit outside ARC can still change which remote is the code remote — `git remote rename`, a
  remote added beside a lone remote not named `origin`, or `remote.pushDefault` set — and with it the layout the
  designation calls for; the store never follows such an edit by itself (below, § 10.3).
- **The separate directory** is `arc/store` in the common Git directory, so every worktree shares it, as Git keeps a
  submodule's repository under `.git/modules/`.
    - **Its presence is the layout:** `version` reads it with no Git call (§ 4.2). A store that holds state (§ 3.1)
      stays where it is — the directory where it exists, else the code repository's refs — and only a write, a pull, or
      the import's build (§ 10.4) that finds neither places itself by the designation, creating the directory under the
      layout lock (§ 11.4) where the designation puts the store there. Its `backing` remote is added, repointed, or
      removed only at the decisions that read the tracked pointer (§ 9.2) — a pull's first designation among them — and
      never otherwise by a write, pull, or push. A move and a follow add it with the state they carry, through the
      layout move where that state sits in the code repository's refs; a first designation or a setting never adds it
      while a code remote carries `push` or state sits in the code repository's refs — the setting refuses (§ 9.4), and
      the pull reports `move-incomplete` (§ 10.3). A store in the layout its designation does not call for reports
      `move-incomplete` from `pull` and `push` (§ 10.3).
    - **It is made by** `git init --bare --ref-format=reftable --object-format=<the code repository's>`: a layout move
      fetches between the two, and Git refuses a fetch across object formats, and the manifest's in-process id hashes
      with the same format.
    - **Every store command names it with `--git-dir`** (D10), and its commits carry the person's name and email as the
      code repository resolves them, which a command against the store directory would not see where they are set in the
      code repository's own config. Those commands read the person's global configuration and the directory's own, never
      the code repository's, so a transport setting made only there — `core.sshCommand`, a credential helper, an
      `http.*` key — reaches no fetch or push of the store: an `unreachable` failure's remedy says so, naming the move
      of such a setting to the person's global configuration or the store directory's.
- **A backing repository** is found through a tracked pointer, `storage.backing_repository: <URL>` in
  `.arc/system/arc-config.yml`, empty by default, which the configuration catalog gains (`ARC_CONFIG_FIELDS`,
  `lib/config/schema.ts`). The store directory carries it as its own remote, `backing`, under the same `arc-state` key
  and rules: `arc init` sets `push`, and a first designation asks once (§ 9.2). Its `remote.backing.url` is the
  pointer's raw value as the invoking checkout read it at the decision that wrote it, and only an
  `arc store remote backing` setting compares the two afterward (§ 9.4). A read source is fetched into the store
  directory by its URL, as `git remote get-url` gives it from the code repository's remote, since refspecs ride the
  command line.
- **Another of the code repository's remotes as the state remote** — a fork's upstream, for a team member who pushes
  code to the fork and state to the upstream (D14) — keeps its `push` on that remote's own section. It is fetched from
  the URL `git remote get-url` gives and pushed to the one `git remote get-url --push` gives — its push URL where it has
  one, with `insteadOf` and `pushInsteadOf` applied — both read from the code repository at each pull and push, as a
  read source is fetched. A carried code ref goes to the fork first, as § 6.8's ordered legs push it.
- **Local-only** is the separate directory with no state remote: undesignated, `off`, or `read` alone.

#### 9.8 The project ID

- **Only `arc init` mints it,** with `randomUUID`, into the registry's create-only identity record
  (`project-registry/identity`), whose content § 3.2 defines, published with the first push; with a remote already
  designated it pulls first and adopts an ID it finds instead. This is an expected contract, wired with `arc init` at
  the flip: until then the in-repo implementation serves the store and has no home for that record, refusing its write
  as `unsupported` `unhomed-kind`. This change builds the record's create-only write and its merge (§ 6.4).
- **`arc join` never mints:** it adopts the registry's ID at the first pull that finds one, and until then the clone has
  none, which delivery tolerates (D14). So a teammate's registry never holds an identity record, and when it meets the
  published registry the merge of unrelated histories (§ 6.4) adds that one with nothing to clash.
- **A contributor's local-only store takes the upstream's ID** from its read source: the first `pull` that fetches a
  read source holding the upstream's identity record, on a clone with no state remote whose registry holds none, writes
  that record into its own registry, create-only — the one write a read source causes (§ 9.6); a clone with a state
  remote adopts only from that remote, as `arc join`'s does. An independently initialized fork mints its own, and an
  inherited copy alone adopts nothing (D14), but for § 9.2's residual, a forward amendment (§ 2.6).
- **This repository's import** takes its review gate's repository ID (§ 10.8).
- **A `push` designation checks the project first.** On a clone whose store holds a project ID, setting `push` on a
  remote — by an answer, a setting, the rule that sets it without asking, or a first designation of `backing` (§ 9.2,
  § 9.4) — first fetches that remote's registry and forwarding record by one-ref patterns into
  `refs/arc/tmp/designate/<remote>/`, which it clears before the fetch and drops after its decision, so the fetch
  creates every ref there anew and none an earlier read left answers for this remote — a `!` line fails the read — with
  § 6.2's flags, under a pull's deadline (§ 6.1) — the pull's own where a pull sets it, and 120 s of its own where a
  setting or an answer runs it, since the fetch moves objects and a spurious timeout would refuse the designation — and
  reads the project ID from the registry's identity record or, where only the forwarding record stands, from that record
  (§ 10.6). Another project's ID refuses `identity-mismatch`, naming both projects and setting nothing, as a move
  refuses (§ 10.2). A forwarding record naming this project refuses too, as a follow refuses such a candidate (§ 10.6),
  since the state moved from that remote — a setting from a checkout whose pointer predates the move would otherwise
  point `backing` back at it (§ 9.4) — naming `arc store migrate`, which follows the move — on a clone that does not
  fetch that remote, after `arc store remote <remote> read`, whose pull fetches the forwarding record, so the follow
  comes due (§ 10.6) — and `arc store migrate --to <remote>`, which moves the state back from a clone with a state
  remote. A remote holding neither, or only this project's registry, is designated. A pull that would set `push` without
  asking reports either refusal as that remote's `failed` outcome, terminal `refused`, with the remedy
  `arc store remote <remote> off`, and for a remote the state moved from `arc store migrate` too, and the clone stays
  undesignated. An unrelated-histories merge of two registries (§ 6.4) therefore never meets two projects' identity
  records.

### 10. The migrate verb and the import

#### 10.1 One verb

`arc store migrate` moves state, generic over the contract (D14); the import of today's state is its one-time source.

- **`arc store migrate --to <remote | URL>`** moves the project's state to another remote: a configured remote's name
  for the project's code repository — this clone's code remote, or the remote a fork member's state goes to (§ 9.7) —
  which removes the tracked pointer, or a URL for a backing repository, which sets it (§ 10.2). A clone whose state
  remote carries a forwarding record has had its state moved already, so there a move it has not recorded refuses before
  any copy, naming `arc store migrate`, the follow, and then `--to` from the remote it follows to (§ 10.3). A clone with
  no state remote has no old remote whose state a move carries, so there it refuses, naming
  `arc store remote <remote> push` for a remote of the code repository, which designates it and runs the layout move
  (§ 9.4), and for a URL the tracked pointer's change to it, then `arc store remote backing push`, which adds `backing`
  there.
- **`arc store migrate`** with no target does three things, in order: it finishes an interrupted move from its record,
  in the direction the record names (§ 10.3); then follows another clone's move where a remote this clone fetches
  carries the forwarding record, asking about the move's destination (§ 10.6); then brings this clone into the layout
  its designation calls for, deleting store refs an earlier move left in the code repository's refs beside the store
  directory, and any temporary directory an interrupted build left (§ 10.2).
- **`arc store migrate --leave-source`** ends a recorded remote move or follow whose old remote is gone for good —
  deleted, or archived read-only — without its deletes, or a remote move or follow whose new remote is gone for good,
  before its switch or after, or before its switch refuses its copy for good — a remote move's withdrawing its own
  forwarding record where it stands on the old remote beside that remote's registry ref, deleting it leased on it in one
  `--atomic` push with a registry commit on the tip it reads there, leased on it, so the old remote is the state's home
  again, and where that registry ref is gone, a delete having landed, ending the record without it (§ 10.6) — changing
  nothing in this clone, a `--to` beside it refusing, and telling which remote is gone by a read of the new remote
  (§ 10.6); with no record standing, it leaves this clone's state remote, reading and deleting nothing there, and
  re-homes its state from its last view of that remote onto `--to`'s destination — a remote of the code repository, or
  the URL the invoking checkout's pointer names — or, without `--to`, the pointer's URL where `backing`'s differs from
  it; and it reports what it leaves published there (§ 10.6).
- **`arc store migrate --import`** is the one-time import into this repository's store (§ 10.8).
- **`--trial`** with `--to` or `--import` runs the same build, reports it, and drops it (§ 10.5); the no-target form and
  `--leave-source` refuse it, since what they run depends on a recorded move's remaining steps, a follow's answer, or
  the clone's last view; **`--json`** gives the report as data.
- A layout move also runs inside `arc store remote` when a designation changes the layout (§ 9.4), through the same
  engine.
- **The two commands refuse through a closed union of their own,** `StoreCommandRefusalSchema`, beside their entries in
  `lib/store/create.ts`, as a verb owns its result (`RunRenameResult`, `lib/work-unit/verbs/rename.ts`). Each arm
  carries its condition and remedy, and its code says what stopped the command:
    - `unsupported`, terminal, naming the flag or setting an interim build does not serve yet;
    - `request-invalid`, terminal: `--trial` with no target or with `--leave-source`, `--to` beside a recorded move's
      `--leave-source`, a destination whose URL is the old remote's, and a `--leave-source` with nowhere to re-home to
      or onto a remote of the code repository holding no registry ref of this project;
    - `no-state-remote`: a move from a clone with no state remote (above), and leaving with neither `backing` nor a code
      remote carrying `push`, or from a read source (§ 10.6);
    - `role-conflict`: a setting that would give `push` to a second remote, or set `backing` beside a code remote's
      `push` or where the pointer names none, and any setting but the follow's while a follow is due (§ 9.4, § 10.6);
    - `move-incomplete`: a setting or move refused while the store sits outside the layout its designation calls for,
      naming that state's remedies (§ 10.3);
    - `move-unfinished`: `--to` naming another destination while a move's record stands, naming the recorded move and
      that `arc store migrate` with no target, or `--to` its destination, finishes it (§ 10.3);
    - `move-record-malformed`: a `move.json` or `moved.json` that does not parse, naming its ref;
    - `import-refused`: an import whose build refuses a record, which its report's `refused` lists, or whose `notices`
      name a condition that refuses it, carrying that `MigrateReport` and landing nothing, a rerun landing once each
      source is fixed (§ 10.5);
    - `moved`: a move, a leaving, or a setting refused by a forwarding record — one from a move this clone has not
      recorded, one on the destination naming this project, one from outside this state's line of moves, or one whose
      commit a leaving's destination lacks (§ 10.6);
    - `follow-refused`: a follow its judgment refuses — a checkout without the pointer's change or between two moves,
      several candidates accepted or none holding the move, or a contributor's own state in the code repository's refs
      (§ 10.6);
    - `store`, carrying unchanged a `StoreRefusal` (`lib/store/refusal.ts`) the command met — a store operation's, its
      move lock's `lock-held`, a project check's `identity-mismatch`, the import's `identity-mismatch` or
      `version-conflict` for a store that holds state (§ 10.4), or a remote read's or push's `unreachable` or `refused`.

  The `store` arm keeps its refusal's class, and every other arm but the two terminal ones is recoverable. The
  contract's closed refusal union (`StoreRefusalSchema`) and every fixture's recovery table stay as they are.

The import's transform is its one-time part, in its own module (§ 1.2), which the cutover's deletion pass removes with
the in-repo implementation; everything at the destination is the verb's.

#### 10.2 The two moves

- **A clone's layout** changes with its designation — a team member going local-only, a contributor beginning to push,
  or a first designation of a clone that already holds state. It is a local fetch between the code repository's refs and
  the store directory, then a delete of the source (D10), every store ref and its history carried by Git, with the
  tracking refs under `refs/arc-remotes/` and the machine-local `refs/arc/tmp/seen/`, `refs/arc/tmp/version`, and
  `refs/arc/tmp/read/`, which hold the last heads § 6.3 checks against and the newest tokens' keepers; never
  `refs/arc/tmp/migrate/`, which each move keeps in the code repository (§ 10.3), but for the import's build (§ 10.4). A
  fetch racing the move may land in the copy it leaves behind, and the next pull fetches again. No remote changes. The
  directory's presence is the layout, so its switch is a rename: into the separate layout the store is built under a
  temporary name beside `arc/store` and renamed into place, each build first removing any directory an interrupted one
  left there, whose refs may predate a delete since; out of it the directory is renamed aside, then removed. The move
  holds the layout lock from its listing through the switch and the delete (§ 11.4), so no write from another worktree
  commits into either copy meanwhile.
- **The project's state** changes remote — to a backing repository before a repository that wants its state private
  goes public (D10), or back. It runs over the old remote's whole state, not this clone's, since D10's refspec keeps
  every other person's identity refs and every history ref this clone never pulled out of its fetch:
    1. Fetch every store ref the old remote holds (§ 3.1), and its forwarding record, into
       `refs/arc/tmp/migrate/remote/`, and the new remote's registry and forwarding record beside them by one-ref
       patterns, so a remote lacking either fetches nothing for it (§ 6.2), each remote's under a name keyed by that
       remote and cleared before its fetch (§ 3.1). Where the old remote carries a forwarding record, a first run
       refuses as § 10.1 says, and a rerun goes on from step 3 where that record is this move's own, and otherwise ends
       as § 10.3 says, pushing nothing to the old remote. A rerun that finds a move back — this move's commit in the old
       remote's registry and a forwarding record on the new remote (§ 10.3) — ends here too, before any copy. Beside
       them it keeps this clone's tracking refs for the old remote, and the tips § 6.3 kept for it, as they stand at
       this fetch: heads the fetched refs hold, or refs whose end or reopen they record.
    2. Read the new remote's project ID — its registry's identity record, or its forwarding record's `moved.json` — and
       refuse `identity-mismatch`, naming both projects and pushing nothing, where it names another project than the
       store's; the trial run refuses alike. Where the new remote carries a forwarding record naming a registry commit
       the old remote's registry history does not hold — one a move outside this state's line of moves left — a first
       run refuses, naming that record and pushing nothing, since deleting it would strand the clones that move left
       there, with the remedy `--to` the remote the state moved to, one carrying no forwarding record whose registry
       holds that record's commit, as a follow accepts (§ 10.6); a rerun, whose copy may have gone on with that move,
       instead leaves that record on the old remote, in one `--atomic` push with a registry commit leased on the
       registry tip step 1 read there, and ends, its clone then following it (§ 10.6). Then build the copy and its one
       commit on the registry ref, atop what it copies or merges there, the registry's tree unchanged, with the
       provenance `migrate` `move-remote` (§ 5.5); write the move's record naming that commit (§ 10.3); and push the
       copy to the new remote under the refs' own names in one `--atomic` push, which deletes the forwarding record step
       1 found there, if any, leased on it (§ 10.6), merges where the new remote holds this project's state (§ 10.4),
       and lands that commit leased on the registry tip step 1 read there (§ 10.3), so the new remote holds a commit no
       copy taken before the move holds. Once the copy lands, the old remote's tips it read and carried there, and the
       heads step 1 kept beside them, go under `refs/arc/tmp/migrate/copied/`, which no fetch of this move clears and
       each later copy of it replaces, so a rerun leases its deletes on what a copy carried and its switch carries the
       heads kept with it, never its own fetch's (steps 3 and 4). The forwarding record its push deleted there, if any,
       goes there too, and later copies keep it (§ 10.3). The record comes before the copy, since that delete strands
       every clone not yet following an earlier move off the new remote unless this move finishes. A copy that loses a
       lease there runs the move again from step 1, since another move may have written there meanwhile, its record then
       naming the commit that lands. A copy push the receiver refuses otherwise — one without atomic pushes, as A7's
       terminal `refused` (§ 10.4), a hook, or a permission — lands nothing, so a first run drops its record and
       temporary refs and refuses, changing nothing, naming the receiver's cause; a rerun's record stands, since an
       earlier run's copy may have landed there, and `arc store migrate --leave-source` ends it where the new remote
       will never take the copy (§ 10.1). A push whose outcome is unknown, its connection lost, keeps the record, and
       `arc store migrate` runs the move again from step 1.
    3. Forward, then switch: leave the forwarding record on the old remote, naming the registry commit step 2 landed at
       the new remote (§ 10.6), in one `--atomic` push with a commit on the old remote's registry ref, the registry's
       tree unchanged, with the provenance `migrate` `forward` (§ 5.5), the record leased on its absence and that commit
       on the registry tip step 1 read there (§ 10.3). A rerun past it finds its own record there and pushes nothing; a
       push that loses either lease pushes nothing, and the move runs again from step 1. Then, once a read of the old
       remote shows that record there (§ 10.3), switch: carry the heads kept with the copy (step 2) into the new
       remote's tracking namespaces, `refs/arc-remotes/<new>/` and `refs/arc/tmp/seen/<new>/`, in the layout the switch
       leaves, replacing any there; put the tracked pointer's change — `storage.backing_repository` set to the new URL,
       or removed for a move back to the code remote — into `arc-config.yml` for the person to commit as code; and set
       the designation in every direction, the new state remote `push` and the old one `off`, in § 10.3's order, where
       `backing` takes the new URL for a move to a backing repository and is removed, as its `off`, for a move from one
       to a remote of the code repository. The forwarding record comes before the switch, so of two moves off one remote
       at once, the one whose push comes second loses its lease, finds the first's record when it runs again from step
       1, and ends before its switch, following the first (§ 10.3). Teammates follow only once the pointer's change
       reaches them as code, and the move's report says so (§ 10.5).
    4. Delete the old remote's store refs, in rounds. Each round fetches them as step 1 does, and the new remote's store
       refs beside them, and, licensed as § 10.3 says, first copies onto the new remote — its re-copy — as § 10.4 does,
       leased on the tips it read there, every one whose tip is not the old remote's tip kept with the copy (step 2), or
       whose kept tip the new remote holds in the history of none of its refs for it — for a work item or cohort, its
       live or history ref, since an end or reopen there moves one to the other (§ 7.1, § 7.2): the registry's always at
       first, since step 3's forward commit moved it and no copy carried that commit, so a follower that pulled the old
       remote between steps 3 and 4 carries a registry head the new remote holds (§ 10.6); a ref a teammate pushed after
       the copy; a ref the copy lacks, such as a teammate's new item pushed by a loop that pulled before the forwarding
       record; and a ref the new remote has lost since, as one emptied and refilled by clones' pushes lacks every ref no
       clone holds — another person's identity ref, a history ref no clone pulled — so no ref leaves the old remote at a
       tip the new remote does not hold. So an end the old remote took since applies there as on a pull, and no ref goes
       from the new remote only because the old remote lost it, since a follower's clearing copy and every push after
       the switch write there too. The round keeps the old remote's tips it copied in place of those, then deletes every
       store ref it fetched in one `--atomic` push, each delete leased on its kept tip; a lost lease, where the round's
       read still shows this move's forwarding record (§ 10.3), means a push landed after that fetch, and the next round
       copies it. The move ends only when a listing of the old remote after its deletes finds no store ref, only the
       forwarding record, and a listing or delete that fails keeps the move's record (§ 10.6). The forwarding record
       goes first, so a teammate's next pull stops pushing to the old remote and the deletes settle rather than chase a
       moving lease.

   Refs this clone does not otherwise keep — another person's identity, a history ref it never pulled — never enter its
   state, and leave the temporary namespace when the move ends.

   The new remote starts from the heads this clone last saw, since its copy holds everything they name. With no tracking
   refs there, every local ref would read as unpublished, so a reopen made before the switch would leave the copied
   history ref behind, its delete unknown; with heads newer than step 1's, an end this clone pushed to the old remote
   after the copy would meet the new remote's older copy of the item as a reopen. A rerun before the switch carries the
   heads kept with the copy, never its own fetch's, which may name pushes the copy lacks; a rerun past the switch
   carries nothing again.

#### 10.3 Order makes it restartable

- **Copy, switch, then delete the source.** Interrupted, a move leaves either the old copy authoritative and a new one to
  merge, or the new copy authoritative and a leftover to delete, and running it again finishes it.
- **Every move keeps a record of itself across its switch,** since a switch interrupted midway leaves state that reads
  the same whichever way the move was going — a store directory beside a code remote carrying `push`, from a layout move
  either way — and a remote move's switch repoints or removes `backing`, leaving the old URL only in an uncommitted
  pointer change. A remote move writes its kind, source, and destination just before its copy (§ 10.2); a follow,
  leaving the source (§ 10.6), and a layout move run on its own write theirs just before their switches. Each record
  holds each remote's name and URLs, a follow's answer, the registry commit a remote move's step 2 lands or a follow's
  followed record names, or a layout move's two layouts, and goes to `refs/arc/tmp/migrate/move`, a root commit holding
  only `move.json`, machine-local in the code repository beside the halves' temporary refs, written expecting its
  absence, a rerun replacing its own leased on its value, so no run replaces a record another left. A remote's URLs
  there are `backing`'s as the store directory holds it, or, for a remote of the code repository, the fetch and push
  URLs `git remote get-url` and `git remote get-url --push` resolve in the code repository at the move's start, as § 9.7
  reaches it. Every move runs whole under the clone's move lock (§ 11.4), a layout move run as another's switch under
  that move's, so of two started from two worktrees the second refuses `lock-held` before it fetches, never touching the
  temporary refs and heads the first gathers. A layout move run as another move's switch writes none, that move's record
  covering it. Every step that reaches the old remote once the record is written — step 3's forwarding record and the
  read before the switch, step 4's listings, re-fetches, and deletes, and a follow's deletes — reaches it by the URLs
  the record holds, the fetch URL for its reads and the push URL for its pushes, never by a name a switch may have
  repointed, since between two backing repositories the switch gives `backing`'s name to the new one. The record goes
  once the move is done: a remote move's after its last listing (§ 10.2), a layout move's after its source's delete, and
  a follow's after its deletes, or its switch where it copied nothing, and leaving the source's after its switch, since
  it deletes nothing (§ 10.6). `arc store migrate` with no target finishes the move that record names, in its direction,
  as `--to` naming its destination does — a remote move recorded before its switch from step 1, its copy merging onto
  what an earlier run landed, and from step 3 where the old remote already carries its forwarding record; `--to` naming
  another refuses `move-unfinished`, naming the recorded move, until it finishes. An `arc store remote` setting that
  would run a move while a record stands first finishes the recorded one, as `arc store migrate` with no target does,
  then runs its own, so no move replaces another's record and strands its leftover, such as a directory it renamed
  aside.
- **The registry ref is each remote's move version.** A remote move's copy and its forwarding record each land a commit
  on the registry ref of the remote they write, in the same `--atomic` push, leased on the registry tip step 1 read
  there (§ 10.2), so no other move's copy or forwarding record lands on that remote unseen between that read and either
  write: of two moves whose writes cross on one remote, the later push loses its lease, and its move runs again from
  step 1, where it reads the other's write. A forwarding record changes no store ref, so without its registry commit a
  copy onto that remote would land beside it unseen; every other forwarding record a move leaves, or withdraws, goes
  with one too (§ 10.1, § 10.2, below). Step 4 copies the commit the forwarding record's push left on the old remote's
  registry onto the new remote, as it copies every ref changed since the copy, before deleting that ref (§ 10.2).
- **Every write to the old remote, and a remote move's switch, is licensed in its own round.** Once a move runs, each
  write it makes on its old remote — step 3's forwarding record, each of step 4's delete rounds, a follow's deletes, and
  each of these on a rerun from the record — and a remote move's switch follow a read of that remote in the same round,
  at the URLs the record holds, showing what the move expects there: before step 3's forwarding record, none, and a
  registry without the commit this move lands (§ 10.2), which a move back's copy brings there — for that record, the
  read is step 1's, which ends a rerun meeting a move back before its copy (§ 10.2), and is carried to its push by the
  lease on the registry tip (above); from then on, this move's own, its `moved.json` naming the registry commit the
  record holds — for a follow, the record it followed. Each delete round, a move's or a follow's, also first reads the
  new remote, which must hold the registry commit the record names. A read that fails, as when that remote has been
  deleted, or finds neither that commit nor a forwarding record, as when it was emptied, writes nothing — no re-copy, no
  delete — and keeps the record, `move-unfinished` naming the cause (§ 10.6), since the old remote may then hold the
  state's only copy, and a re-copy would give that registry a history its followers' heads do not descend from; a push
  from a clone that holds that commit, as every clone that pulled there since the switch does, restores it (§ 6.4), and
  the next round re-copies the rest (§ 10.2); one finding a forwarding record there, whatever else, means a later move
  off it (below). Before the switch, this move's commit in the old remote's registry with no forwarding record on the
  new remote is no move back but a move the other way still running, whose copy carried it there: this move goes on, and
  the two forwarding records' leases settle which lands. A follow's copy, and a re-copy, likewise need a destination
  their read finds carrying no forwarding record; one landing after that read leaves the copy beside it, published there
  (§ 10.7). A read showing otherwise means another move has taken the state since — a move back onto the old remote,
  whose copy deleted the record there, a later move off the new one, or another move off the old remote at once whose
  record landed first — so the round writes nothing and the move ends, its record going: its report names in `notices`
  each ref it leaves on the old remote and, ended before its switch, the copy it leaves at the new remote, which stays
  as a refused move's does (below); a no-target run then goes on to the follow where one is due (§ 10.1). After a move
  back, nothing it leaves is lost, the old remote being the state's home again; after a later move off the new remote,
  late pushes the copy lacks stay on the old remote until each writer's own follow clears them, as it clears a late push
  (§ 10.6), a residual where a writer never follows, published there if that remote goes public (§ 10.7). A remote move
  ended so before its switch by another move's forwarding record on its old remote, its copy having landed at its new
  remote, leaves that record at its new remote too, unless the new remote carries a forwarding record or holds that
  record's commit, in one `--atomic` push with a registry commit leased on the tip its copy left: clones still following
  a record its copy deleted there, and a follower that took its copy for the state's home, then follow the move that
  took the state. A push that loses that lease writes nothing, since the new remote has taken a copy or a forwarding
  record since.
- **A move refused or failed before its record leaves none** — another project's state at the destination, a mistyped or
  unreachable remote — and its temporary refs go, so the next `--to` starts afresh; so does a first run whose copy push
  its receiver refuses, which lands nothing (§ 10.2). A remote move interrupted between its record and its switch is
  finished by `arc store migrate` with no target, since its copy may have deleted a forwarding record that clones not
  yet following an earlier move rely on; where its new remote is gone for good, or refuses its copy for good,
  `arc store migrate --leave-source` ends the record and withdraws any forwarding record step 3 left (§ 10.1), changing
  nothing in this clone. Where a copy of this move deleted a forwarding record at a new remote that still answers, that
  record stays deleted, so clones not yet following it sync with the copy there, apart from the state's home — a
  residual `--leave-source`'s report names in `notices` with that record's commit, which it keeps past the record's end
  at `refs/arc/tmp/migrate/deleted-record` until a later move starts, and the remedy to restore the record there by
  hand: a push of that commit to `refs/arc/project/moved` from this clone, by someone the new remote admits. A copy a
  move leaves at a destination it never switched to stays there, and a later move there merges it (§ 10.4).
- **A remote move that changes the moving clone's layout** — between the code remote and a backing repository, either
  way — runs the layout move as its switch, after the copy and the pointer's change and before any delete. Each half
  keeps its temporary refs in the code repository, which both layouts keep, under its own name —
  `refs/arc/tmp/migrate/remote/` and `refs/arc/tmp/migrate/layout/` — so each half restarts as it would alone.
- **The designation and the rename cannot change at once,** so a layout move sets the code remote's `push` before the
  store directory's rename when moving into the code repository's refs, and sets it to `off` after the rename when
  moving out — never a bare clear, which a code remote holding the registry would answer by designating itself again
  without asking. A remote move sets the new state remote's `push` before the old one's `off`. Where the layout changes,
  both fall while the store directory stands beside the code remote's `push`: moving out of the code repository's refs,
  the new remote's `push` takes effect only after the directory's rename into place — `backing`'s rides in the directory
  — and moving in, the old remote's `off` comes before the directory's rename aside — `backing`'s removal rides out with
  it. So an interruption between them leaves the state below. Where the layout stays, an interruption between the two
  leaves `pull` and `push` syncing by what § 9.2 counts, reporting `move-unfinished` until a rerun finishes the move:
  with `backing` where it carries `push`, whichever end of the move it is, since an upstream's `push` counts for nothing
  beside it, and with nothing where two of the code repository's remotes carry it, which reports `designation-ambiguous`
  (§ 2.2).
- **An interruption leaves a store directory beside a code remote carrying `push`,** never a designation that would place
  a fresh store. The directory stays the layout for every read and write, as its presence is, and `pull` and `push`
  report `move-incomplete` (§ 2.2) with the remedy `arc store migrate`, fetching and pushing nothing, as they do for two
  remotes carrying `push`.
- **A move past its switch but short of its delete syncs, and says so.** The designation names its destination, so
  `pull` and `push` sync there, but the source still holds the state: a remote move's refs, or those a follow copied, on
  the old remote beside the forwarding record, which may be a code remote about to go public (§ 10.7), or a layout
  move's source — its refs in the code repository's refs beside the store directory, or the directory a move into them
  renamed aside. While a move's record stands, or store refs stand in the code repository's refs beside the store
  directory, `pull` and `push` report the `move-unfinished` state (§ 2.2) naming the leftover, with the remedy
  `arc store migrate`, which finishes it (§ 10.1), on a clone the move left with no state remote as on any other.
- **A remote edit outside ARC can leave the opposite:** state in the code repository's refs while the designation, read
  through a changed code remote, places the store in the separate directory (§ 9.7). The refs stay the layout, nothing
  creates the directory, and `pull` and `push` report `move-incomplete` naming both, with the remedies
  `arc store migrate`, which moves the store where the designation now puts it, or undoing the edit.

#### 10.4 All or nothing at the destination

- **A move gathers its refs under `refs/arc/tmp/migrate/`,** which is not state and stays out of every refspec (D10),
  then puts them in place at once: a layout move or the import in one `update-ref --stdin` transaction, a remote move in
  one `--atomic` push, which a receiver without atomic pushes refuses as A7's terminal `refused`, since publication
  across several state refs never falls back to ordinary pushes (D3). The import gathers its refs in the store's own
  repository — the code repository in the default layout, and in the separate one the store directory, which it first
  creates empty (§ 9.7) — so its landing is one transaction there, while its kept tips stay in the code repository
  (§ 10.11).
- **A copy onto a destination holding this project's state applies it as a pull applies a fetch:** a remote move's copy
  where the new remote holds it — a rerun after the copy landed, or an earlier interrupted move's leftover — step 4's
  re-copy (§ 10.2), and the follow's clearing copy (§ 10.6) each fetch the destination's refs they copy onto and run
  § 6.4–6.6 over them, the destination's refs as the local side and the source's as the fetched, an end on the
  destination counting as published where the source's copy of the item descends from that end. So each ref both sides
  hold merges — the registry, the inbox, the archive quarters, identity refs, and any item ref — and an item's lifecycle
  applies as on a pull: an end the source holds moves the destination's live ref under history, a reopen it holds brings
  the destination's ended item back, a live ref it holds beside the destination's end merges into that end as a late
  write, and of two ends the source's holds and the destination's is withdrawn. Each ref then pushes leased on the
  destination tip it read, so a lost lease fetches and applies again. Another project's state refuses before any copy
  (§ 10.2). A layout move's destination is empty unless an earlier move left its source there, which `move-unfinished`
  reports (§ 10.3); a layout move that finds store refs at its destination merges them as such a copy does. The import
  refuses a destination that holds state (below). The copy's write checks report each broken rule in the move's
  `notices` and gate nothing.
- **The import refuses a store that holds state** (§ 3.1), since it mints UIDs and a second run would duplicate every
  record, except one that finds its own landing: a store whose project ID is this clone's review-gate repository ID,
  which only the import adopts, finishes the steps that follow the landing (§ 10.11).
- **No move gates on a write check** (§ 5.3): records today's checks admitted land unchanged, and a copy's merge only
  reports, as above. The import's build checks the serialization rules (§ 5.6).

#### 10.5 The trial run

`--trial` runs the same build as the move, reports it, and drops it, so a trial and the move cannot drift apart. A trial
returns its report whatever it lists; an import whose report lists a refused record, an in-flight review, or a notice
that refuses it, lands nothing and refuses `import-refused`, carrying the report (§ 10.1):

```ts
interface MigrateReport {
  move: "layout" | "remote" | "import";
  refs: { ref: string; scope: "project" | "identity"; person?: string; action: "copy" | "merge" | "create" | "delete" }[];
  refused: { reference: RecordReference; rule: string }[];   // "branch-missing" and "branch-diverged" first, then a
                                                            // § 5.6 rule, "key", "entry-id", "session-context",
                                                            // "pause", or "review-mapping"
  brokenChains: { reference: RecordReference; condition: string }[];
  reviewMapping: { source: string; outcome: "mapped" | "left-behind" | "in-flight"; reason?: string;
                   records: RecordReference[] }[];
  differingNotes: { person: string; path: string; kind: "differs" | "snapshot-only" | "disk-only" }[];
  notices: { condition: string; remedy?: Remedy }[];
}
```

- **`refs`** lists every ref the move would write, by scope and person, history refs among them; for a move off a remote,
  every ref it would copy.
- **`refused`** lists every record the build would refuse, under its `rule`, the branch refusals first: a live work
  unit's or open Errand's primary whose branch gives its link no tip (§ 10.9), `branch-missing` where neither the
  repository nor its remote-tracking refs hold it, with the remedy to archive a work unit whose change merged, since a
  host that deletes merged branches removes the branch before archive runs, or else to restore the branch, correct
  `Branch`, or abandon the work unit, and for an Errand to close or abandon it or restore the branch; and
  `branch-diverged` where the local and remote tips have diverged, with the remedy a merge or push that brings them
  together; then a serialization rule's identifier (§ 5.6); `key` for § 3.2's key refusals; `entry-id` for an entry the
  stamp cannot place an ID in, or whose `_Id:_` another entry repeats (§ 5.1); `session-context` for a
  `SESSION-NOTES.md` the fold cannot write (§ 10.12); and `pause` for a parked work unit whose pause `MetaPauseSchema`
  refuses — an empty `Reason:` line, or an `Owner` that is not a slug — or whose reason the Pause section's writer
  refuses, a `---` line or a `##` heading (`pauseProseProblem`, `lib/store/kinds/meta/pause-section.ts`), naming the
  field, with the remedy to write the reason or correct the `Owner` (§ 10.9); and `review-mapping` for a record the
  review mapping returns that its kind's parser or a serialization rule refuses, with the remedy to correct the mapping
  (§ 10.8); **`brokenChains`**, for the import, every Candidate chain it finds broken (§ 10.9); **`differingNotes`**,
  for the import, every notes file that differs from a disk copy, and apart from them every file the snapshot holds and
  no disk copy does, and every file notes save never writes (§ 10.10).
- **`reviewMapping`**, for the import, is the review mapping's account of every source it was given: each `mapped` with
  the records it became, `left-behind` with its reason, or `in-flight`, which refuses the import until that review has
  finished (§ 10.8); it is empty with no mapping in the port.
- **`notices`** carries, for the import, each entry kind it would write whose grammar the backend's kind registry does
  not declare, which refuses the import until it does (§ 5.1), a base branch no ref resolves, which
  `computeDefaultCaptureSet` refuses with its reason and remedy, refusing it likewise (§ 10.9), the review gate's facts
  while no mapping is in the port, a source the mapping's listing does not account for exactly once, and an archived
  work unit whose branch has not landed in base, each of which refuses it too (§ 10.8); for a move off a remote, that it
  stops later publication and never unpublishes (§ 10.7), and that teammates follow only once the tracked pointer's
  change, which the move leaves uncommitted, reaches them as code; and that a push composed before a switch — a
  teammate's loop's, or one already in flight in another of this clone's worktrees — may land after the move's last
  listing and stays on the old remote until a follow answering `push` clears it (§ 10.6); and, for a copy onto a
  destination holding state, each notice that pull reports (§ 2.2) — an end it withdrew, or two ends, among them — and
  each rule its write checks find broken (§ 10.4).

#### 10.6 The forwarding record

A ref missing from a remote reads as lost, and the next push restores it (§ 6.4), so after a deliberate move a
teammate's next push would put every state ref back on the old remote. The move leaves one ref there,
`refs/arc/project/moved`: a root commit holding only `moved.json` with the project ID and the registry commit the move
landed at its destination (§ 10.2), never the destination's URL, which the tracked pointer carries. A commit's hash
written in a file reaches no objects, so no state history stays reachable from the record.

- A pull fetches it with the project namespace, refuses to push to that remote, and reports `moved` (§ 2.2) with the
  remedy to bring in the code that carries the tracked pointer and run `arc store migrate`, which follows it. Once that
  remote's fetch fails, as when it is deleted — the state remote's, or a read source's (§ 9.6) — the pull reports it
  `unreachable` as any failed fetch (§ 11.5), its remedy also naming `arc store migrate` while the forwarding record's
  tracking ref stands, since the follow stays due (below).
- **Following it** is `arc store migrate` with no target, due only while a remote this clone fetches carries the
  forwarding record — the state remote, reporting `moved`, or a read source, refused naming the move (§ 9.6) — which is
  the follow's old remote. It is read as the clone's last fetch of that remote left it: the record's tracking ref, which
  a pull's fetch sets and prunes once the remote drops it, and which a fetch that fails leaves standing, as probed on
  Git 2.55, so a follower whose old remote has since been deleted, its every pull failing `unreachable`, still has the
  follow due. The follow itself judges by the record as the old remote holds it: it fetches that remote's forwarding
  record first, into `refs/arc/tmp/follow/source/`, apart from each candidate's below, and where that fetch finds none,
  the tracking ref was stale, and the follow drops it, changing nothing. Its candidates come from the invoking
  checkout's pointer, never from § 9.2's rules for the clone's own designation: the backing repository the pointer
  names, or, where it names none, each remote of the code repository that holds the project's registry ref, read by
  presence as § 9.2 reads it, whatever the clone's `backing` and its remotes' keys say. The follow fetches each
  candidate's registry ref and forwarding record into `refs/arc/tmp/follow/candidate/<remote>/`, or
  `refs/arc/tmp/follow/pointer/` for the pointer's URL, so no read clears another's, cleared before the fetch and
  dropped once the follow decides, a `!` line failing that read, and accepts one that carries no forwarding record,
  names the project ID the forwarding record names (`moved.json`), and holds in its registry's history the commit the
  record names — `git merge-base --is-ancestor`, where a commit the fetch did not bring counts as not held. No copy
  taken before the move holds that commit, and every remote the state has moved to since holds it, so a follower several
  moves behind follows straight to the state's current remote.
    - **One accepted** is the destination.
    - **None accepted** refuses, naming each candidate and why: a forwarding record, as a remote a later move left
      carries; another project's state (§ 10.2); or a registry without the move's commit, as a fork that copied the
      upstream's registry before the move holds. Its remedies are to bring in the code that carries the pointer's
      change, which a checkout predating the move lacks, or, where the pointer names no backing repository, to add the
      remote the state moved to.
    - **Several accepted** refuses naming each, and `arc store remote <remote> <role>` naming one runs the follow with
      that remote and answer (§ 9.4).

  Where the destination is a backing repository and a code remote other than the old remote carries `push`, keeping this
  clone's own state in the code repository's refs, the follow refuses too, since `backing` cannot stand beside that
  `push` (§ 9.7), naming the route a reader takes instead (§ 9.6). A read the follow makes that fails — a presence read,
  or a candidate's forwarding record, project ID, or registry — refuses it too, never counting as absent, and names the
  remote and the failure's cause, `unreachable` as § 9.2 reports it, with the remedy to repair the remote and run the
  follow again, or, where the old remote's fetch, listing, or presence read fails because it was deleted,
  `arc store migrate --leave-source --to <remote>`, which leaves that remote and re-homes this clone's state from its
  last view of it (below), naming the destination the record's tracking ref accepts, or each where several are accepted;
  or, to publish nothing, and always for a read source, whose view holds none of this clone's publications,
  `arc store remote <remote> off` on the deleted remote, which § 9.4 always allows, the follow then no longer due, and
  then a setting of the remote the state moved to. Every refusal changes nothing.
- **The follow asks about its destination,** never carrying the role the person gave the old remote, since the answer
  publishes their state: on a TTY it offers `push`, `read`, and `off`, and otherwise reports `designation-needed`
  (§ 9.3) for that remote — `backing` for a backing repository — whose answering command,
  `arc store remote <remote> <role>`, runs the follow with that answer (§ 9.4), the recommended one carrying the role
  the old remote held (§ 9.3). A rerun after an interruption before the follow's record asks again unless it is the
  answering command, which carries the answer; one after it finishes from the record (§ 10.3). Whatever the answer, the
  follow writes its record — on `push`, after the copy below — and switches as the answer calls for: the layout move
  where the layout changes; the old remote, where it is one of the code repository's, set `off` in § 10.3's order; and
  `backing` added or repointed at the pointer's URL where the destination is the backing repository, or removed, where
  present, where it is a remote of the code repository. Every switch, a rerun's from the record among them, drops the
  old remote's forwarding-record tracking ref, which would otherwise keep the follow due once it is done, and one
  answering `read` or `off` that repoints `backing` drops `backing`'s tracking refs and the tips § 6.3 kept for it, as
  § 9.4's repoint to either does. On `push` the switch also carries this clone's tracking refs for the old remote's
  store refs, never the forwarding record's, which there would read as a move away from the new remote, and the tips
  § 6.3 kept for it, as they stood at the follow's listing (below), into the new remote's namespaces, as a move's switch
  carries the heads its step 1 kept (§ 10.2), and the follow then deletes what it copied, its record going after the
  deletes. While that record stands, `pull` and `push` sync with the new remote, which already holds what the carried
  heads name, and report `move-unfinished`, as a remote move's past its switch do (§ 10.3).
- **The follow clears what raced the move,** in the move's own shape. On a `push` answer it lists the old remote's store
  refs and its forwarding record, as the move's last step does (§ 10.2). A listing that finds no forwarding record
  changes nothing, since the follow was not due: the record's tracking ref was stale, and the follow drops it, an
  answering command that ran it then running as a setting made outside a follow (§ 9.4). A listing that finds a record
  other than the one the follow judged its candidates by refuses, changing nothing, since a later move has replaced it,
  and the next run judges afresh. So a follow deletes only on a remote its own listing found carrying the record it
  judged by. Otherwise it copies any store refs it finds onto the new remote before its switch, licensed as § 10.3 says,
  merging where it holds them (§ 10.4) — a listing or copy that fails refuses the follow, changing nothing, as its other
  reads do — then after its switch deletes them in rounds, as step 4 does (§ 10.2), each delete leased on the tip it
  listed, which it keeps with its copy, beside the heads its switch carries, as a remote move does, and each round first
  re-copying what the old remote changed since or the new remote lacks, licensed as § 10.3 says, so a ref a teammate's
  loop pushed after the mover's last listing leaves with that teammate's own follow, since their next pull meets the
  forwarding record. Its deletes also take what its own clone's other worktrees pushed from a pull made before its
  listing, as every later push reads the designation again first (§ 6.7). A clone that never follows, or follows
  answering `read` or `off`, leaves its one late push there, and a push already in flight across a switch can land after
  the last listing; a later follow answering `push` clears either, a residual the move's notices name (§ 10.5).
- **A delete on the old remote that fails after a switch** — a follow's, or a remote move's step 4 (§ 10.2), its listing
  included — keeps the move's record, `move-unfinished` naming the failure's cause, and `arc store migrate` with no
  target retries it. Where the old remote is gone for good — deleted, or archived read-only, so its deletes can never
  land — `arc store migrate --leave-source` ends the record without the deletes, its report naming in `notices` the
  state left published there (§ 10.7); nothing ends it unasked, since no read tells a repository gone for good from a
  transient or permission failure, and state left on a remote about to go public is published there. Where instead the
  new remote is gone for good — a delete round's read of it failing, so no delete runs (§ 10.3) — `--leave-source` ends
  the record alike and, for a remote move whose old remote still holds its registry ref, withdraws its forwarding record
  (§ 10.1), so the old remote is the state's home again, the clone then leaving the deleted remote onto it as below, and
  the pointer's change the switch made is reverted, in this checkout and as code for followers, as the report's
  `notices` say — restored, before the clone leaves, where the old remote is a backing repository, which leaving the
  source reaches only by the pointer, and removed where it is a remote of the code repository, so that no first
  designation or setting reads it as naming the state's home (§ 9.2, § 9.4); a clone that followed onto the deleted
  remote leaves it alike once the mover's `--leave-source` has withdrawn that record, which until then refuses it
  (§ 9.8), and the mover's report says so in `notices`. `--leave-source` tells the two cases apart by that read of the
  new remote, never by the person's call alone: only a read that fails takes the new remote's arm, and one that answers
  — an emptied new remote among them, which its clones' pushes refill — ends the record as the old remote's arm does,
  withdrawing nothing, so a misjudged outage never re-homes the state beside a new remote that answers. A withdrawal
  whose read of the old remote or push fails, as on an old remote archived read-only, keeps the record, refusing with
  its cause and the remedy to make the old remote readable and writable and run it again, or, where both remotes are
  gone for good, to delete the move's record by hand, `git update-ref -d refs/arc/tmp/migrate/move` in the code
  repository, which ends the move with nothing withdrawn, and then leave the source (below) — a residual of losing both
  remotes in one move.
- **Leaving the source** — `arc store migrate --leave-source` with no record standing — re-homes this clone's state onto
  a new remote from its last view of the old one, for a clone whose old remote can no longer be read — deleted, where an
  archived one still serves a follow's listing, so a follow from it copies and switches and its failed deletes end as
  above. It never reads or deletes on the old remote, since no read tells a deleted remote from one briefly unreachable,
  and the person's command makes that call.
    - **Its old remote** is `backing`, whatever its role, since a `backing` set `off` after `push` still holds a view of
      what this clone published there, or the remote of the code repository carrying `push`; never a read source, whose
      view holds none of this clone's publications. With neither, it refuses as `--to` does from a local-only clone
      (§ 10.1).
    - **Its destination** is `--to`'s — a remote of the code repository, or the URL the invoking checkout's pointer
      names — or, without `--to`, the pointer's URL where `backing`'s differs from it; else it refuses naming `--to`. It
      never changes the pointer. A destination whose URL is the old remote's refuses. A remote of the code repository
      must already hold this project's registry ref, the state demonstrably moved there, else it refuses naming
      `arc store remote <remote> push`, which reads the pointer and asks (§ 9.4), after `arc store remote backing off`
      where `backing` carries `push`, so leaving the source never routes around that question. § 9.8's project check
      runs, a destination carrying this project's forwarding record refusing, naming `--leave-source --to` the remote
      the state moved to, or, where that is the remote this clone is leaving, the mover's `--leave-source`, which
      withdraws that record, and where the clone holds the old remote's forwarding-record tracking ref, the destination
      must hold in its registry's history the commit that record names, as the follow's acceptance requires (above).
    - **It runs** under the move lock (§ 11.4): it copies the store refs the clone's tracking refs for the old remote
      name onto the destination, merging where it holds state (§ 10.4) — a copy that fails refuses, changing nothing —
      then writes its record and switches as a move does, in § 10.3's order: the layout move where the layout changes,
      `backing` added, repointed, or removed, and an old remote of the code repository set `off`, carrying those
      tracking refs and the tips § 6.3 kept for it into the destination's namespaces and dropping the old remote's
      forwarding-record tracking ref, as a follow's switch does. It deletes nothing, its record going after its switch
      (§ 10.3), and its report names in `notices` the state its last view held on the old remote (§ 10.7). Carried
      without the copy, those tracking refs would read whatever this clone pushed to the old remote after a move's copy
      as published at the destination, which then never receives it; replaced by the destination's tips, they would
      forget a history-ref delete a reopen still owes.
    - **Three commands reach it:** the follow's refusal above, naming `--to` with its accepted destination, or each
      where several are accepted; § 9.4's `arc store remote backing push` repointing `backing` at the pointer's URL; and
      `--to` a remote of the code repository, for a clone no forwarding record reached whose state moved there.
    - **One residual stays:** where a move's rerun past its switch reads the old repository just before it is deleted,
      and a competing end of this clone's reaches the destination before the rerun's copy, the mover's pull withdraws
      its own end there and its copy then withdraws the other (§ 10.4), leaving the item's history ref with no end
      record, which needs a repair by hand.
    - **A second residual stays:** where a remote is deleted while two moves onto or off it are running, it held the
      only record of which move won, so the clones those moves leave re-home where each person names and can end on two
      remotes, or on two whose forwarding records point at each other; each report names what its clone leaves, and the
      team's state needs a repair by hand.
    - **A third residual stays:** where a move's new remote is deleted between a delete round's read of it and that
      round's delete, the delete lands though the copy is gone, since no read of one remote and delete on another are
      one operation; the state then lives in the clones' stores, each clone leaves the source from its view, and the
      team's state needs a repair by hand. Once a delete on the old remote has landed, the new remote is the state's
      home, and its deletion is any home's (above), `--leave-source` then ending the record without withdrawing
      (§ 10.1).
    - **A fourth residual stays:** where a move's new remote is emptied before any clone holds the registry commit the
      record names, no delete round writes (§ 10.3), and clones not yet following find no candidate (above); the team's
      state then needs a repair by hand, as the third residual's does.
- **A remote move's copy deletes the forwarding record its step 1 found at its destination** (§ 10.2), where its old
  remote's registry history holds that record's commit, so a move back, or onto a remote an earlier move in this state's
  line left, finds none there; a record landing there since moves that remote's registry tip, and the copy, losing its
  lease, runs again from step 1. No other copy deletes one: a follow's and leaving the source's refuse a destination
  their read finds carrying one (§ 10.3, § 9.8), and one landing after that read leaves the copy beside it, published
  there (§ 10.7).
- It adds the ref to D10's table, a forward amendment (§ 2.6).

#### 10.7 Moving off a remote stops publication; it never unpublishes

Store history is never rewritten (A4), and anyone may have fetched what was pushed, so a repository that wants its state
private moves it before going public, and the trial run says so.

#### 10.8 The import

- **Entry point:** `arc store migrate --import`, with `--trial`, in this repository alone; CineXplorer's install predates
  too much of ARC to import and is installed fresh. It lands into the layout the clone's designation selects.
- **It reads through the in-repo implementation,** which already picks each live work unit's copy across branches and
  fetched refs, reads personal files and Errand refs, and returns tracked history with commit messages
  (`lib/store/in-repo/README.md`). The cutover fetches every branch first. That pick covers the work-item kinds; the
  in-repo implementation reads `review/*` and `lineage/transition` from the importing checkout's tree (`readTracked`,
  `lib/store/in-repo/read.ts`), so the import reads each live work unit's review records, and its Candidate records'
  path log, at the revision it picks for that work unit's meta, and the project's own records at the importing
  checkout's HEAD.
- **It reads directly** only where that implementation has no read, or one that drops what the import carries:
    - each Candidate record's versions, from the plain path log today's chain reader walks (`git log -- <path>` in
      `readRepositoryCandidateSupersessionChain`, `lib/work-unit/candidate-record-store.ts`), since the in-repo `history`
      follows renames (`trackedHistory`, `lib/store/in-repo/history.ts`, `git log --follow`), which drops a version a
      merge commit introduced;
    - each person's notes ref as one snapshot, and every worktree's workspace copies, since the in-repo implementation
      reads only the configured person's files and only this checkout's workspaces (`listPersonal`,
      `lib/store/in-repo/personal.ts`);
    - commit footers for task captures (§ 10.11);
    - each parked work unit's records, from the head of the branch its pointer record names (`composePointerRecord`,
      `lib/work-unit/pointer-record.ts`), since the in-repo implementation reads the pointer in `backlog/planned/` and
      the stub's companions beside it, while the work unit's own stay on that branch (D13);
    - the review gate's whole folder under the Git common directory (`arc/review-gate/`), every file with its path — its
      quarantined and retired records, sources, and operation records among them — for the review mapping below, which
      decides what each becomes;
    - and the sources of the stored kinds with no in-repo home (`KIND_MECHANISMS`): Errand descriptions from their
      origin entries, inbound lists from drafts' buffer sections and pending owner-adoption `_Hold` captures, and each
      person's Errand queue from their execute-bound marks.
- **The project ID** is the importing clone's review-gate repository ID (`resolveRepositoryIdentity`,
  `scripts/review-gate/hosts/local/git-common-state.ts`), already a UUID, so receipts keep their key (D14). That ID is
  minted per clone, so another clone's review facts carry another key and are not read; the cutover's quiesce finishes
  review on every other clone first.
- **The review mapping turns the review records of live work into the review family's records.** It is a pure function
  the import calls through an optional `reviewMapping` among `runStoreMigrate`'s ports, whose input and result types the
  transform module defines; the `arc store migrate` handler passes it in, so the transform holds no knowledge of the
  review gate's shapes and the mapping references nothing of the transform's. The mapping is an expected contract (Open
  Questions):

```ts
interface ReviewMappingInput {
  projectId: string;
  gate: { path: string; bytes: Uint8Array }[];            // Git-common-relative paths below arc/review-gate/
  candidates: {                                          // each live work unit holding a Candidate record
    workItem: string;                                    // its UID
    versions: { commit: string; content: string }[];    // oldest first, from the path log
    boundary: string | null;                             // the boundary record's current content
  }[];
  workItems: (
    | { slug: string; kind: "work-unit"; uid: string; live: boolean }
    | { slug: string; kind: "errand"; uid: string; live: boolean; claimId: string }
  )[];
}

interface ReviewMappingResult {
  records: { reference: RecordReference; contents: string[] }[];   // oldest first; one but for a Candidate's
  listing: { source: string; outcome: "mapped" | "left-behind" | "in-flight"; reason?: string;
             records: RecordReference[] }[];
}
```

- **`workItems`** lists every work unit and Errand the import carries, with the UID it mints for each (A11), so a name
  absent from it is no work the import holds. An Errand row also carries its original `claimId`, copied unchanged from
  `TransientIdentityRecordSchema` (`lib/errand/identity-record.ts`): review lineages identify Errands by this value
  (`lineage.vehicleIdentity` in `scripts/review-gate/status-errand.ts`), not by a slug that may be reused. The claim
  ID joins the old review identity to the separately minted store UID; it never replaces that UID (A2). **Live** is
  what the import carries as in flight: a work unit neither archived, abandoned, nor cut, one merged but not yet
  archived among them, and every Errand an identity ref holds, open, paused, or awaiting merge. An archived work unit
  has ended unless its branch still exists and has not landed in base by patch identity (`isLandedInBaseStrict`,
  `lib/git/branch-containment.ts`), tested against `origin/<base>` where it resolves and the local base otherwise: one
  archived before merge that way is listed in `notices` and refuses the import until its branch merges, or is removed
  where its change has already landed, as by a multi-commit squash merge, or is no longer wanted: `arc teardown
  <slug>` removes a branch its remote still holds, and otherwise the branch is deleted by hand, since an archived work
  unit cannot be abandoned (§ 10.5) (A1). - **What the mapping returns lands in place of what it was given:** a live
  work unit's Candidate and boundary records and every gate file land only as the mapping's records, each on its work
  item's ref at its kind's stored path (§ 3.2), a record's contents replayed oldest first, each version in a batch of
  its own as a Candidate version is (§ 10.11). A Candidate or boundary record of work that is not live lands as found
  (§ 10.9, § 10.11). - **Every returned record is checked as every imported record is,** by its kind's parser and the
  serialization rules (§ 5.6); one either refuses is listed in `refused` under `review-mapping`, naming the record,
  with the remedy to correct the mapping. No move gates on a write check (§ 10.4), so the mapping guarantees that its
  records pass their kinds' write checks. - **Source identities and coverage (A2).** Gate input paths use forward
  slashes and are relative to the Git common directory, below `arc/review-gate/`. Listing sources use these four
  encodings:

  | Source                           | Listing source                                                                                         |
  | -------------------------------- | ------------------------------------------------------------------------------------------------------ |
  | Gate file                        | Its supplied `gate.path`, including the `arc/review-gate/` prefix                                      |
  | Leftover working materialization | Its Git-common-relative folder path with a trailing `/`, listed once                                   |
  | Candidate version                | `<tracked path>@<commit>`, the path from `resolveCandidateRecordRelativePath` for its work unit's slug |
  | Boundary                         | The checkout-relative tracked path the import read for that work unit                                  |

  A materialization folder is `left-behind` with a reason and covers every supplied gate file below that folder;
  those files take no separate listing entries. Every gate file, Candidate version, and boundary must be covered
  exactly once. An omitted source, repeated source, or overlapping coverage — a folder and one of its files, or
  nested folder entries — is listed in `notices` and refuses the import until the listing is repaired. An `in-flight`
  entry likewise refuses until the review it names has finished (§ 10.5). The import checks paths and coverage,
  never the review gate's record shapes.
- **With no mapping in the port,** the trial lists the gate's facts in `notices` and the import refuses (§ 10.5), and
  every Candidate and boundary record lands as found.
- **Its provenance** is `migrate` with lifecycle action `import`, and `Arc-Code-Head` names the importing checkout's
  HEAD, so each imported record's earlier history stays findable in code history (§ 5.5).
- **What stays out:** project machinery and the constitution, tracked in the standard profile (`FAMILY_REGISTRY`), the
  shipped machinery under `.arc/system/.internal/` among it; what is machine-local — every `.internal/` folder
  `MACHINE_LOCAL_PATHS` names under `.arc/user/<id>/`, the identity's own and each workspace's, and the checkout marker,
  pristine store, and editor schemas Git ignores under `.arc/system/.internal/`; the registry's counters, since nothing
  allocates one (§ 7.7); and the identity root's `STATUS.USER.md`, a view status renders and shipped code discards as a
  cache (`DISCARDABLE_GENERATED_CACHES`, `lib/user-surface-migration.ts`). The Candidate, boundary, and transition
  records tracked under `.arc/system/.internal/` are state, which the import carries, a live work unit's Candidate and
  boundary through the review mapping (ADR-035).
- **Every record passes the serialization rules** (§ 5.6), § 3.2's key refusals, for an entry kind the stamp (§ 5.1),
  and for a folded `SESSION-NOTES.md` the section writer (§ 10.12), in the build; a refusal names the record and rule
  (§ 10.5), the trial run lists it, and the import refuses until the source is fixed.

#### 10.9 What the import carries

| Source                                                                           | Lands as                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live work units and Errands                                                      | One UID per owner (A11), reused across its kinds; each record at its current content on its work ref                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| A live work unit's or open Errand's branch                                       | A branch link (A3) on its primary as `BranchLinkSchema` (`lib/store/links.ts`) holds it, naming the branch its meta's `branch` field holds (`META_FIELDS`, `lib/store/kinds/meta/projection.ts`) or its identity record does, its repository the project ID, as A6's forward amendment has every link name it (§ 10.11); none where the field is empty or names the base branch (`branch.base`), where a cold start outside full protection leaves a work unit (`runColdStart`, `commands/start.ts`). Its `linkedAs` is `created` for a name in ARC's forms for the item — `plan/<slug>`, `<type>/<slug>`, or an Errand's `<errand-type>/<slug>` over `ERRAND_BRANCH_TYPES` (`lib/errand/branch-type.ts`) — and `adopted` for any other. The link reads one tip: of the branch's local tip and the tip its remote-tracking ref holds, the one that contains the other, or the remote's where only the remote holds it; a branch neither holds refuses `branch-missing`, and diverged tips `branch-diverged` (§ 10.5). A work unit's `excluded` is `computeDefaultCaptureSet`'s set (`lib/git/default-capture-set.ts`) over that tip, given the work unit's task captures (§ 10.11) and `refresh: false`, so a trial and its landing read one base, its refusal where no base ref resolves listed in `notices` with its reason and remedy, refusing the import (§ 10.5); an Errand's is empty |
| A parked work unit, its pointer record in `backlog/planned/`                     | A paused work unit in flight at `Active`, its records as the tip the branch row's rule reads holds them, refusing as that row does; its meta's pause section built through `MetaPauseSchema` (`lib/active/meta-schema.ts`) from the pointer's `Reason:` line as its reason, the meta's `Owner` as who paused it, and the committer time of the commit that first wrote the pointer as since when, an ISO-8601 UTC string as `arc pause` writes it, waiting on nothing. A pause the schema refuses — an empty `Reason:` line, or an `Owner` that is not a slug — or whose reason the Pause section's writer refuses, a `---` line or a `##` heading (`pauseProseProblem`, `lib/store/kinds/meta/pause-section.ts`), refuses `pause` (§ 10.5), since the import invents neither and edits no reason. A work unit parked from Planning is a stub and imports as one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Open cohorts                                                                     | One UID per cohort (A11); its document at current content on its cohort ref                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Completed work units and closed cohorts                                          | As an archive or close leaves them (§ 10.11)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Candidate records                                                                | Every version its path log holds replayed oldest first on its work item's ref, then current files; a live work unit's, with its boundary, as the review mapping returns them (§ 10.8)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Errand identity refs                                                             | Re-homed: Errands to `refs/arc/work/<uid>`, each record's `owner` the identity whose ref held it, grooming and housekeeping claims to each person's claims ref; open Errands' origin entries moved into their descriptions before any `_Id:_` stamp, each leaving its inbox                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Execute-bound marks                                                              | Each person's Errand queue, in file order, each mark's `_Disposition:_` line leaving its entry (`executeBoundMark`, `lib/user-sync/inbox-writer.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Buffer sections and held captures                                                | Each work unit's inbound list, each section leaving its draft and each capture its inbox; an entry from a buffer section takes its `_Routed from:_` date as its `_Created:_`, and one from a held capture keeps the capture's                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Entries of every entry kind                                                      | Each entry stamped with its `_Id:_` where it lacks one — both inboxes, working memory, and the three kinds with no in-repo home; the notes merge's `## Removed:` tombstones dropped from `USER-INBOX.md` and `WORKING-MEMORY.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Each person's notes snapshot and disk-only files                                 | Their personal ref, at D5's layout (§ 10.10, § 10.12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| A live work unit's `SESSION-NOTES.md`, where its meta's `Owner` names the person | That meta's session context, by the fold (§ 10.12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Other workspace files, and root files outside ARC's surfaces                     | `scratch/work-unit/<slug>/` and `scratch/` on the personal ref (§ 10.12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| The review gate's records                                                        | For live work, review records on their work items as the review mapping returns them (§ 10.8), and nothing for other work; the gate's repository ID as the project ID                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `rename` transition records                                                      | Former slugs in their successors' metadata, never lineage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `abandon` and `decompose` transitions                                            | Lineage at `lineage/<uid>.json`, keyed by a UID the import mints for its origin, each record as found but for its work-item references' UIDs, which the lineage kind leaves to the import: the origin's the one minted for it, and every other's — a successor, a dependent, a replacement, a prerequisite, a member — the UID its named owner takes (A11) where the import holds one; and an empty history ref (§ 10.11)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Closed tasks' commits                                                            | Task captures in their work units' links (§ 10.11)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| JSON machine records                                                             | Canonical form (§ 3.5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

- **Candidate chains land as found.** Two chains are already broken in code history, each superseding a Candidate no
  committed version holds — `evidence-applicability`'s at `ae942826…` and `delivery-native-stack-composition`'s at
  `0ff2bba5…`. Today's reader refuses six records: `evidence-applicability` at its break
  (`resolveCandidateSupersessionAncestors`, `lib/work-unit/candidate-attestation.ts`), and five whose records fail today's
  Candidate schema before any chain walk (`readCandidateRecordVersioned`, `lib/work-unit/candidate-record-store.ts`),
  `delivery-native-stack-composition` among them. The import carries all six unchanged, and a reader through the store
  refuses them as today's does.
- **An open Errand,** wherever the import names one, is every Errand record the identity ref holds, whether open,
  paused, or awaiting merge (`state`, `lib/errand/identity-record.ts`), each re-homed with its branch link and its
  `owner`: the identity whose `refs/arc/user/<id>/errands` held it, which that ref implies today and the record's
  optional `owner` carries from the flip (Open Questions).
- **Open Errands keep their origin entries without a binding to survive the stamp:** the import finds each open Errand's
  origin entry by title, as close does, reports one whose source digest changed since adoption, and moves it into the
  Errand's description before stamping every other entry's `_Id:_` (D11). An Errand whose entry is gone takes its
  description from `intent`, as one opened from text does.
- **What moves leaves its source:** a draft imports without its buffer section, a person's inbox without each held
  capture and open Errand's origin entry it moved, and each entry without its execute-bound mark, so nothing integrates,
  routes, or starts twice after the flip. The import writes no routing receipt for them, since no source copy survives
  in the store for a receipt to name (D11).
- **Rename records:** this repository's three `rename` transition records become former slugs in their successors'
  metadata, since from the flip lineage holds only terminal transitions (D5). Their successors are all archived, so the
  former slugs sit in their quarter folders, where `lookup` reads them.
- **Session context:** the import writes no `State at Handoff`, since nothing writes one before the flip, so it carries
  no anchor to resolve.

#### 10.10 Notes as one snapshot means every copy agrees first

The import reads each person's notes as one snapshot, the same from any checkout: each identity-global file merged
across the recent-note window, the ten newest note versions of the last seven days, as a load merges it
(`readRecentUserNotes`, `CROSS_WU_NOTE_WINDOW`, `CROSS_WU_NOTE_WINDOW_MS`, `lib/user-sync/notes-ref.ts`); and each live
work unit's workspace as the newest note in that person's notes ref holding it has it, where a load takes one work
unit's from the note nearest its own checkout's `HEAD` (`resolveNearestUserNote`, `commands/user/save-load.ts`). Newest
is by the notes ref's history, and inside a compaction snapshot, which holds every retained note in one parentless
commit (`buildSnapshotCommit`, `lib/user-sync/compaction.ts`), by the committer date of the commit each note annotates.
It compares the snapshot with every disk copy, never choosing `ours` or `theirs` (D14), as notes sync compares its own
(`projectManifest`, `lib/user-sync/projection.ts`): `USER-INBOX.md` and `WORKING-MEMORY.md` without their `## Removed:`
tombstones, every other file by its bytes. The trial run lists every disagreement, and the import refuses until snapshot
and disk agree, but for the `disk-only` files it carries from disk:

- **A file that differs** agrees once it is saved and then loaded from a checkout whose save takes it — a file at the
  identity's root from any, and one in a live work unit's workspace from a checkout where that work unit is current,
  whose save becomes the newest note holding that workspace: the save takes the disk's entries into the newest note,
  and the load writes back the entries only older notes in the window hold, which the snapshot merges in
  (`mergeCrossWuFile`, `lib/user-sync/merge.ts`). An entry the load brings back that was meant to be gone is then
  deleted and saved again, which marks it removed.
- **A file notes save never writes** — one `serialize` skips (`lib/git/user-sync.ts`): a path with a dot-prefixed
  segment, but for the `.internal/` folders that stay out (§ 10.8), a `README.md`, a name `isAllowedFile` refuses, or a
  file over 256 KiB (§ 5.6); or one in a folder no save takes, since a save takes only the identity root's flat files
  and the saving checkout's current work unit's workspace (`serializeSplitUserManifest`, `commands/user/save-load.ts`):
  a folder that is no live work unit's workspace, `scratch/` and an ended work unit's among them — is listed apart as
  `disk-only`, whether or not the snapshot holds an older copy, since saving cannot clear it. So is a file in a live
  work unit's workspace that no note in the person's notes ref holds, since the snapshot has no side to compare. The
  import carries it from its disk copy where the serialization rules admit it (§ 5.6); where they refuse it, the trial
  lists it in `refused` and the import refuses until it is moved out of the identity's folder or deleted. Disk copies
  that differ refuse until they agree. A second machine's such files reach the importing machine by copy in the
  cutover's quiesce, or stay off the store.
- **A file the snapshot holds and no disk copy does** is listed apart, since saving alone does not clear it. Notes sync
  merges each identity-global file from every note in the window that carries it (`mergeCrossWuFromNotes`,
  `commands/user/save-load.ts`), and its only tombstones mark entries removed within a file (`applyRemovalTombstones`,
  the same module), so a file deleted on disk comes back from an older note. It agrees once it is back on disk as the
  snapshot holds it, which a load writes; a file meant to be gone is then deleted after the import, where the store
  keeps a deletion (§ 6.4). Waiting also clears it, but only once no note in the window carries it — ten newer note
  versions, or seven days after the last that did — with the file kept off every live worktree's disk meanwhile, since a
  load restores it. A rerun of the trial confirms either by no longer listing it.

This repository's remote notes refs are deleted, so a second machine's notes reach the importing machine by `git bundle`
or a fetch between the two machines, in the cutover's quiesce.

#### 10.11 Completed items, task captures, and the transient-identity refs

- **Completed work units and closed cohorts land as an archive or a close leaves them** (§ 7): each one's history ref —
  a work unit's Candidate chain replayed on it oldest first where it has one, then a commit of its current files, its
  Candidate and boundary records among them — and its folder in its quarter's ref, a work unit's under the number it
  holds today and a cohort's under today's `<NN><a|b>` name. They land through the move's transaction rather than the
  contract's writes, where a write names the quarter alone and the store assigns the number (D5), so two folders sharing
  a number in one quarter, and a gap such as `2026-q3`'s at `54`, survive, and the next archive numbers after its
  quarter's highest. The import mints one `Arc-Batch` for the landing commit on every ref it writes — the one commit
  holding that ref's imported state, a history ref's last — and one more for each replayed Candidate version, so each
  batch keeps one commit per ref (§ 3.1), each ended item's record and its history ref name the same batch, and no
  imported end reads as pending (§ 6.4).
- **Abandoned and decomposed origins** each get a history ref of one commit with an empty tree and the import's
  provenance (§ 10.8) beside their lineage, so `history` of an origin's records refuses `not-found`, as an ended item's
  reads do (D9), never `state-unresolvable` for a ref no remote would hold; their earlier history stays in code history.
- **Each closed task's captures derive** from the `Context:` footers of the commits that carry its ID, as reverse lookup
  derives them today (`lookupCommit`, `lib/store/in-repo/lookup.ts`): every commit reachable from the base branch or a
  live work unit's branch, once each, whose footer names the work unit, each range expanded against the task list with
  `expandTaskReference` (`lib/commit-check/task-reference.ts`) and its IDs kept as written, only those whose task is
  closed; each capture the project ID as its repository, as A6's forward amendment has every link name it, and a
  commit's SHA with the copy key `computeCopyKeys` (`lib/git/copy-key.ts`) gives it, and none wherever it gives none — a
  merge commit, one with no readable author, and one whose patch is empty or the clone cannot produce (A6, D16). Two
  residuals: a task whose footers a squash dropped keeps no capture, and a commit no closed task's footer names — a
  ceremony or code-review commit, or an open task's — gets none, resolving from the flip to nothing, since `lookup` by
  commit matches stored links alone (D3).
- **The transient-identity refs** are re-homed, then deleted locally and, once the imported state is published, from the
  remote, each delete leased on the tip the import re-homed, which the import keeps under
  `refs/arc/tmp/migrate/import/kept/` in the code repository, where those refs and the remote live, a prefix its landing
  leaves, until then: `refs/arc/user/<id>/errands` retires with the move. The local delete rides the landing's
  transaction in the default layout; in the separate one, whose landing is the store directory's own transaction, it is
  a step of its own after the landing. Running the import again after any step past the landing finds its own landing
  (§ 10.4), deletes what local refs remain, clears the remote's refs, and drops the kept tips. On a clone with no state
  remote, which is always in the separate layout (§ 9.7), nothing publishes, so the kept tips drop in the local delete's
  own transaction, and the transient-identity refs the remote still holds, where the Errand verbs publish them to
  `origin`, are listed in `notices` with the remedy to delete them. `refs/arc/user/<id>/errands-remote` is residue and
  `refs/arc/user/<id>/sync-state` retires with notes, both the cutover's.

#### 10.12 Personal state

- **Each person's files go to D5's layout:** a per-work-unit workspace's `SESSION-NOTES.md` folds into its work unit's
  meta as session context where the person owns that live work unit — the meta's `Owner` names them and the work unit
  has not ended; every other file in the workspace but its `.internal/` folder — a `SESSION-NOTES.md` the fold does not
  take, and `ADVERSARIAL-PASSES.md` as written, among them — moves to `scratch/work-unit/<slug>/`; and everything else
  at the identity's root that is not one of ARC's surfaces or kept out (§ 10.8) moves to `scratch/`. So from the flip no
  subdirectory of `.arc/user/<id>/` is a workspace, and the identity root holds only ARC's surfaces and `scratch/`.
- **The fold:** the prose sections of `SESSION-NOTES.md`, up to the file's closing `---`, become the meta's
  `## Session Context` section, each `##` heading demoted to `###`; its `Commit at Handoff` and a recognized
  `Session Type` become the meta's fields, any other `Session Type` dropped as session-init ignores it today; the meta's
  `Blockers`, where other than `[none]`, joins the prose; `Working On` and the meta's `Next Task` and `Last Completed`
  are dropped; and no `State at Handoff` is written, so the first handoff after the flip takes restating's
  baseline-unknown fallback. The section is written by `writeMetaSessionContext`
  (`lib/store/kinds/meta/section-writer.ts`), which refuses a body keeping a section boundary, a line opening with `##`
  and a space, or a standalone `---`; the trial lists such a file in `refused` as `session-context`, and the import
  refuses until it is fixed.
- **The trial run is the pre-import tidy's checklist.** A first tidy (2026-10-10) removed what the rules would refuse
  among the personal files — two compiled Python files and a 1.5 MB trace log — and three stale folders, leaving 105
  files outside `.internal/`. Six empty files read as binary to `file`, so the text rule is Git's NUL heuristic, which
  passes them. No tracked state file is over the cap, and the 20 Candidate versions over it are a kind it leaves alone.
- **The old notes ref is the cutover's.** Kept as an archive tag, it would publish every past personal note with any
  `git push --tags`; on a public repository it stays outside `refs/tags/`, or is not kept.

### 11. Git access

The executor capabilities the engine needs, in the executor seam under `lib/git/`.

#### 11.1 The ref-transaction helper

```ts
type RefChange =
  | { ref: string; next: string; expected: string | null }   // null: the ref must not exist
  | { ref: string; delete: true; expected: string };
type RefTransactionOutcome =
  | { status: "committed" }
  | { status: "lost-race"; refs: { ref: string; expected: string | null; actual: string | null }[] };
```

- **One `update-ref --stdin` transaction** applies every change, with each ref's expected old value, under the lock waits
  of § 11.2.
- **A failed transaction is read by state, not text.** Git exits 128 with one line naming only the first ref that
  failed, so the helper re-reads every ref in the transaction with one `for-each-ref`: a ref off its expected value is a
  lost race, returned with its actual tip. When every ref matches, the failure is no race — Git has already waited for
  its locks — so the helper runs the floor check (§ 11.3) and rethrows with Git's text, as D4 throws what it cannot
  classify: a stale lock file, a name colliding with an existing ref's directory, or a missing object.
- **It never uses `--batch-updates`,** which reports per ref in a machine-readable form only by letting some updates
  land while others fail; a batch is all or none (D3).
- **It replaces message matching for the store:** `isCasRejectionError` (`lib/git/ref-tree.ts:51`) matches
  `but expected` and `reference already exists` in Git's text. That function and its callers — notes sync's, and the
  Errand identity transaction's (`lib/errand/identity-transaction.ts`), whose acquisition moves onto the store at the
  flip (§ 13.2) — retire at the cutover and never move onto the helper.

#### 11.2 Lock waits

Reftable puts every transaction in a repository behind one lock, its `tables.list`, so two processes writing unrelated
surfaces collide there although ARC's per-ref locks do not overlap; the files format locks each ref. Git waits 100 ms
for either by default. Every store write, and every fetch into the tracking namespace (§ 6.2), passes
`-c reftable.lockTimeout=5000 -c core.filesRefLockTimeout=5000`; the shared `packed-refs` lock a delete takes already
waits a second (`core.packedRefsTimeout`).

#### 11.3 ARC's Git floor is 2.47

Reftable waits for its lock only from Git 2.47, whose release notes give its locking a timeout "instead of failing on
the first failure without retrying". So the floor rises from 2.45 to 2.47 wherever it is stated:

| Site                                                                    | Today               |
| ----------------------------------------------------------------------- | ------------------- |
| `packages/arc-framework/package.json` engines                           | `"git": ">=2.45"`   |
| `package-lock.json`, the `packages/arc-framework` entry                 | `"git": ">=2.45"`   |
| `packages/arc-framework/arc/reference/QUICK-REFERENCE.template.md`      | "Git 2.45 or newer" |
| `.arc/reference/QUICK-REFERENCE.md`, synced from it                     | "Git 2.45 or newer" |
| `packages/arc-framework/__tests__/unit/git/capability-contract.test.ts` | pins `">=2.45"`     |
| `CONTRIBUTING.md`, Prerequisites                                        | "Git ≥2.45"         |

**The floor is checked where an older Git explains a failure.** `engines.git` binds nothing, and the presence probe
`checkGitAvailable` (`lib/git/exec.ts`) has no production caller, so nothing enforces the floor today. The store runs
`git --version` only when a store command fails in a way an older Git would explain — a transaction that fails with
every ref matching, or exit code 129, Git's usage error for an option it does not know, as `fetch --porcelain` is before
2.41 — and below 2.47 the error names the version found and the floor. A command that succeeds spends nothing on it.

#### 11.4 The machine-local locks

D11's machine-local lock is the advisory lock the notes and worktree-operation locks use (`acquireAdvisoryLock`,
`lib/advisory-lock.ts`): one lock file per ref at `arc/locks/<ref name>.lock` in the common Git directory, so every
worktree of the clone serializes on it, in either layout.

- **A write that spans refs takes their locks in ref-name order,** so two batches cannot deadlock.
- **The wait is the lock's default 10 s** (`DEFAULT_MAX_WAIT_MS`), as the notes lock waits. Past it the lock throws
  `AdvisoryLockTimeoutError`, which the backend refuses as `lock-held` naming the lock's path, as the in-repo
  implementation maps it (`lib/store/in-repo/write-conflicts.ts`). A lock past its wait inside `pull` or `push` — a
  merge's ref lock or the layout lock (§ 6.4), or a ref lock the push loop takes (§ 6.7) — ends the operation with that
  `lock-held` as its top-level refusal (`StoreResult`), a push pushing nothing; the merges a pull committed before it
  stand, and the next pull merges the rest.
- **The layout lock,** `arc/locks/layout.lock` beside them, the lock a write creates the store directory under (§ 9.7),
  serializes a layout move against every write. The move holds it from its listing through the copy, the switch, and the
  source's delete (§ 10.2). A write, and a pull's merge, takes it last, after its ref locks and only around its commit
  (§ 5.1): under it the write reads the layout again by the store directory's presence and, where it changed, releases
  every lock and restarts from step 2, so no write commits into a copy a move has taken or left. The move takes no ref
  lock, so the order cannot deadlock. Under reftable every commit already waits on one lock (§ 11.2); in the files
  format the layout lock serializes commits to unrelated refs that ran in parallel, each holding it only for its objects
  and one ref transaction and never across a network call, and § 14.5's bursts measure what that costs. A move that
  outlasts a waiting write's 10 s refuses it `lock-held`.
- **The move lock,** `arc/locks/migrate.lock` beside them, serializes moves alone: each move holds it for its whole run
  (§ 10.3), across its network calls, the one lock held there, since no write, pull, or push takes it. A second move
  waits the lock's default, then refuses `lock-held` naming it, and a killed run's lock goes as an abandoned holder's
  does, its pid no longer alive (`acquireAdvisoryLock`).
- **No other lock is held across a network call, a sleep, or a hook's await** (§ 5.1, § 6.7).

#### 11.5 The push helper

The push helper runs `git push --porcelain` under `LC_ALL=C` with explicit `<oid>:<ref>` pairs, `--atomic`, and leases,
and turns its per-ref lines and exit code into typed outcomes by § 6.9's rules: each ref `ok`, `rejected` with Git's
reason, `remote-rejected` with the server's message, or `atomic-collateral`; and the whole push `hook-declined`,
`atomic-unsupported`, or `unreachable` with its cause, as `PublishFailureSchema`'s `unreachable` carries one
(`RemoteFailureReasonSchema`, `lib/kernel/schema/vocabulary.ts`). A push the deadline aborts (§ 6.1) is `unreachable`
with cause `timeout`, read from the executor's `canceled` failure while the deadline's signal has fired, as
`boundedFetch` reads its own (`lib/git/exec.ts`), never from text. Its typed outcome is its only classification: it
reads the porcelain stdout, where `--porcelain` moves a lost lease's `stale info`, and leaves the seam's expected
outcomes (`GitExpectedOutcome`, `lib/git/process-error.ts`, `"absent-remote-ref" | "stale-lease"`) as they are, since
their stderr patterns never see that line.

The cause is read from Git's message text under `LC_ALL=C` by `classifyRemoteFailure` (`lib/git/remote-ref-reader.ts`),
the shipped reader of network and authentication failures, which answers `error` for anything else and never `timeout`,
which only the abort gives. A pull's fetch fails the same way, an aborted one included: one that fails before any
per-ref line is `unreachable` with that cause, and a fetch of this backend is `refused` only where a partial clone's
stays incomplete after its rerun (§ 6.2): a tracking update Git refuses is a `history-diverged` notice, and one that
fails locally a `tracking-update-failed` notice, told apart by ancestry (§ 6.3).

#### 11.6 Batched reads

Every read batches per operation, each process one-shot, its whole input written before it runs: one `for-each-ref` for
tips; where the operation needs a tree's entries — a listing, a lookup, or a read reaching a quarter's folder, whose
name carries a sequence — one `cat-file --batch-check` resolving each tip's root tree and one `git diff-tree --stdin -r
-z` over those trees (§ 3.3), retaining exact paths with non-ASCII bytes, quotes, or backslashes. Valid Unicode and
quote-bearing path keys decode as records; `validateManagedPath` (`lib/kernel/canonical/managed-path.ts`) rejects
backslashes (§ 2.5), so a stored entry holding one lists as `malformed` under its exact original path, beside the valid
records (A3). One `cat-file --batch` reads the blobs, by id or as `<tip>:<path>`. `version` costs one process (§ 4.2), a
live `read` two — three where its ref holds open conflict records, whose IDs alone name them, so the family root's
`conflicts` tree, read in the first batch, gives the blobs a second reads to fill the record's `conflicts` (§ 3.7) — and
a `list`, a `lookup`, or a read reaching a quarter four — `version` and a live `list` two more where they write a new
manifest — as today's batch reads do (`lib/io-context.ts`, `lib/git/object-availability.ts`); a reference without a UID
adds the scan's four once per process (§ 8). Each binding in `lib/git/process-executor.ts` caps a call's captured output
at 64 MiB (`MAX_GIT_OUTPUT_BYTES`), so a `cat-file --batch` that fails `output-limit` (`GitProcessError`,
`lib/git/process-error.ts`) runs again as two calls over halves of its blobs, until each fits; the split costs nothing
where a read fits, and a single blob past the ceiling, which no record nears, fails the read with that error. A process
start costs about 30 ms on Windows against 1.3 ms on Linux. Every read passes `objectAccess: "local-only"`
(`GitExecOptions` and `RawGitExec`, `lib/git/exec.ts`), which runs Git with `--no-lazy-fetch`, so a read never reaches
the network: an object the clone lacks fails the read rather than fetching it, and in a partial clone every state object
came with the fetch that brought its ref (§ 6.2).

#### 11.7 The Windows budget

Medians on a GitHub-hosted Windows runner, over a store holding 600 work items across twelve quarters, measured by the
portability run (§ 14.10). They bound this backend on that runner, which CI can repeat. On any machine a no-change
`version` is one Git process (§ 4.2), and a consumer's budget on its own machine rests on that, not on these figures:

| Operation        | Budget   |
| ---------------- | -------- |
| `version`        | ≤ 100 ms |
| `read`           | ≤ 150 ms |
| `list`, `lookup` | ≤ 300 ms |
| `write`          | ≤ 600 ms |

A read over its budget gets a long-lived reader before this change lands: a `cat-file --batch` process the executor
keeps open for the operation's reads, with abort on cancellation and closed before maintenance, since Windows cannot
delete an open pack. A `write` over its budget batches its object writes instead, since its time goes to creating
objects and updating refs, which no reader shortens: its blobs through one `hash-object -w --no-filters --stdin-paths`
over files it writes to a temporary directory — `--no-filters`, since a path given to `hash-object` takes the
repository's line-ending and attribute filters, as a blob from standard input does not: probed on Git 2.55 under
`core.autocrlf=true`, CRLF content stored other bytes than were written — and its trees through one `mktree --batch`, so
its process count stops growing with the records it writes.

#### 11.8 Cancellation on every variant

The plain executor takes a `signal` (`cancelSignal`, `lib/git/process-executor.ts`). The stdin and byte variants,
`GitExecInput` and `RawGitExec` (`lib/git/exec.ts`), gain an optional `signal` passed the same way, so a call stuck on a
locked ref or a slow disk can be ended. On every variant an abort ends the call's whole process tree and settles without
waiting on a descendant's output (§ 6.1), so the existing bounded reads (`boundedFetch`, `lib/git/exec.ts`;
`readRemoteHeadSnapshot`, `lib/git/remote-ref-reader.ts`) hold their bounds too. `pull` and `push` pass one for their
deadline (§ 6.1), and so does a `push` designation's fetch (§ 9.8). Every other store call passes none: its local
processes are one-shot, their ref updates bounded by Git's lock timeout (§ 11.2); the presence read runs under the
shipped bound (§ 9.2); and a move's transfers take no deadline (§ 6.1). The long-lived reader of § 11.7 takes one if its
budget brings it.

### 12. Maintenance and measurements

- **`maintain()`** runs `git maintenance run --auto` against the store, with `--git-dir` in the separate layout, and
  returns each never-retiring ref's commit count (`git rev-list --count`) and disk usage
  (`git rev-list --disk-usage --objects`): the person's own `personal` and `claims` refs, `project/inbox`, and
  `project/registry` (D10). A ref this clone lacks is left out.
- **Git's fetch runs `maintenance --auto` by default,** so every `pull` already maintains the store, but plumbing writes
  never do, so `maintain()` is a local-only store's one maintenance.
- **The in-repo implementation and the reference backend return `{ measurements: null }`.**
- **Every push outcome carries the loop's retry count and time waited** (§ 2.2), the contention tripwire's sample.
- **Expected contract:** handoff calls `maintain()`, the firing point D10 leaves open, and shows each measurement and
  its own push's figures past the bounds its report sets.
- **Rotation stays deferred:** the root-commit trailer `Arc-Continues`, naming a rotated ref's old tip, is reserved for
  it; nothing writes or reads it until rotation is built.

### 13. Errand acquisition and the owned rows

#### 13.1 Errands and claims through the backend

From the flip an Errand is a project-scope work item on `refs/arc/work/<uid>`, its record `errand-<uid>.json`, and each
person's grooming and housekeeping claims sit on `refs/arc/user/<id>/claims` (§ 3.2). The backend's `list`, `read`,
`write`, `batch`, `pull`, and `push` serve what the Errand identity reader and transaction acquire through Git today,
with D4's listing outcomes: absent, unreadable, and complete kept apart — one Errand's broken ref a diagnostic beside
the others' records, and the family `unreadable` only where none of its refs reads (§ 3.1) — per-entry diagnostics, and
one record version as the mutation basis. The conformance suite holds it to them (§ 14.1). Expected contract: at the
flip each consumer's acquisition moves onto these operations while it keeps its own protocol, and none authorizes review
from incomplete evidence.

#### 13.2 Consumer-map rows

| Consumer                                | This change                                                                                                              | At the cutover                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/git/ref-tree.ts`                   | Its compare-and-swap role passes to the transaction helper (§ 11.1)                                                      | Its compare-and-swap plumbing — `writeTreeCommit`, `RefTreeWriteIO`, `MAX_RECONCILE_ATTEMPTS`, and `isCasRejectionError` — retires with notes; `isNonFastForwardError`, `isRemoteUnavailableError`, `hashBlob`, and the tree readers retire with their last callers — notes sync, the Errand identity transaction with its rejected push's reconcile (`reconcileErrandPush`, `lib/errand/merge.ts`) and the Errand records' fetched read, and the in-repo implementation — as does `lib/git/publication-failure.ts`, which only those import; `readRefTip` and `uniqueRefToken` stay for their surviving callers |
| `lib/user-sync/cas-retry.ts`            | Its per-ref serialization becomes the lock and compare-and-swap of § 5.1 and § 11.4                                      | Retires with notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `lib/errand/ref-tree.ts`                | Errand and claims refs separate in the layout (§ 3.2); `errandsRef` stays the naming authority until the flip            | Retires                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `lib/errand/identity-snapshot.ts`       | `readTransientIdentitySnapshot`'s tip, tree, and blob acquisition has its store equivalent in `list` and `read` (§ 13.1) | Acquisition moves onto the store                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `lib/errand/identity-transaction.ts`    | Its push, fetch, and merge have theirs in `write`, `batch`, `pull`, and `push`                                           | Moves onto the store                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `lib/errand/record.ts`, fetched variant | `readFetchedTransientInFlightIndexes`' remote read has `pull` plus `list` (§ 6)                                          | Moves onto the store                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `lib/user-sync/classifier.ts`           | The import's personal layout replaces its workspace reading (§ 10.12)                                                    | Retires with notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `scripts/review-gate/status-errand.ts`  | Errand records through `list` and `read` with D4's outcomes                                                              | Moves onto the store                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

#### 13.3 Owned register rows

- **Notes sync reads every subdirectory of `.arc/user/<id>/` as a workspace** (`classifyUserSyncPath`,
  `lib/user-sync/classifier.ts`): the import brings each person's files to D5's layout (§ 10.12), so from the flip no
  subdirectory is a workspace. The row closes when the cutover runs the import.
- **The Errand identity refs, with notes sync's `refs/arc/user/<id>/sync-state` and their shared plumbing:** Errands
  become project-scope work items and claims move to each person's claims ref (§ 3.2, § 13.1); the import re-homes them
  and retires `refs/arc/user/<id>/errands` (§ 10.11); the sync-state ref retires with notes; and the reader's
  acquisition moves behind `list`, `read`, `pull`, and `push`. The row's Errand-branch element, an eight-character UID
  suffix, is an expected contract on the Errand verbs' rewrite at the flip, which names the branch from the Errand's
  UID; this change builds no branch name. The row closes at the flip, with that rewrite.

### 14. Verification

#### 14.1 Conformance over both layouts

A ref-backend fixture beside the in-repo and reference ones runs `registerStoreConformanceSuite`
(`__tests__/helpers/store/conformance-suite.ts`) over real temporary repositories and a bare origin, once per layout:
the default in a files-format code repository, and the separate one in its reftable directory.

- **Families:** every family but `project-machinery` and `constitution`, which stay tracked in the standard profile
  (`profiles`, `FAMILY_REGISTRY`). The three reserved families have no kinds yet and list absent.
- **Declarations** (`FixtureDeclarations`, `__tests__/helpers/store/fixture-contract.ts`): `mergesConcurrentWrites`,
  `stateOffBranch`, `runsWriteChecks`, and `liveListingStateVersion` true; `syncFamilies` and `identitySyncFamilies` its
  declared families by scope; and `unservedFamilies` giving `project-machinery` and `constitution` that reason, since
  registration refuses an unserved family without one (`validateUnservedFamilies`,
  `__tests__/helpers/store/conformance-suite.ts`), while the reserved families stay served. It runs the reference
  fixture's test registry, whose pure test parsers cover the single-writer kinds, so like that fixture it declares
  `rejectingContentUnavailable` for the prose and entry-list kinds of its families, which no registered parser refuses,
  and declares that fixture's test grammars for the three entry kinds whose registry declares none (`entryShapes`).
- **Its project-owned references name the store's one project** (§ 3.2), `{ type: "project", name: "project" }`, as the
  in-repo fixture's do (`__tests__/helpers/store/in-repo-fixture.ts`).
- **Exclusions for the refusals the suite's cases provoke only from the in-repo implementation,** as the reference
  fixture's (`__tests__/helpers/store/reference-fixture.ts`): the cross-substrate and saved-state coverage items,
  `checkout-not-writable`, nine of the ten `unsupported` cases, and the transient-write cases. Among the nine,
  `unhomed-kind`'s case writes a kind this fixture's registry homes; the backend's own `unhomed-kind` refusals, for a
  key landing on another kind's path and for an entry kind whose grammar its registry does not declare, have their cases
  in § 14.3. It produces the tenth, `held-here` (`held-here-unsupported-remedy`,
  `__tests__/helpers/store/suite-lookup.ts`), `state-unresolvable`, and `namespace-corrupt`, by a commit made outside
  ARC that breaks an item ref's metadata file, which a forward repair restoring the file mends (§ 3.3). One more is its
  own: `diagnostic-key-mismatch` for the kinds on the project's two refs whose stored state can name only the owner
  their ref and path map to — `project-inbox/inbox`, `project-inbox/routing-receipt`, `project-registry/identity`,
  `project-registry/counter`, `lineage/transition`, whose metadata slug names the UID its path does (§ 3.3), and
  `lineage/conflict-record` — so no stored state there names two (§ 3.1). Any further exclusion is a defect or a forward
  amendment.
- **Its store factory takes the registry override** (`ConformanceRegistration.create`), which the write-check item
  installs its test registration through, and its content generator writes canonical JSON for JSON-homed kinds (§ 3.5),
  and for `project-registry/identity` the shape § 3.2 defines.
- **Each test copies a prepared template repository** rather than creating one (§ 14.12).
- **The transaction helper's tests run both ref formats,** and on reftable a `version` listing beside a writer moving
  refs in two namespaces in one transaction never sees part of it.
- **The stdin and byte executor variants** each end a call on an aborted signal, rejecting it as the plain executor
  does, with a `GitProcessError` of kind `canceled` (§ 11.8).
- **The Git floor,** in a unit case over a stubbed executor reporting Git 2.45: a store command exiting 129, and a
  transaction failing with every ref matching, each throw an error naming the version found and the floor, while the
  same failures under 2.47 throw with Git's own text and a command that succeeds runs no `git --version` (§ 11.3).

#### 14.2 The suite follows § 2

- **Its sync items move to `push`** (`__tests__/helpers/store/suite-sync.ts`), each outcome carrying a retry count and
  time waited.
- **New items:** `pull` merges and publishes nothing, for each sync family, which the in-repo fixture excludes for
  `work-item` and `claims` by name, since its `pull` serves `personal` alone (§ 2.1); `maintain()` returns measurements
  or `null`; `state-unresolvable`, a recovery case a backend produces or excludes by name (D7); and a cohort document's
  archive placement, which reads back with its sequence and closeout, and which the in-repo fixture excludes by its
  `placement-move` refusal; and a rename onto a live item's slug and a reopen whose slug a live item has taken, each
  refusing `ambiguous-match` naming both, which the reference backend already refuses (`indexIdentities`) and a fixture
  whose backend refuses the rename or reopen itself excludes by that refusal (D7); and a companion keyed by a path,
  `diagram.svg` and `sub/notes.md`, which writes, reads, and lists under that key and keeps it through its owner's
  rename, and which the in-repo fixture excludes by its `unhomed-kind` refusal (§ 2.5). The cross-type cases stay in
  § 14.3, since the reference backend's index compares one type (`ownerNameKey`, `__tests__/helpers/store/model.ts`).
  The suite's merge items gain five, which a fixture whose backend refuses concurrent writes skips as it skips them
  (`mergesConcurrentWrites`, `__tests__/helpers/store/suite-merges.ts`), the in-repo one among them: a write whose
  stale-base merge clashes, its conflict record's `history` naming the verb `merge` whatever verb the write carried; a
  put whose content is the stored record's, naming in `resolves` the open conflict record a clash filed, removing it; a
  write and a pull whose merges clash in one hunk, the write's conflict record's `baseVersion` naming its expected
  version and the pull's the record's version at the merge base, and a pull whose two sides each created the record,
  clashing in one hunk, its `baseVersion` null, and clashes whose current side is empty and one blank line, their
  `currentLines` 0 and 1, and whose incoming side is, their `incomingLines` 0 and 1; an entry-kind put whose entries
  repeat an `_Id:_`, refusing `record-malformed` naming it, with a stale base and without; and a stale put whose merged
  content its kind's parser refuses, through a parser the registry override installs as the write-check item installs
  its test registration, refusing `record-malformed`. One more item, a primary's put without placement at its current
  version, refuses `record-malformed`, which the in-repo fixture excludes by its `placement-move` refusal. The reference
  backend implements `pull`, `maintain`, and the retry figures; it parses each write's input through `MutationSchema`,
  which `writeReference` and its batch take typed today; it refuses a repeated entry ID as § 5.1 and § 5.2 do, where its
  merge throws today; it runs the kind's parser on a stale base's merged content (`land`,
  `__tests__/helpers/store/write.ts`); it passes the merge library the base's version (`mergeContents`,
  `__tests__/helpers/store/merge.ts`), and null where its pull's merge synthesizes an empty base for a record both sides
  created (`reconciledRecords`, `__tests__/helpers/store/sync.ts`); and it refuses `state-unresolvable` for a state
  version it holds no snapshot of (`recordsAt`, `changesReference`, `__tests__/helpers/store/read.ts`), where it throws
  today.
- **`current-removal` checks identity absence through a UID-less project handle.** Removing
  `project-registry/identity` ends the project ID under § 3.2: a read through the removed record's UID-bearing handle
  refuses `identity-mismatch`, while its UID-less handle refuses `not-found`. The shared removal assertion keeps its
  no-version result and successful recreation checks, uses the original fixture handle for that kind alone, and adds
  no fixture exclusion. A real-Git case checks both handles and recreation (A7).
- **`keyed-independence` seeds its foreign owner only for owner types a store holds more than one of** — work items,
  cohorts, and people (`__tests__/helpers/store/suite-records.ts`). The contract gives a store one project (D14, § 3.2),
  so for a project-owned kind the item checks two keys under that one owner.
- **`diagnostic-oversized` selects only the kinds the size cap reaches,** through `everyKind`'s `select`
  (`__tests__/helpers/store/suite-tools.ts`), from its assertion in `__tests__/helpers/store/suite-listings.ts`. The
  in-repo fixture stops running it for its Errand and claims records, which that implementation caps as transient
  identity records (`MAX_LOCUS_JSON_BYTES`, `lib/locus/schema/limits.ts`), and its declarations drop their
  `diagnostic-oversized` exclusions for never-projected kinds (`__tests__/helpers/store/in-repo-declarations.ts`), which
  `validateUsedAssertionExclusions` (`suite-tools.ts`) would refuse as unused.

#### 14.3 Encoding, versions, and writes

- **Stored paths:** every kind with a `RefHome` round-trips at its table path (§ 3.2), a paired spec's halves at the
  checkout's names; no two kinds' paths collide within a ref or across refs; each reserved key refuses — a personal
  document keyed exactly `conflicts` or `receipts`, or under `state-<person>/`, among them, while `scratch/conflicts`
  stores — and so does a key whose path is a folder another record's path runs through, or runs through one; and an `id`
  key or a pass's activity holding `/`, a NUL, or a newline refuses `record-malformed`, as does a `path` key holding a
  newline; and a personal document keyed `STATUS.USER.md` at the root, or under a root or one-folder-down `.internal/`,
  refuses at `write`, at `batch`, and at `read`, while `scratch/STATUS.USER.md` stores, and a `STATUS.USER.md` placed at
  the root by a commit outside ARC lists as `malformed`.
- **Record versions:** a metadata-only write moves the primary's version and no other record's, and adds a `history`
  entry to the primary and none to the owner's other records; a rename adds no record blob; `history` follows a record across
  a rename and a role change, and across a pull's merge: where the merge keeps the remote side's version at a clash,
  `history` lists this clone's version and then the remote's, newest the current, and a stale base on this clone's
  version merges; where it keeps the local side after the remote's write, the local version is listed again as newest; a
  nested pair of merges orders the same way; and `changes` restricted to the record lists them in that order.
- **The manifest:** its in-process id equals Git's own write in both object formats; a no-change `version` spawns one
  Git process; a read as of a manifest refuses `state-unresolvable` when the manifest is gone, and names the history ref
  when an ended item's tip is missing; a verb's pull by name then resolves it. `history` of an item whose end this
  clone holds without its history ref refuses the same way, and a fresh clone's first pull fetches no history ref.
- **`changes`:** one case for each row of § 4.6's table, among them an item archived before the older manifest and
  written while archived, which lists the window's writes alone, one reopened and archived again within the window,
  which lists from its reopen, and one reopened and then abandoned within it, which lists from its reopen through its
  end, its live writes among them; a completed item another machine wrote, whose history ref this clone holds without
  that write, refuses as § 4.4 does until a pull by name brings it; a reopen lists no removal of the item's other
  records, an archive and a write to a completed item list each changed record once; and a write followed by the item's
  archive in one window lists the record's later version last.
- **Anchors:** a meta write that sets `stateAtHandoff` carries its manifest in the same commit, resolvable on a fresh
  clone that fetches the ref; an unresolvable token refuses naming the field.
- **Writes:** a no-op rewrite makes no commit; a stale base on a merge kind merges, and a retry of one whose first
  attempt clashed files a second conflict record; a role replacement runs both kinds' checks; a lost race behind the
  lock's back retries; a put of a `field-header` entry with no `_Remove when:_` line refuses `record-malformed`; a
  retried put of a hand-typed entry, after its first attempt landed, stamps the same ID and makes no commit; and a
  backend built with a registry that declares no grammar for one entry kind refuses a write and a batch putting that
  kind `unsupported` `unhomed-kind` naming it, and the import's trial over a fixture holding entries of that kind lists
  it in `notices` while the import refuses, changing nothing (§ 10.5).
- **Resolution:** a reference without a UID resolves to its slug's live holder, then a former slug's, then its one ended
  holder, then an ended item's former slug's; several ended holders, a clash between machines, and two live items that
  each renamed away from one slug refuse `ambiguous-match`; a create mints a UID, one over a completed item's slug
  starts a new one, and one over a live item's slug refuses; a rename onto a live item's slug and a reopen whose slug a
  live item has taken refuse `ambiguous-match` naming both, and so do a work unit renamed onto a live cohort's name and
  a create of either over the other's live slug; and a rename that
  ends a clash between machines lands.
- **The project owner:** a project family's listing returns the store's one project owner, and a project reference with
  another name, or a UID not the project ID, refuses `identity-mismatch`; a put of the identity record with content
  other than § 3.2's shape refuses `record-malformed`; and a project reference the store returns carries no UID before
  the identity record exists and the project ID after, as each commit's `Arc-Owner` does from the record's own.
- **A broken item ref:** a work item's ref whose metadata file, or whose root tree, a commit made outside ARC broke, and
  one whose tip commit the clone lacks — loose and packed in the files format, and in reftable — each lists as one
  `unreadable` diagnostic in a `complete` listing with `missed`, every other item listed, and `version` lists it; a
  family whose one ref, or every ref, is so broken lists `unreadable`; `read` and a write of its records refuse
  `namespace-corrupt`; a slug a live item holds as its current slug, and a commit another item's links match by SHA,
  resolve; and a slug only that ref could hold, and a commit another item matches only by copy key, refuse
  `namespace-corrupt` naming it.
- **Labels and actors:** two clones of one person clashing on a single-writer record label the two sides with distinct
  actors, the stored side from the last commit on its ref that changed the record; a side whose last commit was made
  outside ARC labels with its committer's email, or `unknown` without one; a clone with no identity commits with no
  `Arc-Actor` and labels its incoming side with the person's email; and `createRefBackend` throws, naming the kinds, on
  a registry that declares an anchor field on `lineage/transition`, or two on kinds one ref holds (§ 3.7, § 1.2, § 4.5).

- **Lineage formats remain independent (A6):** seed two origins on one registry ref at different format versions,
  initial and newer versions included; reads and listings select each origin's own format. A put or removal of one
  preserves the other's content, format, and record version. An unsupported format diagnoses only its origin and
  reads after rebuilding with support.

#### 14.4 Serialization rules

`checkSerializationRules` refuses each rule — a binary file, a projected record over the cap, an `.env` file, a private
key by content and by name, a personal document under `scratch/.git/`, `.GIT/`, `.git./`, `GIT~1/`, `.git` with an HFS+
ignorable code point inside it, or named `.gitmodules`, `GITMOD~1`, `.gitattributes`, `.GitAttributes`, or `GITATT~1` at
any depth, as a file or a folder; a stored path with a component over 4,096 bytes, for a personal document's path; an
`id` key, a slug, and a rename's new slug of 2,041 bytes; and for a never-projected kind non-JSON content and JSON
holding a lone surrogate — and admits `.env.example`, a PEM header with no matching end line, a path segment that only
contains `.git`, such as `notes.git` or `.github/`, a component of exactly 4,096 bytes, and a 2,040-byte slug and key,
whose Errand's close, cohort's close, and companion's rename then form names Git accepts; and a personal document keyed
`notes.json` holding bytes that are not canonical JSON, which stores and reads back as written. The backend refuses each
at `write` and at `batch`, and the import's build refuses each, all with `record-malformed` naming the rule; and a
Candidate record over the cap writes, lists, and reads back through `history`. A verbatim companion path over
2,040 total UTF-8 bytes stores when every segment is at most 4,096 bytes; a 4,097-byte segment and a 2,041-byte
companion name combined with its owner's slug refuse `store.git-path`, while a 2,040-byte name stores (A5).

#### 14.5 Sync, lifecycle, and many processes

Held to the spikes' pass criteria for writes (`analysis-storage-concurrency-spike.md`) — no lost write, bounded retries,
typed conflicts:

- **Integration tier, every change:**
    - four processes each writing 25 times to one surface, and to four, in both layouts;
    - a write to an item racing its archive or its abandon, and a write to a completed item racing its reopen, or its
      reopen and archive into a later quarter, in two processes on one machine: each write restarts and lands on the
      item's refs as they then stand, or refuses `not-found` after the abandon, and no ended or reopened item's ref or
      folder comes back;
    - in a blobless partial clone of an origin whose state records share blobs with code history, served with and
      without bitmaps, over protocol v2 and v0, and with `remote.<name>.negotiationInclude` configured, a first pull and
      a later one each end holding every state blob, and reads run with no fetch;
    - two and three clones pulling and pushing to one bare origin, through the model check's failing traces: two clones
      ending one item, each perhaps after a reopen of its own, the withdrawn end's `end-withdrawn` notice in the push
      result's `pulls` where the push loop met it, and, where the withdrawn end's batch closed a cohort, the cohort
      reopened and each inbound entry it returned taken back out, the receipt the end wrote for it removed so its latest
      receipt again names its home before the end, unless the published end returned it too; an end against a published
      reopen; a write racing an end between the push loop's pull and its push; and the restore after a mirror push;
    - another machine's end applied from state rather than from the merge that brought its record: a pull whose by-name
      fetch of the history ref fails leaves the end pending and the live ref in place, reporting the state remote
      `failed` with that cause and the notices of what applied, and a push meanwhile lists no live ref of that item; the
      next pull, its merge bringing nothing, applies the end; and a clone holding a completed item's history ref without
      a later write that refreshed its folder takes no pending end from it, while another machine's reopen applies at a
      later pull than the one whose merge brought the folder's removal; after a mirror push that restored the end's
      quarter ref but not its history ref, a pull reports `end-pending` naming that ref on every pull until the ending
      clone pushes it back, and the next pull then applies the end; and an imported store's ended items read as none
      pending;
    - two clones archiving into one quarter, the second's archive renumbered in its push loop's merge: each clone's next
      pulls read no pending end, and `changes` over the window groups the merge's entries under the merge's batch;
    - a push moving each pushed ref's tracking ref, in both layouts and for a fork's upstream pushed by URL, so the next
      listing lists nothing new and a clone whose published end another machine then reopens applies the reopen at its
      next pull; and two worktrees of one clone, one's push loop between its merge and its push while the other's pull
      fetches another machine's push to the same ref, where the push lands nothing over that write, its loop repeating,
      and no clone's next pull reports `history-diverged`; the same where the push owes that ref's delete for an end,
      the delete repeating rather than removing a tip it never merged, and the next attempt merging that write into the
      history ref first;
    - a lineage record written beside a live ref and published, then two pulls and a push from a second clone: no end
      reads, and the live ref publishes; then the primary's removal on the first clone ends the item, and the second
      clone's next pull applies the end and every later pull reads none pending; the same with the primary removed first
      and the lineage written after; and a second clone holding its own unpublished archive of the item meets the
      lineage end as pending and withdraws its archive; two clones abandoning one item, the second withdrawing its
      abandon, which keeps the published lineage and removes the conflict record over its own; a clone that wrote the
      item's lineage in one batch and removed its primary in a later one, neither published, meeting another clone's
      archive, withdrawing both and reporting no `ended-twice`; and a merge leaving a live item its lineage and no
      primary, where a put to its other records refuses `record-malformed` naming the lineage, a put of its primary
      restores it, as does a batch putting the primary beside a companion, and a removal ends it;
    - from the model check's sync traces: an item archived after lineage was written beside its live primary, and an
      abandoned item whose history ref holds a late write's conflict records, each read no end pending at any later
      pull, the first reporting `ended-twice` on every clone, as it does where the lineage and the archive come from two
      clones; a push loop fetching by name the history ref of an item another machine ended meanwhile applies that end
      before merging the ref; an archived item reopened and then given lineage beside its live primary reopens on a
      clone holding its history ref, while an abandoned item's live ref a mirror push restored reads as a reopen keeping
      the end's removals; a reopen on one clone racing another clone's write to the completed item keeps the write on
      the reopened item when the reopening push loop's by-name fetch brings it; and a clone holding its own unpublished
      reopen of an archived item that another clone reopens and abandons between its pushes ends the item at its push
      loop's pull, its live ref merging into the fetched history ref, and publishes no live ref beside the lineage, the
      same where another worktree's by-name fetch moved the history tracking ref before that pull; a clone whose live
      ref was never reopened applies another machine's abandon though another worktree fetched the history ref by name
      first; and a clone holding another machine's published archive when that machine's reopen publishes applies the
      reopen and deletes no live ref, as does a clone that undid its own unpublished archive by a reopen of its own
      before applying another machine's end that is then reopened; a clone that published an archive and then applied
      another machine's reopen applies that machine's later abandon, as does a clone whose other worktree fetched the
      item's history ref by name before another machine reopened and abandoned it, neither reading the reopen as its
      own;
    - two clones writing one completed item's single-writer record: the second's pull merges the two history refs, files
      one conflict record there, and rebuilds the folder from it, so the folder names the history ref's conflict IDs; a
      write merged in by a pull by name rebuilds it the same way, and a clone whose copy lacks the folder's `batch`
      leaves the folder as merged until its own pull by name; and a write and a reopen over a history copy lacking its
      folder's `batch` refuse `state-unresolvable` naming the ref, each landing after a pull by name;
    - `arc rename` of an archived work unit on a clone whose history copy lacks the item's history ref pulls it and
      lands, the folder renamed under its number, and with the remote unreachable returns `state-unresolvable` naming
      the ref, changing nothing (§ 4.5);
    - a write to a completed item on one clone, unpublished while another clone's reopen publishes: the writer's next
      pull keeps the folder's removal, fails nothing, and lands the write on the reopened item; the same with the other
      clone reopening and ending the item again first, the write merging into the history ref the new end left; and two
      writes to one completed item whose history ref a mirror push removed from the remote, where the second writer's
      pull leaves its folder and history ref as they were, reports `end-pending` naming the ref, and applies every other
      ref;
    - a remote that accepts the connection and never answers, reached over HTTP so a transport helper runs, and a
      pre-push hook that sleeps past the deadline: `pull` and `push` end within it, `failed` `unreachable` with cause
      `timeout`, the writes kept for the next push, which lands them; and a presence read against it fails within the
      shipped bound, deciding nothing;
    - a push whose own pull fails the state remote — a remote it cannot reach, and a by-name fetch that fails — ends
      before any push, its `pulls` carrying that `failed` outcome with the notices of what applied and its `publishes`
      one `failed` outcome naming every family of its scope; and a push carrying a code ref that publishes no state —
      ending on such a failed pull or on a diverged ref, and under `moved` and `designation-needed` — both as an ordered
      leg to a reachable code remote and where code and state share one atomic receiver, which pushes the ref alone and
      reports `carry` `pushed` with `publishes` as the stop gives it, and on a clone with no code remote
      `no-push-destination`;
    - `history-diverged` on a rewritten ref, with each remedy leading back to a clean pull, and a push holding writes on
      that ref ending at once as terminal `refused`, publishing nothing, with the notice in its `pulls`;
    - the same refusal with `fetch.showForcedUpdates` set false in the person's global configuration and in the store
      repository's own, in both layouts;
    - a state ref pruned while its item lives and then returned: a returned tip that neither descends from the kept tip
      nor is its ancestor fails the check on the fetch that recreated the tracking ref, which the pull deletes, keeping
      the kept tip and the local ref and reporting `history-diverged`, and a second pull refuses alike; a push meanwhile
      publishes every other ref where this clone holds no write past the kept tip, and ends at once where it does;
      after the remedy's forced fetch taking theirs, the kept tip goes and the next pull is clean; and a returned tip
      that descends, or is an ancestor, passes and the kept tip goes;
    - a commit made outside ARC that breaks an item ref's metadata file is left out of the push with every ref its
      unpublished batches reach — a batch spanning it and a second ref, and another spanning the second and a third,
      leaving out all three — failing their families `refused` while every other ref pushes, the refs a pull merged
      beforehand among them, each merge minted its own batch, and a push whose other families then exhaust their retries
      reporting one `failed` outcome for each failure; the same commit pushed outside ARC makes another clone's pull
      keep its ref, apply every other, and report a `namespace-corrupt` notice, while that clone's push publishes every
      other ref, its families failing only where it holds a write on that ref; a live ref left out for `end-pending`
      leaves out a ref a batch spans with it alike; and a forward repair on either clone, once pushed, brings both back
      to reads that succeed;
    - a fetch whose tracking-ref update meets a held lock reports `tracking-update-failed`, keeps that ref's tips, and
      applies the rest, and the next pull applies it;
    - leased deletes, the archive sequence renumbered after a concurrent archive, and a cohort's `a` and `b` folders;
    - a server that moves or deletes a ref inside its own window, as a pre-receive hook can, so a single-ref leased
      create, a leased delete, and an update each read as a lost race and settle on the next attempt, and a hook that
      moves the ref and then declines, its text outside the retry set, reads as one too, while one that declines and
      moves nothing reads terminal `refused` with its text;
    - a personal record one clone removed, merged with another clone's unchanged older copy, stays removed;
    - a merge whose result breaks a write check reports `rule-broken` and stores nothing of its own, a late write
      meeting an abandon reports `ended-with-conflicts` naming its conflict records, and two ends both published after a
      mirror push erased the first report `ended-twice`, whose remedy, an archive's and an abandon's alike, leaves one
      end, as it does for two archives into two quarters, its reopen removing the folder from each, and meanwhile the
      item reads from the later quarter's folder, lists once, and a write to it refreshes both;
    - `maintain()` returns each never-retiring ref's commit count and disk usage — the person's `personal` and `claims`
      refs, `project/inbox`, and `project/registry` — and leaves out one the clone lacks;
    - `carry` over one atomic receiver and over ordered legs, a carried ref's own rejection, an ordered code leg to an
      unreachable remote while the state leg pushes, a pre-push hook declining a carried ref and a state-only push, a
      pre-push hook sleeping past the deadline, whose `timeout` remedy names the hook, and one passing a push of
      `refs/arc/*` alone, after which the push lands, a loop ending on `retries-exhausted` with a carried ref not landed
      reporting `carry` `unreachable` with cause `timeout`, and a receiver without atomic pushes
      (`receive.advertiseAtomic=false`);
    - a carried branch rewritten and pushed with its `expect`, which lands where the remote branch still stands at
      `expect` and is refused `stale-info` where another push moved it; and a server that moves the carried branch
      inside its own window, so the atomic push fails with `atomic transaction failed` on every line, which the backend
      attributes to the carried ref by its one `ls-remote` and lease or ancestry test, repeating the push with state
      alone and reporting the carried ref `raced`.
- **On schedule, with the Windows and macOS pair, and on dispatch of the Linux portability job** (`portability`,
  `.github/workflows/ci.yml`): twenty worktrees writing personal-inbox insertions and removals at once, and twenty
  clones converging on one ref. The full bursts took about 12 s on Linux and 378–401 s on Windows. Before this change
  lands, one dispatched run of the pair and one of the Linux job pass, each recorded in `notes-storage-ref-backend.md`,
  since a scheduled workflow runs only on the default branch.

#### 14.6 Who designates, and read sources

A fresh clone's first `pull` over each case of § 9.2 — the code remote holding the registry, an upstream holding it,
neither, and a tracked pointer — sets or reports `designation-needed` as § 9.2 says, the same with and without a
terminal, its `argv` recommending `push` for the code remote and for `backing` and `read` for an upstream, and with a
pointer the code remote is never set or asked about. A designated clone is never re-decided by a checkout's pointer:
from a worktree whose pointer is absent while the clone carries `backing`, present while it carries none, or at another
URL, `pull` and `push` sync by the clone's record and report no state. On a clone without `backing`,
`arc store remote backing push` adds it at the invoking checkout's pointer's URL; on one whose `backing` URL differs
from the pointer, it repoints `backing` there, and a clone whose old backing repository is gone then syncs with the new
one, what it pushed to the old one after the move's copy — an end, and a reopen owing its history ref's delete — landing
there, while `arc store remote backing read` on such a clone repoints with no copy, pushing nothing to the new URL; it
refuses `push`, adding, or repointing where the pointer names none, where `arc store remote backing off` sets the
existing `backing` in place, after which the code remote's `push` runs the layout move; and it refuses while a code
remote carries `push`, naming `arc store migrate --to <URL>`, and while state sits in the code repository's refs, where
a pull's first designation over the same clone reports `move-incomplete` and adds no `backing`; and a remote of the code
repository named `backing` is never set or asked about, its key counting for nothing. A remote whose presence read fails
sets and asks nothing and reports it `unreachable` as a `candidate`, and the next pull once it answers decides. A clone
whose state sits in the separate directory is asked rather than set, and its answer moves the layout. The code remote
resolves through `remote.pushDefault`, a lone remote not named `origin`, and `origin` among others, the same from a
detached worktree and from one whose own `config.worktree` sets `remote.pushDefault`; a clone with none is asked nothing
about it, and a carried code ref there reports `no-push-destination`. A `git remote rename`, a remote added beside a
lone remote not named `origin`, and `remote.pushDefault` set each leave the store where it is and report
`move-incomplete`, and a `backing` setting there refuses, creating no directory. `arc store remote` shows and sets each
role; two remotes carrying `push` report `designation-ambiguous`; a setting that changes the layout moves it. A team
member on a fork who answers `push` for the upstream gets the separate layout, and a pull and a push reach the upstream
by its fetch and push URLs, a `pushurl` among them, while a carried code ref goes to the fork. A clone holding a project
ID refuses `identity-mismatch`, naming both projects and setting and pushing nothing, when it would designate `push` on
a remote whose identity record or forwarding record names another project — by the question's answer, by a setting, and
by a first designation of `backing`, while the rule that sets it without asking reports that remote's `failed` outcome,
terminal `refused`, naming both projects — and designates one holding this project's ID or none; a remote whose
forwarding record names this project refuses alike, naming `arc store migrate` and `arc store migrate --to <remote>`,
among them a `backing` setting from a checkout whose pointer predates a move the clone followed; and a designation fetch
against a remote that never answers ends within its deadline, setting nothing; a designation after a check refused
against another project's remote reads the next remote afresh; and a clone whose `backing` carries `push`, its
repository gone, whose code remote holds no state, is named `arc store remote backing off` and then the code remote's
`push` setting by both `arc store remote <code remote> push` and `--leave-source --to` it.
`arc store remote <code remote> push` on a clone whose `backing` carries `push` refuses naming
`arc store migrate --to <remote>`; on one where no `backing` carries `push` — none, or one carrying `off`, `read`, or no
key — where the invoking checkout's pointer names a backing repository it asks on a TTY, naming what a yes publishes —
the project's state a clone whose `backing` once carried `push` pulled from it among it — and setting nothing on a no,
and without one refuses naming `arc store remote backing push` and `--own-state` with the same account; and where the
pointer names none, or on a yes or `--own-state`, it moves the store into the code repository's refs, removing
`backing`, after which `pull` and `push` sync there; `arc store migrate --to` on a local-only clone refuses naming
`arc store remote`, and for a URL `arc store remote backing push`; and a local-only clone refused designating a remote
whose forwarding record names its project follows the move after setting that remote `read`.

A read source, in both layouts: a pull fetches its project namespaces into `refs/arc-remotes/<remote>/` and never
another person's identity; `createReadSourceStore` reads, lists, and looks up there, as of its own state versions too;
nothing it fetches merges into local state or is pushed; a history ref its refusal names, pulled by name, resolves; and
on a clone with no state remote whose registry holds no project ID, the first pull that fetches the upstream's registry
adopts its ID, which a later pull leaves alone, while a clone with a state remote and no ID adopts nothing from it. A
diverged ref there reports `history-diverged` with taking theirs as its one way out; and a forwarding record there fails
that source terminal `refused`, naming the move, until the follow sets it `off` and the moved-to remote `read`, after
which a pull reads the upstream from there, or until `arc store remote <old> off` alone, which the due follow allows,
after which no follow is due and nothing reads the upstream. Where the upstream's state moved to a backing repository
and the contributor's own state stays in the code repository's refs, its code remote carrying `push`, the follow
refuses, changing nothing and naming the third route, which then leaves a pull reading the upstream from the added
remote.

#### 14.7 The migrate verb and the import, by comparison

- **Each move** — a clone's layout both ways, a project's remote with its forwarding record, a remote move that changes
  the clone's layout, leaving the source, and the import — is interrupted after each step and run again to completion, a
  remote move's rerun merging onto the copy it landed, and for each move that takes `--trial` — a remote move, the one
  that changes the clone's layout among them, and the import (§ 10.1) — a trial run's report matches what the move then
  does, a layout move run by a setting reporting what it did, while `--trial` with no target refuses, changing nothing.
  Two remote moves started at once from two worktrees: the second refuses `lock-held` before it fetches, and the first
  finishes, carrying the heads its own step 1 kept; a move started after a run was killed takes the lock its dead holder
  left. A layout move each way, a follow, and leaving the source, interrupted between the directory's rename and the
  designation's change finish on a no-target rerun in the direction their records name, never reversed, while leaving
  the source interrupted before its record completes when its command runs again, merging onto the copy it landed; a
  no-target rerun holding a move's record while a follow is due finishes the move first; and a layout move out
  interrupted before its source's delete, leaving the clone with no state remote, has `pull` and `push` report
  `move-unfinished` beside `no-remote` until a rerun deletes the leftover, and a setting moving the layout back in
  meanwhile first finishes the move out, then moves in; a setting made while a layout move in stands interrupted after
  renaming its directory aside likewise finishes that move first, so no directory stays aside. A layout move out
  interrupted after its build and before its record leaves a temporary directory, which the next build replaces, a ref
  deleted meanwhile staying deleted, and a no-target run removes. Each layout move, both ways, also runs beside a writer
  in a second worktree creating one item and updating another, and both writes land in the layout the move leaves, and
  beside a sync there that pulled before the switch, which pushes nothing to the old remote after it, and the same for a
  layout move to local-only; and after each, a ref rewritten on the remote before the move still refuses
  `history-diverged` at the next pull.
- **The remote move** runs with a second person's identity refs and a history ref the moving clone never pulled on the
  old remote, and both reach the new one. It also runs with a teammate's write, a teammate's new item, and a teammate's
  end of an item landing on the old remote after the copy, and afterward the new remote holds the old one's last state
  and the old remote only the forwarding record; a teammate's push landing after the mover's last listing stays on the
  old remote until that teammate follows, and leaves with the follow; a sync in a second worktree of the moving clone,
  and one in a follower's second worktree, each pulled before its clone's switch, push nothing to the old remote after
  it and repeat against the new one; and a follow interrupted after its copy and before its switch, rerun, copies again
  and changes nothing more, while one interrupted between its switch and its deletes finishes them from its record, a
  pull or push from any of its clone's worktrees meanwhile syncing with the new remote and reporting `move-unfinished`.
  A follow whose listing of the old remote fails refuses before its switch, changing nothing, and names
  `arc store migrate --leave-source --to <remote>`, which, where the old remote was deleted before the follow, lands the
  clone's last view of it — an end it pushed there after the move's copy among it, never the forwarding record — on the
  new remote and switches, ending with no record and no `move-unfinished`, and does so without a TTY for a follower
  whose every pull since the deletion failed `unreachable` naming `arc store migrate`, the forwarding record's tracking
  ref keeping the follow due; after a follow between two backing repositories answering `read`,
  `arc store remote backing push` before any pull copies and deletes nothing and sets `push`; a `push` follow between
  two backing repositories interrupted after its switch, rerun, finishes its deletes on the old repository and follows
  nothing more; one judging its candidate keeps the old repository's record, read apart from the candidate's, for its
  listing's comparison; and a `push` follow whose listing finds no forwarding record, its tracking ref stale, changes
  nothing and drops that ref; a move, and a follow, between two backing repositories leave the forwarding record on the
  old repository's URL and delete only there, the new repository keeping every ref; a rerun of a remote move's step 4,
  and of a `push` follow's deletes, after another clone moved the state back onto the old remote, deletes nothing there
  and ends, its record going and the follow coming due; a lost lease whose re-copy meets a new remote a later move has
  left ends the move, reporting the refs it leaves; `--to` from a clone whose state remote carries a forwarding record
  refuses before any copy, and a rerun past step 3 finds its own record and pushes nothing; a move interrupted after
  step 3 and before its switch, a teammate's push landing on the old remote after the copy, reruns, its first delete
  round copying that push onto the new remote before deleting it, its switch carrying the heads kept with the copy; a
  move onto a new remote holding this project's state, its copy merging there, deletes the old remote's refs in one
  round where no push lands meanwhile, each delete leased on the old remote's tip; a follower that pulls the old remote
  between steps 3 and 4 and follows after step 4's deletes, and one that follows before them, each report no
  `history-diverged` at their next pull from the new remote; a follower offline across a move back and a second move
  away from the same remote sets its forwarding-record tracking ref to the newer record, reporting no
  `history-diverged`, as does one that pulls between the two moves, its fetch pruning the first record and then fetching
  the second, and passes over a fork that copied the registry between the two moves; two candidates whose registries are
  ancestor-related read the same in either fetch order; and a move from a code-repository remote with a `pushurl`
  reaches it after the switch at that push URL; a rerun of a remote move whose forwarding record had landed, after
  another clone moved the state back onto the old remote, pushes no record there and ends, the old remote staying the
  state's home and the follow coming due; one rerun before its switch, the move back's forwarding record on its new
  remote, ends at step 1, copying nothing, and a clone still on the new remote follows that record; a rerun before its
  switch that finds another move's forwarding record on its old remote ends, its record going, where a first run
  refuses; a move back interrupted between its record and its switch finishes on a rerun, every clone ending on the old
  remote, and one whose new remote went meanwhile is ended by `--leave-source`, which withdraws its forwarding record,
  every clone then syncing with the old remote; a move whose new remote is deleted after its copy deletes nothing on the
  old remote, the delete round's read of the new remote failing, and a clone that followed onto it leaves the source
  onto the old remote once the mover's `--leave-source` has run, and where the old remote is a backing repository, once
  the pointer's change is reverted, while a move off the code remote has its pointer removed, a fresh clone's first
  designation then reading none; a move whose new remote is emptied after its switch writes nothing on either remote
  until a follower's push restores the move's commit there, then re-copies every ref the new remote lacks — another
  person's identity ref and a history ref no clone pulled among them — before deleting it on the old remote, and
  `--leave-source` run while that remote is empty ends the record withdrawing nothing, every clone ending on the new
  remote once a push restores the commit; a delete round after an item's reopen on the new remote copies no history ref
  back for it; `--leave-source` on a move whose new remote answers, both remotes alive, ends its record withdrawing
  nothing, and on one whose new remote is deleted and whose old remote is archived read-only keeps the record, its
  withdrawal push refused, naming the record's deletion by hand; a move whose new remote is deleted after a delete on
  its old remote landed is ended by `--leave-source` without a withdrawal; two clones moving off one remote at once to
  two other remotes end on one, the second's move ending before its switch, reporting the copy it leaves, and its clone
  following the first's record; a follower whose tracking ref names a record a later move replaced judges candidates by
  the record its own fetch finds, passing over a fork that copied the registry between the moves, and a listing that
  finds a record other than that one refuses, changing nothing; a follow whose destination a later move left after its
  candidate reads copies nothing there and refuses; leaving the source onto a remote a later move left refuses by
  § 9.8's check, changing nothing; two clones moving the state between two remotes in opposite directions at once end on
  one, the push that comes second losing its lease and its move ending before its switch; a copy that loses its lease to
  a later move's forwarding record at its destination runs again from step 1 and ends there, that record staying; two
  crossing moves whose copies each carry the other's commit back both go on, one forwarding record landing; a move back
  ended before its switch by another move off its old remote leaves that move's record where its copy deleted an earlier
  one, and a clone that never followed the earlier record follows it to the state's home, as does a follower that took
  the ended move's copy for the home; a move back interrupted after its copy, whose destination another clone then moved
  on, reruns, deletes nothing there, and leaves that move's record on its old remote, every clone ending on the state's
  home; and `--to` a remote carrying a forwarding record from outside this state's line of moves refuses, pushing
  nothing, naming `--to` the remote the state moved to; a follower whose old remote, a read source, was deleted is
  refused naming `arc store remote <remote> off` and a setting of the remote the state moved to;
  `arc store migrate --leave-source --to <code remote>` on a clone whose backing repository went before any forwarding
  record reached it, the code remote holding the project's registry, lands its last view there and moves the store into
  the code repository's refs, removing `backing`, while from a checkout whose state is still in the backing repository,
  the code remote holding none, it refuses naming that remote's `push` setting; one whose destination's URL is the old
  remote's refuses; and it refuses from a read source and with `--trial`; and a remote move's step 4, and a follow's
  deletes, against an old remote deleted after the switch, or archived read-only, keep the record, `move-unfinished`
  naming the cause and a rerun failing alike, until `arc store migrate --leave-source` ends it, its report naming what
  stays on the old remote, after which `--to` another remote and a setting that moves the layout each run. Step 4's
  re-copy and a follow's clearing copy each also run against a new remote whose ref a follower's push moved after the
  copy, and each merges onto it, reporting a broken rule in its notices; against one where the mover abandoned an item
  after its switch while a teammate's write to the item, and in a second run a teammate's archive of it, landed on the
  old remote, the write merging into the history ref, and the archive holding with the mover's abandon withdrawn and
  reported in the move's notices, and in a third run a teammate's abandon of it, the source's lineage holding and the
  mover's withdrawn abandon leaving neither its lineage nor a conflict record over it; and step 4's re-copy against a
  new remote a follower's clear reached first, which deletes nothing there. A clone that reopened an archived item
  before the move's switch, and a follower that did before its follow, each delete the copied history ref at their next
  push to the new remote; and a mover that ended an item on the old remote after step 1's fetch, and syncs from the new
  remote before step 4, keeps the item ended, its own push carrying the end there. In every direction — the code remote
  to a backing repository and back, between two backing repositories, and to and from a fork's upstream — the moving
  clone ends with the new state remote carrying `push` and the old one `off`, `backing` taking the new URL or removed,
  and its next `pull` and `push` report no state; and the new remote's registry holds a commit of the move's own, its
  tree unchanged, which the forwarding record names, a rerun's merge descending from it, and the commit step 3 left on
  the old remote's registry, which step 4 copies there before deleting that ref. Interrupted after its switch, a move
  between two backing repositories and one back to the code remote each finish on a rerun with no target, from the
  move's record, syncing meanwhile and reporting `move-unfinished` until the rerun; and while that record stands, `--to`
  another remote refuses `move-unfinished`. A move refused for another project's identity, and one to a mistyped or
  unreachable remote, leave no record, and `--to` the right remote then succeeds; so does a first run whose copy push a
  receiver without atomic pushes, or a hook, refuses, naming the cause, while a rerun's refused copy keeps its record
  until `--leave-source` ends it, whose report, where an earlier run's copy deleted a forwarding record there, names
  that record's commit, kept past the record's end, and its restore in `notices`. A move onto a remote whose identity
  record, or whose forwarding record, names another project refuses `identity-mismatch` before any push, its trial
  alike, and that remote is unchanged.
- **Following a move** to a backing repository, back to the code remote, and between two backing repositories, from a
  follower carrying `push` on its code remote, one carrying it on a fork's upstream, and one carrying `read`: until the
  follow, `pull` and `push` report `moved`, or the old source fails terminal `refused` naming the move (§ 9.6), whether
  or not the checkout holds the pointer's change, and `arc store remote` refuses every setting but the follow's and the
  old remote's `off`; the follow from a checkout without the pointer's change, an older branch's among them, refuses,
  naming the remedy to bring in that change, and changes nothing — for the fork-upstream and `read` followers of a move
  to a backing repository too, whose own fork holds no registry, and over a fork that copied the upstream's registry
  before the move with no write between, so that it holds the tip the move found; from one with it, the follow asks
  about the move's destination, never carrying the old role, and without a terminal reports `designation-needed`, whose
  answering command completes it — a follower holding `backing` following a move back to the code remote among them; on
  `push` the follower ends in the layout the move calls for, the old remote `off`, and `backing` repointed or removed,
  and on `read` or `off` with the old source `off`; and interrupted after each step, rerunning its answering command
  completes it. Following a move back to the upstream, a fork that copied the upstream's registry before the state left
  it, with no write since, is refused for lacking the move's commit and the follow takes the upstream, and where the
  fork is the follower's only remote the follow refuses, naming the remedy to add the upstream; where two of the
  follower's remotes hold the move's commit — a fork that copied the upstream's registry after the move — the follow
  refuses naming both, and `arc store remote <remote> push` naming one completes it. Following two consecutive moves of
  different kinds — a backing repository to the code remote and on to a second backing repository, and a backing
  repository to a second and on to the code remote — a follower that missed both follows from a checkout holding the
  second move's pointer straight to its destination, and from a checkout between the two moves refuses, naming the
  remedy to bring in the pointer's change. A follow whose presence read, or whose read of a candidate's forwarding
  record, project ID, or registry, fails refuses, changes nothing, and names that remote `unreachable`. A `read`
  follower whose store holds its own project ID, a contributor with a state remote of its own, follows the upstream's
  move to the candidate naming the forwarding record's project ID.
- **Two checkouts of one clone** — a second worktree, and the first checkout switched to a branch older than the move —
  after the clone moved or followed, the other holding the pointer's change: each pulls and pushes to the clone's one
  state remote in its one layout, neither reports a state, a no-target `arc store migrate` from either changes nothing,
  and `arc store remote` there shows the same roles.
- **The import** runs over a fixture repository in today's substrates whose review gate holds no evidence or outcome.
  Afterward every record the in-repo implementation lists reads the same through the ref backend — its content and every
  field both carry, never its version — but for the transforms of § 10.9, each lineage record's work-item references
  carrying their owners' UIDs among them, and each re-homed Errand's record carries as its `owner` the identity whose
  ref held it, a field only the ref backend's side holds. What the import reads directly is compared with its own
  source: each person's notes snapshot, less what § 10.8 keeps out, with their imported personal ref, through § 10.9's
  transforms — each moved file at its `scratch/` path, each entry less its `_Id:_` stamp, the two shared files less
  their tombstones, and each folded `SESSION-NOTES.md` against its meta's session context by the fold's rules, a body
  the writer refuses listed in `refused`; the store's project ID with the review gate's repository ID; Errand
  descriptions, inbound lists, and queues with the entries, buffer sections, held captures, and marks they came from,
  and each source without what moved from it — a draft without its buffer section, an inbox without its held captures
  and open Errands' origin entries, an entry without its mark — under § 14.1's test grammars through the backend's
  registry, since the production registry declares none for those three kinds yet (§ 5.1); and each closed task's
  captures with the in-repo implementation's `lookup` by commit, so every commit whose footer names a closed task
  resolves through both to the same work unit and tasks; and each live work unit's and open Errand's branch with the
  in-repo implementation's `lookup` by ref, each passed its own repository — the project ID, and the checkout — so each
  resolves through both to the same item, a meta with no branch, and one whose `Branch` names the base branch, getting
  no link, but for an Errand's branch other than `chore/`, which the in-repo `lookup` reads as a work unit's slug
  (`isTransientLookup`, `lib/store/in-repo/transient-lookup.ts`) and the store resolves to the Errand. Each link records
  `created` or `adopted` by its name, an Errand's `fix/<slug>` among the created, and reads the tip that contains the
  other, a remote-only branch the remote's tip; a work unit's `excluded` holds the branch's non-merge commits not on
  base less those its footers capture, and an Errand's is empty; and a branch neither side holds, and one whose tips
  diverged, are listed by the trial first in `refused`, under `branch-missing` and `branch-diverged`, and refuse the
  import. Each capture carries the copy key `computeCopyKeys` gives it. A parked work unit in the fixture imports paused
  and in flight at `Active`, its records reading as its branch's tip holds them — the remote's where only the remote
  holds it — and its pause carrying the pointer's reason, the meta's owner, and the parking commit's committer time in
  ISO-8601 UTC, and one whose pointer gives no reason, and one whose meta's `Owner` is not a slug, are each listed under
  `pause` and refuse the import. One parked from Planning imports as a stub. The lifecycle work's differential helper
  (`__tests__/helpers/store/lifecycle-differential.ts`) is the precedent. Over the same fixture with the gate's evidence
  and outcomes added, the trial lists them in `notices` and the import refuses, changing nothing (§ 10.8).
- **The notes snapshot:** a file that differs from its disk copy, by an entry removed on disk and by one only an older
  note holds, and a file the snapshot holds and no disk copy does are each listed by the trial, the second apart, and
  the import refuses until each agrees, then lands; the differing file agrees once saved and then loaded, and the
  snapshot-only one once a load restores it; a tombstone the snapshot carries and the disk lacks is no difference; a
  file over 256 KiB, one whose extension is off notes sync's allowlist, one under `scratch/`, and one in an ended work
  unit's workspace are listed `disk-only` and carried from disk, while an `.env` file is listed in `refused` and refuses
  the import until it is removed; and the identity root's `STATUS.USER.md` and a workspace's `.internal/` folder land
  nowhere. With two live work units, each saved from its own checkout and the second saved last, the trial run from
  either checkout and from a third compares each workspace with the newest note holding it, so a file changed on disk
  in the first agrees once saved and loaded from the first's checkout; and a third live work unit's workspace no note
  holds is listed `disk-only`.
- **After the import,** a completed work unit reopens and takes a write, and a write to a closed cohort's document lands
  on its history ref, and `history` of an abandoned origin's records refuses `not-found`.
- **Each Candidate record** gets the same result through the store's `history` as today's reader gets over code history
  (`resolveCandidateSupersessionAncestors` over the versions `readRepositoryCandidateSupersessionChain` reads): in the
  fixture, a chain with a version a merge commit introduced, which resolves, and a broken chain and a record today's
  schema rejects, which refuse on both sides; and a live work unit whose Candidate and boundary records sit only on its
  unmerged branch imports them from that branch, comparing clean against today's reader and the in-repo implementation
  run at that branch's head (§ 10.8).
- **The review mapping,** through a test mapping in the port: the import hands it the gate's whole folder, quarantined
  and retired files among them, each live work unit's Candidate versions oldest first with its current boundary, and
  the work-item table, a work unit in flight — one merged but not yet archived among them — and every Errand live, and
  an archived, abandoned, or cut work unit not. Each Errand row retains its original claim ID, and a reused slug with
  a different claim ID joins only its own review lineage to the minted UID (A2). What it returns lands in place of
  those records and files, each at its kind's stored path and a record's contents replayed oldest first, while a
  completed work unit's Candidate and boundary land as found, and the trial's `reviewMapping` carries its listing. A
  returned record a parser the test registry installs refuses, and one a serialization rule refuses, are listed in
  `refused` under `review-mapping`; an `in-flight` entry, a source the listing omits or repeats, and an archived work
  unit whose branch exists unlanded in base each refuse the import until fixed, after which it lands. The four source
  encodings of § 10.8 compare exactly: a materialization folder lists once, Candidate versions at one path remain
  distinct by commit, and overlapping folder/file or nested-folder coverage refuses, then lands after repair (A2).
  With no mapping in the port, the gate's evidence and outcomes added to the fixture are listed in `notices` and
  refuse the import.

#### 14.8 Hosts: a scripted trial, run by hand

The contract's host trial runs again against the built backend: GitHub and GitLab must hold, Azure DevOps and Bitbucket
should, and Gitea and Forgejo are best effort. It adds what this design relies on: `--porcelain` on each host, what a
receiver without atomic pushes prints, each host's text for a lost race, under `--atomic` and on a single ref, leased
deletes, the forwarding record, Azure DevOps' fork copying and its ordinary members' permissions, the message of the
history-replay push refusal, which the earlier trial met without capturing, and the two checks the open questions name:
that protocol v2 narrows the ref advertisement to a command-line refspec's prefixes, and that each host keeps the
`atomic` capability over HTTP. It needs credentials and scratch repositories, so it is a kit run by hand, its results
recorded in `notes-storage-ref-backend.md`, never CI.

#### 14.9 What personal files' shared names cost a pack

Measured locally: several people's personal refs pushed to a bare repository and packed, today's names against names
ending in the person's id (§ 3.2). A host's own packing cannot be observed, so this measures Git, not a host. Its result
is recorded in `notes-storage-ref-backend.md` beside the host kit's.

#### 14.10 Windows and macOS

The portability lane's cross-platform pair (`portability-cross-platform`, `.github/workflows/ci.yml`), which runs on
schedule and dispatch, covers `--git-dir` with Windows paths, reftable on NTFS, and process-start cost. One dispatched
run passes before this change lands, and it times the operations of § 11.7 against their budget.

#### 14.11 Which suites survive the cutover

A suite that runs the shared conformance suite, or tests a consumer through the contract, survives; one that targets the
in-repo implementation, notes, or Errand refs by name retires with them. This change records the list in
`notes-storage-ref-backend.md` for the cutover's deletion pass.

#### 14.12 CI cost

Until the cutover CI runs both backends. The ref fixture copies a prepared template repository per test, and its
conformance run per layout stays within 1.5 times the in-repo conformance's time on the same GitHub-hosted runner. The
test-cost budget rows the new files touch — tier and CI-job rows in `packages/arc-framework/test-cost-budgets.json` —
are baselined before the first file lands.

## Alternatives & Rationale

The design composes from the contract, Git's own primitives, and the ref machinery the CLI already runs: one atomic
primitive, a ref's compare-and-swap, as Gerrit NoteDb builds on; one ref per entity with refspecs kept in memory, as
git-bug keeps them; union merges on a private branch, as git-annex makes them; and a whole-store token that snapshots
per-shard positions, as a `jj` view or a Flink checkpoint does. Each rejected alternative below lost on a cost the chosen
design avoids.

**Boundary and the migrate verb**

- **A one-off import tool beside the migrate verb** would build the destination half twice, and without the verb the
  backing repository and local-only would be choices made once, at `arc init`.
- **Splitting the import into its own work unit:** it lands through the migrate verb's transaction, which the layout
  moves need regardless (§ 1.1).
- **Recording the Part B amendments at spec time** would leave the contract specification describing types the code does
  not have until this change lands; the change that alters the types appends the rows (§ 2).

**Encoding and versions**

- **The record's subtree id as its version:** with slug-named files, a rename would move every record's version.
- **A content-only version,** as S3's ETag reflects contents alone: a metadata-only write — a placement move, a links
  write — would not move the compare-and-swap basis, so two machines' placement writes could both succeed.
- **A sidecar metadata file per record** doubles the files and makes `list` walk trees; **metadata in commit-message
  footers**, as Gerrit NoteDb keeps it, makes current state a replay of the log, which NoteDb caches for that reason.
- **Trailers naming each changed record** would put the truth in commit messages rather than the tree.
- **Personal stored paths ending in the person's id** separate everyone for Git's delta search, at the cost of plain Git
  no longer reading as the checkout; § 14.9 measures whether the cost is real.

**The version model**

- **Writing every manifest on every `version`** costs a second process on every live read.
- **Re-reading the tips until two reads agree** costs a process on every check for a window the next manifest heals.
- **A pinned snapshot ref per anchor,** `jj`'s idiom, turns every anchor write into a publication across two refs that
  needs atomic capability and reopens the torn cut, needs a merge rule for one person's machines, and either grows for
  good or needs rotation built now, for portability no consumer uses.
- **`write` taking the anchor token** is explicit, but every anchor-writing caller would have to remember to pass it;
  the declaration says it once per kind.
- **Comparing identity refs only where both manifests carry them** cannot tell another person's ref from one created
  since without the clone's identity, a Git call on every no-change check.
- **Fetching inside the store on demand** for a missing history ref puts a remote call inside a local operation (D4),
  with an offline outcome of its own; the calling verb's pull by name keeps the store local.

**Sync**

- **Keeping `sync` beside a new `pull`** renames less, but leaves a name that sounds two-way on an operation that
  publishes.
- **Refusing any two tips that share no ancestor** refuses refs made separately, which share none, while a rewrite that
  keeps an old commit shares one and passes; **a fixed first commit for every shared ref** leaves that rewrite merging
  silently.
- **A conflict record naming a broken rule after a merge:** a conflict record holds a choice between two versions, which
  a broken rule is not, and one stored here could outlive its fix.
- **Letting the remote's side win when a late write meets an end,** as D4 had it, undoes the end record by record and
  leaves its lineage, children, or quarter folder beside a live item unless they are rolled back; **running the end again**
  over the merged work ref refuses against its own first run's lineage and children's creates.
- **A stated residual for two ends** — an item read as ended twice until someone noticed — leaves `lookup` and the
  quarter's listing disagreeing with nothing to report it.
- **Comparing a carried tip with the code remote's tracking ref** reads an unmoved code ref as raced whenever the
  tracking ref is stale.
- **Reading a record's history by first parent alone** keeps one line per clone, but files every write a pull brought in
  under the merge's provenance and drops the versions between, which D3's provenance and § 5.2's stale base read.
- **One batch across a pull's merges,** or exempting a pull's batch from the push loop's left-out rule: the first lets
  one held-back ref keep every ref the pull touched unpublished, and the second would publish a rebuilt folder without
  the history ref its `batch` names, or a withdrawal in part; a batch per ref, but for those, confines a held-back ref
  to what must go with it.

**Lifecycle moves and lookup**

- **Ending an item at any primary removal** leaves a bare removal with no end record for other machines to read, and
  refusing a bare removal would break D3.
- **Letting only a reopen resolve a completed item's conflict records** leaves the contract's other writes to a
  completed item nowhere to land.
- **Counter blocks,** as Gerrit reserves sequence blocks, serve a hot counter, which none is, and would show as gaps in
  a counter people read.
- **An index maintained on write for `lookup`** is a second record to keep consistent under every write and merge, for a
  cost the measured scan does not show.

**Layouts and remotes**

- **A top-level `arc.stateRemote` key** with a mode key beside it dangles on a remote's rename or removal; **a
  per-machine file tier inside the checkout** is per worktree unless rooted in the primary, and the designation must
  never sync.
- **Judging the clone's designation by the tracked pointer at every sync,** from the invoking checkout or the primary,
  gates per-clone state on a per-checkout file: two worktrees, or one on a branch older than the move, read it
  differently, and each one's remedy reverses the other's move for the whole clone. The clone's record governs, and the
  pointer is read only where a decision takes a destination from it (§ 9.2).
- **Finding a follow's destination by which remote holds the registry alone** sends a checkout that predates a move to a
  backing repository to whatever code-repository remote still holds a copy — a fork that copied the upstream's registry
  before the move — and so publishes state the move took private. The follow accepts only a remote that holds the commit
  the move landed (§ 10.6).
- **Recording the destination's kind, or the registry's tip as the move found it,** in the forwarding record: the kind
  refuses a follower whose checkout already names a later move's destination, and the tip still accepts a quiet
  project's fork copy, which holds it unchanged. The move lands a commit no earlier copy holds, and the follow takes
  only a remote whose registry holds it (§ 10.6).
- **Keeping an undesignated clone's state in the code repository's refs** until a deliberate local-only move puts a fork
  contributor's state where D10 promises privacy, and still moves the store when a clone answers into local-only.
- **The store prompting for the designation itself** would put a prompt inside a library call that runs in hooks and CI;
  the store reports the question and the calling verb asks (§ 9.3).
- **Minting the project ID at `arc join`** when no remote held one leaves two create-only identity records to clash once
  both are pushed.
- **Keeping the registry ref on a remote being left,** with a final commit marking the move, leaves the registry's whole
  history reachable there.
- **A move lock on the remote being left** serializes moves off one remote only, and needs a recovery for a lock its
  holder abandoned; the registry commit every remote move's copy already lands serves instead, as each remote's move
  version (§ 10.3).
- **Restoring the forwarding record a move's copy deleted,** when the move ends before its switch, puts back two records
  pointing at each other where two crossing moves both end.
- **Leaving the source onto a remote carrying a forwarding record, beside that record,** publishes the clone's view on a
  remote the state has left, and where a remote is deleted while two moves run, leaves records pointing at each other.
- **Holding identity-scope refs back by default** costs every person the backup and cross-machine carry for a privacy
  most do not need, and a held push only delays the same exposure.
- **An explicit removal of a non-`push` `backing`** adds a command for what a code remote's `push` setting already says
  where the pointer names no backing repository (§ 9.4); **letting `--to` run from a local-only clone** would move one
  clone's state as though it were the project's.
- **Ending a move's record by itself when its old remote fails after the switch** cannot tell a deleted repository from
  a network or permission failure, and would leave state published on a remote about to go public; the person's
  `--leave-source` makes that call (§ 10.6). **Confirming the old remote before the switch alone** narrows the window
  but leaves a remote lost after the switch with no exit.
- **Reading the pointer only beside a `backing`** leaves a fresh clone's `arc store remote <code remote> push`
  publishing its state to the code remote of a project whose state lives in a backing repository unasked. **Refusing
  that setting outright** leaves a fork contributor no remote for their own state, against D14, where Git's tools ask
  once when the target is ambiguous and let an explicit choice stand (`gh repo set-default`); **letting it stand
  unasked** publishes a team member's state where it is never withdrawn (§ 10.7); **refusing the yes where the store
  holds state pulled from the backing repository** has no reliable read once a repoint drops `backing`'s tracking refs
  (§ 9.4), so the question says what a yes publishes instead, and an informed yes stands. **Leaving the source with the
  old remote's tracking refs carried uncopied, or replaced by the destination's tips,** loses what the clone pushed to
  the old remote after a move's copy, or a history-ref delete its reopen owes; **a last-view route for each command that
  reaches it** — the follow's, the repoint's, a code remote's — states one copy and its checks three times; **counting
  every end already at a copy's destination as published** would close leaving the source's residual, but changes
  § 10.4's rule for every move's merge to cover a window that needs an old repository deleted inside one step of an
  interrupted move.

**Git access and maintenance**

- **Keeping Git 2.45 with a bounded retry** when a transaction fails with every ref matching guesses at a lock the
  helper cannot see.
- **Checking the Git version once per process** spends a process on every command, doubling a no-change check's one.
- **A long-lived reader for every command** is a child process to open, close, and abort, and on Windows holds
  maintenance until it closes, for a cost no measured command yet shows; § 11.7 adds one where a read's budget is
  breached.
- **Maintaining and measuring inside every `pull` and `push`** walks each never-retiring ref's history on every push; **a
  machine-local log of every push's figures** catches the bursts handoff's push misses at the cost of a record kept for
  an advisory signal.

## Cross-cutting Considerations

**Security and trust boundaries.**

- Identity scope is not private: anyone who can read the state remote reads it. A repository that wants its state
  private keeps it in a backing repository or local, and moves it before going public (§ 10.7).
- The backend never pushes `refs/arc/*` to a remote the person has not designated, and the designation never syncs.
- The serialization rules refuse `.env` files, private keys, and paths Git's object check refuses — `.git`,
  `.gitmodules`, and `.gitattributes` in any spelling, and any component over 4,096 bytes, with every owner's name and
  key bounded so no name a later archive, close, or rename forms passes that — at every write and in the import, never
  skipping them; a merge or a move carries what another machine's write already checked, gating on none (§ 6.4, § 10.4).
- The forwarding record carries no URL and keeps no state history reachable on the remote being left.
- Leases keep a push from recreating what another machine's lifecycle move deleted; a host cannot enforce ARC's writer
  rules, as for every ARC writer rule (D11).
- Git's message text is read in three named places only — a receiver without atomic pushes, a server's per-ref
  refusal line, and a remote failure's network or authentication cause — always under `LC_ALL=C`. Text read nowhere
  else is still reported: a refusal's message carries the server's `remote:` lines and a pre-push hook's stderr
  verbatim, never classified (§ 6.9).

**Performance.** A no-change `version` costs one Git process, a live `read` two, or three on a ref holding open conflict
records, and `list`, `lookup`, and a read reaching a quarter four, against the Windows budget of § 11.7; `pull` and
`push` end within their 120 s deadline, which aborts a Git call in flight, and a presence read within the shipped 5 s
bound, while a move's transfers run unbounded (§ 6.1); `maintain()` keeps packing current for a store that only plumbing
writes.

**Compatibility.**

- ARC is pre-public-release, so Part A's `sync` is renamed in place with no alias, and the reference backend and suite
  follow.
- ARC's Git floor rises to 2.47 for every command, not only the store's; an older Git meets a named floor error where it
  explains a store failure (§ 11.3).
- `KindMechanism` gains an optional field, so registry consumers compile unchanged.

**Testing.** § 14: conformance over both layouts, integration over real repositories and remotes, the import by
comparison, scheduled bursts, the portability pair, and a hand-run host kit.

**Migration and rollout.** The backend is dark until the flip (§ 1.3), and `arc store` is registered hidden until then,
as `cli.ts` registers `hook-remedy-roadmap-conflict`. Landing this change alters nothing this repository's state reads.
Expected contract for the cutover: it runs the import's trial and tidy, quiesces, imports, flips, rewires `arc sync`
onto `pull` and `push`, un-hides and documents `arc store`, and deletes notes sync, the in-repo implementation's arms,
and the import's transform.

**User-facing impact.** Before the flip, two effects ship: ARC's documented Git floor rises to 2.47, which the store
checks only on a failure an older Git would explain (§ 11.3), and the shipped `arc-config.yml` declares
`storage.backing_repository`, empty, which `arc config status` lists and `arc config validate` knows, as they do every
key in the configuration catalog (`readConfigSettings`, `lib/config/status-reader.ts`; `CONFIG_VALIDATION_FIELDS`,
`lib/config/schema.ts`), and which only the hidden `arc store` commands act on until the flip (§ 9.2). From it: a
designation question once per clone where § 9.2 asks one, `arc store remote` and `arc store migrate`, and `arc sync`
running a pull and a push.

**Package boundaries.** The backend sits under `lib/store/ref/`, imported only within `lib/store/`; its Git capabilities
under `lib/git/`. Shipped content changes for the Git floor, edited in the package's `QUICK-REFERENCE.template.md` and
synced to this repository's `QUICK-REFERENCE.md`, and for `storage.backing_repository`, which the package's
`arc-config.yml` declares empty, as it declares every key in the configuration catalog (`ARC_CONFIG_FIELDS`).

## Success Criteria

1. **The contract changes land.** `Store` has `pull`, `push`, and `maintain` and no `sync`; the result types, the
   `state-unresolvable` refusal, the cohort's archive placement, a companion's path key, the `ReadOnlyStore` type, and
   `RefHome` are as §§ 2, 3.2, and 9.6 give them, and the hunk conflict record's three fields and `MergeTextInput`'s
   base version as § 3.7 gives them; and the contract specification's Amendments log carries one entry for each
   amendment in § 2.6.
2. **Conformance passes over the ref backend in both layouts** with no exclusion beyond § 14.1's, and over the in-repo
   and reference fixtures with § 14.2's changes.
3. **The serialization rules hold everywhere they run.** `checkSerializationRules` is exported from `lib/store/`, and
   each rule refuses at `write`, at `batch`, and in the import's build, with the cases of § 14.4.
4. **The version model holds.** A no-change `version` spawns one Git process; the manifest's id equals Git's own write in
   both object formats; an anchor's manifest resolves on a fresh clone; and each case of § 14.3 passes.
5. **Sync and lifecycle hold under concurrency.** Every integration case of § 14.5 passes on every change, and the
   bursts pass with no lost write in one dispatched run of the Windows and macOS pair and one of the Linux portability
   job before this change lands (§ 14.5).
6. **Designation and read sources follow § 9.2 and § 9.6** in every case of § 14.6.
7. **Every move restarts and the import compares clean.** Every case of § 14.7 passes: each move, interrupted after each
   step, completes on a rerun; the trial report of each move that takes `--trial` matches it; and the import's
   comparison differs only by the transforms of § 10.9, its three entry kinds compared under § 14.1's test grammars, the
   review gate's facts refusing while no mapping is in the port and a test mapping's records landing in place of what it
   was given, and a parked work unit importing paused (§ 14.7).
8. **The Git access holds.** The Git floor reads 2.47 at every site in § 11.3's table, a store failure an older Git
   explains names the version found and the floor, and the stdin and byte executor variants end a call on an aborted
   signal (§ 14.1).
9. **The Windows budget holds:** a dispatched portability run passes and times every operation of § 11.7 within its
   budget.
10. **The backend stays dark.** `createStore` composes the in-repo implementation; outside `lib/store/`, nothing imports
    `lib/store/ref/`, as the store import rules enforce; no production code calls `createRefStore` or
    `createReadSourceStore`, and only the `arc store` handlers call `runStoreRemote` and `runStoreMigrate`; and
    `arc store` is absent from `arc --help`.
11. **CI cost holds:** each layout's conformance run stays within 1.5 times the in-repo conformance's time on the same
    runner, and the test-cost rows the new files touch were baselined before they landed.
12. **The host kit has run, the pack cost is measured, and the surviving suites are listed:** GitHub and GitLab hold
    every check, the other hosts' results are recorded, and § 14.9's measurement and the list of surviving suites are
    recorded, all in `notes-storage-ref-backend.md`.
13. **The quality gates pass** at every gate the project declares.
14. **Review import identity and coverage hold.** Errand table rows retain their original claim IDs; the four
    source encodings of § 10.8 account for every supplied source exactly once, materializations by folder, with
    reused-slug joins and omitted, repeated, and overlapping coverage tested through repair (§ 14.7) (A2).

15. **Exact path diagnostics preserve managed-key admission.** Unicode and quote-bearing managed path keys list
    as records; an entry whose path holds a backslash lists as `malformed`, keyed by that exact original path, beside
    every valid record (§ 11.6) (A3).

16. **Retirement checks observe the proposed batch before its sweep.** On the ref backend, creating terminal lineage
    over held inbound entries refuses without changing state; settling or explicitly removing those entries in that
    batch admits the retirement and leaves an empty final history tree. Checks observe the prepared mutations before
    the automatic sweep (§ 5.3, § 7.4) (A4).

17. **Companion path length follows its encoding.** A companion path stored verbatim can exceed 2,040 total UTF-8
    bytes when every stored segment is at most 4,096 bytes; a companion name combined with its owner's slug retains
    the 2,040-byte bound. The pure guard and ref writes and batches enforce these boundaries (§ 5.6, § 14.4) (A5).

18. **Lineage formats are per origin.** Each `lineage/transition` format key includes its origin UID; reads, puts,
    and removals preserve other origins' formats and record versions in the same registry ref, including initial
    and newer-format cases (§ 3.3, § 14.3) (A6).

19. **Identity removal expires its UID handle.** After removing the project identity, the removed record's
    UID-bearing handle refuses `identity-mismatch`, its UID-less project handle refuses `not-found`, and recreation
    succeeds. Shared conformance retains removal coverage without a new fixture exclusion (§ 14.2) (A7).

20. **Companion alias admission uses the resolved owner.** Fixed record forms and reserved storage coordinates
    refuse before I/O. A generic root path aliases its companion name only under the resolved owner's current slug;
    valid literal paths remain usable through older UID hints and former names, while true aliases refuse without
    partial write or batch effects and a corrected key succeeds (§ 3.2, § 5.1) (A10).

21. **Repair does not invent historical states.** Forward metadata repair restores current operations while history
    and changes requiring the malformed ancestor refuse explicitly; a changes interval wholly after repair succeeds.
    Missing commit or root-tree objects require restoration before exact historical reads can recover (§ 3.3) (A11).

## Open Questions

None blocks starting. The dependencies below are expected contracts with stated availability, and none leaves design
open:

- **At the flip or with their verbs:** callers that meet `state-unresolvable` naming history refs, but for `arc rename`,
  whose retry this change builds, pull them by name and retry (§ 4.5); the asking points surface `designation-needed`
  (§ 9.3); `arc init` sets `push` and mints the project ID (§ 9.2, § 9.8); the Errand identity consumers move their
  acquisition onto the store (§ 13.1); and `arc sync` runs a pull and a push (§ 6.1).
- **With the working copy:** its removal check calls `checkSerializationRules`, and its persist reports the backend's
  refusal (§ 5.6).
- **With handoff's rewrite:** handoff calls `maintain()` and shows its measurements and its own push's figures (§ 12).
- **Before the import runs:** `work-item/description`, `work-item/inbound`, and `personal/errand-queue` declare their
  entry grammars, which the import's build stamps by and the backend merges by (§ 5.1, § 10.9); until each does, the
  import's trial names it and the import refuses (§ 10.5). This change verifies those three kinds' import under test
  grammars (§ 14.7), so the declared grammars are first exercised by the cutover's trial run. The review family's
  mapping likewise fills the import's `reviewMapping` port (§ 10.8): a pure function over the input § 10.8 states,
  returning the records of live work in the family's kinds and an account of every source it was given, each record
  parsing under its kind's schema and passing its kind's write check over the set it returns. Until it does, the
  import's trial lists the gate's facts and the import refuses; this change verifies the import's side through a test
  mapping, and that refusal.
- **Available before the import re-homes Errands (§ 10.9):** the Errand record's optional `owner`, the identity slug of
  the person who owns it. The record's schema is strict today (`TransientIdentityRecordSchema`,
  `lib/errand/identity-record.ts`), so `serializeTransientIdentityRecord` throws on a record carrying `owner` until
  the field lands; the rest of this change implements without it.
- **Unverified and load-bearing, checked by the host kit (§ 14.8):** that protocol v2 narrows the ref advertisement to a
  command-line refspec's prefixes, and that hosts keep the `atomic` capability over HTTP.

## Amendments

- **A1** — 2026-10-16 — design: an archived work unit's unlanded-branch refusal names removing the branch as its exit.
  _Supersedes:_ § 10.8 `workItems` ¶. _Trigger:_ review. _Work:_ 15.9. _Revalidated:_ pending → 15.9.

- **A2** — 2026-10-16 — design: review import preserves claim IDs and canonical source units.
  _Supersedes:_ § 10.8 table and source accounting. _Trigger:_ door. _Work:_ 15.R. _Revalidated:_ pending → 15.10.

- **A3** — 2026-10-16 — design: backslash entries retain exact diagnostic paths and remain invalid record keys.
  _Supersedes:_ § 11.6 pathname claim. _Trigger:_ 3.3.a must-stop. _Work:_ 3.3.R. _Revalidated:_ 4.5.

- **A4** — 2026-10-16 — design: retirement checks precede the sweep and admit same-batch inbound settlement.
  _Supersedes:_ § 7.4 other-origin put refusal. _Trigger:_ door. _Work:_ 6.R. _Revalidated:_ 6.R.

- **A5** — 2026-10-16 — design: verbatim companion paths use segment bounds; combined names retain the key bound.
  _Supersedes:_ § 3.2 key exception and § 5.6 key cap. _Trigger:_ 5.1 must-stop. _Work:_ 5.R. _Revalidated:_ pending → 8.6.

- **A6** — 2026-10-16 — design: lineage transition format keys include the origin UID.
  _Supersedes:_ § 3.3 format-key rule. _Trigger:_ 5.3 must-stop. _Work:_ 5.R2. _Revalidated:_ pending → 8.6.

- **A7** — 2026-10-16 — design: identity removal checks absence through the UID-less project handle.
  _Supersedes:_ § 14.2 removal assertion. _Trigger:_ 5.10 must-stop. _Work:_ 5.10.R. _Revalidated:_ pending → 8.6.

- **A8** — 2026-10-16 — task: primary role replacement uses one version-bound put, retaining logical batch uniqueness.
  _Supersedes:_ none. _Trigger:_ 6.6 must-stop. _Work:_ 6.6.R. _Revalidated:_ 6.6.R.

- **A9** — 2026-10-17 — task: merge history compares the result with the preceding ordered record state.
  _Supersedes:_ none. _Trigger:_ 7.2 must-stop. _Work:_ 7.2.R. _Revalidated:_ 7.2.R.

- **A10** — 2026-10-17 — design: generic companion alias admission follows owner binding; fixed forms stay early.
  _Supersedes:_ § 5.1 step 1 key-rule order. _Trigger:_ 7.4 must-stop. _Work:_ 7.4.R. _Revalidated:_ pending → 8.6.

- **A11** — 2026-10-17 — design: forward repair restores current state without inventing historical metadata.
  _Supersedes:_ § 3.3 repair remedy. _Trigger:_ 7.5 must-stop. _Work:_ 7.5.R. _Revalidated:_ pending → 8.6.

- **A12** — 2026-10-17 — task: verify migration-only commit modes through their public callers.
  _Supersedes:_ none. _Trigger:_ 8.3 must-stop. _Work:_ 16.R. _Revalidated:_ pending → 16.R.

---
