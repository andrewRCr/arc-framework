# Draft: Seam Locus, Session-Init, and Personal Surfaces

- **Origin:** [internal] — the `storage-seam` cut (2026-10-09); stage 2 of the storage program.
- **Purpose:** Derive locus and what is in flight from the checkout marker plus the store, route session-init's state
  reads and the personal surfaces through the storage contract, and own the entry grammar the inboxes, inbound lists,
  and Errand descriptions share.

---

## Inbound dispositions

Each entry routed in before this pass, folded at the owner's planning pass (2026-10-12), its content in the body:

| Entry (from `storage-ref-backend`, 2026-10-10)              | Outcome | Fold location                                      |
| ----------------------------------------------------------- | ------- | -------------------------------------------------- |
| Call `maintain()` at handoff and report the growth figures  | `fold`  | § Locus, "Tripwires at handoff (D10, D11)"         |
| Retry restate and recovery on an unresolvable state version | `fold`  | § Locus, "State continuity across clones (key 52)" |

---

## Continuity

- **Readiness:** formalization-ready (2026-10-12), grounded at source, with the first adversarial pass's fifteen
  findings, its fix check's twelve, the second pass's eight, their fix check's ten, and the third pass's eleven, their
  fix check's nine, and the fourth pass's seven, their fix check's six, and its second round's seven folded, the third
  and fourth passes over the cap at the Owner's direction; the loop then stopped at the Owner's direction, leaving the
  second round's repairs and lifecycle's folds beside them, chiefly the survivor and receipt rules, unreviewed; the
  post-settle re-read then ran; at `create-spec`'s entry a third round checked those repairs, and its six were folded,
  with no further round, since the spec's finalization pass attacks the same rules. The 2026-10-12 pass re-verified
  the inherited rows (`notes-seam-locus.md`), folded both inbound entries, took every sibling decision and ask that had
  landed, settled this member's own open items with the Owner, and checked the design against the storage, procedure,
  and knowledge evolution strategies.
- **Resolved (2026-10-12):** item 9's executing arm, onto lifecycle's routing answer; the tripwire bounds; one inbox
  listing; the six entry grammars and the ID's placement; the cold start and the anchored marker; key 55's Errands and
  its state-target overlap; the removal callers, against lifecycle's approved removal function and check; the pause,
  with the paused-work slot and `arc locus release`; the back-pressure and pause-review settings; the slots' schema
  registration; the unreachable `Commit at Handoff`; the success signal; from lifecycle's last asks, D16's listing of
  commits not yet closed and the Errand close's capture and close time; and, from the first adversarial pass, the
  routing verb (`arc route`) with its source, version, and destinations, the marker's exclusivity with in-place anchored
  markers, the back-pressure slot's two readers, the widened `arc materialize`, the projection's release slot, and
  `resolveActiveWu`'s body; and, from the second, the Errand queue's rank keys, promotion and graduation in place
  writing the anchored marker, the primary's anchoring under partial protection, one listing verb (`arc inbox`) for
  every entry list, routing receipts by the inbox a move touches, carrying the move's time, and the routing verb's
  fields and `_Created:_` stamp; and, from the third, the receipt writers and their source list, where an abandon
  returns an entry, the survivor derived in the listing, the target-line spellings the module reads, and the queue keyed
  by the referenced entry's ID; and, from its fix check, where each slot action runs, paused work units counted for
  overlap, and the commits listing's floor at the one the branch link records; and, from the fourth, the carry of
  checkouts claimed in place before the flip and a survivor's carry through the routing verb; and, from its fix check, a
  survivor read from the latest receipt touching its inbox and the carry's versioned write and `_Cites:_`; and, from
  lifecycle's fourth pass, promotion's work branch at both floors, the listing's lost-bound report, and the
  orphan-branch sweep's offer for an adopted branch; and, from the second round, a survivor whose home takes nothing
  listing as ordinary work, `_Cites:_` dropped on a move, the receipt keyed to the list its reader names, in-place
  resume among the arms that write no marker, and the slot rule's text arm for a repair needing the agent's input; and,
  from the third round, a retired home listing as ordinary work, the floors a rebase can drop, the orphan sweep's
  `git branch -D` for every merged branch, the listing actions named in text, and a cross-inbox move's receipt in each
  inbox's ref.
- **Open:** two row placements wait for spec (§ Unknowns and Assumptions).
- **Next:** `create-spec`, whose review attacks the survivor and receipt rules first. Under `cohort-storage-seam.md`
  § Coordination's safety net, this spec is approved only after lifecycle's, with a re-read of what it consumes: the
  seed answer, the routing answer, the removal function and check, the anchored-checkout arms, rename's no-move resolver
  and its marker lookup, branch adoption's rename, the prepared-write protocol, the pause and the verbs it refuses, the
  task close verb and its capture set, the floor the branch link records, and the lost bound's refusal, with
  deactivation's report of commits not yet closed, promotion's work branch at both floors, an adopted branch never
  deleted, the widened `arc materialize` with its in-place marker and its refusal while any checkout with no marker
  holds the branch, the floors a rebase can drop, the base-branch activation
  arm, one marker per work unit with graduation's in-place marker (`atomicGraduate`'s in-place occupation), and
  `arc handover`'s and `arc pause`'s optional slug.

**Reading this draft.** `cohort-storage-seam.md` holds the seam's coordination, its scope boundary, and how the
register's keys are cited. A `§ Shared decisions` item lives in its owner's design record: items 1–8 and 11 in
`spec-seam-record-kinds.md`, whose `§ Shared decisions` maps those numbers to their current contract sections; item 9 in
`draft-seam-locus.md`; and items 10 and 12 in `draft-seam-lifecycle.md`. `§ Record kinds` resolves to
`spec-seam-record-kinds.md`'s `§ Proposed Design`. `§ Lifecycle`, `§ Decomposition`, `§ Delivery and review records`,
`§ Locus`, and `§ Status and roadmap` name the member sections of `draft-seam-lifecycle.md`,
`draft-seam-decomposition.md`, `draft-seam-delivery-review.md`, `draft-seam-locus.md`, and
`draft-seam-status-roadmap.md`. `D` and `A` numbers are `spec-storage-contract.md`'s decisions and amendments.

## Decisions

### Shared decisions

This member owns item 9 of the seam's shared decisions, settled before the cut (Owner, 2026-10-09); `seam-record-kinds`
owns items 1–8 and 11 and `seam-lifecycle` items 10 and 12, and `cohort-storage-seam.md` § Shared contracts names each
item's consumers.

9. **Entry managed fields** — settled (Owner, 2026-10-09). `inbound-routing-method` shipped as specified (PR #860), its
   amendments touching nothing this item consumes, so none of it is provisional on that work unit. The contract settles
   `_Id:_`, eight hex characters stamped at capture or else at first persist (D6; `stampEntryIds`,
   `lib/store/concurrency/stamp.ts`); the routing receipts and the survivor they reveal, an entry edited while a routing
   removed it, whose `_Routed:_` line this member derives in the listing rather than stores (§ One entry listing, a
   forward amendment to D11); the Errand queue that replaces `_Disposition:_ execute-bound`; and `_Hold:_` as the retain
   escape hatch only (D11).
    - **One grammar for every entry list** — the personal and project inboxes, `WORKING-MEMORY`, a work unit's inbound
      list, and an Errand's description. A managed field is ``- _Name:_ `value` ``, its backticked value marking it
      parsed, as today (`lib/session-init/managed-field.ts`), grouped apart from the bare prose descriptors (§ Locus); a
      `WORKING-MEMORY` entry instead carries its one field, the `_Remove when:_` trigger, as an italic line under its
      header (`WM_REMOVE_WHEN`, `lib/user-sync/parser.ts`). One module defines each field once, and each kind's parser
      admits the fields it uses. The module reads a field in every spelling today's entries carry and writes only the
      managed form: `_WU_Target:_` in the three spellings the capture gates accept (`TARGET_LINE`,
      `lib/user-sync/inbox-target.ts`), since a missed target line would let a gate pass, and `_Shapes:_` as a bare
      prose descriptor too. Locus owns the module, the inboxes, the drain, the routing verb, and the inbound list and
      Errand description kinds, whose parsers admit the module's fields and whose writers the routing verb uses.
    - **`_Created:_`** (`YYYY-MM-DD`) is the date the entry entered its current list, or was last retained or adopted
      there: capture stamps it in an inbox, the drain's retain and its owner adoption re-stamp it beside `_Hold:_` so
      the reminder floor runs from then (`drain-inbox.md`; `strategy-session-operations.md` § USER-INBOX), and the
      routing verb restamps it on every route except into an Errand's description, which keeps the date: an Errand's
      start moves the entry unchanged, an abandon returning it to the list it left keeps the date the reminder nudge
      reads, and one setting it in a list it never held restamps it (§ Where an abandon returns an entry). The
      back-pressure slot reads it too, for the oldest pending inbound entry's age (§ Locus). From the flip the date
      leaves today's prose `_Routed from:_` line, which keeps naming the origin, with the entry's ID (D11); that amends
      the line's `routed from <origin>, <date>` shape in D11 and in `inbound-routing-method`'s D4, and a capture routes
      the change to `storage-cutover`, whose flip rewrite takes that work unit's from-the-flip binding as its target
      (§ Locus).
    - **`_Remind:_` and `_Hold:_`** (`true`, or absent) are personal-inbox fields, carried unchanged through an Errand's
      description: capture writes `_Remind:_` and the drain `_Hold:_`, and session-init's nudge reads both
      (`inbox-reminders.ts`) and its routable count `_Hold:_` (`isRoutableEntry`, `inbox-state.ts`).
    - **`_WU_Target:_`** is a slug with an optional `(planned)` or `(provisional)` hint, or `TBD`, on Work Unit
      captures. Capture writes it, the drain's gate reads it as its first candidate, and the user-reference reconcile
      rewrites a former slug (`user-reference-reconcile.ts`), reading through the module from the flip, so its match on
      the managed spelling alone (`MANAGED_TARGET`) no longer misses the other two; until then it matches as today. It
      keeps its name: entries drain, so `naming-conventions`' rename rewrites only the live ones.
    - **`_Shapes:_`** names the decision or section of its target that the entry shapes, on Work Unit captures and
      inbound entries. Capture or the drain's gate writes it, and the gate and the owner read it. It is parsed from the
      flip, its bare prose form included, and stays a prose descriptor until then.
    - **`_Cites:_`** (an entry ID), from the flip, on inbound entries and Errand descriptions: the routing verb writes
      it when it carries a survivor's new content into a list the router may not edit, naming the entry that content
      supersedes (D11), and the list's owner reads it beside that entry (§ Locus, "The routing verb"). It names an entry
      of its own list, since an ID is unique only within its list (D6), so every move out of that list drops it, the
      routing verb's and the abandon's.
    - **Where a work unit past planning takes its entries** is lifecycle's answer (`draft-seam-lifecycle.md`
      § Lifecycle, "Routing into a work unit past planning"). A Planning work unit takes routed entries as today. An
      Active one is no default home: routing proposes a route out, and an entry the Owner admits lands as a spec
      amendment or new tasks, which the work unit's owner writes, held for the owner when the owner is not at the door.
      An Integrating one takes nothing, as a completed one does, so a late concern goes to a follow-on, or the owner
      reopens the work unit (`arc reopen`). Session-init shows the current work unit's pending count and, past the
      thresholds, its owner's re-triage action (§ Locus, "Inbound back-pressure").
    - **Nothing stays held past an exit.** From the flip the write check refuses moving a work unit to Active
      (lifecycle's answer), to Integrating (`arc publish`, `runPublish`), or to the archive, and refuses retiring it by
      a cut or abandonment, while its inbound list holds an entry, naming them (`meta.inbound-held`,
      `lineage.inbound-held`; item 11); planning readiness confirms none is held. Before a cut the owner folds each held
      entry into the origin's draft or spec, whichever the cut copies to every member (a spec through `amend-design`),
      or re-routes or dismisses it; before an abandonment, re-routes or dismisses it. Until the flip, activation's and
      verification's capture gates (`arc user inbox-list --target`, PR #899) carry the property.
    - **The routing method moves first.** Lifecycle's Errand (`USER-INBOX § Errand`, "Make the routing method route out
      of a work unit past planning by default") gives `route-discovered-work` its Active and Integrating arms ahead of
      the flip, amending `inbound-routing-method`'s D2, where only a completed work unit is no routing target.
      `storage-cutover`'s flip rewrite carries both arms onto the inbound list beside the `_Routed from:_` change, and
      its inbound entry for the seam's flip-rewrite obligations finds the Integrating half already in place. The rest of
      hold-and-route stays as today until the flip.

## Members

### Locus, session-init, and personal surfaces

- **Rows and keys.** Locus derivation, `DerivedLocusFrame`, from the marker plus the store (33); in-flight derivation
  and the oracle behind `WorkUnitStateResult` and `ErrandStateResult` (29), with lingering refs demoted to locus hints
  (14); the notes-related probes, `UserSessionInitStatusResult`, and user-reference reconciliation (31); the
  `currentWuReconcile` and `StaleWorktreeSweepResult` slots, and `retiredSubdirs` removed or rewritten over the store
  (32); the worktree roster and the single-meta callers on the locus side (47) — `resolveActiveWu`'s body
  (`lib/release/wu-resolution.ts`) onto the contract's current-work-unit resolver, and locus's own
  `readActiveMetaCandidates` callers, the cold start's occupancy check and `resolveOriginatingMetaPath`, while lifecycle
  moves its executor, verb, and handler callers (`draft-seam-lifecycle.md`) — with the Candidate mutation owner
  (`resolveCandidateMutationOwner`) resolved from the marker plus stored lifecycle facts; state continuity anchored on
  the state version for handoff restating and recover audit (52), beside a retained code-head baseline, never in place
  of it, since code identity, progress, and preservation still validate against Git (D2, D20); `arc user add`,
  `arc init`, and `arc join` creating an identity's first records only when absent, from the flip (54; locus takes the
  key's share of `storage-cutover`'s `lib/setup.ts` row, where `runPostInitSetup` seeds `USER-INBOX` and
  `WORKING-MEMORY` for `arc init` and `arc join` unconditionally today, leaving cutover the row's keys 18 and 22; Owner,
  2026-10-12); `arc errand check`'s overlap through a store query for state targets, listing in-flight Errands beside
  work units (55, Owner 2026-10-12, whose rows `notes-seam-locus.md` derives); the drain side of hold-and-route (21);
  the register's session-init path row — slot paths and load-set entries from the layout resolver, and the compaction
  seed's schema version bump; and the Errand index projection in `lib/errand/record.ts` with the locus consumers'
  listing protocols (key 62's surviving half; the review gate's stay with delivery and review).
  `session-init-performance`'s notes items go with these reads (key 10). Handoff's routing of base and notes sync to the
  primary stays `handoff-optimization`'s (key 41). `notes-seam-locus.md` re-verifies the 63 inherited rows at
  `327d4178a`, with their corrections, the consumers no row covers, and where the session-init reroute lands
  (`handleSessionInitStatus`, `handlers/status.ts`).
- **An identity already in use (Owner, 2026-10-09).** From the flip, when `arc user add`, `arc init`, or `arc join`
  finds the identity's records already in the store (54), it says so and asks the person to confirm the identity is
  theirs; a run that cannot ask reports it in its result. It warns and never refuses, since a slug cannot tell the same
  person's second machine from a second person who chose the same name, and it misses two people who both set up
  before either syncs. Before the flip this repository keeps notes local, so there is nothing to compare against.
- **Errands and claims list apart.** Project-scope Errands and identity-scoped grooming and housekeeping claims are
  acquired separately, each at a pinned version with absent, unreadable, and complete outcomes and per-entry diagnostics
  (today `readTransientIdentitySnapshot`'s `absent`, `error`, and `complete`); an Errand-only listing never replaces the
  claim snapshot, and review admission still requires a complete listing with no diagnostics (D4, D5, D10).
- **Overlap for a state target (key 55; Owner, 2026-10-12).** From the flip `arc errand check` resolves a state target
  through the layout resolver to its record and reports overlap when that record's own work item is in flight in another
  locus. An entry-merged kind — an inbox, an inbound list, an Errand's description — reports none, since its writes
  merge by entry (D6), and any other concurrent write still meets compare-and-swap at write time (D11), so the check
  stays advisory. Code targets keep today's committed and uncommitted probes, and the in-flight set keeps listing
  Errands beside work units, as it has since PR #919 (`projectInFlightToOverlapRoster` projects each Errand by slug, and
  `detectForeignArtifactOverlap` excludes the checkout running the check); a paused work unit counts, through both
  probes, since a pause keeps its checkout and any edits in it, where today's skip of parked work units
  (`scheduling: "parked"`) rests on park's teardown of the checkout (`parkActive`, `lib/work-unit/verbs/park-resume.ts`)
  and retires with park; from the flip each excludes itself by its own identity. The store's write provenance names the
  verb, the record, and its owner, never the work item that wrote it (D3), so the work item in flight carries the state
  arm rather than `changes`.
- **The Errand close's landing commit (from the flip; D15).** The close (`lib/errand/close-runtime.ts`) captures the
  Errand's landing commit on its record, and that capture names its repository by the project ID, as every commit
  capture does (A6, D14). The close write stamps the record's `updatedAt` as the close time, by which lifecycle's
  archive listing orders closed Errands (`draft-seam-lifecycle.md` § Shared decisions, item 10); today the await-merge
  write bumps it (`close-runtime.ts`). Until the flip it captures nothing.
- **The Errand's branch link (from the flip).** `arc errand open` writes the Errand's branch link recorded `created`,
  the created-or-adopted record lifecycle adds as a required field of the strict `LinksSchema`'s branch entries
  (`lib/store/links.ts`), the base links of both work-item kinds, since it always cuts the branch, by `checkout -b` in
  place or `worktree add -b` spawned, and beside it the floor every branch link records, here the tip it cut the branch
  from; promotion, the same at both floors, cuts the work branch `<type>/<name>` (`--type`, default `feat`) at the
  Errand's tip, switches the checkout onto it, and links it beside the Errand's branch recorded `created` with that same
  floor, keeping the Errand's commits in the close's default capture, where today it renames the Errand branch, to
  `plan/<name>` at the derivation floor (`promotionBranch`, `lib/errand/promote-runtime.ts`), which this member's
  reroute of the module changes (`draft-seam-lifecycle.md` § Lifecycle, "Rename and promotion keep the work item's
  identity"); and the import records `created` and the tip it finds for an open Errand's branch
  (`draft-seam-lifecycle.md` § Lifecycle, "Which branches ARC reaps"; Owner, 2026-10-12).
- **Former slugs.** From the flip the reconcilers (`current-wu-reconcile.ts`, `user-reference-reconcile.ts`) resolve a
  former slug from the live primary through `lookup` and list lineage only for terminal outcomes, keeping their
  fail-closed outcomes: the current-work-unit reconcile's refusals, `ambiguous-evidence` and `rename-cycle` among them
  (`DependencyReconcileConflictReason`), and the user-reference reconcile's unavailable authority and per-entry conflict
  advisories (`resolveReferenceTransition`). Until then they read today's transition records and disposition receipts
  (§ Lifecycle).
- **From the contract's Part B.** Lifecycle anchoring and `arc start --here` (D17). Branchless planning's read half:
  locus derived from the marker and the store, the marker's exclusivity guarding the locus (below). The session-start
  scratch reconcile through `lookup` (D5): a folder whose work unit was renamed follows its current slug, one whose work
  unit ended is removed and reported, and a name resolving to no work unit is left and reported; a promoted work item's
  folder reconciles as a fresh start's does (`draft-seam-lifecycle.md` § Lifecycle, "Rename and promotion keep the work
  item's identity"), and the tests include one. The session-notes path session-init's load set and handoff resolve (D5).
  Removing the spawn's `SESSION-NOTES` seed: `scaffoldIntoWorktree` (`lib/git/worktree-scaffold.ts`) writes the meta,
  calls `runUserOpen` for the workspace and its `SESSION-NOTES` seed, and writes the ownership marker; from the flip the
  meta and its session context are written through the store, the `SESSION-NOTES` seed and `arc user open` go, and the
  marker stays machine-local (Owner, 2026-10-09). `runUserOpen` also runs from `arc user open` (`handlers/user.ts`),
  which `activate-work-unit.md`'s workspace step invokes and the flip rewrite removes, and from the executor's open arm,
  which lifecycle removes (§ Lifecycle).
- **The marker's exclusivity (D17, from the flip).** Branchless planning gives up Git's refusal to check out one branch
  twice, so the marker carries the guard. Every verb that writes a work-unit marker first reads the derived roster and
  refuses when another registered checkout's marker names the same work unit, naming that checkout: `arc start --here`,
  the spawn, `arc materialize` in either arm, and Errand promotion, whose fresh slug never collides
  (`convertSpawnedMarker`). Derivation reports two markers naming one work unit as unresolved for both rather than
  choosing one (A10). Since derivation reads only the marker and the store, every in-place arm writes an anchored marker
  (`spawnedByArc: false`): `arc start --here` in both its arms, the cold start (§ The cold start) and graduation in
  place (`runGraduate` with `inPlace`, `commands/start.ts`), and `arc materialize --here`. Graduation runs through the
  executor's atomic graduation, whose in-place occupation checks the branch out with no marker (`occupy`,
  `lib/work-unit/atomic-graduation.ts`), so the marker is written there, inside its rollback; materialize runs through
  `reconcileWorkUnitWorktree`'s in-place leg, which writes none today either. Both sites are lifecycle's: its spawn and
  materialize call locus's check, and its in-place arms write the anchored marker (`draft-seam-lifecycle.md`
  § Lifecycle, "One marker per work unit"). Errand promotion's marker is locus's (`lib/errand/promote-runtime.ts`, keys
  45 and 46): on a spawned checkout promotion converts the transient marker (`convertSpawnedMarker`), and on the
  primary, where today it removes the transient marker (`removePrimaryTransientOccupancy`, called by
  `settlePromotedOccupancy`), from the flip it writes an anchored work-unit marker in its place, so the work unit
  carries on where the Errand ran (Owner, 2026-10-12). The guard is per machine, as markers are; across machines the
  work unit's owner governs. Until the flip Git's refusal and `coldStartOccupancyRefusal`, which checks only its own
  checkout, stay as today.
- **The cold start (`runColdStart`, `commands/start.ts`; D17).** Lifecycle's seed fix lands first, as its own review
  chunk (`draft-seam-lifecycle.md` § Lifecycle, "How `arc start --from` takes a seed"): `--from` sets `Origin` for an
  issue and passes every other seed through, and the cold start enters at `draft-design`. This member's reroute of the
  same function follows, serialized on the file. Its occupancy check (`coldStartOccupancyRefusal`) reads the current
  work unit from the marker plus the store (47), and the meta is written through the store by record kinds' creation
  writer (`renderMetaFile`), with no `SESSION-NOTES` seed from the flip. From the flip `arc start --here` writes only
  the marker and the store's records and never moves `HEAD`: the protected-base cut of `plan/<name>` and its rollback's
  branch deletion (`rollbackColdStart`) retire on the capability with the `plan/` prefix, under lifecycle's branchless
  planning. Until the flip both stay as today.
    - **The anchored marker (Owner, 2026-10-12).** Locus derivation from the flip reads the marker and the store, so an
      anchored checkout carries a work-unit marker, and that marker must grant no removal. Today a work-unit marker is
      always `spawnedByArc: true`: the marker check admits `false` only for a transient subject (`isWorktreeMarker`),
      the topology check requires `false` exactly on the primary (`validateOccupancyMarkerTopology`), and the derived
      evidence projects every work-unit marker as `true` (`lib/locus/derived-evidence.ts`); the cold start writes none
      (`writeWorktreeOwnershipMarker` with `createdByArc: false`), and the cleanup decision keys on a marker's presence
      (`decideWorktreeCleanup`, `lib/git/worktree-cleanup.ts`). Before the flip, dormant: both checks' work-unit arms
      admit `spawnedByArc: false`, meaning ARC did not create the checkout, on the primary or a linked checkout, and the
      derived evidence carries the marker's own value; every removal path keys on `spawnedByArc: true` rather than
      presence, so an anchored marker reads as `external`; `arc rename` moves no checkout ARC did not create: for an
      anchored marker its resolver (`resolveRenameWorktreeMove`) returns the holding checkout's own path with no move,
      never the `in-place` status, which names the primary (`resolveRenameCheckoutCoordinates`), while its gate
      (`applyUnderMutex`, `rename-worktree-transaction.ts`) keeps refusing a move with no marker or a malformed one
      (lifecycle's, "A checkout ARC did not create", which reads the marker this admission makes valid); from the flip
      rename finds the holding checkout by the work-unit marker naming it, through this member's roster (lifecycle's,
      "Rename and promotion keep the work item's identity"); and teardown releases an anchored checkout's marker and
      keeps the checkout (lifecycle's arm, below). Nothing writes an anchored work-unit marker until the flip, so
      nothing observable changes, and locus derivation's in-repo arm keeps reading a marker-less checkout's active meta
      until then. From the flip every in-place arm writes it, on the capability (§ The marker's exclusivity).
    - **Acceptance (Owner, 2026-10-12):** an anchored primary is no launchpad (D17). Under full protection, where
      promotion runs (`promoteOrdinaryErrand` refuses `full-protection-required`, `lib/errand/promote.ts`), an Errand
      promoted on the primary leaves it anchored and each new Errand spawns its own worktree (D17). Under partial
      protection `arc start --here` anchors the primary and `arc errand open` refuses `primary-occupied`
      (`planLocusAllocation`, `lib/locus/allocator.ts`), so a project working in one checkout runs one thing at a time
      in it, as it does today, and parallel work takes full protection's spawned checkouts.
    - **Lifecycle's arms for it** (`draft-seam-lifecycle.md` § Lifecycle, 2026-10-12): teardown releases an anchored
      checkout's marker and keeps the checkout, the primary included ("A checkout ARC did not create"), and activation
      in an anchored checkout already on a branch adopts that branch as the work branch, renaming it to `<type>/<slug>`
      in place and recording the link `adopted`, refusing a name already taken or a branch another work item links
      ("Activation in a checkout already on a branch"), except the base branch: an anchored checkout on base activates
      as a detached one does, creating the work branch at base's tip in place (the same section, 2026-10-12).
    - **Checkouts claimed in place before the flip (Owner, 2026-10-12).** Before the flip no in-place arm writes a
      marker: the cold start's write returns without writing (`writeWorktreeOwnershipMarker` with
      `createdByArc: false`), graduation's in-place occupation checks the branch out with none (`occupy`,
      `lib/work-unit/atomic-graduation.ts`), the executor's in-place spawn leg writes none
      (`reconcileWorkUnitWorktree`), which materialize `--here` runs and in-place resume too, `arc resume --here` and
      `arc start <slug> --here` on a parked work unit, and promotion on the primary removes the Errand's transient
      marker and writes none (`removePrimaryTransientOccupancy`). The import leaves the marker out as machine-local
      (`spec-storage-ref-backend.md` § 10.8), so from the flip a checkout claimed in place holds its work unit with no
      marker. Session start finds each checkout with no marker that has out a branch an in-flight work unit this
      identity owns links, and its materialize offer carries `arc materialize <slug> --here` for that work unit, with
      that checkout to run in, which writes the anchored marker; such a work unit leaves the offer's ordinary set, since
      a spawn would meet Git's refusal, and a paused one stays with the paused-work slot, whose branch-held item carries
      the same action (§ Pause, from the flip). A work unit no checkout here holds, one cold-started on base under
      partial protection among them, takes the ordinary offer. `storage-cutover`'s rehearsal exercises both
      (`USER-INBOX § Work Unit`). The import links no branch for a work unit whose `Branch` is empty or names base
      (`spec-storage-ref-backend.md` § 10.9, settled 2026-10-12), where a partial-protection cold start leaves it
      (`runColdStart` cuts `plan/<name>` only on a protected base), since lifecycle never adopts base.
- **Pause, from the flip** (`draft-seam-lifecycle.md` § Lifecycle, "Lifecycle moves from the flip"). A pause is a record
  on the work item that changes neither `State` nor placement, so a paused work unit stays in flight: in-flight
  derivation's `scheduling: "parked"` axis, built today from the lifecycle index's parked slugs (`listParkedSlugs`),
  reads the pause record. From the flip `arc materialize <slug>` gives a checkout to any in-flight work unit this
  identity owns that no checkout on this machine holds — remote-only or released here, paused or not — and leaves a
  pause in place, so a paused work unit's meta and task list stay editable (Owner, 2026-10-12; lifecycle's verb, "Pause
  replaces park"); session start's materialize offer (`findMaterializableWorkUnits`, `materializable-work-units.ts`)
  takes the same set less paused work units, which the paused-work slot lists, offering `--here` with its checkout for
  one whose branch a checkout with no marker has out (§ The cold start). Today both admit only remote-only work units
  that are not parked (`findMaterializableWorkUnits`, `handleMaterialize`). Until the flip park stays as today.
    - **The paused-work slot (Owner, 2026-10-12).** A per-identity session-init slot, `pausedWork`, lists the person's
      paused work units with each one's reason and what it waits on, marked resumable once the work unit it waits on
      ships and review-due at once if that work unit ends otherwise, abandoned or cut, and review-due once a pause
      waiting on no work unit, a note included, passes `pause.review_after_days`, a project setting beside
      `inbox.remind_after_days` (default 14); a review-due pause asks its owner to resume it, hand it over
      (`arc handover <slug> --to <identity>`), open it to takers (`arc pause <slug> --open`), or abandon it; both verbs
      take an optional slug defaulting to the checkout's work unit (`draft-seam-lifecycle.md`, "Names"), and the slot
      always passes it. Each item carries its argv, `arc resume <slug>`, or `arc materialize <slug>` when no checkout on
      this machine holds it. A checkout with no marker that still has the work branch out, released or claimed in place
      before the flip (§ The cold start), takes `arc materialize <slug> --here` run from it, where a spawn would meet
      Git's refusal, so that item's action carries the checkout to run in beside its argv (§ Every rebuilt slot carries
      an executable action); a plain `arc materialize <slug>` refuses whenever a checkout with no marker has the work
      branch out, released or claimed in place, naming that checkout and that argv, where lifecycle's text names only a
      released checkout (asked of lifecycle, "Pause replaces park").
    - **Entering a paused checkout.** The derived frame's work-unit context carries the pause record, and
      `locusGuidance` renders the pause, its reason, and the resume notes before any work starts; orientation is then
      not bare-clean, so `--next` never fires past it.
    - **`arc locus release [<slug>]` (Owner, 2026-10-12)** releases a checkout's role: with a slug, the checkout whose
      work-unit marker names that work unit, found through the roster, refusing when no checkout on this machine holds
      it; without one, the current checkout's. A spawned checkout takes lifecycle's removal check, then its removal
      function. An anchored one keeps the checkout (§ The cold start): only the removal check's projection part runs, so
      a dirty checkout does not refuse it, then the projection's `release` slot, refusing if that refuses, and then the
      marker clears; the slot persists every edit or refuses, and stays empty until `storage-projection` fills it
      (Owner, 2026-10-12). Either arm revalidates the marker generation first, and run from inside the checkout it
      releases, moves the process out first, as teardown's locus hop does (`runTeardown`). It releases a paused work
      unit's checkout for its owner, and a checkout whose work unit another identity owns — the handover case, which
      session start finds and offers as `arc locus release <slug>`, runnable from any checkout. It refuses on a work
      unit this identity owns that is not paused, naming `arc pause` as the remedy, so it never strands a live locus.
      Before the flip it refuses `unsupported`, naming `arc park` and `arc teardown`, which serve it until then.
- **Notes policies retire without successor (D12).** `user.notes_push`, `session.init_pull.notes`, and
  `session.init_load.notes` go with session-init's notes recommendations — their policy branches, the notes and combined
  prompts (`composeNotesPromptText`, `composeCombinedPrompt`, `lib/session-init/recommended-action.ts`), and the
  retired-subdirectory load dispatch (`inferRetiredSubdirs`) — while `session.remote_sync`, the worktree and base
  recommendations, and slot failure isolation stay.
- **Personal surfaces.** The `USER-INBOX` and `WORKING-MEMORY` entry-list parsers, the inbound list and Errand
  description kinds with the entry-field module (§ Shared decisions, item 9), the drain's removal by `_Id:_` and version
  from the flip (by title until then), and the Errand queue from the flip (D11). Entries key on `_Id:_`, the contract's
  concurrency library's key, rather than the bold title `parseUserInbox` keys on today (`lib/user-sync/parser.ts`) or a
  proposed `_Slug:_` field. Removal stays idempotent: a no-op that reports when the entry is already gone, since several
  backstops may replay it. Managed fields group together, blank-line-separated from the prose descriptors (§ Shared
  decisions, item 9). `arc errand open --from-inbox` and `arc errand link --from-inbox`, which from the flip take the
  inbox beside the ID, since an ID is unique only within its inbox (D6); the title-matched removals of
  `arc errand close` and `arc user inbox-remove`, both through `removeCurrentInboxEntry`
  (`commands/user/inbox-mutation.ts`); and Errand promotion's digest-checked removal (`runUserInboxMutation`,
  `handlers/errand.ts`) repoint onto the ID with the parser, and the removals onto the entry's version at its
  compare-and-swap boundary once the notes lock retires. Under partial protection an Errand has no portable record or
  description, so its origin entry stays in the inbox until close removes that exact ID at its observed version, and a
  partial abandon clears the mark and keeps the entry (D5, D11). The inbox capture's schema carries `_Shapes:_`
  (`inbound-routing-method`'s D2 test 3). The queue's verbs are locus's from the flip: `arc errand queue set`, which
  replaces `arc user inbox-mark-execute-bound` and takes entry IDs where that verb takes titles, and `arc errand queue`
  to show it (D11).
- **One entry listing, `arc inbox` (Owner, 2026-10-12).** D11's listing verb is today's `arc user inbox-list`
  (`runUserInboxList`, `commands/user/inbox-list.ts`, over `listInboxEntriesNamingTarget`), which requires `--target`
  and gates `create-spec.md`, `activate-work-unit.md`, and `verify-work-unit.md`. From the flip `arc inbox <list>`
  replaces it, `<list>` being `personal`, `project`, or a work item's slug — a work unit's inbound list or an Errand's
  description — so every list the routing verb takes from has a reader; `personal` and `project` always name the
  inboxes, and a work item with either slug is named by its UID, here and in `arc route`. An inbox row is a survivor
  when its latest receipt (§ The routing verb) moved it out of that inbox (D6: an edit racing a removal survives), and
  the row carries the home that receipt names, the `_Routed:_` of D11 derived rather than stored, so the drain carries
  the survivor's new content there (D11) and no stored line can clash with the person's edit; an entry an abandon or a
  route returned reads by its return's receipt, so it lists as unstarted work (D11), and a row whose latest receipt
  names a home that now takes nothing — an ended Errand, a work unit Integrating or completed, or one retired by
  abandonment or a cut, the homes the routing verb refuses — lists as ordinary work, not a survivor, since a survivor of
  finished work is ordinary work (D11). Where D11's line told the person why an entry came back, session start reports
  the person's survivors, naming `arc inbox personal` in its text, whose rows name each one's home, since carrying a
  survivor takes the drain's decisions (§ Every rebuilt slot carries an executable action); the projected file shows
  nothing. Each row carries the entry's `_Id:_` and version, `--target <slug>` filters an inbox to the entries naming
  that target and keeps today's `clear`, `named`, and `refused` result, on which the three capture gates branch, and for
  a work unit's inbound list the result also carries its pending count and oldest age (§ Inbound back-pressure), so the
  drain, the exit gates, session start, and the routing verb's callers read through one listing. The gates' calls move
  to it in `storage-cutover`'s flip rewrite (`USER-INBOX § Work Unit`, "Carry `arc user inbox-list` and the capture exit
  guards across the flip").
- **The entry grammars (Owner, 2026-10-12).** The entry-field module admits, per kind, a shape, the sections that hold
  entries, and the managed fields beyond `_Id:_` (`EntryConfig`, `KIND_MECHANISMS`, `lib/store/registry.ts`):
    - `personal/inbox` — heading; `Errand` and `Work Unit`; `_Created:_`, `_Remind:_`, `_Hold:_`, `_WU_Target:_`, and
      `_Shapes:_` (parsed from the flip). `_Disposition:_` retires into the Errand queue at the flip.
    - `personal/working-memory` — field-header; `Memories`; `_Remove when:_`, required, the ID following it.
    - `project-inbox/inbox` — heading; `Inbox`; `_Created:_`.
    - `work-item/inbound` — heading; `Inbound`; `_Created:_`, restamped on routing, `_Shapes:_`, and `_Cites:_`. The
      prose `_Routed from:_` line keeps the origin, with the entry's ID. The routing verb drops a moved entry's fields
      this kind does not admit, since a routed entry's home is settled.
    - `work-item/description` — heading; `Description`; the personal capture's fields whole, so an Errand's start, and
      an abandon returning an entry to the list it left, move it unchanged (D11), and `_Cites:_`: a survivor's new
      content enters as a new entry whose `_Cites:_` carries the original's ID (D11).
    - `personal/errand-queue` — heading; `Queue`; the member's `_Id:_` is the referenced entry's ID, so two appends of
      one entry merge as one member (D6's queue keyed by entry ID), with `_Inbox:_`, `personal` or `project`, qualifying
      it, and `arc errand queue set` refuses the rare ID both inboxes hold, naming both; and `_Rank:_`, the member's
      rank key, which orders the queue rather than file position, so the run order merges by entry (D6, D11;
      `spec-storage-ref-backend.md` § 3.8). `arc errand queue set` writes rank keys only for the members it adds or
      moves, through the concurrency library's placement, which re-keys tied successors in the same write
      (`placeRankedStub`, `lib/store/concurrency/rank.ts`), so two sets clash only on a member both wrote, a tie's
      re-keyed successors included. Its entries are references, never items (D11), each heading carrying the referenced
      entry's title for legibility.
    - **Declared before the import.** The last three are the kinds the registry leaves unhomed. Until each is declared
      the ref backend refuses its writes `unhomed-kind` (`spec-storage-ref-backend.md` § 5.1), record kinds'
      held-entries rules admit (`spec-seam-record-kinds.md` § 3.6), and the import's trial names the kind and refuses
      (`spec-storage-ref-backend.md` § 10.5), so the flip waits on all three.
    - **The ID joins the managed group.** Managed fields lead an entry, as today, where a `_Disposition:_`, when
      present, must be the first descriptor (`executeBoundMark`, `lib/user-sync/inbox-writer.ts`). `stampEntryIds`
      (`lib/store/concurrency/stamp.ts`) places a heading entry's `_Id:_` after its last descriptor bullet whose key has
      no underscore, which would split the group and skips `_WU_Target:_`, so this member amends its heading arm to
      place the ID after the last of the kind's managed fields, matched by name from the entry-field module's list
      passed with the entry config, since many prose descriptors also open with a backticked token, or directly under
      the heading when there is none; a field-header entry keeps its ID after its `_Remove when:_` trigger, placed after
      the trigger's last line, where today's arm places it after the trigger's first and so splits a wrapped trigger. A
      forward amendment to the contract's concurrency library, made with the declarations.
- **Off the user-surfaces resolver.** Locus moves its own callers off `lib/user-surfaces.ts`'s resolver, which stays,
  with `lib/user-surface-migration.ts`, as today's arm until `storage-cutover`'s deletion pass
  (`cohort-storage-seam.md` § Cross-cohort).
- **Hold-and-route's drain side (21).** `inbound-routing-method` moves the buffer section, the owner-adoption hold, and
  the coordination-seam rule into the `route-discovered-work` method's until-the-flip binding section, with route-now
  handing off from `arc-inbox` to `arc-errand` (its D7, D8). The flip rewrites that binding section and the hand-off,
  which spans three sites — `arc-inbox`'s route-now step, `arc-errand`'s route shape, and `run-errand.md`'s route-only
  Errand — with that work unit's from-the-flip binding as the target, as it landed (PR #860).
- **The routing verb, `arc route` (D11, D15; Owner, 2026-10-12).**
  `arc route <entry-id> --from <list> --version <version> --to <destination>` moves an existing entry, and
  `arc route --to <destination>`, with the entry on standard input, inserts a new one, route-now's door. A list or
  destination is `personal` or `project`, an inbox, or a slug: a work unit's, whose inbound list takes the entry, or an
  Errand's, whose description does. The version is the entry's as the caller read it, which the listing reports for
  every list (§ One entry listing), so the source's removal is compare-and-swap and refuses, leaving the entry in place,
  when it changed since, as the drain's removal does (D11). Each runs as one `batch` — the destination's insert, the
  source's removal, and its routing receipts — and reports the entry's ID and destination (D11). A receipt goes to the
  ref of each inbox the move leaves or enters — the person's own ref for their personal inbox, which only they write,
  and the project inbox's for the project inbox, so a move between the two writes one to each in the same batch, which
  already writes both refs — whichever verb moves the entry: `arc route`, an insert included, an Errand's start,
  `arc errand link`, or the Errand's abandon (D11's routing receipts). The receipt kinds admit today only `route` among
  the moving verbs (`writerVerbs`, `KIND_MECHANISMS`, `lib/store/registry.ts`), so with the declarations they gain the
  Errand's start, link, and abandon, as D6 has it: a receipt is written by "the verb that moves an entry". An entry's
  latest receipt is the latest of those naming its ID whose source or destination is the list its reader reads or names
  — the inbox a listing row or a start names, the description an abandon empties — since an ID is unique only within its
  list (D6), and every reader of it — the listing's survivor rows, the drain and its carry, a start's refusal, the
  abandon — reads the person's receipts and the project inbox's together, and a receipt carries the time of the move
  rather than only its date, and the list and section the move left, so the latest is decidable across the two and the
  abandon knows each entry's source: a forward amendment to D11's receipt, made with the declarations. An insert whose
  ID the destination already holds writes nothing and reports that home when the held entry's receipt shows it came from
  the same inbox and the source no longer holds it, as when two drains route one entry the same way, and otherwise
  refuses, naming both entries, since an ID is unique only within its list (D6). The drain carries a survivor through
  the move form, with the survivor's ID and version and the home its listing row carries: finding the ID already there
  from the same inbox while the source still holds it, the verb carries the survivor's content rather than moving the
  entry. Where the router may edit the held entry — in an inbox, a backlog stub's inbound list, or the router's own work
  unit's — it replaces that entry's title and prose, keeping its managed fields and `_Routed from:_` line, as a write at
  the held entry's version as the verb read it, so an edit landing there meanwhile clashes on that entry (D6) rather
  than being overwritten; otherwise, into another person's started work unit or an open Errand, it inserts the content
  as a new entry whose `_Cites:_` carries the original's ID (D11). The same batch removes the survivor at its version
  and writes a receipt, so a crash leaves the survivor or its carry, never both, and a carried survivor no longer lists.
  Anyone inserts; only a started work unit's owner removes an entry from its list, and anyone a backlog stub's (D11's
  writer rule; `inbound-routing-method`'s D5). It refuses a work unit that takes nothing, Integrating or completed,
  naming a follow-on or `arc reopen` (§ Shared decisions, item 9); a work unit retired by abandonment or a cut, naming
  the inbox and, for a cut, the successors its lineage record names; and an ended Errand, closed or abandoned, naming the
  inbox, since a survivor of finished work is ordinary work (D11). It drops the managed fields the destination's kind
  does not admit, an Errand's description admitting the capture's fields whole, and `_Cites:_` on every move, and
  restamps `_Created:_` on every route except into a description (§ Shared decisions, item 9). Before the flip it
  refuses `unsupported`, naming the routing method's until-the-flip binding, since no workflow calls it until the flip
  rewrite (D15).
- **Where an abandon returns an entry (from the flip).** An Errand's abandon returns each entry of its description to
  the list its latest receipt says it left when that is the project inbox or the abandoner's own personal inbox, and
  every other entry — from a work unit's inbound list, another Errand's description, or another person's personal inbox,
  whose receipt it cannot read — to the abandoner's personal inbox, never into a work unit's list, since a work unit
  past planning takes nothing by default (§ Shared decisions, item 9) and only a person writes their own inbox; an entry
  minted at open returns to its person's inbox (D11). An entry returned to the list it left takes the section the
  receipt records and keeps its `_Created:_`; one set in a list it never held lands in `Errand`, since it was routed to
  an Errand, with `_Created:_` restamped, since it entered a new list, and its `_Cites:_` dropped (§ Shared decisions,
  item 9). That amends D11's "the inbox it came from", which assumed a description fills only from an inbox, as
  `arc route` and lifecycle's route-out to an Errand no longer do.
- **Inbound back-pressure.** One per-work-unit computation, built with the inbound kind, reports the pending inbound
  count and the oldest entry's age against thresholds, and two places read it. Session-init's orientation carries the
  current work unit's (D11), in a slot with its full schema, and past a threshold recommends its owner's re-triage,
  naming in its text `arc inbox <slug>`, which lists the work unit's inbound list (§ One entry listing), since the
  re-triage takes the owner's decisions (§ Every rebuilt slot carries an executable action). The drain reads it
  through the same listing, and its routing plan gives each backlog stub it routes into that already holds entries one
  line with the count and oldest date and the precomposed offer to re-triage it (`inbound-routing-method`'s D5), since
  the drain grooms only backlog stubs and a started work unit's entries are its owner's. `inbound-routing-method`
  specifies the slot for the flip, and the counts in its spec's § Introduction / Context calibrate the thresholds: a
  work unit is past them when it holds more than `inbound.retriage_after_entries` pending entries (default 10, against
  about six per buffer-carrying draft) or its oldest is older than `inbound.retriage_after_days` (default 30) (Owner,
  2026-10-12). Both are project settings beside `inbox.remind_after_days`, since how often a team drains is the
  project's preference, where the tripwire bounds guard the store's scale and stay constants. It has its own register
  row. Record kinds' held-entries rules read the same kind through the store (§ Shared decisions, item 11) and admit
  until locus declares its grammar.
- **Every rebuilt slot carries an executable action (Owner, 2026-10-12).** Each session-init slot this member rebuilds —
  the seven `cohort-storage-seam.md` § Soft coordination names, plus the inbound back-pressure and paused-work slots and
  session start's materialize offer (`materializableWorkUnits`, `handlers/status.ts`) and the orphan-branch sweep
  (`orphanBranchSweep`) — carries its recommended action as a typed, executable action (argv) beside its precomposed
  text, never the text alone, where running it as given repairs the condition, as `currentWuReconcile`'s
  `recommendedCommand` and the residue sweep's `remedy.argv` already do; where the repair needs the agent's or the
  owner's input — the commits a lost bound leaves it to name (§ Commits not yet closed), or the decisions a re-triage or
  a survivor's carry takes (§ Inbound back-pressure; § One entry listing) — the slot names the command with its
  arguments in its text, as lifecycle's refusals do (`draft-seam-lifecycle.md` § Lifecycle, "Refusals name their remedy
  as a command"). Each slot registers its schema with the contract registry (`arc schema`), as `session-init-envelope`
  does, never a hand-written copy. An action whose verb works on, or writes from, the checkout it runs in carries that
  checkout beside its argv: the task close, which takes no slug and captures that checkout's `HEAD`; the reconcile's
  apply, which refuses unless that checkout's branch owns the slug (`resolveOwnedTarget`, `handlers/reconcile.ts`); the
  branch-held `arc materialize <slug> --here`, in the paused-work slot and session start's materialize offer (§ Pause,
  from the flip; § The cold start); and from the flip any writer of a work unit's meta or task list, which D6 binds to
  the work unit's own checkout. Each slot sets the checkout from its verb's own rule, and an action without one runs
  from any checkout. On a paused work unit, from the flip, a slot whose action advances the work takes
  `arc resume <slug>` as its action in its place, since the verb would refuse naming it (`draft-seam-lifecycle.md`
  § Lifecycle, "Pause replaces park"), and its text names the command to run once resumed: `currentWuReconcile` offers
  no `arc wu reconcile <slug> --apply`, and the commits not yet closed name `arc task close`. The session-init agenda
  (`composable-workflows`) stays sequenced after the seam (`cohort-state-storage.md` § Cross-cohort), so it compiles
  against the post-cutover envelope and consumes each slot without reopening it; its consuming side is its own inbound
  entry, "Dispatch published remedy actions instead of reducing them to prompt text". The seam's bounds still hold: no
  workflow text changes and no reshaping of session-init's prose conditionals before the flip.
- **`WORKING-MEMORY` headers fail loudly.** `lib/user-sync/parser.ts` recognizes an entry header only as one line
  matching `WM_HEADER` (`^\*\*.+:\*\*\s*$`), so a header that wraps past the line limit is silently folded into the
  entry before it; one sweep found three of twelve entries dropped that way. The kind's parser rejects a wrapped header
  loudly, so the write refuses before the concurrency library's entry splitter (`isEntryHeader`,
  `lib/store/concurrency/entries.ts`), which keeps the same one-line rule, could fold it into the entry before it; a
  test covers wrapped and colon-less headers. The rejection comes from the flip, with the kind's parser in its registry
  slot, which stays empty until locus moves the file's readers and writers off `lib/user-sync/parser.ts`
  (`createKindRegistry`); until then the file parses as today.
- **Session context through record kinds' writers (item 4).** From the flip handoff writes `State at Handoff`,
  `Commit at Handoff`, `Session Type`, `Next Action`, and the `## Session Context` section through the meta's field
  writers (`spec-seam-record-kinds.md` § 5.5, § 5.6), whose section writer throws on a body line that would end the
  section, and the spawn's scaffold creates the meta through `renderMetaFile`. Until the flip handoff writes
  `SESSION-NOTES` as today, and the verbs that write `Next Task`, `Last Completed`, and `Blockers` keep writing them,
  branching on the capability.
- **State continuity across clones (key 52).** Restating and recovery read as of a state version, or through `changes`
  from one. On a clone lacking an ended item's history ref the store refuses `state-unresolvable`, naming each ref, and
  the verb pulls them by name (`pull({ history })`) and retries once with no stop; a person meets the refusal only when
  that pull fails (`spec-storage-ref-backend.md` § 2.3, § 4.5). Restating from another person's anchor, when a work unit
  changes hands, restricts `changes` to project scope, since `changes` between two people's manifests carries the newer
  one's identity history whole (§ 4.6). A compaction seed's state version rests on Git's expiry, so a seed whose version
  no longer resolves is rebuilt from the current state. If handoff's anchor write refuses because nothing on this
  machine resolves its `State at Handoff` token, handoff writes the field from the current `version()`, or null. The
  import writes no `State at Handoff`, so the first handoff after the flip takes restating's existing baseline-unknown
  path (`spec-seam-record-kinds.md` § 5.5). A `Commit at Handoff` that a later history rewrite left unreachable takes
  the same path for code commits, while the state anchor still serves state, since nothing keys state to a commit's
  reachability (`strategy-storage-evolution.md` § 11).
- **Tripwires at handoff (D10, D11).** Handoff calls `maintain()`, the firing point the contract leaves open, and reads
  its own push's retry count and time waited (`spec-storage-ref-backend.md` § 12); its report shows only the figures
  past this member's bounds. Growth: a never-retiring ref — the person's `personal` or `claims`, `project/inbox`, or
  `project/registry` — past 2,000 commits or 50 MB on disk. Contention: handoff's push past one retry or 10 s waited. A
  figure past its bound names the deferred capability its tripwire guards — scheduled ref rotation for growth, and for
  contention a service backend, per-record authorization, or very high write parallelism (the contract's
  deferred-capabilities table) — for the Owner to take up. The bounds are constants beside the report, with no
  configuration key, since the signal is advisory. Before the flip the in-repo store reports no measurements and no
  retries, so the report shows nothing, and the first live figures come at `storage-cutover`'s rehearsal.
    - **Basis (Owner, 2026-10-12).** The notes-compaction advisory nudges past 2,000 commits
      (`COMPACTION_ADVISORY_HISTORY_THRESHOLD`, `lib/user-sync/compaction-retention.ts`), the nearest measured analogue:
      this repository's one personal notes ref held 739 commits after fourteen weeks, about three a day over the last
      month, in 20 MB with a whole manifest per note, where the store keeps one blob per changed file. The contract's
      design envelope expects one retry to settle a shared-ref collision (`notes-storage-contract.md` § Evidence behind
      Part B).
- **Session start pulls (from the flip).** Under `session.remote_sync` session start calls `pull`
  (`spec-storage-ref-backend.md` § 6.1). Where the store reports `designation-needed`, session start carries it as an
  orientation line with the remedy's `argv`, and `arc join` asks on a TTY or reports it the same way, never guessing
  (§ 9.3).
- **Commits not yet closed (D16, from the flip).** While a work unit has open tasks, the derived frame's work-unit
  context carries the work branch's own non-merge commits since its last capture — reachable from `HEAD` and from
  neither the last capture nor base, so a base merge adds none — and none reachable from the floor the branch link
  records — its tip at the latest activation, or where an Errand cut it — which activation, `arc errand open`, and the
  import write, so an adopted branch's earlier commits, no task's work, stay out, a promoted Errand's commits stay in,
  and the import's floor is D16's at the move (`draft-seam-lifecycle.md` § Lifecycle, "The agent does no bookkeeping";
  Owner-approved there 2026-10-12, folding after its third pass) — beside the task cursor, so session start and recovery
  both list them with `arc task close` as the action's argv (`draft-seam-lifecycle.md` § Lifecycle, "The task close
  verb"). It is the set the close captures, with the same exclusions, so the listing and the close agree. Where the
  latest bound — the last capture, or the floor before any — is not an ancestor of `HEAD`, as after a rebase ARC did not
  make, the close's default capture refuses, so the listing reports that bound rather than listing, naming
  `arc task close --commit <sha>…` in its text, since the agent picks the commits; one explicit close repairs either lost
  bound, since the capture it records becomes the latest bound (the same section, "The agent does no bookkeeping"). The
  floor is a base commit no rebase drops only where activation cut the branch at base's tip or an Errand cut it; an
  adopted branch's floor, a re-activated kept branch's, and the import's are commits on the branch, which such a rewrite
  can drop too.
  A kept branch's commits never closed before a deactivation would fall under the next activation's floor, so
  deactivation reports them, naming `arc task close` in its text, since the agent supplies the task IDs, or reports the
  bound lost, naming `arc task close --commit <sha>…`, and proceeds (`draft-seam-lifecycle.md` § Lifecycle, "Lifecycle
  moves from the flip", the Deactivate bullet). On a paused work unit the close refuses, naming `arc resume`, so the
  listing there takes `arc resume <slug>` as its action, its text naming `arc task close` to follow. Recovery lists them
  beside a matching cursor rather than stopping: a compaction between a commit and its close leaves the cursor's task
  open with its commit landed, which the cursor comparison alone reads as unchanged, and the close is the remedy. Before
  the flip tasks are ticked by hand and nothing is listed.
- **Removing and moving a checkout** (`cohort-storage-seam.md` § Cross-cohort; the function and check are
  `draft-seam-lifecycle.md` § Lifecycle, "The checkout removal function and its removal check"). The Errand's exits
  through `lib/errand/terminal-occupancy.ts` move onto lifecycle's checkout removal function, the primary keeping
  `git status` where `settleTerminalOccupancy` inspects it. The function runs inside each exit's own serialization and
  authorization, and the exits keep their preconditions: the marker generation, the branch and head match, the
  self-teardown locus hop, and the user-surface merge-up. The stale-worktree sweep, branch-gone recovery, the residue
  sweep, and `arc errand leave`'s authorization (`authorizePreservation`, `lib/errand/leave-runtime.ts`) move onto its
  removal check, where a check that cannot observe the checkout grants no removal, as today's fail-closed observations
  hold (A10); `lib/locus/primary-safety.ts`, which removes no checkout, stays as today. The sweep's removable worktree
  and branch-gone recovery's removable candidate (`lib/session-init/recommended-action.ts`) each carry an
  `arc teardown <name>` argv, as the residue sweep's `teardown.argv` does, and the sweep reports a missing locked
  registration with the unlock-and-prune remedy. The residue sweep's rename-move remedy (`projectRenameMoveRemedy`)
  takes the `git worktree move -f -f` form. `storage-projection`'s worktree lock lands only after these.
- **The orphan-branch sweep keeps an adopted branch (from the flip).** The sweep (`runOrphanBranchSweep`,
  `lib/session-init/orphan-branch-sweep.ts`) never offers `arc teardown <name>` for a branch whose link is recorded
  `adopted`, since teardown never deletes an adopted branch, so that offer would repeat at every session start
  (`draft-seam-lifecycle.md` § Lifecycle, "Which branches ARC reaps"). When the branch's commits all landed in base by
  patch identity, its `merged` verdict (`git cherry`, through `isLandedInBase`, or `isLandedInBaseStrict` on the
  local-only read, `lib/git/branch-containment.ts`), it offers `git branch -D <name>` as its gated action, since
  `git branch -d` tests reachability and so refuses a rebased branch, or one squash-merged from a single commit, which
  that verdict admits; otherwise it reports the branch kept, its owner's, naming `git branch -D <name>` in its text, the
  step lifecycle's abandon and teardown name. A branch ARC created keeps today's offers but one: where the `merged`
  verdict holds, the slot's action is the same `git branch -D <name>`, for the same reason, where today's offer is
  `git branch -d`; the slot carries it from its rebuild, and `session-init.md`'s offer text keeps `-d` until the flip
  rewrite dispatches the slot's action. Until the flip no link carries the record, so the sweep reads every branch as
  one ARC created.
- **Shipped-work readers onto placement (item 10).** The locus and session-init readers of the archive index
  (`completed-index.ts`) — the sweeps, retired-subdirectory detection, `lib/session-init/locus-classification.ts`, and
  the derived locus evidence (`lib/locus/derived-evidence.ts`), whose read the derived lifecycle evidence and roster
  consume — move onto placement and `lookup`, and none keys on an archive folder's number, which the push loop renumbers
  while the archive is unpublished (`draft-seam-lifecycle.md` § Shared decisions, item 10).
- **Prepared writes (item 12).** The artifact-group writers item 12 names are lifecycle's, `currentWuReconcile`'s apply
  among them (`handleWuReconcile`, `handlers/reconcile.ts`). Locus's slot only prepares, through the core it shares
  with that apply (`prepareCurrentWuReconcile`, `side-effects/discharge-dep-edges.ts`); today
  `handleSessionInitStatus` binds the slot's reads itself beside the same reads `buildCurrentWuReconcile` binds
  (`lib/work-unit/executor-context-current-wu.ts`), and the reroute moves both onto one store-backed binding. Locus's
  own reconciling writer, the user-reference reconcile, rewrites personal records rather than an artifact group, and
  takes item 12's shape over them: it revalidates each prepared record by its version and applies every rewrite in one
  `batch` with expected versions.
- **The compaction seed** stays a read-only projection, produced from the session-init envelope by the same shared
  load-set projection (`resolveLoadSetManifest`), never a bespoke parser. Its task cursor is derived from the task list
  and compared against the seed's baseline. It records the state version beside an explicit code-head baseline, resolves
  its meta path through the layout projection, and bumps `COMPACTION_SEED_SCHEMA_VERSION` for both.
- **The archived-but-not-torn-down frame.** Under `archive.cadence: with-integration` the meta reaches `completed/`
  before merge and teardown, and an interruption there leaves a durable role whose subject is `subject-unresolved`.
  Archival as a store write at or after merge (key 15, lifecycle) removes the interval; this repository runs
  `archive.cadence: manual`, where it does not arise. Locus over the store keeps arbitrary missing or ambiguous subjects
  fail-closed. Verification: archive-before-merge restart, merge-before-teardown, partial teardown, retained-control
  finalization, and missing or ambiguous completed-subject negatives, across reader, session-init, and recovery tests.
- **Lingering refs.** PR #660 made shipped lifecycle authority outrank stale `plan/` and `feat/` refs, keeping them as
  cleanup evidence. In-flight derivation over the store makes a lingering ref a locus hint, never lifecycle authority;
  the ref itself retires with branchless planning and lifecycle's ref-set reap. Verify the dependency-discharge consumer
  reads the store's answer. Nothing yet outranks a decomposed origin's lingering ref: while its remote `plan/` ref
  exists, `arc status` reports it `Planning · active` and the next ROADMAP render lists it In Flight beside its own
  members. Both reach `resolveProjectReadinessComposition`, `arc status` through `resolveComposedLifecycleIndex`, and
  its record merge (`mergeProjectReadinessRecords`, `lib/status/project-view.ts`) lets an in-flight meta win when no
  operational record exists. Over the store it reads as decomposed from its lineage record.

## Success Signal

Every locus-owned consumer-map row reads and writes through the contract, so the import ratchet's floors reach zero for
this member's files on all three legs (`store-raw-state`, `surface-names`, and `work-unit-paths`); before the flip, the
session-init envelope and the locus verbs' results are unchanged on fixture repositories except for what this member
lands before the flip — the rebuilt slots' executable actions and registered schemas, the removal prompts'
`arc teardown` argv and the missing-registration remedy, the `git worktree move -f -f` form, the outcomes the Errand
exits and `arc errand leave` take from lifecycle's removal function and check, and those the stale-worktree sweep,
branch-gone recovery, and the residue sweep take from its check (`unobservable`, `locked`, and `missing`, where today a
failed read folds into not clean), and the compaction seed's schema version; and this member realizes its share of every
`storage-seam` key its consumer-map rows carry — 12 through 17, 21, 29 through 33, 45 through 48, 51, 52, 54, 55, and
57, which `notes-seam-locus.md` derives row by row — and of the session-init path row, each row closing once every
member carrying it has (`cohort-storage-seam.md` § Closeout criteria), and closes the inbound back-pressure row, which
it alone carries (Owner, 2026-10-12; amended after the first adversarial pass).

## Unknowns and Assumptions

- **Two row placements to settle with their neighbours at spec** (`notes-seam-locus.md`):
  `lib/work-unit/transition-overlay.ts`, which reads as a lifecycle row, and `lib/user-sync/current-wu.ts`, which
  `storage-cutover`'s deletion keeps while one locus caller remains.

---
