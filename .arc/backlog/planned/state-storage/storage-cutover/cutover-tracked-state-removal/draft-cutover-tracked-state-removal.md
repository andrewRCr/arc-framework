# Draft: Cutover Tracked-State Removal

- **Origin:** [internal] — the `storage-cutover` cut (2026-11-03); carved from that work unit's draft.
- **Purpose:** Remove what the flip leaves inert of ARC's tracked-state machinery: the in-repo store implementation and
  every in-repo arm the seam members left, the branch-tree readers, lifecycle classification and exclusion, the
  lifecycle hook checks, and the CI planning classifier.
- **Planning posture:** `P1`, a Gate B Must. It is planned to implementation-ready before `cutover-flip` lands, and
  lands between the flip and the start of the product-renames sweep (`cohort-storage-cutover.md`). It builds first among
  the follow-ons.

---

## Planning state

- **Readiness:** rough (carved from `storage-cutover`'s draft at its cut, 2026-11-03).
- **Resolved at the cut** (Owner, 2026-11-03; `cohort-storage-cutover.md`):
    - this member's scope and items, below, and its Gate B placement;
    - it builds first among the follow-ons, since it is not pure deletion: it first moves surviving start, teardown,
      `lib/delivery/`, and the review gate's pre-publication code onto store reads;
    - it leaves in place every module the old decomposition machine imports (§ Scope).
- **Open:**
    - the inventory: each module's surviving symbols and callers, measured against the base the flip lands on;
    - whether the flip untracks the `.arc/system/.internal/` records, which moves #3 to `cutover-flip`.
- **Next:** draft-design, from the scope and items below. Implementation waits on `cutover-flip`.

The inbound items keep the numbers they had in `storage-cutover`'s buffer, shown in their headings. An
item cited here that this draft does not hold is in another member's draft under the same number.

---

## Scope

Measured on 2026-11-03 in `packages/arc-framework/src/`, before tests: the branch-tree readers about 3,900 lines,
the in-repo store implementation (`lib/store/in-repo/`) about 2,800, and lifecycle classification with the hook check
scripts about 1,800.

- **From #1,** which this draft holds: the branch-tree readers, lifecycle classification and exclusion, the lifecycle
  hook checks, and the CI planning classifier. `cutover-notes-removal` takes its notes-specific sync.
- **The in-repo store and its arms:** `lib/store/in-repo/` and every in-repo arm the seam members left: #3 unless
  the flip takes it, #4, #10's import transform and the suites that target the in-repo implementation, #20, #24,
  #26's in-repo arms and `DERIVED_VIEWS` and `arc hook-remedy-roadmap-conflict`, #35, H2, and `arc view`'s pre-flip
  arm (the register's `arc view` row).
- **Residue refs:** `refs/arc/recovery/delivery-state/*`, `refs/arc/bootstrap/*`, the three
  `refs/arc/delivery-candidates/d2f24ab2-…` refs, and `refs/arc/user/andrew/errands-remote`, once the held delivery
  work unit's artifacts are imported.
- **Retired keys:** `archive.cadence`, `hooks.contributor_protected_paths`, and `hooks.task_numbering`.

### The per-check sort

From `storage-cutover`'s draft (2026-11-03): every lifecycle hook check and every part of the CI
planning classifier follows the flip.

- No check fails once tracked state is gone:
    - The pre-commit hook selects only staged paths (`git diff --cached --name-only --diff-filter=ACMR`), so nothing
      under an ignored projected root reaches a check.
    - `validate-meta-spec`, `validate-cohort-consistency`, `assert-roadmap-regenerated`, the ROADMAP render-field
      warning, the contributor-protected-path warning, the task-list modification warning, and `CHECK[task-numbering]`
      pass vacuously.
    - `check-foreign-writes` already returns on the store's `stateOffBranch` capability.
- Nothing relies on a result as assurance:
    - The meta, cohort, and task-list rules run as record-kind write checks: `meta.field-block` and `meta.stage` in
      `lib/store/kinds/meta/`, `cohort.purpose` and `cohort.parent` in `lib/store/kinds/cohort/rules.ts`, and
      `task-list.segmentation` in `lib/store/kinds/task-list/shape-rules.ts`.
    - `main`'s ruleset requires only `ci-ok`, not the lane attestation's `arc-lane` status.
    - The classifier answers `reviewed` for any diff that holds a non-planning path, which is every diff once state is
      untracked. That is the answer that grants nothing.
- `lint:md:descriptors` stays: it still lints the task-list template, and only its task-list path selector goes dead.
- **Ordering hazards:**
    - `arc hook-remedy-roadmap-conflict` (`scripts/remedy-roadmap-conflict.ts`) goes only after every live branch's
      tracked hook is refreshed. Its fallback is the one that errors when its target is missing. The others skip
      with a notice (the `-f` guards) or swallow the failure (`|| true`).
    - The lane-attestation workflow goes in the same change as `arc review planning-lane`, with
      `review-gate-workflows.test.ts`'s assertions on it.
    - The shipped merge-gate recipe calls `arc review planning-lane` in a project's CI classify job, so the
      command's removal ships the recipe change and a notice.
    - `lib/status/roadmap-regeneration-assert.ts` goes with #26's in-repo arms, which import it.
    - Removing `isPlanningArtifactPath` edits the surviving `isIntegrationTargetPath` in `change-facts.ts`.

### What the old decomposition machine still imports

This member leaves in place every module the old machine imports, and moves their other callers onto store reads:

- the transition-record cluster: `isGitTransitionOriginOccupied` (`git-transition-record-enumeration.ts`),
  `createInRepoTerminalTransitionRecordWriter` (`terminal-transition-record-writer.ts`), and
  `transition-record-store.ts`;
- `transition-overlay.ts`;
- `artifactMatcher` and `pruneEmptyBacklogSource` (`mutators/relocate-artifacts.ts`);
- `resolveProjectReadinessViewInput` and its file-view types (`lib/status/project-view.ts`);
- the `ProtectionMode` type (`lib/git/write-context.ts`).

`cutover-decompose-removal` deletes each with its last caller, so the two land in either order. The cluster,
`transition-overlay.ts`, and `relocate-artifacts.ts` import nothing this member deletes.

---

## Unknowns and Assumptions

- H2, the user-surface rooting and migration: `projection-worktrees` § 12.8, re-checked when it lands.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's first planning iteration. Integrate — or_
> _consciously reject — each one._

### `[ ]` **1. Delete the code `cli-substrate-complete-migration` carves out**

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

### `[ ]` **3. Retire the live transition-record test when lineage moves to the store**

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

### `[ ]` **4. Drop lineage's `rename` and the meta's retired session fields in the deletion pass**

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

### `[ ]` **10. Delete the import's transform, the suites that target retired substrates, and the sync-state ref**

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

### `[ ]` **20. Decide whether `scratch/.internal/` is machine-local or the person's own**

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

### `[ ]` **24. Retire `archive.cadence` at the flip, with its readers**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-19).
- _Shapes:_ Deletion pass: retire archive.cadence key and all readers; settle any real residual timing choice

- _Observation:_ the program removes everything the cadence selects, but never retires the key itself. Archival becomes
  a store write at or after merge (the register's archive-before-merge row, owned by `storage-seam`), and the storage
  contract's consumer map drops `archive-work-unit.md`'s manual-cadence routing and `integrate-work-unit.md`'s step-8
  cadence dispatch at the flip. The same map's `arc-config.yml` row retires `user.notes_push`,
  `session.init_pull.notes`, and `session.init_load.notes` with no successor, but not `archive.cadence`, and no row
  names the key's code readers: `lib/config/schema.ts`, `lib/config/status-reader.ts`, `commands/config/validate.ts`,
  readiness's `wrong-cadence` refusal (`scripts/review-gate/readiness.ts`), and `scripts/integration/checkpoint.ts`,
  `checkpoint-composition.ts`, and `merge-composition.ts`. After the flip the key selects no behavior.

- _Approach:_ retire the key with no successor beside the notes keys, and take its readers out in the deletion pass.
  Settle at the draft whether "at or after merge" leaves any choice worth a setting — integration archiving at merge, or
  leaving it to a later `arc archive` — with the program's rule of the final shape over today's as the default answer.

- _Captured during:_ `storage-ref-backend` activation, 2026-10-16, while folding the review import mapping's liveness
  test, which reads no cadence for this reason.

### `[ ]` **35. Commit the cutover's deletion pass to removing the review gate's inert local folders**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-31).

- _Shapes:_ the deletion pass; `seam-delivery-review`'s spec § 11.1–11.2 (left-behind review-gate files).

- _Observation:_ the import's review mapping (`seam-delivery-review`) carries only live work's review-gate facts. It
  leaves behind shipped work units' facts ("No live work item owns this review fact"), working state, retired
  snapshots, retired-attempt frontline outcomes and older dispositions; 2,895 sources in its 2026-10-29 trial, about
  2,940 files and 22 MB in `.git/arc/review-gate/` on 2026-10-31, dating from 2026-07-23. Left behind means not
  imported: the files stay. That spec says the folders stay inert from the flip and that the cutover's deletion pass
  "may" remove them, which commits nothing. Nothing reads a shipped work unit's review facts to decide (its § 11.1).

- _Approach:_ make the deletion pass remove the inert review-gate folders after the flip, keeping the import's
  left-behind report as the record of what was dropped. Leave the machine-local hosted-request owner index
  (`identity/`), which stays in use after the flip, to the retention capture beside this one.

- _Captured during:_ PM follow-up on the import trial, answered by `seam-delivery-review`, 2026-10-31.

### `[ ]` **H2. Remove the user-surface rooting and its migration in the deletion pass**

- _Routed from:_ `spec-projection-worktrees.md` § 12.8, 2026-11-03.

- _Shapes:_ the deletion passes. This is the register row "Identity-global user files are rooted in the primary
  worktree", which this unit already owns.

- _Observation:_ the in-repo implementation keeps `lib/user-surfaces.ts`' resolver, which
  `lib/store/in-repo/personal-paths.ts` imports. Until the flip, teardown merges a linked worktree's copy up through
  `lib/user-surface-migration.ts`. Both are the in-repo implementation's arms.

- _Approach:_ delete both with the in-repo arms, after the seam's members have moved their own callers off the
  resolver.

---
