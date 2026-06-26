# Spec (`detailed` · `RFC`): stale-state-detect-and-pull

- **Origin:** [internal] — the "machine B is unaware of a state change machine A / origin made" family,
  surfaced across the user-notes sync audit and several cross-machine housekeep drains. Sibling to
  `partial-push-marker` (the push-side half of the `cross-machine-coherence` cohort).

- **Purpose:** Cross-machine **arrival coherence** — when machine B returns to work, detect that its local
  state is stale relative to a change machine A / origin made (base ref behind, `plan/`-orphan branches,
  notes/disk drift, retired subdirs), render the cohort sibling's partial-push marker on the B side, and give
  B a one-command path to get current.

---

## Introduction / Context

ARC's cross-machine user-state layer (git-notes portability + `arc sync` + the `arc user` group) lets a single
developer resume work across machines. But the **arrival side** is under-served: when machine B opens a session,
session-init only compares the *current branch* against *its* upstream. Several classes of "B is stale" slip
through that narrow read:

- **Local base ref drifts silently.** When cross-machine integration lands on machine A, A fast-forwards its
  local `main` as a merge side-effect; B never does. B's local `<base>` can fall arbitrarily behind
  `origin/<base>` with no signal at orientation (observed live: a sibling's local `main` 47 commits behind).
- **`plan/`-orphan branches accumulate.** `activate-work-unit` renames `plan/<name>` → `<type>/<name>` *locally
  only*; the machine that did not run activation keeps a stale, `[gone]`-upstream `plan/<name>` forever.
- **Notes/disk drift is discarded.** Session-init can report `user.state: clean` / `loadNeeded: false` while the
  git note on `HEAD` *contains* the active WU's `SESSION-NOTES.md` and the checkout does not — the divergence is
  computed and then dropped.
- **Retired-subdir cleanup is time-gated and lossy.** The reconcile that removes a shipped WU's orphaned user
  subdir lags behind a recency window, and its already-wired delete carries no backup.

Separately, the cohort sibling `partial-push-marker` (shipped) produces a cross-machine signal — a sync-state ref
recording "machine A attempted a notes push for HEAD X but it has not landed" — and explicitly leaves *rendering
that signal on the B side* as this WU's deliverable.

Finally, `arc sync` cannot remediate any of this: its worktree leg is **push-only**, blocking rather than pulling
on `remote-ahead` / `diverged`, so it can't replace `git pull` on arrival.

This WU closes the arrival side: **detect** the four staleness classes, **consume/render** the sibling's marker,
and **remediate** with a shared inbound-pull primitive. Much of it **extends shipped machinery** rather than
building anew (see Proposed Design § Shipped substrate).

## Goals

- A returning machine **detects** its stale local state at session-init across all four classes (base-ref
  staleness, `plan/`-orphans, notes/disk drift, retired subdirs) — and surfaces each in orientation's existing
  advisory tier rather than failing silent.
- Detection is **safe by construction**: read-only probes; destructive remediation is gated, reversible, and
  fails toward under-action, never over-action.
- A returning machine has a **one-command path to current**: a config-gated session-init base-ref pull and a
  truly bidirectional `arc sync`, both built on a single inbound-pull primitive.
- The sibling's **partial-push marker renders** on the B side as the **Aware** session-init one-liner, from the
  shipped payload and liveness predicate — never reimplementing the producer's self-invalidation. (The Caution
  force-gate register is parked — see Non-Goals.)
- The design **composes with the shipped storage / sync substrate** and the in-flight architecture-remediation
  WUs, so it lands cleanly regardless of their order.

## Non-Goals

- **Producing the partial-push marker.** `partial-push-marker` (cohort sibling, shipped) owns the sync-state ref
  write, the push-time Act register, and the liveness predicate. This WU only *consumes and renders* it (C1).
- **Single-machine inter-process ref races.** `state-ref-write-safety` (agile-parallelism) CAS-guards
  same-machine writes; this WU is read-side on the sync-state ref and adds no blind shared-state write.
- **The substrate-wide non-interactive prompting contract.** `cli-substrate-adoption` owns the uniform audit;
  this WU lands only the narrow `arc user open` interim instance (D4).
- **B-side Caution-register rendering.** The marker's § 8 Caution affordance (payload as context at a force gate)
  is **parked**: ARC renders no force-push offer for it to host, and the push flow is the producer's surface, not
  session-init's. This WU ships the **Aware** register only (C1); Caution is recorded at the cohort level until a
  marker-aware force surface exists.
- **Non-fast-forward base reconciliation.** A diverged or dirty base is surfaced and refused, never
  auto-resolved; merge/rebase stays the developer's call. Autostash is a possible later opt-in, out of scope here.
- **WU-state inference from branches.** The `plan/`-orphan sweep operates on branches as branches (hygiene), not
  as a lifecycle-state oracle.

## Proposed Design

The enumerable substrate the task list is built from and validated against. Three clusters — **Detect** (D1–D4),
**Consume** (C1), **Remediate** (R1) — plus two primitives shared across them (the unpushed-local-drift signal
and the inbound-pull primitive). The design is one WU with a layered spec: the clusters are separately
formalizable but share the session-init probe surface, the drift signal, and the inbound primitive, so a single
owner holds the edit surface (see Alternatives & Rationale).

### Shipped substrate (extend, don't rebuild)

Verified against the codebase:

- **Ref-distance** — `countAheadBehindRef(exec, localRef, remoteRef)` (`src/lib/git/worktree-sync.ts`) compares
  two arbitrary refs; `runBaseDistanceStatus` (`src/lib/git/base-distance.ts`) already wires a session-init
  `baseDistance` slot, but it compares **HEAD → `origin/<base>`** (behind-base advisory). The **local-base-ref →
  `origin/<base>`** comparison D1 needs does not exist yet.
- **Projection bridge** — `inspectDiskVsLocalSnapshot` / `computeSessionInitLoadNeeded`
  (`src/commands/user/sync-status.ts`) plus `user-sync/projection.ts` / `sync-state.ts` / `merge.ts`. D3's drift
  detection extends this comparison basis.
- **Retired-subdir reconcile** — `planRetiredSubdirReconcile` (`src/lib/user-sync/retired-subdir.ts`) plus its
  caller `reconcileRetiredSubdirs` and the pre-load `.internal/<timestamp>` whole-manifest backup
  (`src/commands/user/save-load.ts`). The decision, the delete, *and* the backup already ship; D4's gap is the
  **gate** (stale local index + recency window), not the wiring.
- **Partial-push sync-state ref** — `refs/arc/user/{identity}/sync-state` with `SyncStateMarker` payload and
  `evaluateMarkerLiveness` (`src/lib/user-sync/sync-state-ref.ts`, `sync-state-marker.ts`), shipped by
  `partial-push-marker`. C1 consumes it.

### Detect

#### D1. Local base-ref staleness probe + `baseBranchSync` slot

**Gap.** `countAheadBehindRef` is invoked only as `countAheadBehindRef(exec, "HEAD", "origin/<base>")` (in
`runBaseDistanceStatus`). The local `<base>` ref is never compared to `origin/<base>`, so a sibling clone's local
base falls behind invisibly.

**Add.** A new comparison `countAheadBehindRef(exec, "<base>", "origin/<base>")` and a session-init envelope slot
**`baseBranchSync`** mirroring the `worktree` slot shape: `state`, `ahead` / `behind`, `recommendedAction`,
`recommendedPromptText`. It is distinct from the existing `baseDistance` slot and complementary:

- `baseDistance` = HEAD-vs-`origin/<base>` (behind-*base* drift of the working branch; advisory `surface` / `skip`).
- `baseBranchSync` = local-`<base>`-vs-`origin/<base>` (staleness of the base ref itself; pull-gated).

Align the slot name and config namespace with the `baseDistance` channel so the two read as one family rather
than diverging. Surface `baseBranchSync` in orientation when behind.

**Pull semantics — ff-only** (config-gated by `session.init_pull.base`, see R1 / Cross-cutting):

- behind & fast-forwardable → auto-ff or prompt (per config), not surface-only;
- diverged (local base carries commits not on `origin/<base>` — someone committed directly to local `<base>`;
  rare, a real problem) → refuse + surface, never auto-resolve;
- dirty tree → refuse + surface (no auto-stash by default).

**Side effect.** This probe **freshens the lifecycle/`completed/` index** that D4's reconcile resolves against,
so the reconcile trusts current `shipped` state. The freshen is storage-abstract ("make the local
materialization current"), not a baked-in `git pull origin main`.

#### D2. `plan/`-orphan sweep

**Gap.** `activate-work-unit`'s `plan/<name>` → `<type>/<name>` rename is local-only; the non-activating sibling
keeps a stale local `plan/<name>` whose upstream is `[gone]`.

**Add.** At session-init **in the primary worktree**, detect local branches whose upstream is `gone` **and** which
are merged to `branch.base`, with an interlock-gated `git branch -d` offer (merged-only-safe; **never `-D`**).
No session-init orphan-*branch* sweep exists to mirror — build it, composing three shipped sources: the
stale-*worktree* sweep's surface shape (`stale-worktree-sweep.ts`), Worktree Foundation's `gone`-upstream
detection (`isBranchGoneError` / `branch-gone-cascade.ts`), and the merged-only-safe `git branch -d` teardown
pattern proven in `async-merge-lifecycle`'s `integrate-work-unit` Step 13. The merged-to-base check is new. This
is the cross-machine **`plan/`-orphan facet** (facet 1) that `async-merge-lifecycle` explicitly deferred: it
owned only the **`feat/`-orphan facet** (facet 2), shipped as the `integrate-work-unit` merge-time teardown — not
a session-init sweep. This is branch *hygiene*, not WU-state inference.

#### D3. Notes/disk drift detection (clean-arm fix)

**Gap.** `computeSessionInitLoadNeeded` returns `true` only when `refState === "same"` **and**
`unsavedDirection === "behind"`; every other direction collapses to `undefined`. `inspectDiskVsLocalSnapshot` can
report `behind` / `missing` / `mixed` / `edits` / `modified` / `null`, but `mixed` and `missing` fall through to
no-action — so the active WU's `SESSION-NOTES.md` can be present in the note yet absent on disk while the probe
reports clean.

**Add two behaviors:**

1. **Surface `mixed` / `missing` on the clean arm** — `recommendedAction: surface`, **not** auto-load (`mixed`
   may carry real local edits). Sharpened sub-case: *the active WU's `SESSION-NOTES.md` is present in the note and
   absent on disk* → **auto-load** (pure-missing for that file — safe).
2. **Extend the projection bridge with the prior file-list** so the surfaced warning distinguishes "intentional
   retirement at source" (a file gone because its WU shipped) from "real local drift, possibly unsaved work."

This computation produces the **shared unpushed-local-drift signal** below.

#### D-shared. Unpushed-local-drift signal

A predicate — `hasUnpushedLocalDrift(scope)` — over the projection bridge's disk-vs-basis comparison: *does
`scope` carry local-only content not represented in the pushed note basis?*

- **Benign** (pure-behind / pure-missing; no local-only content) → `false`.
- **Real drift** (local-only `edits` / `modified` / `mixed` content) → `true` ("possibly unsaved work").

Scoped **whole-tree** it drives D3's clean-arm surface-vs-load decision; scoped **per-subdir** it gates D4's
removal. Built once; both consume it. This replaces D4's crude recency-window conjunct with a direct
"no unsaved local work here" guard.

#### D4. Retired-subdir cleanup — index-fresh, drift-gated

**Current state (grounded).** The reconcile, its delete, *and* a backup already ship and are **recoverable**:
`arc user load` (which `arc user pull` runs) writes a pre-load whole-manifest backup to `.internal/<timestamp>.json`
(`save-load.ts`), then `reconcileRetiredSubdirs` removes each qualifying subdir via `removeStaleUserWuSubdir`
(`rm -rf`) — recoverable from that backup. So neither the delete nor the backup is the gap; **the gate is.** A
subdir is removed only when `isSlugShipped(slug)` (which reads the **local** `completed/` archive) **and** it is
absent from the recent-notes window. It **under-removes** two ways:

1. **Stale local index (dominant).** `readShippedWorkUnits` scans the local `.arc/completed/` archive. On a
   machine that does not run integrations, its local base ref is behind `origin` (D1), so its `completed/` lacks
   the shipped WU's entry → `isSlugShipped` returns `false` → the subdir is **preserved**, and the
   `grouped-retirement` orphan warning recurs every pull. This is the observed accumulation: a non-integrating
   machine never resolves its retired subdirs because its archive is stale.
2. **Recency-window lag.** The `absent-from-recent-notes` conjunct holds a shipped subdir until it ages out of
   the window — a crude proxy for "no unsaved local work here."

**Two changes:**

1. **Freshen the local index first** (D1's side-effect): the base-ref ff-pull brings `completed/` current so
   `isSlugShipped` resolves correctly — the dominant fix for the accumulation above. Storage-abstract — today the
   base pull; under the backend, the `.arc/`-store sync (do not bake `git pull origin main` into the precondition).
2. **Replace the recency-window conjunct with D-shared's drift signal** — reconcile iff `isSlugShipped(slug)`
   **and not** `hasUnpushedLocalDrift(subdir)`. Removes the residual time-gating while keeping the cross-machine
   unsaved-work safety directly rather than by recency proxy.

No backup work is needed — the pre-load timestamped backup already makes removal reversible.

**Safety — three independent reasons:** gated on **positively-`shipped` only** (`abandoned ≡ nonexistent` →
abandoned / unknown / typo'd / renamed-away resolve to advisory, never auto-removed); the pre-load `.internal/`
backup already makes the auto-path reversible; and a stale index **fails safe** — it reads a shipped WU as
still-live → preserve = **under**-removal (exactly the accumulation above), never over-removal — which change 1
corrects at the source. Frame the removal as **local dematerialization of a projection**, not a canonical delete.

**Interim fix — `arc user open` stale-subdir confirm.** `promptStaleSubdir` (`src/handlers/user.ts`) fires a
clack `select` whose first/default option **deletes** the subdir, and under non-TTY clack auto-cancels →
**aborts the whole `arc user open`** (observed to hang an agent-run invocation). Fix:

- the resolver-gated reconcile above **replaces** the prompt for the **shipped** case (proof, not consent — no
  prompt);
- for the residual **unresolvable** case: default **keep**, and under non-TTY **auto-skip to keep** — never hang,
  never abort-on-cancel, never default-destructive.

This is the **narrow interim instance** of `cli-substrate-adoption`'s uniform non-interactive contract — cross-ref
its buffer, do not absorb the whole contract.

### Consume

#### C1. Partial-push marker rendering (B-side Aware)

**Shipped (producer).** `refs/arc/user/{identity}/sync-state` carries per-machine `SyncStateMarker` entries
(`machineId`, `lastAttemptedCommit`, `attemptTimestamp`, `intent`); `evaluateMarkerLiveness(marker, notesRefTip)`
returns `"fulfilled"` | `"live"`. Rendering the B-side surface is the producer's explicit non-goal.

**Add the Aware register** (contract: `spec-partial-push-marker.md` § 8) — a calm, non-gating session-init
one-liner in the **existing advisory tier**, co-located with D1's base-ref surface:
`short-sha ← lastAttemptedCommit · when ← attemptTimestamp · whose ← machineId`. The agent proceeds-with-context
and **never auto-resolves** (never force-pushes to "fix" stale notes).

**Liveness — invoke, don't reimplement.** Call `evaluateMarkerLiveness` to decide live-vs-fulfilled; honor the
**14-day TTL** backstop on `attemptTimestamp`. **Degrade silent** when the ref is absent (fetch-only clone, or
remote sync off).

**Caution register — out of scope (parked).** The § 8 **Caution** register (the marker payload as context at B's
force gate) is **not** rendered by this WU. ARC exposes no force-push offer to host it: `arc release push`
*refuses* force (the always-refuse `force-push-required` advisory), branch force-push is raw `git push --force`
outside ARC, and the push flow is the cohort sibling's surface, not session-init's. The only destructive offer in
this WU's surface is the session-init diverged-supersession `git reset --hard` — a **lossless** branch reset where
a notes-side marker note carries no decision weight. Caution is therefore parked at the cohort level
(`cohort-cross-machine-coherence.md`), to render when/if a marker-aware force surface lands in the producer's push
flow. This WU ships **Aware only**.

### Remediate

#### R1. Bidirectional `arc sync` + session-init pull leg (one inbound primitive)

**Gap.** `arc sync`'s worktree leg is push-only: `decideWorktree` (`src/handlers/sync.ts`) returns
`skip-blocked-worktree` on `diverged` / `remote-ahead` / `detached-head` / `no-remote` rather than pulling.

**Add one inbound-pull primitive** — fetch + compare + conflict-handled ff-pull — shared by **both** consumers:

1. the **`arc sync` worktree inbound leg**, making it truly bidirectional — ff-pull on `remote-ahead`, block on
   `diverged`, refuse on dirty;
2. the **D1 session-init base-ref pull action**, config-gated by `session.init_pull.base`.

**Semantics:** ff-only / block-on-diverged / refuse-on-dirty / **agent-safe** (no blocking TTY prompt; under
non-TTY **auto-skip to surface**, never auto-pull — matching `partial-push-marker`'s interactivity contract). The
probe is read-only; the pull action is config-gated. Author the inbound *decision* as a **pure matrix-outcome**
(composes with `sync-handler-decomposition`); any notes-ref write **reuses the existing notes path** (the one
`state-ref-write-safety` CAS-guards), never a parallel write.

## Alternatives & Rationale

Grounded in VCS arrival-UX prior art (git `pull.ff` / `--ff-only` divergence-stop; `hg pull` no-auto-update, `-u`
refuses-to-overwrite; jj op-log + conflicts-as-data) and non-interactive CLI conventions (clig.dev, POSIX
`isatty`, terraform `-input=false`).

- **ff-only, refuse-on-ambiguity (chosen) vs. auto-merge / auto-rebase / never-block.** We lack jj's op-log undo,
  so a wrong auto-resolution is not cheaply reversible. We stay in the git/hg "refuse on ambiguity" camp rather
  than jj's "never block": behind-and-fast-forwardable auto-ffs or prompts; diverged or dirty refuses and
  surfaces. Auto-stash and auto-rebase are rejected as defaults (a possible later opt-in) — they hide a real
  decision behind a convenience.
- **`session.init_pull.base` as a third channel of the existing axis (chosen) vs. a new config axis.** It maps
  exactly onto the `session.init_pull.{worktree,notes}` `recommendedAction` vocabulary, so it is a property of the
  existing init-pull axis, not a new one. Named `base` (not `main`) because `branch.base` is the configurable term.
- **One WU, layered spec (chosen) vs. a cohort of sibling WUs.** The clusters are separately formalizable but
  **not orthogonal**: they share the session-init probe surface, the D-shared drift signal, and the R1 inbound
  primitive, and the cohort coordination already assigns *all* B-side session-init consumption to one owner
  ("no session-init edit collision"). Splitting would fragment a single owner's edit surface for no independent
  deliverability gain. Revisit only if the pull leg proves independently large at task-generation time.
- **Drift-signal gate (chosen) vs. the recency-window conjunct** for D4. The recency window is a *proxy* for
  "no unsaved local work here" that lags reconciliation by the window length. The drift signal answers the real
  question directly and immediately, removing the time-gating while strictly preserving the unsaved-work safety.
- **Shipped-only auto-remove + `.internal/` backup (chosen) vs. broad cleanup / no backup.** Gating on
  positively-`shipped` makes `abandoned ≡ nonexistent` resolve to advisory (never auto-removed), and the backup
  makes the auto-path reversible — the two together let the delete run eagerly without risking real work.
- **Consume-and-degrade-silent (chosen) vs. hard dependency on the marker.** The marker is a *soft* signal: when
  the ref is absent (fetch-only clone, remote sync off, or `partial-push-marker` simply not present), C1 renders
  nothing rather than erroring. This keeps the cohort edge soft and the consumer robust.
- **Invoke the producer's liveness predicate (chosen) vs. reimplementing self-invalidation.** Self-invalidation
  semantics belong with the marker; duplicating them on the consumer would let the two drift. C1 calls
  `evaluateMarkerLiveness` and honors the TTL, owning only presentation.

## Cross-cutting Considerations

- **Security.** Consumer-side only: C1 *reads* the sync-state ref (the random-UUID `machineId` that keeps machine
  names out of a fetchable ref is the producer's concern). No new secret-bearing surface.
- **Performance.** Detection is network-free where it can be: D4 resolution reads `completed/`; D1 adds one ref
  comparison at init; C1 reads one ref. The inbound pull (R1) is the only network action and is config-gated /
  agent-safe. No per-init network cost is added on the default path beyond the existing fetch.
- **Testing.** Unit: the `hasUnpushedLocalDrift` predicate across the `inspectDiskVsLocalSnapshot` direction
  matrix; the `baseBranchSync` state derivation; the R1 inbound decision matrix; the `arc user open` non-TTY
  branch. Integration: the D4 reconcile + `.internal/` backup round-trip; the D3 clean-arm surface/auto-load
  cases. E2E: `arc sync` bidirectionality (ff-pull / block / refuse) against real temp repos; the session-init
  base-ref pull under each `session.init_pull.base` value.
- **Migration / rollout.** New config key `session.init_pull.base` defaults to **`prompt`**, matching the shipped
  `session.init_pull.{worktree,notes}` defaults — no behavior change without opt-in beyond the new
  surface-in-orientation. The `baseBranchSync` slot is additive to the probe envelope. The `.internal/` backup
  changes the existing reconcile from irreversible to reversible — strictly safer, no migration needed.
- **User-facing impact.** Orientation gains advisory lines (base-ref staleness, `plan/`-orphans, notes/disk
  drift, the Aware marker) and offers (base-ref ff-pull, `plan/ -d`, retired-subdir cleanup). All advisory or
  config-gated; none gate the session.
- **Forward-compat (`arc-backend` / storage-evolution).** The design is read-side and projection-aware:
  detection reads projection/manifest + lifecycle state (storage-agnostic, off raw-tree assumptions); D4 removal
  is *local dematerialization of a projection*, not a canonical delete; the "freshen the index before
  reconciling" step is storage-abstract (today D1's base pull; under the backend, the `.arc/`-store sync — do not
  bake `git pull origin main` into the precondition); no blind shared-state write (any notes write reuses the
  version-checked path). `session.init_pull.base` is a property of the existing init-pull axis, not a new one.
- **Coordination.** Soft edges, authored to compose regardless of land-order: `sync-handler-decomposition` (R1's
  inbound leg edits the sync matrix it relocates — author as a pure matrix-outcome); `user-sync-module-split`
  (D3's edits touch `sync-status.ts` functions it relocates — keep them localized); `state-ref-write-safety`
  (R1's notes write reuses the soon-CAS-guarded path); `partial-push-marker` (C1 consumes its ref; degrades
  silent without it). Drop coordination cross-refs into the `sync-handler-decomposition` and
  `user-sync-module-split` inbound buffers.

## Success Criteria

1. A machine whose local `<base>` is behind `origin/<base>` **surfaces it at session-init** and (config-gated)
   **ff-pulls current**; a **diverged** or **dirty** base surfaces + refuses, never auto-resolves.
2. A `[gone]`-upstream, base-merged `plan/` branch is **offered for `-d` removal** (never `-D`); nothing else is
   swept.
3. Notes/disk `mixed` / `missing` drift **surfaces on the clean arm** (not silently discarded); the
   active-WU-`SESSION-NOTES`-absent-on-disk sub-case **auto-loads**; benign drift does not false-positive.
4. A shipped WU's orphaned user subdir is **auto-removed** (recoverable from the pre-load backup) once the local
   index is freshened so it resolves as shipped and it carries no unpushed drift — **no accumulation on a
   non-integrating machine**; a non-shipped / live / unresolvable subdir is **preserved**; **no agent hang and no
   default-delete** on the `arc user open` path.
5. A **live** partial-push marker renders the **Aware** one-liner at session-init from the shipped payload,
   **falling silent** once the producer's liveness predicate reports fulfilled; **absent ref → silent**. (The
   Caution force-gate register is parked — out of scope.)
6. `arc sync` is **bidirectional**: ff-pulls on `remote-ahead`, blocks on `diverged`, refuses on dirty —
   **agent-safe** (no blocking TTY prompt).

## Open Questions

None are resolve-before-starting blockers — each is an implementation detail settled during the work:

- **`baseBranchSync` envelope shape** — a sibling slot to `baseDistance` (chosen here) vs. an additional field on
  the `baseDistance` slot. Resolve at the probe-envelope edit by what reads cleanest against the existing slot
  family; the consumer surface is identical either way.
- **`.internal/` backup retention** — whether backups need pruning (and on what trigger) or can accumulate
  unbounded as a rare safety net. Resolve when wiring the backup; lean toward no pruning until volume warrants it.
- **Advisory-tier ordering** — the relative order of the new advisory lines (base-ref staleness, `plan/`-orphan,
  notes/disk drift, Aware marker) within session-init's existing advisory tier. Cosmetic; settle at the
  orientation-rendering edit.
