# Task List: User Sync UX Polish

- **PRD:** `prd-user-sync-ux.md`
- **Branch(es):** `technical/user-sync-ux`
- **Base Branch:** `main`

- **Purpose:** Polish the user-notes sync surface — collapse dual state machines, align config and command vocabulary,
  and pin coherence guarantees that prevent cross-machine resume bugs and partial-push hazards.

---

## **Phase 1:** State-machine foundation

_Purpose:_ Unify the diagnostic spine. R1 single state computation, R2 notes-ref-history discovery, R3 partial-push
state, R6 directional copy audit, R7 worktree qualifier `failureReason`. Foundation that Phase 2's coherence work builds
on. PRD-pinned ordering: notes-discovery (1.1) precedes spine unification (1.2) — unification builds on the new load
semantic.

### `[x]` **1.1 Notes-ref-history discovery walk**

- `arc user load` and `arc user pull` now discover the newest readable user-note attachment by walking
  `refs/notes/arc/user/{identity}` history instead of HEAD ancestry.
- `--max-walk N` bounds note-ref history commits. Load/search results carry annotated-commit reachability and
  note-history distance for downstream routing work.
- Status and load summary copy no longer treats notes attached outside current HEAD ancestry as current with HEAD.
- Coverage added for outside-HEAD ancestry, branch-gone local refs, shallow clones, deleted latest note entries, empty
  note refs, and note-ref-history walk caps.

### `[x]` **1.2 State-machine spine unification**

- `sync-status.ts` now computes a shared `UserSyncSpine` from remote-sync enablement and notes-ref topology; full
  status, session-init, and `inspectUserSyncState` consume the same spine instead of maintaining separate state/action
  switch paths.
- Full `UserStatusResult` carries `spineState`, with disk status, saved age, and note-history distance layered as detail
  axes that do not change the underlying five-state spine.
- Unit coverage pins five-state exhaustiveness, paired full/session-init agreement, layered detail axes, and
  pull-directed `remote-ahead` recovery when local disk edits are present.

### `[x]` **1.3 Partial-push state on the spine**

- Partial-push recovery is now a validated coherence axis on the shared spine. Markers persist in
  `.internal/.sync-state.json`, are validated against the current local notes ref hash, clear when stale or already
  recovered, and surface an unverified recovery condition when the remote cannot be checked.
- Sync records the marker when notes push fails after a clean worktree publish state; `arc user push` clears it on
  successful recovery or idempotent already-matching pushes.

    - `[x]` **1.3.a Coherence-condition interface**
        - Added `UserSyncCoherenceState` / `coherenceState` as a detail axis layered on the shared spine. `partial-push`
          survives only with `local-ahead` notes topology, while the session-init spine state remains `clean`. Full-mode
          status now emits explicit partial-push recovery copy and points at `arc user push` retry guidance instead of
          the generic local-ahead hint.

    - `[x]` **1.3.b Partial-push marker persistence**
        - `.sync-state.json` now stores `partialPush.localRefHash` plus `sourceCommit`. Status validates the marker
          against the current local notes ref before surfacing it, clears stale or already-recovered markers, and
          reports `partial-push-unverified` when the marker matches locally but remote comparison is unavailable.

    - `[x]` **1.3.c Push-flow marker lifecycle**
        - Sync records a partial-push marker when a notes push fails after the worktree is clean against remote.
          `arc user push` passes repository context through the push-recovery path and clears the marker after a
          successful push, including no-op pushes where the remote already matches local notes.

### `[x]` **1.4 Rendering surface pass**

- Completed the `sync-status.ts` rendering pass so comparison copy names both sides and worktree remote-unavailable
  qualifiers surface timeout vs. auth/network failure detail.

    - `[x]` **1.4.a Directional copy audit**
        - Updated `sync-status.ts` rendering so summaries and detail lines explicitly name local notes, remote notes,
          working files, and origin upstream where comparisons are reported. Shared status and sync tests now pin the
          directional copy.

    - `[x]` **1.4.b Worktree qualifier `failureReason` surfacing**
        - `formatWorktreeQualifierLine` now renders timeout-specific retry/`--offline` copy and error-specific
          auth/network investigation copy for `remote-unavailable` worktree probes. Status and sync tests cover the
          rendered failure-reason surface.

## **Phase 2:** Coherence guarantees + orchestrator surface

_Purpose:_ Prevent notes-against-unpushed-commits and partial-publish bugs; introduce the `arc sync` orchestrator that
owns cross-cutting coherence routing. R4 unpushed-HEAD save/push, R5 paired-push failure semantics, R10 command-shape
rename + orchestrator, R11 sync-interlock, R14 pushability pre-check matrix, R15 notes-push under manual worktree-push
interlock. Builds on Phase 1's unified spine for partial-push surfacing.

_Forward-compat:_ Pushability matrix (R14) and paired-push helper (R5) are extracted as reusable library APIs under
`lib/git/` so the planned interlock-release wrappers (`plan-interlock-release-wrappers.md`) call the same probes without
re-litigating Phase 2's choices. The orchestrator (`arc sync`, R10) becomes the single home for paired-push routing;
wrappers stay single-leg per the realigned wrappers plan. Ref-scope discrimination on the matrix and an exported
paired-push helper are the load-bearing shape decisions.

### `[x]` **2.1 Pushability pre-check matrix**

- New `lib/git/pushability.ts` exports `runPushabilityStatus({ exec, access, target, worktreeSyncState? })` with
  `target: "worktree" | "notes" | "both"`. Conditions split global (rebase-in-progress in either `rebase-merge` or
  `rebase-apply` form, detached HEAD) from ref-specific (no-upstream branch on worktree target; missing notes refspec on
  notes target). `force-push-required` derives from caller-supplied `worktreeSyncState === "diverged"` and surfaces with
  `disposition: "advisory"` so refusal policy lives at the call site.
- Notes-refspec condition auto-fixes via existing `configureNotesRefspec`; disposition `auto-fixed` lets the push
  proceed without caller action. Server-side classes (protected branch / pre-receive / permission denied) are not
  pre-checkable — left as verbatim push-time errors; handlers preserve the original server message.
- `runUserPush` now accepts an optional `access` seam; when provided, runs the matrix (`target: "notes"`) before the
  push and throws new `UserPushBlockedError` on block conditions. Handlers (`handlers/{user,sync,push-recovery}.ts`)
  inject `fs.access` from `node:fs/promises` and surface a new `blocked` discriminant on `PushResult` with guidance
  output. Force-flag bypass refused on environmental blocks (rebase/detached) since force doesn't resolve them.
- Session-handoff probe envelope carries a new `pushability` slot (`commands/status/{types,run}.ts` +
  `handlers/status.ts`) probed with `target: "worktree"` for handoff-time worktree push gating. Workflow-doc consumer
  wiring lands in Task 2.2.
- Pushability matrix exports re-extracted under `lib/git/index.ts` as the load-bearing reusable surface for the planned
  interlock-release wrappers.
- Tests: 8 new in `__tests__/unit/git/pushability.test.ts` covering all behaviors (happy path, both rebase forms,
  detached HEAD, both target-scope cases for no-upstream, refspec auto-configure with re-probe, force-push advisory). 1
  new envelope test in `__tests__/unit/status/run.test.ts`. Mocks updated in `push-recovery.test.ts` and
  `user-handlers.test.ts` for the new `UserPushBlockedError` export.

### `[x]` **2.2 Paired-push failure semantics**

- Worst-outcome exit code, itemized leg output, no auto-retry, idempotent recovery — all delivered via `runPairedPush`
  (2.2.a) + `arc user push` no-op (2.2.b) + the `arc sync` orchestrator (2.2.c) that owns the cross-cutting coherence
  rules.

    - `[x]` **2.2.a Exported `runPairedPush` helper**
        - New `commands/user/paired-push.ts` exports `runPairedPush` returning a `PairedPushResult` with per-leg
          `success | failed | skipped` outcomes, surfaced pushability conditions, and worst-outcome `exitCode`.
          Pre-check runs `runPushabilityStatus({ target: "both" })`; block → both legs `skipped: blocked-by-precheck`.
          Worktree-fail → notes `skipped: preceding-leg-failed`. Worktree-success + notes-fail records the partial-push
          marker; full success clears any pre-existing marker. Result types live in `commands/user/types.ts`;
          re-exported via `commands/user.ts`. Itemized-output copy lives at the handler (consumer wiring lands in
          2.2.c).
        - Tests: 4 new in `__tests__/unit/paired-push.test.ts` covering both-succeed, partial-fail with marker,
          ordering-invariant on worktree-fail, and pre-check block.

    - `[x]` **2.2.b `arc user push` idempotent no-op**
        - `runUserPush` (`commands/user/push-fetch.ts`) now probes `git ls-remote origin refs/notes/arc/user/{identity}`
          against the local ref hash before pushing; equal hashes return `{ kind: "noop" }` and clear the partial-push
          marker without firing a push. Different (or missing) hashes proceed with the push as before, also clearing the
          marker on success. `force: true` skips the probe and pushes unconditionally. New
          `UserPushResult = { kind: "pushed" | "noop" }` exposed via `commands/user/types.ts`.
          `pushWithInteractiveRecovery` propagates `noop` through `PushResult`; `handlers/{user,sync}.ts` accept it
          alongside `ok` / `ok-recovered`. Spinner doneLabel switches to "Already up to date." on no-op.
        - Tests: 3 new in `__tests__/unit/push-fetch.test.ts` (no-op clears marker; re-attempt after transient failure
          pushes and clears marker; force skips the probe). Existing `push-recovery.test.ts` updated for the new return
          shape.

    - `[x]` **2.2.c Orchestrator + workflow integration**
        - The `arc sync` orchestrator (R10) consumes the 6-cell matrix (`push_interlock × notes_push × worktree-state`),
          routes the paired cell through `runPairedPush`, and owns cross-cutting coherence (R5 partial-push, R4
          unpushed-HEAD, R15 notes-vs-worktree, diverged-worktree skip). The session-handoff workflow consults the new
          `syncInterlock` envelope slot to decide whether to auto-invoke. Three subtasks delivered the change:

            - `[x]` **2.2.c.i Command-surface restructure**
                - Renamed `arc sync` (notes-only) → `arc user sync`; `handleSync` migrated to `handlers/user-sync.ts` as
                  `handleUserSync`. New top-level `arc sync` registered against an orchestrator stub in
                  `handlers/sync.ts` that prints a "not yet implemented" notice and exits 1; dispatch lands in 2.2.c.ii.
                - Added `session.sync_interlock` to TS schema (`lib/config/status-reader.ts`,
                  `commands/config/types.ts`, `commands/config/status.ts` SESSION_INIT_KEYS) and shell validator.
                  Default `on-handoff`. Migrated `session.push_interlock` enum value `on-handoff` → `on-sync` everywhere
                  — TS reader, shell validator, `HandoffPushInterlock` type union, both `arc-config.yml` copies.
                  Project's on-disk value carried forward to `on-sync`.
                - Help text: `arc --help`, `arc user --help`, and `arc sync --help` now cross-reference per spec.

            - `[x]` **2.2.c.ii Orchestrator dispatch + matrix routing**
                - `handleSync` (`handlers/sync.ts`) rewritten from c.i stub. Probes identity, config (`push_interlock`,
                  `remote_sync`), worktree sync state, notes-push policy (`resolveSyncPushPolicy`), and current branch
                  in parallel; routes through pure `decideMatrix` returning per-leg actions + cell name. Paired cell
                  (`on-sync × always`) calls `runPairedPush`; worktree-only, notes-only-with-R15, save-only, and prompt
                  cells dispatch single-leg via direct `git push origin <branch>` + `runUserSave` +
                  `pushWithInteractiveRecovery`.
                - Coherence overlays: `worktree-state === "diverged"` + `push_interlock: on-sync` short-circuits to
                  "Reconcile required:" surface with both legs reported as `blocked`. R15 (notes auto-push or prompt
                  under manual worktree push) treats local-ahead/diverged/remote-ahead worktree as a block reason —
                  notes save fires, push surfaces guidance, exitCode 1. Force-push refusal lives in `runPairedPush`'s
                  pre-check (matrix advisory at handoff).
                - `--dry-run` prints cell name + per-leg action descriptions (`describeWorktreeAction` /
                  `describeNotesAction`) without invoking save or push. `--json` emits structured envelope (cell,
                  worktree leg, notes leg, exitCode, optional reconcile block) for handoff-workflow consumption;
                  human-readable path remains the default.
                - Non-interactive prompt-policy degrades to `manual` before matrix dispatch (parity with
                  `arc user sync`).
                - Affected files: `packages/arc-framework/src/handlers/sync.ts` (rewrite);
                  `__tests__/unit/sync-orchestrator.test.ts` (new — 7 tests). Extraction to
                  `commands/sync/orchestrator.ts` deferred — matrix logic stayed inline at ~60 LOC of pure decision; not
                  enough surface to warrant a separate module.
                - Tests: 7 new in `__tests__/unit/sync-orchestrator.test.ts` covering all seven listed behaviors.
                  Behaviors batched per test-first batching judgment (single handler, shared mock setup).

            - `[x]` **2.2.c.iii Workflow markdown rewrite**
                - `session-handoff.md` Push Sequence section collapsed to a single Sync section gated on
                  `syncInterlock.value`: `on-handoff` invokes `arc sync --json` and consumes the structured output;
                  `manual` skips and surfaces unpushed state from the envelope. Worktree-push and Notes-push subsections
                  retired — matrix dispatch lives in the orchestrator. Push-ordering invariant collapsed to a one-line
                  strategy-doc reference.
                - Confirm Handoff section split into two read paths: `arc sync` ran (read JSON envelope's `cell` /
                  `reconcile`) vs. `arc sync` skipped (read `worktree` slot from probe envelope). New `**Sync:**`
                  outcomes: `synced to remote`, `sync failed`, `skipped (sync_interlock: manual)`,
                  `skipped (no identity)`. Identity-absent fallback added explicitly.
                - Resolve Handoff Context table updated: `syncInterlock` row added; existing `pushInterlock` /
                  `syncPush` rows reframed as `arc sync`-internal diagnostics (no longer consulted by the workflow
                  itself).
                - **Scope expansion (in-scope per design):** Added `syncInterlock` slot to the session-handoff envelope
                  to make the workflow gate read coherently. Touches `commands/status/types.ts`, `commands/status.ts`
                  (barrel), `handlers/status.ts`, `commands/status/run.ts`, plus updates to
                  `__tests__/unit/status/run.test.ts` (slot list, parallelism count → 8, sibling-error coverage,
                  dedicated probe test).
                - Affected files (this task): `.arc/system/workflows/arc/session-lifecycle/session-handoff.md` +
                  `packages/arc-framework/arc/.../session-handoff.template.md` (mirror); envelope expansion files listed
                  above.
                - Tests passed: full Tier 2 (markdown lint, ts/sh lint, typecheck, typecheck:test, unit + integration +
                  e2e — 1203 + 49). Manual handoff dry-run deferred to first real handoff session.

### `[x]` **2.3 Unpushed-HEAD save/push behavior**

- New `worktree-not-aligned-with-origin` condition kind in `lib/git/pushability.ts` (disposition `block`) probes HEAD
  vs. `origin/<branch>` via local-only `git rev-list --left-right --count` — no remote round-trip. State-specific
  guidance for `local-ahead` / `behind` / `diverged`; probe failure silently skips the gate (no-regression direction).
  Gate fires only on `target: "notes"`; `target: "both"` suppresses since the paired-push flow commits to pushing the
  worktree leg first.
- `UserPushOptions.worktreeBranch` threads the resolved branch through `runUserPush`. New `resolveCurrentBranchName`
  helper in `handlers/shared.ts` centralizes `git rev-parse --abbrev-ref HEAD` resolution; consumed by
  `handlers/user.ts` and `handlers/user-sync.ts`. `pushWithInteractiveRecovery` signature switched from positional args
  to an options object so callers can attach the branch alongside `access` without extending the parameter list further;
  `handlers/sync.ts` reuses the existing `ctx.branch`.
- `force: true` doesn't bypass the alignment gate — force is scoped to notes-ref divergence.
- Tests: 7 new in `__tests__/unit/git/pushability.test.ts` (clean / local-ahead / behind / diverged / paired-suppression
  / no-branch / probe-failure); 1 in `sync.test.ts` (B6); 2 in `user-handlers.test.ts` (B3, B4). `push-recovery.test.ts`
  and `integration/user.test.ts` updated for the options-object signature. Save-side regression-fence (B1, B2) covered
  by unchanged save behavior — `runUserSave` does no remote/worktree probing.

### `[x]` **2.4 R15 cell coverage + reconciliation guidance polish**

- Three new cells in `__tests__/unit/sync-orchestrator.test.ts` cover
  `push_interlock: manual × notes_push: always × worktree-state` for clean (notes-only cell fires save + push), diverged
  (save fires, notes push blocked), and remote-ahead (save fires, notes push blocked). 10 tests total in the file.
- New `reconcileGuidance(state)` helper in `handlers/sync.ts` replaces the single-message warning in
  `executeSingleLeg`'s `save+notes-blocked` branch. Diverged emits "Manual rebase or merge needed"; remote-ahead emits
  "Fast-forward (`git pull --ff-only`)"; `local-ahead` retains the existing "push the worktree first" wording.

## **Phase 2.R:** Sync remediation and robustness

_Purpose:_ Correct the Phase 2 sync-contract gaps found during cross-machine handoff analysis before vocabulary/config
work resumes. This phase hardens save verification, freshness reporting, orchestrator routing, machine-readable output,
disk-vs-note direction inference, status messaging, and the self-hosted CLI path so Phase 3+ work builds on a reliable
`arc sync` contract.

_Forward-compat:_ Phase 2.R extracts a `pushWorktreeBranch` helper in `lib/git/` that the orchestrator and paired-push
consume — `plan-interlock-release-wrappers.md` (WU1) swaps the implementation when wrappers ship, without re-extracting
from raw `git push` call sites. The `arc sync --json` envelope gains an `interlockState` field for wrapper audit-log
composition. The cross-clone test harness (`__tests__/helpers/multi-clone.ts`) is built as a reusable seam —
`plan-coord-probe.md` inherits it for branch-gone signal coverage.

### `[x]` **2.R.1 Verified save and freshness surfaces**

- _Goal:_ Save, push, and status surfaces cannot report success or "clean" when current-`HEAD` user notes were not
  actually saved or the latest local note is stale.

    - `[x]` **2.R.1.a Save postcondition verification**
        - `runUserSave` now verifies an exact-`HEAD` note readback before advancing `.sync-state.json`; missing,
          invalid, or mismatched readback throws `UserSaveVerificationError` while leaving the written note for the next
          save to replace cleanly.
        - `LocalSyncState` v2 preserves optional `verifiedAt` on verified saves, with normalized hash comparison between
          the just-serialized manifest and the readback manifest rather than a second user-dir serialization.
        - Unit coverage pins write failure, missing readback, invalid JSON, hash mismatch, and verified sync-state
          behavior; the user integration helper now initializes temp working and bare repos on `main` to match the
          branch assumptions in real-git tests.

    - `[x]` **2.R.1.b Stale-local no-op push copy**
        - `pushWithInteractiveRecovery` now reports the no-op comparison as remote user notes matching local user notes,
          then checks the latest local note against `HEAD` before returning.
        - When the matching local/remote note is attached to an ancestor of `HEAD`, the push path warns that handoff
          needs `arc user save` or `arc sync`; unit and real-git integration coverage pin the stale-local warning while
          preserving no-op behavior.

    - `[x]` **2.R.1.c Session-init/handoff stale freshness detail**
        - Session user probes now expose `localNoteFreshness`, preserving the five-state ref-topology verdict while
          distinguishing missing, current-HEAD, ancestor, and outside-ancestry local notes.
        - Clean matching-ref session results warn with save/sync handoff guidance when the latest local note is attached
          to an ancestor of `HEAD`; unit coverage pins both the session-init user result and handoff envelope, with
          real-git coverage for session-init freshness.

- _Outcome:_ Save now verifies exact-`HEAD` note readback before advancing sync-state; no-op push and session status
  surfaces distinguish matching refs from current-`HEAD` freshness and warn before handoff when the latest local note is
  stale.

### `[x]` **2.R.2 Sync orchestrator execution contract**

- _Goal:_ Every `arc sync` matrix cell preserves local state, gates unsafe pushes consistently, and emits
  machine-consumable output in JSON mode.

    - `[x]` **2.R.2.a Paired-cell save-before-push**
        - `runPairedPush` now saves the user directory to `HEAD` with `runUserSave` before either push leg fires. Save
          failure returns a `save-failed` paired result and skips both worktree and notes pushes.
        - The orchestrator reports paired save failure as a structured save failure in JSON output, while keeping save
          ownership inside the paired helper. Unit coverage pins save-before-push ordering and no-push-on-save-failure;
          E2E coverage verifies `arc sync` leaves a readable `HEAD` user note on a default clean-worktree setup.

    - `[x]` **2.R.2.b Blocked-cell local-save invariant**
        - Blocked sync cells now save the current user directory before refusing notes push, including diverged,
          remote-ahead, no-upstream, remote-unavailable, detached-HEAD, and local-ahead/manual paths.
        - Rebase-in-progress is the explicit exception: save is skipped with guidance to complete or abort the rebase
          before saving. JSON output now reports save and blocked push outcomes as separate envelope legs so callers can
          distinguish preserved local state from refused remote publication.

    - `[x]` **2.R.2.c Worktree-leg pushability/state gate + helper extraction**
        - Extracted `pushWorktreeBranch` in `lib/git/push-worktree.ts` (internal scope; not re-exported from
          `lib/git/index.ts`). Both `handlers/sync.ts` `executeSingleLeg` and `commands/user/paired-push.ts` consume it,
          removing the last raw `git push origin <branch>` call sites in the sync surface.
        - `runPushabilityStatus` now runs the alignment probe on `target: "worktree"` as well as `target: "notes"`;
          `target: "both"` continues to suppress (paired-push resolves alignment by pushing worktree first). Single-leg
          worktree push call sites can refuse on `worktree-not-aligned-with-origin` without re-deriving from the
          worktree-sync state machine.
        - Paired notes leg now routes through an injected `PairedPushNotesPusher` delegate wired to
          `pushWithInteractiveRecovery` in `handlers/sync.ts`. `commands/user/` stays Clack-free; the paired flow
          inherits conflict recovery, idempotent no-op detection, and pre-check refusal symmetric with single-leg
          `arc user push`.
        - `runPairedPush` refuses on `force-push-required` advisory disposition (defense-in-depth — `decideWorktree`
          already routes diverged worktrees to `executeBlockedWorktree` upstream). Refusal contract documented in
          `pushability.ts` preamble so push wrappers inherit it.
        - Coverage: new `push-worktree.test.ts`; `pushability.test.ts` extended with `target: "worktree"` alignment
          cases (clean / local-ahead / behind / diverged / probe-failure / branch-omitted / no-upstream-precedence);
          `paired-push.test.ts` updated for the injected delegate and covers force-push advisory refusal plus all
          notes-pusher outcome variants (success / noop / ok-recovered / cancelled / no-remote / failed-nontty-conflict
          / blocked / failed).

    - `[x]` **2.R.2.d JSON contract and `--yes` semantics**
        - _Goal:_ Pin the `arc sync --json` envelope as a stable machine-readable contract — single object on stdout,
          every return path emits, structural parity across runtime and dry-run, `interlockState` exposed for downstream
          consumers — and wire `--yes` through matrix dispatch with safe-default prompt degradation.

            - `[x]` **2.R.2.d.1 `interlockState` envelope field**
                - `InterlockState` type added in `handlers/sync.ts`; `handleSync` reads `session.sync_interlock`
                  (defaulting to `"on-handoff"`) and attaches `{ pushInterlock, notesPush, syncInterlock }` to the
                  `SyncOutcome` envelope once at the boundary via an `ExecutedOutcome` inner type, so per-cell builders
                  stay focused on leg outcomes.
                - `notesPush` reports the resolved policy after non-interactive degradation, not the raw config, since
                  the resolved value is what drove behavior. Authorize-by-invocation per PRD R10 — `syncInterlock` is
                  reported but not acted on.
                - Existing paired / blocked / diverged / rebase envelope assertions extended with `interlockState`; two
                  focused tests added for non-default `sync_interlock` propagation and resolved-`notesPush` reporting
                  under non-interactive prompt degradation.

            - `[x]` **2.R.2.d.2 Dry-run shape parity**
                - Replaced `renderDryRun`'s divergent JSON shape with a `buildDryRunOutcome` helper that returns an
                  `ExecutedOutcome` from the matrix decision alone. `handleSync`'s dry-run branch attaches
                  `interlockState` + `mode: "dry-run"` at the boundary, identical to the runtime path. Human render
                  stayed on `renderDryRunHuman` (unchanged log output).
                - `mode` is an optional `"dry-run"` field on `SyncOutcome` — present only in dry-run envelopes, absent
                  in runtime. Consumers can detect dry-run by presence without branching on enum values.
                - Leg `result` is uniformly `"skipped"` with `detail: "dry-run"`; action labels predicted from the
                  decision (paired flow → `save+push`; single notes-only / save+prompt → `push`; save-only → `save`).
                  `save` field appears for blocked-worktree and notes-blocked cells (the runtime cells that fold save
                  into a separate record); `reconcile` populated for diverged-worktree cells.
                - Tests: four new cases assert envelope parity across paired-push, blocked-diverged (reconcile + save
                  present), save-only (minimal), and notes-blocked (save present, would-be push action). Existing human
                  dry-run test unchanged.

            - `[x]` **2.R.2.d.3 stdout purity under `--json`**
                - New `lib/sync-output.ts` exports `createSyncOutput(jsonMode)` returning a `SyncOutput` (intro / outro
                  / log.\* / note / spinner / confirm / isCancel). Human mode passes through to `@clack/prompts`; JSON
                  mode no-ops decorations (intro / outro / spinner), routes diagnostics through `process.stderr.write`,
                  and short-circuits `confirm` to `false`.
                - `handlers/sync.ts` removed its direct `@clack/prompts` import; ~30 call sites swapped to
                  `ctx.output.*` via a new `output: SyncOutput` field on `ExecuteContext`. `renderPairedResult` /
                  `renderPairedNotesOutcome` / `renderDryRunHuman` gained an `output` parameter. The prompt-policy
                  degradation gate also fires under `opts.json === true` so the save+prompt cell can never enter under
                  JSON mode (defense-in-depth alongside the no-op confirm).
                - Tests: rebase-in-progress assertion shifted from `mockLog.warn` to stderr-spy; new
                  `--json stdout-purity contract` describe with three cases — exactly-one JSON write with zero Clack
                  mock calls; prompt- policy degradation under `--json` (no `confirm`, stderr carries degradation
                  warning); non-JSON regression guard preserving Clack intro/outro. Subprocess-level purity is owned by
                  2.R.3.c.

            - `[x]` **2.R.2.d.4 Error-path envelope coverage**
                - `handleSync` now catches `UserFacingError` from `resolveUserIdentity` and a `null` from
                  `resolveArcRoot` directly, routing diagnostics through `output.log.error` so JSON mode keeps stdout
                  pure. A new `emitErrorEnvelope` helper writes
                  `{ cell: "none", reason: "identity-absent" | "no-arc-project" }` to stdout under `--json` and sets
                  `process.exitCode = 1` in either mode.
                - Tests: four contract cases (both error paths × JSON / non-JSON) pin envelope shape, non-zero exit, and
                  confirm config / worktree probes never fire on the early-return paths.

            - `[x]` **2.R.2.d.5 `--yes` wiring**
                - `--yes` now degrades `notes_push: prompt` → `always` before the matrix decides, so the save+prompt
                  cell never enters and dry-run previews reflect the resolved cell. The new gate runs ahead of the JSON
                  / non-interactive `prompt` → `manual` fallback so explicit auto-accept always wins over implicit
                  degradation.
                - `pushWithInteractiveRecovery` now accepts `yes`; on conflict it auto-accepts the merge path
                  (force-fetch, re-save on top, push) and bypasses both the Clack `select` and the
                  `failed-nontty-conflict` shortcut. Force-push is never auto-selected — the `select` remains the only
                  entry point for that destructive action. CLI help text updated to match.
                - `ExecuteContext.yes` threads through `executePaired`'s notes adapter and `pushNotesLeg`. Tests cover
                  policy degradation, --yes-overrides-JSON-degradation, paired-leg propagation, dry-run preview,
                  conflict auto-merge, non-interactive override, and the force-push refusal contract.

        - _Outcome:_ The `arc sync --json` envelope is now a stable contract: every return path emits a single JSON
          object on stdout (runtime, dry-run, and both early-return error paths), with `interlockState` reporting the
          resolved policy, `mode: "dry-run"` distinguishing previews, and `cell: "none"` plus a `reason` discriminator
          on identity-absent / no-arc-project failures. Stdout purity holds across all paths via `SyncOutput`. `--yes`
          threads through matrix dispatch (prompt → always degradation) and the recovery layer (auto-merge on conflict;
          force-push never auto-selected).

### `[x]` **2.R.3 Regression coverage across real git topologies**

- _Goal:_ Test coverage catches the cross-machine and handoff failures that mocked unit tests missed.

    - `[x]` **2.R.3.a Cross-clone handoff sync regression**
        - _Goal:_ A real two-clone topology proves the post-2.R sync contract end-to-end and gives downstream plans
          (`plan-coord-probe.md`) a reusable harness.

            - `[x]` **2.R.3.a.0 Multi-clone test harness**
                - `setupMultiClone()` in `__tests__/helpers/multi-clone.ts` returns
                  `{ origin, cloneA, cloneB, cleanup }`; bare origin is seeded with one initial commit on `main` and
                  each clone has the ARC user-notes fetch refspec configured via `configureNotesRefspec`.
                - Setup is parameterizable per clone (`authorName`, `authorEmail`, arbitrary `git config` overrides) and
                  per-harness (`initialCommit`), keeping the shape reusable by `plan-coord-probe.md` and other
                  cross-machine regressions.
                - Trivial cross-clone scenario in `__tests__/integration/multi-clone.test.ts` exercises the topology
                  end-to-end: clone A pushes an empty commit to `origin/main`; clone B fetches and sees the same SHA.

            - `[x]` **2.R.3.a.1 Cross-clone sync regression**
                - Clone A's `arc sync --json` envelope reports the `notes-only` cell with a successful notes push; clone
                  A's `HEAD` carries the verified user note (`.sync-state.json` records `verifiedAt` with `sourceCommit`
                  matching `HEAD`) and origin's `refs/notes/arc/user/test-user` advances to the same tip as clone A's
                  local ref.
                - Clone B's `runUserPull` fetches the new note, restores `SESSION-NOTES.md` byte-for-byte, and
                  `runUserSessionInitStatus` reports `localNoteFreshness.state: "current-head"` at clone B's `HEAD` —
                  covering both session-init and session-handoff consumers, which share that probe.

    - `[x]` **2.R.3.b Real-git paired-push coverage**
        - _Goal:_ Real-git proof of the paired-push flagship cell — the only matrix cell where mocked-exec coverage in
          2.R.2.d cannot prove the behavior end-to-end. Worktree push and notes push must coordinate correctly against a
          real bare origin, with both ref tips advancing and a sibling clone observing both after fetch + pull. All
          other audit-listed cells (diverged + on-sync, remote-ahead + manual worktree, notes prompt under
          non-interactive, no-op + stale-local) are either proven structurally in 2.R.2.d or covered by 2.R.1.b's
          `arc user push` real-git coverage; the worktree-only push-failure path was investigated and dropped because
          `runWorktreeSyncStatus` performs a bounded fetch before classifying state, so a stale-then-rejected push isn't
          reachable through the orchestrator without contrived hook setup that adds no fidelity over mocked failure
          injection.

            - `[x]` **2.R.3.b.1 Paired-push success on multi-clone harness**
                - Clone A's `arc sync --json` envelope reports the `paired-push` cell with `worktree.action: "push"` and
                  `notes.action: "save+push"` both at result `success`; origin advances both `main` to clone A's `HEAD`
                  and `refs/notes/arc/user/test-user` to clone A's local notes-ref tip.
                - After `git fetch origin && git merge --ff-only origin/main`, clone B's `HEAD` matches clone A's;
                  `runUserPull` restores `SESSION-NOTES.md` byte-for-byte and `runUserSessionInitStatus` reports
                  `localNoteFreshness.state: "current-head"` at clone B's new `HEAD` — proving the worktree and notes
                  legs coordinated coherently end-to-end.
                - Override path confirmed: `readConfigSettings` consults only `.arc/system/arc-config.yml` (no
                  `arc.pushInterlock` git-config override), so the test rewrites `session.push_interlock` in clone A's
                  config file after `runInit` to dispatch the paired cell.

    - `[x]` **2.R.3.c JSON purity child-process tests**
        - _Goal:_ Pin the subprocess-level stdout purity contract for `arc sync --json` end-to-end through the built CLI
          artifact (what adopters actually run). Catches Clack contamination from any leaf that bypasses `SyncOutput` —
          `2.R.2.d.3` proves orchestrator-layer purity with mocks; this task proves the shipped binary stays clean
          across representative cells.

            - `[x]` **2.R.3.c.0 Subprocess CLI invocation helper**
                - `runCli(args, options)` lives at `__tests__/helpers/run-cli.ts`, spawning `node dist/cli.js <args>`
                  via `child_process.spawn` with `stdio: "pipe"`. `cwd`, `env` (merged on top of `process.env`), and
                  `timeout` (default 10s, `SIGKILL` on overrun) are parameterizable so the purity tests in 2.R.3.c.1 and
                  future subprocess scenarios reuse the same shape.
                - Smoke test in `__tests__/e2e/run-cli.e2e.test.ts` confirms `runCli(["--help"])` resolves with
                  `exitCode: 0` and stdout containing `arc`. Lives under e2e config so the existing `global-setup`
                  builds `dist/cli.js` before the helper runs.

            - `[x]` **2.R.3.c.1 Stdout purity across five representative cells**
                - `__tests__/e2e/sync-purity.e2e.test.ts` drives `arc sync --json` via `runCli` across five cells
                  (paired-push, save-only, blocked-diverged, prompt-policy degradation, identity-absent), pinning the
                  contract: stdout is exactly one trailing-newline- terminated JSON object with no `\x1b[` bytes;
                  envelope `cell` and `exitCode` match each cell's contract; `prompt-policy` additionally pins the
                  degradation warning to `stderr`.
                - Surfaced and fixed a real Clack contamination: spinner cursor codes and `◇` glyphs from
                  `pushWithInteractiveRecovery` were bleeding into subprocess stdout on the paired path. Helper now
                  requires `output: SyncOutput`, threaded through all four call sites (sync paired adapter, sync
                  single-leg notes, `handleUserSync`, `handleUserPush`); see `notes-user-sync-ux.md` § Design Decisions
                  for the no-default rationale and residual-risk callout on `promptConflictResolution`.
                - Identity-absent setup defeats the `slugify(user.name)` fallback by unsetting `user.name` locally and
                  passing `GIT_CONFIG_GLOBAL=/dev/null` + `GIT_CONFIG_NOSYSTEM=1` to the subprocess so the host's
                  gitconfig can't supply an identity.

            - `[x]` **2.R.3.c.2 CI ordering — built artifact precondition**
                - E2E config's `globalSetup` (`__tests__/e2e/global-setup.ts`) already runs `npm run build` before any
                  e2e test executes; CI's full-suite job also builds explicitly before `test:e2e`.
                - Added project-wide prebuild guard via shared `__tests__/helpers/cli-spawn.ts` (exports `CLI_PATH` +
                  `assertCliBuilt()`); both `runArc` and `runCli` consume it. Missing-`dist/cli.js` now fails fast with
                  a clear "Run `npm run build` first" error — covers off-config invocations that globalSetup cannot
                  catch.
                - Full helper unification (single helper with `mode: "tty" | "pipe"`, ~86-site migration) deferred to
                  `BACKLOG-TECHNICAL.md` § Test Infrastructure.

        - _Outcome:_ Subprocess purity contract for `arc sync --json` is end-to-end pinned through the shipped CLI
          across five representative cells (c.1), with a reusable spawn helper (c.0) and project-wide prebuild guard
          (c.2) so future subprocess tests inherit both layers without bespoke wiring.

### `[x]` **2.R.4 Disk-vs-note direction inference and action-oriented status output**

- _Goal:_ Eliminate the misclassification that recommends `save` when `load` is correct after a cross-machine ref
  advance, and reshape default status output so actions name the right verb in one line. Three-tier truth (refs / disk /
  working files) stays available behind `--verbose` and in `--json` for debugging and machine consumers.

    - `[x]` **2.R.4.a Disk-vs-note direction inference via `sourceCommit` ancestry**
        - _Goal:_ `inspectDiskVsLocalSnapshot` distinguishes "disk behind note" (note advanced past
          `LocalSyncState.sourceCommit`; disk hash matches the materialized manifest) from "disk has unsaved edits"
          (disk advanced past the materialized manifest; note still at `sourceCommit`) and from genuine reconciliation
          cases. Today's hash-only comparison cannot tell these apart and silently misroutes post-fetch disk-behind
          state to a `save` action that overwrites the freshly fetched newer note.

        - _Outcome:_ Added `"behind"` to `UserUnsavedDirection` and reshaped `inspectDiskVsLocalSnapshot` to gate on
          `note.commit !== sourceCommit`. When `sourceCommit` is a strict ancestor of `note.commit` and the disk hash
          matches the materialized manifest, the disk-behind branch returns `direction: "behind"`, `diskStatus:
          "stale"` — routing through the existing `stale → arc user load` action. Note-moved cases that are not strict
          disk-behind (descendant with diverged disk, or note off the sourceCommit's history) collapse to `direction:
          "mixed", diskStatus: "mixed"`, surfacing the existing manual-reconciliation hint instead of auto-routing to
          either verb. Note-at-baseline (`note.commit === sourceCommit`) falls through to the unchanged hash-only
          heuristic. `deriveDiskStatus` extended for the new direction value. Folded in cleanup of the v1
          `LocalSyncState` read path (and its `sourceCommit: ""` synthesis, the `recordPartialPushMarker` HEAD
          fallback, and the now-unused `readHeadHash`) since this pre-1.0 framework has no shipped adopters carrying
          v1 records on disk; v2 validation in `readLocalSyncState` already enforces non-empty `sourceCommit`. Test
          coverage in `user-status.test.ts` covers four behaviors (disk-behind, true unsaved edits, both-moved,
          divergent history) via a shared `inspectUserSyncState` io-mock helper; the legacy integration regression in
          `user.test.ts` is removed.

    - `[x]` **2.R.4.b Action-oriented status default with `--verbose` three-tier truth**
        - _Goal:_ `arc user status` default output names the next command in one sentence rather than narrating ref
          topology in three. Three-tier detail stays available behind `--verbose` and in `--json` for debugging and
          machine consumers.

        - _Outcome:_ `buildUserStatusResult` gained `verbose: boolean` (default `true` preserves composite `arc status`
          rendering and existing programmatic callers). Default `arc user status` flips to a single direction-aware
          action headline (`renderActionOrientedHeadline`) plus a context line collapsing note position + saved-at
          freshness, an optional `Pre-load backup present (N files).` count, and a `Next step:` line — ≤3 detail lines
          versus today's seven-line three-tier breakdown. New helpers in `sync-status.ts`: `renderActionOrientedHeadline`,
          `buildVerboseDetailLines`, `buildDefaultDetailLines`, `renderDefaultContextLine`, `isHeadlineFullyClean`. The
          `--verbose` flag plumbs through `cli.ts` → `handlers/user.ts` → `runUserStatus` → `buildUserStatusResult`.
          `UserStatusResult` field shape is identical across modes — only `summary` and `detailLines` content varies, so
          machine consumers (composite `arc status`, sync orchestrator, handoff workflow) read the same envelope. New
          tests in `user-status.test.ts` cover all seven default-mode behaviors (clean, disk-behind, disk-edits, mixed,
          conflict, remote-ahead, backup count) plus context-line variants (current/behind-HEAD/outside-ancestry,
          savedAt absent), offline suffix, and shape parity between modes.

### `[x]` **2.R.5 Self-hosted CLI guard**

- _Goal:_ This repo cannot silently trust a stale ignored `dist/cli.js` for handoff-critical `npx arc` commands.

    - `[x]` **2.R.5.a Implement dev-mode stale-build check**
        - _Goal:_ Self-hosting `npx arc` invocations refuse to run handoff-critical commands against a stale ignored
          `dist/cli.js`; non-handoff commands warn but proceed. Adopters never see the check (published package excludes
          `src/`, so the dev-mode discriminator returns "skip").

        - _Outcome:_ `lib/dev-check.ts` verdict helper with injected fs primitives (4 unit tests pin
          skip/fresh/stale/missing-dist) wired through a Commander `preAction` hook in `cli.ts` against the
          handoff-critical allowlist. Manual verification confirms warn-only on `arc log atomic` and fail-fast on
          `arc status --session-init --json` (empty stdout preserves the JSON-pipe contract from 2.R.4); both fall
          silent post-`npm run build`. `--version` / `--help` bypass via Commander's contract.

    - `[x]` **2.R.5.b Verify guard + contributor-docs note**
        - _Goal:_ Confirm the dev-mode check fires correctly across the handoff-critical surface from a deliberately
          stale build state, and document the workflow expectation in the contributor onboarding surface.

        - _Outcome:_ Verification matrix from `touch packages/arc-framework/src/cli.ts` confirmed all five
          handoff-critical commands (`arc sync`, `arc user save`, `arc user push`, `arc status --session-init --json`,
          `arc status --session-handoff --json`) refuse with exit 1, clean stderr error, and empty stdout; the
          non-handoff control (`arc log atomic`) warned to stderr and exited 0; `npm run build` restored silent
          behavior across the set. `CONTRIBUTING.md` gained a "Development Workflow" section between Quick Start and
          Commit Convention naming the build-before-invoke expectation, the handoff-critical command list, and the
          warn-vs-refuse tier.

### `[x]` **2.R.6 Final sync contract audit**

- _Goal:_ Re-read the sync surface after remediation and capture residual risk before Phase 3 begins.

    - `[x]` **2.R.6.a Code-path audit against invariants**
        - _Goal:_ Audit code paths against 2.R invariants and fix any gaps surfaced inline so audit findings convert
          directly to closed work, not deferred WUs.

        - `[x]` **2.R.6.a.1 Audit pass**
            - _Outcome:_ 25 files audited across handlers, `commands/user/*`, `lib/git/*`, and `lib/sync-*` (scope
              extended at audit start to add `handlers/push-recovery.ts`, `handlers/status.ts`, `lib/sync-output.ts`,
              and `lib/sync-policy.ts` — the supporting modules where 2.R invariants now live). 0 active findings
              against five of the seven 2.R invariants; two findings surfaced for I2 (no JSON contamination) and
              addressed in 2.R.6.a.2 / 2.R.6.a.3. Full matrix in `notes-user-sync-ux.md` § Phase 2.R Audit Findings,
              with choke points flagged.

        - `[x]` **2.R.6.a.2 Fix `arc user status --json` stdout contamination + envelope-on-error**
            - _Goal:_ Under `--json`, `arc user status` (and `arc user status --session-init --json`) must keep
              stdout pure — no clack output — and emit a structured error envelope on every failure path so
              programmatic consumers can parse the result.
            - _Outcome:_ `handleUserStatus` (`handlers/user.ts`) now uses `createSyncOutput(json)` instead of
              raw `@clack/prompts`; identity-resolution failure and project-root-missing both emit
              `{ "error": { "code", "message" } }` to stdout via a new `emitStatusError` helper, set exit code
              1, and skip clack entirely. Project-root path bypasses `requireArcProjectRoot` under `--json` (uses
              `resolveArcRoot` directly) so the helper's clack-on-stdout error path can't fire. Added
              `NOT_IN_ARC_PROJECT` to `ArcErrorCode` for the project-root case. Human-mode behavior unchanged.
              Two new unit tests pin the contract: `IDENTITY_MISSING` envelope on identity-absent;
              `NOT_IN_ARC_PROJECT` envelope on cwd outside ARC project — both assert no clack calls and
              `process.exitCode === 1`. Existing JSON tests continue to pass.

        - `[x]` **2.R.6.a.3 Thread `SyncOutput` through `resolveSyncPushPolicy` callers**
            - _Goal:_ Eliminate the latent JSON-contamination risk that any future `--json` surface on
              `arc user sync` (or any new caller of `resolveSyncPushPolicy`) inherits the helper's `warn`
              routing by construction rather than by hand-threading.
            - _Outcome:_ `handlePushDirection` (`handlers/user-sync.ts`) now hoists `createSyncOutput(false)`
              once at function entry; the `resolveSyncPushPolicy` `warn` callback routes through
              `output.log.warn`, and the existing `pushWithInteractiveRecovery` call reuses the same `output`
              instead of constructing a second one inline. No behavior change today (`arc user sync` has no
              `--json`); forward-compat by construction — any future `--json` mode added to a caller flips
              `createSyncOutput(false)` → `createSyncOutput(json)` and the warn route follows. Existing 1066
              unit tests pass.

    - `[x]` **2.R.6.b Test-surface audit + residual risk**
        - _Goal:_ Verify nothing 2.R touched is silently uncovered: every invariant, audit-surfaced fix, and
          extracted seam has coverage at the appropriate tier; cross-machine invariants have cross-clone paths;
          residuals are consolidated into one list for a future hardening WU.
        - _Outcome:_ Added § Phase 2.R Test Coverage matrix in `notes-user-sync-ux.md` covering I1–I7, the two
          audit-surfaced fixes from .6.a, and 12 extracted seams. 0 active gaps; two `intentional` rows with
          rationale (.6.a.3 forward-compat-only; `lib/sync-output.ts` boundary-tier coverage). Cross-clone paths
          confirmed in `integration/multi-clone.test.ts` for the three cross-machine invariants (I1 verified save,
          I3 paired-push worktree leg, I4 stale freshness); I5 / I6 / I7 are intra-clone enforcement points.
          Audit surfaced six residual concerns; closed-loop forward-feed into this WU rather than deferring:
          2.R.6.e and 2.R.6.f added as new sibling tasks (load-side verification symmetry; route
          `promptConflictResolution` through `SyncOutput`). 2.R.6.c absorbed two preamble-only items
          (single-leg `runUserPush` I7 asymmetry; `--force` escape hatch in `handleUserPush`).
          Save-verification race confirmed closed by 2.R.1.a's just-serialized-manifest comparison — not a
          residual. Cross-machine partial-push invisibility deferred to
          `backlog/technical/plan-cross-machine-sync-coherence.md` as a substantial design WU of its own.

    - `[x]` **2.R.6.c Doc and preamble updates**
        - `runPairedPush` (`commands/user/paired-push.ts`) module preamble extended to document verified
          save-before-push (sync-state advances only on exact-`HEAD` readback match), `pushWorktreeBranch`
          consumption from `lib/git/`, and force-push advisory refusal at the orchestrator boundary; the function
          preamble tightened to call out `runUserSave`'s verification and the helper for the worktree leg.
        - `handleSync` (`handlers/sync.ts`) module preamble gained four post-2.R sections: blocked-cell save
          invariant (every blocked cell except rebase-in-progress saves before refusing notes push), JSON envelope
          contract (single object on stdout across runtime/dry-run/error paths, `interlockState` attached at the
          handler boundary, resolved `notesPush` reported), shared `pushWorktreeBranch` helper for single-leg
          pushes, and force-push routing (paired refusal at orchestrator; single-leg via push-recovery `[rejected]`).
        - `lib/git/pushability.ts` advisory-disposition contract paragraph extended with the single-leg / paired
          refusal asymmetry — paired refuses at the orchestrator boundary before save fires; single-leg
          `runUserPush` lets divergent pushes through to `git push` and routes rejection through
          `push-recovery.ts`'s `[rejected]` branch. Asymmetry rationale tied to the worktree-vs-notes coupling
          difference (paired commits worktree first; single-leg runs against arbitrary remote state).
        - `runUserPush` (`commands/user/push-fetch.ts`) preamble documents that advisory disposition is **not**
          refused at this site — block-disposition still throws, but divergence reaches `git push` and recovery
          handles it. Cross-references `handlers/push-recovery.ts` and `lib/git/pushability.ts` for the
          asymmetry contract; mentions `--force` as the only path that sets `force: true`.
        - `handleUserPush` (`handlers/user.ts`) gained a TSDoc preamble — previously had only a section comment.
          Documents the default recovery path, explicit `--force` escape hatch (bypasses pushability pre-check
          and recovery; matches `git push --force` semantics), and the I7 contract perimeter (automatic pushes
          never reach this branch, so advisory refusal still covers every non-explicit push).
        - `strategy-session-operations.md` § Handoff-Interior Toggle Pattern: assessed; no update needed. 2.R
          changes are all internal to `arc sync` / `runPairedPush` / `runUserSave` and don't affect the toggle
          pattern (config-key convention, `auto/prompt/manual` enum), the push-ordering invariant
          (worktree-first, already documented), the cascade-reversibility model, or the probe envelope shape.
          Audit § Open Items already closed the surface as "(none open — items surfaced … addressed inline)".

    - `[x]` **2.R.6.d Unify spinner-routing helper**
        - _Goal:_ Eliminate the two-helper smell created during 2.R.3.c.1 — `shared.ts:runWithSpinner` (raw
          `p.spinner()`) and `push-recovery.ts:runRoutedSpinner` (routed through `output: SyncOutput`) are
          near-identical 5-line wrappers that drift with any spinner-pattern change. Set one canonical pattern: spinner
          ownership lives at handler boundaries where JSON/human-mode awareness already lives. Scope covers the
          full spinner surface in user-sync handlers — both the helper consumers and the inline `p.spinner()`
          sites in `handleUserLoad` / `handleUserPull` that don't fit the helper's signature.
        - _Outcome:_ Spinner routing in user-sync handlers is single-source — `runWithSpinner` is the canonical
          helper, consuming `output: SyncOutput` as a required first parameter (matching the deleted
          `runRoutedSpinner`'s ordering); inline `p.spinner()` in `handleUserLoad`/`handleUserPull` switched to
          `output.spinner()` directly because their per-branch stop labels don't fit `(label, fn, doneLabel)`.
          Eight `runWithSpinner` call sites updated (3 in `push-recovery.ts` replacing the deleted twin; 5 in
          `handleUpdate`/`handleUserAdd`/`handleUserSave`/`handleUserPush --force`/`handleUserFetch`); a
          `SyncOutput` instance is hoisted per handler entry. Two test mocks (`unit/push-recovery.test.ts`,
          `unit/user-handlers.test.ts`) updated for the new signature. All quality surfaces remain green: 1066
          unit + 231 integration + 56 e2e (including the 5-cell sync-purity e2e). Non-spinner clack consumers
          (`p.intro`, `p.outro`, `p.note`, `p.log.*`) in those handlers stay raw — deferred until a handler
          actually needs `--json`, since pre-emptive migration would add dormant indirection with no JSON-mode
          test surface to exercise it.

    - `[x]` **2.R.6.e Load-side verification symmetry**
        - _Goal:_ Add a postcondition check to `runUserLoad` symmetric to 2.R.1.a's save-side verification, so
          load failures (torn writes during materialization, partial permissions, disk full mid-write) cannot
          leave `LocalSyncState` advanced past an actually-incomplete materialization.
        - _Outcome:_ `runUserLoad` now verifies materialized user-dir contents against the loaded manifest
          before `writeLocalSyncState` advances; missing files or content mismatch throws
          `UserLoadVerificationError` and leaves sync-state unchanged, while a successful match advances
          sync-state with `verifiedAt: foundCommit` (mirroring save's `verifiedAt: HEAD`). New
          `verifyMaterializedUserDir` helper iterates `manifest.files` per-entry — reading each materialized
          file via `io.readFile`, hashing the readback through `hashSyncManifest`, and comparing — so
          coexisting local files outside the manifest don't false-positive the check (load preserves them by
          design). `isSafePath` in `lib/git/user-sync.ts` was renamed and exported as `isSafeManifestPath`
          (re-exported from `lib/git/index.ts`) so verification mirrors `deserialize`'s silent-skip filtering
          from a single source of truth. Three unit tests added in `unit/save-load.test.ts §
          runUserLoad — load verification` (missing readback / content mismatch / verifiedAt on match); all
          48 real-git integration tests in `integration/user.test.ts` continue to pass unchanged. Existing
          `verifySavedNote` retained — primitives shared via `hashSyncManifest`, so any future migration of
          the hash function applies to both sites symmetrically.

    - `[x]` **2.R.6.f Route `promptConflictResolution` through `SyncOutput`**
        - _Goal:_ Eliminate the latent JSON-contamination class in
          `handlers/push-recovery.ts:promptConflictResolution` (raw `p.log.warn` + `p.select`). Currently dead
          code under JSON mode because `isNonInteractiveEnvironment()` short-circuits before either fires; route
          through `output: SyncOutput` by construction so the gate stops being the sole protection.
        - _Outcome:_ `SyncOutput` extended with a `select<T extends string>` method (plus
          `SyncOutputSelectOption` / `SyncOutputSelectOptions` types) that takes a required `jsonModeDefault: T`
          — JSON-mode select returns that default without prompting, mirroring the `confirm` → `false`
          pattern parameterized for the multi-option case. `promptConflictResolution` now takes `output:
          SyncOutput` and routes warn through `output.log.warn` and the action prompt through
          `output.select<"force" | "merge" | "cancel">({..., jsonModeDefault: "cancel"})`; the file's `import * as p
          from "@clack/prompts"` is gone. The JSON-mode contract is now enforced by construction — if
          `isNonInteractiveEnvironment()` were ever weakened, JSON-mode callers would still hit
          stderr-routed warn + deterministic "cancel" without touching clack. New unit test in
          `unit/push-recovery.test.ts` pins the contract: under `createSyncOutput(true)` with the
          non-interactive gate stubbed false, the conflict path returns `{ kind: "cancelled" }`, no
          `p.log.warn` / `p.select` mock calls fire, and the conflict warning lands on stderr through
          `output.log.warn`. Existing 15 push-recovery tests, the 5-cell `sync-purity.e2e.test.ts`, and the
          full 1301-test unit + integration suite stay green. Primary motivation is the already-shipping
          `arc sync --json` path: `pushWithInteractiveRecovery` is reachable from the orchestrator's
          notes-leg, and the prior gate caught subprocess/CI but not TTY-invoked `--json`. The second
          `select` consumer in `handlers/user-sync.ts:handleConflict` is currently outside the JSON-mode
          surface (`arc user sync` has no `--json` requirement in PRD R10 and isn't in the backlog); if a
          future need surfaces it, the migration inherits this routing without re-deriving the pattern.

## **Phase 3:** Vocabulary and config alignment

_Purpose:_ Align user-notes vocabulary across config keys and rendering surfaces. R13 resolver consolidation, R12
per-dev interlock overrides (incl. new `arc.syncInterlock`), R9 config-shape rename + `arc update` migration (covers
`user.sync_push` rename + `push_interlock` value rename), R8 layered vocabulary rule. The R10 command rename +
orchestrator surface lands in Phase 2 (2.2.c.i) since 2.2.c's matrix dispatch depends on it. Sequencing: Phase 2.R
completes first; then resolver first (R12 needs it), then renames, then vocabulary pass (so the vocabulary pass operates
on final-shape strings).

### `[x]` **3.1 Resolver consolidation**

- _Goal:_ One 3-tier resolver helper handles `user.notes_push` and the three interlock keys, returning
  `{ value, source }` so downstream consumers can audit precedence.
- _Outcome:_ Added `resolveGitConfigOverride<T>` as the shared git-config → yaml → default resolver, migrated
  `resolveSyncPushPolicy` to return `{ value, source }` through that helper, and updated notes-push consumers/tests to
  use the stable `value` field while preserving invalid-value warn-and-fall-through behavior.

### `[x]` **3.2 Config-shape alignment**

- _Goal:_ Rename `user.sync_push` → `user.notes_push` end-to-end and migrate adopters in place.
- _Outcome:_ Yaml schema and surface rename (3.2.a), `arc update` migration with dual-key warnings and
  conflict-marker handling for customized values (3.2.b), and full vocabulary alignment across the four
  affected strategies, the QUICK-REFERENCE pair, and ADRs 012/016 (3.2.c) — `auto / prompt / manual`
  retired in favor of `manual | on-X` and the three-layer cascade documented explicitly. Adopters running
  `arc update` migrate in place; ADRs took Tier 2 amendment trailers.

    - `[x]` **3.2.a Yaml schema, value enum, and surface rename**
        - Renamed the CLI config surface to `user.notes_push` / `arc.notesPush`, replaced the notes-push auto mode with
          `on-sync`, migrated the resolver API to `resolveNotesPushPolicy` + `NotesPushPolicy`, and updated config
          readers, validators, shipped/self-hosted config files, setup guidance, call sites, and affected tests.

    - `[x]` **3.2.b `arc update` migration logic**
        - Added a private `migrateUserSyncPush(...)` pass in `update.ts` for `.arc/system/arc-config.yml` before
          three-way merge, with update-result reporting for migrated files and dual-key migration warnings in the
          summary output.
        - The migration rewrites `user.sync_push` to `user.notes_push`, translates legacy `always` and
          `session.push_interlock: on-handoff` to `on-sync`, removes old-key duplicates with new-key precedence,
          preserves unknown legacy values for downstream validation, and keeps customized legacy values on the current
          side of standard update conflicts.
        - Covered through `runUpdate` integration tests for translated values, old-key removal, idempotency, dual-key
          warnings, invalid-value preservation, and customized-value conflict markers.

    - `[x]` **3.2.c Strategy and reference doc updates**
        - Retired the `auto / prompt / manual` standard from strategy-session-operations § Handoff-Interior Toggle
          Pattern; canonical shape is now `manual | on-X` where `X` names the trigger event, with `prompt` as an
          opt-in third value for review-before-fire toggles.
        - Documented the three-layer cascade (handoff → sync; sync → push and notes-push) explicitly in
          strategy-session-operations § Handoff-Interior Toggle Pattern and strategy-configurability-architecture
          § Session interlocks; `arc sync` mid-session is named as an explicit sync event (authorize-by-invocation).
        - Aligned vocabulary across the four strategies and the QUICK-REFERENCE pair: `user.sync_push` →
          `user.notes_push`, `arc.syncPush` → `arc.notesPush`, `session.push_interlock: on-handoff` → `on-sync`,
          plus the new `session.sync_interlock: manual | on-handoff` enum. Refreshed the handoff envelope table
          in strategy-session-operations to match actual probe shape (`syncInterlock`/`pushability`).
        - ADRs updated as Tier 2 amendment trailers (append-only with annotation) per the ADR strategy: ADR-012
          notes the key rename without changing the unified-push-policy decision; ADR-016 documents the
          sync-interlock split and `on-X` vocabulary alignment. No decision reversed.

### `[x]` **3.3 Per-developer overrides for interlock keys**

- _Goal:_ Plumb `arc.commitInterlock`, `arc.pushInterlock`, and `arc.syncInterlock` git-config overrides through to the
  four release-mode keys' resolution (`session.commit_interlock`, `session.push_interlock`, `session.sync_interlock`,
  `user.notes_push`). (`session.sync_interlock` schema entry itself lands in 2.2.c.i; the `arc.notesPush` rename lands
  in 3.2.a; this task adds the per-dev override surface for all four keys against final-shape config-key names.)
- _Outcome:_ Added `lib/config/resolved-settings.ts` carrying per-key constants/type-guards, four per-key resolver
  helpers (`resolveCommitInterlock` / `resolvePushInterlock` / `resolveSyncInterlock` / `resolveNotesPushPolicy`), and
  the composite `resolveAllSettings` wrapper. Provenance lands as nested `{value, source}` per key (matches
  `ResolvedConfigOverride<T>` and `HandoffSyncInterlock` precedent) instead of a parallel `sourceMap` — keeps the
  audit-log feed shape one-field deep for `plan-interlock-release-wrappers.md`. `status-reader.ts` drops the four
  release-mode keys from `ENUM_VALIDATORS` with a module-comment naming the layering boundary; raw yaml values flow
  through to `arc config status` while the wrapper owns validation for operational reads. `handlers/sync.ts` migrates
  to the composite wrapper, `handlers/user-sync.ts` and `handlers/status.ts` migrate to the per-key helpers, and
  `lib/sync-policy.ts` retires (consumers absorbed into the new module). `InterlockState` and the `arc sync --json`
  envelope's `interlockState` field now carry nested provenance; `HandoffSyncInterlock.source` widens to include
  `"git-config"`. Quality gates green: 1330 tests pass; lint, typecheck, build clean.

    - Additive at the wrapper boundary — no breaking changes to existing yaml-only callers (config-status report).
      Handlers that need resolved values move to the wrapper.
    - Affected files: `packages/arc-framework/src/lib/config/status-reader.ts` (removed four release-mode keys from
      `ENUM_VALIDATORS`; module-comment notes the layering boundary); new wrapper module
      `packages/arc-framework/src/lib/config/resolved-settings.ts` (constants, per-key helpers, composite wrapper);
      `handlers/sync.ts` (composite wrapper, nested-provenance `InterlockState`); `handlers/user-sync.ts` (per-key
      `resolveNotesPushPolicy`); `handlers/status.ts` + `commands/status/types.ts` (handoff probe via
      `resolveSyncInterlock`; `HandoffSyncInterlock.source` widened); deletes `lib/sync-policy.ts` and its test file.
    - Eight test-first behaviors covered in `__tests__/unit/config/resolved-settings.test.ts`, parameterized over the
      four release-mode keys (24 wrapper-targeted cases plus four composite-behavior cases).

### `[x]` **3.4 Layered vocabulary rule application**

- _Goal:_ User-facing surfaces use "user notes" as the workhorse noun; storage-mechanism terminology ("git notes ref",
  `refs/notes/...`) appears only when the storage layer is relevant.
- _Outcome:_ Applied the workhorse-noun rule to single-side residuals — save/restore output strings (`format.ts`),
  JSDoc summary lines on the `runUserPush` / `runUserFetch` / `runUserSave` / `runUserLoad` API, the standalone
  freshness rendering at `sync-status.ts:753-765` (now aligned with `renderSessionLocalNoteFreshness` at 420-432),
  `user-sync.ts:324` load-failure error symmetry (matching the pull-failure workhorse at 287), and the `arc user
  save` / `arc user load` CLI help (matching push/fetch/pull siblings). Preserved as storage-relevant or
  comparison-pair: `sync-status.ts:891-921` (renderHeadlineExplanation / renderWorkingFilesLine local-vs-remote
  and storage-vs-disk pairs), `user-sync.ts` noop / conflict-warn equality statements and the cross-layer
  state-machine action narrations at 106/108/113/125/129/133/183/203/208/214/295, save-verification errors and
  walk / corrupt JSDoc in `save-load.ts`, the `IO.writeNote` / `IO.readNote` / `SyncStateKind` interface
  descriptions in `types.ts`, and the JSON-discriminant labels. Updated six test pins in
  `__tests__/unit/user-status.test.ts` covering the converted freshness renderer; the comparison-pair pins in
  the same file were not touched.

## **Phase 4:** DX polish

_Purpose:_ Round out the developer experience across two axes. **End-user surfaces** (4.1-4.3): R16 first-use framing,
R17 shared-ref sync-state inference, session-init load cascade — builds on Phase 1's unified spine for bounded-fetch
and Phase 3's vocabulary alignment for first-use copy. **Agent-load surfaces** (4.4-4.6): trim session-boundary
operations whose token + judgment cost regressed as the WU thickened the handoff probe and added conditional loads —
shift judgment-heavy decisions from workflow prose into CLI/probe outputs (`restateCandidates`, `recommendedAction`,
`recommendedSummaryLine`), defer commit-format method loading to first commit, and rely on `arc-commit` as the
single entrypoint for all commit paths.

_Implementation order within phase:_
4.1 → 4.2 → **4.6.a** → 4.3.a → 4.3.b → 4.3.c → 4.4 → 4.5.a → 4.5.b → 4.5.c → **4.6.b**. 4.6.a establishes the
`recommendedAction` envelope pattern that 4.3.c extends with a third (notes-load) channel; reverse order would have
4.3 author Step 2 prose that 4.6.a immediately rewrites. Within 4.3 and 4.5, subtasks have local dependencies
(.a → .b → .c). Numbering reflects conceptual grouping (end-user vs agent-load surfaces) and stays as-is.

### `[x]` **4.1 First-use framing surface**

- _Goal:_ Introduce the user-notes feature and orient new developers without a suppression-flag burden.

    - `[x]` **4.1.a `arc join` post-init paragraph**
        - Extracted `buildPostJoinMessage` in `commands/join.ts` mirroring `commands/init.ts:buildPostInitMessage`;
          `handlers/join.ts` calls it. Adds a one-time orientation paragraph to the post-join `What's next` block when
          identity resolves: where personal context lives (`.arc/user/<identity>/`, gitignored) and that it travels
          via user notes (a git notes ref) pushed/pulled by `arc sync`.
        - Test-after: 6 cases in `join.test.ts` covering role-confirmation line, tools-conditional restart cue, and
          identity-conditional orientation paragraph (presence, path interpolation, null-identity omission).

    - `[x]` **4.1.b `arc status` single-line hint**
        - Pin (a) resolved by adding a dedicated `inspectUserNotesRefExists` probe in
          `commands/user/sync-status.ts` (thin wrapper over `readRefHash` via `git rev-parse --verify`) — runs
          unconditionally in the `runUserStatus` Promise.all batch (also fires in offline mode), independent of the
          broader `localNoteFreshness === "missing"` signal whose semantics include "no HEAD-ancestor note in walk."
        - Pin (b) resolved by prepending the hint as `detailLines[0]` in both verbose and default modes via a new
          `BuildUserStatusInput.userNotesRefExists?: boolean` field; the prepend fires only on explicit `false`, so
          `undefined`/`true` suppress identically — no flag, env-var, or stored suppression beyond the probe boolean.
        - Hint copy: `New here? Run \`arc user --help\` to learn about user notes.`
        - Test-first coverage in `__tests__/unit/user-status.test.ts`: 4 unit cases on `buildUserStatusResult`
          (ref-absent → hint at [0], ref-present → omitted, undefined → omitted, default-mode parity) plus 2
          integration cases on `runUserStatus` (threads into `detailLines[0]` end-to-end, probe fires even with
          `offline: true`).

### `[x]` **4.2 Shared-ref sync-state inference**

- _Goal:_ `arc status` distinguishes the causes of notes-ref divergence — `unfetched-local`,
  `concurrent-local-writer`, `cross-machine` — and gives actionable guidance instead of generic "remote ahead"
  framing. `--offline` degrades classification explicitly; bounded-fetch keeps the full-mode probe responsive.

    - `[x]` **4.2.a `LocalSyncState` v2 → v3 schema bump + atomic write**
        - `LocalSyncState.version` bumped to `3` with optional `savedAt: ISO-string`. Reader (`save-load.ts`)
          accepts v2 or v3 on disk and normalizes to v3 in memory; v2 records hydrate with `savedAt: undefined`
          until the next save. Both sync-state writers (`writeLocalSyncState`, `writeLocalSyncStateRecord`)
          route through `atomicWriteJson`; `clearPartialPushMarker` propagates `savedAt` across the cycle so
          partial-push toggling never drops the field.
        - Hardened `atomicWriteJson` (`lib/fs.ts`) with a per-call random tmp suffix. The single-write
          temp+rename primitive wasn't sufficient on its own for behavior #4 — without unique tmp paths,
          two near-simultaneous writers would have raced through the same `.{name}.tmp` and the surviving
          rename could have published torn JSON.
        - Test migration in `__tests__/unit/save-load.test.ts`: sync-state assertions moved from
          `io.writeFile` mocks to real-fs disk reads (sync-state writes no longer route through the
          `io.writeFile` injection point). 5 new behavior cases land under `describe("LocalSyncState v3
          schema")`.

    - `[x]` **4.2.b Bounded-fetch wrapper for notes-ref fetch in full-mode `arc status`**
        - `inspectUserSyncRefsDetailed` (now exported) takes an optional `fetchTimeoutMs`. When set, the
          notes-ref fetch runs under an `AbortController` via a new `boundedNotesRefFetch` helper.
          AbortError → `remote-unavailable` / `failureReason: "timeout"`; non-Abort error →
          `failureReason: "error"`; "couldn't find remote ref" still maps to `local-ahead`.
        - `runUserStatus` passes `DEFAULT_FETCH_TIMEOUT_MS` (3000ms, shared with `worktree-sync.ts`);
          `inspectUserSyncState` orchestrator and `runUserSessionInitStatus` stay unbounded per scope.
          `UserSyncRefInspection` gains optional `failureReason: "timeout" | "error"` mirroring the
          worktree-sync vocabulary.
        - Pattern inlined as `boundedNotesRefFetch` rather than reshaping `lib/git/worktree-sync.ts`'s
          `boundedFetch` to a generic argument list — the existing helper hard-codes branch fetch and one
          new caller doesn't justify reshaping the shared one. Only the constant is shared.

    - `[x]` **4.2.c Inference helper module — `inferUserSyncCause`**
        - New pure helper at `packages/arc-framework/src/lib/user-sync/inference.ts` exports `inferUserSyncCause`,
          `UserSyncCause`, and `UserSyncCauseConfidence`. Helper takes a precomputed `refRelation` alongside the
          contract's hash inputs — ancestry/IO stays at call sites so 4.2.d and Task 4.3 can both reuse the engine.
        - Picked the **focused-taxonomy** implementer's choice — helper called only after divergence; the
          defensive `refRelation: "same"` branch returns `unknown` rather than introducing a 6th cause value.
          `savedAt` modulates confidence (`high`/`low`) at a 7-day `SAVED_AT_RECENCY_THRESHOLD_MS` without ever
          flipping the cause; `now` is optional and falls back to `Date.now()` for production ergonomics.
        - 10 unit cases in `__tests__/unit/user-sync-inference.test.ts` cover the 5 causes, the recency
          modifier across all non-`unknown` causes, and the defensive `same` branch.

    - `[x]` **4.2.d Wire helper into `runUserStatus` rendering**
        - `runUserStatus` adds `readLocalSyncState` to its `Promise.all` batch, computes `headReachable` via
          `isAncestor(sourceCommit, HEAD)`, and delegates to a new `classifyUserSyncCause` helper that maps
          `UserSyncRefInspection.state` to `UserSyncRefRelation`, plus `note?.commit` to
          `latestNoteRefHistoryEntry`. Skips the call for `same` ref state without offline; offline path
          short-circuits to the offline cause via `refRelation: "remote-unavailable"` + `offline: true`.
        - `UserStatusResult` gains optional `userSyncCause` (`UserSyncCause`) and `userSyncCauseConfidence`
          fields — present only when the helper was invoked. JSON consumers inherit both.
        - Cause-aware rendering lives in two new pure helpers (`renderUserSyncCauseLine`,
          `renderCauseAwareActionHeadline`) selected by `BuildUserStatusInput.userSyncCause`. Cause line is
          appended to the end of `detailLines` (purely additive — every existing line keeps its wording and
          absolute position); non-verbose action-oriented headline routes through the cause-aware table when a
          cause is present and falls back to the existing taxonomy on `unknown`. `unfetched-local`'s detail
          line embeds the existing `arc user pull` copy. `cross-machine` copy hedges on `confidence: "low"`.
          `concurrent-local-writer` copy is sibling-writer framing free of machine-locality assertions.
        - 8 rendering unit cases on `buildUserStatusResult` (taxonomy threading, cause-line copy per cause,
          additivity invariant, action-oriented headline cause routing, unknown fallback, no-cause-line for
          unknown) plus 2 orchestration cases on `runUserStatus` (offline → `offline` cause; clean ref state →
          no cause field).

    - `[x]` **4.2.e `--offline` degradation rendering**
        - `buildVerboseDetailLines` appends `"offline — local state only; cross-machine signals unavailable"`
          immediately after the existing `Remote notes check skipped (--offline)...` skip-note when
          `remoteChecked === false`. Verbose-only pairing — default mode keeps its single-line action-oriented
          framing, which already routes through the cause-aware path from 4.2.d.
        - Behaviors 2 (cause stays `offline`, never cross-machine/concurrent-local-writer) and 3 (action-oriented
          headline avoids unverifiable causes) are already enforced by the 4.2.c inference helper short-circuit
          on `offline: true` and the 4.2.d cause-aware headline routing — no additional code here.
        - 3 unit cases in `__tests__/unit/user-status.test.ts` cover skip-note + degraded-line adjacency,
          online-mode omission, and default-mode omission.

### `[x]` **4.3 Session-init load cascade**

- _Goal:_ Session-init detects ref-aligned-but-disk-behind state and offers `arc user load` per a new
  `session.init_load.notes` config knob — same shape as the existing `session.init_pull.notes` cascade, applied to
  the load-needed condition. Closes the cross-machine-resume gap where worktree pull silently advances the user-notes
  ref while working files stay stale, and session-init reports "everything synced" without surfacing the load action.

    - `[x]` **4.3.a Config schema for `session.init_load.notes`**

        - Threaded the new key through both schema layers in lockstep:
          `ConfigSettings` / `ConfigSessionInitSettings` interfaces, `DEFAULTS` (`"prompt"`) and
          `ENUM_VALIDATORS` (`["manual", "prompt", "always"]`) in the status reader, the shell validator
          (`validate_enum` line + `known_keys` entry), and the `arc-config.yml` key + comment block
          documenting the cross-machine resume gap and `always`-mode dirty-tree refusal.
        - Mirrored package source → project copy: `arc-config.yml` and `validate-config.sh` in
          `.arc/system/`. Configurable file (yml) gets the default key + comment in both copies; framework
          script (validator) is byte-identical between copies. Framework-sync drift check passes.
        - Tests: 5 new cases in `__tests__/unit/config/status-reader.test.ts` (default, enum acceptance,
          unknown rejection) + 3 in `__tests__/unit/scripts/validate-config.test.ts` (validator accepts
          enum, rejects unknown, recognizes the key). Existing fixtures across `config-format`,
          `status-format`, and `status/run` updated for the new key in the settings object.

    - `[x]` **4.3.b Probe-side `loadNeeded` signal**

        - _Goal:_ Extend `runUserSessionInitStatus` to compute the load-needed condition and surface
          `loadNeeded?: boolean` on the `clean` arm of `UserSessionInitStatusResult` when `refState === "same"`.
          The PRD-pinned 5-state spine (R1: `clean | remote-ahead | conflict | disabled | remote-unavailable`)
          stays the canonical surface — no 6th state.

        - Added `inspectDiskVsLocalSnapshot` to `runUserSessionInitStatus`'s `Promise.all` and a small
          `computeSessionInitLoadNeeded` helper that returns `undefined` outside `refState === "same"`
          and `direction === "behind"` inside it. `direction === "behind"` already encodes the load-needed
          conditions exactly — note advanced past materialized basis (`note.commit !== sourceCommit` with
          `isAncestor(sourceCommit, note.commit)`) plus disk hash equal to `materializedManifestHash`
          (no local edits). Folding the rule into the existing `inspectDiskVsLocalSnapshot` direction
          taxonomy avoided duplicating the ancestry call at the call site and kept the call-site primitive
          shape identical to 4.2.d's pattern. `inferUserSyncCause` is not invoked — focused-taxonomy
          invariant from 4.2.c short-circuits on `same` refs.

        - `loadNeeded` is surfaced only on the clean arm of `buildUserSessionInitStatusResult`'s switch
          and only when defined — `local-ahead` collapses to `clean` spine but produces `undefined`
          here, so the field is omitted symmetrically with non-clean spine states. Workflow consumers
          can treat the field uniformly via a truthy check.

        - Tests batched in a new `runUserSessionInitStatus loadNeeded probe` describe block — tightly
          coupled (shared IO scenario builder, single conditional implementation), so per the
          test-first method's batching judgment they were authored together rather than sliced
          one-at-a-time. Six cases cover the four orchestrator behaviors plus an `it.each` over
          non-clean spine states (`remote-ahead`, `diverged`, `remote-unavailable`); the
          identity-absent behavior is enforced at the higher CLI probe layer (`runUserSessionInitStatus`
          requires identity in its signature) and stays out of this unit. The existing
          "returns disabled" test gained a `loadNeeded` omission assertion.

        - Affected files:
            - `packages/arc-framework/src/commands/user/sync-status.ts` (Promise.all extension,
              `computeSessionInitLoadNeeded` helper, clean-arm field plumbing)
            - `packages/arc-framework/src/commands/user/types.ts` (`loadNeeded?: boolean` on
              `UserSessionInitStatusResult` with consumer-rule TSDoc)
            - `packages/arc-framework/__tests__/unit/user-status.test.ts` (six new probe-behavior
              cases plus a disabled-arm omission assertion on the existing test)

    - `[x]` **4.3.c Workflow Step 2 notes-load cascade**

        - Added a **Notes-load dispatch** subsection to `session-init.md` Step 2 keyed on
          `user.value.loadNeeded === true`, dispatching on `session.init_load.notes` (`always` →
          immediate `arc user load` with dirty-tree degrading to `prompt`; `prompt` → ask first;
          `manual` → orientation surface only). Pre-load backup is named as the safety net for the
          auto-action case.

        - Generalized the **Combined prompt** section: the envelope still pre-composes
          `recommendedCombinedPrompt` for the two-pull case (worktree-pull + notes-pull); the agent
          composes locally for the worktree-pull + notes-load combo. Notes-pull and notes-load are
          mutually exclusive on the notes channel (one fires on `refState ∈ {remote-ahead, conflict}`,
          the other on `refState === "same"`), so no three-way combo arises in practice — called out
          explicitly to keep the dispatch reasoning closed.

        - Renamed **Notes-pull ordering** → **Notes operation ordering** so it covers both pull and
          load: either operation must complete before Step 3, since SESSION-NOTES reads would
          otherwise be stale. Identity-absent block extended to mention notes-load skipping
          alongside notes-pull.

        - Step 1 envelope table updated: `user` row carries the new `value.loadNeeded?: boolean`
          field spec (clean-arm-only with the cross-machine resume gap rationale); `config` row adds
          `session.init_load.notes` to the session-relevant settings list. Padded all data rows to a
          single closing-pipe column to satisfy MD060 alignment after the longer `user` row.

        - Mirrored to
          `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-init.template.md`
          with the table-padding script applied to its larger row width (max-row alignment differs
          between project copy and template because the team-mode block and `{{REPO_ROOT}}`
          placeholder live only in the template — preserved per existing convention).

        - Test surface = markdown lint (zero violations) per the task spec; behavioral coverage
          lives in 4.3.b's probe-behavior cases.

### `[ ]` **4.4 JIT commit-format loading at arc-commit**

- _Goal:_ Drop the `commit-format.md` + `commit-context-format.md` load set from session-init Step 3 under
  `session.commit_interlock: on-task-approval` — the methods load via arc-commit Step 3 (or prepare-commits
  frontmatter) at first commit, not at every session start. Reduces init token load by ~3-4k unconditionally.
    - Depends on the entrypoint tightening already applied: process-task-loop Step 4 routes commits through
      arc-commit; arc-commit Step 3 loads both methods regardless of simple-vs-complex path. The load is
      reliable at fire time; init-time pre-loading is no longer pulling weight.
    - Affected files (audit-enumerated):
        - `.arc/system/workflows/arc/session-lifecycle/session-init.md` — remove the "Commit-interlock load
          set" block from Step 3 (3 sentences)
        - `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-init.template.md` —
          mirror
        - `.arc/system/workflows/arc/session-lifecycle/session-init.contributor.md` +
          `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-init.contributor.md` —
          mirror if the same block is duplicated there
        - `.arc/reference/strategies/arc/strategy-session-operations.md` — remove the
          `### Commit-Interlock Load-Set` subsection. The section justified eager-loading; with eager-loading gone,
          the rationale is moot. Loading is documented at the call site (`arc-commit` SKILL § 3). No replacement
          paragraph needed.
    - Test-after — documentation only; no automated assertion. The behavioral check is "init no longer Reads
      commit-format / commit-context-format under any commit-interlock mode." Confirm via
      `grep -rn 'commit-format' packages/arc-framework/__tests__/` that no test pins the load-set Reads to include
      commit-format methods at session-init.

### `[ ]` **4.5 Handoff probe `restateCandidates` slot**

- _Goal:_ Extend `arc status --session-handoff --json` envelope with a `restateCandidates` slot carrying
  commits, closed tasks, and notes-file changes since the last handoff. The handoff workflow's SESSION-NOTES
  filter prose collapses against structured data instead of recall — eliminating the most error-prone,
  mechanical part of the filter ("did I just paraphrase a commit subject?").

- _Shape:_

    ```json
    {
      "restateCandidates": {
        "commitsSinceHandoff": [
          { "hash": "f044c8d0", "subject": "docs(user-sync): apply Phase 4 audit findings" }
        ],
        "tasksClosedSinceHandoff": ["2.R.6.e", "2.R.6.f"],
        "noteFileChangesSinceHandoff": ["notes-user-sync-ux.md"]
      }
    }
    ```

    - `[ ]` **4.5.a `restate-candidates` helper module**

        - _Goal:_ Pure helper that derives the slot from baseline hash + IO context. Independent of probe
          orchestration and workflow doc — can land first.

        - _Computation:_ `git log <commit-at-handoff>..HEAD --oneline` (subjects + hashes); commit-message walk
          in the same range with `Context:` lines extracted and the regex
          `/Task[s]? ([0-9]+(?:\.[0-9A-Za-z]+)+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?)/g` applied to each,
          emitting individual IDs (`4.2`, `2.3.a`, `2.R.6.e`) and raw range strings (`4.2-4.5`, `2.3.c-e`)
          deduplicated into a flat array — range expansion is intentionally not performed (consumer handles
          range membership as natural-language judgment); `git diff --name-only <commit-at-handoff>..HEAD`
          filtered on `notes-*.md`. When SESSION-NOTES is absent, the field is missing, or the baseline commit
          is unreachable from HEAD (force-push, rebase), returns
          `{commitsSinceHandoff: [], tasksClosedSinceHandoff: [], noteFileChangesSinceHandoff: []}` and surfaces
          a soft signal ("baseline unknown") so the workflow falls back to recall-based filtering.

          Computation rests on ARC's one-task-per-commit discipline: under proper usage, "tasks named in
          `Context:` footers" and "tasks closed" are the same set. Discipline violations (committing partial
          work without a leaf-task closure) manifest as over-reporting in this field — tolerable for a filter
          signal.

        - Affected files:
            - new `packages/arc-framework/src/lib/handoff/restate-candidates.ts` exporting
              `deriveRestateCandidates`
            - new `packages/arc-framework/__tests__/unit/handoff/restate-candidates.test.ts`

        - Build `test-first` (one behavior at a time):
            - Returns commits between SESSION-NOTES `Commit at Handoff` and HEAD with hash + subject
            - Empty result when HEAD matches `Commit at Handoff`
            - Extracts task IDs from `Context:` footers in the range — single forms (`(Task 4.2)`,
              `(Task 4.2.a)`, `(Task 4.2.R)`) emit individual IDs
            - Range and list patterns extracted as raw strings: `(Tasks 4.2-4.5)` emits `["4.2-4.5"]`;
              `(Tasks 6.1.h, 6.2.a-d)` emits `["6.1.h", "6.2.a-d"]`; `(incidental - discovered during Task 4.3)`
              emits `["4.3"]`
            - Returns `notes-*.md` paths touched in the range; ignores other file changes
            - Missing SESSION-NOTES → empty arrays + soft "baseline unknown" signal
            - Missing baseline hash in SESSION-NOTES → empty arrays + soft signal
            - Baseline commit unreachable from HEAD (force-push, rebase) → empty arrays + soft "baseline
              unknown" signal

    - `[ ]` **4.5.b Probe wiring**

        - _Goal:_ Wire `deriveRestateCandidates` into the `arc status --session-handoff --json` envelope.

        - Affected files:
            - `packages/arc-framework/src/commands/status/types.ts` (slot type + `SessionHandoffResult`
              extension)
            - `packages/arc-framework/src/commands/status/run.ts` (probe orchestration)
            - `packages/arc-framework/src/handlers/status.ts` (probe construction with bound IO + SESSION-NOTES
              baseline read)
            - `packages/arc-framework/__tests__/unit/status/run.test.ts` (slot included in expected key set;
              per-slot success + soft-signal cases)

        - Build `test-first` (one behavior at a time):
            - `runSessionHandoffStatus` envelope includes `restateCandidates` slot
            - Probe success path returns the helper's result verbatim
            - Probe failure (helper throws) returns `{ok: false, error: {kind: "runtime", message}}` per
              existing probe-error contract

    - `[ ]` **4.5.c Workflow doc rewrite**

        - _Goal:_ Restructure session-handoff.md SESSION-NOTES filter section as a two-pass pipeline: mechanical
          cross-check first, judgment-based 3-criterion filter second.

        - _New filter shape_ (replaces existing `**The filter — include only if all three hold:**` block):

            ```markdown
            **Filter pipeline — apply both passes:**

            **Pass 1 — Cross-check `restateCandidates`.** Probe slot carries `commitsSinceHandoff`,
            `tasksClosedSinceHandoff`, and `noteFileChangesSinceHandoff` for this session. If candidate content
            paraphrases an entry, omit. Mechanical step — array-driven, not judgment. When the soft signal
            "baseline unknown" fires, skip Pass 1 and rely on Pass 2.

            **Pass 2 — 3-criterion filter on the residual:**

            1. **Not in any durable tracked source.** PRD, strategy, constitution, plan docs, ADRs — those are
               authoritative; duplicating creates shadow copies that drift.
            2. **Acted on at step 0.** Orientation-relevant — changes what the next session does or checks when
               it loads. Not a retrospective observation you "want on record."
            3. **Costly if missing.** Re-deriving from tracked state in 30 seconds is not rework; a
               misinterpretation costing an hour of re-debugging is.

            If any criterion fails, omit. Empty sections write `[none]`.
            ```

        - Net trim ~10 lines from the filter section (criterion #1's example list collapses; cross-check adds
          new but compact text). Stay-out list and per-section guidance stay as-is — they cover broader
          anti-patterns the cross-check doesn't.

        - Affected files:
            - `.arc/system/workflows/arc/session-lifecycle/session-handoff.md` (filter section)
            - `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-handoff.template.md`
              (mirror)

        - Test-after — workflow doc lint; behavioral coverage already lives in 4.5.a/b.

### `[ ]` **4.6 Pre-computed prose in session-init Step 2 and Confirm Handoff**

- _Goal:_ Push judgment-heavy message selection from workflow prose into CLI/orchestrator output. Two
  surfaces:

    1. **Session-init Step 2 sync-pull decision** — probe envelope's `worktree` and `user` slots gain a
       `recommendedAction` field ∈ `{pull, prompt, surface, skip}` derived from current state ×
       `session.init_pull.*` config. When `prompt`, the slot also carries `recommendedPromptText` —
       channel-named, dirty-tree-warning-aware, count-included. Workflow rule collapses to "execute the
       slot's `recommendedAction`; show `recommendedPromptText` when prompting."
    2. **Handoff Confirm Handoff message** — `arc sync --json` envelope gains a
       `recommendedSummaryLine` field with the state-aware top-level message ("**Reconcile required:**
       `<branch>` diverged from..." / "**Worktree:** N unpushed..." / null when nothing to surface).
       Workflow Confirm Handoff section's conditional matrix collapses to "if non-null, prepend
       `recommendedSummaryLine` above `**Sync:**`."

- _Shape:_ Both surfaces follow the same principle — CLI computes from canonical inputs (state + config),
  workflow renders. Strings owned by code, not prose.

- _Sequencing:_ Land 4.6.a (session-init Step 2) before 4.6.b (Confirm Handoff) — the session-init
  surface has more conditional branches and bigger judgment savings; Confirm Handoff is a follow-on
  refinement.

    - `[x]` **4.6.a Session-init Step 2 `recommendedAction`**
        - New helper `lib/session-init/recommended-action.ts` (`inferSessionInitRecommendations`) composes
          per-channel `recommendedAction` ∈ `{pull, prompt, surface, skip}` and `recommendedPromptText`
          (channel-named, count-included, dirty-tree-aware) from resolved worktree/user/dirty signals plus
          the `session.init_pull.*` policies. `runSessionInitStatus` now also fans out a `dirty` probe
          (mirroring session-handoff), passes the resolved slots into the helper, and attaches the
          recommendation pair to the worktree/user values via the new `SessionInitWorktreeValue` /
          `SessionInitUserValue` types. Top-level `recommendedCombinedPrompt` populates only when both
          channels resolve to `prompt`. Helper falls back to skip-everything when any required input slot
          fails — workflow surfaces probe failure separately.
        - `session-init.md` Step 2 collapsed: per-channel `recommendedAction` dispatch replaces the
          state×config conditional matrix; combined-prompt section now keys on `recommendedCombinedPrompt`
          non-null. Step 1 envelope table extended with `dirty`, `recommendedCombinedPrompt`, and the
          recommendation fields on `worktree` / `user`. Mirrored in the package template copy.
        - Tests: 25 helper-side cases in `__tests__/unit/session-init/recommended-action.test.ts`
          (state × policy × dirty); 8 orchestrator cases in `__tests__/unit/status/run.test.ts` covering
          dirty-probe fan-out, recommendation pass-through, identity-missing skip, and probe-failure
          fallback. Test batching used per the test-first method's batching-judgment clause — pure helper
          with a known state table, shared fixtures, no independent discovery between behaviors.

    - `[ ]` **4.6.b Confirm Handoff `recommendedSummaryLine`**
        - Field added to `arc sync --json` envelope and to the session-handoff envelope (when sync
          auto-invoke is skipped per `syncInterlock.value: manual`).
        - Affected files: `packages/arc-framework/src/handlers/sync.ts` (envelope shape +
          line composition); session-handoff.md Confirm Handoff section prose replacement; tests across
          paired/blocked/diverged/manual/identity-absent cells.
        - Build `test-first` (one behavior at a time):
            - `cell === "blocked-diverged"` → "**Reconcile required:**..." line composed
            - `worktree.value.state === "diverged"` (manual mode skip) → same line
            - Manual mode + N > 0 unpushed → "**Worktree:** N unpushed commit(s)..." line
            - Clean state + nothing to surface → `recommendedSummaryLine: null`
            - Identity absent → null (notes guidance lives in `**Sync:**` line, not the conditional top)

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

- _Goal:_ WU success criteria verified through the verification workflow; quality gates pass at Tier 3; Phase 2.R
  remediation complete; atomic-task companion drained.

---

## Success Criteria

- `[ ]` Cross-machine resume produces directionally-correct action hint (machine A push → machine B `git pull` +
  `arc status` recommends `arc user pull`)
- `[ ]` `arc user load` and `arc user pull` succeed when notes attach to commits outside HEAD's ancestry
  (notes-ref-history walk is the default)
- `[ ]` Worktree-ahead-of-origin scenarios produce coherent save/push behavior — `arc user save` preserves working
  state; `arc user push` blocks with guidance; never claims notes-push success against unpushed commit
- `[ ]` Paired-push partial failures produce non-zero exit, itemized output marking each leg, and idempotent recovery
  via `arc user push`
- `[ ]` Full-mode and session-init `arc status` agree about underlying git state across all 5 spine states +
  partial-push condition (verified by paired-call test fixtures)
- `[ ]` Pushability pre-checks block or surface server errors per the documented matrix (rebase, detached HEAD,
  no-upstream, protected branch, hook failure, auth, force-push, worktree-not-aligned-with-origin)
- `[ ]` All four release-mode keys (`session.commit_interlock`, `session.push_interlock`, `session.sync_interlock`,
  `user.notes_push`) support 3-tier resolution via per-dev `arc.*` overrides
- `[ ]` `arc update` migrates legacy `user.sync_push` and `push_interlock: on-handoff` configs; old keys/values removed;
  no dual-key window; strategy docs reflect canonical shape with the three-layer cascade documented
- `[ ]` `arc sync` (top-level orchestrator) dispatches over the 6-cell matrix; `arc user sync` (former `arc sync`)
  remains the notes-only direction-aware command. `arc user --help` lists `save / load / push / pull / fetch / sync`;
  both surfaces cross-reference
- `[ ]` `arc sync --json` is a pure machine contract: stdout is one parseable JSON object across paired, save-only,
  blocked, and prompt-policy cells; no prompt/spinner/log output contaminates it
- `[ ]` Handoff sync has cross-clone coverage: clone A `arc sync --json` creates a verified current-`HEAD` note and
  pushes it; clone B can fetch/pull notes and session-init/handoff freshness reflects current `HEAD`
- `[ ]` `arc user save` success verifies the exact `HEAD` note before `.sync-state.json` advances
- `[ ]` Every `arc sync` worktree push leg runs through the shared pushability/state gate; no matrix cell relies on raw
  `git push` as its only guard
- `[ ]` `session.sync_interlock: manual` opts handoff out of automatic sync; handoff summary surfaces unpushed state
  without firing pushes
- `[ ]` First-use framing surfaces operational: `arc join` install paragraph, `arc status` hint with notes-ref-existence
  trigger
- `[ ]` Notes-ref bounded-fetch fires on full-mode `arc status`; `--offline` suppresses both probes and degrades cause
  classification with explicit guidance; sibling-session vs. cross-machine causes inferred and surfaced
- `[ ]` Layered vocabulary rule applied: "user notes" workhorse noun across headlines/hints/summaries; "git notes ref"
  only when storage mechanism is relevant
- `[ ]` Disk-vs-note direction inference (`sourceCommit` ancestry) distinguishes "disk behind note" from "disk has
  unsaved edits"; status output recommends `arc user load` vs `arc user save` accordingly — no silent overwrite of
  freshly fetched newer notes
- `[ ]` `arc user status` default output is action-oriented (one-line headline + one-line context + `Next step:`);
  `--verbose` retains today's three-tier detail and pre-load backup enumeration; `--json` envelope shape unchanged
- `[ ]` Session-init detects ref-aligned-but-disk-behind state and offers `load` per `session.init_load.notes`
  (`prompt | always | manual`); dirty-tree precheck refuses auto-load; combined prompt covers concurrent worktree-pull +
  notes-load scenarios
- `[ ]` Session-init no longer pre-loads commit-format / commit-context-format methods under any
  `commit_interlock` mode; arc-commit Step 3 owns the load on first commit
- `[ ]` Handoff probe envelope carries `restateCandidates` (commits / closed tasks / notes-file changes since
  last handoff); SESSION-NOTES filter prose collapses against structured data
- `[ ]` Session-init Step 2 sync-pull decision and handoff Confirm Handoff summary line are computed in the
  CLI and surfaced as envelope fields; workflow prose renders, doesn't decide
- `[ ]` All quality gates pass (markdown lint, TypeScript type check, full Vitest suite, build verification)
- `[ ]` Ready for integration

[verify-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
