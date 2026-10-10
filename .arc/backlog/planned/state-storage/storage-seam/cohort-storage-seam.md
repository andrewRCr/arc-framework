# Cohort: `storage-seam`

> _Identity and coordination record for this cohort. Membership is **derived** from each member's `Cohort`
> field — recorded here only as shared coordination, never as a roster or status table._

**Parent:** state-storage

**Purpose:** Route every ARC reader and writer of operational and planning state through the storage contract, running
on its in-repo implementation over today's substrates, so the ref backend later replaces that implementation with
nothing above the contract changing. The members divide `storage-contract`'s consumer map by subsystem and close the
storage-coupling register rows `cohort-state-storage.md` gives `storage-seam`; they share one set of record kinds, built
first, and the decisions those kinds carry.

---

## Coordination

`storage-contract` landed one contract over today's three substrates, plus the three pieces every caller shares — the
current-work-unit resolver, the lifecycle index keyed by identity, and the store behind the integration checkpoint's
lifecycle port (its D9) — but rerouted no other caller. Every other reader and writer still reaches tracked files, Git
notes, and the transient-identity ref directly: work-unit state paths built by hand (36 lines in 19 files at
`7ddab4979`, key 13), Git-tree reads of lifecycle state, and stores constructed in place. Until those consumers go
through the contract, the ref backend and the projection cannot replace the in-repo implementation at the flip, and the
register's seam rows stay open. The consumer map gives the seam 212 of its rows.

```text
seam-record-kinds        the record kinds every other member writes or reads; ships first
├── seam-lifecycle       the transition write path
├── seam-decomposition   a cut as one multi-record batch
├── seam-delivery-review Candidate and review records
├── seam-locus           locus, in-flight derivation, session-init, and personal surfaces
└── seam-status-roadmap  ROADMAP, STATUS.USER, and the derived views
```

Each member's `Depends On` edges are the source of truth: every other member depends on `seam-record-kinds`, and
`storage-cutover` depends on all six. These orderings are not edges:

- **Design order (Owner, 2026-10-09).** The best sequence when attention allows; the Owner decides when each member
  starts. `seam-record-kinds` and `seam-lifecycle` design first; `seam-locus` starts when record kinds reaches
  `generate-tasks`; then `seam-delivery-review` and `seam-decomposition`; `seam-status-roadmap` designs after locus,
  whose in-flight model it renders. This order is coordination, never a `Depends On` edge, which clears only when its
  dependency ships.
- **The safety net.** Anything a member takes from a sibling that the shared decisions left open waits on the provider:
  the consumer drafts once the provider's draft settles it, and its spec is approved only after the provider's spec,
  with a re-read of what it consumes. This is stricter than the parent cohort's design-overlap rule, which holds back
  only implementation until the provider's spec is approved and asks no re-read: approving a consumer's spec against a
  provider spec not yet approved invites rework, and the re-read is cheap.

### Six members

Members inherit consumer-map rows rather than redesigning their subsystem, and re-derive line-level detail when they
plan. Counts are seam-owned rows in the landed map; the six rows added since `baa12bf98` each fall in a partition the
member already holds. Record kinds inherits none: it builds the kinds those rows consume.

| Member                                     | Rows | From the map's partitions                                               |
| ------------------------------------------ | ---- | ----------------------------------------------------------------------- |
| `seam-record-kinds`                        | —    | none of its own; the kinds the other members' rows consume              |
| `seam-lifecycle`                           | 79   | lifecycle and in-flight, less decomposition and in-flight derivation    |
| `seam-decomposition`                       | 19   | lifecycle and in-flight: `decompose-work-unit.md` and its modules       |
| `seam-delivery-review`                     | 35   | delivery; review and evidence                                           |
| `seam-locus`                               | 63   | locus and session-init; user sync; in-flight derivation from lifecycle  |
| `seam-status-roadmap`                      | 16   | status and roadmap                                                      |

- **Record kinds stand apart and ship first.** Lifecycle, decomposition, locus, and delivery all write records whose
  kinds items 1–8 of the shared decisions settle — the meta, task list, lineage, and cohort document — and status reads
  their parsed fields. Program work units land single-branch, so writers built inside lifecycle would hold every other
  member until lifecycle's 79 rows ship. Record kinds builds the kinds' parsers, field schemas, field writers, and write
  checks (§ Shared contracts, item 11); every other member's `Depends On` names it, and its schemas were settled before
  the cut, so it is small and determinate.
- **Two pairs of partitions merge.** Delivery (17 rows) and review (18) name each other under Shared with eight and nine
  times, and their records are one family in the contract's D5, delivery and review records. User sync (14 rows; 26 more
  are removed at cutover) is mostly entanglement with locus, whose rows name it under Shared with 16 times.
- **Decomposition stands alone.** It is a self-contained machine — `decompose-sweep.ts` and the `decompose-v3-*` and
  `git-decompose-v3-*` modules, with their own planner, conservation, topology, and finish logic — with its own
  register row (key 49), whose end state, a cut as one multi-record `batch`, is a design separate from per-verb
  lifecycle writes, and its own downstream re-scope (the `decompose-core-hardening` subcohort).
- **In-flight derivation goes to locus.** The contract's seam ordering has `lib/git/in-flight-derivation.ts` and the
  locus worktree roster and evidence rewritten together, and the session-init slots that expose derivation marks are
  locus's. Lifecycle keeps the transition write path; locus takes what is in flight and where. The rows that move are
  `in-flight-derivation.ts`, `transition-overlay.ts`, `commands/active/in-flight.ts`, `commands/active/roster.ts`,
  `handlers/active.ts`, and `in-flight-scope-check.md`; `composed-lifecycle-index.ts` stays with lifecycle.
- **Rejected:** one member per partition (two thin members over one family, and locus and user sync colliding on 16
  files); decomposition inside lifecycle (a 98-row member bundling a self-contained machine with the verbs); in-flight
  derivation in lifecycle (locus would wait on it before rebuilding its roster and evidence); the kinds inside lifecycle
  (every writing member would wait on its 79 rows), or each built by the first member needing it (ownership spread, and
  two members may build one writer).

### Shared contracts

The seam settled every decision more than one member consumes before the cut (Owner, 2026-10-09). Each item's owner
keeps it in its draft through its spec, and the list below points to it and its consumers, never the design itself. For
a record kind more than one member touches, the decisions settle only the fields that cross a member boundary — each
field's name, its value shape, the one verb that writes it, and who reads it; a field one member alone touches stays
with that member's planning. Already settled by the contract and not reopened: UIDs and aliases (A5, A11), branch links
(A3), the store's operations and versions, `StoreLifecycleStorage`, the layout resolver, identity resolution, and the
Errand record's schema.

1. **Which verb writes which field** — `seam-record-kinds`, whose field writers serve every member that writes a meta or
   task list — `seam-lifecycle`, `seam-decomposition`, `seam-locus`, and `seam-delivery-review` — while
   `seam-status-roadmap` reads the fields.
2. **The work-item base** — `seam-record-kinds`; `seam-lifecycle` reads lifecycle location and makes promotion's role
   put, `seam-locus` reads the owner and warns of an identity collision, and `seam-status-roadmap` reads the owner.
3. **The meta's cross-member fields** — `seam-record-kinds`; `seam-lifecycle` renames, discharges edges, and settles how
   `arc start --from` takes a seed, `seam-decomposition` redistributes edges and sets new members' `Cohort`,
   `seam-locus` derives what is in flight and loads the cohort document, `seam-status-roadmap` renders edges and groups
   by `Cohort`, and `seam-delivery-review` reads `Design` and the Completion Notes.
4. **Session context** — `seam-record-kinds`, the schema; `seam-locus`'s handoff writes it and session-init reads it,
   `seam-lifecycle`'s archive clears it, and lifecycle, decomposition, delivery's `arc attest`, and locus write
   `Next Action`.
5. **The task list** — `seam-record-kinds`; its one cursor serves `seam-locus` (session-init, recovery, the compaction
   seed), `seam-lifecycle` (`arc reopen`, `arc publish`, the close verb), `seam-delivery-review` (`arc attest` and the
   delivery plan's section), and `seam-status-roadmap` (`arc view`).
6. **The lineage record** — `seam-record-kinds`, the kind and its writer; `seam-decomposition`'s cut and
   `seam-lifecycle`'s abandonment write it, and teardown, `seam-locus`'s reconcilers, dependents at their reconcile, and
   `seam-status-roadmap` read it.
7. **The cohort document** — `seam-record-kinds`, the kind, its parser, and its write check; `seam-decomposition`
   creates documents and checks `Parent`, `seam-lifecycle`'s rename sweep and archive write it, and `seam-locus`'s
   frame, `seam-status-roadmap`, and `seam-delivery-review`'s readiness read it.
8. **Parsed prose fields** — `seam-record-kinds`; `seam-status-roadmap`'s purpose read and `design` selector read
   Purpose, `seam-decomposition`'s scaffold copies drafts and specs, and `seam-lifecycle`'s rename sweep rewrites them.
9. **Entry managed fields** — `seam-locus`, with the entry-field module and the inbound list and Errand description
   kinds; `seam-lifecycle` settles where an executing work unit integrates its inbound entries, and `seam-record-kinds`'
   write check refuses a work unit leaving with entries held. Provisional on `inbound-routing-method`.
10. **The archive sequence** — `seam-lifecycle`, whose archive names the quarter; `seam-status-roadmap`'s archive
    listing reads it, and `seam-locus` and `seam-lifecycle` move the shipped-work readers onto placement and `lookup`.
11. **The write check** — `seam-record-kinds`, the registry's slot and its kinds' checks; every member whose verbs write
    a checked kind runs through it, and `storage-ref-backend` and `storage-projection` call it from the flip.
12. **Prepared writes** — `seam-lifecycle`, the protocol; `seam-decomposition` and `seam-locus` follow it for their
    reconciling writers.

Stays with its member: the review family's schemas and the working-state split (delivery and review); personal surfaces,
claims, the inbox listing verb's name, and the growth and contention tripwires' bounds (locus); the close verb's name
and placement, the Class verb's name, and how `arc start --from` takes a seed (lifecycle); ROADMAP and the derived views
(status). Where these touch another member — archive retiring Candidate records, the workspace handing adversarial
passes to review records — the touchpoint is a row in a member, not a schema decision.

### Seam setup, before any member starts

Errands land after the contract and before the members:

- **The file splits.** Four shipped after the contract landed: `handlers/status.ts` (PR #812),
  `lib/work-unit/executor-context.ts` (#818), `handlers/lifecycle.ts` (#826), and `handlers/review.ts` (#827). The
  `scripts/review-gate/readiness.ts` split was dropped: its map row shares it with delivery alone, and delivery and
  review are one member, so no member line runs through it. The map rows members inherit for the four split files still
  name the pre-split paths, and each member re-points them to the new modules when it plans. A split a member later
  needs becomes a review chunk of that member.
- **The import ratchet.** Restrict imports of the raw state helpers — meta parsing, the composed lifecycle index,
  Git-tree reads, the Candidate and transition record stores, the Errand snapshot and transaction, and the inbox writer
  — to `lib/store/`'s in-repo backend, and literal surface names and path fragments (`USER-INBOX`, `ATOMIC-INBOX`,
  `ROADMAP`, `STATUS.USER`, `.arc/active/`, `meta-`) to the layout resolver. Both legs are new rows in the
  architecture-ban table (`eslint.config.js`, composed by `eslint/architecture-config.ts`), beside the module-local
  predicates of `eslint/architecture-imports.ts`, with today's callers recorded in `eslint-suppressions.json` as a
  floor, as the size gate records its own. New bypasses then fail lint, each member shrinks the floor, and "every reader
  and writer through the contract" is the floor at zero. The helper set derives from the consumer map. It adds no stored
  record, and the cohort's pull-forward filter, which governs delivery and review work only, does not apply to it.
- **ADR-022 to Accepted**, whose file-as-record amendment ties its flip to the seam's kickoff, since the seam builds
  the family parsers; it takes the reviewed lane. It carries re-pointing ADR-022's retired
  `cross-machine-sync-coherence` references (§ Risks, § Coordination) to `partial-push-marker`. The same slug elsewhere
  — ADR-027 and several backlog drafts — re-points per reference, to whichever successor owns that dependency.

### Soft coordination

- **Today's behavior until the flip.** Every member reroutes onto the in-repo implementation with no observable change
  (the contract's Goal 3). Behavior that needs state off the checkout's branch keys on the contract's one capability
  inside CLI verbs, never in workflow prose (D15); workflow text changes once, in `storage-cutover`'s flip rewrite.
  Today's behavior includes the contract's fail-closed observations (A10, A12–A14): an incomplete Git observation never
  stands in for absence, an empty tree, or reconciliation authority, and a rerouted caller keeps that distinction.
- **Prepared writes** are shared decision 12, lifecycle's; decomposition's and locus's reconciling writers follow it.
- **Moves, archive, rename, and links.** The in-repo implementation refuses each `unsupported` (D4, D8). The refusals
  for moves and archive name the verb that serves them until rerouted (`lib/store/in-repo/write-admission.ts`); the link
  refusal names only today's lifecycle or code-link verb, and a UID-carrying rename's points to `lookup` or another
  backend (`tracked-identity.ts`). A rerouted verb therefore keeps today's move, archive, or rename code as its in-repo
  arm, branched on the capability, and writes placement or a new name through the contract only off-branch.
- **Parsers and field schemas.** The member owning a kind registers its parser in the registry's slot
  (`createKindRegistry`), sets the kind's field schema and which verb writes each field (D5), and builds its field
  writers and any write check (§ Shared contracts, item 11); a member whose verbs write another member's kind adopts the
  owner's writers, never registering its own. Record kinds owns the kinds items 1–8 settle (§ Six members), locus the
  inbound list and Errand description (item 9) and the personal surfaces', and delivery and review the review family's.
  The contract already registers the meta parser (`createInRepoContext`, `lib/store/in-repo/context.ts`), which record
  kinds takes over, and the Errand record's schema.
- **The write check** is shared decision 11, record kinds'; every member whose verbs write a checked kind runs through
  it, and `storage-ref-backend` and `storage-projection` call it from the flip.
- **The machine-local set.** `MACHINE_LOCAL_PATHS` (`lib/store/registry.ts`) names the identity's `.internal/` folders
  and, in the common Git directory, `.notes.lock`, `.machine-id`, and `arc/**`. `quality-gate-hooks`' reuse record
  falls outside it: each worktree's own Git directory holds it (`.git/arc-checks/`, `.git/worktrees/<name>/arc-checks/`;
  `spec-quality-gate-hooks.md` D5), and it is never stored, synced, or projected. The first member to edit the registry
  adds a per-worktree Git-directory root with that pattern. Only tests read the set today, so the entry keeps the
  inventory complete for the projection and backends that will enforce it; it fixes no failure.
- **Session-init slots.** Every slot a member rebuilds gets its full schema, the obligation `cli-session-envelope`
  routed to the cohort tail: `WorkUnitStateResult`, `ErrandStateResult`, `UserSessionInitStatusResult`,
  `userReferenceReconcile`, `DerivedLocusFrame`, `currentWuReconcile`, and `StaleWorktreeSweepResult`. Session-init
  reads stay narrow — through the contract, without reshaping the prose conditionals `composable-workflows` will
  replace.
- **Shared files.** A file two members both rewrite names the other under the map's Shared with; beyond the shipped
  splits above, the members serialize on that file.
- **State paths (key 13).** Each member reroutes the hand-built work-unit state paths and work-unit-kind layout-resolver
  calls among its rows: callers ask the contract for a record or its projected path, so `resolveArcPath`
  (`lib/layout/projection.ts`) stays the one layout authority, and the ref backend later replaces the implementation
  beneath it with no caller changing. Each member re-derives its exact sites at planning, with
  `lib/delivery/from-branch.ts`'s basename classifier (lines 555–559 at `7ddab4979`) under lifecycle classification
  rather than counted as a path build. The recount's per-file list seeded the map's key-13 rows, so members start from
  those rows; the register's count stays as dated evidence.
- **Ordering the flip carries (D15).** ROADMAP's removal runs in order: every path that writes, renders, or checks it
  stops on the capability; the flip rewrite drops the hand-render steps; the deletion pass removes those arms, the
  pre-commit assert, the conflict remedy, and the merge driver. The integration checkpoint binds the lifecycle records
  it attested plus the code head, and `merge.ts` compares those, before the flip. The inbox writer's lock moves onto the
  contract's per-surface write serialization before the notes-lock code is deleted.
- **Tests** of rerouted code keep their local doubles; the shared scripted `GitExec` fake and `GitProcessError`
  fixture from `cli-substrate-complete-migration` serve the rewrites.

### Cross-cohort

With `storage-projection`, whose draft's § Coordination asks these of the seam (2026-10-09); each is provisional until
that draft settles, and each names the member whose consumer-map partition holds it:

- **The write check from write-back and `arc save`.** `storage-projection` runs each kind's write check (§ Shared
  contracts, item 11) with a hand edit as the writer.
- **Checkout-removal guards.** `storage-projection` builds the persist-or-refuse primitive — persist or refuse, unlock
  D17's worktree lock, then remove — and the seam moves onto it today's `isWorktreeClean` callers and the register row's
  two direct `git status` readers: `seam-lifecycle` takes `lib/work-unit/verbs/teardown.ts`,
  `lib/work-unit/mutators/reconcile-work-unit-worktree.ts`, and `lib/work-unit/lifecycle-guards.ts`; `seam-locus` takes
  `lib/session-init/stale-worktree-sweep.ts`, `lib/session-init/branch-gone-recovery.ts`,
  `lib/session-init/lifecycle-residue-sweep.ts`, and `lib/git/worktree-cleanup.ts`, and the readers
  `lib/errand/terminal-occupancy.ts` and `lib/locus/primary-safety.ts`.
- **The user-surfaces shim.** `storage-projection` keeps `lib/user-surfaces.ts`'s resolver as a shim while the members
  move their own callers off it (19 non-test importers at `1ee4709a3`), and retires it with
  `lib/user-surface-migration.ts` after the last of them lands.
- **Scratch.** The projection creates `.arc/user/<id>/scratch/work-unit/<slug>/`, empty, for the checkout's work unit,
  and `seam-locus` reconciles those folders at session start through `lookup` (D5); the folder naming is the interface.
- **Machine-local paths and the layout resolver.** The seam maintains `MACHINE_LOCAL_PATHS` and `resolveArcPath` (§ Soft
  coordination); `storage-projection` enforces the first and lays `active/current/` and `active/in-flight/<slug>/` over
  the second. The projection's own per-worktree folder, `.arc/system/.internal/projection/`, is a constant of its
  engine, not a `MACHINE_LOCAL_PATHS` entry.
- **Ordering.** `active/current/` lands only after `seam-locus` resolves the current work unit from the checkout marker
  plus the store and takes session-init's slot paths and the compaction seed's paths from the layout resolver (D13,
  § The `active/` layout).

### Citing the register

**Citing the register.** Row keys are `notes-storage-contract.md` § Register keys, which the consumer map's Register
column uses. The keys are frozen to the register at `f1abf9664`, and rows inserted since put a key's position in the
current table out of step with its number, so match a key by its mechanism. Rows added after the freeze carry no key and
are named by mechanism.

### Unknowns and Assumptions

- **The map's classifications were spot-checked, not re-derived**, and six areas were not covered in depth (its § Sweep
  and verification). Members re-verify their rows when they plan, and the counts in § Six members are seam-owned rows in
  the landed map.
- **Entries marked provisional** rest on `inbound-routing-method`, Active since 2026-10-09 against its approved spec; if
  its design moves before the members plan, they re-read its spec rather than these summaries.

### Scope boundary (Won't Do)

- Build the ref backend, local-only mode, the import, or explicit state fetch (`storage-ref-backend`); the projection,
  `arc save`, write-back, or the worktree lock (`storage-projection`); or the flip, its workflow rewrite, and the
  deletion passes (`storage-cutover`).
- Change any workflow's text before the flip.
- Take the delivery follow-ons (`delivery-observe-attest`, `delivery-correction-convergence`), review-lane contracts
  (`review-activity-contracts`), or the durable Owner terminus (`review-source-authority`,
  `review-protocol-alignment`).
- Reshape session-init's prose conditionals, which `composable-workflows` replaces.

### Constraints

- `storage-contract` and `cli-substrate-complete-migration`, the seam's two prerequisites, have shipped.
- Nothing else that edits the lifecycle write path runs alongside the seam — `review-checkout-lifecycle` and
  `stub-mint-to-launch` among it (`cohort-state-storage.md` § Cross-cohort).

### Closeout criteria

Every member has shipped, and every row of `cohort-state-storage.md`'s storage-coupling register that names
`storage-seam` as its owner is closed: a row closes when the members whose consumer-map rows carry its key realize its
fate.

## Members

### `seam-record-kinds`

_Exposes:_ the parsers, field schemas, field writers, and write checks of the meta, task list, draft and spec, lineage
record, and cohort document, with condition (c)'s report; shared decisions 1–8 and 11.

_Consumes:_ the contract's kind registry and its in-repo implementation (`createKindRegistry`, `createInRepoContext`).

### `seam-lifecycle`

_Exposes:_ the transition write path through the contract — placement as a record field, abandonment's lineage, archival
and the archive sequence, parking, rename and promotion, branchless planning's write half, and the Class verb — and the
prepared-write protocol; shared decisions 10 and 12.

_Consumes:_ record kinds' kinds and field writers, and locus's inbound kind (item 9).

### `seam-decomposition`

_Exposes:_ a cut as one multi-record `batch`, writing the members, the dependents' edges, the cohort document, and the
lineage record.

_Consumes:_ record kinds' meta, lineage, and cohort writers and the parsed `Parent`, and lifecycle's prepared-write
protocol (item 12).

### `seam-delivery-review`

_Exposes:_ Candidate records and the review family's records through the contract, D18's export with its review-copy
arm, and readiness's reads of lifecycle state.

_Consumes:_ record kinds' meta and task-list writers, which `arc attest` uses, and lifecycle's archive, where Candidate
records retire.

### `seam-locus`

_Exposes:_ locus and in-flight derivation over the store, session-init's state reads and rebuilt slots, the personal
surfaces, and the entry grammar with the inbound list and Errand description kinds; shared decision 9.

_Consumes:_ record kinds' kinds, lifecycle's answer on how `arc start --from` takes a seed, and lifecycle's
prepared-write protocol (item 12).

### `seam-status-roadmap`

_Exposes:_ ROADMAP, `STATUS.USER`, `arc view`, the archive listing, and the status surfaces, rendered from typed
listings.

_Consumes:_ locus's in-flight model, record kinds' parsed fields, and the lifecycle composition it shares with lifecycle
(`composed-lifecycle-index.ts`).

## ADR anchors

- `adr-035-keep-operational-state-in-repository-refs.md` — the direction the seam reroutes toward: one contract,
  pluggable backends, and a projection as the working copy.
- `adr-022-managed-operational-state-documents.md` — its file-as-record amendment makes each file its own record, read
  through the parsers the members build; it goes to Accepted at the seam's kickoff (§ Seam setup, before any member
  starts).

---
