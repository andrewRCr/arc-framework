# Draft: Async-Merge Lifecycle

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Origin:** [internal] — the async-merge lifecycle half of the decomposed Concurrent Work Conventions concern.
  Makes the awaiting-review state (days to a week of latency) a supported lifecycle pattern rather than an awkward
  gap, and owns the unattended-merge completion trigger.
- **Purpose:** Ship the lifecycle accommodation for async merge — the suspend/resume seam at the PR-open boundary,
  the in-flight completion sweep (forcing function across the full tail), same-session finalize +
  integration-failure surfacing, and merge-gate-awareness (option B, additive on `integrate-work-unit`) — plus the
  loose lifecycle plumbing the fold absorbed: the `arc start` create-new worktree-spawning wiring, the
  subdir-removal primitive, and cohort-`{name}.md` discovery at session-init. The async-merge touchpoints are
  **largely shipped**, so this is mostly *audit-don't-rebuild* (option B, additive).

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **User-sync tombstone canonicalization — prerequisite for this WU's owned notes-sync step**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: cross-machine-sync-coherence`), housekeep drain (2026-06-11).
  **Re-homed off `cross-machine-sync-coherence`** — that WU is partial-push cross-machine *transport*; this is a
  single-machine notes-**merge** coherence bug, which belongs with this WU's owned post-merge close-out.
- *Why here (the coupling):* this WU's § Same-session finalize adds the owned post-merge sequence — teardown +
  branch delete + base pull + **notes sync**. That sync step runs right after the WORKING-MEMORY / inbox
  maintenance that rides WU completion — i.e. the exact trigger — so it fires the tombstone bug **deterministically**
  unless the merge is made idempotent first. The merge fix is therefore a **hard prerequisite** of wiring the
  finalize sync, not a parallel nicety; sequence it ahead of (or with) that step. (Today the finalize sequence
  lists teardown / branch / ref / inbox-line but **not notes-sync** — add it, gated on this fix.)
- *The bug (two coupled defects, both confirmed in code):*
    - **Non-idempotent `appendRemovalTombstones`** (`lib/user-sync/merge.ts`) — prior state is rebuilt via
      `mergeEntries` (entry-union, **tombstone-blind**), so an entry tombstoned in a recent note but still live in
      an older note within the window re-synthesizes a **duplicate** `## Removed:` marker. Fix: rebuild prior
      through the same tombstone-aware resolution `mergeCrossWuFile` uses (resolved-removed identities suppressed),
      and/or skip synthesis for any `(section, key)` already carrying a live tombstone in-window or in the content.
    - **Status compares disk to the raw note** (`commands/user/sync-status.ts` `inspectDiskVsLocalSnapshot`) —
      disk holds the load-materialized projection (tombstones GC'd) while the raw note carries the un-projected /
      duplicate form, so a clean post-sync disk reads as `local unsaved`. Fix: compare disk to **`projection(note)`**
      via one canonical materialized-manifest builder shared by `arc user load` and status, not the raw manifest.
- *Files:* `lib/user-sync/merge.ts`, `commands/user/save-load.ts`, `commands/user/sync-status.ts`, plus regression
  tests (duplicate-tombstone, post-load cross-WU status, save→status loop) — across **both** the package source
  and the `.arc/` instance copies.
- *Interim (until this ships):* benign + self-healing — duplicates GC at the 7-day TTL, no data loss. Sync notes
  *before* leaving the WU branch; prefer `arc user load` to clear a stuck false `local unsaved`. (See WORKING-MEMORY.)
- *Supersession:* `operational-state-docs`' record/projection model (ADR-022 §4) eventually takes tombstones out of
  the rendered file (non-projected record field), at which point both defects dissolve and this near-term merge fix
  retires. This is the bridge until then — not a competing design.

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

### Merge-gate-awareness / unattended-merge completion trigger

`run-errand` and the `drain-inbox` execution transition both defer post-merge cleanup — errand branch/worktree
teardown and removal of the slug-matched `USER-INBOX` line — to the errand's *merge*. On the auto-merge lane that
merge is *unattended*, so no workflow step fires the cleanup; session-init's in-flight-errand sweep backstops it
for now. This member owns the unattended-merge **completion trigger** (who runs teardown + line-removal when no
one attends the merge) — reconcile `run-errand`'s Complete phase and the drain's close. This is the `run-errand` /
`drain-inbox` facet of the broader "make the lifecycle workflows merge-gate-aware" concern (`integrate-work-unit`
is the sibling case, handled by the option-B audit below).

### Async-merge audit — option B (additive)

`integrate-work-unit.md` and related lifecycle workflows currently assume synchronous merge. Audit sync-merge
assumptions and adjust touchpoints **additively** — sync-merge stays the primary flow; the awaiting-review state
gets explicit accommodation at session-handoff, meta-file updates, worktree cleanup, and archival ordering.
Rejected alternatives: **A** (full rewrite of state transitions — cleanest end state, heaviest change) and **C**
(mixed — primary rewrite of `integrate-work-unit` plus additive elsewhere). Option B is lighter and preserves the
existing workflow shape. The 2026-06-03 audit (over `integrate-work-unit` / `archive-work-unit` / `session-handoff`
/ `deactivate-work-unit` / `setup-merge-gate`) confirmed "largely shipped" with no scope blow-up: `setup-merge-gate`
is orthogonal (the auto-merge lane); the suspend/resume seam + completion sweep are net-new exactly as sized.

### Folded lifecycle plumbing

The fold absorbed three pieces of loose plumbing that belong with the lifecycle mechanism:

- **`arc start` create-new worktree-spawning wiring.** WF's `spawnWorktree` primitive already exists; only the CLI
  mode is unwired. (Extracted from AWL 2026-06-03; the `--tier` grammar layer stays AWL.)
- **Subdir-removal primitive** — the `arc user close` / per-WU subdir teardown the synchronous chain currently
  couples to merge.
- **Cohort-`{name}.md` discovery at session-init** — agent awareness of the coordinating cohort doc is load-bearing
  for parallelism actually coordinating (`AGENT-BRIEF.ARC` note + optional session-init surfacing). Owned here as
  the session-init surface; all members rely on the doc being read.

### `Class`-aware plate-balance — the session-init surface

The plate-balance *doctrine* is `concurrent-work-doctrine`'s; this member owns the single advisory annotation line
fed into session-init's next-work discovery so suggestions account for in-flight composition — when a `Heavy` /
`Novel` stream is already open, surface the parallelism caveat (the `Class` model's "roughly one genuinely-novel
stream" balance rule). **Awareness-only, never paternalistic** — it surfaces once and never suppresses, reorders,
gates, or re-nags. Consumes the `Class` contract; does not redefine it.

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
single-source and ready. Decide at this member's spec.

---

## Scope Estimate

**Medium — workflows + session-init probe, mostly additive.** Audit-don't-rebuild: the async-merge touchpoints are
largely shipped (`archive.cadence: manual` + the stale/in-flight sweeps). Net-new is the suspend/resume seam, the
completion sweep (full tail through archival), the same-session finalize pass, merge-gate-awareness, plus the
folded plumbing (`arc start` create-new wiring, subdir primitive, cohort-doc discovery).

> **Watch:** this member may itself prove too large for one PR and recurse into a split. It is already at the
> one-level nesting cap, so a further split fans out laterally as siblings under
> `agile-parallelism/concurrent-work-conventions/`, not nested deeper.

### Dependencies

- **Internal:** `concurrent-work-doctrine` (the async-merge conventions) and `merge-safety-mechanism` (reuses its
  behind-base primitive in the completion sweep). Merge-safety ideally precedes this member — soft.
- **Substrate (shipped):** `archive.cadence: manual`, the stale-worktree + session-init in-flight sweeps, the
  errand sweep's PR-state classification, the inbox-reminder machinery + once-per-day marker, WF's `spawnWorktree`,
  the `Class` contract.
- **Soft dep:** `composable-workflows` (for the eager-teardown shared-step hoist of `decompose-work-unit`'s
  park-exit block).
