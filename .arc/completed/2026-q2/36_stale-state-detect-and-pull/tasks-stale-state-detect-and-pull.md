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
`session.init_pull.base` config channel.

_Design decisions:_ `baseBranchSync` (local-`<base>`-vs-`origin/<base>`) is a sibling slot to the shipped
`baseDistance` slot (HEAD-vs-`origin/<base>`), distinct and complementary; name and config namespace align with
the `baseDistance` channel so the two read as one family.

### `[x]` **2.1 Local base-ref staleness probe + `baseBranchSync` slot (D1 detect)**

- _Goal:_ Session-init computes local-`<base>`-vs-`origin/<base>` staleness and exposes it as a `baseBranchSync`
  envelope slot (mirroring the `worktree` slot shape), so a sibling clone's silently-behind base ref becomes
  visible at orientation.

- _Outcome:_ `runBaseBranchSyncStatus` (`lib/git/base-branch-sync.ts`) wraps
  `countAheadBehindRef(exec, "<base>", "origin/<base>")` — sibling to `runBaseDistanceStatus`, with no
  `detached-head` arm (the comparison targets a named base ref, not HEAD) and a missing local base ref degrading
  to `remote-unavailable`. Exposed as a raw, always-present `baseBranchSync` envelope slot (wired through
  `SessionInitProbes`, the `status` handler, `runSessionInitStatus`, and `SessionInitProbeResult`); the
  config-gated `recommendedAction` / `recommendedPromptText` enrichment is 2.2's. State derivation is
  config-independent and covered by `base-branch-sync.test.ts`.

### `[x]` **2.2 `session.init_pull.base` config-gated ff-pull + orientation surfacing (D1 remediate, R1 consumer)**

- _Goal:_ A returning machine sees a base-ref-staleness advisory line in orientation and, per the new
  `session.init_pull.base` config channel, gets a fast-forward-only path to current — auto-ff, prompt, or
  surface-only — built on the Phase 1 inbound-pull primitive.

    - `[x]` **2.2.a `session.init_pull.base` config key + action mapping**
        - `session.init_pull.base` added across the config surface (`ConfigSettings` /
          `ConfigSessionInitSettings` types, `status-reader.ts` `DEFAULTS` = `"prompt"` + `ENUM_VALIDATORS` =
          `["manual","prompt","always"]`, the session-init scoped-key list, and both `arc-config.yml` copies with
          inline docs). New `inferBaseBranchSync(slot, policy, dirty)` (`recommended-action.ts`) maps state ×
          policy × dirty → action: `remote-ahead` + `always` → `pull`, + `prompt` → `prompt` (with the
          fast-forward offer), + `manual` → `surface`; `diverged` and any dirty tree → `surface` + refuse
          (never auto-resolved); `clean` / `local-ahead` / degraded → `skip`. Pure mapping, no consumer yet
          (wired in 2.2.b); covered in `recommended-action.test.ts` and `status-reader.test.ts`.

    - `[x]` **2.2.b Orientation advisory line + config-gated ff-pull action**
        - CLI: `runSessionInitStatus` now enriches the `baseBranchSync` slot (new
          `SessionInitBaseBranchSyncValue` + `normalizeBaseBranchSyncPolicy`) with the config-gated
          recommendation, and `inferBaseBranchSync` was refactored to **delegate to the shared
          `decideInboundPull` matrix** (the cohort's one-inbound-pull-primitive contract) instead of its own
          switch. Workflow (two-copy `session-init.md` + `.template.md`): Step 1 slot table row, a Step 2
          "Base-branch-sync channel" dispatch (`pull` / `prompt` run `git fetch origin <base>:<base>` — a
          non-checkout, ff-only freshen), and a Step 6 **Stale base** advisory. Pull is **agent-dispatched**
          (consistent with the worktree/notes channels); the `executeInboundPull` non-checkout execution seam is
          deferred to the `arc sync` leg (Phase 5). e2e covers the envelope recommendation under each
          `session.init_pull.base` value (incl. the dirty-tree refusal).
        - _Note:_ D4 resolves its `shipped` set directly from `origin/<base>` (no local `completed/` freshen
          needed) — settled at Phase 3.

## **Phase 3:** Notes/disk drift & retired-subdir cleanup (D3, D4)

_Purpose:_ Stop discarding computed notes/disk divergence and stop the retired-subdir accumulation on a
non-integrating machine — two surfaces coupled through the projection bridge and the D-shared drift signal.

_Design decisions:_ D3 and D4 share a phase because they interlock: both consume the Phase 1 drift signal, D4's
resolution depends on Phase 2's index freshen, and D3's projection-bridge extension feeds the same orphan
classification D4 reconciles against. The `arc user open` non-TTY fix is its own parent — a distinct entry-point
surface (a CLI prompt) from the reconcile gate.

### `[x]` **3.1 Clean-arm notes/disk drift surfacing + projection-bridge prior-file-list (D3)**

- _Goal:_ Session-init's clean arm stops silently discarding computed notes/disk divergence: `mixed` / `missing`
  surface as advisory, the narrow safe sub-case auto-loads, and the projection bridge carries the prior file-list
  so the warning distinguishes intentional retirement from real local drift.

    - `[x]` **3.1.a Surface `mixed` / `missing` on the clean arm**
        - Outcome: clean-arm verdict settled by a new pure helper `resolveCleanArmNotesVerdict` (`drift.ts`):
          `behind` / active-WU-`SESSION-NOTES`-only-missing → auto-load (`loadNeeded`); `mixed` / general
          `missing` → advisory surface; `edits` / `modified` / `null` → neither. The active-WU-keyed safe
          sub-case is resolved in the orchestrator (`status/run.ts`), where the WU name is known — the user
          probe carries a raw `notesDrift` signal (`inspectDiskVsLocalSnapshot` now also returns the
          missing-file set), finalized into `loadNeeded` + a new `notesDriftSurface` envelope field
          (`SessionInitUserValue`). `session-init.md` (both copies) renders it in Step 6's advisory tier.

    - `[x]` **3.1.b Extend the projection bridge with the prior file-list**
        - Outcome: `priorFileList` (a reserved `.sync-state.json` field, never populated until now) is captured
          at save/load with the materialized file set, and consumed by a new pure
          `missingFilesAreIntentionalRetirement` (`drift.ts`): a `missing` set wholly present at last sync reads
          as deliberate local retirement (benign — suppressed), a fresh arrival as real drift (surfaced).
          Threaded via `notesDrift.missingAreRetirement` into the verdict. Behavior-2 (local-only siblings) is
          structurally the `mixed` case 3.1.a already surfaces, so it needs no separate gate.

- _Outcome:_ Clean-arm divergence pipeline complete end-to-end: `inspectDiskVsLocalSnapshot` → raw `notesDrift`
  → orchestrator verdict → `loadNeeded` / `notesDriftSurface`. A genuinely stale-or-missing file surfaces (or
  safely auto-loads); a deliberately-retired file no longer false-positives — the projection basis is the
  last-sync `priorFileList`, storage-abstract per § D3. See `notes-stale-state-detect-and-pull.md` § D3.

### `[x]` **3.2 Drift-gated retired-subdir reconcile (D4)**

- _Goal:_ A shipped WU's orphaned user subdir auto-removes (reversibly) once the index is freshened and it
  carries no unpushed drift — replacing the lossy recency-window proxy with the D-shared drift gate — so a
  non-integrating machine stops accumulating orphan-warning subdirs.

- _Outcome:_ `shipped` now resolves against `origin/<base>` via a new `readShippedWorkUnitsFromRef`
  (`completed-index.ts`, `git ls-tree -r` — branch-independent, fresh off the probe's existing base fetch); the
  working-tree `readShippedWorkUnits` stays for the stale-worktree sweep. `planRetiredSubdirReconcile`
  (`retired-subdir.ts`) swaps its recency conjunct for a `driftingSubdirs` set (`PreservedReason` →
  `not-shipped` | `has-drift`), fed by a new pure `computeDriftingSubdirs` (`drift.ts`) whose basis is the most
  recent note still carrying the subdir — never the latest note, against which a shipped-and-dropped subdir would
  false-read as `edits`. Both consumers rewired: `reconcileRetiredSubdirs` (`save-load.ts`, resolves base from
  config) and `runRetiredSubdirDetection` (`retired-subdir-detection.ts`, now serializes a disk content manifest
  and takes an injected `computeDrift` so `lib/` needn't import `commands/`). Dead `collectNotesWuNames` removed.
  Integration round-trip exercises ship-on-`origin/main` / drop-from-working-tree, proving the branch-independent
  read + `.internal/` backup recovery. See `notes-stale-state-detect-and-pull.md` § D4.

### `[x]` **3.3 Load-summary message register — reconcile / notice / warning split (D3, D4)**

- _Goal:_ `arc user load` / `pull` stops filing routine retired-subdir cleanups under `Warnings:`. The flat
  load-result message list splits by register — a successful reconcile reads as an info-level cleanup, a
  preserved-orphan as an advisory notice, and a malformed-merge as a true warning — and the wording drops
  internal mechanism jargon and unifies the backup verb.

- _Outcome:_ `UserLoadResult` now carries `messages: LoadMessage[]` (a `{ level, text }` register —
  `cleanup` / `notice` / `warning`) in place of the flat `warnings: string[]`. `runUserLoad` (`save-load.ts`)
  tags each source — reconcile → `cleanup`, orphan-preserved → `notice`, malformed-merge → `warning` — and
  `buildLoadSummary` (`format.ts`) groups them under `Cleaned up:` / `Notices:` / `Warnings:` headings,
  emitting a heading only for a non-empty group. Wording normalized: dropped the internal "absent from recent
  notes" phrase and unified the backup verb to "backed up to" across the reconcile and preserve strings
  (`renderOrphanWarning` → `renderOrphanNotice`). A routine retired-subdir cleanup no longer reads as a warning.

### `[x]` **3.4 `arc user open` non-TTY stale-subdir safety (D4)**

- _Goal:_ `arc user open` never hangs or default-deletes on a lingering stale subdir: the resolver-gated
  reconcile (3.2) replaces the prompt for the shipped case, and the residual unresolvable case defaults to keep —
  under non-TTY, auto-skip to keep rather than clack's abort-on-cancel.

- _Outcome:_ `handleUserOpen` (`handlers/user.ts`) now runs a new `reconcileRetiredSubdirsStandalone`
  (`commands/user/save-load.ts` — serialize + timestamped backup + the shared `reconcileRetiredSubdirs`) up
  front: a shipped, drift-free subdir is removed reversibly with no prompt. `promptStaleSubdir` became
  `resolveResidualStaleSubdir` — non-interactive (`isNonInteractiveEnvironment`) auto-skips to keep; interactive
  offers `keep` (default, `initialValue`) / `remove` / `inspect`, and a cancel resolves to keep, so the open
  never aborts and never default-deletes. Covered at three tiers: handler unit (reconcile-no-prompt, default-keep,
  non-TTY auto-skip, cancel-keeps), integration (the standalone helper removes shipped / preserves unshipped), and
  e2e (real-CLI `arc user open` reconciles a shipped subdir and keeps an unresolvable one without hanging — the
  destructive-removal proof). See `notes-stale-state-detect-and-pull.md` § D4.

### `[x]` **3.5 Session-init reconcile trigger — graceful without a manual pull (D4)**

- _Goal:_ A non-integrating machine's retired subdir is reconciled at session-init under the developer's existing
  pull policy, not only when a notes pull happens to fire — so the cleanup is graceful for the no-manual-pull path,
  not just for notes-stale sessions.

- _Outcome:_ The `retiredSubdirs` probe slot is enriched with `recommendedAction` / `recommendedPromptText` via a
  new pure `inferRetiredSubdirs` (`recommended-action.ts`), gated on `session.init_load.notes` × candidate presence
  × dirty: `always`+clean → `pull`, `always`+dirty → `prompt`, `prompt` → `prompt`, `manual` → `surface`, no
  candidates → `skip`. Wired in `status/run.ts` (new `normalizeNotesLoadPolicy`; `SessionInitRetiredSubdirsValue` in
  `status/types.ts`). `session-init.md` (both copies) Step 2 notes-load dispatch now fires one `arc user load` on
  `loadNeeded` **OR** retired candidates (single load — no double-run); Step 1 table + Step 6 reframed to the policy
  gate (Step 6 surfaces only the warn-only `surface` case, since `pull` / `prompt` fire in Step 2). Integration
  round-trip on a non-integrating fixture (sibling shipped on `origin/main`, notes current) proves detection →
  `pull` recommendation → reconcile + `.internal/` backup. See `notes-stale-state-detect-and-pull.md` § D4.

## **Phase 4:** `plan/`-orphan sweep (D2)

_Purpose:_ Remove the stale `plan/<name>` branches a non-activating machine accumulates after a sibling renames
the branch locally — branch hygiene, not WU-state inference.

### `[x]` **4.1 `plan/`-orphan detection + interlock-gated `-d` offer (D2)**

- _Goal:_ Session-init in the primary worktree detects local `plan/<name>` branches whose upstream is `[gone]`
  and which are merged to `branch.base`, and offers an interlock-gated `git branch -d` removal — clearing the
  stale branches left after a sibling's local-only `plan/ → <type>/` rename.

- _Outcome:_ Built the sweep from a new `lib/git/gone-upstream-branches.ts` primitive (one `for-each-ref`
  over `refs/heads/plan/`, NUL-joined `%(upstream:track,nobracket)`, keeping only `gone`) plus a new
  `lib/session-init/plan-orphan-sweep.ts` that flags each gone orphan's `merged` verdict via the shipped
  `isLandedInBase` against `origin/<base>` — merged-only-safe, never `-D`. New `planOrphanSweep` envelope
  slot in `runSessionInitStatus`, gated on primary-worktree identity alone (no roster dependency, unlike
  `sweep`). Orientation offer renders in `session-init.md` Step 1 table + Step 6 (package template + `.arc/`
  mirror). See `notes-stale-state-detect-and-pull.md` § D2.

## **Phase 5:** Marker rendering & bidirectional `arc sync` (C1, R1)

_Purpose:_ Wire the two remaining consumers onto shipped / Phase-1 substrate — render the cohort sibling's
partial-push marker on the B side, and complete `arc sync`'s inbound leg so it can pull, not just push.

_Design decisions:_ Both parents are thin "consume an existing substrate" wirings (C1 reads the shipped
sync-state ref; R1's sync leg reuses the Phase 1 inbound-pull primitive), so they pair into one phase despite
sitting in different spec clusters (Consume vs Remediate).

### `[x]` **5.1 Partial-push marker Aware-register rendering (C1)**

- _Goal:_ A live partial-push marker renders a calm, non-gating Aware one-liner at session-init —
  `short-sha ← lastAttemptedCommit · when ← attemptTimestamp · whose ← machineId` — co-located with D1's
  base-ref surface, falling silent once liveness reports fulfilled and on an absent ref; the agent
  proceeds-with-context and never auto-resolves.

- _Outcome:_ New identity-gated `partialPushMarker` envelope slot — `partial-push-marker-surface.ts`
  pairs a pure `selectAwareMarkers` (live-and-within-TTL filter) with an IO `runPartialPushMarkerSurface`
  that reads the local sync-state ref; wired through `status` types / `run.ts` / handler, with the Aware
  advisory rendered in Step 6 of both `session-init` copies (plus the Step 1 slot row). Liveness and TTL
  invoke the producer's `evaluateMarkerLiveness` / `isMarkerExpired` — no self-invalidation reimplemented.
  Passing the local notes-ref tip as origin's network-free proxy makes the current machine's own marker
  self-silence (`fulfilled`) while a sibling's unfulfilled marker surfaces — no machine-id exclusion
  needed, validated live against the repo's real two-entry ref. Caution register stays parked (Aware only).

### `[x]` **5.2 Bidirectional `arc sync` inbound leg (R1)**

- _Goal:_ `arc sync` becomes truly bidirectional — its worktree leg ff-pulls on `remote-ahead`, blocks on
  `diverged`, refuses on dirty — by wiring the shipped `decideInboundPull` / `executeInboundPull` primitive into
  `decideWorktree`. Interactivity-split and config-gated per the settled design (`spec § R1`): TTY auto-ffs (no
  prompt); non-TTY surfaces by default, auto-ffs only under `sync.auto_pull: true`; the auto-ff path emits a
  files-changed report. The CLI never blocks on a prompt.

- _Outcome:_ New boolean `sync.auto_pull` (default `false`) registered in `status-reader.ts`
  (`DEFAULTS` + `ENUM_VALIDATORS`), `ConfigSettings`, both `arc-config.yml` copies, and both
  `validate-config.sh` copies. `decideWorktree` gained an `inbound-ff-pull` `WorktreeAction` gated on
  `remote-ahead && (isTty || autoPull)` — placed ahead of the block-state check and behind the
  `pushInterlock: manual` short-circuit, so `remote-ahead` only diverts to inbound when push is authorized.
  `decideNotes` now reads the resolved worktree action and treats `inbound-ff-pull` as will-be-clean (notes
  proceed the same run via the single-leg `pushNotesLeg`); a raced block/refuse at execute re-blocks notes
  (`notes-blocked-by-inbound:*`, exit 1). Execution routes through a new `executeInboundFfPull` calling
  `executeInboundPull` with `policy: "always"`; the notes tail of `executeSingleLeg` was extracted to a shared
  `completeNotesLeg`. Single `inbound-pull` cell (proceeded, not in `REFUSED_SYNC_CELLS`); dry-run + audit +
  files-changed stdout report wired. `isTty` derives from `!isNonInteractiveEnvironment()` (the `--json` flag
  does not force non-TTY). Two `sync-orchestrator.test.ts` blocked-cell parameterizations dropped their
  `remote-ahead` row (now the inbound cell under the interactive default); 7 full-`ConfigSettings` fixtures
  gained the new key. Covered by 7 new orchestrator unit cases + 4 `arc sync` e2e cases (ff-pull / surface /
  refuse / block) against real temp repos. Also closed a pre-existing Phase 2 gap found while editing the shell
  validator: `session.init_pull.base` was absent from `validate-config.sh`'s `known_keys` + `validate_enum`
  (tripped an "unknown key" warning) — registered in both copies alongside `sync.auto_pull`.

## **Phase 6:** Verification

### `[x]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

- _Quality gates:_ md lint (0 errors), shell lint, `lint:ts`, `typecheck:all`, build, and 3452 tests (1 skipped)
  — full Tier 3 suite passed.
- _Success criteria:_ all 6 met. The marker criterion was live-verified end-to-end: the repo's own marker
  (machine `06a53d77`) rendered a **false-positive** Aware line because the producer's liveness predicate tested
  exact-OID equality rather than reachability — a marker whose intent origin had advanced _past_ stayed live until
  its TTL. Fixed by switching the predicate to a reachability check (shipped separately, absorbed via base merge;
  consumer surface rewired to the injected resolver in `a3a6249f`); the live marker now self-silences.

---

## Success Criteria

- `[x]` A machine whose local `<base>` is behind `origin/<base>` surfaces it at session-init and (config-gated)
  ff-pulls current; a diverged or dirty base surfaces and refuses, never auto-resolving.
- `[x]` A `[gone]`-upstream, base-merged `plan/` branch is offered for `-d` removal (never `-D`); nothing else
  is swept.
- `[x]` Notes/disk `mixed` / `missing` drift surfaces on the clean arm; the active-WU-`SESSION-NOTES`-absent
  sub-case auto-loads; benign drift does not false-positive.
- `[x]` A shipped WU's orphaned user subdir is auto-removed (recoverable from the pre-load backup) once the
  index is freshened and it carries no unpushed drift — no accumulation on a non-integrating machine; a
  non-shipped / live / unresolvable subdir is preserved; no agent hang and no default-delete on `arc user open`.
- `[x]` A live partial-push marker renders the Aware one-liner at session-init from the shipped payload, falling
  silent once liveness reports fulfilled and on an absent ref.
    - **Verified live:** the repo's own marker (machine `06a53d77`, intent reachable from the notes tip) rendered
      as a false-positive Aware line under the original exact-OID predicate; after the reachability fix it
      self-silences (`partialPushMarker.markers` empty at session-init).
- `[x]` `arc sync` is bidirectional: ff-pulls on `remote-ahead`, blocks on `diverged`, refuses on dirty —
  agent-safe (no blocking TTY prompt).
- `[x]` All quality gates pass (tests, linting, type checking).
- `[x]` Ready for integration.
