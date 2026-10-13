# Draft: Seam Lifecycle

- **Origin:** [internal] — the `storage-seam` cut (2026-10-09); stage 2 of the storage program.
- **Purpose:** Route the transition write path — everything that creates, moves, retires, or archives a work unit's
  records — through the storage contract, from the lifecycle executor and `arc start` placement to rename, Errand
  promotion, archival, parking, and branchless planning's write half, with today's behavior unchanged until the flip but
  for the fixes § Lifecycle names — and settle what those moves mean once state leaves tracked files, pause replacing
  park among them.

---

## Inbound dispositions

The owner's pass at the readiness exit (Owner, 2026-10-12) dispositioned every held entry; nothing remains held.

| Entry                                                                                          | Outcome | Where it landed, or why                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Make `arc start --from` either take its seed correctly or refuse it, on every arm              | fold    | § Lifecycle, "How `arc start --from` takes a seed" and "The fix lands ahead of the flip": the seed passes through, `--from` without `--here` refuses, a test on each arm                                                            |
| Have `arc reopen` pull the item's history ref by name first                                    | dismiss | Obsolete: reopen stays Integrating to Active and reads no archived item (§ Lifecycle, "Lifecycle moves from the flip"); a write to a completed item pulls its history ref by name and retries under shared decision 13              |
| Weigh routing into a work unit past planning case by case, never assuming it safe              | fold    | § Lifecycle, "Routing into a work unit past planning"; the routing method's text change is an Errand capture, and `seam-locus` amends item 9                                                                                        |
| Make the archive sequence refuse a repeated number within a quarter (`USER-INBOX § Work Unit`) | reject  | § Shared decisions, item 10, "Until the flip": a check on two open archive PRs passes both, fails main after both merge, and its renumber rewrites Candidate records; the `RELEASE-GATES` landing precheck narrows the race instead |

---

## Continuity

- **Readiness:** formalization-ready (2026-10-12): the 79 rows are re-verified against the code at `9f5bce946`, every
  inbound entry is dispositioned (§ Inbound dispositions), the draft is grounded at source with every finding folded,
  and no design stays open.
- **Resolved (Owner, 2026-10-12):** how `arc start --from` takes a seed, and its fix ahead of the flip; routing into a
  work unit past planning; the archive sequence final once pushed, with no pre-flip check; the checkout removal function
  and its removal check; the two setup chunks; what pause, handover, abandon, reopen, and deactivate mean from the flip;
  the task close verb; repository identity in links; the Class and handover verbs' names; activation adopting an
  existing branch, never the base branch, and which branches ARC reaps, and how a Planning checkout catches up; the
  projection's `release` slot for a checkout kept rather than removed; the fixes that land before the flip; how verbs
  treat a paused work unit and who may take it; `arc materialize` serving a paused work unit whose checkout was
  released; and the forward amendments these make to the shipped specs.
- **Open:** none.
- **Next:** create-spec. This draft and `seam-locus`'s each consume the other, so the seam's safety net
  (`cohort-storage-seam.md` § Coordination), which approves a consumer's spec only after its provider's, sets no order
  between them; by agreement this spec is approved first and locus's re-reads it, and before approval this one re-reads
  `draft-seam-locus.md` for what it takes from locus — `arc locus release`, the anchored marker, the `pausedWork` slot,
  and the commits listing's floor, which the close set shares. `storage-projection` resumes once this draft and locus's
  are captured.

**Reading this draft.** `cohort-storage-seam.md` holds the seam's coordination, its scope boundary, and how the
register's keys are cited. A `§ Shared decisions` item lives in its owner's design record: items 1–8 and 11 in
`spec-seam-record-kinds.md`, whose `§ Shared decisions` maps those numbers to their current contract sections; item 9 in
`draft-seam-locus.md`; items 10 and 12 in `draft-seam-lifecycle.md`; and item 13 in `spec-storage-ref-backend.md`.
`§ Record kinds` resolves to `spec-seam-record-kinds.md`'s `§ Proposed Design`. `§ Lifecycle`, `§ Decomposition`,
`§ Delivery and review records`, `§ Locus`, and `§ Status and roadmap` name the member sections of
`draft-seam-lifecycle.md`, `draft-seam-decomposition.md`, `draft-seam-delivery-review.md`, `draft-seam-locus.md`, and
`draft-seam-status-roadmap.md`. `D` and `A` numbers are `spec-storage-contract.md`'s decisions and amendments.

## Decisions

### Shared decisions

This member owns items 10 and 12 of the seam's shared decisions, settled before the cut (Owner, 2026-10-09);
`seam-record-kinds` owns items 1–8 and 11 and `seam-locus` item 9, and `cohort-storage-seam.md` § Shared contracts names
each item's consumers.

10. **The archive sequence** — settled (Owner, 2026-10-09). The contract makes it a label people read, never identity
    (D2): a work unit's order among work units in its quarter's archive ref, assigned under that ref's compare-and-swap,
    which replaces the archive index, and output only — archive names the quarter, and reads and listings return the
    sequence in the placement (D5, D10).
    - **No counter record.** The sequence lives in the archived work item's placement. Lifecycle's archive names only
      the quarter, and status's archive listing (key 06), a derived view status builds rather than reroutes, reads the
      sequence from the placement a listing returns; the shipped-work readers on `completed-index.ts` move to placement
      and `lookup` as their members reroute them — the stale-worktree sweep, retired-subdir detection, the orphan-branch
      sweep, and locus's derived evidence (`lib/locus/derived-evidence.ts`) with locus, and teardown with lifecycle —
      while the user-sync commands are removed at the cutover instead, and base drift's adapter
      (`lib/base-drift/current-adapters.ts`) loses its state-tree reads there, keeping its code-path treatment. The
      registry's record-number counters serve other counters.
    - **Never reassigned:** gaps are allowed, and a published number never changes. The format stays
      `ArchiveSequenceSchema`'s (`01` to `09`, then any width). A closed cohort's folder borrows the number of the
      member archived with it, its last, with `a` or `b` (item 7); one that closes with no member archiving takes the
      quarter's next (`spec-storage-ref-backend.md` § 7.6).
    - **Final once pushed (Owner, 2026-10-12),** amending the two bullets above to match `spec-storage-ref-backend.md`
      § 7.1 and § 7.3. An archive takes its quarter's highest number plus one; when two machines archive into one
      quarter, the push loop's merge renumbers the unpublished archive after the remote's highest and renames its
      folder, so the verb reports the number after it publishes, and a published number is never reassigned. A rename of
      an archived item renames its folder and keeps the number, and no verb reopens one (§ Lifecycle, "Lifecycle moves
      from the flip"). Renumbering before publish is safe because from the flip no record cites an archived item by its
      folder path: records only verbs write reference work items by UID (`spec-seam-record-kinds.md` § 5.3). It holds at
      team scale, each archive costing one compare-and-swap on its quarter's ref, with the push loop absorbing a lost
      race. A path to an unpublished archive that prose cites dangles after a renumber, a cosmetic residual like a
      pre-flip repeat.
    - **Closed Errands** stay as the contract has them: stored in the quarter's archive ref unnumbered, in a folder
      named for the branch, never projected into `completed/` (D10, D13), and read through `arc view <slug>` (§ Status
      and roadmap). A listing of closed Errands orders by the record's close time, the `updatedAt` its close write
      stamps (`lib/errand/identity-record.ts`, where today it is the last write's time). Pull-request numbers are no
      ordering key: a work unit has several, a host-less repository has none, and they order by opening rather than
      completion; the pull request is the change-request link (D3).
    - **Until the flip** archive keeps taking one past the highest number in its checkout's copy of the quarter
      (`computeArchiveDestination`), which let two parallel archives both take 31 in `2026-q3`. No commit or CI check
      refuses a repeat (Owner, 2026-10-12, superseding the check planned here on 2026-10-09): main does not require
      up-to-date branches, so a check on each of two open archive PRs passes both, and it would fire only after both
      merged, failing every later PR until a renumber that rewrites the Candidate records citing the quarter's folders
      by path. A repeat is cosmetic, since folders and their readers key on the slug (`NN_<slug>`,
      `completedWorkUnitMetaSlug`, `resolveArcPath`). The archive PR's hand landing instead checks `origin/main`'s
      quarter for its number just before merging (`RELEASE-GATES` § Landing rules), narrowing the race to seconds. The
      renumber of `31_wu-rename` stays an Errand (`USER-INBOX § Errand`, "Renumber the duplicate 2026-q3 archive
      entry").

Item 11, the write check, is `seam-record-kinds`'s.

12. **Prepared writes** — settled (Owner, 2026-10-09). The writers that reconcile a work unit's artifacts —
    `handleWuReconcile`, activation's and publication's reconcile (`runActivate`, `runPublish`), dependency discharge
    (`planDependencyReconcile`), `currentWuReconcile`'s prepare and apply (`prepareCurrentWuReconcile`,
    `applyPreparedCurrentWuReconcile`), rename's reference sweep (`planRenameReferences`), and decomposition's finish
    and retirement — acquire the whole artifact group, the meta, task list, and prose companions, plus a cohort document
    where the plan selects one, never the meta alone. Each revalidates every prepared input by its exact record version,
    or by `changes` restricted to those inputs, refusing or restarting on a mismatch, then applies every prepared edit
    and removal in one `batch` with expected versions (D3). Freshness binds the versions of the records it covers, or
    restricted changes since its anchor, never the store's whole state version (D2). Lifecycle owns the protocol;
    decomposition and locus follow it for their writers.

## Members

### Lifecycle

The transition write path: everything that creates, moves, retires, or archives a work unit's records.

- **Rows and keys.** The lifecycle executor's write path and `arc start` placement with the `provisional-placement`
  callers (30); the lifecycle verbs under `lib/work-unit/verbs/` and graduation; placement as a record field (12);
  lineage — transition records, retirement authority, and direct retirement (01's transition half, 16); archival and the
  archive index, `completed-index.ts` (06, 15); parking (50); record writes completing through a code commit (45),
  publication's among them (`runPublish`, whose reconcile follows its first Candidate authorization and precedes the
  re-authorization and the boundary claim); Errand promotion (46); the write-context guard and `arc plan check` (51);
  `arc rename`'s stub-branch leg (56); and ending `STATUS.USER` writes on transitions (53, rendered by status).
    - **Re-verified at `9f5bce946` (2026-10-12).** `notes-seam-lifecycle.md` holds the 79 rows' verdicts — 14 confirmed,
      60 drifted, most by an omitted register key or a stale line, three re-pointed, two to the shipped file splits and
      one to the module replacing a deleted file, and two obsolete — the corrections that cut across rows, and the
      checks behind this draft; none points the wrong way. This member also takes the lifecycle files no row covers:
      `handlers/lifecycle-shared.ts`, `executor-context-current-wu.ts`, `teardown-lifecycle-projection.ts`,
      `mutators/rewrite-renamed-meta.ts`, `transform-coordination.ts`, `verbs/materialize.ts`,
      `git-owned-decompose-candidate-cleanup.ts` (shared with `seam-decomposition`), the release wrapper's refusals on
      an ambiguous work unit (`handlers/release/commit.ts` and `handlers/release/push.ts`, with the code in
      `lib/release/types.ts`), `lib/errand/promote.ts`, `handlers/base.ts`'s `handleBaseSync` for `arc base sync`'s
      detached arm from the flip (shared with `storage-cutover`, whose map row it is), and the pure `lifecycle-query.ts`
      and `verbs/dispatch.ts`; and its share of `handlers/lifecycle-delivery-review.ts` (publication and the reopen
      permit), `executor-context-status.ts` (key 53), and `handlers/status/lifecycle.ts` (the slug-state re-home). Each
      member moves its own `readActiveMetaCandidates` callers onto the resolver, this one those in
      `handlers/lifecycle.ts`, `executor-context.ts`, and `lifecycle-guards.ts`; `resolveActiveWu`'s body
      (`lib/release/wu-resolution.ts`, key 47) is `seam-locus`'s, the current-work-unit derivation `active/current/`
      waits on, so its callers here keep their call.
- **One work unit (2026-10-12).** The boundary read keeps it whole. Its concern is one, the transition write path, and
  the cut already took out what was orthogonal to it — decomposition's own machine, locus's in-flight derivation, and
  the record kinds every member writes. What remains, the reroute and what each move means from the flip, is one
  design over the same files: the executor, the verbs, and the lifecycle handlers, each verb carrying its in-repo arm
  and the arm that writes through the contract from the flip. Split, the two halves would serialize on those files.
  Its size, 79 rows and the verbs it adds, is a review question, not a boundary one, and it is answered by review chunks
  on the program's one branch, the setup chunks and the seed fix first; no chunk is a deliverable that lands on main
  alone.
- **Done when.** Every lifecycle test passes unchanged over the in-repo implementation, which is today's behavior, but
  for those a pre-flip fix changes, each named with its fix (below); each rerouted verb's arm from the flip passes over
  the reference backend; the three ratchet floors (`store-raw-state`, `surface-names`, `work-unit-paths`) keep no entry
  in this member's files beyond the in-repo arms the cutover's deletion pass removes, which the spec names; and the
  cases this draft names pass — a promoted item projecting as a fresh start does, key 56's rename from a transient
  checkout, every `arc start --from` arm, and each outcome of the removal function and its check, an anchored checkout's
  kept marker among them; and each verb this draft adds or widens — `arc pause` and `arc resume`, `arc handover`,
  `arc set-class`, `arc task close` and `arc task defer`, `arc release commit --close`, `arc materialize`, and
  `arc base sync`'s detached arm — passes on its success path and on each refusal it names, as do activation's adoption,
  with its rename of the adopted branch and its refusals of a taken name, of a branch another work item links, and of a
  detached `HEAD` holding commits not on base, its base arm, and its typed deletion of the old name's remote branch,
  named for a `created` link and never for an adopted one; each verb's refusal on a paused work unit; deactivation
  keeping the branch; a start of another person's stub recording the starter as `Owner` and reporting the previous
  owner; a close on an adopted branch and on a re-activated one capturing nothing from before the latest activation, its
  refusal once its latest bound is lost, after a rebase on an adopted branch and on a created one, and its success after
  an explicit close, and deactivation's report of commits since the last capture; and the reap at each end, abandon's
  discard and the archive's merge-safe delete, with its created-or-adopted rule and its keeping of an added ref that
  carries commits of its own.
- **What changes before the flip (2026-10-12).** Today's behavior holds until the flip but for four fixes, each of a
  defect seen or verified at source and each with its own test: the seed fix (below); the removal check before an
  abandon or a park records anything (§ Lifecycle, "The checkout removal function and its removal check"); the workspace
  close after the record writes (below); and the removal function's prune of a registration whose folder
  is gone. Until the projection's lock lands, before the flip, any lock on a checkout is its owner's, so the function
  unlocks only a lock carrying the projection's reason — one exported constant that ships with the function, which lands
  first, and that the projection's lock writes (`draft-storage-projection.md`) — and refuses any other as `locked`,
  naming `git worktree unlock`; a missing folder under such a lock refuses the same way rather than reading as
  `missing`.
- **Two setup chunks run early (Owner, 2026-10-12),** beside the seed fix's. The first deletes what no production path
  reaches, so nothing is rerouted only to be deleted: `in-repo-retirement-authority.ts`, which nothing imports; the
  user-workspace side-effect module (`side-effects/user-workspace.ts`), which only tests import; the `worktree-clean`
  guard (below); `reconcileBranch`'s `delete` arm, which no edge declares; and `dischargeDepEdges`,
  `sweepRenameReferences`, `listBacklogStubs`, `resolveCohortMembers` and `isArchivalTriggered`
  (`lifecycle-membership.ts`), and `resolveReverseDeps` (`lifecycle-deps.ts`), which have no production caller, with the
  TSDoc links and module docs that name them (`archive.ts`, `lifecycle-membership.ts`, `rename-reference-sweep.ts`'s
  `RenameReferenceSweepContext`, `discharge-dep-edges.ts`, `decompose-sweep.ts`, and the `worktree-clean` guard's in
  `lifecycle-executor.ts`, `lifecycle-transitions.ts`, `park-resume.ts`, and `executor-context.ts`). The second moves
  the pure slug helpers (`branchToWorkUnitSlug`, `completedWorkUnitMetaSlug`) out of `completed-index.ts`, which eleven
  files import for nothing else, three of them lifecycle's, then adds the module to the `store-raw-state` helper set
  (`eslint/architecture-imports.ts`), with today's callers recorded in the floor, so archive's and teardown's reads
  count and no slug parse does. The floor still misses reads no leg names: `.arc/` paths built with `join`, and the
  task-list path imported upward from `commands/active/status.ts` (`resolveTaskListPath`), whose eight production
  importers each go with their own row — `verbs/publish.ts` and `verbs/reopen.ts` here; `lib/locus/subject-meta.ts` with
  locus; `handlers/view.ts` with status; the delivery and review modules (`handlers/delivery-execution.ts`,
  `handlers/lifecycle-delivery-review.ts`, `scripts/integration/checkpoint-composition.ts`) with their rows' owners; and
  `scripts/validate-meta-spec.ts`, removed at the cutover (`notes-seam-lifecycle.md`).
- **Rename and promotion keep the work item's identity.** A rename is not terminal: the work item keeps its UID and
  records its former slugs, so `lookup` still resolves an old name, and only decomposition and abandonment write lineage
  (D5). From the flip `arc rename` changes the primary's name and aliases, with the edits the reference sweep prepares
  (`planRenameReferences`, applied by `applyRenameReferencePlan`) in the records it may write — its own, provisional and
  planned stubs, and the cohort document — in one version-checked `batch`, while an in-flight dependent, paused or not,
  keeps the former slug (§ Shared decisions, item 3); today's sweep also rewrites a parked dependent's meta on base,
  since it sweeps `backlog/planned/`, where the parked pointer lives (`planRenameReferences`). Until the flip rename's
  lineage record, which `writeTransitionRecord` writes under `.arc/system/.internal/transitions/`
  (`transition-record-store.ts`) through the in-repo terminal writer (`createInRepoTerminalTransitionRecordWriter`),
  stays the in-repo arm. From the flip rename finds the checkout holding the work unit by the work-unit marker naming it
  (`seam-locus`'s roster), not by a branch it has out, since a Planning checkout is detached (D17), and renames the work
  branch only when it is linked and in ARC's form for the slug, keeping its `<prefix>/` (`branchPair`,
  `commands/rename.ts`, which throws today on any other), as every branch activation links is (§ Lifecycle, "Activation
  in a checkout already on a branch"); a link the import recorded `adopted` outside ARC's forms, and a promoted item's
  Errand branch, keep their names, and rename reports them. Today's refusal of a started work unit with no branch holds
  only until the flip. Promotion (46) is A5's write: an expected-version put of the Errand's primary to its meta role on
  the same UID, keeping links, description, placement, aliases, and history, with the work branch as a second branch
  link (A3). From the flip promotion is the same at both floors but for the state it writes: it links the work branch
  `<type>/<name>` (`--type`, default `feat`), cut at the Errand's tip with the checkout switched onto it, where today a
  derivation-floor promotion renames the Errand branch to `plan/<name>` and a scale-floor one to `<type>/<name>`
  (`promotionBranch`); a derivation-floor work unit, Planning at `draft-design` (`metaOverrides`), stays on that branch
  and catches up by its own merge until activation, which keeps its record and, as for any linked branch, its name when
  `--type` names the type promotion gave it, renaming it to `<type>/<name>` otherwise (`arc activate`'s `--type` stays
  required, `cli.ts`, and `reconcileBranch` leaves an unchanged name alone); the in-repo implementation keeps
  `promoteOrdinaryErrandAtRuntime` (`lib/errand/promote-runtime.ts`) and its commit-required settlement until
  `seam-locus`'s row reroutes it onto this put, with its marker settlement; the consumer map gives the module to locus,
  shared with this member, and the two serialize on it. A promoted work item projects exactly what a fresh start does:
  its scratch folder and session start's `lookup` reconcile key on the current record set, whatever created the item,
  and the acceptance tests include a promoted item. Today promotion renames the branch and writes the meta
  (`applyLocalEvidence`) but never calls `runUserOpen`, so a promoted work unit gets no workspace or `SESSION-NOTES`
  seed until its next edge that declares the workspace and lands in an active location, activation or publication, or a
  handoff writes one; no interim fix is planned.
- **Branchless planning, its write half (D17).** Activation creates the work branch at base's tip in the same worktree,
  recorded as a branch link (A3), and refuses while the detached `HEAD` holds commits not on base, naming them, as
  catch-up does, so a stray commit is never dropped; kept on a branch of the person's own (`git switch -c`), they reach
  the work unit through adoption (below); catching up with base (`arc base sync`, below) re-detaches and refuses while
  the worktree holds commits not on base; the `plan/` prefix and branch reaping at abandon, retire, and teardown retire
  for planning work units started from the flip, which have no branch but one a derivation-floor promotion links
  (§ Lifecycle, "Rename and promotion keep the work item's identity"), while an abandon reaps a link recorded `created`
  in any state, with `reconcileBranch`'s plan-branch legs and graduation's plan-branch stamping
  (`prepareValidatedGraduationTransaction`). Until the flip, planning keeps `plan/` branches, and a Planning work unit
  the flip finds on one keeps it as its branch link, recorded `created` by the import (below), and catches up by its own
  merge until activation renames it in place, keeping its record, so its planning commits stay in the work branch's
  history and the reap at its end finds them merged; work units started from the flip plan detached, but for one a
  derivation-floor promotion links. Re-derive the `plan/` mention count (38 non-test source files at `aae999acb`).
    - **Activation in a checkout already on a branch (Owner, 2026-10-12).** An anchored checkout (`arc start --here`)
      may sit on the person's own branch, possibly with commits, rather than detached at base. Activation there takes
      that branch as the work branch, renaming it to `<type>/<slug>` in place (`git branch -m`, as activation renames
      `plan/<slug>` today through `reconcileBranch`), so `HEAD` stays on it and every reader that finds a work unit by
      its branch name keeps working — the review gate's subject (`resolveReviewSubject`) and readiness's head-branch
      check through `branchToWorkUnitSlug`, which survives the cutover, and rename's `branchPair`. It records the link
      `adopted`, refuses when the new name is taken or another work item already links the branch, and never cuts a
      second branch; a branch the work item already links, such as a `plan/` branch the flip carried, keeps its record
      when activation renames it, so activation records `adopted` only for a branch it takes up unlinked. From the flip
      activation's result names the old name's remote branch deletion as a typed action only for a link recorded
      `created`, such as a carried `plan/` branch, which the push step runs as `activate-work-unit.md`'s Step 5 runs it
      today; an adopted branch's old remote branch stays the person's, and so does any pull request headed there. The
      flip rewrite of Step 5 runs the actions the result names (`storage-cutover`'s). The base branch is never adopted:
      an anchored checkout on base, as an anchored primary is, activates as a detached one does, creating the work
      branch at base's tip in place. Asked by `seam-locus`, whose cold start writes the anchored marker.
    - **Which branches ARC reaps (2026-10-12).** Every branch link (A3) records whether ARC created the branch or
      adopted it, with no default, so each writer states it: activation records `created` when it cuts the branch, from
      base or a detached checkout, and `adopted` when it renames and adopts one; `arc errand open` records `created` for
      the Errand's branch it cuts (`seam-locus`'s verb), and promotion records `created` for the work branch it links
      beside it; rename and deactivation keep the record, and re-activation reattaches the branch with it unchanged; and
      the import at the flip maps a live work unit's or open Errand's branch by name, `created` when it is named for the
      item in ARC's forms (`plan/<slug>`, `<type>/<slug>`, an Errand's `chore/<slug>` among them) and `adopted`
      otherwise, the one inference, which errs toward never reaping a name outside ARC's forms (`storage-ref-backend`'s
      import, `spec-storage-ref-backend.md` § 10.9, approved there 2026-10-12); a `Branch` naming base links no branch,
      as a cold start under partial protection leaves it (`commands/start.ts`), so activation creates the work branch at
      base's tip, as for an anchored checkout on base; a branch a person cut by hand in ARC's form for the slug imports
      as `created`, as a cold start on a hand-cut `feat/<slug>` names its work unit after it (`deriveColdStartWuName`,
      `commands/start.ts`), and today's abandon already treats it so, a named residual. The record is a required field
      of `LinksSchema`'s branch entries (`lib/store/links.ts`), which this member adds before the flip, since the schema
      is strict, and the import then writes; whichever of `storage-ref-backend`'s import change and this member's
      amendment, with the meta kind's pause section, lands second builds the import's writing of these fields and its
      `branch-missing` and `branch-diverged` refusals, so if the import lands first this member's amendment extends it,
      since `LinksSchema` would then refuse its plain `{repository, ref}` links; no branch link is stored before the
      flip. Beside it the link records a floor, the task close's (§ Lifecycle, "The task close verb"), also required on
      every link: activation writes the branch's tip when it writes or reattaches the link, and `arc errand open` the
      tip it cuts the branch from; promotion writes on the work branch's link the floor the Errand's link holds, so the
      Errand's commits stay in the close's default capture and D16's listing for the tasks promotion has backfilled
      (`metaOverrides`, `promote-runtime.ts`), where the Errand's tip at promotion would drop them silently. The import
      writes the tip it finds: of a local branch and its remote that differ, the one containing the other, and a branch
      only the remote holds takes the remote's. ARC's own rewrites remap the floor from the rewrite's old-to-new mapping
      as they remap captures (D16, D20), `history-policy`'s lease-guarded catch-up among them, captured there beside its
      capture remap. It refuses a live work unit or open Errand whose branch exists neither locally nor on the remote,
      or whose local and remote tips have diverged, naming each way out, since it does not detect which applies
      (`branch-missing`, `branch-diverged`) — archiving a work unit whose change merged, since a host set to delete
      merged branches removes it before archive runs (GitHub's `delete_branch_on_merge`, on in this repository);
      restoring the branch, correcting `Branch`, or abandoning the work unit; for an Errand, closing or abandoning it or
      restoring its branch; and, for diverged tips, merging or pushing to reconcile them — and its trial lists such
      cases first. It keeps one trust boundary: ARC never deletes a branch a person made, an abandon's discard included,
      and once activation renames an adopted branch into ARC's form only the record tells it from one ARC cut. At the
      end each teardown keeps today's rule for a branch ARC created, whether or not a checkout here holds it: an abandon
      discards it, local and remote, with no merge check (`discard-confirmed`, `authorizeFromGitTransition`,
      `retirement-authorization.ts`), and an archive's teardown deletes it once its commits are landed in base or on its
      upstream, and the remote only once it landed (`assessReapSafety`, `readShippedEvidence`,
      `git-retirement-authorization-context.ts`), and a decomposed origin's teardown, from the flip, takes the archive's
      rule, since a cut retires the origin without discarding its work; another link recorded `created` that the ref-set
      reap takes beside it, such as a promoted item's Errand branch, is deleted only when it carries nothing beyond base
      and the retiring branch, whose head alone the teardown's authority binds, and is otherwise kept and reported. When
      it will be deleted, a checkout holding it, an anchored one included, first returns to base if the removal check's
      Git part finds it clean, as today's teardown returns the primary (`relocatePrimaryToBase`: `git switch` to base,
      then a fast-forward), or, a linked checkout while another has base out, detaches at base's tip; a dirty one stays,
      and its branch is kept and reported. An adopted branch is never deleted, by an abandon or an archive, and its
      checkout's `HEAD` stays on it; the abandon or teardown reports it kept as its owner's, naming as text the steps to
      delete it — leaving it (`git switch`) where a checkout holds it, then `git branch -D <name>`, since `-d` refuses
      an unmerged branch and misreads a squash-merged one (`reconcile-branch.ts`) — and `seam-locus`'s orphan-branch
      sweep (`runOrphanBranchSweep`) offers `git branch -d` under its own merged gate, never `-D`, rather than
      `arc teardown` for a branch whose link is recorded `adopted`, since that teardown never deletes it. Until the flip
      no link carries the record, and teardown reaps the one branch it retires and relocates the primary as today.
    - **Catching up while in Planning.** From the flip `arc base sync`, run from a detached checkout of a Planning work
      unit, re-detaches that checkout at base's tip after any sync that leaves base current, updated or already so, and
      leaves it where it stands when the sync refuses; it refuses while the checkout holds commits not on base, naming
      them and `git switch -c <name>` to keep them on a branch, which then catches up by its own merge (D17), the
      catch-up verb D15 requires. The arm sits in the verb's handler (`handleBaseSync`, `handlers/base.ts`), never in
      `syncLocalBase` (`lib/git/base-sync.ts`), which Errand provisioning also calls; today the verb updates only base;
      one on base catches up with `arc base sync`, which updates base through the checkout that has it out; and one on a
      branch — the person's own from the cold start, one adopted at activation, one kept from deactivation, one a
      derivation-floor promotion linked, or a `plan/` branch the flip carried — takes base by its person's or agent's
      own merge, since catching up moves no checkout off its branch and `arc base merge` serves only the integration
      checkpoint today (`mergeExpectedBase`).
    - **One marker per work unit (D17).** From the flip the spawn and `arc materialize` run `seam-locus`'s exclusivity
      check before writing a work-unit marker, refusing when another registered checkout's marker names the same work
      unit, as `arc start --here` does, and every in-place arm writes an anchored marker (`spawnedByArc: false`):
      `arc start --here`, whose cold start is `seam-locus`'s and whose graduation occupies the checkout in
      `atomicGraduate`'s in-place `occupy` (`atomic-graduation.ts`), writing the marker inside its rollback and
      `verifyRollback`, and `arc materialize --here`, through `reconcileWorkUnitWorktree`'s in-place leg, neither of
      which writes one today; today the cold start checks only its own checkout (`coldStartOccupancyRefusal`,
      `commands/start.ts`; `draft-seam-locus.md` § Locus).
- **Session context into the meta (D5).** Archive's clearing of the meta's session-context section and anchors, whose
  schema is record kinds' (item 4), and removing the workspace's close and rename move and the executor's open arm
  (`userWorkspaceHandler`, `lib/work-unit/executor-context.ts`), which runs `runUserOpen` and seeds `SESSION-NOTES` on
  every edge that declares it and lands in an active location. Locus removes the spawn's `SESSION-NOTES` seed and
  `arc user open`, and takes the session-start scratch reconcile (Owner, 2026-10-09; § Locus). Until the flip the
  workspace stays as today.
- **Dependency edges.** Keep the shipped policy (`side-effects/discharge-dep-edges.ts`: `Depends On` is the live gate,
  and activation discharges each edge whose dependency is shipped or integrating, with no mirrored lineage field). What
  remains is the edge list as a field of the meta kind's schema (§ Record kinds). Lifecycle state by slug
  (`arc status <slug>`) and lifecycle-complete cohort membership (`lifecycle-membership.ts`) re-home onto the
  identity-keyed index; the cohort validator's condition (c) becomes record kinds' report (§ Shared decisions, item 7).
- **The Class verb (§ Shared decisions, item 1; named by the Owner, 2026-10-12).**
  `arc set-class <Light|Heavy|Novel> [<slug>]` writes `Class` at any stage, a stub's included, as record kinds assigns
  it promotion's ratchet (§ 5.4), beside the shipped `--class` flags. It is a plain setter: whether to confirm, ratchet
  up, or correct an unsubstantiated estimate in either direction stays `classify-work-unit`'s judgment. The flip rewrite
  moves onto it each workflow step that hand-edits `Class` where no flag covers it; until then those steps stay as
  today.
- **Resumable transitions.** A multi-step transition completes, rolls back, or leaves a typed continuation the next
  invocation resumes (`DEV-RULES.PROJECT`, "Recovery-complete refusals"). On 2026-10-07 `arc start quality-gate-hooks`
  spawned the worktree and staged the graduation, then failed its ceremony commit on a pre-commit check and exited with
  no continuation: `commitAndPushStartCeremony` (`handlers/start.ts`) names a retry only for a failed push, and
  `arc start` has no arm that resumes a failed graduation. From the flip the commit leg is gone and the store-write
  transition carries the property; a pre-flip fix would be throwaway unless failed starts recur.
- **The executor closes the workspace after its record writes.** `runUserClose` (`commands/user/close.ts`) removes the
  workspace when side effects fire, before the meta writes that follow in `lib/work-unit/lifecycle-executor.ts`; a throw
  there returns `finalize-failed` with the workspace already gone. Close after the transition's records instead. The
  in-repo implementation refuses a batch spanning substrates, so the close stays a sequenced step until the flip,
  ordered after the records and idempotent on rerun.
- **The checkout removal function and its removal check (Owner, 2026-10-12; `cohort-storage-seam.md` § Cross-cohort).**
  One function removes every checkout of a work unit or Errand that ARC removes, spawn rollbacks aside, and one check
  decides on its own whether a checkout can be removed. The check reads only and takes no lock. It returns `removable`;
  `missing`, when the folder is gone and only Git's registration remains; or `refused`, for `dirty`,
  `persist-would-refuse`, `unobservable`, or `locked`, a lock the projection did not set. Its Git part is today's
  `isWorktreeClean` (`lib/git/worktree-cleanup.ts`), with a failed status read reported as `unobservable` rather than
  folded into dirty; its projection part is a slot `storage-projection` fills. The function takes the checkout, the
  primary, and the projection's check, persist, and release slots, all passing until `storage-projection` fills them;
  release serves a checkout kept rather than removed (below). With the folder present it runs the check, the persist
  step, `git worktree unlock` when Git lists the checkout as locked with the projection's reason, and a plain
  `git worktree remove`; with the folder missing it unlocks a registration the projection locked and prunes. It returns
  `removed`, `pruned`, `refused` with the check's result, or `failed` naming the step. It runs inside each caller's
  serialization and authorization and takes over no caller's preconditions: the marker and topology revalidation, an
  Errand's branch and head match, the self-teardown locus hop, the user-surface merge-up, and a decomposition
  candidate's restore of ARC-written files stay with their callers.
    - **Lifecycle's callers.** Teardown's two removals move onto the function: the teardown arm of
      `reconcileWorkUnitWorktree` (`reconcile-work-unit-worktree.ts`), and the decomposition candidate's cleanup
      (`cleanupGitOwnedDecomposeCandidate`, run from `teardown.ts`), which the cohort document does not name. Abandon,
      from Planning or Active, and park from Planning run the check before their first write: today each records the
      transition and leaves the removal to a later `arc teardown <name>` (`runAbandon`, `verbs/abandon.ts`), so a dirty
      checkout surfaces only after the abandonment or park is recorded. Park from Active already removes before it
      writes its pointer record (`parkActive`). The `worktree-clean` guard (`makeWorktreeCleanGuard`,
      `lifecycle-guards.ts`) is deleted rather than moved: park from Active calls the teardown directly rather than
      through its transition-table edge, and no other edge declares the guard, so it never runs.
    - **A checkout ARC did not create (Owner, 2026-10-12; `draft-seam-locus.md` § Locus, "The cold start").** From the
      flip `arc start --here` writes a work-unit marker with `spawnedByArc: false`, on the primary or a linked checkout,
      and every removal reader keys on `spawnedByArc: true` (`seam-locus`'s change; today `decideWorktreeCleanup` reads
      only whether a marker is present), so an anchored checkout reads as `external`. When teardown meets an anchored
      marker it releases the marker and keeps the checkout, never calling the removal function; the primary is covered
      the same way. Releasing first runs the projection's `release` slot and refuses when it refuses: the slot persists
      every pending edit in the checkout's projection, then, on a linked checkout, removes the projection, since a
      checkout no marker claims holds none, while the primary keeps its own (`draft-storage-projection.md`). The
      pre-write check for a release is the removal check's projection part alone — the check takes the disposition,
      removing or releasing — since the checkout and its uncommitted changes stay, so `dirty` refuses no anchored
      abandon. Every path that releases instead of removing calls the slot, `arc locus release`'s anchored arm among
      them (Owner, 2026-10-12). And `arc rename` moves only a checkout whose work-unit marker has `spawnedByArc: true`:
      the move's resolver (`resolveRenameWorktreeMove`), which today requests a move whenever the checkout's folder name
      carries the slug, returns the holding checkout's own path with no move for an anchored marker — never its
      `in-place` status, which `resolveRenameCheckoutCoordinates` maps to the primary — so the rename completes where
      the checkout stands and reports it, before the flip as after; the gate (`applyUnderMutex`,
      `rename-worktree-transaction.ts`) keeps refusing a move it is asked to make with no marker or a malformed one.
      Today no work-unit marker carries `spawnedByArc: false` — an anchored one reads as malformed until `seam-locus`
      admits it (`isWorktreeMarker`) — so nothing observable changes before the flip.
    - **Outside it.** Spawn rollbacks (`rollbackSpawnedWorktree`, `rollbackFreshSpawn`, and graduation's and
      provisioning's rollbacks), each removing a checkout its own spawn just made, and the checkouts that are no work
      unit's or Errand's: delivery's gate-checkout reap (`residue-reaping.ts`), the review gate's local review
      checkouts, and base sync's temporary worktree (`lib/git/base-sync.ts`). `seam-locus` moves the Errand's exits and
      the session-init sweeps that decide removal.
- **Retirement as one ceremony.** From the flip a retirement is a store write that every checkout can read, so teardown
  reads the lineage record, abandon stages nothing on a protected base, and ROADMAP is derived. The first live abandon
  (2026-07-24, under full protection) instead hit six seam failures between verbs that each did their own part — the
  receipt unreachable from the target worktree, a cascade staged on the protected base, an over-promised ROADMAP row, a
  second Errand to carry the commit, the remote branch left behind, and a hand-rendered ROADMAP — and took three
  Errands, three PRs, and four manual Git operations. The first is gone before the flip: since `07637b5e2` no receipt is
  written, and teardown proves an abandon or a park from Planning from the Git-proven transition on the retiring branch,
  checked against base (`git-retirement-authorization-context.ts`), which every checkout reads. Decomposition's
  retirement hits the same gap: teardown authorizes only shipped, abandon, and park-planning evidence
  (`RetirementEvidenceRef`, `retirement-authority.ts`), so a decomposed origin's checkout and `plan/` branch come down
  only by hand (rehearsal, 2026-10-05), and it waits for the flip, when the lineage record is its evidence (Owner,
  2026-10-05). What survives the flip is ref-set reaping, which lands with it: the terminal operation retires the work
  unit's whole ref set, local and remote-tracking, of every branch link recorded `created` (§ Lifecycle, "Which branches
  ARC reaps"), and a multi-match yields a reap plan, not a refusal: the retiring branch takes its teardown's rule, and
  every other ref goes only when it carries nothing beyond base and the retiring branch, the plan keeping and reporting
  anything else. Until the flip teardown reaps the one branch it retires, as today: activation and deactivation delete
  the old name's remote branch themselves (`git push origin --delete`, `activate-work-unit.md` and
  `deactivate-work-unit.md` Step 5 and Step 3), and no residue a pre-flip reap would close has been seen. Generalize the
  Errand case, the zero-delta branch reap clean abandonment has run since PR #683 (`reapZeroDeltaBranch`,
  `lib/errand/abandon-runtime.ts`), rather than build a sibling; no other work unit owns it (checked 2026-09-19:
  `graduation-cleanup`, the shipped `delivery-native-stack-composition`, and `review-checkout-lifecycle` each cover
  other refs). Local residue is watched today: the orphan-branch sweep (`runOrphanBranchSweep`) lists each local branch
  named `<prefix>/<slug>` whose upstream is gone, `plan/` among them, skipping bare branches, those a checkout's locus
  owns, and Errand branches, offering `arc teardown <name>` for shipped work and `git branch -d` for merged, and the
  stale-location advisory (`stale-location-shadow`, from `in-flight-derivation.ts`) has named its `git branch -d` remedy
  for a stale local branch since PR #684, though status drops it once the work unit ships (`elevatedDerivationWarnings`,
  `project-view.ts`). Remote-only residue, and a local ref whose upstream still lives, go unwatched, and no advisory can
  name a runnable verb for them until this reap exists — `operational-advisory-registers`' draft holds that an advisory
  with no available action is not raised — so the reap lands first, and an existing site then widens to remote-only
  residue rather than a new one opening.
- **Acceptance case for key 56.** A rename invoked from a checkout holding a transient role contributes to that
  transient, with no branch switch (`withRenameStubBranch`, `lib/work-unit/rename-identity.ts`) and no second change
  request.
- **How `arc start --from` takes a seed (Owner, 2026-10-12).** `--from` sets no `Design`. Its one closed arm is
  `Origin`, for an issue reference; every other seed, a `draft-` or `spec-` file by path or URL among them, passes
  through as a document or description for the agent to read (`parseSpecInput`'s `document` and `description` kinds,
  `spec-input-parser.ts`), and the cold start enters at `draft-design` (`PLANNING_ENTRY_STAGE`, `scaffoldIntoWorktree`).
  The agent authors the work item's own draft from the seed, and `arc repoint-design draft-created` sets `Design` when
  that draft is captured, as in every draft-design; a spec seed is that draft's input, never a skip to `generate-tasks`.
  The spawning arm, which today accepts `--from` and drops it (`handlers/start.ts`; `createNew` takes no seed), is to
  refuse `--from` without `--here`. The answer holds on both sides of the flip: from it, `meta.design-entry` admits only
  the work item's own draft or spec (`spec-seam-record-kinds.md` § 5.3), and a draft has no project home before its work
  item exists (`draft-storage-projection.md` § Files the store does not know), so a cold start's seed is always foreign
  content. Today the `arc-spec` kind, the only one that sets `Design`, matches the basename of any single-token pointer,
  a path or a URL; the cold start stores it as given, so a `spec-` seed fails the stage check
  (`checkCurrentWorkflowConsistency`), any seed given as a path fails the meta's filename check (`MD_FILENAME`,
  `validate-meta-spec.ts`), and the pre-commit hook refuses the meta when it is committed, while the cold-start step
  names a spec seed among those it takes (`session-init.template.md`). Locus consumes the answer for the cold start it
  holds (`runColdStart`, `commands/start.ts`; D17). Rejected: importing the seed as the work item's own draft or spec —
  a copy, rename, and stage inference for what the agent's read already covers, with a spec seed entering
  `generate-tasks` past create-spec — and refusing artifact seeds, a dead end where pass-through serves.
    - **The fix lands ahead of the flip (Owner, 2026-10-12),** as its own review chunk early in this work unit's
      implementation, before locus reroutes the cold start in the same file. Its code is the final shape on either side
      of the flip, and the spawning arm's silent drop is a live defect; an Errand cannot take it, since nothing else
      edits the lifecycle write path alongside the seam. Each arm gets a test: the cold start with an issue, a
      `draft-` or `spec-` seed, and a description, and the spawning arm's refusal. It carries the one workflow-text
      change the seam makes before the flip: the cold-start step stops naming an ARC spec artifact as `Design`
      (`session-init.template.md`, with the installed `session-init.md`). That is a named exception to
      `cohort-storage-seam.md` § Scope boundary, for a defect rather than the flip's rewrite.
- **Routing into a work unit past planning (Owner, 2026-10-11 direction; settled 2026-10-12).** This answers where an
  executing work unit integrates its inbound entries (§ Shared decisions, item 9, whose executing arm locus amends to
  match). A Planning work unit takes routed entries as today. An Active one is no default home: routing proposes a
  route out — `new-stub`, a `hold` on a follow-on stub, `errand`, or `capture` — and the Owner may admit the entry at
  the door's Owner stop when it modifies that work and belongs there, the result carrying the route out as the proposal
  and admission as the alternative. An admitted entry lands as a spec amendment (`amend-design`) or new tasks, which
  the work unit's owner writes: a `fold` at the owner's own door, otherwise held for the owner — owner adoption's
  `_Hold` capture until the flip, the inbound list from it. An Integrating work unit takes nothing; the route back in
  is `arc reopen`, as item 9's Integrating arm has it.
    - **Nothing crosses into execution held.** From the flip `meta.inbound-held` (`spec-seam-record-kinds.md` § 3.6)
      also refuses the move to Active while the inbound list holds an entry, beside its refusals at Integrating and the
      archive. It is the store-side twin of activation's capture gate (`activate-work-unit.md`, PR #899), which halts
      until `arc user inbox-list --target` names no capture; until the flip that gate and verification's carry the
      property, with create-spec's inbound check and the owner's planning pass clearing a draft's held entries, and the
      in-repo arm adds nothing.
    - **The routing method's text changes ahead of the flip,** as an Errand (`USER-INBOX § Errand`, "Make the routing
      method route out of a work unit past planning by default"): it is routing doctrine rather than storage, it touches
      no lifecycle write path, and today `route-discovered-work` gives no arm for an Active or Integrating target,
      though it splits started from backlog targets, so its gate still proposes holding an entry in an executing work
      unit. PR #899 left exactly this unset.
- **Lifecycle moves from the flip (Owner, 2026-10-12).** The contract, record kinds, and the ref backend carried today's
  transition table onto the store, each move becoming a placement or `State` write and each end moving the item's ref
  under history; none re-examined what a move should mean once state leaves tracked files. This does. Until the flip
  every move keeps today's in-repo arm.
    - **Pause replaces park.** From the flip `arc pause` and `arc resume` replace `arc park`, matching the Errand's
      `paused` state (`arc errand leave`), and a pause is a section of the work item's meta rather than a move: it
      pauses a Planning or Active work unit, as park does today, and changes neither its `State` nor its placement. The
      section holds who paused it and since when; the reason, which the verb requires as park requires `--reason` today;
      what it waits on, a note or a work unit named by slug under `Depends On`'s rules — the in-flight meta keeps a
      former slug, which `lookup` resolves, `meta.depends-on`'s resolution check covers it, and `work-item.slug-edges`
      refuses reusing a slug a pause names (`spec-seam-record-kinds.md` § 5.3; forward amendment below); the resume
      notes; and whether the owner opens it to takers, a flag `arc pause [<slug>] --open` sets, which the Paused tier
      and the review prompt show; taking the work stays the owner's `arc handover`, so D13's edit rights do not move.
      `arc pause` on a paused work unit updates the section and keeps when it began. On a paused work unit a verb that
      advances the work refuses, naming `arc resume`: a `State`, placement, or stage change, a task close, and an edge
      reconcile, as record kinds' remedy for a parked dependent already has it (§ 5.3, § 7.4); a transition meets it as
      a guard beside the executor's others (`lifecycle-guards.ts`), and the task close and defer verbs, which § 6.3
      counts alike as closes, `arc set-stage`, which writes the stage outside any transition (`runSetStage`), and the
      reconcile check it themselves; `arc release commit --close` checks the pause and the close's latest bound before
      it commits. Every other write proceeds with the pause in place — abandon and a decomposition's cut, handover,
      rename, pausing again, the Class verb, `arc repoint-design`, and hand edits; a stub is never paused. The checkout
      stays unless its owner releases it (`arc locus release`, `seam-locus`'s, which runs the removal check and the
      removal function on a checkout ARC spawned). The pause shows wherever the work unit does: a Paused tier for
      Planning and Active alike in `arc status` and ROADMAP (`seam-status-roadmap`'s, routed to it at draft close), with
      its reason and what it waits on; the owner's paused work at session start (locus's `pausedWork` slot), each marked
      resumable once what it waits on ships, and review-due at once if it ends unshipped, abandoned or cut; and, in the
      work unit's own checkout, the pause, its reason, and the resume notes before any work starts. A pause waiting on
      no work unit, a note included, is flagged for review after `pause.review_after_days`, a project setting beside
      `inbox.remind_after_days`, visible to everyone, and its owner is asked to resume it, hand it over, open it to
      takers, or abandon it (`draft-seam-locus.md` § Locus, "Pause, from the flip"). Pausing reports work no one else
      can reach, the work branch's unpushed commits and uncommitted changes in the checkout, without refusing, and
      `arc resume` clears the section and nothing else. A paused work unit whose checkout was released gets one back
      from `arc materialize <slug>`, which from the flip gives a checkout to any in-flight work unit its identity owns
      that no checkout on this machine holds, remote-only or released here, paused or not, and leaves a pause in place,
      refusing when a released checkout still has the work branch out, naming that checkout and
      `arc materialize <slug> --here` run from it; today it admits only remote-only work units not parked
      (`findMaterializableWorkUnits`, `handleMaterialize`) (Owner, 2026-10-12; `draft-seam-locus.md` § Locus, "Pause,
      from the flip"). Today park is visible only for work that reached Active, in ROADMAP's Parked tier and
      `arc status`, and session start's materialize offer skips it (`findMaterializableWorkUnits`); park from Planning
      lists the work unit as an ordinary stub; and nothing records what releases a pause, so the Owner's holds live in
      `RELEASE-GATES` § Holds, which are pauses from the flip. Retiring, with the rest of park's machinery: the pointer
      record (`composePointerRecord`, `pointer-record.ts`), park from Planning's landing on base
      (`park-planning-landing.ts`) and the evidence teardown accepts for it (`park-retirement-proof.ts`, and
      `current-husk-advisory.ts`'s `park-planning` arm), and the parked position, `State: Active` placed in the backlog
      (`deriveState`), with park from Planning's return to a stub. A work unit the flip finds parked — the cutover parks
      implementation work it cannot land, at a task boundary (`draft-storage-cutover.md` § Scope) — becomes a paused
      one: the import places it in flight at `Active` with a pause whose reason is the pointer record's `Reason:` line,
      paused by its `Owner`, since the commit that parked it, and reads its records from the parked branch's head, where
      the pointer record says they are (`spec-storage-ref-backend.md` § 10.9 and § 10.8, approved there 2026-10-12), so
      the meta kind's schema carries the pause section before the import runs.
    - **Handing a work unit over** stays a write of the owner field alone (`spec-seam-record-kinds.md` § 4), and from
      the flip `arc handover [<slug>] --to <identity>` makes it, refusing while work the new owner cannot reach remains,
      the work branch's unpushed commits or uncommitted changes in the owner's checkout on this machine, and naming
      each. `Owner` therefore turns verb-owned, which amends § 5.4's owner-edited row: creation writes it,
      `arc handover` changes it, and starting a stub records the starter, since whoever starts the work owns it, as a
      cold start records its spawner (`owner: params.spawningIdentity`, `worktree-scaffold.ts`); today graduation writes
      no `Owner` and keeps the stub's, its identity reaching only the ownership marker
      (`GraduateSpawnParams.spawningIdentity`, `commands/start.ts`). Starting another person's stub reports the previous
      owner without refusing, since anyone grooms a stub (D13). The flip rewrite moves the person-to-person handoff off
      the hand edit of `Owner` (`session-handoff.md`'s handoff note, `strategy-team-coordination.md`'s handoff
      passages), and `init-work-unit.md`'s step preserving the stub's `Owner`, which `arc start` then rewrites for
      another person's stub. The handover context travels in the meta's session context (D5), the pause's resume notes
      first, and session start offers the former owner `arc locus release` for the checkout it kept once it finds the
      work unit owned by someone else (§ Locus). Reassigning a work unit whose owner is unavailable is outside this
      design (`USER-INBOX § Work Unit`, "Let a maintainer reassign a work unit or Errand whose owner is unavailable").
    - **Abandon** takes one path from every state it leaves: the removal check, then one batch writing the lineage
      record and moving the item's ref under history, then the checkout's removal, or an anchored checkout's release,
      and the reap of a work branch ARC created (§ Lifecycle, "Which branches ARC reaps"). Today's per-state arms
      (`runAbandon`, `verbs/abandon.ts`) retire with the substrate: the artifacts' removal staged on base, the deferred
      `arc teardown <name>`, and the ROADMAP render.
    - **Reopen** stays Integrating to Active, a `State` write, and no verb reopens an archived work unit: shipped work
      that needs more takes a follow-on work unit, since its change has merged. A correction to an archived item, such
      as the errata convention for its release notes (`archive-work-unit.md`), is a write to the completed item in
      place, which the ref backend serves (`spec-storage-ref-backend.md` § 7.3) and which keeps its number, where
      reopening and archiving again would assign a new one, leaving a gap unless it held the quarter's highest (§ 7.1).
      `storage-projection`'s `completed/` rule takes a correction the same way, and the ref backend's archive reopen
      (§ 7.2) has no lifecycle caller.
    - **Deactivate,** Active back to Planning, keeps the work branch as the work unit's branch link, and re-activation
      reattaches it rather than cutting another, recording a new floor (§ Lifecycle, "The task close verb") and renaming
      it only when `--type` names another type; the checkout stays on the branch. From the flip deactivation reports the
      work branch's commits since its last capture, the task work a re-activation's floor would then hide, naming
      `arc task close`, or, with the close's latest bound lost, that, naming `arc task close --commit <sha>…`, and
      proceeds, as a pause reports unshared work (Owner, 2026-10-12; asked by `seam-locus`). Branchless planning (D17)
      leaves the case unsaid; today deactivation renames the branch back under `plan/` (`reconcileBranch`).
- **The task close verb (D16; Owner, 2026-10-12).** `arc task close [<ids>…] [--commit <sha>…]` closes tasks and
  captures their commits, `HEAD`'s by default or those `--commit` names, repeatable and combinable with IDs, and
  `arc task defer <id> --reason <text>` defers one, since a deferral leaves open only through a verb as completion does
  (`spec-seam-record-kinds.md` § 6.3). Both start at the flip; until then tasks are ticked by hand.
    - **The agent does no bookkeeping.** With no IDs the verb closes the task cursor's task, completing each parent
      whose subtasks are then all complete; named IDs close a set, such as a deferred-review range. With no `--commit`
      it captures the non-merge commits reachable from `HEAD` and from none of the last capture, base, and the floor the
      branch link records (§ Lifecycle, "Which branches ARC reaps"), its tip at the latest activation or where an Errand
      cut it, so a base merge's commits never land in a task's captures, nor an adopted branch's earlier commits, a kept
      branch's from its time back in Planning, or any from before the flip's move, whose tip the import records, which
      is `HEAD` for an increment of one commit and every commit of one `prepare-commits` split; where the latest bound —
      the last capture, or the floor before any — is not an ancestor of `HEAD`, as after a rebase ARC did not make, the
      default capture refuses, naming that bound and `arc task close --commit <sha>…`, and D16's listing reports the
      same rather than listing; on a branch ARC created the floor is a base commit no rebase drops, so there the last
      capture is the bound such a rewrite loses; one explicit close repairs it, since the capture it records becomes the
      latest bound; this is the set D16's missed-capture listing names, with the same floor, so a close and the safety
      net agree (`draft-seam-locus.md` § Locus, "Commits not yet closed").
    - **The commit carries the close** where the task commit routes through the release wrapper
      (`resolveReleaseRouting`): `arc release commit --close[=<ids>]` makes the commit, then runs the close, so the task
      loop's commit fire site does both under the approval that covers work and commit, and no prose step has to
      remember the order (`strategy-procedure-evolution.md`, Principle 1). `--close` takes optional comma-separated IDs
      and is the wrapper's own, never passed to `git commit`. On the raw route the loop runs `arc task close` right
      after its commit, and D16's listing of commits not yet closed catches a skipped one. The verb itself never
      commits, and stays standalone for a commit made in an editor or by other tooling.
    - **What the flip rewrite of the task loop changes** (`storage-cutover`'s): today the loop marks a task `[x]` before
      the commit, runs the quality request over the final tracked edits with that completion edit among them, and, when
      a segment's request stays red, removes the `[x]` and the completion note (`process-task-loop.md`). From the flip
      the completion lands after the commit, so the loop writes no `[x]`, a red segment request removes the completion
      note alone, the checklist's "task marked `[x]`" line goes, and the verb's result is the record. The completion
      note stays the agent's hand edit before the gate, which write-back persists as an annotation (D16). A deferred or
      superseded task's hand `[~]` becomes `arc task defer`. Deferred review closes its range at the commit made on
      return (`--close=<ids>`), so the cursor stays on the range's first task until then and the completion notes carry
      the progress. Two steps need reordering: the `post-task-completion` extension, which syncs an external tracker and
      fires before the gate today, fires after the close; and delivery's correction acknowledgment, which closes the
      task mid-protocol.
    - **A hand close names the verb.** `task-list.close` (`checkTaskListClose`,
      `lib/store/kinds/task-list/authority-rules.ts`) refuses a hand edit closing a task with generic remedy text. With
      the verb its remedy names the close with the task IDs in both forms, since the check reads no configuration
      (§ 6.5) and so cannot know the task commit's route — `arc release commit --close=<ids>` where task commits route
      through the wrapper, otherwise the commit, then `arc task close <ids>` — as text, never an argv run as given: the
      refusal fires before the commit, where write-back reports it, and a close run then would capture the wrong
      commits. The rule is record kinds' and its text changes with this verb.
- **Repository identity in links (A6; Owner, 2026-10-12).** Every link's repository — a task capture's and the landing
  commit's (`CommitCaptureSchema`), a branch link's, and a change request's (`LinksSchema`, `lib/store/links.ts`) — is
  the project ID (`spec-storage-contract.md` D14), which every clone fetches and which survives moved remotes and
  re-clones. A remote's address does not, and the review gate's repository ID (`resolveRepositoryIdentity`) is minted
  per clone, though this repository's import adopts it as the project ID (`spec-storage-ref-backend.md` § 10.8). A
  project spanning several code repositories would mint their IDs when it arises; the schema already carries each field.
- **Refusals name their remedy as a command.** Every refusal and report of unfinished work this draft designs — the
  removal check's refusal, a handover's refusal over unshared work, a pause's report of it, `arc base sync`'s refusal of
  a detached checkout holding commits not on base, activation's refusal of the same, naming `git switch -c <name>` and
  then `arc activate`, adoption's refusal of a taken `<type>/<slug>`, naming another `--type` or renaming the branch
  that holds the name, and its refusal of a branch another work item links, naming `git switch -c <name>`, the close's
  refusal and D16's listing's report once the latest bound is lost, naming `arc task close --commit <sha>…`, an
  abandon's or teardown's report of a kept adopted branch, naming its owner's steps to delete it, and deactivation's
  report of commits since the last capture, which names `arc task close` as text since the task IDs need the agent —
  carries the command that repairs it: a typed action beside its text where running it as given repairs the condition,
  and the command named in its text, with its arguments, where the repair needs the agent's input or order, as a hand
  close's does (`DEV-RULES.PROJECT`, "Recovery-complete refusals").
- **Names.** Code identifiers keep today's names until `naming-conventions`' rename; the verbs this draft adds are
  `arc pause`, `arc handover`, `arc task close` with its repeatable `--commit`, `arc task defer`, and `arc set-class`,
  and `arc resume` takes the pause; `arc pause`, `arc handover`, and `arc set-class` take an optional slug defaulting to
  the checkout's work unit, as `arc publish [slug]` and `arc park [slug]` do, `arc set-class` after its value, since
  Commander takes no optional positional before a required one; and `arc base sync` gains its detached arm. A
  maintainer's reassignment of work whose owner is unavailable, captured apart (above), would take its own verb rather
  than a flag on `arc handover`, since it acts on another person's authority.
- **Forward amendments to shipped specs.** `seam-record-kinds` and `storage-contract` have shipped, so where a decision
  here changes what their specs define, this work unit's spec carries it as a forward amendment and its own change
  builds it; neither spec is edited.
    - `spec-seam-record-kinds.md`: the meta kind's schema gains the pause section, which `arc pause` and `arc resume`
      write, its waits-on slug under `Depends On`'s rules, with `meta.depends-on`'s resolution check and
      `work-item.slug-edges` (§ 5.3) extended to it; `Owner` turns verb-owned, written at creation, by `arc handover`,
      and by starting a stub (§ 5.4's owner-edited row, which has handing over be the owner's own edit), and
      `meta.verb-owned-field` (§ 3.6) guards it and the pause section beside `State`, `Class`, and `Current Workflow`;
      `meta.inbound-held` (§ 3.6) also refuses the move to Active; `arc start --from` no longer seeds `Design` (§ 5.4);
      the parked position its terms define retires, with the pointer record § 5.4 names, and a parked dependent (§ 5.3,
      § 7.4) reads as a paused one; § 6.3's close verb is `arc task close`, with `arc task defer`; `task-list.close`'s
      remedy text names the close verb in both its forms; and § 6.5's completion notes, which it leaves to the lifecycle
      verbs, stay per task the agent's hand edit, which write-back persists as D16 has a task annotated.
    - `spec-storage-contract.md`: D13's parked work unit, which `storage-projection` amends for the pause
      (`draft-storage-projection.md`); D15's verbs whose transitions persist inside them, which name park and the
      workspace's close at park, where `arc pause` and `arc handover` join them and that close goes; D10's "reopen moves
      it back", since no verb reopens an archived work unit; D16's close verb, named and placed above, whose default
      capture is the non-merge commits reachable from `HEAD` and from none of the last capture, base, and the branch
      link's recorded floor, which also serves as D16's floor at the move, rather than `HEAD`, and, against D20's
      "nothing depends on commit reachability", the floor remapped by ARC's rewrites as the captures are, and the
      default capture refusing and the listing reporting it, in place of listing, once the latest bound, the last
      capture or else the floor, is no ancestor of `HEAD`; D17's activation at base's tip and detached Planning
      checkout, refined by branch adoption, which renames the branch into ARC's form, the base exception, the refusal of
      a detached `HEAD` holding commits not on base, a derivation-floor promotion's Planning work unit on its work
      branch, deactivation keeping the branch, and its catch-up, `arc base sync`, re-detaching only a detached checkout;
      A3's branch link, which records whether ARC created or adopted the branch, a required field of `LinksSchema`'s
      branch entries, beside its floor, the branch's tip at its latest activation, where `arc errand open` cut it, or as
      the import found it, also required; and A6's repository, the project ID.

---
