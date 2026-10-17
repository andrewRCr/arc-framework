# Draft: Storage Cutover

- **Origin:** [internal] — the `state-storage` re-cut (2026-09-28); stages 3 and 4 of the storage program.
- **Purpose:** Flip this repository — and CineXplorer — onto the ref store in one rehearsed window, retire Git notes,
  then delete what the flip made dead and rewrite the documentation to the new model.
- **Planning posture:** `P1`; `Class` settles at planning. Its design is small — a window runbook and mechanical
  deletion — so it may split by subsystem once the flip is done, to run the deletion passes in parallel.

---

## Scope

- **Rehearsal** on a scratch repository first, then the window: quiesce, import, flip, retire notes
  (`analysis-storage-substrate-direction.md` § 10.3). Planning-only work units' artifacts import from their branch
  heads, `delivery-rebuild-continuity`'s included; implementation work units land first where possible, or park at
  a task boundary.
- **Deletion passes** over the categories the flip makes dead (§ 10.4): notes-specific sync, branch-tree readers,
  lifecycle classification and exclusion, the lifecycle hook checks, and the CI planning classifier.
- **Documentation:** the mechanics and lifecycle-path documentation in both copies, and the rules the register marks
  rewritten at cutover.
- **The register's cutover rows** (`cohort-state-storage.md` § Storage-coupling register).

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's first planning iteration. Integrate — or_
> _consciously reject — each one._

### `[ ]` **Delete the code `cli-substrate-complete-migration` carves out**

- _Routed from:_ `USER-INBOX § Work Unit`, drained at the `state-storage` re-cut (2026-09-28).

- _Observation:_ `cli-substrate-complete-migration` does not migrate code the storage program deletes or rewrites.
  Its closeout exclusion names the `state-storage` storage-coupling register (`cohort-state-storage.md`) as the
  authority for each carved item's owner and fate, so the `cli-substrate-adoption` cohort cannot close until these
  rows exist. The classes follow `analysis-storage-substrate-direction.md` § 10.4; the anchor modules are in
  `draft-cli-substrate-complete-migration.md` § Storage carve-out (later its spec).
    - **Removed at cutover — owner: `storage-cutover`'s deletion passes.**
        - Notes-specific sync: the notes machinery in `lib/user-sync/`, the `commands/user/` push, fetch,
          compaction, and sync-status family, `handlers/user-sync.ts`, `handlers/push-recovery.ts`, and the notes
          portions of `commands/user/save-load.ts`, `handlers/user.ts`, `handlers/sync.ts`, and `lib/io-context.ts`.
          `lib/user-sync/` is mixed — these symbols survive and must not go with it: the cross-WU entry parser
          (inbox state, reminders, and `matchInboxEntryTitle`), the inbox writer and execution offers (Errand open
          and link, the `user inbox` mutations, and session-init's inbox state), and `resolveCurrentWuName`. The
          tail moves the Git failure-text predicates (`isCasRejectionError`, `isRemoteUnavailableError`,
          `isNonFastForwardError`), which the Errand refs use, to `lib/git/ref-tree.ts`, and
          `resolveGitCommonDir`, which nine surviving modules import, to `lib/git/exec.ts`. Deleting
          `handlers/user-sync.ts` also removes its registrations in `command-input-registrations.ts` and `cli.ts`.
        - Branch-tree readers: `lib/status/project-view-ref.ts`, `git-retirement-authorization-context.ts`,
          `git-transition-record-enumeration.ts`, the ref-reading portions of `in-flight-derivation.ts`,
          `remote-ref-reader.ts`, `completed-index.ts` (`*FromRef`), and the session-init sweeps' base-archive reads,
          and base drift's read of `.arc/completed/` from base history (`lib/base-drift/current-adapters.ts:131`).
            - Two modules are mixed: `completed-index.ts` keeps `branchToWorkUnitSlug`, and `remote-ref-reader.ts`
              keeps `DEFAULT_NETWORK_TIMEOUT_MS` and `readLiveRemoteBranchTip`.
            - Surviving consumers move to store reads before the readers go: `handlers/start.ts` through
              `project-view-ref`; `teardown-retirement-driver.ts` through the retirement-authorization context; and
              the transition-record enumeration's callers — `git-decompose-v3-operation`, `executor-context`,
              `delivery/plan-resolution`, and the status, user, reconcile, and lifecycle handlers.
        - Lifecycle classification and exclusion: `evidence-applicability/path-treatment.ts`,
          `delivery/lifecycle-contribution.ts` with its Git variant, and the evidence-neutral and regenerable arms.
          Surviving consumers move off them first: `work-unit/candidate-evidence.ts` and `git/base-overlap.ts`
          through `path-treatment.ts`, and six modules through `lifecycle-contribution.ts` — `entry-inspection`,
          `chain-containment`, `repository-entry`, and `git-eligibility` in `lib/delivery/`,
          `handlers/delivery-execution.ts`, and the review gate's `pre-publication-composition`.
        - Lifecycle hook checks: `validate-meta-spec`, `validate-cohort-consistency`, `assert-roadmap-regenerated`
          with `lib/status/roadmap-regeneration-assert.ts`, `check-foreign-writes`, `remedy-roadmap-conflict`, and
          the pre-commit hook's own state-path checks: the contributor-protected paths (the
          `hooks.contributor_protected_paths` default at `lib/config/schema.ts:270`), the task-list modification
          check, and the ROADMAP render-field check.
        - CI planning classifier: `isPlanningArtifactPath` and `classifyPlanningLane` in `change-facts.ts`, the
          `lane-paths` logic in `classify-change.sh`, the lane-attestation workflow, `arc review planning-lane`
          (`handlers/review.ts`), and the planning-grooming command. The rest of `change-facts.ts` survives.

- _Approach:_ each bullet is one row in `cohort-state-storage.md`'s storage-coupling register. Reconcile the
  carve owner names in `cli-substrate-complete-migration`'s spec to `storage-cutover` (removed) and
  `storage-seam` (rewritten).

- _Captured during:_ `cli-substrate-complete-migration` draft-design, 2026-09-28.

### `[ ]` **Rehearse the flip's workflow rewrite end to end, and quiesce every session holding today's workflow text**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-09-30); captured during
  `storage-contract` draft-design, adversarial pass 6 and a review of the reframe (2026-09-30).
- _Observation:_ `storage-contract` decided (Owner, 2026-09-30) that ARC's process changes once, at the flip. The
  flip rewrites each affected workflow step from the consumer map's end states (`notes-storage-contract.md`), each
  rewrite checked against `strategy-procedure-evolution.md`, and the register's workflow-steps row moves to this work
  unit. `arc save`, the projection's write-back, the close verb closing tasks and capturing their commits, and the
  import's footer-derived captures all first run for real there. This draft's rehearsal covers quiesce, import, flip,
  and notes retirement, but not a work unit driven end to end through the rewritten workflows.
- _Observation:_ nothing may break across the flip (`storage-contract` C13). A session still holding pre-flip
  workflow text in context would follow steps the rewrite removed, so quiesce has to reach live sessions, not only
  in-flight work units.
- _Approach:_ Add to the rehearsal a work unit run through the rewritten workflows on the scratch repository — draft
  capture, create-spec with an ADR companion, a task closed through the close verb, handoff, prepublication with the
  review copy, and integration's candidate tail — and add to quiesce that every session hands off before the flip, so
  each resumes on the rewritten text.

### `[ ]` **Retire the live transition-record test when lineage moves to the store**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-09).

- _Shapes:_ § Scope's deletion pass, and the register row for Candidate and transition records.

- _Observation:_ An integration test reads the tracked transition records in `.arc/system/.internal/transitions/`
  directly and checks them for structural integrity: each parses, round-trips to canonical bytes, is the one record
  for its origin under `<origin>.json`, and projects to a valid reference set. The ARC contract test tier runs it, so
  docs-only pull requests that add or change a record are checked. The storage register row for Candidate and
  transition records names the records but not this reader. Once lineage is a store family written only by verbs,
  the folder is gone and the store's own record validation carries the integrity check.

- _Approach:_ In the deletion pass after the flip, delete `live-transition-records.test.ts` and its entry in the ARC
  contract tier selection (`src/lib/local-vitest-runner.ts` and its unit test). Until the flip the in-repo
  implementation keeps the tracked records, so the test stays valid. If missed, the test fails loudly on the missing
  directory rather than passing vacuously.

- _Captured during:_ Errand `transition-record-checks`, 2026-09-30; re-routed from `storage-seam` at its draft
  consolidation, 2026-10-05, because the records leave the tracked folder only at the flip.

### `[ ]` **Drop lineage's `rename` and the meta's retired session fields in the deletion pass**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-11).

- _Shapes:_ § Scope's deletion passes, and its inbound entry "Retire the live transition-record test when lineage
  moves to the store".

- _Observation:_ `seam-record-kinds` leaves three things to the deletion pass (`spec-seam-record-kinds.md`
  § Non-Goals). Lineage's `rename` kind stays until the flip, since the in-repo arm writes rename records and
  resolves former slugs through them; `storage-ref-backend`'s import turns today's three into former slugs, so from
  the flip lineage holds terminal transitions only. The parsed meta keeps `Next Task`, `Last Completed`, and
  `Blockers`, with their writers, so rerouted code compiles unchanged across the flip; verbs stop writing them on the
  capability. And record kinds rewrites `live-transition-records.test.ts` to the converted lineage shape, which the
  inbound entry's deletion still covers.

- _Approach:_ in the deletion pass, drop `rename` from the lineage kind and its parser, and the three fields from
  the meta's parsed schema, with their writers and every pre-flip arm that writes them.

- _Drain note (2026-10-11):_ overlaps the held entry above on lineage's move to the store; integrate them together.

- _Captured during:_ `seam-record-kinds` draft close, 2026-10-10.

### `[ ]` **Confirm at the flip rehearsal that every hand-editable projected kind has its parser and entry shape**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-11).

- _Shapes:_ its rehearsal before the flip, and the register row "Lifecycle hook checks" ("Removed at cutover, except
  content rules that move into a record-family parser").

- _Observation:_ the projection's write-back is an ordinary contract `write`, so a kind whose parser slot is empty
  (`createKindRegistry` in `lib/store/registry.ts`) writes unvalidated, as D5 defines. Merge does not need the parser —
  entry merge takes its shape from the kind's mechanism — so nothing fails visibly. But the commit-time content checks
  retire at the cutover, and the parser is both their replacement and what refuses edits to verb-owned fields. A kind
  the projection makes hand-editable that reaches the flip with an empty slot accepts any hand edit unchecked.

- _Observation:_ entry merge has the same gap one level down. `mergeEntryText` (`lib/store/concurrency/entry-merge.ts`)
  takes the entry grammar and its sections as an argument, from the kind's `entry` config in `KIND_MECHANISMS`. Three
  entry-merge kinds declare none — `work-item/description`, `work-item/inbound`, and `personal/errand-queue` — where
  `personal/inbox`, `project-inbox/inbox`, and `personal/working-memory` do, so a hand edit to one of them has no
  grammar to merge by once it is projected.

- _Approach:_ a rehearsal check that lists every kind with a writable projected path and refuses the flip while any of
  them has an empty parser slot, or, merging by entry, no entry config.

- _Drain note (2026-10-11):_ the check slot, not the record parser, refuses edits to verb-owned fields; the
  write path registers through `PRODUCTION_REGISTRATIONS`.

- _Captured during:_ `storage-projection` draft-design, 2026-10-09; widened to entry shapes at its draft close,
  2026-10-10.

### `[ ]` **Take `storage-seam`'s flip-rewrite obligations into the cutover's workflow rewrite**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-11).

- _Shapes:_ the flip rewrite of workflow steps and the deletion pass.

- _Observation:_ `storage-seam`'s settled decisions leave cutover steps the consumer map's workflow rows do not name:
  § 5.4, § 6.5, and § 8.4 of `spec-seam-record-kinds.md`, and item 9 in `draft-seam-locus.md`. Move every step
  that hand-edits `Class` onto the Class verb, or a shipped `--class` flag where one covers it: none covers activate's
  Step 4, init's post-init ratchet, a new work unit's resolution, init's Errand-promotion step 6, promote's Step 2, or
  draft-design's capture. Move the steps that hand-edit `Branch`, deactivate's Case C and init's re-run, onto verbs.
  Rewrite the cohort template's "convenience pointer" note on `Parent`, which becomes the cohort's stored nesting.
  Retire `hooks.task_numbering` with the task-numbering hook, since the write check reads no configuration. Where the
  rewrite takes `inbound-routing-method`'s from-the-flip binding for the `route-discovered-work` method, the
  `_Routed from:_` line's date moves to `_Created:_`, and an Integrating work unit is no routing target, which amends
  that work unit's D2.

- _Approach:_ fold each into the flip rewrite's step list, checked against `strategy-procedure-evolution.md`.

- _Captured during:_ `storage-seam` draft close, 2026-10-09.

### `[ ]` **Carry the import's second run, the pre-import tidy, and every machine's notes and reviews into the window**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-11).

- _Shapes:_ its § Scope, "Rehearsal on a scratch repository first, then the window: quiesce, import, flip, retire
  notes".

- _Observation:_ `storage-ref-backend`'s import (`draft-storage-ref-backend.md` § Decisions, The migrate verb and the
  import) leaves the window five steps. Run the import again after the first push: that run deletes the
  transient-identity refs from the remote, each leased on the tip the import re-homed, and drops the tips it kept under
  `refs/arc/tmp/migrate/`. Tidy this repository's personal state before the import, worked from the import's trial run,
  since on a public repository the import publishes it for good. Bring every machine's notes to the importing machine
  by `git bundle` or a fetch between machines, since the remote notes refs are deleted and the import refuses a notes
  file that differs from its disk copy. Finish review on every machine but the importing one, since the review gate's
  repository ID is minted per clone and only the importing clone's facts are read. And keep the old notes ref outside
  `refs/tags/`, or drop it, so `git push --tags` cannot publish every past personal note.

- _Approach:_ fold the five into the window's runbook, and confirm at import that no draft's buffer section or held
  capture is left behind, since the import converts both into inbound lists.

- _Captured during:_ `storage-ref-backend` draft close, 2026-10-10.

### `[ ]` **Compare every Candidate chain through the store with today's reader in the rehearsal**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-11).

- _Shapes:_ its § Scope, "Rehearsal on a scratch repository first".

- _Observation:_ the import replays each Candidate record's versions from the plain path log today's chain reader walks
  (`readRepositoryCandidateSupersessionChain`, `lib/work-unit/candidate-record-store.ts`), since the in-repo `history`
  follows renames and drops a version a merge commit introduced. Today's reader refuses six records:
  `evidence-applicability` at a broken chain link (`resolveCandidateSupersessionAncestors`), and five that fail today's
  Candidate schema before any chain walk (`readCandidateRecordVersioned`). The import carries all six unchanged.
  `storage-ref-backend`'s tests compare the two readers over a fixture; only the rehearsal can compare every record in
  this repository.

- _Approach:_ in the rehearsal, read every Candidate record's chain through the store's `history` and through today's
  reader, and require the same chain or the same refusal for each (`draft-storage-ref-backend.md` § Decisions,
  Verification).

- _Captured during:_ `storage-ref-backend` draft close, 2026-10-10.

### `[ ]` **Rewire `arc sync` onto the store's `pull` and `push`**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-11).

- _Shapes:_ its § Scope, the window's flip.

- _Observation:_ `storage-ref-backend` renames the contract's `sync()` to `push({ carry? })` and adds `pull()`, while
  `arc sync` keeps its name and runs both, pulling then pushing (`draft-storage-ref-backend.md` § Decisions, Sync). No
  production code calls the contract's `sync()` yet, so the rename is cheap; rewiring the command is the flip's.

- _Approach:_ at the flip, point `arc sync` at `pull` then `push`, and remove its notes path with the notes machinery.

- _Drain note (2026-10-11):_ overlaps the held entry "Delete the code `cli-substrate-complete-migration` carves
  out" on removing notes-specific sync; integrate them together.

- _Captured during:_ `storage-ref-backend` draft close, 2026-10-10.

### `[ ]` **Delete the import's transform, the suites that target retired substrates, and the sync-state ref**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-11).

- _Shapes:_ its § Scope, "Deletion passes", notes-specific sync among them.

- _Observation:_ `storage-ref-backend` leaves three items to the deletion pass. The import's transform is the migrate
  verb's one-time part and goes with the in-repo implementation, the verb staying. A store suite that runs the shared
  conformance suite or tests a consumer through the contract survives, while one that targets the in-repo
  implementation, notes, or Errand refs by name retires with them, and that list comes from the ref backend's
  implementation. And `refs/arc/user/<id>/sync-state` retires with notes rather than through the import
  (`draft-storage-ref-backend.md` § Decisions, The migrate verb and the import, and Verification).

- _Approach:_ fold all three into the deletion pass's inventory, and take the suite list from the ref backend when it
  lands.

- _Captured during:_ `storage-ref-backend` draft close, 2026-10-10.

### `[ ]` **Carry `arc user inbox-list` and the capture exit guards across the flip**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-13).

- _Shapes:_ § Scope's deletion passes, and the inbound entry "Take `storage-seam`'s flip-rewrite obligations into the
  cutover's workflow rewrite".

- _Observation:_ `arc user inbox-list --target <slug>` (`handlers/user-inbox-list.ts`, `lib/user-sync/inbox-target.ts`)
  lists the personal-inbox captures whose `WU_Target` line names a work unit, held or not. `create-spec`'s owner's
  pass, `activate-work-unit`'s pre-condition gate, and the start of `verify-work-unit` dispatch on it. It reads the
  inbox file under the notes lock and parses the three target-line spellings in use, like the other `arc user inbox-*`
  verbs the cutover replaces.

- _Approach:_ at the flip, re-point its reader onto the store's inbox records, keeping the `clear` / `named` /
  `refused` result and adding the entry ID. D11 routes captures straight into a work unit's inbound list and retires
  owner adoption, so the three guards should then also read the work unit's pending inbound count, which session-init
  orientation already carries. Rename the verb with the other inbox verbs if `naming-conventions` moves them.

- _Update (2026-10-12):_ `seam-locus` renames the verb from the flip: `arc inbox <list>` (`personal`, `project`, or a
  work item's slug) replaces `arc user inbox-list`, and `--target <slug>` keeps the `clear` / `named` / `refused`
  result with each row's ID and version; `arc inbox <slug>` lists a work unit's inbound list with its pending count and
  oldest age (`draft-seam-locus.md` § Locus, "One entry listing, `arc inbox`"). The flip rewrite moves the three gates'
  calls onto it.

- _Captured during:_ the `capture-exit-guards` Errand, 2026-10-11.

- _Drain note:_ the inbound entry "Delete the code `cli-substrate-complete-migration` carves out" and the register's
  notes-specific sync row keep the inbox writer and the `user inbox` mutations as survivors, while
  `spec-seam-locus.md` § 1.5 lists `arc user inbox-list --target` among the arms the deletion pass removes; settle
  which holds.

### `[ ]` **Rewrite the task loop's completion around the task close verb**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-13).

- _Shapes:_ the register row "Workflow steps commit state with `git`" (`cohort-state-storage.md`), whose fate closes
  the task loop through the close verb, and the inbound entry "Rehearse the flip's workflow rewrite end to end, and
  quiesce every session holding today's workflow text".

- _Observation:_ from the flip `arc task close` closes tasks after the commit and captures their commits (D16), and
  `arc release commit --close` runs it at the commit fire site under the approval that covers work and commit
  (`draft-seam-lifecycle.md` § Lifecycle, "The task close verb"; Owner, 2026-10-12). Today the loop marks `[x]` before
  the commit, runs the quality request over that completion edit, and removes the `[x]` on red.

- _Approach:_ the loop writes no `[x]`; the red-path removal and the pre-report checklist's "Task marked [x]" line go,
  the verb's result standing as the record; the completion note stays the agent's hand edit before the gate; deferred
  review closes its range in one call. Two steps reorder: the `post-task-completion` extension, which syncs an external
  tracker and today fires before the gate, fires after the close; and delivery's correction acknowledgment, which
  closes the task mid-protocol and then resumes.

- _Captured during:_ `seam-lifecycle` draft-design close, 2026-10-12.

- _Drain note:_ `spec-seam-lifecycle.md` § 9.5 carries the provider text, including a hand `[~]` becoming `arc task
  defer`.

### `[ ]` **Rewrite park and resume as pause and resume**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-13).

- _Shapes:_ § Scope's documentation pass, and the register row "Workflow steps commit state with `git`"
  (`cohort-state-storage.md`).

- _Observation:_ from the flip `arc pause` and `arc resume` replace `arc park`: a pause is a record on the work item,
  not a move; the checkout stays unless released (`arc locus release`); the pointer record, park from Planning's
  landing, and the parked position retire (`draft-seam-lifecycle.md` § Lifecycle, "Lifecycle moves from the flip";
  Owner, 2026-10-12). The two workflows shrink to the verbs.

- _Captured during:_ `seam-lifecycle` draft-design close, 2026-10-12.

- _Drain note:_ `spec-seam-lifecycle.md` § 19 also names QUICK-REFERENCE's verb index, where `arc pause` replaces `arc
  park`.

### `[ ]` **Let the Locus definition end a work unit's locus at release as well as teardown**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-13).

- _Shapes:_ § Scope's documentation pass, over the rules the register marks rewritten at cutover.

- _Observation:_ the definition says a WU-owned locus "is exclusive from spawn, materialization, or explicit `--here`
  entry through exact teardown". From the flip `arc locus release` also ends that role: it releases a paused work
  unit's checkout for its owner, or a checkout whose work unit another identity owns, and for an anchored checkout
  releases only the marker (`draft-seam-locus.md` § Locus, "Pause, from the flip"; Owner, 2026-10-12). The sentence
  becomes "through exact teardown or release".

- _Files:_ `packages/arc-framework/arc/reference/briefs/AGENT-BRIEF.ARC.md`, synced to `.arc/reference/briefs/`.

- _Captured during:_ `seam-locus` draft-design close, 2026-10-12.

- _Drain note:_ `strategy-work-organization.md` and `resume-work-unit.md` carry sibling sentences that end a locus at
  teardown alone.

### `[ ]` **Rehearse the flip's carry of checkouts claimed in place before it**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-13).

- _Shapes:_ § Scope's rehearsal.

- _Observation:_ before the flip no in-place arm writes a checkout marker — the cold start, `arc start --here`'s
  graduation, and `arc materialize --here` all leave none — and the import leaves the marker out as machine-local. From
  the flip, locus derivation reads only the marker and the store, so every checkout claimed in place before the flip
  holds its work unit with no marker. `seam-locus` designs the carry: session start offers
  `arc materialize <slug> --here` for a marker-less checkout that has out a branch an owned in-flight work unit links,
  and a work unit no checkout holds, one cold-started on base under partial protection among them, takes the ordinary
  materialize offer (`draft-seam-locus.md` § Locus, "Checkouts claimed in place before the flip").

- _Approach:_ the rehearsal runs both: a pre-flip `arc start --here` checkout on a work branch under full protection,
  and a cold start on base under partial protection, each carried to an anchored marker after the import.

- _Captured during:_ `seam-locus` draft-design, fourth adversarial pass, 2026-10-12.

- _Drain note:_ `spec-seam-locus.md` § 2.7 now lists more in-place arms than this entry: in-place resume, and
  promotion on the primary.

### `[ ]` **Rewrite the workflow steps the seam's lifecycle verbs replace**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-13).

- _Shapes:_ the register row "Workflow steps commit state with `git`" (`cohort-state-storage.md`), and the inbound
  entry "Take `storage-seam`'s flip-rewrite obligations into the cutover's workflow rewrite", whose `Class` list this
  entry partly repeats.

- _Observation:_ `draft-seam-lifecycle.md` (Owner, 2026-10-12) adds verbs and results whose workflow text changes only
  at the flip, as the seam changes no workflow text before it:
    - `arc set-class` replaces each step that hand-edits `Class` where no `--class` flag covers it (§ Lifecycle, "The
      Class verb");
    - `Owner` turns verb-owned, so the person-to-person handoff's hand edit (`session-handoff.md`'s handoff note,
      `strategy-team-coordination.md`'s handoff passages) moves to `arc handover`, and `init-work-unit.md`'s step
      preserving the stub's `Owner` goes, since starting a stub records the starter;
    - activation's result names the old name's remote deletion as a typed action only for a branch link recorded
      `created`, so `activate-work-unit.md` Step 5 runs the actions the result names rather than its raw
      `git push origin --delete`; deactivation keeps the work branch, so `deactivate-work-unit.md` Step 3's remote
      delete goes;
    - `arc base sync`'s detached arm lives in `handleBaseSync` (`handlers/base.ts`), whose consumer-map row is this
      work unit's, so the two serialize on that file.

- _Captured during:_ `seam-lifecycle` draft-design close, 2026-10-12.

### `[ ]` **Drop `resolveCurrentWuName` from the cutover's list of `lib/user-sync/` survivors**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-13).

- _Shapes:_ the survivor list in the inbound entry "Delete the code `cli-substrate-complete-migration` carves out",
  and the register's notes-specific sync row.

- _Observation:_ the draft lists `resolveCurrentWuName` (`lib/user-sync/current-wu.ts`) among the symbols that must
  survive the notes deletion. `spec-seam-locus.md` § 2.2 moves its one caller outside notes sync, the user-reference
  reconcile (`handleUserReconcileReferences`, `handlers/user.ts`), onto `resolveCurrentWorkUnit`, leaving only the
  notes-sync commands (`commands/user/sync-status.ts`, `commands/user/save-load.ts`, and `handlers/user.ts`'s notes
  arms) calling it. Once that lands, the function goes with the notes machinery rather than surviving it.

- _Approach:_ move it from the survivor list to the removed set, after re-checking its callers when the cutover plans.

- _Captured during:_ `seam-locus` create-spec, 2026-10-12.

### `[ ]` **Leave no tracked or installed file in a projected root from the flip**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-15).

- _Shapes:_ § Scope — the flip and its first full materialization; an expected contract in
  `spec-storage-projection.md` § 18.

- _Observation:_ from the flip `.arc/active/`, `.arc/backlog/`, and `.arc/completed/` are projected roots. Today the
  roots hold tracked files the import turns into records, and the installer writes files there
  (`lib/classification.ts`). `completed/README.md` is a Configurable file that `arc update` reinstalls; no record
  claims it, so it stays unadopted and every checkout removal refuses over it until it is deleted.
  `backlog/ROADMAP.md` and `backlog/ATOMIC-INBOX.md` come from Scaffolded templates installed at the paths the
  projection writes the roadmap view and the project inbox to (`lib/layout/projection.ts`), so an install there writes
  over a projected file.

- _Approach:_ at the flip, untrack the shared roots' files once their records are imported, and stop the installer and
  `arc update` writing any file into a projected root (drop or relocate those entries in `lib/classification.ts` and
  `init-recipe.json`).

- _Captured during:_ `storage-projection` generate-tasks, adversarial pass 1 finding F17 (approved disposition),
  2026-10-14.

### `[ ]` **Lock every unlocked work-item worktree at the cutover's quiesce**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-15).

- _Shapes:_ § Scope — the window's quiesce; an expected contract in `spec-storage-projection.md` § 18 and its § 12.7.

- _Drain note:_ `PROJECTION_LOCK_REASON` is not in code yet (2026-10-15); it lands with `storage-projection`.

- _Observation:_ `storage-projection` locks each work-item checkout ARC spawns, with `PROJECTION_LOCK_REASON`, but runs
  no one-off backfill: a worktree spawned before its lock landed takes the lock only when it is next spawned. One left
  unlocked at the flip is exposed to a plain `git worktree remove`, which deletes its gitignored projection without
  persisting its edits.

- _Approach:_ in the quiesce, run `git worktree lock --reason` with the value `PROJECTION_LOCK_REASON` holds, read from
  the built constant, on each linked checkout whose marker names a work unit or an Errand and that carries no lock;
  leave anchored and unmarked worktrees unlocked.

- _Captured during:_ `storage-projection` generate-tasks, adversarial pass 1 finding F22 (approved disposition),
  2026-10-14.

### `[ ]` **Decide whether `scratch/.internal/` is machine-local or the person's own**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-15); homed at the
  drain.

- _Shapes:_ § Scope — the deletion passes, where per-work-unit workspaces retire at the flip.

- _Observation:_ `MACHINE_LOCAL_PATHS`' `<identity>/*/.internal/**` (`lib/store/registry.ts`) also matches
  `.arc/user/<identity>/scratch/.internal/`, while D5 (`spec-storage-contract.md`) says `scratch/` holds the person's
  own documents, where anything goes. From the flip, work-unit workspaces retire, so the one-folder-down pattern's
  practical reach is `scratch/.internal/` and any other identity subfolder: a file there is never stored or synced, the
  projection skips it, and it goes with its checkout. The reference backend refuses those keys too
  (`machineLocalPersonalPath`, `__tests__/helpers/store/refusals.ts`).

- _Approach:_ narrow the pattern to the per-workspace `.internal/` it was written for once workspaces retire, or state
  in D5 that `scratch/.internal/` is machine-local.

- _Captured during:_ `storage-projection`'s create-spec fix-check round 6, 2026-10-14; the tension is in the registry
  and D5, not that spec.

### `[ ]` **Drop the retired extension step from the task-close rewrite's reorder**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-15); split from
  "Reconcile task-close sequencing and the storage reader inventory with retirement".

- _Shapes:_ inbound "Rewrite the task loop's completion around the task close verb".

- _Observation:_ that entry reorders the `post-task-completion` extension to fire after task close, but
  `retire-extension-points` removed the step outright.

- _Approach:_ drop the extinct extension reorder while preserving task-close and delivery acknowledgment behavior. The
  capture's other half, removing extensions from the cohort register's reader census, runs as an Errand.

- _Captured during:_ `retire-extension-points` draft close, 2026-10-13.

### `[ ]` **Run the full destructive CLI matrix with the flipped backend before release**

- _Routed from:_ `seam-locus` terminal verification, 2026-10-16.

- _Shapes:_ § Scope's scratch-repository rehearsal and pre-release validation of the actual backend flip.

- _Observation:_ the current production executable selects the in-repo backend. `seam-locus`'s A17 proves dormant
  destructive success and repaired continuation through registered CLI-generated handler inputs, the reference Store,
  and real Git; its built-CLI scenarios prove pre-flip refusals. That split leaves successful execution through the
  actual flipped built CLI unproven. The full 14-group matrix is in `notes-seam-locus.md` § Destructive-path
  verification and flip release checks; the obligation belongs to the work unit that controls the flip.

- _Required check:_ run every group below in scratch repositories through a spawned built CLI selecting the real
  flipped backend and production ports, before releasing the flip. Cover success, each material refusal, and successful
  continuation after repair. Retain command results and observable record, UID, marker, checkout, code-ref, and personal
  byte outcomes. Handler/provider success does not discharge this check. Keep current handler-versus-built-CLI evidence
  labeled separately; the templates locate existing scenarios rather than asserting a live flipped-backend pass.

- _Matrix:_ paths for the templates are under `packages/arc-framework/__tests__/integration/`, unless identified as
  unit/provider coverage in `notes-seam-locus.md`.

    1. cold/named start and default bound lifecycle ports: One Planning Store primary; anchored marker/editor excludes
        only in checkout; HEAD/base unmoved; held/former/Errand name and second marker refuse before writes; repaired
        retry; default ports and rebind preserved. Templates: start-cold-store; lifecycle-default-locus-ports;
        lifecycle-marker-occupancy; executor-context.
    2. graduate/materialize/rename/teardown: Occupied marker refuses before Git; materialize existing
        local/remote/branchless work and --here; rename follows marker holder; completed anchored teardown clears marker
        and retains adopted resources as specified. Templates: lifecycle-default-locus-ports;
        lifecycle-marker-occupancy; materialize-store-cli; materialize-store; corresponding work-unit verb units.
    3. locus release anchored/spawned: Live owned marker refuses until pause; anchored release preserves dirty files and
        record; spawned dirty/unpreserved detached commits refuse; repair then removes only intended
        checkout/registration; fresh marker generation required. Templates: locus-release; session-cli-repair release
        case; unit/locus/release.
    4. inbox + route insertion/move/carry: Listed stable ID/version; atomic source removal/destination insert/both
        receipts; stale version stays; racing edit lists survivor with derived home; failed carry preserves both;
        repaired carry replaces intended owner entry only. Templates: inbox-cli-dispatch; inbox-cli-repair; lib/inbox
        route/mover/survivor/receipt units.
    5. errand queue and queue set: Queue IDs/ranks resolve listed entries; duplicate IDs refuse unchanged Store;
        repaired stdin accepted; ineligible members reported; selected start consumes only chosen queue member.
        Templates: inbox-cli-repair; inbox-cli-dispatch; queue/queue-ranks/offer units.
    6. full/partial open + link: Project queued capture moves into description with date/ID and leaves queue; text
        description minted; link appends actual capture; correct real branch/marker; partial origin binds listed
        version. Templates: inbox-cli-dispatch; R adoption/batch units.
    7. Errand leave and rematerialize: Dirty checkout refusal preserves bytes and record; real preservation permits
        pause and exact checkout removal; missing code ref refuses unchanged; restored code permits the same UID/claim
        and saved HEAD to resume. Templates: errand-preservation-store-cli.
    8. abandon and failed-open rollback: Full abandon returns receipt-selected source; collision names version-bound
        carry repair and leaves data/marker; repaired carry+retry succeeds; partial abandon leaves capture/queue; real
        provisioning failure returns entry; repaired same-slug retry allocates fresh active description and preserves
        failed generation. Templates: inbox-cli-repair; errand-open-rollback-cli.
    9. close and ID/version removal: Partial close removes only observed version after real preservation evidence;
        edited/later capture retained and replay absent; unchanged full close leaves description/later same-ID capture;
        actual changed-code landing stores qualified landingCommit; terminal/merge A20 failed claims repair. Templates:
        inbox-cli-dispatch; inbox-cli-repair; close-store-landing; terminal-authority-store. The last two are
        provider/selector templates, not an existing complete built CLI host flow.
    10. promotion: Same UID role replacement, correct authorized checkout/foreign confirmation, branch cut/recovery and
        exact anchored marker settlement; description/history retained; promoted task-close set includes Errand work.
        Templates: errand-promote-store-cli; promote-store; promote-store-runtime; integration/errand-promote-store;
        integration/unclosed-task-commits. Registered-source success covers the primary checkout and both floors;
        spawned/foreign variants retain runtime/provider coverage.
    11. personal reconcile --apply / scratch: Managed links change through Store and lookup; stale support refuses
        before writes; prose/histories unchanged; occupied scratch preserved, owner repairs destination, alias move
        succeeds without advancing Store version or HEAD. Templates: user-reference-scratch-cli;
        user-reference-reconcile-store; session-cli-repair scratch case.
    12. handoff write file/stdin: Actual computed Store/Git anchors; overwrite exact session context; forged
        anchors/section boundary refusal unchanged state; repaired stdin succeeds; local maintain report only exceeded
        measurements; post-write maintain failure remains diagnostic. Templates: handoff-write-store; session-cli-repair
        handoff case; handoff-tripwires.
    13. identity add/init/join: Selected identity binding before configured identity; pull before read/seed; seed only
        absent records; warn on reuse; explicit decline/cancel preserves configuration/data; repaired/new choice seeds
        only selected person. Templates: identity-setup-store-cli; join-store-cli; identity-setup-store;
        user-personal-store-callers.
    14. session-init / handoff status / recovery / Candidate orientation: Real backend persisted state supplies slots,
        asOf task baseline and restate changes; unavailable state rebuild preserves original Git/same subject; mismatch
        stops; unclosed set and close/resume action appear; exact Store-owned Candidate ignores checkout bytes and
        repairs missing/conflicted state. Templates: completed-subject-matrix; recovery-state-basis/store-evidence;
        restate-store; unclosed-task-frame; recovery-unclosed-task-commits; subject-meta-candidate.

---
