# Spec (`detailed` · `RFC`): storage-contract

- **Origin:** [internal]

- **Purpose:** Define the one storage contract through which every ARC reader and writer of operational and planning
  state goes, and ship it over today's substrates — with a concurrency library, a conformance suite, and a non-Git
  reference backend — so callers move onto it before the ref store exists and the later flip to that store changes no
  caller's code.

---

## Introduction / Context

ARC keeps operational and planning state in three places today:

- **tracked files on the checkout's branch** — every work unit's meta, task list, draft, spec, and notes; cohort
  documents; the backlog and the completed archive; and the Candidate, integration-boundary, and transition records
  under `.arc/system/.internal/`;
- **gitignored personal files** under `.arc/user/<identity>/`, carried between machines as a JSON snapshot in Git
  notes (`refs/notes/arc/user/<identity>`); and
- **one transient-identity ref per person**, `refs/arc/user/<identity>/errands`, holding that person's Errand, grooming,
  and housekeeping records as one tree keyed by slug and written through one transaction that fetches, reconciles,
  commits, and pushes (`lib/errand/identity-transaction.ts` over `lib/git/ref-tree.ts`).

State that rides code branches makes code history carry churn nobody reviews, couples lifecycle to branch topology, and
forces machinery whose only job is to keep state out of the way of code — lifecycle exclusion, placement gating, the
planning lane, and delivery's projection layer. Notes attach state to commit SHAs, so a rewrite orphans it, and their
recency-based merge drops the older of two concurrent edits silently.
`adr-035-keep-operational-state-in-repository-refs.md` decides the direction: all operational and planning state moves
to same-repository refs under `refs/arc/*`, reached through one storage contract with pluggable backends, with a
gitignored projection at the familiar `.arc/` paths as the working copy people and agents edit. The decision leaves the
contract itself open — its families and operations, its versions and failures, the ref layout, each shared surface's
concurrency details, and what a caller sees through the projection.

This change answers those questions and ships the contract before the ref store exists. Readers and writers move onto
it over today's substrates first; the ref store, the projection, and the one-time move of a repository's state are
built against the same contract and switch in together. Every question left soft here becomes a coordination seam
between pieces of work meant to run in parallel, so the contract is settled whole now, including the parts that later
changes build.

**Terms used throughout:**

- **Store** — the authority for operational and planning state behind the contract. **Backend** — one implementation
  of the store.
- **Record** — one stored document: a file, since the file is the record (D5). **Family** — a storage grouping of
  records sharing scope, ref placement, retention, sync, and lifecycle. **Kind** — a record type within a family,
  carrying its parser, format version, writer rule, and projected path. **Surface** — one ref's share of a family.
- **Substrate** — one of today's three places above.
- **In-repo implementation** — the backend over today's substrates, which this change builds. **Reference backend** —
  an in-memory, test-only backend this change builds. **Ref backend** — the `refs/arc/*` store built later.
- **Projection** — the gitignored working copy at `.arc/active/`, `.arc/backlog/`, `.arc/completed/`, and
  `.arc/user/<identity>/`, written from the store and written back to it.
- **Cutover** — the one-time, per-repository move of state onto the ref store; its central step is the **flip**, when
  every family switches at once, Git notes retire, and the projection becomes the working copy. The cutover then
  deletes what only today's substrates needed.
- **State version** — one opaque value naming a saved state of the whole store (D2). **Record version** — one
  record's own compare-and-swap basis (D2).
- **Work item** — a piece of work with its own record, branch, and landing: a work unit or an Errand, its **type**
  (D5).

## Goals

1. **One interface for every state read and write.** A caller reads, lists, writes, and asks history of state through
   one contract whose operations, identities, versions, and failures are fixed, and never learns which backend
   answered it.
2. **Settle the whole contract now.** The interface, the record model, the ref layout, each shared surface's
   concurrency mechanism, the sync semantics, and the projection's caller-visible behavior are decided here, so the ref
   store, the projection, and the rerouting of callers can each be built in parallel against a landed contract rather
   than against each other.
3. **Ship over today's substrates, changing nothing observable.** The in-repo implementation serves every family where
   it lives today and does what today's code does, commits included, so callers move onto the contract with no change
   in behavior and no new ceremony.
4. **Prove substitutability, not argue it.** One conformance suite runs against every backend, including a reference
   backend with no Git at all, so the contract is shown to be implementable without Git and every backend is held to
   the same observable semantics — version conflicts, stale bases, batches, listings, and freshness.
5. **Make concurrency a library, not a per-caller reinvention.** Entry merge, three-way line merge, typed conflict
   records, and rank keys exist once, as pure functions, for every backend and the projection to consume.
6. **Land the pieces every caller shares.** The current-work-unit resolver, the lifecycle index keyed by identity, and
   the store behind the integration checkpoint's lifecycle port land here, over the contract, serving their existing
   call sites, so parallel rerouting work shares nothing but the landed contract.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This change does not:

- **reroute existing callers.** Beyond the shared pieces' existing call sites (D9), no reader or writer moves onto the
  contract here; each keeps its current code path until its own rerouting.
- **move any state.** Tracked records stay on the checkout's branch, personal files stay synced through Git notes, and
  Errand refs stay where they are. Nothing flips.
- **change any workflow, ceremony, or commit.** No workflow text changes, no verb gains or loses a commit, and every
  interlock and gate stays as it is. The process changes once, at the flip (D15).
- **change any record's format or field schema.** Files stay byte-for-byte as today's writers produce them; each
  family's field schema, the meta's `Id` field, and every parser beyond the meta's, which the lifecycle index
  registers, and the Errand record's existing schema (D5, D9), are later work.
- **design work-item types beyond the two ARC has, or decide how an external tracker's items compose with work
  items.** This change sets only the seam a further type would use (D5).
- **build the ref backend, the backing repository, local-only mode, sync onto refs, the import from today's
  substrates, or explicit state fetch.** Their design is specified here (D10–D12, D14) so they build against it.
- **build the projection** — the working copy, refresh, write-back, `arc save`, protected-file notices, or the
  worktree lock. Its caller-visible behavior is specified here (D13, D17).
- **build the task close verb, branchless planning, the design-document export and its merge guard, the history
  policy, or ghost mode's install profile and footer policy.** Each is specified here (D15–D20) so its builder
  inherits settled answers.
- **build what is deferred and never precluded:** scheduled ref rotation, a query cache, protected (host-enforced)
  state, a service backend with per-record authorization and very high write parallelism, keeping shipped specs in the
  repository, and an Open Knowledge Format projection. Each keeps a reserved hook or a tripwire (D10, D20).
- **build RFC-style review support, a hosted service, or a heavy UI or TUI.** External trackers stay composition
  targets, never owners of work-unit artifacts.

---

## Proposed Design

The design has two parts.

- **Part A — built by this change (D1–D9):** the contract's types and operations, its failures and outcomes, the
  record model's registry, the concurrency library, the reference backend and conformance suite, the in-repo
  implementation, and the shared caller pieces. The task list is built from Part A.
- **Part B — specified here, realized by later changes (D10–D20):** the ref layout, sync, the projection, the
  backends, what takes effect at the flip, and the pieces around them. Part B is normative: whatever realizes it meets
  it as written, and Part A's types and conformance suite encode it wherever it is observable through the contract.

Code lands under a new `lib/store/` module family in the CLI package: the contract's types and operation signatures, its
refusal vocabulary, the family and kind registry, the concurrency library, and one directory per backend. The contract
core depends downward only on `lib/kernel/` (Zod schemas and `ArcError`), and the concurrency library on it and
`node-diff3`; the backends add `lib/git/`'s executor, and the in-repo implementation the substrates it wraps (D8).
Nothing outside `lib/store/` imports a backend directly: one composition point selects the backend, and every caller
receives the contract. The composition point is a factory that takes the backend's dependencies — the Git executor and
its stdin variant, file access, the clock, the checkout root, the identity, the remote selection, and the write locks —
as one required object, the way the CLI's existing `create*Dependencies` factories do, so a test substitutes any of them
without reaching into the backend. Constructing the contract runs no command and reads no file: the identity, the remote
selection, and each lock's path are resolved on first use by the operation that needs one, so a caller that reads only
this checkout's tracked records — the current-work-unit resolver (D9) — spawns no Git process, as today's reader spawns
none. The identity is resolved as user and Errand commands resolve it (`resolveIdentity` in `lib/git/identity.ts`, with
no prompt), so a record is read under the identity it was written under. It may be absent. Every operation that names or
resolves to identity-scope state — a personal file, or a record on a transient-identity ref — then refuses `not-found`,
saying no identity is configured and naming `arc.identity` as the remedy, and a listing of either is `absent`, as
today's transient-identity reader answers, since no identity holds no claims (`readTransientInFlightIndexes` in
`lib/errand/record.ts`); `sync` reports no identity once, a state naming `arc.identity` and the families it held back,
while the rest publish (D4). A command rerouted onto the contract maps that refusal onto the error it reports today, and
a caller that checks for an identity before it calls keeps checking.

### Part A — Built by this change

### D1. The contract

One interface owns every read, version-checked write, listing, history query, lookup, and sync of state. Nothing above
it knows which backend is active, with one interim exception (D15); the target namespace is a backend parameter.

**Operations.**

| Operation | Input                                                                                                    | Result                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `read`    | a record reference (D2); optionally a state version                                                      | the record's content, its record version, its format version, and the IDs of its open conflict records (D6)            |
| `list`    | a family, optionally a kind, an owner, and a filter; optionally a state version                          | a listing outcome (D4): parsed fields per record where the kind has a parser, never a path                             |
| `write`   | one record's reference, its new content or its removal, its expected record version, and provenance (D3) | the new record version, or none for a removal, plus any conflict records the write created (D3)                        |
| `batch`   | several writes, each with its own expected version, under one provenance                                 | every write applied, or none (D3)                                                                                      |
| `version` | none                                                                                                     | the current state version (D2)                                                                                         |
| `history` | a record reference                                                                                       | the record's versions and exact content, newest first, with provenance (D3); null version and content for removal (A2) |
| `changes` | two state versions, optionally restricted to named record references                                     | the landed record mutations between them, each with its version, exact content and provenance; nulls for removal (A2)  |
| `lookup`  | a slug, a lineage origin, a checkout claim, or a repository plus a commit or ref (D3)                    | a reference to the record it resolves to, with the tasks a commit resolves to (D3), or a typed refusal (D4)            |
| `sync`    | none                                                                                                     | one outcome per publish, and no remote or no identity as states (D4)                                                   |

A **checkout claim** is what a registered checkout's marker names — a work unit, an Errand, a grooming set, a
housekeeping sweep, or a partial-protection Errand — passed to `lookup` as the marker carries it, by the marker's kind
(`work-unit`, `errand`, `groom`, `housekeep`, or `partial-errand`), slug, and the claim ID where the marker carries one,
never as a checkout path; `lookup` by one answers which record that checkout holds. A work unit's marker carries no
claim ID. A partial-protection Errand's carries a null one and keeps no record (D5), so lookup by its claim is
`not-found`, saying so. A marker that names only a branch, or a legacy Errand marker with no claim ID, carries no
checkout claim. `lookup` returns a record reference, from which the owner's identity is read: a work item's primary
record for a slug, a former slug, a work item's checkout claim, a commit, or a ref; a lineage's transition record for a
lineage origin; and the claim's own record for a grooming or housekeeping claim.

A work item's **placement** (D5) and its **links** (D3) travel beside its content, never inside it and never as a path.
Its primary record — a work unit's meta, an Errand's record — carries both: `read` and `list` return them, and a write
to that record carries its placement, but for a removal, which places nothing, and may carry a links value, which
replaces its links whole, an empty value clearing them, while a write carrying no links value keeps them. The work
item's other kinds read and list with its placement, and a write to one carries neither, landing where its work item is
placed. A write naming another placement moves the work item, and a rename is a write naming the work item by its UID
with a new name (D2).

A `list` **owner** keeps one owner's records, such as a work unit's companions. A `list` **filter** names lifecycle
locations — `active`, `planned`, `provisional`, or `completed`, the lifecycle index's four — and whether to keep only
the records this checkout holds. A backend whose state lives off the checkout's branch refuses the second `unsupported`,
recoverable by `lookup` with the checkout's claim or by listing without the filter; the in-repo implementation answers
it from the working tree (D8). The second serves today's callers of the working tree's index and retires with the
in-repo implementation at the cutover.

Contract requirements every backend meets:

- **Callers name records by reference (D2), never by projected path.** A listing returns parsed fields; derived views —
  ROADMAP, `STATUS.USER`, the archive listing — render from them and are never stored.
- **Every family is listable, readable, and writable with its references intact,** so moving state between backends is
  generic over the contract.
- **Sync is its own operation.** A backend without sync is a configuration of one that has it, not another
  implementation. The in-repo implementation's transient-identity writes are the one exception until the cutover: they
  publish inside the write, as today (D8).
- **A verb confirms its own write from the local store,** never from a fresh fetch: a host's replicas may lag.
- **Write serialization belongs to the contract:** each surface's writes compare-and-swap against the expected version
  under a machine-local write lock for that surface, and a write that waits past the lock refuses `lock-held` (D4). The
  in-repo implementation takes one lock per checkout for tracked records and today's notes lock for personal files; its
  transient-identity write takes none of its own, and Git's ref lock serializes that transaction's compare-and-swap, so
  a write that meets the lock throws, as D4 throws what it cannot classify (D8).
- **The store is CLI-internal plumbing.** People and agents work through the projection and `arc` verbs; no agent runs
  Git against the store, and which family a write lands in is computed by the CLI, never left to agent judgment.

**The capability report.** The contract reports exactly one capability: whether state lives off the checkout's branch.
The in-repo implementation answers no; the reference and ref backends answer yes. D15 states the one use a verb may
make of it. Everything else a test needs to know about a backend — whether it merges concurrent writes, which families
it serves — is declared by the conformance suite's fixture for that backend (D7), not reported through the contract.

### D2. Identity and versions

**An owner's identity is a name plus a UID.** Every record belongs to an owner — a work item, a cohort, the project, or
a person. The name is the slug: the human handle, unique among the live records that share its namespace — every work
item, whatever its type, shares one (D14) — and reusable once its record completes. The UID is minted at creation with
`crypto.randomUUID()`, never reused, and never changed, so it tells a recreated work item from an earlier one of the
same name. Work units, cohorts, and Errands carry one, and the project ID (D14) is one; a person is named by their
identity and carries none.

- UIDs are random, neither time-ordered nor sequential: time-ordered prefixes collide for IDs minted close together,
  and sequential numbers collide across offline machines. Counters people read — ADR numbers, the archive sequence —
  stay counters, as labels rather than identity.
- Display is the shortest unique prefix, as Git abbreviates object IDs. A durable name that carries a UID, such as an
  Errand branch, takes a fixed eight hex characters; a recurring generic name takes a UID suffix, never a date, which
  orders but does not disambiguate.
- Machine records reference each other by UID; prose keeps names and backticked filenames. UIDs never enter filenames or
  projected paths, which stay slug-keyed; a stored path that is never projected may carry one, as lineage keyed by
  origin UID and a closed Errand's folder in its quarter's archive ref do (D10), and so may a machine-local path, as
  integration checkpoint records' paths do from the flip (D5).
- A rename is a field write, expressed as a write to the work item's primary record naming it by its UID with the new
  name: the work item keeps its UID and records its former slugs, so an old name still resolves through `lookup`. A
  backend with no UID for a work item cannot express one; the in-repo implementation refuses it (D4, D8).
- **In this change the contract's identity and reference types are opaque.** The in-repo implementation resolves an
  identity from the slug, since today's records carry no UID; when the meta gains its `Id` field, the identity becomes
  the UID with no caller change. The rules above bind the backends that mint UIDs — the reference backend here, the ref
  backend and the move later. An Errand branch stays `chore/<slug>` until the move gives Errand records their UIDs
  (D14), and takes its eight-character suffix from then.

**A record reference names one record:** its owner's identity, its kind (D5), and, for a kind that holds several records
per owner, a key. The keys are a companion's name — a paired spec's halves are the companions named `spec-prd` and
`spec-rfc`, and the in-repo implementation maps each name onto today's filename (D8) — a personal document's path, a
grooming or housekeeping claim's slug, a conflict record's or routing receipt's ID, a durable review fact's ID, an
adversarial pass's activity and number, a record-number counter's name, and, until the flip, the work unit a
`SESSION-NOTES.md` file serves. Every other kind holds one record per owner — a meta, a task list, a draft, a spec,
notes, a Candidate record, an inbox — and takes no key. The reference is opaque in construction — built through one
typed constructor per kind's shape, so no caller assembles a key its kind does not take — and read through accessors for
its owner's identity, its kind, and its key, as a caller takes a work unit's identity from what `lookup` returns.
`read`, `write`, `history`, and `changes`' restriction take a reference, and `list` takes an owner (D1). A work item's
Candidate record is its one record of that kind: the canonical content digest that identifies each Candidate it has held
is a field of the record (`attestation.candidateId`), and the chain of those Candidates is the record's `history`.

**Record version.** Each record has its own version, the basis every compare-and-swap checks, exact from the moment
its write returns — so compare-and-swap and bound checks never wait on anything else. The in-repo implementation uses
the record's content digest on every substrate — for an Errand record, its blob's object ID in its ref's tree, never
the ref's tip, which moves with every Errand on the ref and serves only as the basis that ref's write serialization
checks (D1). The reference and ref backends assign it as the write lands.

**Historical content (A2).** Each `history` and `changes` entry carries the exact content for its landed record
version, without requiring the caller to interpret an opaque token or retain a state anchor. A removal carries null
content and a null record version; a non-removal carries both its version and content. Later updates or removals do
not change earlier entries. The same content-bearing entry shape serves both operations; personal history remains
unsupported by the in-repo implementation as D8 states.

**State version.** The store exposes one opaque version naming a saved state of the whole store. `version` returns the
current one, `read` and `list` take one to read as of it, and `changes` reports what changed between two. A record that
attests to code carries the code head it was written against as a field, so "as of this head" is a field match rather
than a Git lookup. The state version is the continuity anchor: once handoff and recovery move onto the contract, a
session's handoff and a compaction seed anchor on it, and restating or recovering reads `changes` since it, so no
history rewrite can strand the anchor.

**Durability.** A write is durable when it returns, and its record version is exact then. The reference and ref
backends also give it a state version as it lands. The in-repo implementation gives a tracked record one when the
branch commit carrying it lands, as today, and gives personal files and Errand records none, since its state version
does not cover them (D8).

**Freshness binds records, never the store.** A caller that needs state unchanged names the records it bound and
checks those — their own record versions, or `changes` since its state version restricted to them — and code evidence
binds its code head, as it does today. The state version serves reads as of a version, `changes`, and continuity
anchors; no caller compares it whole. So no write by another work unit, Errand, or session invalidates a checkout's
evidence or makes it repeat a ceremony; only a change to what that evidence attested does. This is the state-side twin
of evidence applicability for code, where an earlier result stands unless later content overlaps what it covered.

### D3. Writes, batches, provenance, and links

**Version-checked writes.** Every write carries the version it read.

- On a **single-writer kind** — a work unit's meta and task list — an expected version older than the current one is
  `version-conflict`.
- On a **merge kind** — an entry list or prose (D6) — an older expected version is a **stale base**: a backend that
  merges concurrent writes merges from that base with the kind's mechanism and returns the merged version with any
  conflict records it created. A stale base is not a failure. The in-repo implementation never merges a record's
  content; any mismatch there is `version-conflict`, and its writers re-read and re-apply under their lock, as they do
  today. Its transient-identity transaction reconciles the ref's records one by one against the remote, as today, and
  refuses the whole write while any record on the ref changed on both sides or fails to parse (D4, D8).
- A **removal** is a write of absence, the dual of a creation, which expects absence: it carries the record's expected
  version and no content, and a read afterwards is `not-found`, but on the in-repo implementation, where it removes this
  checkout's copy (D8). A kind's writer rule governs it as any write: a create-only kind refuses an update, not a
  removal, and the verb that created a transition record removes it when the transition it records fails, as abandon and
  decompose roll one back today; a write-once record is removed only by the writes its rule names, a conflict record by
  the write that resolves it (D6).

**Batches.** One write may change several records, all or nothing, each checked against its own expected version; a
`version-conflict` names every stale record. Archive, abandon, rename, decompose, and park each change several records
in one verb, and several verbs already stage several files all or nothing today. A backend that cannot apply a batch
atomically refuses it whole, `unsupported`, before writing anything; only the in-repo implementation does, and only
for a batch spanning substrates (D8). The ref backend applies a batch with `git update-ref --stdin` and carries it to
the remote with `git push --atomic` (D12).

**Provenance, never evidence.** Every store write carries provenance. The caller names the verb, the lifecycle action,
and, when the write attests code, the code head; the backend adds, as the write lands, the record's reference, its
owner's UID where the owner has one, and, for a batch, one batch ID that every write in it shares across refs, so
`history` and `changes` show an archive as one change rather than one per ref. A backend over Git renders provenance as
a commit message — a subject naming the verb and the record (`archive storage-contract`) and trailers carrying the rest
— and `history` and `changes` return its fields. No evidence needs provenance as its home. The in-repo implementation
renders none and keeps today's messages: a tracked record's is the commit that carries it, and an Errand record's its
ref commit's, which `history` and `changes` return as they are.

**Links.** Traceability is a store link the CLI captures, never a message convention.

- A task's captures hold its increment's commits — a list, possibly empty, since a decision or research task may produce
  none. A work unit's integration and an Errand's close capture the landing commit.
- **Links are base fields the contract itself defines,** read without a kind's parser: a branch (repository and ref
  name), a change request (repository and number), a landing commit, and task captures, keyed by task ID. Each commit is
  held as its SHA and, where it has one, its patch-id: a merge commit has none, so a landing commit made by merge is
  matched by its SHA alone. They travel beside a work item's primary record as its placement does (D1): a write to that
  record may carry a links value, which replaces them whole, an empty value clearing them, and one carrying no links
  value keeps them.
- `lookup` by commit matches captured SHAs and, only where none matches, the patch-id the caller computes and passes
  with a commit that has one; by ref, branch links. So every backend answers it from stored fields, a rebase that leaves
  a commit's diff alone keeps the link, and ARC's own rewrites remap captures from the rewrite's old-to-new mapping.
- **Reverse lookup** answers from a repository plus a commit or ref to the owning work item, across renames, since
  records key by UID, and from a commit to every task that captured it: `lookup` returns a reference to the work item's
  primary record and the IDs of the tasks whose captures hold the commit, several where one increment closed several
  tasks (D16), and none for a commit no task captured, such as a landing commit. A delivery resolves its plan and member
  from that work item through its own member lookup over its machine-local state (D5); the contract's lookup does not
  reach them.
- The residual, stated: a rewrite outside ARC that changes a commit's diff — a conflict-resolving rebase, squashed
  fixups — loses the per-task link, and a squash loses per-task granularity by its nature; the landing commit keeps
  the work-unit link under any merge strategy.
- Until the flip the in-repo implementation stores no links: its reads and listings carry none, and a write carrying a
  links value refuses `unsupported` (terminal) (D4). It answers reverse lookup with today's derivations: a commit
  resolves to its work unit and every task its `Context:` footer names, through that footer, parsed as delivery's
  attribution parses it (`parseTaskReference` in `lib/commit-check/task-reference.ts`) with a range expanded against the
  work unit's task list (`expandTaskReference` in `lib/delivery/from-branch.ts`), and a ref to its work unit through the
  branch name and to its Errand through the record that names the branch. A commit resolves to an Errand only from the
  flip, when captures begin and an Errand's close captures its landing commit (D15).

### D4. Failures and outcomes

Every failure meets the recovery-complete refusal rule in `DEV-RULES.PROJECT`: it says whether it is terminal or
recoverable, reports the observed condition, and names a remedy that leaves the success path reachable.

**Refusals are values; defects throw.** Every operation resolves to a Zod-defined union discriminated on `status`: `ok`
carrying its result, or `refused` carrying the refusal — the shape `lib/delivery/ports.ts` uses, extended with the
class, condition, and remedy, so a refusal serializes into an `arc` command's JSON output as it stands. A backend never
throws a refusal. It throws only for a defect or an environment failure no caller can act on — a permission error, a
missing Git — as an `ArcError` with a dotted code. What it catches from the code it wraps it classifies by error class
or error code, never by message text; anything it cannot classify it rethrows as an `ArcError` with the original as its
cause, never as a refusal.

**Local operations** — `read`, `list`, `write`, `batch`, `history`, `changes`, and `lookup` — refuse from one closed
vocabulary, the one `lib/delivery/ports.ts` already uses plus `not-found` and `lock-held`:

| Refusal             | Class       | Meaning and remedy                                                                                           |
| ------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| `not-found`         | recoverable | No record has that reference; names the lookup for a name or former name, or `arc.identity` when none is set |
| `version-conflict`  | recoverable | An expected version is stale; names each stale record so the caller re-reads and re-applies                  |
| `record-malformed`  | recoverable | A record fails its kind's parse or validation; names the record and the failing rule                         |
| `identity-mismatch` | recoverable | A stored or written record's own identity disagrees with the reference asked for; names both                 |
| `ambiguous-match`   | recoverable | A lookup matched more than one record; names the candidates                                                  |
| `lock-held`         | recoverable | A process on this machine holds the surface's write lock past the wait; names the lock                       |
| `namespace-corrupt` | terminal    | The store's structure is broken; names the repair                                                            |

The in-repo implementation adds two refusals and one exception, and all three retire at the cutover. Only it produces
`checkout-not-writable` and the exception; every backend whose state lives off the checkout's branch also produces
`unsupported`, for the filter to the records this checkout holds (D1), until that filter retires with it:

- **`checkout-not-writable`** — recoverable. This checkout lacks write authority for the write, and the refusal names
  where it can land. It fires at the write-context preflights in `lib/git/write-context.ts` — `arc plan check`'s
  redirect, the inbox drain's entry check with its move onto a grooming branch under full protection, and park's
  run-context refusal — as today; and on a write to a work unit's meta, companion, or task list where the meta copy a
  read of the work unit returns is not one this checkout holds, as abandon, resume, and rename refuse today where the
  composed index withholds the writable path they check before touching a work unit's files. That second arm checks
  every write to a work unit's records and is new for companions and task lists, which no code refuses today; D8 sets
  out the rule, its exceptions, and where it differs from those verbs' check. A commit on the protected base under full
  protection stays refused by the pre-commit hook and the release wrapper, as today. Grooming, drain, and decomposition
  branches stay valid write contexts.
- **`unsupported`** — the call cannot succeed as it stands and is not retryable unchanged. It is recoverable for a batch
  spanning substrates, a read or `changes` as of a state version for records the version does not cover (D8), a
  work-item listing that names no kind (D8), or that filter on a backend whose state lives off the checkout's branch,
  and names the remedy — sequence the writes, bind per-record versions, list each kind, or `lookup` by the checkout's
  claim or list without the filter. It is terminal for a well-formed call that work after this change serves: a write to
  a kind with no home before the flip, `history` of a personal file, and, on the in-repo implementation, a write that
  carries a links value, moves a work item to another placement, creates a work unit or an Errand's record at
  `completed`, or renames a work item (D8). It names what serves the call until then: nothing for the first two, or for
  links, which the flip begins storing; the lifecycle verbs for a work unit's move, archive for its creation at
  `completed`, and `arc errand close` for an Errand's move or creation at `completed`; and `arc rename` for a work
  unit's rename, while nothing renames an Errand — each verb keeping its code until it is rerouted.
- **A transient-identity write fails as sync does** — `unreachable`, `refused`, or `retries-exhausted`, with sync's
  classes — since it fetches and pushes inside the write (D8). While any record on its ref changed both on this
  machine and on the remote, or any entry there fails to parse, every write to that ref refuses, `version-conflict` or
  `record-malformed`, naming those records rather than the one written. Re-reading does not clear it: the remedy names
  the hand repair — keep the remote's copy and redo the local change through its verb, or rewrite the unreadable
  entry — after which the write succeeds.

**Neither is a failure:**

- **A conflicted entry or record.** A same-entry clash lands as a conflict record (D6), and so does a single-writer
  record that sync finds changed both here and on the remote, as one work unit's meta written on two machines before
  either synced: by D6's rule the version the store holds stays current — the remote's — and the local one is kept in
  the conflict record, and sync goes on. The next verb that depends on the entry or record refuses, naming the conflict
  record, and a resolution names it — keeping the remote's version, or redoing the local change through its verb. Which
  version stands is the owner's call.
- **A stale base** on a merge kind (D3).

**Sync outcomes.** `sync` reports one outcome for each publish it makes, naming the families that publish carried, so a
caller retries the one that failed. With no remote it reports that state once, and with no identity configured it
reports `no-identity` once, a state naming `arc.identity` as the remedy and the families it held back — every
identity-scope family, and on the in-repo implementation the Errand records a person's ref carries until the flip —
while the rest publish; the two are reported independently, so both can appear. Each publish ends `pushed`, `noop`, or
`reconciled`, or fails:

- `retries-exhausted` — recoverable: the next firing point or `arc sync` retries; it carries the retry count and the
  time waited, the contention tripwire's fields (D11);
- `unreachable` — recoverable: network, timeout, or authentication, retried once the remote answers;
- `refused` — terminal: any other host refusal, carrying the server's message, which names what must change before a
  retry can succeed.

No remote — as in local-only or ghost use — no identity, and being offline are states, not failures. Every publish the
in-repo implementation makes — the notes save and push and the Errand push — rides a ref keyed by the identity, so with
no identity its `sync` publishes nothing and reports `no-identity`, naming all three families they carry — personal
surfaces, work items for the Errand records, and claims — which a rerouted `arc sync` checks before any other outcome
and maps onto today's `identity-absent`, as it checks the identity first today. Until the flip the in-repo
implementation's `sync` also reports today's `conflict` and `blocked`, and the notes export's local refusals as they are
— `unpublished-history`, `history-diverged`, `compaction-lineage`, and `proof-unavailable`
(`lib/user-sync/branch-bounded-notes-export.ts`); the notes push's `success` is `pushed`; today's `failed` maps by cause
onto `retries-exhausted`, `unreachable`, or `refused`, and a `failed` with no Git cause is rethrown — the notes lock not
taken within its wait among them, as a save that cannot take it throws today, so a lock held past its wait ends sync
before the Errand push, as a failed save does; and today's `no-remote` splits by the remote's configuration, read before
anything is pushed, never by Git's message: a remote that does not exist is a state, and one that is configured but
cannot be read is `unreachable`. Today's `no-local-notes`, and a save that finds no eligible file — nothing local to
send — end `noop`; a save whose note fails its readback is a failure, which the backend rethrows, as `arc sync` reports
it failed. The paired push's `cancelled` is the person declining `arc sync`'s notes-push prompt, which contract `sync`
never shows, and its `failed-nontty-conflict` and `ok-recovered` have no producer (`commands/user/types.ts`); contract
`sync` reports none of the three, and all four notes-only outcomes retire with notes.

**Surfacing.** Store and sync failures surface as orientation lines at session boundaries. Sessions never stall on the
store, and a sync failure never blocks a local write — except an in-repo transient-identity write, which publishes
inside the write until the cutover (D8).

**Listing outcomes.** Every family's `list` keeps what the Errand identity reader (`lib/errand/identity-snapshot.ts`)
keeps today:

- **Absent, unreadable, and complete are distinct** — today's `absent`, `error` (the ref's tip or tree cannot be read),
  and `complete` — so a missing family never reads as a broken one or the reverse.
- **A complete listing carries every readable record,** a diagnostic for each entry it could not read — malformed,
  oversized, unreadable, an unknown format version, or a key that disagrees with its record — and whether it missed
  any.
- **A listing carries a state version only when it is taken as of one** — a state version the caller asked for, or the
  current one on a backend whose live view is a saved state, as the reference and ref backends' is. Its mutation basis
  is each record's own version: a write built on it compare-and-swaps each record it writes against that record's
  version in the listing, never the listing's whole version. The in-repo implementation's live listings carry none,
  since the working tree they read is no saved state (D8).
- **Deciding consumers refuse on incomplete evidence** — review-vehicle selection never authorizes review from it —
  while browsing consumers show what they have with the diagnostics. A record unrelated to the current work unit never
  blocks session-init.

### D5. The record model

**File-as-record.** The file is the record: its fields are parsed from it by its kind's parser and validated at write,
and rendering exists only for derived views. Every reader asks the contract for a record's fields through its kind's
parser, never by path or placement, so file formats never change at the flip and a later structured records engine
changes only what sits behind each parser. A kind's parser is registered by the change that reroutes its family; this
change registers the ones its own pieces need — the meta parser behind the lifecycle index (D9), and the Errand record's
existing schema (`lib/errand/identity-record.ts`) behind the in-repo listing's diagnostics. A kind with no parser lists
its records with their content and versions but no fields. Since the parser gives a listing its fields and a write its
validation, `read` returns a record's bytes whether or not its kind's parser accepts them; a record the parser rejects
lists as a diagnostic naming it.

**Placement is a record field, and directory layout a projection of it.** Lifecycle location becomes a field of every
work item's record; `backlog/`, `active/`, and `completed/` are where the projection places a work unit. A placement is
`active`; `backlog` with its commitment, planned or provisional; or `completed` with its archive quarter, at project
scope. A cohort member's folder in the backlog comes from its `Cohort` field, never from its placement: the layout
builds it from that field, as the verbs that place a stub build it today (`projectBacklogDestination` in
`lib/work-unit/verbs/promote-demote.ts`), so membership has one source. A completed work unit's archive sequence is
output, never input: `read` and `list` give it in the placement they return, the store assigns it as the work unit joins
its quarter (D10), and a write names the quarter alone. An Errand is never in the backlog, and its `completed` placement
has no sequence, since a closed Errand's archive folder is named for its branch (D10). A work item's primary record
carries its placement — a work unit's meta, an Errand's record — and its other kinds take it from their work item. The
contract carries it beside the record's content (D1), and its schema sits in the contract core over kernel types. Until
the flip the in-repo implementation keeps directory placement as the source and derives the field from it, the sequence
included, as the lifecycle index does today: it creates a work unit at its placement's path, a backlog stub in the
folder its `Cohort` field names, and refuses a write that creates one at `completed` or moves one, which archive and the
lifecycle verbs keep doing until they are rerouted (D4). An Errand record on today's transient-identity ref is always in
flight, since close removes it, so its placement is `active`, and a write placing one at `completed` refuses (D4).

**Two levels.**

- A **family** is the storage grouping: its scope (project, or one identity across that person's machines), its ref
  placement (which may be a subtree of another family's ref), retention, sync, lifecycle, and its tracked-versus-stored
  assignment under each profile.
- A **kind** within a family carries its parser, format version, writer rule, merge mechanism (D6), and projected path;
  an entry list also carries its entry shape and the sections that hold its entries, which entry merge takes from it.
  Projected paths come from the layout resolver (`resolveArcPath` in `lib/layout/projection.ts`), the one layout
  authority.

The split is forced by the records themselves: a work unit is one ref with one lifecycle, yet its meta and task list
take a different writer rule from its prose, and a backlog stub is groomed by anyone while an in-flight or parked work
unit is not (D13). The registry commits to each family's storage properties and each kind's mechanism, never to a
field schema: each family's field schema is set by the change that builds its parser.

**The families.** This change lands the registry as data under `lib/store/`, and the ref layout (D10), moving state
between backends, and the conformance suite all derive from it.

| Scope    | Family                           | Kinds                                                                                                                                                                                                 |
| -------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| project  | work items                       | a work unit's meta and task list, and an Errand's record (machine records, three kinds); draft, spec, notes, and other companions (prose); an Errand's description and the inbound list (entry lists) |
| project  | cohorts                          | cohort documents (prose)                                                                                                                                                                              |
| project  | project inbox                    | `ATOMIC-INBOX` (entry list)                                                                                                                                                                           |
| project  | delivery and review records      | Candidate records, integration boundaries, durable review facts — evidence, outcomes, and termini — and adversarial-pass records (machine records written only by verbs)                              |
| project  | project identity and counters    | the project ID and record-number counters (compare-and-swap claims)                                                                                                                                   |
| project  | lineage                          | terminal transition records, keyed by the UID of an origin no longer live                                                                                                                             |
| identity | personal surfaces                | `USER-INBOX` and `WORKING-MEMORY` (entry lists), personal documents (prose), and the Errand queue (entry references)                                                                                  |
| identity | grooming and housekeeping claims | grooming-set and housekeeping-sweep records (machine records)                                                                                                                                         |

**Names are roles, never presentation.** Families, kinds, and the contract's identifiers name what a record is to ARC,
never what a person sees it called. A kind is keyed by its family and its role, so a role that recurs is one kind in
each family that holds it, under the role's one name: the inbox at project and identity scope (today's `ATOMIC-INBOX`
and `USER-INBOX`), conflict records, and routing receipts. The status view recurs at both scopes too (`ROADMAP` and
`STATUS.USER`, derived and never stored), and so does the vector (reserved). Filenames, document titles, and command
names are presentation, mapped from a kind and its scope in one place — the layout resolver, for paths — so renaming a
surface edits that mapping and no caller. Where this spec names a file, it names today's file.

**Work items.** Work units and Errands are two types of one family. Every work item has the same base — its identity,
owner, type, lifecycle location (backlog, in flight, or completed), origin, and links: branch, change request, landing
commit, and task captures. Everything that spans types reads only the base: the ref layout, slug uniqueness, `lookup`
and checkout claims, archive and history movement, sync, and the delivery and review records that ride a work item's
ref. A type adds the rest — its companions, its writer rules, and its own lifecycle states, which refine the base's
location and are never merged into one machine. Promotion is a field write on one record: the type changes, and the
UID, links, and history stay; naming the work unit differently is a rename in the same verb, and its branch is a new
branch link beside the Errand's. The base's exact field schema is set with its parser, except the links (D3) and the
placement the contract defines; a further type would be one more type over the same base, so nothing that spans types
changes. How an external tracker's items compose with work items is left to that design.

- Grooming and housekeeping claims share today's transient-identity ref, but each claims a sweep rather than landing
  work: both stay at identity scope, and their branches retire at the flip (D15).
- An Errand's one companion is its description, an entry list: the entry it started from, or one minted at open from the
  text it was opened with — that text, which today's record keeps as `intent`, as its title, with a new `_Id:_` and
  `_Created:_` — and any entry routed to it since (D11). It stays with the Errand from start to close and through
  promotion (D11, D13).
- A partial-protection Errand is not a work item: it is a direct commit on the base branch with no branch, lifecycle,
  or record, as today.

- Every work-unit kind spans the whole lifecycle, `completed/` included, and a work unit owns its companions by
  folder, not by filename (D13).
- **Session context is a section of the meta** from the flip: free prose the handoff writes for whoever resumes the
  work unit next — the context and remaining work today's `SESSION-NOTES.md` carries — beside a field holding the state
  version at handoff, continuity's anchor (D2). The meta's parser keeps the section as prose, never as fields, and
  archive clears it, so `completed/` keeps the record without the last handoff's narrative, which `history` still
  reads. Handing a work unit to another person is a write of its owner field alone.
- A rename is not terminal: the work item keeps its UID and records its former slugs. Decomposition and abandonment,
  the terminal transitions, write lineage, which teardown reads as the retirement receipt. Today's rename also writes a
  transition record (`lib/work-unit/transition-record.ts`), through which the in-repo implementation resolves a former
  slug.
- Reserved and registered with no kinds yet: `VECTOR.PROJECT` at project scope; `VECTOR.USER` and the per-identity
  user configuration at identity scope.
- **Stored with the families,** so moving state and the conformance suite carry them: conflict records, a kind of every
  unreserved family, since a merge or a sync can conflict in any (D4, D6); routing receipts, a kind of both inbox
  families (D11); and each record's format version, which every read returns and every write records.

**Durable review facts are stored at project scope; review working state stays machine-local.** Evidence, outcomes,
and termini must survive a change of machine, so they become records of the delivery and review family when review
state is rerouted. The review gate's operations, locks, materializations, and quarantine stay under
`.git/arc/review-gate/`. Moving state onto the ref store maps the review gate's repository ID onto the project ID, so
receipts keep their key.

**Adversarial-pass results are review records,** one per pass on the work item's own ref, never a section or companion
of the artifact reviewed: the artifact stays the latest complete version, and each record describes the versions it
reviewed. A pass shares the review gate's record shapes — its disposition set, approval, rubric binding, and
pass-to-pass lineage — never its operation machinery, and its target is the stored artifact versions it reviewed, plus
the code head when it reviewed code, as the criteria passes at verification and in the task loop review a diff and its
tree (D2); and it gates nothing: it creates no lane progress, Candidate, or receipt. Each record holds the activity and
the artifact versions reviewed; the rubric's identity; the complete finding and disposition set with its approval;
`Pass N of M`, any over-cap approval, and the stop reason; and the next-pass authorization, which launching that pass
consumes and which withdrawal, supersession, or a changed artifact, activity, or pass binding invalidates. The
refinements between passes are the artifacts' history from one reviewed version to the next, derived by `history`, never
written. The records are written only by verbs and never projected: `arc` renders them, and composes a later pass's
prior findings from them, as amending the design after activation needs. **Recording a pass is one verb call** at the
disposition approval, whose input is the evaluator's report in the adversarial-review method's shape plus one
disposition and account per finding: the CLI derives the artifact versions, pass number, and lineage itself, publishes
its input schema, and refuses malformed input naming the expected shape, so no session hand-builds an identifier, writes
a request file, or reads source to record a pass, and recording runs no operation lock or materialization. Their field
schema is set with review state's parser, within that bound, and they take effect at the flip. Until then a pass's
results are kept in `ADVERSARIAL-PASSES.md` in the person's per-work-unit workspace, which lives from start until the
work unit leaves active state: parking, abandoning, decomposing, or archiving it closes the workspace and drops the file
with `SESSION-NOTES.md`, a resume restoring only what the last notes snapshot holds; and a stub groomed before start has
no workspace, so its passes have no home before the flip.

**Not families:**

- **Machine-local state** — a projection property, not a family: a local-only path set the projection and every backend
  enforce, under one invariant: machine-scoped state never round-trips through a store shared across machines. The set
  covers all of `.arc/user/<identity>/.internal/` — the compaction seed, nudge markers, the release audit log, the
  setup marker, load backups, session locus records, whose leases and process anchors would read as live foreign
  occupancy on another machine, a session's request and message drafts, notes sync state until it retires with notes,
  and, from the flip, integration checkpoint records keyed by work-unit UID, which until then sit under each
  per-work-unit workspace's own `.internal/` — and, in the common Git directory,
  `.notes.lock`, `.machine-id`, and everything under `.git/arc/`: the review gate's working state, delivery's plans,
  state, authoring, gates, and resolutions, transient claims, and grooming and decomposition worktrees. The registry
  records the set; the in-repo implementation keeps today's boundary, two dot-prefix rules — the classifier's, on a
  path's first segment (`lib/user-sync/classifier.ts`), and the sync walk's, on a dot-named segment at any depth
  (`lib/git/user-sync.ts`), which keeps a workspace's `.internal/` unsynced. These stay plain files at their paths: no
  backend stores them, and the projection neither persists nor refreshes them.
- **Derived views**, never stored: ROADMAP, `STATUS.USER`, the archive index, and any query cache.
- **Tracked machinery and constitutional documents** under the standard profile (below).

**Personal files.** Everything under `.arc/user/<identity>/` except the machine-local set and `STATUS.USER`, a derived
view, is stored and synced. From the flip the identity's root holds only ARC's surfaces — `USER-INBOX`,
`WORKING-MEMORY`, `STATUS.USER`, `.internal/`, and `scratch/` — and persist refuses any other file there, keeping the
edit and naming `scratch/`, as it refuses a file at `active/`'s top level (D13).

- **`scratch/`** holds the person's own documents, which ARC never reads: anything goes, and nothing outside
  `scratch/work-unit/` is ever touched.
- **`scratch/work-unit/<slug>/`** is per-work-unit scratch. The projection creates the folder for the checkout's own
  work unit, empty, and ARC never reads it. Session start reconciles the person's folders there through `lookup`: a
  folder whose work unit was renamed follows its current slug; one whose work unit has ended is removed, reported, and
  recoverable from the personal ref's history; and a name that resolves to no work unit is left and reported. No
  lifecycle verb touches scratch.
- **The per-work-unit personal workspace,** today's `.arc/user/<identity>/<work-unit>/`, retires at the flip: session
  context moves into the meta and everything else into scratch, so a handover needs no other person's state. Until the
  flip the workspace stays as today, with `SESSION-NOTES.md` in it, and scratch has no home: today's classifier reads
  every subdirectory as a workspace, so personal subdirectories such as `archive/` and `drafts/` are never saved. The
  move onto the ref store puts each file in its place (D14). Until then `SESSION-NOTES.md` is an interim personal kind,
  keyed by its work unit at the `session-notes` address today's layout has, which retires at the flip.

**Format version.** Every record carries a format version, a positive integer that orders its kind's formats, kept by
the store beside the record and never in the file's content, so projected files stay plain Markdown. A write records its
kind's current format version from the registry; no caller names one. It is per record, not per family, so one newer
record never makes an older build refuse the rest. A record newer than the build is an unknown-version diagnostic in a
listing and, when read directly, `record-malformed` naming the cause and the remedy — merge base or rebuild. A record
unrelated to the current work unit never blocks session-init. Until the ref backend writes format versions, every record
reads as version 1; a record the in-repo implementation's build cannot parse is an unreadable entry with a diagnostic
(D4).

**Profiles.** Two named install profiles, recorded per family as layout data in the registry:

- **Standard** — every state family stored; authored design reaching tracked files only through the export (D18); and
  project machinery, ARC core, and the constitutional documents tracked.
- **Ghost** — the same state families; project machinery and the constitutional documents become two project-scope
  families projected at their familiar paths; ARC core projects read-only from the installed package; the export is
  pinned to `none`. The registry records both families now, tracked under standard and stored under ghost; their ref
  placement comes with ghost mode (D19).

Readers load machinery and constitutional documents by `.arc/` path under both, so nothing above the contract and the
projection asks which profile is active. The profile is a fact of the install, read by looking — standard when ARC's
configuration is tracked in the repository, ghost when it lives in the store behind a per-machine pointer — so no
configuration key can disagree with the repository. Only the contract, the projection, init, and the commit policy
consult it (D19).

### D6. The concurrency library

Concurrency is a requirement, not a risk: several sessions per identity are the normal case, disjoint edits merge
without manual action, conflicts refuse with a typed remedy, and nothing is lost silently. The library is pure
functions with no I/O — entry merge, three-way line merge, the typed conflict record, ID stamping, and rank keys —
consumed by the reference backend now and by the ref backend's push loop and the projection's write-back later, so
neither builds it for the other.

**Mechanism per kind.**

| Kind                                                                                       | Mechanism                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a work unit's meta and task list                                                           | single-writer: written only from the work unit's own checkout, and starting a work unit is a compare-and-swap write of its meta, so two starts of one stub conflict; a stale expected version conflicts                                                                                                                                      |
| work-item prose — a work unit's draft, spec, notes, and companions                         | compare-and-swap with three-way line merge, since the owner may write it from other checkouts (D13)                                                                                                                                                                                                                                          |
| inboxes, `WORKING-MEMORY`, the inbound list, an Errand's description                       | entry merge                                                                                                                                                                                                                                                                                                                                  |
| cohort documents and personal documents                                                    | three-way line merge                                                                                                                                                                                                                                                                                                                         |
| the ghost profile's machinery and constitutional documents (D5)                            | three-way line merge                                                                                                                                                                                                                                                                                                                         |
| backlog order                                                                              | a fractional-index rank field on each stub, sorted by `(rank, stub UID)`; the compare-and-swap loser re-keys after the winner                                                                                                                                                                                                                |
| the Errand queue                                                                           | entry merge keyed by entry ID, each member carrying a rank key that orders it as backlog order is ordered: setting the queue whole is one write that adds, removes, and re-ranks members, so it merges with an append or a drop made elsewhere, and a member re-ranked differently on both sides is a same-entry clash, as in any entry list |
| record-number counters                                                                     | compare-and-swap claims; a hot counter reserves a block per process                                                                                                                                                                                                                                                                          |
| an Errand's record, delivery and review records, lineage, grooming and housekeeping claims | single-writer machine records written only by verbs                                                                                                                                                                                                                                                                                          |
| conflict records and routing receipts                                                      | write-once: each is written by a merge, by sync, or by the verb that moves an entry, and a conflict record closes only by a write that names it                                                                                                                                                                                              |

**Entry merge.**

- **Keyed on a parsed `_Id:_` field,** stamped at capture in the grammar `_Created:_` uses: eight hex characters,
  re-drawn on the rare clash within the file. The bold title stays the human handle; keyed on the title, a retitle
  would read as a delete plus an insert, which a concurrent edit elsewhere turns into a conflict or a resurrected
  entry. An entry without an ID, such as one typed by hand, gets one at its first persist.
- **Union is limited to insertions.** Disjoint insertions merge in any order: an inserted entry lands after the nearest
  entry preceding it on its own side, and entries both sides insert at one point order by ID.
- **An entry's section is part of the entry,** so moving it between sections is an edit. The bytes outside entries — a
  file's opening, section headings, comments — merge as prose, by three-way line merge.
- **A same-entry clash** — two differing edits to one entry — lands as a conflict record keeping both sides. Lists
  conflict per whole entry, with no line merge inside an entry: line merge inside entries was silently wrong in 0.2–2.2%
  of measured pairs.
- **A removal racing an edit is not a clash; the edit survives.** A removal takes out only the version of the entry it
  observed, as in an observed-remove set where add wins: an edit the removal never saw was concurrent, not later.
  Recency never decides anything.

**Three-way line merge** merges prose from the base version both writers started from; hunks both sides changed
differently land as a conflict record.

**The conflict record** is typed and stored with its family. It names the record it belongs to by reference and where
within it the clash lies: the entry's ID, the hunk's line range in the base for prose, or the whole record, for a
single-writer record changed on both sides; keeps both sides as data, each labelled by its machine or session and time;
and names its base. A conflict is resolved only by a write that names it, and `read` returns the IDs of a record's open
conflict records beside its content (D1).

**At a clash the store's version stays current.** The version the store already holds keeps its place in the merged
result, and the incoming side is kept in the conflict record: the write that landed first, against a later write from a
stale base; the remote's version, against this machine's, in sync (D4, D12); and the store's version, against a
projected file's edit, at write-back (D13). One rule serves every merge, so the library takes its three inputs by role —
base, current, and incoming — and which side a clash keeps current follows from the roles alone.

**Rank keys** generate a key at any position, so a reorder writes one stub. Where the stubs on both sides of the
position share a rank, no single key sorts between them, so the moved stub and the tied stubs above it take fresh keys
between the tie's rank and the next rank up, in one batch.

**What the library is built from.** Entry merge and the conflict record are ARC's own: no library models them.
Three-way line merge wraps `node-diff3`'s `diff3Merge`, pinned to an exact version, behind one module that passes it
arrays of lines and exposes none of its types; diff alignment and conflict grouping are judgments no property test
fully pins, so proven code earns its place there. The wrapper's tests cover empty sides, a missing final newline, edits
that touch without overlapping, and identical edits on both sides. Rank keys are ARC's own code, adapted from the
public-domain `fractional-indexing` algorithm with its default base-62 alphabet, since their correctness is fully
checked by a property — a key sorts strictly between its neighbours under plain string comparison — and a test pins the
stored key format. Equal keys, which concurrent inserts produce, never reach the key arithmetic: a tie is re-keyed as
above. Property tests use `fast-check`, a dev dependency.

### D7. The reference backend and the conformance suite

**The reference backend** is an in-memory implementation of the whole contract with no Git at all. It is test-only and
never shipped: it lives with the test support code, the package's build excludes it, and nothing under `src/` imports
it. It serves every family and kind, merges concurrent writes through the library by each kind's mechanism, produces
version conflicts and stale bases on demand, and defines the state version's semantics apart from Git: a monotonic,
opaque value that advances with each landed write. Its capability report answers yes (D1).

**The conformance suite** is one suite every backend passes, parameterized by a fixture per backend that declares which
families it serves, whether it merges concurrent writes, the answer its capability report gives, whether its live
listings carry a state version, how a write reaches a state version, and how a second contract instance opens the same
store — for the reference backend, by sharing its in-memory store — and it runs with an identity configured or none, so
the identity-scope refusals and sync's `no-identity` are produced through it. The fixture also declares, per family, the
items and the named assertions within an item its backend cannot produce there, and the refusals it cannot produce in
any family it serves, each with its reason, and the suite reports each exclusion by name; its fault hooks plant bad
entries, hold a write lock, and make the remote down, contended, or refusing, so every listing outcome and refusal is
produced through the fixture. The in-repo fixture commits its tracked records as a ceremony would before it asserts
reads as of a version. It runs against the in-repo implementation and the reference backend here; the ref and local-only
backends join it when built, over both store layouts (D10). The reference backend passing it is the substitutability
test run rather than argued: the contract is implementable without Git, and Git is the storage engine, never the schema.

The suite covers, for every backend and every family its fixture serves:

1. read, write, removal, and list round trips with references intact, a listing by owner, and a work item's placement, a
   completed work unit's assigned sequence included, and its links;
2. `version-conflict` on a stale expected version, on every backend — for the in-repo implementation, produced by
   racing writers;
3. stale bases on merge kinds, on backends that merge: the merged version returned, a same-entry clash as a conflict
   record naming its entry, with the store's version kept current and the conflict among the record's open conflicts, a
   removal racing an edit leaving the edit, and disjoint insertions merged;
4. batches all or nothing, a `version-conflict` naming every stale record;
5. a batch spanning substrates refused `unsupported` before anything is written (in-repo);
6. freshness: a write to an unrelated record changes no bound check;
7. the current state version from `version`, reads and lists as of a state version, a listing carrying a state version
   only when taken as of one, and `changes` between two;
8. reads as of a version for records outside it refused `unsupported` (in-repo);
9. listing outcomes: absent, unreadable, and complete kept distinct, an identity-scope family listing absent with no
   identity configured, every diagnostic kind, whether any entry was missed, and the per-record mutation basis;
10. format versions: an unknown newer version as a listing diagnostic and a read refusal naming the remedy;
11. `history` order with each write's provenance;
12. `lookup` by slug, former slug, lineage origin, checkout claim, and a repository plus a commit or ref, a commit
    resolving to every task that captured it, with `not-found` and `ambiguous-match`;
13. durability: a write is readable from a fresh contract instance over the same store when the write returns;
14. every refusal carrying its class, observed condition, and remedy;
15. the capability report;
16. `sync` against a remote the fixture provides: `pushed`, `noop`, and `reconciled`; each failure class with its
    fields, `retries-exhausted` carrying its retry count and time waited; no remote and no identity as states, not
    failures, `no-identity` naming the families held back, every identity-scope family among them, while project-scope
    families publish; and, on backends that merge, a single-writer record changed on both sides, the remote's version
    kept current and the local one in a conflict record (D4).

For the in-repo fixture, shared sync assertions exclude repeated-publish idempotency, same-key transient convergence,
and personal working-file refresh (A1). Today's notes save and Errand push can report `pushed` again with unchanged
record bytes; unequal same-key Errand entries conflict under its two-way merge; and notes reconciliation updates the
notes ref without loading working files. Named exceptions retain those producer behaviors, verified directly beside
disjoint-entry reconciliation and the merged remote notes bytes.

### D8. The in-repo implementation

The first backend, over today's three substrates. It exists so every rerouting of callers can start on the landed
contract without waiting for the ref store, and it retires at the cutover.

**Every family, each where it lives today.**

- **Tracked records** are read and listed through `resolveArcPath` and the lifecycle index, with the records under
  `.arc/system/.internal/` joining the layout, and ride the branch's push. Their writes take one machine-local lock per
  checkout, in the checkout's own Git directory, through the advisory lock the notes and worktree-operation locks use
  (`lib/advisory-lock.ts`), around each digest check and write and across a batch; the Candidate and boundary stores'
  per-file locks are taken inside it, and no lock held across a whole command is taken while it is held. Today no other
  tracked writer locks, so the lock is new. A kind today's layout has no address for is found as today's code finds it:
  other companions are the `<prefix>-<slug>.md` files beside the work unit's meta, each named by its prefix
  (`artifactMatcher` in `lib/work-unit/mutators/relocate-artifacts.ts`), less the same-name cohort document its callers
  exclude, and a paired spec's halves `spec-prd` and `spec-rfc`, at `spec-<slug>-prd.md` and `spec-<slug>-rfc.md`, which
  the matcher misses (`lib/work-unit/planning-artifact-tuple.ts`). Lineage's transition records stay create-only, so a
  second creation is `version-conflict` naming the existing record, which the caller reads, and the verb that created
  one removes it when its transition fails, as today's rollback does
  (`lib/work-unit/terminal-transition-record-writer.ts`). A work unit's placement — its location, with its commitment or
  its quarter and sequence — is its selected copy's directory, read through the layout resolver's reverse
  (`identifyWorkUnitArtifactPath`), but for a parked work unit — one whose copy in `backlog/planned/` is `Active`,
  today's parked pointer — which keeps its backlog placement, that copy's directory, as today's composition places it in
  the backlog (D13). A meta at a path that reverse cannot place — flat in `backlog/planned/` or `completed/`, or under
  an uppercase quarter, which only test fixtures hold — has no placement and lists as a diagnostic naming its file,
  where today's index places it by its tier. A write creates a work unit where its placement puts it, a backlog stub in
  the folder its meta's `Cohort` field names — none where the field is empty, `[none]`, or `—`, as the lifecycle index
  reads it for `projectBacklogDestination` today — read through the field projection both meta parsers share
  (`parseMetaProjectionRecord` in `lib/active/meta-reader.ts`), so a hand-written value in another field never stops it;
  a meta that projection cannot read, or a `Cohort` value the layout cannot place, refuses `record-malformed` naming the
  field, as `projectBacklogDestination` refuses such a value today (D5). It refuses `unsupported` (terminal) to create a
  work unit at `completed`, which archive does with its sequence, to move one, which the lifecycle verbs keep doing, to
  rename a work item, which takes a UID this implementation does not have, or to carry a links value, since it stores
  none (D2, D3, D4).
- **Personal files** are read and written where they live, each file one record written whole. Writes take the machine
  lock today's notes lock provides (`lib/user-sync/notes-lock.ts`), check the whole-file digest, and replace the file
  atomically (`atomicWriteFile` in `lib/fs.ts`), as the inbox mutation does today; reads take no lock, as today's
  readers take none, so a session-boundary read never waits on a notes push holding the lock across a fetch. The
  personal-file writers — the inbox writer, `arc user add`, `arc init`, `arc join`, the workspace open seed, and
  workspace close — are served by it when they are rerouted onto the contract, workspace close removing the workspace's
  personal files through it and then, itself, what no backend stores — its `.internal/` and any other dot-named entry
  the in-repo boundary keeps unsynced (D5) — and the emptied directory. `SESSION-NOTES.md` is a personal file here, in
  this identity's per-work-unit workspace, as today. Each file is read from the root today's code reads it from
  (`lib/user-surfaces.ts`): a per-work-unit workspace from the checkout's own copy, and the identity's top-level files
  from the primary worktree's; a personal document is keyed by its path there.
- **Errand records and grooming and housekeeping claims** stay on each person's transient-identity ref and keep today's
  code: reads through the tip, tree, and blob acquisition in `lib/errand/identity-snapshot.ts` over this person's local
  ref, keeping the absent, `error`, and complete outcomes and each record's blob object ID, and every write through the
  transaction in `lib/errand/identity-transaction.ts`. Reads never fetch: the write transaction and `sync` do, and a
  verb confirms from the local store (D1). With a remote set, that transaction fetches the remote's ref, reconciles each
  record against the common base, applies the write, commits the tree with compare-and-swap on the local tip
  (`lib/git/ref-tree.ts`), and pushes, retrying a lost race; without one, it commits locally. A write's content is
  decoded first, by today's decoder with the key the write names (`deserializeTransientIdentityRecord`,
  `lib/errand/identity-record.ts`), since today's writers write only records its schema accepts: content it finds
  malformed or of another content version refuses `record-malformed`, and content naming another slug refuses
  `identity-mismatch`, naming both, so a write never plants an entry that would refuse every later write to the ref. The
  caller's expected record version is checked inside the transaction against the reconciled records, so a stale one is
  `version-conflict`; the transaction still lands the reconciled records without the caller's change, so a change made
  only on the remote reaches this machine's ref and a re-read sees it. A record on the ref that changed both here and on
  the remote, or an entry there that fails to parse, refuses every write to the ref, whichever record it names, as today
  (D4). A read of a key whose entry names another slug — today's `key-mismatch` diagnostic — refuses
  `identity-mismatch`, naming both; a read of an entry the snapshot finds malformed or of an unknown version returns its
  bytes, read by its blob object ID (D5), and a listing gives today's `unknown-version`, which names the record's own
  content version rather than its format version (D5), as a `malformed` diagnostic naming that version; one over the
  snapshot's size cap refuses `record-malformed`, naming its size and the cap; and one whose blob cannot be read throws,
  as D4 throws what it cannot classify. Each Errand record there is in flight, since close removes it, so its placement
  is `active`; a grooming or housekeeping claim is no work item and has none. A write placing an Errand record at
  `completed`, by creating it there or moving it, renaming one, or carrying a links value refuses `unsupported`
  (terminal) (D3, D4). The write takes no lock of its own, and Git's ref lock refuses a concurrent update once its brief
  retry runs out (`core.filesRefLockTimeout`, 100 ms by default), so a write that meets it throws, as D4 throws what it
  cannot classify.
- **The work-item family is listed one kind at a time:** a work unit's meta from the tracked tree, an Errand's record
  from this person's ref. A listing that names no kind refuses `unsupported`, recoverable by listing each kind, and the
  lifecycle index lists the meta only, so the state of an Errand ref never reaches it.
- **`history`** serves tracked records through the branch's commits and Errand records through their ref's commits,
  and refuses `unsupported` for a personal file, since no caller reads one's history before the flip.
- **Kinds with no home in today's substrates** — the inbound list, conflict records, routing receipts, an Errand's
  description, the Errand queue, durable review facts, adversarial-pass records, project identity and counters, the
  reserved families, and the ghost profile's two families, which the standard profile keeps as tracked machinery outside
  the store (D5) — list as `absent` and refuse writes `unsupported`, naming that the kind has no home before the flip.
  Until then an Errand's goal stays in its record's `intent` and its origin entry, each person's queue in their
  execute-bound marks, and a pass's results in `ADVERSARIAL-PASSES.md` (D5).

**It mirrors today, commits included, and makes no commit on the checkout's branch.** A write through the contract is
today's write: for a tracked record, the file where it lives; for a personal file, a locked write; for a
transient-identity record, today's transaction on its person's ref. Until the flip no meta, companion, task list, or
personal file is validated by a parser at write, since no writer of those validates today: a write a parser would reject
lands, as a write to a flat-active meta its parser rejects does (below). A Candidate, boundary, or transition record is
written through today's store (`lib/work-unit/candidate-record-store.ts`, `submission-boundary-store.ts`,
`transition-record-store.ts`). The backend first parses the content as JSON and validates it with the parser that store
applies — `CandidateManagedRecordV1Schema`, `parseIntegrationBoundaryLocus`, which also accepts and upgrades a legacy
boundary shape, or `TransitionRecordSchema` — before any version check, so content that fails refuses `record-malformed`
naming the failing rule whatever version it expects. Content whose own key — a Candidate record's
`attestation.workUnit`, a boundary's `workUnit`, a transition record's `origin` — names another record than the write
does refuses `identity-mismatch`, naming both, since two of the stores take the file's path from that key and the third
never checks it. The store then writes the record's canonical form inside the tracked-write lock — the Candidate and
boundary stores under their own per-file locks, the transition store by exclusive create — and the write's version is
the digest of the bytes the store's own serializer gives for that record, computed rather than re-read, which is the
content's digest when the caller serializes as today's writer does. Anything the store throws after that comes from the
stored record or the version: a stale version is `version-conflict`, and a stored record the store's own read rejects —
malformed, or naming another work unit — throws, as that store throws today (D4). A read of a stored Candidate,
boundary, or transition record whose own key names another record refuses `identity-mismatch`, naming both, and a
listing gives it as a `key-mismatch` diagnostic, where today's store read throws. A removal is today's deletion there —
the file, or the record's entry on the ref, as abandon, resume, workspace close, and Errand close delete today — and
every substrate serves it, since it changes no placement, unlike a move, which relocates a work item's files and stays
the lifecycle verbs' until they are rerouted. A tracked removal deletes this checkout's copy only: a later read composes
as any read with no tree copy does, returning another branch's copy where one is selected, as a resumed work unit's read
returns its branch's meta once its pointer is gone — on a work unit's own branch, which the composition reads as it
reads every branch but base, the copy committed at `HEAD` until the removal is committed — and the listing of the
records this checkout holds no longer gives it, which is how a verb confirms its removal. Staging belongs to today's
commit protocol, not to the store: a contract write leaves the index as it found it, and each verb keeps the `git add`
it runs today — some stage their writes, others leave them to a ceremony's commit step — so rerouting changes no index
state. Every branch commit ARC makes stays as it is until the flip — each ceremony's commit step with its class tag and
routing, the commits `arc start` and `arc rename` make themselves, the verification commit carrying `arc attest`'s
records, the task list riding its code commit, and ROADMAP rendered and staged by the verbs that stage it today. No verb
gains a commit: a ceremony's save step is its own commit, behind today's gates. The write-then-`git add` protocol and
the next actions that require a commit (`commit-selection`, `commit-boundary`, `candidate-publication-commit-required`)
stay as they are.

**Reads return the working tree; the state version names saved state.** Reads of this checkout's records return the
working tree where it holds the selected copy or a copy agreeing with it — its slug, `State`, `Owner`, `Priority`,
`Cohort`, `Depends On`, and placement matching — placement standing for the location and parked scheduling it compares,
both following from directory and `State` — the fields today's composition compares to grant a writable path
(`recordsAgree` in `lib/work-unit/composed-lifecycle-index.ts`), while its progress fields may differ. A parked work
unit's backlog pointer is the one such copy whose bytes differ from the selected copy's, both copies deriving its
backlog placement alike: a read returns the pointer and its version, as resume and abandon read it today, while listings
give the selected copy's fields, as `arc status` shows them, with the pointer's version. A listed record's version is
always the one its read returns, so a write built on a listing checks the copy it replaces. A meta that sits flat in
`active/` is this checkout's record of its work unit whether or not its parser accepts it: a read returns that file and
consults no other branch, so a read of this checkout's own work unit spawns no Git process; a write targets it; and both
listings give it in place of any other copy of its slug. That extends today's selection, which takes an `active` copy
over every other (`selectRecordCandidate` in `lib/status/project-view.ts`) once the composition's reader has accepted
it, to a copy that reader rejects; beside another copy of its slug, which no ARC writer produces, today's composition
drops it and selects the other. Every other read composes as records on other branches do, below. `list`'s filter for
the records this checkout holds (D1) reads the working tree with no cross-branch lookup, by the files the lifecycle walk
finds (`collectLifecycleMetaFiles` in `lib/work-unit/lifecycle-index.ts`) over the locations it names — `active/` read
flat, regular files only — keeping, of a slug found in more than one, the flat-active file, else the copy
`compareLifecycleSources` prefers among those the lifecycle index can place, else the preferred. Each file kept lists as
a record or a diagnostic whatever its `State`, since dropping a meta its `State` places nowhere is the lifecycle index's
step, not the listing's, and `readActiveMetaCandidates` keeps such a meta today. The composed index walks the same files
and ranks a slug's copies the same way, so this checkout's copy under that filter is the composed index's current-tree
copy, the rejected flat-active meta aside. An edit made by hand — a draft, a ticked checkbox — and a verb's staged write
are in no state version until the commit carrying it lands: the ceremony's, or the code commit a task list rides. A
record's own version, its content digest, is exact from the write, so compare-and-swap and bound checks never wait on a
commit; a caller that anchors on the state version commits first, as handoff already does. The conformance suite asserts
over writes made through the contract; uncommitted edits are working-copy behavior outside it.

**Records on other branches** are listed and read through today's composed lifecycle index and in-flight derivation
(`lib/work-unit/composed-lifecycle-index.ts`, `lib/git/in-flight-derivation.ts`, `lib/git/remote-ref-reader.ts`), built
as `arc status`'s slug query builds them: local branches, and pushed branches through their remote-tracking refs as last
fetched, with the base branch from configuration and the Errand branch map from the ref of the identity the composition
point resolves, where `arc status` and ROADMAP rendering read only `arc.identity`. A listing makes no network call;
callers that read the remote live today — `arc status --fetch`, and the lifecycle verbs, `arc start`, and `arc rename`
with their materialized result — keep their code until they are rerouted. Other branches' records are read-only and read
live from those refs. Where a record is both in the working tree and on another branch, lists return the copy today's
composition selects, and reads do too unless the tree copy agrees with it, a flat-active meta aside (above). A work unit
is read from one copy: its companions and task list are read beside the meta copy its read returns — this checkout's,
where it holds the selected copy or one agreeing with it, else the selected copy on its branch, where today's matcher
finds them in that copy's directory of the branch's tree, read-only and live. Reading a companion from another branch is
new, since no reader does it today; a parked work unit's are read beside its pointer, which park writes into the planned
folder where a stub left on base after start keeps its companions, so they are the stub's from before start, as today's
readers on base read them, while the work unit's own stay on its preserved branch. The task list is read at its address,
`tasks-<slug>.md` beside the meta copy, never through the meta's `Task List` field, which today's readers resolve
(`resolveTaskListPath` in `commands/active/status.ts`); where no file is there, a read is `not-found`. A companion or
task list of a work unit no read finds is `not-found` too, its remedy creating the meta with it in one batch.

**Write admission follows the same copy.** A write to a work unit's meta, companion, or task list — an update, a
removal, or a creation — is admitted where the meta copy a read of the work unit returns is one this checkout holds: its
flat-active meta, or a tree copy agreeing with the selected one. Everywhere else it refuses `checkout-not-writable`
(D4), naming where the selected copy lives — the worktree holding it where one does, else its branch, which a checkout
of it can write. A companion or task list lands beside that copy, and a creation's absence is checked there, where its
read looks. Three cases follow. A flat-active meta is the copy its read returns, so a write to its work unit's records
is admitted with no composition, whether or not its parser accepts the meta. A parked work unit's pointer agrees with
its selected copy, so a write to its records beside the pointer is admitted as today — the pointer's own, and abandon's
removal of the pointer with the stub's files beside it among them. Resume removes the pointer alone (`park-resume.ts`),
and the stub's files stay on base until the work unit's branch, which deleted them, merges: an edit made to one
meanwhile conflicts with that deletion, and a file created beside the pointer outlives it, as today. A stub left on base
after start disagrees with its selected copy, so no write to its work unit's records is admitted from base. Two writes
are admitted on other grounds: a meta's creation, checked against this checkout's tree as today's create edge checks a
new slug (`buildLifecycleIndex` in `lib/work-unit/lifecycle-executor.ts`), with any companion or task list created in
the same batch landing beside it; and a write to a Candidate, boundary, or transition record, which are read from this
checkout's tree alone and admitted as today, the write-context preflights their only guard. The composition admission
reads is the listing's, built as `arc status` builds it, while abandon, resume, and rename build theirs with remote work
units expanded live and the current branch passed as `prospective`. So a work unit started from another clone and not
yet fetched here is admitted or refused as the listing shows it, and one whose tree copy was moved from `active/` into
the backlog on its own branch and not yet committed — where `prospective` sets aside the branch's committed copy so the
moved one is selected — is checked against the committed copy and refused until the move is committed, the refusal
naming that commit as its remedy, since the worktree holding the selected copy is this one.

**The state version** is the checkout's branch tip, `HEAD`, which advances at each commit on the branch; `version`
returns it. Reads and lists as of a version run over that commit's tree alone, by the rules the listing of the records
this checkout holds runs by over the working tree, so they keep the copies that listing keeps — never another branch's,
since other branches sit outside the state version — and drop the same two metas D9 names; whether a record that tree
lacks is another branch's, which refuses `unsupported`, or no record's, `not-found`, the current composition tells. A
listing as of a version carries that version, and a live listing carries none, since the working tree it reads is no
saved state (D4). Personal files, transient-identity records, and other branches' records keep per-record versions —
content digests and blob object IDs — and sit outside it; nothing binds them to the state version (D2), and reading them
as of a version, or the changes between two, refuses `unsupported`. A transient-identity listing still comes from one
tip, so it is consistent in itself.

**Batches.** A batch spanning substrates is refused whole, `unsupported`, before anything is written. Within one
substrate it is all or nothing:

- tracked records are written together, each checked against its current bytes as the Candidate store checks today
  (`lib/work-unit/candidate-record-store.ts`), and every one is restored if any write fails; a verb that stages them
  keeps doing so under the index lock, as start graduation and a dependency-edge discharge do through
  `captureGitIndexState` (`lib/git/exec.ts`) and park landing does by hand (`lib/work-unit/park-planning-landing.ts`);
- a transient-identity ref's records land in one transaction;
- personal files land under one hold of the notes lock, each checked against its digest before any is replaced, then
  replaced atomically one by one, every file already replaced restored from its captured bytes if a later one fails, as
  tracked records are.

Verbs that cross substrates today — the workspace close when a work unit leaves active state, Errand close's inbox drop,
promotion, and the inbox drain — keep their order and idempotent reruns.

**Sync.** Contract `sync` covers personal files, through today's notes sync — save, then the reconciling push
(`reconcileNotesPush` in `commands/user/push-fetch.ts`), as `arc sync` runs them when it pushes notes without the branch
(`pushNotesLeg` in `handlers/sync.ts`) — and transient-identity refs, through their reconcile and push
(`reconcileErrandPush` in `lib/errand/merge.ts`), and reports D4's outcomes with the in-repo additions: one for the
notes push, carrying personal files, and one for the Errand push, carrying Errand records and claims. The notes push
runs first, and the Errand push runs whatever outcome it returns, since they push independent refs; a throw is no
outcome, so a notes leg that throws — a failed readback — ends sync before the Errand push, where `arc sync` records the
save failed and still pushes Errand refs. Whether `origin`, the remote both pushes name, is set is read from
configuration before anything is pushed. A transient-identity write also publishes inside the write, as its transaction
does today (D4). The branch push is never part of contract `sync`, so that notes-only path is the one it mirrors: notes
saved on a commit not yet pushed refuse `unpublished-history`, as they do there today. When `arc sync` pushes the branch
too, it pairs the two under the push interlock (`runPairedPush` in `commands/user/paired-push.ts`): the branch first,
then a notes export bounded by the branch just pushed, retried twice and then offered for retry, never reconciled.
`arc sync` keeps both paths until the cutover removes its notes cells; contract `sync` then takes their place, and the
state push no longer waits on the branch push. The Errand transaction and both pushes gain the detail D4's mapping needs
— the records they name and a failure's cause, set where Git fails — with their kinds and messages unchanged.

**Entries.** The inbox writer stays keyed on an entry's title and source digest and stamps no `_Id:_`, so every
unrelated byte stays as today; once rerouted it computes the file's new content, which the contract writes whole
against the file's digest. `arc user inbox-remove` keys on the title, recomputing the digest under its lock.

**Reverse lookup** keeps today's derivations (D3).

**The capability report answers no** (D1, D15).

**Named costs,** accepted for the interval before the flip:

- the next actions that require a commit stay in the machine contracts;
- today's write-context preflights stay, reported as `checkout-not-writable`, which a write to a work unit's records
  also refuses where the meta copy a read of the work unit returns is not this checkout's (D8);
- the flip carries the workflow rewrite, and `arc save`, write-back, and task captures first run for real at the flip,
  so the cutover's rehearsal is where they are exercised end to end;
- branchless planning can be built against the contract but verified only on a backend with worktrees — the ref
  backend or the cutover's rehearsal — since the reference backend has none;
- a branch rewrite strands a recorded state version as it strands a commit today;
- a transient-identity write fetches and pushes inside the write, so an unreachable remote fails it, and a record
  diverged between machines or an unreadable entry blocks every write to that person's ref until repaired by hand;
- Errands are listed per person, and a commit resolves to an Errand only from the flip;
- there is no project identity;
- the archive number is still allocated without a lock until the archive ref's order replaces it (D10);
- a pass's results live only as long as the per-work-unit workspace, and a stub groomed before start has nowhere to keep
  them (D5).

### D9. The shared caller pieces

Three pieces every rerouting of callers calls. They land here, over the contract, so parallel rerouting work shares
nothing but the landed contract.

- **The current-work-unit resolver** returns the checkout's work unit by identity. It lists metas at `active` with
  `list`'s filter for the records this checkout holds (D1). Over the in-repo implementation it resolves as today's code
  does — the only meta in this checkout's flat `active/`, read from the checkout's working tree with no Git process, a
  regular file, as the lifecycle walk takes it, so a symbolic link to a meta, which today's reader follows, is none; and
  counting a meta as today's reader does: one it cannot read, or whose content `parseMetaFile` cannot parse, is a
  warning and no candidate, while one only the meta kind's parser rejects is still a candidate (D5) — giving the answers
  `resolveActiveWu` (`lib/release/wu-resolution.ts`), `readActiveMetaCandidates` (`lib/active/meta-reader.ts`), and
  `resolveCurrentWuSlug` (`handlers/lifecycle.ts`) give today, and the candidates the one-work-unit-per-worktree guard
  checks. Those three become delegates over it, so their call sites are served unchanged; `readActiveMetaCandidates`
  reads each candidate's content through `read` and parses it as today, since the resolver's parsed record normalizes
  the placeholder values — `[none]`, `[TBD]` — its consumers compare. It loads the resolver on first call, so importing
  `lib/active/meta-reader.ts`, which the lifecycle index and the composition the in-repo implementation wraps import,
  loads no store module and closes no import cycle; and the in-repo implementation statically imports none of the
  modules `arc active status` defers, loading the Candidate, integration-boundary, and transition stores, the
  configuration reader, and its sync arm on first use. Two reads stay with today's reader: the lite layout's
  `status.md`, which has no slug, so no identity; and the contributor root under `.arc/user/<identity>/active/`, which
  `arc status` reads for a contributor — the contributor's separate layout, which retires (D14), so the contract never
  carries it. A caller names that root by passing it, while `resolveActiveWu` always passes the default `.arc/active`,
  so the delegate keys on the root's value. On a backend whose state lives off the checkout's branch the filter refuses
  `unsupported`, and the resolver takes its remedy: it reads the checkout's marker with no Git process
  (`readWorktreeMarker` in `lib/git/worktree-marker.ts`) and, where the marker names a work unit and carries no husk
  stamp, resolves its claim through `lookup` and keeps the work unit only where a read of its primary record gives
  placement `active`, as the in-repo arm lists metas at `active` alone. It finds none where the marker is absent, names
  no work unit, or is husked — teardown stamps a husk onto the marker of a checkout whose work unit shipped, was
  abandoned, or was parked, keeping its subject — or where the work unit is no longer in flight, including where
  `lookup` or the read refuses `not-found` because this machine no longer holds its record, as after it was abandoned or
  decomposed elsewhere, just as the in-repo arm finds none where no meta sits at `active`; and none with a warning where
  the marker is malformed or either refuses otherwise. So it runs unchanged across the flip, and it is on the marker and
  the store before the projection's `active/current/` layout lands (D13), which its flat read of `active/` would not
  see.
- **The lifecycle index keyed by identity** lists work units by identity with their parsed meta fields, never a path,
  and answers `lookup` for lineage by slug and in-flight work by checkout claim. Over the in-repo implementation it
  composes from `resolveComposedLifecycleIndex` through the contract's listing, keeping the selected copy's fields and
  placement; this checkout's own copy comes from the filter below. From the two it answers whether this checkout's copy
  is the selected one — agreeing with the selected copy in the fields and placement today's composition compares to
  grant a writable path, a parked work unit's backlog pointer agreeing with its selected copy since both carry its
  backlog placement and those fields (D8) — for the callers that read that today, and a caller that needs the copy's
  path takes it from its placement through the layout resolver. Write admission stays inside the backend, which refuses
  a write `checkout-not-writable` where the meta copy a read of the work unit returns is not one this checkout holds
  (D8), never through a listing field. Given a state version, it lists as of that version, as the integration
  checkpoint's reads at `HEAD` need; it also lists this checkout's records alone, through the same filter over every
  location — over the in-repo implementation, the lifecycle walk with the copy D8 keeps, dropping a meta it cannot place
  as `buildLifecycleIndex` does — for callers of today's tree-only index. It drops two metas that index keeps: a
  flat-active meta it cannot place, beside another copy of its slug, where that index keeps the other copy; and a meta
  at a path the layout resolver's reverse cannot place (D8), which that index places by its tier. Both of those answers
  — whether this checkout's copy is the selected one, and this checkout's records alone — rest on `list`'s filter, so
  they are the in-repo implementation's bridge for callers of today's tree-only index and writable path and retire with
  it: on a backend whose state lives off the checkout's branch each refuses as the filter does, and a caller rerouted
  onto either branches on the capability (D15). Existing callers of today's index keep their code until rerouted; for
  every caller that reads the meta through an index entry's path in this checkout — at least ten — the index serves it
  in the sense the success criteria test: for each of its queries, it returns the same records and fields that path read
  does, from the working tree or the state version the query reads. A caller that reads another branch's tree at a named
  commit, as teardown's retirement authorization reads a parked work unit's head and base, is a branch-tree reader the
  index does not serve, since reads of other branches' records as of a version refuse `unsupported` (D8).
- **The store behind the integration checkpoint's lifecycle port** (`IntegrationLifecycleStoragePort` in
  `scripts/integration/checkpoint-composition.ts`, whose `readSnapshot` returns `{ version, fs }`). Its version is the
  contract's `version`, and its file reads resolve through the layout resolver to the contract's reads as of that
  version; its directory listings, which the lifecycle index walks, come from the contract's listings, each work item at
  the path its placement and, in the backlog, its `Cohort` field give. They list records only — no README, no archive
  folder without a meta, and no meta the layout cannot place (D8) — so the store answers as the default ports do in the
  lifecycle summary the checkpoint reads, not in every directory listing, but for the two metas the index drops (above):
  the summary omits them, where the default ports give an unplaceable meta at its tier and a rejected flat-active meta's
  slug at its other copy. Over the in-repo implementation that is `HEAD` and the tree at `HEAD`, exactly as the default
  ports in `checkpoint-composition.ts` and `merge-composition.ts` build today, and those defaults become this store. The
  checkpoint's binding moves onto its lifecycle records and code head (D2) before the flip: from the flip the state
  version covers every record, and `merge.ts` compares the port's version whole, so an unrelated write would invalidate
  it (D15). When that binding moves, the port answers from the identity-keyed index and the meta's read as of the
  version, no longer from a file tree.

### Part B — Specified here, realized by later changes

### D10. Ref layout and where the store lives

**One ref per surface,** all under `refs/arc/*`, the only prefix the host tests covered. Per-work-item refs do not
contend, and ref count barely changes fetch cost. Refs are keyed by UID, as git-bug keys `refs/bugs/<id>`: a rename is
a field write rather than a ref move, so no machine is left unable to tell a deleted ref from one not yet pushed; a slug
can be reused once its record completes; and a nested cohort never meets Git's refusal of a ref beneath another ref's
name.

| Ref                           | Holds                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `refs/arc/work/<uid>`         | one work item of either type, from creation to archive: its records, rank and placement fields, and its delivery and review records |
| `refs/arc/cohort/<uid>`       | one cohort's document                                                                                                               |
| `refs/arc/project/inbox`      | the project inbox and its routing receipts                                                                                          |
| `refs/arc/project/registry`   | the project ID, record-number counters, and lineage, keyed by origin UID                                                            |
| `refs/arc/archive/<quarter>`  | completed work items and closed cohorts, current state only, grouped by quarter                                                     |
| `refs/arc/history/...`        | an ended work item's own ref — completed, abandoned, or decomposed — pushed but outside the default fetch                           |
| `refs/arc/user/<id>/personal` | that person's inboxes, working memory, personal documents, Errand queue, and routing receipts                                       |
| `refs/arc/user/<id>/claims`   | that person's grooming and housekeeping claims                                                                                      |

- A work item's delivery and review records ride its own ref because verbs write them from the work item's own
  checkout, or, for a stub's adversarial passes, from a grooming checkout, which already writes the stub's files (D13);
  a writer found elsewhere gives those records their own ref. Creating a work-item ref with an empty old value
  cannot contend under a random UID; D14's guards hold the slug.
- **Errands are project-scope.** An Errand is a work item like a work unit: it lands a branch and a change request in
  the shared repository, so every clone fetches the live ones and its owner is a field. This supersedes the placement
  `adr-027-refine-errand-model.md` gives the record, under each person's ref; the supersession is recorded when the move
  is made true. The record stays a machine record; its description projects while it is in flight (D13). The cutover's
  documentation pass rewrites `strategy-work-organization.md` § Errand Work Class, which gives an Errand no lifecycle
  and keeps it out of `active/`.
- **Archive.** A work unit's archive sequence is its order among work units in its quarter's ref, assigned under that
  ref's compare-and-swap, which replaces the archive index; a closed Errand joins the same ref unnumbered, in a folder
  named for its branch — its slug and eight-character suffix (D2) — since its slug is reusable and only work units take
  a number. At a work unit's archive or an Errand's close, the work item's current files join the quarter's ref, its
  meta's session context cleared (D5), and its own ref moves under `refs/arc/history/`; reopen moves it back. So
  `completed/` stays browsable on a fresh machine, a completed work item stays resolvable by reverse lookup, its ref
  leaves the fetched namespace, and a quarter's ref stops growing when the quarter ends. Abandoning or decomposing a
  work item moves its own ref under `refs/arc/history/` too, joining no archive ref, and the registry's lineage records
  the transition (D5).
- **Unique stored paths.** Every stored path is unique across refs — slug-named for work-unit artifacts, slug and suffix
  for a closed Errand's, per person for personal files — since identical paths defeat Git's delta search and cost two to
  three times the pack size.
- **No shared surface shards** at the design envelope (D11): backlog order is a rank on each stub, and cohorts, the
  project inbox, and the registry are one ref each.
- **Retired and residue.** `refs/arc/user/<id>/sync-state` retires with notes, and `refs/arc/user/<id>/errands` with the
  move, which re-homes its Errands and its grooming and housekeeping claims. `refs/arc/user/<id>/errands-remote`, which
  no code references, is residue. Delivery candidates and refresh candidates, review pins, and `refs/arc/tmp/*` are not
  state and stay out of the state refspec.

**The fetch refspec** lists these namespaces and the person's own identity rather than `refs/arc/*` wholesale, so no one
fetches teammates' personal refs or history by default. Every clone does fetch each in-flight work unit's session
context with its meta: today's session notes measure 0.4–6 KB each, against the 5.5–5.7 MB a person-year of personal
history measures, and archive clears it. ARC fetches into a remote-tracking namespace, never straight into `refs/arc/*`,
where a forced fetch would overwrite unpushed local writes; that namespace stays out of `refs/remotes/`, where it would
show as remote branches.

**The local copy follows the remote.** When the state remote is the code remote — the default backend — the store is
the code repository's own refs. When state goes to another remote or to none — the backing repository and local-only,
where ghost mode lives — it is a separate Git directory at `.git/arc/store/`, beside the machine-local state ARC
already keeps under `.git/arc/`.

- The default keeps one atomic task-close push, one fetch, and state that plain Git can inspect. `git log --all`, gitk,
  and tig show one line per live state ref; whole-repository rewrite tools such as `git filter-repo` reach state unless
  told to skip it; and a code clone's mirror push deletes the remote's state refs, recoverable from any machine's copy.
- The separate layout buys privacy by construction exactly where privacy is the promise: a mirror push, an all-refs
  tool, or a history rewrite in the code repository has no state to carry, and it holds where a team's hook manager
  owns the hook directory. Its costs: bootstrapping `.git/arc/store/`, an explicit `--git-dir` on every store
  invocation (the executor pins repositories by `cwd`, and `safe.bareRepository=explicit` refuses implicit discovery of
  a bare directory), a second refspec target, and the conformance suite run over both layouts, including the ordered
  push's "code pushed, state push failed" case.
- No setting selects the layout: it derives from the backend selection, and moving between layouts rides the migrate
  verb (D14); between two local directories it is a local fetch and delete. A repository that goes public moves its
  state to a backing repository, and its state refs leave the code repository with it.

**Maintenance.** Plumbing writes never start garbage collection, so ARC runs `git maintenance run --auto` at a firing
point.

**Rotation is deferred and never precluded.** Reads take only a ref's tip, so history depth never enters the read path.
Only four refs never retire — each person's `personal` and `claims`, `project/inbox`, and `project/registry` — and
the fetch refspec takes only the person's own identity. Every ref name here is fixed. Rotation, when built, takes a new
ref name with a generation suffix and puts a field in the rotated ref's root commit naming the old tip, which `history`,
`read` and `list` as of a version, and `changes` follow across the boundary, so no caller changes. Rotation bounds
history by a fresh ref, never by rewrite, which tamper evidence and a fast-forward-only hook forbid. **Growth
tripwire:** the maintenance run's result carries each never-retiring ref's commit count and disk usage
(`git rev-list --disk-usage`), and handoff's report shows them past a bound set from measured growth.

**No wider delta window.** The host's packing sets what a fetch costs, so a wider local window saves only local disk,
slows garbage collection for the whole repository, and adds nothing unique stored paths do not already capture.

**Serialization rules,** checked when a file is persisted to the store, each a typed refusal and never a skip — under
the projection, a skipped file is silent loss on every other machine:

- **Text only,** checked by content rather than an extension list; widened only on demand.
- **One size cap for every kind,** about 1 MB, as an accident guard: history is never rewritten, so an accidental large
  file stays in synced history for good.
- **Secrets:** `.env` files and private-key files are refused. Identity scope is not private — anyone who can read the
  state host can read it — so a file that must never leave its machine belongs in the local-only path set.

### D11. Surface concurrency in use

**Write, then gate.** Deciding verbs re-read the store rather than a projection that may be stale, and each checkout
refuses a state head that does not descend from the last one it saw. This replaces user sync's recency resolution
(`lib/user-sync/merge.ts`), which drops the older edit silently.

**Batch mutations** — a drain, a sweep — version-check each entry and record each decision as it is made, never
writing the whole batch at the end over a stale read.

**The drain from the flip** reads each entry's `_Id:_` and version through a listing verb and passes both to
`arc user inbox-remove`, which removes only that version, leaving an entry edited since in place and reporting it. The
listing composes over the inbox writer's entry inspection (`inspectInboxEntry`, `listInboxEntryTitles` in
`lib/user-sync/inbox-writer.ts`), and the removal over the digest-qualified mutation (`runUserInboxMutation` in
`commands/user/inbox-mutation.ts`), which Errand promotion uses today. A drain skips a conflicted entry and reports it,
while insertions elsewhere still merge. Before the flip the drain removes by title, as today.

**Routing keeps the entry's ID.**

- At its destination: an inbound entry's `routed from <origin>, <date>` provenance line gains the ID, a new stub's
  Origin cites it, and an `ATOMIC-INBOX` entry keeps its own. The next drain recognizes a surviving entry as already
  routed and carries only its new content there, never a duplicate; into another person's work unit, where only the
  owner edits entries, that content goes as a new entry citing the original's ID. A note woven into a draft's prose
  keeps no ID, so its survivor routes again as a follow-up inbound entry. Two drains routing one entry to one
  destination write the same ID once; to two destinations they leave two homes, findable by ID.
- **Routing receipts.** Each routing writes a receipt — the entry's ID, its destination, and the date — into the inbox
  ref's tree, never projected. Receipts are never edited, and an entry's latest receipt says where it is. A surviving
  entry whose latest receipt names another home gains a ``_Routed:_ `<destination>` `` line, so the person sees why it
  came back and that its new content has not reached its home.
- **Open Errands at the move.** An Errand's record names its origin entry by title and by source digest, which leaves
  out the execute-bound mark and the retain envelope (`unboundDigest` in `lib/user-sync/inbox-writer.ts`), and close
  finds the entry by title, so an edit made since adoption does not stop it (`removeCurrentInboxEntry` in
  `commands/user/inbox-mutation.ts`). The one-time move finds each open Errand's origin entry the same way, reporting
  one whose digest changed, and carries it into the Errand's description before stamping every other entry's `_Id:_`, so
  no binding has to survive the stamp; an Errand whose entry is gone takes its description from `intent`, as one opened
  from text does.

**Starting an Errand moves its entry.** From the flip, starting a full-protection Errand from an inbox entry is a
routing whose destination is the new Errand: one batch (D3) creates the work item, makes the entry its description (D5),
removes the version read, and writes the routing receipt, and the Errand's origin names the inbox and the entry's ID.
Partial protection aside (below), an inbox then holds only work nobody has started. This supersedes
`adr-021-introduce-errand-work-class.md`'s 2026-05-31 amendment where it keeps the entry until the Errand completes and
rules out an `errand-*` file and a queue: the description is `errand-<slug>.md`, and the Errand queue below holds
references, never the execution-bound items that amendment kept out of capture surfaces. The supersession is recorded
when the move is made true.

- **The Errand queue.** Each person's queue is an ordered list of references to entries in either inbox, by ID — kept at
  identity scope, never projected and read through `arc`, and merged by entry (D6) — which replaces today's
  execute-bound marks and their file order (`listExecuteBoundInboxEntries` in `lib/user-sync/inbox-writer.ts`). A
  session and its person agree on it and set it whole — from the flip through `arc errand queue set`, which replaces
  `arc user inbox-mark-execute-bound` and takes entry IDs where that verb takes titles, with `arc errand queue` to show
  it — and the drain's execute-now disposition appends to it. It is the one ordered list of a person's Errands: a
  personal view that sequences them reads it rather than keeping an order of its own. It holds references, never items —
  every entry stays in its inbox — and claims nothing: the next offer, at startup or after a close
  (`lib/user-sync/execution-offer.ts`), takes the first entry a start would accept, drops any it would refuse, and skips
  a member in conflict, reporting each. Starting an Errand drops its entry from the queue in the same batch, and
  abandoning does not put it back, as abandoning clears the mark today. A queue left unrun hides nothing from anyone,
  since only starting claims; a started Errand that stalls stays a live work item every clone fetches (D10), shown under
  `in-flight/` to anyone whose view includes it. Until the flip, the queue stays today's marks in the person's own
  inbox, set by today's verb; the move turns each person's marks into their queue in file order.
- **One live Errand per entry,** held as slugs are (D14). A start fetches first when online and refuses an entry that is
  gone, naming where its latest receipt says it went, or whose ID an open Errand holds; an entry whose Errand already
  closed is reported rather than refused, since a surviving edit can carry new work. When two starts race — on two
  machines, or two sessions that both checked before either wrote — both Errands exist, status lists the clash whatever
  the `in-flight` view shows, and the later start yields by abandoning its Errand unless the two people agree otherwise;
  that abandon returns nothing to the inbox (below). Only its owner's abandon frees an entry whose Errand stalls; how
  another person takes over a stalled Errand is left to a separate design (Open Questions), a named cost until then.
- An entry edited meanwhile survives with its `_Routed:_` line, like any routed entry, and its home is the open Errand:
  the next drain inserts its new content into the Errand's description as a new entry citing the original's ID, as into
  another person's work unit, through the routing verb, which anyone may do (D13). Once that Errand has closed, the
  survivor is ordinary work. Linking a capture to an Errand opened from text moves that entry into its description the
  same way, beside the entry minted at open, and the Errand's origin names it.
- Abandoning returns each entry of the description to the inbox it came from under its own ID — an entry minted at open
  to its person's inbox — and writes a receipt for each, after which each reads as unstarted work and starts again like
  any other. An abandon whose entry another open Errand holds returns nothing: the description stays with the abandoned
  Errand under `refs/arc/history/` (D10), and the abandon names the Errand that keeps the entry. An entry returned onto
  a surviving edit of itself meets it as a same-entry clash (D6). Pausing leaves the description with the Errand;
  closing archives it with the Errand and leaves the inbox untouched.
- A partial-protection Errand keeps no record (D5), so its entry stays where it is until close, which removes it by ID
  and version. Two people taking one project entry under partial protection meet only at close, where the second
  removal finds the entry gone and reports it — a named cost, bounded by one session.
- Until the flip, an Errand starts only from its person's own inbox, and the entry stays there until close, as today.

**The inbound list.** From the flip, any session routes straight into a work unit's inbound list; nothing routes
through the owner, since a capture waiting for the owner would rest in a capture surface with its home known.

- It is its own kind, `inbound-<slug>.md` beside the draft, merged by entry. Integration removes entries while appends
  arrive, which is where line merge was silently wrong; even one person needs this, a drain in one worktree appending
  while the owning session integrates.
- **Writer rule:** anyone with project write access inserts, through the routing verb; only the owner's sessions edit
  or remove entries, and integration is one write to the work item's ref. The host cannot enforce owner-only, as with
  every ARC writer rule.
- One surface from stub to archive; a backlog stub still takes a note woven straight into its draft. The routing verb
  reports the entry's ID and destination, the durable carrier an out-of-band message points at. Session-init's
  orientation carries the current work unit's pending inbound count.
- **Survives:** a capture's target hint, `_Hold` as the retain escape hatch only, and routing at draft close rather than
  in task lists. **Retires:** in-flight owner adoption with its `_Hold` re-stamp, the draft's
  `## Inbound Buffer — Pending Integration` section — with the checks for it moving to the inbound kind — and the rule
  against editing another work unit's tracked buffers.
- Until the flip, routing keeps today's hold-and-route.

**The design envelope** — about ten people running about six sessions each — holds with margin by arithmetic rather than
a team-scale test. State pushes alone only at handoff, lifecycle steps, and explicit sync, and otherwise rides a code
push (D12): this repository averaged about six such firing points a day and 31 on its busiest, so ten people at that
busiest rate push state alone about 30–40 times an hour, well under GitHub's guidance of six pushes a minute per
repository. Few refs are shared across people. The busiest is a quarter's archive ref, which every Errand close writes
too — at most about six a day in this repository in September, so about 60 a day, or a few an hour, for ten people — and
on shared refs two pushes meet within a push time for a fraction of a percent of pushes; the measured worst case, twenty
machines pushing one ref at once, settled in 25–60 s. Nothing ran at team scale, so the residual stays named.
**Contention tripwire:** the push loop's result carries its retry count and time waited, and handoff's report shows them
past a bound.

### D12. Sync, push, and freshness

**Pushes batch per machine at coarse firing points** — handoff, lifecycle transitions, an explicit sync — never per
write. A lifecycle step that already pushes a code branch carries its state refs in the same `--atomic` push.

- **The push loop** fetches into the remote-tracking namespace, merges entry by entry — a single-writer record changed
  on both sides becoming a conflict record (D4) — and retries with jittered backoff sized to the host's push time on
  `fetch first`, `non-fast-forward`, `incorrect old value provided`, GitHub's `cannot lock ref`, and Azure DevOps's
  `TF401028`; any other refusal ends the loop and shows the server's message.
- State commits are authored as the user. A repository keeps one designated state host.
- The state leg pushes alone when the code leg cannot — a detached verification checkout, or a branch that cannot be
  pushed.
- **Without `--atomic`** — the backing repository's two remotes, or a host without it — the code leg pushes first and
  the state leg second, each independent, with no repair verb. Code pushed and state not loses nothing: the local store
  holds the write, an orientation line reports the pending push, and the next firing point or `arc sync` retries it.
  A captured commit the code remote lacks reads as not yet published, never as an error. Local-only has nothing to
  order.

**Freshness.** Another machine sees a write only after it fetches, and a no-change fetch costs 0.7–0.9 s on GitHub, so
ARC fetches explicitly at coarse points: session start, under `session.remote_sync`; every firing point, whose push
loop fetches first anyway; and `arc sync`. A deciding verb that is itself a firing point fetches before it decides — the
fetch its push needs, moved ahead of the decision. No background fetch runs.

- Correctness never rests on freshness: write-then-gate and compare-and-swap at push catch a decision made on a stale
  read. Freshness decides only what a reader sees meanwhile, so readers that show others' work state their fetch's age.
- No refspec joins the code remote's configuration: every ordinary and editor background `git fetch` would then pull
  state and print state-ref updates, while the fetch points above already cover every decision. The separate layout's
  Git directory is ARC's own, so its configuration may carry one.

**Push configuration.** A state push follows `push.interlock`, the axis that already gates pushes, and state refs ride a
code push wherever one runs. `user.notes_push` retires with no successor — where personal files publish is the
backend's, and identity scope is not private, so a held push only delays the same exposure while leaving the person's
other machines stale — and so do `session.init_pull.notes` and `session.init_load.notes`, since the projection makes
loading automatic. No migration is written for them.

### D13. The projection's caller-visible behavior

The store is authoritative. A gitignored projection at `.arc/active/`, `.arc/backlog/`, `.arc/completed/`, and
`.arc/user/<identity>/` is the working copy, and edits persist merged against the store version each projected file was
written from.

**Direct file access is the requirement.** Every artifact, the inbox included, is a Markdown file any editor, search
tool, or agent opens by name with nothing in between. Commands and views are a second front end over the same store;
`arc view` and status surfaces supplement files and never replace them. Nothing human-facing hides under `.internal/`.
Readers outside ARC — workflows, extensions, method overrides, scripts — read state by its projected path or through an
`arc` command, never through Git. An Errand's record stays a machine record that `arc` reads, as today, and so does each
person's Errand queue, which holds references to entries that project rather than content of its own; an Errand's
description projects as long as the Errand is in flight (below), and `completed/` and ROADMAP show work units only.

**More than one source.** The projection takes more than one source — the store, and the installed package when ARC
core resolves from it — and supports read-only copies. Readers load ARC core by its `.arc/` path, never by whether it is
tracked, and the tracked line sits at project-owned machinery, not all of `.arc/system/`.

**Ignoring and finding projected files.**

- `.git/info/exclude` ignores the shared surfaces, `.gitignore` ignores `.arc/user/*/`, and a tracked root `.ignore`
  re-includes all four roots for the ripgrep family of search tools. ARC writes the exclude entries once per clone,
  when it first projects, from a path list that `.arc/system/` paths can join, and `arc init` prints the one user-level
  Zed setting per machine. This repository's `.gitignore` stops ignoring `.ignore`.
- **Guard:** every projected path stays ignored, above all `.arc/user/*/` in `.gitignore` — packaging tools that read
  only `.gitignore` shipped the inbox once it left `.gitignore`.
- **Editor settings are opt-in,** never written by default. `arc init` prints the user-level settings that help, once
  per machine; an explicit per-editor command merges only ARC's keys into a checkout's settings file, keeping its
  comments and other keys, and removes them on request — an action, not a configuration key. Nothing depends on them.

**Base stamps.** Each projected file carries `<!-- arc-base: <blob id> -->` on its first line, or after YAML
frontmatter, naming the stored version it was written from; a content heuristic recovers it when someone deletes the
stamp. A refresh never overwrites an unsynced edit, and its re-check of a file is a stat, not a re-read.

**Every worktree.** Shared surfaces project into every worktree rather than once per machine: an editor opened on a
worktree cannot find files in the primary, and `backlog/` and `completed/` are per-worktree already. The writer pushes
the refresh into every worktree on its machine, including work-unit files into sibling worktrees' `in-flight/` views;
one copy per machine stays a fallback inside the projection, not a mode callers see. The primary-worktree rooting of
`USER-INBOX`, `WORKING-MEMORY`, and `STATUS.USER` (`lib/user-surfaces.ts`) and the migration through which teardown,
reconcile, the stale sweep, and branch-gone recovery merge up or refuse a linked worktree's copy
(`lib/user-surface-migration.ts`) retire: both exist only because per-worktree copies diverged.

**The `active/` layout,** kept if it holds up in use:

- `active/current/` holds the work item this checkout's marker names, while the marker carries no husk stamp and the
  work item is in flight. For a work unit, that is its files flat as `active/` holds them today, plus a copy of each
  cohort document its `Cohort` field names; for an Errand, its description, `errand-<slug>.md`, in whichever checkout
  the Errand occupies, the primary included. `active/in-flight/<slug>/` holds other in-flight work items, read-only — an
  Errand while it is open elsewhere, paused, or awaiting merge; the checkout's own never appears there. Which ones is a
  personal setting — `mine` (the default), `cohort`, or `all`, plus named pins — so paths stay stable and only
  membership varies.
- Folders exist only when they have members: no `current/` in a checkout without a work item, and no empty
  `in-flight/`. A file created at `active/`'s top level has no owner, so persist refuses it with a remedy naming
  `current/`. Both inboxes always project, empty or not.
- **A work unit owns files by folder, not by name,** so any companion name works; the filename-suffix matcher
  (`artifactMatcher` in `lib/work-unit/mutators/relocate-artifacts.ts`) retires with the lifecycle rewrite. `cohort-*`
  is the one reserved companion kind inside `current/`. A work unit sits in one lifecycle location — backlog, in
  flight, or completed — and cohort members never nest inside `active/`.
- The cohort companion is a second projected path of one record in the same worktree, beside its home under
  `backlog/`; both stay writable, and the refresh after a persist updates the other path. It appears in `current/`
  only, never in an `in-flight/<slug>/` view.
- Per-worktree isolation becomes "`active/current/` holds only this checkout's work item"; the cutover's documentation
  pass rewrites `strategy-work-organization.md` § Per-Worktree Isolation and its acceptance test.
- **Revert:** `active/` flat for the checkout's work item, everything else unchanged — one layout-resolver setting until
  the layout has seen use.
- **Ordering:** the current-work-unit resolver reads `active/` without recursing, so it must resolve from the checkout
  marker plus the store before this layout lands, which it does wherever the store's filter for this checkout's records
  refuses (D9). Session-init's slots that carry literal `.arc/active/meta-<slug>.md` paths — the active path, the
  frame's meta and task-list paths, load-set entries, and the reconcile command — and the compaction seed take their
  paths from the layout resolver first, and the seed's schema version bumps.

**Edit rights follow lifecycle state and kind of file,** not the projected folder:

- Provisional and planned stubs are groomed by anyone.
- For planning, active, integrating, and parked work units, the owner edits the work unit's prose — the draft, the
  inbound list, the spec, notes, and other companions — from any checkout, through compare-and-swap and
  three-way line merge. The meta and the task list stay with the owning checkout: their verb-owned fields — the meta's
  `State`, a task's completion — change only through verbs behind ceremony and task gates.
- An Errand's owner edits its description from any checkout.
- Another person's work items are read-only, except that anyone inserts into a work unit's inbound list or an Errand's
  description through the routing verb (D11).
- A parked work unit keeps its backlog placement, under its cohort when it has one, and keeps the owner's rules: work
  has begun against its spec. Its protected notice names `arc resume`, since no checkout owns it.
- An open cohort's document keeps one home, `backlog/planned/<cohort>/`, from creation until the cohort closes and joins
  its quarter's archive ref, whatever state its members are in.

**A protected file says so where it is read,** in three layers, each an existing idiom:

- a notice line beside the base stamp in the generated-file idiom (`Code generated … DO NOT EDIT.`), naming where to
  edit — the owning checkout's path on this machine, that the work unit is in flight on another, or `arc resume` for a
  parked work unit — invisible in rendered Markdown and stripped with the stamp at persist; writable files carry none;
- the read-only file mode (the read-only attribute on Windows), which refresh lifts to rewrite;
- the typed refusal at persist, as the backstop, which keeps the edit, never drops it, and names where to apply it.

**Conflicts show in the projected file itself** — as markers around the clash, or, for a whole record, as a notice — and
status and the refusing verbs report them too. `WORKING-MEMORY` loads into every session, as a work unit's meta and task
list load into each of its sessions, so a conflict shown only in status would have every session read one side as
settled.

- **Display:** standard Git conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) around both whole versions of a
  conflicted entry, or around the conflicting lines of prose, each side labelled with its machine or session and time.
- **Parse-back at persist:** markers left as they were keep the conflict open; markers replaced by text record that text
  as the resolution, naming the conflict; a duplicated `_Id:_` left by an editor's "accept both" gives the second entry
  a fresh ID; malformed markers refuse that entry's persist with a typed remedy while the rest of the file persists. The
  entry parser tolerates a missing blank line between entries, which an editor's "accept both" drops, and the merged
  write restores standard spacing. Nothing is held back: the rest of the file keeps refreshing, and the whole-file
  hold-back guard, with teardown's export into a conflict record, retires for merge surfaces. The surface's owner
  decides a resolution; a session proposes one and applies it on the owner's approval, never picking a side on its own.
  Code gates stop globbing projected state, where a lint rule would read an open conflict's markers as a heading.
- **A whole-record conflict** — a single-writer record changed on both sides (D4, D6) — takes no markers, which would
  leave its parsed file unreadable, so write-back would skip it for good. The file shows the store's version with a
  notice line beside its base stamp, in the generated-file idiom of a protected file's notice and stripped with the
  stamp at persist, naming the conflict record, the other side's machine or session and time, and the remedy: a verb or
  a write naming the conflict resolves it (D4).

**Persisting.**

- **Write-back.** At the start of every `arc` command in a checkout, beside the refresh it already runs there, the
  projection writes back pending edits: the work unit's files and the user surfaces, and in the owning checkout the meta
  and task list. Each kind's parser accepts a hand edit and refuses, reporting it, a change to a field only a verb may
  set, while the file keeps the edit. A file that fails to parse is skipped and reported, never blocking the command. An
  edit that clashes with a change the store already holds is kept as the incoming side of a conflict record, the store's
  version staying current (D6). There is no setting to turn write-back off: it moves a file the editor already saved
  into the store, as a sync tool does, and turning it off would only leave edits out of other worktrees' views longer,
  exposed to `git clean -x`, and open to conflict for longer.
- **`arc save`** writes back the checkout's pending edits at once and returns the state version — a named point in
  history carrying each write's provenance. It replaces `arc user save`.
- Persisting is local and cheap; pushing stays coarse and batched (D12).
- **Teardown persists first** and refuses while a projected file is unadopted or held by a conflict.

**Naming.** The projection has no user-facing name or verb of its own: user-facing documentation calls the files under
`.arc/` a working copy of the store. Getting other sessions' changes is automatic, `arc sync` does it on purpose or
rebuilds deleted files, and saving is `arc save`. `materialize` keeps its current commands.

**Windows.** Renames are retried over held files, the re-check sees a same-size save, file identity is compared as a
bigint, line endings are normalized on read, and Git calls are batched; store and projection tests run in the Windows
portability lane.

### D14. Backends, identity, and moving state

**Backends.** Same-repository refs by default, a backing repository, and local-only; a service backend is deferred.
Local-only is the ref backend with sync switched off. The backing repository is the same implementation with another
target: with it, a solo developer with a public repository and two machines need not choose between public personal
state and no sync. **Host floor:** GitHub and GitLab, hosted and self-managed, must hold — GitHub Enterprise Server
matched GitHub.com on every host check (Cross-cutting Considerations); Bitbucket and Azure DevOps should, each falling
back to a backing repository where it does not; Gitea and Forgejo are best effort.

**The state remote is a parameter,** designated per clone as Git's `remote.pushDefault` is, and ARC never pushes
`refs/arc/*` to a remote the person has not designated.

- It is designated without asking only when the remote that holds this project's state is the one the clone pushes
  code to, and `arc init` designates it at creation.
- A fork whose upstream holds the project's state asks once whether the person pushes state there or only reads it, and
  the answer sets the role too — push for a team member, read for a contributor.
- A run that cannot ask, CI included, stays read-only until a remote is designated. A lone remote is never designated
  by default, since a fork contributor's lone remote is usually their public fork.

**Fork contributors** need no upstream state.

- A contributor to a project that uses ARC runs local-only and reads the upstream's public state by fetching it into a
  read-only namespace, as Git keeps remote-tracking refs, never merging it into their own store. It is one more
  read-only source, read through `arc` rather than projected, so their working copy holds no file that can never be
  saved. The clone takes the upstream's project ID. Contributing to a project that does not use ARC is ghost mode
  (D19).
- The upstream's tracked configuration applies to the contributor, its state stays the maintainers', and the pull
  request is the whole contribution, carrying the spec through the export (D18).
- A team member who works from a fork points the state remote at the upstream, pushing code to the fork and state to
  the upstream in D12's order.
- The contributor's separate layout — a user-scoped active root that exists because the tracked `active/` was one
  shared, protected folder — retires: a contributor's work unit is an ordinary record in their own store, local-only
  unless they designate a remote.

**CI and contributor clones degrade gracefully.** A default clone fetches no `refs/arc/*`, so a check that needs state
fetches it or reports its absence, never fails on it.

**Project identity** is an ID minted at `arc init` and kept as a record in the store. Every clone fetches it, so it
survives new machines, moved remotes, and re-clones, where today's remote-URL-first fallback does not. Forks copy no
refs, so a fork gets its own identity unless it fetches upstream state. The backing repository is found through a
pointer in configuration — tracked for a team, local-only in ghost mode. Delivery binds the ID into plan identity and
stays buildable without one.

**Slug uniqueness.** Two live records with one slug would project to one path or resolve ambiguously, so two guards
hold it. Every work item, whatever its type, shares one namespace, and work-unit slugs and cohort names share
`backlog/planned/`'s children, so each guard checks work items and cohorts together.

- At creation, the slug is checked against live records in the local store, fetched first when online, and a clash
  refuses with a rename remedy.
- A clash between machines resolves by write-then-gate: both records exist, the projection refuses to place the second
  on the taken path, status lists the conflict, and a rename resolves it.

**Moving state.** A migrate verb moves state between backends, generic over the contract (D1), and carries every
assurance chain forward: no live query can rebuild one, so no adapter retires before its chains are carried. The
one-time move from today's substrates imports Git notes as one snapshot and never resolves differing entries with `ours`
or `theirs`; it mints a UID for every existing record, re-homes each person's Errands into work-item refs, each open
one's origin entry moving into its description and each person's execute-bound marks into their Errand queue (D11), and
their grooming and housekeeping claims into their claims ref (D10), stamps every remaining inbox entry's `_Id:_`, puts
each person's files in their place (D5), maps the review gate's repository ID onto the project ID, and derives task
captures for commits from before the flip (D16). A per-work-unit workspace's `SESSION-NOTES.md` becomes its work unit's
session context where the person owns that live work unit; every other file in the workspace — `ADVERSARIAL-PASSES.md`
among them, as written, never converted into records, and any `SESSION-NOTES.md` not folded — moves to
`scratch/work-unit/<slug>/`; and everything else at the identity's root that is not one of ARC's surfaces moves to
`scratch/`. A workspace's `.internal/` is machine-local and not carried, so an integration checkpoint taken before the
flip is taken again after it. A pass loop open across the flip keeps its earlier passes in that scratch file: the
session supplies them as prior findings by hand and carries the pass count and any pending next-pass approval forward,
since the records start at the flip. Nothing needs importing before public release, so that move may be the migrate verb
or a one-off tool.

**Protected state** — host-enforced protection of shared state — is an opt-in mode, deferred and never precluded. No
tested host's branch rules reach `refs/arc/*`, and GitHub rulesets refuse the pattern outright; the default stays
`refs/arc/*` with tamper evidence and every clone as a backup. Tripwire: a team requires host-enforced protection.

### D15. The flip

**One flip, for every family at once** — the single cutover per repository. Nothing moves onto the ref store family by
family before it. Rerouted code runs unchanged across the flip, nothing breaks before or after it, and workflow text
changes once.

**The process arrives whole at the flip.** Lifecycle verbs persist inside themselves, the work unit's edited files
persist through `arc save` and write-back (D13), the task loop closes through the close verb (D16), and ROADMAP stops
being stored. Who persists what, from the flip:

- **Lifecycle transitions an `arc` verb makes** persist inside the verb: start, activate, park, resume, reopen, promote,
  abandon, archive, publish, reconcile, Candidate applicability, and publication boundary.
- **Authoring milestones,** where a person or agent edited a work unit's files — capture draft (the grooming lane's
  included), create spec, generate tasks, amend design, inbox absorption, archive-phase content, and handoff — persist
  through `arc save`, or through write-back at the next `arc` command.
- **The notes-backed surfaces join the list:** `WORKING-MEMORY` and the meta's session context at handoff, and inbox
  captures through their verb.
- **ROADMAP re-renders disappear,** since ROADMAP is derived.

**The workflow rewrite.** The flip rewrites each affected workflow step from its end state: a commit step that carried
only state becomes `arc save` or goes; the ROADMAP hand-render steps and their refresh commits go; and a ceremony that
also changes tracked files — an ADR companion, research files moved under `reference/`, the review copy (D18) — keeps a
commit step for them. Explicit persist steps name an `arc` verb, never `git`. Each rewrite is checked against the
Self-Check in `strategy-procedure-evolution.md`: deterministic logic in the CLI, verbs over mechanics, no state
evaluated in prose, and emitted text composed by the CLI.

**The final shape wins over today's.** Today's procedure and its vocabulary — verb names, workflow steps, a ceremony's
order — and today's choices of where state lives and how it is scoped and keyed are open to change wherever the move
touches them or frees them from the substrate that shaped them. Keeping today's shape is never a reason by itself; what
holds is that nothing breaks at any point along the way. What this design settles is amended forward, never reopened
by this rule.

**Approval.** After the flip a persist is a save, not a commit under the review-increment invariant: the gates stay on
lifecycle transitions, stage advances, task closes, and code commits. Today's notes writes are Git commits too and run
under the configurable sync interlock at handoff, not a per-commit review gate. The flip rewords the invariant to say
so, and no further. Before the flip every step is today's commit, behind today's gates.

**Behaviors that need state off the checkout's branch take effect at the flip.** Each is built against the contract,
keyed on its one capability (D1), and keeps today's behavior until then:

| From the flip                                                       | Until then                                                                    |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| branchless planning (D17)                                           | planning keeps `plan/` branches                                               |
| routing straight into the inbound list (D11)                        | hold-and-route                                                                |
| grooming a stub or draining the inbox from any checkout (D13)       | grooming and housekeeping branches                                            |
| ROADMAP derived, never stored                                       | a stored file the verbs render and stage                                      |
| the `active/` layout (D13)                                          | today's flat `active/`                                                        |
| session context in the meta, and scratch under `scratch/` (D5)      | `SESSION-NOTES.md` and anything else in the person's per-work-unit workspace  |
| adversarial-pass results as review records (D5)                     | `ADVERSARIAL-PASSES.md` in the person's per-work-unit workspace               |
| drain removal by entry ID and version (D11)                         | removal by title                                                              |
| starting an Errand moves its entry, and abandoning returns it (D11) | the entry stays in its person's inbox until close                             |
| the Errand queue and `arc errand queue` (D11)                       | execute-bound marks in file order, set by `arc user inbox-mark-execute-bound` |
| task close and capture (D16)                                        | tasks ticked by hand; the task list rides its code commit                     |
| no footprint in code commit messages by default (D19)               | `Context:` footers as today                                                   |

- **The branch on the capability lives in CLI verbs, never in workflow prose,** in every verb whose behavior the flip
  changes. Among them: the routing verb, `arc start` and `arc start --here`, `arc plan check`, session-init's grooming
  relocate, activation, catching up with base, branch reaping at abandon, retire, teardown, and the orphan sweep;
  `arc errand open`, `link`, `abandon`, `close`, and `promote`, `arc user inbox-mark-execute-bound` and
  `arc errand queue set`, the drain's execute-now disposition, and the next offer; the session-notes path that
  session-init's load set and handoff resolve, the workspace's open seed, its close at park, abandon, decompose, and
  archive, and its move at rename, with archive's clearing of session context and the scratch reconcile at session
  start; every code path that writes, renders, or checks the stored ROADMAP; and every caller rerouted onto the
  lifecycle index's two answers over the filter for this checkout's records (D9). The cutover's deletion pass removes
  the arms for today's behavior.
- **It is the one exception** to the rule that nothing above the contract knows which backend is active: only the
  in-repo implementation answers no, so a verb that branches on the capability can tell it from the others. The
  exception retires with those arms.

**Ordering constraints the move carries:**

- Removing the stored ROADMAP runs in order: every code path that writes, renders, or checks it stops on the
  capability; the flip's workflow rewrite drops the hand-render steps and their refresh commits; and the deletion pass
  removes those arms with the pre-commit assert, the conflict remedy, and the merge driver.
- The inbox writer's lock moves onto the contract's per-surface write serialization before the notes-lock code is
  deleted; `getNotesLockPath` and `getRepoSharedUserInternalDir` then retire with notes sync.
- The integration checkpoint binds the lifecycle records it attested plus the code head, and `merge.ts` compares
  those, before the flip: from the flip the state version covers every record, so comparing it whole would invalidate
  the checkpoint on any unrelated write (D2, D9).
- Other machines' pushed in-flight work stays visible throughout — through remote branch refs over the in-repo
  implementation, and through the store once it syncs.

### D16. Task close and commit captures

**One close verb** closes a set of tasks — marking each complete, and each parent whose subtasks are then all complete —
and captures the increment's commits, `HEAD` or named commits, as those tasks' captures (D3).

- It runs after the commit, which it never makes. The commit is the increment's as today, behind the increment's
  structured gate, which already covers work and commit, and routed as a task-commit fire site; it may come from an
  editor or from ghost mode's own tooling. Completion therefore lands after approval.
- **Completion is a field only the verb sets.** Write-back persists every other task-list edit — a task added,
  reworded, or annotated — and refuses a hand tick, reporting it and naming the verb while the file keeps the edit. The
  parent cascade is computed, never kept by hand.
- A task's captures are a list of commits, which may be empty: a task that produced no commit closes with none.
- **The capture survives rewrites.** It holds each commit's SHA and, where it has one, its patch-id (D3). ARC's own
  rewrites — the history policy's catch-up with base — remap captures from the rewrite's old-to-new mapping, and running
  the verb again after an amend replaces that increment's capture.
- **It closes any set of tasks** — one, a parent, a phase, several phases — against the commits of that increment;
  nothing in the capture assumes one task per commit or per increment, so a raised review-increment floor composes
  with it.
- **Before the flip** tasks are ticked by hand, the task list rides its code commit, and reverse lookup and footers stay
  as today; closing and capturing start at the flip, since a commit on the checkout's branch cannot record itself
  there. Commits from before the flip get their captures from the move (D14): each closed task's captures are derived
  from the `Context:` footers of the commits that carry its ID, the derivation reverse lookup and delivery's
  attribution use today. From the flip every task's attribution is its capture, and no ARC reader parses task state out
  of commit messages. Where a squash dropped the footers, those tasks keep no capture, a named residual.
- **A missed capture is visible, never silent.** While a work unit has open tasks, orientation at session boundaries
  lists the branch's non-merge commits since its last capture — none from before the move's version at the flip —
  naming the verb as the remedy. The ceremonies that keep a commit step for tracked files run while no task is open, so
  they never appear there.

### D17. Worktrees: the lock, lifecycle anchoring, and branchless planning

**The worktree lock.** ARC locks each worktree it spawns (`git worktree lock`), which makes a plain
`git worktree remove` refuse, and a single `-f` too, until the lock is lifted or `-f` is given twice. `git clean -x`
has no hook, so firing-point frequency bounds what it can lose.

**Lifecycle work anchors; edits do not.** Every lifecycle workflow for a started work unit — draft-design after start,
create-spec, generate-tasks, the task loop, verify, and integrate — checks at entry that it runs in the work unit's own
locus and, from anywhere else, offers the remedy rather than letting a session drift into lifecycle work. Captures,
inbound entries, and the owner's prose touch-ups stay open from any checkout. The write rule already places the hard
wall: the meta and task list write only from the owning checkout.

- Spawning a dedicated worktree stays `arc start`'s default: a workspace named for its work unit tells a session what
  it is doing. Anchoring in place is the cheap explicit choice — `arc start --here` writes only the marker — so a
  session that groomed a stub can continue in place. A primary checkout anchored this way is not the launchpad while
  its work unit plans, so Errands spawn their own worktrees. Activation, where code work begins, is the natural point
  to move into a dedicated worktree.

**Branchless planning.** Planning branches existed to carry tracked planning commits, to isolate each work unit's files,
to defer the work type to activation, and to anchor locus topology; the store, the projection's `current/` folder, and
in-flight derivation over the store remove all four, which leaves a branch that never takes a commit.

- A work unit in planning keeps its own worktree, detached at the base branch's tip, since its meta and task list write
  only from the owning checkout. The checkout marker names the work unit, and locus derivation reads the marker and the
  store; the marker's exclusivity, not Git's refusal to check out one branch twice, guards the locus.
- Catching up with base re-detaches at the new tip, and refuses while the worktree holds commits not on base, so a
  stray commit is never dropped silently.
- Activation creates the work branch at base's tip in the same worktree.
- The `plan/` prefix, the orphan sweep's planning arm, and branch reaping at abandon, retire, and teardown retire. A
  planning spike that needs commits takes its own branch.
- **Named cost:** branch names stop showing which work units are in planning. Worktree lists still show every work unit
  by its `<repo>.<slug>` path, planning ones detached; branch pickers lose them.
- Planning with no worktree of its own is not included, and nothing here precludes it.

### D18. The design-document export and the integration record

**`storage.track_design_docs: none | specs`** exports authored design into the code repository as a one-way copy, for
review only. The default is `specs` under the standard profile; the ghost profile pins `none`. The export is core: at
1.0 it is the only way a team that reviews in pull requests sees the design, and guided init says plainly what turning
it off does.

- **The copy lives at `.arc/specs/<slug>/`,** disjoint from every projected path. The folder exists only on a work
  unit's branch, from prepublication to the candidate-tail, never in the base branch's tree, and each work unit in
  review carries its own.
- **It writes only at points the lifecycle already has,** each ceremony committing it on the branch: the add at
  prepublication, before the review subject is fixed, since export is design's one route into review; a re-export as
  an ordinary reviewed fix when a finding amends the stored spec; and the delete in the candidate-tail, which the
  provisional-candidate exception already names as cleanup. The delete must not reopen review, so lifecycle
  classification keeps one narrow arm, for the export path, past the cutover. Nothing exports at a firing point.
- **The copy is one-way:** the next export overwrites a hand-edited copy and reports that it did, and nothing reads
  the copy back.
- **The merge gate guards the removal.** While a pull request's tree holds `.arc/specs/`, the required `merge-ok` check
  fails, saying that the spec's review copy leaves before merge and how to remove it. It stops any merge that outruns
  the candidate-tail cleanup — a teammate merging in the host's interface, or a maintainer merging a fork's pull
  request — and ships with the export.
- **An exported spec meets a reader standard,** written for whoever checks the change against it: process metadata
  stays in its header; the body uses the project's own vocabulary and cites no planning artifact; a scope boundary says
  what the change does not do, not who does it; and a concept it relies on is defined in the spec or cited from shipped
  code or documentation.
- **Named costs:** the merged record loses the spec — a squash merge keeps no trace of it, a merge commit keeps it in
  the branch's history, and a rebase merge lands both the add and the delete on the base branch, while the merged pull
  request shows the spec's review comments as outdated. Every standard-profile pull request ends with the delete, which
  moves the head after review; on a host set to dismiss approvals on new commits, reviewers approve again. `merge-ok`
  reads red through review until the cleanup runs. Where no merge gate is installed, an early merge leaves the copy on
  the base branch, and removing it is an ordinary change.

**After the cutover a Candidate's review subject is the code in the Git index alone;** design artifacts reach review
only through the export.

**The integration-time record is never tracked.** The stored meta in its quarter's archive ref, with its `history`, is
the durable record, and the landing-commit link (D3) is its anchor. The readiness facts
(`scripts/review-gate/readiness.ts`) and the integration checkpoint read Completion Notes and the Release Notes Entry
from the stored meta under every export option; they decide, so they never read the export.

**Keeping shipped specs in the repository is deferred** and never precluded. Tripwire: a team asks to read shipped specs
in the repository. If built, the spec moves into the repository at publication rather than being copied, since a lasting
copy duplicates the store and drifts from it, and lives at `.arc/reference/specs/<slug>/`, beside the ADRs.

### D19. Ghost mode and the surface boundary

**Ghost mode is a core requirement,** reachable as a configuration of the same machinery, never a redesign: ARC in a
repository the person does not own or cannot commit ARC files to — contributing to someone else's project, a
policy-constrained work repository, or a trial.

- **The storage half** costs almost nothing extra: local-only or a designated state remote (D14), each in a separate
  Git directory (D10), and an exclude-only ignore variant with an untracked `.ignore`, which the ripgrep family reads
  whether or not it is tracked.
- **The install profile** is chosen at init (D5), a fact of the install rather than a runtime setting. Switching
  re-runs init with the other profile; state does not move, since the families are the same under both. Ghost to
  standard is a trial becoming adoption: one reviewed change commits ARC's machinery and configuration, the per-machine
  pointer retires, and the export default becomes `specs`. Standard to ghost is the reverse. The profile is one axis
  with two values and is not a backend's property: ghost runs local-only or with a designated state remote, standard
  on any backend, and ghost pins the settings it touches — the export at `none`, no task trailer — rather than
  multiplying combinations.
- **Tracked configuration wins** when a ghost install meets it — the upstream adopts ARC, or the person clones an ARC
  project where they ran ghost. Git treats excluded files as expendable, so the pull replaces the projected files on
  disk; ARC says so, the person's work-unit records stay in the store, they continue as a contributor or a team member,
  and their stored configuration retires after ARC reports where it differs from the upstream's.
- **Ghost's configuration pointer** needs a per-machine configuration tier.
- **Named cost:** under ghost, ARC's configuration for the repository — `arc-config.yml`, `DEV-RULES.PROJECT` and the
  gate commands it names, method overrides, extensions, and project strategies — is one copy, the same on every branch
  and checkout, and a change applies everywhere at once with nothing reviewing it. What can bite is configuration that
  describes the code's tooling, chiefly the quality-gate commands a long-lived branch with different tooling would
  contradict; no per-branch override is built unless that is hit. The profile choice at init says this plainly.
- **Named cost:** with the user directory excluded rather than gitignored, packaging tools that read only `.gitignore`
  could pack it.

**No ARC footprint in code commit messages by default,** once task captures exist (D16); until then footers stay as they
are. A project may opt in to one trailer that renders the task attribution the store already holds, on task commits
only; the ghost profile never carries it. Every other `Context:` kind leaves code commits: the lifecycle and planning
kinds go with state, an Errand's identity is a store link, and `standalone` goes too, so a partial-protection Errand's
direct commit, which keeps no record, carries no ARC trace from then — a named cost. The trailers teams accept are
shared standards or tracker keys the team chose; framework vocabulary on every commit carries planning concerns into the
code history a team shares. The same principle reaches the review disposition body that review triage puts on review fix
commits, once review facts are stored (D5).

**The surface boundary.** Anything ARC writes, or has an agent write, to a surface people read without ARC — commit
messages, pushed branch names, pull-request titles and bodies, review comments, replies, and dismissals, check and
status text, release notes, and issues — reads as the change or event it describes. It carries no ARC vocabulary (work
unit, Errand, Candidate, terminus, cohort, Owner acceptance, task IDs, lifecycle actions), no reference to an ARC
artifact, and no ARC process concern, by default and not only under ghost mode; a project opts in to ARC vocabulary on
its own surfaces.

- Leaks come from both sides: ARC's code composes some — delivery's pull-request body names the design by its draft
  filename (`lib/delivery/materialization.ts`) — and agents compose the rest, often in well-meant prose.
- Subject matter is not a leak: a change to ARC's own Errand code says "Errand" in this repository, as any project
  names its own domain. The boundary governs ARC's process, not a project's vocabulary.
- Making it true means inventorying every trace ARC leaves in a repository or on a host, fixing each code path at the
  source with tests over what it composes, rewriting the commit-and-PR language rule as the boundary, and checking
  agent-composed text where ARC mediates it — the commit hook and the verbs that post to a host — knowing a check over
  prose catches the common terms, never all of them. The Release Notes Entry, already written free of ARC vocabulary,
  is the pull-request body's input. The boundary is recorded as an ADR when it is made true, since it governs every
  surface ARC writes, well beyond the move.

### D20. History policy and deferred capabilities

**History policy.** Once notes retire, `history.policy: rewrite-with-lease | append-only`, default `rewrite-with-lease`,
with `append-only` for teams that prefer fixup-then-squash review or branches several people push to — the idiom turns
on who pushes to a branch, not team size.

- The code built on the append-only rule — `arc base merge`, decomposition's base advancement, Candidate applicability
  evidence, recover's strict-ancestry check, and the advisory pre-push backstop — consults the policy, with a
  lease-guarded rewrite path; the pre-push hook treats state refs separately from code.
- Supersession detection (`lib/git/supersession.ts`) stays as the safety net once rewrites are allowed.
- **Nothing depends on commit reachability.** State keys to work units and identities, never to a code commit; a capture
  that names a commit carries its patch-id where it has one and is remapped by ARC's own rewrites (D3, D16).
- The many small store commits write-back produces are the history policy's to fold.

**Deferred capabilities,** each never precluded and each with a reserved hook or a tripwire:

| Capability                                                               | Tripwire or reserved hook                                                          |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| scheduled ref rotation                                                   | the growth tripwire and the reserved continuation field (D10)                      |
| a query cache over parsed fields, derived and never the authority        | a read path exceeds its latency budget, or a live view needs queries across fields |
| protected state                                                          | a team requires host-enforced protection of shared state (D14)                     |
| a service backend, per-record authorization, very high write parallelism | the contention tripwire (D11)                                                      |
| shipped specs kept in the repository                                     | a team asks to read shipped specs in the repository (D18)                          |
| an Open Knowledge Format projection                                      | the knowledge layer off the record layer, never operational churn                  |

The query cache, if built, is a local index of the fields each kind's parser exposes, built from the store, keyed by
ref tips and checked on read so it cannot serve stale state. It is never the authority: a binary store does not diff or
merge in Git and makes conflicts opaque. Raw reads need none — every work unit's meta at its tip, 601 of them, reads in
one 17 ms batch.

---

## Alternatives & Rationale

**Why one change.** The contract's interface, record model, concurrency library, conformance suite, and in-repo
implementation are one design expressed in different forms: each is reviewable separately, none is usefully landable
alone, so review chunking covers them. The independently deliverable work — rerouting callers, the ref store, the
projection, and the move — is already separate.

**Why the whole contract now, including what others build.** Parallel work on the ref store, the projection, and the
rerouting of callers holds only if each depends on the landed contract and never on each other. So this change settles
whatever two or more of them share or whatever defines their boundary, and builds only what they all call.

**Rejected alternatives:**

- **The in-repo implementation over tracked records alone.** Rerouting the personal-file writers and the Errand readers
  would then wait on the ref store. Serving every substrate where it lives keeps every rerouting unblocked.
- **An in-repo save path that commits** — a contract write that also commits on the checkout's branch, with its own
  save verb, flush, and commit refusals. It doubled ceremony, coupled every state write to the commit gates, and did
  not converge under review. Mirroring today, commits included, and changing the process once at the flip breaks
  nothing along the way.
- **Flipping family by family.** Callers would face two substrates' semantics for the same concern over a long
  interval, and cross-family verbs — archive, park, promotion — would straddle them. One flip per repository keeps
  every verb on one substrate at a time.
- **A Git-backed or persistent reference backend.** A Git-backed one could not show the contract is implementable
  without Git; a persistent non-Git store (SQLite, Postgres) belongs to a service backend. In memory, the reference
  backend produces version conflicts and stale bases on demand and runs fast.
- **A separate foundation change for the shared caller pieces, landing first.** It keeps this change smaller but costs
  the same critical path plus its own planning, review, and integration, and every rerouting would depend on it.
- **The store-wide version as the freshness basis.** Any capture or Errand write would then invalidate integration
  evidence and make sessions repeat ceremonies. Binding the records a caller attested, and the code head, invalidates
  only on a change to what was attested.
- **The slug as identity; time-ordered or sequential IDs.** A slug is reused and renamed; time-ordered prefixes collide
  for IDs minted close together; sequential numbers collide across offline machines. A name plus a random UID keeps the
  human handle and a stable key.
- **Resolving clashes by recency, or holding back a conflicted file.** Recency drops an edit silently; holding back the
  whole file stopped 43 of 60 worktrees syncing the inbox in measurement. Write-then-gate keeps both sides and
  refreshes the rest of the file.
- **Entry merge keyed on the title, or line merge inside entries.** A retitle reads as delete plus insert; line merge
  inside entries was silently wrong in 0.2–2.2% of measured pairs.
- **A conflict record for a removal racing an edit.** Almost every conflict left under entry merge was a drain racing a
  note, so ordinary housekeeping would become hand-resolved conflicts. Observed-remove keeps the edit.
- **One projected copy per machine.** An editor opened on a worktree cannot find files in the primary, and pull refresh
  left another session's capture up to half an hour stale; an agent read stale shared state 5–8% of the time. Writer
  push into every worktree closes that locally in under 0.2 s for twenty worktrees.
- **Flat `active/` for everything.** It cannot show other in-flight work units beside the checkout's own. It stays the
  one-setting revert.
- **The store always in a separate Git directory, or always in the code repository's refs.** The first loses the atomic
  task-close push and plain-Git inspection where state shares the code remote; the second leaks private state into the
  code repository where it does not. The local copy follows the remote.
- **A fetch refspec in the code remote's configuration.** Every ordinary and background fetch would pull state and
  print state-ref updates, and ARC would write the person's remote configuration, while explicit fetch points already
  cover every decision.
- **Per-write pushes or a background fetch.** Per-write pushes multiply contention; a background fetch adds a daemon
  without making any decision correct, since compare-and-swap at push already catches stale decisions.
- **Export options `none | all` with `none` as default.** `all` has no purpose of its own and would put working
  documents in the code repository; `none` by default would quietly take the spec out of review. A lasting tracked copy
  duplicates the store and drifts from it, and a tracked integration record adds an ARC record to code history by
  default.
- **Scheduled rotation at 1.0, or a wider delta window.** Rotation's shared-ref retirement is undesigned and nothing
  needs it yet; a wider window saves only local disk and slows garbage collection for the whole repository.
- **A setting to turn write-back off, or editor settings written by default.** Write-back moves a file the editor
  already saved; turning it off only lengthens exposure. Written editor settings add footprint ghost mode cannot carry.
- **A successor to `user.notes_push`, a `storage.profile` key, or per-family tracking switches.** Where personal files
  publish is the backend's; a profile key could disagree with the repository; per-family switches are the matrix a
  single export knob avoids.
- **Routing through the owner.** A capture waiting for its owner would rest in a capture surface with its home known.
- **Deferring the record-aware reads to a later records engine.** That later change would rewrite the same consumers a
  second time; file-as-record with per-kind parsers lets the engine change only what sits behind each parser.
- **Branching on the backend in workflow prose.** Workflow logic stays backend-agnostic; the one capability is read by
  CLI verbs only, and the arms go at the cutover.
- **Keeping planning branches.** After the flip they carry no commit and serve only as labels; the marker and the store
  already decide locus.
- **Two families, one for work units and one for Errands.** Everything that spans them — the ref layout, slug
  uniqueness, `lookup`, archive, sync, and the delivery and review records — would be built twice, and promotion would
  copy a record between families rather than change one field.
- **Errands per person.** ADR-027 placed the record under each person's ref, treating an Errand as its person's claim
  and syncing it through the user-state machinery. But an Errand lands a branch and a change request in the shared
  repository, so its teammates need to see it, and the person survives as the owner field.
- **Leaving the entry in its inbox while the Errand runs, marked as taken.** ADR-021 kept it there because the
  notes-synced entry was the only synced copy of the Errand's goal. With a record and a description of its own, an
  Errand left in the inbox is work with a known home resting in a capture surface, and a shared inbox would show taken
  work as free to anyone who missed the mark.
- **Queuing by moving project entries into the personal inbox, by marking them queued, or in a plan file.** The first
  two claim work before it starts, so a queue never run hides it from everyone else or leaves marks to sweep — the rot
  that retired ADR-021's `ERRANDS.md` queue — and a plan file would copy the entries it lists. A queue of entry IDs
  claims nothing and copies nothing; starting is the only claim.
- **Projecting closed Errands into `completed/`.** An Errand is determinate: its change request and commits hold all
  its description did, while `completed/` keeps the planning context only work units have.
- **A hand-rolled three-way merge.** How well a merge aligns lines and groups conflicts is a judgment no property test
  pins, so proven code earns its place; `node-diff3` is small, MIT-licensed, and has no dependencies of its own.
- **A pinned rank-key library.** Rank keys are correct exactly when a new key sorts strictly between its neighbours,
  which a property test checks completely. `fractional-indexing` also throws on equal neighbours, which concurrent
  inserts produce, and a later version could refuse keys an earlier one stored, as its fourth version changed its
  head format.
- **A personal workspace for each work unit, after the flip.** It kept session notes out of tracked history and gave
  each identity one writer, so its sync never conflicted. Once nothing is tracked, every surface merges, and identity
  scope is not private, it hides only a work unit's working state from whoever takes the work unit over, makes a
  handover fetch another person's ref, and adds a ref that archive must move.
- **A separate session file for each work unit.** It would need a kind of its own that never archives, with a seed,
  rename handling, and a path resolver, while the handoff already writes the meta, whose fields overlap it.
- **Per-work-unit scratch inside the work unit** (`active/current/scratch/`). It would be shared and owned by the work
  unit, losing what scratch is for: a person's own space, where anything goes.
- **Adversarial-pass evidence as a file** — a companion beside the artifact, a section of its notes, or one entry per
  pass in an entry list. The review gate already stores the same facts — a disposition set, its approval, the rubric's
  identity, and the lineage from one pass to the next — so a file would keep a second shape of them that hand edits can
  pull out of step with the pass it records, and each later pass would recover its prior findings by reading prose.

## Cross-cutting Considerations

**Security and trust boundaries.**

- Identity scope is not private: anyone who can read the state host — the code repository by default — can read it.
  Privacy is the backing repository's. Secret files are refused at persist, and machine-scoped state never leaves its
  machine.
- Anyone with write access can rewrite or delete any state ref, another identity's included; the ancestry check a
  checkout runs on each new state head makes a rewind visible, not impossible, and every clone is a backup.
- ARC never pushes state to a remote the person has not designated; a run that cannot ask stays read-only.
- Writer rules — owner-only edits, verb-owned fields — are ARC's, enforced at persist; no host enforces them.
- Deciding consumers never act on incomplete evidence; a missing family never reads as a broken one.

**Performance.**

- Every work unit's meta at its ref tip, 601 of them, reads in one 17 ms batch; history depth never enters the read
  path (flat to 20,197 commits).
- A no-change fetch costs 0.7–0.9 s on GitHub, so fetches happen only at coarse points (D12).
- Projection refresh across twenty worktrees on one machine takes under 0.2 s, with a stat re-check.
- A person-year of personal history pushed commit by commit is 5.5–5.7 MB, 26.6 MB where a host repacks at the default
  window; a rotated year for ten people fetched 8–19 MB.
- The in-repo implementation adds a layer of indirection over today's reads and writes, and Git invocations beyond what
  today's code paths make in three places only: the composition a read, or a write's admission, runs for a work unit
  this checkout holds no flat-active meta for (D8), where a reader of the working tree alone runs none today; a
  companion's or task list's read from another branch; and the tracked-write lock's resolution of the checkout's Git
  directory.

**Testing.**

- The conformance suite (D7) is the primary instrument. The reference backend's runs belong in the fast unit lanes;
  the in-repo fixture needs a real repository and runs where Git-backed tests already run.
- Differential tests hold the in-repo implementation to today's behavior: for each family, reads through the contract
  equal the current code path's, and writes through it produce the bytes today's writers produce.
- The concurrency library is pure and property-tested with `fast-check`.
- New test files move the test-cost budget rows they touch, including the combined lane that overlaps integration, so
  each affected row is baselined before the first new test file lands.
- The size and complexity gate applies to every new module; no suppression is added.
- Store and projection tests join the Windows portability lane when the ref store and projection are built.

**Dependencies.** `node-diff3`, pinned to an exact version, joins the package's runtime dependencies: MIT-licensed,
with no dependencies of its own. `fast-check` joins its development dependencies. The rank-key algorithm is adapted
from the public-domain (CC0) `fractional-indexing`, so it adds no dependency.

**Migration and rollout.**

- This change moves no state and changes no behavior. Callers move onto the contract one rerouting at a time, each
  observably unchanged; the flip then moves every family at once, and the deletion passes remove what only today's
  substrates needed.
- Under the pre-public-release posture, no compatibility aliases, migration readers, or data migrations are written for
  retiring settings or layouts; the one-time move may be a one-off tool for the repositories that need it.
- After public release, the projected paths — `active/current/` and `active/in-flight/<slug>/` among them — are a
  compatibility surface.

**User-facing impact.** None from this change. At the flip, people and agents meet the working copy, `arc save`,
automatic write-back, protected-file notices, conflicts shown in files, the `active/` layout, the task close verb,
session context in the meta, and `scratch/` for personal files; the documentation says so at that point.

**Host evidence.** A GitHub Enterprise Server 3.22.1 trial matched GitHub.com on every check:

- push, fetch, delete, and lease of `refs/arc/*`; a default clone fetches none, and ARC's refspec fetches them;
- `--atomic` with a stale state ref held the code branch back; a losing push reads `cannot lock ref` or `fetch first`;
  no write was lost under twenty concurrent clones;
- rulesets refuse a `refs/arc/**` pattern, and rulesets on branches do not reach the refs;
- a branch ruleset on `arc-state/**` accepted fast-forwards and refused rewrites and deletes with `GH013`, for an
  ordinary member as for the admin, though a new branch under the prefix could still be created;
- an ordinary member with write access can create, rewrite, and delete any state ref, another identity's included; with
  read access, fetch only;
- forks copy no `refs/arc/*` and accept their own.

**Risks carried.**

- A mirror push from a clone without ARC's refs (`git push --mirror`, or a Gitea or Forgejo push mirror) deletes them on
  the remote; any ARC clone can restore them. GitLab mirrors leave two ends with independent state.
- `git log --all` and graph views show state history beside code, and agents run such commands.
- Backup and host-migration tools may not carry custom refs.
- Azure DevOps's commit-author policy accepts state commits only when they are authored as the user.
- Untested: Bitbucket; Azure DevOps ref-level permissions for ordinary members; a JetBrains IDE; one history-replay push
  refusal whose message was not captured.

## Success Criteria

Validated at this change's completion, over Part A:

1. **Conformance.** The conformance suite passes against the in-repo implementation and the reference backend, each
   over every family its fixture serves.
2. **Version conflicts and stale bases.** Version conflicts are produced and asserted on both backends — on the in-repo
   implementation by racing writers — and stale bases, with merged versions and conflict records, on the reference
   backend.
3. **Freshness.** On both backends, a write to an unrelated record changes no bound check.
4. **Batches.** A batch with one stale record applies nothing and names every stale record; on the in-repo
   implementation a batch spanning substrates refuses `unsupported` with no file, note, or ref changed.
5. **Same results over today's substrates.** For each family the in-repo implementation serves — tracked records (a
   meta through the lifecycle index, a Candidate record, a transition record), personal files (a `USER-INBOX` file, its
   entries as today's parser reads them, and a `SESSION-NOTES` file), and Errand records (the absent, `error`, and
   complete snapshot outcomes) — a consumer's reads through the contract return what its current code path returns over
   the same repository, and writes through the contract produce the bytes today's writers produce.
6. **The shared pieces serve their existing call sites.** `resolveActiveWu`, `readActiveMetaCandidates`, and
   `resolveCurrentWuSlug` delegate to the resolver and every existing test passes unchanged; the lifecycle index returns
   the same records and fields as today's path reads for each query of every existing caller that reads the meta through
   an index entry's path in this checkout, but for the two cases D9 names; and the checkpoint's and merge composition's
   default lifecycle storage is the new store, with their tests passing unchanged.
7. **Nothing observable changes.** The change's diff touches nothing under `packages/arc-framework/arc/` — no
   workflow, template, method, or strategy; no verb gains or loses a commit; and the existing ceremony tests pass
   unchanged.
8. **The concurrency library** is covered for: disjoint insertions merging; a same-entry clash keeping the current
   version and becoming a conflict record that names its entry, with both sides labelled; a removal racing an edit
   leaving the edit; a retitle merging as an edit; an entry without an ID gaining one, and an ID clash re-drawn; clean
   and conflicting three-way line merges; and rank keys at any position, tied neighbours included, sorting as specified.
9. **The reference backend never ships.** The package build output contains none of it, and a check fails if any
   module under `src/` imports it.
10. **Refusals are recovery-complete.** Every refusal the contract defines carries its class, observed condition, and
    remedy, and each recoverable refusal has a test showing the success path reachable after its remedy.
11. **Capability and format.** The in-repo implementation reports no for state off the checkout's branch and the
    reference backend yes; every record reads format version 1 over the in-repo implementation; a record it cannot
    parse is an unreadable entry with a diagnostic and does not block session-init for an unrelated work unit.
12. **Unhomed kinds.** On the in-repo implementation, every kind with no home in today's substrates lists as `absent`
    and refuses writes `unsupported`.
13. **One composition point.** No module under `src/` outside `lib/store/` imports a backend directly; tests reach
    backends only through the conformance fixtures.
14. **Sync outcomes.** The reference backend produces every sync outcome and failure class, and over the in-repo
    implementation each outcome today's notes save and push and Errand push report maps onto D4's as stated there,
    with no change in what `arc sync` does.
15. **Quality gates.** Markdown lint and the ARC contract checks, both type checks, `lint:ts` with no new size-gate
    suppression, `npm test`, and the build pass; E2E and portability pass in required CI.

16. **Existing sync behavior.** The in-repo fixture reports each A1 sync exception by name and reason, and direct
    tests verify repeated publish outcomes, same-key transient conflicts, disjoint reconciliation, and merged notes
    with unchanged personal working files.

17. **Historical content (A2).** Historical entries expose bytes matching each non-removal record version after later
    updates or removals; removal entries carry null content and version.

## Open Questions

None blocks building Part A.

**Implementation detail, settled while building:** the module layout under `lib/store/`, the TypeScript names of the
operations and outcomes, and which test tier each conformance fixture runs in.

**Left to the changes that realize Part B,** each bounded by the constraint stated where it arises:

- each family's field schema, and which fields a verb owns (D5, D13), the work-item base's among them — beyond its
  links and placement — with the name of its type field;
- how review working state splits between stored facts and machine-local state (D5);
- where an executing work unit integrates inbound entries, since it has no next planning iteration (D11);
- the inbox listing verb's name, and the close verb's name and placement (D11, D16);
- which of today's handoff fields the meta's session context keeps, beside the state-version anchor (D5);
- the growth and contention tripwires' bounds (D10, D11);
- whether the one-time move is the migrate verb or a one-off tool (D14);
- where the state remote's designation lives (D14);
- ghost mode's footprint inventory, the task trailer's form, harness bootstrap without tracked files, and its
  user-facing name (D19).

**Left to a separate design:**

- work-item types beyond work units and Errands, and how an external tracker's items compose with work items (D5);
- taking over another person's stalled Errand, which the inbox model's design settles: the owner is a base field, so a
  takeover is one write of it, and who may make that write, and when — an exception to D13's read-only rule — is that
  design's (D11).

---

## Amendments

- **A1** — 2026-10-02 — design: preserve existing sync in the fixture's exceptions.
  _Supersedes:_ tasks §7.4.a complete list. _Trigger:_ 7.4 must-stop. _Work:_ 7.4.R. _Revalidated:_ 7.4.R.b.
- **A2** — 2026-10-02 — design: history returns recoverable bytes. _Supersedes:_ D1 history and changes results; D2.
  _Trigger:_ storage-standard-1-F08 review. _Work:_ review-fix. _Revalidated:_ review-fix.
