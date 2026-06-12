# Notes: merge-safety-mechanism

## Contents

- Grounded extension points (per design component)
- Shipped-primitive inventory: compose vs. net-new
- Cross-WU contract surface

## Grounded extension points

Verified against the codebase at spec time; line anchors are approximate and may drift — re-confirm during the
task-generation grounding pass.

### Behind-base primitive + probe slot (Proposed Design 1)

- `lib/git/worktree-sync.ts` — `countAheadBehind` (private, ~L196) runs
  `git rev-list --left-right --count HEAD...origin/<branch>`, hardcoded to the branch's own upstream. Extract +
  export as `countAheadBehindRef(exec, localRef, remoteRef)`; `runWorktreeSyncStatus` (~L84) becomes one caller of
  the extracted body (no duplicated distance logic).
- `WorktreeSyncState` enum (~L35): clean / remote-ahead / local-ahead / diverged / no-upstream / detached-head /
  no-remote / branch-gone / remote-unavailable / skipped. `WorktreeSyncStatusResult` (~L47):
  {state, ahead, behind, branch, failureReason?}.
- `recommendedAction` / `recommendedPromptText` are NOT on the sync result — the session-init orchestrator adds
  them: `lib/session-init/recommended-action.ts` `inferWorktree(...)` returns the ChannelRecommendation;
  `SessionInitWorktreeValue` (`commands/status/types.ts` ~L55) extends the result with them + identity. Shape the
  new probe slot the same way.
- New probe slot wiring: add a `Probe<T>` field to `SessionInitProbeResult` (`commands/status/types.ts` ~L113), an
  entry to `SessionInitProbes` (~L327), fan-out in `runSessionInitStatus` (`commands/status/run.ts` ~L202+), and an
  I/O binding in `handlers/status.ts` (~L267 probes object). Synthetic cross-slot fields (cf.
  `recommendedCombinedPrompt`, ~L385) are set at return time.

### Write-context extensions (Proposed Design 3)

- `lib/git/write-context.ts` — `classifyWriteContext(input)` is pure (~L70), single axis today
  (`currentBranch === baseBranch` → proceed / relocate / refuse). `WriteContextInput` (~L53):
  {currentBranch, baseBranch, primaryWorktreePath}. `resolveWriteContext` (~L98) is the I/O wrapper. Only one
  production caller today: `handlers/housekeep.ts:36`.
- Path-surface dimension → add a field to `WriteContextInput` + the verdict. chore-awareness → call
  `errandSlugOf(currentBranch)` from `lib/session-init/errand-branch.ts` (pure; `ERRAND_BRANCH_PREFIX = "chore/"`)
  inside `classifyWriteContext` — zero new I/O, the branch string is already an input.
- Foreign-write detection exists: `lib/git/foreign-artifact-detection.ts` — `detectForeignArtifactOverlap(opts)` +
  `projectInFlightToOverlapRoster(entries)`. Scoped to the errand advisory gate today; no pre-commit call path
  exists, so the pre-commit backstop needs a new hook-side `npx tsx` entrypoint.

### Hooks (Proposed Design 3 + 4)

- Husky delegates: `.husky/commit-msg` → `bash .arc/system/.internal/githooks/commit-msg "$1"`; `.husky/pre-commit`
  → `bash .arc/system/.internal/githooks/pre-commit` (plus `check-package-sync.sh`, `check-ts-quality.sh`).
- Canonical hook bodies live at `.arc/system/.internal/githooks/{commit-msg,pre-commit}`, mirrored in
  `packages/arc-framework/arc/system/.internal/githooks/` — BOTH copies change under the two-copy package-project
  sync discipline.
- commit-msg: 6 sequential rules. Rule 4 footer kinds recognize task-list / draft+spec / meta-lifecycle /
  standalone / contribution / "incidental during". `integration` appears only inside the meta-*.md lifecycle set
  (~L279), not as a standalone kind. Merge exemption insertion: right after the `hook_enabled` early-exit (~after
  L35), before Rule 1 — `git rev-parse -q --verify MERGE_HEAD` → exit 0. New standalone `integration` kind: a new
  elif in Rule 4 (~L298-305).
- pre-commit: CHECKs accumulate errors and can fail the commit. CHECK 15 = extension-point scan (`point-scanner.ts`
  via `validate-extension-points.ts`); CHECK 16 = meta `Design:` field shape (`validate-meta-spec.ts`); CHECK 18 =
  cohort-consistency (~L508). New write-context backstop = a CHECK after 18, before the Summary block (~L524);
  pattern: stage-filter + `npx tsx` validator. NOTE: this check must WARN (advisory), unlike its erroring siblings.

## Shipped-primitive inventory: compose vs. net-new

- **Net-new this WU:** `countAheadBehindRef` (extraction), the base-distance probe slot, the patch-equal
  supersession detector + force-push advisory, the write-context path-surface + chore dimensions, the pre-commit
  foreign-write backstop entrypoint, the commit-msg merge exemption + standalone `integration` footer kind.
- **Composed (shipped):** the worktree-sync distance body, the session-init probe-assembly pattern,
  `classifyWriteContext`, `errandSlugOf`, `detectForeignArtifactOverlap`, the husky / githooks harness.

## Cross-WU contract surface

The behind-base primitive + probe slot is the sub-cohort's shared contract:

- `cross-machine-sync-coherence` extends it (its `baseBranchSync`: local-base-ref subject, `session.init_pull.main`,
  the cross-machine layer) — that extension is the sibling's, not this WU's.
- `async-merge-lifecycle` reuses it in its `Integrating`-state completion sweep for behind-base classification.

Keep the primitive ref-parameterized and the probe slot worktree-channel-shaped so neither sibling double-builds.
