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

### `[ ]` **3.1 Resolver consolidation**

- _Goal:_ One 3-tier resolver helper handles `user.notes_push` and the three interlock keys, returning
  `{ value, source }` so downstream consumers can audit precedence.
    - Extract the precedence logic shared by `user.notes_push` (and the new interlock keys in 3.3) into a generic helper
      — `resolveGitConfigOverride<T>`.
    - Return shape (stable downstream-consumer contract): `{ value: T, source: "git-config" | "yaml" | "default" }`.
      Source-tracking is **required**, not optional — the planned interlock-release wrappers' audit log carries
      "interlock state at decision time" with provenance, and the authorization footer's `abbreviated | full` modes
      surface source per `plan-interlock-release-wrappers.md` § Audit log / § Authorization footer.
    - Migrate `lib/sync-policy.ts` onto it. The helper resolves git-config override → yaml → default in 3-tier order.
    - **Migration path:** Replace `resolveSyncPushPolicy`'s body with a thin call to the generic helper (per-key
      validator + key strings + default baked in); the function returns `{ value, source }` directly — no `policy`
      field, no shim. Three call sites destructure `.policy` today and migrate to `.value`: `handlers/sync.ts`,
      `handlers/user-sync.ts`, `handlers/status.ts`. The function-name rename
      (`resolveSyncPushPolicy` → `resolveNotesPushPolicy`) folds into 3.2.a alongside the yaml-key, git-config-key,
      and value-enum renames; this task keeps the existing function name to bound scope.

    - Affected files: `packages/arc-framework/src/lib/sync-policy.ts`; new
      `packages/arc-framework/src/lib/config/resolve-override.ts`. Export path, return shape, and generic signature are
      pinned as a stable downstream-consumer API — the planned interlock-release wrappers' validation library builds on
      this contract.
    - Build `test-first` (one behavior at a time):
        - Git-config value present → returns `{ value, source: "git-config" }`
        - Git-config absent + yaml present → returns `{ value, source: "yaml" }`
        - Both absent → returns `{ value: default, source: "default" }`
        - Invalid value at any tier emits a warning and falls through to the next tier; final fallback is the
          documented default. Asymmetric throw-vs-substitute behavior between git-config and yaml layers is rejected —
          both layers warn-and-fall-through.
        - `sync-policy.ts` migrated → existing sync-policy tests pass with `.policy` → `.value` field rename and
          warn-and-fall-through behavior unchanged

### `[ ]` **3.2 Config-shape alignment**

- _Goal:_ Rename `user.sync_push` → `user.notes_push` end-to-end and migrate adopters in place.

    - `[ ]` **3.2.a Yaml schema, value enum, and surface rename**
        - Rename yaml key `user.sync_push` → `user.notes_push` in config schema/validation; rename git-config override
          `arc.syncPush` → `arc.notesPush`; rename the resolver function `resolveSyncPushPolicy` →
          `resolveNotesPushPolicy` and the module's exported constants/types
          (`SYNC_PUSH_YAML_KEY` → `NOTES_PUSH_YAML_KEY`, `SYNC_PUSH_GIT_CONFIG_KEY` → `NOTES_PUSH_GIT_CONFIG_KEY`,
          `SyncPushPolicy` → `NotesPushPolicy`, `DEFAULT_SYNC_PUSH_POLICY` → `DEFAULT_NOTES_PUSH_POLICY`).
        - Value enum: `manual | prompt | on-sync` (semantic identity: `always` ⇄ `on-sync`). Each interlock value names
          its own trigger event per R9.
        - Affected files (audit-enumerated):
            - `packages/arc-framework/src/lib/config/status-reader.ts` (DEFAULTS map + `AGENT_CONSUMABLE_KEYS`; add
              notes_push to `ENUM_VALIDATORS` if validating at TS layer — note 3.3 then removes the four release-mode
              keys from `ENUM_VALIDATORS` per the validator source-of-truth pin)
            - `packages/arc-framework/src/lib/sync-policy.ts` (constants + types listed above; `resolveSyncPushPolicy`
              function; rename module-internal types)
            - `packages/arc-framework/src/commands/config/types.ts` (`ConfigSettings` and `ConfigSessionInitSettings`
              interface keys)
            - `packages/arc-framework/src/lib/config/index.ts` (`buildConfigKeyOverrides` install-time team-mode
              default)
            - `packages/arc-framework/arc/system/scripts/validate-config.sh` (`validate_enum` line for
              `user.sync_push` + `known_keys` list)
            - `packages/arc-framework/arc/system/arc-config.yml` + `.arc/system/arc-config.yml` (key + comment block —
              multiple mentions in surrounding prose; both copies)
        - Test fan-out (audit-enumerated; expect rename touches in addition to logic changes):
            - `__tests__/unit/sync-policy.test.ts` (constants + import names; `.policy` → `.value` field rename)
            - `__tests__/unit/init.test.ts` (`overrides["user.sync_push"]` → `overrides["user.notes_push"]`)
            - `__tests__/unit/config/status-reader.test.ts`
            - `__tests__/unit/user-handlers.test.ts`
            - `__tests__/unit/config-format.test.ts`
            - `__tests__/unit/status-format.test.ts`
            - `__tests__/integration/config.test.ts`, `__tests__/integration/init.test.ts`
            - `__tests__/e2e/sync-purity.e2e.test.ts`
            - `__tests__/unit/sync-orchestrator.test.ts`, `__tests__/unit/sync.test.ts` (mocks + imports)
        - Build `test-first` (one behavior at a time):
            - Schema validates new key+values; rejects old key
            - `on-sync` value resolves equivalently to legacy `always`
            - Git-config override reads from `arc.notesPush`
            - Shell validator accepts new key+values; rejects old key+values

    - `[ ]` **3.2.b `arc update` migration logic**
        - **Inline one-shot migrator** — versioned migrator-registry infrastructure deferred (see
          `BACKLOG-TECHNICAL.md` § Migration Infrastructure). One module-private function
          `migrateUserSyncPush(yamlContent: string): string` runs unconditionally in `update.ts` before three-way
          merging the template against the migrated yaml. Detects already-migrated content and no-ops; idempotent.
          When a second config-key rename surfaces, escalate to a dedicated WU at that point — the inline function
          becomes the registry's first registered migration cleanly.
        - Migrations applied by this function:
            - `user.sync_push: {value}` → `user.notes_push: {translated}` (key rename + value translation: `always` →
              `on-sync`; `prompt` / `manual` carry forward).
            - `session.push_interlock: on-handoff` → `on-sync` (value rename; key unchanged). **Adopter correctness
              note:** the framework template + this self-hosting repo are already migrated to `on-sync` (per 2.2.c.i).
              Pre-2.2.c.i adopters with `on-handoff` in their yaml will fail validation on next `arc update` unless this
              migration runs.
            - Old `user.sync_push` key removed; no dual-key window.
        - Affected files: `packages/arc-framework/src/commands/update.ts` (inline migrator function + call site before
          three-way merge).
        - Build `test-first` (one behavior at a time):
            - `user.sync_push: always` → `user.notes_push: on-sync` translation
            - `prompt` and `manual` carry forward unchanged
            - `session.push_interlock: on-handoff` → `on-sync` translation
            - Old `user.sync_push` key absent post-migration
            - Idempotent: re-running migration on already-migrated config is a no-op
            - Both keys present (manual paste) → new key wins; old key removed; warn surfaced
            - Invalid value in legacy key (`user.sync_push: garbage`) → preserved as-is (no translation of unknown
              values); shell validator catches downstream
            - Three-way merge interaction: adopter with customized `user.sync_push: prompt` produces migrated
              `user.notes_push: prompt` against new template's `user.notes_push: on-sync` → three-way merge surfaces
              a conflict on the value (both sides changed the line differently); adopter resolves manually per the
              standard `arc update` conflict path

    - `[ ]` **3.2.c Strategy and reference doc updates**
        - Retire the documented-but-unused `auto / prompt / manual` standard from `strategy-session-operations.md` §
          Handoff-Interior Toggle Pattern. Canonical shape becomes `manual | on-X` where `X` names the operation's
          trigger event; `prompt` stays opt-in for review-before-fire toggles.
        - Document the three-layer cascade (handoff event → sync; sync event → push and notes-push) explicitly. Each
          interlock's `on-X` value names its own trigger. Authorize-by-invocation: `arc sync` running mid-session is an
          explicit sync event.
        - Affected docs (audit-enumerated; live + adopter-shipped — package-project sync requires updating the package
          mirror alongside the `.arc/` instance):
            - `.arc/reference/QUICK-REFERENCE.md` + `packages/arc-framework/arc/reference/QUICK-REFERENCE.template.md`
            - `.arc/reference/strategies/arc/strategy-configurability-architecture.md` + package mirror at
              `packages/arc-framework/arc/reference/strategies/arc/`
            - `.arc/reference/strategies/arc/strategy-session-operations.md` + package mirror
            - `.arc/reference/strategies/arc/strategy-team-coordination.md` + package mirror
            - ADRs (project-internal; no package mirror per DEV-RULES.PROJECT § ADRs):
              `.arc/reference/adr/adr-012-adopt-unified-user-directory-model.md`,
              `.arc/reference/adr/adr-016-configurable-autonomy-interlocks-for-session-operations.md` — assess
              amendment-trailer vs. content-edit posture per ADR strategy at implementation time
        - Test-after — documentation only.

### `[ ]` **3.3 Per-developer overrides for interlock keys**

- _Goal:_ Plumb `arc.commitInterlock`, `arc.pushInterlock`, and `arc.syncInterlock` git-config overrides through to the
  four release-mode keys' resolution (`session.commit_interlock`, `session.push_interlock`, `session.sync_interlock`,
  `user.notes_push`). (`session.sync_interlock` schema entry itself lands in 2.2.c.i; the `arc.notesPush` rename lands
  in 3.2.a; this task adds the per-dev override surface for all four keys against final-shape config-key names.)

- _Shape:_ per-dev resolution layers **on top of** `readConfigSettings` via the 3.1 helper, not by mutating the
  status-reader's signature. `readConfigSettings` stays yaml-only (no `exec` dependency); a thin wrapper composes the
  yaml read with per-key `resolveGitConfigOverride<T>` calls. Callers that need the resolved values (handlers, sync
  orchestrator, status command) move to the wrapper; pure-yaml callers (config-status report) stay on the reader
  directly.
    - **Validator source-of-truth:** per-key resolver functions own enum validation for the four release-mode keys —
      validators are passed once into the generic helper. `status-reader.ts`'s `ENUM_VALIDATORS` map removes the four
      release-mode keys (yaml values for those keys flow through the reader as raw strings; the wrapper applies
      validation). Single source of truth per key; no double-validation across yaml and git-config tiers.
    - **Spawn cost:** wrapper issues four `git config --get` calls via `Promise.all`; ≈ one round-trip latency. Add
      caching only if profiling shows it.
    - Companion `sourceMap: Record<key, "git-config" | "yaml" | "default">` returned alongside the resolved settings.
      Diagnostic surfaces (orchestrator `--json` envelope, status output) consume it. When adding provenance to
      `arc sync --json`, keep it inside the structured envelope; do not emit Clack/log output that would corrupt
      machine-readable stdout.
    - This per-dev resolution layer is the **validation read path** for the planned interlock-release wrappers'
      validation library (per `plan-interlock-release-wrappers.md` § Interlock-validation library). The wrappers call
      `resolveGitConfigOverride<T>` per key directly; 3.3 ensures the full release-mode key surface is consistently
      resolvable.

    - Additive at the wrapper boundary — no breaking changes to existing yaml-only callers (config-status report).
      Handlers that need resolved values move to the wrapper.
    - Affected files: `packages/arc-framework/src/lib/config/status-reader.ts` (remove four release-mode keys from
      `ENUM_VALIDATORS`; module-comment notes the layering boundary); new wrapper in
      `packages/arc-framework/src/lib/config/` composing the 3.1 helper + status-reader; handler call-site migrations
      (`handlers/sync.ts`, `handlers/user-sync.ts`, `handlers/status.ts`, plus any sites consuming the four
      release-mode keys' resolved values).
    - Build `test-first` (one behavior at a time):
        - `arc.commitInterlock` git-config set → wrapper returns git-config value with
          `sourceMap[commit_interlock] === "git-config"`
        - `arc.pushInterlock` git-config set → likewise for push interlock
        - `arc.syncInterlock` git-config set → likewise for sync interlock
        - `arc.notesPush` git-config set → likewise for notes push
        - Git-config absent + yaml present → falls through to yaml; sourceMap reflects "yaml"
        - All absent → defaults; sourceMap reflects "default"
        - Invalid git-config value → warns and falls through to yaml; sourceMap reflects "yaml"
        - Invalid yaml value → warns and falls through to default; sourceMap reflects "default"

### `[ ]` **3.4 Layered vocabulary rule application**

- _Goal:_ User-facing surfaces use "user notes" as the workhorse noun; storage-mechanism terminology ("git notes ref",
  `refs/notes/...`) appears only when the storage layer is relevant.
    - **Scope: delta-only sweep, not full re-audit.** Phase 1.4 (directional copy audit) and Phase 2.R already balanced
      directional copy and naming across `sync-status.ts` and adjacent surfaces. 3.4's pass identifies and standardizes
      residual `git note(s)` references, pre-rename config-key strings (`sync_push`, `arc.syncPush`), and any
      user-facing strings that drifted from the workhorse-noun rule. **Do not rebalance comparison-pair phrasing
      already pinned by 1.4/2.R** — the comparison-named-on-both-sides invariant takes precedence over noun-uniformity.
    - "Git notes ref" or "git notes" surfaces only when storage mechanism is relevant (debugging, ref state, error
      messages mentioning `refs/notes/...`).

    - Affected files (audit-enumerated; verify residuals only — many already in workhorse-noun shape post-1.4/2.R):
        - `packages/arc-framework/src/commands/user/sync-status.ts` (primary rendering surface)
        - `packages/arc-framework/src/commands/user/format.ts` (summary builders)
        - `packages/arc-framework/src/commands/user/save-load.ts` (error messages)
        - `packages/arc-framework/src/commands/user/push-fetch.ts` (status / handler messaging)
        - `packages/arc-framework/src/commands/user/types.ts` (any user-facing copy in error classes / type defaults)
        - `packages/arc-framework/src/handlers/user.ts` (UX strings + prompts)
        - `packages/arc-framework/src/handlers/user-sync.ts` (direction-aware UX strings)
        - `packages/arc-framework/src/handlers/sync.ts` (orchestrator messages)
        - `packages/arc-framework/src/handlers/push-recovery.ts` (recovery-prompt copy)
        - `packages/arc-framework/src/cli.ts` (subcommand help text)
    - Test-after — rendering and string-content audit, not logic change.
    - Boundary: this is a human-copy pass. Do not rename machine-readable JSON discriminants (e.g. internal-kind
      labels like `"git note up to date"` in `sync-status.ts`), config keys, or enum values unless an explicit
      migration task owns that change. Display strings derived from those kinds may be reworded to align with the
      workhorse-noun rule. Preserve comparison-specific copy introduced by the stale-local/no-op and save-verification
      fixes.

## **Phase 4:** DX polish

_Purpose:_ Round out the developer experience. R16 first-use framing surface, R17 shared-ref sync-state inference.
Builds on Phase 1's unified spine for the bounded-fetch extension and on Phase 3's vocabulary alignment for first-use
copy strings.

### `[ ]` **4.1 First-use framing surface**

- _Goal:_ Introduce the user-notes feature and orient new developers without a suppression-flag burden.

    - `[ ]` **4.1.a `arc join` post-init paragraph**
        - One-time install paragraph briefly explaining where the gitignored personal context lives and that it travels
          via push/pull as a git notes ref attached to commits.
        - Affected file: `packages/arc-framework/src/handlers/join.ts` — append to the post-join `lines` block
          (currently rendering "What's next" via `p.note`). Optional refactor to extract a `buildPostJoinMessage` helper
          analogous to `commands/init.ts:buildPostInitMessage` if the message grows enough to warrant separation.
        - Test-after — output formatting per project testing methodology.
        - Concrete paragraph copy finalizes at implementation time.

    - `[ ]` **4.1.b `arc status` single-line hint**
        - Single-line hint pointing at `arc user --help`, conditional on local notes ref absence (no
          `refs/notes/arc/user/{identity}` present).
        - Naturally bounded — fires until first handoff (or manual `arc user save`) creates the local ref, then stops.
          No suppression flag.
        - Affected file: `packages/arc-framework/src/commands/user/sync-status.ts`.
        - Build `test-first` (one behavior at a time):
            - Local notes ref absent → hint appears in `arc status` output
            - Local notes ref present → hint absent
            - Hint absence is silent (no flag, no flag-checking code path)

### `[ ]` **4.2 Shared-ref sync-state inference**

- _Goal:_ `arc status` distinguishes single-session, sibling-session, and cross-machine causes for notes-ref divergence
  — actionable guidance over generic "remote ahead" framing, with `--offline` degrading classification explicitly.
    - Extend the bounded-fetch pattern (already in place for the worktree-sync probe) to the notes ref on full-mode
      `arc status` invocation. Inference helpers built here are designed for cross-surface reuse — Task 4.3 consumes
      them in the session-init probe to surface the disk-behind-note state for cascade handling.
    - Boundary: this task classifies why the notes-sync state differs; it does not decide which branch or work unit the
      identity should work on. Branch-gone recovery and target selection remain Worktree Foundation + Coord Probe scope.
    - Downstream signal contract: preserve enough metadata from notes discovery for later routing work to consume
      (annotated commit, note-history distance, current-HEAD reachability, and inferred local / sibling-session /
      cross-machine cause).

    - Sync-state inference distinguishes:
        - Local-behind-because-haven't-fetched (single-machine, single-session)
        - Local-behind-because-other-machine (cross-machine work)
        - Local-behind-because-sibling-session (same machine, different worktree/session)
    - Sibling-session heuristic: compare `LocalSyncState.sourceCommit` (from `.sync-state.json`) against the latest
      entry in `refs/notes/arc/user/{identity}` history. Divergence + both-local-only (no remote-ahead path) → sibling
      session. Cross-machine causes flow from remote ref differing from local ref state.
    - Schema extension: extend `LocalSyncState` (currently v2 — `version`, `materializedManifestHash`, `sourceCommit`,
      `sourceOperation`, optional `partialPush`) with `savedAt: ISO-string`. Bump to v3; readers parse v1 / v2 (existing
      forward-read pattern in `readLocalSyncState`) and write v3. Required for heuristics that need recency to compare
      timestamps. Coordinate with the save postcondition hardening: write or upgrade sync-state only after the exact
      `HEAD` note has been verified, and preserve `partialPush` marker semantics through the v3 migration.
    - `--offline` mode behavior: both worktree and notes fetches suppressed. Cross-machine vs. unfetched-local
      distinction collapses (no remote read available); surface a degraded classification ("offline — local state only;
      cross-machine signals unavailable") rather than asserting a cause heuristically.
    - Affected files: `packages/arc-framework/src/commands/user/sync-status.ts` (rendering + bounded-fetch);
      `packages/arc-framework/src/commands/user/save-load.ts` (`LocalSyncState` schema bump, read-with-forward-compat,
      write at v3).
    - Build `test-first` (one behavior at a time):
        - Bounded-fetch on notes ref fires by default in full-mode `arc status`
        - `--offline` suppresses both worktree and notes fetches; classification degrades with explicit guidance line
        - Sibling-session detection: `sourceCommit` divergent from notes-ref head, both local-only → state-machine
          resolves to "sibling session"
        - Cross-machine vs. unfetched-local distinction surfaced when remote ref differs
        - `LocalSyncState` v2 → v3 read forward-compat: existing v2 files load without error and get `savedAt = null`
          until the next save

### `[ ]` **4.3 Session-init load cascade**

- _Goal:_ Session-init detects ref-aligned-but-disk-behind state via the 4.2 inference helpers and offers
  `arc user load` per a new `session.init_load.notes` config knob — same shape as the existing `session.init_pull.notes`
  cascade, applied to the load-needed condition. Closes the cross-machine-resume gap where worktree pull silently
  advances the user-notes ref while working files stay stale, and session-init reports "everything synced" without
  surfacing the load action.
    - `arc status --session-init --json` envelope's user channel surfaces a load-needed signal (new `UserSyncSpine`
      state, or `loadNeeded: boolean` alongside existing state — shape decision at implementation) when notes ref is
      aligned with remote but disk is behind the latest note. Direction inference reuses the 2.R.4.a + 4.2 foundations.
    - `session-init.md` Step 2 notes-channel logic gains a load-needed case: `prompt` → ask before running
      `arc user load`; `always` → load without prompt; `manual` → surface in orientation only.
    - Combined-prompt integration: when worktree-pull and notes-load both need action, issue a single combined prompt
      with per-channel choices (load both / worktree only / notes only / skip), mirroring today's worktree-pull +
      notes-pull combined prompt.
    - Dirty-tree precheck refuses auto-load when working files have unsaved edits not reflected in the latest note —
      degrades to prompt or surface-only regardless of `always` setting. Pre-load backup mechanism (already part of
      `arc user load`) is the safety net for the auto-action case.
    - Config schema: new `session.init_load.notes: prompt | always | manual` key (default `prompt`). Mirrors
      `session.init_pull.notes` shape for consistency. Schema lands in `arc-config.yml` template + `.arc/` instance +
      shell validator + DEFAULTS map.

    - Affected files (audit-enumerated; confirm at implementation):
        - `packages/arc-framework/src/commands/user/sync-status.ts` (`runUserSessionInitStatus` envelope extension;
          load-needed signal derivation)
        - `packages/arc-framework/src/lib/config/status-reader.ts` (DEFAULTS + `AGENT_CONSUMABLE_KEYS` + enum validator
          entry)
        - `packages/arc-framework/src/commands/config/types.ts` (`ConfigSettings`, `ConfigSessionInitSettings` interface
          keys)
        - `packages/arc-framework/arc/system/scripts/validate-config.sh` (`validate_enum` line + `known_keys` list)
        - `packages/arc-framework/arc/system/arc-config.yml` (key + comment)
        - `.arc/system/workflows/arc/session-lifecycle/session-init.md` (Step 2 notes-channel state list + cascade
          handling + combined-prompt branch) plus package source mirror at
          `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/`
    - Build `test-first` (one behavior at a time):
        - Probe surfaces load-needed signal when ref aligned + sourceCommit ancestor of note's commit + disk hash
          matches materialized
        - Probe omits load-needed signal when refs aligned + disk hash matches note hash (clean state)
        - `session.init_load.notes: always` + clean tree → auto-load fires without prompt; orientation reports the
          action taken
        - `session.init_load.notes: prompt` → prompt issued before load; user accept runs `arc user load`; user decline
          surfaces in orientation
        - `session.init_load.notes: manual` → surface in orientation; no prompt
        - Dirty-tree precheck refuses auto-load even under `always`; degrades to prompt with explicit warning
        - Combined prompt fires when worktree-pull + notes-load both needed; per-channel accept handled correctly
        - Identity absent → load-needed signal omitted (no path for load); worktree channel still applies

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
- `[ ]` All quality gates pass (markdown lint, TypeScript type check, full Vitest suite, build verification)
- `[ ]` Ready for integration

[verify-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
