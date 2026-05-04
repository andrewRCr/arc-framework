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

## **Phase 3:** Vocabulary and config alignment

_Purpose:_ Align user-notes vocabulary across config keys and rendering surfaces. R13 resolver
consolidation, R12 per-dev interlock overrides (incl. new `arc.syncInterlock`), R9 config-shape
rename + `arc update` migration (covers `user.sync_push` rename + `push_interlock` value rename),
R8 layered vocabulary rule. The R10 command rename + orchestrator surface lands in Phase 2
(2.2.c.i) since 2.2.c's matrix dispatch depends on it. Sequencing: resolver first (R12 needs it),
then renames, then vocabulary pass (so the vocabulary pass operates on final-shape strings).

### `[ ]` **3.1 Resolver consolidation**

- Extract the precedence logic shared by `user.notes_push` (and the new interlock keys in 3.2)
  into a generic helper — `resolveGitConfigOverride<T>`.
- Return shape (stable downstream-consumer contract):
  `{ value: T, source: "git-config" | "yaml" | "default" }`. Source-tracking is **required**,
  not optional — the planned interlock-release wrappers' audit log carries "interlock state at
  decision time" with provenance, and the authorization footer's `abbreviated | full` modes
  surface source per `plan-interlock-release-wrappers.md` § Audit log / § Authorization footer.
- Migrate `lib/sync-policy.ts` onto it. The helper resolves git-config override → yaml →
  default in 3-tier order.
- Affected files: `packages/arc-framework/src/lib/sync-policy.ts`; new
  `packages/arc-framework/src/lib/config/resolve-override.ts`. Export path, return shape, and
  generic signature are pinned as a stable downstream-consumer API — the planned
  interlock-release wrappers' validation library builds on this contract.
- Build `test-first` (one behavior at a time):
    - Git-config value present → returns `{ value, source: "git-config" }`
    - Git-config absent + yaml present → returns `{ value, source: "yaml" }`
    - Both absent → returns `{ value: default, source: "default" }`
    - Type validation: invalid value at any tier rejected with appropriate error
    - `sync-policy.ts` migrated → all existing sync-policy tests pass with no behavior change

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
- Companion `sourceMap: Record<key, "git-config" | "yaml" | "default">` returned alongside the
  resolved settings. Diagnostic surfaces (orchestrator `--json` envelope, status output)
  consume it.
- This per-dev resolution layer is the **validation read path** for the planned
  interlock-release wrappers' validation library (per `plan-interlock-release-wrappers.md` §
  Interlock-validation library). The wrappers call `resolveGitConfigOverride<T>` per key
  directly; 3.2 ensures the full release-mode key surface is consistently resolvable.
- Additive — no breaking changes to existing yaml-only callers.
- Affected files: `packages/arc-framework/src/lib/config/status-reader.ts` (no signature
  change; module-comment notes the layering boundary); new wrapper in
  `packages/arc-framework/src/lib/config/` composing the 3.1 helper + status-reader; handler
  call-site migrations as needed.
- Build `test-first` (one behavior at a time):
    - `arc.commitInterlock` git-config set → wrapper returns git-config value with
      `sourceMap[commit_interlock] === "git-config"`
    - `arc.pushInterlock` git-config set → likewise for push interlock
    - `arc.syncInterlock` git-config set → likewise for sync interlock
    - `arc.notesPush` git-config set → likewise for notes push
    - Git-config absent + yaml present → falls through to yaml; sourceMap reflects "yaml"
    - All absent → defaults; sourceMap reflects "default"
    - Invalid git-config value → falls through to yaml with warning (matches yaml-validation
      shape)

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
        - _Architecture:_ Versioned migrator infrastructure in `update.ts`. Each migration is
          `{ fromFrameworkVersion, migrate(yamlContent: string): string }`. `update` runs
          applicable migrations (selected by stored `manifest.framework_version` vs. current)
          before three-way merging the template against the migrated yaml. Pays for itself
          across future renames; framework currently has no other adopters, so the cost
          lands ahead of demand.
        - _Migrations registered by this task:_
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

- Sweep user-facing strings so "user notes" is the workhorse noun in headlines, action hints,
  and status summaries.
- "Git notes ref" or "git notes" surfaces only when storage mechanism is relevant (debugging,
  ref state, error messages mentioning `refs/notes/...`).
- Affected files (audit-enumerated):
    - `packages/arc-framework/src/commands/user/sync-status.ts` (primary rendering surface)
    - `packages/arc-framework/src/commands/user/format.ts` (summary builders)
    - `packages/arc-framework/src/commands/user/save-load.ts` (error messages)
    - `packages/arc-framework/src/commands/user/push-fetch.ts` (status / handler messaging)
    - `packages/arc-framework/src/commands/user/types.ts` (any user-facing copy in error
      classes / type defaults)
    - `packages/arc-framework/src/handlers/user.ts` (UX strings + prompts)
    - `packages/arc-framework/src/handlers/user-sync.ts` (direction-aware UX strings)
    - `packages/arc-framework/src/handlers/sync.ts` (orchestrator messages)
    - `packages/arc-framework/src/handlers/push-recovery.ts` (recovery-prompt copy)
    - `packages/arc-framework/src/cli.ts` (subcommand help text)
- Test-after — rendering and string-content audit, not logic change.

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

- Extend the bounded-fetch pattern (already in place for the worktree-sync probe) to the notes
  ref on full-mode `arc status` invocation. Session-init probe stays remote-aware via the
  existing pull mechanism.
- Boundary: this task classifies why the notes-sync state differs; it does not decide which
  branch or work unit the identity should work on. Branch-gone recovery and target selection
  remain Worktree Foundation + Coord Probe scope.
- Downstream signal contract: preserve enough metadata from notes discovery for later routing
  work to consume (annotated commit, note-history distance, current-HEAD reachability, and
  inferred local / sibling-session / cross-machine cause).
- Sync-state inference distinguishes:
    - Local-behind-because-haven't-fetched (single-machine, single-session)
    - Local-behind-because-other-machine (cross-machine work)
    - Local-behind-because-sibling-session (same machine, different worktree/session)
- _Sibling-session heuristic:_ compare `LocalSyncState.sourceCommit` (from
  `.sync-state.json`) against the latest entry in `refs/notes/arc/user/{identity}` history.
  Divergence + both-local-only (no remote-ahead path) → sibling session. Cross-machine causes
  flow from remote ref differing from local ref state.
- _Schema extension:_ extend `LocalSyncState` (currently v2 — `version`,
  `materializedManifestHash`, `sourceCommit`, `sourceOperation`, optional `partialPush`) with
  `savedAt: ISO-string`. Bump to v3; readers parse v1 / v2 (existing forward-read pattern in
  `readLocalSyncState`) and write v3. Required for heuristics that need recency to compare
  timestamps.
- _`--offline` mode behavior:_ both worktree and notes fetches suppressed. Cross-machine vs.
  unfetched-local distinction collapses (no remote read available); surface a degraded
  classification ("offline — local state only; cross-machine signals unavailable") rather
  than asserting a cause heuristically.
- Affected files:
  `packages/arc-framework/src/commands/user/sync-status.ts` (rendering + bounded-fetch);
  `packages/arc-framework/src/commands/user/save-load.ts` (`LocalSyncState` schema bump,
  read-with-forward-compat, write at v3).
- Build `test-first` (one behavior at a time):
    - Bounded-fetch on notes ref fires by default in full-mode `arc status`
    - `--offline` suppresses both worktree and notes fetches; classification degrades with
      explicit guidance line
    - Sibling-session detection: `sourceCommit` divergent from notes-ref head, both
      local-only → state-machine resolves to "sibling session"
    - Cross-machine vs. unfetched-local distinction surfaced when remote ref differs
    - `LocalSyncState` v2 → v3 read forward-compat: existing v2 files load without error and
      get `savedAt = null` until the next save

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

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
- `[ ]` `session.sync_interlock: manual` opts handoff out of automatic sync; handoff summary
  surfaces unpushed state without firing pushes
- `[ ]` First-use framing surfaces operational: `arc join` install paragraph, `arc status` hint
  with notes-ref-existence trigger
- `[ ]` Notes-ref bounded-fetch fires on full-mode `arc status`; `--offline` suppresses both
  probes and degrades cause classification with explicit guidance; sibling-session vs.
  cross-machine causes inferred and surfaced
- `[ ]` Layered vocabulary rule applied: "user notes" workhorse noun across
  headlines/hints/summaries; "git notes ref" only when storage mechanism is relevant
- `[ ]` All quality gates pass (markdown lint, TypeScript type check, full Vitest suite, build
  verification)
- `[ ]` Ready for integration

[verify-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
