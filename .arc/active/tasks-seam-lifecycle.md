# Task List: Seam Lifecycle

- **Design:** `spec-seam-lifecycle.md`

---

## **Phase 1:** Before the flip — the seed fix, setup, and the removal function

_Purpose:_ Land everything observable before the flip first: the seed fix ahead of locus's reroute of the cold start,
the two setup chunks so nothing is rerouted only to be deleted, the remaining pre-flip fixes, and the one removal
function and check every later caller moves onto.

_Mode:_ `slice` — closes on today's lifecycle carrying the five pre-flip fixes, each exercisable through the path it
repairs.

_Exit criterion:_ Each pre-flip fix passes through the path it repairs — a `--from` seed on each `arc start` arm, a
dirty checkout refused before an abandon or a Planning park records anything, the workspace still present after a failed
archive write, a missing checkout folder's registration removed by teardown, and activation refusing a work unit whose
`Branch` names base — and every other lifecycle test passes unchanged but for those a pre-flip fix, a setup chunk, or
the removal function's porcelain and move changes alter, each named with its change.

_Design decisions:_ Tasks 1.1–1.3 are the first three review chunks, in that order; the seed fix lands before locus
reroutes `runColdStart` in the same file. Every test a fix changes is named with that fix in its commit and completion
note.

### `[x]` **1.1 Pass `arc start --from` seeds through, and refuse `--from` on the spawning arm — § 13**

- _Goal:_ A cold start reads only an issue reference as a field (`Origin`) and passes every other seed through for the
  agent to read, entering at `draft-design` with no `Design`, and the spawning arm refuses `--from` instead of dropping
  it.

    - `[x]` **1.1.a The cold start takes a `draft-` or `spec-` seed as a document**

        - Removed `arc-spec` and the cold-start/scaffold `design` inputs and reporting. Draft/spec paths and URLs pass
          through as documents; issue references still set `Origin`. Updated `start.test.ts`, `worktree-scaffold.test.ts`,
          and `spec-input-parser.test.ts` around the generated meta and pass-through result.

    - `[x]` **1.1.b The spawning arm refuses `--from` without `--here`**

        - The handler refuses before spawning, naming the in-place form. `start-dispatch.test.ts` covers the refusal
          without a new branch or worktree and the ordinary spawn. The three `rename.e2e.test.ts` starts drop the seed.

    - `[x]` **1.1.c Correct the session-init cold-start step**

        - The package template and installed workflow describe issue-only `Origin` assignment and every other seed
          passing through as planning input.

### `[x]` **1.2 Delete the code no production path reaches — § 1.4**

- _Goal:_ Nothing is rerouted only to be deleted: every module, guard, arm, and function with no production caller is
  gone with its tests and the docs naming it, and every other test passes unchanged.

    - `[x]` **1.2.a Delete the two unreferenced modules**

        - Deleted the two unreferenced modules and the isolated workspace-module test; the bound user-workspace side
          effect remains.

    - `[x]` **1.2.b Delete the `worktree-clean` guard**

        - Removed the unused clean guard, its binding dependency, and table declarations. Guard maps use the remaining
          guards; mutator cleanliness checks remain.

    - `[x]` **1.2.c Delete `reconcileBranch`'s `delete` arm**

        - Removed the uncalled forced-delete branch mutation and its executor reader; merged-safe deletion and remote
          cleanup remain.

    - `[x]` **1.2.d Delete the functions with no production caller**

        - Removed the uncalled convenience functions. Reference-sweep coverage now exercises plan/apply, and
          dependency-discharge coverage exercises the production planner.

    - `[x]` **1.2.e Drop the docs that name them**

        - Removed retired-symbol references from module documentation. No suppression entries became unused.

- _Outcome:_ Only the production planner, mutators, and bound side effects remain; coverage no longer depends on
  the deleted convenience entry points.

### `[x]` **1.3 Count the archive index in the import ratchet — § 1.4**

- _Goal:_ Archive's and teardown's reads of the archive index count against the `store-raw-state` floor, and no import
  made only for a slug parse does.

    - `[x]` **1.3.a Move the slug helpers out of the archive index**

        - Moved both pure slug helpers into `work-unit-slug.ts` and re-pointed the helper-only and mixed importers.
          The archive index re-exports neither; its unit and differential integration tests use the extracted module.

    - `[x]` **1.3.b Add the archive index to the helper set, with its callers as the floor**

        - Added the index to the raw-state helper set, recorded its remaining non-type imports in ten existing caller
          files, and removed its own raw-state exemption. Other ratchet floors did not grow.

### `[x]` **1.4 Close the workspace after the transition's record writes — § 2.5**

- _Goal:_ A transition that leaves an active location closes the personal workspace only after its record writes, so a
  throw in those writes leaves the workspace in place, and a close that throws after them names `arc user close <slug>`
  as its continuation.

- _Outcome:_ Executor finalization and archive-specific field/cohort writes precede workspace close. Failed writes
  retain the workspace; a later close failure preserves the completed transition with an idempotent arc user close
  continuation.

### `[x]` **1.5 Refuse activation of a work unit whose `Branch` names base — § 6.1**

- _Goal:_ `arc activate` on a work unit whose `Branch` names the configured base refuses before it prepares, stages, or
  renames anything, naming as text the way onto a branch of its own.

- _Outcome:_ Activation checks the configured base before reconcile preparation, naming a work branch and metadata
  repair before retry. The handler passes the configured base; the legacy parameter fixtures follow it.

### `[x]` **1.6 Build the removal check — § 11.1**

- _Goal:_ One read-only check, taking no lock, reports whether ARC may remove a work item's checkout: `removable`,
  `missing`, or refused `dirty` with its paths, `unobservable`, `locked` by anything but the projection, or
  `persist-would-refuse` with the projection's remedy.

    - `[x]` **1.6.a Read worktree locks from the porcelain**

        - Both porcelain formats preserve optional lock facts and reasons, decoding line-format quoting; the roster
        carries them without changing unlocked records.

    - `[x]` **1.6.b The check, in the removal function's module**

        - The shared read-only removal check reports folder absence, foreign locks, exact dirty paths, failed
        observations, and projection refusal. Release runs only the projection check.

### `[x]` **1.7 Build the removal function — § 11.2**

- _Goal:_ One function removes a work item's checkout: with its folder present it runs the check, the persist step,
  `git worktree unlock` only for a projection lock Git lists, and a plain `git worktree remove`; with its folder gone it
  unlocks a projection-locked registration and removes that registration alone; it returns `removed`, `pruned`,
  `refused` with the check's result, or `failed` naming the step.

- _Outcome:_ The shared removal function checks and persists before an optional projection unlock and exact-path
  removal. Missing folders remove only their registration, and failed steps retain their typed boundary.

### `[x]` **1.8 Remove through the function in teardown, and check before an abandon or Planning park writes — § 11.3**

- _Goal:_ Teardown's two checkout removals go through the removal function, teardown completes where a checkout's
  folder was deleted, and an abandon from Planning or Active and a park from Planning run the removal check before their
  first write, so a dirty checkout refuses before anything is recorded.

    - `[x]` **1.8.a Teardown removes through the function, and reaches a missing folder**

        - Legacy teardown and the worktree mutator remove through the shared function. Folderless registrations use
        branch evidence and repository-local locking; foreign locks and dirty paths preserve actionable refusals.

    - `[x]` **1.8.b The decomposition candidate's cleanup removes through the function**

        - Decomposition candidate cleanup uses exact-path shared removal after its existing file restoration and locus
        hop.

    - `[x]` **1.8.c Abandon and a Planning park check the checkout before their first write**

        - Planning/Active abandon and Planning park check before mutation; stub and parked abandon retain their
        existing behavior. Legacy extraction fixtures retain retirement-evidence diagnostic priority.

### `[x]` **1.9 Keep and release anchored checkouts, and move only spawned ones — § 11.4**

- _Goal:_ A checkout ARC claimed in place is never removed: teardown releases its marker and keeps the checkout, a
  release persists through the projection's release slot first, and rename completes where an anchored checkout
  stands.

    - `[x]` **1.9.a Teardown releases an anchored marker**

        - Legacy teardown releases anchored markers while retaining their folders and checked-out branches;
        operational retirement supplies the later return-to-base behavior.

        - _Retired in:_ Phase 6

    - `[x]` **1.9.b Releasing runs the projection's release slot**

        - Anchored release runs the projection release slot before marker removal, preserving dirty files and leaving
        the marker when the slot refuses.

    - `[x]` **1.9.c Rename's move resolver keeps an anchored checkout in place**

        - Rename keeps an anchored checkout at its actual path; spawned checkouts retain relocation and
        malformed-marker refusal.

### `[x]` **1.10 Move every work-unit checkout in the doubled-force form — § 11.6**

- _Goal:_ Every move of a work unit's checkout this change runs or prints is `git worktree move -f -f`, so a checkout
  the projection later locks still moves with its lock and reason intact.

- _Outcome:_ Rename moves, rollback moves, fallback notices, and self-move follow-up commands use doubled force,
  preserving the worktree lock.

### `[x]` **1.11 Before the flip** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

- _Outcome:_ On merged base b41141d89, the seed, dirty-retirement preflight, workspace-write failure, folderless
  teardown, and base-branch activation scenarios exercise their production paths. Existing lifecycle CLI scenarios
  remain coherent.

## **Phase 2:** The amended records and the default set

_Purpose:_ Settle what every arm from the flip writes and matches before any verb writes it — branch links with their
record and exclusions, the copy key, the meta's pause section and its checks — and the one computation of a branch's
default set that activation, deactivation, the close, and locus's listing share.

_Mode:_ `layer` — closes on the amended schemas, the copy key, the default set, and the meta kind's additions, settled
and tested.

_Exit criterion:_ The store conformance suite and the kinds' tests pass with the new fields; one commit's copy key
agrees under every source § 5.2 pins; the default set over a scripted repository leaves out base, captured, and
excluded commits by SHA or copy key; the pause section round-trips through its writer; and the widened checks refuse a
hand edit of `Owner` or the pause, and the move to Active while an inbound entry is held.

### `[x]` **2.1 Add the branch link's record and exclusions, and the copy key in place of the patch-id — § 5.1, § 18.2**

- _Goal:_ A branch link records whether ARC created or adopted its branch and the commits on it that are no task's
  work, and every capture and commit lookup carries a copy key in place of the patch-id, strictly, so a writer states
  both and a `patchId` refuses.

    - `[x]` **2.1.a The schemas**

        - Branch links now require creation/adoption authority and repository-qualified exclusions; captures use
          strict versioned copy keys and refuse patch IDs.

    - `[x]` **2.1.b Lookup matches a SHA, then the copy key**

        - Commit lookup resolves a captured SHA before its copy key in the selected repository, preserving the
          original refusal shape.

    - `[x]` **2.1.c The fixtures follow**

        - Conformance and reference-backend fixtures carry the strict branch and capture shape; in-repo link-write
          admission stays unchanged.

### `[x]` **2.2 Build the copy key function — § 5.2**

- _Goal:_ One function computes a commit's copy key identically on every clone — `v1:`, a SHA-256 of its raw author
  header value, `:`, and a SHA-256 of a pinned, NUL-escaped `git patch-id --verbatim` — computing none where it cannot,
  so keys computed anywhere match.

    - `[x]` **2.2.a The byte-preserving binding removes named variables**

        - Both byte-preserving Git bindings remove caller-named environment variables alongside their fixed filters.

    - `[x]` **2.2.b The author half**

        - The author digest uses raw local-object header bytes with replacement objects disabled.

    - `[x]` **2.2.c The patch half**

        - The patch digest pins diff inputs, escapes NUL and escape bytes, and retries failed or oversized batches per
          commit without fetching missing objects.

    - `[x]` **2.2.d One function**

        - All copy identities come from computeCopyKeys; unavailable, empty, and merge patches retain timestamps
          without a key.

### `[x]` **2.3 Compute a branch's default set — § 9.2, § 5.2**

- _Goal:_ One computation returns a branch's default set — its non-merge commits reachable from the tips it is given
  and from neither base nor base's remote-tracking ref, less every commit matching a capture or exclusion by SHA or
  copy key — over the commits the clone holds, after a best-effort refresh of base, with no replace ref reaching it.

    - `[x]` **2.3.a The walk**

        - The local-only, replacement-free non-merge walk excludes both held base refs and repository-qualified SHA or
          copy-key matches, retaining author/committer times and before-refresh facts.

    - `[x]` **2.3.b The refresh of base**

        - Base and activation branch refreshes use separate bounded explicit refspecs; failed base refresh uses held
          refs with a warning, and absent base refs name their repair.

    - `[x]` **2.3.c The checkout's linked branch**

        - The shared checkout resolver distinguishes no-link, detached, unlinked, and linked branches, including
          repository-qualified refs, leaving refusal policy with each caller.

### `[x]` **2.4 Add the meta's pause section — § 8.1, § 18.1**

- _Goal:_ The meta's parsed record carries `pause`, `null` when absent, read from a `## Pause` section past the field
  lines and written whole by one section writer, which no field reader or writer and no meta validator reads.

    - `[x]` **2.4.a The schema and reader**

        - The strict semantic schemas carry the whole Pause section; readers keep tolerant scalar evidence independent
          of managed fields and durable checks validate writes.

    - `[x]` **2.4.b The section writer**

        - The section writer inserts, replaces, or removes Pause whole, preserving unrelated bytes and rejecting lines
          that would escape its section.

### `[x]` **2.5 Make `Owner` and the pause verb-owned, and give a pause's waits-on `Depends On`'s rules — § 18.1**

- _Goal:_ A hand edit can change neither `Owner` nor the pause section, and a pause's waits-on slug follows
  `Depends On`'s resolution, slug-edge, and rename rules.

    - `[x]` **2.5.a `meta.verb-owned-field` widens**

        - Hand edits of Owner and Pause refuse with the owning handover, pause, or resume repair; verb writes remain
          admitted.

    - `[x]` **2.5.b Waits-on follows `Depends On`'s rules**

        - Waits-on work-unit slugs use dependency resolution and surviving-edge rules; rename retains an in-flight
          pause edge until its owner reconciles.

### `[x]` **2.6 Refuse the move to Active while the inbound list holds an entry — § 14, § 18.1**

- _Goal:_ `meta.inbound-held` also refuses the move to Active while the work unit's inbound list holds an entry, beside
  its refusals at Integrating and the archive.

- _Outcome:_ The declared inbound grammar now gates movement to Active as well as publication and archive; the same
  write proceeds after its held list is cleared.

## **Phase 3:** The reroute's seam, proven on two verbs

_Purpose:_ Give the lifecycle verbs a store, one write path through it, and the executor's arm from the flip, then
prove the pattern on the Class verb, which writes through the store at once, and on promotion within the backlog, the
first transition with two arms.

_Mode:_ `slice` — closes on verbs writing through the store, one transition running through both of the executor's
arms.

_Exit criterion:_ `arc set-class` writes `Class` through the store from the CLI over the in-repo implementation and
through its verb over the reference backend; `runPromote` and `runDemote` move a stub between provisional and planned
through the executor's arm from the flip over the reference backend; and every in-repo arm passes today's tests
unchanged.

_Design decisions:_ A call into another change's code — locus's exclusivity check, roster lookup, and anchored-marker
writer (`LocusPorts`, task 5.4), the ref backend's pull of a history ref and its project ID — goes through a narrow
injected port whose default is the spec's behavior until that change lands; whichever change lands second binds it. The
arms from the flip run only after the flip, which waits for both changes. A transition's arm from the flip runs inside
`executeTransition`, keeping one edge table and one set of guards; a verb that writes outside any transition uses the
same write helper directly.

### `[x]` **3.1 Give the lifecycle verbs and the executor the store they open — § 2.1**

- _Goal:_ Every verb in the spec's scope and the executor read `capabilities` from the store they open — production
  opening `createStore` over the checkout, a test injecting any `Store` — with no behavior changing.

    - `[x]` **3.1.a The executor and the shared verb base**

        - VerbBase and the executor carry one opened store. Ephemeral default-instance provenance reopens it after
        withCwd; explicit and replacement injections survive the rebind.

    - `[x]` **3.1.b The verb contexts and the entry points outside the executor**

        - Every scoped verb context and external start, scaffold, rename, and promotion boundary carries the same
        optional store and locus ports without widening strict command inputs.

### `[x]` **3.2 Build the verb-level harness over the reference backend — § 2.1**

- _Goal:_ A verb test runs an arm from the flip over the reference backend with the production kind registry, seeded
  with real meta, task-list, cohort, and Errand content, beside a scripted repository.

- _Outcome:_ The checked reference harness seeds real kind content and parses mutation envelopes before the backend,
  exercising production parser and write-check behavior beside scripted Git.

### `[x]` **3.3 Build the write helper and the executor's arm from the flip — § 2.1, § 5.3**

- _Goal:_ A verb's arm from the flip reads its records with their versions, applies the kinds' writers, and persists
  its writes in one `batch` with expected versions and caller provenance — the verb, its lifecycle action, and
  `codeHead` where it binds a code commit — and a transition's runs inside `executeTransition`, which resolves its
  position from the store, keeps its edge selection and guards, and runs its Git legs around that batch.

    - `[x]` **3.3.a One branch per verb**

        - Each verb selects its capability arm once; absent stores retain the in-repo arm.

    - `[x]` **3.3.b The write helper**

        - The shared writer acquires exact versions, uses kind writers, preserves unmodified links, and batches with
        caller provenance; store codes and remedies survive into handler output.

    - `[x]` **3.3.c The executor's arm from the flip**

        - The operational executor selects the existing edge over a complete store view, validates declared Git
        inputs, and batches record legs and finalization together. Resume reads the stored workflow; retiring soft
        fields and direct renders are absent.

    - `[x]` **3.3.d The project ID on every link**

        - Every new branch, capture, and exclusion link takes the invocation project identity through the injected
        binding; unavailable production identity refuses with a directed repair.

    - `[x]` **3.3.e Git steps around the batch**

        - Before-batch Git steps roll back on refusal, including partial step failure; after-batch failures retain
        typed physical continuations. PR withdrawal retries physical work without replaying persisted records.

### `[x]` **3.4 Add `arc set-class` — § 10**

- _Goal:_ `arc set-class <Light|Heavy|Novel> [<slug>]` writes `Class` at any stage, a stub's included, through the
  store at the placement it read, so before the flip the bytes land in the checkout for the workflow's ceremony commit
  to carry, and where the checkout holds no agreeing copy it refuses with the store's own remedy.

- _Outcome:_ The registered Class verb writes through the kind writer at the selected placement, defaults its slug
  from current-work-unit resolution, and preserves in-repo writable-copy refusal without committing.

### `[x]` **3.5 Reroute `arc promote` and `arc demote` — § 2.2**

- _Goal:_ From the flip `arc promote` and `arc demote` move a stub between provisional and planned and write `Class`
  where `--class` sets it, in one batch, while the in-repo arm runs today's relocation.

- _Outcome:_ Promotion and demotion within backlog use one operational transition batch for placement and optional
  Class; the legacy relocation and Class prompt remain on their existing arm.

### `[x]` **3.6 The reroute's seam** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

- _Outcome:_ On merged base b41141d89, the actual Class CLI changes only its metadata, and checked-reference
  promotion/demotion exercise both backlog placements. Legacy executor and verb behavior remains reachable.

## **Phase 4:** The reroute across the verbs that link no branch

_Purpose:_ Repeat the proven pattern over every remaining verb whose records touch no branch link, and over the reads,
renders, and workspace their arms from the flip replace.

_Mode:_ `replication` — closes when every verb and read the reroute names that writes no branch link runs its arm from
the flip over the reference backend.

_Exit criterion:_ Each rerouted verb's arm from the flip writes the records § 2.2 names over the reference backend, its
in-repo arm passes today's tests unchanged, and no ratchet floor grows.

### `[x]` **4.1 Reroute the stage and field verbs — § 2.2**

- _Goal:_ From the flip `arc set-stage` writes `Current Workflow` and `Next Action`, `arc finalize` `Class`,
  `Task List`, and `Next Action`, and `arc repoint-design` `Design`, through the kinds' writers, with no caller reading
  the meta beneath the contract or formatting a value.

- _Outcome:_ Stage, finalization, and Design writes use typed kind writers through the shared batch helper; raw
  metadata reads and preformatted values remain confined to legacy arms.

### `[x]` **4.1.R Make spec finalization a coherent record write — A1**

- _Goal:_ Under A1, off-branch spec-finalized repoint writes `Design`, `Current Workflow: generate-tasks`, and the
  begin-current-workflow `Next Action` sentinel atomically, preserving layered siblings and strict stage validation.

- _Outcome:_ Spec-finalized repoint atomically writes Design, generate-tasks, and the workflow sentinel while
  preserving layered siblings. Repeated stage advance is idempotent; independently inconsistent tuples still refuse.

### `[x]` **4.2 Reroute `arc stub` and `arc start`'s records, and the scaffold's arm — § 2.2, § 2.5, § 8.5**

- _Goal:_ From the flip `arc stub` creates its meta through the creation writer at its backlog placement, `arc start`
  creates the meta or places a stub's active at `State: Planning` with its starter as `Owner`, no branch link, and no
  `plan/` branch, reporting a stub's previous owner, and the scaffold creates through the store and seeds no
  `SESSION-NOTES`.

    - `[x]` **4.2.a `arc stub`**

        - Stub creation uses the operational creation writer and placement, with report paths projected inside the
        store adapter after capability dispatch.

    - `[x]` **4.2.b `arc start`'s graduation and create-new**

        - Graduation transfers Owner in one batch and create-new writes through the store; detached spawns create no
        planning branch, in-place starts preserve HEAD, and failed writes undo physical occupation. Folderless
        registrations clear before occupation and no ceremony or session-notes writes run.

    - `[x]` **4.2.c The scaffold's arm**

        - The scaffold writes a store-held Planning meta without Branch or workspace seeding, retaining the existing
        ownership-marker boundary.

### `[x]` **4.3 Build the prepared-write protocol, and reroute `arc wu reconcile` and edge discharge — § 3, § 2.6**

- _Goal:_ Every prepared write from the flip acquires the work unit's whole artifact group with each record's version,
  prepares its edits, revalidates each input by its version or by restricted `changes`, and applies everything in one
  batch, so an unrelated write never invalidates it and a changed input refuses or restarts.

    - `[x]` **4.3.a The protocol**

        - Prepared writes acquire the complete artifact group and selected cohort records, retain every input version
        including unedited records, and apply one exact-version batch. Unrelated records do not invalidate the plan.

    - `[x]` **4.3.b `arc wu reconcile` and dependency discharge**

        - Reconcile and edge discharge read the store view and lineage, resolve former-name aliases, and apply through
        the prepared protocol. Detached and archived targets resolve through the store; pause is checked at apply even
        for zero-edit plans.

### `[x]` **4.4 Reroute `arc publish` and `arc reopen` — § 2.2, § 8.7**

- _Goal:_ From the flip publication writes its reconcile's prepared write between the first Candidate authorization and
  the re-authorization, then `State: Integrating` after the boundary claim, reopen writes `State: Active` behind the
  task cursor it reads through the store, both read the work branch from the branch link, the reopen permit takes the
  task list through the store, and neither writes `Next Task` or `Last Completed`.

- _Outcome:_ Publication preserves authorization/reconcile ordering and batches Integrating state; reopen checks the
  stored task cursor and returns Active. Both use linked work branches and omit retired progress-field writes;
  physical withdrawal failure names a retry.

### `[x]` **4.5 Reroute `arc archive`, the backend assigning the sequence — § 4, § 2.5, § 18.2**

- _Goal:_ From the flip archive writes placement `completed` naming only the quarter, clears the meta's session context,
  both handoff anchors, and `Session Type`, resets `Next Action`, completes the cohort document in the same batch when
  its last open member archives, and writes no `PR URL` or `Branch`, reporting the sequence the backend assigned.

    - `[x]` **4.5.a A cohort document's completed placement**

        - Completed cohort placements carry the backend-assigned member sequence with leaf/parent letters, or their
        own next quarter sequence, and retain the open-member write check.

    - `[x]` **4.5.b The archive write**

        - Archive writes completed placement and clears session context/anchors in one batch with eligible cohort
        completion. The backend assigns the reported sequence; a coherent completed record permits reporting retry
        without rewriting it.

    - `[x]` **4.5.c Teardown's shipped authority from the placement**

        - Operational teardown derives shipped authority from completed placement and revalidates the selected stored
        evidence instead of reading the archive index.

### `[x]` **4.6 Read lifecycle state through the contract — § 2.3**

- _Goal:_ Outside the in-repo arms no file in the change's scope builds a work-unit state path or reads lifecycle state
  beneath the contract: the current work unit comes from the resolver, state by slug and cohort membership from the
  identity-keyed lifecycle index, the task list through the store, and the write-context checks drop their branch
  requirement from the flip.

    - `[x]` **4.6.a The current work unit**

        - Lifecycle target and occupancy reads use the opened store/current-work-unit resolver; branch matching
        remains on legacy planning paths.

    - `[x]` **4.6.b State by slug and cohort membership**

        - Status, dispatch, start, rename, resume, and abandon read the store lifecycle view; aliases resolve to
        canonical identity. Mutation consumers refuse incomplete inventory while status can report valid records, and
        Integrating dependency advisories preserve alias edges.

    - `[x]` **4.6.c Work-unit state paths**

        - Scoped operational readers ask for records or store-projected paths before legacy path construction.
        Remaining counted helpers are confined to retained legacy arms, pure supplied-artifact planners, or explicitly
        excluded readers.

    - `[x]` **4.6.d The write-context checks**

        - Detached operational planning and housekeeping checks skip branch/base requirements while legacy checks
        retain them.

### `[x]` **4.7 Stop the edges' renders and the executor's workspace at the flip — § 2.4, § 2.5**

- _Goal:_ From the flip no transition renders ROADMAP, writes `STATUS.USER`, stages a meta, commits a ceremony, or opens
  or closes the personal workspace, and rename moves no workspace.

- _Outcome:_ Operational edge forms omit roadmap/status/workspace effects, staging, and ceremony commits; rename skips
  personal workspace mutation. Legacy edges retain their side effects.

### `[x]` **4.8 Retire the cohort consistency check's folder conditions at the flip — § 2.6**

- _Goal:_ From the flip the cohort consistency check runs only its member-section condition, its folder match and its
  cohort document per grouping folder running only in the in-repo arm.

- _Outcome:_ Operational cohort consistency keeps supplied member-section validation and field-derived membership
  while retiring folder grouping conditions; legacy validation retains both.

### `[x]` **4.9 The reroute across the verbs** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

- _Outcome:_ On merged base b41141d89, the checked-reference matrix exercises all rerouted field, start, reconcile,
  publish/reopen, archive, and read paths. The remaining raw-state loci were attributed to retained arms or explicit
  scope boundaries.

## **Phase 5:** Branch links and the work branch

_Purpose:_ Build every verb that cuts, adopts, renames, or keeps a work branch from the flip, each writing the branch
link it creates or keeps.

_Mode:_ `slice` — closes on a work unit planned detached, activated onto a branch it created or adopted, deactivated
and re-activated, and renamed, its branch link correct at each step.

_Exit criterion:_ Over the reference backend and a scripted repository, activation creates, adopts, and reattaches the
work branch with the right record and exclusions; deactivation keeps it and reports its default set; promotion links a
created work branch; and rename renames only a linked branch in ARC's form. The report's merge, whose case asserts what
Git itself does, passes over a real repository.

### `[x]` **5.1 Build activation's arms from the flip — § 6.1, § 5.2**

- _Goal:_ From the flip activation creates the work branch from a detached checkout or on base, adopts and renames a
  person's branch with its commits so far excluded, or reattaches its own link adding the commits made out of Active —
  never adopting base — writing `State: Active` and the link in the transition's batch after its reconcile's prepared
  write, and naming the old name's remote deletion only for a created link.

    - `[x]` **5.1.a Choose the arm, and refuse what each arm cannot take**

        - Activation chooses create, adopt, or reattach from checkout/link facts before reconcile writes, refusing
        occupied names, foreign links, base adoption, and detached unlanded commits.

    - `[x]` **5.1.b The exclusions and their report**

        - Adoption and reattachment compute exclusions after separate bounded base/branch refreshes; the report names
        explicit task-close and merge commands for commits missing from HEAD.

    - `[x]` **5.1.c The writes, and the old name's remote branch**

        - The reconcile lands first, then branch preparation and the Active/link batch. Operational --task is
        optional; legacy absence refuses before reconcile. Old remote deletion authority is limited to created links.

### `[x]` **5.2 Keep the work branch at deactivation, and report its default set — § 8.8**

- _Goal:_ From the flip deactivation writes `State: Planning`, keeps the work branch as the link with the checkout on
  it, and reports the default set over base fetched first, naming `arc task close`, or says base did not resolve and
  names its repair, proceeding either way.

- _Outcome:_ Deactivation keeps the work branch/link, writes Planning, and reports the default set or absent-base
  repair; reactivation reuses the link.

### `[x]` **5.3 Catch a detached Planning checkout up with `arc base sync` — § 6.2**

- _Goal:_ From the flip `arc base sync` run from a detached Planning checkout re-detaches it at base's tip after any
  sync that leaves base current, refuses while it holds commits not on base, and leaves it where it stands when the sync
  refuses.

- _Outcome:_ The base-sync handler re-detaches a clean Planning checkout at updated or current base, preserving its
  original HEAD on sync refusal and refusing unlanded detached commits.

### `[x]` **5.4 Check a marker's exclusivity, and write anchored markers in place — § 6.4**

- _Goal:_ From the flip a spawn, `arc materialize`, and an in-place graduation run locus's exclusivity check before
  writing a work-unit marker, and `arc start --here`'s graduation and `arc materialize --here` write an anchored marker,
  `spawnedByArc: false`.

- _Outcome:_ The shared locus-port record gates marker writes and supplies anchored generation receipts. In-place
  graduation rolls back only its written generation; concurrent replacements survive, and default unadmitted writes
  and rollback leave bytes untouched.

### `[x]` **5.5 Build promotion's one write and its work branch — § 7.2**

- _Goal:_ Promotion's arm from the flip is two steps `promoteOrdinaryErrand` composes, in their own module beside it —
  the role-change put of the Errand's primary to its meta role on the same UID, keeping its links, description,
  placement, aliases, and history and adding the work branch's `created` link with the Errand link's exclusions, and the
  Git step cutting `<type>/<name>` at the Errand's tip and switching the checkout onto it.

- _Outcome:_ Promotion adapters replace the Errand primary with meta on the same UID, retain history/links/exclusions,
  and cut the created work branch at the Errand tip. Runtime selection remains the expected locus binding.

### `[x]` **5.6 Reroute `arc rename` — § 7.1**

- _Goal:_ From the flip `arc rename` changes the primary's name and aliases and applies the reference sweep's edits to
  its own records, provisional and planned stubs, and the cohort document in one version-checked batch, finds the
  holding checkout by its marker, and renames only a linked branch in ARC's form, reporting every branch it keeps.

    - `[x]` **5.6.a The records**

        - Rename batches canonical name/aliases and version-bound edits to its records, stubs, and selected cohorts.
        In-flight dependents retain aliases and no rename lineage is created.

    - `[x]` **5.6.b The checkout and the branch**

        - The marker holder selects the branch, or detached selection takes the final qualified link. Only ARC-form
        linked branches rename; adoption/exclusions survive. Physical rollback reverses only changes actually made and
        marker generations use exact CAS; remote retry respects created/adopted authority.

    - `[x]` **5.6.c A stub, and an archived work unit**

        - Stub rename switches no branch; completed rename retains its archive number. Base b41141d89 carries no
        unresolvable-state-version refusal, so the explicit history-ref pull/retry binding remains with the ref
        backend.

### `[~]` **5.7 Write the import's branch links where the import landed first — § 5.4**

- _Goal:_ Whichever of this change and the ref backend's import lands second builds the import's writing of each
  branch link's record and exclusions, its captures' copy keys through the one function, and its `branch-missing` and
  `branch-diverged` refusals.

- _Outcome:_ Deferred under the task’s base condition: b41141d89 has no operational ref-backend import. The ref
  backend owns branch-link authority, copy-key capture import, and branch refusal integration when it lands second.

### `[x]` **5.8 Branch links** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

- _Outcome:_ On merged base b41141d89, same-UID created/adopted scenarios run detached planning, activation,
  deactivation, reactivation, and rename; Errand promotion retains its earlier link through rename. The reported
  missing-commit merge succeeds over real Git.

## **Phase 6:** Lifecycle moves from the flip, and retirement

_Purpose:_ Settle every move whose meaning changes at the flip — pause in place of park, handover, the widened
materialize, abandon's one path — and the reap that deletes only branches ARC created.

_Mode:_ `slice` — closes on a work unit paused, handed over, materialized, and abandoned, with its created branches
reaped and an adopted one kept.

_Exit criterion:_ Over the reference backend and a scripted repository, a pause refuses each verb that advances the
work and lets every other write proceed; a handover refuses unshared work; materialize gives a released work unit a
checkout with and without a branch link; abandon runs one path from a stub, Planning, and Active; and teardown reaps
every created branch by its end's rule while keeping and reporting an adopted one.

### `[x]` **6.1 Add `arc pause` and `arc resume` — § 8.1**

- _Goal:_ From the flip `arc pause` writes the pause section on a Planning or Active work unit, requiring a reason on a
  first pause, updating only the fields it is given and keeping when the pause began, and reporting work no one else
  can reach; `arc resume` clears it; before the flip `arc pause` refuses `unsupported`, naming `arc park`, and
  `arc resume` resumes a parked work unit as today.

- _Outcome:_ Pause writes only supplied fields while retaining since and reports unshared work; resume clears the
  section in place. Store routing avoids remote composition; legacy pause refuses with park and legacy resume remains
  available.

### `[x]` **6.2 Refuse the verbs that advance a paused work unit — § 8.2**

- _Goal:_ A verb that advances a paused work unit's work — a `State`, placement, or stage change, a task close or
  deferral, an edge reconcile — refuses, naming `arc resume <slug>` as a typed action, and every other write proceeds
  with the pause in place.

- _Outcome:_ Advancing transitions, stage writes, task close/defer, and reconcile apply refuse with typed resume
  actions; prepare and permitted scalar/identity writes remain available with the pause intact.

### `[x]` **6.3 Add `arc handover` — § 8.5**

- _Goal:_ From the flip `arc handover [<slug>] --to <identity>` writes `Owner` alone, refusing while the work branch's
  unpushed commits or uncommitted changes in the owner's checkout here remain, naming each; before the flip it refuses
  `unsupported`, naming the `Owner` edit it replaces.

- _Outcome:_ Handover writes only Owner after checking local dirt and fresh remote reachability. Missing remote
  branches name push, unreachable origin names retry, local-only clones retain their stated behavior, and pause does
  not block handover.

### `[x]` **6.4 Widen `arc materialize` — § 8.4**

- _Goal:_ From the flip `arc materialize <slug>` gives a checkout to any in-flight work unit its identity owns that no
  checkout here holds — found in the store's listing, with or without a branch link — leaving a pause in place,
  spawning on a linked branch or detached at base's tip, and with `--here` writing an anchored marker, alone where no
  branch is linked.

    - `[x]` **6.4.a Candidates from the store**

        - Materialize lists each owned in-flight canonical identity once and excludes held checkouts; former-name
        requests resolve before candidate selection and claims use the canonical name.

    - `[x]` **6.4.b What it gives**

        - Materialize reattaches held branches, creates from remote-only refs, or spawns detached at held base.
        Branchless --here changes only the marker, anchored claims preserve HEAD, and folderless registrations clear
        with exact lock-aware removal.

### `[x]` **6.5 Reap a retiring work unit's created branches by its end's rule — § 12.1, § 12.2**

- _Goal:_ From the flip teardown reads the lineage record and retires the work unit's whole ref set, local and
  remote-tracking, of every branch link recorded `created` — the retiring branch by its end's rule, every other ref only
  where it carries nothing beyond base and the retiring branch — keeping and reporting the rest.

    - `[x]` **6.5.a Each end's rule**

        - Retirement derives discard or landed rules from exact terminal lineage or completed placement; lineage
        evidence reaches marker/husk codecs and selected-version revalidation.

    - `[x]` **6.5.b The reap plan**

        - The shared zero-delta reaper accepts work-item ref sets, keeps additional refs with unique work, and uses
        the existing lock plus record/ref CAS. Tracking deletion tolerates Git pruning an already-removed ref.

### `[x]` **6.5.R Retain terminal branch authority — A2, § 12.1**

- _Goal:_ A2's terminal lineage preserves the retiring primary's exact branch-link list in the removal batch, so
  teardown can resume cleanup with its created/adopted authority and exclusions after primary removal.

    - `[x]` **6.5.R.a Validate and write the snapshot**

        - Terminal lineage validates optional strict, ordered retiredBranches; operational abandonment snapshots the
        exact removed primary links, including an explicit empty list, in its terminal batch.

    - `[x]` **6.5.R.b Read terminal authority on retry**

        - Retries take terminal authority only from the retained snapshot. One exact-CAS hand-repair path admits a
        missing snapshot while preserving every other fact; existing snapshot changes, omission, and whole-lineage
        removal refuse, with byte restoration on failed in-repo writes.

### `[x]` **6.6 Return a holding checkout to base, and keep adopted branches — § 12.3, § 12.4**

- _Goal:_ Before a branch is deleted, a clean checkout holding it returns to base, or detaches at base's tip where a
  linked checkout cannot take base, while a dirty one stays with its branch kept and reported; an adopted branch is
  never deleted, and the abandon or teardown reports it kept, naming its owner's steps to delete it.

- _Outcome:_ Created-branch holders return to base or detach at base tip before deletion; dirty holders remain.
  Adopted links and their checkouts survive, with explicit owner cleanup commands.

### `[x]` **6.7 Give abandon one path from every state — § 8.6**

- _Goal:_ From the flip abandon from a stub, Planning, or Active, paused or not, runs the removal check where a checkout
  here holds the work unit, one batch creating the lineage record and removing the primary, the checkout's removal or
  an anchored checkout's release, and the reap of a created work branch, naming `arc teardown <slug>` as a typed
  continuation where a step after the batch fails; Integrating refuses as today, naming `arc reopen`.

- _Outcome:_ Store abandonment runs one confirmed terminal batch from stub, Planning, or Active, paused or not, then
  releases/removes the holder and reaps created refs. Production impact reporting resolves alias dependencies;
  post-write failure names teardown and Integrating requires reopen.

### `[x]` **6.8 Retire park at the flip — § 8.9, § 2.2**

- _Goal:_ From the flip `arc park` refuses `unsupported`, naming `arc pause <slug> --reason <text>`, and park's
  machinery — the pointer record, the Planning landing and the evidence teardown accepts for it, the parked position,
  and park's legs of `arc resume` — is reached only through the in-repo arm.

- _Outcome:_ Operational park refuses before parsing or landing, naming pause; pointer and parked-position machinery
  remain confined to legacy park/resume/teardown arms.

### `[x]` **6.9 Moves and retirement** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

- _Outcome:_ On merged base b41141d89, same-UID pause, handover, actual materialization, abandonment, and repeated
  teardown close the retirement scenario. Archive and abandonment retain adopted refs, and real-Git exact-husk tests
  preserve other husks and retry after physical failures.

## **Phase 7:** The task close verb

_Purpose:_ Close tasks through a verb that captures their commits, with the commit and its close at one fire site where
task commits route through the release wrapper.

_Mode:_ `slice` — closes on an increment committed and closed through `arc release commit --close`, its commits
captured to its task.

_Exit criterion:_ Over the reference backend and a scripted repository, `arc release commit --close` commits and
captures an increment's commits, a raw commit followed by `arc task close` captures the same, and each case Success
Criterion 8 names passes, the cases that rest on what Git does to a rewritten commit at the integration tier over real
repositories.

### `[ ]` **7.1 Add `arc task close` and `arc task defer` — § 9.1**

- _Goal:_ From the flip `arc task close [<ids>…] [--commit <sha>…]` closes the cursor's leaf or the named tasks,
  re-closing a closed one, cascading through parents, and records their captures and any matched exclusions' removal
  in one batch, captures only ever growing, while `arc task defer <id>` defers an open task with its open subtasks;
  before the flip both refuse `unsupported`, naming the hand `[x]` or `[~]`.

    - `[ ]` **7.1.a The verbs and their targets**

        - Register an `arc task` group in `src/cli.ts` with `close` and `defer`, their input schemas in
          `lifecycleCommandInputRegistrations` (`handlers/lifecycle.ts`), which `commandInputRegistrations`
          (`command-input-registrations.ts`) collects and the repository inventory test reconciles against every live
          option and operand, with their entries in that test's lists, as 3.4 gives its own.
        - With no IDs the close takes `resolveTaskListCursor`'s leaf (`lib/task-list/cursor.ts`), refusing where no
          task is open and naming a deferred task's close, `arc task close <id>`, or a new task; a named ID no task
          carries, or a task list that does not read, refuses, naming the IDs or the line.
        - Both check the pause first (task 6.2) and run in the work unit's checkout.

    - `[ ]` **7.1.b The writes**

        - Each task's marker goes through the task-list kind's `writeTaskMarker`; closing a parent closes its open
          subtasks, recording the captures against each, deferring a parent defers its open subtasks, and a parent the
          cascade closes — `[x]` when any subtask is `[x]`, `[~]` when all were deferred — records none of its own.
        - Subtasks are written before their parent: `writeTaskMarker` rescans after each write and throws on a
          malformed result, and the scanner rejects an open subtask beneath an `[x]` parent
          (`lib/task-list/scanner.ts`). The verb first scans the task list itself (`scanTaskListStructure`), since
          `writeTaskMarker`'s throws carry no line: a task list that does not scan refuses naming the line the scan
          reports, and an ID on other than one line refuses naming its lines, before any write lands; a throw the
          writer still raises becomes the verb's refusal with nothing written.
        - Captures go into the work item's links (`taskCaptures`) keyed by task ID, never removing one; every exclusion
          a named commit matches by SHA or copy key leaves the branch link; all of it lands in one batch.
        - `--commit <sha>` names commits instead of the default set (task 7.2), one per occurrence: a repeatable option
          its parser collects, never a variadic one, which would take the IDs after it. It combines with IDs and refuses
          a commit `HEAD` does not hold, its reachability read run with `--no-replace-objects` in Git's global position,
          as the set's walk is (task 2.3), so a replace ref cannot make a commit reachable or hide one.

    - Build `test-first` (one behavior at a time):
        - a bare close closes the cursor's leaf; named IDs close a set
        - a re-close adds a new commit and keeps every capture; one with nothing new changes nothing and says so
        - closing a parent closes its open subtasks with their captures; a cascade-closed parent records none
        - a deferral of a parent's last open subtask closes the parent, `[x]` where a subtask was already `[x]`
        - an explicit close of an excluded commit captures it and removes every exclusion it matches
        - `--commit` refuses a commit not reachable from `HEAD`, and, at the integration tier over a real repository,
          one a replace ref grafts onto `HEAD`'s history
        - deferring a parent defers its open subtasks, and a parent with a subtask already `[x]` closes `[x]`
        - `arc task defer` refuses a task that is not open
        - before the flip, both refuse `unsupported`

### `[ ]` **7.2 Capture the default set after refreshing base — § 9.2**

- _Goal:_ With no `--commit` the close refreshes base, captures the default set (task 2.3), and refuses — recording
  nothing — a set the refresh emptied that was not empty over the base refs held before it, naming the rerun for a task
  that produced no commit, while refusing on a detached checkout, an unlinked branch, or a work item with no link.

    - It reads the branch link whose ref the checkout has out through task 2.3.c's resolver, refusing on `detached` or
      `unlinked`, naming the work branch, and on `no-link`, naming `arc activate` for a Planning work item and, for an
      Active one, which the import leaves where a meta's `Branch` was empty or named base (task 5.7),
      `arc deactivate <slug>`, then `arc activate`, since activation moves only Planning to Active and deactivation
      keeps whatever link there is.
    - The emptied-set refusal names the commits the refresh found on base and `arc task close <id>` for the cursor's
      task or the IDs given; the rerun finds its set empty from the start and closes with no capture. A set the
      refresh only shrank closes as usual, and a failed fetch compares nothing.
    - The catch-up's remap is the history policy's (spec § 19), so the cases after ARC's own rewrite seed its output
      over the reference backend: each capture and exclusion keeps its old entry, with the new commit's SHA and copy key
      beside it.

    - The cases that rewrite or move commits — a rebase by hand, `git pull --rebase` — run at the integration tier over
      real repositories, as 2.3's do, since a scripted repository would pass them without showing what Git does.

    - Build `test-first` (one behavior at a time):
        - a default close after an explicit close of an earlier commit captures only the rest
        - after a rebase by hand that keeps diffs, on an adopted, a re-activated, and a created branch, the default
          capture takes only the increment's commits
        - after ARC's own catch-up, its remap seeded, the default capture takes only the increment's commits
        - a checkout behind its branch, and one that takes another machine's rebase with `git pull --rebase`, capture
          only their own new commits
        - a checkout that has not taken ARC's rewrite, its remap seeded, closes without capturing its old copies
        - a refresh that empties a set refuses with nothing recorded, and the rerun closes the task with no capture
        - a detached checkout, an unlinked branch, and a work item with no link each refuse, naming their repairs, a
          Planning and an Active work item with no link each naming its own

### `[ ]` **7.3 Give a rewritten copy to its original's task or the exclusions — § 9.2**

- _Goal:_ Before capturing, the default close compares each commit whose committer time differs from its author time,
  by its author half, with the captures and exclusions, giving one to each task holding a commit with that half, or to
  the exclusions, and the rest to the tasks it closes, all in its batch, its result naming each attribution and any
  task left with nothing.

    - Attribution runs on every default close, a re-close's included, which is how a rerun after an amend takes the
      amended commit; a set empty from the start closes its tasks with no capture and no report.
    - The cases that rewrite a commit — an amend, a rebase with or without its date options, a cherry-pick, a squash or
      fixup, a raw `git commit -C` — run at the integration tier over real repositories, as 2.3's do, since the
      residuals spec § 5.2 and § 9.2 state rest on what Git does to the author line and the diff.

    - Build `test-first` (one behavior at a time):
        - a hand amend, rebase, cherry-pick, and interactive squash or fixup of a captured commit go to its task, and of
          an excluded one to the exclusions, each named
        - where attribution places the whole set elsewhere, the result names the tasks closed as receiving nothing, with
          `arc task close <ids> --commit <sha>…`
        - after a message-only amend of the last closed increment the set is empty; after a content edit, the task's
          re-close adds the new commit and keeps every capture
        - a commit made fresh in a captured one's second goes to the task the close closes
        - a commit made with a raw `git commit -C` naming a captured one, since the wrapper refuses `-C` run
          non-interactively (`createCommitMessagePreflight`), goes to that commit's task
        - a rebase with `--committer-date-is-author-date` that changes a captured commit's diff reads as new, and the
          set omits one that keeps the diff; a rebase with `--ignore-date` reads as new
        - a copy whose stored patch half differs from the one computed goes to its original's task
        - a change reverted and made again in a later second than it was first made is captured
        - an Errand promoted at the scale floor keeps its commits in the default capture

### `[ ]` **7.4 Add `arc release commit --close` — § 9.3**

- _Goal:_ From the flip `arc release commit --close[=<ids>]` checks, before committing, the pause, a linked branch out,
  a base ref after the close's bounded fetch, and the tasks it would close, each refusal recorded in the release audit
  log, then commits and runs the close on the fetch's result, exiting 1 and naming `arc task close <ids>` where the
  close fails after the commit; before the flip `--close` refuses `unsupported`.

    - `handleReleaseCommit` (`handlers/release/commit-cli.ts`) strips `--close[=<ids>]` with `--no-wrap`, both read
      only as the argv's leading tokens, in either order — `stripNoWrap` reads only the first — and the IDs only
      through `=`, so a `--close` past git's first argument stays git's; the strip runs before `runReleaseCommit`.
    - The checks run inside `runReleaseCommit` (`handlers/release/commit.ts`) through an optional close dependency on
      `ReleaseCommitDeps` that only `handleReleaseCommit` supplies — delivery's fix-release caller
      (`handlers/delivery-review-fix-release-effects.ts`) omits it — after the message preflight returns `passed` or
      `pass-through` (`CommitMessagePreflightResult`), the second for a message git manages, and before the message
      snapshot and `git commit`, so a commit the interlock or the preflight refuses fetches nothing. The linked-branch
      check reads task 2.3.c's resolver, as the close does.
    - A failed check refuses through the audited refusal path as code 17, `close-precheck-failed`, its reason the
      check that failed, `unsupported` before the flip. In `lib/release/schema.ts`, `RefusalCodeSchema` takes it, a
      `close-precheck-failed` outcome carrying the check joins `AuditOutcomeSchema`, and an `AuditEntrySchema` arm
      pairs the two, as code 16 pairs `preflight-failed`; `RefusalIdentifier`, `REFUSAL_IDENTIFIERS`, and
      `AuthorizationDecision` (`lib/release/types.ts`), and `formatRefusal` (`lib/release/interlock-validation.ts`)
      take it too. Each refusal names the repair its check's section names, and nothing is committed.
    - The code's other sites move with it: the refusal-code domain in `__tests__/unit/release/schema.test.ts`, the
      identifier mapping in `__tests__/unit/release/audit-log.test.ts`, a code 17 case among `formatRefusal`'s
      three-line-shape cases (`__tests__/unit/release/interlock-validation.test.ts`), and the refusal codes and cascade
      in `handleReleaseCommit`'s and `commit.ts`'s docs. ADR-017 gains a dated amendment naming code 17, as its
      2026-07-14 amendment named 16; its decision text and ADR-018's, which name codes `10–14`, stay as written.
    - After git exits 0 the close runs on the check's fetch result. Where it then fails, the wrapper exits 1, its output
      naming the commit and carrying `arc task close <ids>` as a typed action (§ 16): a `Remedy`
      (`lib/store/refusal.ts`) with its argv beside the text, on `ReleaseCommitResult`, which the handler renders as a
      `Run:` line. It never names the wrapper, whose rerun finds nothing staged and may not pass `--allow-empty`.
    - QUICK-REFERENCE's refusal-code line gains code 17, in the installed copy and `QUICK-REFERENCE.template.md`, in
      the same commit.

    - Build `test-first` (one behavior at a time):
        - `--close` commits and captures the increment's commit to the cursor's task
        - a multi-commit split's close captures every commit of it
        - each pre-commit check refuses with code 17 and an audit entry, without committing: no linked branch, a named
          ID no task carries, no open task with no IDs, no base ref, a paused work unit
        - a Planning work item with no link refuses naming `arc activate`, and an Active one naming
          `arc deactivate <slug>`, then `arc activate`
        - `--close` and `--no-wrap` strip in either order, and a `--close` after git's first argument reaches git
        - a refusal the interlock or the message preflight makes runs no fetch, and a `pass-through` preflight runs the
          checks before committing
        - a close that fails after the commit exits 1 with `arc task close <ids>` as its typed action, and that rerun
          captures the commit
        - before the flip, `--close` refuses `unsupported` with code 17

### `[ ]` **7.5 Name the close and the deferral in `task-list.close`'s remedy — § 9.4**

- _Goal:_ `task-list.close` refuses a hand edit changing a task's marker to or from closed with remedy text naming the
  repair for that change: the close in both its forms for `[x]`, `arc task defer <id>` for `[ ]` to `[~]`, and a new
  task for any other change to a closed marker — as text, never an argv run as given.

    - `checkTaskListClose` (`lib/store/kinds/task-list/authority-rules.ts`) returns one broken rule however many
      markers an edit changes, so its one remedy text names each change's repair by the marker the edit wrote, grouped
      by the change, with the task IDs; a task line the edit adds already `[x]` or `[~]` takes the repair its marker
      names, as one from `[ ]` does.
    - The rule passes a verb's write (`writer.kind === "verb"`), which is how the close and the deferral write the
      markers it refuses by hand.

    - Build `test-first` (one behavior at a time):
        - a hand `[x]` names `arc release commit --close=<ids>` and the commit, then `arc task close <ids>`
        - a hand `[ ]` to `[~]` names `arc task defer <id>`
        - a hand change from `[x]` to `[~]` or `[ ]`, or from `[~]` to `[ ]`, says a closed task stays closed and
          corrective work takes a new task
        - one edit closing one task and deferring another names both repairs, each with its IDs
        - an added task line already `[x]` names the close, and one already `[~]` names the deferral

### `[ ]` **7.6 The task close verb** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - Commit and close one increment through `arc release commit --close`, and another by a raw commit and
      `arc task close`, over the reference backend and a scripted repository, and request `arc check segment`.
    - Confirm no ratchet floor grew, and that each remaining entry in this change's rerouted files sits in an in-repo
      arm.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Every lifecycle test passes over the in-repo implementation, unchanged but for those a pre-flip fix, a setup
  chunk, or the removal function's porcelain and move changes alter, each named with its change.

- `[ ]` Each pre-flip fix has its test: the seed fix's four cold-start seeds and the spawning arm's refusal; the removal
  check refusing a dirty checkout before an abandon or a Planning park records anything; the workspace closing after
  the transition's records and a throw in the finalize writes leaving it in place; the removal function pruning a
  registration whose folder is gone; and activation refusing a work unit whose `Branch` names base, naming the remedy.

- `[ ]` Each rerouted verb's arm from the flip passes over the reference backend, writing the records the spec's § 2.2
  names, promotion's put and branch cut among them.

- `[ ]` At landing no `arc/store-raw-state`, `arc/surface-names`, or `arc/work-unit-paths` count in
  `eslint-suppressions.json` exceeds its count at the final merged base, in total or per file, but by the callers
  recorded when `completed-index.ts` joined the helper set; every remaining entry in the rerouted parts of the change's
  files sits in an in-repo arm; and `npm run -s lint:ts` passes with no suppression added for a new violation.

- `[ ]` `arc pause`, `arc resume`, `arc handover`, `arc set-class`, `arc task close`, `arc task defer`,
  `arc release commit --close`, `arc materialize` (its branchless arms included), and `arc base sync`'s detached arm
  pass on their success paths and on each refusal they name, and each verb starting at the flip refuses before it,
  naming the path that serves until then.

- `[ ]` Activation's arms pass: adoption from a spawned and from an anchored checkout, renaming the person's branch and
  recording it `adopted`, and keeping a name already in ARC's form; each refusal; the base arm; a linked branch keeping
  its name when `--type` names its type; and the old name's remote deletion as a typed action for a `created` link, as
  text after the merge where its remote-tracking ref holds commits `HEAD` lacks, and never for an adopted one; and
  adoption of a branch never pushed still refreshing base.

- `[ ]` A pause is honored: each verb that advances the work refuses on a paused work unit, naming `arc resume`, and
  each other write proceeds; deactivation keeps the branch; and a start of another person's stub records the starter as
  `Owner` and reports the previous owner.

- `[ ]` The close captures the right commits: every case in the spec's Success Criterion 8 passes — exclusions and
  explicit closes, rebases and sync, attribution of rewritten copies and each named residual, the copy key's stability
  under every pinned source, base refresh and the emptied-set refusal, `--close`'s checks, and the parent cascade.

- `[ ]` The reap keeps its rules: an abandon discards a created branch, an archive's teardown deletes one merge-safe, an
  adopted branch is kept and reported, and an added ref carrying commits of its own is kept and reported.

- `[ ]` The removal function and check return each of their outcomes, an anchored checkout's kept marker among them,
  and every move of a work unit's checkout this change runs or prints takes the doubled-force form.

- `[ ]` A promoted work item projects what a fresh start does; a stub's rename run from a checkout holding a transient
  role writes with no branch switch and no second change request; a rename leaves the branch link under its new name;
  and a spawn with no branch lands at its template's path and rolls back with no branch to delete, while an in-place
  start from a detached checkout leaves `HEAD` where it stood and a re-spawn over a hand-deleted checkout's registration
  clears it and proceeds.

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Off-branch spec-finalized repoint writes the spec Design, `generate-tasks`, and the begin-current-workflow
  action in one checked batch, preserving layered siblings; a refused batch leaves all three fields unchanged, the
  following stage advance is idempotent, and strict stage validation rejects a separate inconsistent tuple (A1).

- `[ ]` Terminal lineage preserves the removed primary's exact branch-link list and cleanup retries use it. Missing
  branch authority refuses, and repair restores the teardown continuation without branch-name inference (A2).

- `[ ]` Ready for integration
