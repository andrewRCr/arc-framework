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

- **Readiness:** maturing, one input short of formalization-ready. The 2026-10-12 pass re-verified the inherited rows
  (`notes-seam-locus.md`), folded both inbound entries, took every sibling decision and ask that had landed, and
  settled this member's own open items with the Owner.
- **Resolved (2026-10-12):** item 9's executing arm, onto lifecycle's routing answer; the tripwire bounds; one inbox
  listing; the six entry grammars and the ID's placement; the cold start and the anchored marker; key 55's Errands; the
  removal callers, against lifecycle's approved removal function and check.
- **Open:** lifecycle is reshaping park into a pause recorded on the work item, renamed pause and resume (2026-10-12,
  settling); in-flight derivation's `scheduling: "parked"` and the materializable work units' skip of parked items take
  its settled shape, and session-init surfaces paused items. Two row placements wait for spec (§ Unknowns and
  Assumptions).
- **Next:** fold lifecycle's pause shape once it lands, then assess readiness and capture. Under
  `cohort-storage-seam.md` § Coordination's safety net, this spec is approved only after lifecycle's, with a re-read of
  what it consumes: the seed answer, the routing answer, the removal function and check, the anchored-checkout arms,
  the prepared-write protocol, and the pause shape.

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
   `lib/store/concurrency/stamp.ts`); the `_Routed:_` line on a surviving entry and the routing receipts; the Errand
   queue that replaces `_Disposition:_ execute-bound`; and `_Hold:_` as the retain escape hatch only (D11).
    - **One grammar for every entry list** — the personal and project inboxes, `WORKING-MEMORY`, a work unit's inbound
      list, and an Errand's description. A managed field is ``- _Name:_ `value` ``, its backticked value marking it
      parsed, as today (`inbox-reminders.ts`), grouped apart from the bare prose descriptors (§ Locus). One module
      defines each field once, and each kind's parser admits the fields it uses. Locus owns the module, the inboxes, the
      drain, the routing verb, and the inbound list and Errand description kinds, whose parsers admit the module's
      fields and whose writers the routing verb uses.
    - **`_Created:_`** (`YYYY-MM-DD`) is the date the entry entered its current list: capture stamps it in an inbox, and
      the routing verb restamps it in an inbound list or an Errand's description, since the capture date has no reader
      once the entry leaves the inbox. The reminder nudge reads it, and so does the back-pressure slot for the oldest
      pending inbound entry's age (§ Locus). From the flip the date leaves today's prose `_Routed from:_` line, which
      keeps naming the origin, with the entry's ID (D11); that amends the line's `routed from <origin>, <date>` shape in
      D11 and in `inbound-routing-method`'s D4, and a capture routes the change to `storage-cutover`, whose flip
      rewrite takes that work unit's from-the-flip binding as its target (§ Locus).
    - **`_Remind:_` and `_Hold:_`** (`true`, or absent) stay personal-inbox fields: capture writes `_Remind:_` and the
      drain `_Hold:_`, and session-init's nudge and routable count read both (`inbox-reminders.ts`, `inbox-state.ts`).
    - **`_WU_Target:_`** is a slug with an optional `(planned)` or `(provisional)` hint, or `TBD`, on Work Unit
      captures. Capture writes it, the drain's gate reads it as its first candidate, and the user-reference reconcile
      rewrites a former slug (`user-reference-reconcile.ts`). It keeps its name: entries drain, so
      `naming-conventions`' rename rewrites only the live ones.
    - **`_Shapes:_`** names the decision or section of its target that the entry shapes, on Work Unit captures and
      inbound entries. Capture or the drain's gate writes it, and the gate and the owner read it. It is parsed from the
      flip and stays a prose descriptor until then.
    - **Where a work unit past planning takes its entries** is lifecycle's answer (`draft-seam-lifecycle.md`
      § Lifecycle, "Routing into a work unit past planning"). A Planning work unit takes routed entries as today. An
      Active one is no default home: routing proposes a route out, and an entry the Owner admits lands as a spec
      amendment or new tasks, which the work unit's owner writes, held for the owner when the owner is not at the door.
      An Integrating one takes nothing, as a completed one does, so a late concern goes to a follow-on, or the owner
      reopens the work unit (`arc reopen`). Session-init shows the pending count and the back-pressure offer (§ Locus)
      for any work unit whose list holds entries.
    - **Nothing stays held past an exit.** From the flip the write check refuses moving a work unit to Active (lifecycle's
      answer), to Integrating (`arc publish`, `runPublish`), or to the archive, and refuses retiring it by a cut or
      abandonment, while its inbound list holds an entry, naming them (`meta.inbound-held`, `lineage.inbound-held`;
      item 11); planning readiness confirms none is held. Before a cut the owner folds each held entry into the
      origin's draft or spec, whichever the cut copies to every member (a spec through `amend-design`), or re-routes or
      dismisses it; before an abandonment, re-routes or dismisses it. Until the flip, activation's and verification's
      capture gates (`arc user inbox-list --target`, PR #899) carry the property.
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
  (32); the worktree roster and the single-meta callers on the locus side (47), with the Candidate mutation owner
  (`resolveCandidateMutationOwner`) resolved from the marker plus stored lifecycle facts; state continuity anchored on
  the state version for handoff restating and recover audit (52), beside a retained code-head baseline, never in place
  of it, since code identity, progress, and preservation still validate against Git (D2, D20); `arc user add`,
  `arc init`, and `arc join` creating an identity's first records only when absent (54); `arc errand check`'s overlap
  through a store query for state targets, listing in-flight Errands beside work units (55, Owner 2026-10-12, whose rows
  `notes-seam-locus.md` derives); the drain side of hold-and-route (21); the register's session-init path row — slot
  paths and load-set entries from the layout resolver, and the compaction seed's schema version bump; and the Errand
  index projection in `lib/errand/record.ts` with the locus consumers' listing protocols (key 62's surviving half; the
  review gate's stay with delivery and review). `session-init-performance`'s notes items go with these reads (key 10).
  Handoff's routing of base and notes sync to the primary stays `handoff-optimization`'s (key 41). `notes-seam-locus.md`
  re-verifies the 63 inherited rows at `327d4178a`, with their corrections, the consumers no row covers, and where the
  session-init reroute lands (`handleSessionInitStatus`, `handlers/status.ts`).
- **An identity already in use (Owner, 2026-10-09).** From the flip, when `arc user add`, `arc init`, or `arc join`
  finds the identity's records already in the store (54), it says so and asks the person to confirm the identity is
  theirs; a run that cannot ask reports it in its result. It warns and never refuses, since a slug cannot tell the same
  person's second machine from a second person who chose the same name, and it misses two people who both set up
  before either syncs. Before the flip this repository keeps notes local, so there is nothing to compare against.
- **Errands and claims list apart.** Project-scope Errands and identity-scoped grooming and housekeeping claims are
  acquired separately, each at a pinned version with absent, unreadable, and complete outcomes and per-entry
  diagnostics (`readTransientIdentitySnapshot`); an Errand-only listing never replaces the claim snapshot, and review
  admission still requires a complete listing with no diagnostics (D4, D5, D10).
- **Former slugs.** From the flip the reconcilers (`current-wu-reconcile.ts`, `user-reference-reconcile.ts`) resolve a
  former slug from the live primary through `lookup` and list lineage only for terminal outcomes, keeping their
  unavailable, ambiguous, and cycle refusals; until then they read today's rename transitions (§ Lifecycle).
- **From the contract's Part B.** Lifecycle anchoring and `arc start --here` (D17). Branchless planning's read half:
  locus derived from the marker and the store, the marker's exclusivity guarding the locus. The session-start scratch
  reconcile through `lookup` (D5): a folder whose work unit was renamed follows its current slug, one whose work unit
  ended is removed and reported, and a name resolving to no work unit is left and reported; a promoted work item's
  folder reconciles as a fresh start's does (`draft-seam-lifecycle.md` § Lifecycle, "Rename and promotion keep the work
  item's identity"), and the tests include one. The session-notes path session-init's load set and handoff resolve (D5).
  Removing the spawn's `SESSION-NOTES` seed: `scaffoldIntoWorktree` (`lib/git/worktree-scaffold.ts`) writes the meta,
  calls `runUserOpen` for the workspace and its `SESSION-NOTES` seed, and writes the ownership marker; from the flip the
  meta and its session context are written through the store, the `SESSION-NOTES` seed and `arc user open` go, and the
  marker stays machine-local (Owner, 2026-10-09). `runUserOpen` also runs from `arc user open` (`handlers/user.ts`),
  which `activate-work-unit.md`'s workspace step invokes and the flip rewrite removes, and from the executor's open arm,
  which lifecycle removes (§ Lifecycle).
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
      always `spawnedByArc: true`, the topology check admits `spawnedByArc: false` only for transient occupancy of the
      primary (`validateOccupancyMarkerTopology`, `isWorktreeMarker`), the cold start writes none
      (`writeWorktreeOwnershipMarker` with `createdByArc: false`), and the cleanup decision keys on a marker's presence
      (`decideWorktreeCleanup`, `lib/git/worktree-cleanup.ts`). Before the flip, dormant: the work-unit arm admits
      `spawnedByArc: false`, meaning ARC did not create the checkout, on the primary or a linked checkout; every removal
      path keys on `spawnedByArc: true` rather than presence, so an anchored marker reads as `external`; and teardown
      releases an anchored checkout's marker and keeps the checkout (lifecycle's arm, below). Nothing writes an anchored
      work-unit marker until the flip, so nothing observable changes, and locus derivation's in-repo arm keeps reading
      a marker-less checkout's active meta until then. From the flip `arc start --here` writes it, on the capability.
    - **Acceptance:** an anchored primary under partial protection is no launchpad, so `arc errand open` refuses (D17).
    - **Lifecycle's arms for it** (`draft-seam-lifecycle.md` § Lifecycle, 2026-10-12): teardown releases an anchored
      checkout's marker and keeps the checkout, the primary included ("A checkout ARC did not create"), and activation
      in an anchored checkout already on a branch adopts that branch as the work branch, refusing when another work
      item links it ("Activation in a checkout already on a branch").
- **Notes policies retire without successor (D12).** `user.notes_push`, `session.init_pull.notes`, and
  `session.init_load.notes` go with session-init's notes recommendations — their policy branches, the notes and
  combined prompts (`composeNotesPromptText`, `composeCombinedPrompt`), and the retired-subdirectory load dispatch —
  while `session.remote_sync`, the worktree and base recommendations, and slot failure isolation stay.
- **Personal surfaces.** The `USER-INBOX` and `WORKING-MEMORY` entry-list parsers, the inbound list and Errand
  description kinds with the entry-field module (§ Shared decisions, item 9), the drain's removal by `_Id:_` and version
  from the flip (by title until then), and the Errand queue from the flip (D11). Entries key on `_Id:_`, the contract's
  concurrency library's key, rather than the bold title `parseUserInbox` keys on today (`lib/user-sync/parser.ts`) or a
  proposed `_Slug:_` field. Removal stays idempotent: a no-op that reports when the entry is already gone, since several
  backstops may replay it. Managed fields group together, blank-line-separated from the prose descriptors (§ Shared
  decisions, item 9). `arc errand open --from-inbox`; the title-matched removals of `arc errand close` and
  `arc user inbox-remove`, both through `removeCurrentInboxEntry` (`commands/user/inbox-mutation.ts`); and Errand
  promotion's digest-checked removal (`runUserInboxMutation`, `handlers/errand.ts`) repoint onto the ID with the parser,
  and the removals onto the entry's version at its compare-and-swap boundary once the notes lock retires. Under partial
  protection an Errand has no portable record or description, so its origin entry stays in the inbox until close removes
  that exact ID at its observed version, and a partial abandon clears the mark and keeps the entry (D5, D11). The inbox
  capture's schema carries `_Shapes:_` (`inbound-routing-method`'s D2 test 3).
- **One inbox listing (Owner, 2026-10-12).** D11's listing verb is `arc user inbox-list` (`runUserInboxList`,
  `lib/user-sync/inbox-target.ts`), which today requires `--target` and gates `create-spec.md`,
  `activate-work-unit.md`, and `verify-work-unit.md`. From the flip `--target` becomes an optional filter and each row
  carries the entry's `_Id:_` and version, so the drain, the exit gates, and session start read through one listing.
- **The entry grammars (Owner, 2026-10-12).** The entry-field module admits, per kind, a shape, the sections that hold
  entries, and the managed fields beyond `_Id:_` (`EntryConfig`, `KIND_MECHANISMS`, `lib/store/registry.ts`):
    - `personal/inbox` — heading; `Errand` and `Work Unit`; `_Created:_`, `_Remind:_`, `_Hold:_`, `_WU_Target:_`,
      `_Shapes:_` (parsed from the flip), and `_Routed:_`. `_Disposition:_` retires into the Errand queue at the flip.
    - `personal/working-memory` — field-header; `Memories`; `_Remove when:_`, required, the ID following it.
    - `project-inbox/inbox` — heading; `Inbox`; `_Created:_` and `_Routed:_`.
    - `work-item/inbound` — heading; `Inbound`; `_Created:_`, restamped on routing, and `_Shapes:_`. The prose
      `_Routed from:_` line keeps the origin, with the entry's ID.
    - `work-item/description` — heading; `Description`; the personal capture's fields less `_Hold:_` and `_Remind:_`.
      A survivor's new content enters as a new entry citing the original's ID (D11).
    - `personal/errand-queue` — heading; `Queue`, file order its run order; `_Entry:_`, the referenced entry's ID, and
      `_Inbox:_`, `personal` or `project`. Its entries are references, never items (D11), each heading carrying the
      referenced entry's title for legibility.
    - **Declared before the import.** The last three are the kinds the registry leaves unhomed. Until each is declared
      the ref backend refuses its writes `unhomed-kind`, record kinds' held-entries rules admit
      (`spec-seam-record-kinds.md` § 3.6), and the import's trial names the kind and refuses
      (`spec-storage-ref-backend.md` § 5.1, § Open Questions), so the flip waits on all three.
    - **The ID joins the managed group.** Managed fields lead an entry, as today, where `_Disposition:_` must be the
      first descriptor (`lib/user-sync/inbox-writer.ts`). `stampEntryIds` (`lib/store/concurrency/stamp.ts`) places a
      heading entry's `_Id:_` after its last descriptor bullet of any kind, which would split the group, so this member
      amends its heading arm to place the ID after the last backtick-valued managed field, or directly under the
      heading when there is none; a field-header entry keeps its ID after `_Remove when:_`. A forward amendment to the
      contract's concurrency library, made with the declarations.
- **Off the user-surfaces resolver.** Locus moves its own callers off `lib/user-surfaces.ts`'s resolver, which stays,
  with `lib/user-surface-migration.ts`, as today's arm until `storage-cutover`'s deletion pass
  (`cohort-storage-seam.md` § Cross-cohort).
- **Hold-and-route's drain side (21).** `inbound-routing-method` moves the buffer section, the owner-adoption hold, and
  the coordination-seam rule into the `route-discovered-work` method's until-the-flip binding section, with route-now
  handing off from `arc-inbox` to `arc-errand` (its D7, D8). The flip rewrites that binding section and the hand-off,
  which spans three sites — `arc-inbox`'s route-now step, `arc-errand`'s route shape, and `run-errand.md`'s route-only
  Errand — with that work unit's from-the-flip binding as the target, as it landed (PR #860).
- **Inbound back-pressure.** A per-work-unit session-init slot reports the pending inbound count and the oldest entry's
  age, with thresholds that emit a recommended action and a precomposed re-triage offer for the drain; it is built with
  the inbound kind and gets its full schema. `inbound-routing-method` specifies it for the flip, and the counts in its
  spec's § Introduction / Context calibrate the thresholds. It has its own register row. Record kinds' held-entries
  rules read the same kind through the store (§ Shared decisions, item 11) and admit until locus declares its grammar.
- **Every rebuilt slot carries an executable action (Owner, 2026-10-12).** Each session-init slot this member rebuilds —
  the seven `cohort-storage-seam.md` § Soft coordination names, plus the inbound back-pressure slot — carries its
  recommended action as a typed, executable action (argv) beside its precomposed text, never the text alone, as
  `currentWuReconcile`'s `recommendedCommand` and the residue sweep's `remedy.argv` already do. The session-init agenda
  (`composable-workflows`) stays sequenced after the seam (`cohort-state-storage.md` § Cross-cohort), so it compiles
  against the post-cutover envelope and consumes each slot without reopening it; its consuming side is its own inbound
  entry, "Dispatch published remedy actions instead of reducing them to prompt text". The seam's bounds still hold: no
  workflow text changes and no reshaping of session-init's prose conditionals before the flip.
- **`WORKING-MEMORY` headers fail loudly.** `lib/user-sync/parser.ts` recognizes an entry header only as one line
  matching `^\*\*.+:\*\*$`, so a header that wraps past the line limit is silently folded into the entry before it; one
  sweep found three of twelve entries dropped that way. The kind's parser recognizes a wrapped header or rejects it
  loudly, with a test covering wrapped and colon-less headers.
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
  path (`spec-seam-record-kinds.md` § 5.5).
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
- **Shipped-work readers onto placement (item 10).** The locus and session-init readers of the archive index
  (`completed-index.ts`) — the sweeps, retired-subdirectory detection, and the derived locus evidence and roster
  (`lib/locus/derived-evidence.ts`, `derived-lifecycle-evidence.ts`, `derived-roster.ts`) — move onto placement and
  `lookup`, and none keys on an archive folder's number, which the push loop renumbers while the archive is unpublished
  (`draft-seam-lifecycle.md` § Shared decisions, item 10).
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

## Unknowns and Assumptions

- **Two row placements to settle with their neighbours at spec** (`notes-seam-locus.md`):
  `lib/work-unit/transition-overlay.ts`, which reads as a lifecycle row, and `lib/user-sync/current-wu.ts`, which
  `storage-cutover`'s deletion keeps while one locus caller remains.

---
