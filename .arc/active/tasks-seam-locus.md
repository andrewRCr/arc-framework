# Task List: Seam Locus

- **Design:** `spec-seam-locus.md`

---

## **Phase 1:** Before the flip — the slots' actions, the removal outcomes, and the dormant admissions

_Purpose:_ Land everything observable before the flip first, and with it the substrate later phases build on: the action
shape every rebuilt slot carries, each registration's folder presence, the removal function's and check's outcomes in
their callers, the new verbs and settings, and the dormant admissions of the anchored marker and the origin binding.

_Mode:_ `slice` — closes on today's session start and removals carrying § 1.4's eight changes, each exercisable through
the path it changes.

_Exit criterion:_ Over the in-repo implementation, the session-init envelope in the session-init and
envelope-compatibility end-to-end scenarios (`__tests__/e2e/session-init.e2e.test.ts`,
`__tests__/e2e/session-envelope-compat.e2e.test.ts`), and the locus verbs' results (`arc locus --json`,
`arc active roster --json`, `arc active in-flight --json`) on those scenarios' repositories, differ from the merged
base's only by § 1.4's items, each item exercised through its path by its own test, and every other locus, session-init,
and personal-surface test passes unchanged.

_Design decisions:_ Every test a § 1.4 item changes, the envelope fixtures (`__tests__/fixtures/session-envelope/`) and
the schema registry's ID list among them, is named with that item in its commit and completion note, so Success
Criterion 1's "unchanged but for" stays checkable. The removal check (`checkWorktreeRemoval`), the removal function
(`removeWorktreeCheckout`), and the release (`releaseWorktreeCheckout`), all in `lib/git/worktree-removal.ts`, and
teardown's completion on a missing folder are the transition-write-path change's, built in its Tasks 1.6, 1.7, 1.9.b,
and 1.8.a - `tasks-seam-lifecycle.md`, as is the store a verb opens, in its Task 3.1; that change has landed (spec
§ 1.3). Every decision here runs the check with `disposition: "remove"`, since `release` reads only its projection part;
the function and the release take the primary's path (`primaryWorktreePath`), and the release leaves the marker to its
caller. Every work-unit state path this change resolves — a work item's meta or task list, or a cohort document — comes
through Task 1.9's work-item or cohort path under `lib/store/`, since the `work-unit-paths` leg counts every
layout-resolver call for one made outside `lib/store/` (`eslint/architecture-imports.ts`).

### `[x]` **1.1 Register the shared action shape and each rebuilt slot's schema — § 4.2, § 4.3**

- _Goal:_ Every slot § 4.2 names validates against a full schema registered in the session-envelope registry, which
  `arc schema` serves, and every condition wanting a repair carries `actions` in one registered shape.

    - `[x]` **1.1.a The action shape**

        - `SessionActionSchema` extends the store's remedy with an optional absolute checkout; the shared
          `SessionActionsSchema` refuses empty collections. Schema discovery serves `session-action`, and
          `session-envelope/registry.test.ts` and `helpers/production-schema-ids.ts` include its stable ID
          (spec § 1.4, item 1). Existing command fields stay unchanged. `session-envelope/actions.test.ts` covers text,
          argv, both absolute-path conventions, and refusals.

    - `[x]` **1.1.b Full schemas for the slots whose wire contract is a view today**

        - The seven slots now compose full strict producer-owned schemas with inferred result types, shared by locus,
          recovery, and session-init. Discovery also registers recovery's existing full schema. Routing refinements
          remain; user-reference validation admits the producer's quiet `remote-not-required` result.
        - Spec § 1.4, item 1 changes `unit/status/schema.test.ts`, `unit/status/session-envelope-schema.test.ts`,
          `unit/session-envelope/registry.test.ts`, `unit/session-envelope/type-authority.test.ts`,
          `unit/session-envelope/boundary-disposition.test.ts`, and `helpers/production-schema-ids.ts`, and adds
          `unit/session-envelope/slot-schemas.test.ts`. Wire fixtures retain their bytes.

### `[x]` **1.2 Give each rebuilt slot its actions for today's conditions — § 4.3, § 12.4**

- _Goal:_ Each rebuilt slot carries, for every condition it reports today that wants a repair, the action § 4.3's table
  gives it — typed where running it as given repairs the condition, text where the repair takes a decision, with its
  checkout where its verb works on the checkout it runs in — and a condition wanting no repair carries none.

    - `[x]` **1.2.a The reconciles**

        - Both reconciles emit typed inspection and apply actions; work-unit apply carries its checkout. Advisory-only
          plans offer inspection, unavailable user-reference evidence its text, and clean results stay quiet.
        - Spec § 1.4, item 1 changes `unit/session-init/current-wu-reconcile.test.ts` and
          `unit/user-reference-reconcile.test.ts`; recommendation fields retain their existing values.

    - `[x]` **1.2.b The work-unit, Errand, and inbox slots**

        - Work-unit completion events carry text actions; archival includes its checkout and integration includes the
          known base-first prerequisite. Awaiting review stays quiet. Errands carry exact materialize argv and resume
          or residue text; a routable inbox carries the housekeeping command as text.
        - Spec § 1.4, item 1 changes `unit/session-init/work-unit-state.test.ts`, `materializable-errands.test.ts`, and
          `inbox-state.test.ts`, and adds `errand-state.test.ts` in the same directory.

    - `[x]` **1.2.c The sweep's husks and the residue sweep**

        - Husk actions preserve today's primary and linked teardown forms, with manual text for unsupported subjects
          and untrusted stamps. Landed retirements expose their teardown as an action; blocked ones stay quiet.
          A unique authoritative successor exposes its typed start beside the existing remedy.
        - Spec § 1.4, item 1 changes `unit/session-init/stale-worktree-sweep.test.ts`,
          `unit/session-init/lifecycle-residue-sweep.test.ts`, and `unit/work-unit/retirement-lifecycle-result.test.ts`.

    - `[x]` **1.2.d The materialize offer and recovery**

        - Materializable work units carry typed materialize actions and pending discovery its exact refresh. Recovery
          carries the refresh as argv, a destination checkout or clean branch switch as text, and its existing decision
          text for every other outcome; recommendation fields retain their values.
        - Spec § 1.4, item 1 changes `unit/session-init/materializable-work-units.test.ts` and `unit/status/run.test.ts`,
          and adds `unit/session-init/recommended-action-recovery.test.ts`.

    - `[x]` **1.2.e The orphan-branch sweep**

        - Both producer paths attach typed teardown for shipped work units and `git branch -D` for landed branches;
          unmerged or unproven branches carry no action. The module describes that evidence boundary.
        - Spec § 1.4, item 1 changes `unit/session-init/orphan-branch-sweep.test.ts`, adds
          `e2e/session-init-orphan-actions.e2e.test.ts`, and changes the branch-gone envelope golden with its recovery
          action. The real-CLI scenario executes the offered argv and deletes a rebased orphan that `-d` refuses.

- _Outcome:_ Every existing repair condition now has its shared action form beside today's command fields. The envelope
  compatibility scenarios add only `recovery.value.actions` to `session-init-branch-gone.json`; the other golden values
  retain their bytes (spec § 1.4, item 1).

### `[x]` **1.3 Add `pausedWork` and `inboundBackPressure`, reporting nothing — § 4.2, § 4.4, § 4.6**

- _Goal:_ The session-init envelope carries both new slots with their registered schemas, each reporting nothing before
  the flip, in a value later phases extend.

    - `[x]` **1.3.a The slots' arms from the flip reporting nothing until Tasks 5.4 and 5.6**

        - _Retired in:_ Phase 5

- _Outcome:_ The two producer-owned schemas are registered; both slots enforce their presence rules and isolate failures.
  Spec § 1.4, item 1 changes `unit/status/run.test.ts`, `unit/session-envelope/registry.test.ts`,
  `unit/session-envelope/type-authority.test.ts`, and `helpers/production-schema-ids.ts`, and adds
  `unit/status/run-dormant-slots.test.ts`. The active-resume, branch-gone, current-husk, and orient session-init goldens
  add only the eligible empty slots; all other golden values retain their bytes.

### `[x]` **1.4 Read each registration's folder once per scan — § 2.1**

- _Goal:_ The registered-worktree scan carries whether each registration's folder is present, the derived roster's rows
  carry it, and session-init's readers that select or offer by a folder take it from those rows.

- _Outcome:_ Each registered checkout carries required `folderPresent` from one `lstat`; missing paths read absent and
  other failures retain presence. Derived rows and locus/session JSON preserve it. Rename's whole-record comparisons
  retain the field across the move. Spec § 1.4, item 2 adds `unit/git/worktree-roster-folder.test.ts` and
  `e2e/locus-folder-presence.e2e.test.ts`; all changed tests and golden fixtures are enumerated in the completion notes
  in `notes-seam-locus.md`. Golden values change only by the registered checkouts' folder fields.

### `[x]` **1.5 Take the removal check's outcomes in the sweeps, recovery, and `arc errand leave` — § 12.1**

- _Goal:_ Every removal decision in this change — the cleanup decision, the stale-worktree sweep, branch-gone recovery,
  the residue sweep, and `arc errand leave`'s authorization — decides through the removal check and reports
  `unobservable`, `locked`, and `missing` where today a failed status read folds into not clean.

    - `[x]` **1.5.a The cleanup decision**

        - The cleanup decision consumes `RemovalCheck`, preserving missing folders, foreign locks, and unobservable
          status separately; absent-folder outcomes precede marker checks.

    - `[x]` **1.5.b The stale-worktree sweep and the residue sweep**

        - Both sweeps take projection checks, preserve refusal reasons, and omit vanished husks and residue. A branched
          folder lost after roster observation reads external; both report schemas admit the new blocked reasons.

    - `[x]` **1.5.c Branch-gone recovery and its cascade**

        - Recovery joins the cached derived rows for folder observations, excludes missing registrations from both
          candidate tiers, and reports their guarded path remedies; foreign locks retain live switch targets.

    - `[x]` **1.5.d `arc errand leave`'s authorization**

        - Spawned Errand preservation runs the removal check before recording state, including injected projection
          refusals; the primary retains its Git status inspection.

- _Outcome:_ Spec § 1.4, item 4's changed and added tests are enumerated in `notes-seam-locus.md`. Missing recovery
  registrations carry text-only remedies; observation failures never grant removal.

### `[x]` **1.6 Remove an Errand's checkout through the removal function — § 12.1**

- _Goal:_ Every Errand exit through `lib/errand/terminal-occupancy.ts` — close, abandon, leave, and partial settlement —
  removes a spawned checkout through the removal function, inside the exit's own serialization and authorization, while
  the primary, which no exit removes, keeps its own `git status` read.

- _Outcome:_ All four exits carry projection slots through terminal settlement. Spawned checkout removal distinguishes
  check and persist refusals from operational failures, persists before removal, and returns idempotently for an absent
  registration. Exact marker, branch, and head checks remain before removal; partial exits retain primary inspection.
  Spec § 1.4, item 4's additional changed and added tests are enumerated in `notes-seam-locus.md`.

### `[x]` **1.7 Carry the removal prompts' commands, and report missing folders — § 12.2**

- _Goal:_ The stale-worktree sweep's removable worktree and branch-gone recovery's removable candidate each carry an
  `arc teardown <name>` argv, as the residue sweep's report already does, and the sweep reports every registration whose
  folder is missing in its own `missingFolders` field with its removal.

    - `[x]` **1.7.a The teardown argv**

        - Removable branched reports and recovery candidates carry marker-named teardown routes, including ambiguous
          recovery choices; the registered schemas admit their actions and recovery names.

    - `[x]` **1.7.b The sweep's `missingFolders`**

        - The primary sweep corroborates unmarked missing registrations through the removal check, separates their
          reports from branched cleanup, and offers typed teardown only for unlocked shipped work units. Other repairs
          remain guarded text, including owner-controlled unlocks; returned or unobservable folders wait for a new read.

- _Outcome:_ Spec § 1.4, item 2's test and golden changes are enumerated in `notes-seam-locus.md`; the envelope goldens
  gain only `sweep.value.missingFolders: []`. Displayed path operands are quoted literally, while typed argv remain the
  executable form. Workflow text stays unchanged until the flip.

### `[x]` **1.8 Move a locked checkout in the doubled-force form — § 12.3**

- _Goal:_ The residue sweep's rename-move remedy is `git worktree move -f -f <from> <to>`, so a checkout the projection
  later locks still moves with its lock and reason intact.

    - _Amended in:_ 1.R (A18)

- _Outcome:_ Validated branched and detached rename residues carry doubled-force move argv in both the remedy and
  typed actions, with shell-safe displayed paths; the sweep schema admits that same tuple.

### `[x]` **1.9 Record the state version and the layout-resolved paths in the compaction seed — § 4.9**

- _Goal:_ The compaction seed records the store's state version beside its explicit code-head baseline and resolves its
  meta path through the layout resolver, under an advanced schema version, staying a read-only projection of the
  envelope through the shared load-set projection.

- _Outcome:_ Seed schema 2 carries the store version independently of the code head, recording refusals as null.
  Shared work-item and cohort path providers retain layout authority; seed meta selection and archived-integration
  relocation use the layout inverse and provider instead of filename patterns. Recovery summaries carry the version.

### `[x]` **1.10 Register the new verbs, refusing `unsupported` — § 14**

- _Goal:_ `arc inbox`, `arc route`, `arc locus release`, `arc errand queue`, `arc errand queue set`, and
  `arc handoff write` are registered in § 14's forms, and each branches on the store's capability, refusing
  `unsupported` before the flip and naming what serves until then.

    - _Amended in:_ 1.R2 (A19)

    - `[x]` **1.10.a `arc locus release` refusing from the flip until Task 2.9**

        - _Retired in:_ Phase 2

    - `[x]` **1.10.b The listing, routing, and queue verbs refusing from the flip until Phase 6**

        - _Retired in:_ Phase 6

    - `[x]` **1.10.c `arc handoff write` refusing from the flip until Task 7.2**

        - _Retired in:_ Phase 7

- _Outcome:_ Six command registrations expose the complete argument and option forms, with owned input schemas,
  help summaries, and no-input policies. Each capability arm currently refuses with its serving path; bare locus
  inspection keeps its existing handler and behavior.

### `[x]` **1.11 Declare the three settings — § 4.4, § 4.6, § 14**

- _Goal:_ `inbound.retriage_after_entries` (default 10), `inbound.retriage_after_days` (default 30), and
  `pause.review_after_days` (default 14), each a positive integer, are declared beside `inbox.remind_after_days` and
  show in `arc config`, with no effect before the flip.

- _Outcome:_ The catalog and validator admit the three positive-integer settings at their declared defaults. Full
  configuration views expose them; session-init's narrowed keys remain unchanged. The packaged template remains
  unadvertised for these dormant settings, with the inventory test recording that exact boundary.

### `[x]` **1.12 Admit the anchored marker and the origin binding's new form, dormant — § 2.3, § 7.6**

- _Goal:_ A work-unit marker carrying `spawnedByArc: false` is admitted and read `external` by every removal reader, and
  a partial Errand's origin binding as a qualified ID with its version, and an Errand record's inbox origin with a
  `null` digest, are admitted wherever they are read — while nothing writes either before the flip.

    - `[x]` **1.12.a The marker check and the topology check**

        - Raw and occupancy markers round-trip anchored work-unit ownership, without transient or retirement stamps.
          Both primary and linked topology admit it; spawned work units still refuse primary occupancy. The ordinary
          ownership writer retains its existing creation guard.

    - `[x]` **1.12.b The derived evidence and the removal readers**

        - Derived evidence preserves the marker's spawn flag. Cleanup reports anchored checkouts as external, and the
          retirement sweep excludes them from teardown offers; husk cleanup keeps its existing stamp requirement.

    - `[x]` **1.12.c The origin binding and the null digest**

        - Shared marker validation admits exactly one digest or version basis. Provisioning, derived evidence, roster
          rows, and partial settlement preserve a version binding. Inbox-origin records, claims, and link transitions
          admit null digests. The before-flip callers keep writing their existing forms.

- _Outcome:_ Dormant admissions span raw markers, their projected schema, provisioning, and settlement without adding
  a producer before the flip. Changed test inventory and reconstruction evidence are in `notes-seam-locus.md`.

### `[x]` **1.R Align the rename-move E2E assertion with its admitted action — § 1.4 (A18)**

- _Goal:_ The real session-init rename scenario checks the doubled-force remedy and typed action required by § 1.4's
  items 1 and 3, and its changed test is recorded with those items.

- _Outcome:_ The existing real-CLI rename scenario asserts the doubled force, quoted executable text, and matching
  typed action. Its changed test joins § 1.4's items 1 and 3 in the completion inventory; Task 1.13 remains open.

### `[x]` **1.R2 Include dormant handlers in the CLI-loading inventory — § 1.4 (A19)**

- _Goal:_ The CLI-loading boundary checks every handler registered by § 1.4's item 6, retaining the assertion that all
  implementation handlers load lazily and perform no import-time registration.

- _Outcome:_ The complete inventory includes all five new handler modules, so both lazy-loading assertions and the
  import-time registration scan cover them. Completion evidence is rewrapped without changing its meaning.

### `[x]` **1.13 Before the flip** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

- _Outcome:_ Against fresh base `c45c3e908`, session-init and the three locus queries on the envelope fixtures differ
  only by § 1.4's slot actions and empty slots, folder presence, and missing-folder lists. The original scenarios and
  surrounding locus and personal-surface suites close with Task 1.R's corrected assertion; no suppression entry or count
  increased. `notes-seam-locus.md` records the comparison evidence and Task 1.R2's complete handler inventory.

## **Phase 2:** Locus from the marker and the store

_Purpose:_ Derive every checkout's role from its marker and the store, keep every registered checkout in the worktree
roster, make the marker the guard branchless planning needs, and bind the ports the transition-write-path change injects
— the composition every later phase reads through.

_Mode:_ `slice` — closes on a checkout claimed, derived, guarded, and released through the marker and the store.

_Exit criterion:_ Over the reference backend and a scripted repository, a cold start writes its anchored marker and its
one record, the roster derives that checkout's role and a detached planning checkout's from their markers and the store,
a second checkout's marker write for the same work unit refuses naming the holder, `arc locus release` clears the
anchored marker and removes a spawned checkout, and lifecycle's spawn, graduation in place, rename, and
`arc materialize` reach these reads through their bound ports.

_Design decisions:_ The marker is per machine, so the exclusivity check and the lookup read only this machine's roster;
across machines the work unit's owner governs. Every arm here keeps its in-repo twin running today's code, and a
checkout with no marker keeps today's active-meta reading until the flip. Each reader this phase moves onto the store
takes it as an optional `store`, as `resolveCurrentWorkUnit` does, opening its own over the checkout where none is
given. Promotion's marker settlement lands in Task 3.9, after the Errand runtimes read their records through the store
(spec § 8.3). Every branch link this change writes or looks up names the project ID as its repository and the branch's
short name as its ref, as that change's writer does. The project ID comes from the project-ID port that change injects
(`projectId`, `lib/work-unit/executor-context.ts`), which its executor context binds from the flip to a read of the
project's identity record (`createProjectIdentityReader`, `lib/store/project-identity.ts`). Each reader and writer of
links in this change takes the port as optional, as it takes `store`, a verb holding an executor context passing the
executor's; given none, over a store that reads state off the branch, it binds the same read over the store it reads,
and a composer building several such readers over one store, as session start does, passes them one, so the invocation
reads the record once (spec § 2.1). A read that gets no project ID — the port absent, or its read failing — treats it as
an incomplete observation, never matching no link or every link (spec § 2.1), where that change's task close refuses
both (`resolveProjectIdentity`, through `prepareTaskClose`) and its readers given none pass no repository, which
`selectWorkBranchLink` reads as every link. A work item's branch comes from its links through that change's selection
(`selectWorkBranchLink`, `lib/store/lifecycle-branch.ts`), or against a checkout its resolver
(`resolveLinkedCheckoutBranch`, `lib/git/default-capture-set.ts`), which requires the project ID as its repository, so a
read that gets none stops at that incomplete observation before calling it.

### `[x]` **2.1 Derive each checkout's role from its marker and the store — § 2.1**

- _Goal:_ From the flip each registered checkout's role comes from its marker, naming the work item, and that work
  item's placement, `State`, owner, and pause read through the store — never from the checkout's `.arc/active/` — with a
  completed work unit in the frame its archive cadence allows, two markers naming one work unit unresolved for both, and
  an incomplete observation granting no role and no cleanup authority.

    - `[x]` **2.1.a The personal root's layout address**

        - Added the personal-root layout address; the probe resolves its identity-global root through it.

    - `[x]` **2.1.b The evidence over the store**

        - The selected store supplies primary records, branch links, project identity, cohort paths, and lifecycle
          facts; unresolved observations retain their diagnostics.

    - `[x]` **2.1.c A completed work unit's frame**

        - Completed records derive the cadence-specific integration or retired frame from landing links, lineage, and
          exact patch containment.

    - `[x]` **2.1.d The derived roster and frame**

        - Roster and frame projections retain pause context and reject duplicate marker holders and incomplete inventories.

### `[x]` **2.2 Keep every registered checkout in the worktree roster — § 2.1**

- _Goal:_ From the flip the worktree roster keeps detached checkouts, and every checkout whether or not one holds an
  active meta, each row's work unit coming from its marker and its owner from the work unit's record; and every consumer
  that took `metaFilePath` as the sign of a work unit, or a row's branch as its key, reads the row as § 2.1 states.

    - `[x]` **2.2.a The roster's rows from the flip**

        - Store-backed roster rows retain detached and non-work-unit checkouts, with work-unit identity and ownership
          resolved through their marker and record.

    - `[x]` **2.2.b The roster's consumers**

        - Roster consumers use work-unit identity; branch-specific consumers skip detached rows while class composition
          counts and labels them.

### `[x]` **2.3 Resolve the current work unit through the contract's resolver — § 2.2**

- _Goal:_ `resolveActiveWu`'s body, the cold start's occupancy check, `resolveOriginatingMetaPath`, and the
  user-reference reconcile's current-work-unit read all take `resolveCurrentWorkUnit`'s result, so no locus reader lists
  `.arc/active/` itself, while a checkout whose meta has left `.arc/active/` keeps its session notes scanned until the
  flip.

- _Outcome:_ Current-work-unit and originating-meta resolution use the storage resolver, retaining link-derived branches
  and legacy branch-name fallback for notes reconciliation. The obsolete raw-state and surface-name floors are removed.

### `[x]` **2.4 Build the exclusivity check and the holding-checkout lookup — § 2.4**

- _Goal:_ The roster exposes two reads per machine: the exclusivity check, which refuses when another registered
  checkout's marker names the work unit about to be held, or when the roster cannot show that none does, naming the
  repair; and the lookup of the checkout whose marker names a given work unit.

- _Outcome:_ The context-bound marker inventory supplies exclusivity and holder lookup, with explicit repair paths for
  unreadable markers, incomplete registration, duplicate holders, and Integrating work.

### `[x]` **2.5 Bind lifecycle's locus ports — § 2.4, § 2.6, § 16**

- _Goal:_ The spawn, graduation in place, and `arc materialize` in both its arms, spawned and `--here`, run this
  change's exclusivity check; rename, `arc materialize`'s candidates, abandon, start, teardown, pause, and handover find
  the holding checkout through this change's lookup; and the in-place arms write the anchored marker through this
  change's writer — each through the transition-write-path change's ports, bound at their one production point.

    - `[x]` **2.5.a The anchored-marker writer**

        - The bound writer registers the ignore rule and creates or replaces exact anchored-marker generations; rollback
          removes only the generation written.

    - `[x]` **2.5.b The binding**

        - Production executors bind and retain the locus ports across rebinding. Registered CLI scenarios exercise
          graduation, materialization, rename, teardown, handover, and start refusals, including repaired marker and
          roster evidence.

### `[x]` **2.6 Reroute the cold start onto the marker and the store — § 2.5, § 2.6**

- _Goal:_ From the flip `arc start --here`'s cold start, entered through the transition-write-path change's cold-start
  slot, refuses a name given with `--new` that the store holds as start's dispatch does, admits only a crashed cold
  start's marker, refusing every other with its exit; checks exclusivity; then writes the marker's ignore rule, the
  editor documents, and the anchored marker, and last the scaffold's one record write — no tracked file, no branch, no
  `SESSION-NOTES` seed, and `HEAD` unmoved — removing the marker on any failure, and reports the work unit and its
  checkout; until the flip it runs as today.

    - `[x]` **2.6.a The entry, and occupancy from the marker and the store**

        - Store start dispatch admits cold creation only after name and class checks; occupancy classifies the marker
          and preserves crashed-start recovery and each role's explicit exit.

    - `[x]` **2.6.b The sequence from the flip**

        - Cold creation writes editor documents and the anchored marker before its single store scaffold write; failures
          remove that marker generation and leave code HEAD unchanged.

    - `[x]` **2.6.c The prompt and report**

        - Detached cold creation accepts an explicit slug and reports its work unit and checkout; an underivable name
          refuses before any write.

    - `[x]` **2.6.d The frame's actions for a marker naming no record**

        - No-record marker rows carry the anchored restart-or-release guidance or the spawned checkout's typed release
          action.

### `[x]` **2.7 Find checkouts claimed in place before the flip — § 2.7**

- _Goal:_ From the flip derivation finds each checkout with no marker, its folder present, that has out a branch linked
  by an in-flight work unit this identity owns, so session start can offer that work unit
  `arc materialize <slug> --here` from that checkout and leave it out of the ordinary materialize set.

- _Outcome:_ Markerless, present checkouts match owned active work through repository-qualified branch links; missing
  folders, base-only work, and foreign ownership yield no match.

### `[ ]` **2.8 Resolve the session notes through one resolver, and reconcile scratch — § 2.8**

- _Goal:_ From the flip every reader of the session-notes path reads one resolver, which gives the meta's projected
  path; the load set takes its meta and task-list paths from the layout resolver; `arc user open` refuses naming the
  session context; and the user-reference reconcile plans and applies the person's scratch folders through `lookup`.

    - `[ ]` **2.8.a One session-notes resolver**

        - From the flip six readers read `resolveWorkUnitSessionNotesPath` (`lib/handoff/session-notes-path.ts`), keyed
          by the work unit, whose arm from the flip gives the meta's projected path through Task 1.9's work-item path:
          handoff's restate probe (`resolveSessionNotesPath`, called by `restateCandidates`,
          `handlers/status/session.ts`), which today finds no path where several work-unit folders hold a
          `SESSION-NOTES.md`; handoff's surfaces (`resolveHandoffSurfaces`), whose path the status run reads
          (`commands/status/run.ts`); `arc view` (`handlers/view.ts`, through `lib/view-artifact.ts`); the load set's
          own entry (`lib/load-set/projection.ts`); and the user-reference reconcile's probe in the session-init binding
          (`handlers/status.ts`) and its command (`handleUserReconcileReferences`). Until the flip each keeps its own
          resolution.
        - The load set from the flip carries no separate session-notes entry, the meta being already a full entry.
        - The session-notes address (`resolveArcPath`'s `session-notes` document) and
          `materializeWorkUnitSessionNotesPath` stay the workspace's, so `runUserClose` (`commands/user/close.ts`),
          which from the flip only `arc user close` calls, keeps removing that folder and never reaches the meta's;
          start's stamp of the seed's `Commit at Handoff` (`stampStartSessionNotesCommit`, `handlers/start.ts`) is never
          reached from the flip, since store start runs no ceremony.

        - Build `test-first` (one behavior at a time):
            - over the reference backend each reader resolves the meta's projected path, the restate probe among them
              with several work-unit folders present
            - over the reference backend the load set carries no session-notes entry
            - over the in-repo implementation each reader resolves as today
            - `arc user close` removes the workspace's folder and leaves the meta

    - `[ ]` **2.8.b The load set's meta and task-list paths**

        - The load-set projection (`resolveLoadSetManifest`) resolves the meta's path through Task 1.9's work-item path
          from the work unit's slug and placement, which its four callers supply in place of the path they build today
          (`lib/locus/subject-meta.ts`, `commands/status/run.ts`, `lib/recover/locus-context.ts`,
          `lib/compaction-seed/emitter.ts`).
        - From the flip the task list's path is the work item's task-list record's, through the same function; until
          then the meta's `Task List` pointer gives it, as `projectCheckoutSubjectMeta` reads it today. The callers pass
          the store's capability with the slug and placement.

        - Build `test-first` (one behavior at a time):
            - the meta entry comes from the layout resolver for an active and a completed work unit
            - over the reference backend the task-list entry is the task-list record's projected path
            - over the in-repo implementation a `Task List` pointer naming another file is honored

    - `[ ]` **2.8.c `arc user open` from the flip**

        - `arc user open` (`handlers/user.ts`) refuses `unsupported` from the flip, naming the meta's session context,
          which `arc handoff write` writes; until then it runs as today.

        - Build `test-first` (one behavior at a time):
            - over the reference backend it refuses with that remedy, and over the in-repo implementation it opens as
              today

    - `[ ]` **2.8.d The scratch reconcile**

        - From the flip the user-reference reconcile (`lib/user-reference-reconcile.ts`) plans the person's folders
          under `.arc/user/<identity>/scratch/work-unit/<slug>/` in the checkout the session enters — 2.1.a's address
          materialized there, not under the primary, since the projection creates each checkout's folder under that
          checkout's own identity root — resolving each through `lookup`; its slot reports the plan, and
          `arc user reconcile-references --apply` applies it, since session start writes nothing:
            - a folder whose work unit was renamed follows its current slug, applied unasked as the reconcile's
              reference rewrites are, taking the place of an empty folder there, as the projection creates; where the
              current slug's folder holds anything, neither folder moves, the two are never merged, and the plan reports
              both paths as text for the person to combine;
            - a folder whose work unit has ended is reported with its path, as text for its person to remove once
              nothing in it is wanted (§ 4.3), and never removed, `--apply` included;
            - a name resolving to no work unit is left and reported;
            - a promoted work item's folder reconciles as a fresh start's does.
        - An absent scratch root plans nothing. The plan's fields join `userReferenceReconcile`'s registered schema
          (Task 1.1.b).

        - Build `test-first` (one behavior at a time), over the reference backend:
            - a renamed work unit's folder is planned and, on `--apply`, moved to its current slug
            - an empty folder at the current slug, as the projection creates, is replaced by the renamed one on
              `--apply`
            - a folder at the current slug holding anything leaves both folders in place, `--apply` included, and the
              plan reports both paths as text
            - an ended work unit's folder is reported with its path as text, and `--apply` leaves it
            - a name resolving to no work unit is left and reported
            - a promoted work item's folder reconciles as a fresh start's
            - an absent scratch root plans nothing
            - a linked checkout's session plans that checkout's folders, not the primary's

### `[ ]` **2.9 Add `arc locus release` — § 5**

- _Goal:_ From the flip `arc locus release [<slug>]` releases the checkout whose marker names the work unit, or the
  current checkout — a spawned one through the removal function, an anchored one through lifecycle's release —
  revalidating the marker's generation first, moving the process out of a checkout it releases from inside, and refusing
  as § 5 states with § 13's remedies; and the stale-worktree sweep reports the checkouts it releases.

    - `[x]` **2.9.a The target and who may release**

        - Release resolves the marked holder and checks ownership, pause, lifecycle, and transient-role authority,
          retaining each refusal's concrete repair.

    - `[x]` **2.9.b The two arms**

        - Spawned release uses shared checked removal and protects detached commits; anchored release preserves dirty
          files, revalidates generations, and invokes the bound projection release before clearing its marker.

    - `[ ]` **2.9.c The sweep's release rows**

        - From the flip the stale-worktree sweep reports a checkout whose work unit another identity owns, past the two
          filters that keep it out today — the roster's owner filter (`filterRosterByIdentity`) and the sweep's skip of
          a marker another identity spawned (`runStaleWorktreeSweep`) — and another checkout whose marker names a work
          unit with no record, each with `arc locus release <slug>`, typed (§ 4.3).

        - Build `test-first` (one behavior at a time), over the reference backend:
            - in team mode another identity's checkout reports with its typed release
            - another checkout's no-record marker reports with its typed release
            - over the in-repo implementation the sweep filters as today

### `[x]` **2.R Refuse an occupied checkout in lifecycle's in-place arms — § 2.6**

- _Goal:_ From the flip graduation in place and `arc materialize --here` refuse a checkout whose marker names anything
  but the work unit they claim, before any Git step and naming that marker's exit, and report a marker that appears
  before the anchored marker's write naming the checkout (A4); until the flip the guard reads as today.

- _Outcome:_ The shared occupancy guard refuses transient, husk, ended, backlog, and no-record claims before in-place
  Git work; marker creation races retain the checkout-specific inspect-and-rerun repair.

### `[ ]` **2.10 Locus from the marker and the store** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - Run the exit criterion's scenario over the reference backend and a scripted repository — the cold start, the
      roster's detached row, derivation, the refused second marker, both release arms, and each bound port — and request
      `arc check segment`.

## **Phase 3:** What is in flight, and the Errand record through the store

_Purpose:_ List what is in flight from placement rather than branch refs, acquire Errands and claims apart, move the
Errand runtimes and promotion onto the store, and rebuild the overlap check and the shipped-work and former-slug readers
over that set.

_Mode:_ `slice` — closes on the in-flight set derived from the store, with Errands and claims acquired apart, and the
overlap check and reconcilers reading it.

_Exit criterion:_ Over the reference backend, the in-flight set lists work units and open Errands at placement active, a
paused and a branchless planning work unit among them; the Errand runtimes open, close, abandon, and promote through the
store with expected versions, a close keeping its record at placement `completed`; the overlap check reports a state
target's work item in flight elsewhere and nothing for an entry-list target; and a former slug resolves through
`lookup`. Over the in-repo implementation every reader and runtime here reads as today.

_Design decisions:_ Every reader and runtime here branches on the capability where it is called, keeping today's code as
its in-repo arm, since the in-repo store's Errand reads are local-only where the runtimes fetch and reconcile, and its
placement listing reads the working tree where the shipped-work readers read the archive at a base ref (spec § 1.5). The
arms from the flip live in sibling modules, since `lib/git/in-flight-derivation.ts` and `handlers/errand.ts` already
carry `max-lines` floor entries. Each Errand handler whose runtime reads or writes the Errand record —
`handleErrandOpen`, `handleErrandLink`, `handleErrandLeave`, `handleErrandClose`, `handleErrandAbandon`,
`handleErrandPromote`, and `handleErrandMaterialize`'s own read (`handlers/errand.ts`) — opens the store over its
checkout as lifecycle's verbs open theirs (`openDefaultStore`, through `resolveVerbBase`,
`handlers/lifecycle-shared.ts`) and passes it to its runtime as an optional `store`, as
`PromoteOrdinaryErrandRuntimeOptions` already takes one, so each runtime branches on that store's capability; tests
inject a reference-backend store.

### `[ ]` **3.1 Derive the in-flight set from placement — § 3.1, § 3.6**

- _Goal:_ From the flip in-flight derivation lists work units and open Errands through the store at placement active,
  and the identity's claims that name a branch, and reads each work item's lifecycle facts there — a remote branch
  outliving its work item reading as a locus hint, never lifecycle authority; an entry's branch absent where its work
  item links none; a paused work unit in flight — and the oracle lists that set with no remote gate; until the flip
  every caller reads branch refs as today.

    - `[ ]` **3.1.a The set from the store**

        - A sibling module beside `lib/git/in-flight-derivation.ts` lists the open Errands through the store, and work
          units at placement active through the store's lifecycle view (`listLifecycleIndex`,
          `lib/store/lifecycle-index.ts`), which validates each meta, its Pause section among it. It builds each entry
          from the store: its lifecycle facts from the view's entry or the Errand's record; its `branch` from the work
          item's branch link, which the view's entry carries, absent where it links none; its `worktreePath` from 2.4's
          lookup for a work unit, and for an Errand from the derived roster's row whose marker names its claim;
          `remoteOnly` where no checkout here holds it and its linked branch has no local ref, `false` for an entry with
          no branch; and the tips the committed probe reads from the linked branches' local and remote-tracking refs. A
          branch whose work item is not at placement active yields no entry, and residue lists the refs under today's
          prefixes that no listed work item links, read with no network call.
        - The view takes two optional additions: its input (`LifecycleIndexInput`) takes the listing's filter
          (`locations`), which it passes to the store's `list`, so the set lists `active` alone and the view checks no
          archived meta; and its entry (`LifecycleEntry`) carries the listed record's `links`, so no entry takes a read
          of its own. Its other callers pass no filter and read no links, so they read as today.
        - A work-unit listing that is not complete, or whose outcome reports `missed` — a meta the store or the view
          rejected, a malformed Pause section among them (`inspectMetaPauseStructure`, `MetaPauseSchema`) — marks the
          set degraded, as the claims read does, each diagnostic a warning carrying its condition and remedy, so a work
          unit whose meta is rejected never reads as out of flight (spec § 2.1); today such a meta lists as a degraded
          entry (`degradedMetaCandidate`).
        - It also lists this identity's grooming and housekeeping claims that name a branch, through the store's claim
          kinds (`claims/groom`, `claims/housekeep`), each as today's derivation lists one (`classifyInput`, by the
          claim's slug), its `worktreePath` from the derived roster's row whose marker names the claim. Residue leaves
          out a branch a claim names, and keeps today's report of an open Errand or a claim whose branch no ref holds
          (`errand-record-without-branch`); a claims read that is not complete marks the set degraded, as an incomplete
          transient read does today (`markInputDegraded`).
        - Its entries are filtered by owner as `deriveInFlight`'s are, Errands included now that they list at project
          scope, an Errand's owner read from its record: the Errand record (`lib/errand/identity-record.ts`) gains an
          optional `owner`, the person's identity slug as `resolveIdentity` resolves it (`lib/git/identity.ts`), which
          the open writes from the flip (Task 3.3.c) and the reference backend's import writes from the identity ref it
          re-homes each Errand from (spec § 16); the in-repo arm, whose identity-scoped ref implies the owner, writes
          none. From the flip a record without one is malformed (Task 3.2), and the set keeps it, as `keepForIdentity`
          keeps an entry with no owner.
        - Its entry type is the in-repo arm's with `branch` optional and `scheduling` admitting `paused`, so status's
          direct calls of `deriveInFlight` (`lib/status/project-view.ts`, `lib/status/user-view.ts`), whose arms from
          the flip are the status change's (spec § 16), keep today's type.
        - A paused work unit, read from its meta's Pause section (`fields.pause`, `MetaPauseSchema`,
          `lib/active/meta-schema.ts`), which lifecycle's pause writes, takes `scheduling: "paused"` and is in flight
          for every consumer; `parked`, from `listParkedSlugs` (`lib/work-unit/lifecycle-resolver.ts`), stays the
          in-repo arm's, whose consumers treat it as out of flight.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - the set lists the active work units and open Errands, each with its facts from the store
            - a branchless planning work unit lists with no branch, and a linked one with its branch and tips
            - a paused work unit lists with `paused`
            - a remote `plan/` ref outliving a shipped work unit lists nothing in flight
            - in team mode another identity's work unit and Errand are filtered out as today, the Errand by its record's
              `owner`
            - an Errand's entry carries the checkout here whose marker names its claim
            - an entry's branch comes from a link the transition-write-path change's writer wrote
            - a live grooming claim's branch lists in flight by the claim's slug, and not as residue
            - an open Errand whose linked branch no ref holds reports as residue
            - a claims read that is not complete marks the set degraded
            - with no project-ID port injected, each entry's `branch` is its link's, the project ID read from the
              project's identity record
            - a work unit whose meta the view rejects, a malformed Pause section among them, marks the set degraded with
              a warning naming the meta and its repair, and a completed work unit whose Pause section is malformed marks
              nothing

    - `[ ]` **3.1.b The set's callers**

        - Session-init's oracle (`getOracle`, `handlers/status.ts`), whose snapshot analysis (`analyzeInFlightSnapshot`)
          serves `errandState` and `materializableWorkUnits`, reads 3.1.a's set from the flip whether or not a remote is
          configured or reachable, where today it reports no entries when the session needs no remote or cannot reach
          it.
        - `arc active in-flight` (`runActiveInFlight`; `handleActiveInFlight`, `handlers/active.ts`) and the in-flight
          expansion (`runActiveInFlightExpansion`, `expandActiveInFlight`, `commands/active/in-flight.ts`) read it from
          the flip and keep today's result shape until then. Lifecycle's callers of the expansion (`commands/rename.ts`,
          `handlers/start.ts`, `handlers/lifecycle.ts`) call it only in their in-repo arms, so none meets a branchless
          entry.
        - Both callers' Errand indexes (`readTransientInFlightIndexes`, `readFetchedTransientInFlightIndexes`,
          `lib/errand/record.ts`) serve only their in-repo arms, as does the orphan-branch sweep's, whose exclusion of
          Errand branches reads the store from the flip (Task 5.2.b).

        - Build `test-first` (one behavior at a time):
            - over the reference backend the oracle lists the set with no remote configured
            - over the reference backend `arc active in-flight --json` lists a branchless entry and a paused one
            - over the in-repo implementation each caller's result is today's

    - `[ ]` **3.1.c `arc status <slug>`'s locus reads**

        - From the flip the slug query runs the transition-write-path change's store arm (`handleStoreLifecycleStatus`,
          `handlers/status/lifecycle.ts`), which reads its state, record, purpose, and owner through the store. This
          task adds to that arm the work unit's `worktreePath` from 2.4's lookup, reporting a rejected lookup's
          condition in place of the path, never no checkout, and 3.1.a's in-flight warnings (`renderInFlightWarning`)
          beside its listing and design warnings. The arm keeps `integrationBoundary: null`, the delivery change's to
          read through the store, and the in-repo arm's composed-index reads (`resolveCallerComposedLifecycleIndex`)
          stay as today. Its `--fetch` reachability is Task 3.3.a's.

        - _Note:_ The store arm is the transition-write-path change's, landed; the delivery change also edits it, to
          read the boundary through the store, and the two serialize on the file.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - the worktree path is the holding checkout's, an anchored one included
            - the warnings come from the set listed through the store
            - the arm's state, record, purpose, and owner are unchanged by the additions

### `[ ]` **3.2 Acquire Errands and claims apart — § 3.2**

- _Goal:_ From the flip the derived frame's identity discovery carries Errands, listed through the store at project
  scope, and claims, identity-scoped, as two acquisitions, each pinned at its own version with the same three outcomes —
  absent, a root-level error, or a complete snapshot with its own diagnostics — and the readers that admit an Errand's
  terminal or merge require both complete; until the flip one transient-identity snapshot serves both.

    - _Amended in:_ 3.R2 (A20)

    - `DerivedIdentityDiscovery` (`lib/locus/derived-reader.ts`) carries the two acquisitions, each with its own status.
      The derived evidence (`lib/locus/derived-evidence.ts`) acquires them from the flip — Errands through the store's
      listing at placement `active`, since a closed Errand's record stays at `completed` (Task 3.3.b) and discovery keys
      each by its slug (`readTransientIdentitySnapshot`'s projections, `lib/errand/identity-snapshot.ts`), claims
      through the `claims/groom` and `claims/housekeep` kinds — and keeps its direct read of
      `readTransientIdentitySnapshot` (`lib/errand/identity-snapshot.ts`) until then, since the store's transient
      listing reads a fresh snapshot on every call and two listings would be two pins.
    - `authorizeErrandTerminal` (`lib/errand/terminal-authority.ts`) and `selectCurrentErrandMergeIdentity`
      (`scripts/integration/errand-merge-composition.ts`) read the two acquisitions and still require both complete: the
      claims, this identity's own, with no diagnostic, as today, and the Errands, which list everyone's, whose
      diagnostics refuse nothing by themselves (spec § 3.2): from the flip the gate resolves the subject Errand's record
      by `lookup` through its checkout claim (`{ kind: "errand", slug, claimId }`, `lib/store/lookup.ts`) and reads it,
      refusing, naming the record and what was reported, where either refuses with anything but `not-found`; where the
      lookup finds none while the Errands' listing carries a diagnostic, it refuses naming those diagnostics and their
      remedies; and a lookup finding none beside no diagnostic refuses nothing here, as today. The in-repo arm admits no
      diagnostic, as today. A listing of Errands alone never stands in for the claims.
    - From the flip the Errands' acquisition reports a record with no `owner` among its diagnostics as malformed, since
      the open and the import write one on every Errand (spec § 3.2).
    - The one-snapshot index projection (`lib/errand/record.ts`) stays the in-repo arm for status
      (`handlers/status/views.ts`, `lib/status/project-oracle-context.ts`), the composed lifecycle index
      (`lib/work-unit/composed-lifecycle-index.ts`), which the in-repo store itself calls, and the review gate
      (`scripts/review-gate/`), whose arms from the flip are their owners' (spec § 16).

    - Build `test-first` (one behavior at a time):
        - over the reference backend Errands and claims each report absent, an error, or complete independently, with
          their own diagnostics
        - a complete Errand listing with a failed claims read admits no terminal and selects no merge identity
        - over the reference backend an Errand record with no `owner` reports among the Errands' diagnostics
        - over the reference backend a slug held by a completed Errand and an open one lists the open one alone, and
          terminal authority reads its claim
        - over the reference backend, its records carrying UIDs, another person's malformed Errand record leaves a close
          admitted, the subject's own malformed record refuses, naming it, a subject the lookup cannot find beside a
          listing diagnostic refuses, naming that diagnostic and its remedy, and one it cannot find beside none proceeds
          as today
        - over the in-repo implementation the discovery takes both from one pinned snapshot, as today

### `[ ]` **3.R2 Admit authoritative claim absence at Errand terminal and merge gates — § 3.2 (A20)**

- _Goal:_ An authoritative absent claims acquisition admits as an empty inventory beside a complete Errands acquisition
  and the exact subject lookup; failed claims reads and complete claims with diagnostics still refuse (A20).

    - Bind the independent acquisitions into the derived frame and make both admission gates use the effective rule.
      Keep each acquisition's absent, error, and complete state visible; never borrow Errands' completeness for claims.
    - Build `test-first` (one behavior at a time), over the reference backend and real-Git handler integration:
        - an ordinary Errand with no grooming or housekeeping claims closes and abandons through CLI-generated inputs
        - authoritative absent claims permit merge identity selection for the exact current Errand
        - a failed claims read or a claims diagnostic refuses terminal and merge admission, and repair then admits
        - another person's malformed Errand does not block the subject, while an unresolvable subject beside an Errands
          diagnostic refuses with its remedy

### `[ ]` **3.3 Reroute the Errand runtimes through the store — § 8**

- _Goal:_ From the flip the open, close, abandon, leave, and link runtimes and `arc errand materialize`'s read of the
  Errand it materializes read and write the Errand record and claims through the store — pulling first when online,
  computing each transition with today's transforms over the record read, writing at that version with the transition's
  companion writes in one batch, and keeping a closed or abandoned record at `completed` — while until the flip each
  keeps calling the identity transaction itself.

    - `[ ]` **3.3.a The sync port**

        - A narrow injected port, in a module under `lib/store/`, carries `pull`, `pull` of named history refs,
          `maintain()`, and a read of the history refs a store refusal names for such a pull (the ref backend's
          `state-unresolvable` refusal, its `historyRefs`), each defaulting to no effect — no pull, no measurements, and
          no refs named. Whichever of this change and the ref backend lands second binds it to the store's operations
          and that refusal. The Errand runtimes and Tasks 5.7, 5.8, 7.1, and 7.2 call through it. Its result types live
          in its own module, shaped as the ref backend plans them for `lib/store/sync.ts` (`PullResult`'s states,
          `MaintainResult`, and the publish outcomes' `retryCount` and `waitedMs`, planned in Task 1.2 -
          `tasks-storage-ref-backend.md`), and the binding, by whichever change lands second, takes the store's types in
          their place.
        - From the flip `arc status <slug> --fetch` takes the remote's reachability from the port's pull in the store
          arm (`handleStoreLifecycleStatus`, Task 3.1.c), which ignores `--fetch` today, reporting an unreachable remote
          with the warning the in-repo arm gives.
        - If the ref backend's amendment already puts `pull` and `maintain()` on `Store` (`lib/store/contract.ts`) when
          this task starts, call them directly, read the refusal's `historyRefs` itself, and build no port.

        - Build `test-first` (one behavior at a time):
            - the default port pulls nothing, reports no measurements, and names no history refs for any refusal
            - a bound port reaches the store's operation and returns its result, and names the history refs a
              `state-unresolvable` refusal carries
            - over the reference backend `arc status <slug> --fetch` reports the reachability the port's pull returns

    - `[ ]` **3.3.b The write step from the flip**

        - A shared step reads the Errand record with its version, pulling first through 3.3.a's port when online, as the
          transaction fetches first today; computes the transition with today's transform (`ordinaryErrandTransform` and
          its retirement rules, `lib/errand/identity-transitions.ts`) as the runtime's own computation, admitting and
          refusing what it does today, with no write check; and writes the computed record at the version it read, in
          one `batch` with the transition's companion writes, each at its expected version.
        - Each runtime's options — `OpenOrdinaryErrandRuntimeOptions`, `LinkOrdinaryErrandRuntimeOptions`,
          `CloseOrdinaryErrandRuntimeOptions`, `AbandonOrdinaryErrandRuntimeOptions`, and
          `LeaveOrdinaryErrandRuntimeOptions` — gain an optional `store`, which its handler fills (Phase 3's design
          decisions) and which the step reads and writes through.
        - The record's content is the Errand record's JSON as the identity ref holds it today: the step decodes it with
          `deserializeTransientIdentityRecord` and encodes it with `serializeTransientIdentityRecord`
          (`lib/errand/identity-record.ts`), the encoding promotion's steps parse (`TransientIdentityRecordV3Schema`,
          `lib/errand/promote-store.ts`), since the store's Errand kind sets none.
        - On a stale-version refusal it reads the record once more: where it now equals the computed record, it reports
          `idempotent`, as the transform does before it compares the request's `previous` (`transitionOrdinaryErrand`);
          otherwise it reports today's mismatch refusal. It recomputes nothing, and any other refusal, a divergent
          clone's among them, is reported as the store reports it.
        - The step reads the Errand through `lookup`'s `claim` kind, its slug and `claimId`, so a slug that a closed
          Errand held, reusable once its record completes, never reads that record; the open, which holds no claim until
          it opens, reads an Errand to resume through `lookup`'s `slug` kind (Task 3.3.c).
        - A retirement — the close and the abandon — writes the record as the request's `previous` holds it, its
          `updatedAt` stamped as the retirement's time, at placement `completed`, rather than deleting it as the
          `retire` arm does today; a closed Errand carries its landing-commit link and its close time (Task 3.4), and an
          abandoned one no link. A rerun retirement that reads the record already at `completed` reports `idempotent`,
          as the transform reports a retirement whose record is already absent (`transitionOrdinaryErrand`).
        - Every reader of open Errands — the open's check for an Errand to resume (Task 3.3.c), `arc errand materialize`
          (Task 3.3.e), the in-flight set (Task 3.1.a), `errandState` (Task 5.3.a), and identity discovery (Task 3.2) —
          takes placement `active` only, so a completed record never reads as an open Errand.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - a write at the version read lands, with its companion writes in the same batch
            - a stale version whose re-read equals the computed record reports `idempotent`
            - a stale version whose re-read differs reports today's mismatch refusal and writes nothing
            - a transform refusal writes nothing
            - the step pulls through the port before it reads
            - a rerun retirement after its write landed reports `idempotent`
            - an abandon's record at `completed` carries the abandon's time as its `updatedAt`
            - an open on a slug whose Errand completed opens a fresh Errand

    - `[ ]` **3.3.c Open and link**

        - `lib/errand/open-runtime.ts` and `lib/errand/link-runtime.ts`, with the claim rollback's call of the identity
          transaction (`lib/errand/identity-claims.ts`), take 3.3.b's step from the flip, each keeping its transaction
          call as its in-repo arm. From the flip the open writes the record's `owner` (Task 3.1.a), the identity it runs
          as.
        - From the flip the open's check for an Errand to resume (`openOrdinaryErrand`, `validateResumeContinuity`,
          `lib/errand/open.ts`) reads the slug through `lookup`'s `slug` kind and takes an Errand only at placement
          `active`, where today it reads the identity's own ref. It refuses an Errand another identity owns, naming its
          owner and another slug for a new Errand, since no one but its owner takes over an Errand (spec Non-Goals), and
          refuses one with no `owner` as malformed, naming the record (spec § 3.2).

        - Build `test-first` (one behavior at a time):
            - over the reference backend each runtime's success path and refusals hold
            - over the reference backend the open writes the record's `owner`
            - over the reference backend the open of another identity's paused Errand refuses, naming its owner, and an
              open under another slug then opens a new Errand
            - over the reference backend the open of an Errand with no `owner` refuses as malformed
            - over the in-repo implementation each still reads and writes through the identity transaction
            - through the open's and the link's production handlers with nothing injected, over the in-repo
              implementation, each runtime is given the store opened over the checkout and keeps its transaction call

    - `[ ]` **3.3.d Close, abandon, and leave**

        - `lib/errand/close-runtime.ts`, `lib/errand/abandon-runtime.ts`, and `lib/errand/leave-runtime.ts` take 3.3.b's
          step from the flip, each keeping its transaction call as its in-repo arm. The abandon runtime keeps the
          zero-delta reap's exports (`reapZeroDeltaBranch`, `WorkItemZeroDeltaBranch`), which store teardown's work-item
          arm imports (`lib/work-unit/verbs/teardown-store.ts`).

        - Build `test-first` (one behavior at a time):
            - over the reference backend each runtime's success path and refusals hold, and a close and an abandon leave
              the record at `completed`
            - over the in-repo implementation a close where only the remote holds the newer record reconciles before it
              reads, as today
            - through the close's, the abandon's, and the leave's production handlers with nothing injected, over the
              in-repo implementation, each runtime is given the store opened over the checkout and keeps its transaction
              call

    - `[ ]` **3.3.e `arc errand materialize`'s read**

        - `handleErrandMaterialize` (`handlers/errand.ts`) reads the Errand it materializes through the store it opens
          (Phase 3's design decisions) from the flip, pulling first, in a sibling module; until then it reads through
          the identity transaction.
        - From the flip it reads only an Errand at placement `active`, so a closed one reads as no open Errand, and
          refuses one whose record's `owner` is another identity, naming that owner, since no one but its owner takes
          over an Errand (spec Non-Goals), and one with no `owner` as malformed, naming the record (spec § 3.2).

        - Build `test-first` (one behavior at a time):
            - over the reference backend it materializes the Errand the store reads
            - over the reference backend a closed Errand reads as none, and another identity's refuses, naming its owner
            - over the reference backend an Errand with no `owner` refuses as malformed
            - over the in-repo implementation an Errand only the remote holds materializes, as today

### `[ ]` **3.4 Capture the Errand close's landing commit and close time — § 8.1**

- _Goal:_ From the flip the close captures the Errand's landing commit on its record, naming its repository by the
  project ID, and stamps the record's `updatedAt` as the close time; until the flip it captures nothing and deletes the
  record as today.

    - The landing commit is the commit the Errand's merge made on base, never its head (`closeTargetHead`), which a
      squash merge leaves off base. Both kinds of merge go through the host — ARC's own
      (`scripts/integration/errand-merge.ts`) through `mergePinned`, whose result carries that commit only as
      `providerMergeId`, kept nowhere the close reads — so the close reads it from the host: from the flip its lifecycle
      evidence (`ChangeRequestLifecycleEvidence`, `lib/errand/change-request-lifecycle.ts`) gains the merge commit,
      which `createGhChangeRequestLifecyclePort`'s query requests beside the fields it reads today, as the delivery host
      reports one (`mergeCommitSha`, `lib/delivery/host.ts`).
    - It is the record's `landingCommit` link (`lib/store/links.ts`), its copy key from `computeCopyKeys`
      (`lib/git/copy-key.ts`) over local objects, omitted where the commit is not held locally or is a merge commit,
      which takes none. The project ID comes from an optional port `CloseOrdinaryErrandRuntimeOptions` gains, which
      given none reads the project's identity record over the store the close reads the Errand through (3.3.b, Phase 2's
      design decisions); tests inject it. Given no project ID — the port absent, or its read failing — the close refuses
      before its write, naming the port's failure (spec § 2.1).
    - A close under unchanged-base authorization, which merges nothing (`retirementDesired`,
      `lib/errand/identity-transitions.ts`), records no landing commit; its write still stamps the close time.

    - Build `test-first` (one behavior at a time), over the reference backend:
        - a close after a squash merge through the host records the merge commit, not the Errand's head
        - a close after ARC's own merge records that merge's commit
        - the link names the project ID, and the record's `updatedAt` is the close time
        - a close under unchanged-base authorization records no landing commit and stamps the close time
        - with no project ID the close refuses before writing, naming the port's failure, and completes once the port
          gives one
        - with no project-ID port injected, the link names the project ID the project's identity record holds
        - a landing commit held locally carries its copy key, and one not held locally is captured without one, the
          close never fetching

### `[ ]` **3.5 Link the Errand's branch at open — § 8.2**

- _Goal:_ From the flip a full-protection `arc errand open`, cutting `chore/<slug>` in place or in a spawned worktree,
  writes the Errand's branch link recorded `created` with no exclusions, and under partial protection cuts no branch and
  writes no link; until the flip no link is stored.

    - The in-place cut (`lib/locus/provisioning-runtime.ts`) and the spawned one both reach
      `lib/errand/open-runtime.ts`, which writes the link with the record in 3.3.b's batch, its repository the project
      ID, from an optional port `OpenOrdinaryErrandRuntimeOptions` gains, read as the close's is (Task 3.4), and its ref
      `chore/<slug>` (Phase 2's design decisions). The link's `created` record and its exclusions are built in
      Task 2.1.a - `tasks-seam-lifecycle.md`.

    - Build `test-first` (one behavior at a time), over the reference backend:
        - an in-place and a spawned open each record a `created` link with no exclusions, its repository the project ID
          the port gives and its ref `chore/<slug>`
        - a partial-protection open writes no link
        - with no project-ID port injected, the link's repository is the project ID the project's identity record holds

### `[ ]` **3.6 Check overlap for a state target, excluding the caller by identity — § 3.3**

- _Goal:_ From the flip `arc errand check` classifies its targets through one inverse of the layout resolver — a code
  target keeping both probes, a state target reporting overlap when its record's own work item is in flight in another
  locus, an entry-list target reporting none — counts a paused work unit through both probes, excludes its caller by its
  own identity from the marker, and keeps Errands as candidates; it stays advisory, and the pre-commit foreign-write
  hook returns before any read.

    - `[ ]` **3.6.a The target classifier**

        - The classifier takes two steps, split by the layout's dependency rule (`layout-dependencies`,
          `eslint/architecture-imports.ts`), which bars `lib/layout/` from importing the store: in `lib/layout/`, beside
          today's identification (`identifyWorkUnitArtifactPath`, `isProjectDocumentPath`,
          `lib/layout/identification.ts`), a path inverts to the file address `resolveArcPath` resolves to it, or to
          none; in `lib/store/`, beside the kinds' mechanisms (`KIND_MECHANISMS`, `lib/store/registry.ts`), an address
          maps to its kind and key, or to none, exhaustively over the address union (`ArcLayoutAddressSchema`), so an
          address the projection adds takes its kind there. The entry-list kinds are `personal/inbox`,
          `project-inbox/inbox`, `work-item/inbound`, `work-item/description`, `personal/errand-queue`, and
          `personal/working-memory`.
        - A directory inverts to none: `projectContainer` (`lib/layout/projection.ts`) resolves every project-scope
          active work unit's container to `.arc/active`, the active placement root's path too, so no directory's path
          names one address. The classifier inverts the file addresses — the internal records, the editor document, the
          inboxes, a work unit's artifacts, the cohort document, the project document, and the user documents.
        - The projection registers its locations and file names as addresses, adding them to the address union
          (`ArcLayoutAddressSchema`), the inbound list's and the Errand description's among them (spec § 16); until it
          does, those kinds have no address, and the classifier places no path at them.

        - Build `test-first` (one behavior at a time):
            - a work unit's meta path classifies to its kind and key, and a path under no registered address to none
            - the personal inbox's path classifies to its entry-list kind
            - every file address kind `resolveArcPath` resolves inverts back to its address, a round trip over those
              kinds
            - `.arc/active` and a work unit's container path classify to none

    - `[ ]` **3.6.b The check from the flip**

        - `handleErrandCheck` (`handlers/errand.ts`) takes 3.6.a's classification in a sibling module from the flip: a
          path it places nowhere is a code target and keeps both probes, with `preferRemoteBaseRef` and the
          `indeterminate` brackets (`detectForeignArtifactOverlap`, `lib/git/foreign-artifact-detection.ts`); a state
          target resolves to its record and reports overlap when that record's own work item is in flight in another
          locus, from 3.1.a's set; an entry-list target reports none.
        - An entry with no branch link takes no committed probe; its uncommitted probe still covers a checkout here. A
          paused work unit counts through both probes; today's skip of parked work units retires with park.
        - From the flip an overlap and a skipped entry (`ForeignArtifactOverlap`, `ForeignArtifactSkippedEntry`,
          `lib/git/foreign-artifact-detection.ts`) name their work item, and their `branch`, required today, is
          optional; the advisory (`handlers/errand.ts`) prints the work item's name where an entry has no branch.
        - The check excludes the locus running it, Errand or work unit, by its own identity from the marker, where today
          it excludes by name, by originating checkout, or by `resolveOriginatingMetaPath`, and an Errand only by its
          checkout. Errands stay candidates.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - a state target whose work item is in flight in another locus reports overlap
            - a personal inbox, project inbox, or `WORKING-MEMORY` target reports none
            - a branchless entry's checkout here is probed for uncommitted edits only, and its overlap is reported by its
              work item's name
            - a paused work unit's committed and uncommitted edits each report
            - the caller is excluded by its marker's identity, an Errand and a work unit alike
            - a code target reports as today

    - `[ ]` **3.6.c The pre-commit foreign-write hook**

        - `scripts/check-foreign-writes.ts` branches on the capability and from the flip returns before any read, since
          a commit then stages no work unit's state; until then it runs as today, its reads — `runActiveInFlight`,
          `listParkedSlugs`, `projectInFlightToOverlapRoster`, `detectForeignArtifactOverlap`, and
          `resolveOriginatingMetaPath` — unchanged.

        - Build `test-first` (one behavior at a time):
            - over the reference backend the hook passes a commit staging a path named like a work unit's artifact, with
              no read
            - over the in-repo implementation it reports overlap as today

### `[ ]` **3.7 Read shipped work through placement and `lookup` — § 3.4, § 2.1**

- _Goal:_ From the flip the stale-worktree and orphan-branch sweeps, the derived locus evidence, and the Candidate
  mutation owner's completed set read shipped work through placement and `lookup`, none keying on an archive folder's
  number, while retired-subdirectory detection reads none; the stale-worktree sweep selects each marked row by its work
  unit's placement, a branchless one included, and the residue sweep takes an abandonment from its lineage record;
  until the flip each keeps today's read.

    - `[ ]` **3.7.a The archive-index readers**

        - From the flip each reads placement `completed` and `lookup` where today it reads the archive at a base ref,
          which stays its in-repo arm with its object and shallow-history guards: the stale-worktree sweep and the
          orphan-branch sweep, each on both its paths (`lib/session-init/stale-worktree-sweep.ts`,
          `lib/session-init/orphan-branch-sweep.ts`) — `readShippedWorkUnitsFromExactRef` on the path session-init's
          base evidence selects, the stale sweep's past its gates and the orphan sweep's in
          `analyzeOrphanBranchesSnapshot`, and `readShippedWorkUnitsFromRef` on the other, the stale sweep's with no
          base evidence and `runOrphanBranchSweep` — and the derived evidence (`readCompletedEvidenceFromRef`,
          `lib/locus/derived-evidence.ts`), whose read the derived lifecycle evidence and the roster consume.
        - Retired-subdirectory detection (`lib/session-init/retired-subdir-detection.ts`, which hands its shipped set to
          `planRetiredSubdirReconcile`, `lib/user-sync/retired-subdir.ts`) keeps its archive read as its in-repo arm
          alone, since from the flip its slot resolves `skip` before any read (Task 5.2.c).
        - The Candidate mutation owner's completed set (`resolveCompletedCandidateWorkUnits`,
          `handlers/candidate-mutation-owner.ts`), which takes the working tree's lifecycle index
          (`buildLifecycleIndex`) at location `completed` today, reads placement `completed` through the store from the
          flip.

        - Build `test-first` (one behavior at a time):
            - over the reference backend each reader finds a shipped work unit through placement, and a renumbered
              archive folder changes no answer
            - over the in-repo implementation each reads the archive at its base ref, its guards included, as today

    - `[ ]` **3.7.b The stale-worktree sweep's selection from the flip**

        - The sweep selects a marked row by its work unit's placement, branch or none, so a branchless checkout whose
          work unit has ended is still reported, and tests a row with no branch for landing at its checkout's `HEAD`
          with `isLandedInBaseStrict` (`lib/git/branch-containment.ts`): a planning checkout left on base reads landed,
          one holding commits made on its detached `HEAD` unmerged.
        - Such a row reports as a `detached` report naming its work unit, where a `branched` report
          (`StaleWorktreeReport`) names its branch; the sweep's registered schema (Task 1.1.b) gains the arm.
        - Its `missingFolders` reads a branched registration's work unit as ended through placement and `lookup`, where
          Task 1.7.b reads it as shipped by its branch: `lookup` with `LookupInputSchema`'s `ref` kind
          (`lib/store/lookup.ts`), its repository the project ID and its ref the branch's short name, the project ID
          from an optional port `RunStaleWorktreeSweepOptions` gains, bound as Phase 2's design decisions bind every
          link reader's. It takes the link naming that branch from the work item's links: one recording the branch
          `created` (`linkedAs`) gives the registration `arc teardown <name>`, and one recording it `adopted` the
          removal by path as text, with the unlock first where it is locked, since teardown keeps an adopted branch with
          its registration, clearing a missing folder's registration only for a branch it created (`reportAdopted`,
          `prepareCreatedBranch`, `lib/work-unit/verbs/teardown-store.ts`).
        - Given no project ID — the port absent, or its read failing — it reports no branched registration whose folder
          is missing, and where a registration's `lookup` or placement read refuses with any code but `not-found` it
          reports that one nothing; each waits for the next session start's reading rather than taking the removal by
          path, the `warnings` naming the port's failure or the refusal (spec § 2.1). A `not-found` lookup is a branch
          no work unit links, which takes the removal by path (spec § 12.2); a detached one, which reads no link,
          reports as Task 1.7.b gives it.
        - It leaves out a branched row whose work unit an abandonment's lineage record retires, which the residue sweep
          reports (3.7.c), so each checkout reports in one sweep, as today.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - a branchless checkout whose work unit has ended reports as `detached`, landed where it sits on base
            - a detached checkout holding unlanded commits reports unmerged
            - a folderless registration whose work unit has ended takes its teardown through placement
            - a folderless registration whose ended work unit adopted its branch takes `git worktree remove <path>` as
              text, with `git worktree unlock <path>` first where it is locked, and no teardown
            - with no project-ID port injected, the lookup's repository is the project ID the project's identity record
              holds
            - with no project ID a branched folderless registration reports nothing and the warnings name the port's
              failure, while a detached one still reports its removal by path
            - a refused lookup other than `not-found` leaves its registration unreported, the warnings naming the
              refusal
            - a branched checkout whose work unit was abandoned is not reported here

    - `[ ]` **3.7.c The residue sweep's abandonment from the flip**

        - From the flip the residue sweep (`runLandedRetirementSweep`, `lib/session-init/lifecycle-residue-sweep.ts`)
          takes an abandonment's evidence from its lineage record through the transition-write-path change's store
          retirement read (`readStoreRetirementEvidence`, `lib/work-unit/store-retirement-evidence.ts`, built in
          Tasks 6.5.a and 6.5.R.b - `tasks-seam-lifecycle.md`), admitting its `lineage` evidence
          (`RetirementEvidenceRef`) under the `discard` rule, since the teardown authority it builds today
          (`createTeardownRetirementAuthority`) reads Git alone and admits no lineage; today it admits only a Git-proven
          abandon (`git-transition`), which stays the in-repo arm.
        - Since that read throws for every outcome alike, the sweep reads it only for a work unit with no live record
          (`readWorkUnit` finding none) whose lineage, by `lookup` from its origin, is an abandonment; a live record, no
          lineage, or a lineage of another kind reports no retirement, as today's `evidence-missing` and
          `unsupported-transition` do, and a lookup or read refusing with anything but `not-found`, or the retirement
          read throwing over the lineage it read — one whose owner does not match its origin, or with no
          `retiredBranches` — reports its message as the checkout's repair rather than failing the sweep. The sweep's
          registered schema (Task 1.1.b) gains that repair as text, where today a blocked residue carries only its
          reason.
        - Its candidates stay branched, as today; a branchless checkout whose work unit has ended is the stale-worktree
          sweep's (3.7.b). Store abandon writes the lineage record in its terminal batch (`runStoreAbandon`,
          `lib/work-unit/verbs/abandon-store.ts`), so the tests abandon through it, seeding a record only where it lacks
          `retiredBranches`.

        - Build `test-first` (one behavior at a time):
            - over the reference backend a work unit abandoned on another clone, its lineage record pulled, reports its
              checkout's teardown here
            - over the reference backend a work unit with no abandonment reports no retirement
            - over the reference backend an in-flight work unit's checkout reports no retirement and no repair
            - over the reference backend a lineage record with no `retiredBranches` reports the read's repair, and the
              sweep reports its other checkouts
            - over the in-repo implementation the sweep admits a Git-proven abandon alone, as today

### `[ ]` **3.R Expose former names in primary record projections — § 3.5 (A16)**

- _Goal:_ A16's read-only aliases are available to the prose scan through primary reads and listings, with absent
  off-branch alias evidence reported as unavailable authority rather than an empty collection.

    - Extend `StoreRecordSchema` with optional slug-array `aliases`, limited to primary work-item records. Preserve
      the in-repo implementation's current projections and writes.
    - Project the reference backend's private `formerSlugs` in `publicRecord`, including explicit empty arrays and
      the aliases of a selected saved state, copying the collection so readers cannot mutate backend state.
    - Wire the user-reference prose scan to the collection and retain lookup as the resolver of each discovered name.
    - Build `test-first`: rename and list/read aliases, read an earlier saved state, preserve storage after editing a
      returned collection, rewrite a managed reference, advise on a former name in prose, and refuse missing evidence.

### `[ ]` **3.8 Resolve former slugs through `lookup` in the user-reference reconcile — § 3.5**

- _Goal:_ From the flip the user-reference reconcile resolves a former slug from the live primary record through
  `lookup`, takes its prose scan's former slugs from the work items' aliases and lineage, lists lineage only for a cut
  or an abandonment, and gives a cut's advisory its successors, keeping its unavailable authority and per-entry conflict
  advisories; until the flip it reads today's transition records and the dispositions projected from them.

- _Note:_ The current-work-unit reconcile reaches former slugs through the transition-write-path change's store-backed
  prepare context (`createStoreReconcilePrepareContext`, built in Task 4.3.b - `tasks-seam-lifecycle.md`), which
  resolves them through `lookup` and lists lineage only; the session probe binds it in Task 5.1 and writes no binding of
  its own.

    - `lib/user-reference-reconcile.ts`'s arm from the flip takes the rename evidence it is handed as a
      `TransitionRecordEnumerationResult` today from `lookup` and lineage instead, through `resolveReferenceTransition`
      (`lib/work-unit/reference-reconcile.ts`) as today.
    - Its prose scan, which takes its subjects from today's transition list, takes its former slugs from the work items'
      aliases, listed through the store, plus lineage for cuts and abandonments, since a rename from the flip writes no
      lineage and `lookup` resolves one slug at a time.
    - The reconcile's `decompose` outcome (`lib/work-unit/reference-reconcile.ts`) gains an optional `successors`, read
      from the cut's lineage record and present from the flip only, and `userReferenceReconcile`'s registered schema
      admits it.

    - Build `test-first` (one behavior at a time), over the reference backend:
        - a reference to a renamed work unit's former slug, in a link and in prose, rewrites to its current slug
        - a cut's advisory carries its successors from the lineage record
        - an unreadable lineage or `lookup` reports unavailable authority
        - over the in-repo implementation the outcome carries no `successors`

### `[ ]` **3.9 Select promotion's steps, and settle its marker — § 8.3, § 2.6**

- _Goal:_ From the flip `promoteOrdinaryErrandAtRuntime` selects the transition-write-path change's promotion steps on
  the capability, which read the Errand through the store, runs the exclusivity check before `promoteOrdinaryErrand` so
  a refusal leaves nothing written, settles the checkout — converting a spawned checkout's transient marker as today,
  and on the primary replacing the transient marker's generation with an anchored work-unit marker in one write — and
  skips its inbox settlement step; until the flip it keeps today's steps, settlement, and commit.

- _Note:_ `lib/errand/promote-runtime.ts` serializes with that change, whose steps land in their own module beside
  `lib/errand/promote.ts` (Task 5.5 - `tasks-seam-lifecycle.md`).

    - `[ ]` **3.9.a The step selection and the check**

        - From the flip the runtime fills `promoteOrdinaryErrand`'s `replaceFrame`, `readIdentity`, `recoverPromoted`,
          and `retire` slots (`PromoteOrdinaryErrandDependencies`, `lib/errand/promote.ts`) with the
          transition-write-path change's steps, which read the Errand and a promoted work unit through the store and
          whose `retire` returns `idempotent`, and keeps `settleInbox` and `settleOccupancy` its own (3.9.b); until then
          it fills every slot with today's.
        - It runs 2.4's exclusivity check for the new work unit at the checkout it runs in (the frame's `entering` row)
          before `promoteOrdinaryErrand`, whose dependencies carry no slot for it.
        - It builds the steps with `createStorePromotionSteps` (`lib/errand/promote-store.ts`) from its own options —
          `store`, `exec`, `slug`, `name`, `type`, `floor`, `owner`, `priority`, `class` — its `checkout` the callback
          below and its `repository` the project ID from an optional port `PromoteOrdinaryErrandRuntimeOptions` gains
          beside `store` (Phase 2's design decision); given no project ID it refuses before `promoteOrdinaryErrand`,
          naming that condition. `handleErrandPromote` fills the runtime's `store` as every Errand handler does
          (Phase 3's design decisions).
        - In `lib/errand/promote-store.ts` the steps' options (`StorePromotionOptions`) take a callback, `checkout`, in
          place of `cwd` and `frame`, which the steps call with the Errand record they hold — the one they read
          (`replaceFrame`) or the one they recover from the role write's history (`recoverPromoted`) — and with which of
          the two it is, before any Git step or write. They run their Git at the checkout it returns and carry its
          `checkoutPath`, `allocation`, and `parentCheckoutPath` on their receipt, and return its refusal, confirmation,
          or error as given. Lifecycle's tests of the steps (`__tests__/unit/errand/promote-store.test.ts`,
          `__tests__/integration/errand-promote-store.test.ts`, `__tests__/unit/work-unit/lifecycle-program.test.ts`)
          pass one.
        - For a promotion the runtime's callback runs today's terminal authorization over the Errand record it is given
          against the frame `readFrame` gives (`authorizeErrandTerminal`, operation `promote`, with
          `confirmForeignGeneration` and the retry arguments, as `replaceLocalFrame` runs it), returning its
          confirmation as today and its refusal through `authorityRefusalReason`, `checkout-missing` where it selects no
          checkout, and `promotion-source-invalid` where that checkout's branch is not the Errand's; the checkout it
          returns is the one the authority selects, as `receiptFromAuthority` derives it. It runs no clean-tree check:
          the cut and the switch land on the commit the checkout holds, so its uncommitted changes carry onto the work
          branch, and `inspectCheckout`'s check stays the in-repo arm's, before its meta commit.
        - For a rerun after the role write it returns the one checkout among the frame's rows whose `subject` is that
          Errand generation or the work unit (`name`), with no authorization, as today's recovery runs none
          (`recoverPromotedFrame`), refusing `checkout-missing` where none is, `duplicate-locus` where more than one is,
          with today's recovery's messages, and `promotion-source-invalid` where it is on neither the Errand's branch
          nor the work branch. Its branch alone no longer finds it, since a crash before the switch leaves it on the
          Errand's branch.
        - The steps' receipt (`receipt`, `lib/errand/promote-store.ts`) carries the origin's `originEntrySourceDigest`
          as the Errand record holds it, `null` included, as every projection of an origin does (spec § 7.6), where
          today it parses an inbox origin's as a digest (`CanonicalDigestSchema`), which throws after the role write,
          the branch cut, and the switch, and again in every rerun's recovery.
        - Their Errand read (`readIdentity`) takes an Errand record only at placement `active`, as every reader of open
          Errands does (spec § 8), so a closed Errand's record, kept at `completed` with its state still `open` (3.3.b),
          reads as no Errand and `promoteOrdinaryErrand` refuses it before any write; today the slug lookup can return
          that record, and the role write keeps its placement (`recordWritePlacement`). The lookup both reads share
          (`readPrimary`), and recovery's read of the promoted work unit through it (`recoverPromoted`), stay as they
          are.

        - Build `test-first` (one behavior at a time):
            - over the reference backend the runtime fills the four slots with the transition-write-path change's steps,
              and over the in-repo implementation with today's
            - over the reference backend an injected refusing check leaves nothing written
            - over the reference backend the steps take the checkout the callback returns and the project ID, and with
              no project ID the runtime refuses, writing nothing
            - over the reference backend with no project-ID port injected, the steps take the project ID the project's
              identity record holds
            - over the reference backend an Errand whose inbox origin carries the qualified ID and a `null` digest
              promotes, its receipt carrying both as the record holds them, and a rerun reports `idempotent`
            - over the reference backend promoting an Errand whose record is at `completed` refuses, writing no meta,
              cutting no branch, and leaving `HEAD` where it was
            - the steps call the callback before any Git step or write, and a refusal it returns leaves nothing written
            - over the reference backend a promotion from the Errand's own checkout runs there, and one from another
              checkout returns today's confirmation, writing nothing, and with `--confirm-foreign-generation` runs in
              the Errand's checkout
            - over the reference backend an incomplete identity basis and two checkouts claiming the Errand each refuse
              as today, and an Errand with no checkout refuses `checkout-missing` once confirmed, each writing nothing
            - over the reference backend an Errand checkout off its branch refuses, writing nothing, and one with
              uncommitted changes promotes, its changes on the work branch
            - over the reference backend a rerun after a crash following the role write — before the switch, after it,
              or after the marker's settlement — completes in that checkout, and with no such checkout refuses
              `checkout-missing`
            - over the reference backend an Errand whose record carries no branch link for its branch refuses before any
              write, as the steps do

    - `[ ]` **3.9.b The settlement**

        - From the flip `settlePromotedOccupancy`'s primary arm replaces the transient marker's generation with an
          anchored work-unit marker through 2.5.a's writer, at the bytes it read, where today it removes the transient
          marker (`removePrimaryTransientOccupancy`, `lib/git/worktree-marker.ts`), so no crash leaves the primary with
          neither marker. A rerun finding its own anchored marker treats the checkout as settled, as
          `convertSpawnedMarker` treats a converted marker, where `removePrimaryTransientOccupancy` would refuse it as
          `subject-mismatch`. The spawned arm keeps `convertSpawnedMarker`.
        - From the flip the runtime skips its inbox settlement step (`settlePromotedInbox`), since the start moved the
          entry into the Errand's description: it fills `settleInbox` with a step that settles nothing and returns the
          frame unchanged but for its origin, which it clears (`originEntry` and `originEntrySourceDigest` `null`) as
          `settlePromotedInbox` does, so its settled result reports no origin, as today. `promoteOrdinaryErrand` calls
          that slot whenever the meta is committed (`settleCommittedFrame`, `lib/errand/promote.ts`), as the steps'
          receipt always is, and today's step would refuse an inbox origin with a `null` digest after the write.

        - Build `test-first` (one behavior at a time), over the reference backend and a scripted repository:
            - a promotion on the primary leaves an anchored work-unit marker, and the roster derives the work unit there
            - a rerun after the settlement finds its own marker settled and writes nothing
            - a promotion on a spawned checkout converts its marker
            - no inbox settlement runs and the result reports no origin, for an Errand started from an inbox entry, its
              digest `null`, as for one with no inbox origin
            - over the in-repo implementation promotion runs as today, its commit included

### `[ ]` **3.10 What is in flight** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - Run the exit criterion's scenario over the reference backend and the in-repo implementation, and request
      `arc check segment`.

## **Phase 4:** The entry grammar

_Purpose:_ Settle the one grammar every entry list shares — the entry-field module, the six entry kinds and the routing
receipts, the ID's place, and the `WORKING-MEMORY` header rule — and move the personal surfaces' readers and writers
onto it, before session-init and routing read through it.

_Mode:_ `layer` — closes on the entry-field module, the six kinds, and the receipt kinds settled in their registry
slots, with the personal surfaces read and written through them.

_Exit criterion:_ Each kind parses and writes the fields § 6.3 admits, read in the reference harness through its
production grammar; the module reads every spelling today's entries carry and writes only the managed form; each ID
placement § 6.4 names has its test; a wrapped or colon-less `WORKING-MEMORY` header above its trigger refuses; and every
personal-surface test passes unchanged over the in-repo implementation.

_Design decisions:_ The grammar is shared decision 9, so its module and kinds land as one layer before any verb writes
through them. The notes-sync machinery keeps `lib/user-sync/parser.ts` until the deletion pass removes it with notes.
The in-repo backend calls no personal kind's parser and runs no write check, so filling these slots changes nothing
before the flip.

### `[x]` **4.1 Build the entry-field module — § 6.1, § 6.2**

- _Goal:_ One module, `lib/store/kinds/entry-fields.ts`, defines each managed field once — its name, value shape, and
  placement in an entry — reading every spelling today's entries carry and writing only the managed form, and computes
  an entry's version as exactly what the entry merge compares.

    - `[x]` **4.1.a The managed fields and their spellings**

        - The shared field module reads managed and accepted legacy spellings, validates values, and writes grouped
          canonical fields with a leading disposition preserved.

    - `[x]` **4.1.b `WORKING-MEMORY`'s trigger**

        - Working-memory triggers read both delimiters and wrapped content through the closing delimiter; writes use the
          underscore form.

    - `[x]` **4.1.c `_Routed from:_`'s written form**

        - Routed-from provenance is a prose line directly after the ID, replaceable and removable by label.

    - `[x]` **4.1.d The ID and the entry's version**

        - Entry versions hash section and exact bytes with the merge protocol; ID generation retains collision redraws.

### `[x]` **4.2 Declare the entry kinds and the routing receipts — § 6.3, § 6.5, § 6.6, § 7.3, § 15.1**

- _Goal:_ Each of the six entry kinds declares its shape, the sections that hold entries, and the managed fields it
  admits beyond `_Id:_` as § 6.3's table gives them, with a parser in its registry slot; the three kinds the registry
  leaves unhomed gain their entry configs and parsers; the reference harness reads every kind through its production
  grammar; and the routing receipts take their own write-once mechanism, schema, and writer verbs.

    - `[x]` **4.2.a The inboxes**

        - Personal and project inbox parsers declare their sections and fields while preserving outside text and
          existing project-inbox content.

    - `[x]` **4.2.b The three kinds the registry leaves unhomed**

        - Inbound, description, and queue kinds carry production grammars; the reference harness uses them, and metadata
          and lineage checks refuse held inbound entries.

    - `[x]` **4.2.c `WORKING-MEMORY`'s kind**

        - The working-memory kind parses field headers and required removal triggers, including the seeded document.

    - `[x]` **4.2.d The routing receipts**

        - Receipts have independent write-once mechanisms, typed routing coordinates and time, and only the declared
          moving and conflict-resolution writers.

### `[x]` **4.3 Place an entry's `_Id:_` after its kind's managed fields — § 6.4, § 15.1**

- _Goal:_ `stampEntryIds` places a heading entry's `_Id:_` after the last of its kind's managed fields, matched by name
  from the list its entry config carries, or, when the entry has none, after a leading `_Disposition:_` or directly
  under the heading, and a field-header entry's after its trigger's last line; with no list, today's placement holds.

- _Outcome:_ Kind-aware ID stamping follows the managed group or a wrapped memory trigger without absorbing prose
  descriptors; configurations without declared managed fields retain their original placement.

### `[x]` **4.4 Read and write the personal inbox through its kind — § 6.1, § 6.2**

- _Goal:_ This change's readers and writers of the personal inbox move off `lib/user-sync/parser.ts` onto the inbox's
  kind and the entry-field module, and behave as today over the in-repo implementation.

- _Outcome:_ Personal inbox callers share kind parsing and field interpretation. Alternate target spellings participate
  in off-branch reconciliation while notes-sync retains its existing parser and title-keyed operations.

### `[x]` **4.5 Refuse a wrapped or colon-less `WORKING-MEMORY` header — § 6.5**

- _Goal:_ From the flip a write of `WORKING-MEMORY` whose `_Remove when:_` trigger has, as its nearest non-blank line
  above, anything but a one-line header matching `WM_HEADER` refuses, naming that line and the documented shape, before
  the entry splitter could fold it into the entry above; bold-led prose elsewhere in an entry, and a trigger inside an
  HTML comment, are untouched.

- _Outcome:_ Working-memory parsing rejects wrapped or colon-less headers above a trigger with the line and expected
  shape; prose and commented examples remain ordinary content.

### `[x]` **4.6 The entry grammar** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

- _Outcome:_ On merged base `5e83105f2`, all six kinds round-trip through the reference harness's production grammar.
  Managed-field spelling, ID placement, and malformed memory-header scenarios hold; the existing personal-surface,
  Store, and inbox CLI scenarios retain their in-repo behavior. The derived frame retains schema-owned types through
  a named declaration boundary for composite envelope serialization.

## **Phase 5:** Session-init and recovery over the store

_Purpose:_ Route every slot § 4.2 names, and handoff's and recovery's probes, through the contract on one binding, each
slot's arm from the flip reporting its conditions with § 4.3's actions.

_Mode:_ `replication` — closes when every rebuilt slot and every handoff and recovery probe reads through the contract,
batch-verified over both implementations.

_Exit criterion:_ Over the in-repo implementation the session-init envelope on the compatibility fixtures
(`__tests__/helpers/session-envelope-compat.ts`, goldens in `__tests__/fixtures/session-envelope/`) is unchanged but for
§ 1.4's items; over the reference backend each rebuilt slot's arm from the flip reports its conditions with the action
and checkout § 4.3 gives it; `currentWuReconcile`'s reads are bound once from the flip; and recovery and restating read
state as of a state version beside the code-head baseline.

_Design decisions:_ The store's binding for session-init, with the sync port's (Task 3.3.a), lives in its own module
beside `handlers/status.ts`, which nears the file-length limit and whose `handleSessionInitStatus` already carries a
`max-lines-per-function` floor entry. Every slot's arm from the flip extends the schema Task 1.1 or 1.3 registered, and
its `arc schema` test with it.

### `[ ]` **5.1 Bind session-init's probes once, through the contract — § 4.1**

- _Goal:_ `handleSessionInitStatus` keeps composing every slot, with each probe reading through the contract, its slot
  paths and load-set entries from the layout resolver, a work unit's through Task 1.9's function, and its outcome the
  plain `{ ok, … }` object with today's failure isolation; from the flip `currentWuReconcile`'s reads are bound once and
  the user-reference reconcile applies as one prepared write.

    - `[ ]` **5.1.a The binding**

        - `handleSessionInitStatus` (`handlers/status.ts`) binds the in-flight oracle (Task 3.1.b), the transient
          acquisitions (Task 3.2), the roster and the sweeps, `errandSweep` and `inboxState`, the nudge-marker reads
          behind `errandState` and `workUnitState` (`resolveNudgeState`, `handlers/status/session-evidence.ts`), and the
          compaction seed's write, each through the store. The nudge markers stay machine-local files under the
          identity's `.internal/`, read at a path built from the personal root's address (Task 2.1.a).
        - From the flip the two reconcile slots take their work unit from the frame's subject, where today they parse it
          from the meta's file name (`metaWorkUnitNameFromActive`, `commands/status/run.ts`).
        - Failure isolation stays as `runSessionInitStatus` composes it today, including the slots it builds from
          another slot's result: `errandState` from `worktree` and `active`, the residue sweep from the roster,
          `loadSet` from `derivedLocusState`, and from the flip the two reconcile slots from `derivedLocusState`'s
          frame, each absent where the frame fails or names no work unit, as each is today with no single active meta.

        - Build `test-first` (one behavior at a time):
            - the envelope on each compatibility fixture is unchanged over the in-repo implementation
            - a failed store read fails only the slot that needed it
            - over the reference backend every slot composes from the store, and the reconcile slots key on the frame's
              subject
            - over the reference backend a failed frame leaves both reconcile slots absent

    - `[ ]` **5.1.b `currentWuReconcile` bound once**

        - From the flip the session probe (`runCurrentWuReconcileSessionProbe`,
          `lib/session-init/current-wu-reconcile.ts`) binds the transition-write-path change's store-backed prepare
          context (`createStoreReconcilePrepareContext`, `lib/work-unit/store-reconcile-context.ts`, built in
          Task 4.3.b - `tasks-seam-lifecycle.md`) in place of the lifecycle index, transition queries, and artifact
          reads `handleSessionInitStatus` binds inline; until then the inline bindings stay, since over the in-repo
          implementation they read the transition records that carry today's renames. It only prepares, the apply
          staying `arc wu reconcile <slug> --apply`.
        - Given the context, the probe plans for the primary record it acquired, its slug that record's name and its
          meta path `workUnitMetaPath(primary)` (`lib/store/lifecycle-write.ts`), as lifecycle's own ceremony does
          (`buildStoreCurrentWuReconcile`, `lib/work-unit/store-current-wu-reconcile.ts`), since the context's
          `readFile` serves only the paths it acquired.
        - Where the prepare throws over a lifecycle listing with a malformed or missed record
          (`store.lifecycle-incomplete`) or one it cannot read (`store.lifecycle-unreadable`) — each an `ArcError` from
          `requireCompleteInventory` (`lib/store/lifecycle-storage.ts`), the first carrying its diagnostics as its
          `cause` — the slot catches it and reports each diagnostic's condition as its condition, with that diagnostic's
          remedy as its action, as text, or, for an unreadable listing or an incomplete one whose `cause` holds no
          diagnostic, the thrown message as its condition (§ 4.3), rather than failing as a probe.
        - Where the context returns the store's refusal — the lifecycle view's, the artifact group's acquisition's, a
          group listed incompletely among them (`acquireLifecycleRecords`, `lib/work-unit/prepared-lifecycle-write.ts`),
          the lineage listing's or its terminal aliases' (`readTerminalReferenceAliases`,
          `lib/work-unit/terminal-reference-aliases.ts`), an alias lookup's, or the paired references' owners'
          (`readPairedReferenceOwners`, `lib/work-unit/paired-reference-owners.ts`) — the slot reports its condition as
          its condition, with its remedy as its action, as text, as it reports the throw.

        - Build `test-first` (one behavior at a time):
            - over the reference backend the probe's plan matches the reconcile command's for the same work unit, a
              former slug resolving through the shared context
            - over the reference backend an incomplete lifecycle listing reports as the slot's condition with its remedy
            - over the reference backend an unreadable lifecycle listing reports its message as the slot's condition
            - over the reference backend an artifact group listed incompletely reports the acquisition's condition as
              the slot's condition, with its remedy as its action
            - over a stand-in store whose lifecycle listing reports records missed with no diagnostic, the slot reports
              the thrown message as its condition
            - over the in-repo implementation the probe's plan is today's

    - `[ ]` **5.1.c The user-reference reconcile as one prepared write**

        - _Amended in:_ 5.R (A21)

        - From the flip `lib/user-reference-reconcile.ts` and its command (`handleUserReconcileReferences`,
          `handlers/user.ts`) revalidate each prepared personal record by its version and apply every rewrite in one
          `batch` with expected versions, through the prepared-write protocol's revalidation and application
          (`revalidateLifecycleRecords`, `applyPreparedLifecycleWrite`, `lib/work-unit/prepared-lifecycle-write.ts`)
          over the records it read and the rewrites it plans, rather than a protocol of its own. The session notes it
          rewrites are then the meta's session context (Task 2.8.a), so the same batch writes the meta through the meta
          kind's writer at its expected version beside the personal records.
        - Until the flip it re-plans under the notes lock, as `runUserReferenceReconcile` does today.
        - Its session probe in `handleSessionInitStatus` reads the person's inbox, `WORKING-MEMORY`, and session notes
          through the store from the flip, and takes its display paths from the layout resolver, where it names
          `USER-INBOX.md` through the user-surfaces resolver today.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - every rewrite, the meta's session context among them, lands in one batch
            - a record changed after preparation refuses the batch, and nothing lands
            - over the in-repo implementation a change under the lock re-plans as today

### `[ ]` **5.2 Reroute the locus classification, the orphan sweep, and retired subdirectories — § 4.2, § 12.4**

- _Goal:_ From the flip session-init's locus classification matches a branch to its work unit through the branch link,
  the orphan-branch sweep admits a branch the store links whatever its name and never offers an adopted one teardown,
  and `retiredSubdirs` resolves `skip`.

- _Note:_ The derived frame, the roster's consumers, branch-gone recovery's candidates, and the sweep's release rows are
  Phase 2's (Tasks 2.1, 2.2, 2.9.c), and the sweep's selection from the flip Task 3.7.b's.

    - `[ ]` **5.2.a The locus classification**

        - From the flip `locusOwnsBranch` (`lib/session-init/locus-classification.ts`) matches a branch to a work-unit
          row through that work unit's branch link, read through the store, where today it derives the slug from the
          branch's name (`branchToWorkUnitSlug`).

        - Build `test-first` (one behavior at a time):
            - over the reference backend a work-unit row owns its linked branch, whatever its name
            - over the in-repo implementation it matches by the branch's slug as today
            - over the reference backend with no project-ID port injected, a work-unit row owns its linked branch, the
              project ID read from the project's identity record

    - `[ ]` **5.2.b The orphan-branch sweep from the flip**

        - Both of the sweep's paths (`runOrphanBranchSweep`, `analyzeOrphanBranchesSnapshot`,
          `lib/session-init/orphan-branch-sweep.ts`) admit a gone-upstream branch the store links, whatever its name,
          through `lookup` with `LookupInputSchema`'s `ref` kind (`lib/store/lookup.ts`), its repository the project ID
          and its ref the branch's short name (Phase 2's design decisions), and take its work unit from the link, where
          today they scan only type-prefixed branches and derive the work unit from the name; its shipped verdict reads
          placement (Task 3.7.a).
        - A branch linked `adopted` is never offered `arc teardown`: where its `merged` verdict holds the slot offers
          `git branch -D <name>`, typed, and otherwise reports the branch kept, its owner's, naming
          `git branch -D <name>` as text. Until the flip no link carries the record, so every branch reads as one ARC
          created.
        - A branch the identity's transient records name is left out, as today's sweep leaves out every branch in the
          one-snapshot index (`errandBranches`, `slugByBranch`, `lib/errand/record.ts`) — its Errands' and its grooming
          and housekeeping claims' — which serves the in-repo arm alone (`readTransientInFlightIndexes`): from the flip
          a branch whose link resolves to an Errand's record (`work-item/record`) at placement `active`, and a branch a
          claim names, read from Task 3.2's claims acquisition, which stays the identity's and whose records keep their
          `branch`. A lookup that fails, or a claims acquisition that is not complete, declines the sweep, as an
          incomplete transient read does today. A branch linked to an ended Errand is never offered `arc teardown`: it
          takes the `merged` verdict's `git branch -D <name>`, as today's name-derived scan gives it.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - a linked branch with no type prefix is scanned, its work unit from the link
            - a branch the transition-write-path change's writer linked is admitted, its work unit from the link
            - an adopted, merged branch yields the typed `-D`, and an adopted, unmerged one its text, never a teardown
            - an open Errand's gone-upstream branch is left out, and a closed one's merged branch yields the typed `-D`,
              never a teardown
            - a live grooming claim's merged, gone-upstream branch is left out
            - a failed lookup, or a claims acquisition that is not complete, declines the sweep
            - with no project-ID port injected, the lookup's repository is the project ID the project's identity record
              holds

    - `[ ]` **5.2.c Retired subdirectories**

        - From the flip `retiredSubdirs` resolves `skip` with no candidates before any read, since the per-work-unit
          workspace it reconciles retires and the scratch plan takes its place (Task 2.8.d); until then
          retired-subdirectory detection reads the archive at its base ref, as today (Task 3.7.a).

        - Build `test-first` (one behavior at a time):
            - over the reference backend `retiredSubdirs` resolves `skip` with no read

### `[ ]` **5.3 Reroute the work-unit, Errand, and inbox slots — § 4.2, § 4.3**

- _Goal:_ `workUnitState`, `errandState`, and `inboxState` with its reminder and staleness reads read through the
  contract, with their actions; and from the flip a slot whose action would advance a paused work unit's work takes
  `arc resume <slug>` in its place, its text naming the command to run once resumed.

    - `[ ]` **5.3.a The work-unit and Errand slots**

        - `workUnitState` (`lib/session-init/work-unit-state.ts`) takes its `Integrating` rows from the roster (Task
          2.2.b) and its branch tips as today.
        - `errandState` (`lib/session-init/errand-state.ts`) reads the oracle's set (Task 3.1.b) and the acquisitions
          (Task 3.2), and classifies its entries' branches as today. Its materializable Errands report `originEntry` as
          the record holds it (`lib/session-init/materializable-errands.ts`).
        - From the flip the records it builds its resume detection and its materializable Errands from (`slugByBranch`,
          `findMaterializableErrands`) are this identity's own Errands at placement `active`, in any mode, so it never
          offers or detects a closed Errand or another person's, which the open and `arc errand materialize` refuse
          (Tasks 3.3.c, 3.3.e).

        - Build `test-first` (one behavior at a time):
            - each slot's report over the reference backend matches the in-repo implementation's on the same state
            - over the reference backend a closed Errand whose remote branch survives, and another identity's Errand,
              are neither offered to materialize nor detected for resume

    - `[ ]` **5.3.b The inbox slots**

        - `inboxState`, the reminder nudge, and the staleness sweep's inbox input (`lib/session-init/inbox-state.ts`,
          `inbox-reminders.ts`; `extractReminderEntries`, `handlers/status.ts`) read the person's inbox through the
          store and its kind (Task 4.4), where `readUserInbox` (`handlers/status/session-context.ts`) reads the file
          today; this task owns that reader's reroute.
        - From the flip `inboxState` leaves the Errand queue's members out of its routable count and counts them apart,
          where it reads the execute-bound marks today, since the marks give way to the queue (§ 7.6).

        - Build `test-first` (one behavior at a time):
            - the routable count and the nudge read `_Hold:_` and `_Remind:_` through the kind over both implementations
            - over the reference backend a queued entry is counted apart from the routable ones

    - `[ ]` **5.3.c A paused work unit's actions**

        - From the flip, on a paused work unit, read from the frame's work-unit context (Task 2.1.d),
          `currentWuReconcile` offers `arc resume <slug>` in place of `arc wu reconcile <slug> --apply --json`, its text
          naming the apply to run once resumed. The swap is in `actions` alone: `recommendedCommand` and the slot's
          other command fields keep today's values until the deletion pass. The probe's prepare never reads the pause,
          so it never meets the apply's refusal. The commits not yet closed take the same swap in Task 7.4.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - a paused work unit's pending reconcile yields `arc resume <slug>`, its text naming the apply
            - a paused work unit's slot keeps today's `recommendedCommand` beside its swapped action

### `[ ]` **5.4 Report paused work, and enter a paused checkout — § 4.4**

- _Goal:_ From the flip `pausedWork` lists the person's paused work units, each with its reason and what it waits on,
  marked resumable once the work unit it waits on ships and review-due at once if that work unit ends otherwise, or once
  a pause waiting on no work unit passes `pause.review_after_days`; each item carries its resume or materialize action;
  and entering a paused checkout renders the pause before any work starts.

    - `[ ]` **5.4.a The slot**

        - A per-identity listing of paused work units through the store fills `pausedWork` (Task 1.3), each item marked
          as above; a review-due item carries a precomposed review prompt naming `arc resume <slug>`,
          `arc handover <slug> --to <identity>`, `arc pause <slug> --open` where the pause is not open already, and
          `arc abandon <slug> --yes`, every argument filled but the handover's identity, and carries each as an action:
          typed, but the handover's, which is text, the resume once where it is the item's own action, and the abandon
          with `--yes`, since the verb refuses without it (`handleStoreAbandon`, `handlers/abandon-store.ts`).
        - The listing selects by the work item's `Owner`, never the pause's `pausedBy`, which a handover leaves in place
          (`runHandover`, `lib/work-unit/verbs/pause-handover.ts`); it resolves a `waitsOn` slug through `lookup` to
          mark the item, since a rename leaves another work unit's pause naming the former slug; and it measures a
          pause's review age from its `since`, which a pause updated in place keeps. Each item carries the pause's
          `open`, which the slot's schema (`PausedWorkResultSchema`, `lib/session-init/paused-work.ts`, Task 1.3) gains
          beside its producer.
        - The marking — the resumable and review-due marks, and a review-due item's prompt with its choices as actions —
          is one exported function over a single paused work item (`markPausedWorkItem`,
          `lib/session-init/paused-work.ts`), given the store, for the `waitsOn` lookup, and the
          `pause.review_after_days` setting, reading no identity and no checkout. The slot maps it over its listing, and
          the status change's Paused tier calls it for each paused row (spec § 4.4).
        - Each item's action is `arc resume <slug>`; or `arc materialize <slug>` where no checkout here holds the work
          unit; or `arc materialize <slug> --here` with the checkout to run in, where a markerless checkout, its folder
          present, still has its branch out (Task 2.7).

        - Build `test-first` (one behavior at a time), over the reference backend:
            - a pause waiting on a shipped work unit is marked resumable
            - one waiting on an abandoned or cut work unit is review-due at once
            - a pause waiting on nothing, or on a note, older than the setting, is review-due with its prompt
            - each item's action follows where its checkout is
            - a work unit handed over lists for its new owner, not the identity that paused it
            - a pause waiting on a work unit since renamed resolves it by its former slug
            - an open pause's review prompt names no `arc pause <slug> --open`
            - a review-due item carries its resume, its open where the pause is not open, and `arc abandon <slug> --yes`
              as typed actions, and its handover as text
            - the marking function, given a paused work item another identity owns, marks it as the slot marks the
              person's own

    - `[ ]` **5.4.b Entering a paused checkout**

        - The frame's work-unit context carries the pause record (Task 2.1.d), and its guidance
          (`deriveDerivedLocusSessionGuidance`, `lib/locus/session-guidance.ts`) renders the pause, its reason, and its
          resume notes, so orientation is not bare-clean and no entry shortcut fires past it;
          `LocusSessionGuidanceSchema` admits the pause.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - the guidance renders a paused checkout's pause, reason, and resume notes, and parses under its schema

### `[ ]` **5.5 Widen the materialize offer — § 4.5, § 2.7**

- _Goal:_ From the flip the offer lists the in-flight work units this identity owns that no checkout here holds —
  remote-only or released, with no remote needed, paused ones left to `pausedWork` — and offers
  `arc materialize <slug> --here`, with its checkout, for a work unit whose branch a markerless checkout has out, its
  folder present.

    - `findMaterializableWorkUnits` (`lib/session-init/materializable-work-units.ts`) reads the oracle's set
      (Task 3.1.b), which no remote gates, less the work units a checkout here holds (Task 2.4's lookup) and less paused
      ones, reporting the condition for a work unit whose lookup rejects rather than offering it; today it admits only
      remote-only work units that are not parked. It keeps its own loop over that set rather than calling the verb's
      listing (`listStoreMaterializable`, `lib/work-unit/verbs/materialize-store.ts`), which aborts whole on any one
      work unit's rejected lookup.
    - Task 2.7's pairs give the `--here` offers; a registration whose folder is missing holds no checkout, so its work
      unit takes the ordinary offer, whose spawn clears it.
    - Its entry's `branch` (`MaterializableWorkUnitSchema`), a required non-empty string today, is optional from the
      flip, so a branchless work unit's offer names it alone, as `arc materialize` takes a work unit with no branch link
      (spec § 16).

    - Build `test-first` (one behavior at a time), over the reference backend:
        - a released work unit is offered with no remote configured, and a held or paused one is not
        - a work unit whose branch a markerless checkout has out is offered the `--here` form with that checkout
        - a work unit whose checkout's folder was deleted takes the ordinary offer
        - a branchless work unit is offered with no branch, and the entry parses under the slot's schema
        - one work unit's rejected lookup reports its condition while the others are offered, and where no lookup
          rejects the offer's set is `arc materialize`'s listing less paused work units

### `[ ]` **5.6 Report inbound back-pressure — § 4.6**

- _Goal:_ One per-work-unit computation, built with the inbound kind, reports the pending inbound count and the oldest
  entry's age from its `_Created:_` against `inbound.retriage_after_entries` and `inbound.retriage_after_days` (Task
  1.11), and from the flip `inboundBackPressure` carries the current work unit's figures, past either threshold
  recommending its owner's re-triage, naming `arc inbox <slug>` in its text.

    - The computation reads the inbound list through its kind (Task 4.2.b); the same computation feeds
      `arc inbox <slug>`'s figures (Task 6.1), which the drain reads.

    - Build `test-first` (one behavior at a time), over the reference backend:
        - more pending entries than the count threshold trips it
        - an oldest entry older than the day threshold trips it
        - below both the slot reports its figures with no action

### `[ ]` **5.7 Retire session-init's notes policies at the flip, and pull at session start — § 4.7, § 4.8**

- _Goal:_ From the flip `user.notes_push`, `session.init_pull.notes`, and `session.init_load.notes` have no effect on
  session-init and its notes recommendations go with them, while `session.remote_sync`, the worktree and base
  recommendations, and each slot's failure isolation stay; and under `session.remote_sync` session start calls the
  store's `pull` in the `user` probe, carrying a `designation-needed` state in the `user` slot with its remedy argv.

    - `[ ]` **5.7.a The notes policies**

        - The policy branches and their prompts in `lib/session-init/recommended-action.ts` — `inferUser`,
          `composeNotesPromptText`, `composeCombinedPrompt`, and the retired-subdirectory load dispatch
          (`inferRetiredSubdirs`) — take no effect from the flip; until then they run as today. `arc sync`'s read of
          `user.notes_push` (`handlers/sync.ts`, `lib/release/schema.ts`) is the cutover's rewire.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - each notes setting changes nothing in the envelope, and no notes or combined prompt appears
            - the worktree and base recommendations still follow their settings

    - `[ ]` **5.7.b The pull and its designation**

        - From the flip the `user` probe (`handlers/status.ts`) calls `pull` through Task 3.3.a's port, and the `user`
          slot's value is the pull's states (`PullResult`), a `designation-needed` state carrying its remote, choices,
          and remedy, with no notes fields, where today's producer (`runUserSessionInitStatus`,
          `commands/user/sync-status.ts`) is notes-sync machinery this change leaves alone. The slot shows
          `designation-needed` as an orientation line with the remedy's argv, typed.
        - `createDefaultStorePorts` (`lib/store/default-ports.ts`) takes an optional `identity`, which its `identity`
          port returns in place of the configured one (`resolveIdentity`), so a store opened for an identity being set
          up reads, and its pull fetches, that identity's records whether or not `arc.identity` is set or names another.
        - From the flip `arc join` (`handlers/join.ts`) pulls through Task 3.3.a's port, which it does not today, with
          its store bound to the identity being set up.
        - It asks among the pull's `designation-needed` choices on a terminal and runs the answer,
          `arc store remote <remote> <choice>`, the recommended choice being the remedy's argv; without a terminal it
          reports the state the same way, never guessing.

        - Build `test-first` (one behavior at a time):
            - a bound pull reporting `designation-needed` yields the `user` slot's line and typed remedy, parsing under
              its schema
            - `arc join` pulls the identity being set up through the port, and without a terminal reports the state
              rather than choosing
            - the default port pulls nothing, and the slot reports no state
            - a store opened with an `identity` resolves that identity's personal records, not the configured one's

### `[ ]` **5.8 Reroute handoff's and recovery's probes, and restate across clones — § 4.1, § 4.9, § 9.2**

- _Goal:_ Handoff's and recovery's probes read through the contract, and from the flip restating and the recovery audit
  read state as of a state version, or through `changes` from one, beside the retained code-head baseline — pulling a
  missing history ref by name and retrying once, restricting `changes` to project scope from another person's anchor,
  rebuilding a seed whose state version no longer resolves, and taking the baseline-unknown path where no
  `State at Handoff` exists.

    - `[ ]` **5.8.a Handoff's and recovery's probes**

        - `createHandoffProbes` and the `resolveHandoffSurfaces` option `handlers/status/session.ts` passes to
          `runSessionHandoffStatus` (`commands/status/run.ts`) read through the store; the inbox read is Task 5.3.b's.
        - From the flip recovery's task-list reads (`resolveRecoveryTaskListEvidence`, `handlers/recover.ts`) go through
          the store — the seed's as of its state version, where it runs `git show <seedHead>:<taskListPath>` today, and
          the fresh one at the current version, where it reads the checkout's file — with
          `lib/recover/committed-progress.ts` and `lib/recover/integration-correction.ts`.

        - Build `test-first` (one behavior at a time):
            - each probe's result is unchanged over the in-repo implementation
            - over the reference backend recovery reads the seed's task list as of its state version and the fresh one
              at current

    - `[ ]` **5.8.b State continuity**

        - From the flip restating (`lib/handoff/restate-candidates.ts`) takes its anchors from the meta
          (`stateAtHandoff`, `commitAtHandoff`, `lib/store/kinds/meta/`), where today it reads a baseline from
          `SESSION-NOTES` (`BASELINE_HASH_REGEX`). Commits since handoff stay a Git walk from the code anchor; the tasks
          closed since come from the task-list record's `changes` since the state anchor, and changes to the work unit's
          notes from its notes record's `changes`.
        - Another person's anchor reads from the meta's `Owner` in the history entry that wrote it
          (`HistoryEntrySchema`, `lib/store/contract.ts`) — the oldest of the newest run of entries that all hold the
          current `State at Handoff` — set against the identity restating; restating then passes `changes` only the work
          item's project-scope records.
        - On a refusal naming history refs the clone lacks, which Task 3.3.a's port reads from it, the verb pulls them
          by name through the port and retries once, with no stop; until the port is bound it names none, so the retry
          pulls nothing, in either landing order (spec § 16). The tests script the port, and produce the refusal through
          a scripted store wrapper, since the reference helper throws on an unknown state version (`recordsAt`,
          `changesReference`, `__tests__/helpers/store/read.ts`).
        - A seed whose state version no longer resolves, or that records `stateVersion: null`, is rebuilt from current
          state. The first handoff after the flip finds no `State at Handoff` and takes the baseline-unknown path; a
          `Commit at Handoff` a later history rewrite left unreachable takes it for code commits, while the state anchor
          still serves state.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - the anchors come from the meta, the tasks closed from the task list's `changes`, and the notes changes
              from the notes record's
            - a missing history ref is pulled by name and the read retried once, and a failed pull surfaces the refusal
              with its remedy
            - restating from another person's anchor restricts `changes` to project scope
            - a seed whose state version no longer resolves, or is `null`, is rebuilt from current state
            - a missing `State at Handoff`, or an unreachable `Commit at Handoff`, takes the baseline-unknown path

### `[ ]` **5.9 Move this change's callers off the user-surfaces resolver — § 10.3**

- _Goal:_ This change's callers of the user-surfaces resolver read the person's records through the store, with nothing
  observable changing over the in-repo implementation, which keeps the resolver and its migration as its own arm.

    - The callers: `commands/user/add.ts`, `commands/user/inbox-mutation.ts`, `handlers/derived-locus-state-probe.ts`,
      `handlers/errand.ts`, `handlers/recover.ts`, `handlers/status/session-context.ts`,
      `handlers/status/session-evidence.ts`, and `handlers/user.ts` outside its notes-sync commands, off
      `resolveUserSurfaceResolver` and `createUserSurfaceResolver` (`lib/user-surfaces.ts`).
    - `arc user add` opens its store bound to the identity it adds (Task 5.7.b), so the in-repo implementation's
      personal records (`personalIdentity`, `lib/store/in-repo/personal-paths.ts`) resolve that identity's root, as
      `resolveUserSurfaceResolver` does today, rather than refusing an identity other than the configured one.
    - `lib/store/in-repo/personal-paths.ts` keeps importing the resolver, and teardown keeps merging a linked worktree's
      copy up through `lib/user-surface-migration.ts` until the flip.

    - Build `test-first` (one behavior at a time):
        - each caller's tests pass unchanged over the in-repo implementation, `arc user add` of an identity other than
          the configured one among them
        - each caller reads the person's records over the reference backend

### `[ ]` **5.10 Keep a missing or ambiguous completed subject fail-closed — § 3.7**

- _Goal:_ Over the store, the reader, session-init, and recovery derive each completed work unit's frame as Task 2.1.c
  gives it, and keep an arbitrary missing or ambiguous completed subject fail-closed — the frame `subject-unresolved`
  (`lib/locus/subject-meta.ts`), granting no cleanup authority, session-init reporting it, and the recovery audit
  stopping — whether or not the archived-but-not-torn-down interval remains.

    - Build `test-first` (one behavior at a time), under each archive cadence, across the reader, session-init, and
      recovery, over the reference backend:
        - a restart after archive and before merge derives the frame its cadence allows
        - a merge before teardown, by ARC's landing, and a merge made outside ARC by merge commit, each derive the
          retired frame
        - a multi-commit squash merged outside ARC stays in the integration frame under `with-integration`
        - a work unit retired by a cut or an abandonment derives the retired frame
        - a partial teardown grants no cleanup authority past what its record and checkout show
        - a missing completed subject, and an ambiguous one, each fail closed as the Goal states

### `[ ]` **5.R Keep personal prose advisory in the prepared reconcile — § 4.1 (A21)**

- _Goal:_ Managed inbox reference rewrites land in one prepared batch after revalidating every supporting record;
  working-memory and meta session-context prose yield advisories and remain unchanged (A21).

    - Use `revalidateLifecycleRecords` and `applyPreparedLifecycleWrite` for the acquired personal and context records,
      preparing writes only for managed inbox fields the existing planner rewrites. Never write an unchanged record
      merely to revalidate its version.
    - Build `test-first` (one behavior at a time), over the reference backend:
        - managed inbox rewrites land together while memory and meta session context remain byte-for-byte unchanged
        - a supporting record changed after preparation refuses before any rewrite lands
        - prose naming former work units yields advisories without an automatic rewrite

### `[ ]` **5.11 Session-init and recovery over the store** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - Compare the envelope on the compatibility fixtures with the merged base's, run every rebuilt slot's arm from the
      flip over the reference backend, and request `arc check segment`.

## **Phase 6:** Listing and routing

_Purpose:_ Give every entry list one reader and one mover — `arc inbox`, `arc route` with its receipts, survivors, the
Errand's start and abandon moving entries, the Errand queue, and removal by ID and version.

_Mode:_ `slice` — closes on an entry captured, listed, routed with its receipt, raced by an edit that survives, and
carried home.

_Exit criterion:_ Over the reference backend, an entry routed from the personal inbox into an inbound list writes the
insert, the removal, and both receipts in one batch; an edit racing it survives and lists with its derived home; the
drain carries it there; an Errand started from the project inbox moves its entry into its description and leaves the
queue, and its abandon returns the entry where § 7.5 states; and `inboxState` reports the survivors.

_Design decisions:_ Hold-and-route's drain side stays until the flip, and the routing method's binding and its hand-off
sites change in the flip's rewrite; this change's obligation to that path is what its verbs return — the listing's rows,
the routing verb's report, and the receipts (§ 7.9). Every move composes one mover's write set (Task 6.2.b) through the
Errand write step's batch (Task 3.3.b). The new verbs' handlers and the mover live in modules of their own, since
`handlers/errand.ts` and `src/cli.ts` already carry `max-lines` floor entries.

### `[ ]` **6.1 Add `arc inbox` — § 7.1**

- _Goal:_ From the flip `arc inbox <personal|project|slug>` lists every list the routing verb takes from — an inbox, a
  work unit's inbound list, or an Errand's description — each row carrying the entry's `_Id:_` and version, a work
  unit's inbound list its pending count and oldest age, and `--target <slug>` filtering the personal inbox while keeping
  today's `clear`, `named`, and `refused` result; and `arc user inbox-list` refuses from the flip, naming it.

    - `personal` and `project` always name the inboxes; a work item with either slug is named by its UID, here and in
      `arc route`.
    - `--target` keeps `listInboxEntriesNamingTarget`'s selection (`lib/user-sync/inbox-target.ts`) and the
      `UserInboxListResultSchema` states (`handlers/user-inbox-list.ts`) that `arc user inbox-list --target`
      (`runUserInboxList`, `commands/user/inbox-list.ts`) serves until the flip; on any other list it refuses, naming
      `arc inbox personal --target <slug>`, since only Work Unit captures carry `_WU_Target:_`. The capture gates' calls
      move to it in the flip's rewrite.
    - From the flip `arc user inbox-list` refuses `unsupported`, naming `arc inbox personal --target <slug>`.
    - A backlog stub's inbound list that holds entries also carries the precomposed offer to re-triage it, naming its
      count and oldest date, which the drain's routing plan shows in the flip's rewrite; an empty one, and a started
      work unit's, carries none, the latter's entries being its owner's.
    - Its result registers its schema, as the slots' do. The inbound list's figures come from Task 5.6's computation; an
      inbox row's survivor reading is Task 6.3's; the refusal before the flip is Task 1.10's.

    - Build `test-first` (one behavior at a time), over the reference backend:
        - each list kind lists its entries with their IDs and versions
        - `--target` yields `clear`, `named`, and `refused` as today's listing does, and refuses on a list other than
          the personal inbox, naming the form, which then lists
        - an inbound list carries its pending count and oldest age
        - a backlog stub's inbound list holding entries carries its re-triage offer, and an empty one and a started
          work unit's none
        - a work item whose slug is `personal` is listed by its UID
        - `arc user inbox-list` refuses, naming `arc inbox personal --target <slug>`, which then lists

### `[ ]` **6.2 Add `arc route`, with its receipts — § 7.2, § 7.3, § 7.8, § 15.1**

- _Goal:_ From the flip `arc route` moves an existing entry at the version its caller read, or inserts a new one from
  standard input, through one mover writing the destination's insert, the source's removal, and the routing receipts in
  one batch and reporting the entry's ID and destination; an edit racing the move survives through the entry merge; and
  each refusal § 7.2 states names § 13's repair.

    - `[ ]` **6.2.a The move and the insert**

        - `arc route <entry-id> --from <list> --expected-version <version> --to <destination>` reads the source and
          refuses when the entry's version differs from the one given, naming the version it found and leaving the entry
          in place; otherwise it writes the batch at the source record's version as it read it, so the entry merge
          removes only the bytes the verb observed.
        - `arc route --to <destination>` takes the entry on standard input and stamps its `_Id:_` before the batch, so
          the receipt and the report carry it.
        - A destination is an inbox or a slug, a work unit's taking the entry into its inbound list and an Errand's into
          its description; `--section` is required where the destination's kind has more than one section and refused
          elsewhere.
        - A move whose entry is gone from the source and absent from the destination refuses, naming where its latest
          receipt says it went, or that no receipt names it.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - a move lands the insert, the removal, and the receipts in one batch and reports the ID and destination
            - an entry changed since its version was read refuses, naming the version found, and stays; the move at that
              version then lands
            - an edit landing between the read and the write survives in the source
            - an insert reports the `_Id:_` it stamped, which its receipt carries
            - an insert into the personal inbox without `--section` refuses, naming both sections, and the insert naming
              one then lands
            - an entry gone from both lists refuses, naming its latest receipt's destination, and the move from there
              then lands

    - `[ ]` **6.2.b The mover's write set**

        - One exported module composes a move's write set for every mover — the route, an Errand's start and
          `arc errand link` (Task 6.4), the abandon's return (Task 6.6), and a survivor's carry (Task 6.3.b): the
          destination's insert under its kind's field rules, the source's removal at the version read, and the receipts.
        - The field rules: it drops the managed fields the destination's kind does not admit, a description admitting
          the capture's fields whole; drops `_Cites:_` on every move; restamps `_Created:_` on every route but into a
          description; and writes `_Routed from:_` on a move into an inbound list, replacing any it carried, dropping it
          on a move into any other kind (Task 4.1.c).

        - Build `test-first` (one behavior at a time):
            - a move into an inbound list writes `_Routed from:_` with the list and section left, and restamps
              `_Created:_`
            - a move into a description keeps `_Created:_` and the capture's fields
            - every move drops `_Cites:_`

    - `[ ]` **6.2.c The receipts**

        - Every move into or out of an inbox writes one receipt (Task 4.2.d), under a fresh key, to the ref of each
          inbox it leaves or enters — the person's own for their personal inbox, the project inbox's for the project
          inbox — in the batch that already writes those refs; a move between an inbound list and a description writes
          none.
        - One helper reads an entry's latest receipt: the latest, by time, of those naming its ID whose source or
          destination is the list its reader reads or names, across the person's receipts and the project inbox's
          together; Tasks 6.3, 6.4, and 6.6 read through it.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - a move between the two inboxes writes one receipt to each ref
            - a move between an inbound list and a description writes none
            - the latest receipt is decided across the two refs by time

    - `[ ]` **6.2.d Who writes, IDs already held, and refused destinations**

        - Anyone inserts, and anyone removes from a backlog stub's inbound list; it refuses a removal from a started
          work unit's inbound list by anyone but its owner, naming the owner and the insert form for a copy.
        - An insert whose ID the destination holds writes nothing and reports that home when the held entry's receipt
          shows it came from the same inbox and the source no longer holds it; otherwise it refuses, naming both
          entries and the repair: the insert form without the `_Id:_`, which stamps a fresh one, then the source's
          removal.
        - It refuses a work unit Integrating or completed, naming a follow-on or `arc reopen <slug>`; one retired by
          abandonment or a cut, naming the inbox and, for a cut, the successors its lineage record names; and an ended
          Errand, closed or abandoned, naming the inbox.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - a non-owner's removal from a started work unit's inbound list refuses, naming the owner, and the insert
              form for a copy then lands
            - two drains routing one entry the same way land it once, the second reporting its home
            - an ID the destination holds from elsewhere refuses, naming both entries, and the insert form without the
              `_Id:_`, then the source's removal, lands
            - each refused destination names its repair, a cut's successors among them, and a route to the destination
              its repair names then lands

### `[ ]` **6.3 List survivors with their homes, and carry them — § 7.4, § 4.3**

- _Goal:_ From the flip an inbox row whose latest receipt moved it out of that inbox lists as a survivor carrying the
  home that receipt names, derived and never stored, unless that home now takes nothing; `inboxState` reports the
  person's survivors; and the drain carries a survivor home through `arc route`'s move form, never leaving both the
  survivor and its carry.

    - `[ ]` **6.3.a The listing and the slot**

        - `arc inbox`'s inbox rows read survivors through 6.2.c's helper; an entry an abandon or a route returned reads
          by its return's receipt, so it lists as unstarted work; a survivor whose home is an ended Errand, a work unit
          Integrating or completed, or one retired lists as ordinary work.
        - `inboxState` reports the person's survivors in an optional field its registered schema admits, present from
          the flip, naming `arc inbox personal` as text, since carrying one takes the drain's decisions.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - an edit racing a route lists as a survivor with its derived home
            - a survivor whose home now takes nothing lists as ordinary work
            - a returned entry lists as unstarted work
            - `inboxState` reports the survivors with its text, and over the in-repo implementation carries no field

    - `[ ]` **6.3.b The carry**

        - Given a survivor's ID, version, and listed home, where the destination already holds the ID from the same
          inbox while the source still holds it, the verb carries the content rather than moving the entry: where the
          router may edit the held entry — an inbox, a backlog stub's inbound list, or the router's own work unit's — it
          replaces its title and prose, keeping its managed fields and `_Routed from:_` line, at the destination's
          version as read; otherwise it inserts the content as a new entry whose `_Cites:_` carries the original's ID.
        - The same batch removes the survivor at its version and writes a receipt.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - a carry into the router's own list replaces the held entry's title and prose
            - an edit to the held entry meanwhile meets the replacement as a conflict record, never overwritten
            - a carry into another person's started work unit inserts a citing entry
            - a crash leaves the survivor or its carry, never both, and a carried survivor no longer lists

### `[ ]` **6.4 Start an Errand by moving its entry — § 7.6**

- _Goal:_ From the flip a full-protection Errand started from an inbox entry is a routing whose destination is the new
  Errand — one batch creating the work item, making the entry its description, removing the entry at the version read,
  dropping it from the person's queue, and writing the receipt, the Errand's origin holding the entry's qualified ID —
  an Errand opened from text mints its description's entry in that batch, and `arc errand link --from-inbox` moves a
  capture into an Errand opened from text the same way; until the flip an Errand starts only from its person's own inbox
  and the entry stays there until close.

    - `[ ]` **6.4.a The start's batch and its refusals**

        - The start (`lib/errand/open-runtime.ts`) reads the entry where it reads it today (`resolveLiveInboxAdoption`,
          `handlers/errand.ts`), pulling first through Task 3.3.a's port, and composes 6.2.b's write set into Task
          3.3.b's batch with the record's create and the queue's drop.
        - It refuses an entry that is gone, naming where its latest receipt says it went, and one an open Errand holds —
          an entry of that inbox and ID whose latest receipt moved it into the description of an Errand still open —
          naming that Errand to resume in its own checkout; an entry whose Errand already closed is reported rather than
          refused. One helper reads whether an open Errand holds an entry, for this start and Task 6.6's abandon.
        - An Errand opened from text mints its description's entry in the open's batch: its intent as the title, with a
          fresh `_Id:_` and `_Created:_`.
        - A partial-protection start writes no description and drops the entry from the person's queue, as a full start
          does.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - a start from the project inbox lands the work item, its description, the removal, the queue drop, and the
              receipt in one batch
            - a gone entry and one an open Errand holds each refuse with their remedy
            - an entry whose Errand closed is reported and started
            - an open from text mints its description entry in the open's batch

    - `[ ]` **6.4.b The origin a start writes**

        - From the flip the open composes the origin from the entry it starts from (`openOrdinaryErrand`,
          `lib/errand/open.ts`), and the link from the entry it links (`linkOrdinaryErrand`, `lib/errand/link.ts`):
          `originEntry` is the entry's qualified ID, `<personal|project>:<id>`, and `originEntrySourceDigest` `null`,
          which Task 1.12.c admitted. A partial Errand's binding (`partialOrigin`, from the provisioning authority's
          partial-Errand arm) holds the qualified ID with `originEntryVersion`, the version observed at open.
        - Every projection of an origin reports it as the record or binding holds it, so none changes; the link's
          conflict and idempotency checks (`desiredRecord`), the open's resume check (`validateResumeContinuity`), and
          materialize's re-feed compare and pass the pair as the record holds it.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - a full start records the qualified ID with a `null` digest, and the open's result reports it as the
              operand a link takes
            - a partial start's binding carries the qualified ID and its version
            - a resume of a start from the flip compares the pair as recorded and admits

    - `[ ]` **6.4.c The link**

        - `arc errand link --from-inbox` (`lib/errand/link-runtime.ts`) moves a capture into an Errand opened from text
          through the same write set, beside the entry minted at open.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - a link moves a capture beside the minted entry, with its receipt

### `[ ]` **6.5 Keep each person's Errand queue — § 7.6, § 6.3**

- _Goal:_ From the flip each person's Errand queue is an ordered list of references to entries in either inbox, by ID
  and inbox, at identity scope and never projected — set whole by `arc errand queue set`, shown by `arc errand queue` —
  and the next offer takes the queue's first member a start would accept, writing nothing and reporting each member it
  leaves out or skips; `arc user inbox-mark-execute-bound` refuses from the flip, naming `arc errand queue set`.

    - `arc errand queue set <file | ->` takes a versioned JSON request listing the whole queue's members in order, each
      an inbox and an entry ID; its schema registers through `production-schema-registry.ts`, so `arc schema` serves it.
      It keeps in place the longest subsequence of current members already in the set's order — among several, the one
      whose members come earliest in the current queue — and places each other member with `placeRankedStub`
      (`lib/store/concurrency/rank.ts`), one at a time over the changing list, which re-keys tied successors in the same
      write. It refuses a set naming both entries of an ID both inboxes hold, naming both.
    - The startup offer (`resolveExecutionStartupOffer`, through `handleErrandNext`, `handlers/errand.ts`) and the offer
      after a close (`resolveExecutionNextOffer`, `lib/user-sync/execution-offer.ts`) read the queue from the flip and
      write nothing: each leaves out a member a start would refuse and skips one in conflict, reporting each in fields
      of its own with `arc errand queue set` as its repair. The queue changes only by `arc errand queue set`, a start,
      and the drain's execute-now append; abandoning an Errand does not put its entry back.
    - Until the flip the queue stays today's marks (`listExecuteBoundInboxEntries`, `lib/user-sync/inbox-writer.ts`),
      set by `arc user inbox-mark-execute-bound` (`handlers/user.ts`), and both new verbs refuse as Task 1.10 builds.

    - Build `test-first` (one behavior at a time), over the reference backend:
        - a set writes rank keys only for the members it adds or moves, and two sets clash only on a member both wrote
        - a set naming both entries of one ID refuses, naming both, and the set naming one of them then lands
        - each offer takes the first member a start would accept, reporting a left-out and a skipped member, and the
          queue is unchanged
        - `arc errand queue` shows the queue in rank order
        - `arc user inbox-mark-execute-bound` refuses, naming `arc errand queue set`

### `[ ]` **6.6 Return an abandoned Errand's entries — § 7.5, § 15.1**

- _Goal:_ From the flip an Errand's abandon returns each entry of its description to the list its latest receipt says it
  left when that is the project inbox or the abandoner's own personal inbox, and every other entry to the abandoner's
  personal inbox — never into a work unit's list — writing a receipt for each in one batch with the Errand's retirement,
  and returns nothing for an entry another open Errand holds; an open that fails after its start's batch landed rolls
  back through the same return.

    - `lib/errand/abandon-runtime.ts` composes 6.2.b's write set per entry, in place of today's clearing of the mark
      (`clearExecuteBound`, `abandon-locus.ts`): returned to the list it left, an entry takes the section its receipt
      records and keeps its `_Created:_`; set in a list it never held, it lands in `Errand`, `_Created:_` restamped and
      `_Cites:_` dropped; an entry minted when the Errand opened returns to its person's inbox.
    - One batch retires the Errand, empties its description, and writes the returned entries and their receipts. An
      abandon whose entry another open Errand holds, read through 6.4.a's helper, leaves the description with the
      abandoned Errand and names the Errand that keeps the entry. Its settlement's `disposition` reports `retained`, or
      `absent` where it returns nothing.
    - A partial-protection abandon keeps the entry in the inbox, its queue membership untouched.
    - An open that fails after its start's batch landed (Task 6.4.a) rolls back through this return: from the flip the
      open's rollback (`rollbackClaim`, `lib/errand/open-runtime.ts`), which Task 3.3.c reroutes, retires the record in
      the batch that returns the entry to the list it left, with its section, its `_Created:_`, and a receipt.

    - Build `test-first` (one behavior at a time), over the reference backend:
        - an entry from the project inbox returns there with its section and date
        - an entry from a work unit's inbound list lands in the abandoner's `Errand` section, restamped
        - an entry another open Errand holds is not returned, that Errand is named, and the disposition is `absent`
        - a replayed abandon returns nothing twice
        - each returned entry reads as unstarted work
        - a provisioning failure after a start's batch returns the entry to its list and retires the record in one batch

### `[ ]` **6.7 Remove entries by ID and version — § 7.7**

- _Goal:_ From the flip the drain's removal and the partial close remove an inbox entry by its `_Id:_` and version,
  removing only that version and reporting an entry edited since, idempotently; a full-protection close and promotion
  remove nothing; and the operands that name an entry take the ID form, refusing a title from any of today's sources.

    - From the flip `removeCurrentInboxEntry` (`commands/user/inbox-mutation.ts`), reached by the partial close and by
      `handleUserInboxRemove` (`handlers/user.ts`), which the drain calls, removes by ID at the entry's version, read
      with the inbox's kind. A full-protection close (`handlers/errand.ts`) removes nothing and reports `absent`, since
      the start moved the entry; promotion's skip is Task 3.9.b's.
    - From the flip `arc errand open --from-inbox` and `arc errand link --from-inbox` take `<personal|project>:<id>`,
      and `arc user inbox-remove` takes `--id <id> --expected-version <version>`; `resolveInboxEntryOperand`
      (`lib/inbox-entry-operand.ts`) refuses the `--from-inbox` title, `--inbox-title-file`, `--inbox-entry-file`, and
      `inbox-remove`'s title positional, naming the ID form and `arc inbox <list>`. `UserInboxRemoveInputSchema`
      (`handlers/user-inbox-remove-input.ts`) and the command-input registrations of the three verbs gain the new forms.
    - Under partial protection the origin entry stays in the inbox until the close removes that exact ID at its observed
      version, its settlement reporting `removed`, `retained` for an entry edited since, and from the flip `absent` for
      one already gone. A partial Errand opened before the flip binds its origin by title and digest, so its close from
      the flip resolves that binding once, by the digest it carries, to the entry's ID and version, and removes by them;
      no match reports as today's digest mismatch does.

    - Build `test-first` (one behavior at a time), over the reference backend:
        - a removal at the listed version removes the entry, and one edited since stays and is reported
        - a removal of an entry already gone reports and succeeds
        - each title operand refuses, naming the ID form
        - a partial-protection close removes its origin entry by ID at the observed version, and reports `absent` on a
          rerun
        - a full-protection close removes nothing and reports `absent`
        - a partial Errand bound by digest before the flip closes by the ID its digest resolves to

### `[ ]` **6.8 Listing and routing** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - Run the exit criterion's scenario over the reference backend and request `arc check segment`.

## **Phase 7:** Session continuity — handoff, identity setup, and commits not yet closed

_Purpose:_ Close the handoff-to-resume loop over the store: handoff writes its session context through a verb that
maintains the store, a person's records are created only where absent, and the next session lists the commits its close
would capture.

_Mode:_ `slice` — closes on a work unit handed off through `arc handoff write` and resumed with its commits not yet
closed listed beside the task cursor.

_Exit criterion:_ Over the reference backend and a scripted repository, `arc handoff write` writes the session context
with the anchors it computes and reports growth past its bounds; identity setup writes only absent records and warns on
an identity in use; session start and recovery list the commits not yet closed equal to the close's default set, with
the close as the action; and no ratchet floor exceeds its count at the merged base.

### `[ ]` **7.1 Report growth and contention past their bounds — § 9.3**

- _Goal:_ One report, under `lib/handoff/`, takes the store's `maintain()` measurements or a push's retry count and time
  waited and returns only the figures past their bounds, its text precomposed and naming the deferred capability each
  tripwire guards.

- _Note:_ The bounds are constants beside the report, with no configuration key; the growth bound's 2,000 commits
  matches the notes-compaction advisory (`COMPACTION_ADVISORY_HISTORY_THRESHOLD`,
  `lib/user-sync/compaction-retention.ts`) but is defined locally, since the deletion pass removes that module.

    - Growth: a never-retiring ref — the person's `personal` or `claims` ref, or the project's `project/inbox` or
      `project/registry` — past 2,000 commits or 50 MB on disk, naming scheduled ref rotation.
    - Contention: a push past one retry or 10 s waited, naming a service backend, per-record authorization, or very high
      write parallelism.
    - It takes the measurements as Task 3.3.a's port returns them, the ref backend's `MaintainResult` (`{ measurements:
      null }` or each ref's commits and bytes on disk), and a push's figures as its publish outcome carries them
      (`retryCount`, `waitedMs`); `arc sync`'s call over its push's figures is the cutover's rewire.

    - Build `test-first` (one behavior at a time), over scripted measurements and push outcomes:
        - a ref past either growth bound reports, naming ref rotation
        - a push past either contention bound reports, naming the capabilities it guards
        - figures at or below their bounds report nothing
        - `{ measurements: null }` and zero retries report nothing

### `[ ]` **7.2 Add `arc handoff write` — § 9.1**

- _Goal:_ From the flip `arc handoff write` takes only what the session decides — the `## Session Context` body,
  `Next Action`, and an optional `Session Type` — computes `State at Handoff` and `Commit at Handoff` itself, writes all
  five in one write of the current work unit's meta, then maintains the store and reports growth past its bounds,
  pushing nothing; each refusal's request passes once repaired.

    - `[ ]` **7.2.a The request and its schema**

        - `arc handoff write <file | ->` reads a versioned JSON request from the file or standard input carrying the
          body whole, `Next Action`, and an optional `Session Type`, an omitted one writing `[none]`; the request schema
          registers through `production-schema-registry.ts`, so `arc schema` serves it.
        - The command module and its handler sit under the `arc handoff` group Task 1.10 registers, its refusal before
          the flip being that task's.

        - Build `test-first` (one behavior at a time):
            - a request with and without `Session Type` parses, and one carrying either anchor refuses as unknown fields
            - `arc schema` serves the request's schema

    - `[ ]` **7.2.b The write and its anchors**

        - The verb resolves the current work unit through Task 2.3's resolver, reads the store's `version()` before its
          write and the checkout's `HEAD`, and writes the five fields through the meta's writers
          (`writeMetaStateAtHandoff`, `writeMetaCommitAtHandoff`, `writeMetaSessionType`, `writeMetaNextAction`,
          `lib/store/kinds/meta/bullet-writers.ts`; `writeMetaSessionContext`, `lib/store/kinds/meta/section-writer.ts`)
          in one write at the meta's version as read, carrying its current placement.
        - Its refusals, each before any write: a body line that would end the section — an H2 heading, or one trimming
          to `---` — naming that line, which the verb finds by the section writer's own rule, since
          `writeMetaSessionContext` throws without naming it; a `version()` that refuses, with the store refusal's own
          remedy; and a checkout holding no work unit, naming the work unit's checkout, since a handoff between work
          units writes no session context.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - the five fields land in one write, `State at Handoff` the version read before it and `Commit at Handoff`
              the checkout's `HEAD`
            - an omitted `Session Type` writes `[none]`
            - a body line that would end the section refuses, naming the line, and writes nothing; the request with the
              line rewritten writes
            - a refusing `version()` refuses and writes nothing; the request run again once it reads writes
            - a checkout holding no work unit refuses, naming the repair; the request run from the work unit's checkout
              writes

    - `[ ]` **7.2.c Maintenance after the write**

        - After its write the verb calls `maintain()` through Task 3.3.a's port and passes the measurements to Task
          7.1's report, returning the figures past their bounds in its result whether or not a sync follows; it never
          pushes, handoff's push staying `arc sync` under the sync interlock.
        - A refused handoff calls no `maintain()`, and a `maintain()` that fails after the write landed is reported as a
          diagnostic while the handoff succeeds.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - the verb calls `maintain()` once after its write, and returns the report's figures
            - a refused handoff calls no `maintain()`
            - a failing `maintain()` after the write returns success with a diagnostic
            - the default port's `{ measurements: null }` returns no figures

### `[ ]` **7.3 Create a person's first records only when absent, and warn on an identity in use — § 10.1, § 10.2**

- _Goal:_ From the flip `arc user add`, `arc init`, and `arc join` create an identity's personal inbox and
  `WORKING-MEMORY` through the store only where absent, never overwriting; and when the identity's records already
  exist, each says so and asks the person to confirm the identity is theirs, warning and never refusing on its own,
  while a person who answers that it is not theirs stops the run before it writes; until the flip setup runs as today.

    - `[ ]` **7.3.a Only where absent**

        - `runUserAdd` (`commands/user/add.ts`) and `runPostInitSetup` (`lib/setup.ts`, called from `commands/init.ts`
          and `commands/join.ts`) take an optional `store`, defaulting to `createStore` over the checkout bound to the
          identity being set up (Task 5.7.b), and from the flip write each of `CROSS_WU_INSTANCE_FILES`' records as a
          create with `expected: null` (`lib/store/write.ts`), reading a refusal because the record exists as present
          and skipping it; their unconditional seeding stays the in-repo arm.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - each verb creates both records where absent
            - an existing inbox or `WORKING-MEMORY` is left unchanged
            - the in-repo arm seeds as today

    - `[ ]` **7.3.b An identity already in use**

        - Each verb opens its store with its identity port bound to the identity being set up (Task 5.7.b), so the check
          reads that identity's records, and in `arc join` the pull fetches them, whether or not `arc.identity` is set
          or names another.
        - Each verb checks for the identity's records before it sets `arc.identity` or writes any record —
          `runPostInitSetup` sets the identity before it seeds today — and in `arc join` after join's pull (Task 5.7.b),
          since on a fresh clone the records appear only once it pulls.
        - Finding them, it says so and asks through a confirm prompt declared for each verb beside
          `joinIdentityPromptSite` (`prompts/identity-prompt-sites.ts`; compare `join-input.ts`), whose no-input answer
          proceeds and whose cancellation stops. A person who answers that the identity is not theirs stops the run
          before it writes, naming another identity: `--identity <name>` on `arc init` or `arc join`, another name to
          `arc user add`. A run that cannot ask reports the identity in use in its output — `arc user add`'s through its
          log (`handlers/user.ts`) — and continues.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - an identity with records prompts for confirmation, and setup proceeds on it
            - an answer that the identity is not theirs stops before `arc.identity` or any record is written, naming
              another identity, and the run with another identity proceeds
            - a run that cannot ask reports the identity in use and does not refuse
            - in `arc join` the records the pull brings in are found, with no `arc.identity` set before the run
            - `arc user add` of another identity checks and writes that identity's records, not the configured one's

### `[ ]` **7.4 List the commits not yet closed — § 11, § 4.3**

- _Goal:_ From the flip, while an Active work unit has open tasks, the derived frame's entering work-unit context
  carries the set the close's default capture takes, computed once by the same code, and session start and recovery list
  it beside the task cursor with the close as its action in the work unit's checkout — or, where the close would refuse,
  that condition with its repair in place of the set; until the flip nothing is listed.

    - `[ ]` **7.4.a The set in the entering work-unit context**

        - `readDerivedLocusFrame` (`lib/locus/derived-reader.ts`) computes the set once, for the entering checkout's
          `active` work-unit context after selection, never for every roster row (`readDerivedLocusRoster`), so another
          checkout's failure never turns its row unresolved.
        - It reads the work item's links from its store record and resolves which branch link the checkout has out
          through the transition-write-path change's one resolver (built in Task 2.3.c - `tasks-seam-lifecycle.md`):
          `linked` computes the set by that change's default-set computation (`computeDefaultCaptureSet`, its Task 2.3)
          with `refresh: false`, over the base refs the clone has, its copy keys from `lib/git/copy-key.ts` (its
          Task 2.2) and only for commits no stored SHA matches, against the work item's captures and the resolved link's
          exclusions, as the close takes them (`prepareTaskClose`, `lib/work-unit/verbs/task-close.ts`), never every
          link's (its Task 2.1).
        - `detached`, `unlinked`, `ambiguous`, and `no-link` each carry the close's own condition and repair as text,
          composed by the close's refusal (`unlinkedTaskRefusal`, `lib/work-unit/verbs/task-close.ts`), which this
          change exports for it, so the two never differ: the switch to the work branch, naming every project link; the
          repair of duplicate links; or `arc deactivate <slug>`, then `arc activate`. Where no base ref resolves, the
          context carries that condition with `git fetch origin +refs/heads/<base>:refs/remotes/origin/<base>`, typed,
          the listing composing its argv from the configured base (`branch.base`) where `origin` exists, since the
          computation's refusal carries its remedy as a string, or with no `origin` `git branch <base> <commit>` as
          text.
        - With no project ID from the port the context carries that condition, naming the port's failure as text, in
          place of the set (spec § 2.1).
        - A Planning work unit, and one with no open task, carry no set. `derivedLocusState`'s registered schema (Task
          1.1.b) admits the set and each condition.

        - Build `test-first` (one behavior at a time), integration tier, over the reference backend:
            - the set equals the close's default set over the same base refs on an adopted, a re-activated, and a
              promoted work unit's branch
            - a base merge adds nothing, and a rebased copy of a captured or excluded commit stays out by copy key
            - on a work unit linking two branches, the set takes the checked-out link's exclusions alone, as the close
              does
            - a detached checkout, an unlinked branch, a branch two of the project's links name, and a work unit linking
              no branch each report the close's condition and repair in place of the set
            - no project ID reports the port's failure in place of the set
            - no base ref reports the condition with its repair, in each form
            - the set is computed for the entering checkout alone
            - over the in-repo implementation nothing is listed
            - with no project-ID port injected, the set is computed, the project ID read from the project's identity
              record

    - `[ ]` **7.4.b The action**

        - The action runs in the work unit's checkout: `arc task close`, typed, only where every listed commit's
          committer and author times were read from its header and are equal, and it carries a copy key; otherwise text
          naming the bare close where the open task's work is among them and `arc task close <id>` where it is not.
        - On a paused work unit the action is `arc resume <slug>`, its text naming `arc task close` to follow, as Task
          5.3.c gives `currentWuReconcile`.

        - Build `test-first` (one behavior at a time), integration tier, over the reference backend:
            - every commit made fresh yields the typed bare close in the work unit's checkout
            - a commit whose header times went unread, or with no copy key, yields the text, never the typed close
            - an amended commit, made by a raw `git commit --amend` since the release wrapper refuses an amend from the
              flip, yields the text naming both repairs, with the checkout
            - a paused work unit yields `arc resume <slug>`

    - `[ ]` **7.4.c Recovery beside a matching cursor**

        - A compaction between a commit and its close leaves the cursor's task open with its commit landed, which the
          recovery audit (`lib/recover/audit.ts`) already reads as ready, the advanced `HEAD` explained drift
          (`auditTaskCursor`); the audit adds the set from the same work-unit context beside the matching cursor, with
          the same action, and the verdict's schema (`RecoveryAuditVerdictSchema`, `lib/recover/audit.ts`) admits it
          beside its `taskCursor`.

        - Build `test-first` (one behavior at a time), integration tier, over the reference backend:
            - a compaction between a commit and its close lists the commit beside the matching cursor with the close
            - a mismatched cursor still stops as today

### `[ ]` **7.5 Hold the ratchet floors to the arms kept until the deletion pass — § 1.5**

- _Goal:_ No `arc/store-raw-state`, `arc/surface-names`, or `arc/work-unit-paths` count in `eslint-suppressions.json`
  exceeds its count at the merged base, in total or per file, and every entry left in the parts of § 1.2's files this
  change reroutes sits in an arm § 1.5 names.

    - After merging base, run `npm run -s lint:ts`, then prune with `--prune-suppressions` and commit the shrunk record;
      add no suppression for a new violation.
    - Compare the three rules' counts per file and in total with the merged base's, and list each entry left in a
      rerouted file beside the § 1.5 arm that holds it; an entry no arm holds is rerouted here, in this task, since the
      task that owns its file has closed.

### `[ ]` **7.R Verify dormant destructive paths and retain their flip checks — Testing (A17)**

- _Goal:_ A17's success and continuation scenarios run through CLI-generated handler inputs in real Git repositories,
  before-flip refusals run through the built CLI, and successful real-CLI destructive paths remain required at the flip.

    - Inventory the destructive paths added or rerouted here and their success, refusal, and repaired-continuation
      evidence. Complete missing handler integration or real-CLI refusal scenarios before recording the inventory.
    - Record the successful real-CLI scenarios required at the flip as outstanding release checks, with their concrete
      outcomes, and never count handler integration as successful built-CLI evidence.
    - Keep the reference backend's behavior coverage and all independently required gates; introduce no production
      backend selector or test-only capability bypass.

### `[ ]` **7.6 Session continuity** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - Run the exit criterion's scenario over the reference backend and a scripted repository, and request
      `arc check segment`.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Every locus, session-init, and personal-surface test passes over the in-repo implementation, unchanged but for
  those a § 1.4 item changes, each named with its item, and the session-init envelope and the locus verbs' results on
  the fixture repositories are unchanged but for § 1.4's items.

- `[ ]` Each § 1.4 item has its test: the rebuilt slots' actions and schemas, the orphan sweep's `git branch -D`, and
  `pausedWork` and `inboundBackPressure` reporting nothing; the removal prompts' `arc teardown` argv, each
  registration's folder presence, and the sweep's `missingFolders`; the doubled-force move; each removal outcome the
  callers take, branch-gone recovery's `missingFolders` among them, over a scripted Git; the compaction seed's schema
  version; the six verbs' `unsupported` refusals; the anchored marker's and the origin binding's dormant admissions; and
  the three settings declared.

- `[ ]` At landing no `arc/store-raw-state`, `arc/surface-names`, or `arc/work-unit-paths` count in
  `eslint-suppressions.json` exceeds its count at the final merged base, in total or per file; every entry left in the
  rerouted parts of § 1.2's files sits in an arm § 1.5 names; and `npm run -s lint:ts` passes with no suppression added
  for a new violation.

- `[ ]` Every slot § 4.2 names registers its schema, `arc schema` serves each, and each carries the action § 4.3's table
  gives it, with its checkout where § 4.3 requires one.

- `[ ]` Each arm from the flip passes over the reference backend: every behavior § 2–§ 12 states from the flip has its
  test, among them locus from the marker and the store, two markers unresolved, an incomplete observation granting
  nothing, the exclusivity check in each verb this change runs it in, an anchored checkout kept and read as `external`,
  the in-flight set with a paused work unit in it, the overlap check's state and entry-list targets, and § 3.7's cases;
  the session-notes path and the scratch reconcile, a promoted work item's folder among its cases; the paused-work
  slot's resumable and review-due marks and entering a paused checkout; the materialize offer's set and its `--here`
  arm; the notes policies having no effect; session start's pull and its designation line; the close's capture, the
  Errand's branch link, and promotion's branch and marker; `arc handoff write`'s write with the anchors it computes and
  each case of § 9.2; identity setup writing only absent records and warning on one in use; the cold start writing its
  records only through the store and, in its checkout, only the marker and the editor documents, with their entries in
  the clone's exclude file and `HEAD` unmoved; Errands and claims acquired apart, an Errand's terminal and merge
  admission taking both complete; former slugs resolved through `lookup`; the queue's offer and a start's refusals;
  removal by ID and version, and `--from-inbox` taking the inbox; an adopted branch never offered `arc teardown`;
  `retiredSubdirs` resolving `skip`; `arc user open` refusing; and a paused work unit's slot actions taking
  `arc resume`. The tripwire report passes over scripted measurements and push outcomes, showing each figure past its
  bound and none below.

- `[ ]` `arc inbox`, `arc route`, `arc locus release`, `arc errand queue`, `arc errand queue set`, and
  `arc handoff write` pass on their success paths and on each refusal they name, a recoverable refusal also on its
  continuation once repaired, and each refuses `unsupported` before the flip, naming what serves until then.

- `[ ]` The entry grammar holds: each kind parses and writes the fields § 6.3 admits; the entry-field module reads every
  spelling and writes the managed form; each ID placement in § 6.4 has its test; and a wrapped or colon-less
  `WORKING-MEMORY` header above its trigger refuses.

- `[ ]` Routing holds: a move writes the insert, the removal, and the receipts in one batch; an entry changed since it
  was listed refuses and stays, and an edit racing the write survives, as a survivor where it left an inbox; an ID the
  destination holds is reported or refused as § 7.2 states; a survivor lists with its home and is carried in both forms,
  a crash leaving the survivor or its carry and never both; each abandon return in § 7.5 lands where it states; and the
  latest receipt is decided across the two refs by time.

- `[ ]` The commits not yet closed equal the close's default set over the same base refs on an adopted, a re-activated,
  and a promoted work unit's branch, a rebased copy of a captured or excluded commit matching by its copy key; where no
  base ref resolves, the condition is reported with the close's repair in place of the listing; the action is the bare
  close only where every listed commit is one Git made fresh; a paused work unit takes `arc resume <slug>`; and recovery
  lists them beside a matching cursor.

- `[ ]` Inbound back-pressure trips on each threshold, and below both the slot reports its figures with no action.

- `[ ]` The quality gates pass at every gate the project declares

- `[ ]` From the flip, a production verb's executor context given no ports carries this change's exclusivity check,
  lookup, and anchored-marker writer, its rebind on another checkout (`withCwd`) the same record, and store start's
  create-new and the cold start reach them through it; over the in-repo implementation the context carries none, and
  lifecycle's callers keep today's defaults (A1).

- `[ ]` From the flip, each reader and writer of links this change adds, given no project-ID port, reads the project's
  identity record over its store, and treats a failed read of that record as an incomplete observation (§ 2.1, A2).

- `[ ]` From the flip, `arc start <name> --here --new` refuses before any write every name `arc start <name> --new`
  refuses — a held work unit's, a former slug, or an Errand's — and refuses `--class`, as the in-repo arm does (A3).

- `[ ]` From the flip, graduation in place and `arc materialize --here` in a checkout whose marker names anything but
  their work unit refuse before any Git step, `HEAD` unmoved and nothing written, naming that marker's exit (A4).

- `[ ]` From the flip promotion runs in the checkout today's terminal authorization selects for the Errand it reads —
  the current checkout, or the Errand's other checkout after confirmation — refusing as today before any write, and
  refusing a checkout off the Errand's branch; a rerun after its write completes in the checkout whose marker names that
  Errand or its work unit (A7).

- `[ ]` From the flip `arc status <slug>` reports the work unit's worktree path from the marker roster, or the lookup's
  condition in its place, its in-flight warnings from the set listed through the store, and with `--fetch` the
  reachability the store's pull reports, its operational boundary staying the delivery change's (A10).

- `[ ]` From the flip the stale-worktree sweep gives a registration whose folder is missing and whose ended work unit
  adopted its branch `git worktree remove <path>` as text, with `git worktree unlock <path>` first where it is locked,
  never `arc teardown` (A11).

- `[ ]` From the flip, where the store-backed prepare returns a refusal, `currentWuReconcile` reports its condition with
  its remedy as the slot's action, and the probe does not fail (A12).

- `[ ]` From the flip a renamed work unit's scratch folder follows its current slug only where the folder there is
  absent or empty; where it holds anything, neither moves, and both are reported with their paths as text (A13).

- `[ ]` From the flip a review-due `pausedWork` item carries `arc resume <slug>`, `arc pause <slug> --open` where the
  pause is not open, and `arc abandon <slug> --yes` as typed actions, and `arc handover <slug> --to <identity>` as text
  (A14).

- `[ ]` From the flip one exported function, given a single paused work item, the store, and `pause.review_after_days`,
  returns its marks and, for a review-due item, its review prompt and choices, whoever owns the item, and `pausedWork`
  maps it over the person's listing (A15).

- `[ ]` Ready for integration

- `[ ]` Off-branch primary records expose former-name aliases at the selected state, including explicit empty arrays;
  managed references rewrite through lookup and prose yields a rename advisory; missing aliases or incomplete
  listings report unavailable authority without rewriting (A16).

- `[ ]` Dormant destructive paths pass success and repaired continuation through CLI-generated handler inputs with
  real Git, and before-flip refusal through the built CLI in temporary repositories; successful real-CLI destructive
  scenarios remain a required release check at the flip (A17).
