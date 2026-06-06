# Draft: Concurrent Work Conventions

**Purpose:** Close the agile-parallelism cohort by shipping **both halves** of principled multi-WU
work: the conventions layer — `strategy-concurrent-work.md` as the canonical home for activation-time
concurrency-check guidance, parallelism decision rubrics, rebase / merge discipline for concurrent WUs,
worktree operational guidance, async-merge accommodation, and main-worktree-under-full-protection
framing — **and** the merge-safety + lifecycle mechanism that makes those conventions real (behind-base
detector, write-context extensions, in-flight completion sweep, suspend/resume seam, merge-gate
awareness). Builds on `draft-worktree-foundation.md` (mechanism), Errand Enablement, and In-Flight
Awareness — all shipped — to deliver "agile, principled, multi-WU work." The design target is **any team
size**; solo is the degenerate case.

- **State:** Parked (terminal planning) — design-settled; delivery deferred pending Agile WU Lifecycle's
  scaling / decomposition support (see § Delivery plan & parked status). Structural calls resolved at the
  2026-06-03 sweeps (split-vs-fold → **fold**; decompose into a four-WU stack; rename dissolved by decomposition).
  Earlier: renamed from former Work-Unit Mobility WU as part
  of the agile/mobility split (mechanism → Worktree Foundation; tier model → Agile WU Lifecycle;
  conventions → this WU). Iteration expected before PRD promotion. Updated 2026-05-08:
  redesigned around external-research-informed lighter shape — focus-role field model rejected;
  conventions land as judgment-based protocols + strategy-doc guidance, not as new meta-file
  fields. See `research-focus-wip-attention-discipline.md`,
  `research-active-work-coordination-vocabulary.md`, `research-concurrent-work-mechanism-layer.md`,
  and `research-integration-conflict-handling.md` for the research underpinning the redesign.

- **Created:** 2026-04-17 (originally as Work-Unit Mobility); split and renamed 2026-04-28; redesign
  2026-05-08.

- **Origin:** Surfaced during a pre-PRD exploratory session on the Session-Init Optimization
  planning branch as the conventions layer of mobility. Carved out from the original Work-Unit
  Mobility plan during the agile/mobility design discussion when three-layer scope (mechanism +
  conventions + agile lifecycle) proved too large for one WU. Mechanism extracted to
  `draft-worktree-foundation.md`; agile-lifecycle scope newly identified and split to
  `draft-agile-wu-lifecycle.md`; this WU retains the conventions layer.

  **2026-05-08 redesign.** During Interlock Release Wrappers WU1 the parallelization-safety gap
  was surfaced — none of the trio plans modeled "is this WU safe to parallelize against in-flight
  WUs?" The first-attempt focus-role model (`primary | companion | awaiting-external | parked`)
  was investigated against industry idiom via three external-research passes plus a fourth on
  integration-conflict handling. Findings: zero PM-tool precedent for focus-role-as-field;
  touched-files / scope-overlap probes are not idiomatic and brittle in practice; conflict
  prediction tools exist but adoption is limited. Reframe: rely on agent judgment at activation,
  soft conventions in the strategy doc, and operational guidance for handling conflicts at
  integration. No new meta-file field, no overlap probe, no formal primacy model.

## Delivery plan & parked status (2026-06-03)

> **Parked at terminal planning.** The draft below is design-settled; what remains is *delivery*, which is
> deliberately deferred pending Agile WU Lifecycle (see "Why parked"). Re-enter here.

**Decomposition — a cohort of four single-owner WUs (shape B).** CWC closes the agile-parallelism cohort but
is too large for one WU/PR. It decomposes into four sibling WUs along natural deliverable boundaries (not
arbitrary `-pt1/-pt2` splits), delivered as a dependency-ordered stack — each one branch + one PR, honoring
the single-owner-WU decision. Each WU carries its own thin spec; cross-WU coordination lives in
`cohort-agile-parallelism.md`, not a shared spec (specs feed a task list and validate completion — they are
not coordination docs).

| WU | Deliverable | Character |
| --- | --- | --- |
| **D1 — Concurrent-work doctrine** | `strategy-concurrent-work.md`: overlap-judgment rubric (both trigger surfaces), parallelize-vs-serialize, worktree ops, async-merge guidance, anti-patterns, main-worktree convention. Consolidates the 4 research files. | New strategy doc; the spine the others reference |
| **D2 — Merge-safety mechanism** | behind-base detector (ref-param `origin/<base>` primitive + probe slot) + write-context extensions + pre-commit backstop + merge-commit exemption | TS + hooks |
| **D3 — Async-merge lifecycle** | resume-integration seam + in-flight completion sweep + merge-gate / unattended-merge completion trigger; folds the loose plumbing (`arc start` create-new wiring, subdir-removal primitive, cohort discovery) | Workflows + session-init probe |
| **D4 — Single-owner WU model** | rewrite `strategy-team-coordination` + DEV-RULES.ARC § Task interlock + meta `Owner` semantics; remove `(@name)` + the within-WU multi-dev apparatus | Cross-cutting doc rewrite |

Sequence: **D1 (spine) → D2 / D3 / D4** — largely independent; D2's behind-base primitive is reused by D3's
completion sweep and referenced by D1's doctrine, so D2 ideally precedes D3 (soft, not hard). D3 watch: may
itself split if it proves too large for one PR.

**Why parked — the AWL prerequisite (delivery-ergonomics, not runtime).** CWC *can be built* without Agile WU
Lifecycle — the earlier CWC→AWL edge-drop was correct on *runtime* grounds (the parallelism mechanism needs
none of the tier model). But delivering CWC *as four small WUs* needs a small-WU pipeline, and ARC's
`1_create-spec` / `2_generate-tasks` are built for large, multi-phase WUs (`generate-tasks` is an
unconditional 3-pass + per-phase-audit procedure assuming 3–7 phases; there is no flat / small path). Scaling
that pipeline — a spec template family + a fewer-phases task grammar + an **actionable decomposition
procedure** — is AWL's chartered deliverable (post-tier-ditch, AWL's center of gravity *is* WU
scaling-and-division). So CWC parks at terminal planning and **re-enters as the four-WU stack once AWL lands
its scaling / decomposition support.** Forcing the decomposition through today's heavy pipeline would eat
disproportionate ceremony 4× and worsen, by example, the very "ARC WUs are too large" problem AWL exists to
fix.

**CWC is a design input to AWL.** This settled-but-parked draft + its concrete four-WU decomposition is a
worked requirements example for AWL's decomposition-procedure design — routed as a coordination note to
`draft-agile-wu-lifecycle.md`. AWL owns the **actionable decomposition procedure** (sizing triggers,
boundary-finding, stack-vs-cohort); `arc-plan-conductor` — far downstream — only *routes to / invokes* it as
one shape it conducts, and does not own it (correcting an earlier mis-allocation: the decomposition procedure
cannot sit behind conductor, or CWC's re-entry would be blocked on it).

**Rename — dissolved by decomposition.** "Conventions undersells conventions+mechanism" was a one-WU artifact.
Decomposed, D1 legitimately keeps a "concurrent-work" name, the mechanism WUs get their own honest names, and
the `agile-parallelism` cohort already carries the closing-the-whole-thing identity. No umbrella rename needed.

---

## Problem / Motivation

`draft-worktree-foundation.md` shipped the mechanism for parallel work — worktrees, session-init
worktree-awareness, branch-gone detection — and Errand Enablement + In-Flight Awareness shipped the
isolation and activation-check substrate. The tier model lives in the agile cohort. But that mechanism
alone leaves the **patterns of multi-WU usage** — and the merge-safety + lifecycle plumbing that keeps
them safe — unaddressed:

- When are concurrent WUs appropriate vs counterproductive?
- How does an agent assess whether a new WU is safe to parallelize against in-flight WUs?
- What rebase / merge discipline keeps concurrent branches integrable without late-stage drama?
- How do shipped-but-awaiting-review WUs compose with active in-flight WUs?
- What conventions distinguish "principled concurrent work" from "fragmented attention with
  predictable quality degradation"?
- How does the awaiting-review state compose with session-handoff, archival, and worktree cleanup
  workflows that currently assume synchronous merge?
- When `main` moves under an in-flight branch, what surfaces the drift and what discipline reconciles it?

Without conventions, mechanism encourages chaos. CWC closes the agile-parallelism cohort by shipping
**both halves**: the conventions layer (`strategy-concurrent-work.md`) **and** the merge-safety /
lifecycle mechanism that makes concurrent work safe in practice. It codifies what teams already do
implicitly when concurrent work goes well, with judgment-driven protocols that honor ARC's
attention-discipline principles. The **design target is any team size** — solo is the degenerate case,
never the target (AGENT-BRIEF.PROJECT: team-size-agnostic, not solo-targeted).

### Parallel WU support is conventions-bound, not just mechanism-bound

`strategy-team-coordination.md` L276-281 documents that parallel work units on
independent branches are structurally supported:

> Parallel work units on independent branches... The work units don't coordinate at all at the
> meta-file layer: different files, different branches, different task lists.
> **This is the dominant pattern for parallel solo work on independent concerns.**

The phrase "parallel solo work" is doing heavy lifting. With Worktree Foundation shipped, the
mechanism exists. But there is no:

- Guidance for when same-dev parallel WUs make sense
- Activation-time protocol for assessing scope overlap with in-flight WUs
- Rebase / merge discipline guidance for concurrent branches
- Strategy doc addressing solo concurrent work (team-coord assumes different identities)

ARC has the mechanics but not the model. This WU elevates the capability to first-class:
intentional conventions, documented patterns, judgment-based protocols that honor ARC's
attention-discipline principles while recognizing that developers pivot between WUs in practice.

### Why this matters beyond personal ergonomics

Concurrent agent sessions, worktree-based pivots, and long-running work-in-flight are realistic
patterns in modern dev practice. An adopter evaluating ARC against its current state sees a
framework that implicitly assumes linear single-WU progression. Shipping first-class conventions:

- Matches how developers actually work
- Makes the "awaiting review" scenario (days to a week of latency) a supported pattern rather than
  an awkward gap
- Extends ARC's attention-discipline principles into the multi-WU regime with guardrails, instead
  of ceding the ground entirely

### ARC's concurrency model — parallel sessions, not in-session juggling

Per `plan-session-operational-flow.md` § Concurrency Model: ARC's concurrency model is
**parallel sessions, one WU per session, with shift as the in-session escape hatch for short
detours.** Multi-WU work means multiple sessions, each scoped to one WU/worktree/branch with
isolated SESSION-NOTES; sessions don't interact internally except at boundaries (spawning new WUs,
sweep ceremonies, planning).

This framing has direct implications for conventions in this WU:

- "Developers pivot between WUs" means alt-tab between separate sessions, not in-session WU
  switching. The in-session worktree pivot (Worktree Foundation's surviving "shift") remains
  available for the niche short-detour case but is not the dominant pattern.
- Single-active-focus is implicit in worktree presence — the worktree the agent is currently in
  is the active focus. No field needed.
- Transitions between active worktrees happen at review-increment boundaries (the same task-
  interlock invariance ADR-016 establishes for in-WU work).

### Why no formal focus-role model

The plan's earlier shape proposed a `**Focus Role:**` meta-file field with values
`primary | companion | awaiting-external | parked`, blessed pairings, swap discipline, and per-WU
tenure tracking. External research (2026-05-08) found no PM-tool precedent for this shape — every
tool surveyed (Linear, Jira, GitHub Projects, Shortcut, Notion, Asana, Trello, Height) models
active work via Status enum + Assignee, not role annotation. The 2026-05-12 worktree-tool
convergence pass reinforces from a second direction: no agent-workspace tool (Conductor, emdash,
Maestro, Warp, Worktrunk, Zed, Super, Superset, T3code, Soloterm, Nora) models focus role either
— concurrency UI is purely a workspace listing, not a discipline annotation. The underlying
*concepts* (single-thread attention, single-active-focus, awaiting-review as a distinct state)
are evidence-aligned across Kanban, Deep Work, GTD literature — but expressing them as a
separate field invents net-new vocabulary adopters won't recognize.

ARC adopts the lighter posture: rely on agent judgment + protocols, not field-encoded roles.

- **"Primary"** maps to the existing implicit signal: which worktree is the agent currently in?
  That's the active focus. No field needed.
- **"Awaiting-external"** maps to `**State:** Integrating` — WOR's 4-state machine, where
  "awaiting PR review" *is* the `Integrating` phase (merge-position folded into State; no separate
  `**Integration:**` field). No new enum value needed.
- **"Companion"** conflated runtime focus with backlog grouping. The grouping concern is already
  covered by `plan-work-organization-reform.md`'s group-dir convention plus the existing
  `**Sibling Work Unit(s):**` meta field. No runtime equivalent needed.
- **"Parked"** maps to GTD's Someday/Maybe — soft convention guidance in the strategy doc, not
  field-encoded.

The anti-pattern intuitions (single-thread attention, same-domain concurrents) survive as soft
guidance in `strategy-concurrent-work.md`, framed as conventions adopters apply by judgment, not
field validations a tool enforces.

---

## Relationship to Interlock Model Frame

ADR-016 establishes configurable autonomy interlocks for session-operational flow, with
`plan-session-operational-flow.md` implementing the core mechanics. This WU consumes the
frame as an enabler — configurable autonomy modes reduce approval ceremony under multi-session
load, which is exactly the ergonomic gap multi-worktree introduces.

**Touchpoint:** With configurable autonomy in place, modest concurrency (2-3 sessions) becomes
principled rather than tolerated — per-task approval ceremony reduces via auto-commit / auto-push
toggles, making the bandwidth cost tractable. PRD should resolve whether the strategy doc presents
the posture as "tolerated" or "principled at modest scale."

---

## Scope

### In scope

1. **`strategy-concurrent-work.md` (new strategy doc).** Sibling to
   `strategy-team-coordination.md`, not extending it. Same-identity concurrency is
   structurally different from multi-developer coordination. Coverage:

    - **Worktree-by-default rationale and trade-offs.** Why ARC departs from solo-developer norm
      (multi-agent isolation as primary justification, frictionless parallelism later); discovery
      and cleanup discipline; risks (worktree accumulation, "which worktree am I in" confusion).

    - **When to parallelize vs serialize.** Decision rubric — independent WUs (disjoint files /
      modules) → parallel-merge OK; high-overlap WUs (shared module, semantically related code)
      → serialize; `Novel` WUs (the higher derivation threshold) count as plate-dominating work even when file
      overlap is low, so the rubric treats "one novel stream + ordinary heavy/light work" differently from two
      concurrent novel streams. Concrete examples per `research-integration-conflict-handling.md` plus the
      `Class` model's worklist-balance rule.

    - **Activation-time concurrency check — doctrine over the shipped check.** In-Flight Awareness
      already ships the *mechanism*: an oracle-backed activation check consulted at spawn / cold-start
      / materialize / errand-launch (advisory, never blocks). CWC adds **doctrine, not tooling** — the
      unified advisory overlap-judgment rubric (see § Design Decisions § Start-side concurrency check)
      plus thin pointers at those already-built fire-sites so the agent consults it. The rubric:
      disjoint domain → proceed; shared module / strategy / load-bearing infra → flag + consider
      sequencing; foreign-owned overlap → coordinate — with worked examples and the **self/foreign
      asymmetry** (single-owner WUs make this the entire "all-owner" addition: self-overlap reorder
      freely, foreign-overlap coordinate). Explicitly a heads-up — the behind-base detector is the real
      net. **One doctrine, two trigger surfaces** (WU-activation and `errand-launch`); the Errand floor
      is Errand Enablement's advisory foreign-artifact gate, which the all-owner gate doctrine extends to
      entry-level writes, not just file-level. No overlap-probe tooling — the research rejects automated
      overlap prediction (O(n²), false-positive-prone, non-idiomatic), not soft rubrics.

    - **Branch and rebase discipline.** Periodic-rebase-onto-main vs end-of-flight rebase
      trade-off (lifetime threshold around 2 days per industry research); rerere setup for
      periodic-rebase teams; "Update branch" workflows; merge vs rebase choice with consequences
      for review.

    - **Merge ordering between concurrent WUs.** First-in-wins vs explicit serialization;
      PR-label conventions for "merge after #X"; merge-queue interaction (Mergify, GitHub merge
      queue).

    - **Worktree operational guidance.** Performing merges from main (or dedicated merge)
      worktree; refetching / rebasing other worktrees post-merge; using `git worktree remove`
      instead of `rm -rf`; stale-reference recovery; cross-worktree state after rebase;
      sync-all-worktrees recommendation. **Tool composition:** when an external worktree-
      management tool spawns worktrees (Conductor, emdash, Maestro, Warp, Worktrunk, Zed, etc.),
      the tool typically owns cleanup, branch naming, and location conventions per its own UX.
      Coexistence guidance: honor the tool's branch naming (advisory under ARC's branch-naming
      method per `draft-worktree-foundation.md` item 10); defer cleanup to the tool when it
      provides it; do not relocate tool-managed worktrees. ARC's structural discipline (meta-*
      lifecycle, state machine, sweep-as-you-go integration) applies uniformly regardless of
      who spawned the worktree.

    - **When to abandon parallelism.** Heuristics: conflict-resolution time exceeding ~30% of
      parallelism savings; rebase count exceeding ~3 due to upstream churn; semantic drift
      between branches. Recovery action: merge one branch, abandon the other, redo as unified
      WU.

    - **Async-merge guidance.** Managing WUs through awaiting-review latency (days to a week);
      how `**State:** Integrating` (WOR's state for "PR open, awaiting merge") interacts with
      session-handoff, archival, and worktree cleanup; soft conventions for the post-PR-pre-merge
      state.

    - **Soft anti-pattern guidance.** Single-thread attention (only one active focus at a time);
      avoiding same-domain concurrents (informed by attention-residue research); review-
      increment-boundary discipline for transitioning between WUs. **Explicit calibration
      against agentic worktree-tool idiom:** the surveyed tool ecosystem (Conductor, emdash,
      Maestro, Warp, Worktrunk, Zed, Super, Superset, T3code, Soloterm, Nora) optimizes for
      many simultaneous sessions, fast spawn, less per-WU review — the opposite posture from
      ARC's. Adopters composing ARC with such a tool hold two postures in tension by design;
      strategy-doc guidance surfaces this so adopters consciously pick which frame dominates
      per session rather than letting the disciplines conflict silently. Framed as judgment
      guidance, not enforced rules; phrasing TBD at PRD. See § Pressure Points "Tool-ecosystem
      composition friction."

    - **Main-worktree-under-full-protection convention.** "Your main worktree is not always on
      main" framing — under `branch.protection: full`, main worktree specializes for admin /
      coordination work (planning branches, archive branches, cross-WU backlog edits) while WU
      worktrees handle feature work.

    - **Relationship to team mode.** Concurrent-work conventions and team mode are orthogonal;
      both can coexist; neither requires the other.

2. **Integration-surface async-merge audit.** `integrate-work-unit.md` and related
   lifecycle workflows currently assume synchronous merge (PR created → merged → cleanup in one
   flow). With async-merge as a legitimate pattern (post-PR + awaiting-review-latency), workflows
   need accommodation — handoff transitions, meta-file updates, worktree cleanup advisory,
   archival ordering — for the awaiting-review state. Audit sync-merge assumptions; adjust
   touchpoints additively (option B per Design Decisions). Includes detailed guidance in
   `strategy-concurrent-work.md` § Async-merge guidance.

3. **Awaiting-review state semantics.** Confirm WOR's `**State:** Integrating` cleanly expresses the
   awaiting-external state (PR open, awaiting merge) across handoff, archival, and worktree-cleanup
   workflows — merge-position is folded into State, so no separate `**Integration:**` field or new
   enum value is needed. Coordinate with `draft-agile-wu-lifecycle.md`'s state-machine rollout.

**Errand-model re-pivot (`work-routing-discipline`, 2026-05-31):** errands are now execution-only `chore/<slug>`
branches (full) / direct base commits (partial) via `run-errand`, not queued artifacts — so concurrent errands
are mini-PRs that ride the same rebase / merge and async-merge discipline this WU codifies. Their integration
ordering and in-flight coordination are CWC territory; fold errand (`chore/`) branches into the concurrency
rubrics when next iterated.

**Drain-mechanism correction (`work-routing-discipline`, 2026-06-01):** `run-errand` and the `drain-inbox`
execution transition both defer post-merge cleanup — errand branch/worktree teardown and removal of the
slug-matched `USER-INBOX` line — to the errand's *merge*. On the auto-merge lane that merge is *unattended*, so
no workflow step fires the cleanup; session-init's in-flight-errand sweep backstops it for now. CWC's
merge-gate-awareness owns the unattended-merge **completion trigger** (who runs teardown + line-removal when no
one attends the merge) — reconcile `run-errand`'s Complete phase and the drain's close when next iterated. This
is the `run-errand` / `drain-inbox` facet of the broader "make the lifecycle workflows merge-gate-aware" concern
(`integrate-work-unit` is the sibling case).

### Out of scope

- **Focus-role field model** — explicitly rejected per § Why no formal focus-role model. Strategy
  doc covers anti-pattern intuitions as soft guidance only.
- **Touched-files / scope-overlap probe** — explicitly rejected. Activation-time concurrency check
  is judgment-based, not probe-based.
- **Worktree mechanism, shift lifecycle, session-init worktree detection, branch-gone detection,
  inbox sync** — `draft-worktree-foundation.md`.
- **Tier model, `arc start` `--tier` flag + tier semantics, ceremony scaling, atomic-companion retirement,
  incidental category retirement** — `draft-agile-wu-lifecycle.md`. (The `arc start` create-new **worktree-spawning
  wiring** is *in scope here* — mechanism, folded 2026-06-03; only the tier grammar stays AWL.)
- **External tracker integration for "what's @teammate working on"** — `draft-coord-probe.md`.
- **Group-dir convention for sibling WUs** — `plan-work-organization-reform.md`. The existing
  `**Sibling Work Unit(s):**` meta field plus group-dir convention from WOR cover the
  "sibling / companion" relational concept; no runtime equivalent needed.
- **ROADMAP form-factor evolution (parallel/multi-stream visualization, sequencing-artifact
  brittleness, horizon tiers)** — superseded: WOR reworked the ROADMAP into the derived readiness
  view; the renderer / CLI lives in the `roadmap-tooling` WU. (The pre-WOR `roadmap-evolution` WU was
  retired.)
- **Blessing concurrent agent sessions.** Framework won't block two simultaneous agent sessions in
  different worktrees, but documentation is explicit: this potentially violates P2 (co-development
  bandwidth). Adopter's call, not ARC's recommendation.
- **Automated mode-fit detection.** Framework doesn't assess whether a project is "outgrowing"
  single-active discipline. Runtime detection rejected per arc-modes principle.
- **Cross-dev worktree coordination.** Team-mode territory.
- **Cross-machine sync-state coherence** (local base-ref staleness, partial-push trust, notes-ref coherence) —
  `cross-machine-sync-coherence` (the explicit next WU). CWC ships the ref-parameterized base-distance primitive +
  probe slot it extends; the cross-machine layer itself is not CWC's.
- **WU/PR right-sizing + decomposition protocol** (plan-grouping vs. delivery-grouping; small-PR review
  norms; stack-vs-cohort; sizing triggers) — the **actionable procedure is Agile WU Lifecycle's** (WU
  scaling-and-division is its charter, esp. post-tier-ditch); `arc-plan-conductor` only *routes to / invokes*
  it as one shape it conducts. CWC is the motivating live example, not the home. (Supersedes the earlier
  routing to conductor — re-route the `USER-INBOX § Backlog` capture to AWL accordingly.)
- **Decomposition** (team-ownership motivation + lifecycle-timing axis) — the actionable splitting procedure
  is **AWL's** (per above); conductor routes to it. Planning-lifecycle, not concurrency conventions.
- **Collaborative team planning** (single-author-draft + review model) — routed to
  `strategy-team-coordination` + a conductor seam (partly subsumes conductor OQ23). Carries a
  "planning-machinery cohort" organizing flag.
- **Hooks at shift transitions.** Hook symmetry deferred to a later hooks-completeness pass.

---

## Design Decisions

### Fold, not split — one WU ships the cohort complete

Split-vs-fold resolved to **fold**: a single WU ships the agile-parallelism cohort **complete** —
conventions **and** mechanism. "Convention vs. mechanism" character is no longer a splitting axis;
**cohort-closeout** is the boundary. CWC = "what closes the agile-parallelism cohort" = the conventions
doc **plus** the merge-safety cluster landing somewhere (per `cohort-agile-parallelism.md` § Cohort
status & closeout). The mechanism buildables fold in — write-context extensions, behind-base detector,
merge-commit exemption, in-flight completion sweep, merge-gate awareness, `arc start` create-new wiring,
subdir-removal primitive. Cross-machine concerns stay **out** (the explicit next WU,
`cross-machine-sync-coherence`). "Conventions" undersells the conventions+mechanism scope at the one-WU level
— but the rename is **dissolved by decomposition** (see § Delivery plan & parked status and Open Questions
§ Exact rename): decomposed, the doctrine WU keeps the "concurrent-work" name and the cohort carries the
closeout identity, so no umbrella rename is needed.

### Single-owner work units (one DRI)

A WU is **single-owner** (one DRI). Cross-person parallelism = decompose into N single-owner WUs
(cohort ≈ epic), **not** multiple devs concurrently driving one WU's task list. Grounded in the dominant
industry idiom (one branch = one author; story = one assignee; parallelism = more branches/PRs, not more
authors per branch) and in ARC's substrate — a single-owner WU is structurally lighter (one branch + one
PR) than the shared-integration-branch + per-dev-sub-branch topology multi-dev-per-WU requires, and
avoids the shared-meta write-collision and single-`Next Task`-pointer workarounds team-coord currently
carries.

- **Non-owner contribution** happens via (1) PR review (already first-class), (2) pairing (synchronous,
  one driver, `Co-authored-by:` for credit — convention, no structure), (3) handoff (sequential owner
  *reassignment* — keep; vacation/rotation).
- **Remove `(@name)` entirely.** With single-owner WUs the meta `**Owner:**` field *is* the assignment;
  per-task markers have no remaining job. team-coord's own rationale — "git tracks authorship;
  duplicating adds maintenance burden" — now argues against `(@name)` in task lists too.
- **Kill the within-WU concurrent multi-dev apparatus** — the Personal-Sub-Branches and
  Stacked-PRs-per-Developer patterns, the shared-meta concurrent-write handling, and "concurrent pairs
  on different tasks" (DEV-RULES.ARC § Task interlock).
- **Caveat:** untested at team scale — a conscious idiomatic + structural-fit bet, not field-proven. The
  one genuine shared-branch case (a feature too cohesive to split) is absorbed by the dichotomy:
  too-coupled-to-split → one WU, one owner, may pair; separable → multiple WUs.
- **Execution is separable.** The *decision* is a CWC conventions item; the *rewrite* it forces —
  `strategy-team-coordination` (branching patterns, the `(@name)` convention, person-to-person handoff),
  DEV-RULES.ARC § Task interlock, meta `**Owner:**` semantics — has real weight and is the stack's final
  increment (§ Scope Estimate).

### Start-side concurrency check: doctrine over a shipped mechanism (Pillar 1)

The activation-time "safe to start?" check is **doctrine, not new tooling** — In-Flight Awareness already
ships the oracle-backed check (consulted at spawn / cold-start / materialize / errand-launch; advisory,
never blocks). Pillar 1 adds one unified *advisory overlap-judgment doctrine* in
`strategy-concurrent-work.md` governing **both** WU-activation and `errand-launch` (one oracle-backed
check, two trigger surfaces) plus thin pointers at those already-built fire-sites:

- A **light codified rubric** — disjoint domain → proceed; shared module / strategy / load-bearing infra
  → flag + consider sequencing; foreign-owned overlap → coordinate — with worked examples.
- The **self/foreign asymmetry**: single-owner WUs make this the *entire* "all-owner" addition —
  self-overlap reorder freely, foreign-overlap coordinate. Extends Errand Enablement's advisory
  foreign-artifact gate to cover entry-level writes, not just file-level.
- An explicit **"this is a heads-up; the behind-base detector is the real net"** weight statement.

Start-side rigor is **inversely coupled** to integration-end robustness: because the behind-base detector
surfaces drift continuously at every resume, the start-side check stays a light nudge, never a
heavyweight conflict-eval subagent — which also cuts against the research (pre-merge conflict prediction
is non-idiomatic, O(n²), false-positive-prone).

### Integration-end: advisory behind-base detector + convention, not a blocking guard

The "main moved under me" target is **(a) a convention in the strategy doc + (b) an advisory behind-base
detector**, explicitly **not** a blocking guard — the integration-conflict research is unambiguous that
overlap signals stay advisory (false positives; industry detects at merge time, not before).

- **The detector:** at session-init resume, compute behind-base drift + path overlap ("main moved K,
  you're N behind, these paths overlap → reconcile?"). O(1) per resume (your one branch vs. base);
  advisory, never gates. Today nothing computes behind-*base* — session-init's `remote-ahead` only
  detects behind-own-upstream.
- **Build it general:** a ref-parameterized `origin/<base>`-distance **primitive** + a session-init
  **probe slot** (worktree-channel-shaped: `state` / `ahead` / `behind` / `recommendedAction` /
  `recommendedPromptText`), so `cross-machine-sync-coherence`'s `baseBranchSync` *extends* it
  (local-base-ref subject + `session.init_pull.main` + cross-machine layer) rather than double-building.
  This is the *same mechanism* as the reconcile-triage convention's advisory detector — one buildable,
  spec'd once.
- Plus the **merge-commit hook/footer exemption** as a correctness fix (see Merge-safety below).
- `research-integration-conflict-handling.md` is **sufficient** here — no new external pass.

### Ergonomics & lifecycle: async accommodation + completion-sweep forcing function (Pillar 2)

`**State:** Integrating` already *is* the awaiting-review state (no new state or field). The async-merge
touchpoints are largely shipped (`archive.cadence: manual` defers archival post-merge; the
stale-worktree + session-init in-flight sweeps backstop walk-away cleanup) — so this is mostly
*audit-don't-rebuild* (option B, additive — see Async-merge audit scope below). **Build:**

- An explicit **suspend/resume seam** at the PR-open boundary — park in `Integrating`, end the session,
  resume the *ceremony* later. (Audit-confirmed gap: `integrate-work-unit` hard-starts Active→Integrating
  with no resume entrypoint, and merge → `arc user close` → worktree-removal is one synchronous chain —
  handoff parks the state fine, but nothing resumes the ceremony or owns `arc user close` on an unattended
  merge.)
- An **in-flight completion sweep** generalizing the errand sweep's PR-state classification to owned WUs
  across the **full tail** — `awaiting-review → mergeable → merged-needs-archival → archived` (the
  stage-2 archival dangle exists only under `archive.cadence: manual`) — as the forcing function against
  dangling-`Integrating` rot. Two tiers: **presence** (roster, free, every session-init) + **mergeable
  sharpening** (oracle PR-source, gated to handoff / no-active-WU, degrades to presence without `gh`). A
  configurable `*_after_days` threshold (reusing the inbox-reminder machinery + once-per-day marker)
  gates the *stale* tier; the *mergeable* and *merged-needs-archival* triggers are event-driven (bypass
  the threshold).

**Completion is a worktree-agnostic boundary action** — the tail (`gh pr merge` + `arc user close` +
worktree-remove-from-elsewhere) runs cleanest from the **primary worktree**, never a mid-increment
switch. Unifies with the merge-safety "decouple merge + cleanup from the integration session" concern.

### Merge-safety: compose shipped primitives, don't rebuild (Thread 3)

The merge-safety buildables **compose shipped primitives** under the reuse-clean (SOLID / DRY) principle
— refactor the primitive for all known consumers, never bolt-on:

- **write-context:** `lib/git/write-context.ts` (`classifyWriteContext` / `resolveWriteContext`) and
  `errand-branch.ts` (`chore/` detection) are shipped. Net-new is the *path-surface dimension*,
  *chore-awareness* (composes the two shipped primitives), a *pre-commit backstop hook*, and broader
  command wiring.
- **merge-commit:** do **both** a hook exemption (`MERGE_HEAD` / 2-parent skip of conventional + footer
  rules) **and** an `integration` footer kind.
- **behind-base detector:** CWC ships it (see Integration-end) as the ref-parameterized primitive + probe
  slot.
- **Entry-level re-homing** of foreign-owned atomics folds into the all-owner gate doctrine (Pillar 1) —
  cover entry-level, not just file-level writes.
- **Cohort-`{name}.md` discovery at session-init** is **included** — agent awareness of the coordinating
  cohort doc is load-bearing for parallelism actually coordinating (`AGENT-BRIEF.ARC` note + optional
  session-init surfacing).

### Grounded against shipped reality — what the spec must not rebuild

The draft historically over-scoped against shipped infra; the spec must ground each buildable against
shipped code/workflows first. Four drift findings to honor:

- **IFA shipped the activation-check *mechanism*, not just the oracle** — already consulted at spawn /
  cold-start / materialize / errand-launch, advisory, never blocks. Pillar 1 adds doctrine only.
- **Async-merge touchpoints are largely shipped** — `archive.cadence: manual` + the stale/in-flight
  sweeps. The async audit is mostly audit-don't-rebuild.
- **The write-context-classifier is shipped** (`lib/git/write-context.ts`, `errand-branch.ts`). Net-new
  is the path-surface dimension, chore-awareness, the pre-commit backstop, and wiring.
- **The at-branch-creation base-staleness check is shipped** (per `cross-machine-sync-coherence`); the
  behind-base detector composes with it.

### Delivery: plan-as-one, deliver-as-a-stack

Folded as one *planning* concern (one spec); at PRD time, decompose into a **stack of PR-sized WUs** along
deliverable boundaries (doctrine / strategy-doc → mechanism buildables → team-coord rewrite), per
idiomatic small-PR review norms. See § Scope Estimate for the provisional stack cut. The general
WU-sizing protocol behind this is routed out (§ Out of scope).

### Sibling relationship to team mode, not inheritance

Concurrent usage could theoretically reuse team-mode conventions (`(@name)` markers,
`user.sync_push: prompt`). Rejected — these are team-specific (**cross-identity coordination**), not
concurrency-specific (**multiple WUs, each single-owner**). Concurrent-work users can enable team mode
independently if they want team conventions, but concurrent-work patterns are structurally distinct.
`strategy-concurrent-work.md` (new) sits alongside `strategy-team-coordination.md`, not inside it.

### Focus-role model rejected (2026-05-08 redesign)

The plan's earlier shape proposed a `**Focus Role:**` field with `primary | companion |
awaiting-external | parked` values, blessed pairings, swap discipline, and tenure tracking via
`**Focus Since:**`. External research determined this is a re-invention without PM-tool precedent
and conflates concerns better handled by:

- **WOR's `Integrating` state** for `awaiting-external` — "awaiting PR review" is the `Integrating`
  phase of the 4-state machine; no separate field needed.
- **Sibling Work Unit(s) field + group-dir convention** for the relational concept "companion"
  was hinting at (`plan-work-organization-reform.md`).
- **Implicit worktree presence** for "primary" — the worktree the agent is currently in is the
  active focus.
- **Soft conventions in `strategy-concurrent-work.md`** for the underlying intuitions
  (single-thread attention, same-domain concurrents anti-pattern, swap discipline).

The cost saved: a new tracked field, validation rules around it, migration of existing in-flight
WUs, adopter education on net-new vocabulary. The cost paid: relying on agent judgment at
activation rather than field-encoded role. Research strongly supports the lighter posture.

### Async-merge audit scope: option B (additive)

`integrate-work-unit.md` currently assumes synchronous merge. Three audit shapes:

- **A — Full rewrite of state transitions** to treat async-merge as a primary path alongside
  sync-merge. Cleanest end state; heaviest change.
- **B — Additive treatment at key touchpoints.** Sync-merge stays the primary flow;
  awaiting-review state gets explicit accommodation at session-handoff, meta-file updates,
  worktree cleanup, and archival. Lighter; preserves existing workflow shape.
  **(Lean — formerly current lean in original Mobility plan; reaffirmed here.)**
- **C — Mixed.** Primary rewrite of integrate-work-unit.md plus additive treatment elsewhere.
  Scoped compromise.

PRD-time decision informed by audit findings.

### `strategy-concurrent-work.md` as new strategy doc

Evaluated extending `strategy-team-coordination.md` with a same-dev section. Rejected — putting
same-human concurrency under "team coordination" is structurally misleading. New doc is cleaner;
the two strategies reference each other where overlap exists (branching patterns, meta-file
merge behavior).

### ROADMAP parallelism is conventions-side, not infrastructure-side

The visualization gap (sequential layout claiming "parallelizable") is a documentation/conventions
concern, not a tooling concern. Adopting better visualization patterns is a strategy-doc + ROADMAP-
template change, not a CLI/lint addition. Research-informed redesign at PRD time.

**Coordination (WOR Phase 7.R, 2026-05-22).** WOR reshaped `backlog/ROADMAP.md` into a fully-derived
readiness view (In Flight / Ready / Blocked, from meta `State` / `Owner` / `Depends On`; rendered by WU-name;
no hand-maintained content) and explicitly deferred **parallel-safety** here — "which Ready WUs are
concurrency-safe with what's in flight." Open for this WU's PRD: is it reliably deterministic at all? Meta
files don't declare file-scope/domain, predicted paths ≠ actual, and cognitive-load is judgment; industry
leans on conventions + pick-time accounting (WIP limits, swimlane/value-stream partitioning, module ownership)
over a computed "safe-to-parallelize." Likely an on-contact convention, not a rendered field — research how
the ecosystem handles it. Hard constraint from WOR: if a parallel view is ever hand-curated, it is a
**sibling** artifact; the derived ROADMAP stays hand-maintenance-free to avoid drift. (The renderer itself +
the "roadmap" rename/semantics live in the `roadmap-tooling` WU.)

### Shared-file concurrency: derived vs. mutated (ADR-020)

ADR-020 splits the in-git concurrency problem precisely, and this WU owns codifying the conventions:

- **Derived shared state (ROADMAP) is solvable in-git.** It is a pure projection over branch-isolated
  `meta-*` files; deterministic regeneration at a *single serialization point* (post-merge on the
  integration branch, not hand-edited on feature branches) makes it conflict-free. This is the
  conventions-side fix for the ROADMAP-parallelism gap above.
- **Mutated shared state (inbox drains, any human-editable priority/ordering) is not solvable in-git.**
  Git's line-merge is not a CRDT — concurrent appends to a queue's tail conflict, and edits/reordering
  conflict regardless of sharding — so this is `draft-arc-backend.md` territory (canonical mutable store).
- **Partial mitigation worth a convention:** `merge=union` via `.gitattributes` makes concurrent inbox
  *appends* auto-merge, but loses *intentional deletions* (a drained entry can resurrect) — an
  append-safety aid, not a drain-safe solution. Document the caveat if adopted.

---

## Dependencies and Sequencing

### Upstream

Post-fold, every upstream below has **shipped** — so these are the substrate CWC composes and extends
(the mechanism buildables are *in* CWC), not a blocking queue. This WU is Ready.

- **Work Organization Reform:** delivers Conventional Branch alignment, per-worktree
  isolation foundation, group-dir convention, the consolidated boundary workflows, and the
  `**Sibling Work Unit(s):**` field convention. Concurrent-work conventions and async-merge
  audit compose on top. Hard upstream dependency.
- **Worktree Foundation** (`draft-worktree-foundation.md`): mechanism layer — worktrees, shift,
  branch-gone detection, pause-pointer migration. The activation-time concurrency check fires
  from Worktree Foundation's spawn workflow per the strategy doc's heuristics (Foundation ships the
  degrading advisory stub).
- **Errand Enablement** (`draft-errand-enablement.md`): the Errand floor — the `errand-launch` primitive,
  the **Errand decision matrix**, and the **advisory foreign-artifact gate**. CWC consumes the matrix and
  the advisory gate as the floor beneath its full all-owner gate doctrine and isolation conventions.
  Sequenced WF → Errand Enablement → IFA.
- **In-Flight Awareness** (`draft-in-flight-awareness.md`): the in-flight **oracle** this WU's
  concurrency *gate* consumes (all-owner refs + open PRs), plus the oracle-backed activation-time
  concurrency check. Split from Worktree Foundation 2026-05-24; depends on it.
- **Work Organization Reform** (shipped) supplies the `**State:**` machine — the 4-state model with
  merge-position folded into `Integrating` (no separate `**Integration:**` field). Concurrent-work
  conventions consume the `Integrating` state for awaiting-review accommodation. (Formerly attributed to
  Agile WU Lifecycle as an upstream dependency; corrected — the state is WOR's and already shipped.)
- **Agile WU Lifecycle** (now in the principle-anchored-core cohort) is **not** an upstream dependency —
  the edge was dropped (the dependency was soft: this WU consumes only WOR's shipped `Integrating` state,
  plus reversible shared-file coordination). Its only touchpoint is `integrate-work-unit.md`: this WU's
  async-merge audit lands additively, and AWL's later tier-aware archival branches compose on top —
  either order works.
- **User Sync UX Polish** (`prd-user-sync-ux.md`): clean sync state machine before
  worktree-axis-plus-concurrent-work conventions land on it.
- **Session-Operational Flow Phases 3/5/6:** configurable autonomy modes — reduce approval
  ceremony under multi-session load. Async-merge integration-surface audit was originally
  captured here per ADR-016 discussion; remains in this WU's scope.

### Downstream

- **ARCd Rebrand:** stable concurrent-work terminology absorbed into rename pass.
- **ARC Operating Modes:** consumes shift lifecycle (delivered by `draft-worktree-foundation.md`)
  as prerequisite; concurrent-work conventions inform mode-specific guidance.

### Sibling — Out-of-WU Session Entry (soft prerequisite, ships ahead)

`out-of-wu-entry` (`../out-of-wu-entry/draft-out-of-wu-entry.md`) realigns `session-init`'s entry dispatch
so an explicit `--errand` / `--housekeep` signal routes **while a WU is active** (the Resume arm), not only
when none is — completing the cohort's recorded cold-errand-entry gap (`cohort-agile-parallelism.md`
§ Known gap, which under-scoped it to the no-originating-session case). CWC's concurrency doctrine — the
in-session-fork matrix and the all-owner advisory gate at `errand-launch` — **assumes** mid-WU
errand/housekeep entry already works, so this is a **soft prerequisite** to that doctrine being coherent.
It is **independently shippable and not gated on CWC or AWL** (it manifests with a single WU today and
needs none of the parallelism mechanism), so it ships *ahead* of the parked four-WU stack rather than
within it.

### Recommended sequencing

Work Organization Reform → `draft-worktree-foundation.md` → **Concurrent Work Conventions**. (All
upstream members — WF, errand-enablement, in-flight-awareness — have shipped, so this WU is Ready.
`draft-agile-wu-lifecycle.md` is no longer in the chain; it left the cohort and does not block this WU.)

`class-model-foundation` adds one new input to the CWC rubric: `Novel` is the "roughly one genuinely-novel stream"
signal for plate balancing. CWC consumes that as sequencing guidance in the parallelize-vs-serialize doctrine,
not as a renderer field or activation gate; the concrete convention belongs in D1's `strategy-concurrent-work`
spine when the four-WU stack re-enters.

---

## Pressure Points and Risks

### SESSION-NOTES divergence per worktree (resolved upstream)

`draft-worktree-foundation.md` resolves this by establishing per-worktree SESSION-NOTES semantics.
This WU's conventions consume that resolution; no new pressure here.

### Team-mode relationship clarity

Concurrent-work conventions and team mode overlap in concepts but not conventions. PRD must state
the relationship unambiguously to prevent adopter confusion ("do I enable team mode to run multiple
WUs?"). Recommended framing: the two are **orthogonal axes** — team mode governs **cross-identity
coordination** (multiple humans: who's on what, person-to-person handoff, multi-human conventions);
concurrent-work conventions govern **multi-WU concurrency mechanics** (parallelize-vs-serialize,
rebase/merge discipline, async-merge), which apply per-WU whether the other in-flight WUs are yours or a
teammate's (each WU is single-owner regardless). Both can coexist; neither requires the other.

### Async-merge scope boundary

`integrate-work-unit.md` is shared with `draft-agile-wu-lifecycle.md` (which adds
tier-aware branches). Coordination required: async-merge audit lands additive accommodation atop
the tier-aware flow, not via independent rewrite. PRD-time sequencing care.

### ROADMAP visualization research

Visualization patterns for parallel work streams have multiple competing forms (DAG, swimlane,
Gantt-like, dependency-only). Picking one without understanding adopter context (small team vs
large, solo vs team-mode, arc-in-git vs external pm.mode) risks shipping a format that doesn't
serve actual usage. Research informs choice; rushing risks rework.

### Activation-check judgment quality

The activation-time concurrency check relies on agent judgment from reading in-flight status
files. Quality depends on (a) adequate scope description in `**Purpose:**` / Spec content,
(b) the agent reading them carefully, and (c) the agent surfacing concerns rather than rubber-
stamping. Mitigation: strategy doc provides concrete heuristics with worked examples; the check
is advisory not gating, so false negatives still let work proceed and surface at integration.

### Tool-ecosystem composition friction

Adopters composing ARC with an agentic worktree-management tool (Conductor, emdash, Maestro,
Warp, Worktrunk, Zed, etc.) hold two postures in tension by design — ARC optimizes for fewer,
deeper, more-reviewed concurrent WUs; the tools optimize for many, faster, less-reviewed. Both
work; the friction surfaces when adopters apply tool-native cadence (10+ simultaneous sessions,
minimal per-WU review) to ARC-managed work and find ARC's per-task interlock and structured
planning artifacts feel heavy, or apply ARC's cadence to tool-managed work and underutilize the
tool's parallelism affordances.

PRD-time question: does ARC ship onboarding guidance for this composition (e.g., "composing ARC
with [tool]: here's how to make the disciplines reinforce rather than fight") in the strategy
doc, or treat as adopter-handled with only the general anti-pattern guidance? Lean: light
onboarding guidance in the strategy doc covering "pick which frame dominates per session" —
without deep per-tool integration docs.

---

## Open Questions

### ROADMAP / STATUS visualization — routed out

The earlier "Parallel-WU ROADMAP format" and "visualization scope" questions are **not CWC's**: the ROADMAP /
STATUS render grammar, views, and automation belong to `roadmap-tooling` (render standard + the now/next/later
horizon mode), captured there 2026-06-03. CWC contributes only the concurrency-safety overlay on the "Next"
slice — the existing CWC↔roadmap-tooling seam.

### Exact rename — resolved

**Dissolved by decomposition (2026-06-03).** The misnomer was a one-WU artifact. Decomposed (§ Delivery plan &
parked status), D1 keeps the "concurrent-work" name, the mechanism WUs get their own names, and the
`agile-parallelism` cohort carries the closeout identity. No umbrella rename needed.

### Internal stack boundaries / phasing — resolved

**Four single-owner WUs (shape B), not an internally-phased PR (2026-06-03).** Boundaries D1–D4 along
deliverable type, delivered as a dependency-ordered stack (§ Delivery plan & parked status). "Internally-phased
PR" rejected — no convention for it, and it cuts against single-owner-WU + small-PR norms. The *actionable*
decomposition procedure is AWL's deliverable (CWC re-enters once it lands); the general sizing protocol is
routed out (§ Out of scope).

### Fuller handoff / archival async audit — resolved

**Audit run (2026-06-03).** A pass over `integrate-work-unit` / `archive-work-unit` / `session-handoff` /
`deactivate-work-unit` / `setup-merge-gate` confirms Pillar 2's "largely shipped," with a sharpening folded
into the Pillar 2 decision: handoff *parks* `Integrating` fine, but `integrate-work-unit` has **no resume
entrypoint** (it hard-starts Active→Integrating) and the merge → `arc user close` → worktree-removal chain is
synchronous, orphaning `arc user close` on an unattended / deferred merge. `setup-merge-gate` is orthogonal
(the auto-merge lane). Net: the suspend/resume seam + completion sweep are net-new exactly as Pillar 2 sized
them — **no scope blow-up.**

### Cohort / wave grouping as first-class structure

The current ROADMAP shows parallel WUs at the same dependency depth (e.g., Worktree Foundation ‖
User Sync UX Polish ‖ Coord Probe as the first wave after Session-Operational Flow). The cohort
relationship is implicit — derivable from the upstream/downstream graph as "WUs at the same depth
with no inter-dependencies." Work Organization Reform's group-dir convention partially
addresses this for codified groups in `backlog/`. Question: does explicit cohort/wave metadata
(beyond WOR's group-dir) add value beyond what the graph already encodes?

Industry precedent surveyed during agile/mobility design discussion 2026-04-28: Jira/Linear epics
(too hierarchical), GitHub milestones (time-boxed not parallel), agile-program tracks/streams
(closest match for parallel-cohort grouping). Light option: optional `**Cohort:**` or `**Wave:**`
field on status/plan files (free-form value); enables tooling to enumerate cohort members for
ROADMAP visualization, status reporting, and shared-deadline tracking. Heavy option: structural
cohort entity in pm.layer with member lists, dependencies, and shared lifecycle workflows.

The case for explicit cohorts strengthens significantly if cohorts gain **shared lifecycle events**
(single PR for the whole wave; coordinated rollout; shared verification step). Today they don't —
each WU has independent integration/archive. If the ROADMAP-visualization research surfaces a
real need for cohort-level operations or reporting, the field addition is the right weight; if
not, graph-derived cohorts (no metadata) plus WOR group dirs suffice. PRD-time decision after
research informs the question.

### Hook symmetry

`post-task-completion`, `post-work-unit-activate`, `post-work-unit-archive` exist in
`arc-extensions`. Should this WU add `post-shift-pause` / `post-shift-resume` / `post-shift-rotate`
hooks? Reasonable by symmetry, but no clear current need. Probably out of scope for this WU,
deferred to a later hooks-completeness pass — but flagged here for explicit PRD decision.

---

## Scope Estimate

**Large — doc-dominant, with a lighter-than-first-framed mechanism tail.** The bulk is documentation:
`strategy-concurrent-work.md` (conventions + the unified overlap-judgment doctrine + async-merge guidance + the
forcing-function / reconcile discipline) plus the single-owner-WU rewrite of `strategy-team-coordination` +
DEV-RULES.ARC. The mechanism half is real but lighter than the pre-sweep framing — most buildables **compose
shipped primitives** (`lib/git/write-context.ts`, the errand sweep, the `origin/<base>` substrate, `spawnWorktree`)
rather than build from scratch: behind-base detector (ref-parameterized primitive + probe slot), in-flight
completion sweep, merge-commit exemption, suspend/resume seam, merge-gate-awareness, `arc start` create-new wiring,
subdir primitive, write-context path-surface / chore extensions + pre-commit backstop.

**Delivery: plan-as-one, deliver-as-a-stack.** One planning concern / one spec; at PRD time decompose into a stack
of PR-sized WUs along the deliverable boundaries below, per small-PR review norms (the general sizing protocol is
routed out — § Out of scope). The phases are the natural stack cut.

Phases / stack increments (provisional, dependency order):

1. **Doctrine + strategy doc** — `strategy-concurrent-work.md`: the unified advisory overlap-judgment doctrine
   (pillar 1, both trigger surfaces), parallelize-vs-serialize rubric, worktree operational guidance, async-merge and
   reconcile discipline, anti-patterns, main-worktree convention. Consolidates the four research files; carries
   most of the weight.
2. **Merge-safety mechanism** — behind-base detector (ref-parameterized primitive + probe slot, built for
   `cross-machine-sync-coherence` to extend) + write-context extensions + pre-commit backstop + merge-commit
   exemption.
3. **Lifecycle / ergonomics** — suspend/resume seam + in-flight completion sweep (forcing function, full tail
   through archival) + merge-gate-awareness (option B, additive on `integrate-work-unit`) + `arc start` create-new
   wiring + subdir-removal primitive + cohort-`{name}.md` discovery.
4. **Single-owner-WU rewrite** — `strategy-team-coordination` + DEV-RULES.ARC § Task interlock + meta `**Owner:**`
   semantics; remove the within-WU multi-dev apparatus + `(@name)`. Separable execution; real weight.

Phase 1 is the spine; 2–4 are largely independent and sequence/parallelize as a stack once the doctrine lands.

---

## Philosophy Checkpoints

The PRD should explicitly address:

- **P2 (Co-Development):** Conventions preserve the mandatory review stop at task completion
  within each WU. Parallelism is between WUs, not within. The single-owner-as-continuity-thread
  principle (one DRI per WU) is maintained by the soft single-active-focus convention (one worktree as
  the agent's active focus at any moment).
- **P5 (Context Preservation):** Conventions improve context preservation — worktree-local
  SESSION-NOTES (mechanism via `draft-worktree-foundation.md`) is correct WU-scoped context, not
  degradation. Activation-time concurrency check surfaces "what was I doing before" via in-flight
  WU enumeration.
- **P7 (Discrete Steps):** One task at a time stays within-WU, not cross-WU. Soft swap discipline
  (transitioning between active worktrees at review-increment boundaries) protects this principle
  under concurrent usage.
- **Honest stance on concurrent sessions:** Framework won't block; docs flag as bandwidth
  violation at heavy concurrency. Consistent with ARC's pattern of encouraging principled usage
  without enforcing technically.

---

## External Research Citations

Sources informing CWC's design. The 2026-05-08 redesign drew on
`research-focus-wip-attention-discipline.md`, `research-active-work-coordination-vocabulary.md`,
`research-concurrent-work-mechanism-layer.md`, and `research-integration-conflict-handling.md`
(referenced in the header narrative). Additional research:

### Worktree-management tool landscape (2026-05-12)

- `research-worktree-tool-convergence.md` — convergence pass across 11 agentic
  worktree-management tools (Cluster 1: Zed, Warp, Worktrunk; Cluster 2: Conductor, emdash,
  Maestro; Cluster 3: Super, Superset, T3code, Soloterm, Nora). Substantive findings shaping
  CWC: every surveyed tool optimizes for many simultaneous sessions, fast spawn, minimal
  per-WU review (§ 3.3, § 6.4) — the opposite posture from ARC's; no tool models focus role
  as a discipline annotation (§ 5.2 reinforced), confirming the 2026-05-08 focus-role
  rejection from a second direction; tool ecosystem and ARC compose by sitting on top of the
  same git-worktree substrate (§ 3.1) with no extension-point integration (§ 4.3). Per-tool
  reports and source URLs captured in the research doc.

## Coordination — ADR-022

Per ADR-022, merge correctness for the agent-maintained-with-merge managed docs (`WORKING-MEMORY`,
`USER-INBOX`, the inboxes) lives in the notes-merge engine operating on structured records — not in
the markdown or a schema. Reference the model rather than redefining write/merge semantics here. See
`adr-022-managed-operational-state-documents.md` § Coordination.

---
