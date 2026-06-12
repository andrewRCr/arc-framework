# Draft: Async-Merge Lifecycle

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Origin:** [internal] — the async-merge lifecycle half of the decomposed Concurrent Work Conventions concern.
  Makes the awaiting-review state (days to a week of latency) a supported lifecycle pattern rather than an awkward
  gap, and owns the unattended-merge completion trigger.
- **Purpose:** Ship the lifecycle accommodation for async merge — the suspend/resume seam at the PR-open boundary,
  the in-flight completion sweep (forcing function across the full tail), same-session finalize +
  integration-failure surfacing, the post-merge notes-sync leg, the standalone `integration` footer emission, and
  merge-gate-awareness (option B, additive on `integrate-work-unit`). The async-merge touchpoints are **largely
  shipped**, so this is mostly *audit-don't-rebuild* (option B, additive). Owns the async-merge *completion* tail;
  the start-time spawn/steering surfaces are the sibling `worktree-default-start`'s.

---

## Problem / Motivation

With async-merge a legitimate pattern (post-PR + awaiting-review latency), the lifecycle workflows that currently
assume **synchronous merge** (PR created → merged → cleanup in one flow) need accommodation:

- How does `**State:** Integrating` (PR open, awaiting merge) interact with session-handoff, archival, and
  worktree cleanup workflows that assume synchronous merge?
- Who runs teardown + inbox-line-removal when no one attends an unattended (auto-lane) merge?
- What finalizes a PR that merges *during* a session, after control has returned to base context — finalized by
  neither in-session completion nor the next-session sweep?
- What is the forcing function against dangling-`Integrating` rot?

`**State:** Integrating` already *is* the awaiting-review state (no new state or field — merge-position folded in
per WOR). The async-merge touchpoints are largely shipped (`archive.cadence: manual` defers archival post-merge;
the stale-worktree + session-init in-flight sweeps backstop walk-away cleanup) — so the audit is mostly
audit-don't-rebuild.

---

## Buildables

### Suspend/resume seam at the PR-open boundary

Park in `Integrating`, end the session, resume the *ceremony* later. **Audit-confirmed gap (2026-06-03):**
`integrate-work-unit` hard-starts Active→Integrating with **no resume entrypoint**, and merge → `arc user close`
→ worktree-removal is one synchronous chain — handoff parks the state fine, but nothing resumes the ceremony or
owns `arc user close` on an unattended / deferred merge.

### In-flight completion sweep — the forcing function

Generalize the errand sweep's PR-state classification to owned WUs across the **full tail** — `awaiting-review →
mergeable → merged-needs-archival → archived` (the stage-2 archival dangle exists only under `archive.cadence:
manual`) — as the forcing function against dangling-`Integrating` rot. Two tiers:

- **presence** (roster, free, every session-init), and
- **mergeable sharpening** (oracle PR-source, gated to handoff / no-active-WU, degrades to presence without `gh`).

A configurable `*_after_days` threshold (reusing the inbox-reminder machinery + once-per-day marker) gates the
*stale* tier; the *mergeable* and *merged-needs-archival* triggers are event-driven (bypass the threshold). The
sweep **reuses `merge-safety-mechanism`'s behind-base primitive** for its behind-base classification.

### Same-session finalize + integration-failure surfacing

The sweep's next-session backstop leaves a same-session gap: a PR that merges *during* the session — after control
returns to base context — is finalized by neither in-session completion nor the next-session sweep (PRs #72 / #73
hit this and needed manual cleanup). Add an opportunistic, bounded pass when control returns to base context: poll
this session's PRs once / briefly —

- merged-clean → tear down the local branch, prune the stale remote-tracking ref, remove any ephemeral worktree,
  drop the slug-matched inbox line;
- failed / blocked → surface loudly;
- still-pending → hand to the sweep.

Preserve the non-blocking principle (no unbounded CI wait), and surface CI / merge failures for **both** manual-
and auto-merge so blocked integration is flagged at completion, not rediscovered next session.

### Post-merge notes-sync leg — consumes `notes-merge-coherence`

The same-session finalize sequence and the unattended-merge completion trigger both close by syncing user notes,
yet the finalize sequence today lists teardown / branch delete / ref prune / inbox-line and **not** a notes-sync
step. Add the notes leg — the **workflow wiring** that runs the sync at completion and leaves current HEAD
carrying a saved note after the base pull / fast-forward (the `localNoteFreshness.state === "ancestor"` case the
PR #83 close-out hit). This member owns only that obligation: call the sync, leave HEAD fresh.

The **engine correctness** the leg hard-depends on — idempotent removal-tombstone resolution, projection-aware
status, and `ancestor`-freshness recognition — was extracted to the sibling member **`notes-merge-coherence`**
(originally absorbed here under option A; carved out at create-spec because it fixes live `lib/user-sync/` defects
independently, is consumed by `cross-machine-sync-coherence`, and is a clean prerequisite). The finalize sync
fires right after the WORKING-MEMORY / inbox maintenance that rides WU completion — the exact trigger for those
defects — so wiring it without the fixes ships a deterministically-broken sync. Hence the build-first edge:
**`Depends On: notes-merge-coherence`** — land the engine, then wire the leg.

### Standalone `integration` footer emission

`merge-safety-mechanism` shipped the *validator-accept* side — `commit-msg` now accepts `Context: integration
(...)` as a standalone footer kind for single-parent integration ceremony commits — but nothing **emits** it and
`commit-footer.md` does not enumerate it, so the allowance is latent. This member wires the emitter and lands the
`commit-footer.md` enumeration **with** it, so the source-of-truth line arrives alongside the workflow that
produces the footer rather than documenting a producer-less allowance ahead of emission. Natural emitters: the
in-flight completion sweep, the unattended-merge completion trigger, and any archival / finalize ceremony commit
this WU wires. Files: `commit-footer.md` (both copies) + the finalize / completion workflow surface.

### Merge-gate-awareness / unattended-merge completion trigger

`run-errand` and the `drain-inbox` execution transition both defer post-merge cleanup — errand branch/worktree
teardown and removal of the slug-matched `USER-INBOX` line — to the errand's *merge*. On the auto-merge lane that
merge is *unattended*, so no workflow step fires the cleanup; session-init's in-flight-errand sweep backstops it
for now. This member owns the unattended-merge **completion trigger** (who runs teardown + line-removal when no
one attends the merge) — reconcile `run-errand`'s Complete phase and the drain's close. This is the `run-errand` /
`drain-inbox` facet of the broader "make the lifecycle workflows merge-gate-aware" concern (`integrate-work-unit`
is the sibling case, handled by the option-B audit below).

**Errand close-out is symmetric but shorter-tailed.** Unlike a WU, an errand has no meta / archival stage — its
tail is `awaiting-review → mergeable → merged → cleanup` (locus teardown + slug-matched `USER-INBOX`-line
removal), so the completion sweep's WU "full tail" must not drive an archival step for an errand. And the
slug-matched line removal now has **three** removers — `run-errand` § Complete (in-session, full), same-session
finalize (control-returns-to-base), and the session-init errand sweep (next-session backstop). Name one
authoritative point (`run-errand` § Complete, which already declares itself "the single point where that removal
is ensured") and make the other two **idempotent, slug-matched backstops** that no-op when the line is already
gone — otherwise the unattended lane risks a double-fire against a present-then-absent line. The errand *resume*
seam needs nothing new: `run-errand`'s Integrate phase is already re-enterable; the WU side is the gap (see the
suspend/resume seam above).

### Async-merge audit — option B (additive)

`integrate-work-unit.md` and related lifecycle workflows currently assume synchronous merge. Audit sync-merge
assumptions and adjust touchpoints **additively** — sync-merge stays the primary flow; the awaiting-review state
gets explicit accommodation at session-handoff, meta-file updates, worktree cleanup, and archival ordering.
Rejected alternatives: **A** (full rewrite of state transitions — cleanest end state, heaviest change) and **C**
(mixed — primary rewrite of `integrate-work-unit` plus additive elsewhere). Option B is lighter and preserves the
existing workflow shape. The 2026-06-03 audit (over `integrate-work-unit` / `archive-work-unit` / `session-handoff`
/ `deactivate-work-unit` / `setup-merge-gate`) confirmed "largely shipped" with no scope blow-up: `setup-merge-gate`
is orthogonal (the auto-merge lane); the suspend/resume seam + completion sweep are net-new exactly as sized.
**Re-confirm at spec:** that audit predates `concurrent-work-doctrine` (PR #81) and `merge-safety-mechanism`
(PR #83) shipping on 2026-06-11 — both touched this member's surfaces (the session-init base-distance probe; the
`commit-msg` / integration-footer path) — so re-ground the touchpoint sweep against current shipped code before
sizing, per the cohort's "ground every buildable against shipped reality" discipline.

---

## Design Decisions carried into the spec

### Completion is a worktree-agnostic, primary-worktree boundary action

The tail (`gh pr merge` + `arc user close` + worktree-remove-from-elsewhere) runs cleanest from the **primary
worktree**, never a mid-increment switch. This unifies with the merge-safety "decouple merge + cleanup from the
integration session" concern.

### Open — eager vs. lazy post-merge teardown (soft dep on `composable-workflows`)

`decompose-work-unit` already authors an `active/ → backlog/` + park-PR + worktree-teardown block single-source,
whereas `integrate` / `archive` own no branch/worktree teardown today (the session-init stale sweep does it
lazily). **Open:** should lifecycle workflows own *eager* post-merge teardown — `integrate` / `archive` reusing
decompose's block at merge time, once `composable-workflows` lands the shared-step hoist — or keep the lazy sweep?
Eager ripples to `archive` and shrinks the sweep's role; `decomposition-machinery` deliberately left the block
single-source and ready. Decide at this member's spec. Coordinate the teardown surface with `coord-probe`: it
carries a stale-local-branch-gone sweep buffer item and flags that `integrate-work-unit` Step 13 deletes the WU
branch only on the linked-worktree→`removable` arm, not the primary-worktree in-place arm — the same
teardown-completeness gap. Whichever member specs first owns the reaper; don't double-build it.

---

## Scope Estimate

**Medium — workflows + session-init probe, mostly additive.** Audit-don't-rebuild: the async-merge touchpoints are
largely shipped (`archive.cadence: manual` + the stale/in-flight sweeps). Net-new is the suspend/resume seam, the
completion sweep (full tail through archival), the same-session finalize pass, merge-gate-awareness, the
post-merge notes-sync leg (the workflow wiring only — engine correctness is the shipped `notes-merge-coherence`
dependency), and the `integration` footer emission. With the start-time spawn/steering surfaces carved off to
`worktree-default-start` and the `lib/user-sync/` correctness extracted to `notes-merge-coherence`, this member is
a single coherent concern over one primary surface (workflows + session-init) — the async-merge completion tail.

### Dependencies

- **Internal (both shipped 2026-06-11):** `concurrent-work-doctrine` (PR #81 — the async-merge conventions +
  `assess-parallel-fit`) and `merge-safety-mechanism` (PR #83 — the behind-base primitive the completion sweep
  reuses; the `Context: integration (...)` validator-accept this member emits against). Both shipped deps that
  gated this member have landed; the soft "merge-safety precedes" edge is satisfied.
- **Internal (cohort sibling, shipped):** `notes-merge-coherence` (`completed/2026-q2/21_…`) — the `lib/user-sync/`
  notes-merge engine correctness (idempotent tombstone resolution + canonical materialized-manifest builder +
  `ancestor`-freshness) this member's post-merge notes-sync leg consumes. Extracted from this draft at an earlier
  create-spec pass; **build-first edge** — the finalize sync is deterministically broken without it. Now landed,
  so the leg can ground against the settled engine.
- **Substrate (shipped):** `archive.cadence: manual`, the stale-worktree + session-init in-flight sweeps, the
  errand sweep's PR-state classification, the inbox-reminder machinery + once-per-day marker, the `Class` contract.
- **Soft dep:** `composable-workflows` (for the eager-teardown shared-step hoist of `decompose-work-unit`'s
  park-exit block).
