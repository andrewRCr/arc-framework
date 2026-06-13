# Spec (`detailed` · `RFC`): async-merge-lifecycle

- **Origin:** [internal] — the async-merge completion-tail half of the decomposed Concurrent Work Conventions
  concern. The start-time spawn/steering surfaces are the sibling `worktree-default-start`'s; the `lib/user-sync/`
  notes-merge engine correctness is the shipped `notes-merge-coherence` dependency's.

- **Purpose:** Make the awaiting-review window a fully-supported lifecycle pattern. Wire the completion tail that
  runs after a PR opens — resume the integration ceremony across sessions, force completion against
  dangling-`Integrating` rot, finalize same-session merges, sync user notes post-merge, emit the standalone
  `integration` footer, and tear down the merged branch eagerly at the ceremony — all additive over the existing
  sync-merge flow.

---

## Introduction / Context

Under `branch.protection: full` with concurrency, a work unit doesn't merge the moment it's done. Review can take
days to a week, and through that window the work unit sits in **`State: Integrating`** — shipped from the
developer's side, not yet merged. `concurrent-work-doctrine` (shipped, PR #81) made this a sanctioned pattern:
`Integrating` is a real state, the developer hands off across the wait and advances other work, and archival +
worktree cleanup wait for the actual merge.

What that doctrine did **not** ship is the lifecycle machinery the pattern needs. The lifecycle workflows still
assume **synchronous merge** — PR created → merged → cleanup in one unbroken flow. Four concrete gaps follow from
that assumption, each confirmed against shipped code during planning:

- **No resume entrypoint.** `integrate-work-unit.md` hard-starts `Active → Integrating` with no re-entry guard,
  and `merge → arc user close → worktree-removal` is one synchronous chain. Handoff parks the `Integrating` state
  correctly, but nothing **resumes** the ceremony — and nothing owns `arc user close` on a merge that lands while
  no session is attending it.
- **No forcing function.** Nothing reaps a work unit stuck in `Integrating`. The stale-worktree sweep is
  worktree-only; branch-gone recovery fires only for the current branch. A merged-but-unfinalized WU rots
  silently.
- **A same-session blind spot.** A PR that merges *during* a session — after control has returned to base context
  — is finalized by neither in-session completion (the session moved on) nor the next-session sweep (it merged
  this session). PRs #72 / #73 hit exactly this and needed manual cleanup.
- **A latent footer and a missing notes leg.** `merge-safety-mechanism` (shipped, PR #83) taught the `commit-msg`
  hook to **accept** `Context: integration (...)` as a standalone single-parent footer kind, but nothing
  **emits** it and `commit-footer.md` doesn't enumerate it. Separately, the finalize sequence has no
  notes-sync step, so a post-merge base pull can leave HEAD carrying an unsynced note (the
  `localNoteFreshness.state === "ancestor"` case the PR #83 close-out surfaced).

The async-merge touchpoints are **largely shipped** (`archive.cadence: manual` defers archival post-merge; the
stale-worktree and session-init in-flight sweeps backstop walk-away cleanup), so this is an **audit-don't-rebuild**
work unit: wire the net-new completion machinery, adjust the sync-merge workflows additively, and leave the
primary sync-merge flow intact.

## Goals

- **Resume an integration ceremony across a session or machine boundary** — entering `Integrating` is a
  suspendable point, and the merge/close/teardown tail re-enters cleanly without redoing completed steps.
- **A forcing function against dangling-`Integrating` rot** — every session-init surfaces owned work units stuck
  in the completion tail, with a configurable staleness threshold for the time-gated tier and event-driven
  triggers for the actionable ones.
- **No merge falls through the cracks** regardless of *when* it lands — in-session synchronous, same-session
  async, cross-session async, attended manual, or unattended auto-lane — each has exactly one owning completion
  path, with idempotent backstops where ceremonies overlap.
- **Integration failure is loud at completion, not rediscovered next session** — CI / merge failures surface for
  both manual- and auto-merge lanes the moment control returns to base context.
- **User notes stay coherent across the post-merge base pull** — completion wires the notes sync so HEAD carries a
  saved note after the fast-forward, consuming the shipped `notes-merge-coherence` engine.
- **The `integration` footer becomes real** — an emitter exists and `commit-footer.md` enumerates it, closing the
  producer-less allowance shipped by `merge-safety-mechanism`.
- **The merged branch is reaped at the ceremony** — `integrate-work-unit`'s post-merge teardown is symmetric
  across the primary-worktree and linked-worktree arms, matching `decompose-work-unit`'s park-exit block.

## Non-Goals

- **Rewriting the synchronous-merge flow.** Sync-merge stays the primary path; every change here is additive
  (option B — see Alternatives). No state-machine rewrite.
- **A new state or meta field.** `Integrating` already *is* the awaiting-review state; merge-position is folded in
  per `work-organization-reform`. Nothing here adds a state, field, or branch type.
- **The notes-merge engine.** Idempotent tombstone resolution, projection-aware status, and `ancestor`-freshness
  recognition shipped in `notes-merge-coherence`. This WU only **wires the leg** that calls the sync at
  completion.
- **Start-time worktree spawn / steering.** The create-new `arc start` worktree wiring and start-time steering are
  the sibling `worktree-default-start`'s scope, carved off during decomposition.
- **The cross-machine `plan/`-orphan reaper.** The stale local `plan/` branch left on a *second* machine by
  `activate-work-unit`'s local-only rename stays `coord-probe`'s — see Proposed Design § Reaper facet split.
- **Blocking on CI.** The same-session finalize pass is bounded and opportunistic; it never holds a session open
  waiting for an unbounded CI run.
- **Eager teardown via a hoisted shared step.** Adopting `decompose-work-unit`'s park-exit block as a single
  composed step waits on `composable-workflows`; this WU authors the teardown inline (see Open Questions).

## Proposed Design

The design has one organizing principle and seven buildable units. The units are the enumerable substrate the
task list is built from and validated against.

### Organizing principle: completion is a primary-worktree boundary action

The completion tail — `gh pr merge` (when attended) + `arc user close` + branch/worktree teardown + notes sync —
runs cleanest from the **primary worktree**, never as a mid-increment switch inside a feature worktree. The
primary worktree is the coordination hub (it is routinely on a planning or archive branch, not `main`), and
completion is coordination work. This unifies the suspend/resume seam, the finalize pass, and the sweep around a
single locus and keeps merge + cleanup decoupled from the integration *session*.

The work-unit completion tail is, in full:

```text
awaiting-review → mergeable → merged-needs-archival → archived
                ↘ changes-requested / checks-failed (blocked)
```

`merged-needs-archival` exists only under `archive.cadence: manual` (the default for code WUs); under
`with-integration` the archival ceremony already landed pre-merge, so the tail collapses to
`awaiting-review → mergeable → merged`. The **errand** tail is symmetric but shorter — it has no meta or archival
stage:

```text
awaiting-review → mergeable → merged → cleanup   (locus teardown + slug-matched USER-INBOX-line removal)
```

### 1. Suspend/resume seam at the PR-open boundary

`integrate-work-unit.md` gains a **resume entrypoint**. Today Phase 1 Step 1 hard-starts `Active → Integrating`
with no re-entry guard; a second entry would attempt the transition again. The change:

- **Re-entry guard on Step 1.** When the WU is already `Integrating`, skip the state transition and the
  pre-PR/PR-open steps that already ran; re-enter at the first incomplete tail step (resolved from PR state — open
  vs. merged — and the presence of the worktree). The ceremony becomes idempotent from `Integrating` onward.
- **Tail steps own their own completion.** `merge → arc user close → teardown` is re-expressed so each step is
  individually re-runnable: `arc user close` is owned on the resume path (not only the synchronous chain), and
  teardown (unit 7) no-ops when the branch/worktree is already gone.

This is the WU-side seam. The errand resume seam needs nothing new — `run-errand.md`'s Integrate phase is already
re-enterable.

### 2. In-flight completion sweep — the forcing function

Generalize the errand sweep's PR-state classification to **owned work units across the full tail**, as a
session-init probe surface. The pure classifier `classifyInFlightErrands` (`lib/session-init/in-flight-errand-sweep.ts:73`)
is the reuse seam — it is git/network-decoupled and already battle-tested. Net-new alongside it:

- **`classifyInFlightWorkUnits`** — a parallel classifier. The errand 4-state enum does **not** map 1:1 to the WU
  tail, so this carries its own ~6-state enum: `awaiting-review`, `mergeable`, `changes-requested`/`blocked`,
  `merged-needs-archival`, `archived` (terminal — excluded from the in-flight surface), and `stale` (the
  time-gated overlay on `awaiting-review`).
- **A WU-branch enumerator** — the roster-to-branch mapping the errand path gets from `chore/` branch scanning;
  WUs resolve from the active roster + their `**Branch:**` field.

Two tiers, matching the errand sweep's cost model:

- **Presence tier** (roster-sourced, free, every session-init): classifies from tracked state alone — which owned
  WUs are in `Integrating`, how long, against the stale threshold. No network.
- **Mergeable-sharpening tier** (oracle, PR-source via `gh`, gated to handoff / no-active-WU): sharpens
  `awaiting-review → mergeable | blocked | merged-needs-archival` from live PR state. Degrades to presence
  cleanly when `gh` is absent or the network is unreachable.

Threshold and trigger semantics:

- A configurable **`*_after_days`** threshold (reuse the inbox-reminder machinery + the once-per-calendar-day
  marker) gates the **`stale`** tier — `awaiting-review` past the threshold surfaces as a batched nudge.
- The **`mergeable`** and **`merged-needs-archival`** triggers are **event-driven** — they bypass the threshold
  and surface immediately, because they name an action the developer can take now (merge it; archive it).
- Behind-base classification **reuses `merge-safety-mechanism`'s behind-base primitive** rather than re-deriving
  it.

The sweep surfaces as orientation routes (mirroring the existing errand-in-flight surface); it never
auto-switches, auto-merges, or auto-archives.

### 3. Same-session finalize + integration-failure surfacing

The sweep is a *next-session* backstop. It leaves the same-session blind spot: a PR that merges during the
session, after control returned to base context, is caught by neither in-session completion nor the next-session
sweep. Add an **opportunistic, bounded finalize pass** that fires when control returns to base context (the
primary worktree, post-increment). It polls *this session's* PRs once / briefly and dispatches per PR:

- **merged-clean** → eager teardown: delete the local branch, prune the stale remote-tracking ref, remove any
  ephemeral worktree, and drop the slug-matched `USER-INBOX` line (idempotent — see unit 6).
- **failed / blocked** → surface **loudly** — for **both** manual- and auto-merge lanes, so blocked integration
  is flagged at completion, not rediscovered next session.
- **still-pending** → hand to the sweep (unit 2); no action this session.

The pass preserves the **non-blocking principle** — it never waits on an unbounded CI run. "Once / briefly" means
a single bounded poll with a hard ceiling, then hand off to the sweep.

### 4. Post-merge notes-sync leg

The same-session finalize sequence (unit 3) and the unattended-merge completion trigger (unit 6) both close by
syncing user notes — yet the finalize sequence today lists teardown / branch-delete / ref-prune / inbox-line and
**not** a notes-sync step. Add the leg: the **workflow wiring** that calls the sync at completion and leaves
current HEAD carrying a saved note after the base pull / fast-forward.

This member owns **only the wiring** — call the sync, leave HEAD fresh. The **engine correctness** it depends on
(idempotent removal-tombstone resolution, projection-aware status, `ancestor`-freshness recognition) is the
shipped `notes-merge-coherence` dependency. The finalize sync fires right after the WORKING-MEMORY / inbox
maintenance that rides WU completion — the exact trigger for the defects `notes-merge-coherence` fixed — so the
**build-first edge** (`Depends On: notes-merge-coherence`, now satisfied) is what makes wiring the leg safe rather
than shipping a deterministically-broken sync.

### 5. Standalone `integration` footer emission

Wire the **emitter** for `Context: integration (...)` and land the **`commit-footer.md` enumeration with it**, so
the source-of-truth line arrives alongside the producer rather than documenting a producer-less allowance.

- **Emitters** (natural producers, all in this WU's surface): the in-flight completion sweep's actionable commits,
  the unattended-merge completion trigger, and any archival / finalize ceremony commit this WU wires. The footer
  marks single-parent integration-ceremony commits — distinct from a merge commit's two-parent provenance.
- **Documentation:** enumerate the `integration` footer kind in `commit-footer.md` (**both copies** — package
  source and `.arc/` instance, per package-project sync).

### 6. Unattended-merge completion trigger + idempotent slug-line removal

`run-errand.md` and the `drain-inbox` execution transition both defer post-merge cleanup — errand branch/worktree
teardown and removal of the slug-matched `USER-INBOX` line — to the errand's *merge*. On the **auto-merge lane**
that merge is **unattended**: no workflow step fires the cleanup, and session-init's in-flight-errand sweep
backstops it. This unit owns the completion trigger — **who runs teardown + line-removal when no one attends the
merge** — by reconciling `run-errand.md`'s Complete phase and the drain's close.

The slug-matched line now has **three** removers — `run-errand § Complete` (in-session, full), the same-session
finalize pass (control-returns-to-base, unit 3), and the session-init errand sweep (next-session backstop). To
prevent a double-fire against a present-then-absent line on the unattended lane:

- **One authoritative point:** `run-errand § Complete` (which already declares itself "the single point where that
  removal is ensured").
- **Two idempotent, slug-matched backstops:** the same-session finalize pass and the session-init sweep **no-op
  when the line is already gone**.

The errand close-out is symmetric to the WU tail but **shorter** — no meta / archival stage — so the completion
sweep's WU "full tail" must **not** drive an archival step for an errand.

### 7. Eager post-merge teardown (resolved: eager-in-ceremony, inline)

`integrate-work-unit.md` Step 13 is asymmetric: the **linked-worktree** arm runs
`git worktree remove <path> && git branch -d <branch>` (eager, merged-only-safe), but the **primary-worktree
(in-place WU)** arm does **no branch delete** — it notes "no worktree to remove" and continues. A `feat/<name>`
branch that lived directly in the primary worktree is never reaped by the ceremony, and nothing else reaps it
(the session-init stale sweep is worktree-only). `decompose-work-unit.md`'s park-exit block, by contrast, already
tears down **both** arms completely.

**Resolution — eager teardown, owned by the ceremony, authored inline now:**

- Close the Step 13 **primary-worktree** gap: add a merged-only-safe `git branch -d <wu-branch>` (local) plus a
  stale remote-tracking-ref prune, making both arms symmetric and matching `decompose`'s park-exit block.
- Teardown rides the **merge**, under the pre-merge `integration-interlock` approval (no second prompt). It does
  **not** ride archival: **`archive-work-unit.md` stays teardown-free** — coupling branch cleanup to archival
  cadence would needlessly defer a safe-once-merged delete.
- The sweep (unit 2) and same-session finalize (unit 3) remain the backstop for the **unattended / cross-session**
  merges where no ceremony is present at merge time — eager-where-attended, lazy-where-it-structurally-must-be.

### Reaper facet split (resolved: facet split with `coord-probe`)

The stale-branch reaper concern has two facets that `coord-probe` and this WU coordinate on. Both work units are
unspecced; **this WU specs first**, so per the standing rule it owns the reaper — but the facets split by natural
surface rather than one swallowing the other:

- **Facet 2 — `feat/` orphan (this WU owns):** the `integrate-work-unit` Step 13 primary-worktree gap. Fires *at
  merge*; it *is* unit 7. The unattended/cross-session backstop is the completion sweep (unit 2), which is
  roster/PR-driven over *this machine's owned WUs*.
- **Facet 1 — cross-machine `plan/` orphan (`coord-probe` retains):** `activate-work-unit` Step 5's local-only
  `git branch -m plan/<name> → <type>/<name>` rename leaves the machine that did *not* run activation with a stale
  local `plan/` branch forever (`origin/plan` deleted at activation → local `[gone]`). This fires at *session-init
  on a different machine*, needs `coord-probe`'s `gone`-upstream + recently-active-remote-branch detection
  machinery, and concerns branches this machine has **no roster/worktree backing for**.

These are not a double-build — different fire points (merge vs. session-init-on-another-machine), branch types
(`feat/` vs. `plan/`), and detection drivers (roster/PR vs. `gone`-upstream scan). The "the other extends" clause:
if `coord-probe` later builds a generic session-init stale-local-branch sweep surface, it extends that surface
rather than re-scanning. **At finalize, update `coord-probe`'s inbound-buffer item** to record that facet 2 is
taken and facet 1 stays.

### Async-merge audit — option B (additive)

Re-ground the touchpoint sweep against current shipped code (the 2026-06-03 audit predates `concurrent-work-doctrine`
and `merge-safety-mechanism`, both of which touched these surfaces), then adjust additively. The audit set —
`integrate-work-unit.md`, `archive-work-unit.md`, `session-handoff.md`, `deactivate-work-unit.md`,
`setup-merge-gate.md` — gets explicit awaiting-review accommodation at session-handoff, meta-file updates,
worktree cleanup, and archival ordering, with sync-merge unchanged as the primary flow. `setup-merge-gate.md` is
orthogonal (it owns the auto-merge *lane*, not the completion tail).

## Alternatives & Rationale

### Async-merge audit shape: option B (additive) over A (rewrite) / C (mixed)

- **A — full rewrite of the state transitions.** Cleanest end state, heaviest change; rewrites a sync-merge flow
  that already works and is the *primary* path. Rejected — the cost/risk is unjustified when the touchpoints are
  largely shipped.
- **C — mixed (rewrite `integrate-work-unit`, additive elsewhere).** Splits the difference but still rewrites the
  one workflow most exercised by the synchronous path.
- **B — additive everywhere (chosen).** Sync-merge stays primary; the awaiting-review window gets explicit
  accommodation layered on. Lighter, preserves the existing workflow shape, and matches the audit finding
  ("largely shipped, no scope blow-up"). The suspend/resume seam (unit 1) and completion sweep (unit 2) are
  net-new *additions*, not rewrites.

### Post-merge teardown: eager-in-ceremony over lazy-sweep-only

- **Lazy, sweep-only.** Leave Step 13 asymmetric; let the new completion sweep reap the in-place `feat/` branch as
  a backstop. Rejected — it permanently diverges `integrate` from `decompose` (which tears down both arms) and
  from `integrate`'s own linked arm, and defers a safe-once-merged delete to a next-session sweep for no benefit.
  The "eager vs. lazy" framing is partly a false binary: the WU is **already eager wherever a ceremony is present**
  (the linked arm; the same-session finalize pass), so the only incoherence is the one in-place gap.
- **Eager via hoisted shared step.** Adopt `decompose`'s park-exit block directly. The cleanest DRY end state, but
  it requires the `composable-workflows` shared-step hoist to land first — gating this spec on an unspecced P2
  backlog WU. Rejected as a *blocker*; retained as a deferred follow-on (Open Questions).
- **Eager-in-ceremony, inline (chosen).** Close the gap now by authoring the branch-delete inline, symmetric with
  the linked arm and `decompose`. Restores coherence immediately without a cross-WU dependency; the DRY hoist
  becomes a clean later refactor.

### Reaper ownership: facet split over whole-reaper-absorption

- **Absorb the whole reaper.** This WU (specs first) takes both facets; `coord-probe` drops the reaper. Rejected —
  facet 1 (cross-machine `plan/` orphan) fires at the wrong point for this WU (session-init on another machine,
  not merge) and needs detection machinery (`gone`-upstream scan) that `coord-probe` is built to own. Absorbing it
  would pull cross-machine-coherence scope into a completion-tail WU.
- **Defer the whole reaper to `coord-probe`.** Rejected — facet 2 *is* unit 7 (the Step 13 gap), squarely this
  WU's post-merge surface; deferring it would leave `integrate` incoherent while `coord-probe` waits in the
  backlog.
- **Facet split (chosen).** Each facet goes to its natural surface; the seam is recorded and `coord-probe`'s
  buffer updated. No double-build, no scope bleed.

### Notes engine: extracted dependency over in-WU build

The notes-merge engine correctness was originally absorbed here (option A). It was **carved out** to
`notes-merge-coherence` because it fixes live `lib/user-sync/` defects independently, is consumed by
`cross-machine-sync-coherence`, and is a clean prerequisite. Wiring the leg without the fixes ships a
deterministically-broken sync, hence the build-first edge. Now that the engine has landed, the leg grounds
against a settled engine — the right seam.

### Slug-line removal: one authoritative point + idempotent backstops over three independent removers

Three independent removers against the same `USER-INBOX` line risk a double-fire on the unattended lane (present
when remover A runs, gone when remover B runs). Naming one authoritative point (`run-errand § Complete`) and
making the other two idempotent slug-matched no-ops is the minimal correctness mechanism — it tolerates any
firing order and any lane.

## Cross-cutting Considerations

- **Testing.** The net-new pure classifier (`classifyInFlightWorkUnits`) is unit-testable in isolation, mirroring
  the existing `classifyInFlightErrands` tests — git/network-decoupled, table-driven over the ~6-state enum. The
  mergeable-sharpening tier's `gh` interaction tests against a mocked PR source (real-`gh` tests skipped in CI
  when unavailable, per existing convention). The suspend/resume seam and finalize pass are workflow-doc behavior,
  validated by walking the re-entry and same-session paths; idempotent backstops get an explicit "line already
  gone → no-op" assertion.
- **Performance / session-init latency.** The presence tier is free (tracked state only) and runs every
  session-init. The mergeable-sharpening tier is the only network cost and is **gated to handoff / no-active-WU**
  and **degrades to presence** without `gh` — session-init's critical path is never blocked on a live PR query.
- **Migration / rollout.** Fully additive — **no new state, field, branch type, or config-shape change** beyond
  the one `*_after_days` threshold key (which reuses the inbox-reminder machinery). Existing sync-merge sessions
  are unaffected; the new surfaces activate only in the awaiting-review window. No backfill, no breaking change.
- **User-facing impact.** The developer sees new session-init orientation routes (owned WUs in the completion
  tail, the stale nudge, merge/archive-ready events) and loud same-session failure surfacing. All advisory —
  nothing auto-acts on branch state, merges, or archives.
- **Package-project sync.** `commit-footer.md` (unit 5) and every edited workflow / method under `system/` ship to
  adopters — edit the **package source** and sync to `.arc/`, both copies staged together.
- **Append-only invariant.** The teardown (unit 7) deletes a branch only **after merge**, merged-only-safe
  (`-d`, never `-D` for `feat/`). Nothing here rewrites a pushed branch; review-feedback commits still land
  append-only on the live branch per doctrine.

## Success Criteria

Validated at work-unit completion:

1. **Resume works.** A session can enter `Integrating`, hand off, and a later session (or machine) re-enters
   `integrate-work-unit.md` and completes the tail without redoing the state transition or re-running completed
   steps; the re-entry guard skips the `Active → Integrating` transition when already `Integrating`.
2. **The sweep surfaces the full tail.** Session-init classifies owned WUs across `awaiting-review` /
   `mergeable` / `blocked` / `merged-needs-archival`; the stale tier respects `*_after_days` + the once-per-day
   marker; the mergeable / merged-needs-archival events bypass the threshold; the mergeable tier degrades to
   presence without `gh`.
3. **No same-session merge falls through.** A PR that merges mid-session, with control back at base, is finalized
   by the same-session pass: branch torn down, remote-tracking ref pruned, ephemeral worktree removed, inbox line
   dropped — and a failed/blocked PR is surfaced loudly for both lanes — without any unbounded CI wait.
4. **Notes stay coherent.** After a post-merge base pull / fast-forward, current HEAD carries a saved note (no
   lingering `ancestor`-freshness gap); the leg calls the sync and leaves HEAD fresh.
5. **The footer is real.** An integration-ceremony commit emits `Context: integration (...)`, the `commit-msg`
   hook accepts it, and `commit-footer.md` (both copies) enumerates the kind.
6. **The unattended lane completes.** An auto-merged errand has its branch/worktree torn down and its
   slug-matched `USER-INBOX` line removed exactly once; the two backstops no-op when the line is already gone; the
   errand path drives no archival step.
7. **Teardown is symmetric.** `integrate-work-unit.md` Step 13 reaps the merged `feat/` branch on **both** the
   primary-worktree and linked-worktree arms (merged-only-safe); `archive-work-unit.md` performs no branch
   teardown.
8. **The reaper seam is recorded.** The spec documents the facet split and `coord-probe`'s inbound-buffer item is
   updated to reflect that facet 2 is owned here and facet 1 stays with `coord-probe`.

## Open Questions

None gate the build — both design-gating decisions (eager-vs-lazy teardown; reaper ownership) were settled at
discovery. Genuine implementation-detail latitude, resolved during the work:

- **DRY-hoist timing (deferred, not open design).** Once `composable-workflows` lands the shared-step hoist, the
  inline teardown (unit 7) and the same-session finalize teardown (unit 3) can adopt `decompose-work-unit.md`'s
  single-source park-exit block. This is a later refactor with a clean trigger — explicitly **not** a blocker for
  this WU, and not a deferred design decision (the teardown *behavior* is fully settled; only its eventual
  factoring is deferred).
- **Sweep state-enum leaf count.** The classifier needs ~6 states; the exact partition (e.g., whether
  `changes-requested` and `checks-failed` collapse into one `blocked` leaf or stay distinct) is an implementation
  call settled when the classifier is built against live PR shapes — it does not change the surface contract.
