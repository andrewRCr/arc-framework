# Draft: Seam Locus, Session-Init, and Personal Surfaces

- **Origin:** [internal] — the `storage-seam` cut (2026-10-09); stage 2 of the storage program.
- **Purpose:** Derive locus and what is in flight from the checkout marker plus the store, route session-init's state
  reads and the personal surfaces through the storage contract, and own the entry grammar the inboxes, inbound lists,
  and Errand descriptions share.

---

## Continuity

- **Readiness:** maturing. The cut carried this member's section of `storage-seam`'s draft over unchanged, with the
  shared decisions it owns (item 9), from a draft the readiness check found formalization-ready for the cut
  (2026-10-09); what stays open is this member's own detail design.
- **Next:** draft-design, in the slot `seam-record-kinds` frees at `generate-tasks` (`cohort-storage-seam.md`
  § Coordination): re-verify its consumer-map rows against the current code, derive key 55's, and settle its open items.

**Reading this draft.** `cohort-storage-seam.md` holds the seam's coordination, its scope boundary, and how the
register's keys are cited. A `§ Shared decisions` item lives in its owner's draft: items 1–8 and 11 in
`draft-seam-record-kinds.md`, item 9 in `draft-seam-locus.md`, and items 10 and 12 in `draft-seam-lifecycle.md`.
`§ Record kinds`, `§ Lifecycle`, `§ Decomposition`, `§ Delivery and review records`, `§ Locus`, and
`§ Status and roadmap` name the member sections of `draft-seam-record-kinds.md`, `draft-seam-lifecycle.md`,
`draft-seam-decomposition.md`, `draft-seam-delivery-review.md`, `draft-seam-locus.md`, and
`draft-seam-status-roadmap.md`. `D` and `A` numbers are `spec-storage-contract.md`'s decisions and amendments.

## Decisions

### Shared decisions

This member owns item 9 of the seam's shared decisions, settled before the cut (Owner, 2026-10-09); `seam-record-kinds`
owns items 1–8 and 11 and `seam-lifecycle` items 10 and 12, and `cohort-storage-seam.md` § Shared contracts names each
item's consumers.

9. **Entry managed fields** — settled (Owner, 2026-10-09), provisional on `inbound-routing-method`. The contract settles
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
    - **An executing work unit integrates its inbound entries** as it does any discovery within it (`DEV-RULES.ARC` §
      Route by urgency × isolation): session-init shows the pending count and the back-pressure offer, and the owner
      folds each entry into the task list as a new task or subtask (item 5), or re-routes or dismisses it. Nothing stays
      held when a work unit leaves: the write check refuses moving it to Integrating (`arc publish`, `runPublish`) or to
      the archive, or retiring it by a cut or abandonment while entries remain, naming them (item 11), as planning
      readiness confirms none is held. Before a cut the owner folds each held entry into the origin's draft or spec,
      whichever the cut copies to every member (a spec through `amend-design`), or re-routes or dismisses it; before an
      abandonment, re-routes or dismisses it. The routing verb then treats an Integrating work unit as it treats a
      completed one, as no routing target, so a late concern goes to a follow-on, or the owner reopens the work unit
      (`arc reopen`). That amends `inbound-routing-method`'s D2, where only a completed work unit is no routing target,
      and a capture routes the amendment to `storage-cutover` beside the `_Routed from:_` change. Until the flip,
      hold-and-route stays as today.

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
  through a store query for state targets (55, which no consumer-map row cites yet); the drain side of hold-and-route
  (21); the register's session-init path row — slot paths and load-set entries from the layout resolver, and the
  compaction seed's schema version bump; and the Errand index projection in `lib/errand/record.ts` with the locus
  consumers' listing protocols (key 62's surviving half; the review gate's stay with delivery and review).
  `session-init-performance`'s notes items go with these reads (key 10).
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
  reconcile and the session-notes path session-init's load set and handoff resolve (D5). Removing the spawn's
  `SESSION-NOTES` seed: `scaffoldIntoWorktree` (`lib/git/worktree-scaffold.ts`) writes the meta, calls `runUserOpen` for
  the workspace and its `SESSION-NOTES` seed, and writes the ownership marker; from the flip the meta and its session
  context are written through the store, the `SESSION-NOTES` seed and `arc user open` go, and the marker stays
  machine-local (Owner, 2026-10-09). `runUserOpen` also runs from `arc user open` (`handlers/user.ts`), which
  `activate-work-unit.md`'s workspace step invokes and the flip rewrite removes, and from the executor's open arm, which
  lifecycle removes (§ Lifecycle).
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
  capture's schema carries `_Shapes:_`, provisional on `inbound-routing-method`.
- **Hold-and-route's drain side (21).** `inbound-routing-method` moves the buffer section, the owner-adoption hold, and
  the coordination-seam rule into the `route-discovered-work` method's until-the-flip binding section, with route-now
  handing off from `arc-inbox` to `arc-errand` (its D7, D8). The flip rewrites that binding section and the hand-off,
  which spans three sites — `arc-inbox`'s route-now step, `arc-errand`'s route shape, and `run-errand.md`'s route-only
  Errand — with that work unit's from-the-flip binding as the target; provisional on it landing as specified.
- **Inbound back-pressure.** A per-work-unit session-init slot reports the pending inbound count and the oldest entry's
  age, with thresholds that emit a recommended action and a precomposed re-triage offer for the drain; it is built with
  the inbound kind and gets its full schema. `inbound-routing-method` specifies it for the flip, and the counts in its
  spec's § Introduction / Context calibrate the thresholds; provisional on that work unit. It has its own register row.
  Record kinds' held-entries rule reads the same kind through the store (§ Shared decisions, item 11) and finds nothing
  until locus registers it.
- **`WORKING-MEMORY` headers fail loudly.** `lib/user-sync/parser.ts` recognizes an entry header only as one line
  matching `^\*\*.+:\*\*$`, so a header that wraps past the line limit is silently folded into the entry before it; one
  sweep found three of twelve entries dropped that way. The kind's parser recognizes a wrapped header or rejects it
  loudly, with a test covering wrapped and colon-less headers.
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
- **Open.** Settled before the cut, provisional on `inbound-routing-method` (its D2 test 3 and D4): the inbound kind's
  schema (§ Shared decisions, item 9). The personal-surface families' field schemas. The inbox listing verb's name
  (D11).

## Unknowns and Assumptions

- **Key 55 has no consumer-map row**, and `lib/git/foreign-artifact-detection.ts` appears only in the state-path
  count; locus derives its rows at planning.

---
