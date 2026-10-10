# Draft: Seam Lifecycle

- **Origin:** [internal] — the `storage-seam` cut (2026-10-09); stage 2 of the storage program.
- **Purpose:** Route the transition write path — everything that creates, moves, retires, or archives a work unit's
  records — through the storage contract, from the lifecycle executor and `arc start` placement to rename, Errand
  promotion, archival, parking, and branchless planning's write half, with today's behavior unchanged until the flip.

---

## Continuity

- **Readiness:** maturing. The cut carried this member's section of `storage-seam`'s draft over unchanged, with the
  shared decisions it owns (items 10 and 12), from a draft the readiness check found formalization-ready for the cut
  (2026-10-09); what stays open is this member's own detail design.
- **Next:** draft-design, in the first design pair with `seam-record-kinds` (`cohort-storage-seam.md` § Coordination):
  re-verify its consumer-map rows against the current code and settle its open items — first how `arc start --from`
  takes a seed, since locus waits on it.

**Reading this draft.** `cohort-storage-seam.md` holds the seam's coordination, its scope boundary, and how the
register's keys are cited. A `§ Shared decisions` item lives in its owner's draft: items 1–8 and 11 in
`draft-seam-record-kinds.md`, item 9 in `draft-seam-locus.md`, and items 10 and 12 in `draft-seam-lifecycle.md`.
`§ Record kinds`, `§ Lifecycle`, `§ Decomposition`, `§ Delivery and review records`, `§ Locus`, and
`§ Status and roadmap` name the member sections of `draft-seam-record-kinds.md`, `draft-seam-lifecycle.md`,
`draft-seam-decomposition.md`, `draft-seam-delivery-review.md`, `draft-seam-locus.md`, and
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
      while the user-sync commands and base drift's adapter (`lib/base-drift/current-adapters.ts`) are removed at the
      cutover instead. The registry's record-number counters serve other counters.
    - **Never reassigned:** gaps are allowed, so an archived work item's folder never moves. The format stays
      `ArchiveSequenceSchema`'s (`01` to `09`, then any width). A closed cohort takes no number of its own; its folder
      borrows its final member's, with `a` or `b` (item 7).
    - **Closed Errands** stay as the contract has them: stored in the quarter's archive ref unnumbered, in a folder
      named for the branch, never projected into `completed/` (D13), and read through `arc view <slug>` (§ Status and
      roadmap). A listing of closed Errands orders by the record's close time (`updatedAt`,
      `lib/errand/identity-record.ts`). Pull-request numbers are no ordering key: a work unit has several, a host-less
      repository has none, and they order by opening rather than completion; the pull request is the change-request
      link (A3).
    - **Until the flip** archive keeps taking one past the highest number in its checkout's copy of the quarter
      (`computeArchiveDestination`), which let two parallel archives both take 31 in `2026-q3`. An execute-bound Errand
      (`USER-INBOX § Errand`, "Renumber the duplicate 2026-q3 archive entry and refuse a repeated archive number")
      renumbers `31_wu-rename` and adds a commit and CI check refusing a repeated number within a quarter; the cutover's
      deletion pass removes the check with the scan, since the store's compare-and-swap assignment rules a repeat out.

Item 11, the write check, is `seam-record-kinds`'s.

12. **Prepared writes** — settled (Owner, 2026-10-09). The writers that reconcile a work unit's artifacts —
    `handleWuReconcile`, activation's and publication's reconcile (`runActivate`, `runPublish`), dependency discharge
    (`dischargeDepEdges`), `currentWuReconcile`'s apply, rename's reference sweep, and decomposition's finish and
    retirement — acquire the whole artifact group, the meta, task list, and prose companions, plus a cohort document
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
  publication's among them (`runPublish`, whose reconcile precedes Candidate authorization and the boundary claim);
  Errand promotion (46); the write-context guard and `arc plan check` (51); `arc rename`'s stub-branch leg (56); and
  ending `STATUS.USER` writes on transitions (53, rendered by status).
- **Rename and promotion keep the work item's identity.** A rename is not terminal: the work item keeps its UID and
  records its former slugs, so `lookup` still resolves an old name, and only decomposition and abandonment write lineage
  (D5). From the flip `arc rename` changes the primary's name and aliases, with the edits the reference sweep prepares
  (`sweepRenameReferences`) in the records it may write — its own, provisional and planned stubs, and the cohort
  document — in one version-checked `batch`, while an in-flight or parked dependent keeps the former slug (§ Shared
  decisions, item 3); today's sweep also rewrites a parked dependent's meta on base
  (`transformDependentMutationExclusions`, `transform-coordination.ts`). Until the flip today's rename transition record
  (`lib/work-unit/transition-record.ts`) stays the in-repo arm. Promotion (46) is A5's write: an expected-version put of
  the Errand's primary to its meta role on the same UID, keeping links, description, placement, aliases, and history,
  with the work branch as a second branch link (A3); the in-repo implementation keeps `promoteOrdinaryErrandAtRuntime`
  (`lib/errand/promote-runtime.ts`) and its commit-required settlement until rerouted. A promoted work item projects
  exactly what a fresh start does: its scratch folder and session start's `lookup` reconcile key on the current record
  set, whatever created the item, and the acceptance tests include a promoted item. Today promotion renames the branch
  and writes the meta (`applyLocalEvidence`) but never calls `runUserOpen`, so a promoted work unit gets no workspace or
  `SESSION-NOTES` seed until handoff writes one; no interim fix is planned.
- **Branchless planning, its write half (D17).** Activation creates the work branch at base's tip in the same
  worktree, recorded as a branch link (A3); catching up with base re-detaches and refuses while the worktree holds
  commits not on base; the `plan/` prefix and branch reaping at abandon, retire, and teardown retire for planning work
  units, with `reconcileBranch`'s plan-branch legs and graduation's plan-branch stamping
  (`prepareValidatedGraduationTransaction`). Until the flip, planning keeps `plan/` branches. Re-derive the `plan/`
  mention count (38 non-test source files at `aae999acb`).
- **Session context into the meta (D5).** Archive's clearing of the meta's session-context section and anchors, whose
  schema is record kinds' (item 4), and removing the workspace's close and rename move and the executor's open arm
  (`userWorkspaceHandler`, `lib/work-unit/executor-context.ts`), which runs `runUserOpen` and seeds `SESSION-NOTES` on
  every move into an active location. Locus removes the spawn's `SESSION-NOTES` seed and `arc user open`, and takes the
  session-start scratch reconcile (Owner, 2026-10-09; § Locus). Until the flip the workspace stays as today.
- **Dependency edges.** Keep the shipped policy (`side-effects/discharge-dep-edges.ts`: `Depends On` is the live gate,
  and activation discharges each edge whose dependency is shipped or integrating, with no mirrored lineage field). What
  remains is the edge list as a field of the meta kind's schema (§ Record kinds). Lifecycle state by slug
  (`arc status <slug>`) and lifecycle-complete cohort membership (`lifecycle-membership.ts`) re-home onto the
  identity-keyed index; the cohort validator's condition (c) becomes record kinds' report (§ Shared decisions, item 7).
- **The Class verb (§ Shared decisions, item 1).** One verb writes `Class` at any stage by `classify-work-unit`'s
  confirm-or-ratchet, as `arc set-stage` writes the stage, beside the shipped `--class` flags. The flip rewrite moves
  onto it each workflow step that hand-edits `Class` where no flag covers it; until then those steps stay as today.
- **Resumable transitions.** A multi-step transition completes, rolls back, or leaves a typed continuation the next
  invocation resumes (`DEV-RULES.PROJECT` § Recovery-complete refusals). On 2026-10-07 `arc start quality-gate-hooks`
  spawned the worktree and staged the graduation, then failed its ceremony commit on a pre-commit check and exited with
  no continuation: `commitAndPushStartCeremony` (`handlers/start.ts`) names a retry only for a failed push, and
  `arc start` has no arm that resumes a failed graduation. From the flip the commit leg is gone and the store-write
  transition carries the property; a pre-flip fix would be throwaway unless failed starts recur.
- **The executor closes the workspace after its record writes.** `runUserClose` (`commands/user/close.ts`) removes the
  workspace when side effects fire, before the meta writes that follow in `lib/work-unit/lifecycle-executor.ts`; a throw
  there returns `finalize-failed` with the workspace already gone. Close after the transition's records instead. The
  in-repo implementation refuses a batch spanning substrates, so the close stays a sequenced step until the flip,
  ordered after the records and idempotent on rerun.
- **Retirement as one ceremony.** From the flip a retirement is a store write that every checkout can read, so teardown
  finds the receipt, abandon stages nothing on a protected base, and ROADMAP is derived. The first live abandon
  (2026-07-24, under full protection) instead hit six seam failures between verbs that each did their own part — the
  receipt unreachable from the target worktree, a cascade staged on the protected base, an over-promised ROADMAP row, a
  second Errand to carry the commit, the remote branch left behind, and a hand-rendered ROADMAP — and took three
  Errands, three PRs, and four manual Git operations. Decomposition's retirement hits the same gap: teardown authorizes
  only shipped, abandon, and park-planning evidence (`RetirementEvidenceRef`, `retirement-authority.ts`), so a
  decomposed origin's checkout and `plan/` branch come down only by hand (rehearsal, 2026-10-05), and the lineage record
  is its evidence from the flip. What survives the flip is ref-set reaping: the terminal operation retires the work
  unit's whole ref set, local and remote-tracking, and a multi-match yields a reap plan, not a refusal, preserving
  anything unmerged or carrying unique content. Generalize the Errand case, the zero-delta branch reap clean abandonment
  has run since PR #683, rather than build a sibling; no other work unit owns it (checked 2026-09-19:
  `graduation-cleanup`, `delivery-native-stack-composition`, and `review-checkout-lifecycle` each cover other refs).
  Stale refs are unmonitored at rest today: the in-flight shadowing advisory (`candidate-shadowed`, from
  `in-flight-derivation.ts`) stops firing at archive, exactly when a `plan/` ref becomes permanent residue. No
  cleanup-residue advisory can name a runnable verb until this reap exists — `operational-advisory-registers` holds that
  an advisory with no available action is not raised — so the reap lands first, and the in-flight artifact advisory,
  which has named its remedy for stale local branches since PR #684, then widens to remote-only residue rather than
  opening a third site.
- **Acceptance case for key 56.** A rename invoked from a checkout holding a transient role contributes to that
  transient, with no branch switch (`withRenameStubBranch`, `lib/work-unit/rename-identity.ts`) and no second change
  request.
- **Open.** Settled before the cut, provisional on `inbound-routing-method` (its D2 test 3 and D4): where an executing
  work unit integrates its inbound entries, with the write check refusing publication while any remain (§ Shared
  decisions, items 9 and 11); the inbound kind's schema is locus's. Code identifiers keep today's names until
  `naming-conventions`' rename. Lifecycle's own: the close verb's name and placement (D16), its task captures carrying
  their repository (A6), the Class verb's name, and how `arc start --from` takes a draft or spec seed from the flip. For
  the seed, lifecycle settles whether the start batch imports its content as the work item's own draft or spec or
  refuses a seed the work item does not already hold, since item 3's write check admits only the work item's own
  `Design` entries, and the stage the start enters at; either way a URL seed is refused, as item 3 refuses a URL entry.
  Locus consumes the answer and waits on lifecycle's draft for it (`cohort-storage-seam.md` § Coordination):
  `--from` takes effect only in
  `arc start --here`'s cold start (`runColdStart`, `commands/start.ts`), which § Locus holds (D17) and whose spawn
  scaffold seeds the stage (`scaffoldIntoWorktree`), while the spawning arm accepts `--from` and drops it
  (`handlers/start.ts`). Today the seed's class, `arc-spec`, the only one that sets `Design`, matches the basename of
  any single-token pointer, a path or a URL (`parseSpecInput`, `spec-input-parser.ts`); the cold start stores it as
  given and enters at `draft-design` (`scaffoldIntoWorktree`), where a spec seed fails the stage check
  (`checkCurrentWorkflowConsistency`), so the pre-commit hook refuses the meta when it is committed; and the cold-start
  step names a spec seed among those it takes (`session-init.template.md`). Whether receipt legibility gets a fix before
  the flip, such as teardown resolving evidence from the base checkout, or waits for the flip; abandons are rare and the
  manual recovery is recorded. For a decomposed origin it waits for the flip (Owner, 2026-10-05).

---
