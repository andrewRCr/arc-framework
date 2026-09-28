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
          (inbox state and reminders) and `resolveCurrentWuName`. The tail moves the Git failure-text predicates
          (`isCasRejectionError`, `isRemoteUnavailableError`, `isNonFastForwardError`) to `lib/git/ref-tree.ts`.
        - Branch-tree readers: `lib/status/project-view-ref.ts`, `git-retirement-authorization-context.ts`,
          `git-transition-record-enumeration.ts`, and the ref-reading portions of `in-flight-derivation.ts`,
          `remote-ref-reader.ts`, `completed-index.ts` (`*FromRef`), and the session-init sweeps' base-archive reads.
        - Lifecycle classification and exclusion: `evidence-applicability/path-treatment.ts`,
          `delivery/lifecycle-contribution.ts` with its Git variant, and the evidence-neutral and regenerable arms.
        - Lifecycle hook checks: `validate-meta-spec`, `validate-cohort-consistency`, `assert-roadmap-regenerated`,
          `check-foreign-writes`, `remedy-roadmap-conflict`.
        - CI planning classifier: `isPlanningArtifactPath` and `classifyPlanningLane` in `change-facts.ts`, the
          `lane-paths` logic in `classify-change.sh`, the lane-attestation workflow, and the planning-grooming
          command. The rest of `change-facts.ts` survives.

- _Approach:_ each bullet is one row in `cohort-state-storage.md`'s storage-coupling register. Reconcile the
  carve owner names in `cli-substrate-complete-migration`'s spec to `storage-cutover` (removed) and
  `storage-seam` (rewritten).

- _Captured during:_ `cli-substrate-complete-migration` draft-design, 2026-09-28.

---
