# Draft: User-Sync Module Split

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Account for `partial-push-marker`'s user-sync surface growth in the split**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-06-25); captured during `partial-push-marker`
  draft-design (scope / dependency pass).
- _Concern:_ `partial-push-marker` grows the user-sync module — a new `sync-state` ref, push-before-notes
  ordering, an auto-retry leg in the push flow, and marker read/write. The decomposition should account for the
  added surface (it will likely land first, as a P1 `finalize-parallelism` gate).

### `[ ]` **Account for `stale-state-detect-and-pull`'s user-sync surface growth in the split**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-06-26); captured during
  `stale-state-detect-and-pull` planning forward-compat sanity check (2026-06-25).
- _Concern:_ `stale-state-detect-and-pull` (S3 notes/disk-drift) edits `inspectDiskVsLocalSnapshot`, the
  user-sync spine, and the projection bridge — the `sync-status.ts` functions this split relocates (to
  `disk-snapshot.ts` / `spine.ts`). It also adds a shared "unpushed-local-drift" predicate its retired-subdir
  reconcile consumes. The decomposition should account for the added/edited surface — mirrors the
  `partial-push-marker` growth note above.

### `[ ]` **Scope the user-load `try/catch` so reconcile/backup errors propagate**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: user-sync-module-split`), housekeep drain (2026-06-27);
  captured during the `reconcile-shipped-subdirs` errand — CodeRabbit Finding 2, 2026-06-27.
- _Concern:_ in `commands/user/save-load.ts` the load path's `try/catch` (around `serialize` → backup write →
  `reconcileRetiredSubdirs` → notice tiering; catch ~line 201) is over-broad. Its "user dir doesn't exist yet"
  comment only justifies the `serialize` throw, but a git/exec failure in the shipped-set read or a removal
  failure in `removeStaleUserWuSubdir` is silently swallowed and the load proceeds to `deserialize`, masking
  diagnostics.
- _Approach:_ scope the catch to the `serialize` call alone (the only expected dir-absent throw) so reconcile and
  backup failures surface instead of being absorbed.
- _Scope:_ pre-existing (the reconcile already sat inside this catch before the `reconcile-shipped-subdirs`
  errand); no data-loss risk (the pre-load backup is written before reconcile); minor. Folds with this WU since
  it relocates exactly these `save-load.ts` / `sync-status.ts` surfaces.

### `[ ]` **Batch note reads and make ancestry reduction argv-safe**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: user-sync-module-split`), housekeep drain
  (2026-07-10); captured during the `user-notes-retention` audit.
- _Concern:_ status and session-init perform one `git notes show` per reachable note in an unbounded
  `Promise.all`, then resolve the same note set more than once. At several hundred notes this becomes thousands
  of Git spawns; passing the whole SHA set to `merge-base --independent` also crosses Windows' process argv
  limit.
- _Fold-in:_ add a `git cat-file --batch` note reader, resolve each operation's note set once, and make maximal
  ancestry reduction bounded/streamed. Preserve the audit's spawn-count regression so a future N+1 loop fails
  loudly.

### `[ ]` **Consolidate compaction-boundary adoption**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: user-sync-module-split`), housekeep drain
  (2026-07-10); captured during CodeRabbit review of `user-notes-retention`.
- _Concern:_ branch-bounded export and reconcile-push duplicate generation comparison, missing-input handling,
  `adoptCompactedNotesRef`, and outcome mapping.
- _Fold-in:_ extract one compaction-adoption helper while keeping full/snapshot-ref selection and flow-specific
  behavior at the call-site edges.

### `[ ]` **Make nearest-note resolution inert on Errand branches**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: user-sync-module-split`), housekeep drain
  (2026-07-10); captured during the notes-window Errand.
- _Concern:_ a meta-less `fix/*` / `chore/*` branch is currently treated as a phantom WU by branch fallback,
  so the reachable current note can be filtered out and `savedCommit` renders `null`.
- _Fold-in:_ add a non-WU-branch regression and keep WU-subdir filtering inactive when no real WU resolves.
  FP wave 3 will re-check whether the observed effect remains cosmetic under a live parallel Errand.

### `[ ]` **Name the reconcilable note-relation predicate once**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: user-sync-module-split`), housekeep drain
  (2026-07-10); captured during the `notes-export-state-coherence` review.
- _Concern:_ the exact `local-subset || equal || mixed-uncontested` predicate is repeated across status,
  session-init, and sync dispatch.
- _Fold-in:_ centralize zero-contested/reconcilable semantics in one pure classifier predicate. Keep
  `remote-subset`'s clean-collapse rule distinct and preserve disk-independent dispatch tests.

---

## Problem / Motivation

`src/commands/user/sync-status.ts` (~1.6k lines) carries multiple responsibilities under
one module-level surface: full `arc user status` orchestration, session-init user-notes
status, shared user-sync spine policy, status / result construction, notes-ref topology
inspection, disk-vs-note manifest comparison, remote identity listing, and manifest
comparison helpers. Documented in `analysis-cli-architecture-solid-dry-audit.md` § P1
(user-sync status module SRP pressure).

Concrete surfaces inside the file:

- `runUserStatus(...)` — disk, note, backup, remote identity, ref, worktree, and
  sync-state probes.
- `runUserSessionInitStatus(...)` — narrower but overlapping session-init probe.
- `computeUserSyncSpine(...)` — shared policy mapping from raw ref topology to
  session-init compatible verdicts.
- `buildUserStatusResult(...)` — status rendering and detail-line composition.
- `inspectUserSyncRefsDetailed(...)` — git ref comparison and temp-ref fetch behavior.
- `inspectDiskVsLocalSnapshot(...)` — disk / note / materialized-state direction
  inference.

The corresponding test file (`__tests__/unit/user-status.test.ts`, ~2.2k lines) groups
the same set of concerns; refactoring either side without the other reshuffles coupling
rather than reduces it.

**Why this matters.** Policy, IO, and presentation changes share one file-level change
surface. Future release-wrapper work, sync-related extensions (e.g., Interlock Release
Wrappers WU1 Phase 5 audit-log retrofit), and worktree-aware sync state additions
accumulate pressure on this module and its test file.

## Approach

Split by responsibility into focused modules. Likely shape (PRD-time refinement
expected):

- `lib/user-sync/ref-inspection.ts` — git ref reads, ls-remote parsing, temp-ref fetch.
- `lib/user-sync/disk-snapshot.ts` — disk / note / materialized-state direction
  inference.
- `lib/user-sync/spine.ts` — shared policy mapping from raw ref topology to session-init
  verdicts.
- `commands/user/status-builder.ts` — status-rendering / detail-line composition.
- Command-level orchestrators (`runUserStatus`, `runUserSessionInitStatus`) compose those
  modules.

Preserve current public command exports during migration to keep call sites stable.
Test split follows the same boundaries — direct unit tests for spine policy, ref
inspection, disk-snapshot comparison, and status-result building; smaller orchestration
test for `runUserStatus` and `runUserSessionInitStatus`.

## Scope

### In scope

- Extract `sync-status.ts` into the modules listed above (final shape determined at PRD
  time).
- Restructure `__tests__/unit/user-status.test.ts` to follow the new module boundaries.
- Fold the audit's P2 user-notes ref + manifest helper duplication finding into this
  work — `lib/user-sync/notes-ref.ts` and `lib/user-sync/manifest.ts` per the audit's
  candidate remediation.

### Out of scope

- Sync handler decomposition (`plan-sync-handler-decomposition.md`) — separate file
  scope.
- Behavioral changes to user-sync semantics or output contracts.
- Lib-layer type extraction (`plan-lib-layer-type-extraction.md`) — composes against
  whatever neutral types exist at execution time.

## Sibling Work Units

- Plan A (`plan-lib-layer-type-extraction.md`) — independent, but ideally lands first so
  this work targets neutral types directly.
- Plan B (`plan-sync-handler-decomposition.md`) — independent file scope; safe to run in
  parallel.

## Scope Estimate

**Medium-large.** ~4-6 sessions ballpark — largest of the three audit-remediation plans.

- Module extraction + per-module tests: ~3 sessions.
- Test file restructuring: ~1 session.
- Folded P2 DRY work (notes-ref, manifest helpers): ~0.5-1 session.
- Verification + buffer: ~1 session.

**Sequencing.** Defer past the parallelism trio (Worktree Foundation + Agile WU
Lifecycle + Concurrent Work Conventions) and Coord Probe per
`analysis-cli-architecture-solid-dry-audit.md` § Sequencing Considerations. Parallel
candidate with Plans A and B once worktree infrastructure unlocks parallel WUs.

---
