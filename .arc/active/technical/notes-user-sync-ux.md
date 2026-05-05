# Notes — User Sync UX Polish

> **Companion to:** `status-user-sync-ux.md` (active WU). Captures deeper context that
> doesn't fit the status file's pointer shape: per-decision rationale, audit findings,
> design alternatives considered, and residual risks carried forward.
>
> **Lifecycle:** Created during Phase 2.R planning when the audit deliverable
> destination was specified. Archives or migrates to a strategy doc at WU integration.

---

## Phase 2.R Audit Findings

_Populated during Task 2.R.5.a — Code-path audit against invariants. One row per file:
`invariant → location → status (clean | finding | TODO)`._

| File | Invariant | Location | Status |
|------|-----------|----------|--------|

_(rows added during 2.R.5.a)_

---

## Residual Risks Carried Forward

_Populated during Task 2.R.5.b — Test-surface audit + residual risk._

The following risks are intentionally out of scope for Phase 2.R; each is real and
acknowledged. Captured here so they reach a future hardening WU rather than rediscovering
them as bugs.

- **Cross-machine partial-push invisibility.** `recordPartialPushMarker` is local-only
  (`.arc/user/{identity}/.internal/.sync-state.json`, gitignored). Machine A's partial
  push leaves no signal machine B can read after `git pull`. PRD R3 ("partial-push state
  is a recognized condition on the spine") holds on the originating machine; on a sibling
  clone it currently fails silently. Closing this would require a remote-marker mechanism
  (e.g., a sibling notes ref under `refs/notes/arc/sync-state/` or a server-side hook
  contract). Defer to a future hardening WU; flag if cross-clone resume bug recurs.

- **Pull-side / load-side verification symmetry.** Phase 2.R adds save postcondition
  verification (2.R.1.a). `runUserLoad` does no symmetric postcondition check —
  `deserialize` runs and `writeLocalSyncState` advances regardless of whether the
  materialized files match the manifest. The 2026-04-24 cross-machine resume bug was
  direction confusion (already addressed by R1/R2), not corruption, so this is lower
  priority. Worth picking up in a future hardening WU for symmetry.

- **Save-verification race against sibling sessions.** If two sibling sessions on the same
  machine race on the notes ref, `writeNote` followed by readback could see content
  written by the other session. Mitigated in 2.R.1.a by comparing against the
  just-serialized manifest (in-memory), not against a re-read of the user dir or the
  remote-attached note. Confirm the comparison source during implementation. PRD R17
  (shared-ref sync-state inference for sibling sessions) covers the broader concern.

---

## Design Decisions

_Append as decisions worth preserving across implementation._

### Verification-failure no-rollback (2.R.1.a)

`runUserSave` does **not** delete the just-written note on verification failure.
Rationale: the protective gate is "sync-state never reflects an unverified write," not
"no note exists without verification." Next save overwrites cleanly via `writeNote`'s
replace semantics. A delete code path would be its own bug surface (what if delete
fails?). Decision committed before implementation; confirmed during pre-implementation
audit.

### Save-before-push placement (2.R.2.a)

Save lives **inside `runPairedPush`**, not in a separate orchestrator-level pre-step or a
wrapper. Per PRD R5: the paired path saves the current user directory to `HEAD` before
pushing the notes ref. Single boundary, single owner. The orchestrator does not call
`runUserSave` separately for the paired cell.

### Blocked-cell save invariant (2.R.2.b)

Save fires in **every** blocked sync cell **except** rebase-in-progress. Detached HEAD
saves anyway (notes-discovery walk finds the note later regardless of branch);
rebase-in-progress skips because HEAD is mid-step and notes won't follow the rewrite.
Symmetric with the existing R15 `save+notes-blocked` path; the prior asymmetry between
`skip-blocked-diverged` (no save) and R15 (save) was the bug.

### Worktree-push helper extraction (2.R.2.c)

`pushWorktreeBranch` extracted in `lib/git/` consumed by both
`handlers/sync.ts:executeSingleLeg` and `commands/user/paired-push.ts:pushWorktreeLeg`.
Helper is the swappable seam for `plan-interlock-release-wrappers.md` WU1's
`arc release push`. Kept at internal scope (not exported from `lib/git/index.ts`) until
the wrapper WU consumes it — avoids premature public-surface commitment.

### Self-host guard shape (2.R.4.a)

In-CLI dev-mode stale-build check under a `__DEV__` flag, plus a brief
CONTRIBUTING/README note. Adopters never see it (published package skips). Rejected
alternatives: dedicated wrapper (overkill — ships infrastructure adopters don't need);
pure-docs (doesn't catch the failure mode mechanically — Phase 2.R itself was added
because docs proved insufficient against the very gap they were supposed to prevent).

### `--yes` semantics (2.R.2.d)

Auto-accept default-yes prompts only. `notes_push: prompt` degrades to `always`;
`pushWithInteractiveRecovery` recovery prompts auto-accept the safe default; force-push
and other destructive defaults always refuse with guidance. Matches `handleUserPull`'s
`shouldSkipOverwriteConfirm(yes)` convention.

---

## Open Items Surfaced During Pre-Implementation Audit

_Append as audit work uncovers items needing later resolution._

- _(none yet — populated during 2.R.5.a / 2.R.5.b)_

---
