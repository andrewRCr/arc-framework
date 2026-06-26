# Draft: Stale-State Detect-and-Pull

**Purpose:** Cross-machine **arrival coherence** — when machine B returns to work, detect that its local state
is stale relative to a change machine A / origin made, render the cohort sibling's partial-push marker on the B
side, *and* give B a one-command path to get current. Three facets: **detect** (local base ref behind `origin`,
`plan/`-orphan branches, notes/disk drift, retired subdirs), **consume/render** (the shipped `partial-push-marker`
sync-state ref — Aware at session-init, Caution at the force gate), and **remediate** (an inbound pull leg at
session-init and in `arc sync`).

- **State:** Draft — split from `cross-machine-sync-coherence` at its 2026-06-25 decomposition (the B-side
  detection cluster + the folded-in `arc sync` pull-leg). Much of this **extends shipped machinery** rather than
  building it (see § Shipped substrate).

- **Created:** 2026-05-05 (as `cross-machine-sync-coherence`); split 2026-06-25.

- **Origin:** [internal] — the "machine B is unaware of a state change machine A / origin made" family, surfaced
  across the user-notes sync audit and several cross-machine housekeep drains. Sibling to `partial-push-marker`
  (which makes A's incomplete *push* visible); this WU owns B's *arrival*-side detection and remediation.

---

## Shipped substrate (extend, don't rebuild)

Verified 2026-06-25:

- **Projection bridge — shipped** (`user-sync/projection.ts`, with `sync-state.ts` / `merge.ts`). The drift
  detection (T3) extends this comparison basis; it does not rebuild it.
- **Ref-distance machinery — shipped** (`git/base-distance.ts` + `countAheadBehindRef`), plus a session-init
  `baseDistance` slot — but both measure **HEAD → `origin/<base>`** (behind-base drift). The local-base-ref
  staleness here (**local base → `origin/<base>`**, cross-machine) is the unbuilt delta: a new comparison + slot
  reusing that machinery, not a fresh scanner.

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
   they don't diverge.

2. **`plan/`-orphan sweep.** A `[gone]`-upstream `plan/` branch left on a non-activating machine by
   `activate-work-unit`'s local-only `plan/<name>` → `<type>/<name>` rename (the machine that did *not* run
   activation keeps the stale local `plan/` forever). At session-init in the primary worktree, detect local
   branches whose upstream is `gone` and which are merged to `branch.base`, with an interlock-gated
   `git branch -d` offer (merged-only-safe; never `-D`) — mirroring the stale-worktree sweep, reusing
   Worktree Foundation's `gone`-upstream + recently-active-remote-branch detection. Narrowed to **facet 1**; the
   `feat/`-orphan facet shipped in `async-merge-lifecycle`. (Pulled in from `coord-probe` at re-grounding —
   it only ever attached there via detection-reuse, and that detection lives in Worktree Foundation.)

3. **Notes/disk drift detection (T3).** Session-init can read the active WU's `SESSION-NOTES.md` as absent while
   the probe reports `user.state: clean` / `loadNeeded: false` — yet the git note on `HEAD` *contains* it; it
   was just never materialized to this checkout. Root cause: `computeSessionInitLoadNeeded` returns `true` only
   for `direction === "behind"`, and `inspectDiskVsLocalSnapshot` returns `"behind"` only when disk is pristine
   vs. its basis; benign drift (lingering retired subdirs, lagging WORKING-MEMORY) makes it `"mixed"`, so
   `loadNeeded` falls to `false` and the divergence is discarded. Two defects: (a) `mixed`/`missing` should
   **surface** on the clean arm (`recommendedAction: surface`, not auto-load — `mixed` may carry real local
   edits), with a sharpened sub-case — *the active WU's SESSION-NOTES is present in the note but absent on
   disk*; (b) extend the **shipped projection bridge** with the prior file-list so a warning distinguishes
   "intentional retirement at source" from "real local drift, possibly unsaved work."

4. **Retired-subdir cleanup.** `session-init`'s `retiredSubdirs` probe returns `[]` for genuinely-archived
   subdirs (its "absent from the recent-notes window" criterion is too time-gated); `arc user load` only
   **warns**, it does not remove; and `session-init.md` Step 6 claims an auto-reconcile the tool doesn't
   perform. Have `arc user open`/`close` (and/or `load`) proactively reconcile orphaned WU subdirs (shipped /
   retired and absent from the live set), removing with the `.internal/` backup the docs already promise. Same
   prior-file-list surface as (3).

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
   pull action for the base-ref case (`session.init_pull.main ∈ {always, prompt, surface, skip}`). Both share
   **one inbound-pull primitive** (fetch + compare + conflict-handled pull) — detection (above) finds the
   staleness; this fixes it. Probe is read-only; the pull action is config-gated.

### Out of scope

- **Producing the partial-push marker** — `partial-push-marker` (cohort sibling, shipped) owns the sync-state
  ref write, the push-time Act register, and the liveness predicate. Only *production* is out of scope; this WU
  *consumes and renders* the marker (surface 5).
- **Single-machine inter-process ref races** — `state-ref-write-safety` (agile-parallelism).

---

## Dependencies / Interactions

- **Worktree Foundation** (shipped) — the `gone`-upstream detection, the `baseDistance` channel, the
  `retiredSubdirs` probe seam, the `.sync-state.json` schema seam.
- **`notes-merge-coherence`** (shipped) — the projection bridge (3) extends.
- **`concurrent-work-conventions`** (shipped) — the `origin/<base>`-distance primitive (1) extends to the
  local-base comparison.
- **`partial-push-marker`** (cohort sibling, **shipped** 2026-06-25) — produces the sync-state ref
  (`refs/arc/user/{identity}/sync-state`) + liveness predicate this WU consumes and renders (surface 5). Soft
  edge: the consumer degrades silent without it. The register/affordance contract is `spec-partial-push-marker.md`
  § 8; the cohort doc records the consumer-facing seam.

## Forward-compat

The inbound-pull / sync-state surfaces compose with the `arc-backend` materialized substrate — detection reads
projection/manifest state (storage-agnostic), and the pull primitive is the git-native form of "make the local
materialization current." Keep detection off raw-tree assumptions so it lifts to the backend's sync surface.

---

## Scope Estimate

**Heavy** by breadth — six surfaces (base-ref probe, `plan/`-orphan sweep, T3 drift, retired-subdir cleanup,
marker rendering, bidirectional sync), several of them shipped-machinery extensions (Quick-tier individually).
Now **three clusters**, not two — **detect** (1-4), **consume/render** (5), **remediate** (6) — which sharpens
the sub-decomposition question: the marker-rendering surface could ride either the detect cluster (it surfaces at
session-init) or split with the pull-leg. May sub-decompose at spec time if the clusters prove independently
large; held as one coherent "arrival coherence" concern for now.

---
