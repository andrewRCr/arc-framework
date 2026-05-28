# Draft: In-Flight Awareness

**Purpose:** The awareness layer over Worktree Foundation's mechanics — the in-flight-detection
**oracle** (remote refs + open PRs), the user-scoped **`STATUS.USER`** view + its render standard, the
per-WU **`Priority`** field, and **materialize** (discovery-led pickup of a remote WU). Answers "what
work of mine is in flight across worktrees and machines, and how do I pick it up here?"

- **State:** Draft — carved out of Worktree Foundation 2026-05-24 (the 2-way Foundation | Awareness
  split). WF had grown to three heavy subsystems (worktree mechanics, cross-WU sync, awareness); this WU
  is the awareness subsystem, lifted whole rather than left to bloat a single PRD.

- **Created:** 2026-05-24

- **Origin:** Split from `draft-worktree-foundation.md` (was its items 12–13 plus the oracle-backed
  activation-time concurrency check). Carved because the oracle + view + materialize form a coherent
  **net-new** subsystem — no existing oracle / PR-source / render code, ROADMAP is hand-maintained today
  — distinct from WF's worktree-entry mechanics. The split also sharpens downstream dependencies:
  Foundation unblocks Agile WU Lifecycle + arc-plan Conductor (spawn / lifecycle), while this WU unblocks
  Concurrent Work Conventions (concurrency gate), roadmap-tooling (render automation), and Coord Probe (a
  PR-signal source). See `cohort-agile-parallelism.md`.

---

## Problem / Motivation

Worktree Foundation makes per-WU-per-worktree isolation real, but an agent in one worktree's session
structurally cannot see the operator's *other* in-flight worktrees, and nothing surfaces WUs in flight
only on another machine. ROADMAP is project-scoped, all-owners, derived-at-merge (mid-WU stale); session
tabs / GUI show *sessions*, not *WUs*. The gap is a **user-scoped, cross-WU, cross-machine view of
in-flight work** — and the **oracle** that derives it, which is also the safety primitive behind the
activation-time concurrency check and (downstream) Concurrent Work Conventions's concurrency gate.

Without **materialize**, cross-machine resume is a teaser: the oracle surfaces "`new-wu` is in flight
remotely," then drops the operator to a raw `git worktree add`.

## Scope

### In scope

1. **The in-flight oracle (the data-primitive).** The in-flight-detection primitive — remote refs + open
   PRs, parsed path / content-based (not branch-name → WU, since an Errand branch maps to no WU); WU metas
   read off remote refs via `git show`, no checkout. The branch *prefix* is a free state-proxy: `plan/` =
   live-mutating planning; type-prefix = activated, plan frozen.
    - **Purely derived, no annotation layer.** Carries only oracle-derived state (in-flight WUs + State);
      per-WU human context stays in SESSION-NOTES, cross-WU in WORKING-MEMORY.
    - **On-demand with an optional local cache — does not need to sync.** Because the core derives from
      *remote* refs + PRs, every machine regenerates it identically; a persisted cache is a read
      convenience, not synced human content. No worktree paths are stored — resolve them live from
      `git worktree list` for locally-checked-out WUs, omit for the rest.
    - **Consumed three ways:** the `STATUS.USER` render; the activation-time concurrency check (scope item
      5); and CWC's concurrency gate (downstream). The PR-source degrades to refs-only when no coord
      adapter is present (mirrors WF's branch-gone cascade / coord-probe coupling).

2. **`STATUS.USER` view + render standard.** Establish the **view file + its strategy-doc standard**
   (derivation algorithm, hand-maintenance procedure, regen triggers), usable from ship and hand-maintained
   in the interim exactly as ROADMAP is today (`roadmap-tooling` automates the render later).
    - **Naming + layering.** The rendered surface is **`STATUS.USER`** — the user-scoped sibling of the
      project readiness view (today's `ROADMAP`, which roadmap-tooling renames to `STATUS.PROJECT`).
      `STATUS.USER` is a **filtered mode of the same source**, not a second generator; the user/project
      split mostly bites in team mode (solo: `Owner = me` ≈ all). Scope it to the in-flight-mine slice (the
      cross-worktree-invisible part); not-in-flight stays in the project view. In-flight is location /
      ref-based: a WU in `active/**` (≡ an unmerged WU branch on the remote) is in flight, so `STATUS.USER`
      surfaces your actively-planned WUs, not just executing ones.
    - **Render standard — columns + sort.** Both `STATUS.*` views derive from one source; each table renders
      only the columns that distinguish its rows — **omit any column constant across that table**. Per-table
      sets: **In Flight** = WU · State · [Priority] · Owner · Depends-on · Cohort; **Ready** = WU · [Priority]
      · Owner · Cohort (State constant `Planning`; Depends-on constant `—`); **Blocked** = WU · [Priority] ·
      Owner · Depends-on · Cohort (State constant; Depends-on = the blocking dep); **`STATUS.USER`**
      (In-Flight-mine only) = WU · State · [Priority] · Depends-on · Cohort (Owner constant `= me`).
      `[Priority]` is itself conditional — rendered only when the field is present. Tables are exempt from
      line-length lint (`MD013.tables: false`). **Sort key (uniform):** `(priority, cohort, wu-name)`;
      Blocked additionally grouped by dependency-depth band (shallowest first). Absent priority resolves to
      `P3`, so the key reduces to today's `(cohort, wu-name)` pre-priority; WU-name is the total-order
      tiebreak, so renders are byte-identical for identical inputs (no spurious regen diffs). `STATUS.USER`
      shares the project In-Flight sort (filtered, not re-sorted).

3. **The per-WU `Priority` field.** Introduce `**Priority:**` — an *input* field (hand-set, like `Owner` /
   `Depends On`), landing where first needed: the multi-in-flight worklist this WU ships (a flat worklist
   can't be triaged). Three bounded levels, `P3` default: **P1** top focus (context-switch back first) /
   **P2** elevated / **P3** baseline ("whenever there's capacity"; unset = `P3`). Owner-set, mutable,
   conflict-free under worktrees — a per-WU *field*, never a hand-curated ordering *doc* (mutated shared
   state per ADR-020). Adds `**Priority:**` to `template-meta.md` (schema authority) and
   `strategy-work-organization.md` § Source of truth (this WU's own doc edits).
    - **Settled details + non-goals.** `P0` is avoided: it carries an emergency / stop-the-world connotation
      that collides with incident-severity culture and misfits a *standing* attention scale (external
      validation concurs; novel-space design — no prior art for priority across concurrent agent
      worktrees). Durability is the **tracked field + git history** — every change is an authored,
      timestamped commit; no in-file change-log array (redundant with git, per ADR-020). Anti-inflation
      discipline (a soft cap on concurrent P1s) is **documentation guidance only** — strategy doc + docs
      site, never an agent-surfaced nag or render-time signal: ARC renders the state you consult, it does
      not editorialize. An emergency / expedite signal, if ever wanted, is an **orthogonal lane / flag —
      never a `P0` level** — with "halt parallel expansion (no new spawns) until it lands" semantics, one of
      the rare *explicit-block* cases; **YAGNI now**, noted so it survives as an orthogonal axis.
    - **Directional layer largely dissolves.** With `State × Depends-On × Priority`, now/next/later is
      *derivable* (Now = In Flight; Next = Ready, priority-ordered; Later = the rest) — a render mode, not a
      curated doc; narrative direction lives in PROJECT-PRD. Routed to roadmap-tooling's "should ARC add a
      directional layer?" open question.

4. **Materialize — pick up an existing remote WU on this machine.** The fourth entry-point quadrant
   (`cohort-agile-parallelism.md` / Worktree Foundation § Entry-point model): a WU that already exists
   (branch + committed meta on the remote, SESSION-NOTES in the notes ref) but is not checked out as a
   worktree here.
    - **Discovery-led, no direct-by-name surface.** Triggered as an `arc-session` dispatch branch (this WU
      adds the materialize branch to Foundation's `arc-session` skill): when no local active WU resolves and
      the oracle surfaces remote-only in-flight WUs the operator owns, `arc-session` offers to materialize
      the chosen one. The candidate list is the correctness mechanism — you select a real in-flight WU, so a
      phantom or typo'd name is impossible. A direct-by-name flag (`--materialize <name>`) is **consciously
      deferred**: it reintroduces the "rely on memory" failure the oracle exists to remove, and is purely
      additive later if a real need (e.g., automation) appears.
    - **Thin orchestration over existing pieces.** `git worktree add <templated-path> origin/<branch>` (path
      from WF's location template) → `arc user pull` (WF's per-WU subdir load) → orient. The only genuinely
      new logic is the dispatch + offer. Git refuses double-checkout, so if the branch is already
      materialized somewhere, materialize points to the existing worktree — free safety.
    - **Boundary with cross-machine coherence.** Materialize is the *mechanism* to pick up a remote WU; the
      *guarantee* that what you pick up is complete (the partial-push trust signal) stays with
      `cross-machine-sync-coherence` (downstream). Materialize gives that WU a concrete first-class verb to
      harden rather than a manual git incantation.

5. **Oracle-backed activation-time concurrency check.** Worktree Foundation ships this check as a
   *degrading advisory stub* (R11), and Errand Enablement extends the same advisory pattern to the
   `errand-launch` foreign-artifact gate. This WU upgrades **both** to the **oracle-backed** version —
   identity-filtered refs + PRs — consumed from spawn / cold-start / materialize / errand-launch. Still
   advisory, judgment-based, never a gate (the *gate doctrine* is CWC's). Absorbing both advisory stubs in
   one pass is why Errand Enablement sequences before this WU.

6. **Session-probe orchestration model (absorbs WF's conditional-slot seam).** The oracle's network slice
   (item 1), gated on `active.resolution === "none"` (the latency-budget decision below), is the **second**
   conditional-expensive slot added to a session-init orchestrator (`commands/status/run.ts`) whose three
   entry points (`runStatus` / `runSessionInitStatus` / `runSessionHandoffStatus`) today fan out **every**
   slot eagerly through one `Promise.all`, with no affordance for conditional or cost-tiered firing. Worktree
   Foundation adds the *first* such slot (the branch-gone / no-WU roster) as a deliberately minimal two-phase
   seam, written to be absorbed here. With both real instances in hand, this WU evolves the model: a clean
   **gated-slot affordance** (cheap always-on slots fire on the common resume path; expensive slots fire only
   under their condition) plus **de-duplication of the per-entry-point slot lists** (user / worktree / dirty
   / active / releaseRouting are hand-re-declared across the three composites). The `safeProbe` "envelope
   never rejects" contract and the per-slot result shape are preserved — this evolves the *firing* discipline,
   not the slot contract.
    - **Bounded — earn generality from the two real instances, no pre-building** for hypothetical future slots.
    - **Coordinate with CLI Substrate Adoption on `commands/status/run.ts`.** CSA (post-WF parallel sibling)
      converts the slot wrapper `Probe<T>` → `Result<T, E>` and zod-validates the envelope in the same file;
      the two edits are orthogonal (slot-result *type* vs. slot-*firing* discipline) but co-located —
      sequence or reconcile manually if they run concurrently (vanilla-git discipline until Concurrent Work
      Conventions lands).

### Out of scope

- **Render automation** — `roadmap-tooling` automates the `STATUS.*` render later; this WU ships the oracle,
  the hand-maintained view, and the strategy-doc standard.
- **The concurrency *gate doctrine*** — Concurrent Work Conventions owns when/how the oracle gates
  foreign-artifact edits; this WU ships the oracle the gate consumes.
- **Worktree mechanics** (spawn / cold-start / session-init / cross-WU sync) — Worktree Foundation
  (hard upstream).

## Design Decisions

### Oracle gating + `STATUS.USER` regeneration (the latency budget)

The governing principle: the common path (resume an existing local WU) must not get slower. So:

- **The oracle (network) is gated.** The materialize-discovery oracle fires **only when
  `active.resolution === "none"`** in the session-init probe, so the resume path pays zero oracle cost.
- **`STATUS.USER` regenerates at state-change ceremonies (ROADMAP's model), with the oracle slice gated.**
  Opening the rendered file does not regenerate it — the file is trustworthy when opened because the last
  relevant ceremony refreshed it. Regen splits by cost: the **local slice** (your WUs in flight on this
  machine, via WF/WOR's identity-filtered roster cascade) regenerates cheaply at every local ceremony
  (spawn / activate / integrate / shift / handoff); the **cross-machine slice** (WUs in flight only
  elsewhere) needs the oracle's network round-trip and so fires only at a *subset* of triggers where
  cross-machine truth matters — handoff, explicit `arc sync`, an explicit view request, and the no-local-WU
  init branch — **not** every local ceremony or every session-init. The rendered file is the "optional
  local cache," kept fresh by ceremony triggers.

### Entry-point model — materialize is the 4th quadrant

The entry-point 2×2 (does a local worktree exist? × does the WU already exist?) lives in
`cohort-agile-parallelism.md` as the shared cohort contract; Worktree Foundation implements resume /
cold-start / spawn, this WU implements **materialize** (no local worktree, WU exists remotely) by adding a
dispatch branch to Foundation's `arc-session` skill. "Materialize" stays internal vocabulary — the user
surface is `arc-session`'s discovery offer.

## Dependencies and Sequencing

### Upstream

- **Worktree Foundation** (hard): worktree mechanics (spawn / cold-start), the cross-WU sync engine
  (`arc user` per-WU subdir-load — materialize's pull step), the `arc-session` dispatch skill (materialize
  is a new dispatch branch), and the worktree-aware session-init probe (the oracle gating rides its
  `active.resolution` signal). This WU is the awareness layer *on* WF.
- **Work Organization Reform** (shipped): the cross-worktree roster cascade the local-slice roster builds
  on.

### Downstream

- **Concurrent Work Conventions** (`draft-concurrent-work-conventions.md`): the concurrency *gate* consumes
  this oracle (all-owner refs + PRs).
- **roadmap-tooling** (`draft-roadmap-tooling.md`): automates the `STATUS.*` render this WU hand-maintains
  and establishes the standard for.
- **Coord Probe** (`draft-coord-probe.md`): a PR-signal source the oracle's PR-source can consume (loose —
  the oracle degrades to refs-only without a coord adapter).
- **CLI Substrate Adoption** (`draft-cli-substrate-adoption.md`): the oracle's hand-rolled refs / PR
  parsers become zod / execa migration targets.

### Recommended sequencing

… → Work Organization Reform → **Worktree Foundation** → **Errand Enablement** → **In-Flight Awareness** →
(Concurrent Work Conventions ‖ roadmap-tooling ‖ Coord Probe). Errand Enablement before this WU is a
sequencing *preference* (so the oracle upgrade absorbs both advisory stubs in one pass), not a hard
dependency — left out of `Depends On` to keep the ROADMAP readiness view accurate.

## Open Questions

### Oracle trigger subset — spec

The exact subset of triggers at which the oracle's network slice fires (handoff / explicit `arc sync` /
explicit view request / no-local-WU init). Lean: the four named above; pin at spec.

### Persisted cache earns its keep? — spec

Whether a persisted local cache of the rendered view beats pure on-demand render. Lean: the rendered file
*is* the cache, regenerated at ceremonies; a separate persisted cache likely doesn't earn its keep.

### View-file naming — spec

`STATUS.USER` is the settled surface name; the cohort earlier floated DASHBOARD / IN-FLIGHT / WORKLIST.
Confirm at spec alongside roadmap-tooling's `ROADMAP → STATUS.PROJECT` rename.

## Coordination — ADR-022

`STATUS.USER` is a *derived* managed operational-state document (ADR-022). The `**Priority:**` field is
schema-owned *structure* (name, valid values, default) with a human-set *value* — the structure is not
adopter-customizable; the value is the owner's. See `adr-022-managed-operational-state-documents.md`
§ Coordination.
