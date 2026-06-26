# Notes: Stale-State Detect-and-Pull

## Contents

- Verified current-state grounding (per surface)
- Session-init rendering surface (two-copy)
- Grounding refinements (task-generation audit)

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
- `lib/user-sync/retired-subdir.ts` — `planRetiredSubdirReconcile`: reconcile iff the drift gate (below) passes
  **and** `shipped.has(subdir)`. The original `shipped` read scanned the **working-tree** `.arc/completed/` — so on
  a non-integrating machine the feature branch's tree lacked the sibling's archival commit → the slug was absent
  from `shipped` → preserve → accumulation (the defect this WU closed).
    - **Shipped read:** `shipped` resolves against **`origin/<base>`** via a ref-backed read
      (`git ls-tree -r --name-only origin/<base> -- .arc/completed/`) — the canonical, branch-independent oracle the
      probe already fetches. A base ff-pull does **not** fix the working-tree read (it updates the ref, not the
      branch's tree), so the read must target the ref directly, not the working tree. New recursive/path-scoped
      reader homes in `lib/git/ref-tree.ts` (`readTreeEntries` is shallow) / `lib/work-unit/completed-index.ts`;
      `readShippedWorkUnits` stays for the stale-worktree sweep (out of scope).
    - **Drift gate:** the recency conjunct `!notesWuNames.has` became
      `!hasUnpushedLocalDriftForScope(disk, basis, {subdir})`, basis = the
      most recent in-window note still carrying the subdir (never the latest note). Two consumers:
      `reconcileRetiredSubdirs` and `runRetiredSubdirDetection` (the latter must serialize a disk content manifest,
      gated behind `shippedPresent.length > 0`).
- `commands/user/open.ts` — `removeStaleUserWuSubdir`: `rm(dir, { recursive: true, force: true })`, no per-call
  backup (relies on the pre-load whole-manifest backup above). Shared by the reconcile and the `arc user open`
  prompt.
- **Dispatch:** the reconcile runs only inside `runUserLoad`, dispatched by session-init's notes-load channel
  (`loadNeeded`-gated). The dispatch fires `arc user load` on `loadNeeded` **OR** retired candidates,
  under the existing `session.init_load.notes` policy — so a current-notes machine still reconciles. Slot enrichment:
  `retiredSubdirs` gains `recommendedAction` / `recommendedPromptText` (`commands/status/run.ts`,
  `lib/session-init/recommended-action.ts`); dispatch + Step 1/6 edits in `session-init.md` (both copies).

### C1 — partial-push marker (consume)

- `lib/user-sync/sync-state-ref.ts` — `refs/arc/user/{identity}/sync-state`, per-`machineId` entries.
- `lib/user-sync/sync-state-marker.ts` — `SyncStateMarker { version, machineId, lastAttemptedCommit,
  attemptTimestamp, intent }`; `evaluateMarkerLiveness(marker, notesRefTip) → "fulfilled" | "live"` (fulfilled
  iff `notesRefTip === marker.intent`). Invoke; do not reimplement.

### R1 — `arc sync` inbound leg

- `handlers/sync.ts:231` — `decideWorktree`: `WORKTREE_PUSH_BLOCK_STATES = { diverged, remote-ahead,
  detached-head, no-remote, branch-gone, remote-unavailable }` (6 states) returns `skip-blocked-worktree`
  (push-only; no inbound pull today). The inbound leg converts only `remote-ahead → ff-pull`; the rest stay
  blocked.

### D2 — `plan/`-orphan sweep (facet lineage)

No session-init orphan-*branch* sweep exists to mirror; this is built new from three shipped sources:

- **Surface shape** — `lib/session-init/stale-worktree-sweep.ts` (`runStaleWorktreeSweep`, `decideWorktreeCleanup`,
  `StaleWorktreeReport`). The `plan/`-orphan sweep mirrors this shape on a **new** envelope slot (not the `sweep`
  slot, which carries worktrees).
- **Gone-upstream detection** — `isBranchGoneError` (`lib/git/worktree-sync.ts`) + `branch-gone-cascade.ts`
  (shipped in Worktree Foundation).
- **Merged-only `git branch -d` pattern** — proven in `async-merge-lifecycle`'s `integrate-work-unit` Step 13
  primary-worktree teardown (merged-only-safe, never `-D`); the merged-to-base check itself is new.

**Facet lineage.** `async-merge-lifecycle` § reaper-facet-split owned **facet 2** (`feat/` orphan), shipped as the
merge-time teardown above — *not* a session-init sweep. It explicitly deferred **facet 1** (cross-machine `plan/`
orphan) to the future owner of "a generic session-init stale-local-branch sweep surface." Facet 1 was punted to
`coord-probe`, which dissolved at the 2026-06-25 cross-machine-coherence restructure (its branch-gone correctness
had shipped in Worktree Foundation); the `plan/`-orphan sweep relocated here as D2. So the spec's "the
`feat/`-orphan facet shipped" is true but names the *other* facet, and a teardown rather than a sweep.

### Caution force-gate context (parked)

- `lib/git/supersession.ts` — `git cherry origin/<branch> HEAD` marks local-ahead commits by patch-id;
  `superseded` iff ≥1 local-ahead commit **and** all are patch-equal upstream. `lib/session-init/
  recommended-action.ts` composes the lossless `git reset --hard origin/<branch>` offer (offer-only) — the only
  session-init force offer.
- `lib/release/destructive-flags.ts` + `handlers/release/push.ts` — `arc release push` **refuses** force
  (`force-push-required` always-refuse advisory). No ARC force-push offer exists to host the Caution register;
  hence parked.

## Session-init rendering surface (two-copy)

Every detection/render feature splits across the CLI envelope and the `session-init.md` workflow (a Framework
file — edits land in the package source `packages/arc-framework/arc/system/.../session-init.md` AND the `.arc/`
mirror). The CLI envelope is assembled in `runSessionInitStatus` (`commands/status/run.ts`), each slot a
`Probe<T>`; the `baseDistance` precedent enriches `recommendedAction` via `inferBaseDistance` (`run.ts`). Config
keys live in `lib/config/status-reader.ts` (`DEFAULTS` + `ENUM_VALIDATORS`).

| Feature                 | CLI slot (`run.ts`)          | `session-init.md` touchpoint                                                      |
|-------------------------|------------------------------|-----------------------------------------------------------------------------------|
| D1 base-ref (2.2)       | new `baseBranchSync` slot    | Step 1 table · Step 2 sync pulls (new `session.init_pull.base`) · Step 6 advisory |
| D2 `plan/`-orphan (4.1) | new sweep slot               | Step 1 table · Step 6 sweep-style offer                                           |
| D3 drift (3.1)          | extends `user` slot          | Step 2 notes dispatch · Step 6 clean-arm advisory                                 |
| C1 marker (5.1)         | new `partialPushMarker` slot | Step 1 table · Step 6 advisory (co-located with base-ref)                         |

## Grounding refinements (task-generation audit)

Confirmed against current code during task generation; deltas from the spec-crystallization anchors above:

- **No `isSlugShipped` symbol** — the shipped gate is `ReadonlySet<string>` membership (`shipped.has(slug)`),
  `shipped` from `readShippedWorkUnits`. D4's gate becomes `shipped.has(subdir) && !hasUnpushedLocalDrift(subdir)`,
  replacing the `!notesWuNames.has(subdir)` conjunct.
- **`evaluateMarkerLiveness` is clock-free** (pure `notesRefTip === marker.intent` compare). The 14-day TTL is a
  separate constant `SYNC_STATE_MARKER_TTL_DAYS` the consumer applies against `attemptTimestamp` — C1 owns that
  check.
- **No `git pull --ff-only` helper** — `boundedFetch` (`lib/git/exec.ts`) covers the fetch leg under a timeout;
  the ff-pull execution (1.2.b) is new.
- **`session.init_pull` enum** — siblings are `worktree: ["manual","prompt"]`, `notes: ["manual","prompt",
  "always"]`; `session.init_pull.base` takes `["manual","prompt","always"]` (`always` = auto-ff).
