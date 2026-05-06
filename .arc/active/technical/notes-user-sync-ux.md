# Notes — User Sync UX Polish

> **Companion to:** `status-user-sync-ux.md` (active WU). Captures deeper context that
> doesn't fit the status file's pointer shape: per-decision rationale, audit findings,
> design alternatives considered, and residual risks carried forward.
>
> **Lifecycle:** Created during Phase 2.R planning when the audit deliverable
> destination was specified. Archives or migrates to a strategy doc at WU integration.

---

## Phase 2.R Audit Findings

_Populated during Task 2.R.6.a — Code-path audit against invariants. One row per
(file, applicable invariant); files with no applicable invariants get a single
`(no applicable invariants)` row. Status legend: `clean` (invariant met),
`finding` (active gap to fix), `TODO` (residual already tracked or out-of-scope
note carried forward)._

**Invariants:**

- I1 — Verified save before sync-state advance (2.R.1.a)
- I2 — No JSON contamination (2.R.2.d, 2.R.4)
- I3 — No raw worktree-push bypass (2.R.2.c)
- I4 — No clean-but-stale hidden state (2.R.1.c)
- I5 — No misleading no-op copy (2.R.1.b)
- I6 — Blocked-cell save invariant (2.R.2.b)
- I7 — Force-push advisory refused at every call site (2.R.2.c)

**Scope summary:** 25 files audited (5 handlers, 9 `commands/user/`, 9 `lib/git/`,
2 `lib/sync-*`). 0 active findings against 2.R invariants. 2 TODOs carried
forward (both pre-existing residuals or out-of-scope CLI-surface gaps).

**Audit method:** Read each file in full; identified which invariants the file
enforces, exposes, or defers; recorded location (symbol + line) and status. Choke
points (the file that owns enforcement of an invariant) are flagged.

| File | Invariant | Location | Status |
| ---- | --------- | -------- | ------ |
| `handlers/sync.ts` | I1 | `performSave` (~752); `executePaired` → `runPairedPush` (~458) | clean — defers to `runUserSave`/`runPairedPush` |
| `handlers/sync.ts` | I2 | `output: SyncOutput` threaded throughout; JSON stdout writes only at ~224, ~295-296, ~321-322, ~832-833; `emitErrorEnvelope` (~826-835) | clean |
| `handlers/sync.ts` | I3 | `executeSingleLeg` uses `pushWorktreeBranch` (~647); paired path delegates to `runPairedPush` | clean |
| `handlers/sync.ts` | I6 | `executeBlockedWorktree` saves (~419); `save+notes-blocked` saves (~671); `executeRebaseBlocked` skips save per documented exception (~387-395) | clean |
| `handlers/sync.ts` | I7 | Paired flow refuses via `runPairedPush`; single-leg notes via `pushWithInteractiveRecovery` | clean |
| `handlers/user-sync.ts` | I1 | `handlePushDirection` calls `runUserSave` (~351) before `pushWithInteractiveRecovery` (~384); `degradeConflictToSaveOnly` saves (~220) | clean |
| `handlers/user-sync.ts` | I2 | Command lacks `--json`; uses raw `p.log.*`; passes `createSyncOutput(false)` to recovery (~390) | clean (no JSON contract surface today) |
| `handlers/user-sync.ts` | I5 | Defers no-op rendering to `pushWithInteractiveRecovery` | clean |
| `handlers/user-sync.ts` | I6 | `local unsaved` routes to "push" (preserves disk); conflict in non-interactive env degrades to save-only (~178-181) | clean |
| `handlers/user.ts` | I1 | `handleUserSave` → `runUserSave` (~99); verification lives in helper | clean |
| `handlers/user.ts` | I2 | `handleUserStatus --json`: identity-resolution failure under `--json` writes a clack error block to stdout (via `isHandledError` → `p.log.error`) and returns with no JSON envelope (~438-440); same gap on `requireArcProjectRoot` (~444). Two failures: stdout contamination + missing-on-error envelope | finding — addressed in 2.R.6.a.2 |
| `handlers/user.ts` | I5 | `handleUserPush` delegates to `pushWithInteractiveRecovery` | clean |
| `handlers/user.ts` | I7 | `--force` path is explicit user opt-in, bypasses recovery (~200-225) | clean (intentional escape hatch; advisory contract covers automatic pushes) |
| `handlers/push-recovery.ts` | I1 | Merge-recovery branch re-saves on top of fetched base (~136-141) before push; verification inside `runUserSave` | clean |
| `handlers/push-recovery.ts` | I2 | Spinner via `output.spinner()` (~80, ~170-171); stale-local warn routes through `output.log` (~209-212); `promptConflictResolution` (~185-199) uses raw `p.log.warn` + `p.select` | TODO — residual already documented in § Design Decisions (gated by `isNonInteractiveEnvironment()` which short-circuits before clack fires under JSON mode) |
| `handlers/push-recovery.ts` | I5 | `pushResult.kind === "noop"` reports "Remote user notes already match local user notes" then `warnIfLocalNoteStaleForHead` (~84-88, ~201-213) | clean (2.R.1.b choke point) |
| `handlers/push-recovery.ts` | I7 | Advisory routed via `runUserPush` pushability pre-check; force-push only on explicit prompt selection (~116-124) or `--yes` does not auto-select force (~108-110) | clean |
| `handlers/status.ts` | I2 | `--json` writes via `process.stdout.write` (~146, ~163, ~181); errors via `process.stderr.write` (~89-91, ~139-141); mutually-exclusive flag error skips envelope (~88-94) | clean (CLI-misuse error only; runtime probes always emit envelope) |
| `handlers/status.ts` | I4 | Routes `runUserSessionInitStatus` (~108, ~154) which carries `localNoteFreshness` to session-init consumers | clean |
| `commands/user/save-load.ts` | I1 | `runUserSave` ordering: `writeNote` → `verifySavedNote` → `writeLocalSyncState` (~66-68); verification compares hash of just-serialized manifest vs readback (~203-209); on failure `UserSaveVerificationError` throws and sync-state never advances | clean (2.R.1.a choke point) |
| `commands/user/save-load.ts` | I4 | `findNearestUserNote` returns full freshness fields (`reachableFromHead`, `ancestorDistance`, `noteHistoryDistance`) for caller rendering | clean |
| `commands/user/save-load.ts` | I5 | `recordPartialPushMarker`/`clearPartialPushMarker` carry the partial-push state used by no-op gating | clean |
| `commands/user/save-load.ts` | (residual) | `runUserLoad` does no symmetric postcondition check (~155-157) | TODO — already documented in § Residual Risks (load-side verification symmetry; deferred to future hardening WU) |
| `commands/user/paired-push.ts` | I1 | `saveUserDirectory` → `runUserSave` (~81, ~134); save fires only after pushability allowed | clean |
| `commands/user/paired-push.ts` | I3 | `pushWorktreeBranch` (~92); no raw `git push` | clean |
| `commands/user/paired-push.ts` | I6 | Pushability pre-check (~60-65); save-before-push (~81-91); save skipped only on pre-check block (consistent with rebase-in-progress exception) | clean |
| `commands/user/paired-push.ts` | I7 | `refusedByAdvisory` check (~67-78); paired flow refuses on `force-push-required` advisory before save fires | clean (2.R.2.c choke point) |
| `commands/user/push-fetch.ts` | I5 | `runUserPush` noop detection via local-vs-remote ref-hash compare (~50-58); partial-push marker cleared on noop | clean |
| `commands/user/push-fetch.ts` | I7 | Pushability pre-check on `target: "notes"` (~37-42); `worktreeBranch` triggers `worktree-not-aligned-with-origin` block; `force-push-required` advisory not refused at this site — divergent push instead routes through [rejected] path in `push-recovery.ts` | clean (single-leg pattern; advisory-refusal-everywhere applies to paired path per task 2.R.2.c text) |
| `commands/user/sync-status.ts` | I4 | `inspectSessionLocalNoteFreshness` (~187-215); `shouldWarnStaleLocalNote` (~406-411); session-init "clean" branch surfaces stale-action (~329-345); `renderSessionLocalNoteFreshness` (~413-436) | clean (2.R.1.c choke point) |
| `commands/user/shared.ts` | (none) | `notesRef` only | clean |
| `commands/user/add.ts` | (none) | `runUserAdd` provisions templates; not on sync surface | clean |
| `commands/user/format.ts` | (none) | Pure summary builders for save/load/status | clean |
| `commands/user/relative-time.ts` | (none) | `formatRelativeTime` formatter | clean |
| `commands/user/types.ts` | (none) | Type / error class definitions; `UserSaveVerificationError` and `UserPushBlockedError` declared here | clean |
| `lib/git/pushability.ts` | I7 | `force-push-required` advisory definition site (~143-151); preamble documents caller-refusal contract (~14-20) | clean (definition site) |
| `lib/git/push-worktree.ts` | I3 | `pushWorktreeBranch` is the sole `git push origin <branch>` worktree call site (~44); not re-exported from `lib/git/index.ts` per design (~14-15) | clean (2.R.2.c choke point) |
| `lib/git/push-worktree.ts` | I7 | Preamble documents that pushability gating is the caller's responsibility (~11-12) | clean |
| `lib/git/worktree-sync.ts` | (none) | Read-only state probe; returns explicit states for caller interpretation | clean |
| `lib/git/user-sync.ts` | (none) | Pure (de)serialization with allowlist + size cap; path-traversal guard in `deserialize` | clean |
| `lib/git/dirty-state.ts` | (none) | Porcelain probe | clean |
| `lib/git/exec.ts` | I3 | No raw `git push` neighbors; `configureNotesRefspec` only configures fetch refspec | clean |
| `lib/git/head-hash.ts` | (none) | HEAD short-hash probe | clean |
| `lib/git/identity.ts` | (none) | Identity slug + resolution | clean |
| `lib/git/index.ts` | I3 | Barrel deliberately omits `pushWorktreeBranch` re-export (internal scope) | clean |
| `lib/sync-output.ts` | I2 | Under `jsonMode: true`: `intro/outro/note/log.info/spinner` no-op; `log.warn/error` stderr-only; `confirm` resolves to `false`; `isCancel` returns `false` (~57-88) | clean (2.R.4 choke point) |
| `lib/sync-policy.ts` | I2 | `warn` callback caller-controlled; `handlers/sync.ts` routes via `output.log.warn` (~260); `handlers/user-sync.ts` uses raw `p.log.warn` (~336) — fine today since `arc user sync` lacks `--json`; latent risk if `--json` is added later without threading `output` here | finding — addressed in 2.R.6.a.3 |

---

## Residual Risks Carried Forward

_Populated during Task 2.R.6.b — Test-surface audit + residual risk._

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

### Self-host guard shape (2.R.5.a)

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

### `pushWithInteractiveRecovery` output routing (2.R.3.c.1)

`pushWithInteractiveRecovery` accepts a required `output: SyncOutput` parameter
rather than defaulting to raw `@clack/prompts`. Rationale: the helper has zero
external consumers (two call sites in `handlers/sync.ts`, plus `handleUserSync`
and `handleUserPush`) — there is no back-compat surface to preserve, and a
silent fallback to clack would re-introduce the JSON-mode contamination class
the test in 2.R.3.c.1 was added to catch. Sync paths pass their existing
`SyncOutput` (no-op spinner under JSON mode); user-mode callers pass
`createSyncOutput(false)` for clack passthrough.

Local `runRoutedSpinner` in `push-recovery.ts` mirrors `shared.ts`'s
`runWithSpinner` so the conflict-recovery branches route their spinners through
`output` too. Kept inline rather than refactoring the shared helper — its other
consumers are human-mode handlers that don't have a `SyncOutput` in scope.

**Residual risk carried forward.** `promptConflictResolution` still uses
`p.log.warn` + `p.select` directly. Both are gated by
`isNonInteractiveEnvironment()` which short-circuits to `"non-interactive"`
before either clack call fires in any subprocess context, so they are
dead-code under JSON mode today. If that gate is ever removed or weakened,
route them through `output` too — the 5-cell purity test won't catch it
because no test cell triggers an actual notes conflict.

---

## Open Items Surfaced During Pre-Implementation Audit

_Append as audit work uncovers items needing later resolution._

- _(none open — items surfaced by the audit are tracked as 2.R.6.a.2 / 2.R.6.a.3
  and addressed inline rather than deferred.)_

---
