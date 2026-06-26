# Task List: Stale-State Detect-and-Pull

- **Design:** `spec-stale-state-detect-and-pull.md`

---

## **Phase 1:** Shared primitives

_Purpose:_ Build the two cross-cutting primitives the detection and remediation features consume — the
unpushed-local-drift predicate and the inbound-pull decision — so later phases wire to a tested foundation
rather than reimplementing.

_Design decisions:_ Primitives-first because each is consumed across cluster boundaries (the drift signal by
D3 and D4; the inbound-pull decision by D1's base-ref pull and R1's `arc sync` leg). Both are authored as pure,
unit-testable functions; the impure execution shell wraps the inbound decision. Full rationale in
`notes-stale-state-detect-and-pull.md`.

### `[x]` **1.1 `hasUnpushedLocalDrift` drift predicate (D-shared)**

- _Goal:_ A single predicate answers "does this scope carry local-only content not represented in the pushed
  note basis?" — `false` for benign behind/missing, `true` for real edits — so D3 and D4 both gate on
  unsaved-work safety directly instead of by recency proxy.

- _Outcome:_ New `commands/user/drift.ts`: `hasUnpushedLocalDrift` maps the disk-vs-basis direction matrix
  (`edits`/`modified`/`mixed` → drift; `behind`/`missing`/`null` → benign), with `unsavedDirectionForScope` +
  `hasUnpushedLocalDriftForScope` adding whole-tree (D3) and per-subdir (D4) scoping over a shared basis.
  The predicate maps the **sync-state-aware** direction rather than re-deriving from a raw manifest diff — a
  raw diff can't tell a benign `behind` (disk older than an advanced note) from real local `modified`. Relocated
  the pure `computeUnsavedDirection` out of `sync-status.ts` into `drift.ts` so the shared primitive's dependency
  stays one-way and no consumer import cycle forms when D3/D4 wire in later phases.

### `[x]` **1.2 Inbound-pull decision primitive (R1 core)**

- _Goal:_ A pure decision maps (fetch/compare state × tree state × TTY) to an inbound-pull outcome — ff-pull /
  block-on-diverged / refuse-on-dirty / surface — that both the `arc sync` worktree leg and the D1 base-ref pull
  consume, so inbound-pull policy lives in one tested place.

    - `[x]` **1.2.a Pure inbound-pull decision matrix**
        - _Outcome:_ New `lib/git/inbound-pull.ts` — `decideInboundPull` maps (compare-state ×
          tree × policy × TTY) → `ff-pull` / `prompt` / `block` / `refuse` / `no-op` / `surface`.
          A `policy` input (`manual`/`prompt`/`always`, mirroring `session.init_pull.base`) lets
          one matrix serve both consumers: `arc sync` passes `always`, while a non-TTY downgrades a
          `prompt`-policy fast-forward to `surface` (the agent-safe contract). Reuses
          `WorktreeSyncState` as the compare-state input rather than minting a parallel enum.

    - `[x]` **1.2.b Fetch + compare + ff-pull execution shell**
        - _Outcome:_ `executeInboundPull` in `lib/git/inbound-pull.ts` — the impure wrapper: `boundedFetch`,
          `countAheadBehindRef` compare, `runDirtyStateStatus`, then `decideInboundPull`; on `ff-pull` it runs
          `git merge --ff-only` (a raced fast-forward is caught and downgraded to `block`, never auto-merged).
          Only `ff-pull` mutates. Direct temp-repo integration tests (via `setupMultiClone`) assert the
          fast-forward to the remote tip, no merge commit, and no mutation on `block` / `refuse`.

- _Outcome:_ Phase 1's two shared primitives are in place: the drift signal (1.1) and the inbound-pull
  decision + execution (1.2), the latter split into a pure matrix (`decideInboundPull`) and the side-effecting
  shell (`executeInboundPull`) that wraps it. Phases 2–5 wire to these rather than reimplementing.

## **Phase 2:** Base-ref staleness — detect & pull (D1)

_Purpose:_ Close the silent-base-drift class: detect that local `<base>` is behind `origin/<base>` and give a
config-gated, fast-forward-only path to current. Establishes the `baseBranchSync` envelope slot and the
`session.init_pull.base` config channel, and triggers the `completed/`-index freshen Phase 3's D4 relies on.

_Design decisions:_ `baseBranchSync` (local-`<base>`-vs-`origin/<base>`) is a sibling slot to the shipped
`baseDistance` slot (HEAD-vs-`origin/<base>`), distinct and complementary; name and config namespace align with
the `baseDistance` channel so the two read as one family.

### `[ ]` **2.1 Local base-ref staleness probe + `baseBranchSync` slot (D1 detect)**

- _Goal:_ Session-init computes local-`<base>`-vs-`origin/<base>` staleness and exposes it as a `baseBranchSync`
  envelope slot (mirroring the `worktree` slot shape), so a sibling clone's silently-behind base ref becomes
  visible at orientation.

- _Context:_ `countAheadBehindRef` (`lib/git/worktree-sync.ts`) compares arbitrary refs but is invoked only as
  `countAheadBehindRef(exec, "HEAD", "origin/<base>")` in `runBaseDistanceStatus` (`lib/git/base-distance.ts`).
  The new invocation is `countAheadBehindRef(exec, "<base>", "origin/<base>")` — same primitive, new call site +
  new slot.

- _Shape:_ A **sibling** `Probe<T>` slot to `baseDistance` (not a field on it), assembled in
  `runSessionInitStatus` (`commands/status/run.ts`); follow the `baseDistance` precedent — `inferBaseDistance`
  (`run.ts`) enriches `recommendedAction` / `recommendedPromptText` onto the raw distance.

- **Strategies:** strategy-testing-methodology.md

    - Slot fields: `state`, `ahead` / `behind`, plus `recommendedAction` / `recommendedPromptText` (action
      mapping populated in 2.2 against config).

    - Build `test-first` (one behavior at a time):
        - parity → clean / no-action state
        - behind & fast-forwardable → `ahead: 0`, `behind: N`, behind state
        - diverged (local `<base>` carries commits absent from `origin/<base>`) → diverged state
        - state derivation is config-independent (the config × state → action mapping is 2.2's)

    - _Notes:_ See `notes-stale-state-detect-and-pull.md` § D1.

### `[ ]` **2.2 `session.init_pull.base` config-gated ff-pull + orientation surfacing (D1 remediate, R1 consumer)**

- _Goal:_ A returning machine sees a base-ref-staleness advisory line in orientation and, per the new
  `session.init_pull.base` config channel, gets a fast-forward-only path to current — auto-ff, prompt, or
  surface-only — built on the Phase 1 inbound-pull primitive.

- _Context:_ `session.init_pull.base` is a third channel of the existing `session.init_pull.{worktree,notes}`
  axis (same `recommendedAction` vocabulary), default `prompt`. Named `base` because `branch.base` is the
  configurable term.

- **Strategies:** strategy-configurability-architecture.md, strategy-package-project-sync.md

    - `[ ]` **2.2.a `session.init_pull.base` config key + action mapping**
        - Add to `lib/config/status-reader.ts`: `DEFAULTS` (`"session.init_pull.base": "prompt"`) and
          `ENUM_VALIDATORS` (`["manual", "prompt", "always"]`, mirroring the notes channel — `always` = auto-ff
          when fast-forwardable).
        - Build `test-first` (one behavior at a time):
            - unset → default `prompt`
            - `always` + behind & ff-able → auto-ff (`pull`)
            - `prompt` + behind & ff-able → `prompt`
            - `manual` → `surface` only
            - diverged → `surface` + refuse (never auto-resolve)
            - dirty tree → `surface` + refuse (no auto-stash by default)

    - `[ ]` **2.2.b Orientation advisory line + config-gated ff-pull action**
        - Render the base-ref-staleness line in session-init's existing advisory tier; on the `pull` path invoke
          the Phase 1 primitive (ff-only / block-on-diverged / refuse-on-dirty).
        - **Two-surface edit:** the slot/action lives in the CLI (`commands/status/run.ts` envelope, the pull
          action); the dispatch + rendering instructions edit `session-init.md` Step 2 (sync pulls) and Step 6
          (advisory section) — Framework file, package source + `.arc/` mirror, adopter-facing register.
        - _Note:_ The base-ref ff-pull **freshens the local `completed/` index** (storage-abstract — "make the
          local materialization current," not a baked-in `git pull origin main`); Task 3.2's `shipped`-set
          resolution depends on this.
        - e2e: session-init base-ref pull under each `session.init_pull.base` value.

## **Phase 3:** Notes/disk drift & retired-subdir cleanup (D3, D4)

_Purpose:_ Stop discarding computed notes/disk divergence and stop the retired-subdir accumulation on a
non-integrating machine — two surfaces coupled through the projection bridge and the D-shared drift signal.

_Design decisions:_ D3 and D4 share a phase because they interlock: both consume the Phase 1 drift signal, D4's
resolution depends on Phase 2's index freshen, and D3's projection-bridge extension feeds the same orphan
classification D4 reconciles against. The `arc user open` non-TTY fix is its own parent — a distinct entry-point
surface (a CLI prompt) from the reconcile gate.

### `[ ]` **3.1 Clean-arm notes/disk drift surfacing + projection-bridge prior-file-list (D3)**

- _Goal:_ Session-init's clean arm stops silently discarding computed notes/disk divergence: `mixed` / `missing`
  surface as advisory, the narrow safe sub-case auto-loads, and the projection bridge carries the prior file-list
  so the warning distinguishes intentional retirement from real local drift.

- _Context:_ `computeSessionInitLoadNeeded` (`commands/user/sync-status.ts`) returns `true` only when
  `refState === "same"` AND `unsavedDirection === "behind"`; `mixed` / `missing` collapse to no-action, so the
  active WU's `SESSION-NOTES.md` can be in the note yet absent on disk while the probe reports clean.

- _Note:_ Two-surface edit: the `user`-slot computation lives in the CLI (`commands/user/sync-status.ts`); the
  clean-arm surfacing instruction edits `session-init.md` Step 2 (notes dispatch) / Step 6 (advisory tier) —
  Framework file, package source + `.arc/` mirror.

- **Strategies:** strategy-testing-methodology.md, strategy-package-project-sync.md

    - `[ ]` **3.1.a Surface `mixed` / `missing` on the clean arm**
        - Consumes the D-shared **whole-tree** drift signal to decide surface-vs-load.
        - Build `test-first` (one behavior at a time):
            - `mixed` → `recommendedAction: surface` (not auto-load — may carry real edits)
            - `missing` → `surface`
            - active-WU-`SESSION-NOTES`-present-in-note-absent-on-disk → **auto-load** (pure-missing for that
              file — safe)
            - `behind` → unchanged (existing auto-load path)
            - benign drift → no false-positive surface
        - Integration: the clean-arm surface / auto-load cases.

    - `[ ]` **3.1.b Extend the projection bridge with the prior file-list**
        - Carry the prior file-list through `lib/user-sync/projection.ts` so a file gone because its WU shipped
          reads as intentional retirement, vs. a file gone with local-only siblings as real drift.
        - Build `test-first` (one behavior at a time):
            - file absent because its WU shipped → intentional retirement
            - file absent with local-only sibling content → real drift

    - _Notes:_ See `notes-stale-state-detect-and-pull.md` § D3.

### `[ ]` **3.2 Drift-gated retired-subdir reconcile (D4)**

- _Goal:_ A shipped WU's orphaned user subdir auto-removes (reversibly) once the index is freshened and it
  carries no unpushed drift — replacing the lossy recency-window proxy with the D-shared drift gate — so a
  non-integrating machine stops accumulating orphan-warning subdirs.

- _Context:_ `planRetiredSubdirReconcile` (`lib/user-sync/retired-subdir.ts`) reconciles iff
  `!notesWuNames.has(subdir)` AND `shipped.has(subdir)` — where `shipped` is a `ReadonlySet<string>` from
  `readShippedWorkUnits` scanning the **local** `.arc/completed/` archive (membership test; there is no
  `isSlugShipped` symbol). A stale base ref → the slug is absent from `shipped` → preserve → recurring orphan
  warning. The delete (`removeStaleUserWuSubdir`, `rm -rf`) and the pre-load `.internal/<timestamp>` backup
  already ship — the gap is the gate.

- **Strategies:** strategy-testing-methodology.md

    - The reconcile gate becomes `shipped.has(subdir) && !hasUnpushedLocalDrift(subdir)` — the
      `!notesWuNames.has(subdir)` conjunct gives way to the D-shared per-subdir drift signal, and Phase 2's
      freshened index lets `shipped` resolve correctly (the dominant fix for the accumulation). No new backup
      work; frame removal as **local dematerialization of a projection**, not a canonical delete.

    - Build `test-first` (one behavior at a time):
        - shipped (post-freshen) AND no per-subdir drift → reconcile (remove)
        - shipped AND per-subdir drift present → preserve (possible unsaved work)
        - shipped AND still in the recent-notes window AND no drift → reconcile (the time-gating is gone)
        - not shipped (abandoned / unknown / typo'd / renamed-away) → preserve (advisory, never auto-remove)

    - Integration: reconcile + `.internal/` backup round-trip (removal recoverable).

    - _Notes:_ See `notes-stale-state-detect-and-pull.md` § D4.

### `[ ]` **3.3 `arc user open` non-TTY stale-subdir safety (D4)**

- _Goal:_ `arc user open` never hangs or default-deletes on a lingering stale subdir: the resolver-gated
  reconcile (3.2) replaces the prompt for the shipped case, and the residual unresolvable case defaults to keep —
  under non-TTY, auto-skip to keep rather than clack's abort-on-cancel.

- _Context:_ `promptStaleSubdir` (`handlers/user.ts`) fires a clack `select` whose default/first option (`y —
  remove and proceed`) deletes the subdir; under non-TTY the select cancels and `p.isCancel` aborts the whole
  `arc user open` (observed to hang an agent invocation).

- _Note:_ Narrow interim instance of `cli-substrate-adoption`'s uniform non-interactive contract — cross-ref its
  inbound buffer; do not absorb the whole contract.

- **Strategies:** strategy-testing-methodology.md

    - Build `test-first` (one behavior at a time):
        - shipped subdir → resolved by the reconcile, no prompt
        - unresolvable subdir, TTY → default option is **keep** (never default-destructive)
        - unresolvable subdir, non-TTY → auto-skip to keep (never hang, never abort-on-cancel)

## **Phase 4:** `plan/`-orphan sweep (D2)

_Purpose:_ Remove the stale `plan/<name>` branches a non-activating machine accumulates after a sibling renames
the branch locally — branch hygiene, not WU-state inference.

### `[ ]` **4.1 `plan/`-orphan detection + interlock-gated `-d` offer (D2)**

- _Goal:_ Session-init in the primary worktree detects local `plan/<name>` branches whose upstream is `[gone]`
  and which are merged to `branch.base`, and offers an interlock-gated `git branch -d` removal — clearing the
  stale branches left after a sibling's local-only `plan/ → <type>/` rename.

- _Context:_ `activate-work-unit`'s rename is local-only; the non-activating sibling keeps a `[gone]`-upstream
  `plan/<name>` forever. This is the cross-machine `plan/`-orphan reaper — the facet `async-merge-lifecycle`
  explicitly deferred (it owned only the `feat/` orphan, shipped as the `integrate-work-unit` Step 13 merge-time
  teardown; this session-init sweep was punted downstream and relocated here at the cross-machine-coherence
  restructure). No session-init orphan-**branch** sweep exists to mirror — this builds it.

- _Approach:_ Compose from three shipped sources — the stale-**worktree** sweep's surface shape
  (`lib/session-init/stale-worktree-sweep.ts`: `runStaleWorktreeSweep` / `decideWorktreeCleanup`); Worktree
  Foundation's `gone`-upstream detection (`isBranchGoneError`, `branch-gone-cascade.ts`); and the
  merged-only-safe `git branch -d` teardown pattern proven in `async-merge-lifecycle`'s `integrate-work-unit`
  Step 13. Build the merged-to-base check new.

- **Strategies:** strategy-testing-methodology.md, strategy-package-project-sync.md

    - **Two-surface edit:** sweep computation in the CLI — a **new** `Probe<T>` slot in `runSessionInitStatus`
      (not an extension of `sweep`, which carries worktrees); the orientation offer renders via `session-init.md`
      Step 6 (Framework file — package source + `.arc/` mirror).

    - Build `test-first` (one behavior at a time):
        - `[gone]`-upstream + merged-to-base `plan/` branch → offered for `git branch -d`
        - `[gone]`-upstream but NOT merged → not offered (merged-only-safe; never `-D`)
        - live-upstream `plan/` branch → not swept
        - non-primary worktree → sweep does not run

    - _Notes:_ See `notes-stale-state-detect-and-pull.md` § D2.

## **Phase 5:** Marker rendering & bidirectional `arc sync` (C1, R1)

_Purpose:_ Wire the two remaining consumers onto shipped / Phase-1 substrate — render the cohort sibling's
partial-push marker on the B side, and complete `arc sync`'s inbound leg so it can pull, not just push.

_Design decisions:_ Both parents are thin "consume an existing substrate" wirings (C1 reads the shipped
sync-state ref; R1's sync leg reuses the Phase 1 inbound-pull primitive), so they pair into one phase despite
sitting in different spec clusters (Consume vs Remediate).

### `[ ]` **5.1 Partial-push marker Aware-register rendering (C1)**

- _Goal:_ A live partial-push marker renders a calm, non-gating Aware one-liner at session-init —
  `short-sha ← lastAttemptedCommit · when ← attemptTimestamp · whose ← machineId` — co-located with D1's
  base-ref surface, falling silent once liveness reports fulfilled and on an absent ref; the agent
  proceeds-with-context and never auto-resolves.

- _Context:_ The producer (`partial-push-marker`, shipped) owns `refs/arc/user/{identity}/sync-state`, the
  `SyncStateMarker` payload, and `evaluateMarkerLiveness(marker, notesRefTip) → "fulfilled" | "live"`
  (`lib/user-sync/sync-state-ref.ts`, `sync-state-marker.ts`). Rendering the B-side surface is its explicit
  non-goal.

- _Shape:_ A **new** envelope slot (e.g. `partialPushMarker`), not folded into the `user` slot; the rendered
  line co-locates with the base-ref surface in Step 6.

- _Note:_ The Caution force-gate register is **parked** (out of scope) — this WU ships **Aware only**. Invoke
  `evaluateMarkerLiveness` (a pure ref-compare — **clock-free**); the 14-day TTL is a separate constant
  (`SYNC_STATE_MARKER_TTL_DAYS`) the **consumer** applies against `attemptTimestamp`. Do not reimplement
  self-invalidation.

- **Strategies:** strategy-testing-methodology.md, strategy-package-project-sync.md

    - **Two-surface edit:** ref read + liveness/TTL evaluation in the CLI envelope (new slot); the Aware
      one-liner renders via `session-init.md` Step 6 (Framework file — package source + `.arc/` mirror), in the
      existing advisory tier.

    - Build `test-first` (one behavior at a time):
        - live marker → Aware one-liner rendered from payload fields
        - liveness `fulfilled` → silent (no timer)
        - `attemptTimestamp` older than the 14-day TTL backstop → aged out (silent)
        - absent ref (fetch-only clone / remote sync off) → degrade silent

    - _Notes:_ See `notes-stale-state-detect-and-pull.md` § C1.

### `[ ]` **5.2 Bidirectional `arc sync` inbound leg (R1)**

- _Goal:_ `arc sync` becomes truly bidirectional — its worktree leg ff-pulls on `remote-ahead`, blocks on
  `diverged`, refuses on dirty — by wiring the Phase 1 inbound-pull primitive into `decideWorktree`, agent-safe
  (no blocking TTY prompt; non-TTY auto-skip to surface).

- _Context:_ `decideWorktree` (`handlers/sync.ts:231`) returns `skip-blocked-worktree` for all of
  `WORKTREE_PUSH_BLOCK_STATES` (`diverged`, `remote-ahead`, `detached-head`, `no-remote`, `branch-gone`,
  `remote-unavailable`) today — push-only. The inbound leg converts only **`remote-ahead` → ff-pull**; the rest
  stay blocked.

- _Approach:_ Author the inbound decision as a pure matrix-outcome (composes with `sync-handler-decomposition`,
  which relocates this matrix); any notes write reuses the existing notes path.

- **Strategies:** strategy-testing-methodology.md, strategy-concurrent-work.md

    - Build `test-first` (one behavior at a time):
        - `remote-ahead` + clean → ff-pull (was `skip-blocked-worktree`)
        - `diverged` → block
        - dirty → refuse
        - non-TTY → auto-skip to surface, never auto-pull

    - e2e: `arc sync` bidirectionality (ff-pull / block / refuse) against real temp repos.

    - _Notes:_ See `notes-stale-state-detect-and-pull.md` § R1.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` A machine whose local `<base>` is behind `origin/<base>` surfaces it at session-init and (config-gated)
  ff-pulls current; a diverged or dirty base surfaces and refuses, never auto-resolving.
- `[ ]` A `[gone]`-upstream, base-merged `plan/` branch is offered for `-d` removal (never `-D`); nothing else
  is swept.
- `[ ]` Notes/disk `mixed` / `missing` drift surfaces on the clean arm; the active-WU-`SESSION-NOTES`-absent
  sub-case auto-loads; benign drift does not false-positive.
- `[ ]` A shipped WU's orphaned user subdir is auto-removed (recoverable from the pre-load backup) once the
  index is freshened and it carries no unpushed drift — no accumulation on a non-integrating machine; a
  non-shipped / live / unresolvable subdir is preserved; no agent hang and no default-delete on `arc user open`.
- `[ ]` A live partial-push marker renders the Aware one-liner at session-init from the shipped payload, falling
  silent once liveness reports fulfilled and on an absent ref.
- `[ ]` `arc sync` is bidirectional: ff-pulls on `remote-ahead`, blocks on `diverged`, refuses on dirty —
  agent-safe (no blocking TTY prompt).
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.
