# Draft: Storage Contract

- **Origin:** [internal] — renamed from `arc-backend` at the `state-storage` re-cut (2026-09-28). It absorbs
  `local-mode`, whose draft is `research-local-mode.md`, and inherits the integration-time record question from the
  retired `meta-file-tracking-model`.
- **Purpose:** Define the one storage contract through which every ARC reader and writer of operational and planning
  state goes (ADR-035), and ship it over today's tracked layout. The subsystems then move onto the contract before
  the ref backend exists, and the later backend flip changes nothing above it.
- **Planning posture:** `Novel`, `P1`. This is the `state-storage` cohort's design core: `storage-seam` inherits
  its consumer map, and `storage-ref-backend` and `storage-projection` implement its interface. Those two may
  design alongside this work unit once the decisions they share are drafted here, and may implement once this
  work unit's spec is approved.

---

## Continuity

- **Readiness:** rough. The scope, what this work unit lands, and the working rules are settled; the decisions the
  siblings wait on are still open.
- **Resolved (2026-09-29):** stage entry (§ Stage entry); what lands here and what is handed off (§ What this work unit
  lands); the register's landing route (§ The storage-coupling register); inbox write serialization (C1); ghost mode as
  a core requirement with a middle-ground split (C8); record format skew (C2); the register sweep, landed on `main` (PR
  #738); the Inbound Buffer, integrated into the ledger and the consumer map; reverse lookup and assurance-chain
  carry-forward (C1); project identity (C7); the GitHub Enterprise Server host test, which held (C3); shared surfaces
  projected into every worktree, the `active/` layout with ownership by folder and edit rights under `in-flight/`, the
  projection's name, the firing points with `arc save`, and opt-in editor settings (C6); the two-level family model and
  the family list, review evidence as stored, and machine-local state as a projection property (C2); identity as a
  name plus a UID (C2), the ref surfaces keyed by UID (C3), and slug guards and entry IDs (C4); the local copy
  following the remote — the code repository's refs by default, a separate Git directory otherwise (C3).
- **Open:** every `Open` item in § Decision ledger; the consumer map.
- **Next:** the remaining concurrency details (C4).

---

## Problem / Motivation

ADR-035 decides that operational and planning state leaves tracked files and Git notes for `refs/arc/*` behind one
storage contract, and the storage analysis measures why (§ 2 there). The decision leaves the contract itself open:
its families and operations, the ref layout, the concurrency details each shared surface needs beyond its named
mechanism, and what a caller sees through the projection. Four sibling work units build against those answers, and
`storage-seam` decomposes against this work unit's consumer map. Every question left soft here becomes a
coordination seam between siblings that are meant to run in parallel.

---

## Stage entry

- **Depth and `Class`.** `high`; `Novel` confirmed. The contract and record model compose substrate ARC already runs
  — user sync's ref-backed file store, the Errand identity refs, the generic ref-tree helper, the meta parser and
  kernel schemas. Refs are precedented (Gerrit NoteDb at Android and Chromium scale, git-bug, Radicle, beads) and
  swappable, since the target namespace is a backend parameter. The invented part is the projection: editable copies
  kept current across worktrees with base-checked write-back, which has no close precedent — the bet is the
  projection, not the refs.
- **Research.** The Novel overlay's discovery phase already ran as ADR-035's research and nine spikes (analysis
  § 11), and the GitHub Enterprise Server host test closed the last gap on the must-hold floor (C3).
- **Boundary: stays one work unit.** The contract's interface, record model, concurrency library, conformance suite,
  and in-repo implementation are one design expressed in different forms; the cohort re-cut already separated the
  independently deliverable work (seam, ref backend, projection, cutover). The pieces are reviewable separately but
  not usefully landable alone, so ordinary review chunking covers them.

## What this work unit lands

**Parallelism rule (Owner, 2026-09-29).** After this work unit most of the program runs in parallel, which is the
largest calendar lever the storage concern has. It holds only if each parallel member depends on the landed contract
and never on a sibling. So this work unit builds or settles whatever two or more parallel members share or whatever
defines their boundary, and hands off what only one member needs — every addition here delays the seam's start.

Lands, as code:

- **The contract** — its interface, families, operations, typed refusals, and conflict records.
- **The concurrency library** — entry merge for list surfaces, three-way merge for prose, the typed conflict record,
  and rank keys, as pure functions. `storage-ref-backend`'s push loop and `storage-projection`'s write-back both
  consume it, so neither builds it for the other.
- **The conformance suite** — one suite every backend passes: in-repo, refs, and local-only. It forces the conflict
  and stale-base paths the in-repo backend never produces, so seam callers handle them before cutover. It is also
  the non-git substitutability acceptance test: could the contract be implemented on a non-Git backend without
  touching anything above it? Git is the storage engine, never the schema.
- **The in-repo implementation** over today's tracked layout, which the seam routes onto first.

Designed here, built elsewhere:

- **Local-only backend** → `storage-ref-backend`: the ref backend with sync switched off (C1, C7).
- **Worktree lock** → `storage-projection`, beside its teardown refusal for unadopted files (C9).
- **Migrate verb** → a contract requirement (C1), built where first needed, likely `storage-ref-backend`.
  Candidate: the import becomes a migrate from the in-repo backend to the ref backend, with `storage-cutover`
  gathering each branch's copy. Confirm when the family list settles.
- **Ghost mode's non-storage half** → a follow-on stub tagged core (C8).

Planning outputs: the consumer map, the core-or-deferred tags (C14), and the completed register.

---

## Decision ledger

Status words: **Decided** (recorded; cite the source), **Requirement** (a constraint the design must meet),
**Leaning** (the Owner's direction, not yet decided), **Open**. `ADR-035` is
`adr-035-keep-operational-state-in-repository-refs.md`; "analysis" is `analysis-storage-substrate-direction.md`.

### C1. Contract operations and semantics

- **Decided** (ADR-035 item 1): one interface owns read, version-checked write, list, history, and sync of state
  families; nothing above it knows which backend is active; the target namespace is a backend parameter.
- **Decided** (Owner, 2026-09-29): write serialization per ref belongs to the contract — compare-and-swap writes
  plus the machine-local write lock that removed the spike's retry tail. The inbox writer
  (`commands/user/inbox-mutation.ts`) becomes a contract client; `getNotesLockPath` and
  `getRepoSharedUserInternalDir` retire with notes sync. Settles the `R-LOCK` capture.
- **Requirement:** sync is its own operation, so a backend without sync is a configuration, not an implementation.
- **Requirement:** every family is listable and readable, and writable with its identity intact, so migrate between
  backends is generic over the contract.
- **Requirement:** a verb confirms its own write from the local store, never from a fresh fetch — a host's replicas
  may lag (analysis § 11.1).
- **Requirement:** the store is CLI-internal plumbing. Agents and people work through the projection and `arc`
  verbs, and no agent runs Git against the store; which family a write lands in is computed by the CLI, never left
  to agent judgment.
- **Decided** (Owner, 2026-09-29): reverse lookup is a contract query — from a repository plus a commit or ref to the
  owning work unit, and for delivery to its plan and member. Delivery's record port needs it, and so does ghost mode's
  traceability inversion (C8), where the task record captures the commit and `arc` resolves both directions.
  Delivery's other port requirements — artifact reads and writes, version-checked reconcile, named failures — are
  already contract operations.
- **Decided** (Owner, 2026-09-29): migration carries assurance chains forward. No live query can rebuild them, so the
  import (`storage-ref-backend`) carries every chain, and no adapter retires before its chains are carried.
- **Open:** the typed refusal and failure taxonomy — harmonize user sync's transient, push-failed, and divergent
  classes with push refusals and typed conflicts. Store-write failures surface as orientation lines at session
  boundaries; sessions never stall on the store.
- **Open:** whether store history carries a per-write message, so evidence that today rides a ceremony commit body
  (advisory adversarial-pass evidence, review evidence) keeps a home.
- **Open:** the continuity anchor. SESSION-NOTES' `Commit at Handoff` and handoff's
  `git show <hash>:<meta-path>` key continuity to a code commit, which `rewrite-with-lease` can make unreachable
  (`strategy-storage-evolution.md` Principle 11). Candidate: anchor on the store's state version and read previous
  values through `history`.

### C2. Record model

- **Decided** (ADR-035 items 3 and 5): the clean split — all operational and planning state leaves tracked files,
  `completed/` included, and its projection at `.arc/completed/` stays browsable; machinery and constitutional
  documents stay tracked; no in-repo operational-state tier remains. Files first: file groups behind the contract with
  a file-copy projection, and a records engine later.
- **Decided** (Owner, 2026-09-25): file-as-record. Fields are parsed from the file, which is itself the record, and
  validated at write-back; rendering is only for derived views (ROADMAP, STATUS). Precedent: Obsidian's front-matter
  properties, queried by Dataview. `operational-state-docs` carries ADR-022's amendment.
- **Decided:** placement is a record field and directory layout a projection of it.
- **Decided:** locus derives from the checkout marker plus the store, with a primary marker allowed for `--here`.
- **Decided** (Owner, 2026-09-29): format skew. Every family carries a format version; a record newer than the build
  refuses with a typed "merge base or rebuild" remedy; **a record unrelated to the current work unit never blocks
  session-init**. The store sits in the common Git directory, so every worktree's build reads every record, and
  worktree builds lag base by weeks (`WORKING-MEMORY`: an older build rejecting a Candidate record's enum values).
- **Leaning:** a record-aware seam from day one. Every reader asks the contract for a document's fields through its
  family's parser, never by path or placement; the meta parser and the kernel schemas already exist. File formats do
  not change at cutover, the query cache indexes the parsed fields, and the records engine later changes what sits
  behind each parser without moving storage. The Owner's instinct is to design for records from the start rather than
  do the work twice. Counter-risk: tying the cutover to every family's schema design.
- **Leaning:** a query cache built from the store, targeted early if viable, never the authority — a local SQLite
  index of record fields keyed by ref tips and checked on read, so it cannot serve stale state (git-bug #235).
  Node's built-in `node:sqlite` may avoid a native dependency; verify against the supported Node range. Raw reads
  need none (every work unit's meta at its tip, 601 of them, in one 17 ms batch), so its case is queries across
  fields and live views, including typed reads for `arc view` and the status HUD. A binary store is never the
  authority: it does not diff or merge in Git and makes conflicts opaque.
- **Decided** (follows from ADR-035 item 3): after cutover a Candidate's review subject is the code in the Git index
  alone; design artifacts reach review only through the export setting (C10). `storage-seam`'s review and evidence
  work redefines the subject, and the evidence-neutral path treatment goes with the register's lifecycle
  classification row.
- **Decided** (Owner, 2026-09-29): two levels. A **family** is the storage grouping — scope (project or identity), ref
  placement (which may be a subtree of another family's ref), retention, sync, tracked-versus-stored profile, and
  lifecycle. A **kind** within it carries the parser, format version, writer rule, and projected path. The split is
  forced: each work unit is one ref with one lifecycle, yet its meta and task list take a different writer rule from its
  prose (C6), and a backlog stub is groomed by anyone while an in-flight one is not. C3 decides how each family shards
  into refs; C4's "surface" names one ref's share of a family. This work unit owns the list and each family's storage
  properties; each family's field schema stays with `storage-seam` or the follow-on that owns it, so the list commits no
  schema.
- **Decided** (Owner, 2026-09-29): the families. The list drives the ref layout (C3), migrate's coverage (C1), and the
  conformance suite.
    - Project scope:
        - **work units**, across their whole lifecycle, `completed/` included — kinds: meta and task list (machine
          records), and draft, spec, notes, and companions (prose), under C6's writer rules. The layout resolver already
          names the first five; companions follow ownership by folder;
        - **cohorts** — cohort documents, three-way line merge;
        - **the project inbox** — `ATOMIC-INBOX`, entry merge;
        - **delivery and review records** — Candidate records (`candidates/*.json`), integration boundaries
          (`*.boundary.json`), and review evidence: machine records written only by verbs. One family for now;
          `storage-seam`'s review and evidence work and `delivery-observe-attest` split its kinds, and part of the
          delivery machinery may go with the substrate;
        - **project identity and counters** — the project ID (C7) and record-number counters, by compare-and-swap;
        - **lineage** — terminal transition records (decomposition, `transitions/*.json`) and retirement receipts,
          keyed by the UID of an origin that no longer exists. A rename is not terminal: the work unit keeps its UID
          and records its former slugs, so an old name still resolves;
        - reserved: `VECTOR.PROJECT` (`goal-aware-direction`).
    - Identity scope, one person across their machines:
        - **personal surfaces** — `USER-INBOX` and `WORKING-MEMORY` (entry merge) and personal documents; reserved:
          `VECTOR.USER`, and `config.user.yml` for `config-storage-architecture`;
        - **the per-work-unit personal workspace** — `SESSION-NOTES` and companions such as `capture-notes.md`;
        - **Errand identities**, already live under `refs/arc/user/<id>/errands*`.
    - Not families: the machine-local set (below); derived views, never stored — ROADMAP, `STATUS.USER`, the archive
      index, and the query cache; and the tracked machinery and constitutional documents.
      `strategy-file-classification.md`'s taxonomy governs update behavior, a separate axis.
- **Decided** (Owner, 2026-09-29): review evidence is stored, at project scope. It must survive archive and a change of
  machine, and the integration boundary files are today the Owner-accepted terminus's only store. The review records
  now in the per-work-unit personal workspace, swept at archive (register row on that workspace), move there, beside
  review receipts. `review-protocol-alignment` designs the terminus's durable form against this.
- **Decided** (Owner, 2026-09-29): everything under `.arc/user/<id>/` except the machine-local set is stored and synced;
  a subdirectory is a work unit's personal workspace only when it is named for one. Today's classifier
  (`lib/user-sync/classifier.ts`) reads any subdirectory as per-work-unit, so personal subdirectories (`archive/`,
  `drafts/`) are never saved; the import classifies them as personal documents.
- **Decided** (Owner, 2026-09-29): machine-local state is not a family but a projection property — a local-only path
  set the projection enforces (`strategy-storage-evolution.md` Principles 8 and 9). Invariant: machine-scoped state
  never round-trips through a store shared across machines. Today the only boundary is notes code — the dot-prefix
  rule in `lib/user-sync/classifier.ts` and the serialize-walk prefilter — over the compaction seed, nudge markers,
  sync state, the release audit log, the setup marker, and load backups under `.arc/user/<id>/.internal/`, and
  `.notes.lock` and `.machine-id` in the common Git directory. Session locus records under
  `.arc/user/<id>/.internal/loci/` are the sharpest case: synced to another machine, one machine's leases and process
  anchors would read as live foreign occupancy.
- **Decided** (Owner, 2026-09-29): identity is a name plus a UID, the Kubernetes model. The slug is the name: the
  human handle, unique among live records of its kind and reusable once its record completes. The UID is minted at
  creation with `crypto.randomUUID()`, never reused, and never changes, so it tells a recreated record from an earlier
  one of the same name. Work units, cohorts, and Errands carry one; the project ID (C7) and Candidate records already
  do.
    - Random, neither time-ordered nor sequential. UUIDv7 and ULID prefixes are timestamps, so short prefixes of IDs
      minted close together collide; sequential numbers collide across offline machines, which is why beads moved to
      hash IDs (v0.20.1). Counters people read — ADR numbers, the archive sequence — stay counters, as labels rather
      than identity.
    - Display is the shortest unique prefix, as Git abbreviates. A durable name that carries one, such as an Errand
      branch, takes a fixed eight hex characters. A recurring generic name takes a UID suffix, never a date, which
      orders but does not disambiguate. The Errand branch change runs ahead as a captured Errand; re-keying the
      Errand ref tree is `storage-ref-backend`'s.
    - Machine records reference each other by UID; prose keeps names and backticked filenames. UIDs never enter
      filenames or projected paths, which stay slug-keyed.
    - The meta gains an `Id` field, a schema change `storage-seam` makes; the import mints a UID for every existing
      record.
    - Two guards hold slug uniqueness, since two live records with one slug would project to one path. Work-unit
      slugs and cohort names share `backlog/planned/`'s children, so each guard checks both kinds. At creation, the
      slug is checked against live records in the local store, fetched first when online, and a clash refuses with a
      rename remedy. A clash between machines resolves by write-then-gate (C4): both records exist, the projection
      refuses to place the second on the taken path, status lists the conflict, and a rename resolves it.
- **Open:** which families are tracked versus stored, as layout data with a standard and a ghost profile (C8).
- **Open:** whether notes sync's serialization rules — the text-only allowlist, the 256 KB size cap, and the secret
  exclusions in `lib/git/user-sync.ts` — carry over to the stored user surface.

### C3. Ref layout and where the store lives

- **Decided** (spike): one ref per surface; per-work-unit refs do not contend; ref count barely changes fetch cost.
- **Requirement** (analysis § 6.10): every stored path is unique across refs — slug-named for work-unit artifacts,
  per person for personal files — since identical paths defeat Git's delta search and cost two to three times the
  pack size.
- **Requirement:** ARC fetches into a remote-tracking namespace, installed on first run, never straight into
  `refs/arc/*`, where a forced fetch would overwrite unpushed local writes.
- **Requirement:** ARC runs `git maintenance run --auto` at a firing point, because plumbing writes never start gc.
  A completed work unit's ref leaves the fetched namespace at archive.
- **Leaning:** bound history by rotation — a fresh ref holding the current state, the old chain left in place out of
  the default fetch — never by rewrite, which tamper evidence and a fast-forward-only hook forbid; under such a hook
  the fresh ref takes a new name. Reads take only the tip, so depth never enters the read path (flat to 20,197
  commits). A rotated year fetched 8–19 MB at ten people; an unrotated year is 90–290 MB with good deltas. **Open:**
  cadence, and a wider delta window where ARC repacks its own store.
- **Decided** (Owner, 2026-09-29): the surfaces, one ref each, all under `refs/arc/*`, the only prefix the host tests
  covered. Refs are keyed by UID (C2), as git-bug keys `refs/bugs/<id>`: a rename is a field write rather than a ref
  move, so no machine is left unable to tell a deleted ref from one not yet pushed; a slug can be reused once its
  record completes; and a nested cohort never meets Git's refusal of a ref beneath another ref's name.
    - `refs/arc/wu/<uid>` — one work unit from stub to archive: its artifacts, rank and placement fields, and its
      delivery and review records, which verbs write from the work unit's own checkout; if the seam's review work finds
      a writer elsewhere, those records take their own ref. Creating the ref with an empty old value cannot contend
      under a random UID; C2's guards hold the slug.
    - `refs/arc/cohort/<uid>` — one cohort's document; the flat `cohort-<name>.md` filename already assumes cohort
      names are unique.
    - `refs/arc/project/inbox` — the project inbox.
    - `refs/arc/project/registry` — the project ID, record-number counters, and lineage, keyed by origin UID.
    - `refs/arc/archive/<quarter>` — completed work units and closed cohorts, current state only, grouped by quarter
      as `completed/` already is. An entry's sequence is its order in that ref, assigned under its compare-and-swap,
      which replaces the archive index. At archive a work unit's current files join it and its own ref moves to
      `refs/arc/history/`, pushed but outside the default fetch; reopen moves it back. So `completed/` stays browsable
      on a fresh machine while a completed work unit's ref still leaves the fetched namespace, and a quarter's ref
      stops growing when the quarter ends.
    - `refs/arc/user/<id>/personal` — the inbox, working memory, and personal documents, under a per-person stored path;
      `refs/arc/user/<id>/wu/<uid>` — the per-work-unit personal workspace, keyed by its work unit's UID and moving to
      history with it; `refs/arc/user/<id>/errands` stays. `sync-state` retires with notes, and `errands-remote`, which
      no code references (last written 2026-07-28), is residue.
    - No shared surface shards at the design envelope: the spikes sustained 55–70 writes a second against a busiest
      real rate of about eleven an hour (analysis § 6.9), backlog order is a rank on each stub (C4), and cohorts, the
      project inbox, and the registry are one ref each.
    - The fetch refspec lists these namespaces and the person's own identity rather than `refs/arc/*` wholesale, so no
      one fetches teammates' personal refs or history by default. In the shared layout (below), its remote-tracking
      namespace stays out of `refs/remotes/`, where it would show as remote branches.
- **Decided** (Owner, 2026-09-29): the local copy follows the remote. When the state remote is the code remote — the
  default backend (C7) — the store is the code repository's own refs. When state goes to another remote or to none —
  the backing repository and local-only, where ghost mode lives — it is a separate Git directory inside `.git`
  (`.git/arc/`). ADR-035 item 2 left this to the contract and covers both shapes without amendment.
    - Precedent draws the same line. State synced to the code's own remote lives in the code repository — git-bug's
      `refs/bugs/*`, git-annex's `git-annex` branch, Gerrit's change metadata — while data with its own destination
      keeps its own store inside `.git`, as submodules do under `.git/modules/` and Git LFS under `.git/lfs/`.
    - Separation costs nothing extra where it applies: across two remotes no push is atomic, two fetches are needed
      anyway, and the code remote's fetch cannot bring state kept elsewhere. It buys privacy by construction exactly
      where privacy is the promise — a mirror push, an all-refs tool, or a history rewrite in the code repository has
      no state to carry — and it holds in repositories whose hook directory belongs to a team's hook manager (husky,
      lefthook), where a pre-push guard could not be installed without touching tracked files (C8). A repository that
      goes public moves its state to a backing repository, and its state refs leave the code repository with it.
    - The default mode keeps one atomic task-close push (C5), one fetch, and state that plain Git can inspect, and
      accepts what that costs. `git log --all`, gitk, and tig show one line per live state ref plus history that
      rotation bounds: `--all` walks 23,830 commits here against 10,504 from branches, remotes, and tags, and about
      11,500 of the difference is notes history, which retires at cutover, leaving 1,838. Whole-repository rewrite
      tools such as `git filter-repo` reach state unless told to skip it. A code clone's mirror push deletes the
      remote's state refs, recoverable from any machine's copy.
    - No new setting: the layout derives from the backend selection (`strategy-storage-evolution.md` Principles 8 and
      9). Moving between layouts rides the migrate verb (C7), since changing the state remote already moves refs;
      between two local directories it is a local fetch and delete.
    - The marginal cost over one layout: bootstrapping `.git/arc/`; an explicit `--git-dir` on every store
      invocation, since the executor pins repositories by `cwd` and `safe.bareRepository=explicit` refuses implicit
      discovery of a bare directory; a second refspec target; and the conformance suite run over both layouts. The
      separate layout sees less field use, so the suite is what exercises it, including the ordered path's "code
      pushed, state push failed" case.
- **Requirement:** reserve the families `refs/arc/*` already holds. The Errand identity ref
  (`refs/arc/user/<id>/errands`, pushed straight to origin with no remote-tracking namespace) becomes an
  identity-scoped store surface; notes sync's `refs/arc/user/<id>/sync-state` retires with notes; delivery candidates,
  review pins, and `refs/arc/tmp/*` are not state and stay out of the state refspec. ADR-027's "joins the user-notes
  ref" is amended to match.
- **Gate passed (2026-09-29):** GitHub Enterprise Server held, so ADR-035 stands on that host and the layout does
  not wait on it. A 3.22.1 trial instance repeated the host spike and matched GitHub.com on every check:
    - push, fetch, delete, and lease of `refs/arc/*`; a default clone fetches none, and ARC's refspec fetches them;
    - `--atomic` with a stale state ref held the code branch back; a losing push reads `cannot lock ref` or
      `fetch first`; no write was lost under twenty concurrent clones;
    - rulesets refuse a `refs/arc/**` pattern, and rulesets on branches do not reach the refs;
    - the `arc-state/**` branch ruleset accepted fast-forwards and refused rewrites and deletes with `GH013`, for an
      ordinary member as for the admin; a new branch under the prefix could still be created;
    - an ordinary member with write access can create, rewrite, and delete any state ref, another identity's
      included; with read access, fetch only;
    - forks copy no `refs/arc/*` and accept their own. The default policy refused a private repository's fork into a
      user account, so the test fork went to an organization.

### C4. Concurrency per surface

- **Decided** (Owner): concurrency is a requirement, not a risk. Concurrent sessions are the normal case — three to
  six per person here, times team size. Disjoint edits merge without manual action, conflicts refuse with a typed
  remedy, and nothing is lost silently. Several sessions of one identity share its surfaces, so no single-owner case
  sidesteps stale projections.
- **Decided** (ADR-035 item 7; analysis § 6.9): single-writer refs for work-unit state; entry merge for inboxes and
  working memory, keyed on each entry's bold title, with union limited to insertions; a fractional-index rank field on
  each stub for backlog order, sorted by `(rank, stub id)`, the compare-and-swap loser re-keying after the winner;
  three-way line merge for cohort documents and shared prose; compare-and-swap claims for record numbers, slugs, and
  work-unit claims, with hot counters reserving a block per process.
    - **Refined** (Owner, 2026-09-29; C6): a work unit's meta and task list stay single-writer, written only from its
      own checkout; its prose may also be written from the owner's other checkouts, through compare-and-swap and
      three-way line merge, so the work-unit ref gains a merge path and the conformance suite covers it. ADR-035 takes
      a dated amendment.
    - **Refined** (Owner, 2026-09-29; C2): identity is a UID, so a slug is no longer claimed by compare-and-swap on
      ref creation; C2's two guards hold slug uniqueness, and the same ADR-035 amendment covers item 7's "exact
      claims" wording. Record numbers stay compare-and-swap claims.
    - **Refined** (Owner, 2026-09-29): inbox and working-memory entries are keyed on a parsed `_Id:_` field, stamped
      at capture in the grammar `_Created:_` uses — eight hex characters, re-drawn on the rare clash within the file —
      and the bold title stays the human handle. Keyed on the title, a retitle read as a delete plus an insert, which
      a concurrent edit elsewhere turned into a conflict or a resurrected entry. An entry without one, such as one
      typed by hand, gets one at its first persist, and the import stamps existing entries.
- **Decided:** write, then gate. A same-entry clash lands as a typed conflict record keeping both sides as data; the
  next verb that depends on that entry refuses, status lists it, and a resolution names it. Recency never decides,
  conflict markers are never the record, deciding verbs re-read the store, and each checkout refuses a state head
  that does not descend from the last one it saw. This replaces user sync's recency resolution
  (`lib/user-sync/merge.ts`), which drops the older edit silently.
- **Decided** (Owner, 2026-09-29): the concurrency library lives in this work unit (§ What this work unit lands).
- **Open (siblings wait; settle before the library is built):** how a conflict shows in a single-file list — a
  marker beside the entry, or only in `arc status`.
- **Open:** whether a drain racing an edit to the same entry needs a record at all, since the edited entry stays in
  the file.
- **Open:** how another person's session reaches an in-flight work unit's Inbound Buffer — an entry-merge surface it
  may append to, or a capture routed through the owner. The owner's own sessions write it directly, since it is part
  of the draft (C6). The answer decides whether the hold-and-route ceremony (`_Hold` and `WU_Target` captures, the
  coordination-seam rule in `WORKING-MEMORY`) survives the cutover for anyone.
- **Open:** team-scale push contention, and confirming the design envelope — about ten people running about six
  sessions each — from the workload model.
- **Requirement:** the notes import never resolves differing entries with `ours` or `theirs`.
- **Requirement:** a batch mutation — a drain, a sweep — version-checks each entry and records each decision as it
  is made, never writing the whole batch at the end over a stale read (`strategy-storage-evolution.md` Principle 3).

### C5. Sync and push

- **Decided** (ADR-035 item 2; analysis § 6.9): pushes batch per machine at coarse firing points — handoff, lifecycle
  transitions, an explicit sync — never per write. A lifecycle step that already pushes a code branch carries its
  state refs in the same `--atomic` push. The push loop fetches into the remote-tracking namespace, merges entry by
  entry, and retries with jittered backoff sized to the host's push time on `fetch first`, `non-fast-forward`,
  `incorrect old value provided`, GitHub's `cannot lock ref`, and Azure DevOps's `TF401028`; any other refusal ends
  the loop and shows the server's message. State commits are authored as the user. A repository keeps one designated
  state host.
- **Requirement:** the state leg pushes alone when the code leg cannot — a detached verification checkout, or a
  branch that cannot be pushed.
- **Open:** closing a task alongside its code commit where `--atomic` is unavailable — ordered writes with a typed
  repair.
- **Open:** the increment-close shape — one fused verb that fires the task-record write and captures the increment
  commit into the record, or two explicit steps. Seamed to `commit-increments`.
- **Open:** the successor to `user.notes_push` — push on every sync or on request (ADR-035 item 8) — and retiring the
  key, which has about 14 consumers and a migrator in `commands/update.ts`.
- **Open:** cross-machine freshness. Another machine sees a write only after it fetches, and a no-change fetch costs
  0.7–0.9 s on GitHub, so fetches run at coarse points or in the background. In the shared layout (C3), a refspec on the
  code remote would bring state with every ordinary fetch, an IDE's included, at the cost of fetch output listing
  state-ref updates; ARC can instead fetch explicitly.

### C6. The projection's caller-visible behavior

- **Decided** (ADR-035 item 6): the store is authoritative; a gitignored projection at `.arc/active/`,
  `.arc/backlog/`, `.arc/completed/`, and `.arc/user/<identity>/` is the working copy, and edits persist at firing
  points, merged against the store version each projected file was written from.
- **Decided** (ADR-035 item 6): the ignore strategy — `.git/info/exclude` for the shared surfaces, `.gitignore` for
  `.arc/user/*/`, a tracked root `.ignore` re-including all four for the ripgrep family, and one user-level Zed
  setting per machine that `arc init` prints. ARC writes the exclude entries once per clone, when it first
  projects; this repository's `.gitignore` stops ignoring `.ignore`, which it does today for Marksman.
- **Decided** (spike): a base stamp `<!-- arc-base: <blob id> -->` on the first line or after YAML frontmatter, with a
  content heuristic when someone deletes it; a refresh never overwrites an unsynced edit; the re-check is a stat,
  not a re-read.
- **Decided** (Owner): direct file access is the requirement. Every artifact, the inbox included, is a markdown file
  any editor, search tool, or agent opens by name with nothing in between. Commands and views are a second front end
  over the same store; `arc view` and the status HUD stay at the basics (scrolling and pagination are `arc view`'s gap;
  it already hands rendering to glow or bat). Nothing human-facing hides under `.internal/`.
- **Decided** (Owner, 2026-09-29): project shared surfaces into every worktree rather than once per machine. An
  editor opened on a worktree cannot find files in the primary, and `backlog/` and `completed/` are per-worktree
  already. The cost is freshness: pull refresh at ARC commands left another session's capture up to half an hour
  from a worktree's copy, and an agent read stale shared state 5–8% of the time. The writer pushing the refresh into
  every worktree on its machine closes that locally (under 0.2 s for twenty); at the real inbox's size the re-check
  must be a stat (4 of 3,200 operations lost with a re-read, none of 6,400 with a stat). One copy per machine stays a
  fallback inside the projection, not a mode callers see. Reasoning in `research-storage-hard-problems.md` § 1.
    - **Retires:** the primary rooting of `USER-INBOX`, `WORKING-MEMORY`, and `STATUS.USER` (`lib/user-surfaces.ts`;
      `finalize-parallelism` BI-6), and the migration through which teardown, reconcile, the stale sweep, and
      branch-gone recovery merge up or refuse a linked worktree's copy (`lib/user-surface-migration.ts`). Both exist
      only because per-worktree stores diverged, which the ref store removes.
- **Decided** (Owner, 2026-09-29), kept if it holds up in use: the `active/` layout.
    - `active/current/` holds this checkout's work unit, its files flat as `active/` holds them today, plus a copy of
      each cohort document its `Cohort` field names.
    - `active/in-flight/<slug>/` holds other in-flight work units, read-only; the checkout's own never appears there.
      Which ones is a personal setting — `mine` (the default), `cohort`, or `all`, plus named pins — so paths stay
      stable and only membership varies. The primary checkout's `active/` becomes a view of work in flight, and
      reading another work unit's plan no longer means switching worktrees or running `arc view`.
    - Why `current/` over flat: it sorts above `in-flight/`, names the difference between the two, and matches the
      per-work-unit folders `backlog/` and `completed/` already use.
    - A work unit owns files by folder, not by name: any companion name works, and the filename-suffix rule
      (`artifactMatcher` in `lib/work-unit/mutators/relocate-artifacts.ts`, which start, archive, retirement, and
      decomposition match on) retires with the seam's lifecycle rewrite. `cohort-*` is the one reserved companion
      kind inside `current/`. Distinct basenames stay an efficiency preference for Git's delta search, not a rule.
    - A work unit sits in one lifecycle location — backlog, in flight, or completed — and cohort members never nest
      inside `active/`.
    - Per-worktree isolation becomes "`active/current/` holds only this checkout's work unit"; `storage-cutover`'s
      documentation pass rewrites `strategy-work-organization.md` § Per-Worktree Isolation and its acceptance test.
    - Revert: `active/` flat for the checkout's work unit, everything else unchanged. It stays one layout-resolver
      setting until the layout has seen use; the pre-public-release posture keeps the switch cheap, and after release
      these paths are a compatibility surface.
    - Ordering: the current-work-unit resolver reads `active/` without recursing (`resolveActiveWu`,
      `readActiveMetaCandidates`, `resolveCurrentWuSlug`, and the one-work-unit-per-worktree guard; about 30 call
      sites in 17 files), so it finds nothing under `current/`. The in-repo implementation keeps today's flat tracked
      layout, the new layout takes effect at the flip, and `storage-seam` moves that resolver onto the marker plus the
      store before then — an ordering constraint, not a blocker.
- **Decided** (Owner, 2026-09-29):
    - folders exist only when they have members — no `current/` in a checkout without a work unit, such as the
      primary or an Errand's, and no empty `in-flight/`;
    - a file created at `active/`'s top level has no owner, so persist refuses it with a remedy naming `current/`;
    - the cohort companion is a second projected path of one record in the same worktree, beside its home under
      `backlog/`. Both stay writable: the base stamp handles an edit to each as it does across worktrees, and the
      refresh after a persist updates the other path. It appears in `current/` only, not in each `in-flight/<slug>/`.
- **Decided** (Owner, 2026-09-29): who may edit under `in-flight/`, split by kind of file.
    - The owner edits their own work units' prose — the draft with its Inbound Buffer, the spec, notes, and other
      companions — from any checkout, through compare-and-swap and three-way line merge (C4). The view exists so that
      reading or adding to another work unit needs no worktree switch, and blocking would not protect the owning
      session anyway: its projected copy is a file on disk anyone can open by path, and a stale whole-file write
      carries its old base stamp, so persist merges rather than overwrites.
    - The meta and the task list stay with the owning checkout. They are machine-parsed records whose changes pass
      ceremony and task gates, and changing them changes what that checkout's session does next.
    - Another person's work units are read-only.
- **Requirement** (Owner, 2026-09-29): a protected file says so where it is read, not only when a save fails.
- **Decided** (Owner, 2026-09-29): three layers, each an existing idiom.
    - A notice line beside the base stamp in the generated-file idiom (`Code generated … DO NOT EDIT.`), naming where
      to edit: the owning checkout's path on this machine, or that the work unit is in flight on another. It is
      invisible in rendered markdown and visible in the raw file, where editors and agents write; persist strips it
      with the stamp. Writable files carry no notice.
    - The read-only file mode (the read-only attribute on Windows): JetBrains IDEs show a lock and offer to clear it,
      Vim warns on the first change, and an agent's write fails; refresh lifts the mode to rewrite. VS Code honors it
      only with `files.readonlyFromPermissions`, which belongs to the editor-settings item below.
    - The typed refusal at persist, as the backstop: it keeps the edit, never drops it, and names where to apply it.
- **Open:** where a cohort document lives while its members are in flight, and where parked work units appear.
- **For `storage-projection`:** push-refresh now also carries work-unit files into sibling worktrees' `in-flight/`
  views. A write still touches one or two paths per worktree on the machine, the bound measured above, but more
  writes fan out.
- **Decided** (Owner, 2026-09-29): the projection needs no user-facing name or verb of its own. "Projection" stays
  the design and code term; user-facing documentation calls the files under `.arc/` a working copy of the store.
  Getting other sessions' changes is automatic, and `arc sync` covers doing it on purpose or rebuilding deleted files;
  saving is the persist verb below. `materialize` is left to its current commands: as a word it suggests a read-only
  copy, and ARC already uses it in about five senses.
- **Decided** (Owner, 2026-09-29): the firing points, who fires them, and the persist verb. This shapes the
  documentation rewrite and `storage-seam`'s workflow edits.
    - **Who persists what.** The workflows' two dozen ceremony commits sort three ways. Lifecycle transitions an `arc`
      verb makes — start, activate, park, resume, reopen, promote, abandon, archive, publish, reconcile, Candidate
      applicability, publication boundary — persist inside the verb, so their commit steps fold into it at the seam.
      Authoring milestones, where a person or agent edited prose — capture draft (including the grooming lane's), create
      spec, generate tasks, amend design, inbox absorption, archive-phase content, handoff — call one persist verb.
      ROADMAP re-renders disappear, since ROADMAP is derived. The notes-backed surfaces join the list: `WORKING-MEMORY`
      and `SESSION-NOTES` at handoff, and inbox captures through their verb.
    - **The explicit steps stay,** naming an `arc` verb, never `git`. Each persist is a version-checked write — a
      commit on the branch in the in-repo implementation, on the state ref in the ref backend, and in the backing
      repository there — and a named point in history carrying the per-write message (C1), so the flip changes no
      workflow text. Before the flip the
      persist verb inherits today's commit machinery whole: `commitInterlock`, `workflowCommit` routing through the
      release wrapper and its harness allowlist, the footer grammar until the state-only kinds go, and the base
      write-context guard under full protection.
    - **Implicit write-back after the flip.** The projection, not the contract, writes back pending prose edits at the
      start of every `arc` command in the checkout, beside the refresh it already runs there; before the flip there is
      no projection, so no extra commits. It covers prose — drafts, specs, notes, companions, the user surfaces — never
      the meta or task list, which reach the store only through their verbs. A file that fails to parse is skipped and
      reported, never blocking the command. Persisting is local and cheap; pushing stays coarse and batched (C5).
    - **Approval.** After the flip a persist is a save, not a commit under the review-increment invariant: the gates
      stay on lifecycle transitions, stage advances, task closes, and code commits. Precedent: today's notes writes are
      Git commits too, and they run under the configurable sync interlock at handoff, not a per-commit review gate. The
      documentation pass rewords the invariant to say so, carefully and no further: the invariant's broader loosening
      into a tunable default belongs to `commit-increments` and `unit-scoped-review` (`approval-flow-refinement`).
      Before the flip the explicit steps are commits and stay behind today's gates.
    - **Name:** `arc save`. `arc user save` retires with notes at the flip, so the two coexist only while the seam
      is in flight.
    - The task list riding the code commit stays with C5's increment-close item.
- **Decided** (Owner, 2026-09-29): no configuration for automatic write-back. It moves a file the editor already saved
  into the store, as a sync tool moves a saved file, rather than being a save a person chooses, which is why editors
  make their autosave configurable and sync tools do not. Turning it off would only leave edits out of other worktrees'
  views longer, exposed to `git clean -x`, and open to conflict for longer, which the owner-edit split relies on keeping
  short. Nothing leaves the machine before a coarse push (C5), so it exposes no draft to anyone else. Its one real cost,
  many small store commits, is the history policy's to fold (C12). A key added later is additive; one removed after
  release is a break (Principle 9).
- **Decided** (Owner, 2026-09-29): editor settings are opt-in, never written by default. `arc init` prints the
  user-level settings that help, once per machine: Zed's `file_scan_inclusions` globs (decided above) and, as optional
  polish, VS Code's `files.readonlyFromPermissions`. For people who keep settings per project, an explicit per-editor
  command in the idiom of Yarn's editor SDKs (`yarn dlx @yarnpkg/sdks vscode`) merges only ARC's keys into that
  checkout's settings file, keeping its comments and other keys, and removes them on request; it is an action, not a
  configuration key. Carrying such gitignored files into spawned worktrees is a general spawn concern, answered by the
  `.worktreeinclude` convention (Claude Code, Conductor), and routed outside this work unit. Tracked settings add
  footprint that ghost mode cannot carry. Nothing depends on any of them: `.ignore` gives the ripgrep family visibility,
  the notice line, file mode, and persist refusal protect files, and the base stamp makes Zed's silent save over a
  refresh a merge rather than a loss (editor spike). JetBrains IDEs and Vim honor the file mode unconfigured.
- **Requirement:** a guard that every projected path stays ignored, above all `.arc/user/*/` in `.gitignore` —
  packaging tools that read only `.gitignore` shipped the inbox once it left `.gitignore`.
- **Requirement** (analysis § 6.10): Windows — renames retried over held files, a re-check that sees a same-size save
  (the exclusive-handle candidate is untested), bigint file identity, line endings normalized on read, Git calls
  batched; store and projection tests run in the Windows portability lane.
- **Requirement:** readers outside ARC — workflows, extensions, method overrides, scripts — read state by its
  projected path or through an `arc` command, never through Git.

### C7. Backends

- **Decided** (ADR-035 item 2): same-repository refs by default, a backing repository, local-only, a service
  deferred, and a migrate verb between them. Host floor: GitHub and GitLab, hosted and self-managed, must hold; Azure
  DevOps should, falling back to a backing repository; Gitea and Forgejo best effort; Bitbucket out.
- **Decided** (Owner, 2026-09-29): local-only is the ref backend with sync switched off, built by
  `storage-ref-backend`.
- **Requirement** (ghost mode): the state remote is a parameter, and ARC never pushes `refs/arc/*` to a remote the
  person has not designated. A fork or a private repository can be the state remote; a public fork exposes whatever
  is pushed to it.
- **Leaning** (Owner, 2026-09-25): contributors from forks need no upstream state — they run ARC on local-only and
  read public upstream state by fetching it. A team member who works from a fork points the state remote at the
  upstream.
- **Leaning** (Owner, 2026-09-25; must be seriously considered): protected state is an opt-in mode, not the default.
  No tested host's branch rules reach `refs/arc/*`, and GitHub rulesets refuse the pattern outright
  (`Invalid target patterns: 'refs/arc/**'`). The default stays `refs/arc/*` with tamper evidence. Options:
    - a branch namespace for shared state only — one or two branches such as `arc-state/shared`, per-person state
      staying in `refs/arc/*` behind tamper evidence. Proven on GitHub: a ruleset on `refs/heads/arc-state/**`
      accepted ARC's fast-forwards and refused rewrites and deletes with `GH013`, though a new branch under the
      prefix could still be created. One ref carries the envelope: about seven state writes a busy hour per person,
      so about 70 an hour for ten people, against pushes of about a second; this depends on the ref layout (C3). ARC
      can supply `[skip ci]` state commits (GitHub Actions, GitLab CI, and Azure Pipelines honor it), a negative fetch
      refspec (`^refs/heads/arc-state/*`) keeping the branches out of ordinary fetches and pickers (a fresh clone
      still gets them once, before ARC's setup runs), and ruleset installation through the host's API. Costs that
      stay visible: entries in the branch list and PR base picker, GitHub's recent-pushes banner for every state
      writer, push webhooks, and PR-required rules needing an exclusion;
    - host rules on custom refs — Azure DevOps's prefix policy blocks ARC's own updates too, and its ref permissions
      for members are untested; a self-managed fast-forward-only pre-receive hook held on GitLab CE;
    - signed state commits checked against an allowed-signers file on a protected branch, with clients that never
      follow a rewind and every clone as a backup;
    - the backing repository's own permissions.
- **Requirement:** CI and contributor clones degrade gracefully when state is absent or private. A default clone
  fetches no `refs/arc/*`, so a check that needs state fetches it or reports its absence, never fails on it.
- **Decided** (Owner, 2026-09-29): project identity is an ID minted at `arc init` and kept as a record in the store.
  Every clone fetches it, so it survives new machines, moved remotes, and re-clones, where today's remote-URL-first
  fallback does not. Forks copy no refs, so a fork gets its own identity unless it fetches upstream state. The
  backing repository is found through a pointer in configuration — tracked for a team, local-only in ghost mode — so
  the pointer adds no footprint. Delivery binds this ID into plan identity and stays buildable without minting one.

### C8. Ghost mode

- **Decided** (Owner, 2026-09-29): ghost mode — ARC in a repository the person does not own or cannot commit ARC files
  to, such as contributing to someone else's project, a policy-constrained work repository, or a trial — is a core
  requirement, not speculative capability. This design must keep it reachable as a configuration of the same
  machinery, not a redesign. `local-mode` bundled it with a private store; ADR-035 moved state off the tracked tree
  on every backend, which leaves the rest of ARC's footprint.
- **Decided** (Owner, 2026-09-29) — the split:
    - this draft names ghost mode as a requirement and completes a footprint inventory: every trace ARC leaves in a
      repository, each with its ghost-mode answer or an owner;
    - the contract makes the tracked-versus-stored assignment per family layout data, with standard and ghost
      profiles (C2), and the design is checked by walking ghost mode through it;
    - the siblings build the storage half at near-zero extra cost: local-only or a designated state remote (C7), each in
      a separate Git directory (C3), and an exclude-only ignore variant with an untracked `.ignore`, which ripgrep reads
      whether or not it is tracked;
    - a follow-on stub, minted now and tagged core, builds the rest — the install profile, the footer policy, and
      harness bootstrap without tracked files. Its only edge is the cutover, so it runs in the first post-cutover
      slot.
- **Footprint inventory (to complete):** ARC core and project machinery under `.arc/system/`; constitutional
  documents; harness files (`CLAUDE.md`, `AGENTS.md`, `.claude/`); the tracked root `.ignore`; the `.gitignore`
  entry; `Context:` footers and the `Arc-Maintenance:` trailer; editor settings; commit and branch conventions; Git
  hook installation; the state remote.
- **Carried from the `arc-backend` design:** traceability inversion makes a zero-footprint arm viable — rather than a
  code commit advertising its task, the task record captures the increment commit, and `arc` resolves the link in
  both directions for anyone with store access. The footer validator resolves artifacts through the injected
  resolver seam and degrades gracefully when state is absent. The default keeps footers, which most projects value;
  zero footprint is a supported arm.
- **Named cost:** with the user directory excluded rather than gitignored, packaging tools that read only
  `.gitignore` could pack it; a contributor rarely publishes, but the cost stays named.
- **Leaning:** an install profile chosen at init, not a runtime configuration axis (`strategy-storage-evolution.md`
  Principle 9).

### C9. Unsynced work outside ARC

- **Decided** (ADR-035 risks): ARC's teardown persists first and refuses while a projected file is unadopted or held
  by a conflict.
- **Decided** (Owner, 2026-09-29): lock each worktree ARC spawns (`git worktree lock`), which makes a plain
  `git worktree remove` refuse, and a single `-f` too, until the lock is lifted or `-f` is given twice (checked with
  Git 2.55). Designed here; `storage-projection` builds it. `git clean -x` has no hook, so firing-point frequency
  bounds what it can lose.

### C10. Integration-time record and the export knob

- **Decided** (ADR-035 item 4): `storage.track_design_docs: none | specs | all`, default `none`, exports authored
  design into the code repository as a one-way copy. The `specs` arm is the costliest — a work unit's artifacts then
  live in two places — so consider `none | all` unless the middle earns its cost.
- **Open:** whether an integration-time record rides the knob. The retired `meta-file-tracking-model` draft's option
  β composed a tracked archive document at integration — the meta's governance fields plus its Release Notes Entry
  and Completion Notes — as the durable audit anchor a reviewer sees in the pull request. ADR-035 item 4 leaves open
  whether it rides the knob or does not exist. The readiness gate's Completion and Release Notes checks wait on the
  answer.

### C11. Framework core from the package

- **Requirement** (`framework-core-from-package` runs after the cutover): the projection takes more than one source
  — the store now, the package later — and supports read-only copies; the ignore strategy works from a path list that
  `.arc/system/` paths can join; readers load core by its `.arc/` path, never by whether it is tracked; the tracked
  line sits at project-owned machinery, not all of `system/`.

### C12. History policy and planning branches

- **Decided** (ADR-035 item 8): Git notes retire through a one-time import.
- **Decided** (ADR-035 items 9 and 10): once notes retire, `history.policy: rewrite-with-lease | append-only`,
  default `rewrite-with-lease`, with `append-only` opt-in for teams that prefer fixup-then-squash review or branches
  several people push to — the idiom turns on who pushes to a branch, not team size. Planning branches stay as
  zero-commit local anchors for locus topology until in-flight derivation reads the store, and branchless planning is
  a separate change. Supersession detection (`lib/git/supersession.ts`) stays as the safety net once rewrites are
  allowed, alongside `chunked-delivery`'s rebase freedom for stateless review refs.

### C13. Posture and non-goals

- **Decided** (Owner, 2026-09-24): storage first — deeper stacked-delivery work pauses until the storage change
  lands.
- **Decided:** build no RFC-style review support now; keep the door open through the backend's target namespace, the
  `track_design_docs` export, and a backing repository with branches, as Oxide's RFDs do.
- **Decided:** no hosted SaaS, no heavy UI or TUI, external trackers as composition targets never owners of work-unit
  artifacts (`strategy-storage-evolution.md` Principle 4), the service backend deferred until demand exists.
- **Decided:** `strategy-storage-evolution.md` is a starting position, not a constraint; revise it where the design
  challenges it. Candidate principle for that revision: Git may be the storage engine, never the schema — the Git
  notes lesson, where SHA-keyed attachment became the semantic model.
- **Carried:** an Open Knowledge Format (OKF) projection stays an optional target off the record layer — the
  knowledge layer, never operational churn; owned with `idiomatic-alignment`.

### C14. Core or deferred

- **Requirement** (Owner, 2026-09-24): tag every program item. 1.0 ships the complete core for solo developers
  through mid-size teams; larger scale — hundreds of writers, per-record authorization — follows through the service
  backend and is never precluded.
- **Decided** (Owner, 2026-09-29): ghost mode is core.
- **Open:** every other item's tag.

### C15. Risks carried into the design

- A mirror push from a clone without ARC's refs (`git push --mirror`, or a Gitea or Forgejo push mirror) deletes them
  on the remote; any ARC clone can restore them. GitLab mirrors leave two ends with independent state.
- `git log --all` and graph views show state history beside code, and agents run such commands (C3).
- Backup and host-migration tools may not carry custom refs.
- Anyone with write access can rewrite or delete state, confirmed for an ordinary member on GitHub Enterprise Server
  (C3); the ancestry check makes a rewind visible, not impossible.
- Azure DevOps's commit-author policy accepts state commits only when they are authored as the user.
- Untested: Bitbucket; Azure DevOps ref-level permissions for ordinary members; a JetBrains IDE; one history-replay
  push refusal whose message was not captured (analysis § 11.7).

---

## The consumer map

For each subsystem — lifecycle and in-flight, delivery, review and evidence, locus and session-init, status and
roadmap, and user sync — name its readers and writers, the contract operations each uses, and what each
storage-shaped mechanism becomes. The known rewrites are in-flight derivation, the lifecycle executor's write path
and `arc start` placement, the archive index, ROADMAP rendering, the notes-related session-init probes, and locus
derivation.

The map is `storage-seam`'s design core. That work unit decomposes against it when this one's planning closes, and
its members inherit it rather than redesigning their subsystem. Name the session-init envelope as a consumer, and
keep the locus and session-init reads narrow: through the contract, without reshaping the prose conditionals the
session-init agenda (`composable-workflows`) will replace. Mark every file two seam partitions both touch
(`handlers/status.ts` among them), so parallel members do not collide and rework.

Inputs from `coupling-blast-radius-audit` (2026-07-18), each ranked abstract and high-volatility:

- **Address and artifact-family assumptions** — `arc-root`, `draft-prefix`, `meta-prefix`, `notes-prefix`,
  `spec-prefix`, `tasks-prefix`, and `typed-branch-prefixes`. The prefixes are the family list's first draft (C2).
  Packet `packet-edfd7344100348f1f6b6659c`, content digest
  `27b88f2bb84fff4f90e0618c018c76fb64f8ad9c4031e2f957b7cd38da609f7a`; `scan-result.json#class-*` anchors.
- **Placement readers** — `active-placement`, `completed-placement`, `planned-placement`, and
  `provisional-placement` reach 55 code reader and parser files; the extract's `reportInputs.placementReaders`
  enumerates them for the lifecycle and in-flight partition. Packet `packet-188c5fab90090e83fdbc4591`, content digest
  `528515469ff26c720e1d7a0643eaebbebf81d4c99b7c9b640b75479d0da38ae5`.

## The storage-coupling register

Draft-design completes the register in `cohort-state-storage.md`. The re-cut seeded its known rows; the sweep runs
across code, rules, strategies, workflows, drafts, `WORKING-MEMORY`, and `USER-INBOX`, looking for mechanisms shaped
by tracked or notes-backed state rather than for state by size.

- **Route** (Owner, 2026-09-29): candidates are verified against source here; settled amendments land on `main` in
  batches through the planning-grooming lane, so siblings and `cli-substrate-complete-migration` read current rows.
- **Row identity is preserved.** `cli-substrate-complete-migration`'s residual matrix cites rows by key (`R-NS`,
  `R-BR`, `R-LOCK`, and others): amend a row's fate text or add rows, never rename or remove one it cites.
- **Grain.** The register names mechanisms; instances go to the consumer map.
- **Status:** the sweep covered code, rules, strategies, workflows, backlog drafts, ADRs, `WORKING-MEMORY`, and
  `USER-INBOX`; its verified results landed on `main` in PR #738 (2026-09-29), taking the register from 42 rows to
  79. The consumer map may add rows.
- **Pending amendments** for the next batch to `main` (C6): the primary-rooted user files row's fate becomes
  "retire the rooting and the migration"; the per-worktree isolation row's invariant becomes "`active/current/`
  holds only this checkout's work unit"; and the `active-layout-nesting` row retires that stub (Owner), since
  `current/` and `in-flight/<slug>/` give `active/` the per-work-unit folders it asked for, at the flip rather than
  as a tracked layout change. ADR-035 takes a dated amendment for the work-unit write rule (C4). From C2: the
  per-work-unit workspace row's fate names review evidence as stored at project scope; the notes-sync row's
  never-sync boundary is replaced by the projection's local-only path set; and a new `storage-ref-backend` row covers
  personal subdirectories (`archive/`, `drafts/`), which notes sync reads as work-unit workspaces and never saves, so
  the import classifies them as personal documents. From C3: the archival row's fate adds that the archive index
  (`completed-index.ts`) gives way to each entry's order in its quarter's archive ref.
- **Route at planning close,** as `USER-INBOX` captures under the coordination-seam rule, one per unit whose plan
  assumes tracked or notes-backed state but needs no register row — a note for its next planning:
    - `composable-workflows` — fixtures assume the notes channel (`arc user pull`, notes-only offers) and a grooming
      relocate for `--plan`;
    - `review-durability-hardening` — Completion and Release Notes reads bind to the head, not the store version;
    - `decompose-scaling` — its measured costs are branch-tree meta reads; re-measure after the seam;
    - `customization-arch-realign` — the `session-state` method, the `plan/` prefix, `archive.cadence`,
      `user.notes_push`;
    - `frictionless-capture` (`user.notes_push`), `errand-promotion-concurrency` (meta creation and commit),
      `cold-start-init-polish` (a planning-only commit footer, a hand-rendered ROADMAP);
    - `cross-wu-coordination` (commitment keyed by directory, a `git mv`), `naming-conventions` (`STATUS.PROJECT` as
      a stored `backlog/` file, `arc user save`/`load`);
    - `knowledge-architecture` and `operational-advisory-registers` (append-only as an invariant),
      `adopter-content-aware-ci` (planning-markdown PR volume as premise), `arc-coordination-service` (`arc-backend`
      vocabulary), `docs-content-sweep` and `wu5-public-release` (no edge on the cutover, `refs/arc` history
      ignored), `operational-state-docs` (its buffer still wires a `git mv` and audits notes);
    - `scalable-core` — the coupling audit's team-mode key finding (37 files; `packet-dbd2103ffa3c4df953f89138`,
      content digest `19fc5ffc96617197821f46c35951b913f47505460d875747925d9896bbc2d042`, `team-mode-key`): team mode
      is not a storage axis (Principle 7), so the rename's access and compatibility seam is that unit's.
- **Settled inputs:** `R-LOCK` (C1). The identity-wide `arc user add` bootstrap of `USER-INBOX` and `WORKING-MEMORY`
  takes a `storage-seam` row: the command writes the identity's first records through the contract, keeping its
  input and adapter surface.

## Coordination with `cli-substrate-complete-migration`

That work unit is executing in its own worktree and must land before `storage-seam` starts; this one does not wait on
it. It is read-only from here. They meet in five places, each an input to this design:

1. **The storage carve.** Its residual matrix (`notes-cli-substrate-complete-migration.md`, Task 1.1.c) names each
   mixed module's surviving and carved symbols and classifies every `handlers/user.ts` command, each carved item
   citing a register row — the freshest code-level sweep of storage coupling and the register sweep's starting
   point.
2. **The session-init envelope.** Its Phase 3 registers strict version-1 schemas for the surviving slots; the seam
   rebuilds the rest (`WorkUnitStateResult`, `ErrandStateResult`, `UserSessionInitStatusResult`,
   `userReferenceReconcile`, `currentWuReconcile`, `StaleWorktreeSweepResult`, `DerivedLocusFrame`) with full
   schemas. The consumer map names the envelope against the post-Phase-3 shape.
3. **Layout.** Its Phase 5 moves framework-path construction onto the layout resolver; work-unit state paths and
   the Candidate, submission-boundary, and transition records are carved to the seam and resolve through
   `resolveArcPath`.
4. **The Git executor.** `RawGitExec` and `RawGitResult` in `lib/git/exec.ts`, bound executors threaded through every
   spawn, and the failure-text predicates and `resolveGitCommonDir` moving into `lib/git/` are groundwork the ref
   backend's Git access builds on.
5. **Kernel vocabulary.** Its Phase 6 replaces local slug schemas and state and placement-tier enums with the
   kernel's and adds `CanonicalDigestSchema`; the record model builds on that vocabulary.

If this work unit reaches its in-repo implementation before that one lands, merge base first and re-check those
modules for overlap.

---

## Reading inputs

- ADR-035 and its analysis (`analysis-storage-substrate-direction.md`), including the spike results in § 11.
- `strategy-storage-evolution.md` — rewritten to match ADR-035; a starting position (C13).
- `research-local-mode.md` and `research-storage-landscape-2026-07.md` in `.arc/reference/supplemental/research/`.
  Both predate ADR-035, which governs wherever they disagree.
- The Owner's personal spike and research records, gitignored in the primary checkout's `.arc/user/andrew/`:
  `spike-concurrency.md`, `spike-editor-ergonomics.md`, and `research-storage-hard-problems.md`. Scripts live
  outside the repository under `~/dev/scratch/arc-storage-spike/`.
- The pre-ADR-035 `arc-backend` design, in this file's history at `55ff5015c`; everything that survives it is in the
  ledger.

---
