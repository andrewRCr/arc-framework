# Draft: Storage Contract

- **Origin:** [internal] — renamed from `arc-backend` at the `state-storage` re-cut (2026-09-28). It absorbs
  `local-mode`, whose draft is `research-local-mode.md`, and inherits the integration-time record question from the
  retired `meta-file-tracking-model`.
- **Purpose:** Define the one storage contract through which every ARC reader and writer of operational and planning
  state goes (ADR-035), and ship it over today's substrates. The subsystems then move onto the contract before
  the ref backend exists, and the later backend flip changes no caller's code; the behaviors that need state off the
  checkout's branch take effect with it (§ What this work unit lands).
- **Planning posture:** `Novel`, `P1`. This is the `state-storage` cohort's design core: `storage-seam` inherits
  its consumer map, and `storage-ref-backend` and `storage-projection` implement its interface. Those two may
  design alongside this work unit once the decisions they share are drafted here, and may implement once this
  work unit's spec is approved.

---

## Continuity

- **Readiness:** formalization-ready. The scope, what this work unit lands, and the working rules are settled, and so
  are the three decisions the siblings share — the ref layout (C3), each surface's concurrency mechanism (C4), and the
  projection's caller-visible behavior (C6) — so `storage-ref-backend` and `storage-projection` may design alongside it
  (2026-09-29). The consumer map is built, the register is complete on `main`, and draft close landed the follow-on
  stubs and the routes (§ The storage-coupling register). The ledger was consolidated on 2026-09-30, and the readiness
  assessment that day returned not ready, with five gaps, all closed the same day; it then returned ready. The
  adversarial pass's first two rounds the same day returned nine findings and ten, the third, the last under its cap,
  twelve, and two over the cap eight and twelve. The fifth showed the in-repo save path was not converging, and the
  Owner reframed it: the in-repo implementation mirrors today, commits included, and the process changes once, at the
  flip. The sixth, over the cap on the reframed passages, returned six findings, three major and none in the save path's
  class, and the Owner stopped the pass there (`review-storage-contract.md`).
- **Resolved** (2026-09-29 unless dated otherwise):
    - scope — stage entry, what lands here and what is handed off, and the parallelism rule;
    - C1 — the operations and their requirements, per-ref write serialization (settling `R-LOCK`), reverse lookup,
      assurance-chain carry-forward, the store-wide state version, multi-record writes, the failure taxonomy, the
      listing outcomes every family keeps, the per-write message as provenance, and traceability as a store link;
    - C2 — file-as-record (2026-09-25), placement and locus, format skew, the record-aware seam with
      `operational-state-docs` re-scoped, the two-level family model and the family list, durable review facts,
      adversarial-pass evidence as its own kind, stored user files, machine-local state as a projection property,
      identity as a name plus a UID, the profiles, and the serialization rules;
    - C3 — one ref per surface keyed by UID, the fetch refspec, the local copy following the remote, rotation deferred
      behind a growth tripwire and a reserved continuation link, no wider delta window, the reserved families, and the
      GitHub Enterprise Server host test;
    - C4 — each surface's mechanism, write-then-gate, entry IDs, a removal racing an edit leaving the edit, routing
      receipts, conflicts shown in the projected file, the inbound list, and the design envelope with its tripwire;
    - C5 — batched pushes, the ordered push without `--atomic`, one close verb whose capture survives rewrites,
      `user.notes_push` retired, and explicit fetching;
    - C6 — the projection into every worktree, the `active/` layout, ownership by folder, edit rights under
      `in-flight/`, protected-file notices, the cohort document's home and parked placement, lifecycle anchoring, the
      projection's name, the firing points with `arc save`, no write-back setting, and opt-in editor settings;
    - C7 — local-only, the state remote designated per clone, fork contributors, protected state deferred, and project
      identity;
    - C8 — ghost mode as a core requirement and its split, no ARC footprint in code commits by default, the surface
      boundary, and the install profile;
    - C9–C14 — worktree locks; the review-only export at `.arc/specs/<slug>/` with its merge guard, its default, and the
      reader standard, and no tracked integration record; branchless planning; the posture, with the strategy's
      revision written at create-spec (2026-09-30); and every item's core-or-deferred tag and home;
    - § The consumer map — its shape, 314 consumers inventoried, no foundation member, and the ordering the seam
      inherits;
    - draft close (2026-09-30) — the follow-on stubs and the last register amendments (PR #746), and the routing
      captures;
    - the readiness assessment's five gaps (2026-09-30) — the in-repo implementation: what it serves, when a write is
      versioned, what reads and the version cover, and batches across substrates, with C1's `checkout-not-writable`
      (§ What this work unit lands); the lifecycle index's key before the meta's `Id` field (C2); the reference backend
      (§ What this work unit lands); where a record's format version lives (C2); and the success signal;
    - the adversarial pass's first round (2026-09-30) — freshness binding records, never the store (C1); other
      branches' records, sync, and the flip timing for behaviors that need state off the checkout's branch (§ What
      this work unit lands); `unsupported` (C1); and conflict records, receipts, and format versions stored with the
      families (C2);
    - the adversarial pass's second round (2026-09-30) — no verb gains a commit (§ What this work unit lands); which
      copy reads and writes use when a record is on two branches; `checkout-not-writable` as today's write-context
      guard; one flip for every family; the suite's stale-base scope; the in-repo sync outcomes; and the inventory's
      freshness rows (`notes-storage-contract.md`);
    - the adversarial pass's third and fourth rounds (2026-09-30, the fourth over the cap) — `checkout-not-writable`
      firing where today's refusals fire; the stale base defined; ROADMAP stored until the flip; and the close verb's
      captures starting at the flip (§ What this work unit lands, C1, C5);
    - the fifth round's reframe (Owner, 2026-09-30) — the in-repo implementation mirrors today, commits included, and
      makes no commit on the checkout's branch, which retires the in-repo `arc save`, C1's `flush` and `commit-refused`,
      and the meta field verb; the process changes once, at the flip, whose workflow rewrite is checked against
      `strategy-procedure-evolution.md`; the final shape over today's (C13); write-back covering the owner's meta and
      task list behind their parsers (C6); the close verb never committing (C5); and the inbox digest leaving `_Id:_`
      out (§ What this work unit lands);
    - the sixth round (2026-09-30, over the cap) — the drain's version-checked removal from the flip (C4); the close
      verb owning task completion, the import deriving earlier captures from footers, and the missed-capture window
      (C5); and the inventory's kept commit steps and remaining ROADMAP rows (`notes-storage-contract.md`).
- **Open**, left to their owners, each named where it arises: `storage-seam` — each family's field schema (C2), the
  review member's split of review working state (C2), where an executing work unit integrates inbound entries and the
  inbox listing verb's name (C4), and the close verb's name and placement (C5); `storage-ref-backend` — the growth
  tripwire's bound (C3) and whether the import is the migrate verb or a one-off (C14); `config-storage-architecture` —
  where the state remote's designation lives (C7); `ghost-mode` — the footprint inventory, the task trailer's form, and
  harness bootstrap (C8), and the user-facing name (`draft-ghost-mode.md`).
- **Next:** create-spec, which also writes the `strategy-storage-evolution.md` revision (C13).
- **Consolidated** (2026-09-30): each ledger item states the decision that stands, with its sources and dates;
  superseded leanings and refinement layers folded into it, and the draft-close passages became a landing record. Two
  stale statements went: C10's "unstubbed follow-on" for the backing repository, which C14 makes core, and C8's
  inventory "to complete", which `ghost-mode` holds. Two were corrected against their sources: C10's export options,
  which the strategy's knob line offered rather than ADR-035, and C3's unrotated-year figure.

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
- **The conformance suite** — one suite every backend passes: in-repo, refs, and local-only. It forces version
  conflicts, which the in-repo backend produces only when writers race, and stale bases, which only a backend that
  merges concurrent writes produces — the reference and ref backends, never the in-repo one — so seam callers handle
  both before cutover. Its in-repo fixture commits its tracked records as a ceremony would before it asserts reads as of
  a version (C1). It is also the non-git substitutability acceptance test: could the contract be implemented on a
  non-Git backend without touching anything above it? Git is the storage engine, never the schema.
    - **Decided** (Owner, 2026-09-30): the suite runs against an in-memory reference backend that lands with it —
      test-only, never shipped. It produces version conflicts and stale bases on demand, and, being no Git at all, it is
      the substitutability test run rather than argued; it also defines the state version's semantics apart from Git. A
      persistent non-Git backend (SQLite, Postgres) is the deferred service backend's territory, and SQLite's role here
      is the deferred query cache (C2).
- **The in-repo implementation** over today's substrates — tracked records on the checkout's branch, the gitignored
  personal files, and the Errand refs — which the seam routes onto first. It exists so no seam member waits on
  `storage-ref-backend`, and it retires at the cutover (C2). **Decided** (Owner, 2026-09-30):
    - **Every family, each where it lives today.** The seam routes user sync's writers (the inbox writer, `arc user
      add`, `open`, and `close`) and the Errand readers in its locus, review, and status members through the contract,
      so serving tracked records alone would leave those members waiting on a sibling. The Errand family wraps today's
      snapshot and transaction code unchanged; `storage-ref-backend` owns the re-keyed ref (C1).
    - **It mirrors today, commits included, and makes no commit on the checkout's branch** (Owner, 2026-09-30). A write
      through the contract is today's write: the file where it lives, staged as today for a tracked record; a locked
      write for a personal file; and, for an Errand record, a tree commit on its own ref, as `lib/git/ref-tree.ts` makes
      today, versioned as it lands. Every branch commit ARC makes stays as it is until the flip — each ceremony's commit
      step with its class tag and routing, the commits `arc start` and `arc rename` make themselves, the verification
      commit carrying `arc attest`'s records, the task list riding its code commit, and ROADMAP rendered and staged by
      the verbs that stage it today. No verb gains a commit: until the flip, a ceremony's save step is its own commit,
      behind today's gates.
        - A batch within tracked records is staged all or nothing through the index lock that start graduation and a
          dependency-edge discharge take through `captureGitIndexState` (`lib/git/exec.ts`) and park landing takes by
          hand, each record checked against its current bytes as the Candidate store checks today
          (`candidate-record-store.ts`).
        - The write-then-`git add` protocol and the next actions that require a commit stay as today and retire at the
          flip; the register row for record writes gives their end state, and its timing is a pending amendment.
    - **The process changes once, at the flip** (Owner, 2026-09-30). The store's process arrives whole: lifecycle
      verbs persist inside themselves, the work unit's edited files persist through `arc save` and the projection's
      write-back (C6), the task loop closes through the close verb (C5), and ROADMAP stops being stored. The workflows
      move with it. `storage-cutover`'s flip rewrites each affected step from the consumer map's end states: a commit
      step that carried only state becomes `arc save` or goes, the ROADMAP hand-render steps and their refresh commits
      go, and a ceremony that also changes tracked files — an ADR companion, research files moved under `reference/`,
      the review copy (C10) — keeps a commit step for them. Each rewrite is checked against
      `strategy-procedure-evolution.md` (C13). The seam's code runs unchanged across the flip and nothing breaks
      before or after it; the workflow text changes once. This amends the register's workflow-steps row, which had
      the flip change no workflow text: a pending amendment.
    - **Reads of this checkout's records return the working tree where it holds the selected copy; the version names
      saved state.** An edit made by hand — a draft, a ticked checkbox — and a verb's staged write are in no version
      until the commit carrying it lands: the ceremony's, or the code commit a task list rides, as today. A record's own
      version, its content digest, is exact from the write, so compare-and-swap and bound checks never wait on a
      commit; a caller that anchors on the store version commits first, as handoff already does. Reading the working
      tree is today's behavior and matches the store after the flip, where the projection writes pending edits back at
      the start of each `arc` command (C6). The conformance suite asserts over writes made through the contract;
      uncommitted edits are working-copy behavior outside it.
    - **Records on other branches** are listed and read through today's composed lifecycle index and in-flight oracle
      (`composed-lifecycle-index.ts`, `in-flight-derivation.ts`, `remote-ref-reader.ts`) — local branches, and pushed
      branches through remote refs, degrading to the last-known refs offline as today. They are read-only and read
      live. Where a record is both in the working tree and on another branch, reads and lists return the copy today's
      composition selects. A write checks the tree copy, so where the tree copy disagrees with the selected one — the
      index then withholds the writable path — it refuses `checkout-not-writable`, as abandon and rename refuse
      without current-checkout write authority today, naming where the selected copy lives; a record with no tree
      copy is read-only.
    - **One opaque version over what it covers:** the checkout's branch tip, which advances at each commit on the
      branch, and each Errand ref's tip. Personal files keep per-record versions, their content digests, and sit
      outside it, as do other branches' records; nothing binds them to the store-wide version, under C1's freshness
      rule, and reading them as of a version, or the changes between two, refuses `unsupported`.
    - **A batch spanning substrates is refused whole before anything is written** (C1's `unsupported`); within one
      substrate it is all or nothing — staged together for tracked records, one tree commit for an Errand ref, one
      locked write for a personal file. Verbs that cross substrates today — archive's workspace close, Errand close's
      inbox drop, promotion, the drain — keep their order and idempotent reruns until the flip.
    - **Behaviors that need state off the checkout's branch take effect at the flip.** The seam builds them against the
      contract, keyed on one capability it reports — whether state lives off the checkout's branch — which the in-repo
      implementation answers no. Until the flip each keeps today's behavior: branchless planning (C12) keeps `plan/`
      branches, direct routing into the inbound list (C4) keeps hold-and-route, grooming a stub from any checkout (C6)
      keeps grooming branches, and ROADMAP (C2) stays a stored file that verbs render and stage. The `active/` layout
      (C6) and the review-pass record's tracked companion (C2) already take the same timing.
        - The branch on that capability lives in CLI verbs, never in workflow prose (`strategy-storage-evolution.md`
          Principle 6), in every verb whose behavior the flip changes — the inventory's rows whose end state takes
          effect at the flip. Among them: the routing verb, `arc start` and `arc start --here`, `arc plan check`,
          session-init's grooming relocate, activation, catching up with base, branch reaping at abandon, retire,
          teardown, and the orphan sweep, and every code path that writes, renders, or checks the stored ROADMAP (the
          inventory's rows under register row 18). `storage-cutover`'s deletion pass removes the arms for today's
          behavior.
        - It is a named interim exception to C1's first decision, that nothing above the contract knows which backend
          is active: only the in-repo implementation answers no, so a verb that branches on the capability can tell it
          from the others. The exception retires at the cutover with those arms.
        - The flip is one, for every family at once: ADR-035's single cutover per repository. Nothing moves onto the
          ref backend family by family before it.
    - **Per family.**
        - Tracked records are read and listed through `resolveArcPath` and the lifecycle index, with the
          `.arc/system/.internal/` records joining the layout, and ride the branch's push.
        - Personal files are read and written where they live, under the machine lock the notes lock holds today (C1)
          with a whole-file digest check; `arc user add`, `arc init`, `arc join`, the open seed, and `close` go through
          it. Until the flip the inbox writer stays keyed on an entry's title and source digest and stamps no `_Id:_`
          (C4), so every unrelated byte stays stable, as today. An Errand records its origin entry's source digest, so
          the digest leaves the `_Id:_` line out, as it already leaves out the execute-bound mark and the retain
          envelope (`unboundDigest`, `lib/user-sync/inbox-writer.ts`): a seam change before the flip, so the import's
          stamping keeps every open Errand's binding. `arc user inbox-remove` keys on the title as today, recomputing
          the digest under its lock, so it checks no version its caller read; from the flip, once the import has stamped
          every entry, it keys on the ID and removes only the entry version its caller names (C4).
        - Errand refs keep today's snapshot, with its absent, unreadable, and complete outcomes, and today's
          transaction.
        - Contract `sync` covers personal files, through today's notes sync, and Errand refs, through their push. It
          reports C1's outcomes plus today's `conflict` and `blocked`, and the notes export's local `refused` reasons
          as they are — `unpublished-history`, `history-diverged`, `compaction-lineage`, and `proof-unavailable`
          (`branch-bounded-notes-export.ts`) — all retiring at the flip; today's `failed` maps by cause onto
          `unreachable` or `refused`, and `no-remote` is a state. `arc sync` keeps pairing the branch push with the
          notes push under the push interlock (`handlers/sync.ts`) until the flip, its notes leg going through contract
          `sync`; the branch push is never part of contract `sync`.
        - Reverse lookup keeps today's derivations until the flip, when the close verb captures links and the import
          derives the earlier ones (C5).
    - **Named costs:**
        - the next actions that require a commit stay in the machine contracts until the flip;
        - today's write-context preflights stay (C1's `checkout-not-writable`);
        - the flip carries the workflow rewrite, and `arc save`, write-back, and the close verb's captures first run
          for real at the flip, so the cutover rehearsal exercises them;
        - the seam can build branchless planning without waiting, but can verify it only once `storage-ref-backend`
          or the cutover rehearsal exists, since the reference backend has no worktrees;
        - a branch rewrite strands a recorded version as it strands a commit today;
        - there is no project identity (C7);
        - and the archive number is still allocated without a lock until the archive ref's order replaces it (C3).
- **The shared seam pieces** — the current-work-unit resolver and the lifecycle index keyed by identity, and the store
  behind delivery's lifecycle port — which every `storage-seam` member calls (§ The consumer map).

Designed here, built elsewhere:

- **Local-only backend** → `storage-ref-backend`: the ref backend with sync switched off (C1, C7).
- **Worktree lock** → `storage-projection`, beside its teardown refusal for unadopted files (C9).
- **`arc save`** → `storage-projection`, beside the write-back it runs on demand (C6); first called at the flip.
- **Captures for commits before the flip** → `storage-ref-backend`'s import, derived from the commits' `Context:`
  footers (C5).
- **Migrate verb** → a contract requirement (C1) and core (C14), built where first needed, likely
  `storage-ref-backend`. Whether the import is that verb, run from the in-repo backend to the ref backend with
  `storage-cutover` gathering each branch's copy, or a one-off tool, is `storage-ref-backend`'s call (C14; the cohort's
  import scope).
- **Ghost mode's non-storage half** → `ghost-mode`, a core follow-on (C8).

Planning outputs: the consumer map, the core-or-deferred tags (C14), the completed register, and the revision of
`strategy-storage-evolution.md`, written at create-spec (C13).

**Success signal** (Owner, 2026-09-30), the seed of the spec's success criteria: the in-repo implementation and the
reference backend pass one conformance suite — version conflicts on every backend, and stale bases on every backend
that merges concurrent writes; a seam consumer routed through the contract gets the same results over today's
substrates; and the shared seam pieces serve their existing call sites.

---

## Decision ledger

Status words: **Decided** (recorded; cite the source), **Requirement** (a constraint the design must meet), **Carried**
(a position from the pre-ADR-035 `arc-backend` design that still stands), and **Named cost** (what a decision knowingly
gives up). A decision with two dates was leaned toward on the first and settled on the second. `ADR-035` is
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
- **Requirement:** the store is CLI-internal plumbing. Agents and people work through the projection and `arc` verbs,
  and no agent runs Git against the store; which family a write lands in is computed by the CLI, never left to agent
  judgment. Until the flip the ceremonies' own commit steps stay as they are (§ What this work unit lands).
- **Decided** (Owner, 2026-09-29): reverse lookup is a contract query — from a repository plus a commit or ref to the
  owning work unit, and for delivery to its plan and member. Delivery's record port needs it, and so does ghost mode's
  traceability inversion (C8), where the task record captures the commit and `arc` resolves both directions.
  Delivery's other port requirements — artifact reads and writes, version-checked reconcile, named failures — are
  already contract operations.
- **Decided** (Owner, 2026-09-29): migration carries assurance chains forward. No live query can rebuild them, so the
  import (`storage-ref-backend`) carries every chain, and no adapter retires before its chains are carried.
- **Decided** (Owner, 2026-09-29; consumer map): a store-wide state version. The store exposes one opaque version
  covering every record, reads and lists as of a version, and the changes between two versions. Four partitions need it,
  and none of their uses survives records leaving the branch: delivery binds a checkpoint to its merge by a lifecycle
  version that is a HEAD SHA today (`merge.ts`, `checkpoint-composition.ts`); handoff restates from `Commit at Handoff`,
  and recovery compares against its seed's head; readiness is lifecycle state at an exact pull-request head; and
  delivery asks what a Candidate record said at the approved head (`git show <head>:<path>`). A record that attests to
  code carries the code head it was written against as a field, so "as of head" becomes a field match rather than a Git
  lookup.
    - It settles the continuity anchor: SESSION-NOTES and the compaction seed anchor on the store version, and handoff
      and recovery read the changes since it, so `rewrite-with-lease` cannot strand them
      (`strategy-storage-evolution.md` Principle 11).
    - The version names saved state. In the in-repo implementation it spans the checkout's branch tip and the Errand
      refs' tips, and reads may run ahead of it by tracked writes and edits not yet committed, so the conformance
      suite's in-repo fixture commits its tracked records before it asserts reads as of a version (§ What this work
      unit lands).
- **Decided** (Owner, 2026-09-30): a write is durable when it returns. The reference and ref backends version it as it
  lands, and so does the in-repo implementation for an Errand record, whose write is a commit on its ref; a tracked
  record there reaches a version when the branch commit carrying it lands, as today (§ What this work unit lands). A
  record's own version is exact from its write, so compare-and-swap and bound checks never wait on a version.
- **Requirement** (Owner, 2026-09-30): freshness binds records, never the store. A caller that needs state unchanged
  names the records it bound and checks those — their own versions, or `changes` since its version restricted to
  them — and code evidence binds its code head, as today. The store-wide version serves reads as of a version,
  `changes`, and continuity anchors; no caller compares it whole. So no write by another work unit, Errand, or session
  invalidates a checkout's evidence or makes it repeat a ceremony; only a change to what that evidence attested does.
    - It is the state-side twin of the integration doctrine for code: evidence applicability follows the content an
      earlier result covers, never head movement by itself, so other work units' and Errands' merges to base leave an
      attestation standing unless they overlap what it covered (`strategy-integration.md`). Today their state files
      ride those merges into base, and base-overlap analysis finds them disjoint from what the attestation covered
      (`lib/git/base-distance.ts`); a state file both touch, such as a cohort document, is overlap today. After the
      flip state never reaches base.
    - The integration checkpoint binds its lifecycle records and its code head in place of today's HEAD-pinned
      `lifecycleVersion`, which `merge.ts` compares whole; handoff's restate reads the changes since its anchor to its
      own work unit's records. The in-repo lifecycle port keeps its version as HEAD and its reads as the tree at HEAD,
      so today's call sites work unchanged, and the seam's delivery member moves the checkpoint and `merge.ts`'s
      compare onto the record-and-code-head binding before the flip.
    - The conformance suite checks it: a write to an unrelated record changes no bound check.
- **Decided** (Owner, 2026-09-29; consumer map): one write may change several records, all or nothing, each checked
  against its own expected version. Archive, abandon, rename, decompose, and park each change several records in one
  verb; start graduation, park landing, and a dependency-edge discharge already stage several files all or nothing under
  the index lock — graduation and the discharge through `captureGitIndexState` (`lib/git/exec.ts`), park landing by hand
  (`park-planning-landing.ts`); and delivery's authoring store runs multi-record transactions under one machine-local
  lock (`lib/git-common-state.ts`). Git provides it: `git update-ref --stdin` applies a ref transaction atomically, and
  `git push --atomic` carries it to the remote.
    - A backend that cannot apply a batch atomically refuses it whole, `unsupported`, before writing anything. Only
      the in-repo implementation does, for a batch spanning substrates (§ What this work unit lands).
- **Requirement** (consumer map): callers name records by identity, never by projected path. Lifecycle-index entries
  carry a path today and at least ten callers read the meta through it. `list` returns parsed fields, which derived
  views (ROADMAP, `STATUS.USER`, the archive listing) render from; `lookup` also answers lineage by slug and in-flight
  work by checkout claim.
- **Decided** (Owner, 2026-09-29): the failure taxonomy has two layers, and every failure meets the recovery-complete
  refusal rule (`DEV-RULES.PROJECT`): it says whether it is terminal or recoverable, reports the observed condition, and
  names a remedy that leaves the success path reachable.
    - Local operations — read, list, write, batch, history, and lookup — take the closed vocabulary of delivery's store
      ports (`lib/delivery/ports.ts`), the store's first client, plus `not-found`: `version-conflict`, naming each stale
      record in a batch; `record-malformed`; `identity-mismatch`; `ambiguous-match`; and `namespace-corrupt`, the one
      terminal class among them, which names a repair.
    - From the in-repo implementation only, each retiring at the cutover since the ref backends never produce it —
      the mirror of the stale-base path the in-repo implementation never produces (Owner, 2026-09-30):
        - `checkout-not-writable` — recoverable: this checkout lacks write authority for the write, and the refusal
          names where it can land. It fires where today's refusals do, never as a check of the checkout on every
          write: at the write-context preflights (`lib/git/write-context.ts`) — `arc plan check`'s redirect, the
          drain's entry check with its move onto a grooming branch under full protection, and park's run-context
          refusal. A commit on the protected base under full protection stays refused by the pre-commit hook and the
          release wrapper, as today. Grooming, drain, and decomposition branches stay valid write contexts until the
          flip. It also fires on a write to a record whose selected copy lives on another branch (§ What this work
          unit lands). It retires with the preflights at the flip.
        - `unsupported` — refuses the call, never retryable as it stands: a batch spanning substrates, or a read
          outside the version. It names the remedy — sequence the writes, or bind per-record versions.
    - A conflicted entry is not a failure (C4): the verb that depends on it refuses, naming the conflict record.
    - Nor is a stale base: a write whose expected version is older than a merge surface's current one — an inbox,
      working memory, a cohort document, shared prose — merges from that base (C4) and returns the merged version with
      any conflict records it created. On a single-writer surface, the meta and the task list, an older expected
      version is `version-conflict`.
    - Sync ends `pushed`, `noop`, or `reconciled`, or fails `retries-exhausted` (carrying the retry count and time
      waited, C4's tripwire), `unreachable` (network, timeout, or authentication), or `refused` (any other host refusal,
      with the server's message). No remote, as in ghost or local-only use, and being offline are states, not failures.
    - Store and sync failures surface as orientation lines at session boundaries: sessions never stall on the store, and
      a sync failure never blocks a local write. Notes push's nine outcomes and the Errand push's six give way to this
      set; the notes-only variants (`no-local-notes`, and the paired push's `failed-nontty-conflict` and `ok-recovered`
      in `commands/user/types.ts`) retire with notes sync. Until the flip the in-repo implementation's `sync` also
      reports today's `conflict` and `blocked`, and the notes export's local refusals (§ What this work unit lands).
- **Requirement** (Owner, 2026-09-29; `cli-substrate-complete-migration`'s verification): every family's `list` keeps
  what the Errand identity reader (`lib/errand/identity-snapshot.ts`) keeps today. Absent, unreadable, and complete are
  distinct outcomes, so a missing family never reads as a broken one or the reverse. A complete listing carries every
  readable record, a diagnostic for each entry it could not read — malformed, oversized, unreadable, an unknown version,
  or a key that disagrees with its record — and whether it missed any. It is taken as of one state version, the mutation
  basis: a write built on it compare-and-swaps each record it writes against that record's version in the listing,
  never the listing's whole version (the freshness rule above). A deciding consumer refuses on incomplete
  evidence — review-vehicle selection never authorizes review from it — while a browsing one shows what it has with the
  diagnostics, as C2's skew rule already keeps an unrelated bad record from blocking session-init.
    - The acquisition — the identity reader's tip, tree, and blob reads, and `lib/errand/record.ts`'s fetched variant —
      moves behind `list`, `read`, and `sync`. The in-repo implementation wraps it unchanged (§ What this work unit
      lands), and moving it into the ref backend is `storage-ref-backend`'s. `record.ts`'s index projection and each
      consumer's protocol stay with `storage-seam`'s locus, review, and status members, which preserve the four
      requirements (§ The consumer map; the Errand-ref register row, PR #746).
- **Decided** (Owner, 2026-09-29): every store write carries a message the CLI composes, and it records provenance,
  never evidence. The subject names the verb and the record (`archive storage-contract`); trailers carry the work unit's
  or Errand's name and UID, the lifecycle action, and the code head when the write attests code. The commits of one
  batch share a batch ID across refs, so `history` and handoff's restate show an archive as one change rather than one
  per ref.
    - Handoff's restate reads the commits since its anchor (`lib/handoff/restate-candidates.ts`). Once state leaves the
      branch it reads `changes` since the store version, which is legible only because each write says what it was.
    - No evidence needs the message as its home. Adversarial-pass evidence is its own kind (C2); review dispositions
      ride code fix commits today, and their durable copy is the review gate's stored facts (C2), so that body leaves
      under the surface boundary (C8).
- **Decided** (Owner, 2026-09-29): traceability is a store link the CLI captures, not a message convention. A task
  record captures its increment commits, and a work unit's integration and an Errand's close capture the landing commit.
  Reverse lookup answers from a commit to its task, work unit, or Errand — in ghost mode alike, and across a rename,
  since records key by UID. Delivery's task attribution (`lib/delivery/from-branch.ts`), which parses `Context:` footers
  today, reads the link instead, the import deriving the links for commits from before the flip (C5). What code commits
  carry is C8's footprint policy.
    - A task's capture is made by C5's close verb. The default history policy rebases pushed branches routinely (C12),
      so a capture holds each commit's patch-id beside its SHA, and ARC's own rewrites remap it (C5).
    - The residual: a footer is text, so it survives a squash, a rebase on merge, and a cherry-pick. The landing commit
      keeps the work-unit link under any merge strategy, and per-task links survive merge commits, fast-forwards, and
      any rewrite that leaves each commit's diff alone. A rewrite outside ARC that changes a commit's diff — a
      conflict-resolving rebase, squashed fixups — loses the per-task link, and a squash loses per-task granularity by
      its nature. A team that needs text links through rewrites turns on the task trailer (C8).

### C2. Record model

- **Decided** (ADR-035 items 3 and 5): the clean split — all operational and planning state leaves tracked files,
  `completed/` included, and its projection at `.arc/completed/` stays browsable; machinery and constitutional
  documents stay tracked; no in-repo operational-state tier remains. Files first: file groups behind the contract with
  a file-copy projection, and a records engine later.
- **Decided** (Owner, 2026-09-25): file-as-record. Fields are parsed from the file, which is itself the record, and
  validated at write-back; rendering is only for derived views (ROADMAP, STATUS). Precedent: Obsidian's front-matter
  properties, queried by Dataview. ADR-022 carries the amendment (PR #743), and its flip to Accepted moves to
  `storage-seam`'s kickoff.
- **Decided:** placement is a record field and directory layout a projection of it.
- **Decided:** locus derives from the checkout marker plus the store, with a primary marker allowed for `--here`.
- **Decided** (Owner, 2026-09-29): format skew. Every family's records carry a format version; a record newer than the build
  refuses with a typed "merge base or rebuild" remedy; **a record unrelated to the current work unit never blocks
  session-init**. The store sits in the common Git directory, so every worktree's build reads every record, and
  worktree builds lag base by weeks (`WORKING-MEMORY`: an older build rejecting a Candidate record's enum values).
    - The store keeps each record's format version beside the record, never in the file's content, so projected files
      stay plain Markdown (Owner, 2026-09-30). The version is per record, not per family, so one newer record never
      makes an older build refuse the rest. `storage-ref-backend` writes it, and until then every record reads as
      version 1. Skew already occurs when one checkout's build reads records another checkout wrote, but the in-repo
      implementation has no stored version to name it: a record its build cannot parse is an unreadable entry with a
      diagnostic (C1), which never blocks session-init when unrelated.
- **Decided** (Owner, 2026-09-29): the record-aware seam, from day one. Every reader asks the contract for a document's
  fields through its family's parser, never by path or placement. Each `storage-seam` member builds the parser for the
  families it reroutes, so under file-as-record the seam builds the records engine as it goes: file formats do not
  change at cutover, and a later records engine changes only what sits behind each parser, without moving storage.
  Left for later, `operational-state-docs` would rewrite the same consumers — the regex readers in
  `session-init/managed-field.ts` among them — a second time.
    - The counter-risk, tying the cutover to every family's schema design, is small: the meta parser and the kernel
      schemas exist, the transition record validates against a strict schema, configuration has one, the inbox entry
      grammar is defined, and prose kinds need no field schema.
    - `operational-state-docs` stops being the records engine. Its conformance gate is an independent slice that can run
      ahead; its user-surface verbs and fields — `arc inbox add`, a `WORKING-MEMORY` mutation verb, tombstones,
      `_Awaiting:_` — stay in it, re-scoped and deferred (C14). A draft-close capture redistributes its inbound buffer
      at the next drain: most entries move to `storage-seam` and a few to other homes, some stay, and the rest close as
      shipped or as superseded by C4.
- **Decided** (Owner, 2026-09-29): the query cache is deferred (C14), home `query-cache`. It would be a local SQLite
  index of the fields each family's parser exposes, built from the store, keyed by ref tips and checked on read so it
  cannot serve stale state (git-bug #235), and never the authority: a binary store does not diff or merge in Git and
  makes conflicts opaque. Raw reads need none (every work unit's meta at its tip, 601 of them, in one 17 ms batch), so
  its case is queries across fields and live views, including typed reads for `arc view` and the status HUD. Node's
  built-in `node:sqlite` may avoid a native dependency; verify against the supported Node range.
- **Decided** (follows from ADR-035 item 3): after cutover a Candidate's review subject is the code in the Git index
  alone; design artifacts reach review only through the export setting (C10). `storage-seam`'s review and evidence
  work redefines the subject, and the evidence-neutral path treatment goes with the register's lifecycle
  classification row.
- **Decided** (Owner, 2026-09-29): two levels. A **family** is the storage grouping — scope (project or identity), ref
  placement (which may be a subtree of another family's ref), retention, sync, tracked-versus-stored profile, and
  lifecycle. A **kind** within it carries the parser, format version, writer rule, and projected path. The split is
  forced: each work unit is one ref with one lifecycle, yet its meta and task list take a different writer rule from its
  prose (C6), and a backlog stub is groomed by anyone while an in-flight or parked one is not (C6). C3 decides how each
  family shards into refs; C4's "surface" names one ref's share of a family. This work unit owns the list and each
  family's storage properties; each family's field schema stays with `storage-seam` or the follow-on that owns it, so
  the list commits no schema.
- **Decided** (Owner, 2026-09-29): the families. The list drives the ref layout (C3), migrate's coverage (C1), and the
  conformance suite.
    - Project scope:
        - **work units**, across their whole lifecycle, `completed/` included — kinds: meta and task list (machine
          records), draft, spec, notes, and companions (prose), the inbound list (an entry list, C4), and the
          review-pass record (below), under C6's writer rules. The layout resolver already names the first five;
          companions follow ownership by folder;
        - **cohorts** — cohort documents, three-way line merge;
        - **the project inbox** — `ATOMIC-INBOX`, entry merge;
        - **delivery and review records** — Candidate records (`candidates/*.json`), integration boundaries
          (`*.boundary.json`), and review evidence: machine records written only by verbs. One family for now;
          `storage-seam`'s review and evidence work and `delivery-observe-attest` split its kinds, and part of the
          delivery machinery may go with the substrate;
        - **project identity and counters** — the project ID (C7) and record-number counters, by compare-and-swap;
        - **lineage** — terminal transition records (`transitions/*.json`), written by decomposition, abandonment, and
          retirement, which teardown reads as the retirement receipt; keyed by the UID of an origin that no longer
          exists. A rename is not terminal: the work unit keeps its UID and records its former slugs, so an old name
          still resolves;
        - reserved: `VECTOR.PROJECT` (`goal-aware-direction`).
    - Identity scope, one person across their machines:
        - **personal surfaces** — `USER-INBOX` and `WORKING-MEMORY` (entry merge) and personal documents; reserved:
          `VECTOR.USER`, and `config.user.yml` for `config-storage-architecture`;
        - **the per-work-unit personal workspace** — `SESSION-NOTES` and companions such as `capture-notes.md`;
        - **Errand identities**, already live under `refs/arc/user/<id>/errands*`.
    - Stored with the families, so migrate and the conformance suite carry them (Owner, 2026-09-30): conflict records,
      a kind of each family with merge surfaces (C4); routing receipts, a kind of the inbox families (C4); and each
      record's format version, which every read returns and every write carries.
    - Not families: the machine-local set (below); derived views, never stored — ROADMAP, `STATUS.USER`, the archive
      index, and the query cache; and, under the standard profile, the tracked machinery and constitutional documents
      (the profiles, below). `strategy-file-classification.md`'s taxonomy governs update behavior, a separate axis.
- **Decided** (Owner, 2026-09-29; consumer map): durable review facts are stored, at project scope, and review working
  state stays machine-local. Review evidence must survive a change of machine, and the integration boundary files are
  today the Owner-accepted terminus's only store. `review-protocol-alignment` designs the terminus's durable form
  against this.
    - The review gate keeps evidence, outcomes, operations, sources, and its own repository ID under
      `.git/arc/review-gate/`, machine-local and unsynced; no code writes review records to the per-work-unit personal
      workspace. Evidence, outcomes, and termini are the durable facts that move; operations, locks, materializations,
      and quarantine stay; `storage-seam`'s review member settles the rest.
    - The import maps the review gate's repository ID onto the project ID (C7), so receipts keep their key.
- **Decided** (Owner, 2026-09-29): advisory adversarial-pass evidence is its own kind in the work-unit family, never a
  section of the artifact it reviewed. The artifact stays the latest complete version, and the evidence describes one
  version of it; folded into the artifact, every fold edits both, and a reader cannot tell a refinement from the record
  of why it was made.
    - An entry list, one entry per pass, appended by the session that ran it: the artifact and the version reviewed,
      `Pass N of M`, the rubric, the finding and disposition set, the stop reason, and any conditional next-pass
      decision. Because each entry names the version it reviewed, the refinements are the artifact's history from that
      version to the one after the folds — derived by `history`, never written.
    - Not a review-gate record: advisory passes create no lane progress, Candidate, or receipt (`adversarial-review`).
      It archives with its work unit, later passes read it as their prior findings, and the projection shows it as its
      own file beside the artifact.
    - Until the flip it is a tracked companion, `review-<slug>.md`, which moves with its work unit. The workflows that
      say "the existing … review evidence" (`draft-design`, `create-spec`, `generate-tasks`) and the method's retention
      clause name it, and `isPlanningArtifactPath` learns its prefix: an Errand on `main`, captured in `USER-INBOX`.
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
    - The common Git directory also holds machine-local state no family covers, under `.git/arc/`: the review gate's
      namespaces (above), delivery's plans, state, authoring, gates, and resolutions, transient claims, grooming, and
      decomposition worktrees; so do integration checkpoint records under a work unit's personal `.internal/`. None is
      synced, and the store keeps its own directory beside them (C3).
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
      orders but does not disambiguate. The Errand branch's suffix lands with `storage-ref-backend`'s re-keying of the
      Errand ref tree (Owner, 2026-09-29): a slug collision before then is rare, and recoverable by choosing another
      slug.
    - Machine records reference each other by UID; prose keeps names and backticked filenames. UIDs never enter
      filenames or projected paths, which stay slug-keyed.
    - The meta gains an `Id` field, a schema change `storage-seam` makes; the import mints a UID for every existing
      record. Until then, the lifecycle index this work unit lands takes an opaque record identity, which the in-repo
      implementation resolves from the slug, so the `Id` field makes it a UID with no caller change (Owner,
      2026-09-30).
    - Two guards hold slug uniqueness, since two live records with one slug would project to one path. Work-unit
      slugs and cohort names share `backlog/planned/`'s children, so each guard checks both kinds. At creation, the
      slug is checked against live records in the local store, fetched first when online, and a clash refuses with a
      rename remedy. A clash between machines resolves by write-then-gate (C4): both records exist, the projection
      refuses to place the second on the taken path, status lists the conflict, and a rename resolves it.
- **Decided** (Owner, 2026-09-29): the profiles. The standard profile is the line `strategy-storage-evolution.md` draws:
  every state family stored, authored design reaching tracked files only through the export knob (C10), and project
  machinery, ARC core, and the constitutional documents tracked. State families are the same in the ghost profile, which
  differs only where standard tracks, since ghost tracks nothing.
    - Project machinery and the constitutional documents become two project-scope families, projected at their familiar
      paths behind the exclude-only ignore (C8). They are families only under ghost; readers load them by `.arc/` path
      under both profiles, so nothing above the contract and the projection asks which profile is active.
    - ARC core projects read-only from the installed package — C11's multi-source projection — so `ghost-mode` depends
      on `framework-core-from-package` or builds that projection itself.
    - The export knob is pinned to `none`.
    - A profile is chosen at init (C8): two named profiles, not per-family switches, within Principle 8's one knob.
        - The named cost: under ghost, ARC's configuration for the repository — `arc-config.yml`, `DEV-RULES.PROJECT`
          and the gate commands it names, method overrides, extensions, and project strategies — is one copy, the same
          on every branch and checkout. Under standard it is tracked and behaves like code: a branch can change a rule
          or a gate command, the pull request reviews it, and an old commit carries the rules of its time. Under ghost a
          change applies everywhere at once, and nothing reviews it, which fits one person's configuration of a
          repository they do not own. What can bite is configuration that describes the code's tooling rather than ARC's
          behavior — chiefly the quality-gate commands, which a long-lived branch with different tooling would
          contradict; most settings, such as interlocks and commit format, do not vary by branch at all. No per-branch
          override is built unless that is hit.
        - The profile choice at init says this in plain terms — ARC's settings for the repository are the person's alone
          and the same on every branch — which is `ghost-mode`'s to write.
- **Decided** (Owner, 2026-09-29): the serialization rules. Notes sync's (`lib/git/user-sync.ts`, from its first
  implementation) are partly notes artifacts: a note holds one JSON manifest carrying every file as a string, which
  excludes binary content and piles size into one blob, while the store keeps each file as its own blob.
    - Text only, checked by content rather than an extension list. Every personal file today is Markdown, the largest
      `USER-INBOX` at 93 KB, and every merge mechanism in C4 works on text; it widens only on demand. The `.ipynb` and
      `.svg` exclusions go.
    - One size cap for every kind, about 1 MB, as an accident guard. Tracked records already pass 256 KB (a task list at
      436 KB, a Candidate record at 411 KB). History is never rewritten and rotation is deferred (C3), so an accidental
      large file stays in synced history for good, fetched by every machine that takes its ref.
    - Secrets: the `.env` exclusion stays and private-key files join it. Identity scope is not private — anyone who can
      read the state host, the code repository by default, can read it — so a file that must never leave its machine
      belongs in the local-only path set.
    - Each rule is a typed refusal at persist, never a skip: under the projection, a skipped file is silent loss on
      every other machine.

### C3. Ref layout and where the store lives

- **Decided** (spike): one ref per surface; per-work-unit refs do not contend; ref count barely changes fetch cost.
- **Requirement** (analysis § 6.10): every stored path is unique across refs — slug-named for work-unit artifacts,
  per person for personal files — since identical paths defeat Git's delta search and cost two to three times the
  pack size.
- **Requirement:** ARC fetches with its own refspec into a remote-tracking namespace (C5), never straight into
  `refs/arc/*`, where a forced fetch would overwrite unpushed local writes.
- **Requirement:** ARC runs `git maintenance run --auto` at a firing point, because plumbing writes never start gc.
  A completed work unit's ref leaves the fetched namespace at archive.
- **Decided** (Owner, 2026-09-29): no scheduled rotation at 1.0 — rotation is deferred (C14) and never precluded. Built,
  it bounds history by rotation — a fresh ref holding the current state, the old chain left in place out of the default
  fetch — never by rewrite, which tamper evidence and a fast-forward-only hook forbid. Reads take only the tip, so depth
  never enters the read path (flat to 20,197 commits).
    - Only four refs never retire — each person's `personal` and `errands`, `project/inbox`, and `project/registry` —
      since a work unit's ref leaves the fetch at archive, a cohort's closes into the archive, and a quarter's archive
      ref stops growing. The refspec takes only the person's own identity, so a fresh machine pulls its own inbox
      history — 5.5–5.7 MB a person-year pushed commit by commit, 26.6 MB where a host repacks at the default window —
      not everyone's. The spike's synthetic unrotated year — every ref, fully repacked at a wide delta window — was
      90–290 MB; a rotated year fetched 8–19 MB at ten people. The shared project inbox at team scale is unmeasured,
      which the tripwire answers.
    - Rotation's design cost is why it waits. Under a fast-forward-only hook it needs a new ref name, and rotating a
      shared ref needs the old ref marked retired, so a machine that has not fetched and still writes to it refuses and
      replays; nobody has designed that piece.
    - The deferral's cost: when the tripwire fires, building rotation is the only remedy.
- **Requirement** (Owner, 2026-09-29): nothing precludes rotation. Every ref name in this layout is fixed at 1.0.
  Rotation, when built, takes a new ref name with a generation suffix and puts a field in the rotated ref's root commit
  naming the old tip, which `history`, `at`, and `changes` (C1) follow across the boundary, so no caller changes; the
  fetch refspec changes with it.
- **Requirement** (Owner, 2026-09-29): a growth tripwire, in C4's shape. The maintenance run's result carries each
  never-retiring ref's commit count and disk usage (`git rev-list --disk-usage`), and handoff's report shows them past a
  bound, which `storage-ref-backend` sets from the spike's figures.
- **Decided** (Owner, 2026-09-29): no wider delta window. The host's packing sets what a fetch costs, so a wider local
  window saves only local disk; in the shared layout it slows gc for the whole repository, code included; and unique
  stored paths already capture the gain ARC controls, 2.1 to 2.8 times at the default window.
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
  default backend (C7) — the store is the code repository's own refs. When state goes to another remote or to none — the
  backing repository and local-only, where ghost mode lives — it is a separate Git directory inside `.git`
  (`.git/arc/store/`, beside the machine-local state ARC already keeps under `.git/arc/`, C2). ADR-035 item 2 left this
  to the contract and covers both shapes without amendment.
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
    - The marginal cost over one layout: bootstrapping `.git/arc/store/`; an explicit `--git-dir` on every store
      invocation, since the executor pins repositories by `cwd` and `safe.bareRepository=explicit` refuses implicit
      discovery of a bare directory; a second refspec target; and the conformance suite run over both layouts. The
      separate layout sees less field use, so the suite is what exercises it, including the ordered path's "code
      pushed, state push failed" case.
- **Requirement:** reserve the families `refs/arc/*` already holds. The Errand identity ref
  (`refs/arc/user/<id>/errands`, pushed straight to origin with no remote-tracking namespace) becomes an identity-scoped
  store surface; notes sync's `refs/arc/user/<id>/sync-state` retires with notes; delivery candidates and refresh
  candidates, review pins, and `refs/arc/tmp/*` are not state and stay out of the state refspec. ADR-027's "joins the
  user-notes ref" is amended to match at the cutover's documentation pass (the register's accepted-ADRs row).
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
- **Decided** (ADR-035 item 7; analysis § 6.9): each surface's mechanism.
    - Work-unit state is single-writer where it is machine-parsed (Owner, 2026-09-29; C6; ADR-035's amendment, PR
      #742): a work unit's meta and task list are written only from its own checkout. Its prose may also be written
      from the owner's other checkouts, through compare-and-swap and three-way line merge, so the work-unit ref has a
      merge path and the conformance suite covers it.
    - Inboxes and working memory take entry merge, with union limited to insertions, keyed on a parsed `_Id:_` field
      (Owner, 2026-09-29) stamped at capture in the grammar `_Created:_` uses — eight hex characters, re-drawn on the
      rare clash within the file. The bold title stays the human handle: keyed on the title, a retitle read as a delete
      plus an insert, which a concurrent edit elsewhere turned into a conflict or a resurrected entry. An entry without
      an ID, such as one typed by hand, gets one at its first persist, and the import stamps existing entries; until the
      flip the writer stamps none (§ What this work unit lands).
    - Backlog order is a fractional-index rank field on each stub, sorted by `(rank, stub id)`, the compare-and-swap
      loser re-keying after the winner.
    - Cohort documents and shared prose take three-way line merge.
    - Record numbers and work-unit claims are compare-and-swap claims, with hot counters reserving a block per process.
      Identity is a UID (Owner, 2026-09-29; C2), so a slug is not claimed by compare-and-swap on ref creation; C2's two
      guards hold slug uniqueness, and the same ADR-035 amendment covers item 7's "exact claims" wording.
- **Decided:** write, then gate. A same-entry clash — two differing edits — lands as a typed conflict record keeping
  both sides as data; the next verb that depends on that entry refuses, status lists it, and a resolution names it.
  Recency never decides, conflict markers are never the record, deciding verbs re-read the store, and each checkout
  refuses a state head that does not descend from the last one it saw. This replaces user sync's recency resolution
  (`lib/user-sync/merge.ts`), which drops the older edit silently.
    - A removal racing an edit to the same entry is not a clash; the edit survives (Owner, 2026-09-29). A removal takes
      out only the version it observed, as in an observed-remove set (add wins), so an edit it never saw was
      concurrent, not later, and recency still decides nothing. The spike found almost every conflict left under entry
      merge was a drain racing a note, so a conflict record there would make ordinary housekeeping a hand-resolved
      conflict. From the flip the drain reads each entry's `_Id:_` and version through a listing verb and passes both
      to `arc user inbox-remove`, which removes only that version, leaving an entry edited since and reporting it; an
      edit persisted after the removal meets the same rule. The listing composes over the inbox writer's entry
      inspection (`inspectInboxEntry`, `listInboxEntryTitles`), and the removal over its digest-qualified path, which
      Errand close uses today (`removeInboxEntry`); the listing's name is `storage-seam`'s. Before the flip the drain
      removes by title, as today.
    - Routing keeps the entry's `_Id:_` at its destination — an inbound entry's `routed from <origin>, <date>`
      provenance line gains it, a new stub's Origin cites it, and an `ATOMIC-INBOX` entry keeps its own — so the next
      drain recognizes a surviving entry as already routed and carries only its new content there, never a
      duplicate; in another person's work unit, where only the owner edits entries, that content goes as a new entry
      citing the original's ID. A note woven into a draft's prose keeps no ID, so its survivor routes again as a
      follow-up inbound entry. Two drains routing one entry to one destination write the same ID once; to two
      destinations they leave two homes, findable by ID.
    - Each routing writes a receipt — the entry's ID, its destination, and the date — into the inbox ref's tree,
      never projected, which gives the batch-mutation requirement below its home. A surviving entry with a receipt
      gains a ``_Routed:_ `<destination>` `` line, so the person sees why it came back and that its new content has
      not reached its home, rather than deleting it as a leftover and losing that content. Receipts go with the
      ref's rotation.
- **Decided** (Owner, 2026-09-29): the concurrency library lives in this work unit (§ What this work unit lands).
- **Decided** (Owner, 2026-09-29): an open conflict shows in the projected file itself, as standard Git conflict
  markers (`<<<<<<<`, `=======`, `>>>>>>>`) around both whole versions of the entry, each side labelled with its
  machine or session and time; status and the refusing verbs stay as decided. `WORKING-MEMORY` loads into every
  session, so a conflict shown only in `arc status` would have every session read one side as settled. Nothing is held
  back: the conflict is in the store from the moment of the clash, the rest of the file keeps refreshing, and the
  projection's hold-back guard, with teardown's export into the conflict record (analysis § 6.5), retires for merge
  surfaces. In the spike, holding back the whole file stopped 43 of 60 worktrees syncing the inbox. Jujutsu does the
  same: a conflict is stored as a logical representation, materialized with markers in the working copy, and parsed
  back on the next scan.
    - One idiom for lists and prose: line-merged drafts, specs, and cohort documents mark the conflicting lines the
      same way. Lists conflict per whole entry, with no line merge inside an entry, which the spike found silently
      wrong in 0.2–2.2% of pairs.
    - Parse-back at persist: markers left as they were keep the conflict open; markers replaced by text record that
      text as the resolution, naming the conflict; a duplicated `_Id:_` left by an editor's "accept both" gives the
      second entry a fresh ID; malformed markers refuse that entry's persist with a typed remedy while the rest of the
      file persists.
    - The surface's owner decides a resolution; a session proposes one and applies it on the owner's approval, never
      picking a side on its own. A drain skips a conflicted entry and reports it, while insertions elsewhere still
      merge.
    - Editors, checked by hand on a gitignored probe (2026-09-29): VS Code offers its accept actions though Git never
      reports the file as conflicted, and "accept both" kept both entries but dropped the blank line between them, so
      the entry parser tolerates that and the merged write restores standard spacing. Zed shows nothing, so there a
      conflict is resolved by editing the markers directly or through a session. In prose files, `=======` under a
      paragraph renders as a heading in preview, as in any Markdown merge.
    - A lint glob that still reaches projected paths flags open markers: markdownlint read the probe's prose conflict
      as a heading and failed it. The register row on checks that read state already moves them to where state is
      written, so the code gates stop globbing projected state.
- **Decided** (Owner, 2026-09-29): any session routes straight into a work unit's inbound list; nothing routes
  through the owner. A capture waiting for the owner would rest in a capture surface with its home known, which
  `DEV-RULES.ARC` § Discovered Work Routing forbids, and nothing could carry it: a personal inbox is private and the
  project inbox takes Errands only. Hold-and-route exists because tracked branch files made the direct write
  impossible, so it stays until the flip, when direct routing takes effect (§ What this work unit lands).
    - The Inbound Buffer leaves the draft to become its own kind, the inbound list (`inbound-<slug>.md` beside the
      draft), merged by entry. Integration removes entries while appends arrive, and insert-beside-delete is where
      line merge was silently wrong in the spike. The solo case alone needs this — a drain in one worktree appends
      while the owning session integrates — so another person's append is one writer rule on top.
    - Writer rule: anyone with project write access inserts, through the routing verb, since others' work units are
      read-only in the projection; only the owner's sessions edit or remove entries, and integration is one write to
      the work-unit ref. The host cannot enforce owner-only, as with every ARC writer rule (C7).
    - One surface from stub to archive; a backlog stub still takes a note woven straight into its draft (C2).
      Entries ride the work unit's own ref, so they contend only with that work unit's other writes.
    - Teams will mostly talk out of band. The entry is the durable carrier a message points at, so the routing verb
      reports the entry's ID and its destination.
    - Survives the cutover: `WU_Target` as the capture hint, `_Hold` as the retain escape hatch only, and the timing of
      `WORKING-MEMORY`'s coordination-seam rule (route before the spec — at draft close — not in task lists). Retires:
      in-flight owner adoption, and that rule's mechanism (never editing sibling work units' tracked buffers).
    - Left to `storage-seam`: where an executing work unit integrates inbound entries — handoff or verify — since it
      has no next planning iteration.
- **Decided** (Owner, 2026-09-29): the design envelope — about ten people running about six sessions each — holds
  with margin, confirmed by arithmetic from the workload model and this repository's history rather than by a
  team-scale spike.
    - State pushes alone only at handoff, lifecycle steps, and explicit sync, and otherwise rides a code push (C5).
      This repository averaged about six such firing points a day in August (2.9 handoffs, 3.3 lifecycle ceremonies)
      and 31 on its busiest day, across three to seven sessions; its busiest September week reached 14. Ten people at
      the busiest day's rate push state alone about 30–40 times an hour, well under GitHub's guidance of six pushes a
      minute per repository, shared with code pushes; no tested host throttled bursts of 280–540 a minute.
    - Few refs are shared across people — the quarter's archive ref, the project inbox, the registry, and cohort
      documents; work-unit and personal refs have one owner each. At one or two archives a person a day, two pushes
      meet on one ref within a push time (1–3 s) for a fraction of a percent of pushes, and one retry settles it; the
      measured worst case, twenty machines pushing one ref at once, settled in 25–60 s.
    - No spike: compressed time only recreates that simultaneous case, and real time needs a team's sessions over
      days. The residual stays named — nothing ran at team scale.
    - Tripwire: the push loop's result carries its retry count and time waited, and handoff's report shows them past
      a bound, so a team outgrowing the envelope sees contention — the evidence for sharding a shared ref or for the
      deferred service backend — rather than unexplained slowness. The fields join C1's failure taxonomy.
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
- **Decided** (Owner, 2026-09-29): where `--atomic` is unavailable — the backing repository's two remotes, or a host
  without it — the code leg pushes first and the state leg second, each independent, with no repair verb. Code pushed
  and state not leaves nothing lost: the local store holds the write, an orientation line reports the pending push (C1),
  and the next firing point or `arc sync` retries it. Where the code leg cannot push, the state leg still does, and a
  captured commit the code remote lacks reads as not yet published, never as an error. Code first means the remote
  ordinarily never holds a record naming a commit it lacks. Local-only has nothing to order.
- **Decided** (Owner, 2026-09-29; revised 2026-09-30): one close verb. It closes a set of tasks — marking each
  complete, and each parent whose subtasks are then all complete — and captures the increment's commits, `HEAD` or
  named commits, into their task records, always after the commit, which it never makes. The commit is the increment's
  as today, behind the increment's structured gate, which already covers work and commit, and routed as a `taskCommit`
  fire site; it may come from an editor or ghost mode's own tooling. Completion therefore lands after approval. A
  task's record holds a list of commits, which may be empty: a task that produced no commit, such as a decision or
  research task, closes with none.
    - Completion is a field only the verb sets (Owner, 2026-09-30). Write-back persists every other task-list edit — a
      task added, reworded, or annotated — and refuses a hand tick, reporting it and naming the verb while the file
      keeps the edit (C6). The parent cascade is computed, never kept by hand (`strategy-procedure-evolution.md`: the
      CLI computes what it can).
    - Closing and capturing start at the flip, since a commit on the checkout's branch cannot record itself there, and
      the task loop moves onto the verb then (§ What this work unit lands). Until then tasks are ticked by hand, the
      task list rides its code commit, and reverse lookup and footers stay as today (C8). The verb's name and placement
      are `storage-seam`'s.
    - Commits from before the flip get their captures from the import (Owner, 2026-09-30). `storage-ref-backend`
      derives each closed task's captures from the `Context:` footers of the commits that carry its ID, the derivation
      reverse lookup and delivery's attribution use today (`lib/handoff/restate-candidates.ts`,
      `lib/delivery/from-branch.ts`). From the flip every task's attribution is its capture, and no ARC reader parses
      task state out of commit messages; where a squash dropped the footers, those tasks keep no capture, a named
      residual.
    - A missed capture is visible, never silent. While a work unit has open tasks, orientation at session boundaries
      lists the branch's non-merge commits since its last capture, and none from before the import's version at the
      flip, naming the verb as the remedy, since footers are off by default once capture exists (C8). The ceremonies
      that keep a commit step for tracked files — create-spec's ADR companion and research moves, the export's add and
      delete (C10) — run while no task is open, so they never appear there.
    - The capture survives rewrites. Under `rewrite-with-lease`, the default (C12), pushed branches rebase routinely, so
      a bare SHA dangles after most rebases. A capture holds the SHA and its patch-id, which a rebase that leaves the
      diff alone preserves; ARC's own rewrites — the history policy's catch-up with base, which `history-policy` builds
      with its remap — remap captures from the rewrite's old-to-new mapping; the verb run again after an amend replaces
      that increment's capture; and lookup resolves by SHA, then by patch-id among the branch's commits.
    - Forward-compatible with the increment ratchet `commit-increments` and `unit-scoped-review` shape — per-task by
      default, a floor raised by project and then user configuration, and overridden conversationally in any scope: the
      verb closes any set of tasks — one, a parent, a phase, several phases — against the commits of that increment, and
      nothing in the capture assumes one task per commit or per increment.
- **Decided** (Owner, 2026-09-29): `user.notes_push` retires with no successor. Its three modes chose when personal
  files publish; where they publish is now the backend's (C7), and identity scope is not private (C2), so a held push
  only delays the same exposure while leaving the person's other machines stale. A state push follows `push.interlock`,
  the axis that already gates pushes, and state refs ride a code push wherever one runs. The key's 14 consumers and its
  migrator in `commands/update.ts` retire with notes sync at the cutover, with no migration under the pre-public-release
  posture, and so do `session.init_pull.notes` and `session.init_load.notes`: the projection makes loading automatic
  (C6), and fetching is below.
- **Decided** (Owner, 2026-09-29): freshness. Another machine sees a write only after it fetches, and a no-change fetch
  costs 0.7–0.9 s on GitHub, so ARC fetches explicitly at coarse points: session start, in session-init's remote step
  under `session.remote_sync`; every firing point, whose push loop fetches first anyway; and `arc sync`. A deciding verb
  that is itself a firing point fetches before it decides — the fetch its push needs, moved ahead of the decision, at no
  extra cost. No background fetch runs.
    - Correctness never rests on freshness: write-then-gate and compare-and-swap at push catch a decision made on a
      stale read (C4). Freshness decides only what a reader sees meanwhile, so readers that show others' work state
      their fetch's age.
    - No refspec joins the code remote's configuration. Every ordinary and editor background `git fetch` would then pull
      state and print state-ref updates in the person's Git output, and ARC would write configuration into the code
      remote, while the fetch points above already cover every decision. The separate layout's Git directory is ARC's
      own, so its configuration may carry one. ADR-035 item 2's "ARC installs a fetch refspec" keeps its substance —
      plain clones omit the refs, and state lands in a remote-tracking namespace — and takes a dated amendment for the
      mechanism.

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
    - The owner edits their own work units' prose — the draft, the inbound list, the spec, notes, and other
      companions — from any checkout, through compare-and-swap and three-way line merge (C4). The view exists so that
      reading or adding to another work unit needs no worktree switch, and blocking would not protect the owning
      session anyway: its projected copy is a file on disk anyone can open by path, and a stale whole-file write
      carries its old base stamp, so persist merges rather than overwrites.
    - The meta and the task list stay with the owning checkout. They are machine-parsed records whose verb-owned fields
      — the meta's `State`, a task's completion — change only through verbs behind ceremony and task gates, and
      changing them changes what that checkout's session does next.
    - Another person's work units are read-only, except that anyone may insert into the inbound list through the
      routing verb (C4).
- **Requirement** (Owner, 2026-09-29): a protected file says so where it is read, not only when a save fails.
- **Decided** (Owner, 2026-09-29): three layers, each an existing idiom.
    - A notice line beside the base stamp in the generated-file idiom (`Code generated … DO NOT EDIT.`), naming where to
      edit: the owning checkout's path on this machine, that the work unit is in flight on another, or, for a parked
      work unit, `arc resume`. It is invisible in rendered markdown and visible in the raw file, where editors and
      agents write; persist strips it with the stamp. Writable files carry no notice.
    - The read-only file mode (the read-only attribute on Windows): JetBrains IDEs show a lock and offer to clear it,
      Vim warns on the first change, and an agent's write fails; refresh lifts the mode to rewrite. VS Code honors it
      only with `files.readonlyFromPermissions`, which belongs to the editor-settings item below.
    - The typed refusal at persist, as the backstop: it keeps the edit, never drops it, and names where to apply it.
- **Decided** (Owner, 2026-09-29): an open cohort's document keeps one home, `backlog/planned/<cohort>/`, from
  creation until the cohort closes and joins its quarter's archive ref (C3), whatever state its members are in. A
  cohort is a grouping with its own lifecycle, and its members see the document through the `current/` companion. A
  dedicated root would add a fifth projected root and ignore entry for a grouping the backlog already holds.
- **Decided** (Owner, 2026-09-29): a parked work unit keeps its backlog placement — `backlog/planned/`, under its
  cohort when it has one — since parking sets it down on the ready list. Edit rights follow lifecycle state, not the
  projected folder: provisional and planned stubs are groomed by anyone; planning, active, integrating, and parked
  work units keep the owner's rules — the owner edits the work unit's files, only verbs change the fields a verb owns,
  and others insert into the inbound list. Execution has begun against a parked work unit's spec, so
  grooming it is not open to anyone. Its protected notice names `arc resume`, since no checkout owns it. Grooming from
  any checkout takes effect at the flip; until then a stub is groomed on a grooming branch, as today (§ What this work
  unit lands).
- **Decided** (Owner, 2026-09-29): lifecycle work anchors; edits do not. Every lifecycle workflow for a started work
  unit — draft-design after start, create-spec, generate-tasks, the task loop, verify, and integrate — checks at entry
  that it runs in the work unit's own locus and, from anywhere else, offers the remedy rather than letting a session
  drift into lifecycle work. Captures, inbound entries, and the owner's prose touch-ups stay open from any checkout. The
  write rule already places the hard wall: the meta and task list write only from the owning checkout, so create-spec's
  meta write and generate-tasks refuse elsewhere, while the spec, being prose, stays writable by its owner from other
  checkouts.
    - Spawning a dedicated worktree stays `arc start`'s default: a workspace named for its work unit tells a session
      what it is doing. Branchless planning (C12) makes anchoring in place the cheap explicit choice — `arc start
      --here` writes only the marker, where it once cut and switched to a planning branch — so a session that groomed a
      stub can continue in place, and a session that cannot move into a spawned worktree has a remedy. A primary
      checkout anchored this way is not the launchpad while its work unit plans, so Errands spawn their own worktrees,
      as they already do whenever the primary is taken. Activation, where code work begins, is the natural point to move
      into a dedicated worktree.
    - `storage-seam`'s locus member builds both, since it rewrites locus derivation and `start`.
- **For `storage-projection`:** push-refresh also carries work-unit files into sibling worktrees' `in-flight/` views.
  A write still touches one or two paths per worktree on the machine, the bound measured above, but more writes fan
  out.
- **Decided** (Owner, 2026-09-29): the projection needs no user-facing name or verb of its own. "Projection" stays
  the design and code term; user-facing documentation calls the files under `.arc/` a working copy of the store.
  Getting other sessions' changes is automatic, and `arc sync` covers doing it on purpose or rebuilding deleted files;
  saving is the persist verb below. `materialize` is left to its current commands: as a word it suggests a read-only
  copy, and ARC already uses it in about five senses.
- **Decided** (Owner, 2026-09-29): the firing points, who fires them, and the persist verb. This shapes the flip's
  workflow rewrite and the documentation pass.
    - **Who persists what, from the flip.** The workflows' two dozen ceremony commits sort three ways. Lifecycle
      transitions an `arc` verb makes — start, activate, park, resume, reopen, promote, abandon, archive, publish,
      reconcile, Candidate applicability, publication boundary — persist inside the verb. Authoring milestones, where a
      person or agent edited a work unit's files — capture draft (including the grooming lane's), create spec, generate
      tasks, amend design, inbox absorption, archive-phase content, handoff — persist through `arc save`, or through
      write-back at the next `arc` command. ROADMAP re-renders disappear, since ROADMAP is derived. The notes-backed
      surfaces join the list: `WORKING-MEMORY` and `SESSION-NOTES` at handoff, and inbox captures through their verb.
      Until the flip every one of them persists as today — a commit, or a notes save for the notes-backed surfaces —
      and the flip rewrites the steps (§ What this work unit lands).
    - **The explicit persist steps name an `arc` verb, never `git`.** Each persist is `arc save`, which writes back the
      checkout's pending edits at once and returns the store version — a named point in history carrying the per-write
      message (C1). A ceremony that also changes tracked files keeps a commit step for them.
    - **Implicit write-back after the flip.** The projection, not the contract, writes back pending edits at the start
      of every `arc` command in the checkout, beside the refresh it already runs there; before the flip there is no
      projection, so no extra commits. It covers the work unit's files and the user surfaces — drafts, specs, notes,
      companions, and, in the owning checkout, the meta and task list. Their family parsers accept a hand edit and
      refuse, reporting it, a change to a field only a verb may set, such as the meta's `State` or a task's completion
      (C5); which fields a verb owns is each family's field schema (C2), `storage-seam`'s. A file that fails to parse is
      skipped and reported, never blocking the command. Persisting is local and cheap; pushing stays coarse and batched
      (C5).
    - **Approval.** After the flip a persist is a save, not a commit under the review-increment invariant: the gates
      stay on lifecycle transitions, stage advances, task closes, and code commits. Precedent: today's notes writes are
      Git commits too, and they run under the configurable sync interlock at handoff, not a per-commit review gate. The
      documentation pass rewords the invariant to say so, carefully and no further: the invariant's broader loosening
      into a tunable default belongs to `commit-increments` and `unit-scoped-review` (`approval-flow-refinement`).
      Before the flip the steps are today's commits, behind today's gates.
    - **Name:** `arc save`, arriving at the flip and replacing `arc user save`, which retires with notes then.
    - Until the flip tasks are ticked by hand and the task list rides its code commit; from it, the list's other edits
      persist by write-back, and the close verb closes tasks and captures the increment's commits (C5).
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
    - **Requirement** (Owner, 2026-09-29): the state remote is designated per clone, as Git's `remote.pushDefault` is.
      It is designated without asking only when the remote that holds this project's state is the one the clone pushes
      code to, and `arc init` designates it at creation. A fork whose upstream holds the project's state asks once
      whether the person pushes state there or only reads it, and the answer sets the role too — push for a team member,
      read for a contributor. A run that cannot ask, CI included, stays read-only until a remote is designated. A lone
      remote is never designated by default, since a fork contributor's lone remote is usually their public fork. Where
      the setting lives is `config-storage-architecture`'s call.
- **Decided** (Owner, 2026-09-25 and 2026-09-29): contributors from forks of a project that uses ARC need no upstream
  state — they run ARC on local-only and read public upstream state by fetching it; contributing to a project that does
  not use ARC is ghost mode (C8). The upstream's tracked configuration applies to the contributor, and its state stays
  the maintainers'. As on a host, where outside contributors open pull requests and leave labels, milestones, and
  boards to the maintainers, the pull request is the whole contribution. It carries the spec through the export (C10),
  which the upstream's own configuration chose, so the copy crosses no surface boundary (C8). Push rights make a
  contributor a team member.
    - A contributor reads upstream state by fetching it into a read-only namespace, as Git keeps remote-tracking refs,
      and never merges it into their own store. It is one more read-only source (C11), read through `arc` rather than
      projected into the contributor's `.arc/backlog/`, so their working copy stays their own and holds no file that can
      never be saved. The clone takes the upstream's project ID (below), and private or absent upstream state degrades
      as the CI Requirement below says.
    - A team member who works from a fork points the state remote at the upstream, pushing code to the fork and state
      to the upstream. `--atomic` cannot span two remotes, so C5's order applies — code first, state second.
    - The contributor role's separate layout retires. Its user-scoped active root exists because the tracked `active/`
      was one shared, protected folder. After the cutover a contributor's work unit is an ordinary record in their own
      store, local-only unless they designate a remote — a private backing repository carries it across machines — and
      the protected-path hook check goes with its row. The `contributor-path` register row carries the retirement (PR
      #743), and `contributor-path`'s open question of who creates a contributor's meta falls away.
    - The removal handshake is `contributor-path`'s, routed at draft close: the owner's candidate-tail cleanup deletes
      the export's copy before merge (C10), but a maintainer merges a fork's pull request. The merge gate refuses a
      merge that outruns the cleanup (C10), so the copy never reaches the base branch where the gate is installed.
      `contributor-path` owns the contribution's ceremony — fork, pull request, merge — and designs the handshake, the
      contributor's cleanup following the maintainer's approval without a round trip.
- **Decided** (Owner, 2026-09-25 and 2026-09-29): protected state is an opt-in mode, not the default, and deferred
  (C14), home `protected-state`, whose draft carries these options. No tested host's branch rules reach `refs/arc/*`,
  and GitHub rulesets refuse the pattern outright (`Invalid target patterns: 'refs/arc/**'`). The default stays
  `refs/arc/*` with tamper evidence. Options:
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
    - this draft names ghost mode as a requirement;
    - the contract makes the tracked-versus-stored assignment per family layout data, with standard and ghost
      profiles (C2), and the design is checked by walking ghost mode through it;
    - the siblings build the storage half at near-zero extra cost: local-only or a designated state remote (C7), each in
      a separate Git directory (C3), and an exclude-only ignore variant with an untracked `.ignore`, which ripgrep reads
      whether or not it is tracked;
    - `ghost-mode`, a core follow-on minted at draft close (PR #746), builds the rest — the install profile, the footer
      policy, and harness bootstrap without tracked files. Its only edge is the cutover, so it runs in the first
      post-cutover slot.
    - `ghost-mode` also holds the footprint inventory, as its first open item: every trace ARC leaves in a repository or
      on a host, each with its ghost-mode answer or an owner — ARC core and project machinery under `.arc/system/`;
      constitutional documents; harness files (`CLAUDE.md`, `AGENTS.md`, `.claude/`); the tracked root `.ignore`; the
      `.gitignore` entry; `Context:` footers, the `Arc-Maintenance:` trailer, and the `Review disposition set` body;
      pull-request titles and bodies; review comments, replies, and dismissals; check and status text; editor
      settings; commit and branch conventions; Git hook installation; the state remote.
- **Carried from the `arc-backend` design** (its store link settled in C1): traceability inversion makes a
  zero-footprint arm viable — rather than a code commit advertising its task, the task record captures the increment
  commit, and `arc` resolves the link in both directions for anyone with store access. The footer validator resolves
  artifacts through the injected resolver seam and degrades gracefully when state is absent.
- **Decided** (Owner, 2026-09-29): ARC leaves nothing in code commit messages by default, superseding the carried
  default that kept footers. A project may opt in to one trailer that renders the task attribution the store already
  holds (C1), on task commits only; the ghost profile never carries it. Every other `Context:` kind leaves code commits:
  the lifecycle and planning kinds go with state, an Errand's identity is a store link, and `standalone` has nothing
  left to say. Framework vocabulary on every commit is the outlier — the trailers teams accept are shared standards
  (`Signed-off-by`, `Co-authored-by`, `Fixes`) or tracker keys the team chose — and it carries planning concerns into
  the code history a team shares, as pull-request bodies must not.
    - The default flips once the capture exists (C1, C5); until then footers stay as they are. The footer policy — the
      trailer's form, `commit.context_footer`'s values and default, the commit hook, and `arc log` — belongs to
      `ghost-mode`, which holds the register's footer-grammar row (closed, PR #746).
    - The same principle reaches the `Review disposition set` body that `review-triage` puts on review fix commits, once
      review facts are stored (C2); it was routed at draft close to `review-activity-contracts`, the
      `review-protocol-alignment` member that designs that binding.
- **Decided** (Owner, 2026-09-29): the surface boundary, ARC-wide by default. Anything ARC writes, or has an agent
  write, to a surface people read without ARC — commit messages, pushed branch names, pull-request titles and bodies,
  review comments, replies, and dismissals, check and status text, release notes, and issues — reads as the change or
  event it describes. It carries no ARC vocabulary (work unit, Errand, Candidate, terminus, cohort, Owner acceptance,
  task IDs, lifecycle actions), no reference to an ARC artifact, and no ARC process concern. Ghost mode fails if
  anything crosses it, and ARC has no business crossing it by default either; a project opts in to ARC vocabulary on its
  own surfaces. The footer decision above is one case of it, and the footprint inventory covers the host's surfaces as
  well as the repository's.
    - Leaks come from both sides. ARC's code composes some: delivery's pull-request body names the design by its
      `draft-*` filename (`lib/delivery/materialization.ts`). Agents compose the rest, often in well-meant prose — a
      stale hosted review dismissed with a note about Owner acceptance that no reader of the pull request can place.
    - Subject matter is not a leak: a change to ARC's own Errand code says "Errand" in this repository, as any project
      names its own domain. The boundary governs ARC's process, not a project's vocabulary. This repository, where ARC
      is both the subject and the process, needs a self-hosting distinction, as it does elsewhere.
    - `DEV-RULES.ARC` § Commit and PR surface language states half of it today; it still admits backticked ARC artifact
      references and routes traceability to the footer.
- **Decided** (Owner, 2026-09-29): `ghost-mode` makes it true, and records it as an ADR, since it outlives this
  program. It inventories every path where ARC's code writes to such a surface and fixes each at the source, with
  tests over what it composes; rewrites the rule as the boundary; and checks agent-composed text where ARC mediates it —
  the commit hook, and the verbs that post to a host — knowing a check over prose catches the common terms, never all of
  them.
    - The pull-request body fix has an input ready: the Release Notes Entry, which `integrate-work-unit` already writes
      free of ARC vocabulary by rule (C10).
- **Named cost:** with the user directory excluded rather than gitignored, packaging tools that read only
  `.gitignore` could pack it; a contributor rarely publishes, but the cost stays named.
- **Decided** (Owner, 2026-09-29): an install profile chosen at init, not a runtime configuration axis
  (`strategy-storage-evolution.md` Principle 9). C2 names the two profiles and keeps every reader above the contract and
  the projection blind to them. The profile is a fact of the install, not a setting: standard when ARC's configuration
  is tracked in the repository, ghost when it lives in the store behind the per-machine pointer (C14). ARC reads which
  by looking, so no `storage.profile` key can disagree with the repository. Only the contract, the projection, init,
  and the commit policy consult it.
    - Switching re-runs init with the other profile; no verb of its own. State does not move, since the families are
      the same under both (C2). Ghost to standard is the trial becoming adoption: one reviewed change commits ARC's
      machinery and configuration, the per-machine pointer retires, and the export default becomes `specs`. Standard to
      ghost is the reverse, one change removing the tracked files.
    - It passes Principle 9 as one axis with two values. It is not a backend's property — ghost runs local-only or with
      a designated state remote, standard on any backend, and the migrate verb moves state between backends under
      either (C3, C7) — and ghost pins the settings it touches (the export at `none`, no task trailer) rather than
      multiplying combinations.
    - Tracked configuration wins when a ghost install meets it — the upstream adopts ARC, or the person clones an ARC
      project where they ran ghost. Git treats excluded files as expendable, so the pull replaces the projected files on
      disk. ARC says so, the person's work-unit records stay in the store, and they continue as a contributor (C7) or a
      team member; their stored configuration retires after ARC reports where it differs from the upstream's, so no
      local override is lost silently.
    - Core, built by `ghost-mode`, which owns the install profile.

### C9. Unsynced work outside ARC

- **Decided** (ADR-035 risks): ARC's teardown persists first and refuses while a projected file is unadopted or held
  by a conflict.
- **Decided** (Owner, 2026-09-29): lock each worktree ARC spawns (`git worktree lock`), which makes a plain
  `git worktree remove` refuse, and a single `-f` too, until the lock is lifted or `-f` is given twice (checked with
  Git 2.55). Designed here; `storage-projection` builds it. `git clean -x` has no hook, so firing-point frequency
  bounds what it can lose.

### C10. Integration-time record and the export knob

- **Decided** (ADR-035 item 4, amended by PR #743; Owner, 2026-09-29): `storage.track_design_docs: none | specs`
  exports authored design into the code repository as a one-way copy; the default is below. The strategy's knob line
  offered `none | specs | all`, default `none`, and leaned toward `none | all`, calling `specs` the costliest arm since
  a work unit's artifacts then live in two places. `specs` is the stated purpose — teams that review specs alongside
  code — and a one-way copy leaves the store complete under every option, so publishing the spec while the working
  documents stay stored splits nothing a reader needs; design-doc cultures publish the document, not its scratch. `all`
  has no purpose of its own: pull-request-reviewed planning is a backend's (`strategy-storage-evolution.md`), and it
  would put drafts, notes, and review evidence — working documents — in the code repository, against C8. The
  strategy's knob line takes the change (C13).
- **Decided** (Owner, 2026-09-29): the export is a copy for review only. It adds the spec to the work unit's branch at
  prepublication, so the spec sits in the pull request's diff where reviewers comment on it line by line; a finding that
  amends the spec edits the stored spec and re-exports it as an ordinary reviewed fix; and integration's candidate-tail
  cleanup deletes it before merge. The store and its projection stay the spec's only lasting home, so a shipped spec
  lives in `completed/` and nowhere else. The review is the one audience the export serves: teammates who use ARC read
  shipped specs through the projection and reach one from a commit through `lookup` (C1); teammates who do not either
  keep no specs or keep their own, which the person composes with outside this setting; and contributors and readers of
  a merged pull request see no other ARC state either.
    - **Named cost:** the merged record loses the spec. A squash merge keeps no trace of it, a merge commit keeps it in
      the branch's history, and a rebase merge lands both the add and the delete on the base branch; the merged pull
      request shows the spec's review comments as outdated.
- **Decided** (Owner, 2026-09-29): the integration-time record is never tracked. The retired `meta-file-tracking-model`
  draft's option β composed one — the meta's governance fields, its Release Notes Entry, and its Completion Notes — as
  the audit anchor in tracked history. After the cutover the stored meta in its quarter's archive ref, with its
  `history`, is the durable record, C1's landing-commit link is the anchor, no tracked archive reader survives (the
  archive-index and branch-tree-reader rows), and C8 rules out a tracked ARC record by default. ADR-035 item 4 left this
  to the contract, so it takes no amendment.
- **Decided** (Owner, 2026-09-29): the readiness facts (`scripts/review-gate/readiness.ts`) and the integration
  checkpoint read Completion Notes and the Release Notes Entry from the stored meta under every option. They decide, so
  they never read the export, and nothing in them waits on this item.
- **Decided** (Owner, 2026-09-29): the copy lives at `.arc/specs/<slug>/`, disjoint from every projected path. The
  folder exists only on a work unit's branch, from prepublication to the candidate-tail, and never in the base branch's
  tree; each work unit in review carries its own.
- **Requirement** (Owner, 2026-09-29): the export writes only at points the lifecycle already has, each ceremony
  committing it on the branch: the add at prepublication, before the review subject is fixed, since export is design's
  one route into it (C2); a re-export as a reviewed fix; and the delete in the candidate-tail, which the
  provisional-candidate exception already names as cleanup. The delete must not reopen review, so the
  lifecycle-classification row keeps one narrow arm, for the export path, past the cutover. Nothing exports at a firing
  point, which would let a work unit's own writes move its head again (the singleton publication-boundary row).
- **Requirement** (Owner, 2026-09-29): the copy is one-way: the next export overwrites a hand-edited copy and reports
  that it did, and nothing reads the copy back.
- **Requirement** (Owner, 2026-09-29): ARC's merge gate guards the removal. While a pull request's tree holds
  `.arc/specs/`, the required `merge-ok` check fails, saying that the spec's review copy leaves before merge and how to
  remove it; the classification's narrow export arm already reads the path. It stops any merge that outruns the
  candidate-tail cleanup — a teammate merging in the host's interface, or a maintainer merging a fork's pull request
  (C7) — and it ships with the export, as core.
    - **Named cost:** `merge-ok` reads red through review until the cleanup runs. A pending status would read better,
      but posting one takes a token that can write, and CI on a fork's pull request runs with a read-only one; under
      `merge.lock: draft` the pull request is a draft through review anyway. Where no merge gate is installed, an early
      merge leaves the copy on the base branch, and removing it is an ordinary change.
- **Decided** (Owner, 2026-09-29): the export is core (C14). At 1.0 it is the only way a team that reviews in pull
  requests sees the design.
- **Decided** (Owner, 2026-09-29): the default is `specs` under the standard profile; the ghost profile pins `none`
  (C2). The spec is the contract the pull request fulfills, so every reviewer, hosted ones included, needs it beside the
  code, and today it is there, in the diff; a `none` default would quietly take it out of review. It holds the line the
  store draws: drafts, notes, and task lists are working state that churns, while a spec settles before the code starts
  and rarely moves after. C8 governs text on surfaces read without ARC; the standard profile already tracks ARC's
  machinery, and an exported spec meets the reader standard below, so the spec in the diff is content rather than
  process vocabulary — unlike a footer, which would stamp every commit.
    - **Named cost:** every standard-profile pull request carries the spec during review and ends with the delete, which
      moves the head after review — on a host set to dismiss approvals on new commits, reviewers approve again. Guided
      init says plainly what turning it off does.
- **Decided** (Owner, 2026-09-29): a spec meets a reader standard — written for whoever checks the change against it.
  Process metadata stays in its header. The body uses the project's own vocabulary and cites no other work unit,
  register row, or planning artifact, its own work unit's draft and notes included; a scope boundary says what the
  change does not do, not who does it; and a concept it relies on is defined in the spec or cited from shipped code or
  documentation. Context that needs the planning record — coordination, provenance, internal rationale — lives in the
  draft or the work unit's `notes-*`, which the draft and the task list may cite. ARC vocabulary in the body is subject
  matter only, as in this repository.
    - It pays off without the export: a spec outlives its planning context, and the session that executes it reads it
      cold. So it belongs to spec authoring, not storage, and is captured in `USER-INBOX` to land on its own, ahead of
      the program. In the latest archive quarter, 11 of 12 sampled specs name other work units in the body, up to 32
      times, and 11 of 40 cite a draft or notes file.
- **Decided** (Owner, 2026-09-29): an option that keeps shipped specs in the repository is deferred (C14). Nobody needs
  it: teammates who use ARC already have the spec, teammates who do not keep no specs or keep their own, and outsiders
  are owed no ARC state. Tripwire: a team asks to read shipped specs in the repository. If it is built, the spec moves
  into the repository at publication rather than being copied, since a lasting copy duplicates the store and drifts from
  it, and it lives at `.arc/reference/specs/<slug>/`, beside the ADRs.

### C11. Framework core from the package

- **Requirement** (`framework-core-from-package` runs after the cutover): the projection takes more than one source
  — the store now, the package later — and supports read-only copies; the ignore strategy works from a path list that
  `.arc/system/` paths can join; readers load core by its `.arc/` path, never by whether it is tracked; the tracked
  line sits at project-owned machinery, not all of `system/`.
- **Requirement** (C2's profiles): the ghost profile projects ARC core read-only from the installed package, so
  `ghost-mode` needs this projection — landed first by `framework-core-from-package`, or built by `ghost-mode`
  itself.

### C12. History policy and planning branches

- **Decided** (ADR-035 item 8): Git notes retire through a one-time import.
- **Decided** (ADR-035 items 9 and 10): once notes retire, `history.policy: rewrite-with-lease | append-only`,
  default `rewrite-with-lease`, with `append-only` opt-in for teams that prefer fixup-then-squash review or branches
  several people push to — the idiom turns on who pushes to a branch, not team size. Supersession detection
  (`lib/git/supersession.ts`) stays as the safety net once rewrites are allowed, alongside `chunked-delivery`'s rebase
  freedom for stateless review refs. `history-policy` builds it (C14).
- **Decided** (Owner, 2026-09-29): branchless planning, designed here and built by `storage-seam` as it rewrites the
  lifecycle and locus consumers: 29 source files carry `plan/`, nearly all of them files the seam rewrites, so a later
  separate change would rewrite them twice. Planning branches existed to carry tracked planning commits, to isolate each
  work unit's files, to defer the work type to activation, and — ADR-035's leftover reason — to anchor locus topology
  until in-flight derivation reads the store. The store, the projection's `current/` folder, and in-flight derivation
  over the store remove all four, which leaves a branch that never takes a commit: a label. Conventional Branch names
  carry the work type for a branch's whole life, and mainstream practice keeps status in the tracker. ADR-035 item 10
  carries the amendment (PR #743), replacing its zero-commit planning anchors, and the register's planning-branch
  reaping gap closes with it.
    - A work unit in planning keeps its own worktree, since its meta and task list write only from the owning checkout
      (C6), detached at the base branch's tip. The marker names the work unit, and locus derivation reads the marker and
      the store.
    - Catching up with base re-detaches at the new tip. It refuses while the worktree holds commits not on base, so a
      stray commit is never dropped silently.
    - Activation creates the work branch at base's tip in the same worktree.
    - It takes effect at the flip; until then planning keeps `plan/` branches, since a planning work unit's records
      are tracked files its commits carry on the checkout's branch (§ What this work unit lands).
    - The `plan/` prefix, the orphan sweep's planning arm, and branch reaping at abandon, retire, and teardown retire. A
      planning spike that needs commits takes its own branch.
    - **Named cost:** branch names stop showing which work units are in planning. Worktree lists still show every work
      unit by its `<repo>.<slug>` path, planning ones detached; branch pickers lose them; `status-hud` is the idiomatic
      replacement. Git's refusal to check out one branch in two worktrees no longer guards a work unit's locus; the
      marker's exclusivity, which already decides it, does.
    - Not included: planning with no worktree of its own. Nothing here precludes it.

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
    - **Decided** (Owner, 2026-09-30): this work unit writes the revision at create-spec, since it is the strategy
      catching up with this draft and the siblings read the strategy.
    - The revision also closes § Contract Design Touchpoints' "rotation cadence and a wider delta window are open" (C3).
    - It also takes C10's export options, `none | specs`, in place of the knob line's "consider `none | all`", C10's
      default, `specs` under the standard profile, in place of "Default `none`", and the one-way copy as a copy for
      review only, deleted before merge.
- **Decided** (Owner, 2026-09-30): the final shape over today's. Existing procedure and its vocabulary — verb names,
  workflow steps, a ceremony's order — are open to change wherever the program touches them, and keeping today's shape
  is never a reason by itself; what holds is that nothing breaks at any point along the way. Every procedure the
  program rewrites or reworks is checked against `strategy-procedure-evolution.md`'s Self-Check: deterministic logic in
  the CLI, verbs over mechanics, no state evaluated in prose, and emitted text composed by the CLI. The cohort document
  takes this for the whole program, a pending amendment.
- **Carried:** an Open Knowledge Format (OKF) projection stays an optional target off the record layer — the
  knowledge layer, never operational churn; owned with `idiomatic-alignment`.

### C14. Core or deferred

- **Requirement** (Owner, 2026-09-24): tag every program item. 1.0 ships the complete core for solo developers
  through mid-size teams; larger scale — hundreds of writers, per-record authorization — follows through the service
  backend and is never precluded.
- **Decided** (Owner, 2026-09-29): ghost mode is core; `ghost-mode` builds its non-storage half.
- **Decided** (Owner, 2026-09-29): rotation is deferred (C3); its growth tripwire and the reserved continuation link are
  core.
- **Decided** (Owner, 2026-09-29): the review-only design-doc export is core; keeping shipped specs in the repository is
  deferred behind its tripwire (C10).
- **Decided** (Owner, 2026-09-29): core, beyond ghost mode and the export — the five members; history policy on (ADR-035
  items 9 and 10), since deferring it keeps an append-only rule nothing justifies once notes retire, built by
  `history-policy`, minted planned at draft close, because the cutover flips the rule (the append-only row) but the
  lease-guarded catch-up with base had no owner; the backing-repository backend, built by `storage-ref-backend`, which
  already takes the state remote as a parameter (C7) and has C5's ordered two-remote push — without it a solo developer
  with a public repository and two machines chooses between public personal state and no sync; the migrate verb;
  branchless planning (C12); the record-aware seam (C2); and `framework-core-from-package`'s read-only package
  projection, which ghost mode needs (C2, C11).
- **Decided** (Owner, 2026-09-29): deferred, each never precluded and each with a home:
    - the rest of `framework-core-from-package` — the standard profile keeps ARC core tracked (C2);
    - `operational-state-docs`'s user-surface residue (C2);
    - `delivery-observe-attest` — the seam reroutes delivery's records, so shipped stacked delivery keeps working; the
      delivery stabilization cut may still pull it in on delivery's own grounds;
    - `status-hud` — the storage program does not need it;
    - the query cache (C2) — raw reads are fast (601 metas in 17 ms), and it is derived, never the authority. Tripwire:
      a read path exceeds its latency budget, or a live view needs queries across fields. Home: `query-cache`, minted
      provisional at draft close;
    - protected state (C7) — tamper evidence and every clone as a backup are core. Tripwire: a team requires
      host-enforced protection of shared state. Home: `protected-state`, minted provisional at draft close;
    - the service backend, per-record authorization, and very high write parallelism (C13) — home
      `arc-coordination-service`;
    - the OKF projection (C13) — home `idiomatic-alignment`;
    - a shipped import — nothing needs importing before public release, so `storage-ref-backend` may build a one-off.
- **Decided** (Owner, 2026-09-29): fork contributors (C7). Core: the state remote's designation rule, the upstream as a
  read-only source, and the two-remote push order — pieces `storage-ref-backend` already builds. One designation answer
  sets a contributor's role, so no contributor verb is needed. Deferred, home `contributor-path`: the contribution's
  ceremony and tooling, and the export's removal handshake.
- **Requirement:** ghost mode's configuration pointer (C7) needs a per-machine configuration tier;
  `config-storage-architecture`'s `.local/` tier is the natural provider, and `ghost-mode` records it as coordination
  rather than an edge, since its only edge is the cutover.

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
roadmap, and user sync — the map names its readers and writers, the contract operations each uses, and what each
storage-shaped mechanism becomes. The known rewrites are in-flight derivation, the lifecycle executor's write path
and `arc start` placement, the archive index, ROADMAP rendering, the notes-related session-init probes, and locus
derivation.

The map is `storage-seam`'s design core. That work unit decomposes against it when this one's planning closes, and
its members inherit it rather than redesigning their subsystem.

- **Requirement:** the session-init envelope is a consumer, and the locus and session-init reads stay narrow —
  through the contract, without reshaping the prose conditionals the session-init agenda (`composable-workflows`)
  will replace.
- **Requirement:** every file two seam partitions both touch (`handlers/status.ts` among them) is marked, so parallel
  members do not collide and rework.

- **Decided** (Owner, 2026-09-29): the map's shape.
    - Home: the inventory lives in `notes-storage-contract.md`; this section keeps the design layer — partitions,
      columns, the operations the map exercises, the rules for files two partitions share, and each decision the map
      raises. `cli-substrate-complete-migration`'s residual matrix is the precedent for the split.
    - Grain: one row per module, command, workflow, method, hook, or script, never per call site; line-level detail
      stays in that work unit's notes.
    - Columns: consumer, partition, owner (when not `storage-seam`), register rows, families (C2), operations (C1),
      store or projection (a deciding verb reads the store), what it becomes, and the partitions it shares a file with.
    - Partitions: the six named above; the owner column carries consumers that `storage-cutover`,
      `storage-ref-backend`, or `storage-projection` owns without making them seam partitions.
    - Method: seeded from the existing inventories — the sibling's carved-module predicates, session-envelope slots,
      and state-path recount; the placement readers; and every register row `storage-seam` owns — then swept for gaps
      by read-only sweepers per partition plus one for workflows, methods, hooks, and scripts, which no inventory
      covers. Every row is checked against source before it lands.
    - The map raises, never settles: a file two partitions both rewrite, a member whose rewrite needs another's first,
      a consumer needing an operation outside C1's set, and which readers must read the store — the readers C5's
      freshness rule governs.

Inputs from `coupling-blast-radius-audit` (2026-07-18), each ranked abstract and high-volatility:

- **Address and artifact-family assumptions** — `arc-root`, `draft-prefix`, `meta-prefix`, `notes-prefix`,
  `spec-prefix`, `tasks-prefix`, and `typed-branch-prefixes`. The prefixes are the family list's first draft (C2).
  Packet `packet-edfd7344100348f1f6b6659c`, content digest
  `27b88f2bb84fff4f90e0618c018c76fb64f8ad9c4031e2f957b7cd38da609f7a`; `scan-result.json#class-*` anchors.
- **Placement readers** — `active-placement`, `completed-placement`, `planned-placement`, and
  `provisional-placement` reach 55 code reader and parser files; the extract's `reportInputs.placementReaders`
  enumerates them for the lifecycle and in-flight partition. Packet `packet-188c5fab90090e83fdbc4591`, content digest
  `528515469ff26c720e1d7a0643eaebbebf81d4c99b7c9b640b75479d0da38ae5`.

- **Result** (2026-09-29): 314 consumers, inventoried in `notes-storage-contract.md` with how they were swept and
  verified — lifecycle and in-flight 128, locus and session-init 54, user sync 44, delivery 32, review and evidence 29,
  status and roadmap 27. `storage-seam` owns 201 of them, `storage-cutover` removes 81, and the rest belong to the ref
  backend, the projection, and the delivery follow-ons. 209 decide something and so read the store — 12 of them also
  browse — which are the readers C5's freshness rule governs. Every operation the map needs is in C1's set, once the
  state version and the batch write it surfaced were added there. Verification fell short of the Method's bar: every
  row's evidence was checked against source, but its classifications — owner, operations, and store or projection — were
  spot-checked rather than re-derived, so each seam member re-verifies its rows before building on them.
  `lib/errand/record.ts` joined after the sweep, from `cli-substrate-complete-migration`'s verification, with three of
  its consumers gaining the Errand identity family. Twelve consumers the sweep missed joined at the fifth and sixth
  adversarial passes (2026-09-30) — ROADMAP writers and checkers, and the drain's write-context check — with register
  row 18 then marked on every row that writes, renders, or checks the stored ROADMAP.
- **Decided** (Owner, 2026-09-29): no foundation member. Shared work splits by kind.
    - Here, in the in-repo implementation: the current-work-unit resolver and the lifecycle index keyed by identity —
      `resolveActiveWu` has 23 call sites in 14 files across at least four partitions — and the store behind delivery's
      `IntegrationLifecycleStoragePort`, which already takes `readSnapshot` → `{ version, fs }`. They define what every
      member calls, so the parallelism rule puts them here.
    - As Errands, after `cli-substrate-complete-migration` lands and before `storage-seam` starts: pure refactors that
      split files two or more partitions rewrite along the map's partition lines — `handlers/status.ts` (four
      partitions), `handlers/lifecycle.ts`, `handlers/review.ts`, `lib/work-unit/executor-context.ts`, and
      `scripts/review-gate/readiness.ts`. They record no design and land while this work unit is still planning; one
      that proves too large becomes a review chunk here. They fix the partition lines before the seam decomposes, which
      its members inherit from this map anyway.
    - `lib/user-surfaces.ts`, imported by 16 modules, keeps a resolver shim that `storage-projection` owns with its
      register row, so members move off it independently.
    - A foundation member first in the seam was weighed. It keeps this work unit smaller but costs the same critical
      path plus a member's planning, review, and integration, and its children would depend on a sibling. The collision
      that argued for it — `cli-substrate-complete-migration` editing the same files — clears before this work unit
      writes code.
- **Ordering the seam's decomposition inherits:**
    - Lifecycle's in-flight derivation (`lib/git/in-flight-derivation.ts`) and locus's worktree roster and evidence are
      rewritten together; the session-init slot schemas that expose derivation marks are locus's.
    - Removing the stored ROADMAP takes effect at the flip (§ What this work unit lands) and runs in order: every code
      path that writes, renders, or checks it — the inventory's rows under register row 18 — stops on the capability,
      the flip's workflow rewrite drops the hand-render steps and their refresh commits, and cutover's deletion pass
      removes those arms with the pre-commit assert, the conflict remedy, and the merge driver.
    - The inbox writer's lock moves to per-ref write serialization (C1) before the notes-lock code is deleted.
    - Planning-lane deletion and the Candidate and boundary store swap both edit `handlers/review.ts`; its split comes
      first, or they serialize.
    - Other machines' pushed in-flight work stays visible throughout — through remote branch refs over the in-repo
      implementation, which the seam routes onto first so no member waits, and through the store once
      `storage-ref-backend` syncs.
- **Slot paths.** Session-init slots — `active.path`, the frame's meta and task-list paths, load-set entries, and
  `currentWuReconcile`'s command — and the compaction seed carry literal `.arc/active/meta-<slug>.md` paths that
  workflows read, and recovery and the seed emitter pin them by regular expression. They come from the layout resolver
  before `active/current/` lands (C6), and the seed's schema version bumps.
- **A protocol that retires as a class at the flip:** writing a tracked record and then staging it with `git add` —
  about fifteen lifecycle files, seven review writers, and delivery's Candidate and boundary writers — ahead of the
  `commit-boundary`, `commit-selection`, and `candidate-publication-commit-required` next actions, strict enums the
  workflows consume. Until the flip they stay as today; the inventory's rows state each consumer's end state.
- **Decided consumer changes** (C4):
    - **User sync — `arc user inbox-remove`** matches its entry on the title and recomputes the digest under its lock.
      From the flip it keys by the entry's `_Id:_`, since a title repeats exactly as a slug does, and removes only the
      entry version its caller names; the drain's step passes both, read through the listing verb (C4; § What this
      work unit lands).
    - **Session-init envelope** — orientation carries the current work unit's pending inbound count, so another
      session's append is not silent until the next planning iteration.
    - **The drain (`drain-inbox`)** — routes into an in-flight work unit's inbound list directly from the flip, so
      in-flight owner adoption and its `_Hold` re-stamp retire. The `## Inbound Buffer — Pending Integration` section
      the drain adds to a draft (the draft template has none), and create-spec's and `assess-draft-readiness`'s checks
      for it, move to the inbound kind.

## The storage-coupling register

Draft-design completed the register in `cohort-state-storage.md`. The re-cut seeded its known rows; the sweep ran
across code, rules, strategies, workflows, backlog drafts, ADRs, `WORKING-MEMORY`, and `USER-INBOX`, looking for
mechanisms shaped by tracked or notes-backed state rather than for state by size.

- **Route** (Owner, 2026-09-29): candidates are verified against source here; settled amendments land on `main` in
  batches through the planning-grooming lane, so siblings and `cli-substrate-complete-migration` read current rows. A
  batch that amends an ADR is not plain planning and takes the reviewed lane.
- **Row identity is preserved.** `cli-substrate-complete-migration`'s residual matrix cites rows by key (`R-NS`,
  `R-BR`, `R-LOCK`, and others): amend a row's fate text or add rows, never rename or remove one it cites.
- **Grain.** The register names mechanisms; instances go to the consumer map.
- **Landed on `main`,** 85 rows; the consumer map may add rows:
    - PR #738 (2026-09-29) — the sweep's verified results, taking the register from 42 rows to 79;
    - PR #742 (2026-09-29) — six fates amended from C2, C3, C4, and C6, two rows added (personal subdirectories, and
      hold-and-route), ADR-035's dated amendment for the work-unit write rule and slug claims, and the
      `active-layout-nesting` stub retired with its row closed — 81 rows;
    - PR #743 (2026-09-29) — corrections from the consumer map's verification, four rows added (machine-local state
      under `.git/arc/`, `arc view`, literal meta paths, and the errata convention), fates amended for the footer
      policy, the Errand branch's UID suffix, the review copy's classification arm, planning-branch retirement, the
      contributor scope (on the existing `contributor-path` row), and draft-close routing; the follow-ons tagged core
      or deferred with homes; ADR-035's dated amendments for items 2 (including the push order without a typed
      repair), 4, and 10; and ADR-022's file-as-record amendment, with its flip moved to `storage-seam`'s kickoff — 85
      rows;
    - PR #746 (2026-09-30), at draft close — the Errand-ref row names its reader, `lib/errand/identity-snapshot.ts`'s
      tip, tree, and blob acquisition with `lib/errand/record.ts`'s in-flight indexes and their fetched variant, and
      moves that acquisition behind the contract's `list`, `read`, and `sync` while its consumers keep what C1's
      listing requirement names — from `cli-substrate-complete-migration`'s verification, without widening that work
      unit's register cutoff; the append-only row names `history-policy`; the footer-grammar row passes to
      `ghost-mode` and closes; the cohort's follow-on list names `ghost-mode`; and the four follow-on stubs are minted,
      `ghost-mode` and `history-policy` planned and core, `query-cache` and `protected-state` provisional and deferred.
- **Routed at draft close** (2026-09-30), as `USER-INBOX` captures under the coordination-seam rule; the captures are
  the record:
    - sixteen notes for the next planning of a work unit whose plan assumes tracked or notes-backed state but needs no
      register row — `composable-workflows`, `review-durability-hardening`, `decompose-scaling`,
      `customization-arch-realign`, `frictionless-capture`, `errand-promotion-concurrency`, `cold-start-init-polish`,
      `cross-wu-coordination`, `naming-conventions`, `knowledge-architecture`, `operational-advisory-registers`,
      `adopter-content-aware-ci`, `arc-coordination-service`, `docs-content-sweep`, `wu5-public-release`, and
      `operational-state-docs`' re-scope (C2);
    - `operational-state-docs`' inbound buffer, entry by entry — what stays, what moves to `storage-seam` or another
      home, and what closes (C2);
    - `storage-seam` — flip ADR-022 to Accepted as its first action, since it builds the family parsers (C2);
    - `contributor-path` — the contribution's ceremony and the export's removal handshake (C7);
    - `scalable-core` — the coupling audit's team-mode key finding (37 files; `packet-dbd2103ffa3c4df953f89138`,
      content digest `19fc5ffc96617197821f46c35951b913f47505460d875747925d9896bbc2d042`, `team-mode-key`): team mode
      is not a storage axis (Principle 7), so the rename's access and compatibility seam is that unit's;
    - `review-activity-contracts` — the review disposition set binds to the stored review fact (C8);
    - `history-policy` — the catch-up with base remaps the close verb's captures from its old-to-new mapping (C5);
    - `storage-cutover` — the rehearsal drives a work unit end to end through the rewritten workflows, and quiesce
      reaches every live session holding today's workflow text (§ What this work unit lands, C13);
    - `storage-ref-backend` — the import derives captures for commits before the flip from their footers, and stamps
      every inbox entry's `_Id:_` (C4, C5);
    - the cohort document — the pending amendments: the workflow-steps row rewritten at the flip, the record-writes and
      committability rows' flip timing, and the program-wide rule that the final shape wins over today's (C13).
- **Settled inputs:** `R-LOCK` (C1). The identity-wide `arc user add` bootstrap of `USER-INBOX` and `WORKING-MEMORY`
  has its `storage-seam` row: the command writes the identity's first records through the contract, keeping its input
  and adapter surface.

## Coordination with `cli-substrate-complete-migration`

That work unit is in flight in its own worktree and must land before `storage-seam` starts; this one does not wait on
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
- This draft before its consolidation, at `f0363abbe`, for how each decision was reached.

---
