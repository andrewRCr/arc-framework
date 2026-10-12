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
- **Machine-local** — kept under the Git directory, `refs/arc/tmp/`, or a person's `.internal/` folders
  (`MACHINE_LOCAL_PATHS`, `lib/store/registry.ts`), never stored as state, synced, or projected.
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
   an unresolvable state version, a cohort's archive placement, and push figures on every outcome; Part B is amended
   where this design finds it wrong (§ 2).
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
- **No record kind's parser, field schema, or write rule.** The kind registry supplies them; this backend runs them.
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
  in-repo implementation: the `store-production` and `store-tests` import rules (`eslint/architecture-imports.ts`) cover
  it as they cover `lib/store/in-repo/`, so only `lib/store/create.ts` imports its entry and no test imports it.
- **`lib/git/`** gains the executor capabilities of § 11: the ref-transaction helper, the push helper, cancellation on
  the stdin and byte variants, and the Git-version check on failure.
- **`lib/store/`** gains the contract changes of § 2; the serialization rules' function (§ 5.6); and, in
  `lib/store/create.ts` beside `createStore`, four exports over the ref backend: `createRefStore(ports)`, which the
  conformance fixture and the integration tests build their store with (§ 14); `createReadSourceStore` (§ 9.6); and
  `runStoreRemote` and `runStoreMigrate`, the entry points the `arc store remote` and `arc store migrate` handlers call
  (§ 9.4, § 10.1). `createStore` stays the one composition point that selects the backend operational reads and writes
  run through; the four serve only tests, a read source's view, and the `arc store` commands, which act on the ref store
  by name.
- **The import's transform** sits in its own module under `lib/store/ref/import/`, reading through the in-repo
  implementation, so the cutover's deletion pass removes it with that implementation and nothing else references it.
- **Commands:** `arc store remote` and `arc store migrate` (§ 9.4, § 10.1), registered hidden until the flip, as
  `cli.ts` registers `hook-remedy-roadmap-conflict`.

Construction follows the contract's composition rule: `createRefBackend(ports)` takes every dependency as one object —
the Git executor and its stdin and byte variants, file access, the clock, the checkout root, the identity, the kind
registry (the production set by default), and the lock factory — and runs no command and reads no file until an
operation needs one.

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
appends one entry per amendment in § 2.5 to the contract specification's Amendments log, so that specification never
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
  notices: a fetch that moved or created the notes ref, then its load, is `pulled`; one that moved nothing, found no
  note, or found the local notes ahead, `noop`; a remote it cannot reach `failed` `unreachable`, with the cause
  `classifyRemoteFailure` reads (§ 11.5); and notes that diverged `failed` `refused`, terminal, with the remedy
  `arc sync`. Its `push` is today's `sync`, each outcome carrying a retry count of zero and, as its time waited, the
  elapsed time it already measures; and its `maintain` returns no measurements. The in-repo fixture excludes the suite's
  `pull` items for the `work-item` and `claims` families by name (§ 14.2). The reference backend's `pull` reconciles
  against its in-memory remote and publishes nothing (`createMemoryRemote`, `__tests__/helpers/store/sync.ts`), its
  `push` is today's `sync`, and its `maintain` returns no measurements. Both backends' `push` returns `pulls` empty,
  reporting its reconciliation through `publishes` as `sync` does today.
- **The rename is cheap now:** no production code calls the contract's `sync()` — `createStore` delegates it, and the
  conformance suite exercises it (`__tests__/helpers/store/suite-sync.ts`).

#### 2.2 Results

```ts
/** States reported once per pull or push; none is a failure. */
type SyncState =
  | { status: "no-remote" }
  | { status: "no-identity"; families: FamilyId[]; remedy: Remedy }
  | { status: "designation-ambiguous"; remotes: string[]; remedy: Remedy }   // § 9.1
  | { status: "move-incomplete"; condition: string; remedy: Remedy }         // § 10.3
  | { status: "moved"; remote: string; remedy: Remedy }                      // § 10.6
  | { status: "designation-needed"; remote: string; choices: ("push" | "read" | "off")[]; remedy: Remedy }; // § 9.3

interface PullResult { states: SyncState[]; pulls: PullOutcome[] }
type PullOutcome =
  | { status: "pulled" | "noop"; remote: string; role: "state" | "read"; families: FamilyId[]; notices: PullNotice[] }
  | { status: "failed"; remote: string; role: "state" | "read" | "candidate"; families: FamilyId[];
      failure: Extract<StoreRefusal, { code: "unreachable" | "refused" }> };   // PublishFailureSchema's arms
type PullNotice =
  | { kind: "history-diverged"; ref: string; local: CommitSha; remote: CommitSha; condition: string; remedy: Remedy }
  | { kind: "tracking-update-failed"; ref: string; condition: string; remedy: Remedy }
  | { kind: "ended-with-conflicts"; item: OwnerIdentity; conflicts: RecordReference[] }
  | { kind: "end-withdrawn"; item: OwnerIdentity; condition: string; remedy: Remedy }
  | { kind: "ended-twice"; item: OwnerIdentity; condition: string; remedy: Remedy }
  | { kind: "rule-broken"; reference: RecordReference; rule: string; condition: string; remedy: Remedy };

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
  `history-diverged` or `tracking-update-failed` notice ends nothing: the ref keeps its local tip, and every other ref
  in the fetch applies. A remote whose presence read failed reports a `failed` outcome in the role `candidate` (§ 9.2).
- **A push's `pulls`** are the outcomes of every pull its loop ran (§ 6.7), in order, so a notice raised inside a push —
  a withdrawn end among them (§ 6.6) — reaches the firing point as a pull's does.
- **Push outcomes** keep today's per-publish shape (`PublishOutcomeSchema`, `lib/store/sync.ts`), each naming the
  families it carried; every one now carries the push loop's retry count and time waited, which the contention tripwire
  reads from handoff's own push (§ 12). The in-repo-only statuses keep their shape and retire with notes.
- **`carry`** reports the carried code ref's own outcome. A refused carried ref never fails the state publish: the push
  repeats with state alone and reports the carried ref's refusal here (§ 6.8).
- **The new states** report why the state remote is not synced. Three come from a clone's own configuration: two remotes
  marked as the state remote, a store outside the layout its designation calls for, or a designation the tracked pointer
  does not allow — a layout move left unfinished, a remote edit outside ARC (§ 10.3), or another clone's move not yet
  followed (§ 9.2) — or a designation question due (§ 9.3). A pull or push reporting one of them fetches and pushes
  nothing for the state remote. The fourth, `moved`, comes from the state remote itself: the pull's fetch of the project
  namespace finds its forwarding record (§ 10.6), and nothing pushes to that remote. A read source still pulls under all
  four.

#### 2.3 Refusals

One local refusal is added to `LocalRefusalSchema` (`lib/store/refusal.ts`):

| Refusal              | Class       | Meaning and remedy                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state-unresolvable` | recoverable | A state version, or an ended item's history the operation needs, is not in this clone; its fields are below. Remedy: where it names history refs, pull them by name and retry, a write whose state remote lacks them taking § 7.3's remedy; where it names none, a read rebuilds from the current state, and a write whose anchor field names a token nothing here resolves writes that field from the current `version()`, or null |

```ts
// LocalRefusalSchema gains, a strict object like its other arms:
{ code: "state-unresolvable"; class: "recoverable"; condition: string; remedy: Remedy;
  stateVersion?: StateVersion;    // the state version the operation named, where it named one
  historyRefs: HistoryRef[];      // each ended item's history ref this clone lacks; possibly none
  reference?: RecordReference;    // the record of a write or batch the refusal is for
  field?: string }                // the anchor field whose token failed
```

- **Who produces it:** `read` and `list` as of a state version, `changes` from or to one, `history` of an ended item —
  one whose quarter folder or lineage record this clone holds — whose history ref it lacks, and `write` or `batch` when
  an anchor field names a token this clone cannot resolve or the write lands on a completed item whose history ref this
  clone lacks (§ 4.5, § 7.3). The conformance suite gains its recovery case, which a backend produces or excludes by name.
- **It is not `unsupported`'s `uncovered-state-version`,** which names a state version the in-repo implementation's
  token does not cover and whose remedy, binding per-record versions, would not recover this one.
- **`history-diverged`** stays: the notes export's outcome retires with notes, and the same name becomes `pull`'s
  per-ref notice (§ 6.3).

#### 2.4 A cohort's archive placement

A cohort's document is its only record, and closing a cohort is a placement write to it, as archiving a work item is a
placement write to its primary:

- **Write:** a `put` to `cohort/document` may carry `placement: { kind: "completed", quarter }` to close the cohort or
  `{ kind: "active" }` to reopen it, and no other placement; with none it keeps its current one. `MutationSchema`
  (`lib/store/write.ts`) admits it for that kind alone, with no `links`.
- **Read:** an archived cohort document reads with
  `{ kind: "completed", quarter, sequence, closeout: "leaf" | "parent" }`, the store assigning the sequence and the
  closeout (§ 7.6); an open one carries no placement. `StoreRecordSchema` validates the shape for the kind.
- **The in-repo implementation** refuses the write as `unsupported` `placement-move`, terminal, as it refuses moving a
  work item, naming archive as what serves it until the flip. The reference backend implements it.
- **The cohort kind's rules** already read this placement through `after` (`cohort.open-members`, `cohort.parent`), so
  an archive's batch that places the document completed beside its last open member passes, and a cohort read as open
  until a backend returned a completed placement now reads closed on this backend.

#### 2.5 Amendments to the contract's decisions

Each amends the contract specification's named decision forward, in Part A or Part B:

| Decision | Amendment                                                                                                                                                                                                                                                                                                                                                                        | Section          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| D1       | Two remote operations, `pull` and `push`, replace `sync`; `maintain()` joins the contract                                                                                                                                                                                                                                                                                        | § 2.1, 12        |
| D4       | `state-unresolvable` joins the local refusals; `history-diverged` stays as `pull`'s notice; Git's message text is read in three named places: a receiver without atomic pushes, a server's per-ref refusal line, and a remote failure's cause                                                                                                                                    | § 2.3, 6.9       |
| D4       | `pull` and `push` report four states beside `no-remote` and `no-identity`, none a failure: `designation-ambiguous`, `move-incomplete`, `moved`, and `designation-needed`; every publish outcome carries the push loop's retry count and time waited                                                                                                                              | § 2.2, 9.3       |
| D4, D6   | When a late write meets an item's end, the end's version stays current whichever side is remote, and the late version goes into a conflict record                                                                                                                                                                                                                                | § 6.6            |
| D5       | A cohort's document carries a placement: a write closes it as `completed` with its quarter or reopens it as `active`, and an archived one reads with its sequence and closeout                                                                                                                                                                                                   | § 2.4, 7.6       |
| D6, D10  | No stub rank is built until a consumer reads one; only the Errand queue keeps rank keys                                                                                                                                                                                                                                                                                          | § 3.8            |
| D10      | The size cap reaches projected kinds only; a repository that goes public moves its state to a backing repository only when it wants that state private; `refs/arc/project/moved` joins the ref table                                                                                                                                                                             | § 5.6, 9.5, 10.6 |
| D12      | `stale info`, `reference already exists`, and `reference does not exist` join the retry set as lost races, and a server's refusal of a state ref outside it is read by state, a lost race when the ref moved; every push of a work item's or cohort's ref, live or under history, and every delete, is leased; a carried code ref's own rejection is never a lost race for state | § 6.5, 6.7–6.9   |
| D14      | Where no remote holds the project's registry, the clone asks once about its code remote, `push` or `off`; on a host whose forks copy state refs, a contributor's lone fork remote holding that copy is designated without asking and adopts the upstream's ID, a residual the host trial checks                                                                                  | § 9.2, 9.8       |

The contract left open where the designation is kept; § 9.1 settles it in Git config.

### 3. Record encoding

#### 3.1 The store's refs

The store is the refs whose names match a family's ref pattern in `FAMILY_REGISTRY` (`lib/store/registry.ts`) —
`refs/arc/work/<uid>`, `refs/arc/cohort/<uid>`, `refs/arc/project/inbox`, `refs/arc/project/registry`,
`refs/arc/user/<id>/personal`, and `refs/arc/user/<id>/claims` — plus the two namespaces that the work-item and cohort
families' `retention: "archive-and-history"` adds: `refs/arc/archive/<quarter>` and
`refs/arc/history/{work,cohort}/<uid>`. The backend derives all of them from the registry and reads, lists, manifests,
merges, and pushes no other ref, but for the forwarding record below.

- **Other refs under `refs/arc/` are invisible to it.** In this repository today those are
  `refs/arc/user/andrew/errands`, `errands-remote`, and `sync-state`, and the delivery residue under
  `refs/arc/bootstrap/`, `refs/arc/delivery-candidates/`, and `refs/arc/recovery/`.
- **`refs/arc/tmp/` is machine-local:** never state, never fetched or pushed. This design keeps the last manifest there
  (§ 4.2), each tracking ref's last head after a prune (§ 6.3), and a move's gathered refs (§ 10.4).
- **`refs/arc/project/moved`, the forwarding record (§ 10.6), is a control ref, never a store ref:** a pull fetches it
  with the project namespace into the tracking refs, and the migrate verb builds it under `refs/arc/tmp/migrate/`,
  pushes it, and deletes it, but nothing lists, manifests, or merges it.
- **A store holds state** when it holds any of its refs.
- **A ref's tree encodes its records.** The backend decodes a tree into records, merges and versions records, and
  encodes them back; no merge or version reads a raw path.
- **A tree the decode cannot read whole lists what it can,** reporting D4's per-entry diagnostics
  (`ListingDiagnosticSchema`, `lib/store/read.ts`) keyed by the entry's path, as a tree edited outside ARC needs: a blob
  the batched read cannot return is `unreadable`, and a ref whose tip or root tree it cannot read makes its family
  `unreadable`; a record over the cap is `oversized` for a kind the cap reaches (§ 5.6); a blob its kind's parser
  refuses, a JSON kind's that does not parse, a tree entry that maps to no `RefHome` — the ref's metadata file and
  anchor manifest (§ 3.2) aside — and an entry at a key § 3.2 refuses are `malformed`, an entry that maps to no kind
  reported by every listing of its ref's family; a `formats` entry above the registry's format version is
  `unknown-format-version`; and an entry whose stored state names two owners is `key-mismatch`: one under a metadata
  file whose UID is not its ref's, one at a path naming an owner — a slug, a UID, or a person — other than its ref's or
  its metadata file's, or one whose parsed content names an owner other than the one its path and ref map to.
- **One commit per batch per ref.** Each commit's message renders the batch's provenance as D3 has a backend over Git
  render it: a subject naming the verb and the owner's slug (`archive storage-contract`), and the trailers
  `Arc-Lifecycle-Action`, `Arc-Code-Head` where the caller gave one, `Arc-Owner` with the owner's UID where it has one,
  and `Arc-Batch` with the batch ID, which every `write` and `batch` mints with `randomUUID` and shares across every ref
  it commits on, so a single write that commits on two refs — an archive or a reopen by a placement write (§ 7) — is one
  batch too. `history` and `changes` return those fields as the stored provenance (`StoredProvenanceSchema`,
  `lib/store/links.ts`), with each record's reference read from the tree. The records a commit changed come from its
  tree, never its message. Commits are authored as the person (D12), with their name and email as the code repository
  resolves them (§ 9.7).

#### 3.2 Stored paths

- **A projected kind keeps the name the checkout shows:** a work item's files their basenames, a person's files their
  path under `.arc/user/`, so plain Git reads the store as the checkout does.
- **A never-projected kind ends its name with its owner's UID or person id,** which D2 allows for a stored path that is
  never projected; the project's single refs take fixed names.
- **A store holds one project.** Its owner is named `project`, as the in-repo implementation names it
  (`lib/store/in-repo/list.ts`), and its UID, where a reference carries one, is the project ID (§ 9.8), which the
  import's one project owner takes (A11). The project's refs and paths carry neither, a listing returns that owner, and
  `Arc-Owner` carries the project ID where the store holds one. A reference to another project — another name, or a UID
  not the project ID — refuses `identity-mismatch` naming the store's project, so no two callers' project records
  silently share one path.
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

| Kind                                             | Stored path                                                  |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `work-item/meta`                                 | `meta-<slug>.md`                                             |
| `work-item/task-list`                            | `tasks-<slug>.md`                                            |
| `work-item/draft`, `spec`, `notes`               | `draft-<slug>.md`, `spec-<slug>.md`, `notes-<slug>.md`       |
| `work-item/companion`                            | `<key>-<slug>.md`, a paired spec's halves below              |
| `work-item/description`                          | `errand-<slug>.md`                                           |
| `work-item/inbound`                              | `inbound-<slug>.md`                                          |
| `work-item/record`                               | `errand-<uid>.json`                                          |
| `review/candidate`                               | `review/candidate-<uid>.json`                                |
| `review/integration-boundary`                    | `review/integration-boundary-<uid>.json`                     |
| `review/evidence`, `outcome`, `terminus`         | `review/evidence-<key>-<uid>.json`, and likewise             |
| `review/adversarial-pass`                        | `review/adversarial-pass-<key>-<uid>.json`                   |
| `cohort/document`                                | `cohort-<slug>.md`                                           |
| `project-inbox/inbox`                            | `ATOMIC-INBOX.md`                                            |
| `project-registry/identity`                      | `identity.json`                                              |
| `project-registry/counter`                       | `counters/<key>.json`                                        |
| `lineage/transition`                             | `lineage/<uid>.json`                                         |
| `personal/inbox`                                 | `<person>/USER-INBOX.md`                                     |
| `personal/working-memory`                        | `<person>/WORKING-MEMORY.md`                                 |
| `personal/document`                              | `<person>/<key>`                                             |
| `personal/errand-queue`                          | `<person>/errand-queue-<person>.md`                          |
| `personal/session-context`                       | `<person>/<key>/SESSION-NOTES.md`                            |
| `claims/groom`, `claims/housekeep`               | `groom-<key>-<person>.json`, `housekeep-<key>-<person>.json` |
| every `*/conflict-record` of a family with a ref | `conflicts/<key>.json` under the family's root               |
| `project-inbox/routing-receipt`                  | `receipts/<key>.json`                                        |
| `personal/routing-receipt`                       | `<person>/receipts/<key>.json`                               |

- **The session-context kind is interim** (`interim: true` in `KIND_MECHANISMS`): session context moves into the meta
  at the flip and the kind retires with it. The ref backend stores it at the path above only so the shared suite covers
  every registered kind until then, and the import never writes it (§ 10.12).
- **A family's root** is its ref's root, or its subtree for `review` and `lineage` (`review/`, `lineage/`), or `<person>/`
  on a personal ref. A companion's key is its name, and a paired spec's halves, keyed `spec-prd` and `spec-rfc`, keep
  the checkout's `spec-<slug>-prd.md` and `spec-<slug>-rfc.md`, as the in-repo implementation names them
  (`companionPath`, `lib/store/in-repo/paths.ts`); an adversarial pass's key is its activity and number joined by a
  hyphen.
- **A key that would land on another kind's path refuses** `unsupported` `unhomed-kind`, naming that kind, as the
  in-repo implementation refuses a conventional role's name: a companion keyed `meta`, `tasks`, `draft`, `spec`,
  `notes`, `errand`, `inbound`, or `cohort`, and a personal document at a path another personal kind or the ref's
  metadata file holds, or under `conflicts/` or `receipts/`. So does any key whose path is a folder another record's
  path runs through, or runs through another record's path, naming that record — a personal document keyed `receipts`,
  or keyed as a session context's folder — since a Git tree cannot hold one name as both a file and a folder.
- **A key that is not one path segment refuses** `record-malformed` at validation (§ 5.1): an `id` key, or an
  adversarial pass's activity, that holds `/` or a control character, NUL and newline among them. `keySchemas` admit any
  non-empty string there (`lib/store/identity.ts`); a `/` would nest the stored path, which the decode of § 3.1 could
  not map back, a tree entry's name cannot hold a NUL, and a newline breaks the batched read's line-delimited names
  (§ 11.6). Every stored path embeds the key in a longer name, so `.` and `..` need no rule. A `path` key holding a
  control character refuses alike, since `validateManagedPath` (`lib/kernel/canonical/managed-path.ts`) refuses only a
  NUL.
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
  /** Each record's format version, keyed by kind and key, for any record past the initial version. */
  formats: Record<string, number>;
}
```

- **`list` reads trees and metadata in one batched `cat-file`:** each listed live ref's trees, which give every record's
  kind and key and the entries § 3.1 reports, with its metadata blob (§ 3.2), which gives placements and format
  versions; and each quarter's root tree, then its folders' trees and the metadata blobs they name, since a quarter's
  folder names carry their sequences and `cat-file --batch` answers each request as it arrives unless given `--buffer`.
- **A record absent from `formats` is at the initial format version** (`FormatVersionSchema`, `lib/store/identity.ts`).
- **It merges field by field** (§ 6.4), since placement and links are written by different verbs on different machines.
  One field changed on both sides becomes a conflict record, as a single-writer record changed on both sides does. A
  record removed on one side and changed on the other, in content or in metadata, is one clash over the whole record,
  and the version that stays current keeps its own metadata.
- **Read placement derives from it:** an active, backlog, or completed placement as written, and for a completed work
  unit or cohort the sequence and closeout read from its folder's name.
- **A removed primary's placement stays** in `primary`, with its role and links, so the item's other records keep
  reading with it, as the reference backend keeps a retained placement (`validatePlacement`,
  `__tests__/helpers/store/write.ts`): `StoreRecordSchema` refuses a work-item or review record without one. A put of a
  work-item or review record whose owner has neither a primary nor a kept placement refuses `record-malformed`, with the
  remedy to create the primary first or in the same batch.
- **A metadata file that is missing or does not parse** where its tree holds records — a ref's, or a quarter folder's —
  leaves those records nothing to read placement, slugs, or format versions by. A tree that holds no record needs no
  metadata file and reads as holding none: an abandon's or decomposition's final commit (§ 7.4) and the import's origin
  refs (§ 10.11). Only a commit made outside ARC leaves one, since every write and merge that leaves a record builds the
  file (§ 5.1, § 6.4). A listing reports that ref's family `unreadable`, as for a tip it cannot read (§ 3.1); `read`,
  `history`, and `changes` of a record on it, a `lookup` whose scan reads it, and a `write` or `batch` touching it
  refuse `namespace-corrupt`, terminal, naming the ref as its `namespace`, with the remedy to repair it forward: commit
  on top of its tip the metadata file from its last commit whose file parses, against the store's repository as § 6.3's
  remedies run, which the next push publishes as a fast-forward wherever the broken commit went. The push loop publishes
  no such ref (§ 6.7), and a pull that would move a local ref onto such a tip, by fast-forward or merge, leaves the ref
  and fails that remote's outcome as terminal `refused`, naming the ref, with the remedy to take the remote's tip
  (§ 6.3) and repair it forward.

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

- **JSON records are stored in canonical form.** A kind whose stored path ends in `.json` — every kind whose
  `projection` is `"never"` — is written in `canonicalize`'s bytes, whatever bytes the caller passes, as the in-repo
  implementation re-serializes its JSON kinds (`writeContent`, `lib/store/in-repo/write-codec.ts`), so equal content is
  an equal blob on every machine. A read returns the canonical bytes. Content that is not JSON refuses
  `record-malformed` under the rule `store.json` (§ 5.6).
- **Every other record is stored as written,** the meta and task list among them, since the working copy's base stamp is
  their blob id; an entry kind's put adds only the `_Id:_` lines its entries lack (§ 5.1).

#### 3.6 Rename and role change

- **A rename** writes its owner's metadata — the new slug, the old one appended to `formerSlugs` — and renames its
  projected files in the same commit, adding no blobs. On a completed work unit or Errand, or a closed cohort, it also
  renames its quarter folder (§ 7.3). A rename onto a slug a live work item or cohort holds refuses `ambiguous-match`
  (§ 5.1).
- **`history` and `changes`' restriction follow a record** across renames and the primary's role change between
  `work-item/meta` and `work-item/record` (A5): the backend computes every path the record has had from its former
  slugs and roles, then runs one path-limited `git log` over those paths and the ref's metadata file, so a metadata-only
  write appears as an entry with unchanged content.
- **A merge commit** is an entry only for a record whose merged result differs from every parent's, so a write merged in
  from another machine appears once, at the commit that made it.

#### 3.7 Write-once records

Conflict records and routing receipts are one file each, named by their ID, so concurrent additions merge as a union of
paths, as git-annex unions its branch. A merge mints each conflict record's ID with `randomUUID`, as the reference
backend does (`storeConflicts`, `__tests__/helpers/store/merge.ts`). Every conflict record's owner is the owner of the
record its content names (`record`, `ConflictRecordSchema`, `lib/store/conflict.ts`), as the reference backend files it;
on a `lineage/conflict-record`, whose path names no owner, the content alone gives it. A conflict record is removed only
by the write that resolves it (D6).

#### 3.8 Rank keys

Rank keys order the Errand queue only. Each queue member keeps its rank key inside the queue's record (D6, D11), which
replaces the file order of today's execute-bound marks (`listExecuteBoundInboxEntries`,
`lib/user-sync/inbox-writer.ts`). No stub rank is built: D6 and D10 give each stub a rank field, but nothing sets or
reads one, Part A's record and mutation types carry none (`StoreRecordSchema`, `lib/store/read.ts`; `MutationSchema`,
`lib/store/write.ts`), and backlog order has no consumer. The metadata file merges field by field and carries its own
format version, so a rank lands later as one more field beside placement, with Part A's types amended then (§ 2.5).

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

- **One `for-each-ref`** of `refs/arc/` as a single pattern with `--exclude=refs/arc/history/` reads every tip. The
  backend keeps the store's refs (§ 3.1) in process and computes the manifest's id in process: Git's tree format is
  fixed, and a test holds the computed id to Git's own write in both object formats.
- **The same call reads `refs/arc/tmp/version`,** which names the last manifest this clone wrote. An equal id writes
  nothing. A new id writes the manifest's new trees and moves that ref to it, two further Git calls, which also keeps the
  newest token from collection.
- **Finding the store costs no call:** the common Git directory comes from the worktree's `.git` file and the
  `commondir` file it leads to, as Git lays out a linked worktree, and the store directory's presence there selects the
  separate layout (§ 9.7).
- **No identity read:** the manifest takes every identity ref present. The designation is read only by `pull`, `push`,
  and the migrate verb, which reach a remote anyway, and by a write that finds no store (§ 9.7).
- **A live listing carries the current state version** on this backend (D4).

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
- **A token a machine keeps for itself** — a compaction seed, a projection index — rests on Git's expiry and on the
  refusal, whose remedy is to rebuild from the current state.
- **A manifest keeps an ended item's last tip,** so a read as of it needs that item's history ref, which a clone holds
  only once a pull has fetched it: the pull that applied the end, or one that names it (§ 6.4). A clone that never saw
  the end refuses as § 4.4 says.

**Expected contract for callers** (each lands with its verb in later changes): a verb that meets `state-unresolvable`
naming history refs pulls them by name (`pull({ history })`) and retries once with no stop — reopen (§ 7.2), restate and
recovery through `changes`, any verb that writes a completed item's records (§ 7.3), and any reader of an ended item's
`history`, the Candidate chain's among them. A person meets the refusal only
when that pull fails: with the remote unreachable, they rerun the verb once it answers; with the remote answering but
holding no such ref, the retry resolves through a reopened item's live ref or refuses again, a read with the remedy to
rebuild from the current state and a write with § 7.3's.

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
  batches span refs. A merge commit is read by § 3.6's rule, so one that renumbers or renames a folder adds no entry.
- **An archived item's later writes** are found through its quarter's ref, whose folder each such write refreshes in its
  batch (§ 7.3), and read on its history ref, where the record's version changed. A history ref whose log lacks a batch
  its folder shows — another machine's write, which the default fetch does not bring (D10) — refuses as § 4.4 does,
  naming the ref, so § 4.5's pull by name and retry covers it.
- **An identity ref is missing from a manifest only on another person's clone,** since each clone fetches its own
  identity alone (D10), and a shared ref leaves only by loss, which the next push restores (§ 6.4). So `changes` between
  two people's manifests carries the newer one's identity history whole, and a reader that wants project scope alone
  restricts to it — restate from another person's anchor when a work unit changes hands. Comparing identity refs only
  where both manifests carry them cannot tell another person's ref from one created since without the clone's identity,
  a Git call on every no-change check.

### 5. Writes

#### 5.1 The write path

`write` and `batch` run one path:

1. **Validate.** The input schemas and § 3.2's key rule, then the serialization rules on every put (§ 5.6), then each
   put's kind parser, whose failure refuses `record-malformed` with the parser's error before any check runs. A put of
   an entry kind whose grammar the backend's kind registry does not declare (its `KindDefinition`'s `entry`, in the
   registry the backend is constructed with, § 1.2) refuses `unsupported` `unhomed-kind` naming it — the contract's
   terminal case for a well-formed write that later work serves, which declaring the grammar is — so no stored record of
   such a kind reaches a merge. Each other put of an entry kind then stamps an `_Id:_` on every entry that lacks one, in
   the kind's grammar (`stampEntryIds`, `lib/store/concurrency/stamp.ts`), as the reference backend stamps after its
   parser and before its merge and checks (`persistedContent`, `__tests__/helpers/store/merge.ts`), so a stale base's
   merge (§ 5.2), the write check's `next` (§ 5.3), the stored blob, and the returned version all carry the IDs (D6).
   The stamp draws from a SHA-256 stream seeded by the put's reference, expected version or absence, and content, where
   the reference backend draws at random, so a retried put stamps the same IDs and its stale base merges to § 5.2's
   no-op. Content the stamp cannot place an ID in — an entry of a `field-header` grammar with no `_Remove when:_` line,
   which its ID line follows and without which `stampEntryIds` throws — refuses `record-malformed` naming the entry; the
   import's build refuses alike (§ 10.8).
2. **Resolve** each reference without a UID by `lookup`'s scan (§ 8). A write naming an owner nothing holds mints its
   UID with `randomUUID`, and a put creating a primary mints one even where ended items hold the slug, so the slug
   starts a new generation (D2); the batch's other records naming that owner take the same UID. A create whose slug a
   live owner of its type holds resolves to that owner, and § 5.2's absence rule refuses it. A write that otherwise
   leaves its primary live under a slug another live work item or cohort holds — a create across the two, a rename onto
   that slug, or a reopen of an item whose slug a live one took after it ended — refuses `ambiguous-match` naming both,
   with the remedy to rename one by its UID: every work item, whatever its type, and every cohort share one namespace,
   since a planned work unit and a cohort project to one `backlog/planned/` folder (D14). Within one type the reference
   backend refuses the same state (`indexIdentities`, `__tests__/helpers/store/identities.ts`). A rename that ends a
   clash between machines leaves one holder and lands, as does every write that changes no primary's slug or placement.
   Two processes on this machine creating one slug, or renaming onto it, at once both land, and readers meet the result
   as they meet two machines' records with one slug (§ 5.3). The same listing finds every owner's refs, whether the
   batch names it by slug or by UID: its live ref, or once it is archived its history ref and its quarter's ref (§ 7). A
   write to records kept on their owner's own ref, naming by UID an owner with neither — one ended outside the archive
   (§ 7.4), whose history ref the scan never reads — refuses `not-found`, as § 8 resolves its slug; lineage, kept on the
   registry's ref, is unaffected.
3. **Lock.** Take the machine-local lock of every ref the batch writes, in ref-name order (§ 11.4); a wait past its
   limit refuses `lock-held`.
4. **Read under the locks.** One `for-each-ref` reads the tips, each owner's live and history refs among them, and the
   records the batch names decode from them. An owner whose refs differ from what step 2 found — a ref present or
   absent, or its folder gone from the quarter step 2 found it in, as an end, a reopen, or a pull applying one leaves it
   — releases every lock and restarts the write from step 2, as the push loop retakes a grown set (§ 6.7), so a write
   never recreates a ref or a folder an end or reopen moved. Each put or removal's expected version is then checked
   (§ 5.2).
5. **Build.** The new trees over those tips: records, metadata files, anchor manifests (§ 4.5), and any ref the batch
   creates, moves, or deletes (§ 7). A record whose bytes differ from its put's — an entry kind's stamped content, or a
   stale base's merge (§ 5.2) — passes the serialization rules again on the bytes it stores (§ 5.6).
6. **Check.** Each written record's write check runs under the same locks (§ 5.3).
7. **Commit.** Under the layout lock, taken last (§ 11.4), the layout is read again, and one a move changed since step 2
   releases every lock and restarts the write from step 2, as step 4 does; then the new objects, one commit per touched
   ref, and one ref transaction naming every ref's expected old value (§ 11.1). A ref found off its expected value — a
   writer that bypassed the lock — retries the whole operation from step 4.
8. **Release** the locks and return each record's version, with any conflict records a stale base's merge created.

No lock is held across a network call or a hook's await: the write path makes no network call, and the push loop
releases its locks before it pushes (§ 6.7). A pull's merge takes the same locks and compare-and-swap as a write
(§ 6.4). So no write interleaves with another writer of its refs between its read and its commit, and none lands on refs
its owner has left, which are the races the reference backend closes by queueing writes and syncs on one shared state
and resolving inside the queue (`withStateQueue`, `__tests__/helpers/store/state-queue.ts`).

#### 5.2 Expected versions, stale bases, and no-op rewrites

- **A put expecting absence** requires the record absent; for a work item's primary, absent in both roles (A5).
- **A stale expected version** on a single-writer kind refuses `version-conflict`, naming every stale record in the
  batch. On a merge kind — one whose `merge` in `KIND_MECHANISMS` is `line` or `entry` (D6) — it is a stale base: the
  backend finds the content at that version in the record's history and merges from it by the kind's mechanism
  (`lib/store/concurrency/`), returning the merged version and any conflict records; a version the record's history
  does not hold refuses `version-conflict`.
- **An identical rewrite is a no-op,** as Git declines an empty commit: no commit and no history entry, and the record
  version stays. A retried write costs nothing — a put that stamps entries too, since its retry stamps the same IDs
  (§ 5.1) — and `history` and `changes` show only writes that changed something. Provenance is never evidence (D3), so
  nothing rests on a write that changed nothing.

#### 5.3 Write checks

Each written record's registered write check (`WriteCheck`, `lib/store/write-check.ts`) runs before the commit, in
`write` and `batch`:

- **Its input** (`WriteCheckInput`) is the record's reference; its prior record, with content and parsed fields, or with
  content and no fields where the stored version fails to parse, which only a merge or the import stores; its next
  record, the content the write persists, which for a stale base is the merged content; the writer; and two read-only
  views, `before` over the tips the write found and `after` over the batch's new trees laid over those tips, each
  offering `read`, `list`, and `lookup`.
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
an end's withdrawal `sync` with `withdraw-end` (§ 6.6), a pull's adoption of a read source's project ID `sync` with
`adopt-project-id` (§ 9.8), and a move's landing `migrate` with `import`, `move-layout`, or `move-remote` (§ 10). The
import's commits also carry, as `Arc-Code-Head`, the code commit it read, so each imported record's history from before
the flip is found in code history from there (§ 10.8). `sync` is not in `HAND_EDIT_VERBS`, so the rules that bind only a
hand edit stay silent on a merge.

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

| Rule                | Refuses                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `store.text-only`   | Content with a NUL byte in its first 8,000 bytes, Git's own binary heuristic                                                                                                               |
| `store.size-cap`    | Content over 1 MiB (1,048,576 UTF-8 bytes), for a kind whose `projection` is not `"never"`                                                                                                 |
| `store.env-file`    | A personal document whose last path segment, lowercased, is `.env`, ends in `.env`, or begins with `.env.`, other than `.env.example`                                                      |
| `store.private-key` | A PEM private-key block — a `-----BEGIN … PRIVATE KEY-----` line with its matching `-----END` line after it — or a personal document named `id_rsa`, `id_dsa`, `id_ecdsa`, or `id_ed25519` |
| `store.json`        | Content that is not JSON, for a kind stored at a `.json` path (§ 3.5)                                                                                                                      |

Rules run in the table's order, and the refusal names the first broken one, with the record's reference, that rule's
condition, and its remedy.

- **Callers:** the ref backend's `write` and `batch`, on each put and again on bytes the backend changed (§ 5.1), and
  the import's build (§ 10.8). Expected contract: the working copy keeps no copy of the rules. Its persist meets them
  through the backend's `write` and reports that refusal, and its removal check — which refuses a park or an abandon
  before anything changes — calls the function itself, so a refusal persist would meet surfaces before the lifecycle
  write.
- **The size cap reaches projected kinds only,** a forward amendment to D10 (§ 2.5). It guards against an accidental
  file, which history keeps for good, and only a hand edit through write-back or `arc save` brings one; a kind that is
  never projected is written only by ARC's verbs. A Candidate record breaks a cap over every kind in ordinary use: one
  work unit's reached 2.67 MB, and 20 versions in this repository's code history are over the cap.
- **Reads follow the same scope:** a listing reports a stored record over the cap as `oversized` (D4) only for a kind
  the cap reaches, so a never-projected record over it lists and reads as any other.
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

#### 6.2 The fetch

- **Into a namespace of its own.** A fetch lands in `refs/arc-remotes/<remote>/…`, outside `refs/remotes/` (D10) and
  outside `refs/arc/`, so no push, manifest, or listing reads it: Git's remote-tracking convention one namespace over.
- **Refspecs on the command line,** one wildcard each, so a fetch stays one round trip:
  `refs/arc/work/*`, `refs/arc/cohort/*`, `refs/arc/archive/*`, `refs/arc/project/*`, and the person's own
  `refs/arc/user/<id>/*`, each mapped to `refs/arc-remotes/<remote>/<the same path below refs/arc/>`, with no `+`.
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
- **A prune would erase it,** so a pull that prunes a tracking ref whose item has not ended (§ 6.4) first keeps its last
  tip at `refs/arc/tmp/seen/<remote>/<path>`. When the ref returns, its tip must descend from the kept one, or be an
  ancestor of it — a machine that missed the later pushes restored what it held, a loss this clone's next push repairs
  as a fast-forward. The kept tip goes once the remote's descends from it.
- **A ref this clone never saw** has no last head to refuse against.
- **A `!` line is read by ancestry, never by text.** Git marks a refused non-fast-forward and a failed local update
  alike — a lock held past the wait, or a stale lock file a killed Git process left — and only its message text tells
  them apart. Where the line's old tip is absent, or its new tip descends from the old one
  (`git merge-base --is-ancestor`, over the objects the fetch brought), Git refused no history: the pull keeps that
  ref's tracking and local tips, applies every other ref, and reports a `tracking-update-failed` notice (§ 2.2) naming
  the ref, with the remedy to pull again and, where it repeats, to remove the stale lock file. Only a `!` line whose new
  tip does not descend is a refused ref.
- **A refused ref** keeps its tracking and local tips, every other ref in the fetch applies, and the pull reports a
  `history-diverged` notice (§ 2.2) naming the ref and both tips, with a remedy giving the three ways out as Git
  commands: keep ours, a push of the local tip leased on the observed remote tip; take theirs, a forced fetch of the
  tracking ref and the local ref moved to it; or merge both, a forced fetch of the tracking ref, after which the next
  pull merges it as tips that share no ancestor merge (§ 6.4). Each command runs against the store's own repository —
  naming the store directory with `--git-dir` in the separate layout — and names the state remote as the push does, by
  name or by URL (§ 9.7). Keeping or taking discards one side's history and merging brings back whatever a rewrite
  removed, so the choice is the person's, and no verb is built for a case this rare. A push holding unpublished writes
  on a refused ref ends before pushing (§ 6.7).
- **What triggers it:** a whole-repository rewrite such as `git filter-repo`, which D10 names, or a mirror push. One from
  a clone without ARC's refs deletes them, and every machine's next push restores its own copy (D10's risk); one from an
  ARC clone sets each state ref to that clone's tip. Where the restored copies differ — one machine held pushes another
  never pulled — the restored ref refuses here, and merging both is the way out.

#### 6.4 Merge after fetch

- **Fast-forward where one tip descends from the other:** the local ref moves to the tracking tip, or waits to push.
- **Otherwise a merge commit** with both tips as parents, its tree from merging each record by its kind's mechanism
  (`lib/store/concurrency/`) against the merge base, and each metadata file field by field (§ 3.3). A single-writer
  record changed on both sides becomes a conflict record (D4, D12). Tips that share no ancestor merge against an empty
  base, as `git merge --allow-unrelated-histories` does, since shared refs are made separately: two machines' first
  archives into a new quarter, or a contributor's registry joining a team's. A record one side removed and the other
  left as the merge base had it stays removed: the merge base decides, never an older copy, so no older state brings a
  deletion back. The merge runs under the ref's lock and
  compare-and-swap like any write (§ 5.1), with the provenance of § 5.5; history stays immutable, and the next push is a
  fast-forward, as git-annex union-merges its branch.
- **Checks report; they never gate a merge,** since both sides are already published. The backend runs each merged
  record's write check over the result, with `before` the local tips the pull found, and reports each broken rule as a
  `rule-broken` notice, storing nothing. Nor do the serialization rules gate one: a merged record that breaks a rule is
  stored, and one over the cap lists `oversized` (§ 3.1). Readers report that state as any state gone stale — D14's slug
  clash between machines among it, which status lists and a rename resolves.
- **A lifecycle move is read from its record, never from a ref's absence or return.** Every end writes a record into a
  fetched ref in the same atomic push that deletes the live ref: an archive, an Errand's close, and a cohort's close join
  the quarter's ref, and an abandon or a decomposition writes the registry's lineage (§ 7). A reopen removes the item's
  folder from the quarter's ref.
    - **Another machine's end** applies whenever the merge brings an end record this clone did not hold, whether or
      not the item's tracking ref pruned. A clone that reopens and ends an item between pushes publishes only the
      history ref and the record, never touching the live ref on the remote, so the record is the only sign of its
      end; reading ends from anything else would let two such clones both publish ends. The same pull fetches by name,
      in one fetch, the history ref of every such item this clone holds — a live ref, its own unpublished end, or a
      history ref — and the end meets what it holds: a live ref merges into the fetched history ref and moves under
      `refs/arc/history/` (§ 6.6); this clone's own unpublished end meets the rule for two ends (§ 6.6); and a history
      ref merges. An ended item this clone never held stays unfetched, as D10 keeps history refs out of the default
      fetch, so a fresh clone's first pull fetches none.
    - **Another machine's reopen** applies from the folder's removal arriving with the live ref (§ 6.6). A live ref
      back without it is a restore by a machine that missed the end, which the end meets as it meets a late write.
    - **A pruned tracking ref with no end record** — `lookup` of its UID finds none but one this clone wrote — means the
      local ref was never pushed or the remote lost it, as a mirror push loses state refs, and the next push restores it.
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
- **A matching lease lifts Git's fast-forward check,** so a leased update stays a fast-forward because the backend pushes
  only a commit that descends from the tip it leases, never because Git checks.
- **`stale info` joins D12's retry set** as a lost race, a forward amendment to D12 (§ 2.5).
- **A delete that loses its lease to a write** merges the remote tip it lost to and leases again on that tip, so the
  lifecycle move holds rather than undoing: an end merges it into the local history ref (§ 6.6), and a reopen, whose
  history-ref delete loses to another machine's write to the completed item, merges it into the local live ref, its
  quarter merge keeping the folder's removal. One that loses to another machine's end meets the rule for two ends.
- **The push loop's pull fetches by name each history ref its push creates, updates, or deletes** — a create among them,
  since one loses to a ref another machine restored first.

#### 6.6 Late writes and ends

- **A late write meets an end by merging into the item's history ref,** never by undoing or replaying the end, so the
  end's other writes — lineage, a decomposition's children, the archive number — stand as written. Where the late write
  changed a record the end also changed, an abandon's or a decomposition's removals among them, the end's version stays
  current whichever side is remote, and the late version is kept in a conflict record on the item's ref: a forward
  amendment to D4 and D6, which keep the remote's version current (§ 2.5). A record only the late write changed merges
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

**Two ends of one item: the first published holds.** Two machines may end one item before either syncs — an archive on
one and an abandon on the other, or two archives, each perhaps after a reopen of its own.

- When a pull applies another machine's end while this clone holds its own unpublished end — whether the push loop's
  first pull reaches it or a leased delete lost to the ref's absence first — the backend **withdraws its own end,** none
  of which has published, rather than leasing the delete again on that absence.
- **The withdrawal is one local transaction** writing the inverse of every write the end made, found by the end's batch
  ID (§ 3.1): a commit on the item's ref restoring each record the end's final commit removed or changed; its lineage
  record removed; its unpublished quarter folder removed; a cohort the end's batch closed reopened as § 7.6 reopens one,
  unless the published end's batch closed it too; and any entries it returned to an inbox taken back out, unless the
  published end returned them too. A decomposition's children stay as items of their own. Receipts are never edited
  (D11), so each entry taken out gets a new receipt naming its home now.
- **Then only the writes this clone made around its end** merge into the published end's history ref, as a late write's
  do, so a record both sides changed keeps the published version and holds the withdrawn one in a conflict record (D6).
  The pull's result names the item and the end withdrawn in an `end-withdrawn` notice, a push's through its `pulls`
  (§ 2.2).
- **Two ends both published** — possible only once a mirror push erased the first (§ 6.3) — cannot be ordered, so the
  pull reports an `ended-twice` notice naming the item and both ends, with the remedy to reopen it and end it once.

#### 6.7 The push loop

1. **Pull** (§ 6.1–6.6), its outcomes kept for the result's `pulls` (§ 2.2).
2. **List** the refs to push: every store ref whose tip differs from its tracking ref or has none, and every delete an
   end or reopen owes. Take their locks in ref-name order (§ 11.4) and list again; a batch that creates a ref grows
   the listing, and a grown one releases every lock held and takes the larger set in order, so the order holds.
3. **Read the tips under the locks, then release them** before the network call. A ref whose tree holds records but no
   metadata file that parses (§ 3.3) is left out of the push, with every ref an unpublished batch of it spans, so a push
   still never publishes part of a batch; their families' outcomes are `failed`, terminal `refused`, naming the ref,
   with § 3.3's forward repair.
4. **Push** explicit `<oid>:<ref>` pairs — leases per § 6.5, `--porcelain`, and `--atomic` when the push names more than
   one ref (A7) — so a push never publishes part of a local batch, which a reader of the files format can see
   mid-transaction.
5. **Classify** the outcome (§ 6.9). A lost race sleeps and repeats from step 1, as does a refusal read by state, which
   the repeat's fetch settles as a lost race or as terminal; a terminal refusal ends the loop.

- **A diverged ref ends the loop.** Where the loop's pull refuses a ref (§ 6.3) that step 2 would list, since this clone
  holds unpublished writes on it, no attempt can land it: its lease names the tracking tip the refusal kept, and a plain
  push meets the rewritten tip, so each would read as a lost race until the deadline, and the atomic push would hold
  back every other ref with it. The loop ends at once, before any push, with one `failed` outcome naming every family of
  the push's scope, terminal `refused` naming the ref, and the `history-diverged` notice in the result's `pulls` gives
  the ways out. A `tracking-update-failed` ref retries, since a held lock clears, and the deadline bounds a stale lock
  file, whose notice names its remedy.
- **Backoff:** exponential with full jitter — each sleep drawn uniformly from zero to the lesser of 10 s and the last
  push's duration doubled per retry — so it scales with the host's push time; no lock is held across a sleep, which
  Gerrit's first sequence retry did and blocked every other writer.
- **Deadline:** 120 s from the loop's start, bounding it rather than an attempt count. Twenty machines pushing one ref at
  once settled in 25–60 s on the hosts tried. On expiry the loop returns `retries-exhausted` with its retry count and
  time waited, and the writes stay local for the next firing point.
- **One publish outcome per status** where the push syncs with its state remote, its families those of the push's scope
  with that status, so every declared family is named once whether or not it pushed a ref — identity families only with
  an identity, and the `no-identity` state naming them without one — each outcome carrying the loop's retry count and
  time waited (§ 2.2). A family's status is `reconciled` where the loop's pulls brought remote movement into one of its
  refs, whether or not it then pushed; `pushed` where it pushed with none; and `noop` where neither, as the shared
  suite's sync items expect (`__tests__/helpers/store/suite-sync.ts`). Under a state that stops that sync — `no-remote`,
  `designation-ambiguous`, `move-incomplete`, `moved`, or `designation-needed` — `publishes` is empty, as that suite
  expects for `no-remote`.

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
- **A pre-push hook** runs before Git sends anything, so its refusal prints the hook's text and `failed to push some
  refs`, exits 1, and prints no per-ref status. A push carrying a code ref that ends that way repeats with state alone,
  which a hook gating only code refs passes, and reports the hook's text as `hook-declined`; a hook that refuses a push
  of state refs alone ends the loop as terminal `refused`, with its text.
- **The store only pushes a carried ref,** never fetches or merges it.

#### 6.9 Classifying a push

The loop reads `git push --porcelain`'s per-ref lines and the exit code, never prose, except where a line carries the
server's text:

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
  it no other way: one of the three named reads that amend D4 (§ 2.5). With a carried code ref the push falls
  back to D12's ordered legs: the code ref alone, then the state leg, where one ref pushes ordinarily and several end in
  A7's terminal `refused` naming the capability and the remedy to enable an atomic-capable receiver.

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
- **The archive sequence is final once pushed.** When two machines archive into one quarter, the push loop's merge
  renumbers the unpublished archive after the remote's highest, renaming its folder, so a verb reports the number after
  it publishes. A cohort folder the same batch closed takes its work unit's new number, and a cohort closed alone is
  renumbered as a work unit is (§ 7.6). Offline-first stores reconcile a temporary ID at sync the same way, the shared
  log's order deciding. A reopened work unit leaves a gap in its quarter's numbering.

#### 7.2 Reopen

A placement write out of `completed` reopens the item: its history ref moves back under `refs/arc/work/`, and its folder
leaves the quarter's ref. A clone that holds no copy of the history ref refuses the reopen `state-unresolvable`, naming
it (§ 4.4). Expected contract: the reopening verb pulls it by name first. A reopen whose slug a live work item or cohort
has taken since refuses `ambiguous-match` naming both (§ 5.1).

#### 7.3 Writes to a completed item

- **Any other write to a completed item's records** — the write that resolves one of its conflict records (D6) among
  them, since every work-unit kind spans `completed/` (D5) — commits on its history ref and refreshes its folder in the
  quarter's ref, in one transaction under both refs' compare-and-swaps and one `--atomic` push. `history` keeps reading
  one ref's log, and a reopen finds the latest state. A rename renames the folder too.
- **The history ref's push is leased** (§ 6.5), so another machine's reopen reads as `stale info`, a lost race, where an
  unleased push would recreate the ref the reopen deleted.
- **A clone that holds no copy of the history ref** refuses the write `state-unresolvable`, naming it, and refuses
  `history` of the item's records the same way rather than read the quarter folder's shorter log; an abandoned or
  decomposed item's `history` refuses alike, its end read from lineage (§ 2.3). A copy whose log lacks a batch the
  quarter's folder shows — another machine's write, which the default fetch does not bring — refuses `history` and
  `changes` the same way, while a write over it meets its lease (§ 6.5) and lands after the pull that follows. Expected
  contract: the verb pulls it by name and retries (§ 4.5).
- **Where the remote answers without the ref and no reopen explains it** — the mirror push D10 names, which deletes
  state refs — the retried write stays refused, naming the ref. Rebuilding from the current state cannot land a write,
  so the remedy is that a clone holding the ref push it back: `git push` of that ref to that clone's own state remote,
  run against that clone's store repository as § 6.3's remedies run. The remedy names the ref and leaves the remote and
  repository to that clone, since remote names and layouts are each clone's own.
- **A clone that holds the ref** meets the same loss as `stale info` with no reopen behind it, and its write restores the
  ref, leased on its absence, as the next push restores a lost live ref; an archived item's quarter ref rides the same
  `--atomic` push, so a reopen racing it still reads as a lost race.

#### 7.4 Abandon and decompose

- **A batch that removes a work item's primary and creates its `lineage/transition`** — the caller's create-only record,
  keyed by the item's UID (D5) — ends the item: the ref's final commit removes every record on it, so `history` reads a
  removal (`HistoryEntrySchema`, `lib/store/contract.ts`), and the ref moves to `refs/arc/history/work/<uid>`.
- **A decomposition's children** are refs the same batch creates, each with an expected absence.

#### 7.5 Every other removal, rename, and park

- **Any other removal, a primary's included,** is an ordinary write of absence (D3): the ref stays live, and its next
  commit removes the record, as the conformance suite's removals expect (`current-removal`,
  `__tests__/helpers/store/suite-records.ts`). So every end carries its own record — its quarter folder or its lineage —
  by which other machines tell it from a loss (§ 6.4).
- **A rename moves no ref** (§ 3.6), and **parking** is a placement write within the live namespace.

#### 7.6 A cohort's close and reopen

- **A placement write of `completed` to a cohort's document** (§ 2.4) closes it: its ref takes a final commit, the
  document and metadata file join the quarter's ref in its folder, and the ref moves to
  `refs/arc/history/cohort/<uid>`.
- **Its folder** is `<sequence><a|b>_cohort-<slug>/`, today's closeout sidecar:
    - The sequence is the work unit's that the same batch archives — the cohort's last member — or, when the batch
      archives none, the quarter's next, assigned as a work unit's is (§ 7.1), so the next work unit archived there
      numbers after it.
    - The closeout is `parent`, lettered `b`, when the same batch closes one of its subcohorts — a cohort document whose
      parsed `parent` names it — and `leaf`, lettered `a`, otherwise; with no parser registered for the kind it is
      `leaf`. Today's archive writes the same two (`sweepCohortDoc` and `sweepNestedParentDoc`,
      `lib/work-unit/verbs/archive.ts`), which the layout resolver projects with those letters (`resolveArcPath`,
      `lib/layout/projection.ts`).
- **A placement write of `active`** reopens a closed cohort as § 7.2 reopens a work item.
- **The history namespace mirrors the live one:** `refs/arc/history/work/<uid>` and `refs/arc/history/cohort/<uid>`.

#### 7.7 Counters

Counters get nothing of their own. Nothing allocates from the registry's counter kind (`project-registry/counter`):
source only registers it, and tests write it as a stand-in record. D6 reserves blocks only for a hot counter, which none
is, so a first consumer's claim is a write and a push against the remote, and no block leaves gaps in a counter people
read.

### 8. `lookup`

- **One scan over the metadata files, no index.** One `for-each-ref` over the live work and cohort refs and the quarter
  refs, then one batched `cat-file` of every metadata blob, each quarter's after its root and folder trees (§ 3.3),
  matched in memory: two Git processes a lookup. A primary's metadata holds its slugs and links (`LinksSchema`,
  `lib/store/links.ts`), so it answers a slug, a former slug, a ref through branch links, and a commit through task
  captures and the landing commit, falling back to the patch-id the caller passes where no SHA matches (A6). A
  checkout claim resolves a work unit by slug and an Errand by its claim ID (`claimId`, today
  `lib/errand/identity-record.ts`), read from the few Errand records whose slug matches. A completed item resolves from
  its quarter's folder, which holds its current state, links included. One batched read of 601 metas took 17 ms.
- **Memoized within one process,** keyed on the ref tips, as git-bug keeps a disposable cache; nothing persists. A
  persisted index waits for the query cache's tripwire (D20).
- **A reference without a UID** resolves by this scan, for `read`, `list`, `history`, `changes`, and the write path
  alike (§ 5.1), over the tips the operation reads — a manifest's, as of a state version: to the live item holding its
  slug, else the live item that held it as a former slug, else the one ended item in a quarter holding it as its slug,
  else the one holding it as a former slug, as the reference backend ranks them (`preferredSlugRecords`,
  `__tests__/helpers/store/lookup.ts`). Several ended holders in one tier, or two live ones after a clash between
  machines (D14), refuse `ambiguous-match` naming them. A reference carrying its owner's UID names its owner and needs
  no scan: its refs — the live ref, or once archived the history and quarter refs — are found from the operation's
  listing, and the write path finds them again under its locks (§ 5.1). An item ended outside the archive resolves as
  below.
- **Lineage** is the registry's `lineage/` subtree, keyed by origin UID: a UID resolves by path, a slug by scanning the
  subtree.
- **A grooming or housekeeping claim** reads the person's own claims ref, keyed by slug, since a marker on this machine
  names this person and their identity is always fetched.
- **An item ended outside the archive** — abandoned or decomposed — sits under `refs/arc/history/`, outside the refs the
  scan reads, so `lookup` refuses `not-found` (D9); a decomposed origin resolves through lineage.
- **`list` with the `heldHere` filter** refuses `unsupported` `held-here`, recoverable, with the remedy to look up this
  checkout's claim or list without the filter, as every backend whose state is off the branch does (D1, D4).

### 9. Layouts and remotes

#### 9.1 The designation

Each clone designates its state remote with a key on the remote itself: `remote.<name>.arc-state` in the clone's Git
config, set to `push`, `read`, or `off`.

- **`push`** marks the state remote, which `pull` fetches and `push` publishes to (D14). At most one remote carries it,
  counting the store directory's own remote (§ 9.7) and only the remotes the tracked pointer lets count (§ 9.2). Two
  make `pull` and `push` report `designation-ambiguous` (§ 2.2), naming both, with the remedy to set one `off`
  (`arc store remote <name> off`), and fetch and push nothing.
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

- **A tracked pointer to a backing repository** (§ 9.7) makes the store directory's own remote the only candidate:
  nothing sets `push` on the code remote or asks about it, and a `push` the code remote or a fork's upstream already
  carries counts for nothing, so no answer can publish state there. Without a pointer, the store directory's `backing`
  remote counts for nothing in turn. A clone that finds the pointer asks once about the store's remote. A designation
  the pointer does not allow — with it, another remote carrying `push`, or a `backing` remote at another URL; without
  it, a `backing` remote — makes `pull` and `push` report `move-incomplete` with the remedy `arc store migrate`, which
  follows the move that changed the pointer (§ 10.6). The rest of this list applies to a standard install without a
  pointer.
- **`arc init` sets `push` on the code remote** at creation, where one exists: an expected contract, wired with
  `arc init` at the flip (§ 9.3), so before it this change alters nothing `arc init` does.
- **A clone with none set, where the code remote holds the project's registry ref** (`refs/arc/project/registry`) and no
  other remote does, sets `push` there without asking where that changes no layout. A clone already holding state in the
  separate directory is asked instead, and its answer, `arc store remote <code remote> push`, runs the layout move
  (§ 9.4), so `pull` never moves a layout. Presence is read by `git ls-remote` of that one ref, which fetches no
  objects.
- **Where another remote holds it** — a fork's upstream — the person is asked once about that remote: `push` for a team
  member, `read` for a contributor, the answer setting the role as D14 says, or `off`.
- **Where no remote holds it** — a project initialized before its remote existed, a teammate's clone before the first
  state push — the person is asked once about the code remote, `push` or `off`, so no project stays unpublished
  unremarked: a forward amendment to D14, which lists one question (§ 2.5). A fork clone whose upstream holds the
  registry gets only the question above. The code remote is still never designated without an answer, since a
  contributor's lone remote is usually their public fork.
- **A clone with no code remote** — remotes, none named `origin`, and no `remote.pushDefault` — is asked nothing about
  one: only a remote holding the registry is asked about, as above, so with none the clone stays local-only until a
  remote holds it or the person designates one.
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
  ref presence alone establishes neither the choice nor the state source (§ 2.5). The host trial checks provider fork
  behavior (§ 14.8).

The ghost install profile's own cases — its local-only pointer, and an install without one — take the pointer's rule,
since ghost mode's store is always the separate layout (D19), and are wired with that profile.

#### 9.3 How the question is asked

`pull` and `push` apply the rule of § 9.2 themselves where it sets without asking, and where a question is due they
report it rather than ask, so the store never prompts:

```ts
// SyncState gains:
| { status: "designation-needed"; remote: string; choices: ("push" | "read" | "off")[]; remedy: Remedy }
```

- **The remedy's `argv`** is the answering command for the recommended choice, `arc store remote <remote> push` for the
  code remote and `read` for an upstream, and its text names the others.
- **A verb that can ask** presents the choices on a TTY and runs the answer; one that cannot reports the state as a
  typed stop or an orientation line carrying that `argv`, never guessing. The question belongs to the person, since its
  answer publishes their state.
- **Expected contract for the asking points,** each wired with its verb at the flip: `arc init` sets `push` itself
  (§ 9.2); `arc join`, session start's `pull`, and `arc sync` surface `designation-needed` as above.

#### 9.4 `arc store remote`

- **`arc store remote`** shows each remote with its role — `push`, `read`, `off`, or undesignated — the store's layout,
  and the store directory's own remote where it has one; `--json` gives the same as data.
- **`arc store remote <remote> <push|read|off>`** sets one remote's role. A setting that changes the layout runs the
  migrate verb's layout move first (§ 10.2) and reports it. Setting `push` while another remote carries it refuses,
  naming that remote: repointing the state remote without moving state would strand it, so the remedies are
  `arc store migrate --to <remote>` to move the project's state, or `arc store remote <other> off` first. While the
  designation is one the tracked pointer does not allow (§ 9.2), a setting for the remote the follow asks about runs the
  follow with that answer (§ 10.6), and any other setting refuses, naming `arc store migrate`.
- It writes only Git config and, through the layout move, the store; nothing selects this backend before the flip, so it
  changes nothing today's state reads.

#### 9.5 This repository's backend

This repository runs the default backend, its personal state published with its project state. Nothing in it needs
hiding, and the project should exercise the path most teams will take; the backing repository is for the projects that
need it. Identity scope is not private, and privacy is the backing repository's (D14), so D10's sentence that a
repository going public moves its state to a backing repository describes the choice for one that wants its state
private: a wording amendment to D10 (§ 2.5).

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
  naming the move, with the remedy to set the old source `off` and designate as `read` the remote the upstream's state
  moved to — the backing repository its tracked pointer names, added as a remote of the code repository
  (`git remote add`), whose URL a read source is fetched by (below), or the upstream itself where it names none
  (`arc store remote <old> off`, then `arc store remote <remote> read`). Where this repository's own tracked pointer
  records the move, the follow does both (§ 10.6).

#### 9.7 Layouts

- **The layout follows the designation,** as D10's local copy follows the remote. A code remote carrying `push`, with no
  tracked pointer to a backing repository (§ 9.2), puts the store in the code repository's own refs; otherwise — a
  backing repository, another of the code repository's remotes, or no state remote — the store is the separate
  directory, as D10 places state that goes to another remote or to none. A designation that changes the layout runs the
  migrate verb's layout move before it takes effect, and nothing switches the layout bare. A Git edit outside ARC can
  still change which remote is the code remote — `git remote rename`, a remote added beside a lone remote not named
  `origin`, or `remote.pushDefault` set — and with it the layout the designation calls for; the store never follows such
  an edit by itself (below, § 10.3).
- **The separate directory** is `arc/store` in the common Git directory, so every worktree shares it, as Git keeps a
  submodule's repository under `.git/modules/`.
    - **Its presence is the layout:** `version` reads it with no Git call (§ 4.2). A store that holds state (§ 3.1)
      stays where it is — the directory where it exists, else the code repository's refs — and only a write or a pull
      that finds neither places itself by the designation, creating the directory under the layout lock (§ 11.4) where
      the designation puts the store there; while the tracked pointer names a backing repository, a write, pull, or push
      that finds the directory without its `backing` remote adds it at the pointer's URL, undesignated until § 9.2
      settles it, and so does the layout move that creates the directory, `arc store remote backing push`'s among them
      (§ 9.4). A store in the layout its designation does not call for reports `move-incomplete` from `pull` and `push`
      (§ 10.3).
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
  and rules: `arc init` sets `push`, and a clone that finds the pointer asks once (§ 9.2). Its URL is the pointer's,
  compared as the raw `remote.backing.url` value, since `git remote get-url` applies `insteadOf`; one that differs is a
  designation the pointer does not allow (§ 9.2), and the follow writes the pointer's value as it stands. A read source
  is fetched into the store directory by its URL, as `git remote get-url` gives it from the code repository's remote,
  since refspecs ride the command line.
- **Another of the code repository's remotes as the state remote** — a fork's upstream, for a team member who pushes
  code to the fork and state to the upstream (D14) — keeps its `push` on that remote's own section. It is fetched from
  the URL `git remote get-url` gives and pushed to the one `git remote get-url --push` gives — its push URL where it has
  one, with `insteadOf` and `pushInsteadOf` applied — both read from the code repository at each pull and push, as a
  read source is fetched. A carried code ref goes to the fork first, as § 6.8's ordered legs push it.
- **Local-only** is the separate directory with no state remote: undesignated, `off`, or `read` alone.

#### 9.8 The project ID

- **Only `arc init` mints it,** with `randomUUID`, into the registry's create-only identity record
  (`project-registry/identity`), published with the first push; with a remote already designated it pulls first and
  adopts an ID it finds instead. This is an expected contract, wired with `arc init` at the flip: until then the in-repo
  implementation serves the store and has no home for that record, refusing its write as `unsupported` `unhomed-kind`.
  This change builds the record's create-only write and its merge (§ 6.4).
- **`arc join` never mints:** it adopts the registry's ID at the first pull that finds one, and until then the clone has
  none, which delivery tolerates (D14). So a teammate's registry never holds an identity record, and when it meets the
  published registry the merge of unrelated histories (§ 6.4) adds that one with nothing to clash.
- **A contributor's local-only store takes the upstream's ID** from its read source: the first `pull` that fetches a
  read source holding the upstream's identity record, on a clone with no state remote whose registry holds none, writes
  that record into its own registry, create-only — the one write a read source causes (§ 9.6); a clone with a state
  remote adopts only from that remote, as `arc join`'s does. An independently initialized fork mints its own, and an
  inherited copy alone adopts nothing (D14), but for § 9.2's residual, a forward amendment (§ 2.5).
- **This repository's import** takes its review gate's repository ID (§ 10.8).

### 10. The migrate verb and the import

#### 10.1 One verb

`arc store migrate` moves state, generic over the contract (D14); the import of today's state is its one-time source.

- **`arc store migrate --to <remote | URL>`** moves the project's state to another remote: a configured remote's name
  for the project's code repository — this clone's code remote, or the remote a fork member's state goes to (§ 9.7) —
  which removes the tracked pointer, or a URL for a backing repository, which sets it (§ 10.2).
- **`arc store migrate`** with no target finishes an interrupted move, brings this clone into the layout its designation
  calls for, and follows another clone's move, designating afresh where the tracked pointer no longer allows this
  clone's designation (§ 10.6).
- **`arc store migrate --import`** is the one-time import into this repository's store (§ 10.8).
- **`--trial`** on any form runs the same build, reports it, and drops it (§ 10.5); **`--json`** gives the report as
  data.
- A layout move also runs inside `arc store remote` when a designation changes the layout (§ 9.4), through the same
  engine.

The import's transform is its one-time part, in its own module (§ 1.2), which the cutover's deletion pass removes with
the in-repo implementation; everything at the destination is the verb's.

#### 10.2 The two moves

- **A clone's layout** changes with its designation — a team member going local-only, a contributor beginning to push,
  or a first designation of a clone that already holds state. It is a local fetch between the code repository's refs and
  the store directory, then a delete of the source (D10), every store ref and its history carried by Git, with the
  tracking refs under `refs/arc-remotes/` and the machine-local `refs/arc/tmp/seen/`, `refs/arc/tmp/version`, and
  `refs/arc/tmp/read/`, which hold the last heads § 6.3 checks against and the newest tokens' keepers; never
  `refs/arc/tmp/migrate/`, which each move keeps in the code repository (§ 10.3). A fetch racing the move may land in
  the copy it leaves behind, and the next pull fetches again. No remote changes. The directory's presence is the layout,
  so its switch is a rename: into the separate layout the store is built under a temporary name beside `arc/store` and
  renamed into place; out of it the directory is renamed aside, then removed. The move holds the layout lock from its
  listing through the switch and the delete (§ 11.4), so no write from another worktree commits into either copy
  meanwhile.
- **The project's state** changes remote — to a backing repository before a repository that wants its state private
  goes public (D10), or back. It runs over the old remote's whole state, not this clone's, since D10's refspec keeps
  every other person's identity refs and every history ref this clone never pulled out of its fetch:
    1. Fetch every store ref the old remote holds (§ 3.1) into `refs/arc/tmp/migrate/remote/`.
    2. Copy them to the new remote under their own names in one `--atomic` push, which deletes any forwarding record
       there (§ 10.6) and merges where the new remote holds state (§ 10.4).
    3. Switch: write the tracked pointer's change — `storage.backing_repository` set to the new URL, or removed for a
       move back to the code remote — into `arc-config.yml` for the person to commit as code, set the designation —
       `backing` removed on a move back, and repointed on a move between backing repositories — and leave the forwarding
       record on the old remote (§ 10.6). Teammates follow only once that change reaches them as code, and the move's
       report says so (§ 10.5).
    4. Delete every copied ref on the old remote in one `--atomic` push, each delete leased on the tip the move last
       read. A lost lease means a teammate pushed after the copy: the move fetches again and brings the new remote to
       match — a ref that changed merged onto the new remote's tip and pushed leased on the tip it read there (§ 10.4),
       and one the old remote has lost since, as an end moves a live ref under history, deleted from the new remote,
       leased the same way — then deletes again. The move ends only when a listing of the old remote after its deletes
       finds no store ref, only the forwarding record; a ref the copy lacks, such as a teammate's new item pushed by a
       loop that pulled before the forwarding record, is copied and deleted the same way. The forwarding record goes
       first, so a teammate's next pull stops pushing to the old remote and the deletes settle rather than chase a
       moving lease.

   Refs this clone does not otherwise keep — another person's identity, a history ref it never pulled — never enter its
   state, and leave the temporary namespace when the move ends.

#### 10.3 Order makes it restartable

- **Copy, switch, then delete the source.** Interrupted, a move leaves either the old copy authoritative and a new one to
  merge, or the new copy authoritative and a leftover to delete, and running it again finishes it.
- **A remote move that changes the moving clone's layout** — between the code remote and a backing repository, either
  way — runs the layout move as its switch, after the copy and the pointer's change and before any delete. Each half
  keeps its temporary refs in the code repository, which both layouts keep, under its own name —
  `refs/arc/tmp/migrate/remote/` and `refs/arc/tmp/migrate/layout/` — so each half restarts as it would alone.
- **The designation and the rename cannot change at once,** so a layout move sets the code remote's `push` before the
  store directory's rename when moving into the code repository's refs, and sets it to `off` after the rename when moving
  out — never a bare clear, which a code remote holding the registry would answer by designating itself again without
  asking.
- **An interruption leaves a store directory beside a code remote carrying `push`,** never a designation that would place
  a fresh store. The directory stays the layout for every read and write, as its presence is, and `pull` and `push`
  report `move-incomplete` (§ 2.2) with the remedy `arc store migrate`, fetching and pushing nothing, as they do for two
  remotes carrying `push`.
- **A remote edit outside ARC can leave the opposite:** state in the code repository's refs while the designation, read
  through a changed code remote, places the store in the separate directory (§ 9.7). The refs stay the layout, nothing
  creates the directory, and `pull` and `push` report `move-incomplete` naming both, with the remedies
  `arc store migrate`, which moves the store where the designation now puts it, or undoing the edit.

#### 10.4 All or nothing at the destination

- **A move gathers its refs under `refs/arc/tmp/migrate/`,** which is not state and stays out of every refspec (D10),
  then puts them in place at once: a layout move or the import in one `update-ref --stdin` transaction, a remote move in
  one `--atomic` push, which a receiver without atomic pushes refuses as A7's terminal `refused`, since publication
  across several state refs never falls back to ordinary pushes (D3).
- **A copy onto a destination holding state merges:** a remote move run again after its copy landed, step 4's re-copy
  (§ 10.2), and the follow's clearing copy (§ 10.6) each fetch the destination's refs they copy onto, merge each ref
  both sides hold as `pull` does (§ 6.4) — the registry, the inbox, the archive quarters, identity refs, and any item
  ref both hold — and push each leased on the destination tip it read, so a lost lease fetches and merges again. A
  layout move's destination is empty by construction (§ 10.2), and the import refuses one that holds state (below). The
  merge's write checks report each broken rule in the move's `notices` and gate nothing.
- **The import refuses a store that holds state** (§ 3.1), since it mints UIDs and a second run would duplicate every
  record, except one that finds its own landing: a store whose project ID is this clone's review-gate repository ID,
  which only the import adopts, finishes the steps that follow the landing (§ 10.11).
- **No move gates on a write check** (§ 5.3): records today's checks admitted land unchanged, and a copy's merge only
  reports, as above. The import's build checks the serialization rules (§ 5.6).

#### 10.5 The trial run

`--trial` runs the same build as the move, reports it, and drops it, so a trial and the move cannot drift apart:

```ts
interface MigrateReport {
  move: "layout" | "remote" | "import";
  refs: { ref: string; scope: "project" | "identity"; person?: string; action: "copy" | "merge" | "create" | "delete" }[];
  refused: { reference: RecordReference; rule: string }[];   // a § 5.6 rule, "key", "entry-id", or "session-context"
  brokenChains: { reference: RecordReference; condition: string }[];
  differingNotes: { person: string; path: string; kind: "differs" | "snapshot-only" | "disk-only" }[];
  notices: { condition: string; remedy?: Remedy }[];
}
```

- **`refs`** lists every ref the move would write, by scope and person, history refs among them; for a move off a remote,
  every ref it would copy.
- **`refused`** lists every record the build would refuse, under its `rule`: a serialization rule's identifier (§ 5.6);
  `key` for § 3.2's key refusals; `entry-id` for an entry the stamp cannot place an ID in (§ 5.1); and `session-context`
  for a `SESSION-NOTES.md` the fold cannot write (§ 10.12); **`brokenChains`**, for the import, every Candidate chain it
  finds broken (§ 10.9); **`differingNotes`**, for the import, every notes file that differs from a disk copy, and apart
  from them every file the snapshot holds and no disk copy does, and every file notes save never writes (§ 10.10).
- **`notices`** carries, for the import, each entry kind it would write whose grammar the backend's kind registry does
  not declare, which refuses the import until it does (§ 5.1); for a move off a remote, that it stops later publication
  and never unpublishes (§ 10.7), and that teammates follow only once the tracked pointer's change, which the move
  leaves uncommitted, reaches them as code; and that a push a teammate's loop makes after the move's last listing stays
  on the old remote until that teammate follows (§ 10.6); and, for a copy that merges, each rule its write checks find
  broken (§ 10.4).

#### 10.6 The forwarding record

A ref missing from a remote reads as lost, and the next push restores it (§ 6.4), so after a deliberate move a
teammate's next push would put every state ref back on the old remote. The move leaves one ref there,
`refs/arc/project/moved`: a root commit holding only `moved.json` with the project ID, never the new remote's URL, which
the tracked pointer carries, so no state history stays reachable from it.

- A pull fetches it with the project namespace, refuses to push to that remote, and reports `moved` (§ 2.2) with the
  remedy to bring in the code that carries the tracked pointer and run `arc store migrate`, which follows it.
- **Following it** is `arc store migrate` with no target, once the code carrying the pointer's change is in. It
  designates afresh: § 9.2 decides again, disregarding the `push` and `off` keys the clone's remotes carry, so it asks
  where § 9.2 asks — always about a backing repository, whose URL arrived as code — on a TTY, and otherwise reports
  `designation-needed` (§ 9.3), whose answering command, `arc store remote <remote> <role>`, runs the follow with that
  answer (§ 9.4). A role the person gave the old remote never carries to the new one unasked, since the answer publishes
  their state, so a rerun after an interruption asks again unless it is the answering command, which carries the answer.
  On `push` the follow first clears the old remote as below. Whatever the answer, the clone then switches as it calls
  for: the layout move where the layout changes; the old remote — the state remote, or a `read` source carrying the
  forwarding record (§ 9.6) — set `off` where the answer went to another, after the rename as § 10.3 orders it; and
  `backing` repointed at the pointer's URL, or removed where no pointer names one.
- **The follow clears what raced the move.** On a `push` answer it lists the old remote's store refs as the move's last
  step does (§ 10.2) and copies any it finds onto the new remote, merging where it holds them (§ 10.4), then deletes
  them, so a ref a teammate's loop pushed after the mover's last listing leaves with that teammate's own follow, since
  their next pull meets the forwarding record. A clone that never follows leaves its one late push there, a residual the
  move's notices name (§ 10.5).
- **Every move deletes any forwarding record at its destination** in its copy push (§ 10.2), so a move back, or onto a
  remote an earlier move left, finds none there.
- It adds the ref to D10's table, a forward amendment (§ 2.5).

#### 10.7 Moving off a remote stops publication; it never unpublishes

Store history is never rewritten (A4), and anyone may have fetched what was pushed, so a repository that wants its state
private moves it before going public, and the trial run says so.

#### 10.8 The import

- **Entry point:** `arc store migrate --import`, with `--trial`, in this repository alone; CineXplorer's install predates
  too much of ARC to import and is installed fresh. It lands into the layout the clone's designation selects.
- **It reads through the in-repo implementation,** which already picks each live work unit's copy across branches and
  fetched refs, reads personal files and Errand refs, and returns tracked history with commit messages
  (`lib/store/in-repo/README.md`). The cutover fetches every branch first.
- **It reads directly** only where that implementation has no read, or one that drops what the import carries:
    - each Candidate record's versions, from the plain path log today's chain reader walks (`git log -- <path>` in
      `readRepositoryCandidateSupersessionChain`, `lib/work-unit/candidate-record-store.ts`), since the in-repo `history`
      follows renames (`trackedHistory`, `lib/store/in-repo/history.ts`, `git log --follow`), which drops a version a
      merge commit introduced;
    - each person's notes ref as one snapshot, and every worktree's workspace copies, since the in-repo implementation
      reads only the configured person's files and only this checkout's workspaces (`listPersonal`,
      `lib/store/in-repo/personal.ts`);
    - commit footers for task captures (§ 10.11);
    - the review gate's durable facts under `.git/arc/` — evidence, outcomes, and termini;
    - and the sources of the stored kinds with no in-repo home (`KIND_MECHANISMS`): Errand descriptions from their
      origin entries, inbound lists from drafts' buffer sections and pending owner-adoption `_Hold` captures, and each
      person's Errand queue from their execute-bound marks.
- **The project ID** is the importing clone's review-gate repository ID (`resolveRepositoryIdentity`,
  `scripts/review-gate/hosts/local/git-common-state.ts`), already a UUID, so receipts keep their key (D14). That ID is
  minted per clone, so another clone's review facts carry another key and are not read; the cutover's quiesce finishes
  review on every other clone first.
- **Its provenance** is `migrate` with lifecycle action `import`, and `Arc-Code-Head` names the code commit it read, so
  each imported record's earlier history stays findable in code history (§ 5.5).
- **What stays out:** project machinery and the constitution, tracked in the standard profile (`FAMILY_REGISTRY`), the
  shipped machinery under `.arc/system/.internal/` among it; what is machine-local — every `.internal/` folder
  `MACHINE_LOCAL_PATHS` names under `.arc/user/<id>/`, the identity's own and each workspace's, and the checkout marker,
  pristine store, and editor schemas Git ignores under `.arc/system/.internal/`; the registry's counters, since nothing
  allocates one (§ 7.7); and the identity root's `STATUS.USER.md`, a view status renders and shipped code discards as a
  cache (`DISCARDABLE_GENERATED_CACHES`, `lib/user-surface-migration.ts`). The Candidate, boundary, and transition
  records tracked under `.arc/system/.internal/` are state, which the import carries (ADR-035).
- **Every record passes the serialization rules** (§ 5.6), § 3.2's key refusals, for an entry kind the stamp (§ 5.1),
  and for a folded `SESSION-NOTES.md` the section writer (§ 10.12), in the build; a refusal names the record and rule
  (§ 10.5), the trial run lists it, and the import refuses until the source is fixed.

#### 10.9 What the import carries

| Source                                                                           | Lands as                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live work units and Errands                                                      | One UID per owner (A11), reused across its kinds; each record at its current content on its work ref                                                                                                                             |
| Completed work units and closed cohorts                                          | As an archive or close leaves them (§ 10.11)                                                                                                                                                                                     |
| Candidate records                                                                | Every version its path log holds replayed oldest first on its work item's ref, then current files                                                                                                                                |
| Errand identity refs                                                             | Re-homed: Errands to `refs/arc/work/<uid>`, grooming and housekeeping claims to each person's claims ref; open Errands' origin entries carried into their descriptions before any `_Id:_` stamp                                  |
| Execute-bound marks                                                              | Each person's Errand queue, in file order                                                                                                                                                                                        |
| Buffer sections and held captures                                                | Each work unit's inbound list; an entry from a buffer section takes its `_Routed from:_` date as its `_Created:_`, and one from a held capture keeps the capture's                                                               |
| Entries of every entry kind                                                      | Each entry stamped with its `_Id:_` where it lacks one — both inboxes, working memory, and the three kinds with no in-repo home; the notes merge's `## Removed:` tombstones dropped from `USER-INBOX.md` and `WORKING-MEMORY.md` |
| Each person's notes snapshot and disk-only files                                 | Their personal ref, at D5's layout (§ 10.10, § 10.12)                                                                                                                                                                            |
| A live work unit's `SESSION-NOTES.md`, where its meta's `Owner` names the person | That meta's session context, by the fold (§ 10.12)                                                                                                                                                                               |
| Other workspace files, and root files outside ARC's surfaces                     | `scratch/work-unit/<slug>/` and `scratch/` on the personal ref (§ 10.12)                                                                                                                                                         |
| Review gate facts under `.git/arc/`                                              | Review records at project scope; the gate's repository ID as the project ID                                                                                                                                                      |
| `rename` transition records                                                      | Former slugs in their successors' metadata, never lineage                                                                                                                                                                        |
| `abandon` and `decompose` transitions                                            | Lineage, each record as found at `lineage/<uid>.json`, keyed by a UID the import mints for its origin, and an empty history ref (§ 10.11)                                                                                        |
| Closed tasks' commits                                                            | Task captures in their work units' links (§ 10.11)                                                                                                                                                                               |
| JSON machine records                                                             | Canonical form (§ 3.5)                                                                                                                                                                                                           |

- **Candidate chains land as found.** Two chains are already broken in code history, each superseding a Candidate no
  committed version holds — `evidence-applicability`'s at `ae942826…` and `delivery-native-stack-composition`'s at
  `0ff2bba5…`. Today's reader refuses six records: `evidence-applicability` at its break
  (`resolveCandidateSupersessionAncestors`, `lib/work-unit/candidate-attestation.ts`), and five whose records fail today's
  Candidate schema before any chain walk (`readCandidateRecordVersioned`, `lib/work-unit/candidate-record-store.ts`),
  `delivery-native-stack-composition` among them. The import carries all six unchanged, and a reader through the store
  refuses them as today's does.
- **Open Errands keep their origin entries without a binding to survive the stamp:** the import finds each open Errand's
  origin entry by title, as close does, reports one whose source digest changed since adoption, and carries it into the
  Errand's description before stamping every other entry's `_Id:_` (D11). An Errand whose entry is gone takes its
  description from `intent`, as one opened from text does.
- **Rename records:** this repository's three `rename` transition records become former slugs in their successors'
  metadata, since from the flip lineage holds only terminal transitions (D5). Their successors are all archived, so the
  former slugs sit in their quarter folders, where `lookup` reads them.
- **Session context:** the import writes no `State at Handoff`, since nothing writes one before the flip, so it carries
  no anchor to resolve.

#### 10.10 Notes as one snapshot means every copy agrees first

The import reads each person's notes as one snapshot — what a load would materialize now, each identity-global file
merged across the recent-note window, the ten newest note versions of the last seven days (`readRecentUserNotes`,
`CROSS_WU_NOTE_WINDOW`, `CROSS_WU_NOTE_WINDOW_MS`, `lib/user-sync/notes-ref.ts`) — and compares it with every disk copy,
never choosing `ours` or `theirs` (D14), as notes sync compares its own (`projectManifest`,
`lib/user-sync/projection.ts`): `USER-INBOX.md` and `WORKING-MEMORY.md` without their `## Removed:` tombstones, every
other file by its bytes. The trial run lists every disagreement, and the import refuses until snapshot and disk agree,
but for the `disk-only` files it carries from disk:

- **A file that differs** agrees once it is saved and then loaded from a checkout whose save takes it — a file at the
  identity's root from any, and one in a live work unit's workspace from a checkout where that work unit is current: the
  save takes the disk's entries into the newest note, and the load writes back the entries only older notes in the
  window hold, which the snapshot merges in (`mergeCrossWuFile`, `lib/user-sync/merge.ts`). An entry the load brings
  back that was meant to be gone is then deleted and saved again, which marks it removed.
- **A file notes save never writes** — one `serialize` skips (`lib/git/user-sync.ts`): a path with a dot-prefixed
  segment, but for the `.internal/` folders that stay out (§ 10.8), a `README.md`, a name `isAllowedFile` refuses, or a
  file over 256 KiB (§ 5.6); or one in a folder no save takes, since a save takes only the identity root's flat files
  and the saving checkout's current work unit's workspace (`serializeSplitUserManifest`, `commands/user/save-load.ts`):
  a folder that is no live work unit's workspace, `scratch/` and an ended work unit's among them — is listed apart as
  `disk-only`, whether or not the snapshot holds an older copy, since saving cannot clear it. The import carries it from
  its disk copy where the serialization rules admit it (§ 5.6); where they refuse it, the trial lists it in `refused`
  and the import refuses until it is moved out of the identity's folder or deleted. Disk copies that differ refuse until
  they agree. A second machine's such files reach the importing machine by copy in the cutover's quiesce, or stay off
  the store.
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
  contract's writes, where a write names the quarter alone and the store assigns the number (D5), so `2026-q3`'s two
  `31_` folders and its gap at `54` survive, and the next archive numbers after its quarter's highest.
- **Abandoned and decomposed origins** each get a history ref of one commit with an empty tree and the import's
  provenance (§ 10.8) beside their lineage, so `history` of an origin's records refuses `not-found`, as an ended item's
  reads do (D9), never `state-unresolvable` for a ref no remote would hold; their earlier history stays in code history.
- **Each closed task's captures derive** from the `Context:` footers of the commits that carry its ID, as reverse lookup
  and delivery's attribution derive them today, each expanding a range against the task list with `expandTaskReference`
  (`lib/commit-check/task-reference.ts`; `lookupCommit`, `lib/store/in-repo/lookup.ts`), each capture a commit's
  repository and SHA with its patch-id where it has one (A6, D16). Two residuals: a task whose footers a squash dropped
  keeps no capture, and a commit no closed task's footer names — a ceremony or code-review commit, or an open task's —
  gets none, resolving from the flip to nothing, since `lookup` by commit matches stored links alone (D3).
- **The transient-identity refs** are re-homed, then deleted locally and, once the imported state is published, from the
  remote, each delete leased on the tip the import re-homed, which the import keeps under `refs/arc/tmp/migrate/import/`
  until then: `refs/arc/user/<id>/errands` retires with the move. Running the import again after the first push finds
  its own landing (§ 10.4), clears the remote's refs, and drops the kept tips. `refs/arc/user/<id>/errands-remote` is
  residue and `refs/arc/user/<id>/sync-state` retires with notes, both the cutover's.

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
| `CONTRIBUTING.md`, Prerequisites                                        | "Git ≥2.28"         |

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
  implementation maps it (`lib/store/in-repo/write-conflicts.ts`).
- **The layout lock,** `arc/locks/layout.lock` beside them, the lock a write creates the store directory under (§ 9.7),
  serializes a layout move against every write. The move holds it from its listing through the copy, the switch, and the
  source's delete (§ 10.2). A write, and a pull's merge, takes it last, after its ref locks and only around its commit
  (§ 5.1): under it the write reads the layout again by the store directory's presence and, where it changed, releases
  every lock and restarts from step 2, so no write commits into a copy a move has taken or left. The move takes no ref
  lock, so the order cannot deadlock. Under reftable every commit already waits on one lock (§ 11.2); in the files
  format the layout lock serializes commits to unrelated refs that ran in parallel, each holding it only for its objects
  and one ref transaction and never across a network call, and § 14.5's bursts measure what that costs. A move that
  outlasts a waiting write's 10 s refuses it `lock-held`.
- **No lock is held across a network call, a sleep, or a hook's await** (§ 5.1, § 6.7).

#### 11.5 The push helper

The push helper runs `git push --porcelain` under `LC_ALL=C` with explicit `<oid>:<ref>` pairs, `--atomic`, and leases,
and turns its per-ref lines and exit code into typed outcomes by § 6.9's rules: each ref `ok`, `rejected` with Git's
reason, `remote-rejected` with the server's message, or `atomic-collateral`; and the whole push `hook-declined`,
`atomic-unsupported`, or `unreachable` with its cause, as `PublishFailureSchema`'s `unreachable` carries one
(`RemoteFailureReasonSchema`, `lib/kernel/schema/vocabulary.ts`). It extends the seam's expected outcomes
(`GitExpectedOutcome`, `lib/git/process-error.ts`, today `"absent-remote-ref" | "stale-lease"`).

The cause is read from Git's message text under `LC_ALL=C` by `classifyRemoteFailure` (`lib/git/remote-ref-reader.ts`),
the shipped reader of network and authentication failures, which answers `error` for anything else. A pull's fetch fails
the same way: one that fails before any per-ref line is `unreachable` with that cause, and a fetch of this backend is
`refused` only where a partial clone's stays incomplete after its rerun (§ 6.2): a tracking update Git refuses is a
`history-diverged` notice, and one that fails locally a `tracking-update-failed` notice, told apart by ancestry (§ 6.3).

#### 11.6 Batched reads

Every read batches per operation, each process one-shot: one `for-each-ref` for tips and one `cat-file --batch` of
`<tip>:<path>` names, a quarter ref's taken from its root and folder trees in the same process (§ 3.3). A `read`, a
`list`, or a `lookup` costs one or two processes and `version` one (§ 4.2), as today's batch reads do
(`lib/io-context.ts`, `lib/git/object-availability.ts`); a reference without a UID adds the scan's batched read once per
process (§ 8). A process start costs about 30 ms on Windows against 1.3 ms on Linux. Every read passes
`objectAccess: "local-only"` (`GitExecOptions` and `RawGitExec`, `lib/git/exec.ts`), which runs Git with
`--no-lazy-fetch`, so a read never reaches the network: an object the clone lacks fails the read rather than fetching
it, and in a partial clone every state object came with the fetch that brought its ref (§ 6.2).

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

An operation over its budget gets a long-lived reader before this change lands: a `cat-file --batch` process the
executor keeps open for the operation's reads, with abort on cancellation and closed before maintenance, since Windows
cannot delete an open pack.

#### 11.8 Cancellation on every variant

The plain executor takes a `signal` (`cancelSignal`, `lib/git/process-executor.ts:145`). The stdin and byte variants,
`GitExecInput` and `RawGitExec` (`lib/git/exec.ts`), gain an optional `signal` passed the same way, so a call stuck on a
locked ref or a slow disk can be ended. No store operation passes one in this change: the store's calls through these
variants are one-shot local processes, their ref updates bounded by Git's lock timeout (§ 11.2), so the signal serves a
caller holding a deadline, the long-lived reader of § 11.7 among them if its budget brings one.

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
`write`, `batch`, `pull`, and `push` serve what the Errand identity reader and transaction acquire through Git today, with
D4's listing outcomes: absent, unreadable, and complete kept apart, per-entry diagnostics, and one record version as the
mutation basis. The conformance suite holds it to them (§ 14.1). Expected contract: at the flip each consumer's
acquisition moves onto these operations while it keeps its own protocol, and none authorizes review from incomplete
evidence.

#### 13.2 Consumer-map rows

| Consumer                                | This change                                                                                                              | At the cutover                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `lib/git/ref-tree.ts`                   | Its compare-and-swap role passes to the transaction helper (§ 11.1)                                                      | Retires with notes               |
| `lib/user-sync/cas-retry.ts`            | Its per-ref serialization becomes the lock and compare-and-swap of § 5.1 and § 11.4                                      | Retires with notes               |
| `lib/errand/ref-tree.ts`                | Errand and claims refs separate in the layout (§ 3.2); `errandsRef` stays the naming authority until the flip            | Retires                          |
| `lib/errand/identity-snapshot.ts`       | `readTransientIdentitySnapshot`'s tip, tree, and blob acquisition has its store equivalent in `list` and `read` (§ 13.1) | Acquisition moves onto the store |
| `lib/errand/identity-transaction.ts`    | Its push, fetch, and merge have theirs in `write`, `batch`, `pull`, and `push`                                           | Moves onto the store             |
| `lib/errand/record.ts`, fetched variant | `readFetchedTransientInFlightIndexes`' remote read has `pull` plus `list` (§ 6)                                          | Moves onto the store             |
| `lib/user-sync/classifier.ts`           | The import's personal layout replaces its workspace reading (§ 10.12)                                                    | Retires with notes               |
| `scripts/review-gate/status-errand.ts`  | Errand records through `list` and `read` with D4's outcomes                                                              | Moves onto the store             |

#### 13.3 Owned register rows

- **Notes sync reads every subdirectory of `.arc/user/<id>/` as a workspace** (`classifyUserSyncPath`,
  `lib/user-sync/classifier.ts`): the import brings each person's files to D5's layout (§ 10.12), so from the flip no
  subdirectory is a workspace. The row closes when the cutover runs the import.
- **The Errand identity refs, with notes sync's `refs/arc/user/<id>/sync-state` and their shared plumbing:** Errands
  become project-scope work items and claims move to each person's claims ref (§ 3.2, § 13.1); the import re-homes them
  and retires `refs/arc/user/<id>/errands` (§ 10.11); the sync-state ref retires with notes; and the reader's
  acquisition moves behind `list`, `read`, `pull`, and `push`. The row closes at the flip.

### 14. Verification

#### 14.1 Conformance over both layouts

A ref-backend fixture beside the in-repo and reference ones runs `registerStoreConformanceSuite`
(`__tests__/helpers/store/conformance-suite.ts`) over real temporary repositories and a bare origin, once per layout:
the default in a files-format code repository, and the separate one in its reftable directory.

- **Families:** every family but `project-machinery` and `constitution`, which stay tracked in the standard profile
  (`profiles`, `FAMILY_REGISTRY`). The three reserved families have no kinds yet and list absent.
- **Declarations** (`FixtureDeclarations`, `__tests__/helpers/store/fixture-contract.ts`): `mergesConcurrentWrites`,
  `stateOffBranch`, `runsWriteChecks`, and `liveListingStateVersion` true; `syncFamilies` and `identitySyncFamilies` its
  declared families by scope. It runs the reference fixture's test registry, whose pure test parsers cover the
  single-writer kinds, so like that fixture it declares `rejectingContentUnavailable` for the prose and entry-list kinds
  of its families, which no registered parser refuses, and declares that fixture's test grammars for the three entry
  kinds whose registry declares none (`entryShapes`).
- **Its project-owned references name the store's one project** (§ 3.2), `{ type: "project", name: "project" }`, as the
  in-repo fixture's do (`__tests__/helpers/store/in-repo-fixture.ts`).
- **Exclusions for the in-repo implementation's own refusals,** as the reference fixture's
  (`__tests__/helpers/store/reference-fixture.ts`): the cross-substrate and saved-state coverage items,
  `checkout-not-writable`, nine of the ten `unsupported` cases, and the transient-write cases. It produces the tenth,
  `held-here` (`held-here-unsupported-remedy`, `__tests__/helpers/store/suite-lookup.ts`), `state-unresolvable`, and
  `namespace-corrupt`, by a commit made outside ARC that breaks an item ref's metadata file, which a forward repair
  restoring the file mends (§ 3.3). One more is its own: `diagnostic-key-mismatch` for the kinds on the project's two
  refs whose ref, path, and test parser's fields name their owner at most once between them — `project-inbox/inbox`,
  `project-inbox/routing-receipt`, `project-registry/identity`, `project-registry/counter`, `lineage/transition`, and
  `lineage/conflict-record` — so no stored state there names two (§ 3.1). Any further exclusion is a defect or a forward
  amendment.
- **Its store factory takes the registry override** (`ConformanceRegistration.create`), which the write-check item
  installs its test registration through, and its content generator writes canonical JSON for JSON-homed kinds (§ 3.5).
- **Each test copies a prepared template repository** rather than creating one (§ 14.12).
- **The transaction helper's tests run both ref formats,** and on reftable a `version` listing beside a writer moving
  refs in two namespaces in one transaction never sees part of it.
- **The stdin and byte executor variants** each end a call on an aborted signal, rejecting it as the plain executor
  does, with a `GitProcessError` of kind `canceled` (§ 11.8).

#### 14.2 The suite follows § 2

- **Its sync items move to `push`** (`__tests__/helpers/store/suite-sync.ts`), each outcome carrying a retry count and
  time waited.
- **New items:** `pull` merges and publishes nothing, for each sync family, which the in-repo fixture excludes for
  `work-item` and `claims` by name, since its `pull` serves `personal` alone (§ 2.1); `maintain()` returns measurements
  or `null`; `state-unresolvable`, a recovery case a backend produces or excludes by name (D7); and a cohort document's
  archive placement, which reads back with its sequence and closeout, and which the in-repo fixture excludes by its
  `placement-move` refusal; and a rename onto a live item's slug and a reopen whose slug a live item has taken, each
  refusing `ambiguous-match` naming both, which the reference backend already refuses (`indexIdentities`) and a fixture
  whose backend refuses the rename or reopen itself excludes by that refusal (D7). The cross-type cases stay in § 14.3,
  since the reference backend's index compares one type (`ownerNameKey`, `__tests__/helpers/store/model.ts`). The
  reference backend implements `pull`, `maintain`, the cohort placement, and the retry figures.
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
  checkout's names; no two kinds' paths collide within a ref or across refs; each reserved key refuses, and so does a
  key whose path is a folder another record's path runs through, or runs through one; and an `id` key or a pass's
  activity holding `/`, a NUL, or a newline refuses `record-malformed`, as does a `path` key holding a newline; and a
  personal document keyed `STATUS.USER.md` at the root, or under a root or one-folder-down `.internal/`, refuses at
  `write`, at `batch`, and at `read`, while `scratch/STATUS.USER.md` stores, and a `STATUS.USER.md` placed at the root
  by a commit outside ARC lists as `malformed`.
- **Record versions:** a metadata-only write moves the primary's version and no other record's; a rename adds no blobs;
  `history` follows a record across a rename and a role change.
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
- **Writes:** a no-op rewrite makes no commit; a stale base on a merge kind merges; a role replacement runs both kinds'
  checks; a lost race behind the lock's back retries; a put of a `field-header` entry with no `_Remove when:_` line
  refuses `record-malformed`; and a retried put of a hand-typed entry, after its first attempt landed, stamps the same
  ID and makes no commit.
- **Resolution:** a reference without a UID resolves to its slug's live holder, then a former slug's, then its one ended
  holder, then an ended item's former slug's; several ended holders and a clash between machines refuse
  `ambiguous-match`; a create mints a UID, one over a completed item's slug starts a new one, and one over a live item's
  slug refuses; a rename onto a live item's slug and a reopen whose slug a live item has taken refuse `ambiguous-match`
  naming both, and so do a work unit renamed onto a live cohort's name, a cohort reopened onto a live work unit's slug,
  and a create of either over the other's live slug; and a rename that ends a clash between machines lands.
- **The project owner:** a project family's listing returns the store's one project owner, and a project reference with
  another name, or a UID not the project ID, refuses `identity-mismatch`.

#### 14.4 Serialization rules

`checkSerializationRules` refuses each rule — a binary file, a projected record over the cap, an `.env` file, a private
key by content and by name, and non-JSON content for a JSON kind — and admits `.env.example` and a PEM header with no
matching end line. The backend refuses each at `write` and at `batch`, and the import's build refuses each, all with
`record-malformed` naming the rule; and a Candidate record over the cap writes, lists, and reads back through `history`.

#### 14.5 Sync, lifecycle, and many processes

Held to the spikes' pass criteria for writes — no lost write, bounded retries, typed conflicts:

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
      result's `pulls` where the push loop met it; an end against a published reopen; a write racing an end between the
      push loop's pull and its push; and the restore after a mirror push;
    - `history-diverged` on a rewritten ref, with each remedy leading back to a clean pull, and a push holding writes on
      that ref ending at once as terminal `refused`, publishing nothing, with the notice in its `pulls`;
    - the same refusal with `fetch.showForcedUpdates` set false in the person's global configuration and in the store
      repository's own, in both layouts;
    - a commit made outside ARC that breaks an item ref's metadata file is left out of the push with the refs its
      unpublished batches span, failing their families `refused`; the same commit pushed outside ARC makes another
      clone's pull leave its ref and fail that remote `refused`; and a forward repair on either clone, once pushed, brings
      both back to reads that succeed;
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
      mirror push erased the first report `ended-twice`;
    - `maintain()` returns each never-retiring ref's commit count and disk usage — the person's `personal` and `claims`
      refs, `project/inbox`, and `project/registry` — and leaves out one the clone lacks;
    - `carry` over one atomic receiver and over ordered legs, a carried ref's own rejection, an ordered code leg to an
      unreachable remote while the state leg pushes, a pre-push hook declining a carried ref and a state-only push, and
      a receiver without atomic pushes (`receive.advertiseAtomic=false`).
- **On schedule, with the Windows and macOS pair:** twenty worktrees writing personal-inbox insertions and removals at
  once, and twenty clones converging on one ref. The full bursts took about 12 s on Linux and 378–401 s on Windows.

#### 14.6 Who designates, and read sources

A fresh clone's first `pull` over each case of § 9.2 — the code remote holding the registry, an upstream holding it,
neither, and a tracked pointer — sets or reports `designation-needed` as § 9.2 says, the same with and without a
terminal, and with a pointer the code remote is never set or asked about. A remote whose presence read fails sets and
asks nothing and reports it `unreachable` as a `candidate`, and the next pull once it answers decides. A clone whose
state sits in the separate directory is asked rather than set, and its answer moves the layout. The code remote resolves
through `remote.pushDefault`, a lone remote not named `origin`, and `origin` among others, the same from a detached
worktree and from one whose own `config.worktree` sets `remote.pushDefault`; a clone with none is asked nothing about
it, and a carried code ref there reports `no-push-destination`. A `git remote rename`, a remote added beside a lone
remote not named `origin`, and `remote.pushDefault` set each leave the store where it is and report `move-incomplete`.
`arc store remote` shows and sets each role; two remotes carrying `push` report `designation-ambiguous`; a setting that
changes the layout moves it. A team member on a fork who answers `push` for the upstream gets the separate layout, and a
pull and a push reach the upstream by its fetch and push URLs, a `pushurl` among them, while a carried code ref goes to
the fork.

A read source, in both layouts: a pull fetches its project namespaces into `refs/arc-remotes/<remote>/` and never
another person's identity; `createReadSourceStore` reads, lists, and looks up there, as of its own state versions too;
nothing it fetches merges into local state or is pushed; a history ref its refusal names, pulled by name, resolves; and
on a clone with no state remote whose registry holds no project ID, the first pull that fetches the upstream's registry
adopts its ID, which a later pull leaves alone, while a clone with a state remote and no ID adopts nothing from it. A
diverged ref there reports `history-diverged` with taking theirs as its one way out; and a forwarding record there fails
that source terminal `refused`, naming the move, until its remedy sets it `off` and the moved-to remote `read`, after
which a pull reads the upstream from there.

#### 14.7 The migrate verb and the import, by comparison

- **Each move** — a clone's layout both ways, a project's remote with its forwarding record, a remote move that changes
  the clone's layout, and the import — is interrupted after each step and run again to completion, a remote move's rerun
  merging onto the copy it landed, and a trial run's report matches what the move then does. Each layout move, both
  ways, also runs beside a writer in a second worktree creating one item and updating another, and both writes land in
  the layout the move leaves; and after each, a ref rewritten on the remote before the move still refuses
  `history-diverged` at the next pull.
- **The remote move** runs with a second person's identity refs and a history ref the moving clone never pulled on the
  old remote, and both reach the new one. It also runs with a teammate's write, a teammate's new item, and a teammate's
  end of an item landing on the old remote after the copy, and afterward the new remote holds the old one's last state
  and the old remote only the forwarding record; a teammate's push landing after the mover's last listing stays on the
  old remote until that teammate follows, and leaves with the follow. Step 4's re-copy and a follow's clearing copy each
  also run against a new remote whose ref a follower's push moved after the copy, and each merges onto it, reporting a
  broken rule in its notices.
- **Following a move** to a backing repository, back to the code remote, and between two backing repositories, from a
  follower carrying `push` on its code remote, one carrying it on a fork's upstream, and one carrying `read`: once the
  pointer's change is in and until the follow, `pull` and `push` report `move-incomplete` — a `read` follower of a move
  to a backing repository meets the pointer's `designation-needed`, and its old source's forwarding record fails that
  source terminal `refused` (§ 9.6) — and, where the pointer disallows the follower's designation, `arc store remote`
  refuses every setting but the follow's; the follow asks, never carrying the old role, and without a terminal reports
  `designation-needed`, whose answering command completes it; on `push` the follower ends in the layout the move calls
  for, the old state remote `off`, and `backing` repointed or removed, and on `read` or `off` in a designation the
  pointer allows, the old source `off`; and interrupted after each step, rerunning its answering command completes it.
- **The import** runs over a fixture repository in today's substrates. Afterward every record the in-repo implementation
  lists reads the same through the ref backend — its content and every field both carry, never its version — but for the
  transforms of § 10.9. What the import reads directly is compared with its own source: each person's notes snapshot,
  less what § 10.8 keeps out, with their imported personal ref, through § 10.9's transforms — each moved file at its
  `scratch/` path, each entry less its `_Id:_` stamp, the two shared files less their tombstones, and each folded
  `SESSION-NOTES.md` against its meta's session context by the fold's rules, a body the writer refuses listed in
  `refused`; the review gate's facts with the gate's own reads under `.git/arc/`, keyed by a project ID equal to its
  repository ID; Errand descriptions, inbound lists, and queues with the entries, buffer sections, held captures, and
  marks they came from, under § 14.1's test grammars through the backend's registry, since the production registry
  declares none for those three kinds yet (§ 5.1); and each closed task's captures with the in-repo implementation's
  `lookup` by commit, so every commit whose footer names a closed task resolves through both to the same work unit and
  tasks. The lifecycle work's differential helper (`__tests__/helpers/store/lifecycle-differential.ts`) is the
  precedent.
- **The notes snapshot:** a file that differs from its disk copy, by an entry removed on disk and by one only an older
  note holds, and a file the snapshot holds and no disk copy does are each listed by the trial, the second apart, and
  the import refuses until each agrees, then lands; the differing file agrees once saved and then loaded, and the
  snapshot-only one once a load restores it; a tombstone the snapshot carries and the disk lacks is no difference; a
  file over 256 KiB, one whose extension is off notes sync's allowlist, one under `scratch/`, and one in an ended work
  unit's workspace are listed `disk-only` and carried from disk, while an `.env` file is listed in `refused` and refuses
  the import until it is removed; and the identity root's `STATUS.USER.md` and a workspace's `.internal/` folder land
  nowhere.
- **After the import,** a completed work unit reopens and takes a write, and a write to a closed cohort's document lands
  on its history ref, and `history` of an abandoned origin's records refuses `not-found`.
- **Each Candidate record** gets the same result through the store's `history` as today's reader gets over code history
  (`resolveCandidateSupersessionAncestors` over the versions `readRepositoryCandidateSupersessionChain` reads): in the
  fixture, a chain with a version a merge commit introduced, which resolves, and a broken chain and a record today's
  schema rejects, which refuse on both sides.

#### 14.8 Hosts: a scripted trial, run by hand

The contract's host trial runs again against the built backend: GitHub and GitLab must hold, Azure DevOps and Bitbucket
should, and Gitea and Forgejo are best effort. It adds what this design relies on: `--porcelain` on each host, what a
receiver without atomic pushes prints, each host's text for a lost race, under `--atomic` and on a single ref, leased
deletes, the forwarding record, Azure DevOps' fork copying and its ordinary members' permissions, the push refusal the
earlier trial never captured, and the two checks the open questions name: that protocol v2 narrows the ref advertisement
to a command-line refspec's prefixes, and that each host keeps the `atomic` capability over HTTP. It needs credentials
and scratch repositories, so it is a kit run by hand, its results recorded in `notes-storage-ref-backend.md`, never CI.

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
- **Keeping an undesignated clone's state in the code repository's refs** until a deliberate local-only move puts a fork
  contributor's state where D10 promises privacy, and still moves the store when a clone answers into local-only.
- **The store prompting for the designation itself** would put a prompt inside a library call that runs in hooks and CI;
  the store reports the question and the calling verb asks (§ 9.3).
- **Minting the project ID at `arc join`** when no remote held one leaves two create-only identity records to clash once
  both are pushed.
- **Keeping the registry ref on a remote being left,** with a final commit marking the move, leaves the registry's whole
  history reachable there.
- **Holding identity-scope refs back by default** costs every person the backup and cross-machine carry for a privacy
  most do not need, and a held push only delays the same exposure.

**Git access and maintenance**

- **Keeping Git 2.45 with a bounded retry** when a transaction fails with every ref matching guesses at a lock the
  helper cannot see.
- **Checking the Git version once per process** spends a process on every command, doubling a no-change check's one.
- **A long-lived reader for every command** is a child process to open, close, and abort, and on Windows holds
  maintenance until it closes, for a cost no measured command yet shows; § 11.7 adds one where a budget is breached.
- **Maintaining and measuring inside every `pull` and `push`** walks each never-retiring ref's history on every push; **a
  machine-local log of every push's figures** catches the bursts handoff's push misses at the cost of a record kept for
  an advisory signal.

## Cross-cutting Considerations

**Security and trust boundaries.**

- Identity scope is not private: anyone who can read the state remote reads it. A repository that wants its state
  private keeps it in a backing repository or local, and moves it before going public (§ 10.7).
- The backend never pushes `refs/arc/*` to a remote the person has not designated, and the designation never syncs.
- The serialization rules refuse `.env` files and private keys at every write and in the import, never skipping them; a
  merge or a move carries what another machine's write already checked, gating on none (§ 6.4, § 10.4).
- The forwarding record carries no URL and keeps no state history reachable on the remote being left.
- Leases keep a push from recreating what another machine's lifecycle move deleted; a host cannot enforce ARC's writer
  rules, as for every ARC writer rule (D11).
- Git's message text is read in three named places only — a receiver without atomic pushes, a server's per-ref
  refusal line, and a remote failure's network or authentication cause — always under `LC_ALL=C`.

**Performance.** A no-change `version` costs one Git process, and `read`, `list`, and `lookup` one or two, against the
Windows budget of § 11.7; the push loop is bounded by its deadline; `maintain()` keeps packing current for a store that
only plumbing writes.

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

**User-facing impact.** None before the flip. From it: a designation question once per clone where § 9.2 asks one,
`arc store remote` and `arc store migrate`, and `arc sync` running a pull and a push.

**Package boundaries.** The backend sits under `lib/store/ref/`, imported only within `lib/store/`; its Git capabilities
under `lib/git/`. Shipped content changes for the Git floor, edited in the package's `QUICK-REFERENCE.template.md` and
synced to this repository's `QUICK-REFERENCE.md`, and for `storage.backing_repository`, which the package's
`arc-config.yml` declares empty, as it declares every key in the configuration catalog (`ARC_CONFIG_FIELDS`).

## Success Criteria

1. **The contract changes land.** `Store` has `pull`, `push`, and `maintain` and no `sync`; the result types, the
   `state-unresolvable` refusal, the cohort's archive placement, the `ReadOnlyStore` type, and `RefHome` are as §§ 2,
   3.2, and 9.6 give them; and the contract specification's Amendments log carries one entry for each amendment in
   § 2.5.
2. **Conformance passes over the ref backend in both layouts** with no exclusion beyond § 14.1's, and over the in-repo
   and reference fixtures with § 14.2's changes.
3. **The serialization rules hold everywhere they run.** `checkSerializationRules` is exported from `lib/store/`, and
   each rule refuses at `write`, at `batch`, and in the import's build, with the cases of § 14.4.
4. **The version model holds.** A no-change `version` spawns one Git process; the manifest's id equals Git's own write in
   both object formats; an anchor's manifest resolves on a fresh clone; and each case of § 14.3 passes.
5. **Sync and lifecycle hold under concurrency.** Every integration case of § 14.5 passes on every change, and one
   scheduled run of the bursts passes on Linux, Windows, and macOS, with no lost write.
6. **Designation and read sources follow § 9.2 and § 9.6** in every case of § 14.6.
7. **Every move restarts and the import compares clean.** Each move of § 14.7, interrupted after each step, completes on
   a rerun; its trial report matches it; and the import's comparison differs only by the transforms of § 10.9, its three
   entry kinds compared under § 14.1's test grammars (§ 14.7).
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

## Open Questions

None blocks starting. The dependencies below are expected contracts with stated availability, and none leaves design
open:

- **At the flip or with their verbs:** callers that meet `state-unresolvable` naming history refs pull them by name and
  retry (§ 4.5); the asking points surface `designation-needed` (§ 9.3); `arc init` sets `push` and mints the project
  ID (§ 9.2, § 9.8); the Errand identity consumers move their acquisition onto the store (§ 13.1); and `arc sync` runs a
  pull and a push (§ 6.1).
- **With the working copy:** its removal check calls `checkSerializationRules`, and its persist reports the backend's
  refusal (§ 5.6).
- **With handoff's rewrite:** handoff calls `maintain()` and shows its measurements and its own push's figures (§ 12).
- **Before the import runs:** `work-item/description`, `work-item/inbound`, and `personal/errand-queue` declare their
  entry grammars, which the import's build stamps by and the backend merges by (§ 5.1, § 10.9); until each does, the
  import's trial names it and the import refuses (§ 10.5). This change verifies those three kinds' import under test
  grammars (§ 14.7), so the declared grammars are first exercised by the cutover's trial run.
- **Unverified and load-bearing, checked by the host kit (§ 14.8):** that protocol v2 narrows the ref advertisement to a
  command-line refspec's prefixes, and that hosts keep the `atomic` capability over HTTP.

## Amendments

None.

---
