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

Code lands under a new `lib/store/` module family in the CLI package: the contract's types and operation signatures,
its refusal vocabulary, the family and kind registry, the concurrency library, and one directory per backend. It
depends downward on `lib/kernel/` (Zod schemas, the Result seam) and on `lib/git/`'s executor, and nothing outside it
imports a backend directly: one composition point selects the backend, and every caller receives the contract.

### Part A — Built by this change

### D1. The contract

One interface owns every read, version-checked write, listing, history query, lookup, and sync of state. Nothing above
it knows which backend is active, with one interim exception (D15); the target namespace is a backend parameter.

**Operations.**

| Operation | Input                                                                                 | Result                                                                                     |
| --------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `read`    | a record's identity and kind; optionally a state version                              | the record's content, its record version, and its format version                           |
| `list`    | a family, optionally a kind and a filter; optionally a state version                  | a listing outcome (D4): parsed fields per record where the kind has a parser, never a path |
| `write`   | one record's identity, kind, new content, expected record version, and message        | the new record version, plus any conflict records the write created (D3)                   |
| `batch`   | several writes, each with its own expected version, under one message                 | every write applied, or none (D3)                                                          |
| `version` | none                                                                                  | the current state version (D2)                                                             |
| `history` | a record's identity                                                                   | the record's versions, newest first, each with its write message (D3)                      |
| `changes` | two state versions, optionally restricted to named records                            | the records that changed between them, with their messages                                 |
| `lookup`  | a slug, a lineage origin, a checkout claim, or a repository plus a commit or ref (D3) | the identity it resolves to (D3's reverse lookup included), or a typed refusal (D4)        |
| `sync`    | none                                                                                  | a sync outcome (D4)                                                                        |

A **checkout claim** is what a registered checkout's marker names — a work unit, an Errand, a grooming set, or a
housekeeping sweep — passed to `lookup` as the marker carries it, by kind, slug, and claim ID, never as a checkout path;
`lookup` by one answers which record that checkout holds. A partial-protection Errand keeps no record (D5), so lookup by
its claim is `not-found`, saying so.

Contract requirements every backend meets:

- **Callers name records by identity, never by projected path.** A listing returns parsed fields; derived views —
  ROADMAP, `STATUS.USER`, the archive listing — render from them and are never stored.
- **Every family is listable, readable, and writable with its identity intact,** so moving state between backends is
  generic over the contract.
- **Sync is its own operation.** A backend without sync is a configuration of one that has it, not another
  implementation. The in-repo implementation's transient-identity writes are the one exception until the cutover: they
  publish inside the write, as today (D8).
- **A verb confirms its own write from the local store,** never from a fresh fetch: a host's replicas may lag.
- **Write serialization belongs to the contract:** each surface's writes compare-and-swap against the expected version
  under a machine-local write lock for that surface. The in-repo implementation uses the locks today's writers take
  (D8).
- **The store is CLI-internal plumbing.** People and agents work through the projection and `arc` verbs; no agent runs
  Git against the store, and which family a write lands in is computed by the CLI, never left to agent judgment.

**The capability report.** The contract reports exactly one capability: whether state lives off the checkout's branch.
The in-repo implementation answers no; the reference and ref backends answer yes. D15 states the one use a verb may
make of it. Everything else a test needs to know about a backend — whether it merges concurrent writes, which families
it serves — is declared by the conformance suite's fixture for that backend (D7), not reported through the contract.

### D2. Identity and versions

**Record identity is a name plus a UID.** The name is the slug: the human handle, unique among the live records that
share its namespace — every work item, whatever its type, shares one (D14) — and reusable once its record completes. The
UID is minted at creation with `crypto.randomUUID()`, never reused, and never changed, so it tells a recreated record
from an earlier one of the same name. Work units, cohorts, and Errands carry one, and the project ID (D14) is one;
Candidate records keep the canonical content digest that already identifies them.

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
- A rename is a field write: the record keeps its UID and records its former slugs, so an old name still resolves
  through `lookup`.
- **In this change the contract's identity type is opaque.** The in-repo implementation resolves it from the slug,
  since today's records carry no UID; when the meta gains its `Id` field, the identity becomes the UID with no caller
  change. The rules above bind the backends that mint UIDs — the reference backend here, the ref backend and the move
  later. An Errand branch stays `chore/<slug>` until the move gives Errand records their UIDs (D14), and takes its
  eight-character suffix from then.

**Record version.** Each record has its own version, the basis every compare-and-swap checks, exact from the moment
its write returns — so compare-and-swap and bound checks never wait on anything else. The in-repo implementation uses
the record's content digest on every substrate — for an Errand record, its blob's object ID in its ref's tree, never
the ref's tip, which moves with every Errand on the ref and serves only as the basis that ref's write serialization
checks (D1). The reference and ref backends assign it as the write lands.

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

### D3. Writes, batches, messages, and links

**Version-checked writes.** Every write carries the version it read.

- On a **single-writer kind** — a work unit's meta and task list — an expected version older than the current one is
  `version-conflict`.
- On a **merge kind** — an entry list or prose (D6) — an older expected version is a **stale base**: a backend that
  merges concurrent writes merges from that base with the kind's mechanism and returns the merged version with any
  conflict records it created. A stale base is not a failure. The in-repo implementation never merges a record's
  content; any mismatch there is `version-conflict`, and its writers re-read and re-apply under their lock, as they do
  today. Its transient-identity transaction reconciles the ref's records one by one against the remote, as today, and
  refuses the whole write while any record on the ref changed on both sides or fails to parse (D4, D8).

**Batches.** One write may change several records, all or nothing, each checked against its own expected version; a
`version-conflict` names every stale record. Archive, abandon, rename, decompose, and park each change several records
in one verb, and several verbs already stage several files all or nothing today. A backend that cannot apply a batch
atomically refuses it whole, `unsupported`, before writing anything; only the in-repo implementation does, and only
for a batch spanning substrates (D8). The ref backend applies a batch with `git update-ref --stdin` and carries it to
the remote with `git push --atomic` (D12).

**Messages are provenance, never evidence.** Every store write carries a message the CLI composes. The subject names
the verb and the record (`archive storage-contract`); trailers carry the owning work unit's or Errand's name and UID,
the lifecycle action, and the code head when the write attests code. The writes of one batch share a batch ID across
refs, so `history` and `changes` show an archive as one change rather than one per ref. No evidence needs the message
as its home. The in-repo implementation keeps today's messages: a tracked record's message is the commit that carries
it, and an Errand record's is its ref commit's.

**Links.** Traceability is a store link the CLI captures, never a message convention.

- A task record captures its increment's commits — a list, possibly empty, since a decision or research task may
  produce none. A work unit's integration and an Errand's close capture the landing commit.
- **Links are base fields the contract itself defines,** read without a kind's parser: a branch (repository and ref
  name), a change request (repository and number), a landing commit, and task captures. Each commit is held as its SHA
  and its patch-id.
- `lookup` by commit matches captured SHAs, then the patch-id the caller computes and passes with the commit; by ref,
  branch links. So every backend answers it from stored fields, a rebase that leaves a commit's diff alone keeps the
  link, and ARC's own rewrites remap captures from the rewrite's old-to-new mapping.
- **Reverse lookup** answers from a repository plus a commit or ref to the owning task and work item, across renames,
  since records key by UID. A delivery resolves its plan and member from that work item through its own member lookup
  over its machine-local state (D5); the contract's lookup does not reach them.
- The residual, stated: a rewrite outside ARC that changes a commit's diff — a conflict-resolving rebase, squashed
  fixups — loses the per-task link, and a squash loses per-task granularity by its nature; the landing commit keeps
  the work-unit link under any merge strategy.
- Until the flip, the in-repo implementation answers reverse lookup with today's derivations: a commit resolves to its
  task and work unit through its `Context:` footer (`lib/handoff/restate-candidates.ts`, `lib/delivery/from-branch.ts`),
  and a ref to its work unit through the branch name and to its Errand through the record that names the branch. A
  commit resolves to an Errand only from the flip, when captures begin and an Errand's close captures its landing commit
  (D15).

### D4. Failures and outcomes

Every failure meets the recovery-complete refusal rule in `DEV-RULES.PROJECT`: it says whether it is terminal or
recoverable, reports the observed condition, and names a remedy that leaves the success path reachable.

**Local operations** — `read`, `list`, `write`, `batch`, `history`, `changes`, and `lookup` — refuse from one closed
vocabulary, the one `lib/delivery/ports.ts` already uses plus `not-found`:

| Refusal             | Class       | Meaning and remedy                                                                          |
| ------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `not-found`         | recoverable | No record has that identity; names the lookup that would resolve a name or former name      |
| `version-conflict`  | recoverable | An expected version is stale; names each stale record so the caller re-reads and re-applies |
| `record-malformed`  | recoverable | A record fails its kind's parse or validation; names the record and the failing rule        |
| `identity-mismatch` | recoverable | A record's stored identity disagrees with the identity asked for; names both                |
| `ambiguous-match`   | recoverable | A lookup matched more than one record; names the candidates                                 |
| `namespace-corrupt` | terminal    | The store's structure is broken; names the repair                                           |

The in-repo implementation adds two refusals that no other backend produces, and one exception; all three retire at the
cutover:

- **`checkout-not-writable`** — recoverable. This checkout lacks write authority for the write, and the refusal names
  where it can land. It fires exactly where today's refusals fire, never as a check on every write: at the
  write-context preflights in `lib/git/write-context.ts` — `arc plan check`'s redirect, the inbox drain's entry check
  with its move onto a grooming branch under full protection, and park's run-context refusal — and on a write to a
  record whose selected copy lives on another branch (D8). A commit on the protected base under full protection stays
  refused by the pre-commit hook and the release wrapper, as today. Grooming, drain, and decomposition branches stay
  valid write contexts.
- **`unsupported`** — the call cannot succeed as it stands and is not retryable unchanged. It is recoverable for a
  batch spanning substrates, or a read or `changes` as of a state version for records the version does not cover (D8),
  and names the remedy — sequence the writes, or bind per-record versions. It is terminal for a write to a kind with
  no home before the flip, or for `history` of a personal file, and says that neither is served until then.
- **A transient-identity write fails as sync does** — `unreachable`, `refused`, or `retries-exhausted`, with sync's
  classes — since it fetches and pushes inside the write (D8). While any record on its ref changed both on this
  machine and on the remote, or any entry there fails to parse, every write to that ref refuses, `version-conflict` or
  `record-malformed`, naming those records rather than the one written. Re-reading does not clear it: the remedy names
  the hand repair — keep the remote's copy and redo the local change through its verb, or rewrite the unreadable
  entry — after which the write succeeds.

**Neither is a failure:**

- **A conflicted entry.** A same-entry clash lands as a conflict record (D6); the next verb that depends on that entry
  refuses, naming the conflict record, and a resolution names it.
- **A stale base** on a merge kind (D3).

**Sync outcomes.** `sync` ends `pushed`, `noop`, or `reconciled`, or fails:

- `retries-exhausted` — recoverable: the next firing point or `arc sync` retries; it carries the retry count and the
  time waited, the contention tripwire's fields (D11);
- `unreachable` — recoverable: network, timeout, or authentication, retried once the remote answers;
- `refused` — terminal: any other host refusal, carrying the server's message, which names what must change before a
  retry can succeed.

No remote — as in local-only or ghost use — and being offline are states, not failures. Until the flip the in-repo
implementation's `sync` also reports today's `conflict` and `blocked`, and the notes export's local refusals as they are
— `unpublished-history`, `history-diverged`, `compaction-lineage`, and `proof-unavailable`
(`lib/user-sync/branch-bounded-notes-export.ts`); the notes push's `success` is `pushed`; today's `failed` maps by cause
onto `retries-exhausted`, `unreachable`, or `refused`; and today's `no-remote` splits: a remote that does not exist is a
state, one that cannot be read is `unreachable`. The notes-only outcomes — `no-local-notes`, and the paired push's
`cancelled` (the person declining `arc sync`'s notes-push prompt), `failed-nontty-conflict`, and `ok-recovered`
(`commands/user/types.ts`) — retire with notes.

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
- **A listing is taken as of one state version, its mutation basis.** A write built on it compare-and-swaps each
  record it writes against that record's version in the listing, never the listing's whole version.
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
its records with their content and versions but no fields.

**Placement is a record field, and directory layout a projection of it.** Lifecycle location becomes a field of every
work item's record; `backlog/`, `active/`, and `completed/` are where the projection places a work unit. Until the flip
the in-repo implementation keeps directory placement as the source and derives the field from it, as the lifecycle index
does today.

**Two levels.**

- A **family** is the storage grouping: its scope (project, or one identity across that person's machines), its ref
  placement (which may be a subtree of another family's ref), retention, sync, lifecycle, and its tracked-versus-stored
  assignment under each profile.
- A **kind** within a family carries its parser, format version, writer rule, merge mechanism (D6), and projected path.
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

**Work items.** Work units and Errands are two types of one family. Every work item has the same base — its identity,
owner, type, lifecycle location (backlog, in flight, or completed), origin, and links: branch, change request, landing
commit, and task captures. Everything that spans types reads only the base: the ref layout, slug uniqueness, `lookup`
and checkout claims, archive and history movement, sync, and the delivery and review records that ride a work item's
ref. A type adds the rest — its companions, its writer rules, and its own lifecycle states, which refine the base's
location and are never merged into one machine. Promotion is a field write on one record: the type changes, and the
UID, links, and history stay; naming the work unit differently is a rename in the same verb, and its branch is a new
branch link beside the Errand's. The base's exact field schema is set with its parser, except the links the contract
defines (D3); a further type would be one more type over the same base, so nothing that spans types changes. How an
external tracker's items compose with work items is left to that design.

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
  family that has a merge kind (D6); routing receipts, a kind of both inbox families (D11); and each record's format
  version, which every read returns and every write carries.

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
  move onto the ref store puts each file in its place (D14).

**Format version.** Every record carries a format version, kept by the store beside the record and never in the file's
content, so projected files stay plain Markdown. It is per record, not per family, so one newer record never makes an
older build refuse the rest. A record newer than the build is an unknown-version diagnostic in a listing and, when read
directly, `record-malformed` naming the cause and the remedy — merge base or rebuild. A record unrelated to the current
work unit never blocks session-init. Until the ref backend writes format versions, every record reads as version 1; a
record the in-repo implementation's build cannot parse is an unreadable entry with a diagnostic (D4).

**Profiles.** Two named install profiles, recorded per family as layout data in the registry:

- **Standard** — every state family stored; authored design reaching tracked files only through the export (D18); and
  project machinery, ARC core, and the constitutional documents tracked.
- **Ghost** — the same state families; project machinery and the constitutional documents become two project-scope
  families projected at their familiar paths; ARC core projects read-only from the installed package; the export is
  pinned to `none`.

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
| conflict records and routing receipts                                                      | write-once: each is written by the merge or by the verb that moves an entry, and a conflict record closes only by a write that names it                                                                                                                                                                                                      |

**Entry merge.**

- **Keyed on a parsed `_Id:_` field,** stamped at capture in the grammar `_Created:_` uses: eight hex characters,
  re-drawn on the rare clash within the file. The bold title stays the human handle; keyed on the title, a retitle
  would read as a delete plus an insert, which a concurrent edit elsewhere turns into a conflict or a resurrected
  entry. An entry without an ID, such as one typed by hand, gets one at its first persist.
- **Union is limited to insertions.** Disjoint insertions merge in any order.
- **A same-entry clash** — two differing edits to one entry — lands as a conflict record keeping both sides. Lists
  conflict per whole entry, with no line merge inside an entry: line merge inside entries was silently wrong in 0.2–2.2%
  of measured pairs.
- **A removal racing an edit is not a clash; the edit survives.** A removal takes out only the version of the entry it
  observed, as in an observed-remove set where add wins: an edit the removal never saw was concurrent, not later.
  Recency never decides anything.

**Three-way line merge** merges prose from the base version both writers started from; hunks both sides changed
differently land as a conflict record.

**The conflict record** is typed, keeps both sides as data with each side labelled by its machine or session and
time, names its base, and is stored with its family. A conflict is resolved only by a write that names it.

**Rank keys** generate a key between any two neighbours, so a reorder writes one stub.

**What the library is built from.** Entry merge and the conflict record are ARC's own: no library models them.
Three-way line merge wraps `node-diff3`'s `diff3Merge`, pinned to an exact version, behind one module that passes it
arrays of lines and exposes none of its types; diff alignment and conflict grouping are judgments no property test
fully pins, so proven code earns its place there. The wrapper's tests cover empty sides, a missing final newline, edits
that touch without overlapping, and identical edits on both sides. Rank keys are ARC's own code, adapted from the
public-domain `fractional-indexing` algorithm with its default base-62 alphabet, since their correctness is fully
checked by a property — a key sorts strictly between its neighbours under plain string comparison — and a test pins the
stored key format. Generating between two equal keys, which concurrent inserts produce, is handled before the key
arithmetic runs. Property tests use `fast-check`, a dev dependency.

### D7. The reference backend and the conformance suite

**The reference backend** is an in-memory implementation of the whole contract with no Git at all. It is test-only and
never shipped: it lives with the test support code, the package's build excludes it, and nothing under `src/` imports
it. It serves every family and kind, merges concurrent writes through the library by each kind's mechanism, produces
version conflicts and stale bases on demand, and defines the state version's semantics apart from Git: a monotonic,
opaque value that advances with each landed write. Its capability report answers yes (D1).

**The conformance suite** is one suite every backend passes, parameterized by a fixture per backend that declares which
families it serves, whether it merges concurrent writes, how a write reaches a state version, and how a second contract
instance opens the same store — for the reference backend, by sharing its in-memory store. The in-repo fixture
commits its tracked records as a ceremony would before it asserts reads as of a version. It runs against the in-repo
implementation and the reference backend here; the ref and local-only backends join it when built, over both store
layouts (D10). The reference backend passing it is the substitutability test run rather than argued: the contract is
implementable without Git, and Git is the storage engine, never the schema.

The suite covers, for every backend and every family its fixture serves:

1. read, write, and list round trips with identity intact;
2. `version-conflict` on a stale expected version, on every backend — for the in-repo implementation, produced by
   racing writers;
3. stale bases on merge kinds, on backends that merge: the merged version returned, a same-entry clash as a conflict
   record, a removal racing an edit leaving the edit, and disjoint insertions merged;
4. batches all or nothing, a `version-conflict` naming every stale record;
5. a batch spanning substrates refused `unsupported` before anything is written (in-repo);
6. freshness: a write to an unrelated record changes no bound check;
7. the current state version from `version`, reads and lists as of a state version, and `changes` between two;
8. reads as of a version for records outside it refused `unsupported` (in-repo);
9. listing outcomes: absent, unreadable, and complete kept distinct, every diagnostic kind, whether any entry was
   missed, and the per-record mutation basis;
10. format versions: an unknown newer version as a listing diagnostic and a read refusal naming the remedy;
11. `history` order with each write's message;
12. `lookup` by slug, former slug, lineage origin, checkout claim, and a repository plus a commit or ref, with
    `not-found` and `ambiguous-match`;
13. durability: a write is readable from a fresh contract instance over the same store when the write returns;
14. every refusal carrying its class, observed condition, and remedy;
15. the capability report;
16. `sync` against a remote the fixture provides: `pushed`, `noop`, and `reconciled`; each failure class with its
    fields, `retries-exhausted` carrying its retry count and time waited; and no remote as a state, not a failure.

### D8. The in-repo implementation

The first backend, over today's three substrates. It exists so every rerouting of callers can start on the landed
contract without waiting for the ref store, and it retires at the cutover.

**Every family, each where it lives today.**

- **Tracked records** are read and listed through `resolveArcPath` and the lifecycle index, with the records under
  `.arc/system/.internal/` joining the layout, and ride the branch's push.
- **Personal files** are read and written where they live, under the machine lock today's notes lock provides
  (`lib/user-sync/notes-lock.ts`), with a whole-file digest check. The personal-file writers — the inbox writer,
  `arc user add`, `arc init`, `arc join`, the workspace open seed, and workspace close — are served by it when they are
  rerouted onto the contract. `SESSION-NOTES.md` is a personal file here, in this identity's per-work-unit workspace, as
  today.
- **Errand records and grooming and housekeeping claims** stay on each person's transient-identity ref and keep today's
  code: reads through the tip, tree, and blob acquisition in `lib/errand/identity-snapshot.ts` and the fetched variant
  in `lib/errand/record.ts`, keeping the absent, `error`, and complete outcomes, and every write through the
  transaction in `lib/errand/identity-transaction.ts`. With a remote set, that transaction fetches the remote's ref,
  reconciles each record against the common base, applies the write, commits the tree with compare-and-swap on the local
  tip (`lib/git/ref-tree.ts`), and pushes, retrying a lost race; without one, it commits locally. The caller's expected
  record version is checked inside the transaction against the reconciled records, so a stale one is `version-conflict`;
  a record on the ref that changed both here and on the remote, or an entry there that fails to parse, refuses every
  write to the ref, whichever record it names, as today (D4).
- **The work-item family is listed one kind at a time:** a work unit's meta from the tracked tree, an Errand's record
  from this person's ref. A listing that names no kind refuses `unsupported`, recoverable by listing each kind, and the
  lifecycle index lists the meta only, so the state of an Errand ref never reaches it.
- **`history`** serves tracked records through the branch's commits and Errand records through their ref's commits,
  and refuses `unsupported` for a personal file, since no caller reads one's history before the flip.
- **Kinds with no home in today's substrates** — the inbound list, conflict records, routing receipts, an Errand's
  description, the Errand queue, durable review facts, adversarial-pass records, project identity and counters, and the
  reserved families — list as `absent` and refuse writes `unsupported`, naming that the kind has no home before the
  flip. Until then an Errand's goal stays in its record's `intent` and its origin entry, each person's queue in their
  execute-bound marks, and a pass's results in `ADVERSARIAL-PASSES.md` (D5).

**It mirrors today, commits included, and makes no commit on the checkout's branch.** A write through the contract is
today's write: for a tracked record, the file where it lives; for a personal file, a locked write; for a
transient-identity record, today's transaction on its person's ref. Staging belongs to today's commit protocol, not to
the store: a contract write leaves the index as it found it, and each verb keeps the `git add` it runs today — some
stage their writes, others leave them to a ceremony's commit step — so rerouting changes no index state. Every branch
commit ARC makes stays as it is until the flip — each ceremony's commit step with its class tag and routing, the commits
`arc start` and `arc rename` make themselves, the verification commit carrying `arc attest`'s records, the task list
riding its code commit, and ROADMAP rendered and staged by the verbs that stage it today. No verb gains a commit: a
ceremony's save step is its own commit, behind today's gates. The write-then-`git add` protocol and the next actions
that require a commit (`commit-selection`, `commit-boundary`, `candidate-publication-commit-required`) stay as they are.

**Reads return the working tree; the state version names saved state.** Reads of this checkout's records return the
working tree where it holds the selected copy. An edit made by hand — a draft, a ticked checkbox — and a verb's staged
write are in no state version until the commit carrying it lands: the ceremony's, or the code commit a task list rides.
A record's own version, its content digest, is exact from the write, so compare-and-swap and bound checks never wait on
a commit; a caller that anchors on the state version commits first, as handoff already does. The conformance suite
asserts over writes made through the contract; uncommitted edits are working-copy behavior outside it.

**Records on other branches** are listed and read through today's composed lifecycle index and in-flight derivation
(`lib/work-unit/composed-lifecycle-index.ts`, `lib/git/in-flight-derivation.ts`, `lib/git/remote-ref-reader.ts`):
local branches, and pushed branches through remote refs, degrading to the last-known refs offline as today. They are
read-only and read live. Where a record is both in the working tree and on another branch, reads and lists return the
copy today's composition selects. A write checks the tree copy, so where the tree copy disagrees with the selected
one — the index then withholds the writable path — the write refuses `checkout-not-writable`, as abandon and rename
refuse without current-checkout write authority today, naming where the selected copy lives. A record with no tree
copy is read-only here.

**The state version** is the checkout's branch tip, `HEAD`, which advances at each commit on the branch; `version`
returns it. Personal files, transient-identity records, and other branches' records keep per-record versions — content
digests and blob object IDs — and sit outside it; nothing binds them to the state version (D2), and reading them as of
a version, or the changes between two, refuses `unsupported`. A transient-identity listing still comes from one tip,
so it is consistent in itself.

**Batches.** A batch spanning substrates is refused whole, `unsupported`, before anything is written. Within one
substrate it is all or nothing:

- tracked records are written together, each checked against its current bytes as the Candidate store checks today
  (`lib/work-unit/candidate-record-store.ts`), and every one is restored if any write fails; a verb that stages them
  keeps doing so under the index lock, as start graduation and a dependency-edge discharge do through
  `captureGitIndexState` (`lib/git/exec.ts`) and park landing does by hand (`lib/work-unit/park-planning-landing.ts`);
- a transient-identity ref's records land in one transaction;
- a personal file lands in one locked write.

Verbs that cross substrates today — the workspace close when a work unit leaves active state, Errand close's inbox drop,
promotion, and the inbox drain — keep their order and idempotent reruns.

**Sync.** Contract `sync` covers personal files, through today's notes sync, and transient-identity refs, through their
reconcile and push (`reconcileErrandPush` in `lib/errand/merge.ts`), and reports D4's outcomes with the in-repo
additions. A transient-identity write also publishes inside the write, as its transaction does today (D4). `arc sync`
keeps pairing the branch push with the notes push under the push interlock (`handlers/sync.ts`); once `arc sync` is
rerouted, its notes leg goes through contract `sync`. The branch push is never part of contract `sync`.

**Entries.** The inbox writer stays keyed on an entry's title and source digest and stamps no `_Id:_`, so every
unrelated byte stays as today. `arc user inbox-remove` keys on the title, recomputing the digest under its lock.

**Reverse lookup** keeps today's derivations (D3).

**The capability report answers no** (D1, D15).

**Named costs,** accepted for the interval before the flip:

- the next actions that require a commit stay in the machine contracts;
- today's write-context preflights stay, reported as `checkout-not-writable`;
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

- **The current-work-unit resolver** returns the checkout's work unit by identity. Over the in-repo implementation it
  resolves as today's code does — the only meta in this checkout's flat `active/`, the lite layout's `status.md`, or the
  contributor root under `.arc/user/<identity>/active/` — giving the answers `resolveActiveWu`
  (`lib/release/wu-resolution.ts`), `readActiveMetaCandidates` (`lib/active/meta-reader.ts`), and `resolveCurrentWuSlug`
  (`handlers/lifecycle.ts`) give today, and the count the one-work-unit-per-worktree guard takes. Those three become
  delegates over it, so their call sites are served unchanged. The resolver moves onto the checkout marker plus the
  store before the projection's `active/current/` layout lands (D13), since it reads `active/` without recursing.
- **The lifecycle index keyed by identity** lists work units by identity with their parsed meta fields, never a path,
  and answers `lookup` for lineage by slug and in-flight work by checkout claim. Over the in-repo implementation it
  composes from `resolveComposedLifecycleIndex`, keeping its selected copy, its current-tree copy, and its writable
  authority. Existing callers of today's index keep their code until rerouted; for every caller that reads the meta
  through an index entry's path — at least ten — the index serves it in the sense the success criteria test: for each
  of its queries, it returns the same records and fields that path read does.
- **The store behind the integration checkpoint's lifecycle port** (`IntegrationLifecycleStoragePort` in
  `scripts/integration/checkpoint-composition.ts`, whose `readSnapshot` returns `{ version, fs }`). Its version is the
  contract's `version`, and its file reads resolve through the layout resolver to the contract's reads as of that
  version. Over the in-repo implementation that is `HEAD` and the tree at `HEAD`, exactly as the default ports in
  `checkpoint-composition.ts` and `merge-composition.ts` build today, and those defaults become this store. The
  checkpoint's binding moves onto its lifecycle records and code head (D2) before the flip: from the flip the state
  version covers every record, and `merge.ts` compares the port's version whole, so an unrelated write would
  invalidate it (D15).

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

- **The push loop** fetches into the remote-tracking namespace, merges entry by entry, and retries with jittered backoff
  sized to the host's push time on `fetch first`, `non-fast-forward`, `incorrect old value provided`, GitHub's
  `cannot lock ref`, and Azure DevOps's `TF401028`; any other refusal ends the loop and shows the server's message.
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

- `active/current/` holds the work item this checkout's marker names. For a work unit, that is its files flat as
  `active/` holds them today, plus a copy of each cohort document its `Cohort` field names; for an
  Errand, its description, `errand-<slug>.md`, in whichever checkout the Errand occupies, the primary included.
  `active/in-flight/<slug>/` holds other in-flight work items, read-only —
  an Errand while it is open elsewhere, paused, or awaiting merge; the checkout's own never appears there. Which ones is
  a personal setting — `mine` (the default), `cohort`, or `all`, plus named pins — so paths stay stable and only
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
- **Ordering:** the current-work-unit resolver reads `active/` without recursing, so it moves onto the checkout marker
  plus the store before this layout lands. Session-init's slots that carry literal `.arc/active/meta-<slug>.md` paths
  — the active path, the frame's meta and task-list paths, load-set entries, and the reconcile command — and the
  compaction seed take their paths from the layout resolver first, and the seed's schema version bumps.

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

**Conflicts show in the projected file itself,** and status and the refusing verbs report them too. `WORKING-MEMORY`
loads into every session, so a conflict shown only in status would have every session read one side as settled.

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

**Persisting.**

- **Write-back.** At the start of every `arc` command in a checkout, beside the refresh it already runs there, the
  projection writes back pending edits: the work unit's files and the user surfaces, and in the owning checkout the
  meta and task list. Each kind's parser accepts a hand edit and refuses, reporting it, a change to a field only a verb
  may set, while the file keeps the edit. A file that fails to parse is skipped and reported, never blocking the
  command. There is no setting to turn write-back off: it moves a file the editor already saved into the store, as a
  sync tool does, and turning it off would only leave edits out of other worktrees' views longer, exposed to
  `git clean -x`, and open to conflict for longer.
- **`arc save`** writes back the checkout's pending edits at once and returns the state version — a named point in
  history carrying the per-write message. It replaces `arc user save`.
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
  start; and every code path that writes, renders, or checks the stored ROADMAP. The cutover's
  deletion pass removes the arms for today's behavior.
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

**One close verb** closes a set of tasks — marking each complete, and each parent whose subtasks are then all
complete — and captures the increment's commits, `HEAD` or named commits, into their task records.

- It runs after the commit, which it never makes. The commit is the increment's as today, behind the increment's
  structured gate, which already covers work and commit, and routed as a task-commit fire site; it may come from an
  editor or from ghost mode's own tooling. Completion therefore lands after approval.
- **Completion is a field only the verb sets.** Write-back persists every other task-list edit — a task added,
  reworded, or annotated — and refuses a hand tick, reporting it and naming the verb while the file keeps the edit. The
  parent cascade is computed, never kept by hand.
- A task's record holds a list of commits, which may be empty: a task that produced no commit closes with none.
- **The capture survives rewrites.** It holds each commit's SHA and patch-id (D3). ARC's own rewrites — the history
  policy's catch-up with base — remap captures from the rewrite's old-to-new mapping, and running the verb again after
  an amend replaces that increment's capture.
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
- **Nothing depends on commit reachability.** State keys to work units and identities, never to a code commit; a
  capture that names a commit carries its patch-id and is remapped by ARC's own rewrites (D3, D16).
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
- The in-repo implementation adds a layer of indirection over today's reads and writes and no new Git invocations
  beyond what today's code paths make.

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
   meta through the lifecycle index, a Candidate record, a transition record), personal files (`USER-INBOX` entries, a
   `SESSION-NOTES` file), and Errand records (the absent, `error`, and complete snapshot outcomes) — a consumer's
   reads through the contract return what its current code path returns over the same repository, and writes through
   the contract produce the bytes today's writers produce.
6. **The shared pieces serve their existing call sites.** `resolveActiveWu`, `readActiveMetaCandidates`, and
   `resolveCurrentWuSlug` delegate to the resolver and every existing test passes unchanged; the lifecycle index returns
   the same records and fields as today's path reads for each query of every existing caller that reads the meta through
   an index entry's path; and the checkpoint's and merge composition's default lifecycle storage is the new store, with
   their tests passing unchanged.
7. **Nothing observable changes.** The change's diff touches nothing under `packages/arc-framework/arc/` — no
   workflow, template, method, or strategy; no verb gains or loses a commit; and the existing ceremony tests pass
   unchanged.
8. **The concurrency library** is covered for: disjoint insertions merging; a same-entry clash becoming a conflict
   record with both sides labelled; a removal racing an edit leaving the edit; a retitle merging as an edit; an entry
   without an ID gaining one, and an ID clash re-drawn; clean and conflicting three-way line merges; and rank keys
   between any two neighbours sorting as specified.
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
    implementation each outcome today's notes push and Errand push report maps onto D4's as stated there, with no
    change in what `arc sync` does.
15. **Quality gates.** Markdown lint and the ARC contract checks, both type checks, `lint:ts` with no new size-gate
    suppression, `npm test`, and the build pass; E2E and portability pass in required CI.

## Open Questions

None blocks building Part A.

**Implementation detail, settled while building:** the module layout under `lib/store/`, the TypeScript names of the
operations and outcomes, and which test tier each conformance fixture runs in.

**Left to the changes that realize Part B,** each bounded by the constraint stated where it arises:

- each family's field schema, and which fields a verb owns (D5, D13), the work-item base's among them, with the name
  of its type field;
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
