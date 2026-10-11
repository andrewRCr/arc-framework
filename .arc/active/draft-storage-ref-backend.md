# Draft: Storage Ref Backend

- **Origin:** [internal] — the `state-storage` re-cut (2026-09-28); stage 2 of the storage program.
- **Purpose:** Build the store the contract's flip moves onto: operational and planning state in same-repository
  `refs/arc/*`, the same engine in a separate Git directory for a backing repository or local-only use, sync by explicit
  fetch and batched pushes, the state remote's designation, and the one-time import of today's tracked state, Git
  notes, and transient-identity refs — each to `storage-contract`'s Part B (its D10–D12 and D14).

---

## Continuity

- **Readiness:** formalization-ready (2026-10-10). Scope, boundary, and ownership are settled against the landed
  contract, every design question is settled (§ Decisions), only the particulars a spec pins down remain (§ Left to the
  spec), and the Owner's pass cleared the inbound buffer (§ Inbound dispositions).
- **Pass 1 (2026-10-10).** `storage-contract` has shipped (archived under `completed/2026-q4/`), so this draft inherits
  its Part B rather than designing alongside it, and § Scope follows the contract's text. Read: the contract's spec
  (D1–D17, D20, Open Questions) and notes (§ Consumer map's `ref-backend` rows, § Who builds Part B, § Evidence behind
  Part B, § Groundwork from `cli-substrate-complete-migration`); `analysis-storage-substrate-direction.md` § 6.9–6.10,
  10.3, and 11.1–11.7; `cohort-state-storage.md` and `cohort-storage-seam.md`; `strategy-storage-evolution.md`; and
  `storage-projection`'s draft as it stood uncommitted in its worktree on 2026-10-10, as context only.
- **Prior art (2026-10-10).** An external pass in three facets — whole-store state tokens over independently versioned
  keys, record versions over content plus metadata, and Git refs used as a database — informs the choices in
  § Decisions, with its sources and unverified claims in § Prior art. Lean on established idiom wherever it applies.
- **Next:** `create-spec`. At draft close, route the asks: `storage-projection` (the record version and base stamp, the
  serialization refusals, and rebuilding a worktree's projection from the current state when the state version its index
  records no longer resolves), `storage-cutover` (running the import again after the first push, which clears the
  transient-identity refs from the remote; the pre-import tidy, bringing every machine's notes over and finishing review
  on any machine but the importing one in the quiesce, the notes archive, `arc sync` onto `pull` and `push`, and its
  confirmation that no buffer section or held capture is left behind at import, the rehearsal's comparison of every
  Candidate chain with today's reader, and for its deletion pass the import's transform, the list of suites that retire,
  and `refs/arc/user/<id>/sync-state` retiring with notes), `seam-locus` (handoff calling `maintain()` and reading its
  own push's figures; restate and recovery pulling by name the history refs a read as of an anchor refuses for, then
  retrying; recovery rebuilding from the current state when a compaction seed's state version no longer resolves; and
  restate from another person's anchor reading project scope alone), `seam-lifecycle` (reopen pulling the item's history
  ref by name first), every `storage-seam` member (a verb that writes a completed item's records, a resolving write
  among them, pulling on the same refusal and retrying), `config-storage-architecture` (where the designation lives),
  the `configuration` follow-on, `public-repo-flip` and its register row (this repository's personal state publishes
  with its project state, superseding the row's 2026-10-06 amendment), `history-policy` (`carry` takes a lease),
  `ghost-mode` (the fixture declares its two families once it places them; and the designation rule's ghost cases, its
  local-only pointer and an install without one never designating the code remote, with their tests), and the cohort
  record — its import-scope line, which this draft decides (§ Decisions, The migrate verb and the import), and its
  stage-2 ordering text and this member's _Consumes:_ line, which the `Depends On` edge changes. The forward amendments
  to the contract's D1, D4, D6, D10 (the moved-project ref, the going-public wording, and the size cap's scope among
  them), D12, and D14 (§ Decisions) are recorded for the spec stage. `seam-record-kinds` already has a pointer in its
  session notes (2026-10-10), and its draft holds the anchor field and the import's fold of `SESSION-NOTES.md`; at draft
  close it learns of the `Depends On` edge this work unit takes on it (§ Decisions, Ownership), which the capture commit
  sets in this work unit's meta.

## Problem / Motivation

The contract landed with two backends: the in-repo implementation over today's substrates, which retires at the
cutover, and an in-memory reference backend that never ships. The flip needs a third that keeps state in Git refs —
the default for every repository, and the engine under the backing-repository and local-only backends (D14). Without
it there is nothing to flip onto: the seam's rerouted callers, the projection, and the cutover all build against the
contract and wait on a store that holds state off the checkout's branch.

The contract fixed what callers see: the operations and their failures (D1–D4), the ref layout (D10), each surface's
concurrency mechanism (D6, D11), sync and freshness (D12), and the backends and the move (D14). It left this work unit
the engine: how records, versions, and metadata sit in refs; how a state version names the whole store without a ref
every write updates; how sync fetches, merges, and pushes; how lifecycle moves and lookups run over hundreds of refs;
and how today's state gets in. A defect here is lost or misattributed state on every machine that syncs, so rigor
concentrates on writes, merges, and the import; fetch and the read path are retryable and take lighter handling.

It has worked when the conformance suite passes over the ref backend in both layouts with no exclusions beyond the
reference backend's and the two families ghost mode places, the import's comparison reads every record alike but for
its named transforms, and `storage-cutover`'s rehearsal flips a clone of this repository onto it (§ Decisions,
Verification).

## Scope

What this work unit builds, each to the contract's text:

- **The ref backend** (D1–D5, D10): the whole contract over `refs/arc/*`, its capability report answering yes — the
  ref layout keyed by UID; records with their versions, format versions, placement, and links; batches through
  `git update-ref --stdin`; provenance rendered as commit messages; `history`, `changes`, `version`, and `lookup`;
  archive into each quarter's ref with its sequence, and ended work items' refs under `refs/arc/history/`; the project
  ID, record-number counters, and lineage in the registry ref; write serialization by compare-and-swap under a
  machine-local lock per surface; and each kind's write check (`cohort-storage-seam.md` § Shared contracts, item 11),
  called in `write` and `batch` from the flip.
- **Local-only and the backing repository** (D10, D14): the same engine with sync switched off, and with another target.
  The store sits in the code repository's own refs when state shares the code remote, and in a separate Git directory at
  `.git/arc/store/` otherwise; the layout derives from the backend selection. The migrate verb moves a clone between the
  layouts and a project's state between remotes (§ Decisions, The migrate verb and the import).
- **Sync and the explicit state fetch** (D11, D12): fetch into a remote-tracking namespace outside `refs/remotes/`,
  the refspec passed on the command line, at session start, every firing point, and `arc sync`; the push loop with its
  retryable and terminal refusals; atomic publication across state refs; one `--atomic` push for code and state where
  they share a receiver, and ordered legs where they do not; merge on fetch by each kind's mechanism, with a conflict
  record for a single-writer record changed on both sides; and the ancestry check on each new state head — through the
  contract's `pull` and `push`, its `sync` renamed and a fetch-only operation added (§ Decisions, Sync). Personal
  surfaces publish through this `push`, which is what moves user sync onto the store; rewiring `arc sync` onto it and
  deleting the notes machinery are `storage-cutover`'s (the consumer map's `handlers/sync.ts` and `commands/user/`
  rows).
- **The state remote and its sources** (D14): the per-clone designation, never pushing `refs/arc/*` to a remote the
  person has not designated; read-only behavior until one is; and an upstream's state fetched as a read-only source
  for a fork contributor.
- **Serialization rules** (D10): text only, one size cap of about 1 MB, `.env` and private-key files refused, each
  refusing `record-malformed` naming the broken rule — enforced in the backend's `write` and `batch`, so every writer
  meets them, and in the import's build, which lands outside them; the size cap, at write and at read, reaches every
  kind the working copy shows, a forward amendment to D10 (§ Decisions, Ownership).
- **Maintenance and growth** (D10, D11): `maintain()`, which runs `git maintenance run --auto` and returns the growth
  tripwire's measurements, and the push loop's retry count and time waited on every outcome (§ Decisions, Maintenance
  and measurements); and the reserved rotation continuation field, rotation itself deferred.
- **Errand acquisition** (the consumer map's `ref-backend` rows): Errands as project-scope work items at
  `refs/arc/work/<uid>` and grooming and housekeeping claims at `refs/arc/user/<id>/claims`, read and written through
  the backend — the tip, tree, and blob acquisition in `readTransientIdentitySnapshot`
  (`lib/errand/identity-snapshot.ts`), the identity transaction in `lib/errand/identity-transaction.ts`, and the
  fetched variant in `lib/errand/record.ts` — keeping D4's listing outcomes.
- **Git access** (§ Inbound dispositions): the executor capabilities the engine needs — compare-and-swap with typed
  rejections, atomic pushes, batched Git calls, and cancellation on the stdin variants — and ARC's Git floor raised to
  2.47.
- **The import** (D14, D16; § Inbound dispositions; the register's personal-subdirectory row): today's tracked state,
  Git notes as one snapshot, and the transient-identity refs into the store, with UIDs minted per owner — the migrate
  verb's one-time source (§ Decisions); `storage-cutover` runs it.
- **Verification** (D7; § Inbound dispositions): the conformance suite over the ref backend in both layouts, the
  multi-process lane `storage-projection` asks for, sizing what survives for CI, and the Windows portability lane.

**Owned register rows:** notes sync reading every subdirectory of `.arc/user/<id>/` as a workspace
(`classifyUserSyncPath` in `lib/user-sync/classifier.ts`); and the Errand identity refs with notes sync's
`refs/arc/user/<id>/sync-state` and their shared plumbing. **Consumer-map rows:** the seven in the `ref-backend`
partition — `lib/git/ref-tree.ts`, `lib/user-sync/cas-retry.ts`, `lib/errand/ref-tree.ts`,
`lib/errand/identity-snapshot.ts`, `lib/errand/identity-transaction.ts`, `lib/user-sync/classifier.ts`, and
`scripts/review-gate/status-errand.ts`.

## Decisions

### Class, depth, and boundary

- **`Class`: `Heavy`** (the estimate, confirmed). Both triggers fire. Derivation: the contract fixes what callers see
  but not the engine — record encoding, the version model, the sync loop, and the import must be designed before a
  competent engineer starts. Scale: Git plumbing across reads, batches, sync, archive and history moves, lookup, two
  store layouts, and an import over every substrate. Not `Novel`: the design composes from the contract, the September
  spikes, and the ref machinery the CLI already runs (`writeTreeCommit` in `lib/git/ref-tree.ts`, the Errand identity
  transaction, `lib/user-sync/cas-retry.ts`). The state version (§ Decisions) was the one place invention could
  arise, and it composes: a store with no global writer names its whole state by a snapshot of per-shard positions —
  a Flink checkpoint, a `jj` view, CouchDB's clustered sequence — and Git makes that snapshot one object (§ Prior art).
- **Depth: `high`.** Multi-session.
- **Boundary: stays one WU** (Owner, 2026-10-10): one engine behind one contract, landing single-branch with local
  review chunking and no delivery plan (`cohort-state-storage.md` § Soft coordination). The import is the most separable
  piece — it reads through the contract, and the layout moves D10 names need a migrate verb regardless — but it stays
  here, landing through that verb's transaction (§ Decisions, The migrate verb and the import). Re-raise only on
  material new evidence, such as an import design that proves independent of the engine and too large for review
  chunking to hold.

### Inherit Part B, never re-author it

`storage-contract`'s Part B binds whoever realizes it, and its Part A types and conformance suite encode it wherever it
is observable through the contract. Where this design finds D10–D12 or D14 wrong, the fix is a forward amendment to
the contract's spec, named as such for the Owner — never a quiet redesign in this draft.

### Dark until the flip

The ref backend answers yes to the contract's one capability (D1), and nothing selects it before the flip (D15): the
in-repo implementation serves this repository until `storage-cutover` flips it. The backend is verified by the
conformance suite and integration tests over real repositories and remotes, then live in `storage-cutover`'s
rehearsal.

### Ownership (Owner, 2026-10-10)

- **Tripwire bounds.** The backend emits the measurements; `seam-locus` owns the bounds and the handoff report that
  shows them, as `cohort-storage-seam.md` § Shared contracts records. This settles the contract notes' § Who builds
  Part B, which gave this work unit the growth bound.
- **The state remote's designation** is built here, with where it is kept, and waits on nothing. It stays in Git
  config, outside `config-storage-architecture`'s move of the `arc.*` preferences into files (§ Layouts and remotes).
  This settles the contract's open question, which named that work unit.
- **Serialization rules** are enforced in the backend's `write` and `batch`, since a verb's write never passes through
  the projection, and in the import's build, which lands through the migrate verb's transaction and refuses what the
  serialization rules refuse at `write`; `storage-projection` reports the backend's refusal at persist rather than
  keeping its own copy of the rules. The size cap guards against an accidental file, which history keeps for good (D10),
  so it applies to every kind the working copy shows and to none the registry never projects (`projection: "never"` in
  `KIND_MECHANISMS`, `lib/store/registry.ts`) — the Errand record, the review records, the registry, lineage, and claims
  kinds, conflict records, and routing receipts — which only ARC's verbs write and no hand edit reaches, since
  write-back and `arc save` persist working-copy files (`spec-seam-record-kinds.md` § 3.2). That is a forward amendment
  to D10's "one size cap for every kind", which a Candidate record breaks in ordinary use: one work unit's reached 2.67
  MB, and 21 committed versions are over the cap (2026-10-10). No guard replaces the cap for those kinds: D10's growth
  tripwire measures only the four refs that never retire, which hold the registry, lineage, and claims kinds, and a work
  item's ref stops growing when its item ends. The import replays those versions as the bytes code history holds, all
  already canonical, so in the same-repository layout it adds commits and trees, never blobs. Reads follow the same
  scope: a listing reports a stored record over the cap as `oversized` (D4) only for a kind the cap reaches, so a
  never-projected record over it lists and reads as any other, and the shared suite's `diagnostic-oversized` assertion
  narrows to those kinds (§ Verification).
- **`Depends On: seam-record-kinds`** (Owner, 2026-10-10). The backend's write path consumes that member's code: the
  kind registry taking registrations rather than bare parsers (`createKindRegistry` in `lib/store/registry.ts` takes
  parsers only today), each registration's write check and `anchorFields`, `HAND_EDIT_VERBS`, the production
  registration set (`lib/store/kinds/registrations.ts`), the fixture's write-check declaration and the registry override
  its item installs through, and the conformance item that declaration puts into play. Design runs alongside, and what
  this design consumes from it is re-read before this work unit's spec is approved, after that member's; implementation
  starts once it ships. No edge, with whichever member landed first adding the agreed shapes, was the alternative: it
  keeps stage 2 parallel, but has this work unit build another member's design. The import writes the seam's record
  kinds but runs at the cutover, which depends on every seam member and on this work unit.

### The version model, push shape, and this repository's backend (Owner, 2026-10-10)

- **Two identifiers per record.** The record version, the compare-and-swap basis (D2), covers content and metadata, so
  a metadata-only write moves it. The content's Git blob id stays `storage-projection`'s base stamp and the three-way
  merge base, unchanged by a metadata-only write. This is the established split — Kubernetes' `resourceVersion` beside
  `generation`, Cloud Storage's `generation` beside `metageneration` — and it avoids the hole S3's content-only ETag
  leaves. The in-repo implementation keeps its content digest. A record version repeats when a record returns to
  earlier bytes, which is safe for compare-and-swap, since equal state is safe to overwrite, but signals nothing;
  `changes` and `history` read commits, which never repeat.
- **Pushes stay fast-forward,** never forced. Store history is immutable (A4), and a lost race rejects as
  `non-fast-forward` or `fetch first`, which D12's retry set already names. Every push of a work item's or cohort's ref,
  live or under `refs/arc/history/`, is leased on the tip last seen, or on absence for a ref this clone never saw, and
  so is every delete, which is never a fast-forward. Another machine's lifecycle move deletes exactly those refs, so an
  unleased push recreates one: a live ref another machine's end deleted between the push loop's pull and its push (the
  model check, § Prior art), or a history ref, which sits outside the default fetch, that another machine's reopen
  deleted (§ Sync). The quarter, registry, inbox, and identity refs no move deletes push plainly. A matching lease lifts
  Git's fast-forward check (a scratch push on Git 2.55, 2026-10-10), so a leased update stays a fast-forward because the
  backend pushes only a commit that descends from the tip it leases, never because Git checks.
- **An identical rewrite is a no-op,** as Git declines an empty commit: no commit and no history entry, and the record
  version stays. A retried write costs nothing, and `history` and `changes` show only writes that changed something;
  provenance is never evidence (D3), so nothing rests on a write that changed nothing.
- **The state version is a manifest of the store's ref tips,** built by `version` on demand, its Git object id the
  token. Every surveyed store without a global writer names its state this way — a Flink checkpoint, a `jj` view,
  CouchDB's clustered sequence — and the conformance suite fits it as written: `registerStateAssertions`
  (`__tests__/helpers/store/suite-versions.ts`) compares state versions only for equality, and since tips are commits, a
  manifest never repeats. A manifest names the live refs, the archive's quarter refs, and the identity refs its clone
  holds, never `refs/arc/history/`, whose set differs from clone to clone. `changes` is each changed ref's log between
  two manifests' tips — every landed mutation with its provenance, ordered within a ref. A ref in one manifest only
  reads by its namespace:
    - **A work item or cohort in the older only** has ended: it reads by its end from its history ref's log, archived or
      not, since a quarter's folder holds current state only (D10); a history ref this clone lacks refuses as a read as
      of the manifest does (below).
    - **A work item or cohort in the newer only** is new since the older, read from its root, or reopened since it, read
      from its reopen — the commits the history tip it moved back from does not reach. What landed on the completed
      item before the reopen reads through its quarter's ref, whose folder each such write refreshed (§ Lifecycle
      moves).
    - **A work item or cohort in neither,** created and ended between them, is found by its end's record among the
      quarter's or the registry's changes and reads from its root on its history ref, which it needs as the first case
      does.
    - **Any other ref in the newer only** — a quarter, the inbox or registry, or an identity ref — is new since the
      older and reads from its root, so a person's first personal write, or their personal ref fetched for the first
      time, reads whole.
    - **Any other ref in the older only** reads nothing: an identity ref never ends, so one is missing only from another
      person's clone, since each clone fetches its own identity alone (D10), and a shared ref leaves only by loss, which
      the next push restores (§ Sync). So `changes` between two people's manifests carries the newer one's identity
      history whole, and a reader that wants project scope alone restricts to it — restate from the previous owner's
      anchor, when a work unit is handed to another person (D5). Comparing identity refs only where both manifests carry
      them was the alternative, but it cannot tell another person's ref from one created since, and telling them apart
      takes the clone's identity, a Git call on every no-change check (below).
- **A no-change check costs one Git call.** `version` reads every tip with one `for-each-ref` of `refs/arc/` as a single
  pattern, with `--exclude=refs/arc/history/` (Git 2.42), keeps the store's refs (§ Record encoding) in process, since
  Git reads one snapshot per pattern (a torn cut, below), and computes the manifest's id in process — Git's tree format
  is fixed, and a test holds the id to Git's own write. Finding the store costs no call: the common Git directory comes
  from the worktree's `.git` file and the `commondir` file it leads to, as Git lays out a linked worktree
  (`gitrepository-layout`; checked on Git 2.55, 2026-10-10), and the store directory's presence there selects the
  separate layout (§ Layouts and remotes). The manifest takes every identity ref present, so it needs no identity read,
  and the designation is read by `pull`, `push`, and the migrate verb, which reach a remote anyway. The same call reads
  `refs/arc/tmp/version`, a machine-local ref outside the state (§ The migrate verb and the import) naming the last
  manifest this clone wrote: an equal id writes nothing, and a new one writes the manifest and moves the ref, which also
  keeps the newest token from collection. A live listing carries the current state version on this backend (D4), and
  `storage-projection` budgets its no-change refresh at one Git call, 60 ms on Windows, where a spawn costs about 30 ms.
  Writing every manifest was the alternative, a second spawn on every live read.
- **A torn cut is accepted and stated.** Under the files ref backend a concurrent reader may see part of a multi-ref
  `update-ref --stdin` transaction, so a manifest built in that moment names a state no writer produced; `changes` heals
  at the next manifest, and only a read as of that one is wrong. A store directory ARC creates itself — the separate
  layout's — uses Git's reftable format, which commits a multi-ref transaction atomically for a reader that lists in
  one iteration and which every supported Git has, waiting for its lock from 2.47, the floor this work unit sets
  (§ Git access). `for-each-ref` reads one snapshot per pattern: under a writer moving two refs in one transaction, one
  pattern saw no torn listing in 11,303 against 81 in 11,221 with two, and the files format tore with either (scratch
  probes on Git 2.55, 2026-10-10; § Prior art) — hence `version`'s single pattern. Re-reading the
  tips until two reads agree was the alternative, a spawn on every check for a window the next manifest heals.
- **An unresolvable state version** — never fetched, collected, or naming an ended item whose history ref this clone
  lacks — gets a refusal code of its own, naming any history refs it lacks, whose remedy is to fetch them or rebuild
  from the current state, and a write to a completed item whose history ref this clone lacks refuses with it too: a
  forward amendment to D4, since `unsupported`'s `uncovered-state-version` case names another condition, whose remedy,
  binding per-record versions, would not recover this one.
- **A manifest travels with the anchor that names it.** The commit that writes a state-version anchor into a record
  carries that version's manifest beside it, unprojected, so the anchor and its manifest land in one commit on one ref
  and stay reachable for as long as that ref's history does, under `refs/arc/history/` too. Only an anchor written into
  a record has to resolve on another machine; a token a machine keeps for itself, such as a compaction seed or a
  projection index, rests on Git's own expiry and the unresolvable-version refusal, whose remedy rebuilds from the
  current state — the projection's rebuild of a worktree and recovery's of a seed, routed to their owners
  (§ Coordination). A pinned snapshot ref, `jj`'s idiom, was the alternative: it turns every anchor write into a
  publication across two refs that needs atomic capability (A7) and reopens the torn cut, needs a merge rule for one
  person's machines, and either grows for good or needs rotation built now — all for portability no consumer uses.
- **A kind declares which of its fields hold an anchor,** as an optional `anchorFields` list on its registration with
  the kind registry (`createKindRegistry` in `lib/store/registry.ts`), the shape `spec-seam-record-kinds.md` specifies
  (§ 2.1): parsed-field keys, never Markdown labels, typed so that only a field whose parsed value is a state version or
  null qualifies — the meta's `stateAtHandoff`, its `State at Handoff` (its § 5.5). On a write of such a kind the
  backend reads the field from the parse the write check already needs, and when its value changed, puts that token's
  manifest in the same commit; a null carries nothing. A token this machine cannot resolve refuses the write with the
  unresolvable-state-version refusal, naming the field, rather than store an anchor nothing resolves. `write` taking the
  token was the alternative: explicit, but every anchor-writing caller would have to remember to pass it, where the
  declaration says it once per kind.
- **The manifest is a Git tree with one subtree per namespace,** sharing every unchanged subtree with the manifest
  before it, so each anchor adds a few small objects. Its entries name commits without keeping them alive, which the
  refs holding each tip already do. It sits at one fixed, never-projected path in the anchor's ref, overwritten at each
  anchor write, with earlier manifests reachable through that ref's history; the token is the manifest's tree id, so it
  resolves without its path. A manifest keeps an ended work item's last tip after its ref moves under
  `refs/arc/history/`, so a read as of it, or `changes` from it, needs that history ref, which a clone holds only once a
  pull has fetched it: the pull that applied the end, or one that names it (§ Sync). A clone that never saw the end — a
  fresh clone reading another machine's anchor — lacks it, so the operation refuses with the unresolvable-state-version
  code naming each history ref it lacks, and the verb that called it pulls them by name and retries, with no stop, as it
  does when a write to a completed item refuses for the same want (§ Lifecycle moves). A person meets the refusal only
  when that pull fails. With the remote unreachable, they rerun the verb once it answers; with the remote answering but
  holding no such ref, the retry resolves through a reopened item's live ref, which the same pull fetched and whose
  history holds the same commits, or refuses again with the remedy to rebuild from the current state for a read, and for
  a write the remedy § Lifecycle moves gives. The verbs are reopen's (§ Lifecycle moves), continuity's readers of an
  anchor — restate and recovery through `changes` — and any verb that writes a completed item's records. Fetching inside
  the store on demand was the alternative, a remote call inside a local operation (D4) with an offline outcome of its
  own.
- **Compare-and-swap happens at the ref.** Git's one atomic primitive is a ref's compare-and-swap, so the backend
  follows Gerrit NoteDb: it checks each record's version for the semantic conflict, lets the ref's old-tip check guard
  the race, and on a lost race re-validates and retries the whole operation — D11's machine-local lock plus
  compare-and-swap.
- **Each written record's write check runs before the compare-and-swap,** from the flip, in `write` and `batch`: the
  standalone function `spec-seam-record-kinds.md` specifies (§ 3.1), given the record's reference, its prior and next
  records, the writer, and two read-only views — `read`, `list`, and `lookup` — `before`, over the current tips the
  write found, and `after`, over the state the batch produces, the batch's new trees laid over those tips; one rule,
  `work-item.slug-edges`, judges a reused slug against `before` (its § 5.3). The backend builds those trees before it
  commits anyway, so the views cost a tip set, and a lost race's retry rebuilds them and runs the checks again. Content
  that fails its kind's parser refuses `record-malformed` with the parser's error before any check runs, and a stored
  version that fails to parse, which only a merge or the import stores, reaches the check as a prior with its content
  and no fields (its § 3.1). A write against an older version of a merge kind is a stale base this backend merges (D3),
  and the check's next record is the merged content the write would persist (its § 3.4). The writer comes from the
  batch's verb: the verbs in `HAND_EDIT_VERBS`, beside `CallerProvenanceSchema` in `lib/store/links.ts` and added by
  `seam-record-kinds`, read as a hand edit, and any other verb as itself, so the authority rules fire at this backend's
  write too (its § 3.2). A broken rule refuses the existing `record-malformed` (D4), naming as its rule the first broken
  rule in identifier order (UTF-8 byte order) and as its reference the first record in the batch's write order that
  breaks it, with that rule's condition and remedy, the condition counting the other broken record-and-rule pairs; the
  hand-edit paths, write-back and `arc save`, call the check directly and get every violation, and a verb that breaks a
  rule is a defect or stale state one rule diagnoses (its § 3.4). A rule that reads records outside the batch holds as
  of the write: the compare-and-swap does not guard what it read, so a race or a merge can produce a state it would
  refuse, and readers report that state, as D14's slug guard holds write-then-gate.
- **This repository runs the default backend,** its personal state published with its project state. Nothing in it needs
  hiding, and the project should exercise the path most teams will take; the backing repository is there for the
  projects that need it, not the expected case. This supersedes the 2026-10-06 amendment to the register's
  `public-repo-flip` row, which held personal state off the public remote until a backing repository or local-only
  backend arrived. The contract never split publication by scope — identity scope is not private, and privacy is the
  backing repository's (its § Security and trust boundaries) — so D10's sentence that a repository going public moves
  its state to a backing repository describes the choice for one that wants its state private: a wording amendment to
  D10.
- **Its personal state is pruned and brought to D5's layout before the import.** On a public repository the import
  publishes it, and store history is never rewritten (A4), so whatever the import carries is public for good.
- **Where personal state publishes stays with the backend for now; a designation per scope is a deferred follow-on,**
  never precluded. On the default backend identity-scope refs — `USER-INBOX`, `WORKING-MEMORY`, scratch, claims, the
  Errand queue — publish with project state, since D14 designates one state remote per clone. Pushing them is what
  backs them up and carries them to a person's other machines; worktrees on one machine share them without a push.
  Holding them back by default would cost every person that backup for a privacy most do not need. The gap is a team
  member's: the backing repository and local-only are the project's choice, so nothing keeps one person's personal
  state off the team's remote. The contract rejected a successor to `user.notes_push` (§ Alternatives) because a held
  push only delays the same exposure, which never pushing does not, and because per-family switches are the matrix one
  knob avoids. The principled form is a designation per scope: the project's remote is the project's call, and the
  person's — the code remote by default, a remote of their own, or none — is theirs. How private it can be is the hard
  part. Kept in the code repository's refs, personal refs share a transaction with project refs — starting an Errand
  from a personal inbox entry is one batch across both (D11) — but a mirror push still publishes them; moved to a
  separate Git directory, they are private by construction, and that batch spans two directories that cannot commit
  atomically. This backend composes its push set by scope, so the designation lands additively. The follow-on likely
  belongs to the `configuration` cohort, beside `config-storage-architecture`, which owns user-scope configuration; its
  tripwire is a person asking to keep personal state off a shared remote.

### Record encoding (Owner, 2026-10-10)

- **A ref's tree encodes its records.** The backend decodes a tree into records, merges and versions those, and encodes
  them back, so no merge or version reads a raw path. Each kind's stored path comes from the kind registry, as a home
  for this backend beside the in-repo implementation's (`InRepoHome` in `lib/store/registry.ts`); the registry already
  places each family with stored kinds on its ref, `review` and `lineage` as subtrees (`FAMILY_REGISTRY`; the five
  without a ref, § Decisions, Verification).
- **The store is its families' refs and the two namespaces their retention adds.** The backend reads, lists,
  manifests, and merges only refs matching the patterns `FAMILY_REGISTRY` gives, plus `refs/arc/archive/<quarter>` and
  `refs/arc/history/{work,cohort}/<uid>`, which the registry lists nowhere and this backend derives from
  `retention: "archive-and-history"` on `work-item` and `cohort` — `for-each-ref` takes them as patterns (tested on Git
  2.55, 2026-10-10), and `version` keeps them from one listing (§ The version model). Other refs under `refs/arc/` are
  invisible to it: in this repository today `refs/arc/user/andrew/errands`, `errands-remote`, and `sync-state`, and the
  delivery residue under `bootstrap/`, `delivery-candidates/`, and `recovery/` (the register's residue row). A store
  holds state when it holds any of its refs.
- **Stored paths follow the checkout.** A projected record keeps the name the checkout shows — a work item's files their
  basenames (`meta-<slug>.md`), a person's their path under `.arc/user/` (`andrew/USER-INBOX.md`) — so plain Git reads
  as the checkout does. A record that is never projected ends its name with its owner's UID, or a person's id, which D2
  allows. Placement never enters a path, so every lifecycle move short of archive is a metadata write. An Errand
  carries its eight-character suffix from creation.
    - Git's default delta search sorts by a path's last sixteen characters (`pack_name_hash` in Git's
      `pack-objects.h`), so a person's fixed-name files hash alike across people: `andrew/WORKING-MEMORY.md` exactly,
      `andrew/USER-INBOX.md` but for the id's last two letters. The cost lands only in the host's own pack, since each
      clone fetches its own personal ref and a fetch packs only what it sends; verification measures it (§ Decisions,
      Verification), and if it bites, renaming stored paths is a forward commit. Names ending in the person's id
      (`USER-INBOX-andrew.md`) were the alternative, separating everyone at the cost of plain Git no longer reading as
      the checkout.
- **One metadata file per owner,** never projected and named by UID, so `list` reads one blob per live ref through one
  batched `cat-file` without reading a tree. A quarter ref's folders carry their sequence in their names, so the same
  `cat-file` reads each quarter's root tree, then its folders' trees, then the metadata blobs they name, since
  `cat-file --batch` answers each request as it comes unless given `--buffer` (`git help cat-file`; tested on Git 2.55,
  2026-10-10). It holds the current and former slugs, the primary's actual role (A5), placement, links, and each
  record's format version — absent reads as the initial one (`FormatVersionSchema` in `lib/store/identity.ts`) — and
  carries a format version of its own. It merges field by field, since placement and links are written by different
  verbs, on different machines; one field changed on both sides becomes a conflict record (D12), as a single-writer
  record changed on both sides does. A record removed on one side and changed on the other, in content or metadata, is
  one clash over the whole record, so the version that stays current keeps its own metadata. A sidecar per record
  doubles the files and makes `list` walk trees; Gerrit NoteDb's commit-message footers make current state a replay of
  the log, which NoteDb caches for that reason.
- **The record version is a digest over the content's blob id and that record's own metadata** — the primary's role,
  slugs, placement, links, and format version, or any other record's format version alone — through the kernel's
  canonical form (`canonicalDigest` in `lib/kernel/canonical/canonical-json.ts`). A lifecycle move or a rename moves
  only the primary's version, so an in-flight edit to a draft never conflicts with one. The record's subtree id was the
  alternative, but with slug-named files a rename would move every record's version. The backend writes each JSON
  machine record in the same canonical form (`canonicalize`), whatever bytes the caller passes, as the in-repo
  implementation re-serializes its JSON kinds (`writeContent` in `lib/store/in-repo/write-codec.ts`), so equal content
  is an equal blob on every machine, which the no-op rewrite needs. The meta and task list, Markdown machine records
  (D5), are stored as written, since the projection's base stamp is their blob id.
- **A rename** writes the primary's metadata and renames its projected files, adding no blobs. `history` and the
  restriction on `changes` follow a record across renames and the meta-to-record role change (D2) by computing every
  path it has had from its former slugs and roles, then letting a path-limited `git log` over those paths and the
  metadata file do the walk. Trailers naming each changed record were the alternative, which would put the truth in
  commit messages rather than the tree.
- **Write-once records** — conflict records and routing receipts — are one file each, named by their ID, so concurrent
  additions merge as a union of paths: git-annex's shape.
- **Rank keys order the Errand queue only.** Each member keeps its rank key inside the queue's record (D6, D11), which
  replaces the execute-bound marks' file order `arc errand next` reads today (`listExecuteBoundInboxEntries` in
  `lib/user-sync/inbox-writer.ts`). Backlog order gets none: D6 and D10 give each stub a rank
  field, but nothing sets or reads one, Part A's record and mutation types carry none (`StoreRecordSchema`,
  `MutationSchema`), and `goal-aware-direction` rules out a fully ordered backlog. A forward amendment to D6 and D10
  records that no stub rank is built until a consumer needs one. The seam stays open: the metadata merges field by field
  and carries its own format version, so a rank lands beside placement as one more field, with Part A's types amended
  then.

### Sync (Owner, 2026-10-10)

- **Two operations, named by direction** — a forward amendment to D1. Each idiom below is this section's choice, with
  its source in § Prior art.
    - **`pull({ history? })`** fetches every listed namespace into the remote-tracking refs and merges into local state;
      `history` names ended items' history refs to fetch too, the by-name fetch an applied end makes (below), for an
      operation that refused for want of one (§ The version model). It never pushes, so `push.interlock` never gates it.
      It is what session start under `session.remote_sync` and a deciding verb before it decides call (D12), and what
      the contract lacks today: its one remote operation pushes.
    - **`push({ carry? })`** is today's `sync()`, renamed to match its own result types (`PublishOutcomeSchema` in
      `lib/store/sync.ts`, `PublishFailureSchema` in `lib/store/refusal.ts`). Its loop pulls first, since pushes are
      fast-forward. `carry` names a code ref that rides the same `--atomic` push where code and state share an
      atomic-capable receiver, or goes first as an ordered leg where the receiver lacks atomic pushes (D12, A7; below).
      It may name the remote tip it expects, pushed as `--force-with-lease=<ref>:<tip>`, so a branch rewritten under
      `history-policy`'s default `rewrite-with-lease` rides it too. The carried ref's own rejection —
      `non-fast-forward`, `fetch first`, `stale info`, a server refusal whose line names its own cause, or a commit-time
      failure the push loop attributes to it (below) — ends the code leg and is never a lost race for state: the push
      repeats with state alone, as D12 has the state leg push alone when the code leg cannot, and its outcome reports
      the code ref's refusal. A pre-push hook's refusal is the code leg's too: `quality-gate-hooks`' push gate runs in
      that hook over code refs only, and Git runs the hook before it sends anything, so a refusal prints the hook's text
      and `failed to push some refs`, exits 1, and prints no per-ref status (a scratch push on Git 2.55, 2026-10-10). A
      push carrying a code ref that ends that way repeats with state alone, which the gate passes, and reports the
      hook's text; a hook that refuses a push of state refs alone ends it as terminal, with its text. The store only
      pushes a carried ref, never fetches or merges it, hence the name.
    - **On the other two backends,** the in-repo implementation's `pull` is today's notes pull, a fetch and a load to
      disk that publishes nothing (`runUserPull` in `commands/user/push-fetch.ts`), where its `sync` saves and pushes
      (`lib/store/in-repo/README.md`), and the reference backend's reconciles against its in-memory remote and publishes
      nothing (`createMemoryRemote` in `__tests__/helpers/store/sync.ts`).
    - **`arc sync`** keeps its name and runs both, as Fossil's `sync` pulls then pushes; Git, Dolt, and git-bug name
      the two directions `pull` and `push`. No production code calls the contract's `sync()` yet — `createStore`
      (`lib/store/create.ts`) delegates, and the conformance suite (`__tests__/helpers/store/suite-sync.ts`) exercises
      it — so the rename is cheap now. Keeping `sync` beside a new `pull()` was the alternative: fewer renames, but a
      name that sounds two-way on an operation that publishes.
- **Fetch** lands in `refs/arc-remotes/<remote>/…`, outside `refs/remotes/` (D10) and outside `refs/arc/`, so no push,
  manifest, or listing reads it: Git's remote-tracking convention one namespace over, as tools keep their own
  (`refs/changes/*`, `refs/pull/*`). Its refspecs go on the command line — the namespaces and the person's own identity
  (D10), one wildcard each, so a fetch stays one round trip — with an empty `--refmap`, so configured refspecs update
  nothing else; `--no-tags`; `--prune`, which reaches only the listed namespaces; and `--porcelain` (Git 2.41; ARC
  requires 2.47, § Git access). git-bug keeps its refspecs in memory the same way.
- **The ancestry check is Git's refspec rule.** The refspecs carry no `+`, so Git moves a tracking ref only forward and
  reports each refusal. The tracking ref is the last head seen, shared by every checkout of the clone, so no
  per-checkout record exists (D11). A prune would erase it, so a pull that prunes a tracking ref whose item has not
  ended (below) keeps its last tip at `refs/arc/tmp/seen/<remote>/…`, machine-local and outside the state like every
  `refs/arc/tmp/` ref (D10); when the ref returns, its tip must descend from the kept one or be an ancestor of it — a
  machine that missed the later pushes restored what it held, a loss this clone's next push repairs as a fast-forward —
  and the kept tip goes once the remote's descends from it. A ref this clone never saw has no last head to refuse
  against. Refusing any two tips that share no ancestor was the alternative, but refs made separately share none, and a
  rewrite that keeps an old commit shares one; so was a fixed first commit for every shared ref, which leaves that
  rewrite merging silently. A refusal reports `history-diverged`, which D4 retires with notes and this keeps as `pull`'s
  refusal, a forward amendment to D4, naming the ref and both tips, with the commands for each way out — keep ours by a
  push leased on the observed remote tip, take theirs, or merge both, as tips that share no ancestor merge (below) —
  since keeping or taking discards one side's history and merging brings back whatever a rewrite removed, so the choice
  is the Owner's. The trigger D10 names is a whole-repository rewrite such as `git filter-repo`. A mirror push reaches
  it too: one from a clone without ARC's refs deletes them and every machine's next push restores its own copy (D10's
  risk), and one from an ARC clone sets each state ref to that clone's tip; where the copies differ — one machine held
  pushes another never pulled — the restored ref refuses here, and merging both is the way out. Two ends of one item
  both published, the first erased by the mirror, cannot be ordered after it, so the pull names the item (the rule for
  two ends, below). The case is rare, so no verb is built for it. jj marks a diverged bookmark conflicted rather than
  refusing; D11 binds the refusal.
- **Merge after fetch.** Where one tip descends from the other, the local ref fast-forwards or waits to push. Otherwise
  the backend writes a merge commit with both tips as parents, its tree from merging each record by its kind's mechanism
  against the merge base — a single-writer record changed on both sides becoming a conflict record (D4, D12) — under the
  ref's machine-local lock and compare-and-swap like any write. Tips that share no ancestor merge against an empty base,
  as `git merge --allow-unrelated-histories` does, since shared refs are made separately: two machines' first archives
  into a new quarter, or a contributor's registry joining a team's. History stays immutable and the next push a
  fast-forward: git-annex's union-merge commits on its branch. Each kind's write check never gates a merge, since both
  sides are already published: the backend runs the checks over the merged result, with `before` the local tips the pull
  found, and reports what breaks, storing nothing, and readers report it as any state gone stale — D14's slug clash
  between machines, which status lists and a rename resolves. The merge carries the sync verb's provenance, so the rules
  that bind only a hand edit stay silent (`spec-seam-record-kinds.md` § 3.4). A conflict record naming the rule was the
  alternative, but a conflict record holds a choice between two versions, which a broken rule is not, and one stored
  here could outlive its fix.
- **A lifecycle move is read from its record, never from a ref's absence or return.** Every end writes a record into a
  fetched ref in the same atomic push that deletes the live one: an archive, an Errand's close, and a cohort's close
  join the quarter's ref, and an abandon or a decomposition writes the registry's lineage (D10, D5); a reopen removes
  the item's folder from the quarter's ref. So a pull applies another machine's end whenever its merge brings an end
  record of an item this clone did not hold, whether or not the item's tracking ref pruned: a clone that reopens and
  ends an item between pushes publishes only the history ref and the record, never touching the live ref on the remote,
  and two such clones would otherwise both publish ends (the model check, § Prior art). The same pull fetches every such
  item's history ref by name, in one fetch, and the end meets what this clone holds: a live ref merges into the fetched
  history ref and moves under `refs/arc/history/`, as a late write does (below); this clone's own unpublished end meets
  the rule for two ends (below); and a history ref merges. A pull applies another machine's reopen from the folder's
  removal arriving with the live ref; a live ref back without it is a restore by a machine that missed the end, which
  the end meets as it meets a write (below). When a pull prunes a tracking ref and `lookup` of its UID finds no end
  record other than one this clone wrote, the local ref was never pushed or the remote lost it, as a mirror push loses
  state refs, and the next push restores it. Every by-name history fetch names its ref as a one-ref pattern,
  `refs/arc/history/work/<uid>*` or its `cohort/` twin: a refspec naming a ref the remote lacks fails the whole fetch,
  its other refspecs included, where a pattern that matches nothing fetches nothing (scratch fetches on Git 2.55,
  2026-10-10), and a UID's fixed length keeps the pattern to its one ref. Moving the ended ref means no later push
  recreates the live ref, and `changes` and a read as of an earlier manifest find the item locally. These are
  tombstones, as CouchDB deletes by writing a `_deleted` revision, and the reasoning D10 gives for keying refs by UID.
- **Deletes push with a lease.** Archive, abandon, decompose, and reopen each delete a ref on the remote, and a delete
  is never a fast-forward; an unconditional one would drop a concurrent push, and that writer's next push would bring
  the ref back. A delete pushes with `--force-with-lease=<ref>:<tip last seen>`, and `stale info` joins D12's retry set
  as a lost race: a forward amendment to D12. The contract's host trials already covered leasing `refs/arc/*`. A delete
  that loses its lease to a write merges the remote tip it lost to and leases again on that tip, so the lifecycle move
  holds rather than undoing (one that loses to another machine's end of the item meets the rule for two ends, below): an
  end merges it into the local history ref (next), and a reopen, whose delete loses to another machine's write to the
  completed item, merges it into the local live ref, its quarter merge keeping the folder's removal. The push loop's
  pull fetches by name each history ref its push creates, updates, or deletes — a create among them, since one loses to
  a ref another machine restored first, and a pattern that matches nothing fetches nothing (above).
- **A late write meets an end by merging into the item's history ref,** never by undoing or replaying the end, so the
  end's other writes — lineage, a decomposition's children, the archive number — stand as written. The merge is the one
  after any fetch, except that the end holds whichever machine made it: where the late write changed a record the end
  also changed, an abandon's or a decomposition's removals among them, the end's version stays current and the late one
  is kept in a conflict record on the item's ref — a forward amendment to D4 and D6, which keep the remote's version
  current. A record only the late write changed merges in. An archived item's folder in its quarter's ref is refreshed
  from the merged tree, as any write to a completed item refreshes it (§ Lifecycle moves), so reads and listings of the
  completed item find its conflict records; an abandoned or decomposed item reads `not-found` (D9), so the pull's result
  names it and its conflict records (D6). When an end's leased delete loses to another machine's write, the backend
  merges that remote tip into its local history ref and leases the delete again on the tip it merged. When a pull
  applies another machine's end while this machine holds unpublished writes to the item, the local ref merges into the
  fetched history ref before it moves, and the next push fast-forwards the history ref, leased as every push of a work
  item's ref is (§ The version model). A pull that applies another machine's reopen — its removal of the folder, with
  the item's live ref back in the fetch while this clone holds its history ref (above) — mirrors that: the reopen holds
  as an end does, so unpublished writes on the local history ref merge into the fetched live ref, the local history ref
  goes, and the quarter's merge keeps the reopen's removal of the folder, so a write made to the completed item lands on
  the reopened one. Where the local history ref carries this clone's own unpublished end, made after a reopen of its
  own, its reopen and the fetched one made the same move and its end came after both, so the end holds as it does over a
  write: the backend merges the fetched live tip into its history ref and leases the live ref's delete on that tip. A
  live ref back without the folder's removal meets the end the same way. The reopen rule applied there would fold the
  end into the live ref and leave its quarter folder beside a live item, as the model check found (§ Prior art). Letting
  the remote's side win, as D4 has it, was the alternative, but an end undone record by record leaves its lineage,
  children, or quarter folder beside a live item unless they are rolled back; so was running the end again over the
  merged work ref, whose lineage and children's creates would refuse against its own first run.
- **Two ends of one item: the first published holds.** Two machines may end one item before either syncs — an archive on
  one and an abandon on the other, or two archives, each perhaps after a reopen of its own. When a pull applies another
  machine's end while this clone holds its own unpublished end — whether the push loop's first pull reaches it or a
  leased delete lost to the ref's absence first — the backend withdraws its own end, none of which has published, rather
  than leasing the delete again on that absence. The withdrawal is one local transaction writing the inverse of every
  write the end made: a commit on the item's ref restoring each record the end's final commit removed or changed, its
  lineage record removed, its unpublished quarter folder removed, and any entries it returned to an inbox taken back out
  unless the published end returned them too; a decomposition's children stay as items of their own. Receipts are never
  edited (D11), so the receipts stay, and the sync writes each entry taken out a new one naming its home now, as sync
  may write one (D6), since an entry's latest receipt says where it is. Only the writes this clone made around its end
  then merge into the published end's history ref, as a late write's do, so a record both sides changed keeps the
  published version and holds the withdrawn one in a conflict record (D6), and the pull's result names the item and the
  end withdrawn. CouchDB keeps one revision winning and the other as a conflict the same way. Two ends both published,
  possible only once a mirror push erased the first (above), cannot be ordered, so the pull's result names the item and
  both ends, and a person reopens it and ends it once. A stated residual was the alternative — an item read as ended
  twice, archived and abandoned or archived into two folders, until a person noticed — which leaves `lookup` and the
  quarter's listing disagreeing with nothing to report it.
- **The push loop** retries D12's set with exponential backoff and jitter sized to the host's push time, never holding
  the machine-local lock across a sleep: Gerrit's first sequence retry held its lock while sleeping and blocked every
  other writer. It lists the refs it pushes, takes their machine-local locks in ref-name order, and lists again — a
  listing that grew, as a batch that creates a ref grows it, sends it to take the larger set's locks — then reads the
  tips under them, released before the network call, and pushes explicit `<oid>:<ref>` pairs, so a push never publishes
  part of a local batch, which a reader of the files format can see mid-transaction; the torn cut stays accepted for a
  manifest alone (§ The version model). It reads rejections from `git push --porcelain` and the exit code rather than
  prose. A client-side `rejected` — `non-fast-forward`, `fetch first`, `stale info` — is a lost race; a
  `remote rejected` carries the server's text, matched under `LC_ALL=C`, where `cannot lock ref`,
  `incorrect old value provided`, and `TF401028` retry and any other refusal is terminal. An `--atomic` push marks every
  ref beside the one that failed `atomic push failed`, or `atomic push failure` from the server (a scratch push on Git
  2.55, 2026-10-10); those collateral lines carry no cause, so the push reads as the refs whose lines do, a carried
  ref's first (above) — a lost race when each is in the retry set, terminal otherwise. A lost race the server catches at
  its commit marks every ref `atomic transaction failed` and names no cause, in the same lines whether the carried ref
  or a state ref raced (scratch pushes on Git 2.55, 2026-10-10), so that outcome is read by state. The loop's next fetch
  compares each pushed state ref's remote tip with the old value the push expected, and with a ref carried, one
  `ls-remote` of it reads its remote tip, fetching nothing. A carried ref is the code leg's own refusal (above) when its
  lease names a tip other than that one, or, carried without a lease, when its pushed commit no longer descends from
  that tip (`git merge-base --is-ancestor`, which refuses a tip this clone lacks, so a missing tip counts as one it does
  not); a leased rewrite never descends from the tip it replaces, so its lease alone decides. A state ref that moved
  makes a lost race, and both can hold at once; neither is terminal with Git's text. An unleased code ref raced to a
  commit the pushed one still descends from therefore reads terminal, and the next sync pushes it. Comparing the carried
  tip with the code remote's tracking ref was the alternative, but a stale tracking ref reads an unmoved code ref as
  raced. A deadline bounds the loop rather than an attempt count — the spec sets it; twenty machines pushing one ref at
  once settled in 25–60 s — and on expiry it returns `retries-exhausted` with the retry count and time waited its schema
  carries, the write kept locally for the next firing point.
- **Atomic capability is classified, never probed.** `ls-remote` talks to the fetch side and cannot see the receiver's
  `atomic` capability, so a multi-ref push uses `--atomic`, and a receiver without it fails before any per-ref status
  with Git's `the receiving end does not support --atomic push` (Git 2.55's text, 2026-10-10), read under `LC_ALL=C` —
  the one condition read from Git's message, since Git reports it no other way: a forward amendment to D4, which
  classifies by error class or code, never by message text. With a carried code ref, the push then falls back to D12's
  ordered legs: the code ref alone, then the state leg, where one ref pushes ordinarily and several end in A7's terminal
  `refused` — never an ordinary multi-ref state push.

### Lifecycle moves (Owner, 2026-10-10)

- **The contract's own writes move a ref** (D2, D3, D10), each as one local `update-ref --stdin` transaction and one
  `--atomic` push with its deletes leased (§ Sync):
    - A placement write to `completed` archives. The work ref takes a final commit carrying the verb's writes — the
      meta's session context cleared among them (D5) — the item's current files join its quarter's ref in its folder,
      the same blobs, and the ref moves under `refs/arc/history/`.
    - A placement write out of `completed` reopens: the history ref moves back under `refs/arc/work/`, and the folder
      leaves the quarter's ref. A clone that holds no copy of that history ref refuses the reopen as a read lacking one
      does (§ The version model), and the reopening verb pulls it by name first.
    - Any other write to a completed item's records — the write that resolves one of its conflict records (D6) among
      them, since every work-unit kind spans `completed/` (D5) — commits on its history ref and refreshes its folder in
      the quarter's ref, in one transaction under both refs' compare-and-swaps and one `--atomic` push. The history
      ref's update is leased on its tip last seen, as every push of a work item's ref is (§ The version model), so
      another machine's reopen reads as `stale info`, a lost race, where an unleased push would recreate the ref it
      deleted (scratch pushes on Git 2.55, 2026-10-10; § Sync). So `history` keeps reading one ref's log, and a reopen
      finds the latest state. On a clone that holds no copy of the history ref, the write refuses as a read lacking one
      does, naming it, and the verb pulls it by name and retries (§ The version model). Where the remote answers without
      the ref and no reopen explains it — the mirror push D10 names, which deletes state refs — the write stays refused,
      naming the ref, with the remedy that a clone holding it push it back (`git push <remote> <ref>`), since rebuilding
      from the current state, a read's remedy, cannot land a write. A clone that holds the ref meets the same loss as
      `stale info` with no reopen behind it, and its write restores the ref, leased on its absence, as the next push
      restores a lost live ref (§ Sync); an archived item's quarter ref rides the same `--atomic` push, so a reopen
      racing it — and only an archived item reopens — still reads as a lost race. The push loop's pull fetches by name
      each history ref its push creates, updates, or deletes (§ Sync). Letting only a reopen resolve a completed item's
      conflict records, carrying `resolves`, was the alternative, but the contract's other writes to a completed item
      would have nowhere to land.
    - Abandon and decompose end the item: a batch that removes the primary and creates the item's lineage transition,
      the caller's create-only record keyed by its UID (D5). The ref's final commit removes its records, so `history`
      reads a removal (`HistoryEntrySchema` in `lib/store/contract.ts`), and the ref moves under `refs/arc/history/`. A
      decomposition's children are refs created with an empty old value in that batch.
    - Any other removal, a primary's included, is an ordinary write of absence (D3): the ref stays live and its next
      commit removes the record, as the conformance suite's removals expect (`current-removal` in
      `__tests__/helpers/store/suite-records.ts`). So every end carries its own record — its quarter folder or its
      lineage — by which other machines tell it from a loss (§ Sync). Ending the item at any primary removal was the
      alternative, but a bare removal leaves no such record, and refusing one would break D3.
    - A rename moves no ref (§ Record encoding), and parking is a placement write within the live namespace.
- **The history namespace mirrors the live one:** `refs/arc/history/work/<uid>` and `refs/arc/history/cohort/<uid>`,
  since a closed cohort's ref ends too (D10).
- **The archive sequence is final once pushed.** It is assigned locally under the quarter ref's compare-and-swap, and
  when two machines archive into one quarter, the push loop's merge renumbers the unpublished archive after the
  remote's highest. Nothing stores the number but its folder's name, and placement derives it on read
  (`WorkUnitReadPlacementSchema` in `lib/store/placement.ts`), so the verb reports the number after it publishes.
  Offline-first stores reconcile a temporary ID at sync the same way, the shared log's order deciding; Gerrit numbers
  changes on its server instead. A reopened work unit leaves a gap in its quarter's numbering.
- **Counters get nothing of their own.** Nothing allocates from the registry's counter kind
  (`project-registry/counter`): source only registers it, and tests write it as a stand-in record. D6 reserves blocks
  only for a hot counter, which none is. A first consumer's claim is a write and a push against the remote, as the
  analysis has claims made "across machines, against the remote"; blocks would also show as gaps in the registry counter
  people read, ADR numbers.

### `lookup` (Owner, 2026-10-10)

- **One scan over the metadata files, no index.** A primary's links hold its branches and task captures (`LinksSchema`
  in `lib/store/links.ts`), so the metadata file (§ Record encoding) answers a slug, a former slug, a ref, a commit, and
  a work unit's or Errand's checkout claim — an Errand's claim ID read from the few records whose slug matches
  (`claimId`, today in `lib/errand/identity-record.ts`). One `for-each-ref` over the live work and cohort refs and the
  quarter archive refs, then one batched `cat-file` of every metadata blob, each quarter's after its root and folder
  trees (§ Record encoding), matched in memory: two Git processes a lookup. A completed item resolves from its quarter's
  folder, which holds its current state, links included. One batched read of 601 metas took 17 ms (analysis § 11.6).
- **Memoized within one process,** keyed on the ref tips — git-bug's disposable cache, kept in memory only. A persisted
  index waits for `query-cache`'s tripwire (D20). An index maintained on write was the alternative: a second record
  to keep consistent under every write and merge, for a cost the measured scan does not show.
- **Lineage** is the registry's `lineage/` subtree, keyed by origin UID: a UID resolves by path, a slug by scanning
  that subtree. **A grooming or housekeeping claim** reads the person's own claims ref, keyed by slug, since a marker on
  this machine names this person and their identity is always fetched.
- **An ended item outside the archive** — abandoned or decomposed — sits under `refs/arc/history/`, outside the refs the
  scan reads, so `lookup` refuses `not-found`, as the contract already accepts (D9, a work item abandoned or decomposed
  elsewhere); a decomposed origin resolves through lineage.

### Layouts and remotes (Owner, 2026-10-10)

- **The state remote's designation is a key on the remote itself:** `remote.<name>.arc-state` in the clone's Git config,
  set to `push`, `read`, or `off`. `push` marks the state remote, which `pull` fetches and `push` publishes to (D14); at
  most one remote carries it, counting the store directory's own remote (below), and two refuse with a remedy naming
  both. `read` marks a read-only source (below). `off` records an answer of neither, so the question is never asked
  again. A remote with no key is undesignated, and ARC never pushes `refs/arc/*` to it (D14).
    - **Git config,** because the designation names a remote, which means something only inside one clone — one clone's
      `origin` is another's `upstream` — so it must never sync; because it belongs to the clone, shared by every
      worktree through the common Git directory where `git config --local` lives; and because sync reads it before it
      can reach a remote. Git keeps a remote's per-clone role there: `remote.pushDefault`, which D14 names, and
      `remote.<name>.promisor` for partial clone's object source.
    - **On the remote,** because Git maintains a remote's own section and only the pointers it owns. Tested on Git 2.55
      (2026-10-10): `git remote rename` carried a foreign key in the remote's section and rewrote `remote.pushDefault`
      and `branch.<name>.remote`, but left a top-level key naming the old remote pointing at nothing, and `git remote
      remove` dropped the section and left that key dangling. GitHub CLI records its own per-clone choice among
      remotes, `gh repo set-default`, as a `gh-resolved` key. The hyphenated name follows tool keys in Git's sections —
      `gh-resolved`, git-annex's `annex-*` (_unverified_) — and survives Git lowercasing variable names.
    - The alternatives: a top-level `arc.stateRemote` with a mode key beside it, which dangles on a rename or a removal;
      and `config-storage-architecture`'s per-machine file tier, `.arc/user/<id>/.local/`, which sits inside a checkout
      and so is per worktree unless rooted in the primary, the rooting the projection retires. That work unit moves the
      `arc.*` preferences into files so they sync and can be read; the designation must never sync and is a fact about
      Git's remotes, so it stays in Git config outside that move. The contract left where it lives to that work unit
      (the contract notes' § Who builds Part B); it is settled here because this backend's sync reads it before it
      reaches a remote, and this draft's close routes the answer to that draft's question.
- **Who sets it** (D14):
    - A tracked pointer to a backing repository (D14) makes the store's own remote (below) the only candidate: nothing
      sets `push` on the code remote or asks about it there, at `arc init` or after, so no answer can publish state to
      it. A clone that finds the pointer asks once about the store's remote, and a run that cannot ask sets nothing
      there either. Ghost mode's local-only pointer, and a ghost install without one, take the same rule, since ghost
      mode's storage is always the separate directory (D19); `ghost-mode` wires them with the install profile and the
      per-machine pointer it reads from `config-storage-architecture`'s tier, an ask routed at this draft's close. The
      rest of this list applies to a standard install without a pointer.
    - `arc init` sets `push` on the code remote at creation, where one exists.
    - A clone with none set, where it can ask: when the remote Git pushes code to holds the project's registry ref
      (`refs/arc/project/registry`) and no other remote does, it sets `push` there without asking. Presence is read by
      `git ls-remote` of that one ref, which fetches no objects.
    - When another remote holds it — a fork's upstream — the person is asked once about that remote: `push` for a team
      member, `read` for a contributor, the answer setting the role as D14 says, or `off`.
    - When no remote holds it — a project initialized before its remote existed, a teammate's clone before the first
      state push — the person is asked once about the remote Git pushes code to, `push` or `off`, so no project stays
      unpublished unremarked: a forward amendment to D14, which lists one ask. A fork clone whose upstream holds the
      registry gets only the question above. The remote is still never designated by default (D14), since a
      contributor's lone remote is usually their public fork.
    - A run that cannot ask, CI included, sets nothing, so `pull` reports `no-remote` (`SyncStateSchema` in
      `lib/store/sync.ts`) and nothing pushes until a run that can ask.
    - **Residual:** Azure DevOps' full fork copies state refs (the contract's analysis), so a contributor's lone fork
      remote holding that copy reads as the project's state remote, and their state pushes to the fork's copy, never
      upstream. The contract leaves provider fork behavior to implementation verification, so the host trial checks it
      (§ Decisions, Verification).
- **A read source** is fetched by `pull` into `refs/arc-remotes/<remote>/…` as the state remote is, never merged and
  never pushed to. `arc` reads it through a second store instance over that namespace: the same engine with its ref
  root moved and every write refused. Part A needs no change; which commands offer the upstream's view is each
  consumer's call.
- **The layout follows the designation,** as D10's local copy follows the remote. A code remote carrying `push` puts the
  store in the code repository's own refs; otherwise — a backing repository found through D14's configuration pointer,
  or no state remote — the store is the separate directory. There the backing repository is a remote of the store's own,
  created from the pointer and carrying the same key under the same rules: `arc init` sets `push`, and a clone that
  finds the pointer asks once, since that remote is not the one the clone pushes code to. Moving between layouts rides
  the migrate verb (D14), so a designation that changes the layout — answered, or set without asking where the code
  remote already holds the registry — runs the verb's layout move before it takes effect, and nothing switches the
  layout bare; where the designation is silent, the move is too, a local one. Keeping an undesignated clone's state in
  the code repository's refs until a deliberate local-only move was the alternative, but it puts a fork contributor's
  state where D10 promises privacy, and still moves the store when a clone answers into local-only.
- **The separate directory** is `arc/store` in the common Git directory, so every worktree shares it, as Git keeps a
  submodule's repository under `.git/modules/`. Its presence is the layout: `version` reads it without a Git call (§ The
  version model), and a write that finds no store directory reads the designation to place itself, creating the
  directory under a machine-local lock where the designation puts the store there. It is made by
  `git init --bare --ref-format=reftable --object-format=<the code repository's>`: the layout move fetches between the
  two, and Git refuses a fetch across object formats (`mismatched algorithms`, a scratch fetch from a SHA-256 code
  repository into a default store on Git 2.55, 2026-10-10), and the manifest's in-process id hashes with the same
  format. Every store command names it with `--git-dir` (D10). Its commits carry the person's name and email as the code
  repository resolves them, which a command run against the store directory would not see when they are set in the code
  repository's own config.
- **The project ID.** Only `arc init` mints it (D14), with `randomUUID`, as the in-repo implementation mints batch IDs
  (`lib/store/in-repo/write.ts`), into the registry's create-only identity record (`project-registry/identity` in
  `lib/store/registry.ts`), published with the first push; with a remote already designated it pulls first and adopts an
  ID it finds instead, and this repository's import takes its review gate's (§ The migrate verb and the import).
  `arc join` never mints: it adopts the registry's ID at the first pull that finds one, and until then the clone has
  none, which delivery tolerates, staying buildable without one (D14). So a teammate's registry never holds an identity
  record, and when it meets the published registry, the merge of unrelated histories (§ Sync) adds that one with nothing
  to clash. A contributor's local-only store takes the upstream's ID from its read source. An independently initialized
  fork mints its own, and an inherited copy alone adopts nothing (D14). Minting at `arc join` when no remote held an ID
  was the alternative, which leaves two create-only identity records to clash once both are pushed.

### The migrate verb and the import (Owner, 2026-10-10)

- **One migrate verb moves state, and the import is its one-time source.** D14 frames the one-time move as the migrate
  verb's case, and the verb is built here because a backend a project cannot move to is no choice at all: without it,
  the backing repository and local-only would be choices made once, at `arc init`. The import's transform is its
  one-time part, which `storage-cutover`'s deletion pass removes with the in-repo implementation; everything at the
  destination is the verb's. A one-off import tool beside the verb was the alternative, building that half twice.
- **The verb makes two moves:**
    - **A clone's layout changes with its designation** — a team member going local-only, a contributor beginning to
      push, or a first designation of a clone that already holds state (§ Layouts and remotes). It is a local fetch
      between the code repository's refs and `.git/arc/store/` and a delete of the source (D10), every ref and its
      history carried by Git. No remote changes; the team's state stays where it is. Since the directory's presence is
      the layout, its switch is a rename: into the separate layout the store is built under a temporary name beside
      `arc/store` and renamed into place, and out of it the directory is renamed aside, then removed.
    - **The project's state changes remote** — to a backing repository before a repository that wants its state private
      goes public (D10), or back. It is the clone's move, run over the old remote's whole state rather than this
      clone's, since D10's refspec keeps every other person's identity refs and every history ref this clone never
      pulled out of its fetch. The move fetches every ref of the store the old remote holds (§ Record encoding) into
      `refs/arc/tmp/migrate/`, copies them to the new remote under their own names in one `--atomic` push, lands the
      tracked pointer's change (D14) as code, leaves the forwarding record on the old remote (below), and then deletes
      every copied ref there in one `--atomic` push, each delete leased on the tip the move last read. A lost lease
      means a teammate pushed after the copy: the move fetches again and brings the new remote to match — a ref that
      changed copied, and one the old remote has lost since, as an end moves a live ref under history, deleted from
      the new remote, each leased on what the move pushed there — then deletes again. The forwarding record goes first
      so that a teammate's next pull stops pushing to the old remote, and the deletes settle rather than chase a
      moving lease. Refs this clone does not otherwise keep — another person's identity, a history ref it never
      pulled — never enter its state, and leave the temporary namespace when the move ends.
- **Order makes it restartable:** copy, switch — the designation, and for a layout move the directory's rename, for a
  remote move the forwarding record — then delete the source. Interrupted, a move leaves either the old copy
  authoritative and a new one to merge, or the new copy authoritative and a leftover to delete, and running it again
  finishes it. A remote move that changes the moving clone's layout — between the code remote and a backing repository,
  either way — runs the layout move as its switch, after the copy and the pointer's change and before any delete, and
  keeps its temporary refs in the code repository, which both layouts keep and which holds the state at one end of the
  move anyway, each half under its own name — `refs/arc/tmp/migrate/remote/` and `refs/arc/tmp/migrate/layout/` — so
  each half restarts as it would alone. Since the two configs and the rename cannot change at once, a layout move's
  switch sets the code remote's `push`, moving into the code repository's refs, before the store directory's rename, and
  sets it to `off`, moving out, after the rename — never a bare clear, which a code remote holding the registry would
  answer by designating itself again without asking. An interruption leaves a store directory beside a code remote
  carrying `push`, never a designation that would place a fresh store: the directory stays the layout for every read and
  write, as its presence is, and `pull` and `push`, which read the designation, refuse that state, the two-`push`
  refusal among them, with a remedy naming the move, whose rerun finishes it.
- **All or nothing at the destination.** A move gathers its refs under `refs/arc/tmp/migrate/`, which is not state and
  stays out of the refspec (D10), then puts them in place at once: a layout move or the import in one
  `update-ref --stdin` transaction, a remote move in one `--atomic` push, which a receiver without atomic pushes refuses
  as A7's terminal `refused`, since publication across several state refs never falls back to ordinary pushes (D3). Into
  a store that already holds state — a contributor's joining a team's — it merges as `pull` does (§ Sync); refs are
  keyed by UID, so only the shared ones, the registry and archive quarters, merge. The import alone refuses a store that
  holds state — a ref of the store (§ Record encoding) — since it mints UIDs and a second run would duplicate every
  record. A run that finds its own landing instead — a store whose project ID is this clone's review-gate repository ID,
  which only the import adopts — finishes the steps that follow it, the transient-identity refs' deletes, so running it
  again after the first push clears the remote's and drops the kept tips. Gerrit's move from ReviewDb to NoteDb recorded
  its progress per step because it ran online over a large server; a move here commits once.
- **The trial run** is the same build, reported and then dropped, so a trial and the move cannot drift apart. It reports
  what would move where — for a move off a remote, every ref it would copy, by scope and person, with the history refs —
  what the serialization rules would refuse, every Candidate chain it finds broken, and, for a move off a remote, that
  only later publication stops.
- **A moved project leaves a forwarding record.** A ref missing from the remote reads as lost, and the next push
  restores it (§ Sync), so after a deliberate move a teammate's next push would put every state ref back on the old
  remote. The move leaves one ref there, `refs/arc/project/moved`: a root commit holding only the project ID, never the
  new remote's URL, which the tracked pointer carries, so no state history stays reachable from it. A pull fetches it
  with the project namespace, refuses to push to that remote, and offers the clone its own move; a move back deletes it.
  It adds the ref to D10's table, a forward amendment. Keeping the registry ref with a final commit marking the move was
  the alternative, but it leaves the registry's whole history reachable on the remote being left.
- **Moving off a remote stops publication; it never unpublishes.** Store history is never rewritten (A4), and anyone may
  have fetched what was pushed, so a repository that wants its state private moves it before going public, and the trial
  run says so.
- **Current state, plus every chain.** A move between ref layouts carries every ref's history through Git. The import
  lands each record at its current content, and its pre-flip history stays in code history, which the import's
  provenance names by the code commit it read. The Candidate record is the exception D14 binds — its history is the
  chain of Candidates it has held (D2) — so the import replays every version its path log holds (below), oldest first in
  that log's order, on its work item's ref, live or under history, before the commit of current files, and the chain
  reads through the store's `history`, as the register's Candidate-chain row asks. Two chains are already broken in code
  history, each superseding a Candidate no committed version holds — `evidence-applicability`'s at `ae942826…` and
  `delivery-native-stack-composition`'s at `0ff2bba5…` — and land as found. Today's reader refuses six records:
  `evidence-applicability` at its break (`resolveCandidateSupersessionAncestors` in
  `lib/work-unit/candidate-attestation.ts`), and five whose records fail today's Candidate schema, carrying treatments
  it no longer admits, before any chain walk (`readCandidateRecordVersioned` in
  `lib/work-unit/candidate-record-store.ts`) — `delivery-native-stack-composition` among them, so its break is never
  reached. The import carries all six unchanged (`spec-seam-record-kinds.md` § 3.4), and a reader through the store
  refuses them as today's does.
- **The import reads through the in-repo implementation,** which already picks each live work unit's copy across
  branches and fetched refs, reads personal files and Errand refs, and returns tracked history with commit messages
  (`lib/store/in-repo/README.md`); `storage-cutover` makes sure every branch is fetched. The import reads directly only
  where that implementation has no read, or one that drops what the import carries: each Candidate record's versions,
  from the plain path log today's chain reader walks (`git log -- <path>` in `readRepositoryCandidateSupersessionChain`,
  `lib/work-unit/candidate-record-store.ts`), since the in-repo `history` follows renames (`trackedHistory` in
  `lib/store/in-repo/history.ts`, `git log --follow`), which drops a version a merge commit introduced —
  `evidence-applicability`'s chain link `571df3d2…` among them; each person's notes ref as one snapshot, and every
  worktree's workspace copies for the agreement check below, since it reads only the configured person's files and only
  this checkout's workspaces (`listPersonal` in `lib/store/in-repo/personal.ts`); commit footers for task captures
  (D16), the review gate's durable facts under `.git/arc/` — evidence, outcomes, and termini (the register's
  machine-local row) — and the sources of the other stored kinds `KIND_MECHANISMS` (`lib/store/registry.ts`) gives no
  in-repo home: Errand descriptions from their origin entries, inbound lists from drafts' buffer sections and pending
  owner-adoption `_Hold` captures, each person's Errand queue from execute-bound marks, no counter, since nothing
  allocates one (§ Lifecycle moves), and the project ID, which takes the importing clone's review-gate repository ID,
  already a UUID, so receipts keep their key (D14). That ID is minted per clone (`resolveRepositoryIdentity` in
  `scripts/review-gate/hosts/local/git-common-state.ts`), so another clone's review facts carry another key and are not
  read; the cutover's quiesce finishes review there first. Adversarial passes import as the scratch files they are
  (D14), and project machinery and the constitution stay tracked in the standard profile (`FAMILY_REGISTRY`). An inbound
  entry from a buffer section takes its `_Routed from:_` date as its `_Created:_`, the line keeping its origin, and one
  from a held capture keeps the capture's `_Created:_` (`draft-seam-locus.md`).
- **Open Errands keep their origin entries without a binding to survive the stamp,** in the contract's order (D11, Open
  Errands at the move): the import finds each open Errand's origin entry by title, as close does, reports one whose
  source digest changed since adoption, and carries it into the Errand's description before stamping every other
  entry's `_Id:_`. An Errand whose entry is gone takes its description from `intent`, as one opened from text does.
- **The import's inventory:** tracked artifacts, `delivery-rebuild-continuity`'s from its plan branch among them, and
  completed work units and closed cohorts (below); Git notes as one snapshot; the transient-identity refs re-homed, then
  deleted locally and, once the imported state is published, from the remote, each leased on the tip the import
  re-homed, which it keeps under `refs/arc/tmp/migrate/` until then — `refs/arc/user/<id>/errands`, retiring with the
  move as the register's row says, while `errands-remote` is the residue row's and `sync-state` goes with notes
  (`storage-cutover`); one UID per owner (A11); every remaining inbox entry's `_Id:_`; personal files into place (D5);
  JSON machine records in canonical form (§ Record encoding); the review gate's repository ID onto the project ID; and
  each closed task's captures (below). It serves this repository alone: CineXplorer's install predates too much of ARC
  to import, and is installed fresh and migrated by hand. From `spec-seam-record-kinds.md`: the fold of each
  `SESSION-NOTES.md` into its work unit's meta, which writes no `State at Handoff`, since nothing writes one before the
  flip (its § 5.5), so the import carries no anchor to resolve; moving state between backends runs no write check, so
  records today's checks admitted import unchanged (its § 3.4); and today's three `rename` transition records become
  former slugs in their successors' metadata (§ Record encoding), never lineage, since from the flip lineage holds only
  terminal transitions (D5). Their successors are all archived, so the former slugs sit in their quarter folders, where
  `lookup` reads them, and `storage-cutover`'s deletion pass drops `rename` from the lineage kind.
- **Completed work units and closed cohorts land as an archive or a close leaves them** (§ Lifecycle moves): each one's
  history ref, `refs/arc/history/work/<uid>` or `refs/arc/history/cohort/<uid>` — a work unit's Candidate chain replayed
  on it oldest first where it has one (above), then a commit of its current files, its Candidate and boundary records
  among them — and its folder in its quarter's ref, a work unit's under the number it holds today. They land through the
  verb's transaction rather than the contract's writes, where a write names the quarter alone and the store assigns the
  number (D5), so `2026-q3`'s two `31_` folders and its gap at `54` survive, and the next archive numbers after its
  quarter's highest.
- **Each closed task's captures derive** from the `Context:` footers of the commits that carry its ID, as reverse lookup
  and delivery's attribution derive them today, each expanding a range against the task list with `expandTaskReference`
  (`lookupCommit` in `lib/store/in-repo/lookup.ts`; `lib/delivery/from-branch.ts`), each a commit's repository and SHA
  with its patch-id where it has one (A6, D16). Two residuals, named: a task whose footers a squash dropped keeps no
  capture, and a commit no closed task's footer names — a ceremony or code-review commit, or an open task's — gets none,
  resolving only through the in-repo implementation's footer reading and so to nothing from the flip, when `lookup` by
  commit matches stored links alone, never a footer (D3), and no ARC reader parses task state out of commit messages
  (D16). Before the flip the task list rides its code commit (D16), so a task is ticked in the commit that lands it, and
  an open task's commits are few.
- **Notes as one snapshot means every copy agrees first.** The import reads each person's notes ref as one snapshot and
  compares it with the disk copy; a file that differs is listed in the trial run, and the import refuses until it is
  saved, never choosing `ours` or `theirs` (D14). This repository's remote notes refs are deleted (the register's
  `public-repo-flip` row), so a second machine's notes reach the importing machine by `git bundle` or a fetch between
  the two machines, in the cutover's quiesce.
- **The import's trial run on this repository** is the checklist the pre-import tidy works from (§ Decisions, The
  version model). A first tidy (2026-10-10) removed what the rules would refuse among the personal files — two compiled
  Python files and a 1.5 MB trace log over the size cap — and three stale folders, leaving 105 files outside
  `.internal/`: ARC's surfaces, and five documents and two folders the layout moves into `scratch/`. Six empty files
  read as binary to `file`, so the text test is Git's own binary heuristic, a NUL in the first 8,000 bytes, which passes
  them. No tracked state file is over the cap, and the 21 Candidate versions over it, all in code history, are a kind it
  leaves alone (§ Decisions, Ownership).
- **Deletion tombstones are dropped.** Today's notes merge marks a removed entry with a `## Removed:` section
  (`lib/user-sync/merge.ts`) — 90 in this repository's `USER-INBOX` and 4 in its `WORKING-MEMORY` (2026-10-10). They
  are merge machinery, not content: the store's entry merge reads a removal against its base (D6).
- **The old notes ref is `storage-cutover`'s.** Kept as an archive tag, it would publish every past personal note with
  any `git push --tags`; on a public repository it stays outside `refs/tags/`, or is not kept.

### Git access (Owner, 2026-10-10)

The executor capabilities the routed Git-access entry asked for (§ Inbound dispositions), in the executor seam under
`lib/git/`, each tested on Git 2.55 in a scratch repository in both ref formats where it matters (2026-10-10).

- **A ref-transaction helper** takes a list of changes — a ref, its new value or a delete, and the old value expected or
  that it must not exist — runs them as one `update-ref --stdin` transaction, and returns committed or a typed
  rejection. A failed transaction exits 128 with one line naming only the first ref that failed, so the helper reads
  state rather than text: one `for-each-ref` re-reads every ref in the transaction, and a ref not at its expected value
  is a lost race, named with its actual tip. When every ref matches the failure is no race: Git has already waited for
  its locks, so the helper retries nothing and rethrows with Git's text, as D4 throws what it cannot classify — a stale
  lock file, a name colliding with an existing ref's directory, and a missing object each fail that way on Git 2.55. It
  replaces `isCasRejectionError` (`lib/git/ref-tree.ts:51`), which matches message text. Git reports per ref in a
  machine-readable form only under `--batch-updates`, which lets some updates land while others fail; a batch is all or
  none (D3), so it cannot use it.
- **Store writes wait longer for Git's lock.** Reftable puts every transaction in a repository behind one lock, its
  `tables.list`, so two processes writing unrelated surfaces collide there although ARC's per-surface locks do not
  overlap, and the files format locks each ref; Git waits 100 ms for either lock by default (`git help config`). Store
  writes pass `reftable.lockTimeout` and `core.filesRefLockTimeout`, each a few seconds, which the spec sets; the shared
  `packed-refs` lock a delete takes already waits a second (`core.packedRefsTimeout`). Reftable waits only from Git
  2.47, whose release notes give its locking a timeout "instead of failing on the first failure without retrying", so
  this work unit raises ARC's Git floor from 2.45 to 2.47 wherever it is stated: `packages/arc-framework/package.json`'s
  engines and their copy in `package-lock.json`, the shipped
  `packages/arc-framework/arc/reference/QUICK-REFERENCE.template.md` and this repository's
  `.arc/reference/QUICK-REFERENCE.md`, the test that pins it (`__tests__/unit/git/capability-contract.test.ts`), and
  `CONTRIBUTING.md`'s prerequisites, which still read 2.28. Keeping 2.45 with a bounded retry when every ref matches was
  the alternative, but it guesses at a lock the helper cannot see.
- **The floor is checked where an older Git explains a failure.** `engines.git` binds nothing, and the presence probe
  `checkGitAvailable` (`lib/git/exec.ts`) has no callers, so nothing enforces the floor today. The store runs
  `git --version` only when a store command fails in a way an older Git would explain — a transaction that fails with
  every ref matching, before the helper rethrows, or a usage error, the exit code 129 Git gives an option it does not
  know (tested on Git 2.55, 2026-10-10), as `fetch --porcelain` is before 2.41 — and below 2.47 the error names the
  version found and the floor. A command that succeeds spends nothing on it; checking once per process was the
  alternative, a spawn on every command that would double a no-change check's one Git call.
- **The machine-local lock per surface** (D11) is the advisory lock the notes and worktree-operation locks use
  (`acquireAdvisoryLock` in `lib/advisory-lock.ts`): one lock file per ref under the common Git directory's `arc/`, so
  every worktree of the clone serializes on it, as they share the refs, in either layout. A write that spans refs takes
  their locks in ref-name order, so two batches cannot deadlock, and a wait past its limit refuses `lock-held` (D4).
- **A push helper** turns `git push --porcelain`'s per-ref lines and the exit code into typed outcomes, by § Sync's
  retry rules, with `--atomic` and leases; it extends the seam's `stale-lease` expected outcome (`GitExpectedOutcome`
  in `lib/git/process-error.ts`).
- **Reads batch per operation,** each a one-shot process: one `for-each-ref` for tips and one `cat-file --batch` of
  `<tip>:<path>` names, a quarter ref's taken from its root and folder trees in the same process (§ Record encoding), so
  a `read`, a `list`, or a `lookup` costs one or two processes and `version` one (§ The version model), as today's batch
  reads do (`lib/io-context.ts`, `lib/git/object-availability.ts`). That meets the analysis's requirement that Git calls
  be batched or kept in one long-lived process (§ 6.10), where a spawn costs about 30 ms on Windows against 1.3 ms on
  Linux. The dispatched portability run before this work unit lands times representative commands on Windows
  (§ Decisions, Verification) against a budget the spec sets, and a long-lived reader joins the executor only if one
  exceeds it. A long-lived reader for every command was the alternative: a child process to open, close, and abort, and
  on Windows maintenance held until it closes, since an open pack cannot be deleted — for about 30 ms an operation that
  no measured command yet needs.
- **Cancellation on every variant.** The plain executor takes a `signal` (`cancelSignal`,
  `lib/git/process-executor.ts:137`); the stdin and byte variants, `GitExecInput` and `RawGitExec`, gain one, so a
  call stuck on a locked ref or a slow disk can be ended. The routed entry's precondition is met — `RawGitExec` lives in
  `lib/git/exec.ts` — and most of the inline `update-ref` calls it counted sit in notes code the cutover deletes, so
  they never move onto the helper.

### Maintenance and measurements (Owner, 2026-10-10)

- **`maintain()` joins the contract** — a forward amendment to D1. It runs `git maintenance run --auto` against the
  store, with `--git-dir` in the separate layout, and returns each never-retiring ref's commit count and
  `git rev-list --disk-usage`: the person's own `personal` and `claims`, `project/inbox`, and `project/registry` (D10).
  Handoff calls it, the firing point D10 leaves open, and shows what passes `seam-locus`'s bounds. Git's `fetch` runs
  `maintenance --auto` by default (`git help fetch`, Git 2.55, 2026-10-10), so every `pull` already maintains the
  store, but plumbing writes never do, so `maintain()` is a local-only store's one maintenance. The in-repo and
  reference implementations return no measurements.
- **Every push outcome carries its retry count and time waited,** as D11 says of the loop's result, where Part A's
  types carry them only on `retries-exhausted` (`PublishOutcomeSchema` in `lib/store/sync.ts`); handoff shows its own
  push's. The tripwire watches sustained contention, which that sample sees; a rare burst it misses sits under any
  bound, and an exhausted loop reports itself wherever it happens.
- The alternatives: maintaining and measuring inside every `pull` and `push`, where Git places its own `--auto` runs,
  which needs no operation but walks each never-retiring ref's history for `--disk-usage` on every push; and a
  machine-local log of every push's figures, which catches the bursts handoff's push misses at the cost of a record
  kept for an advisory signal.

### Verification (Owner, 2026-10-10)

- **Conformance over both layouts, with no exclusions beyond the reference backend's and ghost mode's two families.** A
  ref-backend fixture beside the in-repo and reference ones runs `registerStoreConformanceSuite`
  (`__tests__/helpers/store/conformance-suite.ts`) over real temporary repositories and a bare origin, once per layout:
  the default in a files-format code repository, the separate one in its reftable directory. It declares every family
  but `project-machinery` and `constitution`, which stay tracked files in the standard profile and get a ref only when
  ghost mode stores them (`profiles` in `FAMILY_REGISTRY`; D5, D19), so `ghost-mode` adds them here when it does. The
  three reserved families — `project-vector`, `user-vector`, and `user-configuration` — have no ref either, but they are
  registered with no kinds yet (`reserved` in `FAMILY_REGISTRY`; D5), so they list absent; each takes its ref with its
  first kind. A push's outcomes name every declared family in the push's scope, whether or not it pushed a ref of that
  family — the identity-scope ones only with an identity, and the no-identity state naming them without one — as the
  reference backend's one outcome does (`__tests__/helpers/store/sync.ts`) and the suite's family coverage requires
  (`publish-and-noop-family-coverage` in `__tests__/helpers/store/suite-sync.ts`). It declares merging, state off the
  branch, and that this backend runs write checks, so the shared suite's write-check item runs over it
  (`spec-seam-record-kinds.md` § 11.3); that item installs its test registration through
  `ConformanceRegistration.create`'s registry override (`__tests__/helpers/store/fixture-contract.ts`), which
  `seam-record-kinds` adds, so this fixture's store factory takes one. The reference fixture excludes only the in-repo
  implementation's own refusals — the cross-substrate and saved-state coverage items, `checkout-not-writable`, nine of
  the ten `unsupported` cases, and the transient-write cases — and declares `rejectingContentUnavailable` for the prose
  and entry-list kinds its test parsers cannot write (`__tests__/helpers/store/reference-fixture.ts`). This fixture does
  the same, its `familyExclusions` and `rejectingContentUnavailable` leaving out the two undeclared families and their
  kinds, which the suite refuses for a family the fixture does not serve (`validateFamilyExclusions` and
  `validateRefusalAndContentExclusions` in `__tests__/helpers/store/conformance-suite.ts`), and like it produces the
  tenth, `held-here`, which every backend whose state is off the branch owes (D1, D4; `held-here-unsupported-remedy` in
  `__tests__/helpers/store/suite-lookup.ts`); the in-repo fixture also excludes its notes and Errand producers
  (`__tests__/helpers/store/README.md`). This backend is the contract's whole implementation, so any further exclusion
  is a defect or a forward amendment. The transaction helper's own tests run both ref formats, since reftable puts every
  transaction behind one lock (§ Decisions, Git access), and on reftable a `version` listing beside a writer moving refs
  in two namespaces in one transaction never sees part of it (§ Decisions, The version model).
- **The suite follows the D1, D4, and D10 amendments.** Its sync items move to `push`, and it gains items for `pull` —
  it merges and publishes nothing — for `maintain()`'s result, measurements or none, and for the unresolvable state
  version's refusal, which a backend produces or excludes by name (D7) and the ref backend produces. Its
  `diagnostic-oversized` assertion selects only the kinds the size cap reaches, through `everyKind`'s `select`
  (`__tests__/helpers/store/suite-tools.ts`), so the in-repo fixture stops running it for its Errand and claims records,
  which that implementation caps as transient identity records (`MAX_LOCUS_JSON_BYTES` in
  `lib/store/in-repo/transient-read.ts`), and its declarations drop their `diagnostic-oversized` exclusions for
  never-projected kinds (`__tests__/helpers/store/in-repo-declarations.ts`), which the suite's declaration inventory
  would refuse as unused (`validateUsedAssertionExclusions` in the same `suite-tools.ts`).
- **Serialization refusals.** The ref backend's tests refuse each rule — a binary file, a file of a kind the working
  copy shows over the cap, an `.env` file, and a private-key file — with `record-malformed` naming the rule, at `write`,
  at `batch`, and in the import's build; and a Candidate record over the cap writes, lists, and reads back through
  `history`.
- **The migrate verb and the import, by comparison.** Each move — a clone's layout both ways, a project's remote with
  its forwarding record, a remote move that changes the clone's layout, a move into a store that holds state, and the
  import — is interrupted after each step and run again to completion, and a trial run's report matches what the move
  then does. The remote move runs with a second person's identity refs and a history ref the moving clone never pulled
  on the old remote, and both must reach the new one. It also runs with a teammate's write and a teammate's end of an
  item landing on the old remote after the copy, and afterward the new remote must hold the old one's last state and the
  old remote only the forwarding record. The import runs over a fixture repository in today's substrates, and afterward
  every record the in-repo implementation lists reads the same through the ref backend — its content and every field
  both carry, never its version, which differs by design (§ Decisions, Record encoding) — but for the transforms § The
  migrate verb and the import names: UIDs; each closed task's captures added to its work unit's links; an Errand's
  description from `intent` where its origin entry is gone; folded session notes; buffer sections and held captures
  moved into inbound lists; open Errands' origin entries moved into their descriptions; execute-bound marks become
  queues; transient-identity refs re-homed; JSON machine records in canonical form; `_Id:_` stamps; dropped tombstones;
  scratch moves; and rename records become former slugs. What the import reads directly, which the in-repo
  implementation cannot list, is compared with its own source: each person's notes snapshot with that person's imported
  personal ref, the review gate's evidence, outcomes, and termini with the gate's own reads of them under `.git/arc/`,
  keyed by a project ID equal to its repository ID, and Errand descriptions, inbound lists, and queues with the origin
  entries, buffer sections, held captures, and marks they came from, and each closed task's captures with the in-repo
  implementation's `lookup` by commit, which answers through the `Context:` footer until the flip (D3): every commit
  whose footer names a task closed at import resolves through both to the same work unit and the same closed tasks. The
  lifecycle work's differential helper (`__tests__/helpers/store/lifecycle-differential.ts`) is the precedent, and
  `storage-cutover`'s rehearsal on a clone of this repository follows. A completed work unit the import landed reopens
  and takes a write, as one archived after the flip does, and a write to a closed cohort's document lands on its history
  ref, `refs/arc/history/cohort/<uid>`. Each Candidate record gets the same result through the store's `history` as
  today's reader gets over code history (`resolveCandidateSupersessionAncestors` over the versions
  `readRepositoryCandidateSupersessionChain` reads) — the same chain, or the same refusal: in the fixture, a chain with
  a version a merge commit introduced, which resolves, and a broken chain and a record today's schema rejects, which
  refuse on both sides; in the rehearsal, every Candidate record in this repository, six of which refuse (§ Decisions,
  The migrate verb and the import).
- **Who designates, case by case.** Integration tests run `arc init` and a fresh clone's first run over each case
  § Layouts and remotes lists — the code remote holding the registry, an upstream holding it, neither, a tracked
  pointer, and a run that cannot ask — and with the pointer the code remote is never set or asked about; `ghost-mode`
  adds its cases (§ Coordination).
- **Multi-process: a smoke on every change, the bursts on schedule,** held to the spikes' pass criteria for writes — no
  lost write, bounded retries, typed conflicts (analysis § 11.4). In the integration tier: a few processes writing one
  surface and several, in both layouts, and two and three clones pulling and pushing to one bare origin, the model
  check's failing traces among the cases (§ Prior art): two clones ending one item, each perhaps after a reopen of its
  own; an end against a published reopen; a write racing an end between the push loop's pull and its push; and the
  restore after a mirror push. With the scheduled Windows and macOS pair: `storage-projection`'s ask, twenty worktrees
  saving and draining at once, and twenty clones converging on one ref. The full bursts took about 12 s on Linux and
  378–401 s on Windows (analysis § 11.5).
- **Windows and macOS through the portability lane** (D13), whose cross-platform pair runs on schedule and dispatch
  (`portability-cross-platform` in `.github/workflows/ci.yml`): `--git-dir` with Windows paths, reftable on NTFS, and
  process-start cost. One dispatched run passes before this work unit lands, and it times representative commands
  against the spec's Windows budget (§ Decisions, Git access).
- **Hosts: a scripted trial, run by hand.** The analysis's host trial (§ 11.3) is run again against the built backend:
  GitHub and GitLab must hold, Azure DevOps and Bitbucket should — Bitbucket was never tested — and Gitea and Forgejo
  are best effort. It adds what this design relies on: `--porcelain` on each host, what a receiver without atomic pushes
  prints, each host's text for a lost race under `--atomic`, leased deletes, the forwarding record, Azure DevOps' fork
  copying (§ Decisions, Layouts and remotes) and its ordinary members' permissions, and the push refusal the analysis
  never captured (§ 11.7). It needs credentials and scratch repositories, so it is a kit run by hand with its results
  recorded in the notes, never CI.
- **What personal files' shared names cost a pack** is measured locally: several people's personal refs pushed to a
  bare repository and packed, today's names against names ending in the person's id (§ Decisions, Record encoding). A
  host's own packing cannot be observed, so this measures Git, not a host.
- **Which suites survive the cutover:** a suite that runs the shared conformance suite, or tests a consumer through the
  contract, survives; one that targets the in-repo implementation, notes, or Errand refs by name retires with them, and
  the list goes to `storage-cutover`'s deletion pass. Until the cutover CI runs both backends, so the ref fixture copies
  a prepared template repository per test rather than creating one, and its cost is measured on GitHub-hosted runners
  against the in-repo conformance's 34 s. Those figures came from the retired self-hosted pool, where
  `storage-contract`'s 59 integration files added about 131 s to every full run, the integration job rising from about
  354 s to 495 s. The spec sets the budget from that measurement, and the new test files move the test-cost budget rows
  they touch, baselined before the first lands, as the contract's § Testing requires.

## Left to the spec

Every design question this draft opened is settled in § Decisions. What remains are the particulars a spec pins down:

- **The version model:** the name of the unresolvable state version's refusal code.
- **Record encoding:** each never-projected kind's stored path, and the registry home that carries it.
- **Sync:** the push loop's deadline; `pull`'s result shape, with the ended items whose conflict records it names, the
  ends it withdrew, and the items with two published ends; and how a push outcome reports a carried ref's refusal.
- **Lifecycle moves:** a closed cohort's folder in its quarter's ref.
- **Layouts and remotes:** the refusal for two remotes marked `push`, and the verbs and session points that ask.
- **The migrate verb and the import:** the verb's name, its trial run's report, and the import's entry point.
- **Git access:** the two ref-lock waits, the advisory lock's wait before `lock-held`, and the Windows command budget.
- **Maintenance and measurements:** `maintain()`'s result, and the fields every push outcome gains.
- **Verification:** the CI budget and the bursts' sizes.

## Prior art

One external pass on 2026-10-10, three facets, from fetched sources without further verification. Claims marked
_unverified_ rest on the researchers' memory; check them before a decision rests on them.

- **State tokens.** CouchDB's clustered `_changes` sequence encodes every shard's position and replays on a stale
  `since`, so its consumers stay idempotent. Cosmos DB continuation tokens and MongoDB resume tokens die with the log
  behind them, as etcd's compacted revisions do. etcd's revision and Datomic's `t` need one writer. A Flink checkpoint
  and a `jj` view record every source's position as one object; Dolt's root hash names the whole store but needs every
  writer to move one root (_unverified_); reftable's `update_index` is local to one repository (_unverified_ that it
  never transfers).
- **Record versions.** Kubernetes' `resourceVersion` changes on every modification, `generation` only with desired
  state. Cloud Storage's `metageneration` moves with metadata and resets with each `generation`, and its documentation
  pairs a metageneration precondition with a generation one. S3's ETag reflects contents only; Azure's moves on any
  write, metadata included (_unverified_ for the ETag itself). CouchDB's `_rev` hashes the body with its predecessor
  (_unverified_).
- **Git refs as a database.** git-bug — one ref per entity, refspecs in memory, operations ordered by Lamport clock, a
  disposable excerpt cache. Gerrit NoteDb — compare-and-swap as the only atomic operation, `BatchRefUpdate`, sequence
  blocks, and a restartable one-time migration. git-annex — a private index and union merge. `jj` — `refs/jj/keep/*`
  pins against garbage collection. Git's own `git-push`, `git-fetch`, `git-update-ref`, and `git-maintenance` manuals.
  Git's default pack name hash reads a path's last sixteen characters, and its opt-in second version mixes in the
  path's directories (`pack_name_hash` and `pack_name_hash_v2`, read in source 2026-10-10).
- **Sync and lifecycle idioms** (§ Decisions, Sync and Lifecycle moves; from memory, _unverified_): Fossil's `sync`
  runs a pull and a push, as editors' "Sync Changes" does, while Git, Dolt, and git-bug name the two directions `pull`
  and `push`; jj marks a bookmark that moved on both sides conflicted after a fetch; CouchDB deletes by writing a
  `_deleted` revision; Gerrit deletes refs through `BatchRefUpdate` with an expected old id and numbers changes on its
  server; offline-first stores replace a temporary ID at sync; retries back off exponentially with jitter. Git's
  refspec rule — no update but a fast-forward without `+` — and `--force-with-lease` are its documented behavior.
- **Remote designation** (§ Decisions, Layouts and remotes): `git remote rename` and `git remote remove` were tested on
  Git 2.55 in a scratch repository (2026-10-10); Git's own per-remote keys are read from `git help -c`; the
  `gh-resolved` key was found in the `gh` binary; git-annex's per-remote `annex-*` keys are from memory, _unverified_.
- **Unverified and load-bearing:** protocol v2 narrowing `ls-refs` to a command-line refspec's prefixes, and that Git
  from late 2019 on keeps the `atomic` capability over HTTP.
- **Torn reads, tested** (scratch probes on Git 2.55, 2026-10-10): a writer moved `refs/arc/work/a` and
  `refs/arc/project/inbox` together in one `update-ref --stdin` transaction while a reader listed both with one
  `for-each-ref` and counted listings that disagreed. The files format tore with one pattern, `refs/arc/`, in 24 of
  11,288 listings and with two in 659 of 11,263; reftable tore in none of 11,303 with one pattern, none of 11,015 with
  one pattern and `--exclude=refs/arc/history/`, and 81 of 11,221 with two, since `for-each-ref` reads one snapshot per
  pattern (§ Decisions, The version model).
- **A model check of the sync and lifecycle rules** (2026-10-10): an exhaustive breadth-first search over one work
  item's states on two and three machines and a remote — writes, writes to the completed item, archive, abandon,
  reopen, pull, push, and a mirror push that deletes every state ref or only the history ref — checking that the remote
  never holds the item live and ended, ended twice, or live beside its end record, that no write is lost, and that
  repeated pulls and pushes settle. A ref's value is its set of commits, ancestry a subset and a merge a union, so it
  checks the rules, not Git. The rules as drafted failed four ways, each folded with its trace's case (§ Decisions,
  Sync): an unleased live-ref push recreating a ref another machine's end deleted; two clones each reopening and ending
  an item between pushes, which publish only history-ref updates, so no live ref prunes; a clone's own end folded into
  another machine's published reopen; and a history-ref create that lost to a restored ref, never fetched by name, so
  the push loop spun to its deadline. With them, two machines explore clean in full and three clean to 1.5 million
  states. After a mirror push, machines restore differing copies: a stale ancestor read as divergence until the
  ancestry rule took it as a loss, a stale copy with its own pushes still diverges, and two ends both published read
  as two — the residuals § Sync states. No case lost a write.
- **Tested, no longer load-bearing:** a `cat-file --batch-check` started before them found loose objects written later,
  newly packed ones, and every object after `gc` had replaced each pack (Git 2.55 on Linux, 2026-10-10) — the
  long-lived reader's question, kept for when a measured command calls for one (§ Decisions, Git access).
- **Sources:** kubernetes.io/docs/reference/using-api/api-concepts; the Kubernetes API conventions
  (github.com/kubernetes/community, `api-conventions.md`); docs.cloud.google.com/storage/docs/metadata and
  …/request-preconditions; docs.aws.amazon.com/AmazonS3/latest/API/API_Object.html and
  …/userguide/conditional-writes.html; learn.microsoft.com/en-us/rest/api/storageservices/set-blob-metadata;
  docs.couchdb.org/en/stable/api/database/changes.html and …/replication/conflicts.html;
  learn.microsoft.com/en-us/azure/cosmos-db/nosql/change-feed-pull-model; mongodb.com/docs/manual/changeStreams;
  etcd.io/docs/v3.5/learning/api; docs.datomic.com/reference/log.html; docs.jj-vcs.dev/latest/technical/concurrency;
  git-scm.com/docs/reftable; the Flink stateful stream processing concepts; git-bug's `doc/design/data-model.md` and
  `architecture.md`; Gerrit commits `577e8fc66c`, `66ea2ed46e`, `05eaefe36d`, `029d2568393f`, and its `note-db.html`;
  git-annex.branchable.com/internals; git-scm.com/docs/git-push, git-fetch, git-update-ref, and git-maintenance; and
  github.com/git/git, `pack-objects.h`.

## Coordination

- **`storage-projection`** — joint on the record version and its base stamp (§ Decisions). It consumes `changes` since
  the state version each worktree's index records, rebuilding the worktree from the current state when that version no
  longer resolves, since only the newest manifest is kept from Git's expiry (§ Decisions, The version model), and
  `history` newest first for base-stamp recovery; runs its multi-process lane over this backend; and reports the
  serialization refusals the backend enforces. Asks route at this draft's close.
- **`storage-seam`** — this work unit depends on `seam-record-kinds` (Owner, 2026-10-10; § Decisions, Ownership), whose
  registrations, write checks, `anchorFields`, and `HAND_EDIT_VERBS` this backend's write path calls from the flip; it
  sets the field schemas the import writes, the meta's anchor field, and the fold of `SESSION-NOTES.md`, and settled the
  anchor field's declaration and the write check's shape with this work unit (2026-10-10, § Decisions); `seam-locus`
  owns the tripwire bounds and their report, calling `maintain()` at handoff and reading its own push's figures
  (§ Decisions, Maintenance and measurements), and `lib/errand/record.ts`'s index projection with each consumer's
  protocol (the contract notes' § Who builds Part B). A read as of a state version, `changes` from one, or a write to a
  completed item refuses on a clone lacking an ended item's history ref, and the verb pulls it by name and retries
  (§ Decisions, The version model): `seam-locus`'s restate and recovery, `seam-lifecycle`'s reopen, which pulls first,
  and any member's verb that writes a completed item's records, resolving a conflict record there among them. Recovery
  rebuilds from the current state when a compaction seed's state version no longer resolves, and restate from another
  person's anchor reads project scope alone (§ Decisions, The version model). Asks route at this draft's close.
- **`storage-cutover`** — runs the import, and again after the first push to clear the transient-identity refs from the
  remote, and the rehearsal, which compares every Candidate chain through the store with today's reader; rewires
  `arc sync` onto the contract's `pull` and `push` (§ Decisions, Sync); deletes the notes machinery,
  `refs/arc/user/<id>/sync-state` among it, the in-repo implementation's arms, and the import's transform with them. Its
  quiesce carries this repository's pre-import tidy, worked from the import's trial run, brings every machine's notes to
  the importing machine, and finishes review on every other (§ Decisions, The migrate verb and the import). Asks route
  at this draft's close.
- **`public-repo-flip`** — this repository runs the default backend with its personal state published (§ Decisions, The
  version model), superseding the 2026-10-06 amendment to the register's row, which held personal state off the public
  remote until a backing repository or local-only backend arrived. Routes at this draft's close.
- **`history-policy`** — store history stays immutable (A4); the pre-push hook treats state refs apart from code.
  `carry` takes the remote tip it expects, so a branch rewritten under `rewrite-with-lease` rides the state push
  (§ Decisions, Sync). Routes at this draft's close.
- **`ghost-mode`** — runs on the separate layout, local-only or with a designated state remote (D19). When it places
  `project-machinery` and `constitution` on refs, the ref fixture declares them (§ Decisions, Verification). It wires
  the designation rule's ghost cases — its local-only pointer, read from `config-storage-architecture`'s per-machine
  tier, and an install without one — so the code remote is never designated, with their tests (§ Decisions, Layouts and
  remotes). Routes at this draft's close.
- **`configuration`** — the state remote's designation stays in Git config, outside `config-storage-architecture`'s
  move of the `arc.*` preferences into files (§ Decisions, Layouts and remotes), which answers its routed question at
  this draft's close; the deferred designation per scope routes then as a follow-on beside it (§ Decisions).

## Unknowns and Assumptions

- The host, concurrency, and growth figures behind Part B are historical, transcribed, one-setup inputs (the contract's
  § Performance); this work unit verifies its actual hosts.
- Untested: Bitbucket; ordinary members' ref-level permissions on Azure DevOps; and one history-replay push refusal
  whose message was never captured, which the push loop's retry set may miss (analysis § 11.7).
- Assumes `storage-projection`'s base stamp stays the Git blob id of the stored content.
- The prior-art pass's unverified claims (§ Prior art) are assumptions until checked against Git and the hosts.

## Scope boundary (Won't Do)

- Change any caller-visible behavior Part B settles, except by forward amendment to the contract's spec.
- Build the projection, `arc save`, write-back, or the worktree lock (`storage-projection`); the parsers, field
  schemas, write checks, or the rerouting of callers (`storage-seam`); or the flip, `arc sync`'s rewiring, the workflow
  rewrite, or the deletion passes (`storage-cutover`).
- Build what D20 defers — rotation, a query cache, protected state, or a service backend — beyond the reserved field
  and the measurements the tripwires read.
- Build the history policy's code-branch side (`history-policy`) or ghost mode's non-storage half (`ghost-mode`).

## Inbound dispositions

The Owner's pass that made the draft ready (2026-10-10) cleared the inbound buffer; this table retires with the draft
at create-spec.

| Entry                                                                                  | Outcome                                   | Folded into, or why                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Give the Git executor the capabilities the ref backend needs                           | fold                                      | § Decisions, Git access, with § Sync's retry set and `carry`; the entry's `isCasRejectionError` locus is `lib/git/ref-tree.ts:51`, and its `RawGitExec` precondition is met                                                                             |
| Derive task captures for pre-flip commits from their footers in the import             | fold, with one part dismissed             | § Decisions, The migrate verb and the import; dismissed: keeping `_Id:_` out of the inbox digest, which the contract resolved instead by carrying each open Errand's origin entry into its description before the stamp (D11, Open Errands at the move) |
| Decide which store integration suites survive the cutover, and size them for CI        | fold                                      | § Decisions, Verification                                                                                                                                                                                                                               |
| Convert existing buffer sections and pending owner-adoption holds at import            | fold, with its confirmation routed onward | § Decisions, The migrate verb and the import; `storage-cutover`'s confirmation that none is left behind joins its asks at draft close                                                                                                                   |
| Treat a red push gate as the code leg's failure, so the state leg still publishes      | fold                                      | § Decisions, Sync, `push({ carry? })`: a pre-push hook's refusal of a push carrying a code ref ends the code leg, and state pushes alone                                                                                                                |
| Run write checks in the ref backend, and fold session notes and routed lines at import | fold                                      | Own-work coverage: § Decisions, The version model (the write check) and The migrate verb and the import (no check on the move, the `SESSION-NOTES.md` fold); the routed line's date as `_Created:_` added to the import                                 |

---
