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

### `[x]` **2.8 Resolve the session notes through one resolver, and reconcile scratch — § 2.8**

- _Goal:_ From the flip every reader of the session-notes path reads one resolver, which gives the meta's projected
  path; the load set takes its meta and task-list paths from the layout resolver; `arc user open` refuses naming the
  session context; and the user-reference reconcile plans and applies the person's scratch folders through `lookup`.

    - `[x]` **2.8.a One session-notes resolver**

        - Session-note consumers share the Store-aware meta projection; load sets omit a separate notes entry when state
          is off branch, while legacy workspaces retain their paths.

    - `[x]` **2.8.b The load set's meta and task-list paths**

        - Load-set meta and task-list entries follow logical identity and placement. Legacy task-list pointers remain
          authoritative before the flip.

    - `[x]` **2.8.c `arc user open` from the flip**

        - User open refuses off-branch workspace creation with the meta session-context and handoff-write remedy;
          the registered CLI preserves both Store state and the absent legacy workspace.

    - `[x]` **2.8.d The scratch reconcile**

        - Scratch plans resolve aliases and promoted identities in the entering checkout. Apply moves only into absent
          or empty destinations and leaves occupied, ended, and unresolved folders for their person to
          reconcile.

### `[x]` **2.9 Add `arc locus release` — § 5**

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

    - `[x]` **2.9.c The sweep's release rows**

        - The sweep preserves foreign-owner and absent-record release rows with typed commands, excluding the entering
          checkout from automatic offers.

### `[x]` **2.R Refuse an occupied checkout in lifecycle's in-place arms — § 2.6**

- _Goal:_ From the flip graduation in place and `arc materialize --here` refuse a checkout whose marker names anything
  but the work unit they claim, before any Git step and naming that marker's exit, and report a marker that appears
  before the anchored marker's write naming the checkout (A4); until the flip the guard reads as today.

- _Outcome:_ The shared occupancy guard refuses transient, husk, ended, backlog, and no-record claims before in-place
  Git work; marker creation races retain the checkout-specific inspect-and-rerun repair.

### `[x]` **2.R2 Complete the locus consumer inventory — § 1.2 (A23)**

- _Goal:_ The exact incoming-module inventory includes the Store evidence, session, overlap, and cleanup consumers
  required by the reroute, while retaining the dynamic-import and legacy-authority boundary checks.

- _Outcome:_ The exact lists include fourteen added production and six added test importers. Both independent boundary
  assertions remain intact; the full source scan retains every existing importer.

### `[x]` **2.10 Locus from the marker and the store** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

- _Outcome:_ On the freshly merged base, cold start writes its Store primary and anchored marker without moving HEAD;
  detached Planning rows derive from Store evidence; duplicate holders refuse; release clears anchored markers or
  removes spawned checkouts; and lifecycle operations consume the bound ports. A23's complete consumer inventory also
  passes on the full scenario rerun.

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

### `[x]` **3.1 Derive the in-flight set from placement — § 3.1, § 3.6**

- _Goal:_ From the flip in-flight derivation lists work units and open Errands through the store at placement active,
  and the identity's claims that name a branch, and reads each work item's lifecycle facts there — a remote branch
  outliving its work item reading as a locus hint, never lifecycle authority; an entry's branch absent where its work
  item links none; a paused work unit in flight — and the oracle lists that set with no remote gate; until the flip
  every caller reads branch refs as today.

    - `[x]` **3.1.a The set from the store**

        - Placement-backed derivation retains branchless and paused work, qualified links, claims, and independent
          inventory diagnostics.

    - `[x]` **3.1.b The set's callers**

        - Public callers and the cached session oracle consume placement-backed entries without a code-remote gate,
          retaining legacy acquisition in the in-repo arm.

    - `[x]` **3.1.c `arc status <slug>`'s locus reads**

        - Store lifecycle status now includes the holding checkout and independent in-flight warnings while retaining
          lifecycle fields and the deferred integration-boundary slot. Rejected holder observations remain visible.

### `[x]` **3.2 Acquire Errands and claims apart — § 3.2**

- _Goal:_ From the flip the derived frame's identity discovery carries Errands, listed through the store at project
  scope, and claims, identity-scoped, as two acquisitions, each pinned at its own version with the same three outcomes —
  absent, a root-level error, or a complete snapshot with its own diagnostics — and the readers that admit an Errand's
  terminal or merge require both complete; until the flip one transient-identity snapshot serves both.

    - _Amended in:_ 3.R2 (A20)

- _Outcome:_ Errands and claims retain independent pinned acquisition outcomes. Terminal and merge admission resolve the
  exact Errand claim and preserve diagnostics without borrowing another inventory's completeness.

### `[x]` **3.R2 Admit authoritative claim absence at Errand terminal and merge gates — § 3.2 (A20)**

- _Goal:_ An authoritative absent claims acquisition admits as an empty inventory beside a complete Errands acquisition
  and the exact subject lookup; failed claims reads and complete claims with diagnostics still refuse (A20).

- _Outcome:_ Terminal and merge admission treat authoritative claim absence as empty while retaining exact Errand lookup
  and refusing failed or diagnostic claims evidence.

### `[x]` **3.3 Reroute the Errand runtimes through the store — § 8**

- _Goal:_ From the flip the open, close, abandon, leave, and link runtimes and `arc errand materialize`'s read of the
  Errand it materializes read and write the Errand record and claims through the store — pulling first when online,
  computing each transition with today's transforms over the record read, writing at that version with the transition's
  companion writes in one batch, and keeping a closed or abandoned record at `completed` — while until the flip each
  keeps calling the identity transaction itself.

    - `[x]` **3.3.a The sync port**

        - The optional sync port preserves pull outcomes, named history refs, and measured maintenance; explicit
          identity binds the selected person before configured identity.

    - `[x]` **3.3.b The write step from the flip**

        - Errand transitions read the exact active generation and batch its expected-version record with companions;
          retirement retains the completed generation and stale writes only recognize an equal landed result.

    - `[x]` **3.3.c Open and link**

        - Open and link select Store transactions on the capability, write owners and branch links, and retain the
          identity transaction before the flip.

    - `[x]` **3.3.d Close, abandon, and leave**

        - Close, abandon, and leave use guarded Store transitions and retain existing remote reconciliation before the
          flip; retirement preserves completed records.

    - `[x]` **3.3.e `arc errand materialize`'s read**

        - Materialization reads only the owned active generation through the selected Store, preserving legacy remote
          reconciliation.

### `[x]` **3.4 Capture the Errand close's landing commit and close time — § 8.1**

- _Goal:_ From the flip the close captures the Errand's landing commit on its record, naming its repository by the
  project ID, and stamps the record's `updatedAt` as the close time; until the flip it captures nothing and deletes the
  record as today.

- _Outcome:_ Close captures the host's landing commit and close time, with a local copy key where available and no
  landing link for unchanged-base authorization.

### `[x]` **3.5 Link the Errand's branch at open — § 8.2**

- _Goal:_ From the flip a full-protection `arc errand open`, cutting `chore/<slug>` in place or in a spawned worktree,
  writes the Errand's branch link recorded `created` with no exclusions, and under partial protection cuts no branch and
  writes no link; until the flip no link is stored.

- _Outcome:_ Full-protection opens batch a created branch link with no exclusions; partial opens write neither a branch
  nor a link.

### `[x]` **3.6 Check overlap for a state target, excluding the caller by identity — § 3.3**

- _Goal:_ From the flip `arc errand check` classifies its targets through one inverse of the layout resolver — a code
  target keeping both probes, a state target reporting overlap when its record's own work item is in flight in another
  locus, an entry-list target reporting none — counts a paused work unit through both probes, excludes its caller by its
  own identity from the marker, and keeps Errands as candidates; it stays advisory, and the pre-commit foreign-write
  hook returns before any read.

    - `[x]` **3.6.a The target classifier**

        - File-address inversion and exhaustive Store-kind mapping distinguish code, state, and entry-list targets.

    - `[x]` **3.6.b The check from the flip**

        - Store overlap reports work-item identities, retains paused and branchless candidates, and excludes the current
          marker identity while preserving the bracketed Git probes for code.

    - `[x]` **3.6.c The pre-commit foreign-write hook**

        - The foreign-write hook returns before acquisition when operational state lives off the branch.

### `[x]` **3.7 Read shipped work through placement and `lookup` — § 3.4, § 2.1**

- _Goal:_ From the flip the stale-worktree and orphan-branch sweeps, the derived locus evidence, and the Candidate
  mutation owner's completed set read shipped work through placement and `lookup`, none keying on an archive folder's
  number, while retired-subdirectory detection reads none; the stale-worktree sweep selects each marked row by its work
  unit's placement, a branchless one included, and the residue sweep takes an abandonment from its lineage record;
  until the flip each keeps today's read.

    - `[x]` **3.7.a The archive-index readers**

        - Completed placement now serves the derived evidence and cleanup readers; the Candidate owner lists the same
          Store authority. The in-repo readers retain their exact-ref guards.

    - `[x]` **3.7.b The stale-worktree sweep's selection from the flip**

        - Marker-selected cleanup retains detached work and qualified folderless registrations, preserves removal gates,
          and gives branched abandonment exclusively to the residue sweep.

    - `[x]` **3.7.c The residue sweep's abandonment from the flip**

        - The residue sweep selects abandonment through lineage and retains exact remote and physical-removal evidence.
          Refused authority is reported as a per-checkout repair.

### `[x]` **3.R Expose former names in primary record projections — § 3.5 (A16)**

- _Goal:_ A16's read-only aliases are available to the prose scan through primary reads and listings, with absent
  off-branch alias evidence reported as unavailable authority rather than an empty collection.

- _Outcome:_ Primary reads and listings expose detached alias collections, including saved states. Missing alias evidence
  remains unavailable authority rather than an empty collection.

### `[x]` **3.8 Resolve former slugs through `lookup` in the user-reference reconcile — § 3.5**

- _Goal:_ From the flip the user-reference reconcile resolves a former slug from the live primary record through
  `lookup`, takes its prose scan's former slugs from the work items' aliases and lineage, lists lineage only for a cut
  or an abandonment, and gives a cut's advisory its successors, keeping its unavailable authority and per-entry conflict
  advisories; until the flip it reads today's transition records and the dispositions projected from them.

- _Outcome:_ Former names resolve through Store lookup and terminal lineage, with successor advisories for cuts; the
  prose scan uses complete alias evidence and leaves advisory prose unchanged.

### `[x]` **3.9 Select promotion's steps, and settle its marker — § 8.3, § 2.6**

- _Goal:_ From the flip `promoteOrdinaryErrandAtRuntime` selects the transition-write-path change's promotion steps on
  the capability, which read the Errand through the store, runs the exclusivity check before `promoteOrdinaryErrand` so
  a refusal leaves nothing written, settles the checkout — converting a spawned checkout's transient marker as today,
  and on the primary replacing the transient marker's generation with an anchored work-unit marker in one write — and
  skips its inbox settlement step; until the flip it keeps today's steps, settlement, and commit.

    - `[x]` **3.9.a The step selection and the check**

        - Promotion selects Store-backed steps and checks exclusivity before writes, resolving the actual authorized
          checkout and project identity for fresh and recovered promotion.

    - `[x]` **3.9.b The settlement**

        - Promotion settles the exact marker generation, replacing primary transient occupancy atomically and preserving
          spawned occupancy; Store promotion performs no title-based inbox settlement.

### `[x]` **3.10 What is in flight** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

- _Outcome:_ The reference-backend scenarios list active work units and open Errands, including paused and branchless
  Planning work; versioned runtimes retain completed records and promotion identity. State overlap reports the foreign
  work item while entry lists report none; former names resolve through lookup. Independent terminal and merge
  acquisitions admit authoritative claim absence and retain failed-read repairs. The in-repo scenarios retain their
  existing behavior on the freshly merged base.

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

### `[x]` **5.1 Bind session-init's probes once, through the contract — § 4.1**

- _Goal:_ `handleSessionInitStatus` keeps composing every slot, with each probe reading through the contract, its slot
  paths and load-set entries from the layout resolver, a work unit's through Task 1.9's function, and its outcome the
  plain `{ ok, … }` object with today's failure isolation; from the flip `currentWuReconcile`'s reads are bound once and
  the user-reference reconcile applies as one prepared write.

    - `[x]` **5.1.a The binding**

        - The invocation shares one Store, project identity, and derived frame across probes. Reconcile slots use that
          frame’s subject and preserve independent failure outcomes.

    - `[x]` **5.1.b `currentWuReconcile` bound once**

        - Current-work-unit preparation uses lifecycle’s Store context and reports refused or incomplete evidence with
          its repair, without reading pause during preparation.

    - `[x]` **5.1.c The user-reference reconcile as one prepared write**

        - _Amended in:_ 5.R (A21)
        - Reference preparation acquires the managed inbox and supporting records once; apply revalidates that basis
          through the shared lifecycle protocol and batches only the managed rewrites.

### `[x]` **5.2 Reroute the locus classification, the orphan sweep, and retired subdirectories — § 4.2, § 12.4**

- _Goal:_ From the flip session-init's locus classification matches a branch to its work unit through the branch link,
  the orphan-branch sweep admits a branch the store links whatever its name and never offers an adopted one teardown,
  and `retiredSubdirs` resolves `skip`.

    - `[x]` **5.2.a The locus classification**

        - Branch ownership follows the repository-qualified link, including its project identity lookup, rather than a
          slug parsed from the branch name.

    - `[x]` **5.2.b The orphan-branch sweep from the flip**

        - The orphan sweep uses linked work-item identities, excludes active Errands and claims, and reports adopted
          branches as their owners’ branches without teardown.

    - `[x]` **5.2.c Retired subdirectories**

        - Retired-workspace discovery returns skip before acquisition when state lives off the branch.

### `[x]` **5.3 Reroute the work-unit, Errand, and inbox slots — § 4.2, § 4.3**

- _Goal:_ `workUnitState`, `errandState`, and `inboxState` with its reminder and staleness reads read through the
  contract, with their actions; and from the flip a slot whose action would advance a paused work unit's work takes
  `arc resume <slug>` in its place, its text naming the command to run once resumed.

    - `[x]` **5.3.a The work-unit and Errand slots**

        - Work-unit and Errand slots use the captured roster and Store acquisitions; resume and materialization consider
          only this identity’s active Errands.

    - `[x]` **5.3.b The inbox slots**

        - Inbox counts and reminder inputs use parsed personal records, with queued entries counted separately from
          routable captures.

    - `[x]` **5.3.c A paused work unit's actions**

        - A paused context substitutes the resume action and names the later apply, preserving the existing
          recommendation fields.

### `[x]` **5.4 Report paused work, and enter a paused checkout — § 4.4**

- _Goal:_ From the flip `pausedWork` lists the person's paused work units, each with its reason and what it waits on,
  marked resumable once the work unit it waits on ships and review-due at once if that work unit ends otherwise, or once
  a pause waiting on no work unit passes `pause.review_after_days`; each item carries its resume or materialize action;
  and entering a paused checkout renders the pause before any work starts.

    - `[x]` **5.4.a The slot**

        - One exported marking function resolves renamed wait targets, ownership, review age, and checkout location,
          supplying the slot’s typed choices and text handover.

    - `[x]` **5.4.b Entering a paused checkout**

        - Entering guidance retains the pause, reason, and resume notes before task orientation.

### `[x]` **5.5 Widen the materialize offer — § 4.5, § 2.7**

- _Goal:_ From the flip the offer lists the in-flight work units this identity owns that no checkout here holds —
  remote-only or released, with no remote needed, paused ones left to `pausedWork` — and offers
  `arc materialize <slug> --here`, with its checkout, for a work unit whose branch a markerless checkout has out, its
  folder present.

- _Outcome:_ Materialization offers include released and branchless work without remote evidence, omit held or paused
  work, and preserve per-item lookup failures and in-place destinations.

### `[x]` **5.6 Report inbound back-pressure — § 4.6**

- _Goal:_ One per-work-unit computation, built with the inbound kind, reports the pending inbound count and the oldest
  entry's age from its `_Created:_` against `inbound.retriage_after_entries` and `inbound.retriage_after_days` (Task
  1.11), and from the flip `inboundBackPressure` carries the current work unit's figures, past either threshold
  recommending its owner's re-triage, naming `arc inbox <slug>` in its text.

- _Outcome:_ The inbound computation serves both listing and the slot, reporting count and oldest age against the
  configured bounds and naming retriage where exceeded.

### `[x]` **5.7 Retire session-init's notes policies at the flip, and pull at session start — § 4.7, § 4.8**

- _Goal:_ From the flip `user.notes_push`, `session.init_pull.notes`, and `session.init_load.notes` have no effect on
  session-init and its notes recommendations go with them, while `session.remote_sync`, the worktree and base
  recommendations, and each slot's failure isolation stay; and under `session.remote_sync` session start calls the
  store's `pull` in the `user` probe, carrying a `designation-needed` state in the `user` slot with its remedy argv.

    - `[x]` **5.7.a The notes policies**

        - Notes policies and their combined prompts are dormant for off-branch state while worktree and base
          recommendations retain their settings.

    - `[x]` **5.7.b The pull and its designation**

        - The user slot carries Store pull outcomes and typed designation remedies; join binds and pulls the selected
          identity before setup without making a noninteractive choice.

### `[x]` **5.8 Reroute handoff's and recovery's probes, and restate across clones — § 4.1, § 4.9, § 9.2**

- _Goal:_ Handoff's and recovery's probes read through the contract, and from the flip restating and the recovery audit
  read state as of a state version, or through `changes` from one, beside the retained code-head baseline — pulling a
  missing history ref by name and retrying once, restricting `changes` to project scope from another person's anchor,
  rebuilding a seed whose state version no longer resolves, and taking the baseline-unknown path where no
  `State at Handoff` exists.

    - `[x]` **5.8.a Handoff's and recovery's probes**

        - Handoff and recovery consume Store records; recovery reads the seed’s task list at its state anchor and
          current evidence at the fresh version.

    - `[x]` **5.8.b State continuity**

        - Restating uses meta anchors and scoped changes, retries named missing-history refs once, and rebuilds
          unresolved seed state while retaining code-head and locus checks.

### `[x]` **5.9 Move this change's callers off the user-surfaces resolver — § 10.3**

- _Goal:_ This change's callers of the user-surfaces resolver read the person's records through the store, with nothing
  observable changing over the in-repo implementation, which keeps the resolver and its migration as its own arm.

- _Outcome:_ Personal callers use selected Store records and layout-derived addresses across both backends; the notes-
  sync and migration machinery retain their existing boundaries.

### `[x]` **5.10 Keep a missing or ambiguous completed subject fail-closed — § 3.7**

- _Goal:_ Over the store, the reader, session-init, and recovery derive each completed work unit's frame as Task 2.1.c
  gives it, and keep an arbitrary missing or ambiguous completed subject fail-closed — the frame `subject-unresolved`
  (`lib/locus/subject-meta.ts`), granting no cleanup authority, session-init reporting it, and the recovery audit
  stopping — whether or not the archived-but-not-torn-down interval remains.

- _Outcome:_ Reader, registered session CLI, and recovery agree across both archive cadences, preserving completed-
  subject diagnostics and withholding cleanup authority from missing or ambiguous evidence.

### `[x]` **5.R Keep personal prose advisory in the prepared reconcile — § 4.1 (A21)**

- _Goal:_ Managed inbox reference rewrites land in one prepared batch after revalidating every supporting record;
  working-memory and meta session-context prose yield advisories and remain unchanged (A21).

- _Outcome:_ Managed inbox fields update atomically after revalidation while memory and meta session-context bytes remain
  unchanged; their prose references appear only as advisories.

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

### `[x]` **6.1 Add `arc inbox` — § 7.1**

- _Goal:_ From the flip `arc inbox <personal|project|slug>` lists every list the routing verb takes from — an inbox, a
  work unit's inbound list, or an Errand's description — each row carrying the entry's `_Id:_` and version, a work
  unit's inbound list its pending count and oldest age, and `--target <slug>` filtering the personal inbox while keeping
  today's `clear`, `named`, and `refused` result; and `arc user inbox-list` refuses from the flip, naming it.

- _Outcome:_ Registered inbox listing exposes stable IDs and versions, filtering and pending figures through the
  production entry kinds; the retired listing command reports its replacement.

### `[x]` **6.2 Add `arc route`, with its receipts — § 7.2, § 7.3, § 7.8, § 15.1**

- _Goal:_ From the flip `arc route` moves an existing entry at the version its caller read, or inserts a new one from
  standard input, through one mover writing the destination's insert, the source's removal, and the routing receipts in
  one batch and reporting the entry's ID and destination; an edit racing the move survives through the entry merge; and
  each refusal § 7.2 states names § 13's repair.

    - `[x]` **6.2.a The move and the insert**

        - Route accepts one existing versioned entry or one stdin entry and reports its immutable ID and destination.

    - `[x]` **6.2.b The mover's write set**

        - The shared mover prepares source removal and destination insertion for the caller’s single expected-version
          batch.

    - `[x]` **6.2.c The receipts**

        - Receipts persist with each move, retaining source, destination, and entry identity across merge races.

    - `[x]` **6.2.d Who writes, IDs already held, and refused destinations**

        - Admission enforces destination lifecycle, owner, held-ID, and conflict rules with actionable refusals.

### `[x]` **6.3 List survivors with their homes, and carry them — § 7.4, § 4.3**

- _Goal:_ From the flip an inbox row whose latest receipt moved it out of that inbox lists as a survivor carrying the
  home that receipt names, derived and never stored, unless that home now takes nothing; `inboxState` reports the
  person's survivors; and the drain carries a survivor home through `arc route`'s move form, never leaving both the
  survivor and its carry.

    - `[x]` **6.3.a The listing and the slot**

        - Listings derive survivors from receipts, and the inbox slot carries their complete typed homes through the
          shared session binding.

    - `[x]` **6.3.b The carry**

        - Survivor carry uses the latest receipt’s live home and the same mover, leaving no second carry beside its
          source.

### `[x]` **6.4 Start an Errand by moving its entry — § 7.6**

- _Goal:_ From the flip a full-protection Errand started from an inbox entry is a routing whose destination is the new
  Errand — one batch creating the work item, making the entry its description, removing the entry at the version read,
  dropping it from the person's queue, and writing the receipt, the Errand's origin holding the entry's qualified ID —
  an Errand opened from text mints its description's entry in that batch, and `arc errand link --from-inbox` moves a
  capture into an Errand opened from text the same way; until the flip an Errand starts only from its person's own inbox
  and the entry stays there until close.

    - `[x]` **6.4.a The start's batch and its refusals**

        - Full opens compose primary creation, description adoption, inbox removal, queue removal, and receipt writes;
          rollback uses the same entry-return mechanism.

    - `[x]` **6.4.b The origin a start writes**

        - Store origins carry qualified immutable entry IDs; text starts mint a description entry without changing the
          legacy origin arm.

    - `[x]` **6.4.c The link**

        - Linking an inbox capture to a text-origin Errand composes the same versioned move and preserves post-images.

### `[x]` **6.5 Keep each person's Errand queue — § 7.6, § 6.3**

- _Goal:_ From the flip each person's Errand queue is an ordered list of references to entries in either inbox, by ID
  and inbox, at identity scope and never projected — set whole by `arc errand queue set`, shown by `arc errand queue` —
  and the next offer takes the queue's first member a start would accept, writing nothing and reporting each member it
  leaves out or skips; `arc user inbox-mark-execute-bound` refuses from the flip, naming `arc errand queue set`.

- _Outcome:_ Queue commands store ordered qualified references and offer the first admissible entry with skip reasons.
  Execute-bound marking reports the replacement command.

### `[x]` **6.6 Return an abandoned Errand's entries — § 7.5, § 15.1**

- _Goal:_ From the flip an Errand's abandon returns each entry of its description to the list its latest receipt says it
  left when that is the project inbox or the abandoner's own personal inbox, and every other entry to the abandoner's
  personal inbox — never into a work unit's list — writing a receipt for each in one batch with the Errand's retirement,
  and returns nothing for an entry another open Errand holds; an open that fails after its start's batch landed rolls
  back through the same return.

- _Outcome:_ Abandon and failed-open rollback return description entries to receipt-selected inboxes in the terminal
  batch; a completed generation’s repaired retry creates a fresh description.

### `[x]` **6.7 Remove entries by ID and version — § 7.7**

- _Goal:_ From the flip the drain's removal and the partial close remove an inbox entry by its `_Id:_` and version,
  removing only that version and reporting an entry edited since, idempotently; a full-protection close and promotion
  remove nothing; and the operands that name an entry take the ID form, refusing a title from any of today's sources.

- _Outcome:_ ID/version removal is idempotent and preserves edited entries; partial close uses it while full close and
  promotion leave adopted captures in their Store homes.

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

### `[x]` **7.1 Report growth and contention past their bounds — § 9.3**

- _Goal:_ One report, under `lib/handoff/`, takes the store's `maintain()` measurements or a push's retry count and time
  waited and returns only the figures past their bounds, its text precomposed and naming the deferred capability each
  tripwire guards.

- _Outcome:_ The shared report selects never-retiring ref families and reports only growth or contention figures above
  their fixed bounds, with the deferred capability named.

### `[x]` **7.2 Add `arc handoff write` — § 9.1**

- _Goal:_ From the flip `arc handoff write` takes only what the session decides — the `## Session Context` body,
  `Next Action`, and an optional `Session Type` — computes `State at Handoff` and `Commit at Handoff` itself, writes all
  five in one write of the current work unit's meta, then maintains the store and reports growth past its bounds,
  pushing nothing; each refusal's request passes once repaired.

    - `[x]` **7.2.a The request and its schema**

        - Registered strict request and result schemas; file and explicit stdin requests accept authored
          context and reject supplied anchors.

    - `[x]` **7.2.b The write and its anchors**

        - The selected Store writes all five meta fields at the observed record version, computing state and
          Git anchors; section, current-work-unit, and read refusals retain repaired retries.

    - `[x]` **7.2.c Maintenance after the write**

        - Local maintenance follows a landed write and reports bounded growth; a maintenance failure remains a
          diagnostic on successful handoff.

### `[x]` **7.3 Create a person's first records only when absent, and warn on an identity in use — § 10.1, § 10.2**

- _Goal:_ From the flip `arc user add`, `arc init`, and `arc join` create an identity's personal inbox and
  `WORKING-MEMORY` through the store only where absent, never overwriting; and when the identity's records already
  exist, each says so and asks the person to confirm the identity is theirs, warning and never refusing on its own,
  while a person who answers that it is not theirs stops the run before it writes; until the flip setup runs as today.

    - `[x]` **7.3.a Only where absent**

        - Identity setup creates absent personal records with compare-and-swap and preserves records already present;
          the in-repo arm retains its seeding behavior through the selected Store.

    - `[x]` **7.3.b An identity already in use**

        - Init, join, and add bind the requested identity before checking records. Confirmation precedes configuration
          and personal writes; join pulls first, and noninteractive runs report the identity in use and proceed.

### `[x]` **7.4 List the commits not yet closed — § 11, § 4.3**

- _Goal:_ From the flip, while an Active work unit has open tasks, the derived frame's entering work-unit context
  carries the set the close's default capture takes, computed once by the same code, and session start and recovery list
  it beside the task cursor with the close as its action in the work unit's checkout — or, where the close would refuse,
  that condition with its repair in place of the set; until the flip nothing is listed.

    - `[x]` **7.4.a The set in the entering work-unit context**

        - Only the entering Active work-unit context receives the shared default capture set; unavailable branch or task
          evidence remains an observation rather than a lost role.

    - `[x]` **7.4.b The action**

        - Fresh commits carry the typed bare-close action; rewritten commits retain the two repair choices as text, with
          paused work directed through resume.

    - `[x]` **7.4.c Recovery beside a matching cursor**

        - Recovery carries the same unclosed set beside its matched cursor without relaxing mismatch stops.

### `[x]` **7.5 Hold the ratchet floors to the arms kept until the deletion pass — § 1.5**

- _Goal:_ No `arc/store-raw-state`, `arc/surface-names`, or `arc/work-unit-paths` count in `eslint-suppressions.json`
  exceeds its count at the merged base, in total or per file, and every entry left in the parts of § 1.2's files this
  change reroutes sits in an arm § 1.5 names.

- _Outcome:_ Per-file and total counts do not increase against the freshly merged base. The retained-arm and shared-
  ownership inventory, including the Candidate acquisition correction, is recorded in `notes-seam-locus.md`.

### `[ ]` **7.R Verify dormant destructive paths and retain their flip checks — Testing (A17)**

- _Goal:_ A17's success and continuation scenarios run through CLI-generated handler inputs in real Git repositories,
  before-flip refusals run through the built CLI, and successful real-CLI destructive paths remain required at the flip.

    - Inventory the destructive paths added or rerouted here and their success, refusal, and repaired-continuation
      evidence. Complete missing handler integration or real-CLI refusal scenarios before recording the inventory.
    - Record the successful real-CLI scenarios required at the flip as outstanding release checks, with their concrete
      outcomes, and never count handler integration as successful built-CLI evidence.
    - Keep the reference backend's behavior coverage and all independently required gates; introduce no production
      backend selector or test-only capability bypass.

### `[x]` **7.R2 Acquire the subject Candidate through its Store owner — § 1.2 (A22)**

- _Goal:_ The subject-meta consumer acquires its Candidate singleton through the same Store and resolved owner UID as
  its primary record, preserves refusal and conflict evidence without checkout fallback, and retains the existing
  Candidate parser, delivery projectors, and in-repo acquisition.

- _Outcome:_ `readStoreSubjectCandidate` reads the exact generation and supplies the existing parser; missing,
  malformed, and conflicted records retain a repair-and-retry route. Candidate acquisition no longer trusts checkout
  bytes when state lives off the branch.

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
