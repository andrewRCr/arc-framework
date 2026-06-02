# PRD: in-flight-awareness

- **Origin:** [internal]

- **Purpose:** The awareness layer over Worktree Foundation's mechanics — an in-flight-detection **oracle**
  (remote refs + open PRs), a user-scoped **`STATUS.USER`** view and its render standard, a per-WU **`Priority`**
  field, and **materialize** (discovery-led pickup of a remote WU) — answering "what work of mine is in flight
  across worktrees and machines, and how do I pick it up here?"

---

## Introduction

Worktree Foundation makes per-WU-per-worktree isolation real, but it leaves an awareness gap: an agent in one
worktree's session structurally cannot see the operator's *other* in-flight worktrees, and nothing surfaces a WU
in flight only on another machine. The existing project view (`ROADMAP`) is project-scoped, all-owner, and
derived-at-merge — mid-WU stale; session tabs and GUIs show *sessions*, not *WUs*. The missing surface is a
**user-scoped, cross-WU, cross-machine view of in-flight work**, and the **oracle** that derives it.

The oracle is more than a view backend. It is the safety primitive behind the activation-time concurrency check
(today a degrading advisory stub) and, downstream, Concurrent Work Conventions's concurrency gate. And without
**materialize**, cross-machine resume is a teaser: the oracle can surface "WU X is in flight remotely," then drop
the operator at a raw `git worktree add`.

**Why now.** Worktree Foundation (hard upstream) has shipped, settling the mechanics this layer builds on, and
Errand Enablement / work-routing-discipline shipped the interim errand-state probe + in-flight-errand sweep this
WU's oracle absorbs. The awareness subsystem was carved out of Worktree Foundation whole (2026-05-24) precisely
so it could land as a coherent net-new layer rather than bloat WF's PRD. This WU is that layer.

**Alignment.** Serves *Operational friction down, judgment friction up* — deterministic in-flight detection is
codified so it stops costing attention, while every consumer of the oracle (activation check, materialize offer)
stays advisory. It serves the *bounded, deliberate concurrent work* carve-out of the project's single-threaded
attention premise, not the undisciplined-parallelism failure mode: the view supports a deliberate context-switch,
and the `Priority` anti-inflation discipline is documentation guidance only — ARC renders the state you consult, it
does not editorialize or nag.

## Goals

1. Ship an **in-flight oracle** — a purely-derived data primitive over remote refs + open PRs that any consumer
   (view render, activation check, downstream concurrency gate) reads, identical on every machine, with no
   annotation or sync layer of its own.
2. Establish **`STATUS.USER`** — a user-scoped, in-flight-mine rendered view — and its **render standard**
   (derivation algorithm, column/sort rules, regeneration triggers, hand-maintenance procedure), usable from ship
   and hand-maintained until roadmap-tooling automates it.
3. Introduce a per-WU **`Priority`** input field so a multi-in-flight worklist can be triaged.
4. Add **materialize** — discovery-led pickup of an existing remote WU onto this machine — as a fourth
   `arc-session` entry-point quadrant.
5. Upgrade the **activation-time concurrency check** (and Errand Enablement's `errand-launch` foreign-artifact
   gate) from degrading advisory stubs to the oracle-backed version — still advisory, never a gate.
6. Evolve the **session-probe orchestration model** in the status command into a gated-slot affordance that fires
   expensive slots only under their condition, absorbing Worktree Foundation's minimal conditional-slot seam.

## Use Cases

- **Cross-machine resume (the canonical case).** The operator finishes on machine A and switches to machine B
  where the WU is in flight on the remote but not checked out locally. Starting `arc-session` on B resolves no
  local active WU; the oracle fires, surfaces the operator's remote-only in-flight WUs, and offers to materialize
  the chosen one — `git worktree add` + `arc user pull` + orient — without a hand-rolled git incantation.
- **Multi-in-flight triage.** The operator has several WUs in flight across worktrees. `STATUS.USER` renders the
  in-flight-mine slice, priority-ordered, so the operator can see at a glance which to context-switch back to
  first — a worklist a flat all-equal list cannot provide.
- **Activation overlap awareness.** When spawning or cold-starting new work, the oracle-backed concurrency check
  surfaces any in-flight WU (identity-filtered) whose scope overlaps, so the operator can coordinate or sequence —
  advisory input to a judgment call, never a block.
- **Stale-worktree-free in-flight read.** Because the oracle derives from remote refs and ignores dead
  remote-tracking refs, a merged-and-deleted errand branch never re-surfaces as phantom in-flight, and the local
  ref namespace does not silently accumulate cruft.

## Requirements

*Requirement priority below uses this PRD's P0/P1/P2 (must / should / nice). Distinct from the per-WU `Priority`
field this WU introduces (R7), which is a P1/P2/P3 attention scale on a WU.*

### The oracle (R1–R3)

- **R1 (P0) — In-flight detection primitive.** Derive in-flight WUs from **remote refs + open PRs**, parsed by
  path/content (never branch-name → WU, since an errand `chore/<slug>` branch maps to no WU). WU metas are read off
  remote refs via `git show` with **no checkout**. The branch life-phase prefix is a free state proxy: `plan/` =
  live-mutating planning; a type-prefix = activated (plan frozen).
- **R2 (P0) — Purely derived, dead-ref-robust classification.** The oracle carries only oracle-derived state
  (in-flight WUs + State) — no annotation layer; per-WU human context stays in SESSION-NOTES, cross-WU in
  WORKING-MEMORY. It MUST classify against a **pruned ref view** — remote-tracking refs whose upstream is gone are
  ignored/pruned before derivation — so it cannot assume any cleanup step ran (errand merges complete out-of-session
  on the host). No worktree paths are stored; resolve them live from `git worktree list` for locally-checked-out
  WUs, omit for the rest.
- **R3 (P1) — Three consumers, degrading PR-source.** The oracle is consumed by the `STATUS.USER` render (R4), the
  activation-time concurrency check (R9), and (downstream) Concurrent Work Conventions's concurrency gate. The
  PR-source **degrades to refs-only** when no coordination adapter is present (mirrors Worktree Foundation's
  branch-gone cascade / coord-probe coupling).

### `STATUS.USER` view + render standard (R4–R6)

- **R4 (P0) — The view + its standard.** Establish the `STATUS.USER` view file and a strategy-doc render standard:
  derivation algorithm, hand-maintenance procedure, and regeneration triggers. `STATUS.USER` is a **filtered mode
  of the same source** as the project readiness view (today's `ROADMAP`, which roadmap-tooling later renames to
  `STATUS.PROJECT`) — not a second generator. It scopes to the in-flight-mine slice (the cross-worktree-invisible
  part); not-in-flight stays in the project view. In-flight is location/ref-based: a WU in `active/**` (≡ an
  unmerged WU branch on the remote) is in flight, so the view surfaces actively-*planned* WUs, not only executing
  ones.
- **R5 (P0) — `STATUS.USER` is gitignored-local, per-machine rendered.** The view file does **not** sync — every
  machine regenerates it identically from remote refs + PRs, so it is the optional local cache, not transported
  content. There is **no separate persisted cache**: the rendered file *is* the cache, kept fresh by ceremony-trigger
  regeneration. Opening the file never regenerates it (it is trustworthy when opened because the last relevant
  ceremony refreshed it); the network read is never on the read path.
- **R6 (P1) — Render standard: columns + sort.** Each table renders only the columns that distinguish its rows —
  **omit any column constant across that table**. Per-table column sets:
    - **In Flight** = WU · State · [Priority] · Owner · Depends-on · Cohort
    - **Ready** = WU · [Priority] · Owner · Cohort (State constant `Planning`; Depends-on constant `—`)
    - **Blocked** = WU · [Priority] · Owner · Depends-on · Cohort (State constant; Depends-on = the blocking dep)
    - **`STATUS.USER`** (In-Flight-mine only) = WU · State · [Priority] · Depends-on · Cohort (Owner constant `= me`)

  `[Priority]` is itself conditional — rendered only when the field is present. **Sort key (uniform):**
  `(priority, cohort, wu-name)`; Blocked additionally grouped by dependency-depth band (shallowest first). Absent
  priority resolves to `P3`, so the key reduces to today's `(cohort, wu-name)` pre-priority; WU-name is the
  total-order tiebreak, so renders are byte-identical for identical inputs (no spurious regen diffs). `STATUS.USER`
  shares the project In-Flight sort (filtered, not re-sorted). Tables are exempt from line-length lint
  (`MD013.tables: false`).

### The `Priority` field (R7)

- **R7 (P1) — Per-WU `Priority` input field.** Introduce `**Priority:**` — a hand-set input field (like `Owner` /
  `Depends On`), three bounded levels, `P3` default: **P1** top focus (context-switch back first) / **P2** elevated
  / **P3** baseline (unset = `P3`). Owner-set, mutable, conflict-free under worktrees — a per-WU *field*, never a
  hand-curated ordering *doc* (per ADR-020, no mutated shared-state ordering). `P0` is deliberately **not** a level
  (its emergency/stop-the-world connotation collides with incident-severity culture and misfits a standing
  attention scale). Durability is the **tracked field + git history** — no in-file change-log array (redundant with
  git, per ADR-020). Anti-inflation discipline (a soft cap on concurrent P1s) is **documentation guidance only** —
  never an agent-surfaced nag or render-time signal. Adds `**Priority:**` to `template-meta.md` (schema authority)
  and to `strategy-work-organization.md` § Source of truth.

### Materialize (R8)

- **R8 (P0) — Materialize an existing remote WU.** Add the fourth entry-point quadrant — a WU that exists (branch +
  committed meta on the remote, SESSION-NOTES in the notes ref) but is not checked out here — as an `arc-session`
  dispatch branch. **Discovery-led, no direct-by-name surface:** when no local active WU resolves and the oracle
  surfaces remote-only in-flight WUs the operator owns, `arc-session` offers to materialize the chosen one. The
  candidate list *is* the correctness mechanism (you select a real in-flight WU, so a phantom/typo'd name is
  impossible); a `--materialize <name>` flag is consciously deferred. Mechanism is thin orchestration over existing
  pieces: `git worktree add <templated-path> origin/<branch>` → `arc user pull` → orient. Git refuses
  double-checkout, so an already-materialized branch points at the existing worktree (free safety).

### Concurrency check + orchestration (R9–R10)

- **R9 (P1) — Oracle-backed activation-time concurrency check.** Upgrade Worktree Foundation's degrading advisory
  stub **and** Errand Enablement's `errand-launch` foreign-artifact gate to the oracle-backed version
  (identity-filtered refs + PRs), consumed from spawn / cold-start / materialize / errand-launch. Still advisory,
  judgment-based, **never a gate** (the gate doctrine is Concurrent Work Conventions's). The oracle's
  in-flight-errand detection (chore branches, no meta) absorbs work-routing-discipline's interim errand-state probe
  and sweep.
- **R10 (P2) — Session-probe orchestration model.** Evolve the status orchestrator (`commands/status/run.ts`) into
  a **gated-slot affordance**: cheap always-on slots fire on the common resume path; expensive slots (the oracle's
  network slice) fire only under their condition. **De-duplicate** the per-entry-point slot lists (user / worktree /
  dirty / active / releaseRouting are hand-re-declared across the three composites). Preserve the `safeProbe`
  "envelope never rejects" contract and per-slot result shape — this evolves the *firing* discipline, not the slot
  contract. Bounded: earn generality from the two real instances (WF's roster slot + this WU's oracle slot), no
  pre-building.

## Non-Goals

- **Render automation.** roadmap-tooling automates the `STATUS.*` render later; this WU ships the oracle, the
  hand-maintained view, and the strategy-doc standard.
- **The concurrency *gate doctrine*.** Concurrent Work Conventions owns when/how the oracle gates foreign-artifact
  edits; this WU ships the oracle the gate consumes, advisory-only.
- **Worktree mechanics** (spawn / cold-start / session-init plumbing / cross-WU sync) — Worktree Foundation (hard
  upstream).
- **Cross-machine partial-push trust.** The guarantee that what materialize picks up is *complete* (the
  partial-push trust signal) stays with cross-machine-sync-coherence (downstream); this WU ships the pickup
  mechanism, not the completeness guarantee.
- **A direct-by-name materialize flag** (`--materialize <name>`) — deferred; reintroduces the rely-on-memory failure
  the oracle exists to remove. Purely additive later.
- **`arc sync` directionality** — its publish-only-vs-bidirectional question is captured separately
  (USER-INBOX → cross-machine-coherence / naming-conventions); out of scope here.

## Technical Considerations

### Oracle gating + regeneration (the latency budget)

The governing principle: the common path (resume an existing local WU) must not get slower.

- **The oracle's network slice is gated.** It fires **only when `active.resolution === "none"`** in the session-init
  probe, so the resume path pays zero oracle cost. This is safe because the *other* freshness concern on the resume
  path — "is my local worktree behind origin?" — is already covered by the worktree-sync probe channel (`remote-ahead`
  → pull prompt), independent of the oracle. The gate removes only the oracle, not worktree-freshness detection.
- **`STATUS.USER` regenerates at ceremonies (ROADMAP's model), with the network slice gated.** The **local slice**
  (your WUs in flight on this machine, via the identity-filtered roster cascade) regenerates cheaply at every local
  ceremony (spawn / activate / integrate / shift / handoff). The **cross-machine slice** (WUs in flight only
  elsewhere) needs the oracle's network round-trip and so fires only at a subset of triggers where cross-machine
  truth matters: **handoff, explicit `arc sync`, explicit view request, and the no-local-WU init branch** — not
  every local ceremony or every session-init.
- **Measured cost (47 remote refs, good connection):** `git ls-remote` ≈ 0.45s, `gh pr list` ≈ 0.38s (≈ 0.85s
  combined network), local derivation/render ≈ tens of ms. The median is modest; the tail (offline, slow link,
  host rate-limit) is the real risk. Therefore each network read MUST be **bounded by a short timeout and degrade to
  the last-rendered file** on miss/offline (mirrors the PR-source → refs-only degrade). With bounded non-blocking
  reads, trigger count is low-stakes.

### "Explicit view request" mechanics

The explicit-view trigger is the human-facing `arc status` invocation (this WU adds a user-scoped filter,
e.g. `arc status --user`), routed through `runStatus` — **not** the `--session-init` probe, so the
`active.resolution` gating does not apply (an explicit view means "fresh now"). It is an **active re-render
request**, not a passive file-open: it refreshes the local slice always and the cross-machine slice via the bounded
network read, **writes `STATUS.USER` to disk, then prints it** (write-then-print preserves the single-cache
invariant — every explicit view refreshes the cache). An optional `--local` / `--no-fetch` flag skips the network
read for a fast offline view. Opening the file in an editor stays the passive path: instant, no regen, as fresh as
the last trigger.

### Dead-ref reconciliation — detect *and* reconcile

The interim sweep classifies merged errand branches as `merged-cleanup` but never acts; because reviewed-lane
errand PRs merge asynchronously on the host (auto-delete-head removes the remote branch out-of-session),
`run-errand` § Complete never fires for that errand and the local remote-tracking ref lingers until a
`git fetch --prune`. Two complementary mechanisms, distinct failure surfaces:

- **(A) Correctness — primary, mandatory (R2).** The oracle classifies against a pruned ref view, so it never
  miscounts regardless of on-disk cruft. Non-negotiable; the oracle cannot assume cleanup ran.
- **(B) Hygiene — backstop.** An actual prune at the two natural sites: `run-errand` § Complete (targeted —
  the in-session merge knows the slug) and the session-init errand sweep (a broad `git fetch --prune` backstop for
  the async-merge case). Keeps the local ref namespace clean and makes the *interim* sweep correct before the oracle
  ships. (A) without (B) leaves cruft accumulating; (B) without (A) is racy. Both.

### Session-probe orchestration seam (R10)

The oracle's network slice is the **second** conditional-expensive slot added to a session-init orchestrator whose
three entry points (`runStatus` / `runSessionInitStatus` / `runSessionHandoffStatus`) today fan out every slot
eagerly through one `Promise.all`. Worktree Foundation added the first (the branch-gone / no-WU roster) as a
deliberately minimal two-phase seam written to be absorbed here. **Coordinate with CLI Substrate Adoption** on the
same file — CSA converts the slot wrapper `Probe<T>` → `Result<T, E>` and zod-validates the envelope; the two edits
are orthogonal (slot-result *type* vs. slot-*firing* discipline) but co-located — sequence or reconcile manually
(vanilla-git discipline until Concurrent Work Conventions lands).

### Architecture fit

The oracle is a `src/lib/` pure-logic primitive (refs/PR parsers, injectable Git/host deps) consumed by command
handlers — standard three-layer flow per TECHNICAL-OVERVIEW § 2. It reads Git (primary runtime dep, § 3); the
hand-rolled refs/PR parsers become CLI Substrate Adoption's zod/execa migration targets later. No new framework or
hard dependency: the PR-source's `gh` use is optional and degrades to refs-only (the `gh` adapter is coord-probe's
deliverable).

## Design Considerations

- **Materialize stays internal vocabulary** — the user surface is `arc-session`'s discovery offer, not a named verb.
- **Entry-point 2×2** (local worktree exists? × WU exists?) is the shared cohort contract in
  `cohort-agile-parallelism.md`; Worktree Foundation implements resume / cold-start / spawn, this WU implements
  the materialize quadrant.

## Coordination

This WU is **deliberately insulated** from the cross-machine notes-sync coherence gap: the oracle and `STATUS.USER`
derive from remote refs + PRs, never from synced notes, so partial-push coherence does **not** gate them — every
machine regenerates identically. In-flight-awareness does not wait on cross-machine-sync-coherence. Adjacencies to
record, not depend on:

- **cross-machine-sync-coherence (downstream).** Owns the partial-push *trust* signal that hardens materialize's
  `arc user pull` step into a completeness guarantee. ADR-022's notes-synced managed operational-state classification
  depends on that transport hardening; `STATUS.USER` sidesteps it by being gitignored-local/ref-derived (R5).
- **coord-probe (downstream, loose).** Ships the `coord-probe` method + `arc coord probe` adapter (in-git default,
  `gh` adapter) — the richer PR/where-am-I signal source the oracle's PR-source can consume. The oracle MUST degrade
  to refs-only without it (R3). Both are advisory, read-side, probe-and-stop, and co-inhabit the session-init
  discovery surface; the R10 gated-slot affordance should compose with coord-probe's future adapter-probe slot
  (a known third instance — do not design a two-only affordance), without pre-building for it.
- **roadmap-tooling (downstream).** Automates the `STATUS.*` render this WU hand-maintains and standardizes; renames
  `ROADMAP` → `STATUS.PROJECT`.
- **CLI Substrate Adoption (parallel sibling).** Co-located edits on `commands/status/run.ts` and the oracle's
  parsers (see Technical Considerations).

### ADR-022 — managed operational-state documents

`STATUS.USER` is a *derived* managed operational-state document (gitignored-local, per-machine rendered — R5). The
`**Priority:**` field is schema-owned *structure* (name, valid values, `P3` default — not adopter-customizable) with
a human-set *value* (the owner's). See `adr-022-managed-operational-state-documents.md` § Coordination.

## Success Criteria

Validated explicitly at work-unit completion:

1. **Oracle derives correctly and is dead-ref-robust.** Given remote refs + open PRs, the oracle returns the
   identity's in-flight WUs with State, reading metas via `git show` with no checkout; a merged-and-deleted errand
   branch does **not** appear as in-flight (classification runs against a pruned ref view).
2. **Resume path pays zero oracle cost.** With an active local WU resolved, session-init fires no oracle network
   read; the network slice fires only on the four named triggers, each bounded by a timeout and degrading to the
   last-rendered file when the remote is unreachable.
3. **`STATUS.USER` renders to standard and is byte-stable.** The view renders the in-flight-mine slice with the
   per-table column sets and uniform sort key; identical inputs produce byte-identical output (no spurious regen
   diffs). The explicit-view command writes-then-prints; opening the file does not regenerate it.
4. **`Priority` field is live and conflict-free.** `**Priority:**` is in `template-meta.md` and
   `strategy-work-organization.md`, defaults to `P3`, and drives the render sort; setting it is a per-WU tracked
   edit with no shared-ordering doc.
5. **Materialize completes a cross-machine pickup.** From a session with no local active WU, the oracle surfaces a
   remote-only owned WU and `arc-session` materializes the selected one (`git worktree add` → `arc user pull` →
   orient); an already-materialized branch points at the existing worktree rather than erroring.
6. **Activation concurrency check is oracle-backed and advisory.** Spawn / cold-start / materialize / errand-launch
   consult the oracle-backed check; it surfaces overlap as advisory input and never blocks.
7. **Orchestration seam gates expensive slots.** The status orchestrator fires the oracle slot only under its
   condition, de-duplicates the per-entry-point slot lists, and preserves the `safeProbe` envelope contract.

## Open Questions

### Resolve during work

- **Oracle network-slice trigger subset — confirmed lean, pin in implementation.** The four named (handoff /
  explicit `arc sync` / explicit view request / no-local-WU init) are the settled set; confirm no fifth trigger is
  needed as the slots are wired.
- **Templated worktree path for materialize.** Reuse Worktree Foundation's location template; confirm the exact
  path shape and collision handling when wiring `git worktree add`.
- **`STATUS.USER` regeneration trigger wiring.** The local-slice ceremonies (spawn / activate / integrate / shift /
  handoff) vs cross-machine-slice subset — confirm each fire-site as the ceremonies are touched.

### Resolve before depending downstream

- **coord-probe adapter contract.** The oracle's PR-source degradation boundary is settled (refs-only without an
  adapter); the concrete adapter interface firms up when coord-probe lands — keep the PR-source behind a seam.
