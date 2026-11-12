# Spec (`detailed` · `RFC`): cutover-flip

- **Origin:** [internal] — the `storage-cutover` cut into the subcohort `state-storage/storage-cutover`, which left
  this unit the window and the change that lands at it.

- **Purpose:** Move this repository's operational and planning state off tracked files and Git notes into the ref
  store in one rehearsed window, and change ARC's process to match at the same moment. The window quiesces every
  session, imports the tracked state and notes into `refs/arc/*` on `origin`, merges the change that makes the ref
  backend every command's default along with the rewritten workflows, and retires Git notes.

---

## Introduction / Context

### Where state lives today, and where it goes

ARC keeps each work unit's meta, design, task list, and notes as tracked files under `.arc/active/`, `.arc/backlog/`,
and `.arc/completed/`, its Candidate, integration-boundary, and transition records under `.arc/system/.internal/`, and
each person's working files in Git notes. ADR-035 moves all of it into same-repository refs under `refs/arc/*`, behind
one storage contract, with a gitignored projection at the familiar paths as the working copy, and decides that the
move happens once per repository, in a quiesce, import, and flip window rehearsed first.

The machinery has landed dark. The contract has two implementations: the in-repo one over today's tracked files, and
the ref backend. `createStore` (`lib/store/create.ts`) builds only the in-repo one, and it reports
`capabilities.stateOffBranch` false; the ref factory, `createRefStore`, has one production caller, the hidden
`arc store review-root-repair`. Every store-backed arm the storage program built — the lifecycle executor, locus
derivation, session-init's rebuilt slots, review records, the projection and its write-back — selects itself on that
capability, so none runs in operation. The one-time import (`importTrackedState`, `lib/store/ref/import/entry.ts`;
`runStoreMigrate`) has run in trial form over this repository's real state, clean, but has never placed a store or
published one.

### Why one window

The flip is not a configuration change. Once the ref backend is the default, a checkout running a build from before it
keeps writing tracked state and notes that the import has already read, and a session holding pre-flip workflow text
follows steps the rewrite removed. The window's job is to make the switch at one moment for every checkout and session
on the machine: stop the writers, take the import with its own comparisons as the witness that nothing slipped past,
merge the switch and the rewritten process together, and walk each checkout onto the projection.

Two of its steps cannot simply be undone. The import's push publishes `refs/arc/*` to `origin`, a public repository,
with this repository's personal state published beside its project state, as ADR-035 item 2's same-repository default
has it. And the flip merges to `main`. The design orders the window so that everything before the merge can abort back
to the state the quiesce check recorded, and everything after it fixes forward.

### What this unit delivers, and what it does not

The window's machinery that can land before the flip — the quiesce check, its record and hold, its recompute after the
import and before the merge, its comparisons after the merge, the window's close, the abort's restore, the worktree lock
step, the seal on `arc user load`, and the first rehearsal stage — is a prerequisite unit that lands on `main` ahead of
the window (§ 1.3). This unit delivers the window itself and the change that lands at it: the backend switch and the
code that must change with it, the whole workflow rewrite, the second rehearsal stage, and notes retirement. What the
flip only makes inert, and the strategy and ADR documentation, follow in later units (§ Non-Goals).

## Goals

1. **The ref store is every command's default.** From the merge, every ARC command a checkout runs opens the ref
   backend over this repository's `refs/arc/*`, and no command reads or writes tracked state.
2. **Nothing is lost across the window.** Every tracked work-unit and cohort file, every `.internal/` record, every
   person's notes, and every Errand and claim either becomes a stored record, is accounted for as deliberately left, or
   stops the window; a write that slips past the quiesce refuses the import rather than vanishing.
3. **The process changes once.** Every shipped workflow, method, skill, and always-loaded rule the flip makes false is
   rewritten in the same change, so no session after the flip follows a step that commits state, marks a task by hand,
   needs a planning branch, or writes notes.
4. **The window is rehearsed whole.** A dress rehearsal on a full copy runs every step the window runs, at the head
   that lands, including controlled perturbations that must refuse and then continue after a legitimate repair.
5. **Every step before the merge can abort; every step after it fixes forward.** An abort restores the recorded refs
   and configuration and leaves `main` untouched; a failure after the merge stops the window there and lands its fix.
6. **Git notes retire.** No notes ref remains on `origin`, no build after the flip writes one, and the importing
   machine's old ref survives only where nothing can publish it.

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- **Building the window's machinery.** The quiesce check, its record, hold, recompute, and comparisons after the merge,
  the window's close, the abort's restore, the worktree lock step, the seal on `arc user load`, and the first rehearsal
  stage with its copy driver, accounting case, and chain comparison are `cutover-window-tooling`'s, landed on `main`
  ahead of the window (§ 1.3). This unit runs them.
- **Deleting what the flip makes inert.** The flip leaves in place, unreached, the code its switch stops selecting: the
  in-repo store and every pre-flip arm, the sealing guard's in-repo arm, the override and refusal of § 3 with the CI
  steps' condition and the test setup's clearing, branch-tree readers, lifecycle classification's inert arms, and the
  write-context guard (`cutover-in-repo-removal`); the user-facing verbs and options that refuse or do nothing after the
  flip, the lifecycle hook checks, the CI planning classifier, the merge-gate recipe, the import's transform, and the
  window's leftovers (`cutover-tracked-state-removal`); notes-specific sync, its configuration keys, the sync-state ref,
  the notes residue refs, and the old notes ref (`cutover-notes-removal`); and the old decomposition machine
  (`cutover-decompose-removal`). A check the flip makes vacuous goes with them unless something after the flip reads its
  result as assurance (§ 1.1).
- **The strategy and ADR documentation.** The strategies the store model changes, ADR supersessions and amendments
  other than this unit's two (§ 16), and `TECHNICAL-OVERVIEW.md` § Cross-Machine User State are
  `cutover-documentation`'s. This unit rewrites only always-loaded and workflow text an agent acts on (§ 8).
- **A second repository.** The import serves this repository alone; another project installs fresh after the flip
  lands, through `arc init`'s store setup (§ 4.7). No step here is written for one.
- **A hosted rehearsal.** No throwaway hosted repository is rehearsed; the canaries carry the hosted paths (§ 9.11).
- **Fixing before the flip what the flip replaces,** such as partial protection's planning-entry redirect (§ 9.7).
- **Relaxing the rebase rule.** The flip drops its notes reason and keeps it (§ 8.16); a configurable history policy is
  separate work.

## Proposed Design

### 1. Boundary and prerequisites

#### 1.1 What lands at the flip

A change lands at the flip when it would break or mislead once state leaves the branch: the rehearsal and the quiesce
with a check that it holds, the state remote's designation and the import, the switch and the code that must change
with it, the whole workflow rewrite, notes retirement, and any check that would fail once tracked state is gone or
whose result something after the flip reads as assurance. A check that passes vacuously and that nothing reads is
inert, and follows. Code the flip only makes inert follows too, as do the strategy and ADR documentation.

No lifecycle hook check, no part of the CI planning classifier, and no ROADMAP remedy refuses the flip's own deletion
commit: each reads files a deletion leaves out of its selection (`.arc/system/.internal/githooks/pre-commit`), most
selecting staged files with `--diff-filter=ACMR`, the task-list staging check only unstaged modifications, and the
ROADMAP remedy only unmerged paths in a merge (`lib/status/roadmap-conflict-auto-remedy.ts`). No tracked document
outside the state roots, `docs/`, and the tests links into those roots. So every such check follows; the content rules
the hook checks enforce run as the record kinds' write checks, the cohort record's member sections added at the flip
(§ 4.10, § 17.2); and only the workflow prose acting on two classifier commands changes at the flip (§ 8.13).

#### 1.2 The boundary stays one unit

`assess-boundary-fit` returns **stays one work unit**, re-checked at this spec's entry, when the unit crossed the size
marks. Of the parts, only the window's machinery — what it runs before the flip, its comparisons after the merge, and
its close — can sit inert on `main` ahead of the window while the window keeps one merge, and the window runs the
quiesce check on `main`'s pre-flip build, so that machinery is a prerequisite unit (§ 1.3). The rest is held whole
because one review reads it chunk by chunk: the flip code; the test changes; the workflow rewrite, with its synced
package copy read once; and the second rehearsal stage with the destructive CLI matrix. The commit that deletes tracked
state is data, checked by the accounting case and CI over the post-deletion tree rather than by code review. Each
deletion pass that follows stays its own unit, since another branch and review would not shrink the subsystem a reviewer
must check.

#### 1.3 Prerequisites and their contracts

Of the members this unit depends on, the three below have not landed. Each item this spec rests on an unlanded member
is stated as that member's contract with the condition under which it holds, and re-checked when the member lands; a
contract that does not hold when its member lands is a forward amendment to this spec.

- **`cutover-window-tooling`** lands on `main` before the window, its first rehearsal stage clean, inert until run. It
  provides:
    - **the quiesce check,** run from the importing checkout on `main`'s pre-flip build immediately before the import,
      refusing with each failing checkout named on the conditions its specification enumerates, among them a dirty
      checkout or one off its upstream, an unlocked marked linked checkout, an ended holder or husk, a staged
      decomposition cut, a checkout not descending from the window tooling's own merge, which carries the sealing guard
      and its seal on `arc user load`, a live branch changing tracked state outside its own work item's records, `main`
      not a proper ancestor of the flip's branch, a host that squashes or rebases, an open pull request into `main`
      other than the flip's, any Errand record in any state or Errand identity ref whose `origin` tip the local ref does
      not equal, an `origin`-only ref included, a claim held by an identity other than the configured one, a live work
      unit whose records `main` changed after the branch copy the import reads forked, other than a parked unit's
      pointer, which the import reads on `main`, and a live work unit with a copy, other than a stale one, that the
      lifecycle composition passes over and that is not an ancestor of the copy it selects, the same branch's local and
      fetched copies included (§ 13.4);
    - **the record and hold:** what its specification enumerates, held under `refs/arc-window/`, among them each
      worktree's `HEAD`, a digest of its personal files, each branch's local and fetched tips and each live branch's tip
      on the host, `origin/main`'s tip read from the host and required to equal the importing checkout's `HEAD`, and
      every `refs/arc/*` tip and push tracking ref locally and on `origin`;
    - **the recompute** after the import, and again as the last act before the flip's merge, of what its specification
      enumerates, among them the worktree heads, digests, live branch tips, and `origin/main`'s tip, the flip's own
      branch and checkout compared at the last act as their recorded head plus its one deletion commit, and the absence
      of a landed Errand record (`work-item/record`), which an Errand opened between the check and the import's read
      would leave (§ 13.3), each stopping the window on any change; and after the merge, for § 10.6, the comparison of
      each live branch's tips, on the host as well as locally, and each checkout's personal digest with the record,
      recording under the hold a branch's moved range, or a deleted branch's gone range;
    - **the auto-merge refusal:** the check, the last read before the merge, and the restore each refuse while the
      flip's pull request has auto-merge armed (remedy `gh pr merge --disable-auto`);
    - **the close** (§ 10.7), which deletes the hold, lists each moved or gone range recorded under it, records the
      Owner's confirmation that a range was re-applied, and refuses on the conditions its specification enumerates,
      among them until the flip's recorded head is reachable from the host's `main`, while any registered checkout's
      `HEAD` tree tracks a file under § 3.2's paths, and until each recorded range is confirmed;
    - **the abort's restore:** every recorded `refs/arc/*` tip back, locally and on `origin` once published, every other
      such ref and every unrecorded tracking ref deleted, the store directories (`store`, `store-migrate-build`, and
      `store-migrate-old` under `<commonDir>/arc/`) removed, `remote.origin.arc-state` unset, and the hold deleted, each
      push to `origin` leased on the value the window left, so a ref another writer moved or deleted on `origin`, or a
      local one the window never writes, such as delivery's or an Errand or retirement command's temporary ref, or,
      where the import has not landed, a local Errand identity ref moved from or deleted at its held tip, refuses before
      the first push until the Owner accepts the value found (`restore --accept <ref>=<tip>`, or `<ref>=absent` for a
      deleted ref), which covers that ref on either side; where the import has landed, comparing what it consumed of
      each identity ref with that ref's held tip and refusing on a difference, each differing record printed in full
      since the store the restore deletes holds the only copy, until the Owner accepts what the import consumed
      (`<ref>=<kept tip>` while the import's kept tips remain, `<ref>=absent` once they are dropped), the outcome
      recorded at `refs/arc-window/restore` so a restart does not compare again; and refusing once the flip has merged,
      which it tests first, again before its first push to `origin`, and again before it deletes `origin`'s registry
      ref, restoring `origin` before the local refs, so a merge found at that last test leaves `origin`'s registry ref
      and the local store whole for the fix-forward (§ 11);
    - **the worktree lock step,** locking each marked linked checkout that carries no lock with the projection's
      reason;
    - **the seal on `arc user load`:** the sealing guard added to `runUserLoad` (`commands/user/save-load.ts`), so every
      pre-flip build refuses a load once the registry ref exists (§ 12), with a test in the sealing guard's suite
      (`__tests__/integration/store-imported-seal.test.ts`);
    - **Stage 1** (§ 9.1), with the copy driver, copy safety, the accounting case, and the chain comparison that
      Stage 2 reuses.
- **`projection-worktrees`** lands its checkout isolation and fan-out: each checkout's first materialization
  (`spec-projection-worktrees.md` § 2.2, § 2.5), the withholding of a pre-flip file at a projected path whose content
  differs from the record laid there or where no record is laid, and the persist step's refusal over a withheld file
  (§ 2.5, § 12.2); the tracked `.arc/user/.npmignore` policy file each linked checkout needs before the projection
  writes into any root, with any untracked installer copy deleted from every checkout first (§ 2.5); the rebuild of
  deleted files ahead of `arc sync`'s network steps in `handleSync` (`handlers/sync.ts`, § 2.4); and `arc save`
  clearing the changed mark without setting a cadence (§ 11.7).
- **`projection-team-scale`** lands the read-only archive: from the flip, a file under `completed/` lays read-only with
  a notice naming `arc edit`, unless its worktree has it opened. The read-only lay is how the archive is laid, not an
  edit right: edit rights stay as `spec-projection-write-back.md` § 8.1 and § 8.4 set them, so the archived work unit's
  owner may still edit and anyone may edit an archived cohort document, while another person's archived work stays
  protected by those rights, its notice naming the owner. `arc edit <path>` opens one file in that worktree, changing no
  content, and refuses wherever the edit itself would be refused; it opens a new path only inside an archived work
  unit's folder, once the file exists there. `arc save` lands the edit and lays the file read-only again. The errata
  convention (§ 8.12) is written against that contract. If the unit has not landed by the window, the convention is
  written against write-back's in-place archived edit (`spec-projection-write-back.md` § 8.4) and amended when it lands.

`cohort-identity-verbs` has landed: `arc cohort close`, `arc cohort remove`, `arc rename <slug|uid>` for work units and
cohorts, and UID operands for `arc errand close` and `arc errand abandon` (`spec-cohort-identity-verbs.md`), which
refuse `unsupported` before the flip and whose workflow text is this unit's (§ 8.6).

`projection-write-back` has landed. This spec rests on its `arc save` and write-back (§ 18), each hand-editable
kind's parser inventory (§ 7.6, its A3), the selection and changed mark (§ 11.7), its identity-root rules (§ 9), and
`readProjectedSelection` (`lib/checks/projected-selection.ts`), which it connected.

`projection-base-retention` corrects four residuals in the projection's field schedule for a file other than Markdown,
which bite once projection is live. Its placement relative to the window is § 17's.

### 2. The backend switch

#### 2.1 The switch

`createStore` (`lib/store/create.ts`), today `lazyStore(ports.checkoutRoot, false, ...)` over `createInRepoBackend`,
builds the ref backend instead, so every store a command opens reports `stateOffBranch` true. `openDefaultStore`
(`handlers/lifecycle-shared.ts`) and every other default caller go through it. This is the flip; the rest of this spec
follows from it.

`createStore` keeps its signature, so no caller changes, and composes the ref backend's ports from the caller's:

- it carries over every port a caller supplies and the in-repo store honored — `exec`, `execInput`, `fs`, `clock`,
  `checkoutRoot`, `identity`, and `remote` — so the callers that pass an identity today (among them `recover.ts`,
  `session-context.ts`, `join.ts`, `errand-merge-composition.ts`, and `personal-command-store.ts`) keep it;
- it takes the ports only the ref backend needs — `rawExec`, `sleep`, `random`, `actor`, and the byte-level file
  access — from `createDefaultRefStorePorts` (`lib/store/default-ports.ts`), and `backingRepository` from the
  checkout's tracked pointer (`readBackingRepository`), as `createStoreCommandPorts` (`commands/store-ports.ts`) does;
- `locks` has no ref counterpart: the ref backend serializes its own writes (`withRefLocks`,
  `lib/store/ref/write-locks.ts`), so a caller's notes-lock override (`personal-command-store.ts`) goes inert.

The override (§ 3.1) is the only other branch in `createStore`. `runStoreMigrate` builds the import's source through
`createStore`, so a flip build never imports: over a tree that tracks state the tracked-state refusal stops it
(§ 3.2), and over an imported store the landing refuses `occupied` (`landImportRefs`). The window imports from `main`'s
pre-flip build (§ 10.4).

#### 2.2 What the switch turns on

Each mechanism below already has its store arm on `main`, selected by the store's capability or by the ref backend's
own refusal. The switch turns each on; the change adds no code for it, and § 9 exercises it.

| Mechanism                                                         | Store arm                                                                                                                                                                                                                           | Selected by                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Candidate and transition records, their retirement and withdrawal | `readCandidateRecordVersioned`, `writeCandidateRecord` (`lib/store/kinds/review/candidate/access.ts`); `storedReviewWithdrawal` (`lib/work-unit/verbs/reopen-store.ts`); `planRefRetirements` (`lib/store/ref/write-retirement.ts`) | `stateOffBranch` in the access and reopen paths            |
| Candidate supersession and `recordRevision`                       | `readStoredCandidateSupersessionChain`, `readStoredCandidateRecordRevision` (`stored-history.ts`)                                                                                                                                   | `stateOffBranch` in `candidate/history.ts`                 |
| Lifecycle transitions and start placement                         | `executeStoreTransition` (`lib/work-unit/lifecycle-store-executor.ts`); `runStoreGraduate`, `runStoreColdStart`, `runStoreStub`, `moveBacklogThroughStore`                                                                          | `stateOffBranch` in `lifecycle-executor.ts` and `start.ts` |
| Retirement, teardown, rename, pause                               | `runStoreAbandon`, `runStoreTeardown`, `runStoreRename`, `runPause` / `runResumePaused`; `arc park` refuses                                                                                                                         | `usesOffBranchState` in each verb                          |
| In-flight derivation and the oracle slots                         | `deriveStoreInFlight` (`lib/git/in-flight-store.ts`); `createStoreSessionProbes` (`handlers/status/store-session.ts`)                                                                                                               | `stateOffBranch` in `handlers/status.ts`                   |
| Locus derivation                                                  | `readStoreCheckout`, `readStoreWorkUnitEvidence` (`lib/locus/`)                                                                                                                                                                     | `stateOffBranch` in `derived-evidence.ts`                  |
| Current work unit and the one-active guard                        | `resolveCurrentWorkUnit` (`lib/store/current-work-unit.ts`); `readStoreOccupancy`                                                                                                                                                   | the ref read's `held-here` refusal; `usesOffBranchState`   |
| Checkout claims by UID and unbound markers                        | `workUnitCheckoutClaim`; `classifyUnboundMarker`; `runStoreMaterialize`; `runLocusRelease`                                                                                                                                          | `stateOffBranch` in the claim and release paths            |
| Planning committability                                           | `arc plan check` and `arc housekeep check` answer `proceed`                                                                                                                                                                         | `usesOffBranchState` in `handlers/plan.ts`, `housekeep.ts` |
| Reconciliation and stale-worktree slots                           | `runCurrentWuReconcileSessionProbe`; `runStaleWorktreeSweep`'s store arm                                                                                                                                                            | `stateOffBranch`                                           |
| `STATUS.USER`                                                     | `handleStoreUserStatus`, rendered on demand and kept out of the import                                                                                                                                                              | `usesOffBranchState` in `handlers/status/views.ts`         |
| Personal setup in `init`, `join`, `user add`                      | `preparePersonalIdentitySetup`, `seedPersonalIdentityRecords`, writing absent-only                                                                                                                                                  | `stateOffBranch` in `lib/personal-identity-setup.ts`       |
| Inbound back-pressure                                             | `readInboundBackPressure`; `arc inbox <slug>`'s `retriage` offer (`lib/inbox/listing.ts`)                                                                                                                                           | `stateOffBranch`                                           |
| Handoff and recovery continuity                                   | `runHandoffWrite`; `deriveStoreRestateCandidates`; `resolveRecoveryStateBasis`                                                                                                                                                      | `stateOffBranch`                                           |
| Session context, scratch, adversarial records                     | `writeMetaSessionContext`; `planScratchReconcile`; `recordApprovedAdversarialPass`                                                                                                                                                  | `stateOffBranch`                                           |
| User state in session-init                                        | `probeStoreUserPull`; `createStoreUserReferencePrepareContext`                                                                                                                                                                      | `stateOffBranch` in `handlers/status.ts`                   |
| Errand records and claims                                         | `acquireStoreErrands`, `acquireStoreClaims` (`lib/errand/store-discovery.ts`); `transitionStoreErrand`                                                                                                                              | `stateOffBranch`                                           |
| Foreign-artifact detection                                        | `runStoreErrandOverlap` (`lib/errand/store-overlap.ts`)                                                                                                                                                                             | `stateOffBranch` in `handlers/errand.ts`                   |
| `arc view`                                                        | `resolveStoreArtifactRequest`, `resolveStoreViewTarget`                                                                                                                                                                             | `stateOffBranch`                                           |
| Integration readiness and summaries                               | `evaluateStoredWorkUnitReadiness` (`scripts/review-gate/readiness-store.ts`), reading Completion and Release Notes from the stored meta; `readStoredLifecycleSummary`                                                               | `usesOffBranchState` in `readiness.ts`                     |
| Durable review records                                            | `bindReviewFamilyPorts`; `persistNativeTerminusDecision`                                                                                                                                                                            | `stateOffBranch` in `family-ports.ts`                      |
| Promotion                                                         | `promoteStoreErrandAtRuntime`, which settles in its write                                                                                                                                                                           | `stateOffBranch` in `promote-runtime.ts`                   |

#### 2.3 Callers that must not fall back

A store-optional gate (`options.store?.capabilities.stateOffBranch`) takes the pre-flip arm when its caller passes no
store, and that arm reads deleted tracked state. Every live caller passes one or reaches `createStore` itself, `arc
errand promote` among them (`handlers/errand.ts`); the remaining reads of tracked state with no gate are the import's
deliberate legacy reads, run only from the pre-flip build. A pre-flip arm reached after the flip reads files and Git
rather than a store, so it reads what the deletion commit removed; Stage 2's end-to-end work unit and destructive CLI
matrix run over the flipped copy, where that read fails or contradicts the store, and surface it (§ 9.2).

Three readers of the deleted files take no capability and stay wrong until the change handles them: the delivery rename
source and the base-drift resolver, which the flip moves (§ 4.3, § 4.4), and the notes commands' read of
`.arc/completed/` at the base tip (`commands/user/save-load.ts`, `sync-status.ts`, `compact.ts`), which the sealing
guard refuses or which report on notes the flip retires. Delivery's `from-tasks` reads the meta and task list through a
caller-supplied path (`readFromTasksInputs`, `handlers/delivery.ts`) and refuses when the file is absent; delivery is
paused, and it moves onto the store with the delivery rebuild.

### 3. The flip's own checkout, and an unimported repository

Once the switch is committed, every ARC command in the flip's checkout runs the flip build, its pre-commit hook
included (`node_modules/.bin/arc`, `.arc/system/.internal/githooks/pre-commit`). Against a repository not yet
imported, that build would open an empty ref store: its reads would find no work unit, and its first write would
create `<commonDir>/arc/store`, shared by every worktree on the machine (`writeRefRepository`,
`lib/store/ref/repository.ts`). A lifecycle write's lineage record lives under the registry ref (the `lineage` family,
`lib/store/registry.ts`), so it would create the ref that seals every pre-flip checkout (`storeImported`,
`lib/store/store-imported.ts`), and a stray store makes the import refuse as occupied or as a layout mismatch
(`landImportRefs`, `lib/store/ref/import/land.ts`). Two pieces close this.

#### 3.1 The in-repo override

An override read from the environment makes `createStore` build the in-repo implementation. The capability stays a
fixed property of the store a command builds; nothing reads the repository to choose. Until its merge, the flip's
checkout sets the override in the environment of every command it runs, `git` included, since a hook inherits the
environment of the `git` process that runs it. Under the flip build, every `arc` command builds a store in
write-back's root hook (`registerProjectionHooks`, `lib/store/projection/command-hooks.ts`), beside the store this
repository's hook builds when a cohort record or a planned meta is staged (`validate-cohort-consistency.ts`). Under the
override, `createStore` builds the in-repo implementation, whose capability leaves the projection off
(`initializeProjection`, `lib/store/projection/engine.ts`), so no command in that checkout projects or builds a ref
store before the merge. The flip's own lifecycle — review, verification, pre-publication — therefore runs on the
in-repo implementation up to the import, and its deletion commit is made under the override after it (§ 10.5).

The override reaches no test. A check's command inherits its caller's environment apart from the four channels the check
engine clears (`CHECK_EXECUTION_ENVIRONMENT`, `lib/checks/environment-policy.ts`), so the test setup clears the
override, and no test, nor any CLI a test spawns, sees it from the flip's checkout. The routed checks — the type checks,
`lint:ts`, and the test tiers — run no ARC command over the checkout, and a runner applies only a check's declared
`environment_inputs` (`.arc/system/arc-checks.yml`), so none needs it. CI runs the CLI over its own checkout in two
steps (`check gate merge --ci --dry-run` and `check run lint:md:underwrap`, `.github/workflows/ci.yml`); each sets the
override in its own step environment only when the run's head branch is the flip's and its tree still tracks a file
under § 3.2's paths. The head with the deletion commit applied, the one that merges, therefore runs without it, as the
run on a branch of its own did ahead of the window (§ 10.1), and so does every later pull request, which still meets
§ 3.2's refusal in CI if its tree tracks state. The lane-attestation workflow also runs the CLI
(`.github/workflows/arc-lane-attestation.yml`), `review planning-lane` over a pull request's base and head, but from a
build of the base's own checkout (`github.workflow_sha`), so it needs no override: before the merge it runs the pre-flip
build, and after it the flip build over a tree that tracks no state.

#### 3.2 The tracked-state refusal

Without the override, the flip build refuses to open a ref store in a checkout whose `HEAD` tree still tracks ARC state
— a file under `.arc/active/`, `.arc/backlog/`, or `.arc/completed/`, or in `.arc/system/.internal/candidates/` or
`.arc/system/.internal/transitions/` — whether or not the registry ref exists. The refusal is recoverable, reads no
remote, and names the remedy for the condition it observes: where `refs/arc/project/registry` exists locally, take the
window's steps for the checkout's branch and checkout (§ 10.6), deleting its tracked state and merging `main`; where it
is absent, which may mean only that the store is unfetched, as in CI or a fresh clone, it names both routes with the
fact that decides between them — the same steps where `origin`'s `main` no longer tracks ARC state, and otherwise an
import from the pre-flip build. The remedy's commit, merge, and push run this repository's Git hooks, which call the CLI
— `arc check pre-commit`, `commit-msg`, and `pre-push`, and the pre-commit hook's `hook-*` commands
(`.arc/system/.internal/githooks/`) — and every command builds a store in write-back's root hook (§ 3.1). While the
refusal's condition holds, those hook commands therefore run with the projection off and open no ref store, as a command
with no identity runs under the skip switch (`spec-projection-worktrees.md` § 2.5); none needs a store on a commit that
only deletes, since no gate check they select reads one and the pre-commit hook's cohort check
(`validate-cohort-consistency.ts`) runs only over a staged cohort record or planned meta. Once the deletion is
committed, `HEAD` tracks nothing and the checkout opens its store as a clone made after the flip does. The refusal reads
`HEAD` rather than the index, so an abandoned commit leaves no projected checkout over a tree that still tracks state.
It never names the override, which only the flip's own checkout sets (§ 3.1). Any other command run in such a checkout
refuses rather than creating a store or projecting, so the flip's checkout cannot project before its deletion commit
even if a command there runs without the override.

A clone made after the flip tracks no such file, so it opens its store and pulls. A checkout that merges `main` while
its branch still tracks its own records refuses until it deletes them. A pre-flip clone that has not merged the flip
runs its own pre-flip build, which this refusal does not reach; once that clone holds the registry ref, the sealing
guard refuses its writes (`refuseWriteIfStoreImported`).

Both pieces leave with the in-repo implementation, the CI steps' condition, the test setup's clearing, and the hook
commands' exemption with them. Tests that target the in-repo backend build it explicitly through `createInRepoBackend`
(`lib/store/in-repo/backend.ts`), mostly in the store test helpers (`__tests__/helpers/store/`); no suite-wide override
is set, since one would hide the flipped default from the tests that should see it and would reach the CLI processes the
end-to-end and integration tests spawn (§ 7).

### 4. Store paths the flip completes

Each item below is a path the switch would otherwise leave wrong, missing, or misleading.

#### 4.1 `arc sync` onto the store's `pull` and `push`

The contract's `sync()` became `push({ carry? })` beside `pull()`, while `arc sync` keeps its name and runs both,
pulling then pushing (`spec-storage-ref-backend.md` § 2.1, § 6.1). The flip points `handleSync` (`handlers/sync.ts`)
at `pull` then `push`, after `projection-worktrees`' rebuild of deleted files, reports the push's figures through the
tripwire report (`spec-seam-locus.md` § 9.3), and drops the notes leg's call.

State publishes first and alone, whatever the branch push's outcome, and each leg is reported separately. The legs
pair today only because notes are keyed to commits: `NOTES_BLOCK_WORKTREE_STATES` (`handlers/sync.ts`) holds the notes
leg back on those worktree states, and `runPairedPush` (`commands/user/paired-push.ts`) skips notes when the branch
push fails. The ref store keys nothing to a commit a remote must hold. A task capture may already name an unpushed
commit: task close checks local reachability only (`explicitCommits`, `lib/work-unit/verbs/task-close.ts`), the import
derives captures from local tips (`importTaskCaptures`, `lib/store/ref/import/code-captures.ts`), and a capture's copy
key (`computeCopyKeys`, `lib/git/copy-key.ts`) survives a rebase that leaves the patch text unchanged, so publishing
state ahead of the branch changes no reader. Sync still pushes the branch.

On a clone with no designated state remote, the rewired sync refuses `designation-needed`, as `arc join` and session
start's pull already do (`handlers/join.ts`, `lib/session-init/store-user-pull.ts`).

#### 4.2 The capture gates onto `arc inbox`

`create-spec`'s owner's pass, `activate-work-unit`'s pre-condition gate, and the start of `verify-work-unit` dispatch
on `arc user inbox-list --target <slug>` (`handlers/user-inbox-list.ts`, `lib/user-sync/inbox-target.ts`), which lists
the personal-inbox captures whose `WU_Target` line names a work unit. From the flip, `arc inbox <list>`, for
`personal`, `project`, or a work item's slug, replaces it: `--target <slug>` keeps the `clear` / `named` / `refused`
result with each row's ID and version, and `arc inbox <slug>` lists a work unit's inbound list with its pending count
and oldest age (`spec-seam-locus.md` § 7.1). The command is registered dormant today (`DormantStoreCommand`'s
`inbox`, `commands/store-command-support.ts`) and selects its store arm from the flip. Since captures route straight
into a work unit's inbound list (`spec-storage-contract.md` D11), each gate also reads the work unit's pending inbound
count. `arc user inbox-list` is inert from the flip.

#### 4.3 The delivery rename source refuses a missing folder

`GitDeliveryRenameTransitionSource` (`lib/delivery/plan-resolution.ts`) lists the transition records on a ref through
raw `git`, and `ls-tree` on a missing path exits 0, so after the untrack (§ 5.4) it would read empty and resolve a plan
stored under a former name as `no-match`. The flip makes it refuse when the transition folder is absent at the ref, so
the missed reader fails loudly. Delivery is paused; moving its plan resolution onto store reads follows with the
delivery rebuild.

#### 4.4 The base-drift resolver onto the store

`createCompletedMetaResolver` (`lib/base-drift/current-adapters.ts`) names an integration by the completed meta its
base commit adds (`readAddedCompletedMetas`) and by the archive in the base tree (`readCompletedEvidenceFromRef`).
Once no completed meta lands on base, the drift report would lose which work unit each integration was, and a squash
or rebase project's checkpoint would refuse reconciliation (`analyzeIntegrationEvidence`,
`lib/git/base-integration-evidence.ts`). From the flip, the resolver reads the store's completed records
(`readStoreCompletedEvidence`, `lib/store/lifecycle-completed.ts`) and matches a pull request by the number in the
archived meta's `PR URL`; two archived metas naming one pull request refuse rather than pick.

#### 4.5 The store archive records `PR URL` and `Completed`

`runArchive` hands an off-branch store to `runStoreArchive` (`lib/work-unit/verbs/archive-store.ts`) before it reads
either parameter; the store arm takes the quarter from the clock and writes only the cleared session fields, so an
archived meta would lose both fields while its readers still take them (`completedRecord`,
`lib/store/lifecycle-completed.ts`; `completed-index.ts`; § 4.4). The flip's store arm writes both in its one batch,
`--completed` defaulting to the ship day as the in-repo arm does, and `archive-work-unit.md` keeps passing `--pr-url`.

#### 4.6 Integration checkpoint records keyed by work-unit UID

The checkpoint persists each composition at `<workUnitRoot>/.internal/integration-checkpoints/<digest>.json`
(`recordPath`, `scripts/integration/checkpoint-store.ts`), where the work-unit root is the per-work-unit workspace
`.arc/user/<id>/<slug>/` (`createUserSurfaceResolver`, `lib/user-surfaces.ts`). From the flip that workspace retires,
and a record keyed by slug is orphaned by `arc rename`. On the store path the checkpoint writes and reads its records
under the identity's `.internal/integration-checkpoints/<work-unit-uid>/`, as the contract's machine-local set
places them (`spec-storage-contract.md`, machine-local state). The path stays machine-local, never stored, synced, or
projected (`MACHINE_LOCAL_PATHS`, `lib/store/registry.ts`). No record crosses the window: a checkpoint handle is an
approval for one head and is retaken (§ 10.1).

#### 4.7 `arc init`'s state remote and project ID

From the flip, `arc init` designates the code remote as the state remote at creation, where one exists, and mints the
project ID into the registry's create-only identity record, pulling first and adopting an ID it finds where a remote
is already designated (`spec-storage-ref-backend.md` § 9.2, § 9.8). Today `commands/init.ts` does neither, and a fresh
install after the flip needs both. This repository takes its project ID from the import, which adopts the review
gate's repository ID (`importTrackedState`).

#### 4.8 The Errand branch's UID suffix

From the flip, `arc errand open` names the Errand's branch `<type>/<slug>-<suffix>`, its type one of
`ERRAND_BRANCH_TYPES` (`lib/errand/branch-type.ts`) and the suffix the first eight characters of the Errand's UID, and
records its branch link with that ref. Today `lib/errand/open.ts` and `lib/session-init/errand-branch-cut.ts` build
`<type>/<slug>`.

Every reader that derives an Errand's slug from its branch name, or matches an Errand's branch exactly, changes with the
builders and takes only the suffixed form, since no Errand record crosses the window (§ 13.3); under the store, an
exact match compares the branch with the Errand record's branch link. Among them:

- an Errand record's branch validation (`validateOrdinaryNamespace`, `lib/errand/identity-record.ts`), which the
  record's schema applies at every read;
- resume's recorded-branch check (`lib/errand/open.ts`);
- review readiness's identity facts (`identityFacts`, `scripts/review-gate/readiness.ts`), which `arc errand merge`
  reaches when it releases the merge lock (`releaseMergeLock`, `scripts/review-gate/merge-lock.ts`): for an Errand
  vehicle, the head branch must equal the Errand record's branch link, read through the store as the work-unit arm
  reads the stored work unit, and the work-unit slug test (`branchToWorkUnitSlug`, `lib/work-unit/work-unit-slug.ts`)
  does not apply to it. A test covers a suffixed Errand passing and a mismatched branch refusing.

Task generation takes the complete list from a search at its own head for `branchToWorkUnitSlug`, `isErrandBranchType`
and `ERRAND_BRANCH_TYPES`, and splits of a head or branch name on `/`, classifying each hit as reaching an Errand's
branch or not. The grooming claim and the housekeep routing record keep their own checks, and the import's
created-branch test (`lib/store/ref/import/code-links.ts`), which reads only names from before the flip, stays. The
suffix keeps two same-slug Errands from different clones off one remote branch.

#### 4.9 `arc store` un-hidden and documented

`arc store` is registered hidden (`program.command("store", { hidden: true })`, `cli.ts`). The flip shows it in help
and documents it, and it joins QUICK-REFERENCE's verb index (§ 8.16), as the ref backend's rollout contract expects
(`spec-storage-ref-backend.md` § Cross-cutting Considerations, "Migration and rollout").

#### 4.10 The cohort record's member sections

A cohort record's per-member sections, each `` ### `<slug>` `` under `## Members`, are a subset of its derived
membership, and `strategy-work-organization.md` § The `cohort-{name}.md` record says a section whose work unit was
renamed or removed "is caught by the cohort-consistency invariant". Only the pre-commit hook's cohort check enforces it,
over a staged cohort record (`reportOrphanCohortMemberSections`, `lib/store/kinds/cohort/member-section-report.ts`,
through `checkCohortConsistency`, `lib/active/cohort-consistency.ts`), and once state leaves the branch no cohort record
is staged. The store's cohort check (`checkCohortDocument`, `lib/store/kinds/cohort/check.ts`) holds the Purpose,
Parent, retention, closeout, and rename rules but not this one, so the flip adds it there as `cohort.member-sections`.

Like the task list's close rule and the meta's verb-owned fields (`checkTaskListClose`, `checkMetaVerbOwnedField`), it
checks a hand edit — a write by write-back or `arc save` (`HAND_EDIT_VERBS`, `lib/store/links.ts`;
`deriveWriteCheckWriter`, `lib/store/write-check.ts`) — and passes a verb's write. A hand edit whose resulting cohort
record names under `## Members` a slug that is not the current name of a member of that cohort refuses, naming each such
slug, with the remedy to remove or rename the section, or to save the member's meta naming the cohort first and retry,
since each hand edit persists as its own write (§ 8.6). A member is a work unit, live or completed, whose `Cohort`
field's last segment names the cohort, by its current name or a former one: the store's holdings of the cohort
(`observeAllHoldings`, `lib/store/kinds/cohort/check-support.ts`) taken only from `Cohort` fields and only at that last
segment (`observeCohortHoldings`, `lib/store/kinds/cohort/holdings.ts`), which are the hook's direct members
(`checkCohortConsistency`) with the cohort's former names resolved. A subcohort, which holds the cohort through its
`Parent`, a subcohort's member, which holds it through an earlier segment, and a member's former name are not members,
so a section naming any of them refuses.

A verb never refuses itself over a section it leaves. An at-cap retirement's terminal batch writes the parent cohort
record's fan-out block while it removes the origin, and keeps the origin's section (`terminalFanout`,
`lib/decompose/terminal-records.ts`; `finishDecomposeRetirement`, `lib/decompose/finish.ts`). `arc rename` rewrites a
member's heading in its own batch only where no other holder of the cohort has the old name as its current name or a
former one, and otherwise suggests the edit (`planRenameMemberHeading`, `lib/store/rename-member-heading.ts`); a kept
heading that another member's current name matches stays that member's section. The retirement's kept section, a kept
heading that only a former name matches, and a section a removed member left each refuse the record's next hand edit
until removed or renamed, as the hook refuses the next commit that stages the record today. No cohort record in this
repository has such a section.

### 5. Tracked and installed files leaving the projected roots

From the flip, `.arc/active/`, `.arc/backlog/`, and `.arc/completed/` are projected roots, gitignored and laid by the
projection. No tracked or installed file may remain in one: the projection never adopts a file no record claims, so
every checkout removal refuses over it, and an install there writes over or beside projected files.

#### 5.1 The shared roots untracked

The flip's deletion commit removes every tracked file under the three roots, `main`'s shared roots' files and the
flip's own `.arc/active/` files, after the import has read them (§ 10.5). Every other live branch but `main` deletes
every tracked file under those roots and the `.internal/` records' folders after the merge (§ 10.6).

#### 5.2 The installed files deleted

The installer writes three files into projected roots (`init-recipe.json`'s `pm.mode == arc-in-git` arm):

- `completed/README.md`, a Configurable file that `arc update` reinstalls and no record claims;
- `backlog/ATOMIC-INBOX.md`, from a Scaffolded template, installed at the path the projection writes the project
  inbox to, so an install there writes over a projected file;
- `backlog/ROADMAP.md`, from a Scaffolded template, installed at the layout's `project-document` address
  (`lib/layout/projection.ts`), which no record claims and the projection never adopts.

The flip deletes the two templates and `completed/README.md` outright, with their `init-recipe.json`, `SCAFFOLDED_FILES`
and `CONFIGURABLE_FILES` (`lib/classification.ts`), and `manifest.json` entries, rather than relocating them within the
package's `arc/`; anything kept for another purpose moves outside `arc/`, since the install-claims rebuild that follows
requires every file under `arc/` to carry a claim (`spec-adopter-install-authority.md` § 1.3, § 2, § 4). The recipe's
structure stays as it is. `strategy-file-classification.md`'s example of a template's suffix stripped at install changes
with them.

#### 5.3 The ROADMAP presence test

The flip removes `verify-integrity.sh`'s presence test for `ROADMAP.md`, in both copies. With § 5.2 this is the first
step of the two-step ROADMAP removal: each piece acts once no ROADMAP file exists — the installer writing the template
into a projected root, `arc health` reporting the manifest entry missing, and the presence test failing
(`spec-seam-status-roadmap.md` § 9.4). Status's and `arc view`'s store versions are built and select themselves from
the flip. The in-repo arms, `DERIVED_VIEWS`, and the remaining ROADMAP paths stay, inert, for the deletion passes, and
the layout's `project-document` address stays for the projection's rule that never adopts a file left from before the
flip.

#### 5.4 The `.internal/` records untracked

The deletion commit also removes the Candidate and integration-boundary records under
`.arc/system/.internal/candidates/` (a work unit's `<slug>.boundary.json` beside its Candidate record) and the
transition records under `.arc/system/.internal/transitions/`. None of the three kinds is projected
(`review/candidate`, `review/integration-boundary`, `lineage/transition` in `KIND_MECHANISMS`,
`lib/store/registry.ts`), so nothing breaks if they stay, but they would mislead: stale copies of authority-bearing
records in every checkout while the store moves on. Removing them also makes a missed in-repo reader fail on the
missing folder, which Stage 2 surfaces, rather than read plausible stale state and pass. Only the data goes; the
in-repo code that reads and writes it stays, inert.

### 6. Text the flip makes false outside the workflows

#### 6.1 Help text

The status flags' help in `cli.ts` and the `status` help notes in `lib/cli-help-content.ts` describe today's arms; the
flip rewrites them for the store's arms (`spec-seam-status-roadmap.md` § 2.4, § 12). It also rewrites the help on
commands that keep working but describe the retired substrate, all in `cli.ts`:

- `arc start`'s description, `-y`, and `--new`, which describe a `plan/<name>` branch committed and pushed;
- `arc resume` ("a parked work unit's preserved branch");
- `arc materialize` ("remote-only", "checks it out");
- `arc rename`, which names the per-work-unit workspace;
- `arc view --for` and its after-help (a registered checkout or a ref), and its `session-notes` kind;
- `arc wu reconcile --apply` ("apply and stage");
- `arc errand next` ("the first execute-bound USER-INBOX Errand");
- `arc errand link` ("so close/promote can drop it", `--from-inbox <entry-title>`);
- `arc errand close` ("drop its originating inbox capture");
- `arc decompose`'s `--execute`, `--extract`, `--finish`, `--revise`, and `--discard`, which describe the repository
  arm first or hold the store arm to "when state is off branch".

#### 6.2 The Markdown notice

The flip ships a notice telling a project how its Markdown checks change (`spec-projected-markdown-checks.md` § 1.4,
§ 7.3): one listing through Git or reading the index stops seeing state, while one globbing from disk keeps reading
the shared roots, which the projection excludes only through `.git/info/exclude`, conflict-marker files included, and
a fixer among them rewrites projected files that write-back persists as hand edits. It tells the project to hand each
Markdown tool exactly the paths it should read — Git's list for tracked files, and the selection through a `selection`
check for state — and that link-target existence over state leaves the shipped hook, kept by declaring
`validate-links.sh` as a `selection` check.

### 7. Tests and checks

CI checks out no projection, and the switch changes every default store, so the tests and checks below change with the
flip, and CI passes over the post-deletion tree ahead of the window (§ 10.1). Tests that target the in-repo backend
build it explicitly through `createInRepoBackend`; none sets the override suite-wide (§ 3.2).

#### 7.1 Tests and checks that read this repository's tree

- `integration/live-transition-records.test.ts` goes, with its entry in the ARC contract tier (`ARC_CONTRACT_SUITES`,
  `lib/local-vitest-runner.ts`) and that tier's row in `unit/vitest-controller-logic.test.ts`: both cases read the
  transition records the flip untracks.
- `integration/review-gate-legacy-sweep.test.ts`'s planned-work case reads `.arc/backlog/planned` from the tree
  (`filesBelow`) and changes to read the backlog through the store or drops the planned-work arm.
- `integration/scripts/verify-integrity.test.ts`'s real installed tree case changes with the presence test's removal
  (§ 5.3).
- `.arc/system/arc-checks.yml`'s Markdown inputs — `lint:md`, `lint:md:underwrap`, and `format:tables` over
  `.arc/active/**/*.md` and `.arc/backlog/**/*.md` — would glob projected files from disk after the flip; this
  repository applies the notice (§ 6.2) to itself, reading state through `selection` checks and tracked files through
  Git's list.
- `audit:coupling`'s corpus (`audits/coupling-blast-radius/manifest.json`) names the two deleted templates and drops
  them.

#### 7.2 Tests whose expectations rest on the default store

- **Helpers.** The store test helpers that build the default store build the in-repo backend explicitly:
  `tracked-write-fixture`, `in-repo-fixture`, `personal-fixture`, `sync-fixture`, `in-repo-remote`, and the two
  differential harnesses, `review-differential` and `import-comparison`, whose in-repo side stays in-repo;
  `import-fixture` reaches the default through `runStoreMigrate`'s import source and sets its source explicitly; and
  `repair-cli`'s mock, which falls through to the default factory when no store is bound, binds one. Fixing these covers
  the test files that import them.
- **Direct callers.** Each test that calls `createStore` itself either builds the in-repo backend explicitly, where its
  subject is the in-repo arm, or keeps the default and expects the ref backend, where its subject survives the flip.
- **Through handlers and scripts.** Tests that reach the default through a handler or script change their expectation
  from the in-repo arm to the store arm, among them `e2e/store-command-dormancy.e2e.test.ts`'s twelve `unsupported`
  cases, which now exercise the commands, and the default-factory assertions in
  `integration/errand-store-imported-cli.test.ts`, `integration/session-inbox-compatibility.test.ts`, and
  `unit/scripts/review-gate/runtime/invocation-extra-pass-references.test.ts`. Readers of the Errand identity refs the
  import retires, such as `readTransientInFlightIndexes` (`lib/errand/record.ts`), are asserted only over the in-repo
  backend.
- **Tests run over this checkout.** `integration/handoff-write-store.test.ts` dispatches the CLI in process over the
  live checkout; it binds a temporary repository.

#### 7.3 Tests that spawn the built CLI

The spawned built CLI opens the ref backend from the flip, and refuses over a fixture whose tree tracks state (§ 3.2); a
fixture that imports and then runs the flip build deletes its tracked state first, as the window does. A spawned test
whose subject survives the flip seeds its state through the store; one whose subject is the in-repo arm sets the
override in its spawn environment and leaves with that arm. The shared seeders move first —
`registerCandidateLineageSuite`, `positionFixture`, `prepareSessionEnvelopeFixture`, `importFixture`, `movementPaths`,
and the review fan-out harness's `installCandidate` and `writeBoundary` — then the spawned tests that seed tracked state
or assert in-repo behavior without seeding. Spawned tests that only run the root hook now project in their temporary
repositories, and CI shows any that a materialization changes.

#### 7.4 Tests over the deleted installed files

`integration/store-project-inbox.test.ts`, `integration/init.test.ts` (the `arc-in-git` and `pm.mode=none` cases),
`unit/init.test.ts`'s Scaffolded classification, `unit/manifest/plan.test.ts`,
`unit/lib/store/kinds/entry-reference.test.ts`, `e2e/init.e2e.test.ts`, `e2e/reconfigure.e2e.test.ts`, and
`integration/scripts/verify-integrity.test.ts` change with § 5.2 and § 5.3.

#### 7.5 The Markdown fix's end-to-end test

`__tests__/e2e/markdown-fix.e2e.test.ts` drives `lint:md:fix` through `src/scripts/fix-markdown.ts` and relies on an
empty selection from the Markdown checks' one reader, `readProjectedSelection` (`lib/checks/projected-selection.ts`).
Inside a command it reads the start's index; from a script it reads the capability of the store `createStore` builds,
returning an empty list over the in-repo implementation and otherwise running `npx arc selection --json`, mapping a
refusal, a nonzero exit, bad output, or a throw to `unavailable`. Once the fixture's store answers true, the test, run
with no projection and no start, would see the fixer refuse with `markdown.selection-unavailable`
(`resolveMarkdownFixCorpus`, `lib/markdown/fix-plan.ts`). Stage 2 runs it over the flipped store, and the flip either
seeds a projection for its fixture or changes its expectation to what the connected reader reports there.

#### 7.6 Tests and test setup the flip adds

- The test setup clears the override (§ 3.1), so no test inherits it from the checkout that runs it.
- Import tests over the Errand identity refs' leases. One advances an identity ref between the import's read and its
  landing: the landing refuses with nothing landed (`landImportRefs`, `lib/store/ref/import/land.ts`), and a fresh run
  succeeds. The other advances `origin`'s copy between the landing and its retirement, which follows the landing and
  publication (`publishImport`, `lib/store/ref/import/finish.ts`): the retirement refuses ("advanced after the import
  read it", `retireOriginRefs`, `lib/store/ref/import/transient-cleanup.ts`) with the kept tips preserved, and the
  import succeeds once the named ref is reconciled with the imported records and the import re-run, as the refusal's
  remedy states.
- An import test over listing ports that return branches, worktrees, and fetched refs in permuted orders yields the same
  records, keyed by owner slug and path with each minted UID mapped to its owner, whatever the order, over copies the
  quiesce check admits, a parked unit among them (§ 13.4).
- Cohort-record write tests (§ 4.10): a hand edit whose member section names no member refuses, naming the slug, with
  nothing written, and admits once the section is removed or renamed, or once the slug's meta is saved naming the
  cohort; a completed member's section and one for a member whose `Cohort` field names the cohort by a former name
  admit; a section naming only a member's former name, a subcohort, or a subcohort's member refuses; an at-cap
  retirement's terminal batch admits while it leaves the origin's section, and the record's next hand edit then
  refuses naming it.
- A test that, while a checkout's `HEAD` tracks ARC state, the commands the Git hooks run open no ref store and project
  nothing, and every other command refuses (§ 3.2).
- The readiness test for a suffixed Errand's branch (§ 4.8).

#### 7.7 Closure

The test changes are complete when CI passes over the post-deletion tree, and a search of the test tree for
`createStore(`, `openDefaultStore`, and spawned commands over a tracked-state fixture finds each caller either building
the in-repo backend explicitly or expecting the ref backend. Task generation takes the file-level list from that search
at its own head.

### 8. The workflow rewrite

ARC's process changes once, at the flip, so the flip rewrites every shipped workflow, method, skill, and rule step the
flip makes false, and the always-loaded text agents act on, each edited in the package source and synced to `.arc/`,
and each checked against `strategy-procedure-evolution.md`. A step that carried only state becomes `arc save` or goes;
the ROADMAP hand-render steps and their refresh commits go; a ceremony that also changes tracked files keeps a commit
step for them; and the task loop closes through the close verb.

#### 8.1 The site list

The site list is the floor the rewrite must cover; § 8.2 to § 8.16 settle what each kind of site becomes. It is the
sweep of the shipped text against what the flip changes — tasks closing after their commit, store writes in place of
state commits, branchless planning, passes recorded in the store, session context in place of SESSION-NOTES, notes
retired, pause in place of park, ROADMAP derived, captures as inbound entries, and the planning lanes dropped — taken
over the storage contract's consumer map (`notes-storage-contract.md`), every row of which, whichever unit owns it, left
its text change to this rewrite (`spec-seam-locus.md` § Non-Goals; `spec-seam-delivery-review.md` § 14.2).

The sweep over the package source found 653 sites in 61 of the 112 shipped workflow, method, skill, rule, template,
quick-reference, and brief files; the other 51 have none. Strategies are outside it (§ Non-Goals). Each site's kind
names the subsection that settles it:

- **save** (§ 8.2) — a state-only commit, or a claim that state is committed, staged, or pushed;
- **mixed-commit** — a ceremony commit that also changes tracked files: the commit stays for those, and its state part
  becomes a save;
- **task-close** and **task-defer** (§ 8.4);
- **branchless** (§ 8.11);
- **session-context** and **user-notes** (§ 8.9, § 8.10, § 4.1);
- **pause** (§ 8.5);
- **roadmap** — a stored ROADMAP or its hand render, which goes (§ 5.3);
- **adversarial-record** (§ 8.7);
- **inbound** and **inbox-id** (§ 8.10, § 4.2);
- **planning-lane** (§ 8.13);
- **git-state-op** — `git rm` of a draft, `git add` or `git mv` of state, `git show <hash>:<meta>`, and the
  `Commit at Handoff` anchor, each replaced by a record delete, a save, or `history` (§ 8.10, § 8.11);
- **other** — a site the flip makes false for its own reason, settled by the subsection its reason names.

| Shipped file (under the package's `arc/`)                             | Sites | Kinds                                                                              |
| --------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------- |
| `system/workflows/arc/session-lifecycle/session-handoff.template.md`  | 59    | save, branchless, session-context, user-notes, inbound, git-state-op, other        |
| `system/workflows/arc/session-lifecycle/session-init.md`              | 8     | session-context, user-notes, git-state-op, other                                   |
| `system/workflows/arc/work-unit-lifecycle/activate-work-unit.md`      | 24    | save, branchless, pause, roadmap, inbound, inbox-id, git-state-op, other           |
| `system/workflows/arc/work-unit-lifecycle/archive-work-unit.md`       | 12    | save, roadmap, git-state-op, other                                                 |
| `system/workflows/arc/work-unit-lifecycle/deactivate-work-unit.md`    | 27    | save, task-defer, branchless, roadmap, other                                       |
| `system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md`     | 15    | save, branchless, git-state-op, other                                              |
| `system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md`     | 33    | save, mixed-commit, roadmap, planning-lane, other                                  |
| `system/workflows/arc/work-unit-lifecycle/park-work-unit.md`          | 30    | save, branchless, pause, roadmap                                                   |
| `system/workflows/arc/work-unit-lifecycle/planning/init-work-unit.md` | 41    | save, branchless, session-context, roadmap, inbound, git-state-op, other           |
| `system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md`       | 10    | save, mixed-commit, session-context, roadmap                                       |
| `system/workflows/arc/work-unit-lifecycle/promote-work-unit.md`       | 9     | save, branchless, roadmap, other                                                   |
| `system/workflows/arc/work-unit-lifecycle/reopen-work-unit.md`        | 5     | save                                                                               |
| `system/workflows/arc/work-unit-lifecycle/resume-work-unit.md`        | 31    | save, branchless, pause, roadmap, other                                            |
| `system/workflows/arc/work-unit-lifecycle/verify-work-unit.md`        | 10    | save, mixed-commit, task-close, inbox-id, other                                    |
| `system/workflows/arc/supplemental/amend-design.md`                   | 11    | save, mixed-commit                                                                 |
| `system/workflows/arc/supplemental/clean-work-unit.md`                | 1     | other                                                                              |
| `system/workflows/arc/supplemental/deliver-stack.md`                  | 3     | save, other                                                                        |
| `system/workflows/arc/supplemental/drain-inbox.md`                    | 38    | save, branchless, user-notes, inbound, inbox-id, planning-lane, other              |
| `system/workflows/arc/supplemental/prepare-commits.md`                | 10    | save, task-close, session-context, other                                           |
| `system/workflows/arc/supplemental/run-errand.md`                     | 23    | save, session-context, inbound, planning-lane, other                               |
| `system/workflows/arc/supplemental/setup-merge-gate.md`               | 7     | save, branchless, roadmap, planning-lane                                           |
| `system/workflows/arc/supplemental/setup-release-wrapper.md`          | 1     | user-notes                                                                         |
| `system/workflows/arc/supplemental/verify-arc-integrity.md`           | 2     | roadmap, other                                                                     |
| `system/workflows/arc/initial-setup/01_verify-and-configure.md`       | 9     | session-context, user-notes, roadmap, inbound, planning-lane, other                |
| `system/workflows/arc/initial-setup/02_define-project.template.md`    | 3     | roadmap, other                                                                     |
| `system/workflows/arc/create-spec.md`                                 | 18    | save, mixed-commit, branchless, inbound, inbox-id, git-state-op, other             |
| `system/workflows/arc/draft-design.md`                                | 20    | save, branchless, inbound, planning-lane, other                                    |
| `system/workflows/arc/generate-tasks.template.md`                     | 13    | save, branchless, other                                                            |
| `system/workflows/arc/process-task-loop.template.md`                  | 20    | save, task-close, task-defer, inbound, other                                       |
| `system/methods/adversarial-review.md`                                | 8     | session-context, user-notes, adversarial-record, other                             |
| `system/methods/assess-draft-readiness.md`                            | 1     | inbound                                                                            |
| `system/methods/assess-parallel-fit.md`                               | 2     | pause                                                                              |
| `system/methods/assess-start-readiness.md`                            | 5     | branchless, session-context, git-state-op                                          |
| `system/methods/branch-format.md`                                     | 4     | branchless                                                                         |
| `system/methods/code-review.md`                                       | 1     | mixed-commit                                                                       |
| `system/methods/commit-footer.md`                                     | 21    | save, mixed-commit, roadmap, other                                                 |
| `system/methods/commit-format.md`                                     | 3     | save                                                                               |
| `system/methods/discover-next-work.md`                                | 3     | branchless, other                                                                  |
| `system/methods/planning-review.md`                                   | 6     | save, session-context, adversarial-record                                          |
| `system/methods/pull-request-format.md`                               | 2     | branchless, pause, other                                                           |
| `system/methods/resolve-planning-depth.md`                            | 1     | save, other                                                                        |
| `system/methods/route-discovered-work.md`                             | 15    | save, branchless, inbound, planning-lane, other                                    |
| `system/methods/session-state.md`                                     | 4     | save, session-context, user-notes                                                  |
| `system/methods/source-grounding.md`                                  | 2     | session-context, user-notes                                                        |
| `system/.internal/skills/README.md`                                   | 2     | save, inbound                                                                      |
| `system/.internal/skills/arc-commit/SKILL.md`                         | 2     | save, task-close                                                                   |
| `system/.internal/skills/arc-design-audit/SKILL.md`                   | 1     | pause                                                                              |
| `system/.internal/skills/arc-errand/SKILL.md`                         | 2     | inbound, inbox-id                                                                  |
| `system/.internal/skills/arc-handoff/SKILL.md`                        | 1     | session-context                                                                    |
| `system/.internal/skills/arc-housekeep/SKILL.md`                      | 2     | branchless, inbound                                                                |
| `system/.internal/skills/arc-inbox/SKILL.md`                          | 7     | inbound                                                                            |
| `system/.internal/skills/arc-task-review/SKILL.md`                    | 1     | other                                                                              |
| `system/rules/DEV-RULES.ARC.md`                                       | 18    | save, task-close, branchless, session-context, user-notes, roadmap, inbound, other |
| `reference/templates/arc/README.md`                                   | 2     | planning-lane, other                                                               |
| `reference/templates/arc/merge-gate/CODEOWNERS`                       | 5     | roadmap, planning-lane                                                             |
| `reference/templates/arc/merge-gate/README.md`                        | 6     | planning-lane                                                                      |
| `reference/templates/arc/template-contributing.md`                    | 2     | other                                                                              |
| `reference/templates/arc/work-unit/template-cohort.md`                | 2     | other                                                                              |
| `reference/templates/arc/work-unit/template-tasks.md`                 | 3     | task-close, other                                                                  |
| `reference/QUICK-REFERENCE.template.md`                               | 21    | branchless, session-context, user-notes, pause, inbox-id, other                    |
| `reference/briefs/AGENT-BRIEF.ARC.md`                                 | 5     | save, session-context, other                                                       |

The sweep's open readings are settled here:

- **Archive's cohort closeout.** `runStoreArchive` closes each newly completed cohort in the archive's own batch, so
  `archive-work-unit.md`'s sidecar sweep goes; the final member's authored Closeout section stays.
- **Integrate's review-copy delete.** The copy under `.arc/specs/<slug>/` is tracked, so the candidate-tail step that
  deletes it keeps a commit (§ 8.7).
- **Delivery's commits.** Record-only commits go; base merges and reconciles are code commits and stay.
- **Promotion.** Prose naming promotion's `commit-required` settlement goes, since the store promotion settles in its
  write (§ 17.2).
- **Save locations.** `create-spec.md`'s and `generate-tasks.template.md`'s save-location steps name the work unit's
  record and its projected location rather than a tracked path.
- **The merge-gate recipe** (`merge-gate/CODEOWNERS`, `merge-gate/README.md`, `setup-merge-gate.md`) drops only the
  planning-lane arming (§ 8.13).
- **Bare paths into the projected roots.** Text naming a movable record by its path under `.arc/active/`,
  `.arc/backlog/`, or `.arc/completed/` is a site too, which the sweep did not count: from the flip a movable record's
  path varies by lifecycle and checkout (§ 8.3), so such text names the record's filename or the verb that reads it.

**Closure.** The rewrite is complete when a search of the shipped text for the retired forms finds only sites recorded
as kept, each with its reason: `git add`, `git commit`, `git rm`, `git mv`, `git show`, `[x]`, `[~]`, `plan/`,
`SESSION-NOTES`, `arc user`, `notes`, `park`, `ROADMAP`, `ADVERSARIAL-PASSES`, `Inbound Buffer`, `USER-INBOX`,
`inbox-list`, `inbox-remove`, `planning-lane`, `planning-grooming`, `chore(arc)`, `Commit at Handoff`,
`grooming branch`, `meta-{`, and paths into the three projected roots. Task generation takes the line-level sites from
that search at its own head, since line positions move as `main` does before the window; the table above is the floor
it must reach.

#### 8.2 The save cadence

`arc save` clears each projected file's changed mark, except on a file still holding an edit the store lacks, so until a
workflow saves per increment, `--changed` spans everything since the last save; both projection specifications leave the
cadence to this rewrite (`spec-projection-write-back.md` § 11.7, `spec-projection-worktrees.md` § 11.7). A state-only
commit step becomes a save per review increment, at each approval gate's commit, so the selection a ceremony checks
matches the increment.

#### 8.3 Ceremony check requests and the relocatability rule

Every ceremony that commits or saves only state requests `arc check increment` over the state it authored — before its
approval stop for what it writes before the stop, and before its save for text written after it or where it has none —
keeping its existing lint step; handoff names a failure in work it leaves unfinished in its notes rather than stopping
to ask (`spec-projected-markdown-checks.md` § 1.4). Each request and lint step stays before the save that replaces a
state-only commit.

The relocatability rule in `DEV-RULES.ARC.md` § `.arc/` artifact references is rewritten onto the movable set: from the
flip every work-item and cohort record is movable, its path varying by lifecycle and by checkout (`active/current/`,
`active/in-flight/<slug>/`, `completed/`), while personal records and the project inbox keep one path. ARC's link
rules, a write check at write-back and `arc save`, follow it.

#### 8.4 The task loop

From the flip, `arc task close` closes tasks after the commit and captures their commits (`spec-storage-contract.md`
D16), and `arc release commit --close` runs it at the commit fire site under the approval that covers work and commit
(`spec-seam-lifecycle.md` § 9). The rewritten loop writes no `[x]`: a red segment request removes the completion note
alone; the pre-report checklist's "Task marked [x]" line goes, the verb's result standing as the record; the completion
note stays the agent's hand edit before the gate; deferred review closes its range in one call; and a hand `[~]` becomes
`arc task defer` (`spec-seam-lifecycle.md` § 9.5), deactivate's partial-scope `[~]` among them. Delivery's correction
acknowledgment, which closes the task mid-protocol and then resumes, is reordered around the close. The loop's crash
recovery reads state and workflow continuity from the store's version, changes, and history, keeping its `HEAD`,
recent-commit, index, and working-tree probes and its mismatch handling.

#### 8.5 Pause and resume

`arc pause` and `arc resume` replace `arc park`: a pause is a record on the work item, not a move, and the checkout
stays unless released (`arc locus release`); the pointer record, park from Planning's landing, and the parked position
retire (`spec-seam-lifecycle.md` § 8.1, § 8.9). The two workflows shrink to the verbs.

#### 8.6 The lifecycle and identity verbs

- Every step that hand-edits `Class` moves onto `arc set-class`, or a shipped `--class` flag where one covers it: none
  covers activate's Step 3, init's post-init ratchet, a new work unit's resolution, init's Errand-promotion step 6, or
  draft-design's capture, while `arc promote --class` covers promote's Step 2 (`spec-seam-record-kinds.md` § 5.4;
  `spec-seam-lifecycle.md` § 10). `resolve-planning-depth`'s rule deferring a ratcheted `Class` to the stage's
  planning-ceremony commit becomes the stage's `arc set-class` at its save.
- The steps that hand-edit `Branch` — deactivate's Case C and init's re-run — move onto verbs.
- The cohort template's "convenience pointer" note on `Parent` is rewritten, since `Parent` becomes the cohort's stored
  nesting.
- Where the rewrite takes the inbound routing method's from-the-flip binding for `route-discovered-work`, the
  `_Routed from:_` line's date moves to `_Created:_`.
- `Owner` turns verb-owned: the person-to-person handoff's hand edit in `session-handoff.md` moves to `arc handover`,
  and `init-work-unit.md`'s step preserving the stub's `Owner` goes, since starting a stub records the starter
  (`spec-seam-lifecycle.md` § 8.5).
- Activation's result names the old name's remote deletion as a typed action only for a branch link recorded `created`
  (`spec-seam-lifecycle.md` § 5.1, § 6.1), so `activate-work-unit.md` Step 4 runs the actions the result names rather
  than a raw `git push origin --delete`; deactivation keeps the work branch, so `deactivate-work-unit.md` Step 3's
  remote delete goes (§ 8.8 of that specification).
- Every step that renames, closes, or removes a cohort by hand edit, or resolves a slug clash by hand, moves onto
  `arc rename <slug|uid>`, `arc cohort close`, and `arc cohort remove`, since from the flip write-back cannot rename a
  cohort: each edited file persists as its own write (`spec-cohort-identity-verbs.md` § 10).

#### 8.7 Delivery and review

- `integrate-work-unit.md`, `prepare-work-unit.md`, and `verify-work-unit.md` drop their record-commit and keep-staged
  steps, since from the flip delivery makes no record-only commits and its next actions name no `commit-*` step
  (`spec-seam-delivery-review.md` § 14.3; § 17.2). Attest's commit step, and the one after a fix's response, stay for
  the review copy alone, which `arc attest` writes and `arc review respond` re-exports when a fix amends the spec
  (`exportCandidateResponseDesign`, `scripts/review-gate/runtime/respond-command.ts`). `deliver-stack.md`'s step
  committing a returned `commit-selection` goes likewise.
- `verify-work-unit.md` saves the verification task's edits, closes the task with `arc task close` — which closes a task
  that produced no commit (`spec-seam-lifecycle.md` § 9.2) — or with `arc release commit --close` where verification
  changed tracked files, and then runs `arc attest` over that head, its review copy riding attest's commit step.
  Step 1's record of each rejected or dismissed capture, today in the verification commit body, goes into a third
  category of the verification task's verification record, `_Captures:_`, written only when Step 1 rejected or
  dismissed one, and saved with the task, since the ordinary path makes no verification commit. The rewrite changes
  `verify-work-unit.md` § Verification Record and `strategy-task-list-formatting.md`'s verification-task exception,
  which names the record's categories, together. Attest refuses a task list that is still open (`no-open-task`), so it
  moves after the close, and the staged-subject wording goes.
- Archival becomes a store write in both cadences, so the archive commit and its push go, while
  `integrate-work-unit.md`'s step-8 dispatch keeps both arms: under `with-integration` integrate archives before the
  merge and the landing writes the landing-commit link; under `manual` archival follows the merge through
  `archive-work-unit.md`'s standalone route, whose archive becomes a store write (`spec-seam-locus.md` § 2.1, A26).
  Integrate's `arc user close` backstop goes. This repository's `archive.cadence: manual`
  (`.arc/system/arc-config.yml`) goes, so it runs the default `with-integration`, and the work-unit canary exercises
  archival before the merge and the landing-commit link.
- The pass record moves onto `arc review adversarial record` (`recordApprovedAdversarialPass`,
  `scripts/review-gate/runtime/adversarial-record-command.ts`) rather than an append to `ADVERSARIAL-PASSES.md`:
  `planning-review.md` § Findings and pass record, and the adversarial-review method's § Pass record.
- Review reports — chunk reports, aggregate results, and evaluator reports — go to the work unit's scratch folder
  rather than its workspace, and the adversarial-review method's § Kept prompts and reports names the scratch folder.
- The step that opens a work unit's pull request (`gh pr create`, `integrate-work-unit.md`) becomes a verb that writes
  the work item's change-request link, its repository the project ID; today no verb writes that link, and archive
  records the pull request only as the meta's `PR URL`.
- A candidate-tail step deletes the review copy at `.arc/specs/<slug>/` through the export function `arc attest` and
  `arc review respond` call. The copy is evidence-neutral in every direction, so its re-export rides its fix's review
  without entering the subject, and the arm that keeps its delete from reopening review stays in lifecycle
  classification (`classifyPathTreatment`): the copy is never in base, so its delete leaves no path in the
  base-relative diff for subject construction to exempt.

#### 8.8 The decomposition workflow

`decompose-work-unit.md` takes the store version's end state: an additive batch replacing dispatch, authoring, one
distribution approval, and the terminal batch as the landing, with today's separate finish-preview stop gone
(`spec-seam-decomposition.md` § 16).

#### 8.9 Session-init

Session-init compiles every surface the flip retires in one module (`spec-session-init-agenda.md` § 7): the notes load
(`commands/agenda/notes.ts`) and the in-place materialize before the flip (`commands/agenda/legacy-materialize.ts`).
The rewrite deletes that module, moves the compiler's freshness anchor to the store's state version, and rewrites what
§ 7.3 of that specification names, since session notes come from the meta's session context after the flip:

- the spine's SESSION-NOTES authority boundary, which covers its thought-state lines and the Blockers line it withholds
  auto-proceed on;
- `assess-start-readiness`' check that the seeded mini-handoff landed, which then reads the spawned work unit's session
  context;
- the compiler's SESSION-NOTES field reader;
- the `git log` render for an absent SESSION-NOTES, which then fires on an empty session context;
- `discover-next-work`'s `.arc/backlog/` and `.arc/active/` reads, which then read the projected backlog or a list verb.

#### 8.10 Personal surfaces, routing, the inbox, and the Errand queue

- Hold-and-route's binding and hand-off sites move onto `arc route` (`spec-seam-locus.md` § 7.9): the
  `route-discovered-work` method's binding section, `arc-inbox`'s route-now step, `arc-errand`'s route shape, and
  `run-errand.md`'s route-only Errand (`spec-inbound-routing-method.md` D8), with `drain-inbox.md`'s grooming change
  and owner adoption. The drain's per-target re-triage line reads `arc inbox <slug>`'s pending count, oldest date, and
  precomposed `retriage` offer (`lib/inbox/listing.ts`).
- Activation's workspace step goes, since `arc user open` refuses `unsupported` from the flip, naming the meta's session
  context.
- Handoff's SESSION-NOTES write becomes `arc handoff write` (`runHandoffWrite`, `lib/handoff/write.ts`), and every step
  naming `arc user save` names `arc save` (`spec-projection-write-back.md` § 18).
- `session-handoff.md`'s sync section loses its paired push, its notes legs, and the notes-drift surface; its
  `Commit at Handoff` anchor becomes the store's state version, and its `git show <hash>:<meta>` restate reads
  `history`.
- The new settings are documented in the shipped configuration template (`spec-seam-locus.md` § 14).
- Each step that removes a routed capture by title — `arc user inbox-remove` in `create-spec.md`,
  `activate-work-unit.md`, `verify-work-unit.md`, and `drain-inbox.md` — removes it by `--id` and `--expected-version`.
- `drain-inbox.md`'s execute-bound marks become `arc errand queue set`, and `--from-inbox` takes
  `<personal|project>:<id>` in `drain-inbox.md`, `run-errand.md`, and the `arc-errand` skill, each refusing a title.
- `run-errand.md` takes an Errand's goal from its entry's description; an Errand's start takes the entry off the queue
  and its abandon returns it; the next offer is the head of the person's Errand queue rather than the next execute-bound
  sibling in file order; and the task loop's atomic completion follows the full Errand close and partial removal by ID
  and version (`spec-storage-contract.md` D11).
- `assess-draft-readiness`' third criterion reads the work unit's inbound list, empty meaning drained, rather than a
  buffer section the import has emptied (`spec-inbound-routing-method.md`).

#### 8.11 Branchless planning and grooming from any checkout

From the flip a work unit plans with no `plan/` branch, and a stub is groomed or the inbox drained from any checkout
(`spec-storage-contract.md` D13, D17; `spec-seam-lifecycle.md` § 6.3), so the prose for planning and grooming branches
goes: `draft-design.md`'s grooming-branch redirect and groom-and-stop's commit-and-push pause; `create-spec.md`'s
planning branch; the `plan/` steps of `activate-work-unit.md` and `deactivate-work-unit.md`, deactivate's Step 5 among
them; `init-work-unit.md`'s base-parity and write-context preconditions and its steps that name the `plan/` branch's
purpose, push it, and seed SESSION-NOTES; the `branch-format` method's `plan/` prefix, whose `[invariant]` ties it to
`State: Planning`, and session-init's branch-pattern fallback; `drain-inbox.md`'s grooming branch and pull request; and
the `arc-housekeep` skill's write-context precondition. Removing a draft becomes a record delete at create-spec and
stays inside the verb at activation, since `git rm` fails on an untracked projected file.

#### 8.12 The errata convention

`archive-work-unit.md` § Post-`Shipped` errata convention says "git history is the lock", which misleads once a shipped
meta is a stored record: a correction becomes a write to the completed item, and its history is the store's history of
the archived meta (`spec-projection-write-back.md` § 8.4). The convention is written around `arc edit <path>` (§ 1.3):
the errata flow is `arc edit` on the archived meta, the edit to its Release Notes Entry, then `arc save`. A substantial
change is a new, origin-linked work unit, since no verb reopens archived work (`spec-seam-lifecycle.md` § 8.7).

#### 8.13 The planning-lane prose

`run-errand.md`, `drain-inbox.md`, `setup-merge-gate.md`, `draft-design.md`'s "Ship instead of pause", and
`initial-setup/01_verify-and-configure.md`'s planning auto-merge lane steps arm auto-merge on `arc review
planning-lane`, or claim the routing exemption through `arc review planning-grooming resolve`, as does the
planning-grooming lane selection in `route-discovered-work`. Both commands answer `reviewed` or `not-eligible` once
state is untracked (`classifyPlanningLane`, `lib/change-facts.ts`, where an empty planning set answers `reviewed`;
`ineligible`, `scripts/review-gate/policy/planning-grooming-command.ts`), so the steps would never fire again, and the
rewrite drops them. In `setup-merge-gate.md` and `01_verify-and-configure.md` it drops only that arming, enough not to
mislead, since the merge-gate recipe retires whole after the flip.

#### 8.14 `generate-tasks`' pre-save step

§ Finalize the task list's "run the project's task-list validator", over "tracked and untracked files", names the save,
whose task-list write check covers a task list from the flip (`checkTaskListSegmentation` and
`checkTaskListDescriptor`, `lib/store/kinds/task-list/shape-rules.ts`). The validator today is `lint:md:descriptors`,
which lists through Git with untracked files included (`runWorktreeTaskDescriptorLint`,
`lib/markdown/descriptor-worktree.ts`, through `enumerateTrackedMarkdownPaths`'s
`git ls-files --cached --others --exclude-standard`); from the flip `.git/info/exclude` hides every projected task list
from it. The check stays for the task-list template it also lints, and only its task-list selector goes dead.

#### 8.15 Other skill, method, and setup text

The `arc-commit` skill's meta-file rule; the `commit-format` method's ceremony-commit wording;
`initial-setup/01_verify-and-configure.md`'s `user.notes_push` text; the `arc-task-review` skill's comparison of a task
list against Git, which reads its prior version through `history`; and the `arc-inbox` skill's USER-INBOX rooting text.

#### 8.16 The always-loaded text

Every sentence in `AGENT-BRIEF.ARC.md`, `DEV-RULES.ARC.md`, and QUICK-REFERENCE's verb index that the flip makes false:

- `AGENT-BRIEF.ARC.md`'s Locus definition: a WU-owned locus is exclusive "through exact teardown or release", since
  `arc locus release` also ends that role — releasing a paused work unit's checkout for its owner, or a checkout whose
  work unit another identity owns, and for an anchored checkout only the marker (`spec-seam-locus.md` § 5); and the
  role derives from the marker and the store, not "its marker, tracked lifecycle, transient identity, and Git topology"
  (§ 2.1). `resume-work-unit.md`'s sibling sentence follows.
- `AGENT-BRIEF.ARC.md` § How ARC Works, which names the state files as a tracked `meta-{name}.md` and a gitignored
  `SESSION-NOTES.md`: the meta is a stored record and session notes are its session context.
- `DEV-RULES.ARC.md` § Commit Discipline's task-list accuracy, which marks the parent `[x]` and stages the task list,
  and its meta-file timing and meta-file commit shape, which commit a meta edit with its ceremony or alone as
  `chore(arc):`: the close verb closes tasks and the meta is saved. § Atomicity's "commit shared documentation (task
  list updates) last" follows them.
- `DEV-RULES.ARC.md` § Handoff's "SESSION-NOTES.md (gitignored) is written only at handoff", and § Write for the
  reader's "author's workflow continuity, which belongs in the active WU's `meta-{name}.md` and SESSION-NOTES".
- `DEV-RULES.ARC.md` § Review-Increment Invariant, reworded to say that after the flip a persist is a save, not a commit
  under the invariant, with the gates staying on lifecycle transitions, stage advances, task closes, and code commits
  (`spec-storage-contract.md` D15); its bounded exception's archive composition and readiness regeneration, which from
  the flip are store writes or go with the ROADMAP's hand render, follow.
- `DEV-RULES.ARC.md` § `.arc/` artifact references' relocatability rule (§ 8.3).
- `DEV-RULES.ARC.md`'s rebase scope, whose reason — rewriting published commits orphans the SHA-keyed Git notes — stops
  holding once notes retire. The flip drops that reason and keeps the invariant.
- QUICK-REFERENCE's verb index, which calls itself the full index: it gains `arc handover`, `arc task close` and
  `arc task defer`, `arc save`, `arc locus release`, `arc inbox`, `arc materialize`, and `arc store`; `arc pause`
  replaces `arc park` (`spec-seam-lifecycle.md` § 19); its `arc start` line's `plan/<name>` goes; and the notes verbs
  and `arc sync`'s direction semantics change with the rewired sync (§ 4.1).

### 9. The rehearsal

Two stages, each on a full copy of this machine's repository, stop at the host boundary; the first landings after the
window are canaries for what lies past it (§ 9.11). Each stage keeps its run's raw evidence outside the repository,
uncited; this unit's records state each conclusion in their own text and cite a commit or a CI run ID. A failure is
fixed in this unit's change and its stage re-run.

#### 9.1 Why two stages

One dress rehearsal could not start until `projection-worktrees` lands and the flip change builds, which would put every
step's first run close to the window. The window's mechanics need neither, so they run first, as Stage 1, the window
tooling's verification: the quiesce check refusing planted conditions and then passing once they are repaired, a real
import with publication to the copy's mirror, the sealing guard, the Errand identity refs' retirement, the accounting
case, the chain comparison, store-backed case 1 (§ 9.10), the last recompute and the comparisons after the merge around
a stand-in flip branch merged into the copy's mirror, the close refusing before that merge and while a copied checkout
tracks state, and, over two runs, the abort after publication.

#### 9.2 Stage 2, the dress rehearsal

Stage 2 runs at the flip branch's head once the flip change builds, on a fresh copy, the whole window in § 10's order:

- Stage 1's steps on the copy's pre-flip build, the copy taken through the window tooling's copy driver;
- the flip build's refusal of a ref store over the copy before its import, with no override set, and again in the
  flip's checkout after the import and before its deletion commit (§ 3.2);
- a live branch no checkout holds, and a branch carrying a Candidate record `main` lacks, each taking § 10.6's branch
  step and ending with nothing tracked under the deleted paths;
- a checkout that merged `main` and rebuilt while its branch still tracked its records: the flip build's refusal, the
  remedy's deletion commit passing its hooks on the flip build with the projection off, and the checkout opening its
  store and taking its first materialization (§ 3.2);
- the flip's own landing: the deletion commit made under the override, a merge into the copy's mirror standing in for
  the host merge, the archive and register closures written through the store from the flip build without the
  override, and the flip checkout's workspace-folder removal and release;
- each checkout's steps through its first materialization and its marker's carry (§ 10.6, § 9.6), the primary's identity
  root left holding only ARC's surfaces and `scratch/`, its inbox and working memory laid from the store, and no
  checkout reporting a withheld file when the window tooling's close passes (§ 10.7);
- the perturbations (§ 9.3);
- the parser check (§ 9.4), the end-to-end work unit (§ 9.5), store-backed cases 2 to 7 (§ 9.10), and the
  representative decomposition cut (§ 9.9);
- the status and view arms from the flip, the roster read and the slug clash among them, which first run for real here
  (`spec-seam-status-roadmap.md`);
- the tripwire report's first live figures, from `arc handoff write`'s maintenance and the rewired sync's push, since
  the in-repo store reports none (`spec-seam-locus.md` § 9.3);
- the Markdown fix's end-to-end test over the flipped store (§ 7.5);
- a worktree spawned after the flip, holding `.arc/user/.npmignore` from the repository's tracked copy rather than one
  the rehearsal supplies, through its first materialization (§ 1.3);

Alongside it, the destructive CLI matrix (§ 9.8) and the partial-protection start (§ 9.7) run in synthetic scratch
repositories through the spawned built CLI. The window opens only after a clean Stage 2, re-run at the new head after
any later change to the flip change, the import, or the rewritten workflows.

#### 9.3 Controlled perturbations

Each perturbation asserts a refusal, then a legitimate repair, then a continuation that reaches the window's end; a
normal-path pass alone discharges none of them.

1. **A record changed between the import and the merge.** After the import, Stage 2 commits a change to a tracked meta
   on a live work unit's branch. The recompute refuses before the flip change (§ 13.1); the abort restores the recorded
   refs (§ 11); the change is dropped from the branch; the window re-runs from the check and continues. A second run
   commits the change after the recompute, once the deletion commit is made, and the last read before the merge refuses;
   a third edits a personal file in a checkout after the import, and the recompute's digest comparison refuses; each
   aborts, undoes the change, and re-runs the same way.
2. **A pull request merged into `main` after the import.** The copy's mirror takes a merge into `main` after the
   import. The recompute's read of `origin/main`'s tip refuses; the abort restores; the merge is taken into the flip's
   branch, its head fixed again; the window re-runs and continues. A second run lands the merge after the deletion
   commit instead, and the last read before the merge refuses (§ 13.2).
3. **An Errand record arriving mid-window.** After the quiesce, Stage 2 opens an Errand before the check. The check
   refuses naming it; the Errand is abandoned; the check passes and the window continues (§ 13.3).
4. **A diverging copy.** Stage 2 plants a live work unit, not parked, whose branch no checkout holds, such as a branch
   another machine pushed before its clone was removed (§ 10.1), since a held branch's divergence would also refuse as a
   checkout off its upstream, and the import's own tip resolution refuses a parked unit's (§ 13.4); the branch has moved
   both locally and in its fetched copy, so neither is an ancestor of the other. The quiesce check refuses naming the
   work unit and both refs; the check's remedy is applied, the passed-over copy merged into the selected one and
   pushed; the check passes and the window continues (§ 13.4).
5. **A store change between preparation and admission.** The fence harness (§ 14.3) runs inside Stage 2's flipped store
   over each prepared write the window makes.
6. **A late change after the merge.** After the merge into the copy's mirror and before § 10.6's steps, Stage 2 commits
   on a live work unit's branch a change to its meta's `Blockers` field and a task's close, and edits a personal file in
   that unit's checkout. The branch's comparison records the moved range and its step goes on; the checkout's digest
   comparison keeps its pre-flip personal files, its first materialization withholds them, and the persist step refuses
   over them (`spec-projection-worktrees.md` § 2.5); the window tooling's close refuses, naming the unconfirmed range.
   The meta's change is re-applied by editing and saving it in the claiming checkout and the task's close by
   `arc task close`, and the range is confirmed; the personal file is copied out and deleted, which releases it, and its
   edit re-applied as an ordinary one. Stage 2 also pushes to the mirror a commit changing only code on a live branch no
   checkout holds; that branch's step merges it before its deletion commit, and its range is confirmed with the rest.
   The close then passes (§ 10.6, § 10.7).

#### 9.4 The parser check

The projection's write-back is an ordinary contract `write`, so a kind whose parser slot is empty
(`createKindRegistry`, `lib/store/registry.ts`) writes unvalidated, and nothing fails visibly. The commit-time content
checks follow after the flip, and the parser takes their place for content rules. The check takes the inventory
write-back hands the rehearsal (`spec-projection-write-back.md` § 7.6, its A3): every kind with a writable projected
path must have a registered parser in `PRODUCTION_REGISTRATIONS`, save the three free-prose kinds that inventory names
as intentional exceptions — `work-item/notes`, `personal/document`, and `personal/session-context`; and every entry
kind must declare an entry grammar (`ENTRY_CONFIGS`, `lib/store/kinds/entry-configs.ts`), so entry merge
(`mergeEntryText`, `lib/store/concurrency/entry-merge.ts`) has one for every hand edit. The check slot, not the parser,
refuses edits to verb-owned fields. The check refuses the flip while either half fails; both hold today, and the check
catches a kind added before the flip without one.

#### 9.5 The end-to-end work unit

`arc save`, write-back, the close verb closing tasks and capturing their commits, and the import's footer-derived task
captures (`importTaskCaptures`) first run for real at the flip, so only the rehearsal exercises them through the
rewritten workflows before it. One work unit runs end to end on the flipped copy: started branchless, its branch
created at activation at base's tip (`spec-storage-contract.md` D17); draft capture; create-spec with an ADR
companion; a task closed through the close verb; handoff; and pre-publication with the review copy, through
`arc publish` and its pre-publication review on the local source. It also deliberately takes these paths:

- a re-entry carrying the Owner's judgments after a scope refusal, a self-review retry among them;
- a native re-entry from an imported saved replay grant, where the copy's import carries one;
- a reopen followed by session-init;
- a work unit started under an archived unit's slug;
- an earlier member's readiness once the representative cut closes its cohort.

Integration's candidate tail lies past the host boundary, with the work-unit canary.

#### 9.6 The checkout carries

Before the flip no in-place arm writes a checkout marker: the cold start, `arc start --here`'s graduation,
`arc materialize --here`, in-place resume, and promotion on the primary leave none (`spec-seam-locus.md` § 2.7), and
the import leaves markers out as machine-local (`spec-storage-ref-backend.md` § 10.8). From the flip, locus derivation
reads only the marker and the store, so a checkout claimed in place before the flip holds its work unit with no
marker; session start then offers `arc materialize <slug> --here` for a marker-less checkout that has out a branch an
owned in-flight work unit links, and a work unit no checkout holds takes the ordinary materialize offer. Separately,
from the flip a work-unit checkout claim carries and matches its owner's UID, with no slug fallback, and no pre-flip
marker carries one, so every spawned pre-flip checkout's claim refuses until it is bound
(`spec-lifecycle-slug-selection.md` § 7). Such a marker is unbound rather than re-stamped (§ 7.4): claim readers and
holder matching refuse it, naming the exits its marker and slug select — `arc materialize <slug> --here` for a live
holder, the cold start's rerun for an anchored leftover whose slug has no record, and `arc locus release`. Stage 2
carries a pre-flip `arc start --here` checkout on a work branch to an anchored marker after the import, and binds a
spawned pre-flip checkout (§ 9 of that specification). The cold start on base under partial protection runs in the
synthetic repositories (§ 9.7), since this repository runs full protection.

#### 9.7 The partial-protection start

Under `branch.protection: partial`, `arc plan check --name <slug>` refuses a started work unit's own `plan/<slug>`
branch with `redirect` / `work-unit-branch`: `classifyPlanningEntry` (`lib/git/write-context.ts`) computes
`protection === "partial" ? writeContext.verdict === "proceed" : onPlanningBranch`, and `draft-design`'s redirect leg
leads back to the same redirect. From the flip, store writes do not depend on the checkout (`arc plan check` proceeds
off-branch, `handlers/plan.ts`), so no fix runs before it. The synthetic run starts a work unit under partial
protection, which a new install gets by default, and drafts in its checkout.

#### 9.8 The destructive CLI matrix

The seam's verification proved dormant destructive success and repaired continuation through registered handler
inputs, the reference store, and real Git, and its built-CLI scenarios prove pre-flip refusals; successful execution
through the flipped built CLI is unproven. Every group in `notes-seam-locus.md` § Destructive-path verification and
flip release checks runs in scratch repositories through a spawned built CLI selecting the ref backend and production
ports:

- cold and named start with the default lifecycle ports; graduate, materialize, rename, and teardown;
- locus release, anchored and spawned;
- inbox and route insertion, move, and carry; the Errand queue and queue set;
- full and partial Errand open with link; Errand leave and rematerialize; abandon and failed-open rollback; close and
  removal by ID and version; promotion;
- personal reconcile and scratch; handoff write from file and stdin;
- identity add, init, and join;
- session-init, handoff status, recovery, and Candidate orientation, with the orphan-branch sweep's store-backed
  outcome (`orphanWorkLanded`, `lib/session-init/orphan-branch-sweep.ts`).

Each covers success, each material refusal, and successful continuation after repair, retaining command results and
the observable record, UID, marker, checkout, code-ref, and personal-byte outcomes. Handler or provider success
discharges none of it; evidence from today's handlers stays labeled apart from the built-CLI runs.

#### 9.9 The representative decomposition cut

`arc decompose`'s store version runs dark behind a capability branch in `handleDecompose` (`spec-seam-decomposition.md`
§ 1.4), so the rehearsal is its first run on the ref backend. Run as a representative cut on the flipped copy, it is the
closing evidence for the decomposition hardening work: a representative real cut showing the shipped properties without
post-transition repair. The cut copies a verbatim-keyed companion, which `copyCoordinates`
(`lib/decompose/scaffold-copy.ts`) names with `companionStoredName` (`lib/store/companion-name.ts`), and gives each
member a conventional Design, since Design admission takes only a member's own draft, spec, or paired-spec names
(`checkMetaDesignEntry`, `lib/store/kinds/meta/reference-rules.ts`). It records its execute half's time; if that exceeds
common command timeouts, the rehearsal interrupts one apply and retries it, where a repeated `--finish` on a landed cut
reports it landed rather than refusing (`spec-seam-decomposition.md` § 8.7). A cut that leaves the origin's member
section, where it has one, in the record of a cohort the origin no longer directly belongs to — a retirement, which
removes the origin, or an extraction that moves its `Cohort` into a new subcohort (`prepareDecomposeExtraction`,
`lib/decompose/extraction.ts`) — leaves it for that record's next hand edit to refuse (§ 4.10); removing it is the
cohort upkeep that rule expects, not post-transition repair. An at-cap extraction keeps the origin a direct member of
its cohort, so its section stays.

#### 9.10 The store-backed paths

The delivery and review seam's paths that run only from the flip or in the import run here as cases, not as known
defects; every finding from that seam's review passes was fixed with a failing-then-passing test, rejected with a
reason, or deferred and since landed.

1. The import refuses a review boundary filed under another work unit's owner (Stage 1).
2. A pending local review's recovery command carries its operation reference and runs; the hosted half runs at the
   canary.
3. Lifecycle composition works with no projected directory.
4. The next-pass budget counts a superseded terminal producer once.
5. A consumed additional-pass grant stays consumed across native projection.
6. Reopen and readiness publish with the Candidate version.
7. Specification export refuses or contains a linked destination.

#### 9.11 The canaries

The copies have no host, so no pull request, hosted review, CI, or Candidate tail runs in either stage. Publication and
its readiness still run in Stage 2, since `arc publish` is a store write before the pull request opens. Three groups of
paths run only past the host boundary: the integration checkpoint and its landing write; hosted review's approval and
settlement; and native delivery's hosted member admission.

The first Errand and the first work unit to land after the window are canaries. Each lands with the Owner present, and
nothing else lands until it has. A small Errand goes first, through hosted review, settlement, and `arc errand merge`.
The work-unit canary is whichever work unit is ready first, a mostly-prose one preferred; it goes through the pull
request, hosted review, archival before the merge under `with-integration`, the integration checkpoint and its
records' new location (§ 4.6), and landing. Native delivery's hosted admission has no landing to run it until delivery
resumes.

A native checkpoint or landing step that refuses at a canary also refuses the landing of its own fix. The exit is an
Owner-directed merge of that fix in the host's interface, with every independent check run first, disclosed as a
self-hosting defect; where the merge lock's own gate refuses too, since it requires the readiness that refused (§ 10.5),
the Owner releases the fix's draft on the host (`gh pr ready`) as part of that merge.

### 10. The window

The window runs as ordered steps. The importing checkout runs the quiesce check, the designation, and the import on
`main`'s pre-flip build, as both rehearsal stages do. Until the flip has merged, its own checkout runs its build under
the override (§ 3.1), and no other checkout runs that build. Each step names what it changes, so the check's record,
the abort's restore, and each checkout's steps cover all of it; its abort point is in § 11.

#### 10.1 Ahead of the window

- The sealing guard (`refuseWriteIfStoreImported`, `lib/store/store-imported.ts`) and the pre-meta backfill (§ 15) are
  on `main`, and `cutover-window-tooling` has landed with its Stage 1 clean.
- Implementation work units have landed where possible, or parked at a task boundary (`arc park`, since `arc pause`
  refuses before the flip, `runPause`), which the import carries as a pause (`readImportParkedSources`, § 13.4).
- Every live branch's changes to tracked state outside its own work item's records have landed on `main` and `main` has
  merged back into it, or have been dropped from it; a live branch is one a checkout holds, or a live work unit's or
  Errand's. The import reads those records only at `main`'s `HEAD`.
- Every pull request into `main` but the flip's own is merged or closed, since the repository allows auto-merge and
  `main`'s ruleset requires only the `ci-ok` check, so an armed pull request would merge with no session running.
- Every Errand is closed or abandoned, since a record carrying its branch from before the suffix would be malformed from
  the flip (§ 4.8), and each Errand identity ref has one tip locally and on `origin`, or is absent on both, any unpushed
  identity write pushed first, since the import reads only the local refs and retires `origin`'s only at an equal tip
  (`heldIdentities`, `lib/store/ref/import/transient.ts`; `retireOriginRefs`), and no identity other than the configured
  one holds a claim, since publication pushes only the configured identity's claims and the import's retirement would
  refuse after publication over another's (`unpublishedImportClaims`, `lib/store/ref/import/transient-publication.ts`).
- Every live work unit the import reads from a branch's copy has merged `main` since `main` last changed that unit's
  records, and pushed, since the import reads the branch's copy and would drop the change `main` made. A parked unit's
  pointer is exempt: the import reads it on `main`, taking the pause's reason and first parking time from it
  (`readImportParkedSources`), so a shelved branch merges nothing for the pointer alone.
- The repository merges by merge commit only, squash and rebase merging disabled, as it is configured today, since the
  window tooling's merged-flip test reads the flip's head reachable from `main`, which only a merge commit shows; its
  check, restore, and close refuse otherwise (§ 1.3).
- The pre-import tidy is worked from the import's trial run, since the import publishes this repository's personal
  state to a public origin for good.
- Every other machine's clone of this repository is removed before the quiesce, once its sessions have handed off and
  its live branches other than `main` are pushed, so each such branch takes § 10.6's branch step once, from the
  importing machine. Its notes and personal files go with the clone and stay off the store, recorded as such at the
  quiesce, since the import reads only the importing machine's notes and disk, and it re-enters after the window only by
  a fresh clone. The recompute compares only the importing machine's checkouts, and a pre-flip build elsewhere stays
  unsealed until it fetches the registry ref, so this holds by the Owner's confirmation at the quiesce.
- Review has finished on every machine but the importing one, since the review gate's repository ID is minted per clone
  and only the importing clone's facts are read; in-flight integration checkpoint handles are not carried and are
  retaken after the window (§ 4.6).
- The flip has finished everything up to its merge on the in-repo implementation, its checkout under the override, at
  one head: its review settled, its verification done, and CI passing there and over that head with its deletion
  commit applied, on a branch of its own, since CI checks out no projection and the merged head's tree is that one. Its
  own `.arc/active/` files and Candidate record stay at its branch tip, where the import reads a live work unit's
  records. Its own changes to shared tracked state, its cohort record's planning edits among them, land on `main` by
  their own pull request, and its branch merges `main` after the last landing ahead of the window, before that head is
  fixed, so it holds exactly what `main` holds outside its own records.

#### 10.2 The quiesce

The Owner stops every other session on the importing machine, in every harness, after each has handed off, and confirms
that every other machine's clone has been removed as § 10.1 states; each session resumes on the rewritten text. ARC sees
no harness session, so no message round asks them to stop, and the import is the witness for what slipped past (§ 13.1).
A pass loop open across the flip keeps its earlier passes in the scratch file the import moves its workspace's other
files to; its session supplies them as prior findings by hand and carries the pass count and any pending approval
forward (`spec-storage-contract.md` D14). Then, in order:

1. every review attempt in flight on the importing machine finishes, since an attempt's in-flight state is not mapped
   and the import refuses one;
2. ended holders' checkouts and work-unit husks are torn down, since neither takes a teardown after the flip: a husk's
   in-repo evidence never passes the store teardown's husk selection (`huskEvidenceMatches`,
   `lib/work-unit/store-retirement-husk.ts`); each first has the disk-only personal files it keeps copied out, or
   recorded as staying off the store, since teardown carries out only the identity-global files
   (`reconcileLinkedIdentityGlobalUserSurfaces`, `lib/user-surface-migration.ts`) and the checkout's removal deletes its
   ignored files;
3. the worktree lock step runs (§ 1.3);
4. every branch is fetched from `origin`, so the check compares each checkout's branch with its upstream as `origin`
   holds it and the import picks each live work unit's latest pushed copy (`spec-storage-ref-backend.md` § 10.8);
5. the quiesce check runs and records (§ 1.3);
6. every checkout saves its personal state (`arc user save`), immediately before the import, since live sessions edit
   the identity-global files and each live work unit's session notes continuously and an early save goes stale. A
   checkout with no built CLI, which the quiesce check passes, runs no ARC command through its launcher, which only
   imports the built bundle (`packages/arc-framework/bin/arc.js`). It saves through the importing checkout's build
   instead, run with that checkout as its working directory (`runUserSave`, `commands/user/save-load.ts`). The
   self-hosting freshness check judges the running CLI's own package (`createDevBuildGuardDeps`, `lib/dev-check.ts`), so
   that build runs there. A checkout left unsaved would hold personal files that differ from their notes, and the import
   refuses on that (`appendImportPersonal`, `lib/store/ref/import/personal.ts`).

#### 10.3 The state remote's designation

`arc store remote origin push` sets `remote.origin.arc-state` (`readRefDesignation`, `lib/store/ref/designation.ts`).
The import then lands in the code repository's own `refs/arc/*` and publishes to `origin`. Undesignated, it would
build a separate store directory and publish nothing (`writeRefRepository`, `lib/store/ref/repository.ts`;
`spec-storage-ref-backend.md` § 10.11).

#### 10.4 The import

`arc store migrate --import` runs from the pre-flip build, its publication included. It converts every draft's inbound
buffer and every held capture into inbound lists, so none is left behind. The same run retires the transient-identity
refs: it deletes `refs/arc/user/<id>/errands` as it lands, keeping the tip it re-homed under
`refs/arc/tmp/migrate/import/kept/`, and once its push succeeds deletes `origin`'s copy, leased on that tip, and drops
the kept tips (`publishImport`, `lib/store/ref/import/finish.ts`; `retireImportRemote`,
`lib/store/ref/import/transient-cleanup.ts`). Running it again only finishes a run that stopped part-way. It writes no
selector between competing approval roots: its legacy inputs carry no selector source (`mappingTerminusPassCount`),
finishing review on every other machine (§ 10.1) leaves no competing root, and choosing between roots two clones each
approved is recovery after the flip. The accounting case and the chain comparison run over it, and then the recompute
(§ 1.3).

#### 10.5 The flip lands

One commit on the flip's branch, made under the override after the import has read its records and `main`'s, deletes
the tracked state the import took: its own records, the shared roots' files, and the `.internal/` records (§ 5.1,
§ 5.4). The merged head therefore differs from the head reviewed and verified only by deleted state files, a tree CI
passed ahead of the window (§ 10.1). Under the override, `createStore` builds the in-repo implementation, whose
capability leaves the projection off, so the deletion commit's hook writes nothing through a ref store: every store it
builds, in write-back's root hook or a check's own reads, is the in-repo one, and the table formatter only restages
Markdown it rewrites. Without the override, write-back's root hook would materialize the checkout before the merge,
writing the clone's exclude entries (`spec-projection-substrate.md` § 11.1), which every pre-flip checkout would meet
after an abort.

The Owner authorizes that exact head with every independent check run there first, then releases the flip's pull request
from its draft on the host (`gh pr ready <number>`). It opened as a draft, as every pull request here does
(`merge.lock: draft`, `.arc/system/arc-config.yml`), and ARC releases that lock only through its own gate
(`arc merge lock release`), which requires readiness (`gateCandidateReadiness`, `scripts/review-gate/merge-lock.ts`);
readiness under `with-integration`, the cadence the flip's change leaves (§ 8.7), requires a completed, Shipped work
unit (`scripts/review-gate/readiness.ts`, `readiness-store.ts`), which the flip becomes only after its merge. Marking it
ready starts no CI run, since CI does not listen for `ready_for_review` (`.github/workflows/ci.yml`). The window tooling
then reads the host's tip of `main` once more as the last act before the merge, with the rest of the recompute (§ 1.3);
and the Owner merges that head through the host's head match (`gh pr merge --merge --match-head-commit <head>`), which
the host refuses if the pull request's head has moved. No ARC checkpoint runs, since the store's checkpoint is a canary
path, and once the import has run the sealing guard refuses the in-repo implementation's integration writes. Then the
flip's checkout drops the override and, from the flip build:

- writes its archive through the store (`arc archive`, § 4.5), with no landing-commit link, since no checkpoint bound
  the merge (`spec-seam-delivery-review.md` A39);
- closes the register rows its landing realizes (§ 17), as edits to `cohort-state-storage.md` saved through
  write-back;
- removes its pre-flip workspace folder, copying out what it keeps, since its first command without the override
  materialized it and the projection withholds a file where it lays no record;
- leaves by `arc locus release`, the one exit for a spawned marker whose holder is archived
  (`spec-lifecycle-slug-selection.md` § 7.4), since its marker from before the flip is unbound
  (`readStoreWorkUnitEvidence`, `lib/locus/store-work-unit-evidence.ts`) and release refuses over a withheld file
  (`spec-projection-worktrees.md` § 12.3).

These are the first lifecycle writes the store takes past the host boundary.

#### 10.6 Each live branch, then each checkout

After the merge, every live branch other than `main`, which only merges, and the flip's, whose deletion commit already
did so (§ 10.5), whether or not a checkout holds it, first has the window tooling compare its tips with those the check
recorded (§ 1.3), on the host as well as locally. After the merge no abort remains (§ 11), so a difference does not stop
the step: the tooling records the moved range under the window's hold, the moved commits stay in the branch's history
beneath its deletion, and the range's changes to state are re-applied through the store. A recorded branch deleted since
the check leaves a gone range, which the Owner confirms at the close once any of its state changes worth keeping are
re-applied. A change to the work unit's own records is re-applied once a checkout on the flip build claims the unit —
the checkout taking these steps, once it has materialized and its marker is bound (steps 5 and 7), or, for a branch no
checkout holds, one spawned for it — and a change to a shared record, a cohort record or the project inbox, from any
checkout on the flip build, since write-back lets anyone edit both (`spec-projection-write-back.md` § 8.1). Each change
takes the route the store's write checks give it. A change they reserve to a verb — a task's close or deferral
(`task-list.close`, `lib/store/kinds/task-list/authority-rules.ts`), or a meta's creation or removal or a change to its
State, Class, Current Workflow, Owner, or pause section (`meta.verb-owned-field`,
`lib/store/kinds/meta/authority-rules.ts`) — is re-applied by the verb each refusal names: `arc task close` or
`arc task defer`, `arc handover`, `arc pause` or `arc resume`, or the lifecycle or Class verb that owns the field. A
record the projection never lays is re-applied by the verb that writes it: a Candidate or boundary record by
`arc attest` (`handleAttest`, `handlers/lifecycle-delivery-review.ts`), and a rename or abandonment, with its transition
record, by `arc rename` or `arc abandon`. Any other change is re-applied by editing and saving the record. Once the
claiming checkout has re-applied a range, which follows this step and that checkout's own, the Owner confirms it to the
window tooling's close, which records the confirmation against it (§ 10.7).

The step itself goes on from the comparison. Where the branch's tip on the host is not an ancestor of its local tip, it
first merges that tip into the branch, a fast-forward where the local tip is an ancestor of it, so commits found only on
the host, moved since the check or never fetched into the local branch, stay in the branch's history and the push that
follows is a fast-forward. It then deletes every tracked file under the five paths the tracked-state refusal reads
(§ 3.2) — `.arc/active/`, `.arc/backlog/`, `.arc/completed/`, and `.arc/system/.internal/candidates/` and `transitions/`
— its own records and any Candidate or boundary record `main` lacks among them, from disk as well as the index, and
commits the deletion, since a merge refuses an index that differs from `HEAD`, a copy left on disk is a withheld file,
and a record `main` lacks would merge without conflict and land on `main` again. A branch a checkout holds takes this
step in that checkout; one no checkout holds, such as a paused work unit's preserved branch, takes it from a temporary
checkout on the importing machine, and the commit is pushed. Once the branch has merged `main`, it tracks nothing under
those paths.

Then each checkout, in turn, taking the removals in steps 3, 4, and 6 only where the window tooling's recompute of its
personal digest still equals the one the check recorded (§ 1.3). Where it differs, it skips them, so its first
materialization withholds every pre-flip personal file; each is copied out where wanted and deleted, which releases it,
and the late edit is re-applied as an ordinary one (`spec-projection-worktrees.md` § 2.5):

1. takes its branch's step above;
2. merges `main` and rebuilds; the merge meets no ROADMAP conflict, since the branch step deleted
   `.arc/backlog/ROADMAP.md` as `main` did, so the ROADMAP conflict remedy, which re-renders only an unmerged or added
   or modified ROADMAP (`assessRoadmapConflictAutoRemedy`), stays inert, where a conflict would have it render the file
   and stage it back under a projected root;
3. removes its pre-flip workspace folder under `.arc/user/<id>/<slug>/`, which maps to no record and which the import
   folded into the meta's session context and `scratch/`;
4. removes from its identity root the pre-flip `USER-INBOX.md` and `WORKING-MEMORY.md`, where present, which the import
   took — from the disk copy, or from notes where both agreed (`comparePersonalFile`,
   `lib/store/ref/import/personal.ts`) — as the identity's inbox and working-memory records and rewrote, stamping each
   entry's ID (`stampEntryIds`, through `prepareRefPut`), moving held captures into their work units' records
   (`importInboundEntries`, `lib/store/ref/import/inbound-entries.ts`), and stripping each execute-bound entry's
   disposition into the Errand queue's record (`importQueue`, `lib/store/ref/import/pending-entries.ts`), so the first
   materialization lays both from the store rather than withholding the pre-flip copies (`spec-projection-worktrees.md`
   § 2.5);
5. takes its first materialization;
6. removes from its identity root each pre-flip file and folder the import moved to `scratch/`, once that
   materialization has written their `scratch/` copies (`importPersonalPath`,
   `lib/store/ref/import/personal-layout.ts`; `spec-storage-ref-backend.md` § 10.12), so the root holds only ARC's
   surfaces and `scratch/`;
7. has its pre-flip marker bound or released, or, claimed in place, is carried to an anchored marker (§ 9.6).

#### 10.7 Notes retire, and the window closes

Notes retire last (§ 12), after the flip has merged and every checkout's first materialization has succeeded. The window
closes through the window tooling's close (§ 1.3), which deletes the check's hold under `refs/arc-window/`, which
nothing restores from once the flip has merged. The close lists each moved or gone range a branch's comparison recorded
(§ 10.6) and records the Owner's confirmation that it was re-applied, and it refuses on the conditions its specification
enumerates, among them until the flip's recorded head is reachable from the host's `main`, while any registered
checkout's `HEAD` tree tracks a file under § 3.2's paths, and until every recorded range is confirmed. The Owner runs it
once no checkout reports a withheld file (`spec-projection-worktrees.md` § 2.5); a withheld file is copied out where
wanted and deleted, which releases it.

### 11. Abort and recovery

Any refusal, mismatch, or failed check stops the window at that step, save § 10.6's comparisons after the merge, which
record a difference and go on.

- **Before the merge, abort.** An abort after the draft's release (§ 10.5) first returns the flip's pull request to
  draft (`gh pr ready <number> --undo`), which passes no readiness gate (`transitionMergeLock`,
  `scripts/review-gate/merge-lock.ts`), so it stays unmergeable until the re-run releases it again. An abort runs the
  window tooling's restore (§ 1.3): every recorded `refs/arc/*` tip back, locally and once published on `origin`, every
  other such ref and unrecorded tracking ref deleted, the store directories removed, and the designation unset, which
  removes the registry ref and lifts the sealing guard; the hold is deleted so a re-run's check records afresh. Each
  push to `origin` is leased on the value the window left there, so a ref another writer moved or deleted since refuses
  before the first push, naming it, as does a local ref the window never writes, such as delivery's or an Errand or
  retirement command's temporary ref, that another writer moved, or, where the import has not landed, a local Errand
  identity ref moved from or deleted at its held tip; the restore continues once the Owner accepts the value found
  (`restore --accept <ref>=<tip>`, or `<ref>=absent` for a deleted ref), which covers that ref on either side. Where the
  import has landed, the restore also compares what the import consumed of each identity ref with its held tip and
  refuses on a difference, printing each differing record in full, until the Owner accepts what the import consumed
  (§ 1.3). An abort after the flip's deletion commit also reverts that commit on the flip's branch, an ordinary commit
  rather than a rewrite of the pushed branch, made under the override, so nothing has projected there; before the window
  runs again, the flip's head is fixed again as § 10.1 fixes it, at the new head: `main` merged, review settled,
  verification done, and CI passing there and with the deletion commit applied, and Stage 2 re-run as Success
  Criterion 1 requires. Until the merge, an abort leaves `main` untouched.
- **After publication,** the pre-import tidy still matters, since anything pushed may already have been copied; an
  abort does not unpublish.
- **The recompute's stop exits through the abort.** The recompute runs after publication, so a change it finds stops the
  window by restoring the recorded `refs/arc/*` tips on both sides (§ 13.1). Where it found a transient record differing
  from what the held identity refs give, the restore refuses on the same difference until the Owner accepts it, so a
  record written in that interval is seen before its only copy is deleted.
- **After the merge, fix forward.** A failed step past the merge — the flip's archive or register closures, its
  checkout's folder removal and release, any checkout's deletion commit, merge and rebuild, folder removal, first
  materialization, identity-root removal, or marker carry, or notes retirement — stops the window there; nothing is
  reverted, and the store writes made after the merge stand. Its fix lands as a canary's does (§ 9.11). Reverting the
  merge would lose those writes and unwind every checkout that had already merged and rebuilt. A restore that finds the
  flip merged at its last test, before it deletes `origin`'s registry ref, refuses with that ref kept, `origin` having
  lost the published refs and regained the Errand identity refs the import retired; the window fixes forward by
  re-running the import, which over a landed store only publishes (`inspectImportDestination`,
  `lib/store/ref/import/occupied.ts`), and deleting those identity refs from `origin`, leased on their held tips, since
  the import's own retirement (`retireImportRemote`) skips them once its kept tips are gone. The pull request is a draft
  throughout the restore and cannot merge, so only a merge the draft does not gate reaches this; a merge landing before
  the restore is its first test's refusal, with nothing restored.
- **Notes stay the import's source until they retire.** Until notes retire, each person's notes stay where the import
  read them, unchanged, for comparison with the imported records and for re-deriving one the import got wrong; they are
  not a path back.

### 12. Notes retirement

The import reads each person's notes and deletes no notes ref (`lib/store/ref/import/` reads `refs/notes/arc/user/`
alone); the sealing guard then refuses every notes command that writes — `arc user save`, `load`, `push`, `fetch`,
`pull`, and `compact`, and `arc rename`'s workspace leg (`runUserRenameWorkspace`) (`commands/user/save-load.ts`,
`push-fetch.ts`, `compact.ts`) — and the flip's sync has no notes leg. The guard reaches `arc user load` (`runUserLoad`)
through the window tooling, which adds it on `main` ahead of the window (§ 1.3), so the pre-flip build each checkout
runs until its own merge of `main` refuses a load once the registry ref exists. A load writes the disk from notes, its
identity-global files into the primary's identity root (`resolveUserSurfaceResolver`, `lib/user-surfaces.ts`), so after
the primary's first materialization a load from any checkout would write old notes content into projected files, which
write-back takes as edits. `origin` holds no notes refs, so notes retirement is local: the importing machine moves its
notes ref under a namespace that is neither a tag nor pushed, so `git push --tags` cannot publish every past personal
note. No other machine keeps a clone, and so a notes ref, past the quiesce (§ 10.1). The old ref is deleted with the
notes residue refs after the window. The sealing guard's notes-command arm stays until those commands are deleted; its
in-repo arm leaves with the in-repo implementation.

### 13. Transition invariants

For each transition the window makes, what every record and checkout must preserve, where code enforces it, and the
check that proves it, each check a refusal followed by a legitimate repair and continuation.

#### 13.1 From the import to the flip's merge

- **Preserved:** every record the import took equals what tracked state and the Errand identity refs held when the check
  recorded, and each personal record what its checkout's personal files held when the check recorded their digest, which
  § 10.2's save copies into notes; nothing writes tracked state, notes, or the store between the import and the merge
  except the flip's deletion commit and the window's own steps; the merged head differs from the verified head only by
  that deletion commit.
- **Enforced by:**
    - the sealing guard (`refuseWriteIfStoreImported`): once `refs/arc/project/registry` exists, every pre-flip
      in-repo, notes, and Errand-identity write refuses with a recoverable store-imported refusal, while reads stay
      open. Writers that bypass the store — lifecycle's transition records (`writeTransitionRecord` through
      `terminalTransitionWriter`, `handlers/lifecycle.ts`) and the old decomposition operation's writes — do not
      consult it; the quiesce, which stops every session first, covers those;
    - the import's own refusals, each a notice recorded before the landing is decided, which blocks it
      (`importTrackedState`, `lib/store/ref/import/entry.ts`): a notes file whose disk copy differs from its saved copy
      (`lib/store/ref/import/personal.ts`), an attempt in flight in the review gate and an unmapped review source
      (`lib/store/ref/import/review-mapping.ts`); and its landing lease on each transient-identity ref at the tip it
      read (`landImportRefs`);
    - the window tooling's recompute of worktree heads, personal digests, and live branch tips after the import and
      again as the last act before the merge (§ 1.3), stopping through the abort (§ 11); and after the merge, § 10.6's
      comparisons before anything is deleted: a branch's moved or gone range recorded under the hold, which the window
      tooling's close keeps until the Owner confirms each range re-applied (§ 10.7), and a checkout whose personal
      digest moved keeping its pre-flip files for its first materialization to withhold;
    - the tracked-state refusal (§ 3.2), so no command in the flip's checkout builds a ref store or projects before its
      deletion commit, with the override or without it; the override itself (§ 3.1) is procedure, not enforcement;
    - the host's required `ci-ok` check on the head with the deletion commit applied, and the Owner's authorization of
      that exact head.
- **Residuals:**
    - a write the pre-flip build makes through a writer the guard does not seal, in a session the quiesce failed to
      stop, is caught only if it changes a worktree head, a live branch's tip, or a personal digest the window tooling
      compares — before the merge by the recompute, after it by § 10.6's comparisons — and only if made before that
      branch's or checkout's own steps run;
    - that a recorded range's re-application is complete holds by the Owner's confirmation alone; the close enforces
      only that each range is confirmed, and it reads no withheld file, so that none remains when the window closes
      holds by the Owner's check;
    - between the deletion commit and the merge the flip's tree tracks no state, so a command run there without the
      override projects, writing the clone's exclude entries, which an abort does not remove; only the Owner's
      independent checks run in that interval;
    - another machine's clone is outside what the recompute compares, so its removal before the quiesce (§ 10.1) holds
      by the Owner's confirmation alone.
- **Checks:** Stage 2's perturbation 1 in its three runs, perturbation 2, and perturbation 6 (§ 9.3), its refusal in the
  flip's checkout after the import (§ 9.2), and the abort exercised after publication in Stage 1.

#### 13.2 The host boundary

- **Preserved:** `main` changes only by the flip's merge between the check and the merge; the merge is of the exact
  head authorized; after it, every lifecycle write is a store write from the flip build without the override, against
  the imported store, and no step reverts.
- **Enforced by:** the check's refusal of any open pull request into `main` but the flip's, and its record of
  `origin/main`'s tip equal to the importing checkout's `HEAD`; the recompute's and the last pre-merge read of that tip
  from the host (`git ls-remote origin refs/heads/main`), not the fetched ref; the window tooling's refusal, at the
  check, the last read, and the restore, while the flip's pull request has auto-merge armed (§ 1.3); the Owner's merge
  through the host's head match (`--match-head-commit`), which refuses a head that moved after its authorization
  (§ 10.5); the fence on the post-merge store writes (§ 14); § 11's fix-forward rule.
- **Residual:** the draft's release (`gh pr ready`), its return to draft on an abort (§ 11), and the head-matched merge
  are host procedure no stage exercises, since both stages merge into the copy's mirror, which has no pull request; nor
  does any stage exercise the fix-forward from a restore that found the flip merged at its last test, the import's
  re-run and the leased deletion of the identity refs (§ 11).
- **Checks:** perturbation 2 (§ 9.3), both runs; the window tooling's tests of its refusals while auto-merge is armed
  and once the flip has merged (§ 1.3); the fence harness over the archive and register closures (§ 14.3).

#### 13.3 Errand records crossing

- **Preserved:** no Errand record crosses the window; grooming claims and housekeep routing records cross re-homed as
  claims under `refs/arc/user/<id>/claims` (`transientKind`, `lib/store/in-repo/transient-common.ts`) and keep their
  own branch checks; the Errand identity refs retire in the import's run, on both sides.
- **Enforced by:** the check's refusal of an Errand record in any state, locally or on `origin`, and of an identity ref
  whose `origin` tip the local ref does not equal, an `origin`-only ref included, while one held only locally passes,
  since the retirement skips it on `origin`; the import's landing lease on the identity ref tip it read, so one that
  advanced refuses the landing; `retireImportRemote`'s lease on the kept tip; the window tooling's recompute after the
  import, which refuses a landed Errand record (`work-item/record`) and an identity ref left on either side (§ 1.3); the
  restore's comparison of what the import consumed of each identity ref with its held tip (§ 1.3); and from the flip the
  record schema's suffixed-branch check (§ 4.8), so a record that crossed would read as malformed rather than misroute.
- **Residual:** none the window leaves open. An Errand opened between the check and the import's read of the identity
  ref lands a record the recompute after the import refuses, so the window stops through the abort (§ 1.3, § 11). An
  abort that stops before the recompute, at the accounting case or the chain comparison, meets the restore's own
  comparison of what the import consumed, which refuses rather than rewinding that record.
- **Checks:** perturbation 3 (§ 9.3); Stage 1's own Errand refusal and repair; the window tooling's tests of the
  recompute's refusal of a landed Errand record (§ 1.3); the import tests advancing an identity ref between the import's
  read and its landing, and `origin`'s between the landing and its retirement (§ 7.6); and the sealing guard's
  Errand-identity case (`integration/store-imported-seal.test.ts`).

#### 13.4 Order independence

- **Preserved:** the import's records do not depend on the order in which branches, worktrees, or fetched refs
  enumerate, and no live work unit's copy is dropped in favor of another it diverges from. The import reads each live
  work unit's copy through the in-repo lifecycle composition across branches and fetched refs
  (`spec-storage-ref-backend.md` § 10.8), except a parked unit's, which it withholds from that composition and reads
  from its branch's tip (`readImportParkedSources`, `lib/store/ref/import/parked-source.ts`).
- **Enforced by:**
    - that composition's selection (`chooseWorkUnitCandidate`, `lib/git/in-flight-derivation.ts`), which orders a work
      unit's copies by source, relation, ancestry, lifecycle state, commit time, and finally branch name; the import
      reads the selected copy (`composedMetaSource`, `lib/store/in-repo/meta.ts`) and consults none of the
      composition's marks. The selection records every copy in its provenance, marking the one selected
      (`provenanceForGroup`), but warns of a passed-over copy (`candidate-shadowed`) only when it is neither stale nor
      the same branch's local or fetched copy (`isLocalRemoteMirror`). A local and fetched copy of one branch that have
      both moved, with equal state and commit time, tie on the branch name and are decided by listing position;
    - the quiesce check's refusal (§ 1.3), read from that provenance rather than the warnings: a live work unit with a
      copy, other than a stale one, whose commit is not an ancestor of the selected copy's, since the import would drop
      that copy's changes and its selection could depend on order;
    - for a parked unit, the tip resolution (`resolveImportBranchTip`, `lib/store/ref/import/branch-tip.ts`), which
      reads the one tip holding both the branch's local and fetched work and refuses a diverged pair itself
      (`reportBranchRefusal`, `lib/store/ref/import/code-links.ts`).
- **Checks:** the import test over permuted listings (§ 7.6), a parked unit among them, which compares records keyed by
  owner slug and path with each minted UID mapped to its owner, since every import mints fresh UIDs and two imports
  never share tree IDs; and perturbation 4 (§ 9.3).

### 14. The fence for prepared store writes

#### 14.1 The contract

A prepared store write lands only if preparing it against the state it lands on would produce the same writes from the
same evidence. A writer that decides from reads taken before it submits meets this one of two ways: it re-derives the
decision inside the batch's write check over `before`, with preparation a pure function of a store view and the
request, the batch observing exactly the records and exact-reference absences that feed a write, a report row, or an
advisory, and the check admitting only when the fresh writes appear in `after` unchanged and the fresh evidence names
nothing the batch neither observes nor writes at an expected version; or it observes everything it read, where the
decision already rests on rules over the resulting state. The backend's retry compares tips captured at submission,
not at preparation, so it does not close the gap.

#### 14.2 The writers the window turns live

- **The import** fits in part. It lands only on an empty store (`landImportRefs` refuses `occupied` under the store's
  `layout` lock), the state it prepared against, but its inputs live outside the store — tracked files, notes, the
  Errand identity refs — and are fenced by the quiesce, the leased identity refs, and the recompute, whose stop exits
  through the abort restoring the recorded `refs/arc/*` tips (§ 11).
- **Write-back's take-in** re-derives: `checkProjectionAdmission` (`lib/store/projection/admission-check.ts`) re-runs
  `planProjectionWrite` over `before` inside the batch's write check, checks the batch's observations
  (`checkRecordObservations`), and admits only when the fresh mutation, accepted-input receipt, and observation
  evidence equal the submitted ones (the batch built by `prepareStable`, `lib/store/projection/submission.ts`). Every
  hand edit after the flip lands through it, the register closures among them (§ 10.5).
- **The flip's archive** observes: `runStoreArchive` passes the cohort records it closes as observations
  (`observeRecords`) and its prepared records for revalidation (`revalidateLifecycleRecords`,
  `lib/work-unit/prepared-lifecycle-write.ts`), and decides cohort closure from the complete lifecycle inventory. Its
  observations cover every record that feeds that decision, each prospective member's lifecycle record among them; a
  read family the harness shows unobserved is added to the observations in this change.

#### 14.3 Verification by perturbation

One harness, on the ref backend and the reference backend, injects a store change between preparation and the batch,
seeded per read family each writer above takes. Each case asserts either refusal with nothing written and then a
correct fresh retry, or admission equal to fresh preparation; an unrelated write must admit. Stage 2 runs the harness
inside its flipped store (§ 9.3).

### 15. Tracked state the import does not claim

The import reads the in-repo store's records. That store discovers work items by their meta files (`heldMetaSources`,
`lib/store/in-repo/meta.ts`), each one's draft, spec, task list, and notes as record kinds of their own (`recordPath`,
`lib/store/in-repo/paths.ts`), and its other companions beside the meta by the `<word>-<slug>.md` pattern
(`companionNames`, through `artifactMatcher`). A tracked file under a projected root that no record claims is never
imported, and no trial reports it, since an omission refuses nothing. Every pre-meta archive folder now carries a
reconstructed meta on `main`, and `completed/README.md` is deleted (§ 5.2). Closed cohorts' folders are claimed: the
import recovers their archive coordinate (`cohort-source.ts`). The accounting case tallies every tracked file under
§ 3.2's paths, the Candidate and transition records among them (`internalReferences`), as imported, superseded (a live
unit's copy at `main`'s `HEAD` when the import reads that unit from another copy, such as a draft its planning branch
retired, and `main` has not changed it since that copy forked; a file `main` changed is reported, and the check refuses
it first), deliberately left, or reported, which catches the class of omission rather than known instances; the window
stops on any file it cannot place.

After the import, a pre-flip file left at a projected path — one whose content differs from the record laid there, or
that sits where no record is laid — is withheld at its checkout's first materialization, and the persist step refuses
over it (`spec-projection-worktrees.md` § 2.5, § 12.2). Four window steps follow (§ 10.6): each live branch other than
`main` deletes every tracked file under the five paths the tracked-state refusal reads (§ 3.2), from disk and index;
each checkout's pre-flip workspace folder goes once the import has folded its session notes and moved the rest to
`scratch/`; its pre-flip `USER-INBOX.md` and `WORKING-MEMORY.md` go before its first materialization, since the import
rewrote both records; and each pre-flip identity-root file outside ARC's surfaces goes once the first materialization
has written its `scratch/` copy, since write-back refuses the identity root outside `scratch/`
(`spec-projection-write-back.md` § 9). Each checkout takes the three personal removals only where its personal digest
still equals the one the check recorded, so a late personal edit made before its steps run is withheld rather than lost,
while a branch's late change is recorded and re-applied through the store (§ 10.6). The Owner closes the window only
once no checkout reports a withheld file (§ 10.7), and the persist step refuses over one meanwhile, so a class of file
these steps miss holds the window open rather than staying withheld.

The branch step removes state rather than only avoiding conflicts. A record the branch changed and `main` deleted would
be a modify/delete conflict at its next merge of `main`; a record the branch added, such as the Candidate record a
verification commit adds on the work branch, would merge without conflict, stay tracked, and land on `main` again with
the branch. A branch that modified `.arc/backlog/ROADMAP.md` deletes it with the rest, so its merge of `main` meets no
ROADMAP conflict (§ 10.6). A branch that slips through still meets the tracked-state refusal (§ 3.2) in every command
and in CI. A branch that changed tracked state outside its own records would carry that change past the import, which
read the state elsewhere; the check refuses such a branch, so its change lands on `main` and merges back, or is dropped,
first (§ 10.1).

### 16. ADR dispositions

Every decision this spec settles, against `strategy-adr-methodology.md` § When to Write an ADR.

**This unit delivers two amendments to ADR-035,** each a dated amendment in its § Amending This Document. Each refines
a mechanism inside an item while the decision — state in `refs/arc/*`, notes retired through a one-time import —
stands, so neither is a supersession:

- **Item 8:** the old notes ref is kept on the importing machine under a namespace that is neither a tag nor pushed,
  rather than as an archive tag, since `git push --tags` would publish every past personal note from a public
  repository, and it is deleted with the notes residue refs after the window (§ 12).
- **Item 2:** `arc sync` publishes state first and alone, whatever its branch push's outcome, and reports each
  separately, rather than carrying state in the branch's `--atomic` push, so a slow or failing push gate no longer holds
  state back; a task capture may already name an unpushed commit, so no reader changes (§ 4.1).

**Covered by an ADR already on the base branch:**

- the whole workflow rewrite landing once, at the flip, and the quiesce, import, and flip window, rehearsed first:
  ADR-035 ("a single cutover per repository", "a quiesce → import → flip window, rehearsed first");
- designating `origin` as the state remote, with this repository's personal state published beside its project
  state: ADR-035 item 2's same-repository default;
- untracking the `.internal/` records and leaving no tracked or installed file in a projected root, the templates'
  deletion among it: ADR-035 item 3 (no tracked operational-state tier remains; ROADMAP and status surfaces are
  derived) and item 6 (the projection at the familiar paths);
- `generate-tasks`' pre-save step naming the save: ADR-035 § Consequences ("ARC's own checks over work-unit artifacts
  run where state is written");
- a save per review increment: ADR-035 item 6, whose firing points include increment close;
- `arc sync` rewired onto `pull` and `push`, and notes retiring through the import, last in the window: ADR-035 items
  2 and 8, as amended above;
- the rebase rule kept past the flip, its notes reason dropped: ADR-025, whose invariant gives way only to ADR-035
  item 9's configurable history policy.

**`none`, temporary** — one-time window machinery, done or deleted once the window closes: the rehearsal's stages,
perturbations, and canaries; the quiesce and its steps; the window's order, the flip's landing by an Owner-directed
merge, and its abort and fix-forward rules; the override, with its CI condition and test-setup clearing, and the
tracked-state refusal, deleted with the in-repo implementation; CI over the post-deletion tree ahead of the window; and
the pre-meta backfill.

**`none`, not this unit's decision** — text and code that apply a decision a shipped specification or the register's
fate settled, whose own disposition stands: the task loop, pause and resume, the lifecycle and identity verbs, the
delivery and review steps, the decomposition end state, and the session-init module's deletion; the capture gates onto
`arc inbox`, the Locus definition, `arc store`'s un-hiding, and the Markdown notice; the personal surfaces and routing
onto `arc route`, `arc handoff write`, and `arc save`; the invariant's reword (`spec-storage-contract.md` D15),
branchless planning's and the inbox verbs' text; `arc init`'s state remote and project ID; the Errand branch's UID
suffix; the checkpoint records' location (`spec-storage-contract.md`); the cohort record's member-section rule, carrying
`strategy-work-organization.md`'s cohort-consistency invariant onto the store; the status help text; the ceremony check
requests and the relocatability rule's movable set (`spec-projected-markdown-checks.md` § 1.4); and the other
always-loaded edits, each following a decision above or a specification it names.

**`none`, meeting none of the five criteria** — planning structure and tactical choices: the boundary and what lands
at the flip (§ 1); the flip asking nothing of the projection members beyond their contracts; the base-drift resolver
matching by the archived `PR URL`; the rename source's refusal; the store archive's two fields; the help text on
commands that keep working; tests building the in-repo backend explicitly; the planning-lane prose dropped and the
merge-gate recipe left minimal; `lint:md:descriptors` kept for the task-list template; the verification record's
`_Captures:_` category; the errata convention's workflow text; the Markdown fix's end-to-end test; the one repository;
and no fix before the flip for partial protection's planning entry.

### 17. Register rows and named residuals

#### 17.1 Rows the flip's landing closes

After the merge, the flip's checkout closes these rows of `cohort-state-storage.md`'s storage-coupling register through
the store (§ 10.5), each on its witness: the § 2.2 arm, § 4–§ 8 change, or § 9 check that shows its whole fate holds.
None closes by being listed here.

1. Candidate and transition records.
2. Candidate supersession and `recordRevision`.
3. Workflows, overrides, scripts, lint and contract checks over history and diffs.
4. Archival by `git mv`, the archive index, and relocatability.
5. `archive.cadence: manual`, the two-PR landing bridge, and the checkpoint workarounds: this repository's manual
   override goes and it runs the default `with-integration`; the key and both supported arms stay.
6. Lifecycle encoded in directory placement.
7. Lifecycle read from branch refs, and planning-branch longevity.
8. The tracked retirement receipt and artifact deletions.
9. Hold-and-route, inbound buffers, and the coordination-seam rule.
10. Notes classification of every personal subdirectory as a workspace.
11. In-flight derivation and the work-unit and Errand oracle slots.
12. The lifecycle executor, start placement, and provisional-placement callers.
13. Notes-related session-init probes and user-reference reconciliation slots.
14. Locus derivation from the marker and branch topology.
15. Singleton record writes staling publication.
16. The public code remote publishing user notes, and its manual interim.
17. Only-meta current-work-unit resolution and the one-active guard.
18. HEAD-tree integration and readiness, and the meta-on-PR requirement.
19. Commit-anchored handoff and recovery continuity.
20. Template overwrite by `arc user add`, `arc init`, and `arc join`.
21. Foreign-artifact detection through branch diffs.
22. The rename stub-branch leg.
23. Workflow steps committing state with Git.
24. Machine-local review, delivery, and transient state, and the checkpoint location (§ 4.6).
25. Literal session-init paths, the load set, and the compaction seed.
26. Inbound work without count or age back-pressure.
27. Slug-holder selection and slug-matched checkout claims.

#### 17.2 Rows whose flip share lands but which stay open

- **Archive before merge under `with-integration`.** The flip keeps before-merge archival under `with-integration`
  and after-merge archival under `manual`; the row's fate says at or after merge. The row stays open until its fate is
  amended to match or the arm changes.
- **Record write, `git add`, and the `commit-*` next-action protocol.** From the flip no store-backed path emits a
  `commit-*` action: candidate applicability (`handlers/candidate.ts`), the terminus replay
  (`stageDeliveryReviewTerminusBoundary`, `handlers/review.ts`), the checkpoint's publication commit
  (`readShippedDeliveryPublicationCommit`, `scripts/integration/checkpoint-composition.ts`), promotion
  (`promoteStoreErrandAtRuntime`, whose frame records the meta committed), and delivery's record effects
  (`handlers/delivery-execution.ts`) each return before staging when the store is off-branch. The result schemas keep
  their `commit-*` declarations while the in-repo arms that emit them remain; they leave with those arms in
  `cutover-in-repo-removal`, which closes the row.
- **Errand promotion waiting for a meta commit.** The store promotion lands; the row's fate also places a promotion
  re-scope elsewhere, so it stays open until that placement is recorded.
- **Hand-maintained artifact-kind lists.** The `design` selector is already in `VIEW_KINDS` (`lib/view/types.ts`), and
  no surviving list breaks or misleads once state leaves the branch, so the flip derives none. Deriving the surviving
  lists — `WorkUnitArtifactKindSchema` (`lib/layout/schema.ts`), `VIEW_KINDS`, and the kind maps in
  `lib/store/target-classification.ts` and `lib/store/lifecycle-storage.ts` — from the family registry moves to
  `cutover-in-repo-removal` (Owner, 2026-11-10), beside its deletion of the write-context and branch-classification
  patterns.
- **Current-work-unit reconciliation and stale-worktree sweep slots.** The rebuilt slots read the store, but the fate
  removes the `retiredSubdirs` slot once no lingering subdirectory remains, and the store path only reports it empty
  (`handlers/status.ts`) while the in-repo arm still fills it. The slot leaves with the in-repo arm.
- **Lifecycle hook checks.** No state record reaches the hooks once state leaves the branch (§ 1.1). The meta check's
  rules run as the meta kind's write checks (`meta.field-block`, `meta.stage`, `meta.design-entry`, `meta.cohort`, and
  `meta.prepare-tasks`, `lib/store/kinds/meta/`), the cohort check's Purpose as `cohort.purpose`, and its member
  sections as the rule the flip adds (§ 4.10); its location and grouping-folder conditions describe placement the store
  derives, and it skips them off-branch (`checkCohortConsistency`). The task-numbering rule already runs as
  `task-list.segmentation` (`checkTaskListSegmentation`, `lib/store/kinds/task-list/shape-rules.ts`), whose task grammar
  refuses a numeric third-level identifier (`ParentTaskIdSchema`, `lib/task-list/scanner.ts`), save in a list already
  malformed before the write, whose diagnostics compare by code alone (`diagnosticIdentity`).
  `cutover-tracked-state-removal` deletes the hooks and closes the row.
- **Every row with a later share** in `cohort-storage-cutover.md`'s register shares stays open until its last share
  lands; the flip's share of each is the change this spec names for it.

#### 17.3 Named residuals

- **Base retention for files other than Markdown.** Four parts of the projection's field schedule discard or misplace
  the version a save started from for a file other than Markdown — the aside-copy sweep's restore order, a stopped
  replacement's recorded base, an in-place save mid-swap, and a held aside copy's put-back — so write-back can merge
  such a save from the wrong base. The exposure needs an interrupted replacement, a reload mid-swap, or a held aside
  copy on a projected file that is not Markdown. The window does not wait on the fix (Owner, 2026-11-10); the residual
  is disclosed at the window, and `projection-base-retention` lands after the flip.
- **A schema-1 boundary's terminus.** Accepting a delivery member's terminus over an integration boundary still at
  schema 1 in the store fails on a thrown parse error rather than a typed refusal
  (`scripts/review-gate/policy/delivery-review-terminus.ts`). It is loud, and delivery is paused; it stays with the
  delivery rebuild.
- **A session the quiesce missed** (§ 13.1): an unsealed writer there is caught after the merge only by § 10.6's
  comparisons, and only before each branch's and checkout's own steps run.
- **The window's close** (§ 10.6, § 10.7, § 13.1): the window tooling's close refuses until each moved or gone range is
  confirmed, but that the re-application is complete rests on the Owner's confirmation, and it reads no withheld file,
  so that none remains when the window closes rests on the Owner's check.
- **The flip's merge on the host** (§ 10.5, § 11, § 13.2): the draft's release, its return to draft on an abort, and the
  head-matched merge are host procedure no stage exercises, since both stages merge into the copy's mirror, which has no
  pull request; so is the fix-forward from a restore that found the flip merged at its last test, the import's re-run
  and the leased deletion of the identity refs.
- **The flip's checkout between its deletion commit and the merge** (§ 13.1): a command run there without the override
  projects and writes exclude entries an abort does not remove.
- **Another machine's clone** (§ 10.1, § 13.1): the window's checks see only the importing machine, so the other clone's
  removal before the quiesce holds by the Owner's confirmation alone, its notes and personal files staying off the
  store.

## Alternatives & Rationale

**Merging the flip after the import, not before.** Merging first, through today's integration checkpoint, would put
the merge, which cannot simply be undone, ahead of an import not yet shown to hold, and turn an import's abort into a
revert of the flip on `main`. Merging after keeps every abort before the merge local to refs and configuration. The
cost is that the flip's own landing runs outside ARC's checkpoint, as an Owner-directed merge of an exact head, since
once the import has run the sealing guard refuses the in-repo implementation's integration writes and the store's
checkpoint is a canary path no rehearsal reaches.

**Selecting the in-repo backend by an environment override, not by the registry's presence.** Choosing the backend by
whether `refs/arc/project/registry` exists would let a clone made after the flip, which holds no registry until it
pulls, fall silently to the in-repo implementation; and the capability, a synchronous property today (`lazyStore`,
`lib/store/create.ts`), would turn on a repository read in every command that builds a store. The override is explicit,
set only in the flip's checkout until its merge, and the tracked-state refusal covers every other checkout.

**Refusing over tracked state alone, not only where no registry ref exists.** Keyed on the registry's absence, the
refusal stopped guarding the moment the import landed: a command in the flip's checkout that ran without the override
would project before the merge, and a checkout that merged `main` while still tracking its own records would open the
store over them. Tracked state is the condition that makes a ref store wrong, whatever the registry holds, and it is a
fact every flip build can read for itself on any machine and in CI. The registry is read only to choose the remedy.

**Explicit in-repo construction in tests, not a suite-wide override.** A suite-wide override would hide the flipped
default from the tests that should see it and reach every CLI process the end-to-end and integration tests spawn.

**Two rehearsal stages on full copies, not one, and not a hosted throwaway.** One stage could not start until the last
projection member lands and the flip change builds, so every step's first run would sit just ahead of the window.
A hosted throwaway repository would rehearse its own CI and reviewer setup more than the flip; the canaries reach the
hosted paths on the real repository, with the Owner present.

**Fixing forward after the merge, not reverting.** Reverting the merge and restoring the record would lose the store
writes made after it and unwind every checkout that had already merged and rebuilt.

**State first and alone in `arc sync`.** Keeping the legs paired would let a slow or failing push gate hold state
back, for a pairing whose only reason — notes keyed to commits — retires.

**The old notes ref under an unpublished namespace, not an archive tag.** A tag is published by `git push --tags`,
which would put every past personal note on a public origin.

**Untracking the `.internal/` records, not leaving them.** Left tracked, they would be stale copies of
authority-bearing records in every checkout, and a missed in-repo reader would read them and pass rather than fail.

**Metas for the pre-meta archive folders, not a tracked folder outside the projected roots.** One archive keeps every
shipped work unit, and nothing else reads a second location.

**Deleting the projected-root templates, not relocating them within the package.** The install-claims rebuild that
follows requires every file under the package's `arc/` to carry a claim, so a template kept there but no longer
installed would fail its coverage check.

**Reading completed integrations from the store in base drift, not leaving the resolver on the base tree.** Once no
completed meta lands on base, the tree resolver names nothing, and a squash or rebase project's checkpoint would refuse
reconciliation.

## Cross-cutting Considerations

### Security and privacy

The import publishes this repository's personal state — inboxes, working memory, session context, scratch — to a public
origin, beside its project state, and a published ref may be copied before any abort. The pre-import tidy, worked from
the import's trial run, is the control; an abort does not unpublish (§ 11). The old notes ref stays under a namespace
nothing pushes (§ 12). Machine-local state — `.arc/user/<id>/.internal/`, `.git/arc/`, `.notes.lock`, `.machine-id`,
and from the flip the checkpoint records — never enters the store (`MACHINE_LOCAL_PATHS`).

### Testing

- **Unit, integration, and end-to-end tests** change as § 7 lists, building the in-repo backend explicitly where they
  target it, and CI passes over the post-deletion tree ahead of the window.
- **The fence harness** runs on the ref and reference backends (§ 14.3).
- **Stage 2** carries the end-to-end work unit, the perturbations, the parser check, the destructive CLI matrix, the
  partial-protection start, and the store-backed cases (§ 9).
- **Review** reads the change chunk by chunk: the flip code, the test changes, the workflow rewrite with its synced
  package copy read once, and Stage 2 with the destructive CLI matrix; the deletion commit is checked by the accounting
  case and CI.

### Performance

The ref backend's tripwire report gives its first live figures in Stage 2, from `arc handoff write`'s maintenance and
the rewired sync's push (§ 9.2). The representative decomposition cut records its execute half's time (§ 9.9).

### Compatibility and migration

ARC is pre-public-release, so no compatibility alias or migration reader is added for the in-repo path; the in-repo
implementation stays, unreached, until its deletion pass. A pre-flip clone that has not merged `main` runs its own
pre-flip build; once that clone holds the registry ref, the sealing guard refuses its writes with a remedy naming the
merge and rebuild. The flip build refuses to open a ref store over any tree that still tracks ARC state (§ 3.2). Another
machine's clone is removed before the quiesce, its notes and personal files staying off the store, and that machine
re-enters only by a fresh clone (§ 10.1).

### User-facing impact

From the flip a session saves state instead of committing it, closes tasks through `arc task close`, plans without a
branch, writes handoff through `arc handoff write`, pauses rather than parks, and routes captures through `arc route`
and `arc inbox`. `arc store` appears in help; `arc user` notes commands refuse once the registry exists; help text
describes the store's arms (§ 6.1). A project's Markdown tooling changes as the notice describes (§ 6.2).

### Rollout

The window runs once, by § 10's order, after a clean Stage 2 at the head that lands. Nothing else lands after it until
each canary has (§ 9.11).

## Success Criteria

1. **Stage 2 is clean at the head that lands.** Every § 9.2 step passes at the flip branch's reviewed head, which the
   merged head differs from only by the deletion commit, re-run after any later change to the flip change, the import,
   or the rewritten workflows; each § 9.3 perturbation shows its refusal, repair, and continuation; and the destructive
   CLI matrix and the partial-protection start pass beside it.
2. **The window completes,** every § 10 step in order and none aborted, with the accounting case reporting no tracked
   file under a projected root unplaced, and the chain comparison giving the same chain or the same refusal for every
   Candidate record through both readers.
3. **The ref store is the default.** After the merge, a command run in any checkout without the override opens the ref
   backend, and Stage 2's end-to-end run finds no command taking a pre-flip arm; and the flip build refuses over any
   tree that still tracks ARC state, as § 3.2 states, both before the import and after it.
4. **No tracked state remains.** Once the flip merges, no tracked file sits under `.arc/active/`, `.arc/backlog/`, or
   `.arc/completed/`, or in `.arc/system/.internal/candidates/` and `.arc/system/.internal/transitions/`, and no
   installed file is written into a projected root by `arc init` or `arc update`.
5. **Each store path behaves as § 4 states,** each with a test: sync publishes state first and reports each leg;
   the capture gates read `arc inbox`; the rename source refuses a missing folder; base drift names integrations from
   stored completed records; the store archive records `PR URL` and `Completed`; checkpoint records live under the
   identity's `.internal/` by work-unit UID; `arc init` designates and mints; an Errand's branch carries its UID
   suffix; `arc store` shows in help; and a hand edit of a cohort record refuses a member section naming no member.
6. **The process text is rewritten.** Every site in § 8's site list is rewritten in the package source and synced, and
   a search of the shipped workflow, method, skill, rule, and always-loaded text for the retired forms finds only the
   sites § 8 keeps.
7. **The tests change with the flip,** each § 7 entry changed, and CI passes over the post-deletion tree.
8. **The fence holds.** The § 14.3 harness passes on both backends for the take-in, the archive, and the register
   closures.
9. **The register rows close on their witnesses.** Each § 17.1 row closes through the store after the merge with its
   witness named; each § 17.2 row stays open naming its remaining share.
10. **The notes refs are retired.** No notes ref remains on `origin`; the importing machine's old ref survives only
    outside `refs/tags/` and unpushed; and every `arc user` notes writer refuses.
11. **ADR-035's two amendments land** for items 2 and 8.
12. **Both canaries land:** the first Errand and the first work unit after the window, each through the hosted steps
    it exists to test.

## Open Questions

None.

## Amendments

None.

---
