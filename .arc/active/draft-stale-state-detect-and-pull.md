# Draft: Stale-State Detect-and-Pull

**Purpose:** Cross-machine **arrival coherence** — when machine B returns to work, detect that its local state
is stale relative to a change machine A / origin made, render the cohort sibling's partial-push marker on the B
side, *and* give B a one-command path to get current. Three facets: **detect** (local base ref behind `origin`,
`plan/`-orphan branches, notes/disk drift, retired subdirs), **consume/render** (the shipped `partial-push-marker`
sync-state ref — Aware at session-init, Caution at the force gate), and **remediate** (an inbound pull leg at
session-init and in `arc sync`).

- **State:** Draft (maturing) — split from `cross-machine-sync-coherence` at its 2026-06-25 decomposition (the
  B-side detection cluster + the folded-in `arc sync` pull-leg), then groomed 2026-06-25: regrounded against the
  now-shipped `partial-push-marker`, settled S1/S4/S6 semantics against VCS / CLI prior art, and forward-compat
  sanity-checked. Much of this **extends shipped machinery** rather than building it (see § Shipped substrate).

- **Created:** 2026-05-05 (as `cross-machine-sync-coherence`); split 2026-06-25.

- **Origin:** [internal] — the "machine B is unaware of a state change machine A / origin made" family, surfaced
  across the user-notes sync audit and several cross-machine housekeep drains. Sibling to `partial-push-marker`
  (which makes A's incomplete *push* visible); this WU owns B's *arrival*-side detection and remediation.

---

## Shipped substrate (extend, don't rebuild)

Verified 2026-06-25:

- **Projection bridge — shipped** (`user-sync/projection.ts`, with `sync-state.ts` / `merge.ts`). The drift
  detection (S3) extends this comparison basis; it does not rebuild it.
- **Ref-distance machinery — shipped** (`git/base-distance.ts` + `countAheadBehindRef`), plus a session-init
  `baseDistance` slot — but both measure **HEAD → `origin/<base>`** (behind-base drift). The local-base-ref
  staleness here (**local base → `origin/<base>`**, cross-machine) is the unbuilt delta: a new comparison + slot
  reusing that machinery, not a fresh scanner.
- **Retired-subdir decision — shipped (decision half only)** (`lib/user-sync/retired-subdir.ts`).
  `planRetiredSubdirReconcile` already partitions subdirs into reconcile/preserve gated on `shipped`; the gap is
  the predicate refinement + the caller-side removal (S4).
- **Partial-push sync-state ref — shipped** (`refs/arc/user/{identity}/sync-state` + producer-side liveness
  predicate, from `partial-push-marker`). This WU **consumes** it (S5); it does not produce it.

---

## Scope

### Detect

1. **Local base-ref staleness probe.** The session-init worktree probe compares only the current branch vs. its
   upstream. Local `main` (or any base ref) can fall arbitrarily behind `origin/main` when cross-machine
   integration lands on a sibling clone — the integrating machine fast-forwards local `main` as a merge
   side-effect; the sibling never does; orientation carries no signal. (Observed live: a machine's local `main`
   47 commits behind.) Add a `baseBranchSync` slot mirroring the `worktree` slot (`state`, `ahead`/`behind`,
   `recommendedAction`, `recommendedPromptText`); surface in orientation when behind. Reuses the shipped
   ref-distance machinery; align the slot name + config namespace with the existing `baseDistance` channel so
   they don't diverge. The pull semantics + config are **ff-only / `session.init_pull.base`** — see § Settled
   decisions. This probe also **freshens the lifecycle index** that S4's reconcile resolves against (so the
   reconcile trusts current `shipped` state).

2. **`plan/`-orphan sweep.** A `[gone]`-upstream `plan/` branch left on a non-activating machine by
   `activate-work-unit`'s local-only `plan/<name>` → `<type>/<name>` rename (the machine that did *not* run
   activation keeps the stale local `plan/` forever). At session-init in the primary worktree, detect local
   branches whose upstream is `gone` and which are merged to `branch.base`, with an interlock-gated
   `git branch -d` offer (merged-only-safe; never `-D`) — mirroring the stale-worktree sweep, reusing
   Worktree Foundation's `gone`-upstream + recently-active-remote-branch detection. Narrowed to **facet 1**; the
   `feat/`-orphan facet shipped in `async-merge-lifecycle`. (Pulled in from `coord-probe` at re-grounding —
   it only ever attached there via detection-reuse, and that detection lives in Worktree Foundation.) Branch
   *hygiene*, not WU-state inference (it operates on branches as branches — storage-evolution P5).

3. **Notes/disk drift detection (T3).** Session-init can read the active WU's `SESSION-NOTES.md` as absent while
   the probe reports `user.state: clean` / `loadNeeded: false` — yet the git note on `HEAD` *contains* it; it
   was just never materialized to this checkout. Root cause: `computeSessionInitLoadNeeded` returns `true` only
   for `direction === "behind"`, and `inspectDiskVsLocalSnapshot` returns `"behind"` only when disk is pristine
   vs. its basis; benign drift (lingering retired subdirs, lagging WORKING-MEMORY) makes it `"mixed"`, so
   `loadNeeded` falls to `false` and the divergence is discarded. Two defects: (a) `mixed`/`missing` should
   **surface** on the clean arm (`recommendedAction: surface`, not auto-load — `mixed` may carry real local
   edits), with a sharpened sub-case — *the active WU's SESSION-NOTES is present in the note but absent on
   disk* (auto-load that case — pure-missing, safe); (b) extend the **shipped projection bridge** with the prior
   file-list so a warning distinguishes "intentional retirement at source" from "real local drift, possibly
   unsaved work." **This drift signal is shared with S4** — its "unpushed local drift here?" predicate is what
   gates S4's removal (replacing S4's recency-window conjunct).

4. **Retired-subdir cleanup — resolver-gated, drift-aware.** The decision half already exists:
   `planRetiredSubdirReconcile` (`lib/user-sync/retired-subdir.ts`) reconciles a subdir iff `shipped`
   (slug ∈ `readShippedWorkUnits()` / `completed/`) **AND** absent from the recent-notes window. Two gaps:
   - (a) The **recency-window conjunct is the "too time-gated" part** — it lags reconciliation until a subdir
     ages out of the window, and its real job is a crude "no recent/unpushed local activity here" guard. Replace
     it with **S3's drift signal**: reconcile iff `shipped` **AND** no-unpushed-local-drift — removes the
     time-gating while keeping the cross-machine unpushed-work safety.
   - (b) The **caller-side removal is unwired** — `arc user load` only *warns* today; wire the `.internal/`
     backup + recursive delete the module's own contract names ("removal … is the caller's").

   Resolution is authoritative and **network-free** (`resolveSlugState` / `isSlugShipped` over `completed/`).
   Safety, three independent reasons: gated on **positively-`shipped` only** — `abandoned ≡ nonexistent`
   (leaves no residue), so abandoned / unknown / typo'd / renamed-away → **advisory, never auto-removed**; the
   `.internal/` backup makes even the auto-path reversible; and a stale local index fails **safe** (reads a
   shipped WU as still-live → preserve = under-removal), with S1 freshening the index first. Frame the removal
   as **local dematerialization of a projection** (forward-compat — § Forward-compat & coordination), not a
   canonical delete.

   - **Interim fix — `arc user open` stale-subdir confirm (folds a WORKING-MEMORY landmine).** Today
     `arc user open` fires a TTY-blocking "stale subdir … Remove? [y]" confirm whose default *deletes* a prior
     WU's SESSION-NOTES, and which **hangs an agent** non-interactively. The resolver-gated reconcile above
     **replaces** that prompt for the shipped case (proof, not consent — no prompt). For the residual
     *unresolvable* case: default **keep**, and under non-TTY **auto-skip to keep** (mirrors Worktree
     Foundation's cold-start precedent; never hang, never default-destructive — the clig.dev / POSIX
     non-interactive consensus). This is the **narrow interim instance** of `cli-substrate-adoption`'s uniform
     non-interactive contract — coordinate-generalize (cross-ref its buffer), don't absorb the whole contract.

### Consume (marker rendering)

5. **Partial-push marker rendering (B-side registers).** The shipped sibling `partial-push-marker` produces the
   remote sync-state ref (`refs/arc/user/{identity}/sync-state` — an errand tree-commit of per-machine entries
   keyed by `machineId`; payload `lastAttemptedCommit` / `attemptTimestamp` / `intent`) **plus a producer-side
   liveness predicate**; rendering the B-side surface is the producer's explicit non-goal and this WU's
   deliverable. Render the two B-side registers (`spec-partial-push-marker.md` § 8): **Aware** — a calm,
   non-gating session-init one-liner in the existing advisory tier (short-sha ← `lastAttemptedCommit` · when ←
   `attemptTimestamp` · whose ← `machineId`), proceed-with-context, never auto-resolve; **Caution** — the same
   payload surfaced at B's force gate as context for the destructive call (informs, never gates). **Invoke** the
   producer's liveness predicate to decide live-vs-fulfilled — do *not* reimplement self-invalidation — and honor
   the 14-day TTL backstop. Degrade silent when the ref is absent (fetch-only clone, or remote sync off). The
   Aware surface co-locates with surface 1 (base-ref staleness) in session-init's advisory tier.

### Remediate (inbound pull)

6. **Bidirectional `arc sync` + session-init pull leg.** `arc sync` today is **push-only** on the worktree leg:
   on `remote-ahead` / `diverged` it detects-and-blocks rather than pulling, so it can't replace `git pull` on
   machine arrival. Add an **inbound pull leg** so `arc sync` becomes truly bidirectional, and a session-init
   pull action for the base-ref case (`session.init_pull.base ∈ {always, prompt, surface, skip}`). Both share
   **one inbound-pull primitive** (fetch + compare + conflict-handled pull) — detection (above) finds the
   staleness; this fixes it. Probe is read-only; the pull action is config-gated. Semantics (ff-only /
   block-on-diverged / refuse-on-dirty / agent-safe) and the pure-matrix authoring constraint are in § Settled
   decisions.

### Out of scope

- **Producing the partial-push marker** — `partial-push-marker` (cohort sibling, shipped) owns the sync-state
  ref write, the push-time Act register, and the liveness predicate. Only *production* is out of scope; this WU
  *consumes and renders* the marker (surface 5).
- **Single-machine inter-process ref races** — `state-ref-write-safety` (agile-parallelism). This WU is read-side
  on the sync-state ref; it adds no blind shared-state write.
- **The uniform non-interactive prompting contract** — `cli-substrate-adoption` owns the substrate-wide audit;
  this WU lands only the narrow `arc user open` interim instance (surface 4).

---

## Settled decisions (2026-06-25 grooming — prior-art-informed)

Grounded in VCS arrival-UX prior art (git `pull.ff` / `--ff-only` divergence-stop; `hg pull` no-auto-update,
`-u` refuses-to-overwrite; jj op-log + conflicts-as-data) and non-interactive CLI conventions (clig.dev, POSIX
`isatty`, terraform `-input=false`, npm/apt). The **conservative leans hold** — we lack jj's op-log undo, so we
stay in the git/hg "refuse on ambiguity" camp rather than jj's "never block."

- **Base-ref pull (S1/S6) is ff-only.** Behind-base & fast-forwardable → **auto-ff or prompt** (config-gated),
  not surface-only. **Diverged** (local base carries commits not on `origin/<base>` — i.e. someone committed
  directly to local `main`; rare, a real problem) → **refuse + surface, never auto-resolve**. **Dirty tree** →
  **refuse + surface** (no auto-stash by default; autostash a possible later opt-in).
- **Config:** `session.init_pull.base ∈ {always, prompt, surface, skip}` — a **third channel of the existing
  `session.init_pull.{worktree,notes}` axis**, not a new axis (storage-evolution P9). `base` (not `main`) since
  `branch.base` is the configurable term. Maps onto the worktree channel's `recommendedAction` vocabulary.
- **Inbound primitive (S6) is read-side / agent-safe.** A non-interactive primitive (fetch + compare + ff-pull);
  the agent owns any prompt; under non-TTY **auto-skip to surface** (never auto-pull) — matches
  `partial-push-marker`'s interactivity contract. Author the inbound *decision* as a **pure matrix-outcome
  extension** (composes with `sync-handler-decomposition`); any notes-ref write **reuses the existing notes path**
  (the one `state-ref-write-safety` CAS-guards), never a parallel write.
- **Retired-subdir auto-remove iff `isSlugShipped` AND no-drift; else advisory** (abandoned ≡ nonexistent →
  advisory). See surface 4.
- **Sub-decomposition: one WU, layered spec** (not sibling WUs). Shared "arrival coherence" frame; the clusters
  are separately-formalizable spec sections. They share the session-init probe surface, the S3↔S4 drift signal,
  and the cohort's "one inbound-pull primitive / no session-init edit collision" coordination — splitting would
  fragment a single owner's edit surface. Revisit only if the pull-leg proves independently large at spec time.

---

## Dependencies / Interactions

- **Worktree Foundation** (shipped) — the `gone`-upstream detection, the `baseDistance` channel, the
  `retiredSubdirs` probe seam, the `.sync-state.json` schema seam.
- **`notes-merge-coherence`** (shipped) — the projection bridge (S3) extends.
- **`concurrent-work-conventions`** (shipped) — the `origin/<base>`-distance primitive (S1) extends to the
  local-base comparison.
- **`partial-push-marker`** (cohort sibling, **shipped** 2026-06-25) — produces the sync-state ref
  (`refs/arc/user/{identity}/sync-state`) + liveness predicate this WU consumes and renders (surface 5). Soft
  edge: the consumer degrades silent without it. The register/affordance contract is `spec-partial-push-marker.md`
  § 8; the cohort doc records the consumer-facing seam.

## Forward-compat & coordination

**`arc-backend` / storage-evolution** (self-check run 2026-06-25): composes — the design is read-side and
projection-aware.

- Detection reads projection / manifest + lifecycle state (storage-agnostic); the pull primitive is the
  git-native form of "make the local materialization current." Keep detection off raw-tree assumptions (P1).
- S4 removal is **local dematerialization of a projection**, not a canonical delete (P2) — exactly what the
  backend does on sync; a reinforcing fit.
- "Freshen the lifecycle index before reconciling" is **storage-abstract** — today S1 (code-repo base pull);
  under the backend, the `.arc/`-store sync. Don't bake `git pull origin main` into the reconcile precondition
  (P1 / P6).
- No blind shared-state write: read-side throughout; any notes write is version-checked via the existing path
  (P3).
- `session.init_pull.base` is a property of the existing init-pull axis, not a new one (P9).

**`state-ref-write-safety`** (agile-parallelism) — complementary, no overlap: it CAS-guards the notes / errand /
sync-state *writes*; this WU is a *reader* of the sync-state ref and ff-only on the base. S6's inbound notes leg
reuses the soon-CAS-guarded write path.

**`sync-handler-decomposition`** (architecture-remediation) — S6's inbound leg edits `handlers/sync.ts` / the
matrix it relocates. Independent (no hard edge), but author S6 as a **pure matrix-outcome + isolated execution**
so the two compose regardless of land-order. Drop a coordination cross-ref into its inbound buffer.

**`user-sync-module-split`** (architecture-remediation) — S3's drift edits touch `inspectDiskVsLocalSnapshot` /
the spine / projection bridge — the `sync-status.ts` functions it relocates. Keep S3's edits localized to those
boundaries so the split relocates them cleanly. Cross-ref its inbound buffer (mirroring the `partial-push-marker`
growth note already there).

---

## Success criteria (consolidated)

1. A machine whose local `<base>` is behind `origin/<base>` surfaces it at session-init and (config-gated)
   ff-pulls current; a **diverged** or **dirty** base surfaces + refuses, never auto-resolves.
2. A `[gone]`-upstream, base-merged `plan/` branch is offered for `-d` removal (never `-D`); nothing else swept.
3. Notes/disk `mixed` / `missing` drift surfaces on the clean arm (not silently discarded); the
   active-WU-SESSION-NOTES-absent-on-disk sub-case auto-loads; benign drift doesn't false-positive.
4. A shipped WU's orphaned user subdir is auto-removed (with `.internal/` backup) when carrying no unpushed
   drift; a live / parked / unresolvable subdir is preserved; **no agent hang and no default-delete** on the
   `arc user open` path.
5. A live partial-push marker renders the Aware one-liner at session-init and the Caution context at the force
   gate, both from the shipped payload, falling silent once the producer's liveness predicate reports fulfilled;
   absent ref → silent.
6. `arc sync` is bidirectional: ff-pulls on `remote-ahead`, blocks on `diverged`, refuses on dirty — agent-safe
   (no blocking TTY prompt).

---

## Scope Estimate

**Heavy** by breadth — six surfaces plus the interim `arc user open` fix; several are shipped-machinery
extensions (Quick-tier individually), and S4 is **already half-built** (the `shipped`-gated decision module
exists; the gap is the S3-drift coupling + caller-side wiring). Three clusters — **detect** (1-4),
**consume/render** (5), **remediate** (6). Decomposition resolved to **one WU, layered spec** (see § Settled
decisions); revisit only if the pull-leg proves independently large.

---

## Readiness & continuity

**State:** maturing — scope is settled across all six surfaces + the interim fix; the open items are
detail-design (spec-time), not fundamentals.

**Resolved:** the six surfaces and three clusters; the prior-art-informed S1/S6 semantics + config key; the
resolver+drift-gated S4 design + the interim `arc user open` fix; the one-WU/layered-spec decomposition;
forward-compat / coordination against `arc-backend`, `state-ref-write-safety`, `sync-handler-decomposition`,
and `user-sync-module-split`.

**Open (spec-time detail):** the exact S3 benign-vs-real drift predicate; the concrete shape of the shared
S3↔S4 "unpushed-local-drift" signal; the Caution force-gate hook point; confirming the S4 caller-side
backup+delete is genuinely unwired (vs. partially present); per-surface task sequencing.

**Next:** `create-spec` — it re-reads the derivation axis with this draft as evidence; enter with the
one-WU/layered-spec form. Housekeep follow-up: drop coordination cross-refs into the `user-sync-module-split`
and `sync-handler-decomposition` inbound buffers.

---
