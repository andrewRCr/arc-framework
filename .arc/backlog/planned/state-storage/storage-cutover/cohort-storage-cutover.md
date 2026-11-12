# Cohort: `storage-cutover`

> _Identity and coordination record for this cohort. Membership is **derived** from each member's `Cohort`
> field — recorded here only as shared coordination, never as a roster or status table._

**Parent:** `state-storage`

**Purpose:** Cut this repository over to the ref store and finish the program: rehearse, quiesce, import, flip, and
retire Git notes in one window, then delete what the flip made dead and rewrite the documentation to the new model. One
draft designed the cutover whole; the members deliver it in seven work units: the window's pre-flip machinery first,
then the flip, four follow-ons in parallel after it, and the internal collapse after tracked-state removal.

---

## Coordination

```text
cutover-window-tooling                 the quiesce check, its record, the abort's restore, the worktree lock step,
│                                      and Stage 1, on `main` ahead of the window
└── cutover-flip                       Stage 2, the window, the flip change, the workflow rewrite, and notes
    │                                  retirement
    ├── cutover-tracked-state-removal  what reads as live after the flip: refusing and inert verbs, the lifecycle
    │   │                              hook checks, the CI planning classifier, and the merge-gate recipe
    │   └── cutover-in-repo-removal    the in-repo store, dormant capability and seam arms, branch-tree readers,
    │                                  lifecycle classification, and the write-context guard
    ├── cutover-notes-removal          notes-specific sync and its configuration keys
    ├── cutover-decompose-removal      the old decomposition machine
    └── cutover-documentation          the strategy rewrites and the ADR supersessions and amendments
```

Each member's `Depends On` edges are the source of truth: `cutover-window-tooling` depends on no member outstanding,
`cutover-flip` on `cohort-identity-verbs`, `projection-worktrees`, `projection-write-back`, `projection-team-scale`, and
`cutover-window-tooling`, and each follow-on on `cutover-flip`. These orderings are not edges:

- **Gate B placement** (Owner, 2026-11-03; the window tooling and the internal collapse, 2026-11-10):
    - `cutover-window-tooling`, `cutover-flip`, `cutover-tracked-state-removal`, `cutover-notes-removal`, and
      `cutover-documentation` are Musts; `cutover-decompose-removal` and `cutover-in-repo-removal` are Shoulds.
    - The Musts among the follow-ons are planned to implementation-ready before `cutover-flip` lands, and so is
      `cutover-decompose-removal`; `cutover-in-repo-removal`'s planning waits behind the Musts' and may use a lull
      before the flip lands. They land between the flip and the start of the product-renames sweep, which waits on
      them through `naming-conventions`' edges.
    - If a Should has not landed by the sweep's start, it waits until after the deadline, and its `naming-conventions`
      edge is dropped then, at the Owner's call.
- **Tracked-state removal builds first only while store-read moves remain.** Most start, teardown, delivery, and
  pre-publication consumers already select store reads behind the capability. Base drift's completed-meta resolver
  and delivery's rename source are offered to the flip. If it takes both, tracked-state removal need only land before
  `cutover-in-repo-removal`; no general first-among-follow-ons order remains.
- **What the old decomposition machine still imports.** `cutover-in-repo-removal` leaves in place every module the
  old machine imports: the transition-record cluster (`git-transition-record-enumeration.ts`,
  `terminal-transition-record-writer.ts`, `transition-record-store.ts`), `transition-overlay.ts`, `artifactMatcher`
  and `pruneEmptyBacklogSource` (`mutators/relocate-artifacts.ts`), `resolveProjectReadinessViewInput`
  (`lib/status/project-view.ts`), and the `ProtectionMode` type (`lib/git/write-context.ts`). Their surviving callers
  move onto store reads at the flip or in tracked-state removal if still needed. `cutover-decompose-removal` deletes
  each with its last caller, so it and `cutover-in-repo-removal` can land in either order.
- **The sealing guard's notes callers** (`refuseWriteIfStoreImported`, `lib/store/store-imported.ts`). The notes
  commands stay registered after the flip until `cutover-notes-removal` deletes them, and the guard is what refuses
  their writes and publication once the store is imported. `cutover-in-repo-removal` removes the guard's in-repo arm
  and keeps the notes commands' calls and what they import from the module; whichever of the two removes its last
  caller deletes the module, so they land in either order.
- **The ROADMAP conflict remedy** (`arc hook-remedy-roadmap-conflict`), its hook block, and
  `arc base merge --regenerate-roadmap` leave together in tracked-state removal. No live caller reaches the hook's
  fallback after the flip, so this removal does not wait for other branches' hooks to refresh.
- **Inbound item numbers.** Each member's inbound items keep the number they had in `storage-cutover`'s buffer, shown
  in their headings, so a number cited in one member's draft finds its item in another's.
- **Inbound items that span members.** Each lives in one member's draft; the other members take the shares named
  here:
    - #1, "Delete the code `cli-substrate-complete-migration` carves out": `cutover-tracked-state-removal` holds it;
      `cutover-notes-removal` takes its notes-specific sync and survivor list, and `cutover-in-repo-removal` its
      branch-tree readers and lifecycle classification.
    - #10, "Delete the import's transform, the suites that target retired substrates, and the sync-state ref":
      `cutover-tracked-state-removal` holds it; `cutover-notes-removal` takes the sync-state ref and the suites that
      target notes, and `cutover-in-repo-removal` the suites that target the in-repo implementation.
    - #25, "Take `seam-decomposition`'s deletion set, rehearsal cut, and workflow end state":
      `cutover-decompose-removal` holds it; `cutover-flip` takes the representative rehearsal cut and the workflow end
      state.
    - #26, "Take `seam-status-roadmap`'s two-step ROADMAP removal and its in-repo arms": `cutover-flip` holds it;
      `cutover-tracked-state-removal` takes the conflict remedy, and `cutover-in-repo-removal` the in-repo arms and
      `DERIVED_VIEWS`.

### Why seven

The flip is separate from the deletion it makes due (Owner, 2026-11-03), and from the window's pre-flip machinery
(Owner, 2026-11-10). The flip crossed the size marks at its create-spec entry, and of its parts only that machinery can
sit inert on `main` before the window while the window keeps one merge; the window runs the quiesce check on `main`'s
pre-flip build, so the check must be there first. The rest of the flip stays one work unit. Tracked-state removal keeps
what a user, CI, help, or the shipped recipe still exposes, and `cutover-in-repo-removal`, split from it by hand at its
create-spec entry (Owner, 2026-11-10), takes the internal collapse: the in-repo store, dormant capability and seam arms,
branch-tree readers, lifecycle classification, and the write-context guard. The split was first set for the flip's
landing, to keep a cut from running the decomposition procedure before the flip; a hand mint runs none of it. Notes sync
and the old decomposition machine each remain one self-contained deletion member. Their roughly 10,000-line deletion
sets stay whole (Owner, 2026-11-03), since another branch and review would not shrink the subsystem a reviewer must
check.

### Register shares — 2026-11-10

This maps all 54 open rows whose Owner names `storage-cutover`, by mechanism rather than frozen numeric key. The
Owner cell stays at this cohort for every split; no deletion member alone owns a whole split row. The register's
fates and both cohorts' closeout criteria are unchanged. A row with later obligations stays open until its last
obligation lands. The final split and flip-closure list are settled at the flip's create-spec approval.

The flip column states required post-flip behavior, not behavior already built on `main`. A behavioral fate can hold
while unused legacy implementation remains; that residue's removal is recorded under its explicit removal row. An
explicit deletion or contract-removal clause is not satisfied by dormancy. In the later column, **tracked-state
removal** names `cutover-tracked-state-removal`, **notes removal** names `cutover-notes-removal`, **decomposition
removal** names `cutover-decompose-removal`, **documentation** names `cutover-documentation`, and **collapse** names
`cutover-in-repo-removal`.

| Mechanism                                                                    | Flip share                                                                                                                                                                                           | Later share or unresolved obligation                                                                                                                                                                            |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Candidate and transition records                                             | Move records, retirement, and withdrawal facts to the store.                                                                                                                                         | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Candidate supersession and `recordRevision`                                  | Read chains through store history and expose store versions.                                                                                                                                         | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Append-only rebase invariant and dependent code                              | Retire the SHA-keyed notes justification; keep the invariant until the policy lands.                                                                                                                 | `history-policy` supplies the policy-aware code and lease-guarded rewrite; documentation removes stale notes rationale.                                                                                         |
| Workflows, overrides, scripts, lint and contract checks over history/diffs   | Rewrite reads and workflows; use the landed projected-Markdown checks and the projection save/link boundary.                                                                                         | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Archival by `git mv`, archive index, and relocatability                      | Archive through the store and quarter order; rewrite the relocatability rule in the flip, as its draft now requires.                                                                                 | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Auto-merge planning classification by tracked prefix                         | Stop all workflow reliance on either classifier command.                                                                                                                                             | Tracked-state removal deletes the commands, classifier, CI workflow, CODEOWNERS block, and merge-gate recipe.                                                                                                   |
| `archive.cadence: manual`, two-PR bridge, checkpoint workarounds             | Remove this repository's manual override, bridge, and workaround prose. Keep the `archive.cadence` key and both supported arms.                                                                      | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Residue refs and held delivery spike                                         | Import held delivery artifacts before cleanup.                                                                                                                                                       | Notes removal deletes notes residue; tracked-state removal deletes window refs; the held delivery spike waits until its owning work unit archives.                                                              |
| Lifecycle encoded in directory placement                                     | Make lifecycle a record field and placement its projection, including parked state.                                                                                                                  | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Surviving hand-built work-unit state paths                                   | Route every surviving live caller and harness path through the contract/layout authority.                                                                                                            | Collapse removes dormant in-repo path builders; do not claim completion from the already-landed seed rewrite alone.                                                                                             |
| Hand-maintained artifact-kind lists                                          | None: the `design` selector is already built, and no surviving list breaks or misleads after the flip.                                                                                               | Collapse derives the surviving lists from the registry and deletes write-context and branch-classification patterns; tracked-state removal deletes hook patterns.                                               |
| Lifecycle read from branch refs and planning-branch longevity                | Use the store inventory; detach planning at base and create the branch at activation.                                                                                                                | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Archive before merge under `with-integration`                                | Replace branch placement with a store archive operation.                                                                                                                                             | Decision required: the unchanged fate says at or after merge, whereas A26 and the flip preserve before-merge archival under `with-integration`.                                                                 |
| Tracked retirement receipt and artifact deletions                            | Retire with one store write rather than a receipt/deletion PR.                                                                                                                                       | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Per-work-unit workspace, session notes, spawn seed, archive sweep            | Import session context into meta, write version-anchored handoff, reconcile scratch by lookup, and store adversarial results.                                                                        | Tracked-state removal removes exposed workspace verbs; collapse removes the dormant workspace seed and sweep implementations.                                                                                   |
| Stored `ROADMAP.md`, render stamp, conflict remedy and driver                | Stop writers and assurance reads, remove the stored file and install/presence entries, render status from the store.                                                                                 | Tracked-state removal deletes the remedy, hook block, regenerate option, and merge-driver surface together; collapse deletes dormant render arms and `DERIVED_VIEWS`.                                           |
| Hold-and-route, inbound buffers, coordination-seam rule                      | Route directly to inbound records, keep `_Hold` only for retention, and preserve draft-close timing.                                                                                                 | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Notes-specific sync and its supporting contracts                             | Retire notes publication and notes-based session-init; first provide survivor write serialization and the local-only boundary.                                                                       | Notes removal deletes sync machinery, registrations, sync-state contracts, and notes-only types while preserving the named survivors.                                                                           |
| Notes classification of every personal subdirectory as a workspace           | Run the landed import fold/scratch mapping; make the identity root ARC surfaces plus scratch and stop classifying subdirectories as workspaces.                                                      | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Branch-tree readers                                                          | Move surviving consumers to store reads; take the base-drift and rename-source moves here if accepted.                                                                                               | Collapse deletes branch-tree readers; decomposition removal deletes shared readers with the old machine's last callers.                                                                                         |
| Lifecycle classification and exclusion                                       | Move surviving Candidate, drift, delivery, and review consumers off tracked lifecycle classification.                                                                                                | Collapse deletes the inert classification arms, preserving the spec review-copy arm.                                                                                                                            |
| Lifecycle hook checks                                                        | Use record-family parsers for retained content rules; stop treating lifecycle hooks as assurance.                                                                                                    | Tracked-state removal deletes hooks/checks, preserving the task-numbering content rule and `lint:md:descriptors` in their surviving homes.                                                                      |
| In-flight derivation and work-unit/Errand oracle slots                       | Read store state and give each rebuilt slot its full schema.                                                                                                                                         | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Lifecycle executor, start placement, provisional-placement callers           | Write lifecycle transitions through the store.                                                                                                                                                       | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Notes-related session-init and user-reference reconciliation slots           | Read user state from the store; remove obsolete probes and fully type rebuilt slots.                                                                                                                 | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Current-work-unit reconciliation and stale-worktree sweep slots              | Read store lifecycle/lineage; fully type rebuilt slots; remove `retiredSubdirs` if user sync leaves no lingering subdirectories, else rewrite it over the store.                                     | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Locus derivation from marker and branch topology                             | Derive the frame from marker plus store and provide the full schema.                                                                                                                                 | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Singleton record writes staling publication                                  | Move the records off branch so their own writes no longer advance the code head.                                                                                                                     | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Public code remote publishing user notes and manual interim                  | Retire notes and its manual-push interim; preserve the accepted default-backend personal-state publication decision.                                                                                 | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Record write, `git add`, and `commit-*` next-action protocol                 | Use expected-version store writes and settle without a code commit.                                                                                                                                  | Contract boundary unresolved: remove the named actions from effective machine contracts. Dormancy alone is not a witness; collapse may remove legacy declarations, but the flip spec must settle this boundary. |
| Errand promotion waiting for a meta commit                                   | Promote the same UID by expected-version role change, preserving links/history/description; settle on the write.                                                                                     | The owning `errand-promotion-concurrency` draft must also hold its re-scope. Excluded from the exact flip-closure set until that placement is established.                                                      |
| Only-meta current-work-unit resolution and one-active guard                  | Resolve by marker plus store and read the store claim.                                                                                                                                               | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| HEAD-tree integration/readiness and meta-on-PR requirement                   | Use the store lifecycle port and settle integration-time Completion/Release Notes checks.                                                                                                            | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Base-tree decomposition, staging branch, base advancement                    | Make the cut a multi-record store write and rewrite its workflow.                                                                                                                                    | Decomposition removal deletes the old machine; the `decompose-core-hardening` re-scope remains part of the whole fate.                                                                                          |
| Split parking state, pointer record, and `park --land`                       | Pause with one lifecycle write.                                                                                                                                                                      | Tracked-state removal deletes the exposed park verb; collapse deletes dormant parking/pointer machinery.                                                                                                        |
| Write-context guard, plan committability, grooming branches                  | Make store writes independent of checkout and planning branch.                                                                                                                                       | Tracked-state removal deletes exposed classifier verbs; collapse deletes the write-context guard after the old decomposition dependency is severed.                                                             |
| Commit-anchored handoff and recovery continuity                              | Anchor continuity on the state version and read history through the contract.                                                                                                                        | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| `STATUS.USER` file, offline cache, and notes sync                            | Render on demand; keep any cache machine-local and out of import.                                                                                                                                    | Tracked-state removal cleans the window's leftover file; include the complete file/cache fate in its closure witness.                                                                                           |
| Template overwrite by user add, init, and join                               | Make the landed shared setup path use absent-only contract writes at all three entry points.                                                                                                         | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Foreign-artifact detection through branch diffs                              | Keep Git overlap for code and query the store for state targets.                                                                                                                                     | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Rename stub-branch leg                                                       | Rename through a store write.                                                                                                                                                                        | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Workflow steps committing state with Git                                     | Rewrite all state-only steps to save or removal, retain commits for tracked content, and close tasks through the verb.                                                                               | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Primary-rooted identity files and teardown migration                         | Provide each checkout's projected personal files.                                                                                                                                                    | Collapse deletes rooting and migration arms at the deletion pass.                                                                                                                                               |
| Per-worktree active isolation invariant and acceptance test                  | Use projection-worktrees' checkout isolation and landed layout/edit-rights substrate.                                                                                                                | Documentation rewrites the invariant and acceptance test to `active/current/` and `active/in-flight/<slug>/`.                                                                                                   |
| Errand identity refs, claims, reader acquisition, and sync-state             | Move Errands to UID work-item refs and suffixed branches, transient claims to claims refs, and readers behind list/read/sync with complete-evidence distinctions.                                    | Notes removal retires the sync-state ref and its notes-only plumbing.                                                                                                                                           |
| Notes configuration keys and update migrator                                 | Remove live notes-related consumers with the session-init rewrite.                                                                                                                                   | Notes removal deletes `user.notes_push`, `session.init_pull.notes`, and `session.init_load.notes`; keep `session.remote_sync` and `push.interlock`.                                                             |
| Isolation, Errand, concurrency, notes, contributor, footer and join doctrine | Rewrite always-loaded/workflow claims needed for operating on the flipped repository.                                                                                                                | Documentation completes the strategy doctrine and acceptance-test rewrites; footer policy remains with `ghost-mode`.                                                                                            |
| Accepted ADRs asserting the old substrate                                    | Carry the flip's own ADR dispositions when the moved behavior becomes true.                                                                                                                          | Documentation supersedes/amends the listed ADRs; ADR-014 remains coordinated with `contributor-path`.                                                                                                           |
| Machine-local review/delivery/transient state and checkpoint location        | Store durable review evidence, outcomes, and termini at project scope; preserve machine-local machinery, map repository/project ID, and move checkpoints to identity `.internal/` keyed by work UID. | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| `arc view` hand-built inbox path and pathless completed work unit            | Read through the contract and layout authority.                                                                                                                                                      | Collapse deletes the isolated pre-flip checkout-or-ref arm and its path/editor refusals.                                                                                                                        |
| Literal session-init paths, load set, and compaction seed                    | Finish layout-authority paths before enabling `active/current/`; retain the landed schema bump and re-projection.                                                                                    | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Archive errata convention: Git history as lock                               | Use the store's archived record/history in the archive operation.                                                                                                                                    | Documentation rewrites the errata convention onto archived-meta history.                                                                                                                                        |
| Inbound work without count/age back-pressure                                 | Build the count/oldest-age slot, thresholds, recommended action, and precomposed drain re-triage offer.                                                                                              | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |
| Slug-holder selection and slug-matched checkout claims                       | Keep the landed standing-holder selection; switch claims to UID holders and retain unbound-marker bind/release exits.                                                                                | None in this row’s fate; proposed flip closure.                                                                                                                                                                 |

The branch-tree row removes only the branch-tree operations in mixed modules. In `remote-ref-reader.ts`,
`readMetaAtRef` and `listMetaPathsAtRef` are those operations; `classifyRemoteFailure`, `PASSIVE_REMOTE_INTERACTION`,
`DEFAULT_NETWORK_TIMEOUT_MS`, `fetchRefsBounded`, and `readLiveRemoteHeads` survive by their callers.
`branchToWorkUnitSlug` lives in `work-unit-slug.ts` and survives too. Shared transition readers remain until
old decomposition's last caller leaves, regardless of which deletion lands first.

**Decisions excluded from the proposed flip-closure set:** the archive-timing row's unchanged at-or-after-merge fate
conflicts with A26's before-merge `with-integration` arm; the record-write row needs a witness that `commit-*` actions
leave effective machine contracts, including their exported schemas; and promotion's fate includes placement of the
`errand-promotion-concurrency` re-scope. Those rows stay open rather than being closed by inference. In particular,
`delivery-review-terminus.ts` and `checkpoint.ts` still expose commit actions on the audit basis. The archive-cadence
bridge row is distinct: it removes this repository's manual override, not the supported `archive.cadence` key.

#### Proposed rows closed by the flip's landing

These are the complete-fate candidates for the flip's spec, conditional on its implementation and landing witnesses;
none closes merely by recording this allocation. Rows with a later share, ROADMAP included, are excluded.

- Candidate and transition records.
- Candidate supersession and `recordRevision`.
- Workflows, overrides, scripts, lint and contract checks over history/diffs.
- Archival by `git mv`, archive index, and relocatability.
- `archive.cadence: manual`, two-PR bridge, checkpoint workarounds.
- Lifecycle encoded in directory placement.
- Lifecycle read from branch refs and planning-branch longevity.
- Tracked retirement receipt and artifact deletions.
- Hold-and-route, inbound buffers, coordination-seam rule.
- Notes classification of every personal subdirectory as a workspace.
- In-flight derivation and work-unit/Errand oracle slots.
- Lifecycle executor, start placement, provisional-placement callers.
- Notes-related session-init and user-reference reconciliation slots.
- Current-work-unit reconciliation and stale-worktree sweep slots.
- Locus derivation from marker and branch topology.
- Singleton record writes staling publication.
- Public code remote publishing user notes and manual interim.
- Only-meta current-work-unit resolution and one-active guard.
- HEAD-tree integration/readiness and meta-on-PR requirement.
- Commit-anchored handoff and recovery continuity.
- Template overwrite by user add, init, and join.
- Foreign-artifact detection through branch diffs.
- Rename stub-branch leg.
- Workflow steps committing state with Git.
- Machine-local review/delivery/transient state and checkpoint location.
- Literal session-init paths, load set, and compaction seed.
- Inbound work without count/age back-pressure.
- Slug-holder selection and slug-matched checkout claims.

### Closeout criteria

Every member has shipped, and every row of `cohort-state-storage.md`'s storage-coupling register that names
`storage-cutover` as its owner is closed.

## Members

### `cutover-window-tooling`

_Exposes:_ on `main` ahead of the window, inert until run: the quiesce check, its record and hold under
`refs/arc-window/`, its recompute after the import and its last read of `origin/main`'s tip; the abort's restore; the
worktree lock step; and Stage 1, with its copy driver, accounting case, and chain comparison, run clean.

_Consumes:_ nothing outstanding; it reads only landed machinery.

### `cutover-flip`

_Exposes:_ the flipped repository: Stage 2, the quiesce run through `cutover-window-tooling`'s check, the import, the
flip change, every workflow rewritten onto the store, Git notes retired, and two amendments to ADR-035, items 2 and 8.

_Consumes:_ every other `state-storage` member, landed, the last of them `cohort-identity-verbs`,
`projection-worktrees`, `projection-write-back`, and `projection-team-scale`; and `cutover-window-tooling`.

### `cutover-tracked-state-removal`

_Exposes:_ the surfaces still exposed to users, CI, help, or the shipped recipe after the flip, removed: refusing and
inert verbs and options, lifecycle hook checks, the CI planning classifier, and the merge-gate recipe as a whole;
the import transform and the window's leftovers, removed. `archive.cadence` and both supported arms stay; only
in-repo-only readers leave, in `cutover-in-repo-removal`. `hooks.contributor_protected_paths` and `hooks.task_numbering`
retire with their checks.

_Consumes:_ `cutover-flip`.

### `cutover-in-repo-removal`

_Exposes:_ the internal collapse removed: the in-repo store implementation, the dormant capability and seam arms with
the capability itself, the branch-tree readers, lifecycle classification and exclusion, the write-context guard, and
`archive.cadence`'s in-repo-only readers, leaving in place what the old decomposition machine still imports.

_Consumes:_ `cutover-flip` and `cutover-tracked-state-removal`.

### `cutover-notes-removal`

_Exposes:_ notes-specific sync removed, its survivors kept; the sync-state ref, the suites that target notes, the notes
configuration keys, and the notes residue refs gone.

_Consumes:_ `cutover-flip`.

### `cutover-decompose-removal`

_Exposes:_ the old decomposition machine removed, with its callers in teardown and in-flight derivation and the modules
`cutover-in-repo-removal` leaves for it.

_Consumes:_ `cutover-flip`.

### `cutover-documentation`

_Exposes:_ the strategies and ADRs rewritten to the store model, among them § Per-Worktree Isolation and its acceptance
test, the errata convention, and the `storage.backing_repository` comment.

_Consumes:_ `cutover-flip`.

---
