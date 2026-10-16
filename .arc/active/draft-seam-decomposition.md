# Draft: Seam Decomposition

- **Origin:** [internal] — the `storage-seam` cut (2026-10-09); stage 2 of the storage program.
- **Purpose:** Rebuild decomposition for the store: from the flip a cut runs over records, writing its members in one
  multi-record `batch` and landing in a second, carrying today's domain rules — source units, the cut map,
  conservation, cohort topology, and lineage — and none of today's Git machinery, which stays untouched before the flip
  and goes in the cutover's deletion pass.

---

## Inbound Buffer — Pending Integration

### `[x]` **Row the decomposition files the consumer map misses**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: seam-decomposition`), housekeep drain (2026-10-13).

- _Shapes:_ § Continuity's next step (re-verify its consumer-map rows against the current code), and § Members' edges.

- _Observation:_ `seam-lifecycle`'s re-verification at `9f5bce946` found coupled files no row covers:
  `handlers/decompose.ts` (#826), `decompose-v3-operation.ts`, `decompose-transition-record.ts`,
  `decompose-v3-repository-projections.ts`, `decompose-v3-materializer.ts`, `decompose-v3-finish-operation.ts`, and
  `decompose-content.ts`. Shared with lifecycle: `git-owned-decompose-candidate-cleanup.ts`, whose checkout removal
  lifecycle moves onto the removal function (`draft-seam-lifecycle.md` § Lifecycle), and
  `terminal-transition-record-writer.ts`. Evidence: `notes-seam-lifecycle.md` § Files no row covers.

- _Captured during:_ `seam-lifecycle` draft-design close, 2026-10-12.

- _Drain note:_ `terminal-transition-record-writer.ts` already has a row; it needs its shared-with column corrected,
  not a new row.

- _Integrated 2026-10-16:_ the re-verification covered every file named here and the rest of the machine (§ What
  today's code holds). Under § Direction rows matter only as carried or deleted, and § Corrections to the consumer
  map records each unrowed file and each row the code contradicts.

---

## Continuity

- **Readiness:** formalization-ready (assessed at loop exit, 2026-10-16). The direction was re-set on 2026-10-16
  (§ Direction): no pre-flip change, and a store-native rebuild in place of rerouting today's modules.
- **Resolved:** § Direction; the boundary read (stays one work unit); the requirements the upstream specs already
  settled (§ Settled upstream, § Requirements); the code re-verification at `5b82bb851` (§ What today's code holds);
  the cut's shape, its additive batch running without an approval of its own, and its terminal batch's check by
  provider (§ The cut); extraction, carried; where the cut runs; forward compatibility with `work-item-relations`;
  `decompose-scaling` and its cohorts, and the member baseline (§ Coordination); the workflow's end state, with one
  approval stop authorizing the terminal batch; the success signal.
- **Open:** none.
- **Next:** `create-spec`. Draft close is done: source grounding; the adversarial review, two passes and four
  fix-check rounds, converged (`ADVERSARIAL-PASSES.md`, in the Owner's workspace for this work unit); the coordination
  captures and direct messages (§ Coordination); and the `cohort-storage-seam.md` amendment.

**Reading this draft.** `cohort-storage-seam.md` holds the seam's coordination, its scope boundary, and how the
register's keys are cited. `D` and `A` numbers are `spec-storage-contract.md`'s decisions and amendments; record-kinds
sections are `spec-seam-record-kinds.md`'s, lifecycle sections `spec-seam-lifecycle.md`'s. The full code map behind
§ What today's code holds is `decomposition-code-map-2026-10-16.md`, in the Owner's workspace for this work unit.

## Problem / Motivation

Today a cut plans over Git trees, stages its members on a `chore/decompose-<origin>` candidate branch, advances that
branch over base by an append-only merge, and writes its lineage record under `.arc/system/.internal/transitions/`
(register key 49). From the flip the state it reads and writes no longer lives in those trees, so `arc decompose` needs
a version that works over the store, writing a cut in the store's batches (D3).

The cohort's default for a member is to reroute its modules onto the in-repo implementation first, with no observable
change, so the same code runs across the flip (`cohort-storage-seam.md` § Soft coordination). For decomposition that
buys nothing. No cut is planned before the cutover (Owner, 2026-10-16); one that is needed runs by the workaround
procedure in `RELEASE-GATES.md` § Decomposition until the cutover, in the Owner's personal directory, or a draft is
split by hand. And today's code would not reroute cheaply: even its pure planner is keyed on repository paths rather
than records (§ Where the size comes from).

## Direction (Owner, 2026-10-16)

- **No pre-flip change.** `arc decompose` keeps today's code as its in-repo arm, untouched, its held defects
  included. No module moves onto the in-repo implementation. The one addition before the flip is the capability
  branch in `handleDecompose` (`handlers/decompose.ts`), which sends a post-flip invocation to the store version.
- **Rebuilt from the domain rules, not rerouted.** The store version is designed from what a cut decides — its source
  units, the cut map, conservation, cohort topology, dependency dispositions, and lineage — reusing today's code where
  its inputs fit and carrying its rules where they do not (§ Domain rules carried).
- **Built here, before the cutover,** so the program's tail after the cutover stays small: a cut over the store is
  almost entirely record writes, which the reference backend and the conformance suite verify, and register key 49's
  rewrite stays with the seam, where `cohort-state-storage.md` places it. A rebuild deferred past the cutover was
  rejected (§ Alternatives).
- **Today's machine leaves in the cutover's deletion pass,** with every in-repo arm: each module the store version does
  not import, and the candidate's arms in teardown and in-flight derivation (§ Coordination).
- **Departures this records:** the cohort's "every member reroutes onto the in-repo implementation" does not apply to
  this member, which changes nothing before the flip; and the consumer map's per-module end states (`Becomes`) for
  decomposition — pure composition over supplied snapshots, adapters acquiring at pinned versions — give way to
  deletion at the cutover for every module the store version does not carry. And key 49's end state, a cut as one
  multi-record write, holds for the terminal batch, which an additive batch precedes (§ The cut).
  `cohort-storage-seam.md` takes the amendment at draft close, as lifecycle's pre-flip exceptions were recorded there.

**Boundary: stays one work unit** (2026-10-16). Decomposition is one self-contained machine (`cohort-storage-seam.md`
§ Six members), and the store version with its dispatch is one design. Nothing here is independently landable: with no
pre-flip change there is nothing to land early, and program work units land single-branch with chunked review. No
delivery plan.

## What today's code holds

Re-verified at `5b82bb851`, which carries the merged `seam-lifecycle` and `seam-record-kinds`.

### Where the size comes from

| Bucket                                                                                                          | Lines  | Exists because of           |
| --------------------------------------------------------------------------------------------------------------- | ------ | --------------------------- |
| Git adapters: preflight, three-tree plan, execute, `--finish`, base advancement, candidate cleanup, lineage I/O | ~4,800 | Git and tracked files       |
| Staging, occupation, and rollback state machines over ports                                                     | ~1,600 | the candidate branch        |
| Planners over path-keyed whole-repository trees: the repository plan, the retirement delta, ROADMAP             | ~3,500 | state as files in Git trees |
| Domain rules: source units, cut map, conservation, topology, lineage builder, extraction thinning               | ~3,100 | the decomposition itself    |
| Refusals, remedies, reporting, and the CLI entry                                                                | ~2,300 | partly Git conditions       |

- **The pure layer is path-keyed.** It finds metas by filename and placement prefix (`readTreeMetas`,
  `supportedMetaPath`, `decompose-v3-repository-tree.ts`), takes whole-repository trees read blob by blob
  (`readGitV3RepositoryTree`, `git-decompose-v3-repository-plan.ts`), and emits path-level mutations, ROADMAP's
  among them. Rerouting it over store snapshots would have been a rewrite.
- **Cost.** `--execute` runs preflight four times and builds the plan three times (`revalidateCommandMap`,
  `composeGitV3RepositoryPlan`, `revalidateOperationPlan`, and the `revalidateStaged` callback, all in
  `git-decompose-v3-operation.ts`). Each preflight reads every meta on every local branch one blob at a time, two `git`
  processes apiece (`readGitV3DecomposeTreeSnapshot`, `git-decompose-v3-preflight.ts`; `readGitBlobEntry`,
  `lib/io-context.ts`): about 57k Git subprocesses per `--execute` here, estimated from the code, not measured.
  `storage-seam`'s own cut, over 14 local branches, took about 25 seconds to preflight and 5 minutes 50 seconds to
  execute (2026-10-09), and refused an edit outside the origin only at execute's plan build, nearly two minutes in
  (`retirement:source-private-modified`, `decompose-v3-retirement-delta.ts`).
- **Dependents.** Only metas on base are rewritten: `liveWorkUnits` (`decompose-v3-repository-projections.ts`) takes a
  dependent's writable path from the result base's metas, and `unwritable-dependent` refuses a dependent without one
  (`decompose-v3-conservation.ts`). A dependent whose meta lives only on another branch is never seen.
- **No store use.** Nothing in the machine reads `Store` or the capability; it imports only the lineage and cohort
  kinds' parsers and writers.

### Domain rules carried

The rules below are what the store version keeps. Each is written today against paths or Git pins, so the spec decides
module by module whether the code carries or only the rule does.

- **Source units:** the Markdown scanner and locators (`decompose-content.ts`), pure over text.
- **The cut map:** its authoring half — destinations, allocations, dependency dispositions, shape, and placement
  (`decompose-v3-schema.ts`, published as `arc schema get decompose-cut-map`), which gains a Purpose for each cohort
  document the cut creates (§ The cut). Its machine half pins Git refs and heads beside each source unit's content
  digest (`contentDigest`) and the origin's edges; the store version keeps the digests and edges as the origin's
  binding and drops the Git pins (§ The cut). An incoming edge's identity today hashes the dependent's whole
  `Depends On` (`v3IncomingEdgeId`); the store version binds it by its dependent naming the origin. Version 3's
  placements are strict (`PlacementSchema`) and the schema registry holds one schema per identity
  (`lib/kernel/schema/registry.ts`), so the store version's map is a new schema under its own identity, published beside
  version 3 until the deletion pass; the spec names it. Lifecycle's graduation imports the schema's types
  (`planning-artifact-tuple.ts`, `validated-graduation-transaction.ts`).
- **Conservation:** allocation coverage and dependency projection (`decompose-v3-conservation.ts`), whose inputs carry
  paths (`writablePath`).
- **Cohort topology:** the four placements (`decompose-v3-topology.ts`). Both `Parent` checks already read the cohort
  kind's parsed `parent` (`structurallyMatches`, and `validateCohortDocumentClaim` in
  `git-decompose-v3-destination-validation.ts`), and the scaffold writes through the kind's creation writer
  (`renderV3IncompleteCohort` calling `writeCohortDocument`). The at-cap fan-out block is still spliced in by hand
  (`fanoutBlock`, `decompose-v3-topology.ts`), and moves into the cohort kind's module as a writer (R7).
- **Lineage:** `createDecomposeTransitionRecord` (`decompose-transition-record.ts`) already builds schema version 2
  with `outgoing`, but no `retiredBranches` (§ Requirements, R2).
- **Scaffolds:** member metas through the meta kind's creation writer (`renderV3NewLeafMeta`, `renderMetaFile`); the
  planning profile read from the origin's `Design` alone (`inferPlanningProfile`, `decompose-v3-preflight.ts`); a
  copy retitled only where its first line holds the origin slug (`retitleScaffold`, `decompose-v3-repository-plan.ts`).
- **Extraction thinning** (`decompose-v3-thinning.ts`), with extraction (§ The cut).
- **Refusals** for domain conditions (`decompose-v3-refusal.ts`); those naming Git conditions go.

### Corrections to the consumer map

The map (`notes-storage-contract.md`, archived) is not edited; these stand here.

- **Dead in production:** `git-decompose-v3-retirement-delta.ts` has no production importer — the delta is computed in
  `decompose-v3-repository-plan.ts` from trees already read; and `repointDependsOn` (`decompose-sweep.ts`) has no
  production caller, though its import is that file's `store-raw-state` floor entry.
- **Not decomposition's:** `git-decomposition-object-readers.ts` has no decomposition importer; its ten callers are
  delivery, review, integration, status, and session-init modules. Its row's owner, `storage-cutover`, stands.
- **Misread:** `git-decompose-v3-destination-validation.ts` does no Git I/O despite its name, and serves extraction's
  finish alone; `--finish` refuses a retirement map (`map:authoring-shape`, `git-decompose-v3-finish.ts`) rather than
  passing over it.
- **Not shared after all:** `seam-lifecycle` changed teardown's injected removal callback
  (`tryCleanupDecomposeCandidate`, `verbs/teardown.ts`), not `git-owned-decompose-candidate-cleanup.ts`, and teardown's
  store arm (`runStoreTeardown`) handles no candidate. The store version stages no candidate, so the file leaves with
  the in-repo arm.
- **Unrowed but coupled:** `handlers/decompose.ts`, `decompose-v3-operation.ts`, `decompose-transition-record.ts`,
  `decompose-v3-repository-projections.ts`, `decompose-v3-materializer.ts`, `decompose-v3-finish-operation.ts`,
  `decompose-result-occupation.ts`, `decompose-candidate.ts`, and the candidate cleanup. `decompose-candidate.ts` has
  callers outside the machine: teardown and `lib/git/in-flight-derivation.ts`.
- **Sharer missing:** `terminal-transition-record-writer.ts`'s row names no sharer, though decomposition
  (`decompose-v3-operation.ts`, `git-decompose-v3-operation.ts`) and lifecycle (`verbs/abandon.ts`, `verbs/rename.ts`,
  `handlers/lifecycle.ts`, `commands/rename.ts`) both import it.

## Settled upstream, consumed here

- **Batches, refusals, and the in-repo implementation:** D3, D4, D8. The in-repo implementation refuses moves,
  completed-placement creation, renames, and links, and a batch spanning substrates; the store version never runs on it.
- **The lineage kind** with `outgoing` (record-kinds § 7.1), its writer `writeLineageRecord`, and `retiredBranches`
  (lifecycle § 12.1, A2), which decomposition's writer must supply (lifecycle § 19).
- **Dependents from the flip:** the cut rewrites stub dependents only; an in-flight or parked dependent keeps its edge
  and applies the lineage disposition at its own reconcile (record-kinds § 7.4).
- **Slug-edge settling:** a cut giving a member a slug an edge already names settles that edge first, or
  `work-item.slug-edges` refuses (record-kinds § 5.3).
- **Field ownership:** decomposition seeds members' `Depends On` and `Next Action` and rewrites dependents' `Depends On`
  (record-kinds § 5.4); new members' `Cohort` is the cohort's full path (§ 5.3); a cohort document's Purpose must be
  authored (`cohort.purpose`, § 8.2).
- **Prepared writes:** acquire the whole artifact group with versions, prepare, revalidate by version, apply in one
  batch (lifecycle § 3; `acquireLifecycleRecords`, `revalidateLifecycleRecords`, `applyPreparedLifecycleWrite` in
  `prepared-lifecycle-write.ts`).
- **A decomposed origin's teardown** takes the archive's rule with the lineage record as evidence (lifecycle § 12.1),
  built: `store-retirement-evidence.ts` maps a decompose lineage to `landed` and refuses one lacking `retiredBranches`.
- **The template for a terminal batch:** abandonment's arm from the flip (`runStoreAbandon`, `verbs/abandon-store.ts`)
  — a lineage record and the primary's removal in one transition, with checkout and branch cleanup after it as a
  retryable step naming `arc teardown <slug>`.

## Requirements

What the store version meets, in either batch of § The cut:

- **R1 — One terminal batch.** The cut's destructive writes land in one `batch` with expected versions and caller
  provenance naming the verb, as abandonment's do.
- **R2 — Lineage with branch authority.** The lineage record carries `outgoing` from the cut map and `retiredBranches`
  from the removed primary's exact branch links, `[]` where it has none, as `runStoreAbandon` writes them. The write
  check refuses a snapshot differing from the primary's links (`lineage.retired-branches`, `lineage/check.ts`), and
  teardown refuses a decompose lineage lacking one (`store-retirement-evidence.ts`).
- **R3 — Stub dependents only,** per record-kinds § 7.4, so `unwritable-dependent` goes; slug-edge settling per § 5.3.
  The same holds for an existing home taking a new edge (§ The cut, Existing homes).
- **R4 — Prepared-write freshness.** Every record a batch reads is bound by its version and revalidated before the
  batch applies; no unrelated write invalidates a cut (D2). Between the batches the origin is bound by content, not
  version (§ The cut, What the terminal batch checks of the content).
- **R5 — Flat cost.** The cut reads the records it touches, once, through the store — the origin's group, the selected
  cohort documents, the existing homes, and the dependents a lifecycle listing names — re-checks them by version rather
  than re-planning, and refuses at preflight whatever it can decide there.
- **R6 — No ROADMAP.** ROADMAP is derived from the flip (D15); the store version claims, renders, and checks none. The
  dispatch keeps today's ROADMAP arms off the post-flip path, which meets the cohort's ordering for ROADMAP's removal.
- **R7 — Written through the kinds:** member metas through the meta kind's creation writer, cohort documents through the
  cohort kind's writers, edges through the field writers, lineage through `writeLineageRecord`, and the stored map
  through its own kind (§ The cut, What this accepts). The cohort kind, which `seam-record-kinds` shipped, has no writer
  for the at-cap fan-out block, so this member adds one to the kind's module, moving today's splice there: a member that
  writes another member's kind uses that kind's writers, never its own (`cohort-storage-seam.md` § Soft coordination,
  Parsers and field schemas). It adds `lineage.cut-in-flight` to the lineage kind's module the same way (§ The cut,
  What this accepts).
- **R8 — Recovery-complete refusals** (`DEV-RULES.PROJECT`): each says whether it is terminal and names its remedy.
  A cut map is parsed, never refused for formatting: today a map that parses but is not canonical JSON refuses as
  `map:non-canonical`, whose remedy is to serialize it canonically (`decompose-v3-execution-preflight.ts`,
  `decompose-v3-refusal.ts`).

## The cut: an additive batch, then a terminal batch (Owner, 2026-10-16)

Today's machine never says which bytes the verb composes and which the author writes: base advancement requires every
planned path to equal the composed after-state (`exactTransitionTree`, `git-decompose-transition-base-advancement.ts`),
yet the workflow authors destinations over those scaffolds, and the 2026-10-05 rehearsal found it refusing them. The
store version splits the cut at that line, and the workflow's one distribution approval falls between the halves,
before anything irreversible.

1. **The additive batch** writes what the cut map decides and removes nothing. It runs straight from the map, with no
   approval of its own (Owner, 2026-10-16): starting a member is a deliberate act, and approving the map approves the
   layout. Each member is a stub, written through the meta kind's creation writer with its `Cohort` and its seeded
   `Depends On` and `Next Action`, beside a copy of the origin's draft or spec, and of its task list or notes where an
   allocation targets that companion on the member, each retitled where the first line holds the origin slug
   (`retitleScaffold`, `decompose-v3-repository-plan.ts`). Each new cohort document is written through the cohort kind's
   creation writer with the Purpose the cut map carries, and the completed map is stored on the origin (What this
   accepts, below). The batch also settles any edge a member's new slug would otherwise trip (`work-item.slug-edges`,
   record-kinds § 5.3). Members and their new cohort document land together: `meta.cohort` refuses a member whose cohort
   document is absent from the batch's after-state (`checkMetaCohort`), and `cohort.purpose` refuses a new cohort
   document whose Purpose is absent or `—` (record-kinds § 8.2).
2. **Authoring** grooms the stubs and the cohort document through write-back, as anyone grooms a stub (D13), and edits
   the existing homes and the cohort coordination the map allocates to (Existing homes, below). Nothing new is created
   by hand, which write-back refuses for a meta (`meta.verb-owned-field`).
3. **The distribution approval** follows authoring and authorizes the terminal batch (§ The workflow's end state).
4. **The terminal batch** is a prepared write (R4). It acquires the origin's group, the members, their cohort documents,
   the existing homes, and the stub dependents at their versions, and checks the origin's current state, the seeded
   fields, and the content (below). It then writes the lineage record (R2) and removes the origin's primary, which ends
   the item and moves its group under history (lifecycle § 8.6), as abandonment does. The origin's inbound list must
   hold no entry (`lineage.inbound-held`): preflight refuses an origin holding one (R5), and an entry routed to it
   between the batches is routed on to the member it shapes (D11), which writes the inbound lists and no source unit of
   the origin's. In the same batch it rewrites stub dependents (R3), writes the edges stub homes take, and, under an
   at-cap placement, appends the fan-out block to the parent cohort document (R7), naming the members as they finally
   stand. The origin's checkout comes down, or is released, after it as a retryable step naming `arc teardown <slug>`,
   as `runStoreAbandon` does.
5. **A rejected or revised distribution** is one prepared verb batch (`meta.verb-owned-field` refuses only hand edits,
   and no rule asks lineage for it). A rejection removes the stubs, the new cohort documents, and the stored map. A
   revision writes the difference between the stored map and the revised one: it adds or removes stubs and creates or
   removes cohort documents through step 1's writers (R7), moves each retained member's seeded `Depends On` edges and
   `Cohort` from the stored map's to the revised map's through the field writers (`writeMetaDependsOn`,
   `writeMetaCohort`, `meta/bullet-writers.ts`), leaving edges the stored map did not seed as they stand, and replaces
   the stored map. Either refuses while a started member would change, since it is no longer a stub: one it would
   remove, naming `arc abandon <member>`, and a retained one whose seeded `Depends On` or `Cohort` it would move, naming
   the change for the member's owner to make or the map to drop, as a started dependent or home keeps its edge for its
   owner (R3, Existing homes). Either also refuses an edge it does not write that names a stub it removes — a retained
   member's own, or any other open work item's, found by the listing of dependents R5 reads — counting a `Depends On`
   edge and a pause `waits-on` edge and skipping completed records, as `work-item.slug-edges` counts them (`namedEdges`,
   `survivingEdge`). It names each edge for its owner to retarget or drop, a `waits-on` edge through
   `arc pause <name> --waits-on` or `--no-waits-on`. No write check refuses removing a record an edge names
   (`checkMetaDependsOn` judges new edges only), and a later work item taking the slug would silently become the edge's
   provider: `priorTarget` finds no primary or lineage for a removed stub, so `work-item.slug-edges` admits the new
   slug, and `lookup` resolves the edge to the new item. Either also refuses removing a stub that holds a stored map of
   its own, naming that cut's discard, or whose inbound list holds an entry, naming each entry, read through the inbound
   kind's grammar, to route under D11 with `arc route` — to the origin in a rejection, or to a retained member in a
   revision — since an entry integrated into a stub the batch removes leaves with it. A discard writes no lineage for
   `lineage.cut-in-flight` or `lineage.inbound-held` to see, and `meta.inbound-held`, whose route-or-integrate remedy
   this follows, passes a removed meta (`checkMetaInboundHeld`). Like those held-entry rules, the refusal admits until
   `seam-locus` declares the inbound kind's grammar (`observeInboundHeld`; record-kinds § 3.6), and its tests supply
   one, as `inbound-held-rule.test.ts` does. Edges the additive batch settled for a slug stay settled, each still naming
   its other record. The store's `history` keeps the created-then-removed records (the contract's operation table, A2).

   A revision also re-binds the map when the terminal batch refuses a changed origin, by the rule
   `refreshV3ExtractionCutMap` (`decompose-v3-refresh.ts`) applies to extraction today, carried to both shapes: a fresh
   preflight's machine half replaces the map's, and the authoring half carries whole when the only change is to the
   content of units allocated `drop` or, in an extraction, kept by the origin. Any other change — an added or removed
   unit, a changed unit identity, a changed unit some allocation sends to a destination or one under a repeated
   heading, a changed edge, or a changed origin identity or planning profile — names the first place to reauthor. What
   the verb emits for a revision is the stored authoring over that fresh machine half, with the place named, and the
   operator reauthors from it; preflight's refusal of an origin holding the map stops a second cut, not this. A changed
   unit allocated to a destination is carried into it by hand during authoring. The members and their authored content
   stay.

**What this accepts.** Purpose joins the cut map's authoring half — one field on the `cohort` and `subcohort`
placements (`PlacementSchema`, `decompose-v3-schema.ts`), and a second on a `subcohort` placement whose parent document
the cut creates as well (`planTopology` backfills it), so every cohort document the cut creates has one. The cohort
kind's creation writer already takes it (`writeCohortDocument`), and today's scaffold fills it with `—`; written with
the map rather than after the distribution exists, it stays editable after. And the members show before approval, to
every checkout on the machine, which share the store's refs, and to other machines once synced, where today's staging
is a local branch.

In return a half-done cut is durable (Owner, 2026-10-16). Before the additive batch the map is the operator's file,
authored and passed by path as today's is (`readCutMap`, `decompose-v3-execution-preflight.ts`). The additive batch
stores the completed map as a record on the origin, of a work-item kind this member registers — `work-item/cut-map` as a
working name, declared `machine(unhomed)` in `KIND_MECHANISMS` (`lib/store/registry.ts`): single-writer, never
projected, and with no in-repo home, which the post-flip verb never needs. Only the verb writes it. The cohort has the
member owning a kind register it and names each kind's owner (`cohort-storage-seam.md` § Soft coordination, Parsers and
field schemas); no other member writes this one, so it is this member's, which the cohort amendment records (§
Coordination). The terminal batch, the discard, and a revision read it by the origin's slug, and a revision replaces it.
An origin holds one cut at a time: preflight refuses an origin already holding the record, naming the terminal batch and
the discard (R8). A revision is authored as the map was and passed by path, starting from what the verb emits for it —
the stored authoring over a fresh machine half (step 5) — as `--preflight` emits a starter map today (`arc decompose`'s
options, `cli.ts`). A retirement's terminal batch ends the origin, and the batch that ends an item removes every record
on its ref, so the map leaves current state with the rest and stays readable through the origin's history by UID
(`storage-ref-backend`'s spec § 7.4); the lineage record lives on the project registry's ref. An extraction's terminal
batch and a discard remove it. Any session, machine, or person can then finish, revise, or discard the cut. Keeping the
map in the operator's personal files was rejected: the per-work-unit workspace retires at the flip, and `scratch/` holds
documents ARC never reads (D5), where the verb would depend on one.

Lifecycle moves on the origin meet the stored map. Abandoning it would end the item and take the map with it, stranding
the members and leaving the terminal batch and the discard nothing to read by slug, so it refuses: creating `abandon`
lineage for an origin holding the map refuses (`lineage.cut-in-flight`, a working name), naming the cut's terminal batch
and its discard, as `lineage.inbound-held` refuses terminal lineage for an origin holding inbound entries
(`checkLineageRecord`, `lib/store/kinds/lineage/check.ts`). Every abandonment writes lineage (`runStoreAbandon`), and no
hand edit removes a meta (`meta.verb-owned-field`), so the rule reaches every abandonment without a change to the
abandon verb. This member adds it to the lineage kind's module, as R7 adds the fan-out writer to the cohort kind's.

Every other move between the batches is left to the terminal batch. It derives the origin's source kind from its
current state, as preflight does (`createV3DecomposePreflight`, `decompose-v3-preflight.ts`), rather than taking the
kind the stored map recorded, which is all today's source-kind refusal reads (`map.machine.source.kind`,
`retirement:source-kind`, `decompose-v3-repository-plan.ts`), and applies the shape's rules to it. A kind the shape
does not take refuses — retirement takes no Active origin, and neither shape an Integrating or archived one — naming
the move that restores a kind it takes, such as `arc deactivate <origin>`, or else the discard. A kind it takes
passes, and the rescan follows it (What the terminal batch checks of the content): an extraction origin activated or
deactivated since scans a narrower or wider set, whose removed or added units refuse, naming a revision, while a stub
started since scans what it did. A renamed origin no longer matches the slug the map names it by (`SourceSchema`,
`decompose-v3-schema.ts`), which a revision re-binds.

**Existing homes (Owner, 2026-10-16).** A `heterogeneous` or extraction map sends allocations to existing homes — a
work unit, a block of another work unit's draft, or a document (`ExistingTargetSchema`, `decompose-v3-schema.ts`) —
and every retirement with one new member is heterogeneous, since a symmetric map needs two. These rules hold for both
shapes. Authoring edits the homes in step 2 under D13's edit rights, as it edits the cohort coordination a
`cohort-coordination` destination names. D13 grants rights by lifecycle state and kind of file, so preflight refuses
an allocation into a file the operator may not edit: a started home's meta or task list, whose remedy is to target its
draft, spec, or notes, and any file of a home another person has started, whose remedy is to route it an inbound
entry. Stubs are groomed by anyone (D13), so another person's stub takes allocations. An existing home taking a
new edge is treated as a dependent (R3): the terminal batch writes it on a stub home, and a home that has started
refuses it at preflight and again at the terminal batch, the remedy being to leave the edge to that home's owner. A
`document` home, any managed repository path, refuses from the flip, its remedy to allocate that content to a work item
or a member, so a retirement reads no Git.

**What the terminal batch checks of the seeded fields (Owner, 2026-10-16).** A stub's `Cohort` and `Depends On` admit
hand edits (record-kinds § 5.4), so authoring can change what the additive batch seeded. The terminal batch requires
only what the map decided, compared by provider: every member exists, carries the map's `Cohort`, and still names each
provider the map seeded on it. A gate or reason set during authoring (§ Forward compatibility with
`work-item-relations`) and any added edge pass; a dropped seeded edge or a changed `Cohort` refuses, naming the map
revision that would make it legitimate (step 5). Refusing any divergence was rejected: it would block the grooming that
authoring exists for.

**What the terminal batch checks of the content (Owner, 2026-10-16).** Conservation is locator resolution: each
allocation's target locator resolves exactly once in its destination record, as extraction's finish checks today
(`validateProjectedContent`, `git-decompose-v3-destination-validation.ts`). A locator names a heading's text and
level, its ancestors', and its occurrence among headings of the same text (`V3DecomposeLocatorSchema`), so renaming or
re-leveling an allocated heading or any heading above it, merging it, or adding an earlier heading of the same text
refuses, naming the allocation; the remedy is to update that allocation's target locator in the map. Authoring may
change anything else.

The origin is bound by content between the batches. The terminal batch rescans what preflight scans for the origin's
current kind (What this accepts) — the origin's draft or spec, task list, notes, and companions, or an Active origin's
design artifacts alone (`sourceUnits`, `decompose-v3-preflight.ts`), never the stored map or the inbound list — and
requires exactly the map's source units, by content digest, and its edges, each incoming edge by its dependent naming
the origin. A write the scan does not cover passes, such as to the origin's meta or an Active origin's task list; an
added, changed, or removed source unit or edge refuses, naming a revision that re-binds the map (step 5).

### Extraction (Owner, 2026-10-16)

Extraction (`--extract`, then `--finish`) is carried, sharing steps 1–3 and 5, though it was never rehearsed or used
(`RELEASE-GATES.md` § Decomposition until the cutover). Its origin is a started Planning or Active work unit that
survives (`source-shape`, `decodeV3DecomposeCutMap`). Its companions, the task list among them, stay with the origin
(`companion-disposition`). Members may depend on the origin, and a dependent may keep its edge on it
(`decompose-v3-conservation.ts`). Under a cohort placement the origin joins the new cohort
(`planInternalV3DecomposeTopology`).

Its terminal half takes step 4's place as one prepared write, with the same check of the origin's current state, of the
seeded fields, and of the source units' conservation: it thins the origin's draft or spec to the units it keeps
(`planV3ExtractionSourceThinning`, pure but path-keyed), sets the origin's `Cohort` when it joins a new cohort, rewrites
stub dependents, writes the edges stub homes take, under an at-cap placement appends the fan-out block (step 4), and
removes the stored map. It writes no lineage record, since the origin survives and the lineage kind has no extraction
kind, so R2 is retirement's alone. A started dependent therefore has nothing to reconcile from: a map giving a started
dependent any disposition but leaving its edge as `[origin]` — a `replace` adding a member beside the origin among them
— refuses at preflight and again at the terminal batch, the remedy being to keep that edge on the surviving origin,
still valid, for the dependent's owner to move.

What carries is the rule more than the code. The thinning planner takes a path-keyed tree (`V3RepositoryPlanTree`), so
its inputs are rewritten over records. The finish's destination validation (`validateV3ExtractionDestinationStates`,
`git-decompose-v3-destination-validation.ts`) goes: its claims on destinations, edges, and topology become the
terminal check of the seeded fields, and its locator resolution the content check, over the records the batch
acquires; its byte-equality checks go, since authoring edits the destinations.

Rejected: carrying it in a follow-on after the cutover, post-flip `--extract` refusing until then, which is a tail; and
dropping it, which leaves a split of a started work unit to `arc stub` and hand editing without the map's conservation
or edge dispositions.

### Where the cut runs (Owner, 2026-10-16)

The verb takes the origin by slug and runs from any checkout, guarded by the prepared write's versions. Nothing in the
store binds a verb's write to a checkout: abandonment's store arm (`verbs/abandon-store.ts`) also runs from any,
finding the checkout that holds its work unit (`findWorkUnitHoldingCheckout`, `verbs/unshared-work.ts`). D13 binds hand
edits of a started work unit's meta and task list to its own checkout, and D17 has lifecycle workflows for a started
work unit check their locus at entry.

The workflow anchors the same way. A started origin's cut, every extraction among them, runs in the origin's own
checkout; a stub's runs from any checkout, as grooming does. A retirement origin is a stub or a started Planning work
unit — an Active one refuses as `retirement:source-kind` (`decompose-v3-repository-plan.ts`) — which from the flip
holds its own checkout detached at base (D17); one started before the flip keeps its `plan/<slug>` branch as a
`created` link (lifecycle § 6.3), which R2 and teardown already cover. A retirement run there ends by removing that
checkout, or releasing it where it was anchored in place with `arc start --here` (`runStoreTeardown`,
`verbs/teardown-store.ts`). Teardown already does either from inside it (its `chdir` seam, `verbs/teardown.ts`), and a
removal that fails names `arc teardown <slug>`.

Rejected: the verb refusing a started origin's cut from any other checkout, which repeats the workflow's locus check;
abandonment does not repeat it either.

### Forward compatibility with `work-item-relations`

`work-item-relations` (planned, after `storage-cutover`) types how work items relate, and names this member twice:

- **An edge gains the dependent's gate and a reason** — `design`, `start`, `task`, or `land`, with an unqualified edge
  reading `start` — and "`seam-decomposition` redistributes edges at a cut and must carry their gates and reasons".
- **A cohort document's coordination half becomes typed entries** — orderings and shared contracts, with each member's
  Exposes and Consumes rendered from edges and contracts — while membership stays derived from the `Cohort` field.
- **Its open question 1, whether a cohort can be an edge's endpoint,** waits on this member's redistribution rules.

The store version builds nothing for it, and adopts four rules that keep its change local:

1. **Edges move as entries keyed by provider.** A dependent's edge on the origin gets the replacement targets as its
   providers, each a copy of the entry, or is dropped; a member's seeded edge copies the origin's entry. Today an entry
   is a slug (`writeMetaDependsOn`, `meta/bullet-writers.ts`); when it widens, gate and reason ride along with no change
   to the cut's logic. The lineage record keeps providers only (`replace`, `drop`, and `members`,
   `lineage/schema.ts`), which suffices: a dependent reconciling later substitutes the provider on its own edge and
   keeps its gate.
2. **The terminal batch compares edges by provider** (§ The cut), so a gate or reason set during authoring is
   grooming, not divergence.
3. **Cohort documents are written only through the cohort kind's writers,** the at-cap fan-out block included (R7), so
   typed coordination entries arrive through the kind when it gains them. The cut seeds none: the fan-out block renders
   membership, and prose a map allocates to a cohort's coordination (a `cohort-coordination` destination) stays prose.
4. **Redistribution never names a cohort.** An edge on the origin resolves to members or drops, even when the origin's
   name passes to its new cohort (a same-name cohort document, `git-decompose-v3-preflight.ts`). That is the
   "shorthand for an edge on each member" answer to the relations work unit's question 1, as decomposition practices
   it today. If relations admits cohort endpoints, a `replace` disposition gains a cohort target in the lineage kind,
   which is relations' change.

## The workflow's end state, for the cutover's flip rewrite (Owner, 2026-10-16)

The rewrite is `storage-cutover`'s; this member states the end state, step by step against today's
`decompose-work-unit.md`:

1. **Preconditions** add where the cut runs (§ The cut): a started origin's in its own checkout, a stub's from any.
2. **Preflight and the map** stay, under the store version's map schema (§ Domain rules carried). The starter map
   binds the origin by its source units' digests and its edges; the planning profile follows the origin's `Design`, not
   the artifacts present (`inferPlanningProfile`); the authoring slots gain Purpose for each cohort document the cut
   creates; the workflow names the schema's published shapes (`arc schema get` with its identity) and passes the
   completed map by path to the additive batch, after which the cut reads it from its record by slug (§ The cut).
3. **The additive batch** replaces dispatch, for either shape, with no candidate branch, protection arm, or commit.
4. **Authoring** stays, through write-back, with today's specification reviews; under a draft profile the member
   specification review has nothing to review.
5. **The distribution approval** stays the one semantic stop, and authorizes the terminal batch. Its preview — the
   lineage record and removals, or the extraction's retained bytes — is surfaced at that stop, and the retained-bytes
   review runs before it, so today's separate finish-preview stop goes: the terminal batch runs right after, in the
   same session, and its revalidation refuses if anything it read has changed (R4). On direction, a rejection runs the
   discard batch and a revision the revision batch, after which authoring resumes (§ The cut, step 5).
6. **The terminal batch is the landing.** Release, base advancement, push, and integration go, and with them the
   commit whose footer had no origin artifact left to name. A retirement ends with the origin's checkout removed or
   released, or names `arc teardown <slug>`. An extraction's owner then reconciles the surviving origin's task list
   and pointers through write-back, as today's finish requires.
7. **Readiness** reads the frontier from `arc status --project` or a slug.

The verb's mode names are the spec's.

## Success signal

- **Before the flip nothing changes:** `arc decompose` runs today's in-repo arm, and the dispatch in `handleDecompose`
  sends no invocation to the store version.
- **From the flip, on the reference backend,** a retirement and an extraction each run end to end — additive batch,
  authoring through write-back, terminal batch — and a discard leaves the members only in `history`. Each refusal
  fires where its condition holds, and the cut completes after its remedy (R8).
- **A cut's reads stay flat** in the records it touches (R5): the origin's group, the selected cohort documents, the
  existing homes, and the dependents a listing names, each read once through the store, with no per-branch reads.
- **The cutover's rehearsal** lands a representative cut on a copy without post-transition repair, the evidence
  `decompose-core-hardening` and its parent close on (§ Coordination).

## Alternatives

- **Reroute every module onto the in-repo implementation** — the cohort's default and the consumer map's end states.
  Rejected: nothing runs it before the cutover, and the path-keyed planner makes it a rewrite either way.
- **Defer the rebuild past the cutover,** post-flip `arc decompose` refusing until a follow-on lands. Rejected (Owner,
  2026-10-16): it moves work into the program's tail and register key 49 to a new owner, for a version the reference
  backend can verify now.
- **Delete today's machine in this member.** Rejected: it changes behavior before the flip and drops the hand
  procedure's tooling, for nothing the deletion pass does not already do.
- **Stage the cut machine-locally, then write one batch.** The members, cohort document, and edges would be prepared
  and authored in a staging area on one machine, and written in one batch on approval: nothing shows before it is
  final, and a rejection leaves no trace. Rejected (Owner, 2026-10-16): it is a second write-back, one that creates
  records where the projection's refuses to, with its own layout, read-back, checks, resume, and cleanup, held on one
  machine — the larger build, and the Git-adjacent machinery the rebuild sheds.

## Unknowns and Assumptions

- **Verified on the reference backend only** until the cutover's rehearsal; the first real cut runs after the flip.
- **A retirement reads no Git.** Its origin is a stub or a Planning work unit, which from the flip holds no branch
  (D17) unless it started before the flip, when its `plan/<slug>` link is read only as R2's branch authority; code
  stays with an extraction's surviving origin, and a `document` home refuses (§ The cut, Existing homes). To confirm
  at spec.
- **The store version's map schema:** its identity, and what lifecycle's graduation needs from its types, are settled at
  spec, with the cut-map kind's name and stored path (§ Coordination, `storage-ref-backend`). The kind adds a fourth
  machine record to the work-item family, which D5's families table lists as three, so this member's spec amends D5
  forward, as `spec-seam-lifecycle.md` § 18 records its amendments to shipped specs. It amends
  `spec-seam-record-kinds.md` forward the same way, for its § 2.2 production registration set, which the kind's parser
  and write policy join (`PRODUCTION_REGISTRATIONS`, `lib/store/kinds/registrations.ts`), for the
  `lineage.cut-in-flight` row beside `lineage.inbound-held` in its write-check table, and for the cohort kind's fan-out
  writer (R7).

## Scope boundary (Won't Do)

- Change `arc decompose` before the flip beyond the dispatch, or fix the held defects, which the hand procedure carries.
- Reroute today's modules onto the in-repo implementation.
- Delete today's machine — the cutover's deletion pass.
- Change the workflow's text — the cutover's flip rewrite, from § The workflow's end state.
- Decide when a concern decomposes (`decomposition-doctrine`), render ROADMAP or status (`seam-status-roadmap`), or
  tear down a decomposed origin (lifecycle's, built).

## Coordination

- **`storage-cutover`:** its deletion pass gains today's decomposition machine — every module the store version does
  not import, with `decompose-candidate.ts`'s callers in teardown and in-flight derivation. Its rehearsal is the store
  version's first run on the ref backend and, run as a representative cut on a copy, the evidence two cohorts close on
  (the `decompose-scaling` bullet below). Its flip rewrite takes § The workflow's end state. Routed at draft close.
- **`storage-ref-backend`:** the cut-map kind (§ The cut, What this accepts) takes the stored path
  `cut-map-<uid>.json` on the work item's ref. Never projected, it ends in the owner's UID, as `work-item/record`'s
  `errand-<uid>.json` does (its spec § 3.2). Coordinated by direct message to its session rather than a capture, since
  its registry is mid-build; its reply (2026-10-16) found the path fits § 3.2 and needs neither backend code of its own
  — its codec derives paths from `RefHome`, and its shared suite enumerates registered kinds — nor an advance
  reservation, the generic collision rules claiming the path once the kind registers. This member registers the kind
  after that branch lands, as it prefers: its catalog entry, its mechanism with `RefHome`, its parser and write policy,
  and fixture support. That is an ordering, not an edge, since either order works: should this member land first, that
  branch sets the kind's `RefHome`, as its spec sets one for every kind whose family has a ref (§ 3.2). The cohort
  amendment records it. Its spec has a decomposition's children created by the batch that ends the origin (§ 6.6,
  § 7.4), where this member creates them one approval earlier and an extraction never ends its origin; that departure
  goes to it the same way. The name and path settle at spec.
- **`seam-locus`:** in-flight derivation's candidate-branch arm (`lib/git/in-flight-derivation.ts`) goes with the
  in-repo arm. And the cut's held-entry refusals — preflight's and the terminal batch's on the origin, step 5's on a
  removed stub — decide on the inbound kind's grammar, which is that member's to declare (shared decision 9); until it
  does, they admit, as record kinds' held-entry rules do. Coordinated by direct message to its session; its reply
  (2026-10-16) confirms each entry is nameable by its `_Id:_` and versioned, and moves by
  `arc route <entry-id> --from <slug> --expected-version <version> --to <destination>`, a stale version refusing (its
  spec § 6.1, § 6.3, § 7.2, on its branch). Naming each held entry is this member's addition; `meta.inbound-held`
  reports only that some are held.
- **`seam-status-roadmap`:** decomposition writes no ROADMAP after the flip (R6). From the flip a retired origin,
  decomposed or abandoned, has no status row, since the terminal batch removes its primary; status reads its lineage
  only for an edge still naming it, an in-flight or paused dependent's awaiting its own reconcile (record-kinds § 7.4).
  Between the batches status shows the members and new cohort documents as ordinary stubs and cohort documents and the
  origin as live, with no cut-in-progress mark, so status relies on no `work-item/cut-map` record (that member's reply,
  Owner-approved, 2026-10-16). Coordinated by direct message to its session.
- **`decomposition-doctrine`** (Planning, held until the storage work completes): its entry rules — a draft origin
  gives member drafts, a finalized spec gives member specs — which the planning profile already follows. And its
  member baseline (Owner, 2026-10-16): the doctrine proposes that a cut "mint a usable readiness baseline per member",
  against which the member's first session re-validates the contracts it consumes (`draft-decomposition-doctrine.md`
  § Member baseline). This member records none. Each of the cut's batches lands at a state version (D2), which the
  contract reads as of (`read`, `list`) and diffs from (`changes`), so a baseline is a state version. Whether a first
  session re-validates against it, and where it is kept if it must be, are the doctrine's; keeping it changes a record
  kind's schema, which the kind's owner makes. Pinning it in the lineage record was set aside: lineage covers
  retirement and not extraction, and nothing would read it yet. Routed at draft close.
- **`work-item-relations`** (planned, after `storage-cutover`): § Forward compatibility with `work-item-relations` —
  the provider-keyed edge handling, and redistribution to members as the input its open question 1 waits on. One seam
  is its to settle: a copied `task` edge whose task annotation (its D2) stays in the origin's task list. Routed at
  draft close.
- **`decompose-scaling` and its cohorts (Owner, 2026-10-16).** `decompose-scaling` (planned, never started) retires
  now. Its Git-subprocess costs — local-branch discovery, repository-plan hydration, and the execute half — sit in Git
  machinery that changes nothing before the flip (§ Direction) and goes in the cutover's deletion pass, and a cut's
  record reads from the flip are this member's (R5), which answers the stub's one inbound entry, to re-measure against
  the store. Its two scanner costs — locator resolution parsing and canonicalizing every unit per lookup, and the
  document prefix re-encoded at each unit boundary (`resolveV3DecomposeContentLocator`, `byteOffset`,
  `decompose-content.ts`) — carry with the scanner unchanged, unobserved at current scale, and the retirement records
  them as out of scope, as the subcohort's closeout criteria allow. That leaves `decompose-core-hardening` with no
  open member, and `decompose-transform-integrity`, whose direct members have shipped, with only that subcohort. The
  subcohort also closes only on "a representative real cut" showing its shipped members' properties "without
  post-transition repair" (`cohort-decompose-core-hardening.md` § Closeout criteria). Today's machine has given none:
  the storage seam's cut ran by the workaround procedure, crossing failed controls (`RELEASE-GATES.md`
  § Decomposition until the cutover). Both cohorts close on the cutover's rehearsal, a representative cut on a copy,
  which the subcohort admits as evidence (its § Soft coordination); neither closeout criterion is amended. Routed at
  draft close.
- **`cohort-storage-seam.md`:** takes § Direction's departures at draft close, in § Soft coordination and in § Members'
  `seam-decomposition` Exposes, which reads "a cut as one multi-record `batch`". § Soft coordination, Parsers and field
  schemas, also takes this member's ownership of the cut-map kind, the `lineage.cut-in-flight` rule it adds to record
  kinds' lineage kind (§ The cut, What this accepts), and the fan-out writer it adds to their cohort kind (R7);
  § Cross-cohort takes the kind's registration after `storage-ref-backend` lands (the `storage-ref-backend` bullet
  above); and § Members' `seam-decomposition` Consumes gains locus's inbound kind, whose grammar the held-entry
  refusals read. Amended at draft close, 2026-10-16.

---
