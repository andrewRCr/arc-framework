# Notes: Stale-State Detect-and-Pull

## Contents

- Verified current-state grounding (per surface)

## Verified current-state grounding

Anchors confirmed against the codebase during spec crystallization — the current behavior and the precise gap
per surface, so task generation need not re-explore. Files under `packages/arc-framework/src/`; function names
are the stable anchors (line numbers drift).

### D1 — base-ref staleness

- `lib/git/worktree-sync.ts` — `countAheadBehindRef(exec, localRef, remoteRef)`: runs
  `git rev-list --left-right --count localRef...remoteRef` → `{ ahead, behind, state }`. Compares arbitrary refs.
- `lib/git/base-distance.ts` — `runBaseDistanceStatus` invokes it **only** as
  `countAheadBehindRef(exec, "HEAD", "origin/<base>")` (HEAD-distance); the session-init envelope already carries
  a `baseDistance` slot from this. The local-`<base>`-vs-`origin/<base>` comparison D1 needs does **not** exist —
  same primitive, new invocation + new `baseBranchSync` slot.

### D3 — notes/disk drift

- `commands/user/sync-status.ts` — `computeSessionInitLoadNeeded({ refState, unsavedDirection })` returns `true`
  only when `refState === "same"` **and** `unsavedDirection === "behind"`; else `undefined`.
  `inspectDiskVsLocalSnapshot` yields `behind | missing | mixed | edits | modified | null`; `mixed` / `missing`
  currently collapse to no-action — the discarded divergence D3 surfaces.
- `lib/user-sync/projection.ts` + `sync-state.ts` / `merge.ts` — the projection bridge D3 extends with the prior
  file-list to tell intentional retirement from real local drift.

### D4 — retired-subdir reconcile

- `commands/user/save-load.ts` (the load path, invoked by `arc user pull`):
    - pre-load **whole-manifest backup** → `.internal/<timestamp>.json` (`createTimestampedBackupFilename` +
      `pruneTimestampedBackups`). The backup already exists.
    - `reconcileRetiredSubdirs` → `planRetiredSubdirReconcile`, then loops `removeStaleUserWuSubdir`. The delete
      already runs.
    - `classifyOrphans` (`lib/user-sync/orphan-classification.ts`) → `renderOrphanWarning` emits the per-subdir
      `grouped-retirement` warning — the recurring "stale subdir" message on a machine that under-removes.
- `lib/user-sync/retired-subdir.ts` — `planRetiredSubdirReconcile`: reconcile iff `!notesWuNames.has(subdir)`
  **and** `shipped.has(subdir)`. `shipped` = `readShippedWorkUnits` scanning **local** `.arc/completed/` — so a
  stale local archive → `isSlugShipped` false → preserve → accumulation (the dominant defect; D1's index-freshen
  is the fix).
- `commands/user/open.ts` — `removeStaleUserWuSubdir`: `rm(dir, { recursive: true, force: true })`, no per-call
  backup (relies on the pre-load whole-manifest backup above). Shared by the reconcile and the `arc user open`
  prompt.

### C1 — partial-push marker (consume)

- `lib/user-sync/sync-state-ref.ts` — `refs/arc/user/{identity}/sync-state`, per-`machineId` entries.
- `lib/user-sync/sync-state-marker.ts` — `SyncStateMarker { version, machineId, lastAttemptedCommit,
  attemptTimestamp, intent }`; `evaluateMarkerLiveness(marker, notesRefTip) → "fulfilled" | "live"` (fulfilled
  iff `notesRefTip === marker.intent`). Invoke; do not reimplement.

### R1 — `arc sync` inbound leg

- `handlers/sync.ts` — `decideWorktree`: `WORKTREE_PUSH_BLOCK_STATES = { diverged, remote-ahead, detached-head,
  no-remote }` returns `skip-blocked-worktree` (push-only; no inbound pull today).

### Caution force-gate context (parked)

- `lib/git/supersession.ts` — `git cherry origin/<branch> HEAD` marks local-ahead commits by patch-id;
  `superseded` iff ≥1 local-ahead commit **and** all are patch-equal upstream. `lib/session-init/
  recommended-action.ts` composes the lossless `git reset --hard origin/<branch>` offer (offer-only) — the only
  session-init force offer.
- `lib/release/destructive-flags.ts` + `handlers/release/push.ts` — `arc release push` **refuses** force
  (`force-push-required` always-refuse advisory). No ARC force-push offer exists to host the Caution register;
  hence parked.
