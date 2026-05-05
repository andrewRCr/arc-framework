# Task List: User Sync UX Polish

- **PRD:** `prd-user-sync-ux.md`
- **Branch(es):** `technical/user-sync-ux`
- **Base Branch:** `main`

- **Purpose:** Polish the user-notes sync surface — collapse dual state machines, align config and
  command vocabulary, and pin coherence guarantees that prevent cross-machine resume bugs and
  partial-push hazards.

---

## **Phase 1:** State-machine foundation

_Purpose:_ Unify the diagnostic spine. R1 single state computation, R2 notes-ref-history discovery,
R3 partial-push state, R6 directional copy audit, R7 worktree qualifier `failureReason`. Foundation
that Phase 2's coherence work builds on. PRD-pinned ordering: notes-discovery (1.1) precedes spine
unification (1.2) — unification builds on the new load semantic.

### `[x]` **1.1 Notes-ref-history discovery walk**

- `arc user load` and `arc user pull` now discover the newest readable user-note attachment by walking
  `refs/notes/arc/user/{identity}` history instead of HEAD ancestry.
- `--max-walk N` bounds note-ref history commits. Load/search results carry annotated-commit reachability and
  note-history distance for downstream routing work.
- Status and load summary copy no longer treats notes attached outside current HEAD ancestry as current with HEAD.
- Coverage added for outside-HEAD ancestry, branch-gone local refs, shallow clones, deleted latest note entries,
  empty note refs, and note-ref-history walk caps.

### `[x]` **1.2 State-machine spine unification**

- `sync-status.ts` now computes a shared `UserSyncSpine` from remote-sync enablement and
  notes-ref topology; full status, session-init, and `inspectUserSyncState` consume the same
  spine instead of maintaining separate state/action switch paths.
- Full `UserStatusResult` carries `spineState`, with disk status, saved age, and note-history
  distance layered as detail axes that do not change the underlying five-state spine.
- Unit coverage pins five-state exhaustiveness, paired full/session-init agreement, layered
  detail axes, and pull-directed `remote-ahead` recovery when local disk edits are present.

### `[x]` **1.3 Partial-push state on the spine**

- Partial-push recovery is now a validated coherence axis on the shared spine. Markers persist in
  `.internal/.sync-state.json`, are validated against the current local notes ref hash, clear when stale or
  already recovered, and surface an unverified recovery condition when the remote cannot be checked.
- Sync records the marker when notes push fails after a clean worktree publish state; `arc user push` clears it
  on successful recovery or idempotent already-matching pushes.

    - `[x]` **1.3.a Coherence-condition interface**
        - Added `UserSyncCoherenceState` / `coherenceState` as a detail axis layered on the shared spine.
          `partial-push` survives only with `local-ahead` notes topology, while the session-init spine state
          remains `clean`. Full-mode status now emits explicit partial-push recovery copy and points at
          `arc user push` retry guidance instead of the generic local-ahead hint.

    - `[x]` **1.3.b Partial-push marker persistence**
        - `.sync-state.json` now stores `partialPush.localRefHash` plus `sourceCommit`. Status validates the
          marker against the current local notes ref before surfacing it, clears stale or already-recovered
          markers, and reports `partial-push-unverified` when the marker matches locally but remote comparison
          is unavailable.

    - `[x]` **1.3.c Push-flow marker lifecycle**
        - Sync records a partial-push marker when a notes push fails after the worktree is clean against remote.
          `arc user push` passes repository context through the push-recovery path and clears the marker after a
          successful push, including no-op pushes where the remote already matches local notes.

### `[x]` **1.4 Rendering surface pass**

- Completed the `sync-status.ts` rendering pass so comparison copy names both sides and worktree
  remote-unavailable qualifiers surface timeout vs. auth/network failure detail.

    - `[x]` **1.4.a Directional copy audit**
        - Updated `sync-status.ts` rendering so summaries and detail lines explicitly name local
          notes, remote notes, working files, and origin upstream where comparisons are reported.
          Shared status and sync tests now pin the directional copy.

    - `[x]` **1.4.b Worktree qualifier `failureReason` surfacing**
        - `formatWorktreeQualifierLine` now renders timeout-specific retry/`--offline` copy and
          error-specific auth/network investigation copy for `remote-unavailable` worktree probes.
          Status and sync tests cover the rendered failure-reason surface.

## **Phase 2:** Coherence guarantees + orchestrator surface

_Purpose:_ Prevent notes-against-unpushed-commits and partial-publish bugs; introduce the
`arc sync` orchestrator that owns cross-cutting coherence routing. R4 unpushed-HEAD save/push,
R5 paired-push failure semantics, R10 command-shape rename + orchestrator, R11 sync-interlock,
R14 pushability pre-check matrix, R15 notes-push under manual worktree-push interlock. Builds
on Phase 1's unified spine for partial-push surfacing.

_Forward-compat:_ Pushability matrix (R14) and paired-push helper (R5) are extracted as reusable
library APIs under `lib/git/` so the planned interlock-release wrappers
(`plan-interlock-release-wrappers.md`) call the same probes without re-litigating Phase 2's
choices. The orchestrator (`arc sync`, R10) becomes the single home for paired-push routing;
wrappers stay single-leg per the realigned wrappers plan. Ref-scope discrimination on the matrix
and an exported paired-push helper are the load-bearing shape decisions.

### `[x]` **2.1 Pushability pre-check matrix**

- New `lib/git/pushability.ts` exports `runPushabilityStatus({ exec, access, target,
  worktreeSyncState? })` with `target: "worktree" | "notes" | "both"`. Conditions split global
  (rebase-in-progress in either `rebase-merge` or `rebase-apply` form, detached HEAD) from
  ref-specific (no-upstream branch on worktree target; missing notes refspec on notes target).
  `force-push-required` derives from caller-supplied `worktreeSyncState === "diverged"` and
  surfaces with `disposition: "advisory"` so refusal policy lives at the call site.
- Notes-refspec condition auto-fixes via existing `configureNotesRefspec`; disposition
  `auto-fixed` lets the push proceed without caller action. Server-side classes (protected
  branch / pre-receive / permission denied) are not pre-checkable — left as verbatim push-time
  errors; handlers preserve the original server message.
- `runUserPush` now accepts an optional `access` seam; when provided, runs the matrix
  (`target: "notes"`) before the push and throws new `UserPushBlockedError` on block
  conditions. Handlers (`handlers/{user,sync,push-recovery}.ts`) inject `fs.access` from
  `node:fs/promises` and surface a new `blocked` discriminant on `PushResult` with guidance
  output. Force-flag bypass refused on environmental blocks (rebase/detached) since force
  doesn't resolve them.
- Session-handoff probe envelope carries a new `pushability` slot
  (`commands/status/{types,run}.ts` + `handlers/status.ts`) probed with `target: "worktree"`
  for handoff-time worktree push gating. Workflow-doc consumer wiring lands in Task 2.2.
- Pushability matrix exports re-extracted under `lib/git/index.ts` as the load-bearing reusable
  surface for the planned interlock-release wrappers.
- Tests: 8 new in `__tests__/unit/git/pushability.test.ts` covering all behaviors (happy path,
  both rebase forms, detached HEAD, both target-scope cases for no-upstream, refspec
  auto-configure with re-probe, force-push advisory). 1 new envelope test in
  `__tests__/unit/status/run.test.ts`. Mocks updated in `push-recovery.test.ts` and
  `user-handlers.test.ts` for the new `UserPushBlockedError` export.

### `[x]` **2.2 Paired-push failure semantics**

- Worst-outcome exit code, itemized leg output, no auto-retry, idempotent recovery — all
  delivered via `runPairedPush` (2.2.a) + `arc user push` no-op (2.2.b) + the `arc sync`
  orchestrator (2.2.c) that owns the cross-cutting coherence rules.

    - `[x]` **2.2.a Exported `runPairedPush` helper**
        - New `commands/user/paired-push.ts` exports `runPairedPush` returning a
          `PairedPushResult` with per-leg `success | failed | skipped` outcomes, surfaced
          pushability conditions, and worst-outcome `exitCode`. Pre-check runs
          `runPushabilityStatus({ target: "both" })`; block → both legs `skipped:
          blocked-by-precheck`. Worktree-fail → notes `skipped: preceding-leg-failed`.
          Worktree-success + notes-fail records the partial-push marker; full success
          clears any pre-existing marker. Result types live in `commands/user/types.ts`;
          re-exported via `commands/user.ts`. Itemized-output copy lives at the handler
          (consumer wiring lands in 2.2.c).
        - Tests: 4 new in `__tests__/unit/paired-push.test.ts` covering both-succeed,
          partial-fail with marker, ordering-invariant on worktree-fail, and pre-check
          block.

    - `[x]` **2.2.b `arc user push` idempotent no-op**
        - `runUserPush` (`commands/user/push-fetch.ts`) now probes
          `git ls-remote origin refs/notes/arc/user/{identity}` against the local ref hash
          before pushing; equal hashes return `{ kind: "noop" }` and clear the partial-push
          marker without firing a push. Different (or missing) hashes proceed with the push
          as before, also clearing the marker on success. `force: true` skips the probe and
          pushes unconditionally. New `UserPushResult = { kind: "pushed" | "noop" }` exposed
          via `commands/user/types.ts`. `pushWithInteractiveRecovery` propagates `noop`
          through `PushResult`; `handlers/{user,sync}.ts` accept it alongside `ok` /
          `ok-recovered`. Spinner doneLabel switches to "Already up to date." on no-op.
        - Tests: 3 new in `__tests__/unit/push-fetch.test.ts` (no-op clears marker;
          re-attempt after transient failure pushes and clears marker; force skips the
          probe). Existing `push-recovery.test.ts` updated for the new return shape.

    - `[x]` **2.2.c Orchestrator + workflow integration**
        - The `arc sync` orchestrator (R10) consumes the 6-cell matrix
          (`push_interlock × notes_push × worktree-state`), routes the paired cell through
          `runPairedPush`, and owns cross-cutting coherence (R5 partial-push, R4 unpushed-HEAD,
          R15 notes-vs-worktree, diverged-worktree skip). The session-handoff workflow consults
          the new `syncInterlock` envelope slot to decide whether to auto-invoke. Three subtasks
          delivered the change:

            - `[x]` **2.2.c.i Command-surface restructure**
                - Renamed `arc sync` (notes-only) → `arc user sync`; `handleSync` migrated to
                  `handlers/user-sync.ts` as `handleUserSync`. New top-level `arc sync`
                  registered against an orchestrator stub in `handlers/sync.ts` that prints a
                  "not yet implemented" notice and exits 1; dispatch lands in 2.2.c.ii.
                - Added `session.sync_interlock` to TS schema (`lib/config/status-reader.ts`,
                  `commands/config/types.ts`, `commands/config/status.ts` SESSION_INIT_KEYS) and
                  shell validator. Default `on-handoff`. Migrated `session.push_interlock` enum
                  value `on-handoff` → `on-sync` everywhere — TS reader, shell validator,
                  `HandoffPushInterlock` type union, both `arc-config.yml` copies. Project's
                  on-disk value carried forward to `on-sync`.
                - Help text: `arc --help`, `arc user --help`, and `arc sync --help` now
                  cross-reference per spec.

            - `[x]` **2.2.c.ii Orchestrator dispatch + matrix routing**
                - `handleSync` (`handlers/sync.ts`) rewritten from c.i stub. Probes identity,
                  config (`push_interlock`, `remote_sync`), worktree sync state, notes-push
                  policy (`resolveSyncPushPolicy`), and current branch in parallel; routes
                  through pure `decideMatrix` returning per-leg actions + cell name. Paired
                  cell (`on-sync × always`) calls `runPairedPush`; worktree-only,
                  notes-only-with-R15, save-only, and prompt cells dispatch single-leg via
                  direct `git push origin <branch>` + `runUserSave` + `pushWithInteractiveRecovery`.
                - Coherence overlays: `worktree-state === "diverged"` + `push_interlock: on-sync`
                  short-circuits to "Reconcile required:" surface with both legs reported as
                  `blocked`. R15 (notes auto-push or prompt under manual worktree push)
                  treats local-ahead/diverged/remote-ahead worktree as a block reason —
                  notes save fires, push surfaces guidance, exitCode 1. Force-push refusal
                  lives in `runPairedPush`'s pre-check (matrix advisory at handoff).
                - `--dry-run` prints cell name + per-leg action descriptions
                  (`describeWorktreeAction` / `describeNotesAction`) without invoking save
                  or push. `--json` emits structured envelope (cell, worktree leg, notes leg,
                  exitCode, optional reconcile block) for handoff-workflow consumption;
                  human-readable path remains the default.
                - Non-interactive prompt-policy degrades to `manual` before matrix dispatch
                  (parity with `arc user sync`).
                - Affected files: `packages/arc-framework/src/handlers/sync.ts` (rewrite);
                  `__tests__/unit/sync-orchestrator.test.ts` (new — 7 tests). Extraction
                  to `commands/sync/orchestrator.ts` deferred — matrix logic stayed inline
                  at ~60 LOC of pure decision; not enough surface to warrant a separate
                  module.
                - Tests: 7 new in `__tests__/unit/sync-orchestrator.test.ts` covering all
                  seven listed behaviors. Behaviors batched per test-first batching judgment
                  (single handler, shared mock setup).

            - `[x]` **2.2.c.iii Workflow markdown rewrite**
                - `session-handoff.md` Push Sequence section collapsed to a single Sync section
                  gated on `syncInterlock.value`: `on-handoff` invokes `arc sync --json` and
                  consumes the structured output; `manual` skips and surfaces unpushed state
                  from the envelope. Worktree-push and Notes-push subsections retired —
                  matrix dispatch lives in the orchestrator. Push-ordering invariant collapsed
                  to a one-line strategy-doc reference.
                - Confirm Handoff section split into two read paths: `arc sync` ran
                  (read JSON envelope's `cell` / `reconcile`) vs. `arc sync` skipped
                  (read `worktree` slot from probe envelope). New `**Sync:**` outcomes:
                  `synced to remote`, `sync failed`, `skipped (sync_interlock: manual)`,
                  `skipped (no identity)`. Identity-absent fallback added explicitly.
                - Resolve Handoff Context table updated: `syncInterlock` row added; existing
                  `pushInterlock` / `syncPush` rows reframed as `arc sync`-internal diagnostics
                  (no longer consulted by the workflow itself).
                - **Scope expansion (in-scope per design):** Added `syncInterlock` slot to the
                  session-handoff envelope to make the workflow gate read coherently. Touches
                  `commands/status/types.ts`, `commands/status.ts` (barrel), `handlers/status.ts`,
                  `commands/status/run.ts`, plus updates to `__tests__/unit/status/run.test.ts`
                  (slot list, parallelism count → 8, sibling-error coverage, dedicated probe test).
                - Affected files (this task):
                  `.arc/system/workflows/arc/session-lifecycle/session-handoff.md` +
                  `packages/arc-framework/arc/.../session-handoff.template.md` (mirror);
                  envelope expansion files listed above.
                - Tests passed: full Tier 2 (markdown lint, ts/sh lint, typecheck, typecheck:test,
                  unit + integration + e2e — 1203 + 49). Manual handoff dry-run deferred to first
                  real handoff session.

### `[x]` **2.3 Unpushed-HEAD save/push behavior**

- New `worktree-not-aligned-with-origin` condition kind in `lib/git/pushability.ts`
  (disposition `block`) probes HEAD vs. `origin/<branch>` via local-only
  `git rev-list --left-right --count` — no remote round-trip. State-specific guidance for
  `local-ahead` / `behind` / `diverged`; probe failure silently skips the gate
  (no-regression direction). Gate fires only on `target: "notes"`; `target: "both"` suppresses
  since the paired-push flow commits to pushing the worktree leg first.
- `UserPushOptions.worktreeBranch` threads the resolved branch through `runUserPush`. New
  `resolveCurrentBranchName` helper in `handlers/shared.ts` centralizes
  `git rev-parse --abbrev-ref HEAD` resolution; consumed by `handlers/user.ts` and
  `handlers/user-sync.ts`. `pushWithInteractiveRecovery` signature switched from positional
  args to an options object so callers can attach the branch alongside `access` without
  extending the parameter list further; `handlers/sync.ts` reuses the existing `ctx.branch`.
- `force: true` doesn't bypass the alignment gate — force is scoped to notes-ref divergence.
- Tests: 7 new in `__tests__/unit/git/pushability.test.ts` (clean / local-ahead / behind /
  diverged / paired-suppression / no-branch / probe-failure); 1 in `sync.test.ts` (B6);
  2 in `user-handlers.test.ts` (B3, B4). `push-recovery.test.ts` and `integration/user.test.ts`
  updated for the options-object signature. Save-side regression-fence (B1, B2) covered by
  unchanged save behavior — `runUserSave` does no remote/worktree probing.

### `[x]` **2.4 R15 cell coverage + reconciliation guidance polish**

- Three new cells in `__tests__/unit/sync-orchestrator.test.ts` cover
  `push_interlock: manual × notes_push: always × worktree-state` for clean (notes-only
  cell fires save + push), diverged (save fires, notes push blocked), and remote-ahead
  (save fires, notes push blocked). 10 tests total in the file.
- New `reconcileGuidance(state)` helper in `handlers/sync.ts` replaces the single-message
  warning in `executeSingleLeg`'s `save+notes-blocked` branch. Diverged emits
  "Manual rebase or merge needed"; remote-ahead emits "Fast-forward
  (`git pull --ff-only`)"; `local-ahead` retains the existing
  "push the worktree first" wording.

## **Phase 2.R:** Sync remediation and robustness

_Purpose:_ Correct the Phase 2 sync-contract gaps found during cross-machine handoff analysis
before vocabulary/config work resumes. This phase hardens save verification, freshness
reporting, orchestrator routing, machine-readable output, disk-vs-note direction inference,
status messaging, and the self-hosted CLI path so Phase 3+ work builds on a reliable
`arc sync` contract.

_Forward-compat:_ Phase 2.R extracts a `pushWorktreeBranch` helper in `lib/git/` that the
orchestrator and paired-push consume — `plan-interlock-release-wrappers.md` (WU1) swaps the
implementation when wrappers ship, without re-extracting from raw `git push` call sites. The
`arc sync --json` envelope gains an `interlockState` field for wrapper audit-log composition.
The cross-clone test harness (`__tests__/helpers/multi-clone.ts`) is built as a reusable seam
— `plan-coord-probe.md` inherits it for branch-gone signal coverage.

### `[x]` **2.R.1 Verified save and freshness surfaces**

- _Goal:_ Save, push, and status surfaces cannot report success or "clean" when current-`HEAD`
  user notes were not actually saved or the latest local note is stale.
- _Outcome:_ Save now verifies exact-`HEAD` note readback before advancing sync-state;
  no-op push and session status surfaces distinguish matching refs from current-`HEAD`
  freshness and warn before handoff when the latest local note is stale.

    - `[x]` **2.R.1.a Save postcondition verification**
        - `runUserSave` now verifies an exact-`HEAD` note readback before advancing
          `.sync-state.json`; missing, invalid, or mismatched readback throws
          `UserSaveVerificationError` while leaving the written note for the next save to
          replace cleanly.
        - `LocalSyncState` v2 preserves optional `verifiedAt` on verified saves, with
          normalized hash comparison between the just-serialized manifest and the readback
          manifest rather than a second user-dir serialization.
        - Unit coverage pins write failure, missing readback, invalid JSON, hash mismatch,
          and verified sync-state behavior; the user integration helper now initializes temp
          working and bare repos on `main` to match the branch assumptions in real-git tests.

    - `[x]` **2.R.1.b Stale-local no-op push copy**
        - `pushWithInteractiveRecovery` now reports the no-op comparison as remote user notes
          matching local user notes, then checks the latest local note against `HEAD` before
          returning.
        - When the matching local/remote note is attached to an ancestor of `HEAD`, the push
          path warns that handoff needs `arc user save` or `arc sync`; unit and real-git
          integration coverage pin the stale-local warning while preserving no-op behavior.

    - `[x]` **2.R.1.c Session-init/handoff stale freshness detail**
        - Session user probes now expose `localNoteFreshness`, preserving the five-state
          ref-topology verdict while distinguishing missing, current-HEAD, ancestor, and
          outside-ancestry local notes.
        - Clean matching-ref session results warn with save/sync handoff guidance when the
          latest local note is attached to an ancestor of `HEAD`; unit coverage pins both the
          session-init user result and handoff envelope, with real-git coverage for
          session-init freshness.

### `[ ]` **2.R.2 Sync orchestrator execution contract**

- _Goal:_ Every `arc sync` matrix cell preserves local state, gates unsafe pushes consistently,
  and emits machine-consumable output in JSON mode.

    - `[x]` **2.R.2.a Paired-cell save-before-push**
        - `runPairedPush` now saves the user directory to `HEAD` with `runUserSave` before
          either push leg fires. Save failure returns a `save-failed` paired result and skips
          both worktree and notes pushes.
        - The orchestrator reports paired save failure as a structured save failure in JSON
          output, while keeping save ownership inside the paired helper. Unit coverage pins
          save-before-push ordering and no-push-on-save-failure; E2E coverage verifies
          `arc sync` leaves a readable `HEAD` user note on a default clean-worktree setup.

    - `[x]` **2.R.2.b Blocked-cell local-save invariant**
        - Blocked sync cells now save the current user directory before refusing notes push,
          including diverged, remote-ahead, no-upstream, remote-unavailable, detached-HEAD,
          and local-ahead/manual paths.
        - Rebase-in-progress is the explicit exception: save is skipped with guidance to
          complete or abort the rebase before saving. JSON output now reports save and blocked
          push outcomes as separate envelope legs so callers can distinguish preserved local
          state from refused remote publication.

    - `[x]` **2.R.2.c Worktree-leg pushability/state gate + helper extraction**
        - Extracted `pushWorktreeBranch` in `lib/git/push-worktree.ts` (internal scope; not
          re-exported from `lib/git/index.ts`). Both `handlers/sync.ts` `executeSingleLeg`
          and `commands/user/paired-push.ts` consume it, removing the last raw
          `git push origin <branch>` call sites in the sync surface.
        - `runPushabilityStatus` now runs the alignment probe on `target: "worktree"` as
          well as `target: "notes"`; `target: "both"` continues to suppress (paired-push
          resolves alignment by pushing worktree first). Single-leg worktree push call
          sites can refuse on `worktree-not-aligned-with-origin` without re-deriving from
          the worktree-sync state machine.
        - Paired notes leg now routes through an injected `PairedPushNotesPusher` delegate
          wired to `pushWithInteractiveRecovery` in `handlers/sync.ts`. `commands/user/`
          stays Clack-free; the paired flow inherits conflict recovery, idempotent no-op
          detection, and pre-check refusal symmetric with single-leg `arc user push`.
        - `runPairedPush` refuses on `force-push-required` advisory disposition
          (defense-in-depth — `decideWorktree` already routes diverged worktrees to
          `executeBlockedWorktree` upstream). Refusal contract documented in
          `pushability.ts` preamble so push wrappers inherit it.
        - Coverage: new `push-worktree.test.ts`; `pushability.test.ts` extended with
          `target: "worktree"` alignment cases (clean / local-ahead / behind / diverged /
          probe-failure / branch-omitted / no-upstream-precedence); `paired-push.test.ts`
          updated for the injected delegate and covers force-push advisory refusal plus
          all notes-pusher outcome variants (success / noop / ok-recovered /
          cancelled / no-remote / failed-nontty-conflict / blocked / failed).

    - `[ ]` **2.R.2.d JSON contract and `--yes` semantics**
        - `arc sync --json` contract: exactly one JSON object on stdout; no Clack spinner,
          prompt, or log output reaches stdout. Human diagnostics route to stderr or live
          inside the envelope.
        - Error-path coverage: every return path emits the JSON envelope. Today
          identity-absent and cwd-absent paths return silently (`handlers/sync.ts:168, 173`)
          and exit 0 — both must emit a structured envelope (`{cell: "none", reason, ...}`)
          and set `process.exitCode > 0`.
        - Envelope adds `interlockState: { pushInterlock, notesPush, syncInterlock }` for
          downstream consumers (handoff workflow, future wrapper audit log per
          `plan-interlock-release-wrappers.md`). Read `session.sync_interlock` for envelope
          purposes even though the orchestrator itself doesn't act on it
          (authorize-by-invocation per PRD R10).
        - Dry-run shape parity: `--dry-run --json` emits the same envelope schema as the
          runtime path (today they diverge — `mode: "dry-run"` wraps a different object
          shape). Workflow consumers should not need branch logic on `mode`.
        - `--yes` semantics: auto-accept default-yes prompts (degrade `notes_push: prompt` to
          `always`; auto-accept safe-default recovery prompts in
          `pushWithInteractiveRecovery`). Never auto-accept destructive defaults (force-push,
          etc.) — refuse and emit guidance. Wire `opts.yes` into matrix dispatch (currently
          declared in `SyncOptions` and unused).
        - Contract tests with mocked exec assert structure (envelope, error paths,
          `interlockState`, dry-run parity, `--yes`); subprocess-level stdout-purity tests
          live in 2.R.3.c.

### `[ ]` **2.R.3 Regression coverage across real git topologies**

- _Goal:_ Test coverage catches the cross-machine and handoff failures that mocked unit tests
  missed.

    - `[ ]` **2.R.3.a Cross-clone handoff sync regression**

        - _Goal:_ A real two-clone topology proves the post-2.R sync contract end-to-end and
          gives downstream plans (`plan-coord-probe.md`) a reusable harness.

            - `[ ]` **2.R.3.a.0 Multi-clone test harness**
                - Add `__tests__/helpers/multi-clone.ts` exposing `setupMultiClone()` returning
                  `{ origin, cloneA, cloneB, cleanup }`. Helper creates a tmp dir,
                  `git init --bare origin.git`, two `git clone` clones with the notes refspec
                  configured, returns handles.
                - Forward-compat: helper is reusable by `plan-coord-probe.md` (branch-gone
                  signal coverage) and any future cross-machine regression. Build with that
                  second consumer in mind — keep clone setup parameterizable (identity per
                  clone, optional initial commit, optional config overrides).
                - Build `test-first` with one trivial cross-clone scenario (clone A pushes
                  commit; clone B fetches and observes it) to exercise the harness shape.

            - `[ ]` **2.R.3.a.1 Cross-clone sync regression**
                - Using the harness, build the regression: clone A changes session notes and
                  runs `npx arc sync --json`; assert clone A's `HEAD` has a verified note,
                  origin's user notes ref advanced, and clone B can fetch/pull the current
                  note.
                - Assert clone B's session-init and session-handoff freshness detail reflects
                  current `HEAD` after pull.

    - `[ ]` **2.R.3.b Matrix edge coverage**
        - Add unit/integration coverage for the blocked and edge cells discovered in the audit:
          diverged + on-sync, remote-ahead + manual worktree, worktree-only push gate failures,
          notes prompt under non-interactive mode, and remote notes no-op with stale local note.

    - `[ ]` **2.R.3.c JSON purity child-process tests**
        - Run the actual CLI as a subprocess for representative `arc sync --json` cells
          (paired, save-only, blocked, prompt-policy, error-path identity-absent) and assert
          stdout parses as one JSON object with no Clack spinner, prompt, or log
          contamination.
        - Owns the subprocess-level purity contract; 2.R.2.d owns structure assertions with
          mocked exec.

### `[ ]` **2.R.4 Disk-vs-note direction inference and action-oriented status output**

- _Goal:_ Eliminate the misclassification that recommends `save` when `load` is correct
  after a cross-machine ref advance, and reshape default status output so actions name the
  right verb in one line. Three-tier truth (refs / disk / working files) stays available
  behind `--verbose` and in `--json` for debugging and machine consumers.

    - `[ ]` **2.R.4.a Disk-vs-note direction inference via `sourceCommit` ancestry**
        - _Goal:_ `inspectDiskVsLocalSnapshot` distinguishes "disk behind note" (note
          advanced past `LocalSyncState.sourceCommit`; disk hash matches the materialized
          manifest) from "disk has unsaved edits" (disk advanced past the materialized
          manifest; note still at `sourceCommit`) and from genuine reconciliation cases.
          Today's hash-only comparison cannot tell these apart and silently misroutes
          post-fetch disk-behind state to a `save` action that overwrites the freshly
          fetched newer note.
        - `determineUserStatusAction` consumes the signal and recommends `arc user load`
          for the disk-behind case; `arc user save` for true unsaved edits; manual
          reconciliation framing for ambiguous mixed cases.
        - The note-commit vs. `LocalSyncState.sourceCommit` ancestry check is the
          load-bearing comparison; `git merge-base --is-ancestor` is already available via
          `isAncestor` in `sync-status.ts`. Legacy `sourceCommit: ""` falls through to the
          existing hash-only heuristic — no direction inference, no behavior change.
        - Affected files:
          `packages/arc-framework/src/commands/user/sync-status.ts`
          (`inspectDiskVsLocalSnapshot` direction logic + `determineUserStatusAction`
          routing).
        - Build `test-first` (one behavior at a time):
            - Note descendant of `sourceCommit`, disk hash matches materialized →
              `direction: "behind"`, action recommends `arc user load`
            - Note equal to `sourceCommit`, disk hash differs from materialized →
              direction reflects unsaved edits, action recommends `arc user save`
            - Both note and disk advanced from `sourceCommit` baseline → mixed
              direction; action prompts manual reconciliation rather than auto-routing
              to either verb
            - Note unreachable from `sourceCommit` (orphan / divergent history) →
              mixed direction; action prompts manual reconciliation
            - Legacy `sourceCommit: ""` → falls through to existing hash-only
              heuristic; no behavior change

    - `[ ]` **2.R.4.b Action-oriented status default with `--verbose` three-tier truth**
        - _Goal:_ `arc user status` default output names the next command in one
          sentence rather than narrating ref topology in three. Three-tier detail
          stays available behind `--verbose` and in `--json` for debugging and
          machine consumers.
        - Default shape: headline `<identity>: <action-or-clean-state>`, one-line
          context combining note commit + freshness + remote alignment, pre-load
          backup count when present, single `Next step:` line. Today's
          `renderHeadlineExplanation` + `renderWorkingFilesLine` redundant pair
          collapses to one direction-aware sentence consuming the 2.R.4.a signal.
        - Saved-at line absorbs commit hash anchoring — e.g.
          `Note current with HEAD (9b1c241f), saved 9 hours ago.` collapses today's
          separate "Saved X" + "Latest local git note is current with HEAD" lines.
          Behind-HEAD and outside-ancestry variants follow the same shape.
        - Pre-load backup default: `Pre-load backup present (N files).` Full
          enumeration moves to `--verbose` only.
        - `--verbose` renders today's full three-tier breakdown plus the backup
          file enumeration — no information loss for debugging surfaces.
        - `arc user status --json` envelope shape unchanged. Action-oriented
          rendering is a presentation-layer change; machine consumers (sync
          orchestrator, handoff workflow) keep their contract.
        - Affected files:
          `packages/arc-framework/src/commands/user/sync-status.ts`
          (`buildUserStatusResult` rendering + verbose branching);
          `packages/arc-framework/src/handlers/user.ts` (`--verbose` flag plumbing
          for the user-status surface);
          `packages/arc-framework/src/cli.ts` (subcommand flag declaration).
        - Build `test-first` (one behavior at a time):
            - Default mode, clean state → single-line headline (e.g. `Up to date.`),
              no detail block
            - Default mode, disk-behind state → one-sentence headline + one context
              line + `Next step: arc user load`
            - Default mode, disk-edits state → one-sentence headline + one context
              line + `Next step: arc user save`
            - Default mode, mixed/conflict state → one-sentence headline naming the
              ambiguity + manual-reconciliation guidance
            - `--verbose` renders today's full three-tier detail block including
              backup file enumeration
            - Default mode shows `Pre-load backup present (N files).` count only
            - `--json` shape unchanged regardless of `--verbose` flag

### `[ ]` **2.R.5 Self-hosted CLI guard**

- _Goal:_ This repo cannot silently trust a stale ignored `dist/cli.js` for handoff-critical
  `npx arc` commands.

    - `[ ]` **2.R.5.a Implement dev-mode stale-build check**
        - Shape: in-CLI check under a `__DEV__` flag (set via `package.json` or env that fires
          only in this repo's checkout). Compare `dist/cli.js` mtime against the newest
          `src/**/*.ts` mtime; warn or fail fast when dist is stale, suggesting `npm run
          build`. Adopters never see it (published package skips the check).
        - Account for this repo's `npx arc` resolving to `packages/arc-framework/dist/cli.js`
          while `dist/` is ignored.
        - Budget: ~1.5 sessions total across 2.R.5.a + 2.R.5.b. Rejected alternatives:
          dedicated wrapper (overkill — ships infrastructure adopters don't need); pure-docs
          (doesn't catch the failure mode mechanically — Phase 2.R itself was added because
          docs proved insufficient).

    - `[ ]` **2.R.5.b Verify guard + adopter-docs note**
        - From a deliberately stale build state, the guard must warn or fail before `arc sync`,
          `arc user save`, `arc user push`, or `arc status --session-* --json` output is
          trusted.
        - Add the narrowest reliable test for the dev-mode check (mocked-mtime fixture
          covering stale, fresh, and missing-dist cases).
        - Add a brief CONTRIBUTING/README note: after pulling self-hosting changes, run
          `npm run build` before invoking `npx arc` for handoff-critical commands. The
          dev-mode check warns if dist is stale.

### `[ ]` **2.R.6 Final sync contract audit**

- _Goal:_ Re-read the sync surface after remediation and capture residual risk before Phase 3
  begins.

    - `[ ]` **2.R.6.a Code-path audit against invariants**
        - Audit `handlers/sync.ts`, `handlers/user-sync.ts`, `handlers/user.ts`,
          `commands/user/*`, and `lib/git/*` against the remediation invariants:
          verified save before sync-state advance, no JSON contamination, no raw worktree-push
          bypass, no clean-but-stale hidden state, no misleading no-op copy, blocked-cell save
          invariant, and force-push advisory refused at every call site.
        - Deliverable: structured findings in `notes-user-sync-ux.md` (companion file created
          ahead of time during planning) with one row per file: `invariant → location →
          status (clean | finding | TODO)`. Status-file pointer is updated during this task.
          Companion archives or migrates to a strategy doc at WU integration.

    - `[ ]` **2.R.6.b Test-surface audit + residual risk**
        - Ensure unit, integration, and e2e coverage maps to all remediation invariants and at
          least one real git cross-clone path.
        - Exit criterion: produce a checklist confirming no undocumented sync regressions
          remain. Every Phase 2.R remediation invariant has a covering test; every documented
          residual is intentional and recorded in `notes-user-sync-ux.md`.
        - Carry-forward residuals to record explicitly (already pre-populated in
          `notes-user-sync-ux.md`):
            - Cross-machine partial-push invisibility (`recordPartialPushMarker` is
              local-only; machine B has no signal that A's push was partial). Out of scope for
              2.R; would require a remote-marker mechanism.
            - Pull-side / load-side verification symmetry (`runUserLoad` does no postcondition
              check; 2.R.1.a is save-only). Lower priority; flag for a future hardening WU.
            - Save-verification race against sibling sessions (mitigated in 2.R.1.a by
              comparing against the just-written manifest, not the readback content; confirm
              the comparison source during implementation).

    - `[ ]` **2.R.6.c Doc and preamble updates**
        - Update preambles for `runPairedPush` (`commands/user/paired-push.ts`) and
          `handleSync` (`handlers/sync.ts`) to reflect post-2.R semantics: verified
          save-before-push, blocked-cell save invariant, JSON contract, worktree-push helper
          extraction, force-push advisory refusal.
        - Update `pushability.ts` preamble to document the `force-push-required` advisory
          refusal contract (so wrappers inherit it without re-deriving).
        - Update `strategy-session-operations.md` § Handoff-Interior Toggle Pattern (or the
          relevant section) for any post-2.R cascade-shape changes surfaced during the audit.

## **Phase 3:** Vocabulary and config alignment

_Purpose:_ Align user-notes vocabulary across config keys and rendering surfaces. R13 resolver
consolidation, R12 per-dev interlock overrides (incl. new `arc.syncInterlock`), R9 config-shape
rename + `arc update` migration (covers `user.sync_push` rename + `push_interlock` value rename),
R8 layered vocabulary rule. The R10 command rename + orchestrator surface lands in Phase 2
(2.2.c.i) since 2.2.c's matrix dispatch depends on it. Sequencing: Phase 2.R completes first;
then resolver first (R12 needs it), then renames, then vocabulary pass (so the vocabulary pass
operates on final-shape strings).

### `[ ]` **3.1 Resolver consolidation**

- _Goal:_ One 3-tier resolver helper handles `user.notes_push` and the three interlock keys,
  returning `{ value, source }` so downstream consumers can audit precedence.

    - Extract the precedence logic shared by `user.notes_push` (and the new interlock keys
      in 3.2) into a generic helper — `resolveGitConfigOverride<T>`.
    - Return shape (stable downstream-consumer contract):
      `{ value: T, source: "git-config" | "yaml" | "default" }`. Source-tracking is
      **required**, not optional — the planned interlock-release wrappers' audit log carries
      "interlock state at decision time" with provenance, and the authorization footer's
      `abbreviated | full` modes surface source per `plan-interlock-release-wrappers.md`
      § Audit log / § Authorization footer.
    - Migrate `lib/sync-policy.ts` onto it. The helper resolves git-config override → yaml →
      default in 3-tier order.
    - Affected files: `packages/arc-framework/src/lib/sync-policy.ts`; new
      `packages/arc-framework/src/lib/config/resolve-override.ts`. Export path, return shape,
      and generic signature are pinned as a stable downstream-consumer API — the planned
      interlock-release wrappers' validation library builds on this contract.
    - Build `test-first` (one behavior at a time):
        - Git-config value present → returns `{ value, source: "git-config" }`
        - Git-config absent + yaml present → returns `{ value, source: "yaml" }`
        - Both absent → returns `{ value: default, source: "default" }`
        - Type validation: invalid value at any tier rejected with appropriate error
        - `sync-policy.ts` migrated → all existing sync-policy tests pass with no behavior
          change

### `[ ]` **3.2 Per-developer overrides for interlock keys**

- _Goal:_ Plumb `arc.commitInterlock`, `arc.pushInterlock`, and `arc.syncInterlock` git-config
  overrides through to the four release-mode keys' resolution
  (`session.commit_interlock`, `session.push_interlock`, `session.sync_interlock`,
  `user.notes_push`). (`session.sync_interlock` schema entry itself lands in 2.2.c.i; this
  task adds the per-dev override surface.)

- _Shape:_ per-dev resolution layers **on top of** `readConfigSettings` via the 3.1 helper,
  not by mutating the status-reader's signature. `readConfigSettings` stays yaml-only (no
  `exec` dependency); a thin wrapper composes the yaml read with per-key
  `resolveGitConfigOverride<T>` calls. Callers that need the resolved values (handlers, sync
  orchestrator, status command) move to the wrapper; pure-yaml callers (config-status report)
  stay on the reader directly.

    - Companion `sourceMap: Record<key, "git-config" | "yaml" | "default">` returned alongside
      the resolved settings. Diagnostic surfaces (orchestrator `--json` envelope, status
      output) consume it. When adding provenance to `arc sync --json`, keep it inside the
      structured envelope; do not emit Clack/log output that would corrupt machine-readable stdout.
    - This per-dev resolution layer is the **validation read path** for the planned
      interlock-release wrappers' validation library (per
      `plan-interlock-release-wrappers.md` § Interlock-validation library). The wrappers call
      `resolveGitConfigOverride<T>` per key directly; 3.2 ensures the full release-mode key
      surface is consistently resolvable.
    - Additive — no breaking changes to existing yaml-only callers.
    - Affected files: `packages/arc-framework/src/lib/config/status-reader.ts` (no signature
      change; module-comment notes the layering boundary); new wrapper in
      `packages/arc-framework/src/lib/config/` composing the 3.1 helper + status-reader;
      handler call-site migrations as needed.
    - Build `test-first` (one behavior at a time):
        - `arc.commitInterlock` git-config set → wrapper returns git-config value with
          `sourceMap[commit_interlock] === "git-config"`
        - `arc.pushInterlock` git-config set → likewise for push interlock
        - `arc.syncInterlock` git-config set → likewise for sync interlock
        - `arc.notesPush` git-config set → likewise for notes push
        - Git-config absent + yaml present → falls through to yaml; sourceMap reflects "yaml"
        - All absent → defaults; sourceMap reflects "default"
        - Invalid git-config value → falls through to yaml with warning (matches yaml-
          validation shape)

### `[ ]` **3.3 Config-shape alignment**

- _Goal:_ Rename `user.sync_push` → `user.notes_push` end-to-end and migrate adopters in place.

    - `[ ]` **3.3.a Yaml schema and value enum**
        - Rename key in config schema/validation; rename git-config override
          (`arc.syncPush` → `arc.notesPush`).
        - Value enum: `manual | prompt | on-sync` (semantic identity: `always` ⇄ `on-sync`).
          Each interlock value names its own trigger event per R9.
        - Affected files (audit-enumerated):
            - `packages/arc-framework/src/lib/config/status-reader.ts` (DEFAULTS map +
              `AGENT_CONSUMABLE_KEYS`; add notes_push to `ENUM_VALIDATORS` if validating at
              TS layer)
            - `packages/arc-framework/src/lib/sync-policy.ts` (`SYNC_PUSH_YAML_KEY`,
              `SYNC_PUSH_GIT_CONFIG_KEY`, `VALID_POLICIES` constants; rename module-internal
              types)
            - `packages/arc-framework/src/commands/config/types.ts` (`ConfigSettings` and
              `ConfigSessionInitSettings` interface keys)
            - `packages/arc-framework/src/lib/config/index.ts` (`buildConfigKeyOverrides`
              install-time team-mode default)
            - `packages/arc-framework/arc/system/scripts/validate-config.sh`
              (`validate_enum` line for `user.sync_push` + `known_keys` list)
            - `packages/arc-framework/arc/system/arc-config.yml` (key + comment block —
              multiple mentions in surrounding prose)
        - Build `test-first` (one behavior at a time):
            - Schema validates new key+values; rejects old key
            - `on-sync` value resolves equivalently to legacy `always`
            - Git-config override reads from `arc.notesPush`
            - Shell validator accepts new key+values; rejects old key+values

    - `[ ]` **3.3.b `arc update` migration logic**
        - Architecture: versioned migrator infrastructure in `update.ts`. Each migration is
          `{ fromFrameworkVersion, migrate(yamlContent: string): string }`. `update` runs
          applicable migrations (selected by stored `manifest.framework_version` vs. current)
          before three-way merging the template against the migrated yaml. Pays for itself
          across future renames; framework currently has no other adopters, so the cost
          lands ahead of demand.
        - Migrations registered by this task:
            - `user.sync_push: {value}` → `user.notes_push: {translated}` (key rename + value
              translation: `always` → `on-sync`; `prompt` / `manual` carry forward).
            - `session.push_interlock: on-handoff` → `on-sync` (value rename; key unchanged).
              **Adopter correctness note:** the framework template + this self-hosting repo
              are already migrated to `on-sync` (per 2.2.c.i). Pre-2.2.c.i adopters with
              `on-handoff` in their yaml will fail validation on next `arc update` unless
              this migration runs.
            - Old `user.sync_push` key removed; no dual-key window.
        - Affected files: `packages/arc-framework/src/commands/update.ts` (migrator registry +
          dispatch); new `packages/arc-framework/src/commands/update/migrations.ts`
          (per-rename migrators).
        - Build `test-first` (one behavior at a time):
            - `user.sync_push: always` → `user.notes_push: on-sync` translation
            - `prompt` and `manual` carry forward unchanged
            - `session.push_interlock: on-handoff` → `on-sync` translation
            - Old `user.sync_push` key absent post-migration
            - Idempotent: re-running migration on already-migrated config is a no-op
            - Both keys present (manual paste) → new key wins; old key removed; warn surfaced
            - Invalid value in legacy key (`user.sync_push: garbage`) → preserved as-is (no
              translation of unknown values); shell validator catches downstream
            - Migrator registry dispatches by `manifest.framework_version`; older versions
              run all applicable migrations in order

    - `[ ]` **3.3.c Strategy and reference doc updates**
        - Retire the documented-but-unused `auto / prompt / manual` standard from
          `strategy-session-operations.md` § Handoff-Interior Toggle Pattern. Canonical shape
          becomes `manual | on-X` where `X` names the operation's trigger event; `prompt`
          stays opt-in for review-before-fire toggles.
        - Document the three-layer cascade (handoff event → sync; sync event → push and
          notes-push) explicitly. Each interlock's `on-X` value names its own trigger.
          Authorize-by-invocation: `arc sync` running mid-session is an explicit sync event.
        - Affected docs (audit-enumerated; live + adopter-shipped — package-project sync
          requires updating the package mirror alongside the `.arc/` instance):
            - `.arc/reference/QUICK-REFERENCE.md` +
              `packages/arc-framework/arc/reference/QUICK-REFERENCE.template.md`
            - `.arc/reference/strategies/arc/strategy-configurability-architecture.md` +
              package mirror at `packages/arc-framework/arc/reference/strategies/arc/`
            - `.arc/reference/strategies/arc/strategy-session-operations.md` + package mirror
            - `.arc/reference/strategies/arc/strategy-team-coordination.md` + package mirror
            - ADRs (project-internal; no package mirror per DEV-RULES.PROJECT § ADRs):
              `.arc/reference/adr/adr-012-adopt-unified-user-directory-model.md`,
              `.arc/reference/adr/adr-016-configurable-autonomy-interlocks-for-session-operations.md`
        - Test-after — documentation only.

### `[ ]` **3.4 Layered vocabulary rule application**

- _Goal:_ User-facing surfaces use "user notes" as the workhorse noun; storage-mechanism
  terminology ("git notes ref", `refs/notes/...`) appears only when the storage layer is
  relevant.

    - Sweep user-facing strings so "user notes" is the workhorse noun in headlines, action
      hints, and status summaries.
    - "Git notes ref" or "git notes" surfaces only when storage mechanism is relevant
      (debugging, ref state, error messages mentioning `refs/notes/...`).
    - Affected files (audit-enumerated):
        - `packages/arc-framework/src/commands/user/sync-status.ts` (primary rendering
          surface)
        - `packages/arc-framework/src/commands/user/format.ts` (summary builders)
        - `packages/arc-framework/src/commands/user/save-load.ts` (error messages)
        - `packages/arc-framework/src/commands/user/push-fetch.ts` (status / handler
          messaging)
        - `packages/arc-framework/src/commands/user/types.ts` (any user-facing copy in error
          classes / type defaults)
        - `packages/arc-framework/src/handlers/user.ts` (UX strings + prompts)
        - `packages/arc-framework/src/handlers/user-sync.ts` (direction-aware UX strings)
        - `packages/arc-framework/src/handlers/sync.ts` (orchestrator messages)
        - `packages/arc-framework/src/handlers/push-recovery.ts` (recovery-prompt copy)
        - `packages/arc-framework/src/cli.ts` (subcommand help text)
    - Test-after — rendering and string-content audit, not logic change.
    - Boundary: this is a human-copy pass. Do not rename machine-readable JSON discriminants,
      config keys, or enum values unless an explicit migration task owns that change. Preserve
      comparison-specific copy introduced by the stale-local/no-op and save-verification fixes.

## **Phase 4:** DX polish

_Purpose:_ Round out the developer experience. R16 first-use framing surface, R17 shared-ref
sync-state inference. Builds on Phase 1's unified spine for the bounded-fetch extension and on
Phase 3's vocabulary alignment for first-use copy strings.

### `[ ]` **4.1 First-use framing surface**

- _Goal:_ Introduce the user-notes feature and orient new developers without a suppression-flag
  burden.

    - `[ ]` **4.1.a `arc join` post-init paragraph**
        - One-time install paragraph briefly explaining where the gitignored personal context
          lives and that it travels via push/pull as a git notes ref attached to commits.
        - Affected file: `packages/arc-framework/src/handlers/join.ts` — append to the
          post-join `lines` block (currently rendering "What's next" via `p.note`). Optional
          refactor to extract a `buildPostJoinMessage` helper analogous to
          `commands/init.ts:buildPostInitMessage` if the message grows enough to warrant
          separation.
        - Test-after — output formatting per project testing methodology.
        - Concrete paragraph copy finalizes at implementation time.

    - `[ ]` **4.1.b `arc status` single-line hint**
        - Single-line hint pointing at `arc user --help`, conditional on local notes ref absence
          (no `refs/notes/arc/user/{identity}` present).
        - Naturally bounded — fires until first handoff (or manual `arc user save`) creates the
          local ref, then stops. No suppression flag.
        - Affected file: `packages/arc-framework/src/commands/user/sync-status.ts`.
        - Build `test-first` (one behavior at a time):
            - Local notes ref absent → hint appears in `arc status` output
            - Local notes ref present → hint absent
            - Hint absence is silent (no flag, no flag-checking code path)

### `[ ]` **4.2 Shared-ref sync-state inference**

- _Goal:_ `arc status` distinguishes single-session, sibling-session, and cross-machine
  causes for notes-ref divergence — actionable guidance over generic "remote ahead" framing,
  with `--offline` degrading classification explicitly.

    - Extend the bounded-fetch pattern (already in place for the worktree-sync probe) to the
      notes ref on full-mode `arc status` invocation. Inference helpers built here are
      designed for cross-surface reuse — Task 4.3 consumes them in the session-init probe
      to surface the disk-behind-note state for cascade handling.
    - Boundary: this task classifies why the notes-sync state differs; it does not decide
      which branch or work unit the identity should work on. Branch-gone recovery and target
      selection remain Worktree Foundation + Coord Probe scope.
    - Downstream signal contract: preserve enough metadata from notes discovery for later
      routing work to consume (annotated commit, note-history distance, current-HEAD
      reachability, and inferred local / sibling-session / cross-machine cause).
    - Sync-state inference distinguishes:
        - Local-behind-because-haven't-fetched (single-machine, single-session)
        - Local-behind-because-other-machine (cross-machine work)
        - Local-behind-because-sibling-session (same machine, different worktree/session)
    - Sibling-session heuristic: compare `LocalSyncState.sourceCommit` (from
      `.sync-state.json`) against the latest entry in `refs/notes/arc/user/{identity}`
      history. Divergence + both-local-only (no remote-ahead path) → sibling session.
      Cross-machine causes flow from remote ref differing from local ref state.
    - Schema extension: extend `LocalSyncState` (currently v2 — `version`,
      `materializedManifestHash`, `sourceCommit`, `sourceOperation`, optional `partialPush`)
      with `savedAt: ISO-string`. Bump to v3; readers parse v1 / v2 (existing forward-read
      pattern in `readLocalSyncState`) and write v3. Required for heuristics that need
      recency to compare timestamps. Coordinate with the save postcondition hardening: write or
      upgrade sync-state only after the exact `HEAD` note has been verified, and preserve
      `partialPush` marker semantics through the v3 migration.
    - `--offline` mode behavior: both worktree and notes fetches suppressed. Cross-machine
      vs. unfetched-local distinction collapses (no remote read available); surface a
      degraded classification ("offline — local state only; cross-machine signals
      unavailable") rather than asserting a cause heuristically.
    - Affected files:
      `packages/arc-framework/src/commands/user/sync-status.ts` (rendering + bounded-fetch);
      `packages/arc-framework/src/commands/user/save-load.ts` (`LocalSyncState` schema bump,
      read-with-forward-compat, write at v3).
    - Build `test-first` (one behavior at a time):
        - Bounded-fetch on notes ref fires by default in full-mode `arc status`
        - `--offline` suppresses both worktree and notes fetches; classification degrades
          with explicit guidance line
        - Sibling-session detection: `sourceCommit` divergent from notes-ref head, both
          local-only → state-machine resolves to "sibling session"
        - Cross-machine vs. unfetched-local distinction surfaced when remote ref differs
        - `LocalSyncState` v2 → v3 read forward-compat: existing v2 files load without error
          and get `savedAt = null` until the next save

### `[ ]` **4.3 Session-init load cascade**

- _Goal:_ Session-init detects ref-aligned-but-disk-behind state via the 4.2 inference
  helpers and offers `arc user load` per a new `session.init_load.notes` config knob —
  same shape as the existing `session.init_pull.notes` cascade, applied to the load-needed
  condition. Closes the cross-machine-resume gap where worktree pull silently advances the
  user-notes ref while working files stay stale, and session-init reports "everything
  synced" without surfacing the load action.

    - `arc status --session-init --json` envelope's user channel surfaces a load-needed
      signal (new `UserSyncSpine` state, or `loadNeeded: boolean` alongside existing
      state — shape decision at implementation) when notes ref is aligned with remote but
      disk is behind the latest note. Direction inference reuses the 2.R.4.a + 4.2
      foundations.
    - `session-init.md` Step 2 notes-channel logic gains a load-needed case:
      `prompt` → ask before running `arc user load`; `always` → load without prompt;
      `manual` → surface in orientation only.
    - Combined-prompt integration: when worktree-pull and notes-load both need action,
      issue a single combined prompt with per-channel choices (load both / worktree only
      / notes only / skip), mirroring today's worktree-pull + notes-pull combined prompt.
    - Dirty-tree precheck refuses auto-load when working files have unsaved edits not
      reflected in the latest note — degrades to prompt or surface-only regardless of
      `always` setting. Pre-load backup mechanism (already part of `arc user load`) is
      the safety net for the auto-action case.
    - Config schema: new `session.init_load.notes: prompt | always | manual` key (default
      `prompt`). Mirrors `session.init_pull.notes` shape for consistency. Schema lands in
      `arc-config.yml` template + `.arc/` instance + shell validator + DEFAULTS map.
    - Affected files (audit-enumerated; confirm at implementation):
        - `packages/arc-framework/src/commands/user/sync-status.ts`
          (`runUserSessionInitStatus` envelope extension; load-needed signal derivation)
        - `packages/arc-framework/src/lib/config/status-reader.ts` (DEFAULTS +
          `AGENT_CONSUMABLE_KEYS` + enum validator entry)
        - `packages/arc-framework/src/commands/config/types.ts` (`ConfigSettings`,
          `ConfigSessionInitSettings` interface keys)
        - `packages/arc-framework/arc/system/scripts/validate-config.sh`
          (`validate_enum` line + `known_keys` list)
        - `packages/arc-framework/arc/system/arc-config.yml` (key + comment)
        - `.arc/system/workflows/arc/session-lifecycle/session-init.md` (Step 2
          notes-channel state list + cascade handling + combined-prompt branch) plus
          package source mirror at
          `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/`
    - Build `test-first` (one behavior at a time):
        - Probe surfaces load-needed signal when ref aligned + sourceCommit ancestor
          of note's commit + disk hash matches materialized
        - Probe omits load-needed signal when refs aligned + disk hash matches note
          hash (clean state)
        - `session.init_load.notes: always` + clean tree → auto-load fires without
          prompt; orientation reports the action taken
        - `session.init_load.notes: prompt` → prompt issued before load; user accept
          runs `arc user load`; user decline surfaces in orientation
        - `session.init_load.notes: manual` → surface in orientation; no prompt
        - Dirty-tree precheck refuses auto-load even under `always`; degrades to
          prompt with explicit warning
        - Combined prompt fires when worktree-pull + notes-load both needed; per-channel
          accept handled correctly
        - Identity absent → load-needed signal omitted (no path for load); worktree
          channel still applies

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

- _Goal:_ WU success criteria verified through the verification workflow; quality gates pass
  at Tier 3; Phase 2.R remediation complete; atomic-task companion drained.

---

## Success Criteria

- `[ ]` Cross-machine resume produces directionally-correct action hint (machine A push →
  machine B `git pull` + `arc status` recommends `arc user pull`)
- `[ ]` `arc user load` and `arc user pull` succeed when notes attach to commits outside HEAD's
  ancestry (notes-ref-history walk is the default)
- `[ ]` Worktree-ahead-of-origin scenarios produce coherent save/push behavior — `arc user save`
  preserves working state; `arc user push` blocks with guidance; never claims notes-push success
  against unpushed commit
- `[ ]` Paired-push partial failures produce non-zero exit, itemized output marking each leg, and
  idempotent recovery via `arc user push`
- `[ ]` Full-mode and session-init `arc status` agree about underlying git state across all 5
  spine states + partial-push condition (verified by paired-call test fixtures)
- `[ ]` Pushability pre-checks block or surface server errors per the documented matrix
  (rebase, detached HEAD, no-upstream, protected branch, hook failure, auth, force-push,
  worktree-not-aligned-with-origin)
- `[ ]` All four release-mode keys (`session.commit_interlock`, `session.push_interlock`,
  `session.sync_interlock`, `user.notes_push`) support 3-tier resolution via per-dev `arc.*`
  overrides
- `[ ]` `arc update` migrates legacy `user.sync_push` and `push_interlock: on-handoff` configs;
  old keys/values removed; no dual-key window; strategy docs reflect canonical shape with the
  three-layer cascade documented
- `[ ]` `arc sync` (top-level orchestrator) dispatches over the 6-cell matrix; `arc user sync`
  (former `arc sync`) remains the notes-only direction-aware command. `arc user --help` lists
  `save / load / push / pull / fetch / sync`; both surfaces cross-reference
- `[ ]` `arc sync --json` is a pure machine contract: stdout is one parseable JSON object across
  paired, save-only, blocked, and prompt-policy cells; no prompt/spinner/log output contaminates it
- `[ ]` Handoff sync has cross-clone coverage: clone A `arc sync --json` creates a verified
  current-`HEAD` note and pushes it; clone B can fetch/pull notes and session-init/handoff
  freshness reflects current `HEAD`
- `[ ]` `arc user save` success verifies the exact `HEAD` note before `.sync-state.json` advances
- `[ ]` Every `arc sync` worktree push leg runs through the shared pushability/state gate; no matrix
  cell relies on raw `git push` as its only guard
- `[ ]` `session.sync_interlock: manual` opts handoff out of automatic sync; handoff summary
  surfaces unpushed state without firing pushes
- `[ ]` First-use framing surfaces operational: `arc join` install paragraph, `arc status` hint
  with notes-ref-existence trigger
- `[ ]` Notes-ref bounded-fetch fires on full-mode `arc status`; `--offline` suppresses both
  probes and degrades cause classification with explicit guidance; sibling-session vs.
  cross-machine causes inferred and surfaced
- `[ ]` Layered vocabulary rule applied: "user notes" workhorse noun across
  headlines/hints/summaries; "git notes ref" only when storage mechanism is relevant
- `[ ]` Disk-vs-note direction inference (`sourceCommit` ancestry) distinguishes
  "disk behind note" from "disk has unsaved edits"; status output recommends
  `arc user load` vs `arc user save` accordingly — no silent overwrite of freshly
  fetched newer notes
- `[ ]` `arc user status` default output is action-oriented (one-line headline + one-line
  context + `Next step:`); `--verbose` retains today's three-tier detail and pre-load
  backup enumeration; `--json` envelope shape unchanged
- `[ ]` Session-init detects ref-aligned-but-disk-behind state and offers `load` per
  `session.init_load.notes` (`prompt | always | manual`); dirty-tree precheck refuses
  auto-load; combined prompt covers concurrent worktree-pull + notes-load scenarios
- `[ ]` All quality gates pass (markdown lint, TypeScript type check, full Vitest suite, build
  verification)
- `[ ]` Ready for integration

[verify-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
