# Spec (`detailed` · `RFC`): seam-lifecycle

- **Origin:** [internal]

- **Purpose:** Route ARC's transition write path — every verb that creates, moves, retires, or archives a work unit's
  records — through the storage contract, keeping today's behavior until the flip but for five named fixes, and settle
  what each move means once state leaves tracked files: a pause in place of park, branch links that record whether ARC
  created the branch, and a task close verb that captures commits.

---

## Introduction / Context

ARC's storage contract is shipped: one interface for every read and write of operational and planning state (`Store`,
`lib/store/contract.ts`), an in-repo implementation over today's substrates (`lib/store/in-repo/`), and, for the meta,
task list, design artifacts, lineage record, and cohort document, a registered parser, typed field writers, and a write
check each (`lib/store/kinds/`). Callers have not moved onto it. The transition write path — the lifecycle executor
(`lib/work-unit/lifecycle-executor.ts`) and its context, the verbs under `lib/work-unit/verbs/`, `arc start` and
graduation, rename, Errand promotion, and teardown — still writes beneath the contract:

- it rewrites tracked metas through setters and stages them itself (`stageMeta`, `lib/work-unit/executor-context.ts`),
  and commits its own ceremonies (`commitAndPushStartCeremony`, `handlers/start.ts`; `commitTracked`,
  `commands/rename.ts`);
- it writes lineage under `.arc/system/.internal/transitions/` (`writeTransitionRecord`,
  `lib/work-unit/transition-record-store.ts`) and numbers archives from the checkout's own copy of `completed/`
  (`computeArchiveDestination`, `lib/work-unit/completed-index.ts`);
- a park from Planning lands a commit on base (`park-planning-landing.ts`), and every edge re-renders ROADMAP and
  `STATUS.USER` (`withRender`, `lib/work-unit/lifecycle-transitions.ts`) and opens or closes the personal workspace
  (`userWorkspaceHandler`, `executor-context.ts`).

The import ratchet counts these reads beneath the contract (`store-raw-state`, `surface-names`, and `work-unit-paths`,
`eslint/architecture-imports.ts`, recorded in `eslint-suppressions.json`). Until they go through the contract, a backend
storing state under `refs/arc/*` cannot replace the in-repo implementation.

The moves themselves were carried over unchanged. The contract maps today's transition table onto the store, each move
a placement or `State` write and each end moving the item's ref under history, without asking what a move should mean
once state no longer lives on branches. Several of today's meanings exist only because of the substrate: a park
relocates a work unit into `backlog/` and lands on base, every Planning work unit holds a `plan/` branch, teardown reaps
a branch found by its name, a task is ticked `[x]` by hand before the commit that does it, and the archive number comes
from whichever checkout archives.

Defects observed or verified at source shape the rest:

- **The first live abandon** (2026-07-24, under full protection) hit six failures between verbs that each did their
  own part — the retirement receipt unreachable from the target worktree, a cascade staged on the protected base, an
  over-promised ROADMAP row, a second Errand to carry the commit, the remote branch left behind, and a hand-rendered
  ROADMAP — and took three Errands, three pull requests, and four manual Git operations.
- **A start that cannot resume.** On 2026-10-07 `arc start quality-gate-hooks` spawned the worktree, staged the
  graduation, failed its ceremony commit on a pre-commit check, and exited with no continuation:
  `commitAndPushStartCeremony` names a retry only for a failed push.
- **Duplicate archive numbers.** Two parallel archives both took 31 in `2026-q3`.
- **A dropped seed.** The spawning arm of `arc start` accepts `--from` and drops it (`handlers/start.ts`; `createNew`
  takes no seed).
- **Activation renames base.** A bare `arc activate` on a work unit whose `Branch` names base renames base itself:
  `handleActivate` passes `<type>/<slug>`, and `reconcileBranch` runs `git branch -m` on whatever `Branch` names.
- **The workspace closes too early.** The executor runs `runUserClose` among the side effects, before its final record
  writes, so a throw there returns `finalize-failed` with the workspace already removed.
- **A dirty checkout surfaces late.** Abandon and a park from Planning record the transition and leave the checkout's
  removal to a later `arc teardown <name>` (`runAbandon`, `verbs/abandon.ts`), so a dirty checkout surfaces only after
  the move is recorded.

**Terms used throughout:**

- **Store, backend, record, kind, field writer, write check** — as `lib/store/` defines them. The kinds' parsers,
  writers, and checks live under `lib/store/kinds/`.
- **In-repo implementation** — the backend over today's tracked files, personal files, and transient-identity ref
  (`lib/store/in-repo/`). **Reference backend** — the in-memory, test-only backend the store's conformance suite runs
  (`__tests__/helpers/store/reference-backend.ts`). **Ref backend** — a planned backend storing state under
  `refs/arc/*`, not yet built; its **import** is the one-time move of a repository's state into it.
- **The flip** — the per-repository switch after which the store reports `capabilities.stateOffBranch` as true
  (`StoreCapabilitiesSchema`, `lib/store/read.ts`); the in-repo implementation reports false and the reference backend
  true. A verb whose behavior differs across the flip branches on that capability, never on a configuration value.
  Its **in-repo arm** is the path that runs while the capability is false, and its **arm from the flip** the path that
  runs once it is true. The **cutover's deletion pass** later removes the in-repo arms.
- **Projection, write-back, save** — the planned gitignored working copy at the familiar `.arc/` paths, and its two
  paths for persisting a person's edits: automatic write-back and the explicit `arc save`. Not yet built. A **hand
  edit** is a write whose content a person edited rather than a verb composed.
- **Work item** — a work unit, whose primary record is its meta (`work-item/meta`), or an Errand, whose primary record
  is its Errand record (`work-item/record`).
- **Placement** — a record's logical lifecycle location (`ReadPlacementSchema`, `lib/store/placement.ts`): active,
  backlog planned or provisional, or completed. A work unit is **in flight** when placed active, a **stub** when placed
  backlog, and **archived** when placed completed. Until the flip a work unit is **parked** when its `State` is `Active`
  and it is placed backlog planned (`deriveState`, `lib/work-unit/lifecycle-resolver.ts`).
- **Base** — the configured base branch (`branch.base`). **Work branch** — the branch a work unit's code lands from.
- **Branch link** — a work item's link to a branch, stored in its links (`LinksSchema`, `lib/store/links.ts`); until the
  flip the meta's `Branch` field carries the work branch. § 5 adds whether ARC created the branch or adopted it, and the
  link's **exclusions**.
- **Work-unit marker** — the machine-local file naming the work unit a checkout holds
  (`.arc/system/.internal/worktree-marker.json`, `lib/git/worktree-marker.ts`). A **spawned checkout** is a linked
  worktree ARC created for its work item, its marker carrying `spawnedByArc: true`. An **anchored checkout** is one ARC
  claimed in place without creating it — through `arc start --here`, `arc materialize --here`, or on the primary — its
  marker carrying `spawnedByArc: false` from the flip.
- **Task capture** — a commit recorded against a closed task in its work item's links (`taskCaptures`,
  `CommitCaptureSchema`, `lib/store/links.ts`). A branch link's **exclusions** are the commits on its branch recorded as
  no task's work (§ 5.2). Both name a commit by its SHA and its copy key — its author line and its patch-id, each hashed
  — and the close matches a commit to either by SHA or copy key, so a rebase that leaves a commit's author line and diff
  alone keeps the match, and gives a rewrite that keeps only the author line, with a new committer time, to its
  original's task, or to the exclusions where its original is excluded (§ 5.2, § 9.2).
- **Pause** — from the flip, a section of a work unit's meta recording who paused it, why, and what it waits on (§ 8.1).
  It replaces park.
- **Removal check, removal function** — the one read-only check that decides whether ARC may remove a work item's
  checkout, and the one function that removes it (§ 11).
- **`D` and `A` numbers** — the shipped storage contract's decisions and amendments (`spec-storage-contract.md`), cited
  for the behavior they define; where this design changes one, § 18 states the change. **Record kinds** — the shipped
  kinds under `lib/store/kinds/`, specified in `spec-seam-record-kinds.md`.

## Shared decisions

The storage seam's other plans cite these two shared-decision numbers. Each resolves to the section below that defines
it.

| Item | Decision             | Current sections |
| ---- | -------------------- | ---------------- |
| 10   | The archive sequence | § 4              |
| 12   | Prepared writes      | § 3              |

## Goals

1. **Every verb in scope writes through the contract from the flip** — its records through `Store` with caller
   provenance naming the verb, its fields through the record kinds' writers — while its in-repo arm stays today's code,
   branched on `capabilities.stateOffBranch` (§ 2).
2. **No observable change before the flip** but five fixes, each of a defect seen or verified at source (§ 1.5), the
   one workflow-text change the seed fix carries (§ 13), one move form (§ 11.6), the Class verb (§ 10), and the
   refusals of the verbs that start at the flip (§ 17).
3. **Every move's meaning settled for the flip:** a pause replacing park, a handover verb, one abandon path from a
   stub, Planning, and Active, reopen bounded to Integrating, deactivation keeping the work branch, and the archive
   sequence final once pushed (§ 4, § 8).
4. **Branchless planning's write half:** activation creates or adopts the work branch, never base, and records it as a
   branch link stating whether ARC created it and which of its commits are no task's work; a detached Planning checkout
   has a catch-up verb (§ 5, § 6).
5. **ARC deletes only branches it created,** never one a person made, on its own authority (§ 12).
6. **Tasks close through a verb that captures their commits,** with the commit and its close at one fire site and no
   prose step ordering them where task commits route through the release wrapper; on the raw route one step follows
   the commit, and the listing of commits not yet closed catches a skipped close (§ 9).
7. **One removal function and one removal check** for every checkout of a work unit or Errand that ARC removes (§ 11).
8. **Every refusal and report of unfinished work this design adds carries the command that repairs it** (§ 16).
9. **No ratchet floor grows,** but by the callers the newly counted archive index records (§ 1.4), and in this change's
   files every remaining floor entry sits in an in-repo arm (§ 1.6).

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This change does not:

- **build the ref backend or its import, the projection, write-back, `arc save`, or the projection's worktree lock.** It
  builds the import's handling of branch links only under § 5.4's ordering condition, and fills none of the projection's
  slots (§ 11.2).
- **change any workflow's text before the flip,** but for the cold-start step the seed fix corrects (§ 13), or perform
  the flip's rewrite of the workflows — the task loop, activation's remote-branch step, the handoff and init steps that
  hand-edit `Owner`, and the steps that hand-edit `Class`.
- **reroute decomposition's cut** (`decompose-sweep.ts` and the `decompose-v3-*` and `git-decompose-v3-*` modules),
  **locus and in-flight derivation, session-init's slots and sweeps, status, ROADMAP, and the derived views, or the
  Candidate and review records,** beyond the calls into them this design names (§ 19).
- **change `resolveActiveWu`'s body** (`lib/release/wu-resolution.ts`); its callers here keep their call.
- **reopen an archived work unit, or check the archive sequence before the flip** (§ 4, § 8.7).
- **let anyone but a work unit's owner reassign it,** as a maintainer would for an owner who is unavailable.
- **resume a failed graduation before the flip** (§ 15), **reap a ref set before the flip** (§ 12.5), or **seed a
  promoted work unit's workspace before the flip** (§ 7.3).
- **change the `route-discovered-work` method's text** (§ 14).
- **rename code identifiers.**

## Proposed Design

§ 1 bounds the change and orders it. § 2–4 reroute the write path and settle the two shared decisions. § 5–12 settle
what each move does from the flip. § 13–17 carry the remaining fixes, the refusal rule, and the verb surface. § 18 states
the amendments to the shipped contract and record kinds, and § 19 the expected contracts this design consumes.

### 1. Boundary, scope, and order

#### 1.1 One work unit

The boundary read keeps the change whole (`stays one WU`). Its concern is one, the transition write path, and what was
orthogonal to it is already separate work: decomposition's own machine, locus and in-flight derivation, and the record
kinds every writer uses. What remains — the reroute and what each move means from the flip — is one design over the
same files, the executor, the verbs, and the lifecycle handlers, each verb carrying its in-repo arm beside its arm from
the flip. Split, the two halves would serialize on those files. The change's size is a review question, answered by
review chunks on one branch (§ 1.3); no chunk lands on its own, so the change carries no delivery plan.

#### 1.2 What this change takes

- **The executor and lifecycle index:** `lifecycle-executor.ts`, `lifecycle-transitions.ts`, `lifecycle-guards.ts`,
  `executor-context.ts`, `executor-context-current-wu.ts`, `executor-context-status.ts` (the `STATUS.USER` write; the
  ROADMAP render it binds is status's), `lifecycle-index.ts`, `composed-lifecycle-index.ts`, `transition-overlay.ts`,
  `lifecycle-state.ts`, `lifecycle-resolver.ts`, `lifecycle-query.ts`, `lifecycle-membership.ts`, `lifecycle-deps.ts`,
  and `transform-coordination.ts`, all under `lib/work-unit/`.
- **The verbs** under `lib/work-unit/verbs/`, but for `attest.ts`, which delivery owns: `abandon`, `activate-deactivate`,
  `archive`, `dispatch`, `finalize-stage`, `materialize`, `park-resume`, `promote-demote`, `publish`, `rename`, `reopen`,
  `repoint-design`, `set-stage`, `stub`, and `teardown`.
- **Mutators and side effects:** `mutators/reconcile-branch.ts`, `mutators/reconcile-work-unit-worktree.ts`,
  `mutators/relocate-artifacts.ts`, `mutators/rename-artifacts.ts`, `mutators/rewrite-renamed-meta.ts`,
  `mutators/set-phase.ts`, `side-effects/discharge-dep-edges.ts`, `side-effects/readiness-regen.ts`, and
  `side-effects/user-workspace.ts`, which § 1.4 deletes.
- **Start and graduation:** `handlers/start.ts`; `commands/start.ts`'s dispatch, graduation, and create-new arms (its
  cold start, `runColdStart`, is locus's but for the seed fix, § 13); `lib/git/worktree-scaffold.ts`
  (`scaffoldIntoWorktree`), which create-new and the cold start share (§ 2.5); `atomic-graduation.ts`,
  `git-graduation-transaction.ts`, `validated-graduation-transaction.ts`, `planning-artifact-tuple.ts`, and
  `backlog-stub.ts`.
- **Retirement, lineage, rename, and archive:** `direct-retirement-driver.ts`, `retirement-authority.ts`,
  `retirement-authorization.ts`, `git-retirement-authorization-context.ts`, `teardown-lifecycle-projection.ts`,
  `park-planning-landing.ts`, `park-retirement-proof.ts`, `pointer-record.ts`, `terminal-transition-record-writer.ts`,
  `transition-record-store.ts`, `transition-record-enumeration.ts`, `transition-disposition-query.ts`,
  `reference-reconcile.ts`, `rename-identity.ts`, `rename-preflight.ts`, `rename-reference-sweep.ts`,
  `rename-user-workspace.ts`, `rename-worktree-transaction.ts`, `completed-index.ts`, and
  `git-owned-decompose-candidate-cleanup.ts`, shared with decomposition; `in-repo-retirement-authority.ts`, which § 1.4
  deletes.
- **Handlers and commands:** `handlers/lifecycle.ts`, `handlers/lifecycle-shared.ts`,
  `handlers/lifecycle-delivery-review.ts` (publication and the reopen permit; the rest is delivery's),
  `handlers/reconcile.ts`, `handlers/plan.ts` and `handlers/housekeep.ts` (the write-context checks),
  `handlers/status/lifecycle.ts` (lifecycle state by slug), `handlers/base.ts`'s `handleBaseSync` (its detached arm,
  § 6.2), `commands/rename.ts`, `handlers/release/commit.ts` and `handlers/release/push.ts` with `lib/release/types.ts`
  (their refusals on an ambiguous work unit), with `handlers/release/commit-cli.ts`, `lib/release/schema.ts`, and
  `lib/release/interlock-validation.ts` for `--close` (§ 9.3), `lib/active/cohort-consistency.ts`, and the lifecycle
  callers of `lib/active/meta-reader.ts` and `lib/release/wu-resolution.ts`.
- **Errand promotion:** `lib/errand/promote.ts`, beside which this change builds promotion's arm from the flip (§ 7.2),
  and `lib/errand/promote-runtime.ts`, shared with locus's reroute.
- **The Git worktree layer:** `lib/git/worktree-porcelain.ts`, whose parsers gain the lock lines (§ 11.1), the removal
  function's own new module beside it (§ 11), which also holds the function a spawn runs to clear a registration whose
  folder is missing (§ 6), and `lib/git/linked-worktree.ts` and `lib/git/worktree-location.ts`, for the spawn with no
  branch and, in the first, the optional step that runs that function (§ 6). The copy key's function is a new module,
  `lib/git/copy-key.ts` (§ 5.2). `lib/git/worktree-cleanup.ts` stays as it is: `isWorktreeClean` keeps serving the
  callers locus moves onto the removal check, and `decideWorktreeCleanup` is locus's (§ 11.4).
- **Workflow text:** none before the flip but the cold-start step (§ 13). The lifecycle and planning workflows keep
  today's text; the flip's rewrite of them is not this change's.

Modules outside this list change with it: the store's links schema (`lib/store/links.ts`, § 5), lookup's commit request
(`lib/store/lookup.ts`, § 5.1), a write's and a read's placement for the cohort document (`lib/store/write.ts`,
`lib/store/placement.ts`, § 18.2), and the meta kind (`lib/store/kinds/meta/`, § 18), each by a forward amendment; and
the Git bindings (`lib/git/exec.ts`, `lib/git/process-executor.ts`, and `lib/change-facts.ts`'s binding of the same
type), whose byte-preserving binding gains the removal of named variables from its child's environment for the copy
key's producer (§ 5.2).

#### 1.3 Review chunks and their order

The change lands as one merge, reviewed in chunks. The first chunks run in this order:

1. **The seed fix** (§ 13), ahead of locus's reroute of the cold start in the same file.
2. **Setup: unreachable code** (§ 1.4).
3. **Setup: the archive index joins the ratchet** (§ 1.4).

The removal function and its check (§ 11) precede every chunk that moves a caller onto them. A file another change also
rewrites serializes with it: `commands/start.ts`, `lib/git/worktree-scaffold.ts`, and `lib/errand/promote-runtime.ts`
with locus, `git-owned-decompose-candidate-cleanup.ts` with decomposition, and `handlers/base.ts` with the cutover.

#### 1.4 The setup chunks

**Unreachable code goes first,** so nothing is rerouted only to be deleted. No production path reaches:

- `lib/work-unit/in-repo-retirement-authority.ts`, which nothing imports;
- `lib/work-unit/side-effects/user-workspace.ts`, which only its test imports;
- the `worktree-clean` guard (`makeWorktreeCleanGuard`, `lifecycle-guards.ts`), declared only on park from Active's
  edge, which `runPark` sends to `parkActive`, which calls the teardown directly, so the guard never runs;
- `reconcileBranch`'s `delete` arm, which no edge declares;
- `dischargeDepEdges` (`side-effects/discharge-dep-edges.ts`), `sweepRenameReferences`
  (`rename-reference-sweep.ts`), `listBacklogStubs` (`backlog-stub.ts`), `resolveCohortMembers` and
  `isArchivalTriggered` (`lifecycle-membership.ts`), and `resolveReverseDeps` (`lifecycle-deps.ts`), which have no
  production caller.

The TSDoc links and module docs naming them go with them: in `archive.ts`, `lifecycle-membership.ts`,
`rename-reference-sweep.ts`'s `RenameReferenceSweepContext`, `discharge-dep-edges.ts`, `decompose-sweep.ts`, and the
guard's mentions in `lifecycle-executor.ts`, `lifecycle-transitions.ts`, `park-resume.ts`, and `executor-context.ts`, and
the delete arm's in `lifecycle-transitions.ts`'s operation docs.

**The archive index joins the ratchet.** The pure slug helpers `branchToWorkUnitSlug` and `completedWorkUnitMetaSlug`
move out of `completed-index.ts` into a module of their own, since eleven files import the index for them alone, three
of them lifecycle's. `completed-index.ts` then joins the `store-raw-state` helper set (`RAW_STATE_MODULES`,
`eslint/architecture-imports.ts`), with its remaining callers recorded in `eslint-suppressions.json` as the floor, so
archive's and teardown's reads of it count and no slug parse does.

The floor still misses two reads no rule names, each moved by the change that owns its caller where its arm from the
flip reads it: `.arc/` paths built with `join` (§ 2.3), and the task-list path imported upward from the command layer
(`resolveTaskListPath`, `commands/active/status.ts`), whose production importers here are `verbs/reopen.ts` and the
reopen permit (`permitDeliveryReopen`, `handlers/lifecycle-delivery-review.ts`), which move, and `verbs/publish.ts`,
whose read stays in its in-repo arm (§ 2.3).

#### 1.5 Before the flip

Today's behavior holds until the flip but for five fixes, each of a defect seen or verified at source and each with its
own test:

1. **The seed fix** (§ 13).
2. **The removal check runs before an abandon or a park from Planning records anything** (§ 11.3).
3. **The workspace closes after the transition's record writes** (§ 2.5).
4. **The removal function prunes a registration whose folder is gone** (§ 11.2).
5. **Activation refuses a work unit whose `Branch` names base** (§ 6.1).

Beside them, the setup chunks delete unreachable code and change no behavior (§ 1.4); every move of a work unit's
checkout this change runs or prints takes the doubled-force form, whose only effect before any lock exists is an
accepted edge (§ 11.6); and the code for anchored checkouts is dormant until locus admits their marker (§ 11.4). Two
additions also land before the flip: `arc set-class`, which works at once (§ 10), and the verbs that start at the
flip, each registered and refusing `unsupported` until then, naming the path that serves (§ 16, § 17). Every other
change in this design runs only in an arm from the flip.

#### 1.6 In-repo arms kept until the deletion pass

These run only while `capabilities.stateOffBranch` is false, and the cutover's deletion pass removes them:

- **Commits and staging:** the executor's `stageMeta` (`executor-context.ts`); the verbs' own `git add` in `archive.ts`,
  `park-resume.ts`, and `abandon.ts`; the terminal writer's staging (`terminal-transition-record-writer.ts`);
  activation's prepared write into a captured index (`executor-context-current-wu.ts`); the start ceremony's commit and
  push (`commitAndPushStartCeremony`); graduation's commits (`atomic-graduation.ts`); rename's `commitTracked`; and the
  pointer record's direct index write (`park-planning-landing.ts`).
- **Rendered files:** ROADMAP's render and the `STATUS.USER` write on each edge (`withRender`,
  `executor-context-status.ts`, `side-effects/readiness-regen.ts`), and abandon's and park's direct calls to it.
- **The personal workspace:** the executor's open and close (`userWorkspaceHandler`, `runUserOpen`, `runUserClose`),
  teardown's close for an abandoned work unit, and rename's move of it (`rename-user-workspace.ts`).
- **The scaffold's writes:** `scaffoldIntoWorktree`'s direct meta write and its `runUserOpen` call, which its own arm
  from the flip replaces (§ 2.5).
- **Park:** `arc park` and park's legs of `arc resume` (`park-resume.ts`), the pointer record (`composePointerRecord`,
  `pointer-record.ts`), park from Planning's landing (`park-planning-landing.ts`) and the evidence teardown accepts for
  it (`park-retirement-proof.ts`, and `current-husk-advisory.ts`'s `park-planning` transition value), and the parked
  position in `deriveState`.
- **`plan/` branches:** `reconcileBranch`'s plan-branch legs, deactivation's rename back under `plan/`, graduation's
  plan-branch stamping (`prepareValidatedGraduationTransaction`), and every other `plan/<slug>` read, write, or check on
  graduation's and create-new's paths — the occupation and branch-absence checks (`validOccupation`, `branchIsAbsent`),
  the branch `occupy` creates, create-new's branch choice and its rollback's deletion (`rollbackSpawnedWorktree`), and
  the start prompts naming it.
- **Archive by path:** `computeArchiveDestination`, the cohort sidecar sweeps (`sweepCohortDoc`,
  `sweepNestedParentDoc`), and relocation's `git mv` (`relocate-artifacts.ts`, whose artifact matchers stay).
- **Lineage on disk:** `transition-record-store.ts`, `transition-record-enumeration.ts`, and rename's lineage record
  (`createInRepoTerminalTransitionRecordWriter`).
- **Git retirement evidence:** the Git-proven transition teardown reads (`git-retirement-authorization-context.ts`,
  `authorizeFromGitTransition`).
- **Discovery behind the in-repo listing:** `lifecycle-index.ts`'s `collectLifecycleMetaFiles`,
  `compareLifecycleSources`, and `entryFromMeta`, and `composed-lifecycle-index.ts`, which the in-repo implementation
  reads (`lib/store/in-repo/meta.ts`), with the transition overlay it takes (`transition-overlay.ts`), the typed tokens
  that suppress a retiring work unit's record while it composes.
- **Rename's stub-branch leg** (`withRenameStubBranch`, `rename-identity.ts`) and its refusal of a started work unit
  with no branch.
- **Promotion's runtime settlement** (`promoteOrdinaryErrandAtRuntime`, `promote-runtime.ts`), until locus has it
  select § 7.2's steps.
- **The release wrapper's refusals on an ambiguous work unit** (`handlers/release/commit.ts`, `handlers/release/push.ts`,
  `lib/release/types.ts`).
- **The write-context checks' branch requirement** (`handlers/plan.ts`, `handlers/housekeep.ts`, § 2.3).
- **The cohort consistency check's folder conditions,** its folder match and its cohort document per grouping folder
  (`lib/active/cohort-consistency.ts`, § 2.6).
- **Each verb's direct meta and task-list reads and writes,** wherever its arm from the flip reads and writes the same
  records through `Store`.

Every floor entry left at landing in the parts of § 1.2's files this change reroutes sits inside one of these.

### 2. The reroute

#### 2.1 Two arms per verb

Each verb in § 1.2 reads `capabilities` from the store it opens and branches once:

- **Its in-repo arm** runs today's code, § 1.5's fixes aside. The in-repo implementation refuses placement moves,
  archive, renames, and links as `unsupported` (`admittedWritePath`, `lib/store/in-repo/write-admission.ts`;
  `lib/store/in-repo/tracked-identity.ts`), so those moves keep today's code until the flip.
- **Its arm from the flip** reads its records through `read`, `list`, and `lookup`, applies the record kinds' field
  writers to the content it read (`lib/store/kinds/meta/writers.ts`; the task list's marker writer), and persists a
  transition's record writes in one `batch` with expected versions (D3), its caller provenance naming the verb and its
  lifecycle action (`CallerProvenanceSchema`, `lib/store/links.ts`), with `codeHead` where the transition binds a code
  commit. No caller formats a field value: `finalize-stage.ts`'s preformatted values (`formatValue`) give way to the
  writers' typed values.
- **Git steps around the batch** — a spawn, a branch cut or rename, a checkout's removal, a branch's reap — either
  precede it and roll back on its failure, or follow it and are idempotent on rerun (§ 15).
- **A transition's arm from the flip runs inside the executor** (`executeTransition`), so one edge table and one set of
  guards serve both arms: it resolves the work unit's position from the store's lifecycle index rather than the
  checkout's files (`buildLifecycleIndex`), through the slug-keyed view its guards read (§ 2.3), selects the edge and
  runs its guards as today, each edge declaring its form from the flip beside today's — its soft fields, less those that
  retire at the flip, its artifacts, its side effects, and the Git steps it takes before or after its batch — and lands
  the record writes of its legs and finalize step in the one batch. The verb supplies those Git steps, its worktree and
  branch legs, since some are chosen at run time, as activation's branch step is (§ 6.1). A verb that writes outside any
  transition — the Class verb, `arc set-stage`, `arc finalize`, `arc repoint-design`, the pause and handover verbs, and
  the close — reads, applies, and batches the same way directly.
- **An incomplete index refuses.** The store's lifecycle listing reports a meta it cannot parse, or one whose `State` it
  does not know, as a `malformed` diagnostic and marks the listing missed (`listLifecycleIndex`,
  `lib/store/lifecycle-index.ts`), where today's index drops that meta silently (`buildLifecycleIndex`). From the flip
  every read of the slug-keyed view (§ 2.3) that precedes a write refuses over such a listing, as the store's lifecycle
  storage already does (`requireCompleteInventory`, `lib/store/lifecycle-storage.ts`), naming each record and its
  condition, since a missing entry proves no absence over a partial index: a transition's, the reconcile's prepare,
  which activation and publication run before their transition, start's dispatch, rename's subject and collision checks,
  which no store write repeats, and abandon's and resume's handlers, in place of the composed index's indeterminate-slug
  checks (`isComposedLifecycleSlugIndeterminate`), which stay the in-repo arm's. An unreadable listing refuses as it
  does there. A read that only reports, as `arc status <slug>`'s does, proceeds over the view. The reconcile's prepare
  refuses in every mode, its inspection and session start's probe of it included, since its plan would read a malformed
  dependency as nonexistent: the inspection reports the refusal, and session start's probe meets the same refusal, how
  its slot reports it being locus's.

#### 2.2 What each move writes from the flip

| Verb                                                  | Move                                  | Records written from the flip                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `arc stub`                                            | none → backlog provisional or planned | the meta, through the creation writer (`renderMetaFile`), at its placement                                                                                                                                                                                                                                                   |
| `arc promote`, `arc demote`                           | provisional ↔ planned                 | placement within backlog; `Class` where `--class` sets it                                                                                                                                                                                                                                                                    |
| `arc start`                                           | none or a stub → Planning             | the meta created or placed active at `State: Planning`, `Owner` the starter (§ 8.5); no branch link (§ 6)                                                                                                                                                                                                                    |
| `arc activate`                                        | Planning → Active                     | two writes in today's order (`runActivate`): the reconcile's prepared write (§ 3), dependency discharge among it (§ 2.6), then `State: Active` and the branch link written or reattached (§ 5, § 6.1) in the transition's batch                                                                                              |
| `arc deactivate`                                      | Active → Planning                     | `State: Planning`; the branch link kept (§ 8.8)                                                                                                                                                                                                                                                                              |
| `arc publish`                                         | Active → Integrating                  | two writes in today's order (`runPublish`): the reconcile's prepared write (§ 3), after the first Candidate authorization and before the re-authorization, then `State: Integrating` in the transition's batch after the boundary claim                                                                                      |
| `arc reopen`                                          | Integrating → Active                  | `State: Active` (§ 8.7)                                                                                                                                                                                                                                                                                                      |
| `arc archive`                                         | Active or Integrating → completed     | placement `completed`, the backend assigning the sequence (§ 4); the meta's session context, both handoff anchors, and `Session Type` cleared and `Next Action` reset; the cohort document completed in the same batch when its last open member archives; no `PR URL` or `Branch` written to the meta, which the links hold |
| `arc abandon`                                         | a stub, Planning, or Active → ended   | the lineage record created and the primary removed, in one batch (§ 8.6)                                                                                                                                                                                                                                                     |
| `arc pause`, `arc resume`                             | none                                  | the pause section written or cleared (§ 8.1)                                                                                                                                                                                                                                                                                 |
| `arc handover`                                        | none                                  | `Owner` (§ 8.5)                                                                                                                                                                                                                                                                                                              |
| `arc rename`                                          | none                                  | the name and aliases, with the reference sweep's edits, and a renamed branch's link under its new `ref` (§ 7.1)                                                                                                                                                                                                              |
| `arc set-stage`, `arc finalize`, `arc repoint-design` | none                                  | `Current Workflow` and `Next Action`; `Class`, `Task List`, and `Next Action`; `Design`, with the spec-finalized stage advance below (A1)                                                                                                                                                                                    |
| `arc set-class`                                       | none                                  | `Class` (§ 10)                                                                                                                                                                                                                                                                                                               |
| `arc task close`, `arc task defer`                    | none                                  | task markers and captures (§ 9)                                                                                                                                                                                                                                                                                              |
| `arc errand promote`                                  | Errand → work unit                    | the Errand's primary put to its meta role, with the work branch's link (§ 7.2)                                                                                                                                                                                                                                               |
| `arc teardown`, `arc materialize`                     | none                                  | no record; the checkout and branches (§ 8.4, § 11, § 12)                                                                                                                                                                                                                                                                     |

For an off-branch Planning work unit, `arc repoint-design <slug> spec-finalized` writes the repointed `Design`,
`Current Workflow: generate-tasks`, and the begin-current-workflow `Next Action` sentinel in one checked batch (A1).
The subsequent `arc set-stage generate-tasks --advance` remains an idempotent repeat of that stage advance. A refused
batch leaves all three fields unchanged. The draft-created event writes only `Design`; the in-repo arm keeps its
existing sequence. The strict stage check remains in force: `checkMetaStage` checks the resulting active record through
`checkCurrentWorkflowConsistency`, so a separate spec-pointer write while the workflow remains `create-spec` cannot
serve as an intermediate state.

Beside what its row names, each move writes the fields its edge sets today — `Current Workflow` and the soft fields its
entry in the transition table declares (`lifecycle-transitions.ts`) — but those that retire at the flip: `Next Task`,
`Last Completed`, and `Blockers`. `State` and placement write through the meta kind's writers inside the verb's batch;
the backend moves the item's ref under history at an end (archive, abandon) and assigns the archive sequence. From the
flip `arc park` refuses `unsupported`, naming `arc pause <slug> --reason <text>` (§ 8.1), and the verbs that write no
`Next Task` or `Last Completed` keep accepting the flags that set them today (`arc activate --task`,
`arc publish --last-completed`), unwritten, until the deletion pass, `--task` turning optional at the flip
(`ActivateCommandInputSchema`, `handlers/lifecycle.ts`). Since that schema parses before any store opens, the in-repo
arm refuses a missing `--task` itself, naming the flag, before the reconcile's prepare stages anything, and the help
text keeps "(required)" until the deletion pass.

#### 2.3 Reading lifecycle state

- **The current work unit.** The `readActiveMetaCandidates` callers in `handlers/lifecycle.ts`, `executor-context.ts`,
  and `lifecycle-guards.ts` move onto the current-work-unit resolver (`lib/store/current-work-unit.ts`).
  `handlers/reconcile.ts`, which today picks its target by matching the meta's `Branch` to the current branch, takes it
  from the resolver from the flip, since a Planning checkout is detached (§ 6).
- **State by slug and cohort membership** — `arc status <slug>` (`handlers/status/lifecycle.ts`) and lifecycle-complete
  cohort membership (`lifecycle-membership.ts`) — re-home onto the identity-keyed lifecycle index
  (`lib/store/lifecycle-index.ts`). `lifecycle-query.ts` and `verbs/dispatch.ts`, pure over the slug-keyed index, keep
  that input, built from the identity-keyed index's entries by `buildLifecycleIndexFromRecords`
  (`lib/work-unit/lifecycle-index.ts`), as status builds it (`project-view.ts`), so their other callers, status's and
  the integration checkpoint's, keep theirs; the executor's guards and its resume of an interrupted finalization read
  the same slug-keyed view (§ 2.1), built on the store's side with each record's projected path from the layout
  resolver, and read their fields from the records, never a meta at a path. Start's dispatch (`resolveStartDispatch`,
  `commands/start.ts`, from `handlers/start.ts`), rename's subject and collision checks (`resolveRenameSubject`,
  `assertRenameCollisionFree`, `rename-preflight.ts`), and abandon's and resume's handlers (`handleAbandon`,
  `handleResume`, `handlers/lifecycle.ts`), which today compose the index through `resolveTransformComposition` and read
  `Branch` from the meta at its writable path, read the same view from the flip, with `lookup` resolving a former slug
  and the branch coming from the link. The advisory abandon and rename report for a dependent already Integrating
  (`findIntegratingDependentAdvisories`, `transform-coordination.ts`) comes from the view too, from each entry's state
  and `Depends On`; the remote in-flight expansion and the composed index they read today (`expandActiveInFlight`,
  `resolveComposedLifecycleIndex`) stay their in-repo arm, so no lifecycle reader meets a branchless in-flight entry.
- **Work-unit state paths.** Outside § 1.6's arms, no file in § 1.2 builds or parses a work-unit state path: it asks the
  contract for a record, or its projected path, so `resolveArcPath` (`lib/layout/projection.ts`) stays the one layout
  authority. That covers the layout-resolver calls the `work-unit-paths` rule counts and the `.arc/` paths and tier
  prefixes it does not. Those that sit in § 1.6's arms stay: `lifecycle-index.ts`'s `TIERS` and `locationFromPath`
  (`lifecycle-state.ts`) behind the in-repo listing, `relocate-artifacts.ts`'s `PRUNE_BOUNDARY_TIERS`,
  `TRANSITION_RECORD_NAMESPACE` (`transition-record-store.ts`), readiness's user path, the Git-proven retirement's tree
  pathspecs (`git-retirement-authorization-context.ts`), park's paths and graduation's artifact names (§ 8.9, § 6), the
  cohort consistency check's folder conditions (§ 2.6), and `arc promote`'s and `arc demote`'s backlog moves, with
  `completed-index.ts`'s paths, whose callers here move off it (§ 1.4). Those on an arm from the flip reroute:
  `backlog-stub.ts`'s stub resolution, rename's cohort path and its sweep's tier test (`isLifecycleTierFile`,
  `rename-reference-sweep.ts`), and every `join(cwd, ".arc", …)` build outside the arms. A sweep of § 1.2's files for
  `.arc/` literals, tier prefixes, and built artifact filenames is the authority, each site it finds placed by this
  rule. The `DEFAULT_ROOT_SEGMENTS` of `meta-reader.ts` and `wu-resolution.ts` stay, since only their lifecycle callers
  are this change's.
- **The task list.** Publication's read of it feeds only `Last Completed` (`readLastCompletedWork`, `verbs/publish.ts`),
  which retires at the flip, so it sits in the in-repo arm. Reopen's cursor check (`resolveReopenTaskAuthority`,
  `verbs/reopen.ts`) reads the meta and the task list through the store from the flip: it still refuses a reopen without
  `--task` while a task is open, one whose `--task` is not the cursor's, and one with `--task` where no task is open,
  and a `--task` still returns `Current Workflow` to the task loop; only its `Next Task` write retires. The reopen
  permit (`permitDeliveryReopen`, `handlers/lifecycle-delivery-review.ts`) takes the task list's projected path through
  the store from the flip, in place of `resolveTaskListPath` (`commands/active/status.ts`); the read beneath it is
  delivery's (`inspectRepositoryDeliveryReopen`).
- **The write-context checks.** From the flip a stub is groomed and the inbox drained from any checkout (D13, D15), so
  `arc plan check` (`handlers/plan.ts`) drops its committability requirement — base under partial protection, a
  planning branch under full (`classifyPlanningEntry`, `lib/git/write-context.ts`) — and `arc housekeep check`
  (`handlers/housekeep.ts`) its requirement of base in either mode (`resolveWriteContext`), each on the capability;
  until then both resolve the write context as today.

#### 2.4 Commits, ROADMAP, and `STATUS.USER`

From the flip a transition's records persist through the store, so no verb stages a meta or commits a ceremony; § 1.6's
commit and staging legs run only in the in-repo arms. ROADMAP's render on each edge stops on the capability, since
ROADMAP is derived from the flip (D15), and each edge's `STATUS.USER` write ends there too, since status renders it as a
view.

#### 2.5 Session context and the workspace

- **Session context lives in the meta from the flip** (D5). Archive clears the meta's Session Context section, both
  handoff anchors, and `Session Type`, and resets `Next Action`, through the meta kind's writers
  (`writeMetaSessionContext` and the field writers, `lib/store/kinds/meta/writers.ts`).
- **The executor's workspace arm goes at the flip:** `userWorkspaceHandler` (`executor-context.ts`), which runs
  `runUserOpen` and seeds `SESSION-NOTES` on every edge that declares the workspace and lands in an active location, its
  close at an exit, and rename's move of the workspace.
- **So does the scaffold's.** `scaffoldIntoWorktree` (`lib/git/worktree-scaffold.ts`), which create-new and the cold
  start share, writes the meta file itself and calls `runUserOpen`, seeding `SESSION-NOTES`. From the flip
  `scaffoldIntoWorktree` itself branches on the capability, so create-new and the cold start both create the meta
  through the store, rendered by the creation writer (`renderMetaFile`) as today, and seed no `SESSION-NOTES`. Locus's
  reroute of the cold start keeps the call and adds its marker (§ 19); the flip follows both changes, so their order
  does not matter.
- **Before the flip, the close moves after the records** (fix 3). Today `runUserClose` (`commands/user/close.ts`) runs
  among the side effects, before the finalize writes that follow in `lifecycle-executor.ts` — `Branch`, the soft
  fields,   `Current Workflow`, and `stageMeta` — so a throw there returns `finalize-failed` with the workspace gone.
  The close   runs after the transition's record writes instead, as a sequenced step, since the in-repo implementation
  refuses a   batch spanning substrates, and stays idempotent on rerun. Where it throws after the records land, the
  result names   `arc user close <slug>` as its continuation, since a rerun of the transition's verb refuses once its
  records have   moved. Archive is the one edge exposed today: park from Planning   defers the close until its
  retirement completes, park from Active closes after its pointer write, and abandon swaps in   a no-op and closes
  after teardown. Archive's own records follow the executor's — `runArchive` writes `PR URL` and   `Completed` after
  the transition returns, then sweeps the cohort documents — so archive defers the close past them, as   park from
  Planning defers it (`parkPlanning`, `verbs/park-resume.ts`).

#### 2.6 Dependency edges

The shipped policy holds: `Depends On` is the live gate, and activation discharges each edge whose dependency is
shipped or integrating, with no mirrored lineage field (`planDependencyReconcile`,
`side-effects/discharge-dep-edges.ts`). Discharge runs through activation's and publication's prepared writes and
`arc wu reconcile` (§ 3).

The cohort consistency check (`lib/active/cohort-consistency.ts`) has three conditions. Its member-section condition
already runs on the cohort kind's report. Its folder match, a `Cohort` agreeing with the folder its meta is filed
under, and its cohort document per grouping folder retire at the flip, since grouping folders are then the projection's
layout rather than records. The second's guarantee stays with the shipped checks together: `meta.cohort` refuses a
write setting a `Cohort` that names no open cohort document or disagrees with that document's `Parent`
(`checkMetaCohort`, `lib/store/kinds/meta/reference-rules.ts`); `cohort.parent` refuses a `Parent` naming no open
top-level cohort document, `cohort.purpose` a new or changed document with no Purpose, and `cohort.open-members` a
document's retirement while members or subcohorts remain open (`lib/store/kinds/cohort/rules.ts`).

### 3. Prepared writes (shared decision 12)

A prepared write computes edits over a set of records read earlier and applies them later, after a preview or an
approval. The writers that reconcile a work unit's artifacts are prepared writes: `arc wu reconcile`
(`handleWuReconcile`, `handlers/reconcile.ts`), activation's and publication's reconcile (`runActivate`, `runPublish`),
dependency discharge (`planDependencyReconcile`), the current-work-unit reconcile's prepare and apply
(`prepareCurrentWuReconcile`, `applyPreparedCurrentWuReconcile`), rename's reference sweep (`planRenameReferences`,
applied by `applyRenameReferencePlan`), and decomposition's finish and retirement. From the flip each follows one
protocol:

1. **Acquire the whole artifact group:** the meta, the task list, and the prose companions, plus a cohort document where
   the plan selects one — never the meta alone — recording each record's version as read.
2. **Prepare** every edit and removal over those inputs.
3. **Revalidate** each prepared input by its exact record version, or by `changes` restricted to those inputs since the
   acquisition's anchor, and refuse or restart on a mismatch.
4. **Apply** every prepared edit and removal in one `batch`, each with its expected version (D3).

Freshness binds the versions of the records the write covers, or restricted changes since its anchor, never the store's
whole state version (D2), so an unrelated write elsewhere never invalidates a prepared write. Lifecycle owns the
protocol; decomposition's and locus's reconciling writers follow it. Lifecycle also owns the current-work-unit
reconcile's prepare context from the flip, which resolves a former slug through `lookup` to the work item's live primary
(§ 7.1), and a cut or an abandonment from its lineage record, so locus's session probe binds that context rather than
its own. Until the flip each keeps today's freshness: activation's prepared write reads transition records at `HEAD` and
stages into a captured index (`executor-context-current-wu.ts`).

### 4. Archive and the archive sequence (shared decision 10)

The archive sequence is a label people read, never identity (D2): a work unit's order among the work units in its
quarter's archive, output only.

- **No counter record.** From the flip archive writes placement `completed` and names only the quarter; the backend
  assigns the sequence under the quarter's compare-and-swap, which replaces the archive index, and reads and listings
  return it in the placement (`ArchiveSequenceSchema`, `lib/store/placement.ts`; D5, D10). The registry's record-number
  counters serve other counters.
- **The format stays `ArchiveSequenceSchema`'s:** `01` to `09`, then any width. A closed cohort's document borrows the
  number of the member archived with it, its last, lettered `a` for a leaf cohort or `b` for a parent, as today's
  sidecars are (`sweepCohortDoc`, `sweepNestedParentDoc`); a cohort closing with no member archiving takes the
  quarter's next number. The backend assigns both, from the document's completed placement (§ 18.2).
- **Final once pushed.** An archive takes its quarter's highest number plus one. When two machines archive into one
  quarter, the merge after fetch renumbers the unpublished archive after the remote's highest and renames its folder,
  so the verb reports the number after it publishes. A published number is never reassigned, and gaps are allowed. A
  rename of an archived work unit renames its folder and keeps its number, and no verb reopens one (§ 8.7).
- **Renumbering before publish is safe,** because from the flip no record cites an archived work unit by its folder
  path: records only verbs write reference work items by UID. A path to an unpublished archive that prose cites dangles
  after a renumber, a cosmetic residual. One compare-and-swap on the quarter's ref per archive holds at team scale, the
  push loop absorbing a lost race.
- **Closed Errands** are stored in the quarter's archive unnumbered, in a folder named for the branch, never projected
  into `completed/` (D10, D13), and read through `arc view <slug>`. A listing of closed Errands orders by the record's
  close time, the `updatedAt` its close write stamps (`lib/errand/identity-record.ts`; today it is the last write's
  time). Pull-request numbers are no ordering key: a work unit has several, a host-less repository has none, and they
  order by opening rather than completion.
- **Shipped-work readers move to placement and `lookup`.** Teardown's read of the archive index for shipped authority
  moves here; the other readers move with the changes that own them (§ 19).
- **Until the flip** archive keeps taking one past the highest number in its checkout's copy of the quarter
  (`computeArchiveDestination`), with no collision check. No commit or CI check refuses a repeat: with base not
  requiring up-to-date branches, a check on each of two open archive pull requests passes both and fires only after both
  merge, failing every later pull request until a renumber that rewrites the Candidate records citing the quarter's
  folders by path. A repeat is cosmetic, since folders and their readers key on the slug (`NN_<slug>`,
  `completedWorkUnitMetaSlug`, `resolveArcPath`).

### 5. Branch links

#### 5.1 Created or adopted

Every branch entry of `LinksSchema` (`lib/store/links.ts`) gains two required fields, beside `repository` and `ref`:

```ts
const BranchLinkSchema = z.strictObject({
  repository: z.string().min(1),
  ref: z.string().min(1),
  /** Whether ARC cut this branch or took up one a person made. */
  linkedAs: z.enum(["created", "adopted"]),
  /** Commits on the branch recorded as no task's work (§ 5.2, § 9.2). */
  excluded: z.array(CommitCaptureSchema).refine(
    (values) => new Set(values.map((value) => JSON.stringify([value.repository, value.sha]))).size === values.length,
    "A branch link cannot exclude the same repository-qualified commit twice",
  ),
});
```

`excluded` carries the uniqueness rule a task's captures carry (`lib/store/links.ts`). `CommitCaptureSchema` replaces its
optional `patchId` with an optional `copyKey` (§ 5.2), and `lookup`'s commit request (`LookupInputSchema`,
`lib/store/lookup.ts`) does the same:

```ts
/**
 * A commit's copy key: `v1:`, a SHA-256 of its author header value, `:`, and a SHA-256 of its patch-id, from one
 * function (§ 5.2).
 */
const CopyKeySchema = z.string().regex(/^v1:[0-9a-f]{64}:[0-9a-f]{64}$/u);
export const CommitCaptureSchema = z.strictObject({
  repository: z.string().min(1),
  sha: CommitShaSchema,
  copyKey: CopyKeySchema.optional(),
});
```

The schemas are strict, so the fields land before the flip, and no branch link or capture is stored before it: both
in-repo admissions refuse a links write (`admitTrackedRole`, `lib/store/in-repo/write-admission.ts`;
`lib/store/in-repo/transient-write.ts`), so only the store's tests write branch entries and captures, and their fixtures
gain the new fields. Each writer states the record; there is no default:

- **Activation** records `created` when it cuts the work branch, from base or a detached checkout, and `adopted` when it
  takes up and renames a branch it did not link (§ 6.1). A link it reattaches or already holds keeps its record.
- **Promotion** records `created` for the work branch it links (§ 7.2).
- **`arc errand open`** records `created` for the Errand branch it cuts (§ 19).
- **Rename and deactivation** keep the record, and re-activation reattaches the link with it unchanged.
- **The import** maps by name (§ 5.4).

**The trust boundary.** ARC never deletes a branch a person made on its own authority, an abandon's discard included,
though a deletion offered behind an approval the person gives is theirs. Once activation renames an adopted branch into
ARC's form, only the record tells it from one ARC cut, which is why the record exists rather than a name rule.

#### 5.2 Exclusions

A branch link's exclusions are the commits on its branch recorded as no task's work: an adopted branch's commits from
before its activation, a kept branch's from its time back in Planning, and a carried branch's from before the flip's
move. Each is a commit capture (`CommitCaptureSchema`), its SHA with its copy key, a merge commit carrying none. Every
writer of a capture or an exclusion computes the copy key one way, below, so the close can match a commit to either by
SHA or copy key (§ 9.2). Each writer below sets them:

- **Activation** writes none when it cuts the work branch. Adopting a branch, it writes the branch's default set at that
  moment (§ 9.2) — its non-merge commits not on base, none captured — and reports them. Reattaching or keeping a link,
  it adds the default set then, the commits made while the work unit was out of Active, and reports them, none merged in
  from base, as deactivation reports (§ 8.8). Each of these sets runs over the commits `HEAD` holds and those the
  branch's remote-tracking ref holds, `refs/remotes/origin/<name>` under the name the branch had when activation began,
  where the clone has one, after best-effort fetches of base, then that branch, from `origin`, each by its explicit
  refspec (`+refs/heads/<ref>:refs/remotes/origin/<ref>`) in its own call, since Git fails a fetch whole when one
  refspec names no remote ref, as a branch never pushed has none, and each bounded as `arc materialize`'s is
  (`boundedFetch`, `lib/git/exec.ts`, at `DEFAULT_NETWORK_TIMEOUT_MS`), a timeout counting as a failed fetch. Only
  base's failure is reported. A commit made on another checkout while the work unit was out of Active, pushed but not
  yet merged here, is then excluded too. Both sides count even where they have diverged, since a commit on either is no
  task's work; offline the set covers what the clone holds. Where no base ref resolves after the fetch, adopting or
  reattaching refuses before writing anything, naming the repair the default close names (§ 9.2), since a set with no
  base would take the branch's whole history. Each report names `arc task close <ids> --commit <sha>…` for any of them
  that is task work, marking those `HEAD` lacks with the merge that brings them in first,
  `git merge --ff --no-edit <sha>` of the remote-tracking ref's tip as the report read it, which runs on the objects the
  fetch brought in, needs no upstream and no ref, keeps the reported SHAs, and overrides `merge.ff=only`, since
  `--commit` takes only commits `HEAD` holds (§ 9.2), and activation proceeds.
- **`arc errand open`** writes none.
- **Promotion** writes, on the work branch's link, the exclusions the Errand's link holds, none, so the Errand's commits
  stay in the close's default capture for the work a scale-floor promotion's work unit backfills, Active at once
  (`metaOverrides`, `promote-runtime.ts`). A derivation-floor promotion's work unit, in Planning, meets them in
  activation's report.
- **The import** writes, for a work unit's branch link, the branch's default set at the move — its non-merge commits
  not on base, less those whose captures it derives from `Context:` footers (D16) — over the tip it finds: of a local
  branch and its remote that differ, the one containing the other, and the remote's where only the remote holds it. An
  Errand's link it gives none, since an Errand has no tasks for exclusions to serve, so a scale-floor promotion's work
  unit keeps a promoted Errand's commits, from before the flip or after, in its default capture, as promotion's bullet
  says.
- **An explicit close** may name an excluded commit: it captures the named commit, and every exclusion that commit
  matches, by SHA or copy key, leaves the link in the close's batch (§ 9.1).
- **The default close** adds, in its batch, each commit of its set it takes for a rewrite of an excluded commit and of
  no captured one (§ 9.2).

**The copy key** is `v1:`, its **author half**, `:`, and its **patch half**, each the lowercase hexadecimal SHA-256 of
one input: the author half of the commit's author header value as stored, the bytes after the `author` keyword and its
space, up to its newline — name, email, author time, and zone, as `git cat-file --batch` reads them, untouched by
`.mailmap` or configuration — and the patch half of the commit's patch-id, as the hexadecimal text `git patch-id`
prints. One function computes it (`lib/git/copy-key.ts`), and every writer and reader of a key calls it, in this change
and in those § 19 names, since keys computed two ways never match. The patch-id comes from one producer: the commits'
SHAs on standard input to `git diff-tree --stdin -p --full-index --root --text --no-textconv --no-ext-diff`, with
`--diff-algorithm=myers` and `--ignore-submodules=none`, run with `core.quotePath=true`,
`diff.suppressBlankEmpty=false`, and `diff.indentHeuristic=true` set on its command line and `GIT_DIFF_OPTS` removed
from its environment, through the byte-preserving binding (`RawGitExec`, `createExecaRawGitExec`); its output, each 0x01
byte doubled and each NUL written as 0x01 0x02, is given to `git patch-id --verbatim` on its standard input in a second
call, which keeps whitespace. Each pin or flag neutralizes a source found to change the patch text across clones: path
quoting, blank-line suppression, the indent heuristic, a diff driver's algorithm, binary detection by size or by
attribute from any attributes file, a submodule's ignore setting, and `GIT_DIFF_OPTS`; the producer's tests vary each.
The escape exists because `git patch-id` hashes each line only up to its first NUL, which `--text` output of binary or
UTF-16 content holds, so two different edits would share a patch-id; it changes no byte `git patch-id` reads for
structure, so a patch with neither byte keeps Git's own patch-id. Both the author read and `git diff-tree` run with
`--no-replace-objects`, so a replace ref reaches neither half, as it reaches none of the reads the set is computed from
(§ 9.2).

A copy matches only where both halves agree, and a commit whose author half alone equals a stored commit's, its
committer time differing from its author time, is taken for a rewrite of it (§ 9.2). Git writes each commit a new author
line at the time it commits, the time its committer line takes, except where it takes the line from another commit: a
rebase, `pull --rebase`, a cherry-pick, and `commit --amend` take the rewritten commit's, an interactive squash or fixup
its first commit's, and `commit -C` or `-c` (`--reuse-message`, `--reedit-message`) the named commit's, its time
included, each with a new committer time. A rebase or cherry-pick takes the line only where it makes the commit itself,
`rebase --continue` included, and a `git commit` run at a cherry-pick's stop takes it from `CHERRY_PICK_HEAD`; a
`git commit` run by hand at a rebase's stop, or after `cherry-pick -n`, which leaves no `CHERRY_PICK_HEAD`, writes a new
one. A squash by `git reset --soft` or `git merge --squash`, or a split by recommitting, therefore takes a new line
unless it names a commit to `-C` or `-c`. `--reset-author`, `--author`, `--date`, and `rebase --ignore-date`
(`--reset-author-date`) change the line; under default configuration a rebase or cherry-pick re-encodes a commit Git
wrote in another encoding (`i18n.commitEncoding`) to UTF-8; a rewrite can put a line another tool wrote into Git's own
form, as an amend, a reword, or `rebase --apply` does; and `rebase --committer-date-is-author-date`, like a
history-rewriting tool that keeps both of a commit's times, gives the copy a committer time equal to its author time.
The author half keeps apart two different changes a source the producer does not pin might give one patch-id: they join
only where the author lines also agree to the second. A change reverted and made again in a later second than it was
first made is therefore not its earlier self's copy; within that second it is (§ 9.2). An unpinned source, or a Git
release that renders a diff differently, can otherwise only split one commit's patch half across clones, and a rewritten
copy computed on the other side, its committer time differing from its author time, then goes where its original is, to
its task or the exclusions, by its author half (§ 9.2). Keys of different versions never match, so a later change to the
producer is a new version rather than a silent mismatch.

The key is computed only for commits no stored SHA matches, from local objects alone (`objectAccess: "local-only"`,
which sets `GIT_NO_LAZY_FETCH`), so it never fetches outside the bounded fetches, in batches whose patch text stays
under the binding's captured-output cap (`MAX_GIT_OUTPUT_BYTES`, `lib/git/process-executor.ts`). `git diff-tree --stdin`
fails a batch at the first blob or tree it lacks and skips a commit it lacks with no output, so a batch that fails
retries commit by commit, and a commit with no output in its batch carries no key; a commit whose patch cannot be
produced from local objects, as in a partial clone, one whose patch alone exceeds the cap, and an empty commit carry no
key and match by SHA alone (§ 9.2).

Exclusions serve the close's default capture (§ 9.2) and the listing of commits not yet closed (§ 19), and stand in for
D16's bound at the move. ARC's own rewrites remap them from the rewrite's old-to-new mapping as they remap captures
(D16, D20), each remap adding the new commit's SHA and copy key beside the old entry, which stays, and adding nothing
where an entry already holds that SHA, so a rerun changes nothing: the mapping proves the old commit left the rewriting
checkout's branch, not every clone's, and a checkout that has not taken the rewrite still matches its old copy by SHA.
An amend `arc release commit` makes, once the wrapper accepts one, is such a rewrite: it adds the amended commit's new
entry to its captures and exclusions. No stored commit's reachability decides anything: a checkout behind its branch, or
one lacking a commit another machine made, computes the close's set over the commits it holds.

#### 5.3 Repository identity

Every link's repository — a task capture's and the landing commit's (`CommitCaptureSchema`), a branch link's, and a
change request's (`LinksSchema`) — is the project ID (D14), which every clone fetches and which survives moved remotes
and re-clones. The verbs read it once per invocation from the project's identity record (`project-registry/identity`,
`lib/store/catalog.ts`), which the import mints and the in-repo implementation does not store (§ 19), so no link is
written before the flip. A remote's address does not survive them, and the review gate's repository ID
(`resolveRepositoryIdentity`) is minted per clone, though this repository's import adopts it as the project ID. A
project spanning several code repositories mints their IDs when it arises; the schema already carries one per link.

#### 5.4 The import's branch links

The import is the ref backend's (§ 19); this change specifies what it writes for branch links and when it is built:

- **What it writes.** Each live work unit's and open Errand's branch, named by the meta's `Branch` or the Errand
  record's branch, becomes a branch link: `created` when the name is in ARC's forms for the item (`plan/<slug>`,
  `<type>/<slug>`, an Errand's `<errand-type>/<slug>`, `chore/` by default, `lib/errand/branch-type.ts`), and `adopted`
  otherwise — the one inference, which errs toward never reaping a name outside ARC's forms. A `Branch` that is empty
  or names base links no branch, as a cold start under partial protection leaves it (`runColdStart`,
  `commands/start.ts`), so activation creates the work branch (§ 6.1). A branch a person cut by hand in ARC's form for
  the slug imports as `created`, as a cold start on a hand-cut `feat/<slug>` names its work unit after it
  (`deriveColdStartWuName`) and today's abandon already treats it, a named residual.
- **Its refusals.** It refuses a live work unit or open Errand whose branch exists neither locally nor on the remote
  (`branch-missing`), or whose local and remote tips have diverged (`branch-diverged`), naming each way out, since it
  cannot tell which applies: archiving a work unit whose change merged, since a host set to delete merged branches
  removes it before archive runs (GitHub's `delete_branch_on_merge`, on in this repository); restoring the branch,
  correcting `Branch`, or abandoning the work unit; for an Errand, closing or abandoning it or restoring its branch; and
  for diverged tips, merging or pushing to reconcile them. Its trial run lists such cases first.
- **Build order.** Whichever lands second — the import, or this change's `LinksSchema` fields with the meta kind's pause
  section (§ 18) — builds the import's writing of the two fields, its captures' copy keys through § 5.2's function, and
  its two refusals. If the import lands first, this change extends it, since `LinksSchema` would then refuse its plain
  `{ repository, ref }` links and `CommitCaptureSchema` any capture carrying `patchId`.

### 6. Branchless planning, the write half

From the flip a Planning work unit plans in a checkout detached at base's tip, with no branch, and activation creates
the work branch in that checkout (D17). A spawn makes that checkout detached at both places a spawn creates one today,
each of which only creates or attaches a branch: the spawn primitive create-new, materialize, and resume reach
(`createLinkedWorktree`, `lib/git/linked-worktree.ts`) gains a detached mode, and graduation's own spawn, which runs
`git worktree add` itself (`occupy`, `atomic-graduation.ts`), takes `--detach` in place of the `plan/` branch. Neither
rollback deletes a branch, and the location template's `{branch}` (`resolveWorktreeLocation`,
`lib/git/worktree-location.ts`) expands to the work unit's name where the spawn takes no branch. In place,
`arc start --here` leaves `HEAD` where it stands, a detached one included, its capture and occupation checks comparing
`HEAD` where they compare the created branch today (`git-graduation-transaction.ts`, `atomic-graduation.ts`). It takes
any `HEAD`: today's capture requires one at refreshed base's commit, and `graduate` (`handlers/start.ts`) first requires
the checkout's own copy of the stub's meta to match base's, so the stub's artifacts as they stand at base match the
files the in-place start moves, and from the flip the placement write replaces that move, so both requirements are the
in-repo arm's, and the stub's `Class` comes from its record rather than base's copy. So is graduation's preflight
(`preflightGraduate`, `commands/start.ts`), which finds the stub in base's snapshot or the checkout's files and
shape-checks its meta there; from the flip the executor finds the stub in the view, and the meta kind's parser checks
its shape.

A checkout deleted by hand leaves its registration behind, and Git refuses an add at that path, a detached re-spawn's
included ("a missing but already registered worktree"), or an add or checkout of a branch that registration holds
("already used by worktree"), until it is removed. So from the flip one function runs wherever lifecycle spawns a
checkout or switches one onto a work unit's linked branch, before Git meets such a registration. It finds a registration
whose folder is missing at the target path or holding the branch, and clears it through the removal function's
missing-folder arm (§ 11.2), which unlocks the projection's lock first and removes that one registration. A registration
another lock holds refuses `locked`, naming `git worktree unlock <path>` as text, for the lock's owner to decide. It
runs at three sites:

- **Graduation's spawn,** in `graduate` (`handlers/start.ts`) once the spawn's path resolves, ahead of its prepare,
  since `capture` (`git-graduation-transaction.ts`), in both of the prepare's reads, and then `verifyInitialOccupation`
  (`atomic-graduation.ts`) each refuse any registration at the target path. A refusal there writes nothing, and a
  cleared registration, whose folder is gone, holds nothing a later refusal would need back.
- **`createLinkedWorktree`,** once its path resolves and before its add, where its caller supplies the function, as
  `reconcileWorkUnitWorktree` does from the flip for create-new's and materialize's spawns. Locus's callers
  (`createSpawnedLocusWorktree`, `lib/locus/allocator.ts`; `createNodeProvisioningDependencies`,
  `lib/locus/provisioning-runtime.ts`, which `provisionSpawned` reaches) supply none, so their spawns, and
  `provisionSpawned`'s reading of every `refused` result as a checkout to adopt, are unchanged.
- **`reconcileWorkUnitWorktree`'s in-place leg,** before its `git checkout <branch>`, matching the branch alone, for
  `arc materialize --here` (§ 8.4).

Clearing in-process re-reads the folder, so a folder that has come back is never removed, as a removal printed for
someone to run later could remove it. Before the flip, spawns are unchanged. This section settles activation's cases,
the catch-up verb, and the markers that replace Git's one-branch-per-checkout guard.

#### 6.1 Activation

From the flip activation runs one of these arms. It chooses the arm, runs its fetches, and meets every refusal below
before the reconcile's prepared write (§ 2.2), whose apply lands edits a later refusal would not roll back, so a refusal
leaves nothing written:

- **A detached checkout,** as a Planning work unit started from the flip plans: activation creates `<type>/<slug>` at
  base's tip in place and records it `created`, with no exclusions. It refuses while the detached `HEAD` holds
  commits not on base, naming them, as catching up does (§ 6.2), so a stray commit is never dropped; kept on a branch of
  the person's own (`git switch -c <name>`), they reach the work unit through adoption.
- **A checkout on a branch of the person's own** — any checkout, spawned or anchored, on a branch that is neither base
  nor this work item's link, such as an `arc start --here` checkout, possibly with commits, or a detached checkout's
  commits kept with `git switch -c`: activation takes that branch as the work branch and renames it to `<type>/<slug>`
  in place (`git branch -m`, as it renames `plan/<slug>` today through `reconcileBranch`), so `HEAD` stays on it and
  every reader that finds a work unit by its branch name keeps working: the review gate's subject
  (`resolveReviewSubject`), readiness's head-branch check through `branchToWorkUnitSlug`, and rename's `branchPair`. A
  branch already named `<type>/<slug>`, as a cold start on a hand-cut branch names its work unit after it
  (`deriveColdStartWuName`), keeps its name, as `reconcileBranch` leaves an unchanged name alone. It records the link
  `adopted`, the branch's commits so far, with those its remote-tracking ref holds, its exclusions, reported (§ 5.2),
  and never cuts a second branch. It refuses when another branch holds `<type>/<slug>`, naming another `--type` or a
  rename of that branch, when another work item already links the branch, naming `git switch -c <name>`, and where no
  base ref resolves after its fetch (§ 5.2).
- **A branch the work item already links** — a `plan/` branch the flip carried, a promoted work branch (§ 7.2), or one
  kept through a deactivation (§ 8.8) — keeps its record, adds its default set then, over `HEAD` and the branch's
  remote-tracking ref, to its exclusions — the commits made while the work unit was out of Active, a promoted Errand's
  among them — reporting them, refusing where no base ref resolves after its fetch (§ 5.2), and is renamed to
  `<type>/<slug>` only when `--type` names another type than its own; `--type` stays required
  (`ActivateCommandInputSchema`, `handlers/lifecycle.ts`), and `reconcileBranch` leaves an unchanged name alone.
- **Base is never adopted.** An anchored checkout on base, as an anchored primary is, activates as a detached one does,
  creating the work branch at base's tip in place.
- **The old name's remote branch.** Activation's result names the old name's remote branch deletion as a typed action
  only for a link recorded `created`, such as a carried `plan/` branch, and only while the old name's remote-tracking
  ref holds no commit `HEAD` lacks; where it holds one, the result names the deletion as text, to run after the report's
  merge (§ 5.2), so a commit another checkout pushed there keeps its copy on `origin`. The flip's rewrite of
  activation's push step runs the typed actions the result names, as that step deletes the old remote branch today. An
  adopted branch's old remote branch stays the person's, and so does any pull request headed there.

**Before the flip** (fix 5), activation refuses a work unit whose `Branch` names base, as a cold start under partial
protection leaves it (`runColdStart`). Today the bare verb renames base itself — `handleActivate` passes
`<type>/<slug>`, and `reconcileBranch` runs `git branch -m` on whatever `Branch` names — while `activate-work-unit.md`'s
precheck halts first. The refusal names, as text, how to put the work unit on a branch of its own: create the work
branch (`git switch -c <type>/<slug>`), set the meta's `Branch` to it, and run `arc activate` again.

#### 6.2 Catching up while in Planning

- **A detached checkout.** From the flip `arc base sync`, run from a detached checkout of a Planning work unit,
  re-detaches that checkout at base's tip after any sync that leaves base current, updated or already so, and leaves it
  where it stands when the sync refuses. It refuses while the checkout holds commits not on base, naming them and
  `git switch -c <name>` to keep them on a branch, which then catches up by its own merge. This is the catch-up verb D17
  requires. The arm sits in the verb's handler (`handleBaseSync`, `handlers/base.ts`), never in `syncLocalBase`
  (`lib/git/base-sync.ts`), which Errand provisioning also calls. Today the verb updates only base.
- **A checkout on base** catches up with `arc base sync`, which updates base through the checkout that has it out.
- **A checkout on a branch** — the person's own from a cold start, one kept through a deactivation, one a
  derivation-floor promotion linked (§ 7.2), or a `plan/` branch the flip carried — takes base by its person's or
  agent's own merge, since catching up moves no checkout off its branch and `arc base merge` serves only the
  integration checkpoint (`mergeExpectedBase`).

#### 6.3 `plan/` branches

Until the flip, planning keeps `plan/` branches. From the flip the `plan/` prefix and the reaping of `plan/` branches at
abandon, retirement, and teardown retire for work units started from the flip, which plan with no branch but the one a
derivation-floor promotion links (§ 7.2), with `reconcileBranch`'s plan-branch legs and graduation's plan-branch
stamping (`prepareValidatedGraduationTransaction`). A Planning work unit the flip finds on `plan/<slug>` keeps it as its
branch link, recorded `created` by the import, and catches up by its own merge until activation renames it in place,
keeping its record, so its planning commits stay in the work branch's history and the reap at its end finds them
merged. An abandon reaps a `created` link in any state (§ 12).

#### 6.4 One marker per work unit

From the flip the spawn and `arc materialize` run locus's exclusivity check before writing a work-unit marker,
refusing when another registered checkout's marker names the same work unit and naming that checkout, as
`arc start --here` does (§ 19), with the repair: work there, or release it there with `arc locus release`. Every
in-place arm writes an anchored marker (`spawnedByArc: false`), neither of which writes one today:

- **`arc start --here`'s graduation,** which occupies the checkout in `atomicGraduate`'s in-place `occupy`
  (`atomic-graduation.ts`), writes the marker inside its rollback and `verifyRollback`. The cold start's marker is
  locus's.
- **`arc materialize --here`** writes it through `reconcileWorkUnitWorktree`'s in-place leg.

Until the flip the cold start checks only its own checkout (`coldStartOccupancyRefusal`, `commands/start.ts`), and
Git's refusal to check out one branch twice guards the rest.

### 7. Rename and promotion

#### 7.1 Rename

- **A rename is not terminal.** The work item keeps its UID and records its former slugs, so `lookup` still resolves an
  old name; only decomposition and abandonment write lineage (D5).
- **What it writes.** From the flip `arc rename` changes the primary's name and aliases, and applies the edits the
  reference sweep prepares (`planRenameReferences`, applied by `applyRenameReferencePlan`) in the records it may write
  — its own, provisional and planned stubs, and the cohort document — in one version-checked batch (§ 3). An in-flight
  dependent, paused or not, keeps the former slug, which `lookup` resolves at its owner's reconcile. Today's sweep also
  rewrites a parked dependent's meta on base, since it sweeps `backlog/planned/`, where the parked pointer lives.
- **Lineage until the flip.** Rename's lineage record, which `writeTransitionRecord` writes under
  `.arc/system/.internal/transitions/` through the in-repo terminal writer
  (`createInRepoTerminalTransitionRecordWriter`), stays the in-repo arm.
- **Its checkout and branch.** From the flip rename finds the checkout holding the work unit by the work-unit marker
  naming it, through locus's roster (§ 19), not by a branch it has out, since a Planning checkout is detached. It
  renames the work branch only when it is linked and in ARC's form for the slug, keeping its `<prefix>/` (`branchPair`,
  `commands/rename.ts`, which throws today on any other). A link recorded `adopted` outside ARC's forms, and a promoted
  item's Errand branch, keep their names, and rename reports them. A renamed branch's link takes the new name in the
  rename's batch, the entry under the old `ref` retired and one under the new carrying its `linkedAs` and exclusions.
  Today's refusal of a started work unit with no branch holds only until the flip. Rename moves only a spawned checkout
  (§ 11.4), in the doubled-force form (§ 11.6).
- **Its steps around the batch** (§ 2.1). The local branch's rename and the checkout's — the marker's work-unit name and
  a spawned checkout's move, through the rename transaction (`createNodeRenameWorktreeTransactionDriver`,
  `commands/rename.ts`) — run before the batch and are rolled back where it refuses, since the roster finds the checkout
  by that name. The remote leg (`reconcileRenameRemoteBranch`, `rename-identity.ts`), which pushes the new name and
  deletes the old against the head read before the rename, runs after it, reconciling on rerun, as its delete reads an old
  name gone as absent (`deleteRemoteBranch`); where it fails the result names `arc rename <old> <new>` as a typed
  continuation (§ 15), and that rerun, finding the item already named `<new>` as today's rerun reads it (`resuming`,
  `resolveRenameSubject`), runs only that leg. The old name's remote branch is deleted only for a link recorded `created`:
  an adopted branch in ARC's form is renamed and pushed under its new name, and its old remote branch stays the
  person's, as an adopted branch's does at activation (§ 6.1), rename's result naming it.
- **The legacy personal workspace (A3).** From the flip rename leaves its files and notes state untouched, including
  when both old-name and new-name workspace directories exist. A workspace conflict cannot make the operational
  rename partial. The call to `runUserRenameWorkspace` remains only in the in-repo arm (§ 1.6, § 2.5).
- **A stub's rename.** Today renaming a stub switches the checkout to a `chore/rename-<old>-to-<new>` branch cut from
  base, whatever role the checkout holds (`withRenameStubBranch`, `rename-identity.ts`, taken on the stub shape in
  `verbs/rename.ts`). From the flip a stub's rename writes through the store with no branch switch, so one invoked from
  a checkout holding a transient role contributes to that transient and opens no second change request.
- **An archived work unit.** A rename of an archived work unit renames its folder and keeps its number (§ 4), needing no
  checkout holding it. On a clone lacking the item's history ref the write refuses with the unresolvable-state-version
  code, naming the ref, and the verb pulls it by name and retries (§ 19). The code joins the store's refusals
  (`StoreRefusalSchema`, `lib/store/refusal.ts`) with the ref backend, so whichever of the two changes lands second
  builds the retry. The in-repo arm keeps today's refusals of it, the first from `resolveSubjectShape`
  (`commands/rename.ts`), which finds no checkout holding the work unit, before `assertRenameSubjectPreconditions`
  (`rename-preflight.ts`) refuses it as archived.

#### 7.2 Promotion

- **One write.** Promotion is the contract's role change (A5): an expected-version put of the Errand's primary to its
  meta role on the same UID, keeping its links, description, placement, aliases, and history, with the work branch as a
  second branch link (A3).
- **The same at both floors, from the flip,** but for the state it writes. Promotion links the work branch
  `<type>/<name>` (`--type`, default `feat`), cut at the Errand's tip with the checkout switched onto it, recorded
  `created` with the Errand link's exclusions, none (§ 5.2). Today a derivation-floor promotion renames the Errand
  branch to `plan/<name>` and a scale-floor one to `<type>/<name>` (`promotionBranch`).
- **A derivation-floor work unit,** Planning at `draft-design` (`metaOverrides`), stays on that branch and catches up by
  its own merge (§ 6.2) until activation, which keeps its record and its name when `--type` names the type promotion
  gave it, renaming it to `<type>/<name>` otherwise (§ 6.1).
- **This change builds promotion's arm from the flip** as steps that `promoteOrdinaryErrand` (`lib/errand/promote.ts`)
  composes, in a module of their own beside it: `promoteOrdinaryErrand` runs no store or Git itself, and today's runtime
  supplies its steps (`promote-runtime.ts`). They are the put — the role change, with the work branch's `created` link
  and its inherited exclusions — and the Git step that cuts `<type>/<name>` at the Errand's tip and switches the
  checkout onto it, in place of today's `git branch -m`. Their tests run the composition over the reference backend and
  the scripted `GitExec` fake. Until locus reroutes it, the in-repo implementation keeps
  `promoteOrdinaryErrandAtRuntime` (`lib/errand/promote-runtime.ts`) and its commit-required settlement; locus's change
  has that runtime select these steps on the capability, with its marker settlement, and the two changes serialize on
  it. The put and the cut fill the composition's frame step (`replaceFrame`); from the flip its `retire` step finds
  nothing left to end, since the role change ends the Errand's role on the same UID, and its identity reads go through
  the store. The put renders the meta as `metaOverrides` does, less `Branch`, which the link holds, and
  `Last Completed`, which retires at the flip (§ 2.2). The full-protection refusal (`promoteOrdinaryErrand`) stays as
  today.
- **A promoted work item projects what a fresh start does:** its scratch folder and session start's `lookup` reconcile
  key on the current record set, whatever created the item.

#### 7.3 A promoted work unit's workspace before the flip

Today promotion renames the branch and writes the meta (`applyLocalEvidence`) but never calls `runUserOpen`, so a
promoted work unit gets no workspace or `SESSION-NOTES` seed until its next edge that declares the workspace and lands
in an active location, activation or publication, or until a handoff writes one. No interim fix is planned; from the
flip session context lives in the meta (§ 2.5).

### 8. Lifecycle moves from the flip

Until the flip every move keeps today's in-repo arm.

#### 8.1 Pause and resume

From the flip `arc pause` and `arc resume` replace `arc park`, matching the Errand's `paused` state
(`arc errand leave`). A pause is a section of the work unit's meta rather than a move: it pauses a Planning or Active
work unit, as park does today, and changes neither its `State` nor its placement, so the work unit stays in flight. A
stub is never paused: it is not in flight, and a pause on one refuses, naming `arc start <slug>` to work it.

- **The section** records who paused the work unit and since when; the reason, which the verb requires on a first
  pause, as park requires `--reason` today; what it waits on — a note, or a work unit named by slug under `Depends On`'s
  rules, so the in-flight meta keeps a former slug, which `lookup` resolves (§ 18); the resume notes; and whether the
  owner opens it to takers, a flag the Paused tier and the review prompt show (§ 19). Taking the work stays the owner's
  `arc handover` (§ 8.5), so D13's edit rights do not move.
- **Its shape.** The meta's parsed record gains `pause`, `null` when absent:

  ```ts
  interface MetaPause {
    pausedBy: Slug;                  // identity slug, as `Owner` is
    since: string;                   // ISO 8601 UTC timestamp the pause began
    reason: string;
    waitsOn: { kind: "work-unit"; slug: Slug } | { kind: "note"; text: string } | null;
    resumeNotes: string | null;
    open: boolean;
  }
  ```

  It renders as a `## Pause` section inside the meta's field block, past its field lines as Session Context is, its
  fields as bullets — `Paused By` and `Since` backticked, `Reason` as prose, `Waits On` a backticked slug or a prose
  note and omitted when `null`, and `Open to Takers` as `` `true` `` and omitted when false — and its resume notes as a
  `### Resume Notes` subsection, omitted when `null`. The field region ends at the block's first `##` heading
  (`locateMetaFieldBlock`, `lib/store/kinds/meta/line-reading.ts`; `extractMetadataSection`), so no field reader or
  writer reads the section's bullets, and none of its labels is a meta field's, which the meta validator collects
  across the whole file (`collectFieldValues`, `scripts/validate-meta-spec.ts`). Readers find each section by its
  heading, so its order beside Session Context is free. One section writer sets it whole, inserts it where the field
  region ends when absent, and removes it on `null`, and throws on a body line that would end the section, as the
  Session Context writer does (`writeMetaSessionContext`).
- **The verbs.** `arc pause [<slug>] [--reason <text>] [--waits-on <slug> | --waits-on-note <text> | --no-waits-on]
  [--resume-notes <text> | --no-resume-notes] [--open | --no-open]` writes the section; the slug defaults to the
  checkout's work unit, as `arc park [slug]` does. A first pause refuses without `--reason`. On a paused work unit it
  updates the fields it is given, keeps the rest, and keeps when the pause began; `--no-waits-on` and
  `--no-resume-notes` clear those fields. `arc resume [<slug>]` clears the section and nothing else; a paused work unit
  whose checkout was released gets one back from `arc materialize` (§ 8.4), so from the flip `arc resume --here`
  refuses, naming `arc materialize <slug> --here`.
- **Pausing reports work no one else can reach** — the work branch's unpushed commits and uncommitted changes in the
  checkout, read as a handover reads them (§ 8.5) — without refusing; where `origin` cannot be reached it reports over
  the refs the clone holds and says `origin` was not refreshed.
- **The checkout stays** unless its owner releases it with locus's `arc locus release`, which runs the removal check and
  function on a spawned checkout and the release on an anchored one (§ 11, § 19).
- **Before the flip** `arc pause` refuses `unsupported`, naming `arc park`, and `arc resume` resumes a parked work unit
  as today.

#### 8.2 Verbs on a paused work unit

A verb that advances the work refuses on a paused work unit, naming `arc resume <slug>`: a `State`, placement, or stage
change, a task close or deferral, and an edge reconcile, as the record kinds' remedy for a parked dependent already
has it. Each meets the pause where it runs:

- **A transition** meets it as a guard on each edge that advances the work — activation, deactivation, publication,
  and archive, never abandon's or resume's — declared beside the edge's others (`GuardId`, `lifecycle-transitions.ts`)
  with its validator bound over the store the executor holds, as the index-aware guards are bound
  (`buildFootgunGuards`, `lifecycle-guards.ts`), since a guard's context carries no meta (`GuardContext`).
- **The task close and defer verbs, `arc set-stage`** — which writes the stage outside any transition (`runSetStage`) —
  **and the edge reconcile** check it themselves, the reconcile in the apply that `arc wu reconcile`, activation, and
  publication share (`applyPreparedCurrentWuReconcile`, `discharge-dep-edges.ts`), so a paused work unit's activation or
  publication refuses before its reconcile writes; its prepare writes nothing, so a prepare on a paused work unit
  proceeds.
- **`arc release commit --close`** checks the pause among its checks before it commits (§ 9.3).

Every other write proceeds with the pause in place: abandon and a decomposition's cut, handover, rename, pausing again,
the Class verb, `arc repoint-design`, and hand edits. Delivery's `arc attest` takes the same check in its own change
(§ 19).

#### 8.3 Where a pause shows

A pause shows wherever its work unit does: a Paused tier for Planning and Active work alike in `arc status` and
ROADMAP, with its reason and what it waits on; the owner's paused work at session start, each marked resumable once the
work unit it waits on ships and review-due at once if that work unit ends unshipped, abandoned or cut; and, in the
work unit's own checkout, the pause, its reason, and its resume notes before any work starts. A pause waiting on no
work unit, a note included, is flagged for review after `pause.review_after_days`, a project setting beside
`inbox.remind_after_days`, visible to everyone, and its owner is asked to resume it, hand it over, open it to takers, or
abandon it. Status and locus render these (§ 19); this change writes the section they read.

Today park is visible only for work that reached Active, in ROADMAP's Parked tier and `arc status`; session start's
materialize offer skips it (`findMaterializableWorkUnits`); park from Planning lists the work unit as an ordinary stub;
and nothing records what releases a park.

#### 8.4 `arc materialize`

From the flip `arc materialize <slug>` gives a checkout to any in-flight work unit its identity owns that no checkout on
this machine holds — remote-only, or released here, paused or not — and leaves a pause in place. It finds its candidates
in the store's listing, less the work units locus's roster finds a checkout here holding (§ 19), rather than among
`origin`'s branches (`resolveMaterializeCandidate`, `handlers/lifecycle.ts`), so a work unit with no branch link is a
candidate too. What it gives follows the work unit's branch link:

- **A linked branch:** the spawn attaches the branch in a new linked checkout — the clone's local branch where it has
  one, as resume's spawn re-attaches it (`createBranch: false`, `runResume`), or one created from its remote-tracking
  ref, as materialize's spawn creates it today (`createBranch: true`, `verbs/materialize.ts`), so a released checkout's
  kept branch and a branch never pushed both spawn — and `--here` switches the current checkout onto it, as today
  (`reconcileWorkUnitWorktree`).
- **No branch link,** as a Planning work unit from the flip has none (§ 6): the spawn creates a linked checkout detached
  at base's tip, where a Planning work unit plans, and `--here` writes the anchored marker alone and leaves `HEAD` where
  it stands, as `arc start --here` does, so activation's arms take whatever `HEAD` then holds (§ 6.1). It needs `origin`
  for nothing but base's best-effort fetch, and offline it spawns at the base the clone has; where no base ref resolves,
  the spawn refuses, naming the repair the default close names (§ 9.2).

It runs the exclusivity check (§ 6.4), and `--here` writes an anchored marker. It refuses whenever a checkout with no
marker has the work unit's linked branch out — one released, or one claimed in place before the flip, when the cold
start, graduation's in-place occupation, and the in-place legs wrote no marker — where a spawn would meet Git's refusal,
naming that checkout and `arc materialize <slug> --here` run from it. A registration whose folder was deleted by hand
counts as no checkout: the spawn clears it before its add, and `--here` before its checkout (§ 6). It fetches base, then
the branch, each by its explicit refspec in its own call (§ 5.2), so the clone's base refs are no older than the branch
it brings in (§ 9.2); where the fetches fail it spawns from the branch or the remote-tracking ref the clone holds,
refusing only where it holds neither. That refusal tells a failed branch fetch apart as a handover does (§ 8.5): where
`origin` lacks the branch it names `git push -u origin <branch>`, run from the clone that holds it, and otherwise the
fetch's retry once `origin` is reachable. Today it fetches the branch alone, refuses on any failure
(`fetchMaterializeBranch`, `handlers/lifecycle.ts`), and admits only remote-only work units that are not parked
(`findMaterializableWorkUnits`, `handleMaterialize`). From the flip `arc start` on a started Planning work unit refuses,
naming the checkout here that holds it, or `arc materialize <slug>` where none does, in place of today's text, which
sends the person to the work unit's branch (`resolveStartDispatch`, `commands/start.ts`).

#### 8.5 Handover and `Owner`

- **Handing a work unit over** stays a write of the owner field alone. From the flip
  `arc handover [<slug>] --to <identity>` makes it, refusing while work the new owner cannot reach remains — the work
  branch's unpushed commits, or uncommitted changes in the owner's checkout on this machine — naming each. The handover
  context travels in the meta's session context (D5), the pause's resume notes first.
- **The work it checks** is read one way, which pausing's report shares (§ 8.1). The checkout here is the one whose
  marker names the work unit, found through locus's roster (§ 19), its uncommitted changes read by the removal check's
  Git part (§ 11.1). The branch's unpushed commits are those on no ref another person reaches: after bounded fetches of
  base, then the branch, each by its explicit refspec in its own call (§ 5.2), the commits
  `git rev-list <branch> --not refs/remotes/origin/<branch> refs/remotes/origin/<base>` lists, either remote-tracking
  ref dropped where absent. Git fails the branch's fetch alike, exit 128, where `origin` lacks the branch and where
  `origin` cannot be reached, and a failed fetch leaves a stale remote-tracking ref in place, so a failed branch fetch
  is told apart by `git ls-remote --exit-code origin refs/heads/<branch>`, which exits 2 where `origin` lacks the branch
  and fails otherwise. Where `origin` lacks it — a branch never pushed, or one gone from `origin` — the count drops the
  branch's remote-tracking ref, stale or not, so it and a branch pushed with no upstream count every commit beyond base,
  repaired by `git push -u origin <branch>`, which needs no upstream; a work unit with no branch link has none. Where
  `origin` cannot be reached — base's fetch fails, or the branch's fails and the listing does not exit 2 — the handover
  refuses, naming the retry once `origin` is reachable, since a remote-tracking ref the clone holds can still show a
  branch pushed that `origin` has since dropped or rewound. A clone with no `origin` refuses only on uncommitted changes
  and reports the branch's commits as held only in this clone, since no remote holds them for either owner.
- **`Owner` turns verb-owned** (§ 18): creation writes it, `arc handover` changes it, and starting a stub records the
  starter, since whoever starts the work owns it, as a cold start records its spawner (`owner: params.spawningIdentity`,
  `worktree-scaffold.ts`). Starting another person's stub reports the previous owner without refusing, since anyone
  grooms a stub (D13). Today graduation writes no `Owner` and keeps the stub's, its identity reaching only the ownership
  marker, through the spawn request (`handlers/start.ts` into `git-graduation-transaction.ts`).
- **The former owner's checkout.** Session start offers the former owner `arc locus release` for the checkout it kept
  once it finds the work unit owned by someone else (§ 19).
- **Before the flip** `arc handover` refuses `unsupported`, naming the `Owner` edit it replaces.

#### 8.6 Abandon

From the flip an abandon takes one path from every state it leaves — a stub, Planning, or Active, paused or not.
Integrating refuses, as today (`runAbandon`, `validFromStates`); its route out is `arc reopen`, after which abandon
takes the work unit from Active. The path:

1. the removal check (§ 11.1), where a checkout on this machine holds the work unit;
2. one batch creating the lineage record and removing the primary, which ends the item and moves its ref under
   history; the lineage retains the primary's exact branch-link list for cleanup after removal (§ 12.1, A2);
3. the checkout's removal, or an anchored checkout's release (§ 11.4);
4. the reap of a work branch ARC created (§ 12).

Where step 3 or 4 fails after the batch, the result names `arc teardown <slug>` as its continuation, which reads the
lineage record and finishes both (§ 12).

Today's per-state arms (`runAbandon`, `verbs/abandon.ts`) retire with the substrate: the artifacts' removal staged in
the abandoning checkout (`buildRemoveRunner`), the deferred `arc teardown <name>` (`planAbandon`), and the ROADMAP
render. From the flip the path runs through the executor (§ 2.1), whose abandon edges keep their confirmation guard.

#### 8.7 Reopen

Reopen stays Integrating to Active, a `State` write, and no verb reopens an archived work unit: shipped work that needs
more takes a follow-on work unit, since its change has merged. A correction to an archived work unit, such as the errata
convention for its release notes (`archive-work-unit.md`), is a write to the completed item in place, which keeps its
number, where reopening and archiving again would assign a new one; the ref backend's reopen of an archived item keeps
no lifecycle caller. The pull-request withdrawal and merge check reopen runs today (`runReopen`) stay as change-request
effects.

#### 8.8 Deactivate

Deactivation, Active back to Planning, keeps the work branch as the work unit's branch link, and the checkout stays on
it; re-activation reattaches the link rather than cutting another (§ 6.1). From the flip deactivation reports the
default set (§ 9.2), over base fetched first as activation fetches it (§ 5.2) — the task work a re-activation would then
record as excluded, none merged in from base — naming `arc task close`, and proceeds, as a pause reports unshared work.
Where no base ref resolves after that fetch, it skips the report, saying base did not resolve and naming the repair the
default close names (§ 9.2), and proceeds. Today deactivation renames the branch back under `plan/` (`reconcileBranch`).

#### 8.9 Parked work at the flip

Park's machinery retires at the flip, as an in-repo arm (§ 1.6): the pointer record (`composePointerRecord`,
`pointer-record.ts`), park from Planning's landing on base (`park-planning-landing.ts`) and the evidence teardown accepts
for it (`park-retirement-proof.ts`, and `current-husk-advisory.ts`'s `park-planning` transition value), and the parked
position, `State: Active` placed in the backlog (`deriveState`), with park from Planning's return to a stub. A work
unit the flip finds parked becomes a paused one, which the import writes (§ 19): in flight at `Active`, its pause's
reason the pointer record's `Reason:` line, paused by its `Owner` since the commit that first wrote the pointer, and
its records read from the parked branch's head, where the pointer record says they are. A work unit parked from
Planning is a stub and imports as one. The meta kind therefore carries the pause section before the import runs
(§ 5.4).

### 9. The task close verb

#### 9.1 Closing and deferring

`arc task close [<ids>…] [--commit <sha>…]` closes tasks and captures their commits (D16), and
`arc task defer <id>` defers one, since a deferral leaves a task open only through a verb, as completion does. Both
start at the flip; until then tasks are marked by hand, and both refuse `unsupported`, naming the hand `[x]` or `[~]`.

- **With no IDs** the close closes the task cursor's leaf — the first open parent's first open subtask, or that parent
  where it has none (`TaskListCursor`'s `leaf`, `resolveTaskListCursor`, `lib/task-list/cursor.ts`), as the cursor's
  shipped readers take it — refusing where no task is open, naming a deferred task's close, `arc task close <id>`, or a
  new task for the work, never a closed task's ID, since corrective work takes a new task; named IDs close a set, such
  as a deferred-review range. A named ID no task carries, or a task list that does not read, refuses, naming the task
  list's IDs or the line it could not read.
- **What each verb takes.** The close takes an open or a deferred task, closing it `[x]`, and re-closes a task already
  `[x]`, as D16's rerun after an amend does; since a close with no IDs takes the cursor's leaf, a rerun names the task.
  The deferral takes only an open task, refusing any other: a closed task stays closed, and corrective work takes a new
  task.
- **Captures only grow.** A close, a re-close included, adds the commits it captures to each task's captures and never
  removes one, so no commit still on the branch loses its capture, whatever this checkout has fetched or merged. A
  task's captures therefore record every commit the task has closed over, which may include one a rewrite has since
  replaced and which then matches nothing on a branch that took the rewrite; ARC's own rewrites add the new commit's
  entry beside it (§ 5.2). A re-close with nothing new to capture changes nothing, and its result says so.
- **Parents follow.** Closing a parent closes its open subtasks with it, recording the captures against each task it
  closes, as for a named set, since the task-list scanner rejects an open subtask beneath a parent marked `[x]`
  (`lib/task-list/scanner.ts`); deferring a parent defers its open subtasks. Then, when a close or a deferral leaves
  every subtask of a parent closed, `[x]` or `[~]`, as the cursor reads them (`firstOpenCursor` skips both), the parent
  closes too: `[x]` when any subtask is `[x]`, `[~]` when all were deferred. A deferred parent with a subtask already
  `[x]` therefore closes `[x]`. A parent the cascade closes records no captures of its own, its work being its
  subtasks'; a parent closed by name records the close's captures, as each task it closes does.
- **It writes** each task's marker through the task-list kind's marker writer, and records the captures in the work
  item's links (`taskCaptures`), keyed by task ID, with every exclusion a commit it names matches, by SHA or copy key,
  leaving the branch link (§ 5.2), with the default close's attributions (§ 9.2), in one batch.
- **The deferral's note.** Its outcome note, saying why, stays the agent's hand edit, as completion notes do (§ 9.5).
- **It never commits,** and stays standalone for a commit made in an editor or by other tooling.

#### 9.2 The default capture

The close reads the branch link whose ref the checkout has out, through one resolver that `--close`'s check (§ 9.3) and
the listing of commits not yet closed also call, each applying its own refusal. It refuses on a detached checkout or one
on a branch the work item does not link, naming the work branch to switch to, and, where the work item has no branch
link, as a Planning work unit from the flip has none (§ 6), naming `arc activate`, whatever the checkout has out, a
detached checkout included. An Active work item with no link, as the import leaves one whose `Branch` was empty or named
base (§ 5.4), names `arc deactivate <slug>`, then `arc activate`, since activation moves only Planning to Active, and
deactivation, keeping whatever link there is, leaves activation's arms to create the branch (§ 6.1, § 8.8). With no
`--commit` it refreshes base, then captures the **default set**: the non-merge commits reachable from `HEAD` and from
neither base nor base's remote-tracking ref, `refs/remotes/origin/<base>` where the clone has one (`origin` being the
one remote ARC names, as each Git module's own `DEFAULT_REMOTE` names it, `lib/git/remote-ref-reader.ts` among them),
less every commit that matches, by SHA or by copy key, one of the work item's captures or one of the link's exclusions
(§ 5.2). It is a difference over the commits `HEAD` holds, and no stored commit's reachability enters it. A base merge's
commits therefore never land in a task's captures, nor an adopted branch's earlier commits, a kept branch's from its
time out of Active, or any from before the flip's move; a commit a rebase copied with its author line and diff unchanged
matches its original's capture or exclusion; and no commit is captured twice. The set is `HEAD` for an increment of one
commit and every commit of one multi-commit split. `--commit` names the commits instead, repeatable and combinable with
IDs, refuses a commit not reachable from `HEAD`, and may name an excluded commit: the close captures it, and every
exclusion it matches, by SHA or copy key, leaves the link (§ 5.2). The set's walk, `--commit`'s reachability check, and
activation's and deactivation's snapshots run with `--no-replace-objects`, so a replace ref neither hides a commit from
the set nor turns one into a merge.

- **Base is refreshed first.** A clone whose base refs are older than base commits its branch holds — brought in by a
  fetch of the branch alone, as `git pull origin <branch>` does — would read those commits as task work, and no close
  removes a capture. The close therefore fetches base from `origin` before it computes the set, best-effort, by base's
  explicit refspec, `+refs/heads/<base>:refs/remotes/origin/<base>`, which a clone whose configured refspec omits base,
  as a single-branch clone's does, still writes, where `git fetch origin <base>` exits clean and writes no ref. The
  fetch is bounded as `arc materialize`'s is (`boundedFetch`, `lib/git/exec.ts`, at `DEFAULT_NETWORK_TIMEOUT_MS`), and
  `arc materialize` fetches base with the branch (§ 8.4). Where the fetch fails or times out, as offline, the close
  computes over the base refs the clone has, and its result says base was not refreshed. Where no base ref resolves
  even then, the default close refuses, naming that fetch, or, in a clone with no `origin`, a local base branch
  (`git branch <base> <commit>`), since a set with no base would take the branch's whole history. A clone with no
  `origin` computes over its local base and reports nothing about refreshing. `arc release commit --close` runs this
  fetch before it commits, and its close reuses the result (§ 9.3). Where the refresh empties a set that was not empty
  over the base refs the clone had before it, the default close refuses, recording nothing, since the fetch has already
  updated base's remote-tracking ref: it names the commits the refresh found on base, with `arc task close <id>` for
  the cursor's task, or the IDs it was given, should that task have produced no commit. The rerun finds its set empty
  from the start and closes the task with no capture. A set the refresh only shrank closes as usual, a close whose
  fetch fails compares nothing, and `--close` never meets the refusal, since its set holds the commit it made.
- **A rewritten copy goes to its original.** A hand rewrite that keeps a commit's author line — a rebase, a cherry-pick,
  an interactive squash or fixup, an amend without `--reset-author`, `--author`, or `--date` — copies that line byte for
  byte and takes a new committer time, while a commit Git makes fresh takes one time for both lines (§ 5.2). So the
  default close, before capturing, compares each commit left in its set whose committer time differs from its author
  time, by its author half, with the work item's captures and the link's exclusions (§ 5.2): one whose author half
  equals a captured commit's is captured to each task holding such a commit, one that equals only an excluded commit's
  joins the link's exclusions, and the rest go to the tasks the close closes, all in its batch. Its result names each
  commit it attributes, with the commit it matched and that commit's task or the exclusions, and, where attribution
  placed its whole set elsewhere, the tasks it closes as receiving nothing, with `arc task close <ids> --commit <sha>…`
  for the agent to add what attribution left out (§ 16): a squash carries one commit's author line alone, and its other
  commits' tasks take their share by that re-close. A set empty from the start closes its tasks with no capture and no
  report, as D16's task that produced no commit does. Attribution may be incomplete, which captures that only grow let
  the agent complete. It names a task whose work the commit lacks only where a commit carries a stored commit's author
  line without its change, as the residuals below name, and such a capture cannot be undone. It reads the committer time
  from the commit header the copy key's author half comes from, and nothing past it, and it runs on every default close,
  a re-close's included, which is how D16's rerun after an amend takes the amended commit.
- **Sync takes no case of its own.** A checkout behind its branch, or one lacking commits another machine made and
  captured, computes the set over what it holds: those commits are not in its `HEAD`, and once a pull brings them in,
  their captures match them. A branch another checkout rebased, as ARC's lease-guarded catch-up does (D20), carries
  captures and exclusions remapped to the new commits, the old entries kept beside them; a checkout that takes the
  rewrite with `git pull --rebase` drops its stale copies, and one that closes before taking it matches them to the old
  entries by SHA.
- **The listing agrees.** The listing of commits not yet closed computes the same set (§ 19) over the base refs the
  clone has, fetching nothing, so after a fetch of the branch alone it may show base commits as not yet closed until
  base is fetched; the close's refresh leaves them out, and where they are all it shows, the close refuses rather than
  closing the task with nothing (above).
- **Named residuals.** Copy-key matching recognizes a copy only while its author line and diff are unchanged,
  attribution only a rewrite that keeps its author line and takes a new committer time, base and the branch are only as
  fresh as the clone's last fetch, and the walk reads history as the clone's Git presents it. A commit that reads as new
  is captured to the task the close names, its result naming it, and where it belongs to an earlier task, that task's
  re-close with `--commit` records it there as well. Each residual says where its commit goes:
    - a hand rewrite that writes a new author line — `--reset-author`, `--author`, `rebase --ignore-date` or
      `--reset-author-date`, an amend with `--date`, a squash by `git reset --soft` or `git merge --squash` or a split
      by recommitting that names no commit to `-C` or `-c`, a `git commit` run by hand at a rebase's stop or after
      `cherry-pick -n`, a rewrite that puts an author line another tool wrote into Git's own form, or a rebase or
      cherry-pick that re-encodes a commit in another encoding than UTF-8 — or one whose patch half differs from its
      original's and that keeps its committer time equal to its author time, as `rebase --committer-date-is-author-date`
      and a history-rewriting tool keeping both times do (§ 5.2), makes the new commit read as new;
    - a squash goes to the task, or the exclusions, of the one commit whose author line it carries — an interactive
      squash or fixup its first commit's, one by `git reset --soft` or `git merge --squash` the commit it names to `-C`
      or `-c` — its result naming it, and the other squashed commits' tasks take their share by their re-close with
      `--commit`;
    - a commit that carries a stored commit's author line without its change — a new commit made with `-C` or `-c`
      naming that commit, by hand or through the release wrapper run interactively, since a non-interactive run, as an
      agent's is, refuses both (`createCommitMessagePreflight`, `handlers/release/commit-message-preflight.ts`), or an
      amend, squash, or fixup that undoes its change — is captured to that commit's task, which no verb undoes, or joins
      the exclusions, its result naming it, and the task whose work it is takes it by its re-close with `--commit`;
    - commits by one author in one second share an author half, whether made then or given a new author line by one
      rewrite that ran within it, as a rebase with `--reset-author` or `--ignore-date` does, so a rewrite of one of them
      that changes its patch half, or a commit by a tool that fixes the author date alone, is captured to the task of
      every such commit captured, or, where only excluded ones share it, joins the exclusions, its result naming it; a
      commit Git made fresh, its two times equal, is never attributed, so two made in one second each go to the task
      that closes them;
    - a commit with a captured or excluded commit's author line and diff, as a cherry-pick of it within the branch, or
      its change reverted and made again within the second it was first made, is that commit's copy, and the default set
      omits it;
    - an empty commit, one whose patch alone exceeds the output cap, and one whose objects a partial clone lacks carry
      no copy key (§ 5.2) and match by SHA alone, so a hand rewrite of one makes it read as new; the release wrapper
      refuses `--allow-empty` (`lib/release/destructive-flags.ts`);
    - a source the producer does not pin, or a Git release that renders a diff differently, splits one commit's patch
      half across clones (§ 5.2), and a rewritten copy computed on the other side then goes where its original is, to
      its task or the exclusions, by its author half, where it took a new committer time;
    - a graft file (`.git/info/grafts`), which Git deprecates but still honors past `--no-replace-objects`, can hide a
      commit from the default set or turn it into a merge;
    - a close that cannot fetch base captures any base commit its branch holds that the clone's base refs lack, its
      result saying base was not refreshed; an activation that cannot fetch the branch excludes only the commits the
      clone holds (§ 5.2), so a commit pushed from another checkout while the work unit was out of Active, pulled
      later, reads as new.

#### 9.3 The commit carries the close

Where task commits route through the release wrapper (`resolveReleaseRouting`, `lib/release/routing.ts`),
`arc release commit --close[=<ids>]` makes the commit and then runs the close, so the task loop's commit fire site does
both under the approval that covers work and commit, and no prose step has to remember the order. `--close` takes
optional comma-separated IDs, is the wrapper's own, and never reaches `git commit`: the wrapper reads it, as it reads
`--no-wrap` (`stripNoWrap`, `handlers/release/commit-cli.ts`), only among the argv's leading tokens, in either order
with `--no-wrap`, so a `--close` past git's first argument stays git's. Before it commits it checks the pause (§ 8.2),
that the checkout has a linked branch out, that a base ref resolves after the close's bounded fetch of base, which it
runs then and the close reuses (§ 9.2), and the tasks it would close — that the task list reads and carries each named
ID, or, given no IDs, that a task is open (§ 9.1) — refusing without committing on any, each refusal naming the repair
those sections name. The checks run inside the wrapper's commit cascade (`runReleaseCommit`,
`handlers/release/commit.ts`), after the interlock and message checks pass and before the commit, so a commit those
refuse runs no fetch, and each refusal is the wrapper's, recorded in its audit log as every refusal of its own is, under
a code of its own, `close-precheck-failed`, which QUICK-REFERENCE's list of the wrapper's refusal codes gains.
Delivery's fix-release commit, which runs the same cascade, passes no `--close`. Where the commit lands and the close
then fails, the wrapper exits nonzero, its result reporting the commit and naming `arc task close <ids>` as its
continuation — the commit is not yet captured, so the default capture still finds it, with every earlier commit of a
split — never the wrapper, whose rerun would commit again. On the raw route the loop runs `arc task close` right after
its commit, and the listing of commits not yet closed catches a skipped one. Like the close, `--close` starts at the
flip and refuses `unsupported` before it.

#### 9.4 A hand close names the verb

`task-list.close` (`checkTaskListClose`, `lib/store/kinds/task-list/authority-rules.ts`) refuses a hand edit that
changes a task's marker to or from closed, `[x]` or `[~]`, today with generic remedy text. With the verbs, its remedy
names the repair for the change it refused, by the marker the edit wrote, as text, never an argv run as given (§ 18):

- **To `[x]`:** the close with the task IDs in both forms — `arc release commit --close=<ids>` where task commits route
  through the wrapper, otherwise the commit, then `arc task close <ids>` — since the check reads no configuration, so
  it cannot know the route, and fires before the commit, where a close run then would capture the wrong commits.
- **From `[ ]` to `[~]`:** `arc task defer <id>`.
- **Any other change to a closed marker** — `[x]` to `[~]` or `[ ]`, `[~]` to `[ ]`: that a closed task stays closed and
  corrective work takes a new task, as the task-list format holds for a completed one
  (`strategy-task-list-formatting.md`); no verb reopens a task.

The check refuses one edit's changes together, so an edit that makes several names each one's repair, grouped by the
change, with its task IDs; a task line the edit adds already `[x]` or `[~]` takes the repair its marker names, as one
from `[ ]` does.

#### 9.5 The task loop at the flip

The flip's rewrite of the task loop is the cutover's (§ 19). Today the loop marks a task `[x]` before the commit, runs
its quality request over the final tracked edits with that completion edit among them, and, when a segment's request
stays red, removes the `[x]` and the completion note (`process-task-loop.md`). From the flip the completion lands after
the commit, so the loop writes no `[x]`, a red segment request removes the completion note alone, and the verb's result
is the record. The completion note stays the agent's hand edit before the gate, which write-back persists as an
annotation (D16). The checklist's "task marked `[x]`" line goes, and a deferred or superseded task's hand `[~]` becomes
`arc task defer`. Deferred review closes its range at the commit made on return (`--close=<ids>`), so the cursor stays on
the range's first task until then and the completion notes carry the progress. Two steps reorder: the
`post-task-completion` extension, which syncs an external tracker and fires before the gate today, fires after the
close; and delivery's correction acknowledgment, which closes the task mid-protocol, closes through the verb.

### 10. The Class verb

`arc set-class <Light|Heavy|Novel> [<slug>]` writes `Class` at any stage, a stub's included, beside the shipped `--class`
flags (`arc finalize`, `arc promote`, `arc stub`, `arc start` at graduation, `arc errand promote`). The slug, defaulting
to the checkout's work unit, follows the value, since Commander takes no optional positional before a required one. It
is a plain setter: whether to confirm, ratchet up, or correct an unsubstantiated estimate in either direction stays
`classify-work-unit`'s judgment. It needs no branch on the capability: it reads the meta through the store, applies
`writeMetaClass`, and writes it back at the placement it read, with its expected version. The in-repo implementation
admits that as a meta update and refuses a put whose placement differs from the current one or omits it as a move
(`samePlacement`, `admittedWritePath`), so before the flip the bytes land in the checkout for the workflow's ceremony
commit to carry, as `arc set-stage`'s do, or the write refuses with the store's own remedy where this checkout holds no
copy agreeing with the selected meta (`checkout-not-writable`). It proceeds on a paused work unit (§ 8.2). The flip's
rewrite moves onto it each workflow step that hand-edits `Class` where no flag covers it — activation's settle, init's
post-init ratchet and new-work-unit resolution, promotion's ratchet, which `arc promote --class` refuses, and
draft-design's capture. Since it works from this change, QUICK-REFERENCE's verb index, which calls itself the full set,
gains it now, in the installed copy and the package template.

### 11. Removing a checkout

One function removes every checkout of a work unit or Errand that ARC removes, spawn rollbacks aside, and one check
decides on its own whether a checkout can be removed.

#### 11.1 The removal check

```ts
type RemovalCheck =
  | { kind: "removable" }
  | { kind: "missing" }   // the folder is gone; only Git's registration remains
  | { kind: "refused"; reason: "dirty"; paths: readonly string[] }
  | { kind: "refused"; reason: "unobservable"; detail: string }
  | { kind: "refused"; reason: "locked"; path: string; lockReason: string | null; folderPresent: boolean }
  | { kind: "refused"; reason: "persist-would-refuse"; remedy: Remedy }; // `Remedy`, lib/store/refusal.ts
```

- **It reads only and takes no lock.**
- **Its Git part** is its own status read in the removal function's module, reading what today's `isWorktreeClean`
  reads (`lib/git/worktree-cleanup.ts`, unchanged), reporting the changed paths for `dirty` and a failed read as
  `unobservable` rather than folding it into `dirty`, so a check that cannot observe the checkout grants no removal.
- **Its projection part** is a slot the projection fills, reporting whether its persist step would refuse
  (`persist-would-refuse`, with the slot's own remedy), or that it could not tell, as when a store read fails, which
  reads `unobservable` as the Git part's failed read does; it writes nothing and takes no lock. Until the projection
  fills it, it passes.
- **`locked`** is a Git lock the projection did not set: one whose reason is not `PROJECTION_LOCK_REASON`, the exported
  constant that ships with the function and that the projection's lock writes. The check reads locks from
  `git worktree list --porcelain`, whose `locked` lines both porcelain parsers drop today and gain
  (`lib/git/worktree-porcelain.ts`). A missing folder under such a lock refuses `locked` rather than reading `missing`,
  its `folderPresent` false, so a caller choosing what to do with a locked checkout reads no folder itself. Until the
  projection's lock lands, any lock on a checkout is its owner's.
- **It takes the disposition,** removing or releasing (§ 11.4): for a release only the projection part runs.

#### 11.2 The removal function

The function takes the checkout, the primary, and the projection's three slots, each passing until the projection
fills it:

```ts
interface ProjectionRemovalSlots {
  /** Whether persisting the checkout's projection would refuse; writes nothing and takes no lock. */
  check(checkout: string): Promise<
    | { kind: "passes" }
    | { kind: "would-refuse"; remedy: Remedy }
    | { kind: "unobservable"; detail: string }
  >;
  /** Persists the checkout's pending projection edits before its removal. */
  persist(checkout: string): Promise<{ kind: "persisted" } | { kind: "refused"; remedy: Remedy }>;
  /** Persists pending edits and, on a linked checkout, removes its projection when ARC releases rather than removes. */
  release(checkout: string, isPrimary: boolean): Promise<{ kind: "released" } | { kind: "refused"; remedy: Remedy }>;
}
```

- **With the folder present** it runs the check, the persist step, `git worktree unlock` when Git lists the checkout as
  locked with the projection's reason, and a plain `git worktree remove`.
- **With the folder missing** it unlocks a registration the projection locked, then prunes it (fix 4), through
  `git worktree remove <path>`, which removes that one registration where `git worktree prune` would prune every stale
  registration in the repository. Today a missing folder's registration lingers.
- **It returns** `removed`, `pruned`, `refused` with the check's result, or `failed` naming the step.
- **It runs inside each caller's serialization and authorization** and takes over no caller's preconditions: the marker
  and topology revalidation, an Errand's branch and head match, the self-teardown locus hop, the user-surface
  merge-up, and a decomposition candidate's restore of ARC-written files stay with their callers.

Git refuses to unlock a worktree that is not locked, as an `arc start --here` checkout is not, so the function unlocks
only a checkout Git lists as locked.

#### 11.3 Lifecycle's callers

- **Teardown's two removals** move onto the function: the teardown arm of `reconcileWorkUnitWorktree`
  (`reconcile-work-unit-worktree.ts`), and the decomposition candidate's cleanup (`cleanupGitOwnedDecomposeCandidate`,
  run from `teardown.ts`).
- **Teardown reaches a missing folder.** Where a checkout's folder is gone, the marker went with it, so teardown matches
  the registration by the branch it retires rather than reading it `markerless` (`classifyTeardownSelection`,
  `teardown-selection.ts`), as do the selection's revalidation under the lock (`revalidateLocalPredicates`,
  `teardown.ts`) and `requireExpectedSelection`, which `retire` and `husk` run before taking it; it takes the removal
  check's `missing` in place of its own clean checks, which read a missing folder as dirty (`isWorktreeClean`), and its
  lock-taking callers — `retire` and `husk` (`teardown-worktree-transaction.ts`) and `serialize`
  (`reconcile-work-unit-worktree.ts`) — take the repository-wide worktree lock (`withWorktreeOperationLock`) from
  teardown's own checkout rather than the missing path. A missing folder skips the husk arm in every mode, an abandoned
  work unit's included, since nothing is left to detach or stamp, and goes straight to the function's prune. A branch is
  out in one checkout at most, so the match is exact, and a registration locked by anything but the projection still
  refuses `locked`. A husk whose folder was deleted by hand stays out of reach: a detached registration whose marker
  reads absent matches no branch, and husk discovery skips it (`teardown.ts`), so its registration stays until
  `git worktree prune` clears it, a spawn from the flip at its path clears it (§ 6), or, where locked, until locus's
  stale-worktree sweep reports it with the remedy `git worktree unlock <path>`, then `git worktree remove <path>`
  (§ 19).
- **Abandon, from Planning or Active, and park from Planning** run the check before their first write (fix 2). Today
  each records the transition and leaves the removal to a later `arc teardown <name>` (`runAbandon`), so a dirty
  checkout surfaces only after the abandonment or park is recorded. Park from Active already removes before it writes
  its pointer record (`parkActive`, `park-resume.ts`), through `reconcileWorkUnitWorktree`'s teardown arm, so it reaches
  the function with teardown.
- **The `worktree-clean` guard is deleted,** not moved (§ 1.4).

#### 11.4 Anchored checkouts

- **They are kept.** From the flip `arc start --here` writes a work-unit marker with `spawnedByArc: false`, on the
  primary or a linked checkout, and every removal reader keys on `spawnedByArc: true` rather than a marker's presence,
  so an anchored checkout reads as `external` (locus's change, § 19; today `decideWorktreeCleanup` reads only whether a
  marker is present).
- **Teardown releases one.** When teardown meets an anchored marker it releases the marker and keeps the checkout, never
  calling the removal function; the primary is kept the same way.
- **Releasing** runs the projection's `release` slot first and refuses when it refuses: the slot persists every pending
  edit in the checkout's projection, then, on a linked checkout, removes the projection, since a checkout no marker
  claims holds none, while the primary keeps its own. Every path that releases instead of removing calls the slot,
  `arc locus release`'s anchored arm among them. The check before a release is the removal check's projection part
  alone, since the checkout and its uncommitted changes stay, so `dirty` refuses no anchored abandon.
- **Rename moves only a spawned checkout.** The move's resolver (`resolveRenameWorktreeMove`), which today requests a
  move whenever the checkout's folder name carries the slug, returns the holding checkout's own path with no move for an
  anchored marker — never its `in-place` status, which `resolveRenameCheckoutCoordinates` maps to the primary — so the
  rename completes where the checkout stands and reports it, before the flip as after. The gate (`applyUnderMutex`,
  `rename-worktree-transaction.ts`) keeps refusing a move it is asked to make with no marker or a malformed one.
- **Dormant before the flip.** No work-unit marker carries `spawnedByArc: false` today — an anchored one reads as
  malformed until locus admits it (`isWorktreeMarker`) — so nothing observable changes before the flip.

#### 11.5 Outside the function

Spawn rollbacks (`rollbackSpawnedWorktree`, `rollbackFreshSpawn`, and graduation's and Errand provisioning's
rollbacks), each removing a checkout its own spawn just made, and the checkouts that are no work unit's or Errand's —
delivery's gate-checkout reap (`residue-reaping.ts`), the review gate's local review checkouts, and base sync's
temporary worktree (`lib/git/base-sync.ts`) — keep their own removal. Locus moves the Errand's exits and the
session-init sweeps that decide removal onto the function and check (§ 19).

#### 11.6 Moving a checkout

A locked worktree refuses `git worktree move` with no `-f` or one, and `git worktree move -f -f` moves it with its lock
and reason intact. Every move of a work unit's checkout that this change runs or prints therefore takes the
doubled-force form, before the flip as after, since the projection's lock may land first: the move
`reconcileWorkUnitWorktree` runs for `arc rename`, the follow-up `handlers/lifecycle.ts` prints when rename runs from
inside the worktree, and the occupied-move fallback beside that move, which rename does not reach, since it defers a
move from inside the checkout (`resolveRenameWorktreeMove`). Locus's residue sweep prints the one other such move
(§ 19). Before any lock exists the form's one difference is an accepted edge: a move may land on a path registered to
a missing or locked worktree, which a plain move refuses.

### 12. Retirement and reaping

From the flip a retirement is a store write every checkout can read: teardown reads the lineage record, abandon stages
nothing on a protected base, and ROADMAP is derived. Since `07637b5e2` no retirement receipt is written, and teardown
proves an abandon or a park from Planning from the Git-proven transition on the retiring branch, checked against base
(`git-retirement-authorization-context.ts`).

#### 12.1 Each end's rule for a branch ARC created

At each end, teardown keeps today's rule for a branch ARC created, whether or not a checkout here holds it:

- **An abandon discards it,** local and remote, with no merge check (`discard-confirmed`, `authorizeFromGitTransition`,
  `retirement-authorization.ts`).
- **An archive's teardown deletes it** once its commits are landed in base or on its upstream, and the remote only once
  it landed (`assessReapSafety`, `lib/git/branch-containment.ts`; `readShippedEvidence`,
  `git-retirement-authorization-context.ts`).
- **A decomposed origin's teardown,** from the flip, takes the archive's rule, since a cut retires the origin without
  discarding its work, with the lineage record as its evidence. Today teardown authorizes only shipped, abandon, and
  park-from-Planning evidence (`RetirementEvidenceRef`, `retirement-authority.ts`), so a decomposed origin's checkout
  and `plan/` branch come down only by hand.
- **The lineage record is the evidence from the flip** for an abandon as for a decomposed origin, since the Git-proven
  transition stays the in-repo arm. Teardown takes each created branch's rule from its evidence: a completed placement
  or a cut's lineage record takes the archive's rule, and an abandonment's the discard. Today's two modes
  (`TeardownMode`, `shipped` or `abandoned`, `verbs/teardown.ts`) stay the in-repo arm's, where a decomposed origin's
  teardown reads `abandoned` and refuses `evidence-missing`, finding no abandon or park transition.
  `RetirementEvidenceRef` gains a lineage arm beside `shipped` and `git-transition`, reaching every place that encodes
  or switches on the evidence kinds, a sweep adding any the base gains — the marker's decoding (`decodeKnownEvidence`,
  `lib/git/worktree-marker.ts`), the authorization context and its rules (`git-retirement-authorization-context.ts`,
  `retirement-authorization.ts`), the teardown retirement and projection modules (`teardown-retirement-driver.ts`,
  `teardown-lifecycle-projection.ts`), and the husk advisory's schema (`current-husk-advisory.ts`).

**Retained branch authority (A2).** Terminal lineage gains `retiredBranches`, an optional array with exactly the
branch-entry schema and repository/ref uniqueness of `LinksSchema.branches` (`BranchLinkSchema`, `lib/store/links.ts`).
It is permitted only on `abandon` and `decompose` records. From the flip each terminal writer supplies it, including
`[]` for an unlinked origin, from the exact primary basis it removes in the same batch; array order, `linkedAs`, and
exclusions survive unchanged. `LineageRecordSchema` and `writeLineageRecord` (`lib/store/kinds/lineage/`) validate and
retain it. Today's in-repo writers may omit it. Teardown after primary removal reads this snapshot, never a branch
name inferred from the slug or a content-only history entry: `HistoryEntrySchema` (`lib/store/contract.ts`) carries
content, version, and provenance but no links. Missing terminal branch authority refuses with text naming repair of
the lineage's exact branch snapshot and `arc teardown <slug>` as the retry. A completed primary retains its links and
needs no snapshot. The decomposition writer's availability is stated in § 19.

#### 12.2 Ref-set reaping

From the flip the terminal operation retires the work unit's whole ref set, local and remote-tracking, of every branch
link recorded `created`. A multi-match yields a reap plan, not a refusal: the retiring branch takes its teardown's rule
(§ 12.1), and every other ref — such as a promoted item's Errand branch — goes only when it carries nothing beyond base
and the retiring branch, whose head alone the teardown's authority binds, and is otherwise kept and reported. The reap
generalizes the Errand's zero-delta branch reap (`reapZeroDeltaBranch`, `lib/errand/abandon-runtime.ts`), which deletes
only `refs/heads/<branch>`, rather than building a sibling. The remote-tracking ref it deletes is the clone's
`refs/remotes/origin/<branch>`; `origin`'s own branch goes only by the retiring branch's rule (§ 12.1).

#### 12.3 Returning a checkout to base

When a branch will be deleted, a checkout holding it, an anchored one included, first returns to base if the removal
check's Git part finds it clean, as teardown returns the primary today (`relocatePrimaryToBase`: `git switch` to base,
then a fast-forward), or, for a linked checkout while another has base out, detaches at base's tip. A dirty one stays,
and its branch is kept and reported.

#### 12.4 Adopted branches are kept

An adopted branch is never deleted, by an abandon or an archive, and its checkout's `HEAD` stays on it. The abandon or
teardown reports it kept as its owner's, naming as text the steps to delete it: leaving it (`git switch`) where a
checkout holds it, then `git branch -D <name>`, since `-d` refuses an unmerged branch and misreads a squash-merged one
(`reconcile-branch.ts`). Locus's orphan-branch sweep keeps the same rule (§ 19).

#### 12.5 Until the flip

No link carries the record, and teardown reaps the one branch it retires and relocates the primary as today. Activation
and deactivation delete the old name's remote branch themselves (`git push origin --delete`, `activate-work-unit.md`
and `deactivate-work-unit.md`), and no residue a pre-flip reap would close has been seen. A decomposed origin's
teardown waits for the flip.

### 13. How `arc start --from` takes a seed

- **`--from` sets no `Design`.** Its one closed arm is `Origin`, for an issue reference. Every other seed, a `draft-` or
  `spec-` file by path or URL among them, passes through as a document or description for the agent to read
  (`parseSpecInput`'s `document` and `description` kinds, `lib/active/spec-input-parser.ts`), and the cold start enters
  at `draft-design` (`PLANNING_ENTRY_STAGE`, `scaffoldIntoWorktree`). The agent authors the work item's own draft from
  the seed, and `arc repoint-design draft-created` sets `Design` when that draft is captured, as in every draft-design.
  A spec seed is that draft's input, never a skip to `generate-tasks`.
- **The spawning arm refuses `--from` without `--here`,** naming `arc start --here --from <seed>` run from the checkout
  meant for the new work. Today it accepts `--from` and drops it (`handlers/start.ts`; `createNew` takes no seed).
- **Why it holds across the flip.** From the flip `meta.design-entry` admits only the work item's own draft or spec,
  and a draft has no project home before its work item exists, so a cold start's seed is always foreign content. Today
  the `arc-spec` kind, the only one that sets `Design`, matches the basename of any single-token pointer, a path or a
  URL; the cold start stores it as given, so a `spec-` seed fails the stage check (`checkCurrentWorkflowConsistency`),
  any seed given as a path fails the meta's filename check (`MD_FILENAME`, `scripts/validate-meta-spec.ts`), and the
  pre-commit hook refuses the meta when it is committed, while the cold-start step names a spec seed among those it
  takes.
- **It lands first,** as its own review chunk (§ 1.3), before locus reroutes the cold start (`runColdStart`,
  `commands/start.ts`) in the same file. Its code is the final shape on either side of the flip. Each arm gets a test:
  the cold start with an issue, a `draft-` seed, a `spec-` seed, and a description, and the spawning arm's refusal.
- **The one workflow-text change before the flip.** The session-init cold-start step stops naming an ARC spec artifact
  (`draft-` / `spec-`) as `Design` and names it among the seeds passed through
  (`packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-init.template.md`, synced to the installed
  `session-init.md`), since it describes a defect rather than the flip.

### 14. Routing into a work unit past planning

This settles where an executing work unit integrates its inbound entries; locus's entry fields and the routing method
consume it (§ 19).

- **A Planning work unit** takes routed entries as today.
- **An Active one is no default home.** Routing proposes a route out — `new-stub`, a `hold` on a follow-on stub,
  `errand`, or `capture` — and the Owner may admit the entry at the door's Owner stop when it modifies that work and
  belongs there, the result carrying the route out as the proposal and admission as the alternative. An admitted entry
  lands as a spec amendment (`amend-design`) or new tasks, which the work unit's owner writes: a `fold` at the owner's
  own door, otherwise held for the owner — owner adoption's `_Hold` capture until the flip, the inbound list from it.
- **An Integrating one takes nothing;** the route back in is `arc reopen`.
- **Nothing crosses into execution held.** From the flip `meta.inbound-held` also refuses the move to Active while the
  inbound list holds an entry, beside its refusals at Integrating and the archive (§ 18): the store-side twin of
  activation's capture gate, which halts until `arc user inbox-list --target` names no capture. Until the flip that gate
  and verification's carry the property, with create-spec's inbound check and the owner's planning pass clearing a
  draft's held entries, and the in-repo arm adds nothing.

### 15. Resumable transitions

A multi-step transition completes, rolls back, or leaves a typed continuation the next invocation resumes
(`DEV-RULES.PROJECT`, "Recovery-complete refusals"). From the flip every transition this change reroutes carries the
property: its record writes land in one batch (§ 2.1), after any prepared write the verb applies first, as activation's
and publication's reconcile is (§ 2.2, § 3), and a rerun after the prepared write lands finds nothing left to prepare
and continues to the batch. Each Git step around them either precedes the batch and rolls back on its failure or follows
it and is idempotent on rerun, as the workspace close already is (§ 2.5). The start
ceremony's commit leg, which `arc start quality-gate-hooks` failed with no continuation, is gone from the flip. Before
the flip no fix is made: `commitAndPushStartCeremony` names a retry only for a failed push and `arc start` has no arm
that resumes a failed graduation, and a pre-flip fix would be thrown away unless failed starts recur.

### 16. Refusals name their remedy

Every refusal and report of unfinished work this design adds carries the command that repairs it: a typed action beside
its text where running it as given repairs the condition, and the command named in its text, with its arguments, where
the repair needs the agent's input or order (`DEV-RULES.PROJECT`, "Recovery-complete refusals").

| Refusal or report                                                                                                                                                          | Repair it names                                                                                                                         | Form  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| A verb advancing a paused work unit (§ 8.2)                                                                                                                                | `arc resume <slug>`                                                                                                                     | typed |
| A write from the flip over a lifecycle listing with a malformed or missed record, or an unreadable one (§ 2.1)                                                             | the repair each named record's diagnostic gives, then the verb again                                                                    | text  |
| A first `arc pause` given no reason (§ 8.1)                                                                                                                                | `arc pause <slug> --reason <text>`                                                                                                      | text  |
| `work-item.slug-edges` on a slug a pause waits on (§ 18.1)                                                                                                                 | `arc pause <slug> --waits-on <other>`, `--waits-on-note <text>`, or `--no-waits-on`                                                     | text  |
| `meta.verb-owned-field` on a hand edit of `Owner` or the pause section (§ 18.1)                                                                                            | `arc handover <slug> --to <identity>` for `Owner`; `arc pause <slug>` or `arc resume <slug>` for the pause                              | text  |
| The removal check: `locked` (§ 11.1)                                                                                                                                       | `git worktree unlock <path>`, for the lock's owner to decide                                                                            | text  |
| The removal check: `dirty`, `unobservable`, `persist-would-refuse`                                                                                                         | commit or discard the named changes; retry the observation; the persist step's own remedy                                               | text  |
| A handover over unshared work; a pause's report of it (§ 8.1, § 8.5)                                                                                                       | push the work branch (`git push -u origin <branch>`); commit or stash the named changes                                                 | text  |
| A handover where `origin` cannot be reached: base's fetch fails, or the work branch's fails and `git ls-remote` does not show `origin` lacking it (§ 8.5)                  | retry once `origin` is reachable                                                                                                        | text  |
| `arc base sync` on a detached checkout holding commits not on base                                                                                                         | `git switch -c <name>`, naming the commits                                                                                              | text  |
| Activation on a detached `HEAD` holding commits not on base (§ 6.1)                                                                                                        | `git switch -c <name>`, then `arc activate`                                                                                             | text  |
| Adoption where another branch holds `<type>/<slug>` (§ 6.1)                                                                                                                | another `--type`, or a rename of that branch                                                                                            | text  |
| Adoption of a branch another work item links                                                                                                                               | `git switch -c <name>`                                                                                                                  | text  |
| Activation before the flip on a `Branch` naming base (§ 6.1)                                                                                                               | `git switch -c <type>/<slug>`, set `Branch`, then `arc activate`                                                                        | text  |
| The close, or `arc release commit --close` before committing, on a detached checkout or one on no linked branch (§ 9.2, § 9.3)                                             | `git switch <work branch>`, naming it                                                                                                   | text  |
| The close, or `--close` before committing, for a work item with no branch link (§ 9.2)                                                                                     | `arc activate` for a Planning work item; `arc deactivate <slug>`, then `arc activate`, for an Active one                                | text  |
| The default close, or `--close` before committing, where no base ref resolves after the fetch (§ 9.2)                                                                      | `git fetch origin +refs/heads/<base>:refs/remotes/origin/<base>`; with no `origin`, `git branch <base> <commit>`                        | text  |
| Adoption or reattachment, refusing, or deactivation, skipping its report, where no base ref resolves (§ 5.2, § 8.8)                                                        | the same                                                                                                                                | text  |
| `arc materialize`'s spawn of a work unit with no branch link where no base ref resolves (§ 8.4)                                                                            | the same                                                                                                                                | text  |
| The default close where its base refresh emptied a set that was not empty before it (§ 9.2)                                                                                | `arc task close <id>`, rerun, for a task that produced no commit, naming the commits the refresh found on base                          | text  |
| The close, or `--close` before committing, naming an ID no task carries, or over a task list that does not read (§ 9.1, § 9.3)                                             | the task list's IDs, or the line it could not read                                                                                      | text  |
| `--commit` naming a commit not reachable from `HEAD` (§ 9.2)                                                                                                               | commits `HEAD` holds, after `git merge --ff --no-edit <sha>` for one activation's report marks                                          | text  |
| Activation's report of the commits it records as excluded, or deactivation's of those no task captured (§ 5.2, § 8.8)                                                      | `arc task close <ids> --commit <sha>…` for any that is task work, or `arc task close`                                                   | text  |
| The default close's report of the commits it attributed, and of the tasks it closes where attribution placed its whole set elsewhere (§ 9.2)                               | `arc task close <ids> --commit <sha>…` for a task holding work a commit carries                                                         | text  |
| A `created` link's old remote branch deletion named as text, its tracking ref holding commits `HEAD` lacks (§ 6.1)                                                         | `git merge --ff --no-edit <sha>`, then `git push origin --delete <old name>`                                                            | text  |
| `arc release commit --close` whose close fails after the commit (§ 9.3)                                                                                                    | `arc task close <ids>`                                                                                                                  | typed |
| An abandon failing after its batch (§ 8.6)                                                                                                                                 | `arc teardown <slug>`                                                                                                                   | typed |
| A rename whose remote leg fails after its batch (§ 7.1, A3)                                                                                                                | `arc rename <old> <new>`, rerun                                                                                                         | typed |
| Rename's report of an adopted branch's old remote branch, kept (§ 7.1)                                                                                                     | `git push origin --delete <old name>`, for the branch's owner to decide                                                                 | text  |
| The workspace close throwing after the records land, before the flip (§ 2.5)                                                                                               | `arc user close <slug>`                                                                                                                 | typed |
| An abandon's or teardown's report of a kept adopted branch (§ 12.4)                                                                                                        | `git switch` off it where a checkout holds it, then `git branch -D <name>`                                                              | text  |
| `arc materialize` while a checkout with no marker holds the branch                                                                                                         | `arc materialize <slug> --here`, run from that checkout (§ 8.4)                                                                         | text  |
| A spawn or `arc materialize --here` from the flip meeting a registration with no folder, at its path or on its branch, that a lock other than the projection's holds (§ 6) | `git worktree unlock <path>`, for the lock's owner to decide, then the command again                                                    | text  |
| `arc materialize` of a linked work unit whose fetch fails where the clone holds neither the branch nor its remote-tracking ref (§ 8.4)                                     | where `origin` lacks the branch, `git push -u origin <branch>` from the clone that holds it; otherwise retry once `origin` is reachable | text  |
| `arc start` on a started Planning work unit, from the flip (§ 8.4)                                                                                                         | the checkout here that holds it, named, or `arc materialize <slug>` where none does                                                     | text  |
| The spawning arm given `--from` (§ 13)                                                                                                                                     | `arc start --here --from <seed>` from the checkout meant for the new work                                                               | text  |
| `arc resume --here` from the flip (§ 8.1)                                                                                                                                  | `arc materialize <slug> --here`                                                                                                         | typed |
| `arc park` from the flip (§ 2.2)                                                                                                                                           | `arc pause <slug> --reason <text>`                                                                                                      | text  |
| `arc pause` on a stub (§ 8.1)                                                                                                                                              | `arc start <slug>`, since a stub is not in flight                                                                                       | text  |
| The exclusivity check at a spawn or `arc materialize` (§ 6.4)                                                                                                              | work in the checkout it names, or release it there with `arc locus release`                                                             | text  |
| The close with no IDs, or `--close` before committing with none, where no task is open (§ 9.1, § 9.3)                                                                      | a deferred task's close, `arc task close <id>` or `--close=<id>`, or a new task for the work; never a closed task's ID                  | text  |
| `arc task defer` on a task that is not open (§ 9.1)                                                                                                                        | a new task for corrective work, since a closed task stays closed                                                                        | text  |
| A hand change of a task's marker to or from closed (§ 9.4)                                                                                                                 | to `[x]`, the close's two forms; to `[~]`, `arc task defer <id>`; otherwise, a new task                                                 | text  |
| A verb that starts at the flip, run before it (§ 8, § 9)                                                                                                                   | the path that serves until the flip: `arc park`, the `Owner` edit, the hand `[x]` or `[~]`                                              | text  |

### 17. Names

| Verb                         | Form                                                                                                                                                                     | From        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| `arc pause`                  | `arc pause [<slug>] [--reason <text>] [--waits-on <slug> \| --waits-on-note <text> \| --no-waits-on] [--resume-notes <text> \| --no-resume-notes] [--open \| --no-open]` | the flip    |
| `arc resume`                 | `arc resume [<slug>]`; today's park resume until the flip                                                                                                                | the flip    |
| `arc handover`               | `arc handover [<slug>] --to <identity>`                                                                                                                                  | the flip    |
| `arc set-class`              | `arc set-class <Light\|Heavy\|Novel> [<slug>]`                                                                                                                           | this change |
| `arc task close`             | `arc task close [<ids>…] [--commit <sha>…]`                                                                                                                              | the flip    |
| `arc task defer`             | `arc task defer <id>`                                                                                                                                                    | the flip    |
| `arc release commit --close` | `arc release commit --close[=<ids>] …`                                                                                                                                   | the flip    |
| `arc base sync`              | its detached arm (§ 6.2)                                                                                                                                                 | the flip    |
| `arc materialize`            | `arc materialize [<slug>] [--here]`, widened (§ 8.4)                                                                                                                     | the flip    |
| `arc park`                   | refuses `unsupported`, naming `arc pause`                                                                                                                                | the flip    |

`arc pause`, `arc handover`, and `arc set-class` take an optional slug defaulting to the checkout's work unit, as
`arc publish [slug]` and `arc park [slug]` do. Code identifiers keep today's names until a later rename. Reassigning a
work unit whose owner is unavailable would take a verb of its own rather than a flag on `arc handover`, since it acts on
another person's authority.

### 18. Forward amendments to shipped specifications

The storage contract and the record kinds have shipped. Where this design changes what their specifications define,
the change is stated here and built by this change; neither specification is edited.

#### 18.1 The record kinds (`spec-seam-record-kinds.md`)

- **The meta gains the pause section** (§ 8.1): `ParsedMetaRecordSchema` and `MetaRecordSchema`
  (`lib/active/meta-schema.ts`) gain `pause`, defaulting to `null` in both, read as Session Context's section is read,
  with its section writer beside `writeMetaSessionContext`.
- **`meta.verb-owned-field` widens:** it also refuses a hand edit that changes `Owner` or the pause section, beside
  `State`, `Class`, and `Current Workflow`.
- **`Owner` turns verb-owned:** creation writes it, `arc handover` changes it, and starting a stub records the starter
  (§ 8.5), replacing the field-ownership row that has handing a work item over be the owner's own edit.
- **The pause's waits-on slug follows `Depends On`'s rules:** `meta.depends-on`'s resolution check covers a new or
  changed waits-on slug, `work-item.slug-edges` refuses giving a slug to another work item while a pause names it, its
  remedy then naming `arc pause <slug> --waits-on <other>`, `--waits-on-note <text>`, or `--no-waits-on` (§ 16), and a
  rename's settling leaves an in-flight meta's waits-on slug as written, which `lookup` resolves.
- **`meta.inbound-held` also refuses the move to Active** while the inbound list holds an entry (§ 14).
- **`arc start --from` no longer seeds `Design`** (§ 13); creation seeds it through `arc stub --design` alone.
- **The parked position retires** with the pointer record its field-ownership rules name (§ 8.9), and a parked
  dependent reads as a paused one, its reconcile still following `arc resume`.
- **The close verb is `arc task close`, with `arc task defer`** (§ 9), and `task-list.close`'s remedy text names the
  repair for the change it refused: the close in both its forms, the deferral verb, or a new task for any other change
  (§ 9.4).
- **Completion notes stay the agent's hand edit,** per task, which write-back persists as an annotation (D16), where
  the record kinds leave them to the lifecycle verbs.
- **Terminal lineage retains branch authority (A2).** `retiredBranches` preserves the retiring primary's exact branch
  entries, as § 12.1 defines, for cleanup after the primary's removal.

#### 18.2 The storage contract (`spec-storage-contract.md`)

- **A3's branch link** records whether ARC created or adopted the branch and the commits on it that are no task's
  work, both required fields of `LinksSchema`'s branch entries (§ 5.1, § 5.2).
- **A6's repository** is the project ID (D14) on every link (§ 5.3).
- **A6's patch-id** becomes the copy key (§ 5.1, § 5.2): `CommitCaptureSchema` and `lookup`'s commit request carry
  `copyKey` in place of `patchId`, in two halves, the author line's hash and the patch-id's, and `lookup` matches a
  captured SHA, then, only where none matches in that repository, the copy key the caller passes, since a patch-id alone
  can join two different diffs (§ 5.2).
- **Placement extends to the cohort document,** so archive can complete one in its batch (§ 2.2, § 4). Today only a
  work unit's and an Errand's primary records carry placement on a write (`MutationSchema`, `lib/store/write.ts`),
  though the cohort kind's checks read a cohort document's completed placement (`cohort.open-members`). A
  `cohort/document` put may carry a `completed` placement naming only the quarter, and no other placement; read back,
  a completed cohort document carries the sequence of the work unit archived in the same batch, its last open member,
  with a closeout letter beside it, `a` for a leaf cohort or `b` for a parent, or the quarter's next number where no
  member archives in its batch. `ArchiveSequenceSchema` stays digits alone; the letter is the cohort placement's own
  field.
- **D10's "reopen moves it back"** no longer applies to work units: no verb reopens an archived work unit, and a
  correction to one is a write to the completed item in place (§ 8.7).
- **D15's verbs whose transitions persist inside them** name park, and the workspace's close at park; from the flip
  `arc pause` and `arc handover` join them in park's place, and the workspace's close goes (§ 2.5).
- **D16's close verb** is `arc task close` with its repeatable `--commit`, and `arc task defer` (§ 9). Its default
  capture is § 9.2's set rather than `HEAD`: a difference over the commits `HEAD` holds, less those matching a capture
  or the branch link's exclusions by SHA or copy key, the exclusions standing in for D16's bound at the move. The
  listing of commits not yet closed computes the same set, in place of the branch's commits since its last capture
  (§ 9.2). Its rerun after an amend names the task, `arc task close <id>`, since a close with no IDs takes the cursor's
  leaf, and adds the amended increment's new commit to the task's captures rather than replacing that increment's
  capture: a close never removes a capture, and ARC's own rewrites add a remapped entry beside the old (§ 5.2, § 9.1).
  Closing a parent closes its open subtasks, and deferring one defers them; its parent cascade counts a deferred subtask
  as closed, a deferral cascades as the close does, and a parent the cascade closes records no captures (§ 9.1). Every
  capture and exclusion carries § 5.2's copy key in place of A6's patch-id, computed only for commits no stored SHA
  matches, and the close refreshes base, best-effort, before it computes its set; its default close gives a rewritten
  commit, its committer time differing from its author time, whose author half matches a captured or excluded commit's
  to that commit's task or to the exclusions, in its batch (§ 9.2). D16's missed capture stays visible in the listing
  for every commit outside the captures and exclusions; a commit an exclusion holds leaves the listing, and the result
  of the verb that excluded it, activation's report or the default close's, shows it (§ 5.2, § 9.2).
- **D17's activation at base's tip and detached Planning checkout** are refined by branch adoption, which renames the
  branch a spawned or anchored checkout has out into ARC's form; the base exception; the refusal of a detached `HEAD`
  holding commits not on base; a derivation-floor promotion's Planning work unit on its work branch; deactivation
  keeping the branch; and `arc base sync` re-detaching only a detached checkout (§ 6). D17's retirement of branch
  reaping applies to `plan/` branches; a branch link recorded `created` is still reaped (§ 12).
- **D20's remap by ARC's own rewrites** extends to the branch link's exclusions, and each remap adds the new commit's
  SHA and copy key beside the old entry, which stays for a checkout that has not taken the rewrite (§ 5.2); "nothing
  depends on commit reachability" holds for the close, whose default set is a difference over what `HEAD` holds (§ 9.2).

### 19. Expected contracts

This design consumes behavior other changes build. Each is an expected contract, available when its change lands; what
holds until then is stated with it.

- **Locus and session-init** (the change that derives locus from the checkout marker and the store):
    - the anchored work-unit marker admitted (`isWorktreeMarker`, `validateOccupancyMarkerTopology`) and every removal
      reader keyed on `spawnedByArc: true` (§ 11.4) — until then no anchored marker exists;
    - the derived roster and its exclusivity check (§ 6.4, § 7.1, § 8.4, § 8.5) — until then Git's refusal and the cold
      start's own check;
    - `arc locus release [<slug>]`, which runs the removal check and function on a spawned checkout and the release on
      an anchored one, and session start's offer of it to a former owner, its text precomposed by the CLI and its
      action a runnable command (§ 8.1, § 8.5) — before the flip it refuses `unsupported`, naming `arc park` and
      `arc teardown`;
    - the paused-work slot, `pause.review_after_days`, and the pause's rendering in its own checkout (§ 8.3), the
      review prompt's text precomposed by the CLI and its choices — resume, hand over, open to takers, abandon —
      runnable commands;
    - the listing of commits not yet closed, over § 9.2's set, its copy keys from § 5.2's function (§ 9.2);
    - the residue sweep's move remedy (`projectRenameMoveRemedy`, `lib/session-init/lifecycle-residue-sweep.ts`) in the
      doubled-force form (§ 11.6);
    - the orphan-branch sweep (`runOrphanBranchSweep`) never offering `arc teardown` for an `adopted` link, offering
      instead the deletion its owner approves or reporting the branch kept (§ 12.4);
    - `arc errand open` recording `created` and no exclusions on the Errand's branch link (§ 5);
    - the Errand close stamping its close time as the record's `updatedAt` (§ 4);
    - the cold start's reroute — its marker, beside the scaffold's arm from the flip, which creates through the store
      and seeds no `SESSION-NOTES` (§ 2.5) — after the seed fix (§ 13), the removal of `arc user open`, and the session-start
      reconcile of each work unit's scratch folder;
    - promotion's runtime selecting the steps this change builds for it from the flip (§ 7.2), with its marker
      settlement;
    - the Errand's exits and the session-init sweeps moved onto the removal function and check (§ 11.5), and the
      shipped-work readers it holds moved onto placement and `lookup` (§ 4);
    - the stale-worktree sweep reporting a locked registration whose folder is missing with the remedy
      `git worktree unlock <path>`, then `git worktree remove <path>`, a hand-deleted husk's among them (§ 11.3);
    - the entry fields' rule for where an executing work unit takes its inbound entries, which consumes § 14;
    - `resolveActiveWu`'s body (`lib/release/wu-resolution.ts`).
- **The projection:** the removal check's projection part, the persist step, and the release slot (§ 11), each passing
  until filled; its worktree lock, writing `PROJECTION_LOCK_REASON`, which lands only after every removal, removal
  decision, and move of a work unit's checkout is on the function, the check, and the doubled-force form; and its
  amendment of D13's parked work unit for the pause.
- **The ref backend and its import:** the archive sequence under the quarter's compare-and-swap, renumbered by the merge
  after fetch until published, and a completed cohort document's number and letter (§ 4, § 18.2); the item's ref moved
  under history at an end; a write to a completed item on a clone lacking its history ref refusing with the
  unresolvable-state-version code, the calling verb pulling the ref by name and retrying (§ 7.1); the import's branch
  links and its captures' copy keys, from § 5.2's function (§ 5.4), parked work units mapped to paused ones (§ 8.9),
  and a `plan/` branch carried as a `created` link (§ 6.3); and the review gate's repository ID adopted as the project
  ID, in the project's identity record the verbs read (§ 5.3).
- **The cutover:** the flip; the rewrite of the workflows — the task loop (§ 9.5), activation's push step running the
  typed actions activation's result names (§ 6.1), the person-to-person handoff's hand edit of `Owner`
  (`session-handoff.md`'s handoff note, `strategy-team-coordination.md`'s handoff passages) and `init-work-unit.md`'s
  step preserving a stub's `Owner`, the steps that hand-edit `Class` (§ 10), and park's workflows becoming pause's, with
  QUICK-REFERENCE's verb index gaining the verbs that start at the flip and `arc pause` replacing `arc park` there — and
  the deletion pass over § 1.6's arms, which also removes the user-sync commands and base drift's state-tree reads of
  the archive index (`lib/base-drift/current-adapters.ts`), keeping its code-path treatment; and the parking of
  implementation work it cannot land, at a task boundary, which the import turns into pauses.
- **Status and ROADMAP:** the Paused tier (§ 8.3), ROADMAP derived, `STATUS.USER` rendered as a view (§ 2.4), and the
  archive and closed-Errand listings reading the sequence and close time from the placement and record (§ 4).
- **The history policy:** the branch link's exclusions remapped in its lease-guarded catch-up with base, beside the task
  captures, each remap adding the new commit's SHA and its copy key, from § 5.2's function, beside the old entry
  (§ 5.2).
- **Delivery and review:** `arc attest`'s check of the pause (§ 8.2), and its readers of a task's captures taking the
  branch's commits those captures match, by SHA or copy key as the close matches, its keys from § 5.2's function, each
  once, rather than the entries, since a capture a rewrite replaced stays among them (§ 9.1, § 9.2).
- **Decomposition:** its reconciling writers following the prepared-write protocol (§ 3), and its cut writing the
  lineage record a decomposed origin's teardown reads, including `retiredBranches` from the exact removed primary
  (§ 12.1, A2). Until that writer supplies the snapshot, teardown refuses missing branch authority with repair and retry.
- **The routing method:** `route-discovered-work`'s arms for an Active and an Integrating target (§ 14); today it gives
  none, so its gate still proposes holding an entry in an executing work unit.

## Alternatives & Rationale

**The boundary (§ 1.1).**

- _Split the reroute from what each move means._ Both halves rewrite the executor, the verbs, and the lifecycle
  handlers, so they would serialize on the same files, and each verb's arm from the flip is where the new meaning lands.
- _Take decomposition's cut, or in-flight derivation, inside this change._ Decomposition is a self-contained machine
  with its own planner and checks, and locus would wait on in-flight derivation before rebuilding its roster.

**The archive sequence (§ 4).**

- _A counter record._ The placement already carries the sequence, and a counter adds a record every archive contends on.
- _A pre-flip check refusing a repeated number._ With base not requiring up-to-date branches, it passes both of two
  open archive pull requests and fails only after both merge, then fails every later pull request until a renumber that
  rewrites Candidate records citing the quarter's folders by path; a repeat is cosmetic, since readers key on the slug.
  A landing that checks the base's quarter for its number just before merging narrows the race to seconds instead.
- _Never renumber, even before publish._ Two machines archiving into one quarter would then collide at the push, and
  nothing cites an unpublished archive by path.
- _Pull-request numbers as the order._ A work unit has several, a host-less repository has none, and they order by
  opening rather than completion.

**Prepared writes (§ 3).**

- _Freshness over the store's whole state version._ Any unrelated write would invalidate every prepared write.
- _Acquire the meta alone._ The task list and companions the plan edits could change underneath it.

**Pause in place of park (§ 8.1).**

- _Keep park as a move into the backlog._ It lands a commit on base, hides a Planning park as an ordinary stub, and
  needs a pointer record to find the work; a section changes neither `State` nor placement, so the work stays in flight
  and visible.
- _Open to takers as a taking verb._ It would move D13's edit rights; a display flag beside the owner's `arc handover`
  keeps them.
- _Refuse every write on a paused work unit._ It would block the abandon, handover, rename, and re-pause a pause
  exists to permit; only verbs that advance the work refuse.

**Reopening an archived work unit (§ 8.7).** It assigns a new number on re-archive, leaving a gap unless the old one
held the quarter's highest; a follow-on work unit takes more work, and a correction writes the completed item in place.

**Activation in a checkout already on a branch (§ 6.1).**

- _Cut a second branch._ It strands the person's commits or leaves two branches for one work unit.
- _Refuse an anchored checkout on a branch._ A dead end where adoption serves.
- _Keep the person's branch name._ It breaks every reader that finds a work unit by its branch name: the review gate's
  subject, readiness's head-branch check, and rename's `branchPair`.
- _Adopt base._ Activation would rename base, as the bare verb does today.

**The created-or-adopted record (§ 5.1).**

- _Infer it from the branch name._ After activation renames an adopted branch into ARC's form, the name cannot tell it
  from one ARC cut.
- _Key reaping on `spawnedByArc`._ An anchored checkout holds branches ARC created, so the checkout's origin says
  nothing about the branch's.

**Exclusions (§ 5.2).**

- _No exclusions._ The default capture would sweep in an adopted branch's earlier commits and a kept branch's commits
  from its time back in Planning.
- _A floor: one commit at or below which every commit is captured or no task's work, which closes move up._ Its
  correctness rests on the floor being in `HEAD`'s history, which normal flows break: the floor syncs with the store
  and the branch by push and fetch, so a checkout kept through a handover's round trip, or materialized before a push,
  lacks it; and D20's default `rewrite-with-lease` rebases branches, so a rebase after activation's push, here or on
  another machine, drops it. Each case needs a refusal of its own whose repair fails in a further case — a merge that
  brings rewritten commits back, a pull that cannot run with the increment staged. A set difference over the commits
  `HEAD` holds needs no such case.
- _Exclude a promoted Errand's commits._ It would hide them from the work a scale-floor promotion's work unit
  backfills.
- _Match exclusions and captures by SHA alone._ A rebase would turn each into a commit nothing matches, and the close
  would capture an adopted branch's earlier commits after any rebase; captures already carry a content key (A6), which
  § 5.2 makes the copy key.
- _Replace a remapped entry with the new commit's._ The mapping proves only that the rewriting checkout's branch lost
  the old commit; a checkout that has not taken the rewrite still holds it, and with no entry left to match, its next
  close would capture it.
- _Patch-ids from `git log -p` piped to `git patch-id --stable`._ Porcelain output follows each user's diff settings —
  prefixes, context, abbreviation, color — so two machines would compute different patch-ids for one commit and miss
  every match after a rebase; and `--stable` strips whitespace, so commits differing only in whitespace would share one.
- _Isolate attributes with an empty attribute source rather than `--text`._ `--attr-source` leaves
  `.git/info/attributes` in force, so a clone's own attributes would still flip a file to binary.
- _Match by patch-id alone._ Git documents a patch-id as "reasonably stable" and promises nothing across versions or
  configuration, and a source that drops part of the patch text — NUL bytes, which `git patch-id` hashes each line only
  up to, or a submodule's ignore setting — gives two different diffs one patch-id, silently leaving a task's commit
  uncaptured. Pinning sources and escaping NULs close the sources found; the author line, which the common rewrites
  keep, keeps apart what one not yet found would join.
- _Escape NULs as `\0`, doubling each backslash._ It rewrites Git's `\ No newline at end of file` marker, which
  `git patch-id` then reads as the end of the commit's patch, so two commits differing only in a later file would share
  a patch-id. 0x01 byte-stuffing changes no byte `git patch-id` reads for structure.
- _An identity trailer in each commit, as Gerrit's `Change-Id`._ Exact through every rewrite, but ARC leaves code commit
  messages alone by default and never writes to them under the ghost profile. A `change-id` commit header is not
  preserved by Git's own rebase.
- _Remap hand rewrites from Git's `post-rewrite` hook._ Exact for amends and rebases, and the one way to keep a
  diff-changing hand rewrite matched, but it needs ARC's hooks installed, which the ghost profile may not have, and
  writes the store from inside a hook; it remains a later addition.
- _Key on the raw tree change, each path with its blob IDs._ Immune to configuration, but any base change to the same
  file splits it, where a patch-id keeps the match.
- _Fetch base only where ARC fetches the branch._ A fetch of the branch alone by hand leaves base behind as well, and no
  close removes the base commits it would then capture.
- _Snapshot activation's exclusions over `HEAD` alone, or over the import's one tip._ `HEAD` alone misses commits pushed
  from another checkout and not yet merged here; one tip needs a refusal where the two have diverged, while a commit on
  either side is no task's work.
- _Name `git pull --no-rebase` in activation's report._ It fails where the branch has no upstream, as one pushed without
  `-u` or renamed, and under `merge.ff=only` where the two have diverged; a merge of the SHA the report read fails in
  neither, and needs no ref, which a deletion of a created link's old remote branch would remove.

**The close verb (§ 9).**

- _Keep the hand tick before the commit._ The tick cannot record the commit it precedes, and a hand tick is exactly
  what the close's authority rule refuses from the flip.
- _Close only inside the commit._ A commit made in an editor or by other tooling would have no close.
- _Have the agent track which commits belong to which task._ The default capture computes it from the captures and
  the exclusions.
- _Bound the capture by the last capture._ Captures carry no order.
- _Capture every rewritten copy to the task the close names, and report it._ The common hand rewrite, a rebase over a
  base that changed lines near a commit's, would then leave the commit with the wrong task for good, since no verb
  removes a capture; attribution leaves that outcome to the rewrites the named residuals list.
- _Stop the close on a suspected copy, for the agent to place._ A copy of an excluded commit, or a base commit an
  offline close meets, has no task to take it, so the stop's continuations would capture it wrongly or leave it to stop
  every later close; the stored author half places a rewritten copy with no stop.
- _One hash over the author line and the patch-id together._ A match then needs both, so a rewrite that changed the
  diff could not be traced to its original.
- _Detect a rewrite by time alone, an author time older than the newest capture or than its own committer time._ Another
  pusher's older commits, a clock running behind, and an amend before a commit's first close all read as rewrites, while
  a squash by `git reset --soft` or `git merge --squash` that names no commit to `-C` takes a new time and passes; an
  equal stored author half names the commit rewritten, and the committer time only keeps a fresh commit made in a
  captured one's second from being taken for its rewrite.
- _Refuse `-C` and `-c` in the release wrapper on every run._ A non-interactive run, as an agent's is, already refuses
  both, as it refuses any message it cannot prove editor-free and deterministic (`createCommitMessagePreflight`,
  `handlers/release/commit-message-preflight.ts`), and that refusal stays. An interactive run passes them for a person
  redoing a commit with `git commit -c ORIG_HEAD` after `git reset --soft HEAD^`, as Git documents, which then goes to
  its original's task, and a commit made by hand passes no wrapper.
- _Let a re-close replace a task's captures,_ as D16's rerun after an amend does. A checkout that has fetched another
  machine's commits but not merged them holds them outside `HEAD`, so no local test tells a capture an amend replaced
  from one not yet merged here, and a wrong removal leaves a commit on the branch with no capture that any later set
  finds. Captures that only grow cannot lose one; a replaced commit's capture stays, matching nothing.

**The seed (§ 13).**

- _Import the seed as the work item's own draft or spec._ A copy, a rename, and a stage inference for what the agent's
  read already covers, with a spec seed entering `generate-tasks` past create-spec.
- _Refuse artifact seeds._ A dead end where passing the seed through serves.

**The removal function (§ 11).**

- _Each caller removes on its own._ Lock handling, the missing-folder prune, and the projection's slots would diverge
  across callers.
- _Unlock any lock._ A lock the projection did not set is its owner's.

**Ref-set reaping before the flip (§ 12.5).** No link records whether ARC created a branch until the flip, activation
and deactivation already delete the old name's remote branch, and no residue a pre-flip reap would close has been seen.
An advisory for remote-only residue waits too: one with no runnable verb would name no action, so the reap lands first
and an existing advisory widens then.

**A resumable start before the flip (§ 15).** The commit leg it would repair is gone at the flip, so the fix would be
thrown away unless failed starts recur.

**A maintainer's reassignment through `arc handover`.** It acts on another person's authority, which the owner's own
handover never does, so it takes a verb of its own.

## Cross-cutting Considerations

**Testing.** Every lifecycle test passes unchanged over the in-repo implementation, but for the tests a pre-flip fix
changes, each named with its fix. Each verb's arm from the flip runs over the reference backend, which reports
`stateOffBranch: true` (`__tests__/helpers/store/reference-backend.ts`), with Git steps over the shared scripted
`GitExec` fake. Each verb this design adds or widens has a test on its success path and on each refusal it names. The
removal check and function have a case for each outcome over a scripted Git, an anchored checkout's kept marker among
them. Tests of rerouted code keep their local doubles.

**Migration and rollout.** Nothing observable changes before the flip but § 1.5's fixes, § 11.6's move form,
`arc set-class`, and the refusals of the verbs that start at the flip (§ 17). At the flip the import carries branch
links with their record and exclusions (§ 5.4) and turns parked work units into paused ones (§ 8.9); the cutover's
rewrite moves the workflows onto the verbs (§ 19); and the deletion pass removes § 1.6's arms. Locus's anchored-marker
admission must land before any anchored checkout exists, and the projection's lock after every removal and move is on
the function, the check, and the doubled-force form.

**Compatibility.** Under the pre-public-release posture `LinksSchema` and the meta schema change in place, and no alias
or migration reader ships. `arc park` and `arc resume`'s park legs serve until the flip. The flags whose fields retire
at the flip stay accepted, unwritten, until the deletion pass (§ 2.2).

**Performance.** The close's default capture is a best-effort fetch of base, a no-change fetch costing 0.7–0.9 s on
GitHub (D12), once per close, which `--close` runs before its commit; one revision walk from `HEAD` excluding base's two
refs; and § 5.2's copy key over the walk's commits no stored SHA matches, one raw read of their author and committer
lines and the patch-id producer, batched under the binding's output cap, attribution comparing the author halves the
records already store. Each ARC rewrite adds one entry per capture and exclusion it remaps, never pruned, so a links
record grows with the branch's commits times its rewrites. Activation's exclusion snapshot adds a bounded fetch of base
and the branch, and deactivation's report one of base. The removal check adds nothing to today's clean check but a lock
listing; its projection part is the projection's cost.

**Security and trust.** ARC deletes only branches it created, and never one a person made on its own authority, an
abandon's discard included; the created-or-adopted record is the only thing that tells them apart once a branch is
renamed into ARC's form. The removal function unlocks only the projection's lock. `Owner` and the pause are verb-owned,
so a hand edit can neither move a work unit to another person nor clear a pause past its verbs, and a handover refuses
while work the new owner cannot reach remains.

**User-facing impact.** Before the flip: `arc start` refuses `--from` without `--here`, abandon and a Planning park
refuse a dirty checkout before recording anything, activation refuses a work unit on base, and `arc set-class` exists.
From the flip: `arc pause` replaces `arc park`, `arc handover`, `arc task close` and `arc task defer` arrive with
`arc release commit --close`, activation adopts a branch it finds, `arc base sync` catches a detached Planning checkout
up, `arc materialize` serves released and paused work, and ARC reports rather than deletes a branch it did not create.

## Success Criteria

1. **Today's behavior holds before the flip.** Every lifecycle test passes over the in-repo implementation, unchanged
   but for those a pre-flip fix, a setup chunk, or the removal function's porcelain and move changes alter (§ 1.4,
   § 11), each named with its change.
2. **Each pre-flip fix has its test:** the seed fix's arms (§ 13); the removal check refusing a dirty checkout before
   an abandon or a Planning park records anything (§ 11.3); the workspace closing after the transition's records, and a
   throw in the finalize writes leaving it in place (§ 2.5); the removal function pruning a registration whose folder
   is gone (§ 11.2); and activation refusing a work unit whose `Branch` names base, naming the remedy (§ 6.1).
3. **Each rerouted verb's arm from the flip passes over the reference backend,** writing the records § 2.2 names,
   promotion's among them, whose put and branch cut this change builds and tests while locus's runtime selects them
   (§ 7.2).
4. **The ratchet holds.** At landing no `store-raw-state`, `surface-names`, or `work-unit-paths` count in
   `eslint-suppressions.json` exceeds its count at the final merged base, in total or per file, but by the callers
   recorded when `completed-index.ts` joins the helper set (§ 1.4); every entry left in the parts of § 1.2's files
   this change reroutes sits in an arm § 1.6 names; and `npm run -s lint:ts` passes with no suppression added for a new
   violation.
5. **The verbs this design adds or widens** — `arc pause`, `arc resume`, `arc handover`, `arc set-class`,
   `arc task close`, `arc task defer`, `arc release commit --close`, `arc materialize`, and `arc base sync`'s detached
   arm — pass on their success paths and on each refusal they name, and each starting at the flip refuses before it,
   naming the path that serves until then.
6. **Activation's arms pass:** adoption, from a spawned and from an anchored checkout, renaming the person's branch and
   recording it `adopted`, and keeping the name of a branch already named `<type>/<slug>`; its refusals of a name
   another branch holds, of a branch another work item links, of a detached `HEAD` holding commits not on base, and,
   adopting or reattaching, of a clone where no base ref resolves after the fetch; the base arm creating the work
   branch; a linked branch keeping its name when `--type` names its type; and the old name's remote deletion named as a
   typed action for a `created` link, as text after the merge where its remote-tracking ref holds commits `HEAD` lacks,
   and never for an adopted one; and adoption of a branch never pushed still refreshing base.
7. **The pause is honored:** each verb § 8.2 names refuses on a paused work unit naming `arc resume`, and each other
   write proceeds; deactivation keeps the branch; and a start of another person's stub records the starter as `Owner`
   and reports the previous owner.
8. **The close captures the right commits:** a close on an adopted branch and on a re-activated one captures nothing
   from before the latest activation, and an explicit close naming one of those commits, or a rebased copy of one,
   captures it and removes every exclusion it matches; a default close after an explicit close of an earlier commit
   captures only the rest; after a rebase — by hand where it leaves diffs unchanged, and by ARC's own catch-up — on an
   adopted, a re-activated, and a created branch past its first close, the default capture takes only the increment's
   commits; a checkout behind its branch, as after a handover's round trip, and one that takes another machine's rebase
   with `git pull --rebase`, each capture only their own new commits; after a message-only amend of the last closed
   increment the default set is empty, and after one that edits content, that task's re-close adds the new commit and
   keeps every capture it had; a default close gives a commit that a hand amend, rebase, cherry-pick, or interactive
   squash or fixup of a captured commit left to that commit's task, and one of an excluded commit to the exclusions,
   naming each, and the tasks it closes where it placed its whole set elsewhere, with
   `arc task close <ids> --commit <sha>…`, and captures the rest to the tasks it closes, while a default close over a
   set empty from the start reports nothing, and one whose base refresh emptied a set that was not empty before it
   refuses, recording nothing, and its rerun closes the task with no capture; a commit made fresh in the same second as
   a captured one goes to the task the close closes, a commit made with `-C` naming a captured one goes to that commit's
   task, and a rebase with `--committer-date-is-author-date` that changes a captured commit's diff reads as new, while
   the default set omits one that keeps the diff; a rewritten copy whose stored patch half differs from the one computed
   goes to its original's task; no close removes a capture; a change reverted and made again in a later second than it
   was first made is captured; `--commit` refuses a commit not reachable from `HEAD`; activation reports the commits it
   records as excluded, a promoted Errand's among them, and deactivation the commits no task captured, neither listing a
   commit merged in from base, and deactivation skips its report, saying so, where no base ref resolves; the merge
   activation's report names brings in a commit only the branch's remote-tracking ref held, keeping its SHA, on a branch
   with no upstream, under `merge.ff=only`, and after that ref is gone; `arc release commit --close` refuses before
   committing on a checkout with no linked branch out, on a named ID no task carries, and with no IDs and no open task,
   and its close captures every commit of a multi-commit split; a close with no IDs closes the cursor's leaf; a close on
   a clone whose base refs predate base commits its branch holds, as after `arc materialize` or a fetch of the branch
   alone, captures none of them, and one that cannot fetch base says so; a checkout that has not taken ARC's rewrite
   closes without capturing its old copies; one commit's copy key agrees under each source § 5.2 names —
   `core.quotePath`, `diff.suppressBlankEmpty`, `diff.indentHeuristic`, a diff driver's algorithm,
   `core.bigFileThreshold`, `-diff` from `core.attributesFile`, `.git/info/attributes`, and the checkout's
   `.gitattributes`, `submodule.<name>.ignore`, and `GIT_DIFF_OPTS` — and under a replace ref for it, and a replace ref
   grafting the branch drops no commit from the default set; with one author line held for each pair, commits differing
   only in whitespace get different keys, as do two different edits to a UTF-16 file, two commits differing only in a
   file after one with no final newline, and a commit holding a NUL and one holding the bytes 0x01 0x02 in its place; a
   commit with neither a NUL nor a 0x01 byte keeps Git's own patch-id; a rebase with `--ignore-date` reads as new; a
   single-branch clone's close fetches base by its refspec, and with no base ref it refuses before capturing, as
   `--close` does before committing, running the fetch once; in a partial clone a commit whose objects are absent
   matches by SHA alone; an Errand open at the flip and promoted after it at the scale floor keeps its commits in the
   default capture; activation excludes a commit its branch's remote-tracking ref holds that `HEAD` lacks; the close
   names `arc activate` for a Planning work item with no branch link, and `arc deactivate <slug>`, then `arc activate`,
   for an Active one; closing a parent with open subtasks closes them, recording the captures against each, and a parent
   the cascade closes records none; and a deferral of a parent's last open subtask closes the parent, `[x]` where a
   subtask was already `[x]`.
9. **The reap keeps its rules:** an abandon discards a created branch, an archive's teardown deletes one merge-safe, an
   adopted branch is kept and reported, and an added ref carrying commits of its own is kept and reported.
10. **The removal function and check** return each of their outcomes, an anchored checkout's kept marker among them, and
    every move of a work unit's checkout this change runs or prints takes the doubled-force form (§ 11.6).
11. **The named cases pass:** a promoted work item projecting what a fresh start does (§ 7.2); a stub's rename invoked
    from a checkout holding a transient role writing with no branch switch and no second change request (§ 7.1); a
    rename leaving the branch link under its new name (§ 7.1); and a spawn with no branch landing at its template's path
    and rolling back with no branch to delete, an in-place start from a detached checkout leaving `HEAD` where it stood,
    and a re-spawn over a hand-deleted checkout's registration clearing it and proceeding (§ 6).
12. **The quality gates pass** at every gate the project declares.
13. **Spec finalization is atomic off-branch (A1).** Repointing a Planning work unit from its own draft to its spec
    advances to `generate-tasks` with the begin-current-workflow action in the same checked batch; layered Design
    siblings survive, refusal changes none of the three fields, and repeating the following stage advance succeeds.
    The stage check still refuses a separately written inconsistent Design/workflow tuple.

14. **Retirement remains retryable after primary removal (A2).** Abandonment's checked batch preserves the primary's
    branch links in terminal lineage; a failed physical cleanup resumes through `arc teardown` using that snapshot,
    preserving created/adopted authority and exclusions. A missing snapshot refuses, and supplying the exact snapshot
    makes the retry reachable without deriving authority from branch names or content-only history.

15. **Rename leaves the legacy workspace untouched (A3).** Off-branch rename leaves a nonempty legacy personal
    workspace and its notes state unchanged; a workspace conflict does not prevent the operational rename.

## Open Questions

None blocks starting. The expected contracts in § 19 each state what holds until their change lands, and none leaves
this design open.

## Amendments

- **A1** — 2026-10-14 — design: spec finalization advances Design and workflow atomically off-branch.
  _Supersedes:_ § 2.2 field-verb row. _Trigger:_ 4.1 must-stop. _Work:_ 4.1.R. _Revalidated:_ pending → 4.9.
- **A2** — 2026-10-14 — spec-depth: terminal lineage retains branch authority for cleanup retries.
  _Supersedes:_ § 12.1. _Trigger:_ 6.5 must-stop. _Work:_ 6.5.R. _Revalidated:_ pending → 6.9.
- **A3** — 2026-10-14 — design: off-branch rename leaves the legacy personal workspace untouched.
  _Supersedes:_ § 7.1 workspace clause and § 16 rename remedy row. _Trigger:_ F3 review. _Work:_ 4.R. _Revalidated:_ 4.R.

---
